import { createWalletClient, encodeFunctionData, http, parseAbi, parseAbiItem, parseEventLogs, parseEther, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ApiError, sha256, validAddress } from '../shared/security';
import { robinhoodChain } from '../shared/pons';
import { BPS, CREATOR_TAX_BPS, PONS_PROTOCOL_FEE_BPS } from '../shared/economy';
import { rpcUrl, serverClient } from './chain';
import { HOUSE_COINS } from './house';
import { normalizeIcon } from './media';
import type { Store } from './store';
import type { Runtime } from './types';
import type { SponsorService } from './sponsor';
import type { AccountService } from './accounts';
import type { TradeIndexer } from './indexer';
import type { BurnService } from './burn';

const TOKEN = parseAbi(['function transfer(address,uint256) returns (bool)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const TRANSFER = parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'objectpad', 'objectpadfun', 'support', 'mod', 'moderator', 'official', 'system', 'team', 'root', 'operator', 'rain', 'everyone', 'here', 'treasury', 'staff', 'help', 'security', 'robinhood', 'pons']);
/** Rain sizes a funder can pick: the first N people to tap in share the pot evenly. */
export const RAIN_SLOTS = [5, 10, 25, 50, 100] as const;
const RAIN_WINDOW_MS = 10 * 60_000;
const TIP_EXPIRY_MS = 7 * 86_400_000;
const MIN_RAIN_ETH = parseEther('0.0005');
const ALLOWED_HOSTS = /^(?:www\.)?(?:objectpad\.fun|objectpad\.com|x\.com|twitter\.com|robinhoodchain\.blockscout\.com)$/i;

/** Public identity of a chatter: their ObjectPad username, avatar and (when linked) X handle. */
export interface SocialUser { username: string; avatar: string | null; x: string | null; }
interface PayoutRow { id: string; kind: 'tip' | 'tip_refund' | 'rain' | 'rain_refund'; ref: string; owner: string | null; to_wallet: string; asset: string; amount: string; source: 'escrow' | 'treasury'; state: string; hash: string | null; nonce: number | null; attempts: number; created_at: number; sent_at: number | null; }
interface TipRow { id: string; from_owner: string; to_owner: string; asset: string; symbol: string; decimals: number; amount: string; fund_hash: string; from_wallet: string; state: string; to_wallet: string | null; payout_hash: string | null; note: string; created_at: number; decided_at: number | null; }
interface RainRow { id: string; owner: string | null; source: 'escrow' | 'treasury'; asset: string; symbol: string; decimals: number; amount: string; slots: number; fund_hash: string | null; fund_from: string | null; message: string; state: string; created_at: number; closes_at: number; }

/**
 * ObjectPad social layer: usernames and profiles, the global live chat with @mentions, notifications, tips and rains.
 * Tips and rains move real funds, so every deposit is read back from Robinhood Chain before it counts, deposits are
 * held by a dedicated escrow wallet (never the launch treasury) and every payout is a real on-chain transfer.
 */
export class SocialService {
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly sponsor: SponsorService, private readonly accounts: AccountService, private readonly indexer: TradeIndexer, private readonly burns: BurnService, private readonly xIdentity: (owner: string) => Promise<{ handle: string; avatar: string } | null>, private readonly defaultWallet: (owner: string) => Promise<string | null>) {
    const t = (sql: string) => store.run(sql);
    t('CREATE TABLE IF NOT EXISTS op_social (owner TEXT PRIMARY KEY, username TEXT NOT NULL, username_lower TEXT NOT NULL UNIQUE, bio TEXT NOT NULL DEFAULT \'\', avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    t('CREATE TABLE IF NOT EXISTS op_chat (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, owner TEXT, kind TEXT NOT NULL, text TEXT NOT NULL, ref TEXT, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)');
    t('CREATE TABLE IF NOT EXISTS op_notifications (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT, text TEXT NOT NULL, link TEXT, ref TEXT, read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)');
    t('CREATE INDEX IF NOT EXISTS op_notifications_owner ON op_notifications(owner, created_at)');
    t('CREATE TABLE IF NOT EXISTS op_social_deposits (hash TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at INTEGER NOT NULL)');
    t('CREATE TABLE IF NOT EXISTS op_tips (id TEXT PRIMARY KEY, from_owner TEXT NOT NULL, to_owner TEXT NOT NULL, asset TEXT NOT NULL, symbol TEXT NOT NULL, decimals INTEGER NOT NULL, amount TEXT NOT NULL, fund_hash TEXT NOT NULL UNIQUE, from_wallet TEXT NOT NULL, state TEXT NOT NULL, to_wallet TEXT, payout_hash TEXT, note TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, decided_at INTEGER)');
    t('CREATE INDEX IF NOT EXISTS op_tips_to ON op_tips(to_owner, created_at)');
    t('CREATE INDEX IF NOT EXISTS op_tips_from ON op_tips(from_owner, created_at)');
    t('CREATE TABLE IF NOT EXISTS op_rains (id TEXT PRIMARY KEY, owner TEXT, source TEXT NOT NULL, asset TEXT NOT NULL, symbol TEXT NOT NULL, decimals INTEGER NOT NULL, amount TEXT NOT NULL, slots INTEGER NOT NULL, fund_hash TEXT UNIQUE, fund_from TEXT, message TEXT NOT NULL DEFAULT \'\', state TEXT NOT NULL, created_at INTEGER NOT NULL, closes_at INTEGER NOT NULL)');
    t('CREATE TABLE IF NOT EXISTS op_rain_entries (rain_id TEXT NOT NULL, owner TEXT NOT NULL, visitor TEXT NOT NULL, wallet TEXT NOT NULL, joined_at INTEGER NOT NULL, share TEXT, payout_hash TEXT, PRIMARY KEY(rain_id, owner), UNIQUE(rain_id, visitor))');
    t('CREATE TABLE IF NOT EXISTS op_payouts (id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, owner TEXT, to_wallet TEXT NOT NULL, asset TEXT NOT NULL, amount TEXT NOT NULL, source TEXT NOT NULL, state TEXT NOT NULL, hash TEXT, nonce INTEGER, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, sent_at INTEGER)');
    t('CREATE INDEX IF NOT EXISTS op_payouts_state ON op_payouts(state)');
  }

  // ─── Escrow wallet ────────────────────────────────────────────────────────────
  private key(): Hex {
    const saved = this.store.one<{ value: string }>("SELECT value FROM op_secrets WHERE name='social_escrow_key'"); if (saved) return saved.value as Hex;
    this.store.run("INSERT OR IGNORE INTO op_secrets(name,value,created_at) VALUES ('social_escrow_key',?,?)", generatePrivateKey(), Date.now());
    return this.store.one<{ value: string }>("SELECT value FROM op_secrets WHERE name='social_escrow_key'")!.value as Hex;
  }
  /** Public address of the tip & rain escrow. Deposits go here; nothing else is ever sent from it but payouts. */
  get escrow(): Address { return privateKeyToAccount(this.key()).address; }
  private escrowWallet() { return createWalletClient({ account: privateKeyToAccount(this.key()), chain: robinhoodChain, transport: http(rpcUrl(this.runtime.env), { timeout: 20_000 }) }); }

  // ─── Users ────────────────────────────────────────────────────────────────────
  username(owner: string): string | null { return this.store.one<{ username: string }>('SELECT username FROM op_social WHERE owner=?', owner)?.username ?? null; }
  private requireUsername(owner: string): string { const name = this.username(owner); if (!name) throw new ApiError('USERNAME_REQUIRED', 409); return name; }
  private ownerOf(username: string): string { const row = this.store.one<{ owner: string }>('SELECT owner FROM op_social WHERE username_lower=?', username.toLowerCase().replace(/^@/, '')); if (!row) throw new ApiError('USER_NOT_FOUND', 404); return row.owner; }
  /** Public identities for a set of owners (username, avatar, X handle). */
  users(owners: (string | null)[]): Map<string, SocialUser> {
    const ids = [...new Set(owners.filter((o): o is string => Boolean(o)))]; const out = new Map<string, SocialUser>();
    for (let i = 0; i < ids.length; i += 80) {
      const part = ids.slice(i, i + 80);
      for (const r of this.store.all<{ owner: string; username: string; avatar: string | null; handle: string | null; xavatar: string | null }>(`SELECT s.owner,s.username,s.avatar,x.handle,x.avatar AS xavatar FROM op_social s LEFT JOIN op_x_identities x ON x.owner=s.owner WHERE s.owner IN (${part.map(() => '?').join(',')})`, ...part))
        out.set(r.owner, { username: r.username, avatar: r.avatar || r.xavatar || null, x: r.handle || null });
    }
    return out;
  }
  /** Wallet → username for every account wallet and linked wallet (so trades and claims show who made them). */
  private walletNames(): Map<string, SocialUser> {
    const rows = this.store.all<{ owner: string; wallet: string }>("SELECT owner,lower(wallet) AS wallet FROM op_profiles WHERE wallet IS NOT NULL UNION SELECT owner,wallet FROM op_linked_wallets");
    const users = this.users(rows.map(r => r.owner)); const out = new Map<string, SocialUser>();
    for (const r of rows) { const u = users.get(r.owner); if (u) out.set(r.wallet, u); }
    return out;
  }
  async me(owner: string, operator: boolean): Promise<Record<string, unknown>> {
    const x = await this.xIdentity(owner).catch(() => null);
    const row = this.store.one<{ username: string; bio: string; avatar: string | null; created_at: number }>('SELECT username,bio,avatar,created_at FROM op_social WHERE owner=?', owner);
    if (!this.accounts.wallets(owner).length) await this.defaultWallet(owner).catch(() => null);
    const unread = Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_notifications WHERE owner=? AND read=0', owner)?.n ?? 0);
    const pendingTips = Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_tips WHERE to_owner=? AND state='pending'", owner)?.n ?? 0);
    return { username: row?.username ?? null, bio: row?.bio ?? '', avatar: row?.avatar || x?.avatar || null, customAvatar: Boolean(row?.avatar), joinedAt: row?.created_at ?? null, x: x ? { handle: x.handle, avatar: x.avatar } : null, wallets: this.accounts.wallets(owner), unread, pendingTips, escrow: this.escrow.toLowerCase(), operator };
  }
  /** Sets (or changes) the account's unique public username and bio. */
  setProfile(owner: string, input: { username?: unknown; bio?: unknown }): { username: string; bio: string } {
    const current = this.store.one<{ username: string; bio: string }>('SELECT username,bio FROM op_social WHERE owner=?', owner);
    const username = typeof input.username === 'string' ? input.username.trim().replace(/^@/, '') : current?.username ?? '';
    const bio = typeof input.bio === 'string' ? input.bio.normalize('NFC').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160) : current?.bio ?? '';
    if (!USERNAME.test(username)) throw new ApiError('USERNAME_INVALID');
    if (RESERVED.has(username.toLowerCase()) || /^maker[-_]/i.test(username)) throw new ApiError('USERNAME_RESERVED', 409);
    const taken = this.store.one<{ owner: string }>('SELECT owner FROM op_social WHERE username_lower=?', username.toLowerCase());
    if (taken && taken.owner !== owner) throw new ApiError('USERNAME_TAKEN', 409);
    if (current && current.username !== username) this.store.rate(`username-change:${owner}`, 3, 86_400_000);
    const now = Date.now();
    this.store.run('INSERT INTO op_social(owner,username,username_lower,bio,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET username=excluded.username,username_lower=excluded.username_lower,bio=excluded.bio,updated_at=excluded.updated_at', owner, username, username.toLowerCase(), bio, now, now);
    this.store.run('UPDATE op_profiles SET alias=? WHERE owner=?', username, owner);
    if (!current) this.store.metric('username_created');
    return { username, bio };
  }
  /** Profile picture: a square-ish JPG/PNG, stored as a public artifact. */
  async setAvatar(owner: string, bytes: Uint8Array | null): Promise<{ avatar: string | null }> {
    this.requireUsername(owner);
    if (!bytes) { this.store.run('UPDATE op_social SET avatar=NULL,updated_at=? WHERE owner=?', Date.now(), owner); return { avatar: null }; }
    const icon = normalizeIcon(bytes); const hash = await sha256(icon.bytes); const key = `objectpad/v1/artifacts/${hash}`;
    await this.runtime.artifactBucket.put(key, icon.bytes, { httpMetadata: { contentType: icon.type } });
    this.store.run('INSERT OR IGNORE INTO op_artifacts(hash,storage_key,kind,bytes,public,session_id) VALUES (?,?,?,?,1,?)', hash, key, 'avatar', icon.bytes.byteLength, `avatar:${hash.slice(0, 16)}`);
    const url = `${this.runtime.apiOrigin}/api/artifacts/${hash}`;
    this.store.run('UPDATE op_social SET avatar=?,updated_at=? WHERE owner=?', url, Date.now(), owner);
    return { avatar: url };
  }
  /** @mention autocomplete: usernames starting with the query, recent chatters first when empty. */
  search(q: string): SocialUser[] {
    const s = q.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 20);
    const owners = s
      ? this.store.all<{ owner: string }>("SELECT owner FROM op_social WHERE username_lower LIKE ? ORDER BY length(username_lower), username_lower LIMIT 10", `${s}%`).map(r => r.owner)
      : this.store.all<{ owner: string }>('SELECT owner FROM op_chat WHERE owner IS NOT NULL AND hidden=0 GROUP BY owner ORDER BY MAX(seq) DESC LIMIT 10').map(r => r.owner);
    const users = this.users(owners); return owners.map(o => users.get(o)).filter((u): u is SocialUser => Boolean(u));
  }

  // ─── Coins helpers ────────────────────────────────────────────────────────────
  /** curve and token → { symbol, path } for every ObjectPad coin. */
  private coinIndex(): { byCurve: Map<string, { symbol: string; path: string; token: string }>; byToken: Map<string, { symbol: string; path: string; curve: string }> } {
    const byCurve = new Map<string, { symbol: string; path: string; token: string }>(); const byToken = new Map<string, { symbol: string; path: string; curve: string }>();
    for (const r of this.store.all<{ id: string; payload: string }>("SELECT id,payload FROM op_records WHERE state='confirmed'")) {
      try { const p = JSON.parse(r.payload) as { curve?: string; token?: string; symbol?: string }; if (p.curve && p.token && p.symbol) { byCurve.set(p.curve.toLowerCase(), { symbol: p.symbol, path: `/objects/${r.id}`, token: p.token.toLowerCase() }); byToken.set(p.token.toLowerCase(), { symbol: p.symbol, path: `/objects/${r.id}`, curve: p.curve.toLowerCase() }); } } catch { /* skip */ }
    }
    try {
      for (const r of this.store.all<{ id: string; token: string; curve: string }>("SELECT id,token,curve FROM op_house WHERE state='live' AND token IS NOT NULL AND curve IS NOT NULL")) {
        const spec = HOUSE_COINS.find(c => c.id === r.id); const symbol = spec?.ticker ?? r.id.toUpperCase(); const path = `/coin/${symbol.toLowerCase()}`;
        byCurve.set(r.curve.toLowerCase(), { symbol, path, token: r.token.toLowerCase() }); byToken.set(r.token.toLowerCase(), { symbol, path, curve: r.curve.toLowerCase() });
      }
    } catch { /* house table not created yet */ }
    return { byCurve, byToken };
  }
  private tokenAllowed(address: string): boolean { const a = address.toLowerCase(); return this.coinIndex().byToken.has(a) || a === (this.runtime.env.OBJECTPAD_TOKEN_ADDRESS ?? '').trim().toLowerCase(); }
  private async tokenMeta(address: string): Promise<{ symbol: string; decimals: number }> {
    const known = this.coinIndex().byToken.get(address.toLowerCase()); const client = serverClient(this.runtime.env);
    const [symbol, decimals] = await Promise.all([known ? Promise.resolve(known.symbol) : client.readContract({ address: address as Address, abi: TOKEN, functionName: 'symbol' }).catch(() => 'TOKEN'), client.readContract({ address: address as Address, abi: TOKEN, functionName: 'decimals' }).catch(() => 18)]);
    return { symbol: String(symbol).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'TOKEN', decimals: Number(decimals) };
  }
  /** Tokens (ObjectPad coins) a wallet holds, from the on-chain transfer index, with live prices. */
  async holdings(wallet: string): Promise<{ token: string; symbol: string; path: string; balance: string; priceEth: number }[]> {
    if (!validAddress(wallet)) throw new ApiError('WALLET_INVALID');
    const coins = await this.indexer.coins(new Map()).catch(() => []); const price = new Map(coins.map(c => [c.token.toLowerCase(), c.priceEth])); const idx = this.coinIndex().byToken;
    return this.store.all<{ token: string; balance: string }>("SELECT token,balance FROM op_idx_balances WHERE holder=? AND balance NOT LIKE '-%' AND balance<>'0'", wallet.toLowerCase())
      .map(r => ({ token: r.token, symbol: idx.get(r.token)?.symbol ?? 'COIN', path: idx.get(r.token)?.path ?? '/explore', balance: r.balance, priceEth: price.get(r.token) ?? 0 }))
      .sort((a, b) => Number(BigInt(b.balance) / 10n ** 12n) * b.priceEth - Number(BigInt(a.balance) / 10n ** 12n) * a.priceEth);
  }

  // ─── Profiles ─────────────────────────────────────────────────────────────────
  /** A public profile: identity, linked accounts, wallets, coins created, trade history and real P&L from on-chain trades. */
  async profile(username: string): Promise<Record<string, unknown>> {
    const owner = this.ownerOf(username); const user = this.users([owner]).get(owner)!;
    const row = this.store.one<{ bio: string; created_at: number }>('SELECT bio,created_at FROM op_social WHERE owner=?', owner)!;
    const wallets = this.accounts.wallets(owner); const addresses = wallets.map(w => w.address);
    const coins = await this.indexer.coins(new Map()).catch(() => []); const byCurve = new Map(coins.map(c => [c.curve.toLowerCase(), c]));
    const idx = this.coinIndex();
    const marks = addresses.map(() => '?').join(',');
    const trades = addresses.length ? this.store.all<{ curve: string; side: 'buy' | 'sell'; eth: number; tokens: number; hash: string; at: number; trader: string }>(`SELECT curve,side,eth,tokens,hash,at,trader FROM op_idx_trades WHERE trader IN (${marks}) ORDER BY block DESC, log_index DESC LIMIT 400`, ...addresses) : [];
    const per = new Map<string, { symbol: string; path: string; bought: number; sold: number; tokensIn: number; tokensOut: number }>();
    for (const t of trades) { const c = idx.byCurve.get(t.curve); const e = per.get(t.curve) ?? { symbol: c?.symbol ?? byCurve.get(t.curve)?.symbol ?? 'COIN', path: c?.path ?? '/explore', bought: 0, sold: 0, tokensIn: 0, tokensOut: 0 }; if (t.side === 'buy') { e.bought += t.eth; e.tokensIn += t.tokens; } else { e.sold += t.eth; e.tokensOut += t.tokens; } per.set(t.curve, e); }
    const positions = [...per.entries()].map(([curve, e]) => {
      const coin = byCurve.get(curve); const token = coin?.token.toLowerCase() ?? idx.byCurve.get(curve)?.token ?? '';
      const held = addresses.length && token ? this.store.all<{ balance: string }>(`SELECT balance FROM op_idx_balances WHERE token=? AND holder IN (${marks})`, token, ...addresses).reduce((s, r) => s + Math.max(0, Number(BigInt(r.balance) / 10n ** 9n) / 1e9), 0) : 0;
      const value = held * (coin?.priceEth ?? 0);
      return { curve, symbol: e.symbol, path: e.path, boughtEth: e.bought, soldEth: e.sold, holding: held, holdingEth: value, pnlEth: e.sold + value - e.bought };
    }).sort((a, b) => Math.abs(b.pnlEth) - Math.abs(a.pnlEth));
    const totals = positions.reduce((s, p) => ({ boughtEth: s.boughtEth + p.boughtEth, soldEth: s.soldEth + p.soldEth, holdingEth: s.holdingEth + p.holdingEth, pnlEth: s.pnlEth + p.pnlEth }), { boughtEth: 0, soldEth: 0, holdingEth: 0, pnlEth: 0 });
    const stats = { tipsReceived: Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_tips WHERE to_owner=? AND state='paid'", owner)?.n ?? 0), tipsSent: Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_tips WHERE from_owner=? AND state IN ('paid','pending','accepted')", owner)?.n ?? 0), rainsFunded: Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_rains WHERE owner=?', owner)?.n ?? 0), messages: Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_chat WHERE owner=? AND hidden=0', owner)?.n ?? 0) };
    return {
      ...user, bio: row.bio, joinedAt: row.created_at, wallets, stats, pnl: { ...totals, positions: positions.slice(0, 30) },
      coins: this.accounts.launches(owner, addresses).map(l => ({ ...l, priceEth: l.curve ? byCurve.get(l.curve.toLowerCase())?.priceEth ?? 0 : 0, marketCapEth: l.curve ? byCurve.get(l.curve.toLowerCase())?.marketCapEth ?? 0 : 0 })),
      trades: trades.slice(0, 60).map(t => ({ side: t.side, eth: t.eth, tokens: t.tokens, hash: t.hash, at: t.at, wallet: t.trader, symbol: idx.byCurve.get(t.curve)?.symbol ?? byCurve.get(t.curve)?.symbol ?? 'COIN', path: idx.byCurve.get(t.curve)?.path ?? '/explore' })),
    };
  }

  // ─── Notifications ────────────────────────────────────────────────────────────
  notify(owner: string, kind: string, actor: string | null, text: string, link: string | null, ref: string | null = null): void {
    this.store.run('INSERT INTO op_notifications(id,owner,kind,actor,text,link,ref,created_at) VALUES (?,?,?,?,?,?,?,?)', crypto.randomUUID(), owner, kind, actor, text.slice(0, 280), link, ref, Date.now());
  }
  notifications(owner: string): { items: Record<string, unknown>[]; unread: number } {
    const rows = this.store.all<{ id: string; kind: string; actor: string | null; text: string; link: string | null; ref: string | null; read: number; created_at: number }>('SELECT id,kind,actor,text,link,ref,read,created_at FROM op_notifications WHERE owner=? ORDER BY created_at DESC LIMIT 60', owner);
    const users = this.users(rows.map(r => r.actor));
    return { items: rows.map(r => ({ id: r.id, kind: r.kind, actor: r.actor ? users.get(r.actor) ?? null : null, text: r.text, link: r.link, ref: r.ref, read: Boolean(r.read), createdAt: r.created_at })), unread: rows.filter(r => !r.read).length };
  }
  markRead(owner: string, id?: string): void { if (id) this.store.run('UPDATE op_notifications SET read=1 WHERE owner=? AND id=?', owner, id); else this.store.run('UPDATE op_notifications SET read=1 WHERE owner=?', owner); }

  // ─── Chat ─────────────────────────────────────────────────────────────────────
  private postChat(owner: string | null, kind: 'text' | 'tip' | 'rain' | 'system', text: string, ref: string | null = null): number {
    this.store.run('INSERT INTO op_chat(id,owner,kind,text,ref,created_at) VALUES (?,?,?,?,?,?)', crypto.randomUUID(), owner, kind, text, ref, Date.now());
    return Number(this.store.one<{ seq: number }>('SELECT last_insert_rowid() AS seq')?.seq ?? 0);
  }
  /** Global chat: messages after `after` (or the latest 80), plus live state for every recent rain. */
  chat(after: number, viewer: string | null): Record<string, unknown> {
    const rows = after > 0
      ? this.store.all<{ seq: number; id: string; owner: string | null; kind: string; text: string; ref: string | null; created_at: number }>('SELECT seq,id,owner,kind,text,ref,created_at FROM op_chat WHERE seq>? AND hidden=0 ORDER BY seq ASC LIMIT 100', after)
      : this.store.all<{ seq: number; id: string; owner: string | null; kind: string; text: string; ref: string | null; created_at: number }>('SELECT * FROM (SELECT seq,id,owner,kind,text,ref,created_at FROM op_chat WHERE hidden=0 ORDER BY seq DESC LIMIT 80) ORDER BY seq ASC');
    const tips = new Map(rows.filter(r => r.kind === 'tip' && r.ref).map(r => [r.ref!, this.store.one<TipRow>('SELECT * FROM op_tips WHERE id=?', r.ref!)]));
    const users = this.users([...rows.map(r => r.owner), ...[...tips.values()].map(t => t?.to_owner ?? null)]);
    const hidden = after > 0 ? this.store.all<{ id: string }>('SELECT id FROM op_chat WHERE hidden=1 AND seq>? - 200', after).map(r => r.id) : [];
    return {
      items: rows.map(r => { const tip = r.ref ? tips.get(r.ref) : undefined; return { seq: r.seq, id: r.id, kind: r.kind, text: r.text, createdAt: r.created_at, user: r.owner ? users.get(r.owner) ?? null : null, ref: r.ref, tip: tip ? { amount: tip.amount, symbol: tip.symbol, decimals: tip.decimals, to: users.get(tip.to_owner) ?? null, state: tip.state } : null }; }),
      rains: this.rains(viewer), hidden, cursor: rows.length ? rows[rows.length - 1].seq : after,
    };
  }
  /** Posts a chat message. Mentions notify the tagged users; wallet addresses and outside links are refused (anti-scam). */
  sendChat(owner: string, raw: string): Record<string, unknown> {
    const username = this.requireUsername(owner);
    const text = raw.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/g, '').trim();
    if (!text || text.length > 400) throw new ApiError('MESSAGE_INVALID');
    this.store.rate(`chat:${owner}`, 6, 15_000); this.store.rate(`chat-hour:${owner}`, 240, 3_600_000);
    const known = this.coinIndex(); const ownToken = (this.runtime.env.OBJECTPAD_TOKEN_ADDRESS ?? '').trim().toLowerCase();
    for (const m of text.match(/0x[a-fA-F0-9]{40}/g) ?? []) { const a = m.toLowerCase(); if (!known.byToken.has(a) && !known.byCurve.has(a) && a !== ownToken) throw new ApiError('CHAT_ADDRESS_BLOCKED', 422); }
    for (const m of text.match(/\b(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:\/\S*)?/gi) ?? []) { const host = m.replace(/^https?:\/\//i, '').split('/')[0]; if (/\.[a-z]{2,}$/i.test(host) && /[a-z]/i.test(host.split('.').pop() ?? '') && !ALLOWED_HOSTS.test(host) && /^(?:https?:\/\/|www\.)|\.(?:com|io|xyz|app|net|org|gg|me|co|finance|fi|site|link|info|ly|to)(?:\/|$)/i.test(m)) throw new ApiError('CHAT_LINK_BLOCKED', 422); }
    const seq = this.postChat(owner, 'text', text);
    const tagged = [...new Set((text.match(/@([A-Za-z0-9_]{3,20})/g) ?? []).map(m => m.slice(1).toLowerCase()))].slice(0, 6);
    for (const name of tagged) { const row = this.store.one<{ owner: string }>('SELECT owner FROM op_social WHERE username_lower=?', name); if (row && row.owner !== owner) this.notify(row.owner, 'mention', owner, `@${username} mentioned you: ${text.slice(0, 140)}`, `/?chat=${seq}`, String(seq)); }
    this.store.metric('chat_message'); return { seq };
  }
  hide(id: string): void { this.store.run('UPDATE op_chat SET hidden=1 WHERE id=?', id); }

  // ─── Deposits ─────────────────────────────────────────────────────────────────
  /**
   * Reads a deposit back from Robinhood Chain: an ETH transfer (or an ObjectPad coin Transfer) into the escrow, sent from a
   * wallet this account has proven it controls. Each transaction can fund exactly one tip or rain.
   */
  private async deposit(owner: string, hash: string): Promise<{ asset: string; symbol: string; decimals: number; amount: bigint; from: string; key: string }> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new ApiError('HASH_INVALID');
    const key = hash.toLowerCase(); if (this.store.one('SELECT hash FROM op_social_deposits WHERE hash=?', key)) throw new ApiError('DEPOSIT_USED', 409);
    const client = serverClient(this.runtime.env);
    const receipt = await client.waitForTransactionReceipt({ hash: key as Hex, timeout: 45_000 }).catch(() => null); if (!receipt) throw new ApiError('TX_NOT_FOUND', 404);
    if (receipt.status !== 'success') throw new ApiError('TX_REVERTED', 409);
    const tx = await client.getTransaction({ hash: key as Hex });
    const escrow = this.escrow.toLowerCase(); const from = tx.from.toLowerCase();
    if (!this.accounts.wallets(owner).some(w => w.address === from)) throw new ApiError('DEPOSIT_NOT_YOURS', 409);
    if (tx.to?.toLowerCase() === escrow && tx.value > 0n) return { asset: 'eth', symbol: 'ETH', decimals: 18, amount: tx.value, from, key };
    const logs = parseEventLogs({ abi: [TRANSFER], logs: receipt.logs, eventName: 'Transfer' });
    const hit = logs.find(l => l.args.to.toLowerCase() === escrow && l.args.from.toLowerCase() === from && l.args.value > 0n && this.tokenAllowed(l.address));
    if (!hit) throw new ApiError('DEPOSIT_NOT_FOUND', 409);
    return { asset: hit.address.toLowerCase(), ...await this.tokenMeta(hit.address), amount: hit.args.value, from, key };
  }
  /** Claims a verified deposit synchronously (no await between the check and the insert, so it can never be used twice). */
  private claimDeposit(key: string, owner: string): void { if (this.store.one('SELECT hash FROM op_social_deposits WHERE hash=?', key)) throw new ApiError('DEPOSIT_USED', 409); this.store.run('INSERT INTO op_social_deposits(hash,owner,created_at) VALUES (?,?,?)', key, owner, Date.now()); }

  // ─── Tips ─────────────────────────────────────────────────────────────────────
  async createTip(owner: string, input: { to: string; hash: string; note: string; public: boolean }): Promise<Record<string, unknown>> {
    const from = this.requireUsername(owner); const to = this.ownerOf(input.to); if (to === owner) throw new ApiError('TIP_SELF', 409);
    const d = await this.deposit(owner, input.hash);
    const note = input.note.normalize('NFC').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140); const id = crypto.randomUUID();
    this.store.atomic(() => {
      this.claimDeposit(d.key, owner);
      this.store.run("INSERT INTO op_tips(id,from_owner,to_owner,asset,symbol,decimals,amount,fund_hash,from_wallet,state,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?)", id, owner, to, d.asset, d.symbol, d.decimals, d.amount.toString(), d.key, d.from, note, Date.now());
    });
    this.notify(to, 'tip_received', owner, `@${from} sent you a tip${note ? `: “${note}”` : ''}. Accept it to choose the wallet it lands in.`, '/notifications', id);
    if (input.public) this.postChat(owner, 'tip', note, id);
    this.store.metric('tip_created'); return this.tipView(id, owner);
  }
  private tipView(id: string, viewer: string): Record<string, unknown> {
    const t = this.store.one<TipRow>('SELECT * FROM op_tips WHERE id=?', id); if (!t) throw new ApiError('NOT_FOUND', 404);
    const users = this.users([t.from_owner, t.to_owner]);
    return { id: t.id, from: users.get(t.from_owner) ?? null, to: users.get(t.to_owner) ?? null, asset: t.asset, symbol: t.symbol, decimals: t.decimals, amount: t.amount, state: t.state, note: t.note, fundHash: t.fund_hash, payoutHash: t.payout_hash, toWallet: t.to_wallet, createdAt: t.created_at, decidedAt: t.decided_at, expiresAt: t.created_at + TIP_EXPIRY_MS, incoming: t.to_owner === viewer };
  }
  tips(owner: string): { incoming: Record<string, unknown>[]; outgoing: Record<string, unknown>[] } {
    const inc = this.store.all<{ id: string }>('SELECT id FROM op_tips WHERE to_owner=? ORDER BY created_at DESC LIMIT 50', owner).map(r => this.tipView(r.id, owner));
    const out = this.store.all<{ id: string }>('SELECT id FROM op_tips WHERE from_owner=? ORDER BY created_at DESC LIMIT 50', owner).map(r => this.tipView(r.id, owner));
    return { incoming: inc, outgoing: out };
  }
  /** Recipient accepts: the tip is paid out to whichever of their proven wallets they choose. */
  async acceptTip(owner: string, id: string, wallet: string): Promise<Record<string, unknown>> {
    const t = this.store.one<TipRow>('SELECT * FROM op_tips WHERE id=?', id); if (!t || t.to_owner !== owner) throw new ApiError('NOT_FOUND', 404);
    if (t.state !== 'pending') throw new ApiError('TIP_DECIDED', 409);
    if (!this.accounts.wallets(owner).length) await this.defaultWallet(owner).catch(() => null);
    const target = wallet.toLowerCase(); if (!this.accounts.wallets(owner).some(w => w.address === target)) throw new ApiError('WALLET_NOT_LINKED', 409);
    const fresh = this.store.one<TipRow>('SELECT * FROM op_tips WHERE id=?', id); if (fresh?.state !== 'pending') throw new ApiError('TIP_DECIDED', 409);
    this.store.atomic(() => { this.store.run("UPDATE op_tips SET state='accepted',to_wallet=?,decided_at=? WHERE id=?", target, Date.now(), id); this.queue('tip', id, owner, target, t.asset, t.amount, 'escrow'); });
    this.notify(t.from_owner, 'tip_accepted', owner, `@${this.username(owner) ?? 'someone'} accepted your tip. It is being sent now.`, '/notifications', id);
    return this.tipView(id, owner);
  }
  /** Recipient declines: the full amount goes back to the wallet that sent it. */
  declineTip(owner: string, id: string): Record<string, unknown> {
    const t = this.store.one<TipRow>('SELECT * FROM op_tips WHERE id=?', id); if (!t || t.to_owner !== owner) throw new ApiError('NOT_FOUND', 404);
    if (t.state !== 'pending') throw new ApiError('TIP_DECIDED', 409);
    this.store.atomic(() => { this.store.run("UPDATE op_tips SET state='declined',decided_at=? WHERE id=?", Date.now(), id); this.queue('tip_refund', id, t.from_owner, t.from_wallet, t.asset, t.amount, 'escrow'); });
    this.notify(t.from_owner, 'tip_declined', owner, `@${this.username(owner) ?? 'someone'} declined your tip. It is on its way back to your wallet.`, '/notifications', id);
    return this.tipView(id, owner);
  }
  /** Sender can take back a tip that hasn't been accepted yet. */
  cancelTip(owner: string, id: string): Record<string, unknown> {
    const t = this.store.one<TipRow>('SELECT * FROM op_tips WHERE id=?', id); if (!t || t.from_owner !== owner) throw new ApiError('NOT_FOUND', 404);
    if (t.state !== 'pending') throw new ApiError('TIP_DECIDED', 409);
    this.store.atomic(() => { this.store.run("UPDATE op_tips SET state='cancelled',decided_at=? WHERE id=?", Date.now(), id); this.queue('tip_refund', id, owner, t.from_wallet, t.asset, t.amount, 'escrow'); });
    return this.tipView(id, owner);
  }

  // ─── Rains ────────────────────────────────────────────────────────────────────
  async createRain(owner: string, input: { hash: string; slots: number; message: string }): Promise<Record<string, unknown>> {
    this.requireUsername(owner); if (!(RAIN_SLOTS as readonly number[]).includes(input.slots)) throw new ApiError('RAIN_SLOTS_INVALID');
    this.store.rate(`rain:${owner}`, 10, 86_400_000);
    const d = await this.deposit(owner, input.hash);
    if (d.asset === 'eth' && d.amount < MIN_RAIN_ETH) throw new ApiError('RAIN_TOO_SMALL', 422);
    if (d.amount < BigInt(input.slots)) throw new ApiError('RAIN_TOO_SMALL', 422);
    const id = crypto.randomUUID(); const message = input.message.normalize('NFC').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120); const now = Date.now();
    this.store.atomic(() => { this.claimDeposit(d.key, owner); this.store.run("INSERT INTO op_rains(id,owner,source,asset,symbol,decimals,amount,slots,fund_hash,fund_from,message,state,created_at,closes_at) VALUES (?,?,'escrow',?,?,?,?,?,?,?,?,'open',?,?)", id, owner, d.asset, d.symbol, d.decimals, d.amount.toString(), input.slots, d.key, d.from, message, now, now + RAIN_WINDOW_MS); });
    this.postChat(owner, 'rain', message, id); this.store.metric('rain_created');
    return this.rainView(id, owner);
  }
  /** Operator rain paid straight from the launch treasury. */
  async operatorRain(owner: string, input: { amountEth: string; slots: number; message: string }): Promise<Record<string, unknown>> {
    if (!(RAIN_SLOTS as readonly number[]).includes(input.slots)) throw new ApiError('RAIN_SLOTS_INVALID');
    let amount: bigint; try { amount = parseEther(input.amountEth); } catch { throw new ApiError('AMOUNT_INVALID'); }
    if (amount < MIN_RAIN_ETH || amount > parseEther('5')) throw new ApiError('AMOUNT_INVALID');
    const balance = await serverClient(this.runtime.env).getBalance({ address: this.sponsor.address });
    const committed = this.store.all<{ amount: string }>("SELECT amount FROM op_rains WHERE source='treasury' AND state='open'").reduce((s, r) => s + BigInt(r.amount), 0n) + this.store.all<{ amount: string }>("SELECT amount FROM op_payouts WHERE source='treasury' AND state='queued'").reduce((s, r) => s + BigInt(r.amount), 0n);
    if (balance < amount + committed + parseEther('0.002')) throw new ApiError('SPONSOR_EMPTY', 409);
    const id = crypto.randomUUID(); const now = Date.now(); const message = input.message.normalize('NFC').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
    this.store.run("INSERT INTO op_rains(id,owner,source,asset,symbol,decimals,amount,slots,message,state,created_at,closes_at) VALUES (?,NULL,'treasury','eth','ETH',18,?,?,?,'open',?,?)", id, amount.toString(), input.slots, message, now, now + RAIN_WINDOW_MS);
    this.postChat(null, 'rain', message, id); this.store.metric('rain_operator'); return this.rainView(id, owner);
  }
  private rainView(id: string, viewer: string | null): Record<string, unknown> {
    const r = this.store.one<RainRow>('SELECT * FROM op_rains WHERE id=?', id); if (!r) throw new ApiError('NOT_FOUND', 404);
    const entries = this.store.all<{ owner: string; share: string | null; payout_hash: string | null }>('SELECT owner,share,payout_hash FROM op_rain_entries WHERE rain_id=? ORDER BY joined_at', id);
    const users = this.users([r.owner, ...entries.slice(-12).map(e => e.owner)]); const mine = viewer ? entries.find(e => e.owner === viewer) : undefined;
    const paid = Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_payouts WHERE kind='rain' AND ref LIKE ? AND state='confirmed'", `${id}:%`)?.n ?? 0);
    return { id: r.id, by: r.owner ? users.get(r.owner) ?? null : null, source: r.source, asset: r.asset, symbol: r.symbol, decimals: r.decimals, amount: r.amount, slots: r.slots, joined: entries.length, recent: entries.slice(-12).map(e => users.get(e.owner)).filter(Boolean), state: r.state, message: r.message, createdAt: r.created_at, closesAt: r.closes_at, fundHash: r.fund_hash, you: Boolean(mine), yourShare: mine?.share ?? null, yourHash: mine?.payout_hash ?? null, paid, own: Boolean(viewer && viewer === r.owner) };
  }
  rains(viewer: string | null): Record<string, unknown>[] {
    return this.store.all<{ id: string }>("SELECT id FROM op_rains WHERE state IN ('open','distributing') OR created_at>? ORDER BY created_at DESC LIMIT 12", Date.now() - 6 * 3_600_000).map(r => this.rainView(r.id, viewer));
  }
  async joinRain(owner: string, id: string, visitor: string): Promise<Record<string, unknown>> {
    this.requireUsername(owner);
    let wallet = this.accounts.wallets(owner)[0]?.address ?? null; if (!wallet) { await this.defaultWallet(owner).catch(() => null); wallet = this.accounts.wallets(owner)[0]?.address ?? null; }
    if (!wallet) throw new ApiError('NO_WALLET', 409);
    this.store.atomic(() => {
      const r = this.store.one<RainRow>('SELECT * FROM op_rains WHERE id=?', id); if (!r) throw new ApiError('NOT_FOUND', 404);
      if (r.state !== 'open' || r.closes_at <= Date.now()) throw new ApiError('RAIN_CLOSED', 409);
      if (r.owner === owner) throw new ApiError('RAIN_OWN', 409);
      if (this.store.one('SELECT owner FROM op_rain_entries WHERE rain_id=? AND owner=?', id, owner)) throw new ApiError('RAIN_JOINED', 409);
      if (this.store.one('SELECT owner FROM op_rain_entries WHERE rain_id=? AND visitor=?', id, visitor)) throw new ApiError('RAIN_NETWORK_JOINED', 409);
      const n = Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_rain_entries WHERE rain_id=?', id)?.n ?? 0); if (n >= r.slots) throw new ApiError('RAIN_FULL', 409);
      this.store.run('INSERT INTO op_rain_entries(rain_id,owner,visitor,wallet,joined_at) VALUES (?,?,?,?,?)', id, owner, visitor, wallet!, Date.now());
      if (n + 1 >= r.slots) this.store.run('UPDATE op_rains SET closes_at=? WHERE id=?', Date.now(), id);
    });
    return this.rainView(id, owner);
  }
  /** Splits a closed rain evenly between everyone who joined (the remainder goes to the first in), or refunds an empty one. */
  private closeRain(r: RainRow): void {
    const entries = this.store.all<{ owner: string; wallet: string }>('SELECT owner,wallet FROM op_rain_entries WHERE rain_id=? ORDER BY joined_at', r.id);
    const amount = BigInt(r.amount);
    this.store.atomic(() => {
      if (!entries.length) {
        if (r.source === 'escrow' && r.fund_from) { this.queue('rain_refund', r.id, r.owner, r.fund_from, r.asset, r.amount, 'escrow'); this.store.run("UPDATE op_rains SET state='refunding' WHERE id=?", r.id); }
        else this.store.run("UPDATE op_rains SET state='expired' WHERE id=?", r.id);
        return;
      }
      const share = amount / BigInt(entries.length); const rest = amount - share * BigInt(entries.length);
      entries.forEach((e, i) => { const value = (i === 0 ? share + rest : share).toString(); this.store.run('UPDATE op_rain_entries SET share=? WHERE rain_id=? AND owner=?', value, r.id, e.owner); this.queue('rain', `${r.id}:${e.owner}`, e.owner, e.wallet, r.asset, value, r.source); });
      this.store.run("UPDATE op_rains SET state='distributing' WHERE id=?", r.id);
    });
    if (entries.length) this.postChat(null, 'system', `🌧 Rain is being distributed: ${entries.length} ${entries.length === 1 ? 'person' : 'people'} share it evenly.`, r.id);
    else if (r.owner) this.notify(r.owner, 'rain_refunded', null, 'Nobody joined your rain in time, so it is on its way back to your wallet.', '/notifications', r.id);
  }

  // ─── Payout engine ────────────────────────────────────────────────────────────
  private queue(kind: PayoutRow['kind'], ref: string, owner: string | null, to: string, asset: string, amount: string, source: 'escrow' | 'treasury'): void {
    this.store.run("INSERT INTO op_payouts(id,kind,ref,owner,to_wallet,asset,amount,source,state,created_at) VALUES (?,?,?,?,?,?,?,?,'queued',?)", crypto.randomUUID(), kind, ref, owner, to, asset, amount, source, Date.now());
  }
  /** ETH the escrow owes (held tips, open rains and queued payouts), so gas top-ups never spend anyone's funds. */
  private ethOwed(): bigint {
    const sum = (rows: { amount: string }[]) => rows.reduce((s, r) => s + BigInt(r.amount), 0n);
    return sum(this.store.all<{ amount: string }>("SELECT amount FROM op_tips WHERE asset='eth' AND state='pending'")) + sum(this.store.all<{ amount: string }>("SELECT amount FROM op_rains WHERE asset='eth' AND source='escrow' AND state='open'")) + sum(this.store.all<{ amount: string }>("SELECT amount FROM op_payouts WHERE asset='eth' AND source='escrow' AND state='queued'"));
  }
  private async escrowNonce(): Promise<number> {
    const client = serverClient(this.runtime.env); const address = this.escrow;
    const [pending, latest] = await Promise.all([client.getTransactionCount({ address, blockTag: 'pending' }), client.getTransactionCount({ address, blockTag: 'latest' })]);
    const last = this.store.one<{ value: number }>("SELECT value FROM op_scheduler WHERE name='escrow_nonce'")?.value; const at = this.store.one<{ value: number }>("SELECT value FROM op_scheduler WHERE name='escrow_nonce_at'")?.value ?? 0;
    const chain = Math.max(pending, latest); return last !== undefined && Date.now() - at < 120_000 ? Math.max(chain, Number(last) + 1) : chain;
  }
  private markEscrowNonce(nonce: number): void { this.store.run("INSERT INTO op_scheduler(name,value) VALUES ('escrow_nonce',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", nonce); this.store.run("INSERT INTO op_scheduler(name,value) VALUES ('escrow_nonce_at',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", Date.now()); }
  pending(): boolean { return Boolean(this.store.one("SELECT id FROM op_payouts WHERE state IN ('queued','sent') LIMIT 1") || this.store.one("SELECT id FROM op_rains WHERE state='open' LIMIT 1")); }
  /** Milliseconds until the social engine next needs to run, or null when idle. */
  nextDelay(): number | null {
    if (this.store.one("SELECT id FROM op_payouts WHERE state='queued' LIMIT 1")) return 2_000;
    if (this.store.one("SELECT id FROM op_payouts WHERE state='sent' LIMIT 1")) return 5_000;
    const close = this.store.one<{ at: number | null }>("SELECT MIN(closes_at) AS at FROM op_rains WHERE state='open'")?.at;
    const tip = this.store.one<{ at: number | null }>("SELECT MIN(created_at) AS at FROM op_tips WHERE state='pending'")?.at;
    const next = [close ?? null, tip ? tip + TIP_EXPIRY_MS : null].filter((v): v is number => v !== null).map(v => Math.max(1_500, Math.min(6 * 3_600_000, v - Date.now())));
    return next.length ? Math.min(...next) : null;
  }
  /** Closes due rains, expires old tips, confirms sent payouts and broadcasts queued ones. */
  async run(): Promise<void> {
    const now = Date.now();
    for (const r of this.store.all<RainRow>("SELECT * FROM op_rains WHERE state='open' AND closes_at<=?", now)) this.closeRain(r);
    for (const t of this.store.all<TipRow>("SELECT * FROM op_tips WHERE state='pending' AND created_at<?", now - TIP_EXPIRY_MS)) { this.store.atomic(() => { this.store.run("UPDATE op_tips SET state='expired',decided_at=? WHERE id=?", now, t.id); this.queue('tip_refund', t.id, t.from_owner, t.from_wallet, t.asset, t.amount, 'escrow'); }); }
    await this.confirm(); await this.broadcast();
  }
  private async confirm(): Promise<void> {
    const client = serverClient(this.runtime.env);
    for (const p of this.store.all<PayoutRow>("SELECT * FROM op_payouts WHERE state='sent' ORDER BY sent_at LIMIT 40")) {
      const receipt = await client.getTransactionReceipt({ hash: p.hash as Hex }).catch(() => null);
      if (!receipt) { if (Date.now() - (p.sent_at ?? 0) > 20 * 60_000) this.store.run("UPDATE op_payouts SET state='stuck' WHERE id=?", p.id); continue; }
      if (receipt.status !== 'success') { this.store.run(`UPDATE op_payouts SET state=${p.attempts >= 3 ? "'failed'" : "'queued'"},hash=NULL,nonce=NULL WHERE id=?`, p.id); continue; }
      this.store.run("UPDATE op_payouts SET state='confirmed' WHERE id=?", p.id); this.settled(p);
    }
  }
  private settled(p: PayoutRow): void {
    if (p.kind === 'tip' || p.kind === 'tip_refund') {
      const t = this.store.one<TipRow>('SELECT * FROM op_tips WHERE id=?', p.ref); if (!t) return;
      if (p.kind === 'tip') { this.store.run("UPDATE op_tips SET state='paid',payout_hash=? WHERE id=?", p.hash, t.id); this.notify(t.to_owner, 'tip_paid', t.from_owner, `Your tip from @${this.username(t.from_owner) ?? 'someone'} landed in your wallet.`, `https://robinhoodchain.blockscout.com/tx/${p.hash}`, t.id); this.notify(t.from_owner, 'tip_delivered', t.to_owner, `Your tip to @${this.username(t.to_owner) ?? 'someone'} was delivered on-chain.`, `https://robinhoodchain.blockscout.com/tx/${p.hash}`, t.id); }
      else { this.store.run("UPDATE op_tips SET state='refunded',payout_hash=? WHERE id=?", p.hash, t.id); this.notify(t.from_owner, 'tip_refunded', t.to_owner, 'Your tip was returned to your wallet.', `https://robinhoodchain.blockscout.com/tx/${p.hash}`, t.id); }
      return;
    }
    if (p.kind === 'rain_refund') { this.store.run("UPDATE op_rains SET state='refunded' WHERE id=?", p.ref); return; }
    const [rainId, owner] = [p.ref.slice(0, 36), p.ref.slice(37)];
    this.store.run('UPDATE op_rain_entries SET payout_hash=? WHERE rain_id=? AND owner=?', p.hash, rainId, owner);
    const r = this.store.one<RainRow>('SELECT * FROM op_rains WHERE id=?', rainId);
    if (owner && r) this.notify(owner, 'rain_won', r.owner, `You caught a rain${r.owner ? ` from @${this.username(r.owner) ?? 'someone'}` : ' from ObjectPad'}. Your share is in your wallet.`, `https://robinhoodchain.blockscout.com/tx/${p.hash}`, rainId);
    const open = this.store.one("SELECT id FROM op_payouts WHERE kind='rain' AND ref LIKE ? AND state NOT IN ('confirmed','failed')", `${rainId}:%`);
    if (!open && r?.state === 'distributing') { this.store.run("UPDATE op_rains SET state='done' WHERE id=?", rainId); this.postChat(null, 'system', `✅ Rain distributed on-chain to ${this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_rain_entries WHERE rain_id=?', rainId)?.n ?? 0} wallets.`, rainId); }
  }
  private async broadcast(): Promise<void> {
    const queued = this.store.all<PayoutRow>("SELECT * FROM op_payouts WHERE state='queued' ORDER BY created_at LIMIT 15"); if (!queued.length) return;
    const client = serverClient(this.runtime.env); const gasPrice = await client.getGasPrice();
    for (const source of ['escrow', 'treasury'] as const) {
      const list = queued.filter(p => p.source === source); if (!list.length) continue;
      const from = source === 'escrow' ? this.escrow : this.sponsor.address; const wallet = source === 'escrow' ? this.escrowWallet() : this.sponsor.wallet();
      const plans: { p: PayoutRow; to: Address; value: bigint; data: Hex | undefined; gas: bigint }[] = [];
      for (const p of list) {
        const eth = p.asset === 'eth'; const to = (eth ? p.to_wallet : p.asset) as Address; const value = eth ? BigInt(p.amount) : 0n;
        const data = eth ? undefined : encodeFunctionData({ abi: TOKEN, functionName: 'transfer', args: [p.to_wallet as Address, BigInt(p.amount)] });
        const est = await client.estimateGas({ account: from, to, value, data }).catch(() => (eth ? 60_000n : 140_000n));
        plans.push({ p, to, value, data, gas: est * 13n / 10n });
      }
      if (source === 'escrow') {
        const need = plans.reduce((s, x) => s + x.gas, 0n) * gasPrice * 2n; const balance = await client.getBalance({ address: from }); const free = balance - this.ethOwed();
        if (free < need) {
          const top = need * 4n - (free > 0n ? free : 0n); const nonce = await this.sponsor.nextNonce();
          const hash = await this.sponsor.wallet().sendTransaction({ to: from, value: top, nonce, chain: robinhoodChain }); this.sponsor.markNonce(nonce); this.sponsor.invalidate();
          await client.waitForTransactionReceipt({ hash, timeout: 45_000 }).catch(() => undefined); this.store.metric('escrow_gas_topup');
        }
      }
      let nonce = source === 'escrow' ? await this.escrowNonce() : await this.sponsor.nextNonce();
      for (const x of plans) {
        try {
          const hash = await wallet.sendTransaction({ to: x.to, value: x.value, data: x.data, gas: x.gas, nonce, chain: robinhoodChain });
          this.store.run("UPDATE op_payouts SET state='sent',hash=?,nonce=?,attempts=attempts+1,sent_at=? WHERE id=?", hash, nonce, Date.now(), x.p.id);
          if (source === 'escrow') this.markEscrowNonce(nonce); else this.sponsor.markNonce(nonce);
          nonce++;
        } catch (error) {
          console.warn('objectpad.social.payout', error instanceof Error ? error.message.slice(0, 160) : '');
          this.store.run(`UPDATE op_payouts SET attempts=attempts+1${x.p.attempts >= 4 ? ",state='failed'" : ''} WHERE id=?`, x.p.id);
          break;
        }
      }
      if (source === 'treasury') this.sponsor.invalidate();
    }
  }

  // ─── Live activity ────────────────────────────────────────────────────────────
  /** Everything happening on ObjectPad, newest first: trades with their fees, launches, burns, tips, rains and fee claims. */
  activity(limit = 80): Record<string, unknown>[] {
    const idx = this.coinIndex(); const names = this.walletNames(); const out: { at: number; [k: string]: unknown }[] = [];
    const feeRate = (CREATOR_TAX_BPS + PONS_PROTOCOL_FEE_BPS) / BPS;
    for (const t of this.indexer.recent(60)) { const c = idx.byCurve.get(t.curve); out.push({ id: `trade:${t.id}`, kind: t.side, at: t.at, symbol: c?.symbol ?? 'COIN', path: c?.path ?? '/explore', eth: t.eth, tokens: t.tokens, feeEth: t.eth * feeRate, wallet: t.trader, user: names.get(t.trader.toLowerCase()) ?? null, hash: t.hash }); }
    for (const l of this.store.all<{ record_id: string; token: string; tx_hash: string; confirmed_at: number }>('SELECT record_id,token,tx_hash,confirmed_at FROM op_launches ORDER BY confirmed_at DESC LIMIT 20')) { const c = idx.byToken.get(l.token); const owner = this.store.one<{ owner: string }>('SELECT owner FROM op_records WHERE id=?', l.record_id)?.owner ?? null; out.push({ id: `launch:${l.record_id}`, kind: 'launch', at: l.confirmed_at, symbol: c?.symbol ?? 'COIN', path: c?.path ?? `/objects/${l.record_id}`, user: owner ? this.users([owner]).get(owner) ?? null : null, hash: l.tx_hash }); }
    for (const b of this.burns.list(20)) if (b.state === 'confirmed') out.push({ id: `burn:${b.id}`, kind: 'burn', at: b.at, eth: Number(BigInt(b.ethIn) / 10n ** 9n) / 1e9, tokens: Number(BigInt(b.tokensBurned) / 10n ** 9n) / 1e9, symbol: 'OBJECTPAD', path: '/burn', hash: b.hash });
    const tips = this.store.all<TipRow>("SELECT * FROM op_tips WHERE state IN ('paid','pending','accepted') ORDER BY created_at DESC LIMIT 20"); const tu = this.users(tips.flatMap(t => [t.from_owner, t.to_owner]));
    for (const t of tips) out.push({ id: `tip:${t.id}`, kind: 'tip', at: t.created_at, amount: t.amount, decimals: t.decimals, symbol: t.symbol, user: tu.get(t.from_owner) ?? null, to: tu.get(t.to_owner) ?? null, state: t.state, hash: t.payout_hash ?? t.fund_hash });
    const rains = this.store.all<RainRow>('SELECT * FROM op_rains ORDER BY created_at DESC LIMIT 15'); const ru = this.users(rains.map(r => r.owner));
    for (const r of rains) out.push({ id: `rain:${r.id}`, kind: 'rain', at: r.created_at, amount: r.amount, decimals: r.decimals, symbol: r.symbol, slots: r.slots, state: r.state, user: r.owner ? ru.get(r.owner) ?? null : null, hash: r.fund_hash });
    for (const c of this.store.all<{ hash: string; wallet: string; owner: string; value_wei: string; at: number }>("SELECT hash,wallet,owner,value_wei,at FROM op_wallet_activity WHERE kind='claim' ORDER BY at DESC LIMIT 15")) out.push({ id: `claim:${c.hash}`, kind: 'claim', at: c.at, eth: Number(BigInt(c.value_wei) / 10n ** 9n) / 1e9, wallet: c.wallet, user: this.users([c.owner]).get(c.owner) ?? null, hash: c.hash });
    return out.sort((a, b) => b.at - a.at).slice(0, limit);
  }
}
