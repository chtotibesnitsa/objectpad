/**
 * Object Vaults v2 — three products, always labelled distinctly:
 *
 *  1. INDEX   — a published, rules-based price level. Tracks prices only. Nothing is held.
 *  2. BASKET  — an executable order: one atomic Multicall3 transaction buys every native-ETH constituent on its own Pons curve
 *               and the coins land directly in the buyer's wallet. ObjectPad never takes custody.
 *  3. VAULT   — a backed contract that holds the constituents and mints redeemable shares. Specified here, NOT deployed:
 *               `backed.status` stays 'not_deployed' until an audited factory address is configured.
 *
 * Methodology (v2, hashed and published per index):
 *   eligible_i = proof valid ∧ price source fresh ∧ depth2%_i ≥ MIN_DEPTH ∧ uniqueTraders_i ≥ 2 ∧ vol7d_i > 0 ∧ max wallet share of supply ≤ 5%
 *   score_i    = √(free-float mcap_i) × √(depth2%_i) × ln(1 + vol7d_i) × (1 − 0.9·HHI_i)
 *   weight_i   = min(score_i / Σscore, CAP) with the excess redistributed pro-rata (iterated), CAP = max(25%, 1/N)
 *   level(t)   = L_r × Σ_i w_i · P_i(t) / P_i(t_r)   (chain-linked at every rebalance r, base 1000)
 * Rebalances are computed daily, announced, and take effect 24h later (delayed & disclosed).
 */
import { encodeFunctionData, decodeEventLog, decodeFunctionData, parseAbi, verifyMessage, formatEther, type Address, type Hex } from 'viem';
import { ApiError, sha256 } from '../shared/security';
import type { ObjectCoin } from '../shared/domain';
import { CURVE_ABI } from '../shared/pons';
import type { Store } from './store';
import { serverClient } from './chain';
import type { Runtime } from './types';

export const VAULT_KINDS = ['collection', 'set', 'theme', 'creator', 'partner'] as const;
export type VaultKind = typeof VAULT_KINDS[number];
export type Weighting = 'score' | 'equal';
export type Affiliation = 'official' | 'partner' | 'community' | 'unaffiliated';
export type Execution = 'basket' | 'track_only' | 'halted';
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL_ABI = parseAbi(['struct Call3Value { address target; bool allowFailure; uint256 value; bytes callData; }', 'function aggregate3Value(Call3Value[] calls) payable returns ((bool success, bytes returnData)[] returnData)']);
const DEAD = '0x000000000000000000000000000000000000dead';
const HOUR = 3_600_000; const DAY = 24 * HOUR;
const MAX_ITEMS = 12; const MIN_ITEMS = 2; const TOP = 5; const MAX_FEE_BPS = 100; const REBALANCE_DELAY = DAY;

/** The published, hashed rulebook. Changing any value changes the methodology hash shown on every index. */
export const METHODOLOGY = {
  version: 'objectpad-vaults/2.0.0',
  formula: 'score = sqrt(freeFloatMcapEth) * sqrt(depth2pctEth) * ln(1 + volume7dEth) * (1 - 0.9 * HHI)',
  weight: 'min(score / sum(score), cap), excess redistributed pro-rata until no weight exceeds cap; cap = max(0.25, 1/N)',
  level: 'chain-linked: L(t) = L(r) * sum(w_i * P_i(t) / P_i(r)), base 1000',
  eligibility: { proofValid: true, priceSourceFresh: true, minDepth2pctEth: 0.005, minUniqueTraders: 2, minVolume7dEth: 0, maxWalletShareOfSupply: 0.05 },
  concentrationCap: 0.25,
  constituents: TOP,
  rebalance: { schedule: 'daily 00:00 UTC', effectiveDelayHours: 24, minWeightDrift: 0.01 },
  freeFloat: 'price * (1e9 - tokens held by the bonding curve - tokens at 0x…dEaD)',
  depth: '2% price-impact buy size, measured by an eth_call quote on the coin’s own Pons curve (constant-product model for non-ETH quote assets)',
  priceSource: 'Pons V2 curve reserves on Robinhood Chain (4663); stock-paired coins convert through the pair asset’s live on-chain ETH price',
} as const;

interface VaultRow { id: string; slug: string; owner: string; name: string; kind: string; description: string; weighting: string; created_at: number; system: number; fee_bps: number; fee_wallet: string | null; partner_name: string | null; partner_wallet: string | null; partner_sig: string | null; }
interface RebalanceRow { vault_id: string; at: number; announced_at: number; weights: string; level: number; hash: string; applied: number; }
interface Metrics { traders: number; freeFloatEth: number; depthEth: number; depthSource: 'quote' | 'model'; volume7dEth: number; hhi: number; score: number; checks: { proof: boolean; fresh: boolean; depth: boolean; holders: boolean; volume: boolean; concentration: boolean }; eligible: boolean; reason: string | null; }
export interface VaultConstituent { token: string; curve: string; symbol: string; name: string; logo: string; path: string; priceEth: number; marketCapEth: number; change24h: number; volume24hEth: number; holders: number; weight: number; targetWeight: number; pairToken: string | null; quoteAsset: string; kind: string; objectId: string | null; metrics: Metrics; }
export interface VaultView {
  id: string; slug: string; name: string; kind: VaultKind; description: string; weighting: Weighting; system: boolean;
  product: 'index'; execution: Execution; executionNote: string; affiliation: Affiliation; partner: { name: string; wallet: string } | null;
  owner: { handle: string | null; mine: boolean }; creatorFee: { bps: number; wallet: string | null };
  createdAt: number; level: number; change24h: number; change7d: number; totalCapEth: number; freeFloatEth: number; liquidityEth: number; volume24hEth: number; basketVolume24hEth: number; basketVolumeEth: number; traders: number; holders: number;
  health: { proof: number; fresh: boolean; eligible: number; total: number }; calculatedAt: number;
  methodology: { version: string; hash: string; cap: number };
  rebalance: { current: { at: number; hash: string }; pending: { effectiveAt: number; announcedAt: number; hash: string; weights: { token: string; symbol: string; weight: number }[] } | null; history: { at: number; hash: string; level: number; weights: { token: string; symbol: string; weight: number }[] }[] };
  backed: { status: 'not_deployed' | 'deployed'; factory: string | null };
  stock: { paired: number; halted: boolean; note: string } | null;
  constituents: VaultConstituent[]; excluded: { token: string; symbol: string; logo: string; reason: string }[];
  history: { t: number; v: number }[]; tabs: string[]; rank: number;
}
export interface BasketReceipt { hash: string; vault: string; trader: string; side: 'buy' | 'sell'; volumeEth: number; feeEth: number; legs: number; at: number; points: number; }

