import { formatEther, parseAbi, parseAbiItem, type Address, type Hex } from 'viem';
import type { ObjectCoin } from '../shared/domain';
import { serverClient } from './chain';
import { HOUSE_COINS, houseRecord } from './house';
import type { Runtime } from './types';
import type { Store } from './store';
import type { PairService } from './pairs';
import { isEthPair, pairAsset } from '../shared/pairs';
import { isNsfwText } from '../shared/nsfw';

const BUY = parseAbiItem('event CurveBuy(address indexed sender,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 protocolFee,uint256 creatorFee)');
const SELL = parseAbiItem('event CurveSell(address indexed sender,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 protocolFee,uint256 creatorFee)');
const TRANSFER = parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
const CURVE_STATE = parseAbi(['function quoteReserve() view returns (uint256)', 'function tokenReserve() view returns (uint256)', 'function phantomQuote() view returns (uint256)', 'function graduationThreshold() view returns (uint256)', 'function graduated() view returns (bool)']);
const ZERO = '0x0000000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dead';
/** Blocks per log query (address-filtered, so the RPC's log cap is never close). */
const WINDOW = 250_000n;
const MAX_WINDOWS = 12;

export interface IndexedTrade { id: string; side: 'buy' | 'sell'; eth: number; tokens: number; price: number; trader: string; hash: string; block: number; at: number; }
export interface Holder { address: string; balance: number; share: number; since: number; label?: string; }
interface Tracked { curve: string; token: string; hash: string; kind: 'creator' | 'original'; ref: string; }
interface CurveRow { curve: string; token: string; start_block: number; cursor: number; }

/**
 * Indexes every ObjectPad coin (creator launches and ObjectPad originals) straight from Robinhood Chain: every CurveBuy /
 * CurveSell since launch and every token Transfer, so charts, 24h stats and holder lists are complete and exact. Each block
 * range is written atomically together with its cursor, so nothing is ever counted twice. Nothing is estimated.
 */
