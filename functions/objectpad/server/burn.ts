import { formatEther, parseAbiItem, type Address, type Hex } from 'viem';
import { CURVE_ABI, ERC20_ABI, robinhoodChain } from '../shared/pons';
import { DEAD_ADDRESS } from '../shared/economy';
import { validAddress } from '../shared/security';
import { serverClient } from './chain';
import { SponsorService } from './sponsor';
import { Store } from './store';
import type { Runtime } from './types';

const BUY = parseAbiItem('event CurveBuy(address indexed sender,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 protocolFee,uint256 creatorFee)');
const SELL = parseAbiItem('event CurveSell(address indexed sender,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 protocolFee,uint256 creatorFee)');
/** One burn round every five minutes. */
export const BURN_INTERVAL_MS = 5 * 60_000;
/** Below this the round rolls over into the next one (gas would be a large share of the burn). */
const MIN_BURN_WEI = 20_000_000_000_000n;
/** Never let burns eat into the ETH the treasury needs for the next free launches. */
const LAUNCH_RESERVE = 2n;
const MAX_BLOCK_SPAN = 9_000n;

export interface BurnEntry { id: string; at: number; ethIn: string; tokensBurned: string; hash: string | null; state: 'submitted' | 'confirmed' | 'failed'; coins: { symbol: string; name: string; share: number }[]; }

/**
 * $OBJECTPAD buyback & burn. Every five minutes it reads the real trades on every coin launched through ObjectPad, takes
 * 0.5% of that volume (one third of the 1.5% creator fee), buys $OBJECTPAD on its Pons curve with it from the treasury and
 * sends the tokens straight to the dead address. Each burn records which coins funded it. Nothing runs until the
 * $OBJECTPAD contract address is configured (OBJECTPAD_TOKEN_ADDRESS).
 */
