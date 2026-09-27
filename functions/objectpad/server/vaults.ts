/**
 * Object Vaults: typed baskets of ObjectPad coins with a live, tradable index.
 *
 * Index level (cap-weighted, base 1000):   I(t) = 1000 x SUM_i MC_i(t) / SUM_i MC_i(t0)
 * Index level (equal-weighted, base 1000): I(t) = 1000 x (1/N) x SUM_i P_i(t) / P_i(t0)
 * Every coin has a fixed 1,000,000,000 supply, so MC_i = P_i x 1e9 and both formulas use real on-chain prices.
 * t0 is the vault's base time (the first hour where every constituent had traded, or its creation time).
 *
 * "Buying the index" is a basket buy: the ETH amount is split by the index weights and each leg is a wallet-signed buy on
 * that coin's own bonding curve (non-custodial; ObjectPad never holds the basket). Selling sells the same % of each leg.
 */
import { ApiError } from '../shared/security';
import type { ObjectCoin } from '../shared/domain';
import type { Store } from './store';

export const VAULT_KINDS = ['collection', 'set', 'theme', 'creator'] as const;
export type VaultKind = typeof VAULT_KINDS[number];
export type Weighting = 'cap' | 'equal';
const MAX_ITEMS = 12; const MIN_ITEMS = 2; const HOUR = 3_600_000;
interface VaultRow { id: string; slug: string; owner: string; name: string; kind: string; description: string; weighting: string; created_at: number; system: number; }
export interface VaultConstituent { token: string; curve: string; symbol: string; name: string; logo: string; path: string; priceEth: number; marketCapEth: number; change24h: number; volume24hEth: number; holders: number; weight: number; pairToken: string | null; kind: string; objectId: string | null; }
export interface VaultView { id: string; slug: string; name: string; kind: VaultKind; description: string; weighting: Weighting; system: boolean; owner: { handle: string | null; mine: boolean }; createdAt: number; level: number; change24h: number; change7d: number; totalCapEth: number; avgCapEth: number; volume24hEth: number; holders: number; constituents: VaultConstituent[]; history: { t: number; v: number }[]; }

const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'vault';

export class VaultService {
  constructor(private readonly store: Store, private readonly handleOf: (owner: string) => string | null) {
    store.run('CREATE TABLE IF NOT EXISTS op_vaults (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, description TEXT NOT NULL, weighting TEXT NOT NULL, created_at INTEGER NOT NULL, system INTEGER NOT NULL DEFAULT 0)');
    store.run('CREATE TABLE IF NOT EXISTS op_vault_items (vault_id TEXT NOT NULL, token TEXT NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY(vault_id, token))');
  }
  private rows(): VaultRow[] { return this.store.all<VaultRow>('SELECT * FROM op_vaults ORDER BY created_at DESC LIMIT 200'); }
  private tokens(id: string): string[] { return this.store.all<{ token: string }>('SELECT token FROM op_vault_items WHERE vault_id=? ORDER BY added_at', id).map(r => r.token); }

  /** Live system vaults, always available: every ObjectPad original, and the 10 largest creator coins. */
  private systemVaults(coins: ObjectCoin[]): (VaultRow & { tokens: string[] })[] {
    const live = coins.filter(c => c.token && c.state !== 'launching');
    const originals = live.filter(c => c.kind === 'original').map(c => c.token);
    const creators = live.filter(c => c.kind === 'creator' && !c.nsfw).sort((a, b) => b.marketCapEth - a.marketCapEth).slice(0, 10).map(c => c.token);
    const base = { owner: 'system', created_at: Date.UTC(2026, 8, 1), system: 1 };
    return [
      { ...base, id: 'op-originals', slug: 'objectpad-originals', name: 'ObjectPad Originals Index', kind: 'set', description: 'Every ObjectPad original object coin, cap-weighted. The blue-chip basket of the protocol.', weighting: 'cap', tokens: originals },
      { ...base, id: 'op-creator-10', slug: 'creator-10', name: 'Creator 10', kind: 'theme', description: 'The ten largest real-object coins launched by creators, rebalanced live by market cap.', weighting: 'cap', tokens: creators },
    ].filter(v => v.tokens.length >= MIN_ITEMS);
  }