const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'vault';
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
/** Points are an activity record, not a token: 1 point per 0.001 ETH of verified basket volume. */
export const pointsFor = (volumeEth: number): number => Math.floor(volumeEth * 1000);
export const partnerMessage = (name: string, partner: string, wallet: string): string => `ObjectPad partner vault v1\nvault: ${name.trim()}\npartner: ${partner.trim()}\npartner wallet: ${wallet.toLowerCase()}\nI authorise this vault to be labelled as an official partner vault.`;

/** Iterative capping: no weight exceeds `cap`; the excess flows pro-rata to uncapped members. */
export function capWeights(scores: number[], cap: number): number[] {
  const n = scores.length; if (!n) return []; const c = Math.max(cap, 1 / n); const total = scores.reduce((a, b) => a + b, 0);
  let w = total > 0 ? scores.map(s => s / total) : scores.map(() => 1 / n); const capped = new Array<boolean>(n).fill(false);
  for (let k = 0; k < n; k++) {
    let excess = 0; w = w.map((x, i) => { if (!capped[i] && x > c + 1e-12) { excess += x - c; capped[i] = true; return c; } return x; });
    if (excess <= 1e-12) break; const free = w.reduce((a, x, i) => a + (capped[i] ? 0 : x), 0);
    if (free <= 0) break; w = w.map((x, i) => capped[i] ? x : x + excess * (x / free));
  }
  return w;
}

