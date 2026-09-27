/**
 * Developer Buybacks & Burns: a read-only indexer over the official developer wallet's activity on Robinhood Chain
 * involving $OBJECTPAD. Nothing here is simulated — every entry is derived from a decoded transaction receipt and its
 * logs. No private key for the developer wallet exists anywhere in this file or in ObjectPad; this only reads the chain.
 *
 * Classification is intentionally strict:
 *  - BUY only when the developer wallet's own CurveBuy log shows both ETH spent (quoteIn>0) and $OBJECTPAD received
 *    (tokensOut>0). A plain incoming Transfer to the developer wallet is never treated as a buy.
 *  - $OBJECTPAD exposes no verified burn() function (a live simulateContract call against the standard `burn(uint256)`
 *    selector reverts), so a developer-wallet transfer to the dead address never reduces ERC-20 totalSupply and is
 *    recorded as CIRCULATING_SUPPLY_REMOVAL, not SUPPLY_BURN. If that ever changes (a verified burn call is observed),
 *    it would be recorded as SUPPLY_BURN instead — the classifier checks live, it does not assume either way.
 *  - A normal outgoing transfer (not to the dead address) is never recorded as a removal.
 */
import { formatEther, formatUnits, parseAbi, parseAbiItem, type Address, type Hex } from 'viem';
import { CURVE_ABI, ERC20_ABI, explorerTx } from '../shared/pons';
import { DEAD_ADDRESS } from '../shared/economy';
import { validAddress } from '../shared/security';
import { serverClient } from './chain';
import { ethPrice } from './market';
import { Store } from './store';
import type { Runtime } from './types';

const TRANSFER = parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
const CURVE_BUY = parseAbiItem('event CurveBuy(address indexed sender,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 protocolFee,uint256 creatorFee)');
const BURN_SELECTOR_ABI = parseAbi(['function burn(uint256 amount)']);

/** Robinhood Chain's RPC rejects `eth_getLogs` ranges above ~9,000 blocks (measured); smaller windows are used elsewhere in this codebase too. */
const WINDOW = 9_000n;
/** Windows advanced per call, so one alarm tick or request never runs long. Call again (the alarm does) to continue. */
const MAX_WINDOWS_PER_TICK = 25;
/** Blocks required before an indexed entry is shown as confirmed (~3s/block on Robinhood Chain). */
export const DEV_ACTIVITY_CONFIRMATIONS = 30n;
/** Already-indexed tail re-scanned on every run, so a shallow reorg near the tip is caught before its blocks are trusted. */
const REORG_GUARD_BLOCKS = 60n;
/** A developer buy paired with a developer dead-address transfer within this many milliseconds becomes one cycle. */
const PAIR_WINDOW_MS = 14 * 24 * 3_600_000;
/**
 * $OBJECTPAD's own mint on Robinhood Chain: Transfer(0x0 -> curve, 1e9 * 10^decimals) in transaction
 * 0x80bd0d9f4ea153f90f85d8b13c3ae4e91bc87c39e508bb8925022a9edfb88853, block 72,527,865. Historical scanning starts
 * here, not at genesis. If OBJECTPAD_TOKEN_ADDRESS is ever repointed to a different deployment, update this constant.
 */
export const TOKEN_DEPLOY_BLOCK = 72_527_865n;
/** The official developer wallet this page reports on. Read-only: never signs, never holds a key here. */
export const DEV_WALLET: Address = '0x4d13a0a38e2ba879535ab7dacd2f87338980f2e7';