export class BurnService {
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly sponsor: SponsorService) {
    store.run('CREATE TABLE IF NOT EXISTS op_burns (id TEXT PRIMARY KEY, at INTEGER NOT NULL, eth_in TEXT NOT NULL, tokens TEXT NOT NULL DEFAULT \'0\', tx_hash TEXT, state TEXT NOT NULL, coins TEXT NOT NULL)');
    store.run('CREATE TABLE IF NOT EXISTS op_burn_accrual (token TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL, owed TEXT NOT NULL, last_block INTEGER NOT NULL)');
  }
  token(): Address | null { const value = this.runtime.env.OBJECTPAD_TOKEN_ADDRESS?.trim(); return value && validAddress(value) ? value.toLowerCase() as Address : null; }
  due(): boolean { return Boolean(this.token()) && Date.now() - this.lastRun() >= BURN_INTERVAL_MS; }
  private lastRun(): number { return Number(this.store.one<{ value: number }>("SELECT value FROM op_scheduler WHERE name='burn_last'")?.value ?? 0); }
  list(limit = 40): BurnEntry[] {
    return this.store.all<{ id: string; at: number; eth_in: string; tokens: string; tx_hash: string | null; state: BurnEntry['state']; coins: string }>('SELECT * FROM op_burns ORDER BY at DESC LIMIT ?', limit)
      .map(r => ({ id: r.id, at: r.at, ethIn: r.eth_in, tokensBurned: r.tokens, hash: r.tx_hash, state: r.state, coins: JSON.parse(r.coins) as BurnEntry['coins'] }));
  }
  summary(): { live: boolean; token: string | null; intervalSec: number; nextAt: number | null; totalEth: string; totalTokens: string; burns: number; pendingEth: string } {
    const rows = this.store.all<{ eth_in: string; tokens: string }>("SELECT eth_in,tokens FROM op_burns WHERE state='confirmed'");
    const pending = this.store.all<{ owed: string }>('SELECT owed FROM op_burn_accrual').reduce((sum, r) => sum + BigInt(r.owed), 0n);
    return { live: Boolean(this.token()), token: this.token(), intervalSec: BURN_INTERVAL_MS / 1000, nextAt: this.token() ? this.lastRun() + BURN_INTERVAL_MS : null, totalEth: rows.reduce((s, r) => s + BigInt(r.eth_in), 0n).toString(), totalTokens: rows.reduce((s, r) => s + BigInt(r.tokens), 0n).toString(), burns: rows.length, pendingEth: pending.toString() };
  }
  /** Coins launched through ObjectPad (creator launches and showcase coins) with their curves. */
  private coins(): { token: Address; curve: Address; symbol: string; name: string }[] {
    const records = this.store.all<{ payload: string }>("SELECT payload FROM op_records WHERE state='confirmed'").map(r => JSON.parse(r.payload) as { token?: string; curve?: string; symbol: string; commitment: { publicName: string } }).filter(p => p.token && p.curve).map(p => ({ token: p.token as Address, curve: p.curve as Address, symbol: p.symbol, name: p.commitment.publicName }));
    let house: { token: Address; curve: Address; symbol: string; name: string }[] = [];
    try { house = this.store.all<{ id: string; token: string; curve: string }>("SELECT id,token,curve FROM op_house WHERE state='live' AND token IS NOT NULL AND curve IS NOT NULL").map(r => ({ token: r.token as Address, curve: r.curve as Address, symbol: r.id.toUpperCase(), name: r.id })); } catch { /* table created lazily */ }
    return [...records, ...house];
  }
  /** Adds 0.5% of each coin's new on-chain volume to what it owes the burn. */
  private async accrue(): Promise<void> {
    const client = serverClient(this.runtime.env); const head = await client.getBlockNumber();
    for (const coin of this.coins()) {
      const row = this.store.one<{ owed: string; last_block: number }>('SELECT owed,last_block FROM op_burn_accrual WHERE token=?', coin.token);
      const from = row ? BigInt(row.last_block) + 1n : head - MAX_BLOCK_SPAN; if (from > head) continue;
      const to = from + MAX_BLOCK_SPAN < head ? from + MAX_BLOCK_SPAN : head;
      const logs = await client.getLogs({ address: coin.curve, events: [BUY, SELL], fromBlock: from, toBlock: to }).catch(() => null); if (!logs) continue;
      let fees = 0n; for (const log of logs) fees += (log.args as { creatorFee?: bigint }).creatorFee ?? 0n;
      const owed = (row ? BigInt(row.owed) : 0n) + fees / 3n;
      this.store.run('INSERT INTO op_burn_accrual(token,symbol,name,owed,last_block) VALUES (?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET owed=excluded.owed,last_block=excluded.last_block,symbol=excluded.symbol,name=excluded.name', coin.token, coin.symbol, coin.name, owed.toString(), Number(to));
    }
  }
  /** Confirms earlier burns, then (every five minutes) runs one buyback & burn round. */
  async run(): Promise<void> {
    const token = this.token(); if (!token) return; const client = serverClient(this.runtime.env);
    for (const row of this.store.all<{ id: string; tx_hash: string; at: number }>("SELECT id,tx_hash,at FROM op_burns WHERE state='submitted' AND tx_hash IS NOT NULL")) {
      const receipt = await client.getTransactionReceipt({ hash: row.tx_hash as Hex }).catch(() => null);
      if (!receipt) { if (Date.now() - row.at > 10 * 60_000) this.store.run("UPDATE op_burns SET state='failed' WHERE id=?", row.id); continue; }
      let burned = 0n; for (const log of receipt.logs) if (log.address.toLowerCase() === token && log.topics[2] && `0x${log.topics[2].slice(26)}`.toLowerCase() === DEAD_ADDRESS.toLowerCase()) burned += BigInt(log.data);
      this.store.run('UPDATE op_burns SET state=?,tokens=? WHERE id=?', receipt.status === 'success' ? 'confirmed' : 'failed', burned.toString(), row.id);
      if (receipt.status === 'success') this.store.metric('burn_confirmed');
    }
    if (!this.due()) return;
    this.store.run("INSERT INTO op_scheduler(name,value) VALUES ('burn_last',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", Date.now());
    await this.accrue();
    const owed = this.store.all<{ token: string; symbol: string; name: string; owed: string }>("SELECT * FROM op_burn_accrual WHERE owed<>'0'");
    const total = owed.reduce((s, r) => s + BigInt(r.owed), 0n); if (total < MIN_BURN_WEI) return;
    const status = await this.sponsor.status(true); const spare = BigInt(status.balanceWei) - BigInt(status.launchCostWei) * LAUNCH_RESERVE; if (spare < MIN_BURN_WEI) { this.store.metric('burn_waiting_treasury'); return; }
    const amount = total < spare ? total : spare;
    const curve = await client.readContract({ address: token, abi: ERC20_ABI, functionName: 'curve' }).catch(() => null) as Address | null; if (!curve) { this.store.metric('burn_no_curve'); return; }
    if (await client.readContract({ address: curve, abi: CURVE_ABI, functionName: 'graduated' }).catch(() => true)) { this.store.metric('burn_curve_graduated'); return; }
    const sponsor = this.sponsor.address;
    const sim = await client.simulateContract({ address: curve, abi: CURVE_ABI, functionName: 'buy', args: [amount, 0n, DEAD_ADDRESS], account: sponsor, value: amount }).catch((error: unknown) => { console.warn('objectpad.burn.simulation', error instanceof Error ? error.message.slice(0, 160) : ''); return null; });
    if (!sim) { this.store.metric('burn_simulation_failed'); return; }
    const minOut = (sim.result as bigint) * 97n / 100n;
    const wallet = this.sponsor.wallet();
    const hash = await wallet.writeContract({ address: curve, abi: CURVE_ABI, functionName: 'buy', args: [amount, minOut, DEAD_ADDRESS], value: amount, chain: robinhoodChain, account: wallet.account }).catch((error: unknown) => { console.warn('objectpad.burn.send', error instanceof Error ? error.message.slice(0, 160) : ''); return null; });
    if (!hash) { this.store.metric('burn_send_failed'); return; }
    const coins = owed.map(r => ({ symbol: r.symbol, name: r.name, share: Math.round(Number(BigInt(r.owed) * 10_000n / total)) / 100 })).sort((a, b) => b.share - a.share).slice(0, 8);
    this.store.atomic(() => {
      this.store.run('INSERT INTO op_burns(id,at,eth_in,tokens,tx_hash,state,coins) VALUES (?,?,?,?,?,?,?)', crypto.randomUUID(), Date.now(), amount.toString(), '0', hash, 'submitted', JSON.stringify(coins));
      // Paid in full, or pro rata when the treasury could only cover part of the round.
      for (const r of owed) { const paid = amount === total ? BigInt(r.owed) : BigInt(r.owed) * amount / total; this.store.run('UPDATE op_burn_accrual SET owed=? WHERE token=?', (BigInt(r.owed) - paid).toString(), r.token); }
    });
    this.sponsor.invalidate(); this.store.metric('burn_submitted'); console.log('objectpad.burn.sent', formatEther(amount));
  }
}