  /** Hourly price series for one curve over the window, from indexed on-chain trades (last trade price per hour). */
  private series(curve: string, from: number, buckets: number, scale: number): (number | null)[] {
    const trades = this.store.all<{ eth: number; tokens: number; at: number }>('SELECT eth,tokens,at FROM op_idx_trades WHERE curve=? ORDER BY block,log_index', curve);
    const out: (number | null)[] = []; let i = 0; let last: number | null = null;
    for (let b = 0; b < buckets; b++) { const end = from + (b + 1) * HOUR; while (i < trades.length && trades[i].at < end) { if (trades[i].tokens > 0) last = (trades[i].eth / trades[i].tokens) * scale; i++; } out.push(last); }
    return out;
  }
  private view(row: VaultRow, tokens: string[], coins: ObjectCoin[], viewer: string | null, withHistory: boolean): VaultView | null {
    const map = new Map(coins.map(c => [c.token.toLowerCase(), c]));
    const items = tokens.map(t => map.get(t.toLowerCase())).filter((c): c is ObjectCoin => Boolean(c && c.token && c.priceEth > 0));
    if (!items.length) return null;
    const weighting: Weighting = row.weighting === 'equal' ? 'equal' : 'cap';
    const totalCap = items.reduce((s, c) => s + c.marketCapEth, 0);
    const constituents: VaultConstituent[] = items.map(c => ({ token: c.token, curve: c.curve, symbol: c.symbol, name: c.name, logo: c.logo, path: c.path, priceEth: c.priceEth, marketCapEth: c.marketCapEth, change24h: c.change24h, volume24hEth: c.volume24hEth, holders: c.holders, weight: weighting === 'equal' ? 1 / items.length : totalCap > 0 ? c.marketCapEth / totalCap : 1 / items.length, pairToken: c.pair?.address ?? null, kind: c.kind, objectId: c.kind === 'creator' ? c.id : null }));
    // History: 7 days of hourly buckets rebuilt from trades, scaled so the latest raw trade price matches the live price.
    const buckets = 168; const from = Math.floor((Date.now() - buckets * HOUR) / HOUR) * HOUR;
    const series = items.map(c => { const raw = this.store.one<{ eth: number; tokens: number }>('SELECT eth,tokens FROM op_idx_trades WHERE curve=? ORDER BY block DESC, log_index DESC LIMIT 1', c.curve); const rawPrice = raw && raw.tokens > 0 ? raw.eth / raw.tokens : 0; const s = this.series(c.curve, from, buckets, rawPrice > 0 ? c.priceEth / rawPrice : 1); s[s.length - 1] = c.priceEth; return s; });
    // Base: first bucket where every constituent has a price. Missing earlier values are back-filled with the first known.
    const filled = series.map(s => { const first = s.find(v => v !== null) ?? 0; return s.map(v => v ?? first); });
    const base = filled.map(s => s[0] || s.find(v => v > 0) || 1);
    const level = (b: number): number => weighting === 'equal' ? 1000 * filled.reduce((sum, s, i) => sum + s[b] / base[i], 0) / filled.length : 1000 * filled.reduce((sum, s) => sum + s[b], 0) / base.reduce((a, v) => a + v, 0);
    const history = Array.from({ length: buckets }, (_, b) => ({ t: from + (b + 1) * HOUR, v: Math.round(level(b) * 100) / 100 }));
    const now = history[history.length - 1].v; const d1 = history[Math.max(0, history.length - 25)].v; const d7 = history[0].v;
    return { id: row.id, slug: row.slug, name: row.name, kind: (VAULT_KINDS as readonly string[]).includes(row.kind) ? row.kind as VaultKind : 'collection', description: row.description, weighting, system: Boolean(row.system), owner: { handle: row.system ? 'ObjectPad' : this.handleOf(row.owner), mine: viewer === row.owner }, createdAt: row.created_at, level: now, change24h: d1 ? ((now - d1) / d1) * 100 : 0, change7d: d7 ? ((now - d7) / d7) * 100 : 0, totalCapEth: totalCap, avgCapEth: totalCap / items.length, volume24hEth: items.reduce((s, c) => s + c.volume24hEth, 0), holders: items.reduce((s, c) => s + c.holders, 0), constituents, history: withHistory ? history : history.filter((_, i) => i % 6 === 5) };
  }
  list(coins: ObjectCoin[], viewer: string | null): VaultView[] {
    const all = [...this.systemVaults(coins), ...this.rows().map(r => ({ ...r, tokens: this.tokens(r.id) }))];
    return all.map(v => this.view(v, v.tokens, coins, viewer, false)).filter((v): v is VaultView => Boolean(v));
  }
  detail(slug: string, coins: ObjectCoin[], viewer: string | null): VaultView {
    const sys = this.systemVaults(coins).find(v => v.slug === slug);
    const row = sys ?? this.store.one<VaultRow>('SELECT * FROM op_vaults WHERE slug=?', slug); if (!row) throw new ApiError('NOT_FOUND', 404);
    const view = this.view(row, sys ? sys.tokens : this.tokens(row.id), coins, viewer, true); if (!view) throw new ApiError('VAULT_EMPTY', 409); return view;
  }
  create(owner: string, input: { name: string; kind: string; description: string; weighting: string; tokens: string[] }, coins: ObjectCoin[]): VaultView {
    if (owner.startsWith('guest:')) throw new ApiError('SIGN_IN_REQUIRED', 401);
    const name = input.name.normalize('NFC').replace(/\s+/g, ' ').trim(); if (name.length < 3 || name.length > 40) throw new ApiError('VAULT_NAME_INVALID');
    if (!(VAULT_KINDS as readonly string[]).includes(input.kind)) throw new ApiError('VAULT_KIND_INVALID');
    const valid = new Set(coins.filter(c => c.token && c.priceEth > 0).map(c => c.token.toLowerCase()));
    const tokens = [...new Set(input.tokens.map(t => t.toLowerCase()))].filter(t => valid.has(t));
    if (tokens.length < MIN_ITEMS || tokens.length > MAX_ITEMS) throw new ApiError('VAULT_SIZE_INVALID');
    if (Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_vaults WHERE owner=?', owner)?.n ?? 0) >= 20) throw new ApiError('VAULT_LIMIT', 429);
    let slug = slugify(name); let n = 2; while (this.store.one('SELECT id FROM op_vaults WHERE slug=?', slug) || ['objectpad-originals', 'creator-10'].includes(slug)) slug = `${slugify(name).slice(0, 34)}-${n++}`;
    const id = crypto.randomUUID(); const now = Date.now();
    this.store.atomic(() => { this.store.run('INSERT INTO op_vaults(id,slug,owner,name,kind,description,weighting,created_at) VALUES (?,?,?,?,?,?,?,?)', id, slug, owner, name, input.kind, input.description.replace(/\s+/g, ' ').trim().slice(0, 240), input.weighting === 'equal' ? 'equal' : 'cap', now); tokens.forEach((t, i) => this.store.run('INSERT INTO op_vault_items(vault_id,token,added_at) VALUES (?,?,?)', id, t, now + i)); });
    this.store.metric('vault_created'); return this.detail(slug, coins, owner);
  }
  edit(owner: string, slug: string, input: { add?: string; remove?: string }, coins: ObjectCoin[]): VaultView {
    const row = this.store.one<VaultRow>('SELECT * FROM op_vaults WHERE slug=?', slug); if (!row) throw new ApiError('NOT_FOUND', 404); if (row.owner !== owner) throw new ApiError('FORBIDDEN', 403);
    const current = this.tokens(row.id);
    if (input.add) { const t = input.add.toLowerCase(); if (!coins.some(c => c.token.toLowerCase() === t && c.priceEth > 0)) throw new ApiError('VAULT_COIN_INVALID'); if (current.length >= MAX_ITEMS) throw new ApiError('VAULT_SIZE_INVALID'); this.store.run('INSERT OR IGNORE INTO op_vault_items(vault_id,token,added_at) VALUES (?,?,?)', row.id, t, Date.now()); }
    if (input.remove) { if (current.length <= MIN_ITEMS) throw new ApiError('VAULT_SIZE_INVALID'); this.store.run('DELETE FROM op_vault_items WHERE vault_id=? AND token=?', row.id, input.remove.toLowerCase()); }
    return this.detail(slug, coins, owner);
  }
}