export type ExecutionMode = 'manual' | 'automatic';
export type ActivityKind = 'cycle' | 'buy_only' | 'removal_only';
export type BurnClassification = 'SUPPLY_BURN' | 'CIRCULATING_SUPPLY_REMOVAL' | null;
export interface DevActivityItem {
  cycleId: string; kind: ActivityKind; executionMode: ExecutionMode;
  buyTxHash: string | null; burnTxHash: string | null;
  quoteAsset: 'ETH'; quoteAmount: string; tokenAmountBought: string; tokenAmountRemoved: string; tokenAmountBurned: string;
  burnClassification: BurnClassification; gasUsed: string; gasCostEth: string;
  blockNumber: number; timestamp: number; confirmations: number; status: 'pending' | 'confirmed';
  ethUsdAtIndex: number | null; priceCapturedAt: 'execution' | 'indexing';
  explorerUrls: { buy: string | null; burn: string | null };
}
export interface DevActivitySummary {
  developerWallet: string; tokenAddress: string | null; executionMode: ExecutionMode; automationStatus: string;
  tokenSupportsBurn: boolean;
  totals: { cycles: number; ethSpent: number; usdSpent: number; tokensBought: number; tokensBurned: number; tokensRemovedFromCirculation: number };
  latestCycle: DevActivityItem | null; activities: DevActivityItem[]; nextCursor: number | null; total: number;
  lastIndexedBlock: number; backfillComplete: boolean; updatedAt: number;
}
interface BuyRow { id: string; tx_hash: string; log_index: number; block_number: number; block_hash: string; timestamp: number; quote_amount: string; token_amount: string; gas_used: string; gas_price: string; eth_usd: number | null; price_captured_at: string; }
interface RemovalRow { id: string; tx_hash: string; log_index: number; block_number: number; block_hash: string; timestamp: number; token_amount: string; classification: string; gas_used: string; gas_price: string; eth_usd: number | null; price_captured_at: string; }