export class VaultService {
  private depth = new Map<string, { at: number; eth: number }>();
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly handleOf: (owner: string) => string | null, private readonly walletOf: (owner: string) => Promise<string | null>) {
    store.run('CREATE TABLE IF NOT EXISTS op_vaults (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, description TEXT NOT NULL, weighting TEXT NOT NULL, created_at INTEGER NOT NULL, system INTEGER NOT NULL DEFAULT 0)');
    store.run('CREATE TABLE IF NOT EXISTS op_vault_items (vault_id TEXT NOT NULL, token TEXT NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY(vault_id, token))');
    for (const col of ['fee_bps INTEGER NOT NULL DEFAULT 0', 'fee_wallet TEXT', 'partner_name TEXT', 'partner_wallet TEXT', 'partner_sig TEXT']) { try { store.run(`ALTER TABLE op_vaults ADD COLUMN ${col}`); } catch { /* exists */ } }
    store.run('CREATE TABLE IF NOT EXISTS op_vault_rebalances (vault_id TEXT NOT NULL, at INTEGER NOT NULL, announced_at INTEGER NOT NULL, weights TEXT NOT NULL, level REAL NOT NULL, hash TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(vault_id, at))');
    store.run('CREATE TABLE IF NOT EXISTS op_vault_receipts (hash TEXT PRIMARY KEY, vault_id TEXT NOT NULL, trader TEXT NOT NULL, side TEXT NOT NULL, volume_eth REAL NOT NULL, fee_eth REAL NOT NULL, fee_wallet TEXT, legs INTEGER NOT NULL, block INTEGER NOT NULL, at INTEGER NOT NULL, points INTEGER NOT NULL)');
    store.run('CREATE INDEX IF NOT EXISTS op_vault_receipts_vault ON op_vault_receipts(vault_id, at)');
    store.run('CREATE INDEX IF NOT EXISTS op_vault_receipts_trader ON op_vault_receipts(trader, at)');
  }
  get methodologyHash(): Promise<string> { return sha256(canon(METHODOLOGY)); }
  private checked = false;
  /** A methodology change starts a new chain-linked base: prior snapshots were computed under different rules. */
  private async ensureMethodology(): Promise<void> {
    if (this.checked) return; this.checked = true; const hash = await this.methodologyHash;
    this.store.run('CREATE TABLE IF NOT EXISTS op_vault_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const prev = this.store.one<{ value: string }>("SELECT value FROM op_vault_meta WHERE key='methodology'")?.value;
    if (prev !== hash) this.store.atomic(() => { this.store.run('DELETE FROM op_vault_rebalances'); this.store.run("INSERT INTO op_vault_meta(key,value) VALUES ('methodology',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", hash); });
  }

  // ---------- per-coin metrics ----------
  private async refreshDepth(coins: ObjectCoin[]): Promise<void> {
    const stale = coins.filter(c => c.curve && !c.pair && c.priceEth > 0 && (Date.now() - (this.depth.get(c.curve)?.at ?? 0)) > 15 * 60_000).slice(0, 40); if (!stale.length) return;
    const client = serverClient(this.runtime.env); const probe: Address = '0x00000000000000000000000000000000000fee01';
    const quote = async (curve: Address, value: bigint): Promise<bigint> => { const r = await client.call({ to: curve, account: probe, value, data: encodeFunctionData({ abi: CURVE_ABI, functionName: 'buy', args: [value, 0n, probe] }), stateOverride: [{ address: probe, balance: 10n ** 21n }] }); return r.data ? BigInt(r.data.slice(0, 66)) : 0n; };
    await Promise.all(stale.map(async c => {
      try {
        const small = 10n ** 13n; const big = 5n * 10n ** 16n; const [a, b] = await Promise.all([quote(c.curve as Address, small), quote(c.curve as Address, big)]); if (a <= 0n || b <= 0n) return;
        // Constant-product: price moves by (1 + x/R)² − 1. Solve R from the two quotes, then the 2%-impact size is R·(√1.02 − 1).
        const pS = Number(small) / Number(a); const pB = Number(big) / Number(b); const ratio = pB / pS; if (!(ratio > 1)) return;
        const reserve = (Number(big - small) / 1e18) / (ratio - 1); this.depth.set(c.curve, { at: Date.now(), eth: reserve * (Math.sqrt(1.02) - 1) });
      } catch { /* keep model fallback */ }
    }));
  }
  private metrics(c: ObjectCoin): Metrics {
    const m = METHODOLOGY.eligibility; const week = Date.now() - 7 * DAY;
    const rows = this.store.all<{ holder: string; balance: string }>("SELECT holder,balance FROM op_idx_balances WHERE token=? AND balance NOT LIKE '-%' AND balance<>'0'", c.token.toLowerCase());
    const bal = rows.map(r => ({ h: r.holder, b: Number(formatEther(BigInt(r.balance))) })); const float = bal.filter(x => x.h !== c.curve.toLowerCase() && x.h !== DEAD);
    const floatTokens = float.reduce((s, x) => s + x.b, 0); const topShare = float.reduce((mx, x) => Math.max(mx, x.b), 0) / 1e9; const hhi = floatTokens > 0 ? float.reduce((s, x) => s + (x.b / floatTokens) ** 2, 0) : 1;
    const vol = Number(this.store.one<{ v: number }>('SELECT COALESCE(SUM(eth),0) AS v FROM op_idx_trades WHERE curve=? AND at>=?', c.curve, week)?.v ?? 0) * (c.volumeEth > 0 && c.volume24hEth >= 0 ? (c.pair ? (c.pair.priceEth ?? 0) : 1) : 1);
    const traders = Number(this.store.one<{ n: number }>('SELECT COUNT(DISTINCT trader) AS n FROM op_idx_trades WHERE curve=?', c.curve)?.n ?? 0);
    const quoted = this.depth.get(c.curve); const modelled = 1.329 * Math.sqrt(Math.max(c.marketCapEth, 0)) * (Math.sqrt(1.02) - 1);
    const depthEth = quoted?.eth ?? modelled; const freeFloatEth = c.priceEth * floatTokens;
    const proof = Boolean(c.token && (c.kind === 'original' || c.launchHash)) && !c.nsfw; const fresh = c.priceEth > 0 && (!c.pair || (c.pair.priceEth ?? 0) > 0);
    const checks = { proof, fresh, depth: depthEth >= m.minDepth2pctEth, holders: traders >= m.minUniqueTraders, volume: vol > m.minVolume7dEth, concentration: topShare <= m.maxWalletShareOfSupply };
    const reason = !checks.proof ? 'Proof not valid' : !checks.fresh ? 'Price source stale' : !checks.holders ? `Fewer than ${m.minUniqueTraders} unique traders` : !checks.volume ? 'No trades in 7 days' : !checks.depth ? 'Liquidity too thin' : !checks.concentration ? 'One wallet holds over 5% of supply' : null;
    const score = Math.sqrt(Math.max(freeFloatEth, 0)) * Math.sqrt(Math.max(depthEth, 0)) * Math.log(1 + vol) * (1 - 0.9 * hhi);
    return { freeFloatEth, depthEth, depthSource: quoted ? 'quote' : 'model', volume7dEth: vol, hhi, score, checks, traders, eligible: !reason && score > 0, reason: reason ?? (score > 0 ? null : 'Zero score') };
  }

  // ---------- universe ----------
  private creatorOf(c: ObjectCoin): string | null { return c.kind === 'creator' ? this.store.one<{ owner: string }>('SELECT owner FROM op_records WHERE id=?', c.id)?.owner ?? null : 'objectpad'; }
  private systemRows(): (VaultRow & { pick: (coins: ObjectCoin[], m: Map<string, Metrics>) => ObjectCoin[] })[] {
    const base = { owner: 'system', created_at: Date.UTC(2026, 8, 1), system: 1, weighting: 'score', fee_bps: 0, fee_wallet: null, partner_name: null, partner_wallet: null, partner_sig: null };
    const byScore = (m: Map<string, Metrics>) => (a: ObjectCoin, b: ObjectCoin) => (m.get(b.token)?.score ?? 0) - (m.get(a.token)?.score ?? 0);
    const good = (m: Map<string, Metrics>) => (c: ObjectCoin) => m.get(c.token)?.eligible === true;
    return [
      { ...base, id: 'op-originals-5', slug: 'objectpad-originals-5', name: 'ObjectPad Originals 5', kind: 'set', description: 'The five strongest ObjectPad original object coins by liquidity-, volume- and float-adjusted score, capped at 25% each.', pick: (coins, m) => coins.filter(c => c.kind === 'original').filter(good(m)).sort(byScore(m)).slice(0, TOP) },
      { ...base, id: 'op-trending-5', slug: 'trending-objects-5', name: 'Trending Objects 5', kind: 'theme', description: 'The five eligible object coins with the most trending attention and 24h volume right now. Selection follows momentum; weights still follow the capped score, so hype alone can’t buy weight.', pick: (coins, m) => coins.filter(c => c.kind === 'creator' || c.kind === 'original').filter(good(m)).sort((a, b) => (b.trending + b.volume24hEth * 100) - (a.trending + a.volume24hEth * 100)).slice(0, TOP) },
      { ...base, id: 'op-creator-5', slug: 'creator-5', name: 'Creator 5', kind: 'creator', description: 'The top-scoring creator object coins with at most one coin per creator — a diversified creator basket.', pick: (coins, m) => { const seen = new Set<string>(); return coins.filter(c => c.kind === 'creator').filter(good(m)).sort(byScore(m)).filter(c => { const o = this.creatorOf(c) ?? c.token; if (seen.has(o)) return false; seen.add(o); return true; }).slice(0, TOP); } },
      { ...base, id: 'op-stock-paired-5', slug: 'stock-paired-5', name: 'Stock-Paired Objects 5', kind: 'theme', description: 'Object coins whose quote asset is an approved tokenized stock or ETF on Pons V2. Each coin tracks its own market — not ownership of the company or the object.', pick: (coins, m) => coins.filter(c => c.pair).filter(c => m.get(c.token)?.checks.proof).sort((a, b) => (m.get(b.token)?.score ?? 0) - (m.get(a.token)?.score ?? 0) || b.marketCapEth - a.marketCapEth).slice(0, TOP) },
    ];
  }
  private tokens(id: string): string[] { return this.store.all<{ token: string }>('SELECT token FROM op_vault_items WHERE vault_id=? ORDER BY added_at', id).map(r => r.token); }

  // ---------- rebalancing ----------
  private async targetWeights(row: VaultRow, members: ObjectCoin[], m: Map<string, Metrics>, stock: boolean): Promise<Record<string, number>> {
    const live = stock ? members : members.filter(c => m.get(c.token)?.eligible); if (!live.length) return {};
    const w = row.weighting === 'equal' ? live.map(() => 1 / live.length) : capWeights(live.map(c => stock ? Math.max(m.get(c.token)?.score ?? 0, 1e-9) + Math.sqrt(c.marketCapEth) * 1e-6 : m.get(c.token)?.score ?? 0), METHODOLOGY.concentrationCap);
    return Object.fromEntries(live.map((c, i) => [c.token.toLowerCase(), round6(w[i])]));
  }
  private series(curve: string, from: number, buckets: number, scale: number): (number | null)[] {
    const trades = this.store.all<{ eth: number; tokens: number; at: number }>('SELECT eth,tokens,at FROM op_idx_trades WHERE curve=? AND at<? ORDER BY block,log_index', curve, from + buckets * HOUR);
    const out: (number | null)[] = []; let i = 0; let last: number | null = null;
    for (let b = 0; b < buckets; b++) { const end = from + (b + 1) * HOUR; while (i < trades.length && trades[i].at < end) { if (trades[i].tokens > 0) last = (trades[i].eth / trades[i].tokens) * scale; i++; } out.push(last); }
    return out;
  }
  /** Hourly prices for the 7-day window, scaled so the latest raw trade matches the live price (handles pair conversion). */
  private prices(coins: ObjectCoin[], tokens: string[], from: number, buckets: number): Map<string, number[]> {
    const map = new Map(coins.map(c => [c.token.toLowerCase(), c])); const out = new Map<string, number[]>();
    for (const t of tokens) { const c = map.get(t); if (!c) continue;
      const raw = this.store.one<{ eth: number; tokens: number }>('SELECT eth,tokens FROM op_idx_trades WHERE curve=? ORDER BY block DESC, log_index DESC LIMIT 1', c.curve); const rp = raw && raw.tokens > 0 ? raw.eth / raw.tokens : 0;
      const s = this.series(c.curve, from, buckets, rp > 0 ? c.priceEth / rp : 1); s[s.length - 1] = c.priceEth; const first = s.find(v => v !== null) ?? c.priceEth; out.set(t, s.map(v => v ?? first)); }
    return out;
  }
  /** Ensures a current rebalance exists, applies any matured pending one, and announces a new one when weights drift. */
  private async rebalance(row: VaultRow, target: Record<string, number>, levelAt: (at: number) => number): Promise<void> {
    const now = Date.now(); const rows = this.store.all<RebalanceRow>('SELECT * FROM op_vault_rebalances WHERE vault_id=? ORDER BY at', row.id);
    const hash = async (w: Record<string, number>) => sha256(canon({ vault: row.id, weights: w, methodology: await this.methodologyHash }));
    if (!Object.keys(target).length) return;
    if (!rows.length) { const at = Math.floor((now - 7 * DAY) / HOUR) * HOUR + HOUR; this.store.run('INSERT OR IGNORE INTO op_vault_rebalances(vault_id,at,announced_at,weights,level,hash,applied) VALUES (?,?,?,?,?,?,1)', row.id, at, now, JSON.stringify(target), 1000, await hash(target)); return; }
    for (const p of rows.filter(r => !r.applied && r.at <= now)) this.store.run('UPDATE op_vault_rebalances SET applied=1, level=? WHERE vault_id=? AND at=?', Math.round(levelAt(p.at) * 100) / 100, row.id, p.at);
    const pending = rows.find(r => !r.applied && r.at > now); if (pending) return;
    const current = [...rows].reverse().find(r => r.applied || r.at <= now); if (!current) return;
    const cw = JSON.parse(current.weights) as Record<string, number>; const keys = new Set([...Object.keys(cw), ...Object.keys(target)]);
    const drift = Math.max(...[...keys].map(k => Math.abs((cw[k] ?? 0) - (target[k] ?? 0))));
    const lastAnnounce = Math.max(...rows.map(r => r.announced_at)); const today = Math.floor(now / DAY) * DAY;
    if (drift >= METHODOLOGY.rebalance.minWeightDrift && lastAnnounce < today) { const at = today + DAY + REBALANCE_DELAY - DAY; const eff = Math.max(at, now + REBALANCE_DELAY); this.store.run('INSERT OR IGNORE INTO op_vault_rebalances(vault_id,at,announced_at,weights,level,hash,applied) VALUES (?,?,?,?,?,?,0)', row.id, Math.ceil(eff / HOUR) * HOUR, now, JSON.stringify(target), 0, await hash(target)); }
  }

  // ---------- views ----------
  private async build(row: VaultRow, members: ObjectCoin[], coins: ObjectCoin[], m: Map<string, Metrics>, viewer: string | null, full: boolean): Promise<VaultView | null> {
    const isStock = row.id === 'op-stock-paired-5'; const tokenMap = new Map(coins.map(c => [c.token.toLowerCase(), c]));
    const target = await this.targetWeights(row, members, m, isStock);
    const buckets = 168; const from = Math.floor((Date.now() - buckets * HOUR) / HOUR) * HOUR;
    const segs0 = this.store.all<RebalanceRow>('SELECT * FROM op_vault_rebalances WHERE vault_id=? ORDER BY at', row.id);
    const allTokens = [...new Set([...Object.keys(target), ...segs0.flatMap(s => Object.keys(JSON.parse(s.weights) as Record<string, number>))])];
    const px = this.prices(coins, allTokens, from, buckets);
    const idx = (at: number) => Math.min(buckets - 1, Math.max(0, Math.floor((at - from) / HOUR)));
    const computeLevels = (segs: RebalanceRow[]): number[] => {
      const applied = segs.filter(s => s.applied || s.at <= Date.now()); const levels: number[] = []; if (!applied.length) return levels;
      let si = 0; let L = applied[0].level || 1000; let w = JSON.parse(applied[0].weights) as Record<string, number>; let b0 = idx(applied[0].at);
      for (let b = 0; b < buckets; b++) {
        const t = from + (b + 1) * HOUR;
        while (si + 1 < applied.length && applied[si + 1].at <= t) { const prevL = levels[b - 1] ?? L; si++; L = prevL; w = JSON.parse(applied[si].weights) as Record<string, number>; b0 = Math.max(0, b - 1); }
        let v = 0; let ws = 0; for (const [k, wk] of Object.entries(w)) { const s = px.get(k); if (!s) continue; const base = s[Math.max(b0, 0)] || s.find(x => x > 0) || 1; v += wk * (s[b] / base); ws += wk; }
        levels.push(ws > 0 ? L * v / ws : L);
      }
      return levels;
    };
    await this.rebalance(row, target, at => computeLevels(segs0)[idx(at)] ?? 1000);
    const segs = this.store.all<RebalanceRow>('SELECT * FROM op_vault_rebalances WHERE vault_id=? ORDER BY at', row.id);
    const current = [...segs].reverse().find(s => s.applied || s.at <= Date.now()); if (!current) return null;
    const weights = JSON.parse(current.weights) as Record<string, number>;
    const levels = computeLevels(segs); if (!levels.length) return null;
    const history = levels.map((v, b) => ({ t: from + (b + 1) * HOUR, v: Math.round(v * 100) / 100 }));
    const held = Object.keys(weights).map(t => tokenMap.get(t)).filter((c): c is ObjectCoin => Boolean(c));
    const constituents: VaultConstituent[] = held.map(c => ({ token: c.token, curve: c.curve, symbol: c.symbol, name: c.name, logo: c.logo, path: c.path, priceEth: c.priceEth, marketCapEth: c.marketCapEth, change24h: c.change24h, volume24hEth: c.volume24hEth, holders: c.holders, weight: weights[c.token.toLowerCase()] ?? 0, targetWeight: target[c.token.toLowerCase()] ?? 0, pairToken: c.pair?.address ?? null, quoteAsset: c.pair?.symbol ?? 'ETH', kind: c.kind, objectId: c.kind === 'creator' ? c.id : null, metrics: m.get(c.token) ?? this.metrics(c) })).sort((a, b) => b.weight - a.weight);
    const excluded = members.filter(c => !weights[c.token.toLowerCase()]).map(c => ({ token: c.token, symbol: c.symbol, logo: c.logo, reason: m.get(c.token)?.reason ?? 'Not selected at last rebalance' }));
    const halted = isStock && held.some(c => !(c.pair?.priceEth && c.pair.priceEth > 0));
    const nativeLegs = constituents.filter(c => !c.pairToken).length;
    const execution: Execution = halted ? 'halted' : constituents.length >= MIN_ITEMS && nativeLegs >= 1 ? 'basket' : 'track_only';
    const executionNote = execution === 'track_only' && nativeLegs === 0 && constituents.length ? 'Index only: every leg is stock-quoted. Atomic routing for approved stock-token quote assets ships in a later phase.' : execution === 'halted' ? 'Calculation halted: a stock-token price source is stale. Trading resumes when every source is fresh.' : execution === 'track_only' ? 'Tracking only: fewer than two eligible constituents right now.' : nativeLegs === constituents.length ? `One transaction buys all ${nativeLegs} coins.` : `One transaction buys ${nativeLegs} ETH-quoted coins; ${constituents.length - nativeLegs} stock-quoted leg${constituents.length - nativeLegs > 1 ? 's' : ''} route separately.`;
    const now = history[history.length - 1].v; const d1 = history[Math.max(0, history.length - 25)].v; const d7 = history[0].v;
    const rec = this.store.one<{ v: number; d: number; n: number }>('SELECT COALESCE(SUM(volume_eth),0) AS v, COALESCE(SUM(CASE WHEN at>=? THEN volume_eth ELSE 0 END),0) AS d, COUNT(DISTINCT trader) AS n FROM op_vault_receipts WHERE vault_id=?', Date.now() - DAY, row.id);
    const affiliation: Affiliation = row.system ? 'official' : row.partner_sig ? 'partner' : row.partner_name ? 'unaffiliated' : 'community';
    const pendingRow = segs.find(s => !s.applied && s.at > Date.now());
    const labelled = (w: Record<string, number>) => Object.entries(w).map(([token, weight]) => ({ token, symbol: tokenMap.get(token)?.symbol ?? token.slice(0, 6), weight })).sort((a, b) => b.weight - a.weight);
    const paired = constituents.filter(c => c.pairToken).length; const vol24 = constituents.reduce((s, c) => s + c.volume24hEth, 0);
    const tabs = [row.system || affiliation === 'partner' ? 'official' : 'community', ...(row.kind === 'creator' ? ['creators'] : []), ...(paired * 2 >= Math.max(1, constituents.length) ? ['stock-paired'] : [])];
    return {
      id: row.id, slug: row.slug, name: row.name, kind: (VAULT_KINDS as readonly string[]).includes(row.kind) ? row.kind as VaultKind : 'collection', description: row.description, weighting: row.weighting === 'equal' ? 'equal' : 'score', system: Boolean(row.system),
      product: 'index', execution, executionNote, affiliation, partner: row.partner_name ? { name: row.partner_name, wallet: row.partner_wallet ?? '' } : null,
      owner: { handle: row.system ? 'ObjectPad' : this.handleOf(row.owner), mine: viewer === row.owner }, creatorFee: { bps: row.fee_wallet ? row.fee_bps : 0, wallet: row.fee_wallet },
      createdAt: row.created_at, level: now, change24h: d1 ? ((now - d1) / d1) * 100 : 0, change7d: d7 ? ((now - d7) / d7) * 100 : 0,
      totalCapEth: constituents.reduce((s, c) => s + c.marketCapEth, 0), freeFloatEth: constituents.reduce((s, c) => s + c.metrics.freeFloatEth, 0), liquidityEth: constituents.reduce((s, c) => s + c.metrics.depthEth, 0),
      volume24hEth: vol24, basketVolume24hEth: Number(rec?.d ?? 0), basketVolumeEth: Number(rec?.v ?? 0), traders: Number(rec?.n ?? 0), holders: constituents.reduce((s, c) => s + c.holders, 0),
      health: { proof: constituents.filter(c => c.metrics.checks.proof).length, fresh: constituents.every(c => c.metrics.checks.fresh), eligible: constituents.filter(c => c.metrics.eligible).length, total: constituents.length }, calculatedAt: Date.now(),
      methodology: { version: METHODOLOGY.version, hash: await this.methodologyHash, cap: METHODOLOGY.concentrationCap },
      rebalance: { current: { at: current.at, hash: current.hash }, pending: pendingRow ? { effectiveAt: pendingRow.at, announcedAt: pendingRow.announced_at, hash: pendingRow.hash, weights: labelled(JSON.parse(pendingRow.weights) as Record<string, number>) } : null, history: full ? segs.filter(s => s.applied || s.at <= Date.now()).reverse().slice(0, 30).map(s => ({ at: s.at, hash: s.hash, level: s.level, weights: labelled(JSON.parse(s.weights) as Record<string, number>) })) : [] },
      backed: { status: this.runtime.env.OBJECTPAD_VAULT_FACTORY_ADDRESS ? 'deployed' : 'not_deployed', factory: this.runtime.env.OBJECTPAD_VAULT_FACTORY_ADDRESS ?? null },
      stock: isStock || paired ? { paired, halted, note: 'Stock-paired coins use an approved Pons V2 quote asset. The object coin tracks its own market — it is not ownership of the company, the stock, or the object.' } : null,
      constituents, excluded, history: full ? history : history.filter((_, i) => i % 4 === 3), tabs,
      rank: Number(rec?.d ?? 0) * 3 + vol24 + Math.max(0, now / 1000 - 1) * 0.1,
    };
  }
  private async context(coins: ObjectCoin[]): Promise<Map<string, Metrics>> {
    await this.ensureMethodology();
    const live = coins.filter(c => c.token && c.state !== 'launching' && c.priceEth > 0); await this.refreshDepth(live);
    return new Map(live.map(c => [c.token, this.metrics(c)]));
  }
  private live(coins: ObjectCoin[]): ObjectCoin[] { return coins.filter(c => c.token && c.state !== 'launching' && c.priceEth > 0); }
  private userRow(r: VaultRow, coins: ObjectCoin[]): ObjectCoin[] { const map = new Map(this.live(coins).map(c => [c.token.toLowerCase(), c])); return this.tokens(r.id).map(t => map.get(t.toLowerCase())).filter((c): c is ObjectCoin => Boolean(c)); }

  async list(coins: ObjectCoin[], viewer: string | null): Promise<{ items: VaultView[]; methodology: typeof METHODOLOGY; methodologyHash: string }> {
    const m = await this.context(coins); const live = this.live(coins); const out: VaultView[] = [];
    for (const s of this.systemRows()) { const v = await this.build(s, s.pick(live, m), coins, m, viewer, false).catch(() => null); if (v) out.push(v); }
    for (const r of this.store.all<VaultRow>('SELECT * FROM op_vaults ORDER BY created_at DESC LIMIT 200')) { const v = await this.build(r, this.userRow(r, coins), coins, m, viewer, false).catch(() => null); if (v) out.push(v); }
    return { items: out, methodology: METHODOLOGY, methodologyHash: await this.methodologyHash };
  }
  async detail(slug: string, coins: ObjectCoin[], viewer: string | null): Promise<VaultView & { receipts: BasketReceipt[] }> {
    const m = await this.context(coins); const sys = this.systemRows().find(v => v.slug === slug);
    const row = sys ?? this.store.one<VaultRow>('SELECT * FROM op_vaults WHERE slug=?', slug); if (!row) throw new ApiError('NOT_FOUND', 404);
    const view = await this.build(row, sys ? sys.pick(this.live(coins), m) : this.userRow(row, coins), coins, m, viewer, true); if (!view) throw new ApiError('VAULT_EMPTY', 409);
    const receipts = this.store.all<{ hash: string; trader: string; side: 'buy' | 'sell'; volume_eth: number; fee_eth: number; legs: number; at: number; points: number }>('SELECT * FROM op_vault_receipts WHERE vault_id=? ORDER BY at DESC LIMIT 25', row.id).map(r => ({ hash: r.hash, vault: slug, trader: r.trader, side: r.side, volumeEth: r.volume_eth, feeEth: r.fee_eth, legs: r.legs, at: r.at, points: r.points }));
    return { ...view, receipts };
  }
  /** Every live coin with its eligibility checks: powers the create flow's live preview. */
  async universe(coins: ObjectCoin[]): Promise<{ token: string; symbol: string; name: string; logo: string; kind: string; quoteAsset: string; marketCapEth: number; metrics: Metrics }[]> {
    const m = await this.context(coins); return this.live(coins).filter(c => !c.nsfw).map(c => ({ token: c.token, symbol: c.symbol, name: c.name, logo: c.logo, kind: c.kind, quoteAsset: c.pair?.symbol ?? 'ETH', marketCapEth: c.marketCapEth, metrics: m.get(c.token) ?? this.metrics(c) })).sort((a, b) => b.metrics.score - a.metrics.score);
  }

  async create(owner: string, input: { name: string; kind: string; description: string; weighting: string; tokens: string[]; feeBps: number; partnerName?: string; partnerWallet?: string; partnerSignature?: string }, coins: ObjectCoin[]): Promise<VaultView> {
    if (owner.startsWith('guest:')) throw new ApiError('SIGN_IN_REQUIRED', 401);
    const name = input.name.normalize('NFC').replace(/\s+/g, ' ').trim(); if (name.length < 3 || name.length > 40) throw new ApiError('VAULT_NAME_INVALID');
    if (!(VAULT_KINDS as readonly string[]).includes(input.kind)) throw new ApiError('VAULT_KIND_INVALID');
    const valid = new Set(this.live(coins).filter(c => !c.nsfw).map(c => c.token.toLowerCase()));
    const tokens = [...new Set(input.tokens.map(t => t.toLowerCase()))].filter(t => valid.has(t));
    if (tokens.length < MIN_ITEMS || tokens.length > MAX_ITEMS) throw new ApiError('VAULT_SIZE_INVALID');
    if (Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_vaults WHERE owner=?', owner)?.n ?? 0) >= 20) throw new ApiError('VAULT_LIMIT', 429);
    const feeBps = Math.max(0, Math.min(MAX_FEE_BPS, Math.round(Number.isFinite(input.feeBps) ? input.feeBps : 0)));
    const feeWallet = feeBps > 0 ? await this.walletOf(owner) : null; if (feeBps > 0 && !feeWallet) throw new ApiError('WALLET_REQUIRED', 409);
    let partnerName: string | null = null; let partnerWallet: string | null = null; let partnerSig: string | null = null;
    if (input.partnerName?.trim()) {
      partnerName = input.partnerName.normalize('NFC').replace(/[^\p{L}\p{N} $._-]/gu, '').trim().slice(0, 40) || null;
      if (partnerName && input.partnerWallet && input.partnerSignature && /^0x[a-fA-F0-9]{40}$/.test(input.partnerWallet) && /^0x[a-fA-F0-9]{130}$/.test(input.partnerSignature)) {
        const ok = await verifyMessage({ address: input.partnerWallet as Address, message: partnerMessage(name, partnerName, input.partnerWallet), signature: input.partnerSignature as Hex }).catch(() => false);
        if (!ok) throw new ApiError('PARTNER_SIGNATURE_INVALID'); partnerWallet = input.partnerWallet.toLowerCase(); partnerSig = input.partnerSignature;
      }
    }
    const reserved = this.systemRows().map(s => s.slug); let slug = slugify(name); let n = 2; while (this.store.one('SELECT id FROM op_vaults WHERE slug=?', slug) || reserved.includes(slug)) slug = `${slugify(name).slice(0, 34)}-${n++}`;
    const id = crypto.randomUUID(); const now = Date.now();
    this.store.atomic(() => { this.store.run('INSERT INTO op_vaults(id,slug,owner,name,kind,description,weighting,created_at,fee_bps,fee_wallet,partner_name,partner_wallet,partner_sig) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, slug, owner, name, input.kind, input.description.replace(/\s+/g, ' ').trim().slice(0, 240), input.weighting === 'equal' ? 'equal' : 'score', now, feeBps, feeWallet ? feeWallet.toLowerCase() : null, partnerName, partnerWallet, partnerSig); tokens.forEach((t, i) => this.store.run('INSERT INTO op_vault_items(vault_id,token,added_at) VALUES (?,?,?)', id, t, now + i)); });
    this.store.metric('vault_created'); return this.detail(slug, coins, owner);
  }
  async edit(owner: string, slug: string, input: { add?: string; remove?: string; feeBps?: number }, coins: ObjectCoin[]): Promise<VaultView> {
    const row = this.store.one<VaultRow>('SELECT * FROM op_vaults WHERE slug=?', slug); if (!row) throw new ApiError('NOT_FOUND', 404); if (row.owner !== owner) throw new ApiError('FORBIDDEN', 403);
    const current = this.tokens(row.id);
    if (input.add) { const t = input.add.toLowerCase(); if (!this.live(coins).some(c => c.token.toLowerCase() === t)) throw new ApiError('VAULT_COIN_INVALID'); if (current.length >= MAX_ITEMS) throw new ApiError('VAULT_SIZE_INVALID'); this.store.run('INSERT OR IGNORE INTO op_vault_items(vault_id,token,added_at) VALUES (?,?,?)', row.id, t, Date.now()); }
    if (input.remove) { if (current.length <= MIN_ITEMS) throw new ApiError('VAULT_SIZE_INVALID'); this.store.run('DELETE FROM op_vault_items WHERE vault_id=? AND token=?', row.id, input.remove.toLowerCase()); }
    if (input.feeBps !== undefined) { const bps = Math.max(0, Math.min(MAX_FEE_BPS, Math.round(input.feeBps))); const w = bps > 0 ? (row.fee_wallet ?? await this.walletOf(owner)) : row.fee_wallet; this.store.run('UPDATE op_vaults SET fee_bps=?, fee_wallet=? WHERE id=?', bps, w ? w.toLowerCase() : null, row.id); }
    return this.detail(slug, coins, owner);
  }

  // ---------- receipts & points ----------
  /**
   * Verifies basket transactions on-chain before crediting anything. A buy is one Multicall3 aggregate3Value tx whose CurveBuy
   * events all pay the tx sender and hit this vault's curves; the creator fee is the decoded value sent to the vault's fee wallet.
   * A sell is N curve txs from the same sender (+ an optional plain fee transfer). Credit goes to tx.from — posting someone else's
   * hash only credits them.
   */
  async receipt(slug: string, hashes: string[], coins: ObjectCoin[]): Promise<BasketReceipt> {
    const sys = this.systemRows().find(v => v.slug === slug); const row = sys ?? this.store.one<VaultRow>('SELECT * FROM op_vaults WHERE slug=?', slug); if (!row) throw new ApiError('NOT_FOUND', 404);
    const list = [...new Set(hashes.map(h => h.toLowerCase()))].filter(h => /^0x[a-f0-9]{64}$/.test(h)).slice(0, 16); if (!list.length) throw new ApiError('RECEIPT_INVALID');
    const known = this.store.one<{ hash: string }>(`SELECT hash FROM op_vault_receipts WHERE hash IN (${list.map(() => '?').join(',')})`, ...list); if (known) throw new ApiError('RECEIPT_EXISTS', 409);
    const curves = new Map(this.live(coins).map(c => [c.curve.toLowerCase(), c])); const client = serverClient(this.runtime.env);
    let trader: string | null = null; let side: 'buy' | 'sell' | null = null; let volume = 0; let fee = 0; let legs = 0; let block = 0; let at = 0;
    for (const hash of list) {
      const [tx, rc] = await Promise.all([client.getTransaction({ hash: hash as Hex }), client.getTransactionReceipt({ hash: hash as Hex })]).catch(() => { throw new ApiError('RECEIPT_NOT_FOUND', 404); });
      if (rc.status !== 'success') throw new ApiError('RECEIPT_REVERTED'); const from = tx.from.toLowerCase(); if (trader && trader !== from) throw new ApiError('RECEIPT_MIXED_SENDERS'); trader = from;
      block = Math.max(block, Number(rc.blockNumber)); if (!at) { const b = await client.getBlock({ blockNumber: rc.blockNumber }).catch(() => null); at = b ? Number(b.timestamp) * 1000 : Date.now(); }
      if (Date.now() - at > 3 * DAY) throw new ApiError('RECEIPT_TOO_OLD');
      if (row.fee_wallet && tx.to?.toLowerCase() === row.fee_wallet && tx.input === '0x') { fee += Number(formatEther(tx.value)); continue; }
      for (const log of rc.logs) {
        const c = curves.get(log.address.toLowerCase()); if (!c) continue;
        try { const ev = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics });
          const factor = c.pair ? (c.pair.priceEth ?? 0) : 1;
          if (ev.eventName === 'CurveBuy' && ev.args.recipient.toLowerCase() === from) { if (side === 'sell') throw new ApiError('RECEIPT_MIXED_SIDES'); side = 'buy'; volume += Number(formatEther(ev.args.quoteIn)) * factor; legs++; }
          if (ev.eventName === 'CurveSell' && ev.args.sender.toLowerCase() === from) { if (side === 'buy') throw new ApiError('RECEIPT_MIXED_SIDES'); side = 'sell'; volume += Number(formatEther(ev.args.quoteOut)) * factor; legs++; }
        } catch (e) { if (e instanceof ApiError) throw e; }
      }
      if (tx.to?.toLowerCase() === MULTICALL3.toLowerCase() && row.fee_wallet) {
        try { const d = decodeFunctionData({ abi: MULTICALL_ABI, data: tx.input }); for (const call of d.args[0]) if (call.target.toLowerCase() === row.fee_wallet && call.callData === '0x') fee += Number(formatEther(call.value)); } catch { /* not a basket call */ }
      }
    }
    if (!trader || !side || legs < 1) throw new ApiError('RECEIPT_NO_BASKET_LEGS');
    const points = pointsFor(volume);
    this.store.run('INSERT INTO op_vault_receipts(hash,vault_id,trader,side,volume_eth,fee_eth,fee_wallet,legs,block,at,points) VALUES (?,?,?,?,?,?,?,?,?,?,?)', list[0], row.id, trader, side, volume, fee, row.fee_wallet, legs, block, at, points);
    for (const extra of list.slice(1)) this.store.run('INSERT OR IGNORE INTO op_vault_receipts(hash,vault_id,trader,side,volume_eth,fee_eth,fee_wallet,legs,block,at,points) VALUES (?,?,?,?,0,0,?,0,?,?,0)', extra, row.id, trader, side, row.fee_wallet, block, at);
    this.store.metric('vault_receipt'); return { hash: list[0], vault: slug, trader, side, volumeEth: volume, feeEth: fee, legs, at, points };
  }
  /** Public leaderboards: traders by points, creators by verified fees earned (7 days and all-time). */
  leaderboard(): { traders: { wallet: string; points: number; volumeEth: number; trades: number }[]; creators: { handle: string | null; vault: string; slug: string; feesEth: number; volumeEth: number; traders: number }[]; totals: { volumeEth: number; feesEth: number; points: number; receipts: number } } {
    const week = Date.now() - 7 * DAY;
    const traders = this.store.all<{ trader: string; p: number; v: number; n: number }>('SELECT trader, SUM(points) AS p, SUM(volume_eth) AS v, COUNT(*) AS n FROM op_vault_receipts WHERE at>=? AND legs>0 GROUP BY trader ORDER BY p DESC LIMIT 20', week).map(r => ({ wallet: r.trader, points: Number(r.p), volumeEth: Number(r.v), trades: Number(r.n) }));
    const creators = this.store.all<{ id: string; slug: string; name: string; owner: string; f: number; v: number; n: number }>('SELECT v.id, v.slug, v.name, v.owner, COALESCE(SUM(r.fee_eth),0) AS f, COALESCE(SUM(r.volume_eth),0) AS v, COUNT(DISTINCT r.trader) AS n FROM op_vaults v JOIN op_vault_receipts r ON r.vault_id=v.id GROUP BY v.id ORDER BY f DESC, v DESC LIMIT 20').map(r => ({ handle: this.handleOf(r.owner), vault: r.name, slug: r.slug, feesEth: Number(r.f), volumeEth: Number(r.v), traders: Number(r.n) }));
    const t = this.store.one<{ v: number; f: number; p: number; n: number }>('SELECT COALESCE(SUM(volume_eth),0) AS v, COALESCE(SUM(fee_eth),0) AS f, COALESCE(SUM(points),0) AS p, COUNT(*) AS n FROM op_vault_receipts WHERE legs>0');
    return { traders, creators, totals: { volumeEth: Number(t?.v ?? 0), feesEth: Number(t?.f ?? 0), points: Number(t?.p ?? 0), receipts: Number(t?.n ?? 0) } };
  }
  /** One account's standing: trader points on its wallets and creator fees on its vaults. */
  me(owner: string, wallets: string[]): { points: number; volumeEth: number; trades: number; creator: { vaults: number; feesEth: number; volumeEth: number; traders: number }; recent: BasketReceipt[] } {
    const ws = [...new Set(wallets.map(w => w.toLowerCase()))].filter(w => /^0x[a-f0-9]{40}$/.test(w)); const ph = ws.map(() => '?').join(',') || "''";
    const t = this.store.one<{ p: number; v: number; n: number }>(`SELECT COALESCE(SUM(points),0) AS p, COALESCE(SUM(volume_eth),0) AS v, COUNT(*) AS n FROM op_vault_receipts WHERE legs>0 AND trader IN (${ph})`, ...ws);
    const c = this.store.one<{ k: number; f: number; v: number; n: number }>('SELECT COUNT(DISTINCT v.id) AS k, COALESCE(SUM(r.fee_eth),0) AS f, COALESCE(SUM(r.volume_eth),0) AS v, COUNT(DISTINCT r.trader) AS n FROM op_vaults v LEFT JOIN op_vault_receipts r ON r.vault_id=v.id WHERE v.owner=?', owner);
    const recent = this.store.all<{ hash: string; vault_id: string; trader: string; side: 'buy' | 'sell'; volume_eth: number; fee_eth: number; legs: number; at: number; points: number }>(`SELECT * FROM op_vault_receipts WHERE legs>0 AND trader IN (${ph}) ORDER BY at DESC LIMIT 10`, ...ws).map(r => ({ hash: r.hash, vault: this.store.one<{ slug: string }>('SELECT slug FROM op_vaults WHERE id=?', r.vault_id)?.slug ?? this.systemRows().find(s => s.id === r.vault_id)?.slug ?? r.vault_id, trader: r.trader, side: r.side, volumeEth: r.volume_eth, feeEth: r.fee_eth, legs: r.legs, at: r.at, points: r.points }));
    return { points: Number(t?.p ?? 0), volumeEth: Number(t?.v ?? 0), trades: Number(t?.n ?? 0), creator: { vaults: Number(c?.k ?? 0), feesEth: Number(c?.f ?? 0), volumeEth: Number(c?.v ?? 0), traders: Number(c?.n ?? 0) }, recent };
  }
}