export class TradeIndexer {
  private flight: Promise<void> | null = null; private lastSync = 0;
  private summary: { at: number; items: ObjectCoin[] } | null = null; private summaryFlight: Promise<ObjectCoin[]> | null = null;
  private pairs: PairService | null = null;
  /** Wires the pair price source so stock-paired coins are converted to ETH for display and ranking. */
  setPairs(pairs: PairService): void { this.pairs = pairs; }
  constructor(private readonly store: Store, private readonly runtime: Runtime) {
    store.run('CREATE TABLE IF NOT EXISTS op_idx_curves (curve TEXT PRIMARY KEY, token TEXT NOT NULL, start_block INTEGER NOT NULL, cursor INTEGER NOT NULL)');
    store.run('CREATE TABLE IF NOT EXISTS op_idx_trades (id TEXT PRIMARY KEY, curve TEXT NOT NULL, side TEXT NOT NULL, eth REAL NOT NULL, tokens REAL NOT NULL, trader TEXT NOT NULL, hash TEXT NOT NULL, block INTEGER NOT NULL, log_index INTEGER NOT NULL, at INTEGER NOT NULL)');
    store.run('CREATE INDEX IF NOT EXISTS op_idx_trades_curve ON op_idx_trades(curve, block, log_index)');
    store.run('CREATE TABLE IF NOT EXISTS op_idx_balances (token TEXT NOT NULL, holder TEXT NOT NULL, balance TEXT NOT NULL, since INTEGER NOT NULL, PRIMARY KEY(token, holder))');
  }
  /** Every live ObjectPad coin: confirmed creator launches and live originals. */
  private tracked(): Tracked[] {
    const out: Tracked[] = [];
    for (const row of this.store.all<{ id: string; payload: string }>("SELECT id,payload FROM op_records WHERE state='confirmed' AND moderation_state='clear'")) { const p = JSON.parse(row.payload) as { curve?: string; token?: string; launchHash?: string }; if (p.curve && p.token && p.launchHash) out.push({ curve: p.curve.toLowerCase(), token: p.token.toLowerCase(), hash: p.launchHash, kind: 'creator', ref: row.id }); }
    for (const row of this.store.all<{ id: string; tx_hash: string | null; token: string | null; curve: string | null }>("SELECT id,tx_hash,token,curve FROM op_house WHERE state='live'")) if (row.curve && row.token && row.tx_hash) out.push({ curve: row.curve, token: row.token, hash: row.tx_hash, kind: 'original', ref: row.id });
    return out;
  }
  known(curve: string): boolean { return Boolean(this.store.one('SELECT curve FROM op_idx_curves WHERE curve=?', curve.toLowerCase())) || this.tracked().some(t => t.curve === curve.toLowerCase()); }
  /** Brings every coin up to the chain head. Throttled and single-flight; safe to call on every request. */
  sync(force = false): Promise<void> {
    if (this.flight) return this.flight;
    if (!force && Date.now() - this.lastSync < 4_000) return Promise.resolve();
    this.flight = this.run().catch(error => { console.warn('objectpad.indexer', error instanceof Error ? error.message.slice(0, 160) : ''); }).finally(() => { this.lastSync = Date.now(); this.flight = null; });
    return this.flight;
  }
  private async run(): Promise<void> {
    const client = serverClient(this.runtime.env);
    for (const t of this.tracked()) {
      if (this.store.one('SELECT curve FROM op_idx_curves WHERE curve=?', t.curve)) continue;
      const receipt = await client.getTransactionReceipt({ hash: t.hash as Hex }).catch(() => null); if (!receipt) continue;
      const start = Number(receipt.blockNumber); this.store.run('INSERT OR IGNORE INTO op_idx_curves(curve,token,start_block,cursor) VALUES (?,?,?,?)', t.curve, t.token, start, start - 1);
    }
    const head = Number(await client.getBlockNumber());
    const groups = new Map<number, CurveRow[]>(); for (const row of this.store.all<CurveRow>('SELECT * FROM op_idx_curves WHERE cursor<?', head)) { const list = groups.get(row.cursor) ?? []; list.push(row); groups.set(row.cursor, list); }
    for (const [cursor, rows] of groups) {
      let from = cursor + 1;
      for (let w = 0; w < MAX_WINDOWS && from <= head; w++) {
        const to = Math.min(head, from + Number(WINDOW) - 1);
        const addresses = rows.flatMap(r => [r.curve as Address, r.token as Address]);
        const [logs, a, b] = await Promise.all([client.getLogs({ address: addresses, events: [BUY, SELL, TRANSFER], fromBlock: BigInt(from), toBlock: BigInt(to) }), client.getBlock({ blockNumber: BigInt(from) }), client.getBlock({ blockNumber: BigInt(to) })]);
        const t0 = Number(a.timestamp) * 1000; const t1 = Number(b.timestamp) * 1000; const at = (block: number) => Math.round(to === from ? t1 : t0 + ((block - from) / (to - from)) * (t1 - t0));
        const tokenOf = new Map(rows.map(r => [r.curve, r.token])); const tokens = new Set(rows.map(r => r.token));
        const ordered = [...logs].sort((x, y) => Number((x.blockNumber ?? 0n) - (y.blockNumber ?? 0n)) || (x.logIndex ?? 0) - (y.logIndex ?? 0));
        this.store.atomic(() => {
          for (const log of ordered) {
            const address = log.address.toLowerCase(); const block = Number(log.blockNumber ?? 0n); const when = at(block);
            if (log.eventName === 'Transfer' && tokens.has(address)) {
              const args = log.args as { from?: Address; to?: Address; value?: bigint }; const value = args.value ?? 0n; if (value <= 0n) continue;
              const move = (holder: string, delta: bigint) => { if (holder === ZERO) return; const row = this.store.one<{ balance: string; since: number }>('SELECT balance,since FROM op_idx_balances WHERE token=? AND holder=?', address, holder); const prev = row ? BigInt(row.balance) : 0n; const next = prev + delta; const since = prev <= 0n && next > 0n ? when : row?.since ?? when; this.store.run('INSERT INTO op_idx_balances(token,holder,balance,since) VALUES (?,?,?,?) ON CONFLICT(token,holder) DO UPDATE SET balance=excluded.balance,since=excluded.since', address, holder, next.toString(), since); };
              move((args.from ?? ZERO).toLowerCase(), -value); move((args.to ?? ZERO).toLowerCase(), value); continue;
            }
            if ((log.eventName === 'CurveBuy' || log.eventName === 'CurveSell') && tokenOf.has(address)) {
              const buy = log.eventName === 'CurveBuy'; const args = log.args as { sender?: Address; recipient?: Address; quoteIn?: bigint; tokensOut?: bigint; tokensIn?: bigint; quoteOut?: bigint };
              const eth = Number(formatEther((buy ? args.quoteIn : args.quoteOut) ?? 0n)); const amount = Number(formatEther((buy ? args.tokensOut : args.tokensIn) ?? 0n)); if (!(eth > 0) || !(amount > 0)) continue;
              this.store.run('INSERT OR IGNORE INTO op_idx_trades(id,curve,side,eth,tokens,trader,hash,block,log_index,at) VALUES (?,?,?,?,?,?,?,?,?,?)', `${log.transactionHash}-${log.logIndex}`, address, buy ? 'buy' : 'sell', eth, amount, ((buy ? args.recipient : args.sender) ?? ZERO).toLowerCase(), log.transactionHash ?? '', block, log.logIndex ?? 0, when);
            }
          }
          for (const r of rows) this.store.run('UPDATE op_idx_curves SET cursor=? WHERE curve=?', to, r.curve);
        });
        from = to + 1;
      }
    }
    this.summary = null;
  }
  /** The latest trades across every ObjectPad coin, newest first (for the live tape and burn feed). */
  recent(limit = 40): (IndexedTrade & { curve: string })[] { return this.store.all<{ id: string; curve: string; side: 'buy' | 'sell'; eth: number; tokens: number; trader: string; hash: string; block: number; at: number }>('SELECT id,curve,side,eth,tokens,trader,hash,block,at FROM op_idx_trades ORDER BY block DESC, log_index DESC LIMIT ?', limit).map(t => ({ ...t, price: t.eth / t.tokens })); }
  /** Full trade history for one coin, oldest first. */
  async trades(curve: string): Promise<{ trades: IndexedTrade[]; fromBlock: number; toBlock: number }> {
    await this.sync(); const key = curve.toLowerCase(); const row = this.store.one<CurveRow>('SELECT * FROM op_idx_curves WHERE curve=?', key);
    const trades = this.store.all<{ id: string; side: 'buy' | 'sell'; eth: number; tokens: number; trader: string; hash: string; block: number; at: number }>('SELECT id,side,eth,tokens,trader,hash,block,at FROM (SELECT * FROM op_idx_trades WHERE curve=? ORDER BY block DESC, log_index DESC LIMIT 5000) ORDER BY block ASC, log_index ASC', key).map(t => ({ ...t, price: t.eth / t.tokens }));
    return { trades, fromBlock: row?.start_block ?? 0, toBlock: row?.cursor ?? 0 };
  }
  /** Exact holders of one coin from every Transfer since launch. The curve and the burn address are labelled. */
  async holders(curve: string): Promise<{ count: number; holders: Holder[] }> {
    await this.sync(); const row = this.store.one<CurveRow>('SELECT * FROM op_idx_curves WHERE curve=?', curve.toLowerCase()); if (!row) return { count: 0, holders: [] };
    const all = this.store.all<{ holder: string; balance: string; since: number }>("SELECT holder,balance,since FROM op_idx_balances WHERE token=? AND balance NOT LIKE '-%' AND balance<>'0'", row.token).map(h => ({ address: h.holder, balance: Number(formatEther(BigInt(h.balance))), since: h.since }));
    const supply = all.reduce((s, h) => s + h.balance, 0) || 1; all.sort((a, b) => b.balance - a.balance);
    const holders = all.slice(0, 40).map(h => ({ ...h, share: h.balance / supply, ...(h.address === row.curve ? { label: 'Bonding curve' } : h.address === DEAD ? { label: 'Burned' } : {}) }));
    return { count: all.filter(h => h.address !== row.curve && h.address !== DEAD).length, holders };
  }
  /** Every ObjectPad coin with live curve state and real 24h stats. Creator coins always rank above originals. */
  coins(trendScore: Map<string, number>): Promise<ObjectCoin[]> {
    if (this.summary && Date.now() - this.summary.at < 10_000) return Promise.resolve(this.summary.items);
    if (!this.summaryFlight) this.summaryFlight = this.buildCoins(trendScore).then(items => { this.summary = { at: Date.now(), items }; return items; }).finally(() => { this.summaryFlight = null; });
    return this.summaryFlight;
  }
  private async buildCoins(trendScore: Map<string, number>): Promise<ObjectCoin[]> {
    await this.sync(); const client = serverClient(this.runtime.env); const tracked = this.tracked(); const origin = this.runtime.origin; const api = this.runtime.apiOrigin;
    const states = tracked.length ? await client.multicall({ contracts: tracked.flatMap(t => (['quoteReserve', 'tokenReserve', 'phantomQuote', 'graduationThreshold', 'graduated'] as const).map(functionName => ({ address: t.curve as Address, abi: CURVE_STATE, functionName }))), allowFailure: true }).catch(() => []) : [];
    const day = Date.now() - 86_400_000; const out: ObjectCoin[] = [];
    const board = this.pairs ? await this.pairs.list().catch(() => null) : null; const quotes = new Map((board?.assets ?? []).map(a => [a.address.toLowerCase(), a]));
    tracked.forEach((t, i) => {
      // Curve reserves and indexed trade amounts are in the coin's quote asset. For stock-paired coins every ETH figure is the
      // quote amount (read as 18-decimals) times the asset's live on-chain ETH price, rescaled for the asset's real decimals.
      const pairToken = t.kind === 'creator' ? (JSON.parse(this.store.one<{ payload: string }>('SELECT payload FROM op_records WHERE id=?', t.ref)?.payload ?? '{}') as { pairToken?: string }).pairToken : undefined;
      const asset = isEthPair(pairToken) ? null : pairAsset(pairToken); const pq = asset ? quotes.get(asset.address.toLowerCase()) : undefined;
      const factor = asset ? (pq?.priceEth ?? 0) * 10 ** (18 - asset.decimals) : 1;
      const pair = asset ? { address: asset.address.toLowerCase(), symbol: asset.symbol, name: asset.name, kind: asset.kind, ...(asset.sector ? { sector: asset.sector } : {}), logo: pq?.logo ?? `${api}/api/pairs/logo/${asset.address.toLowerCase()}`, priceEth: pq?.priceEth ?? null, priceUsd: pq?.priceUsd ?? null, change24h: pq?.change24h ?? null } : null;
      const read = (k: number) => states[i * 5 + k]?.status === 'success' ? states[i * 5 + k].result as bigint | boolean : undefined;
      const quote = read(0) as bigint | undefined; const reserve = read(1) as bigint | undefined; const phantom = read(2) as bigint | undefined; const threshold = read(3) as bigint | undefined; const graduated = read(4) === true;
      const virtual = quote !== undefined && phantom !== undefined ? (quote >= phantom ? quote : quote + phantom) : undefined; const real = virtual !== undefined && phantom !== undefined && virtual > phantom ? virtual - phantom : 0n;
      const curvePrice = virtual !== undefined && reserve ? Number(formatEther(virtual)) / Number(formatEther(reserve)) : 0;
      const recent = this.store.all<{ side: string; eth: number; tokens: number; at: number }>('SELECT side,eth,tokens,at FROM op_idx_trades WHERE curve=? AND at>=? ORDER BY block,log_index', t.curve, day);
      const before = this.store.one<{ eth: number; tokens: number }>('SELECT eth,tokens FROM op_idx_trades WHERE curve=? AND at<? ORDER BY block DESC, log_index DESC LIMIT 1', t.curve, day);
      const totals = this.store.one<{ n: number; v: number; last: number | null; first: number | null }>('SELECT COUNT(*) AS n, COALESCE(SUM(eth),0) AS v, MAX(at) AS last, MIN(at) AS first FROM op_idx_trades WHERE curve=?', t.curve);
      const spark = this.store.all<{ eth: number; tokens: number }>('SELECT eth,tokens FROM (SELECT eth,tokens,block,log_index FROM op_idx_trades WHERE curve=? ORDER BY block DESC, log_index DESC LIMIT 40) ORDER BY block,log_index', t.curve).map(r => (r.eth / r.tokens) * factor);
      const priceEth = (curvePrice * factor) || spark[spark.length - 1] || 0; const ref = before ? (before.eth / before.tokens) * factor : recent[0] ? (recent[0].eth / recent[0].tokens) * factor : priceEth;
      const holders = Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_idx_balances WHERE token=? AND holder NOT IN (?,?) AND balance NOT LIKE '-%' AND balance<>'0'", t.token, t.curve, DEAD)?.n ?? 0);
      const base = { token: t.token, curve: t.curve, priceEth, marketCapEth: priceEth * 1e9, change24h: ref > 0 ? ((priceEth - ref) / ref) * 100 : 0, volume24hEth: recent.reduce((s, r) => s + r.eth, 0) * factor, volumeEth: Number(totals?.v ?? 0) * factor, trades24h: recent.length, buys24h: recent.filter(r => r.side === 'buy').length, sells24h: recent.filter(r => r.side === 'sell').length, trades: Number(totals?.n ?? 0), holders, progress: graduated ? 1 : threshold && threshold > 0n ? Math.min(1, Number(real * 10_000n / threshold) / 10_000) : 0, graduated, spark: [...spark, priceEth].filter(p => p > 0), lastTradeAt: totals?.last ?? null, launchHash: t.hash, state: 'live' as const, pair };
      if (t.kind === 'creator') {
        const p = JSON.parse(this.store.one<{ payload: string }>('SELECT payload FROM op_records WHERE id=?', t.ref)?.payload ?? '{}') as { symbol?: string; verifiedName?: string; iconHash?: string; confirmedAt?: number; commitment?: { objectTag?: string; objectName?: string; thumbnailHash?: string; story?: string; captureSessionId?: string } };
        const aiFlag = p.commitment?.captureSessionId ? this.store.one<{ v: number | null }>("SELECT json_extract(payload,'$.suggestion.nsfw') AS v FROM op_capture_sessions WHERE id=?", p.commitment.captureSessionId)?.v === 1 : false;
        const nsfw = aiFlag || isNsfwText(p.verifiedName, p.symbol, p.commitment?.objectName, p.commitment?.story);
        out.push({ ...base, kind: 'creator', id: t.ref, symbol: p.symbol ?? '', name: p.verifiedName ?? '', logo: `${api}/api/artifacts/${p.iconHash ?? p.commitment?.thumbnailHash ?? ''}`, path: `/objects/${t.ref}`, tag: p.commitment?.objectTag ?? null, objectName: p.commitment?.objectName ?? null, launchedAt: p.confirmedAt ?? totals?.first ?? Date.now(), trending: trendScore.get(t.ref) ?? 0, nsfw });
      } else {
        const spec = HOUSE_COINS.find(c => c.id === t.ref); if (!spec) return; const launched = this.store.one<{ updated_at: number }>('SELECT updated_at FROM op_house WHERE id=?', t.ref)?.updated_at;
        out.push({ ...base, kind: 'original', id: t.ref, symbol: spec.ticker, name: spec.name, logo: `${origin}/assets/objects/coin-${spec.id}.webp`, path: `/coin/${spec.ticker.toLowerCase()}`, tag: houseRecord(spec)?.tag ?? null, objectName: spec.catalog ?? null, launchedAt: launched ?? totals?.first ?? Date.now(), trending: 0 });
      }
    });
    for (const row of this.store.all<{ id: string }>("SELECT id FROM op_house WHERE state IN ('waiting','submitted')")) { const spec = HOUSE_COINS.find(c => c.id === row.id); if (spec) out.push({ kind: 'original', id: spec.id, token: '', curve: '', symbol: spec.ticker, name: spec.name, logo: `${origin}/assets/objects/coin-${spec.id}.webp`, path: `/coin/${spec.ticker.toLowerCase()}`, tag: houseRecord(spec)?.tag ?? null, objectName: spec.catalog ?? null, priceEth: 0, marketCapEth: 0, change24h: 0, volume24hEth: 0, volumeEth: 0, trades24h: 0, buys24h: 0, sells24h: 0, trades: 0, holders: 0, progress: 0, graduated: false, spark: [], lastTradeAt: null, launchHash: null, launchedAt: 0, trending: 0, state: 'launching' }); }
    for (const spec of HOUSE_COINS) if (!out.some(c => c.kind === 'original' && c.id === spec.id) && !this.store.one("SELECT id FROM op_house WHERE id=? AND state='failed'", spec.id)) out.push({ kind: 'original', id: spec.id, token: '', curve: '', symbol: spec.ticker, name: spec.name, logo: `${origin}/assets/objects/coin-${spec.id}.webp`, path: `/coin/${spec.ticker.toLowerCase()}`, tag: houseRecord(spec)?.tag ?? null, objectName: spec.catalog ?? null, priceEth: 0, marketCapEth: 0, change24h: 0, volume24hEth: 0, volumeEth: 0, trades24h: 0, buys24h: 0, sells24h: 0, trades: 0, holders: 0, progress: 0, graduated: false, spark: [], lastTradeAt: null, launchHash: null, launchedAt: 0, trending: 0, state: 'launching' });
    // Real creators first (trending, then newest), then ObjectPad originals by 24h volume and market cap, then those still launching.
    const rank = (c: ObjectCoin) => c.kind === 'creator' ? 0 : c.state === 'live' ? 1 : 2;
    return out.sort((a, b) => rank(a) - rank(b) || (a.kind === 'creator' ? (b.trending - a.trending) || (b.launchedAt - a.launchedAt) : (b.volume24hEth - a.volume24hEth) || (b.marketCapEth - a.marketCapEth)));
  }
}