export class DevActivityService {
  private decimalsCache: number | null = null;
  private curveCache: Address | null = null;
  private burnSupportCache: { at: number; supported: boolean } | null = null;
  constructor(private readonly store: Store, private readonly runtime: Runtime) {
    store.run('CREATE TABLE IF NOT EXISTS op_dev_buys (id TEXT PRIMARY KEY, tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, block_number INTEGER NOT NULL, block_hash TEXT NOT NULL, timestamp INTEGER NOT NULL, quote_amount TEXT NOT NULL, token_amount TEXT NOT NULL, gas_used TEXT NOT NULL, gas_price TEXT NOT NULL, eth_usd REAL, price_captured_at TEXT NOT NULL DEFAULT \'indexing\', UNIQUE(tx_hash,log_index))');
    store.run('CREATE INDEX IF NOT EXISTS op_dev_buys_block ON op_dev_buys(block_number)');
    store.run('CREATE TABLE IF NOT EXISTS op_dev_removals (id TEXT PRIMARY KEY, tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, block_number INTEGER NOT NULL, block_hash TEXT NOT NULL, timestamp INTEGER NOT NULL, token_amount TEXT NOT NULL, classification TEXT NOT NULL, gas_used TEXT NOT NULL, gas_price TEXT NOT NULL, eth_usd REAL, price_captured_at TEXT NOT NULL DEFAULT \'indexing\', UNIQUE(tx_hash,log_index))');
    store.run('CREATE INDEX IF NOT EXISTS op_dev_removals_block ON op_dev_removals(block_number)');
    store.run('CREATE TABLE IF NOT EXISTS op_dev_index (id INTEGER PRIMARY KEY CHECK(id=1), last_block INTEGER NOT NULL)');
  }
  token(): Address | null { const v = this.runtime.env.OBJECTPAD_TOKEN_ADDRESS?.trim(); return v && validAddress(v) ? v.toLowerCase() as Address : null; }
  /** A configuration value, not a hardcoded label: flips to 'automatic' only once an env override says so — never inferred or guessed. */
  executionMode(): ExecutionMode { return (this.runtime.env.OBJECTPAD_DEV_EXECUTION_MODE ?? '').trim().toLowerCase() === 'automatic' ? 'automatic' : 'manual'; }
  private async decimals(client: ReturnType<typeof serverClient>): Promise<number> {
    if (this.decimalsCache !== null) return this.decimalsCache;
    const token = this.token(); if (!token) return 18;
    try { this.decimalsCache = Number(await client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' })); } catch { this.decimalsCache = 18; }
    return this.decimalsCache;
  }
  private async curve(client: ReturnType<typeof serverClient>): Promise<Address | null> {
    if (this.curveCache) return this.curveCache;
    const token = this.token(); if (!token) return null;
    try { const address = await client.readContract({ address: token, abi: ERC20_ABI, functionName: 'curve' }) as Address; this.curveCache = address; return address; } catch { return null; }
  }
  /** Live evidence, not an assumption: probes the token's standard `burn(uint256)` selector. A revert means no verified burn path exists. */
  async supportsBurn(): Promise<boolean> {
    if (this.burnSupportCache && Date.now() - this.burnSupportCache.at < 86_400_000) return this.burnSupportCache.supported;
    const token = this.token(); let supported = false;
    if (token) { try { await serverClient(this.runtime.env).simulateContract({ address: token, abi: BURN_SELECTOR_ABI, functionName: 'burn', args: [0n], account: DEV_WALLET }); supported = true; } catch { supported = false; } }
    this.burnSupportCache = { at: Date.now(), supported }; return supported;
  }
  private lastBlock(): bigint { return BigInt(this.store.one<{ last_block: number }>('SELECT last_block FROM op_dev_index WHERE id=1')?.last_block ?? Number(TOKEN_DEPLOY_BLOCK) - 1); }
  private saveCursor(block: bigint): void { this.store.run("INSERT INTO op_dev_index(id,last_block) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_block=excluded.last_block", Number(block)); }

  /** Backfills from the $OBJECTPAD deployment block, then advances with new confirmed blocks. Bounded per call; call again to continue. */
  async run(): Promise<void> {
    const token = this.token(); if (!token) return;
    const client = serverClient(this.runtime.env);
    const head = await client.getBlockNumber();
    const safeHead = head - DEV_ACTIVITY_CONFIRMATIONS; if (safeHead < TOKEN_DEPLOY_BLOCK) return;
    let cursor = this.lastBlock();
    // Reorg guard: re-scan a small already-indexed tail before trusting new blocks past it.
    const guardFrom = cursor - REORG_GUARD_BLOCKS;
    if (guardFrom >= TOKEN_DEPLOY_BLOCK - 1n && guardFrom < cursor) {
      this.store.run('DELETE FROM op_dev_buys WHERE block_number>?', Number(guardFrom));
      this.store.run('DELETE FROM op_dev_removals WHERE block_number>?', Number(guardFrom));
      cursor = guardFrom;
    }
    const curve = await this.curve(client);
    let from = cursor + 1n;
    for (let w = 0; w < MAX_WINDOWS_PER_TICK && from <= safeHead; w++) {
      const to = from + WINDOW - 1n < safeHead ? from + WINDOW - 1n : safeHead;
      const [devToDead, buys] = await Promise.all([
        client.getLogs({ address: token, event: TRANSFER, args: { from: DEV_WALLET, to: DEAD_ADDRESS }, fromBlock: from, toBlock: to }).catch(() => null),
        curve ? client.getLogs({ address: curve, event: CURVE_BUY, args: { recipient: DEV_WALLET }, fromBlock: from, toBlock: to }).catch(() => null) : Promise.resolve([]),
      ]);
      if (devToDead === null || buys === null) break; // transient RPC failure; retry this same range next call
      if (devToDead.length || buys.length) {
        const decimals = await this.decimals(client);
        const hashes = [...new Set([...devToDead, ...buys].map(l => l.transactionHash).filter((h): h is Hex => Boolean(h)))];
        const receipts = new Map<string, { gasUsed: bigint; effectiveGasPrice: bigint; status: string }>();
        for (const hash of hashes) { const r = await client.getTransactionReceipt({ hash }).catch(() => null); if (r) receipts.set(hash, { gasUsed: r.gasUsed, effectiveGasPrice: r.effectiveGasPrice, status: r.status }); }
        const blockNumbers = [...new Set([...devToDead, ...buys].map(l => Number(l.blockNumber ?? 0n)))];
        const blockInfo = new Map<number, { hash: string; ts: number }>();
        for (const bn of blockNumbers) { const b = await client.getBlock({ blockNumber: BigInt(bn) }).catch(() => null); if (b) blockInfo.set(bn, { hash: b.hash ?? '', ts: Number(b.timestamp) * 1000 }); }
        const usd = await ethPrice().catch(() => null);
        this.store.atomic(() => {
          for (const log of buys) {
            const args = log.args as { quoteIn?: bigint; tokensOut?: bigint };
            if (!(args.quoteIn && args.quoteIn > 0n) || !(args.tokensOut && args.tokensOut > 0n)) continue; // BUY requires ETH spent AND tokens acquired
            const r = log.transactionHash ? receipts.get(log.transactionHash) : undefined; if (!r || r.status !== 'success') continue;
            const info = blockInfo.get(Number(log.blockNumber ?? 0n)); if (!info) continue;
            this.store.run('INSERT OR IGNORE INTO op_dev_buys(id,tx_hash,log_index,block_number,block_hash,timestamp,quote_amount,token_amount,gas_used,gas_price,eth_usd,price_captured_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
              `${log.transactionHash}-${log.logIndex}`, log.transactionHash ?? '', log.logIndex ?? 0, Number(log.blockNumber ?? 0n), info.hash, info.ts,
              formatEther(args.quoteIn), formatUnits(args.tokensOut, decimals), r.gasUsed.toString(), r.effectiveGasPrice.toString(), usd, 'indexing');
          }
          for (const log of devToDead) {
            const args = log.args as { value?: bigint }; const value = args.value ?? 0n; if (value <= 0n) continue;
            const r = log.transactionHash ? receipts.get(log.transactionHash) : undefined; if (!r || r.status !== 'success') continue;
            const info = blockInfo.get(Number(log.blockNumber ?? 0n)); if (!info) continue;
            // No verified burn() exists on $OBJECTPAD (see supportsBurn()), so a dead-address transfer never reduces totalSupply.
            this.store.run('INSERT OR IGNORE INTO op_dev_removals(id,tx_hash,log_index,block_number,block_hash,timestamp,token_amount,classification,gas_used,gas_price,eth_usd,price_captured_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
              `${log.transactionHash}-${log.logIndex}`, log.transactionHash ?? '', log.logIndex ?? 0, Number(log.blockNumber ?? 0n), info.hash, info.ts,
              formatUnits(value, decimals), 'CIRCULATING_SUPPLY_REMOVAL', r.gasUsed.toString(), r.effectiveGasPrice.toString(), usd, 'indexing');
          }
        });
      }
      this.saveCursor(to); from = to + 1n;
    }
  }
  private toItem(kind: ActivityKind, buy: BuyRow | null, removal: RemovalRow | null, mode: ExecutionMode, head: bigint): DevActivityItem {
    const anchor = removal ?? buy!; const blockNumber = anchor.block_number; const confirmations = Math.max(0, Number(head) - blockNumber);
    const gasUsed = BigInt(anchor.gas_used); const gasPrice = BigInt(anchor.gas_price);
    return {
      cycleId: `${buy?.id ?? 'none'}:${removal?.id ?? 'none'}`, kind, executionMode: mode,
      buyTxHash: buy?.tx_hash ?? null, burnTxHash: removal?.tx_hash ?? null,
      quoteAsset: 'ETH', quoteAmount: buy?.quote_amount ?? '0', tokenAmountBought: buy?.token_amount ?? '0',
      tokenAmountRemoved: removal ? removal.token_amount : '0', tokenAmountBurned: '0',
      burnClassification: removal ? (removal.classification as BurnClassification) : null,
      gasUsed: gasUsed.toString(), gasCostEth: formatEther(gasUsed * gasPrice),
      blockNumber, timestamp: anchor.timestamp, confirmations, status: BigInt(confirmations) >= DEV_ACTIVITY_CONFIRMATIONS ? 'confirmed' : 'pending',
      ethUsdAtIndex: anchor.eth_usd, priceCapturedAt: (anchor.price_captured_at as 'execution' | 'indexing') ?? 'indexing',
      explorerUrls: { buy: buy ? explorerTx(buy.tx_hash) : null, burn: removal ? explorerTx(removal.tx_hash) : null },
    };
  }
  /** Pairs each developer buy with the nearest not-yet-used developer dead-address transfer that follows it, preferring an exact token-amount match. Never combines unrelated transactions across the pairing window. */
  private pair(head: bigint): DevActivityItem[] {
    const mode = this.executionMode();
    const buys = this.store.all<BuyRow>('SELECT * FROM op_dev_buys ORDER BY block_number,log_index');
    const removals = this.store.all<RemovalRow>('SELECT * FROM op_dev_removals ORDER BY block_number,log_index');
    const used = new Set<string>(); const items: DevActivityItem[] = [];
    for (const buy of buys) {
      let match = removals.find(r => !used.has(r.id) && r.timestamp >= buy.timestamp && r.token_amount === buy.token_amount);
      if (!match) match = removals.filter(r => !used.has(r.id) && r.timestamp >= buy.timestamp && r.timestamp - buy.timestamp <= PAIR_WINDOW_MS).sort((a, b) => a.timestamp - b.timestamp)[0];
      if (match) used.add(match.id);
      items.push(this.toItem('cycle', buy, match ?? null, mode, head));
    }
    for (const removal of removals) if (!used.has(removal.id)) items.push(this.toItem('removal_only', null, removal, mode, head));
    return items.sort((a, b) => b.blockNumber - a.blockNumber || b.timestamp - a.timestamp);
  }
  /** Public summary + one page of activity. Never runs the indexer itself (callers schedule that separately) so a request always answers fast. */
  async summary(cursor: number, limit: number): Promise<DevActivitySummary> {
    const token = this.token(); const head = token ? await serverClient(this.runtime.env).getBlockNumber().catch(() => this.lastBlock() + DEV_ACTIVITY_CONFIRMATIONS) : this.lastBlock();
    const items = token ? this.pair(head) : [];
    const ethSpent = items.reduce((s, i) => s + Number(i.quoteAmount), 0);
    const usdSpent = items.reduce((s, i) => s + (i.ethUsdAtIndex ? Number(i.quoteAmount) * i.ethUsdAtIndex : 0), 0);
    const tokensBought = items.reduce((s, i) => s + Number(i.tokenAmountBought), 0);
    const tokensRemoved = items.reduce((s, i) => s + Number(i.tokenAmountRemoved), 0);
    const cycles = items.filter(i => i.kind === 'cycle' && i.burnTxHash).length;
    const lastIndexed = this.lastBlock();
    return {
      developerWallet: DEV_WALLET, tokenAddress: token, executionMode: this.executionMode(), automationStatus: 'In development',
      tokenSupportsBurn: await this.supportsBurn(),
      totals: { cycles, ethSpent, usdSpent, tokensBought, tokensBurned: 0, tokensRemovedFromCirculation: tokensRemoved },
      latestCycle: items[0] ?? null, activities: items.slice(cursor, cursor + limit), total: items.length,
      nextCursor: cursor + limit < items.length ? cursor + limit : null,
      lastIndexedBlock: Number(lastIndexed), backfillComplete: Boolean(token) && lastIndexed >= head - DEV_ACTIVITY_CONFIRMATIONS - REORG_GUARD_BLOCKS,
      updatedAt: Date.now(),
    };
  }
}
