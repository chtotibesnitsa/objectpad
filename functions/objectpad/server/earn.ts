/**
 * ObjectPad Earn: rewards for verified X posts about $OBJECTPAD.
 *
 * Server-authoritative end to end. The X account comes from Privy's X OAuth link (immutable X user id, read with the app
 * secret), the post is fetched from the official X API, market data is validated against the exact contract on Robinhood
 * Chain, rewards are locked at approval, credited to an append-only ledger after a minimum live period, and claims are
 * idempotent treasury transfers reconciled against the chain. Nothing the browser sends is trusted except the post link.
 */
import { parseAbi, type Address, type Hex } from 'viem';
import { ApiError, sha256 } from '../shared/security';
import { robinhoodChain } from '../shared/pons';
import { serverClient } from './chain';
import type { Store } from './store';
import type { Runtime } from './types';
import type { SponsorService } from './sponsor';
import type { AccountService } from './accounts';

export const EARN_TOKEN = '0x520541d03dec790ce51746da2a495dafa62e87f8';
const HOUR = 3_600_000; const DAY = 24 * HOUR;
/** Published campaign rules. Changing these is a public rules change. */
export const EARN_RULES = { holdHours: 24, postMaxAgeDays: 7, minClaimUsd: 1, baselineUsd: 100_000, milestoneUsd: 100_000, minOwnChars: 25, reviewTwins: 3 } as const;
/** $1 base while market cap is at or below $100K. Every complete $100K above that adds another $1 (so $2 at $200K, $3 at $300K, ...). */
export const rewardCentsFor = (marketCapUsd: number): number => (1 + Math.floor(Math.max(0, marketCapUsd - EARN_RULES.baselineUsd) / EARN_RULES.milestoneUsd)) * 100;
const HIDDEN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/;
const TOKEN_ABI = parseAbi(['function totalSupply() view returns (uint256)']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_EVENTS = new Set(['earn_page_viewed', 'auth_started', 'auth_completed', 'post_draft_copied', 'post_link_pasted', 'proof_shared']);

export type CheckState = 'pass' | 'fail' | 'pending' | 'skip';
export interface EarnCheck { id: string; label: string; state: CheckState; detail: string; }
export interface EarnReason { code: string; message: string; fix: string; retryable: boolean; }
export interface XIdentity { id: string; handle: string; name: string; avatar: string; }
export interface EarnMarket { token: string; chain: 'robinhood'; chainId: 4663; source: 'DexScreener' | 'GeckoTerminal'; supply: number; pair: string; priceUsd: number; marketCapUsd: number; liquidityUsd: number; ethUsd: number | null; at: number; rewardUsd: number; nextRewardUsd: number; nextMilestoneUsd: number; remainingUsd: number; progress: number; }
interface Post { id: string; text: string; authorId: string; createdAt: number; handle: string; name: string; avatar: string; urls: string[]; reply: boolean; repost: boolean; media: { type: string; url: string }[]; metrics: Record<string, number> | null; }
interface SubRow { id: string; post_id: string; owner: string; x_user_id: string; handle: string; name: string; avatar: string; url: string; text: string; media: string; metrics: string | null; posted_at: number; content_hash: string; state: string; reasons: string; checks: string; reward_cents: number; reward_state: string; mcap_usd: number | null; price_usd: number | null; submitted_at: number; verified_at: number; approved_at: number | null; matures_at: number | null; }
interface ClaimRow { id: string; owner: string; idem: string; amount_cents: number; wallet: string; eth_usd: number; amount_wei: string; state: string; tx_hash: string | null; error: string | null; created_at: number; updated_at: number; }

const REASONS: Record<string, [string, string, boolean]> = {
  MISSING_CASHTAG: ['Missing: $ObjectPad', 'Publish a new post that includes the cashtag $ObjectPad.', false],
  WRONG_CONTRACT: ['Wrong or missing contract address', `Include the exact address ${EARN_TOKEN}.`, false],
  MISSING_WEBSITE: ['Website link not found', 'Add objectpad.fun to the post.', false],
  WRONG_AUTHOR: ['Post belongs to a different X account', 'Submit a post published by the X account connected to ObjectPad.', false],
  DAILY_LIMIT: ['Daily reward limit reached', 'Submit this post again when your 24-hour window resets.', true],
  DUPLICATE_CONTENT: ['Same text as one of your earlier posts', 'Write a new post in your own words.', false],
  POST_NOT_FOUND: ['Post could not be found on X', 'Check the link. Deleted posts can’t be verified.', true],
  POST_PROTECTED: ['Post is from a protected account', 'Make your posts public, then try again.', true],
  X_UNAVAILABLE: ['Post could not be verified through X right now', 'Nothing was lost. Try again in a minute.', true],
  MARKET_UNAVAILABLE: ['Live market data could not be confirmed', 'Nothing was lost. Try again in a minute.', true],
  REPLY: ['Replies aren’t eligible', 'Publish it as a standalone post, not a reply.', false],
  REPOST: ['Reposts aren’t eligible', 'Publish your own post.', false],
  HIDDEN_TEXT: ['Hidden characters found in the post', 'Post plain text without invisible characters.', false],
  TOO_OLD: ['Post is older than 7 days', 'Publish a fresh post.', false],
  BEFORE_CAMPAIGN: ['Posted before the campaign started', 'Publish a fresh post.', false],
  LOW_EFFORT: ['Add a sentence in your own words', `Posts need at least ${EARN_RULES.minOwnChars} characters of your own text besides the required items.`, false],
  BUDGET_REACHED: ['Campaign budget is used up for now', 'Your post is saved. Try again when the budget is topped up.', true],
  MANUAL_REVIEW: ['Submission requires manual review', 'A reviewer will check it. Your place and reward rate are saved.', false],
};
const reason = (code: string): EarnReason => { const [message, fix, retryable] = REASONS[code] ?? ['Verification failed', 'Try again.', true]; return { code, message, fix, retryable }; };

/** Extracts the canonical X post id from any supported x.com / twitter.com status URL. */
export function canonicalPostId(raw: string): string | null {
  let url: URL; try { url = new URL(raw.trim()); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|mobile\.|m\.)/, '');
  if (!['x.com', 'twitter.com'].includes(host)) return null;
  return url.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}\/status(?:es)?|i\/web\/status|i\/status)\/(\d{5,25})(?:\/|$)/)?.[1] ?? null;
}
/** The post text minus everything the campaign requires, so "own words" and duplicate checks look at what the person wrote. */
export function ownWords(text: string): string {
  return text.normalize('NFKC').replace(/https?:\/\/\S+/gi, ' ').replace(/\$objectpad\b/gi, ' ').replace(new RegExp(EARN_TOKEN, 'gi'), ' ').replace(/(www\.)?objectpad\.fun\S*/gi, ' ')
    .replace(/sponsored by objectpad|paid objectpad post/gi, ' ').replace(/[#@$][\p{L}\p{N}_]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export class EarnService {
  private marketCache: EarnMarket | null = null; private supply: number | null = null; private eth: { at: number; value: number | null } | null = null;
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly sponsor: SponsorService, private readonly accounts: AccountService) {
    const t = (sql: string) => store.run(sql);
    t('CREATE TABLE IF NOT EXISTS op_earn_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    t('CREATE TABLE IF NOT EXISTS op_x_identities (x_user_id TEXT PRIMARY KEY, owner TEXT NOT NULL UNIQUE, handle TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL, linked_at INTEGER NOT NULL, synced_at INTEGER NOT NULL)');
    t("CREATE TABLE IF NOT EXISTS op_earn_submissions (id TEXT PRIMARY KEY, post_id TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, x_user_id TEXT NOT NULL, handle TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL, url TEXT NOT NULL, text TEXT NOT NULL, media TEXT NOT NULL, metrics TEXT, posted_at INTEGER NOT NULL, content_hash TEXT NOT NULL, state TEXT NOT NULL, reasons TEXT NOT NULL, checks TEXT NOT NULL, reward_cents INTEGER NOT NULL DEFAULT 0, reward_state TEXT NOT NULL DEFAULT 'none', mcap_usd REAL, price_usd REAL, submitted_at INTEGER NOT NULL, verified_at INTEGER NOT NULL, approved_at INTEGER, matures_at INTEGER)");
    t('CREATE INDEX IF NOT EXISTS op_earn_sub_x ON op_earn_submissions(x_user_id, state, approved_at)');
    t('CREATE INDEX IF NOT EXISTS op_earn_sub_owner ON op_earn_submissions(owner, submitted_at)');
    t('CREATE INDEX IF NOT EXISTS op_earn_sub_state ON op_earn_submissions(state, submitted_at)');
    t('CREATE INDEX IF NOT EXISTS op_earn_sub_hash ON op_earn_submissions(content_hash)');
    // Money moves only through this append-only ledger; UNIQUE(kind, ref) makes every credit/debit happen at most once.
    t('CREATE TABLE IF NOT EXISTS op_earn_ledger (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, amount_cents INTEGER NOT NULL, ref TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(kind, ref))');
    t('CREATE INDEX IF NOT EXISTS op_earn_ledger_owner ON op_earn_ledger(owner)');
    t("CREATE TRIGGER IF NOT EXISTS op_earn_ledger_no_update BEFORE UPDATE ON op_earn_ledger BEGIN SELECT RAISE(ABORT, 'append-only ledger'); END");
    t("CREATE TRIGGER IF NOT EXISTS op_earn_ledger_no_delete BEFORE DELETE ON op_earn_ledger BEGIN SELECT RAISE(ABORT, 'append-only ledger'); END");
    t('CREATE TABLE IF NOT EXISTS op_earn_claims (id TEXT PRIMARY KEY, owner TEXT NOT NULL, idem TEXT NOT NULL UNIQUE, amount_cents INTEGER NOT NULL, wallet TEXT NOT NULL, eth_usd REAL NOT NULL, amount_wei TEXT NOT NULL, state TEXT NOT NULL, tx_hash TEXT UNIQUE, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    t('CREATE INDEX IF NOT EXISTS op_earn_claims_owner ON op_earn_claims(owner, created_at)');
    t('CREATE TABLE IF NOT EXISTS op_earn_audit (id TEXT PRIMARY KEY, ref TEXT NOT NULL, owner TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, at INTEGER NOT NULL)');
    t('CREATE INDEX IF NOT EXISTS op_earn_audit_ref ON op_earn_audit(ref, at)');
    t("CREATE TRIGGER IF NOT EXISTS op_earn_audit_no_update BEFORE UPDATE ON op_earn_audit BEGIN SELECT RAISE(ABORT, 'append-only audit'); END");
    t("CREATE TRIGGER IF NOT EXISTS op_earn_audit_no_delete BEFORE DELETE ON op_earn_audit BEGIN SELECT RAISE(ABORT, 'append-only audit'); END");
    t('CREATE TABLE IF NOT EXISTS op_earn_blocks (subject TEXT PRIMARY KEY, reason TEXT NOT NULL, at INTEGER NOT NULL)');
    store.run("INSERT OR IGNORE INTO op_earn_settings(key,value) VALUES ('campaign_start',?)", String(Date.now()));
  }

  // ---------------------------------------------------------------- settings & audit
  settings(): { submissions: boolean; payouts: boolean; budgetUsd: number; dailyMax: number; campaignStart: number } {
    const map = new Map(this.store.all<{ key: string; value: string }>('SELECT key,value FROM op_earn_settings').map(r => [r.key, r.value]));
    const num = (key: string, fallback: number) => { const v = Number(map.get(key)); return map.has(key) && Number.isFinite(v) && v >= 0 ? v : fallback; };
    return { submissions: map.get('submissions') !== 'off', payouts: map.get('payouts') !== 'off' && this.runtime.env.OBJECTPAD_EARN_PAYOUTS !== 'false', budgetUsd: num('budget_usd', 500), dailyMax: Math.max(1, Math.floor(num('daily_max', 5))), campaignStart: num('campaign_start', Date.now()) };
  }
  updateSettings(input: Record<string, unknown>): ReturnType<EarnService['settings']> {
    const set = (key: string, value: string) => this.store.run('INSERT INTO op_earn_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
    if (typeof input.submissions === 'boolean') set('submissions', input.submissions ? 'on' : 'off');
    if (typeof input.payouts === 'boolean') set('payouts', input.payouts ? 'on' : 'off');
    if (typeof input.budgetUsd === 'number' && Number.isFinite(input.budgetUsd) && input.budgetUsd >= 0 && input.budgetUsd <= 1_000_000) set('budget_usd', String(Math.floor(input.budgetUsd)));
    if (typeof input.dailyMax === 'number' && Number.isInteger(input.dailyMax) && input.dailyMax >= 1 && input.dailyMax <= 50) set('daily_max', String(input.dailyMax));
    return this.settings();
  }
  private audit(ref: string, owner: string, event: string, detail: string): void { this.store.run('INSERT INTO op_earn_audit(id,ref,owner,event,detail,at) VALUES (?,?,?,?,?,?)', crypto.randomUUID(), ref, owner, event, detail.slice(0, 500), Date.now()); }
  private blocked(...subjects: string[]): boolean { return subjects.some(s => Boolean(this.store.one('SELECT subject FROM op_earn_blocks WHERE subject=?', s.toLowerCase()))); }
  block(subject: string, on: boolean, why: string): void { const s = subject.trim().toLowerCase(); if (!s || s.length > 200) throw new ApiError('INVALID_INPUT'); if (on) this.store.run('INSERT OR REPLACE INTO op_earn_blocks(subject,reason,at) VALUES (?,?,?)', s, why.slice(0, 300), Date.now()); else this.store.run('DELETE FROM op_earn_blocks WHERE subject=?', s); }
  track(name: string): void { if (CLIENT_EVENTS.has(name)) this.store.metric(name); }

  // ---------------------------------------------------------------- market
  private async ethUsd(): Promise<number | null> {
    if (this.eth && Date.now() - this.eth.at < 60_000) return this.eth.value;
    try { const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', { signal: AbortSignal.timeout(6000) }); const d = await r.json() as { data?: { amount?: string } }; const v = Number(d.data?.amount); this.eth = { at: Date.now(), value: Number.isFinite(v) && v > 100 && v < 100_000 ? v : null }; }
    catch { this.eth = { at: Date.now(), value: null }; }
    return this.eth.value;
  }
  private static readonly HEADERS = { Accept: 'application/json', 'User-Agent': 'ObjectPad-Earn/1.0 (+https://objectpad.fun/earn)' };
  /** DexScreener: the deepest Robinhood Chain pair whose base token is exactly $OBJECTPAD. */
  private async fromDexScreener(): Promise<{ source: EarnMarket['source']; pair: string; priceUsd: number; reportedCap: number | null; liquidityUsd: number }> {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${EARN_TOKEN}`, { headers: EarnService.HEADERS, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`dexscreener ${response.status}`);
    const data = await response.json() as { pairs?: { chainId?: string; pairAddress?: string; baseToken?: { address?: string }; priceUsd?: string; marketCap?: number; liquidity?: { usd?: number } }[] | null };
    const best = (data.pairs ?? []).filter(p => p.chainId === 'robinhood' && p.baseToken?.address?.toLowerCase() === EARN_TOKEN && Number(p.priceUsd) > 0).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (!best?.pairAddress) throw new Error('dexscreener: no validated pair');
    return { source: 'DexScreener', pair: best.pairAddress, priceUsd: Number(best.priceUsd), reportedCap: Number(best.marketCap) > 0 ? Number(best.marketCap) : null, liquidityUsd: best.liquidity?.usd ?? 0 };
  }
  /** GeckoTerminal: the exact token on the robinhood network (address checked in the response). */
  private async fromGecko(): Promise<{ source: EarnMarket['source']; pair: string; priceUsd: number; reportedCap: number | null; liquidityUsd: number }> {
    const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${EARN_TOKEN}`, { headers: EarnService.HEADERS, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`geckoterminal ${response.status}`);
    const data = await response.json() as { data?: { id?: string; attributes?: { address?: string; price_usd?: string; fdv_usd?: string; market_cap_usd?: string | null; total_reserve_in_usd?: string }; relationships?: { top_pools?: { data?: { id?: string }[] } } } };
    const a = data.data?.attributes; if (a?.address?.toLowerCase() !== EARN_TOKEN || !(Number(a.price_usd) > 0)) throw new Error('geckoterminal: token mismatch');
    const cap = Number(a.market_cap_usd) > 0 ? Number(a.market_cap_usd) : Number(a.fdv_usd) > 0 ? Number(a.fdv_usd) : null;
    return { source: 'GeckoTerminal', pair: (data.data?.relationships?.top_pools?.data?.[0]?.id ?? '').replace(/^robinhood_/, ''), priceUsd: Number(a.price_usd), reportedCap: cap, liquidityUsd: Number(a.total_reserve_in_usd) || 0 };
  }
  private async readMarket(): Promise<EarnMarket> {
    let quote: Awaited<ReturnType<EarnService['fromDexScreener']>> | null = null; const errors: string[] = [];
    for (const source of [() => this.fromDexScreener(), () => this.fromGecko()]) { try { quote = await source(); break; } catch (error) { errors.push(error instanceof Error ? error.message.slice(0, 80) : 'failed'); } }
    if (!quote) throw new Error(errors.join(' | '));
    if (this.supply === null) { const raw = await serverClient(this.runtime.env).readContract({ address: EARN_TOKEN as Address, abi: TOKEN_ABI, functionName: 'totalSupply' }); this.supply = Number(raw / 10n ** 18n); }
    if (!(this.supply > 0)) throw new Error('supply unavailable');
    // Market cap = live price × on-chain total supply of the exact contract. A reported cap that disagrees by >15% blocks display.
    const priceUsd = quote.priceUsd; const marketCapUsd = priceUsd * this.supply;
    if (quote.reportedCap && Math.abs(marketCapUsd - quote.reportedCap) / quote.reportedCap > 0.15) throw new Error(`${quote.source}: cap mismatch`);
    const best = { pairAddress: quote.pair, liquidity: { usd: quote.liquidityUsd } };
    // Reward growth only counts market cap above the $100K baseline: flat $1 up to $100K, then +$1 per complete $100K after.
    const adjusted = Math.max(0, marketCapUsd - EARN_RULES.baselineUsd);
    const reward = rewardCentsFor(marketCapUsd) / 100; const nextMilestone = EARN_RULES.baselineUsd + (Math.floor(adjusted / EARN_RULES.milestoneUsd) + 1) * EARN_RULES.milestoneUsd;
    return { token: EARN_TOKEN, chain: 'robinhood', chainId: 4663, source: quote.source, supply: this.supply, pair: best.pairAddress, priceUsd, marketCapUsd, liquidityUsd: best.liquidity?.usd ?? 0, ethUsd: await this.ethUsd(), at: Date.now(), rewardUsd: reward, nextRewardUsd: reward + 1, nextMilestoneUsd: nextMilestone, remainingUsd: nextMilestone - marketCapUsd, progress: (adjusted % EARN_RULES.milestoneUsd) / EARN_RULES.milestoneUsd };
  }
  /**
   * Validated live market. Display may use a snapshot up to 10 minutes old (its timestamp is always shown); reward
   * calculation (`fresh`) only accepts a snapshot read within the last minute. Never substitutes another token.
   */
  async market(fresh = false): Promise<EarnMarket> {
    if (this.marketCache && Date.now() - this.marketCache.at < (fresh ? 60_000 : 30_000)) return this.marketCache;
    try { this.marketCache = await this.readMarket(); this.store.run("INSERT INTO op_earn_settings(key,value) VALUES ('market',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(this.marketCache)); return this.marketCache; }
    catch (error) {
      console.warn('objectpad.earn.market', error instanceof Error ? error.message.slice(0, 160) : '');
      if (!fresh) { const saved = this.marketCache ?? (() => { const raw = this.store.one<{ value: string }>("SELECT value FROM op_earn_settings WHERE key='market'")?.value; return raw ? JSON.parse(raw) as EarnMarket : null; })(); if (saved && Date.now() - saved.at < 10 * 60_000) return saved; }
      throw new ApiError('MARKET_UNAVAILABLE', 503);
    }
  }

  // ---------------------------------------------------------------- X identity & posts
  /**
   * The account's X identity, read server-side from Privy's verified X OAuth link. One X account per ObjectPad account and
   * one ObjectPad account per X account, forever, keyed by the immutable X user id (handles are display only).
   */
  async xIdentity(owner: string): Promise<XIdentity | null> {
    const row = this.store.one<{ x_user_id: string; handle: string; name: string; avatar: string; synced_at: number }>('SELECT x_user_id,handle,name,avatar,synced_at FROM op_x_identities WHERE owner=?', owner);
    if (row && Date.now() - row.synced_at < 5 * 60_000) return { id: row.x_user_id, handle: row.handle, name: row.name, avatar: row.avatar };
    const secret = (this.runtime.env.OBJECTPAD_PRIVY_APP_SECRET || this.runtime.env.PRIVY_APP_SECRET || '').trim();
    if (!secret || !this.runtime.privyAppId || !owner.startsWith('did:privy:')) return null;
    const response = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(owner)}`, { headers: { Authorization: `Basic ${btoa(`${this.runtime.privyAppId}:${secret}`)}`, 'privy-app-id': this.runtime.privyAppId }, signal: AbortSignal.timeout(8000), redirect: 'manual' }).catch(() => null);
    if (!response?.ok) { if (row) return { id: row.x_user_id, handle: row.handle, name: row.name, avatar: row.avatar }; throw new ApiError('AUTH_UNAVAILABLE', 503); }
    const user = await response.json() as { linked_accounts?: { type?: string; subject?: string; username?: string | null; name?: string | null; profile_picture_url?: string | null }[] };
    const x = (user.linked_accounts ?? []).find(a => a.type === 'twitter_oauth' && typeof a.subject === 'string' && /^\d{1,25}$/.test(a.subject));
    if (!x?.subject) return null;
    const handle = (x.username ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 15); const name = (x.name ?? handle).replace(/[\u0000-\u001f]/g, '').slice(0, 60); const avatar = /^https:\/\/pbs\.twimg\.com\//.test(x.profile_picture_url ?? '') ? x.profile_picture_url! : '';
    const bound = this.store.one<{ owner: string }>('SELECT owner FROM op_x_identities WHERE x_user_id=?', x.subject);
    if (bound && bound.owner !== owner) throw new ApiError('X_LINKED_ELSEWHERE', 409);
    if (row && row.x_user_id !== x.subject) throw new ApiError('X_ACCOUNT_LOCKED', 409);
    this.store.run('INSERT INTO op_x_identities(x_user_id,owner,handle,name,avatar,linked_at,synced_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(x_user_id) DO UPDATE SET handle=excluded.handle,name=excluded.name,avatar=excluded.avatar,synced_at=excluded.synced_at', x.subject, owner, handle, name, avatar, Date.now(), Date.now());
    if (!row) this.audit(x.subject, owner, 'x_linked', `Linked @${handle}`);
    return { id: x.subject, handle, name, avatar };
  }
  /** One post from the official X API v2 (app bearer token, server-side only). */
  private async fetchPost(id: string): Promise<Post> {
    const bearer = (this.runtime.env.X_API_BEARER_TOKEN ?? '').trim(); if (!bearer) throw new ApiError('X_UNAVAILABLE', 503);
    const url = `https://api.x.com/2/tweets/${id}?tweet.fields=created_at,public_metrics,note_tweet,entities,referenced_tweets,author_id&expansions=author_id,attachments.media_keys&user.fields=username,name,profile_image_url,protected&media.fields=type,url,preview_image_url`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!response) throw new ApiError('X_UNAVAILABLE', 503);
    if (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403) { console.warn('objectpad.earn.x', response.status); throw new ApiError('X_UNAVAILABLE', 503); }
    const data = await response.json() as { data?: { id: string; text: string; author_id: string; created_at: string; note_tweet?: { text?: string }; public_metrics?: Record<string, number>; entities?: { urls?: { expanded_url?: string; unwound_url?: string }[] }; referenced_tweets?: { type: string }[] }; includes?: { users?: { id: string; username: string; name: string; profile_image_url?: string; protected?: boolean }[]; media?: { type: string; url?: string; preview_image_url?: string }[] }; errors?: { title?: string; type?: string }[] };
    if (!data.data) { const title = data.errors?.[0]?.title ?? ''; throw new ApiError(/authoriz/i.test(title) ? 'POST_PROTECTED' : /not found/i.test(title) || response.status === 404 ? 'POST_NOT_FOUND' : 'X_UNAVAILABLE', 404); }
    const t = data.data; const author = data.includes?.users?.find(u => u.id === t.author_id);
    if (author?.protected) throw new ApiError('POST_PROTECTED', 403);
    const refs = t.referenced_tweets ?? [];
    return { id: t.id, text: (t.note_tweet?.text || t.text || '').slice(0, 4000), authorId: t.author_id, createdAt: Date.parse(t.created_at) || 0, handle: author?.username ?? '', name: author?.name ?? '', avatar: author?.profile_image_url?.replace('_normal', '_bigger') ?? '', urls: (t.entities?.urls ?? []).map(u => u.unwound_url || u.expanded_url || '').filter(Boolean), reply: refs.some(r => r.type === 'replied_to'), repost: refs.some(r => r.type === 'retweeted'), media: (data.includes?.media ?? []).map(m => ({ type: m.type, url: m.url || m.preview_image_url || '' })).filter(m => /^https:\/\/pbs\.twimg\.com\//.test(m.url)).slice(0, 4), metrics: t.public_metrics ?? null };
  }

  // ---------------------------------------------------------------- submissions
  private row(postId: string): SubRow | undefined { return this.store.one<SubRow>('SELECT * FROM op_earn_submissions WHERE post_id=?', postId); }
  private usedToday(xId: string, now = Date.now()): { used: number; oldest: number | null } {
    const r = this.store.one<{ n: number; oldest: number | null }>("SELECT COUNT(*) AS n, MIN(COALESCE(approved_at,submitted_at)) AS oldest FROM op_earn_submissions WHERE x_user_id=? AND state IN ('approved','pending_review') AND COALESCE(approved_at,submitted_at)>?", xId, now - DAY);
    return { used: Number(r?.n ?? 0), oldest: r?.oldest ?? null };
  }
  private spentCents(): number { return Number(this.store.one<{ s: number }>("SELECT COALESCE(SUM(reward_cents),0) AS s FROM op_earn_submissions WHERE state IN ('approved','pending_review') AND reward_state<>'reversed'")?.s ?? 0); }
  view(row: SubRow, audit = false): Record<string, unknown> {
    return { id: row.id, postId: row.post_id, url: row.url, handle: row.handle, name: row.name, avatar: row.avatar, text: row.text, media: JSON.parse(row.media), metrics: row.metrics ? JSON.parse(row.metrics) : null, postedAt: row.posted_at, state: row.state, reasons: JSON.parse(row.reasons), checks: JSON.parse(row.checks), rewardUsd: row.reward_cents / 100, rewardState: row.reward_state, marketCapUsd: row.mcap_usd, priceUsd: row.price_usd, tier: row.reward_cents ? row.reward_cents / 100 : null, submittedAt: row.submitted_at, verifiedAt: row.verified_at, approvedAt: row.approved_at, maturesAt: row.matures_at,
      ...(audit ? { audit: this.store.all<{ event: string; detail: string; at: number }>('SELECT event,detail,at FROM op_earn_audit WHERE ref=? ORDER BY at', row.id) } : {}) };
  }
  /** Verifies one X post end to end and records the outcome (approved, rejected, pending review or temporary error). */
  async submit(owner: string, rawUrl: string): Promise<{ submission: Record<string, unknown>; already: boolean }> {
    const settings = this.settings(); if (!settings.submissions) throw new ApiError('SUBMISSIONS_PAUSED', 503);
    const postId = canonicalPostId(rawUrl); if (!postId) throw new ApiError('URL_INVALID');
    const x = await this.xIdentity(owner); if (!x) throw new ApiError('X_NOT_LINKED', 409);
    if (this.blocked(owner, `x:${x.id}`)) throw new ApiError('ACCOUNT_REVIEW', 403);
    const existing = this.row(postId);
    if (existing && existing.owner !== owner) throw new ApiError('POST_TAKEN', 409);
    if (existing && ['approved', 'pending_review'].includes(existing.state)) return { submission: this.view(existing, true), already: true };
    this.store.rate(`earn-submit:${owner}`, 20, HOUR); this.store.rate(`earn-submit-x:${x.id}`, 20, HOUR);
    this.store.metric('submission_started');
    const now = Date.now(); const checks: EarnCheck[] = []; const reasons: EarnReason[] = []; let temporary = false;
    const add = (id: string, label: string, ok: boolean, detail: string, code: string) => { checks.push({ id, label, state: ok ? 'pass' : 'fail', detail }); if (!ok) reasons.push(reason(code)); };
    let post: Post | null = null;
    try { post = await this.fetchPost(postId); checks.push({ id: 'fetch', label: 'Fetching authoritative X post', state: 'pass', detail: 'Read directly from the X API' }); }
    catch (error) {
      const code = error instanceof ApiError ? error.code : 'X_UNAVAILABLE';
      if (code === 'POST_NOT_FOUND' || code === 'POST_PROTECTED') add('fetch', 'Fetching authoritative X post', false, reason(code).message, code);
      else { temporary = true; checks.push({ id: 'fetch', label: 'Fetching authoritative X post', state: 'pending', detail: 'X did not answer in time' }); reasons.push(reason('X_UNAVAILABLE')); }
    }
    let hash = ''; let review = false; let rewardCents = 0; let market: EarnMarket | null = null;
    if (post) {
      const text = post.text.normalize('NFKC'); const lower = text.toLowerCase();
      add('author', 'Confirming post author', post.authorId === x.id, post.authorId === x.id ? `@${post.handle} is your connected X account` : `Posted by @${post.handle}, not @${x.handle}`, 'WRONG_AUTHOR');
      add('cashtag', 'Checking $ObjectPad', /\$objectpad\b/i.test(text), /\$objectpad\b/i.test(text) ? '$ObjectPad found' : '$ObjectPad not found', 'MISSING_CASHTAG');
      add('contract', 'Checking contract address', lower.includes(EARN_TOKEN), lower.includes(EARN_TOKEN) ? 'Exact contract address found' : 'Exact contract address not found', 'WRONG_CONTRACT');
      const site = post.urls.some(u => { try { return ['objectpad.fun', 'www.objectpad.fun'].includes(new URL(u).hostname.toLowerCase()); } catch { return false; } }) || /(^|[^a-z0-9.-])(www\.)?objectpad\.fun\b/i.test(text);
      add('website', 'Checking objectpad.fun', site, site ? 'Link resolves to objectpad.fun' : 'objectpad.fun not found', 'MISSING_WEBSITE');
      const { used } = this.usedToday(x.id, now);
      add('allowance', 'Checking daily allowance', used < settings.dailyMax, `${used} of ${settings.dailyMax} rewarded posts used in the last 24h`, 'DAILY_LIMIT');
      const own = ownWords(text); hash = await sha256(own.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
      const self = this.store.one("SELECT id FROM op_earn_submissions WHERE x_user_id=? AND content_hash=? AND post_id<>? AND state IN ('approved','pending_review')", x.id, hash, postId);
      add('duplicate', 'Checking duplicate submissions', !self, self ? 'Same text as one of your earlier rewarded posts' : 'New post, new text', 'DUPLICATE_CONTENT');
      const issues: string[] = [];
      if (post.reply) issues.push('REPLY'); if (post.repost) issues.push('REPOST'); if (HIDDEN.test(post.text)) issues.push('HIDDEN_TEXT');
      if (post.createdAt < now - EARN_RULES.postMaxAgeDays * DAY) issues.push('TOO_OLD'); else if (post.createdAt < settings.campaignStart) issues.push('BEFORE_CAMPAIGN');
      if (own.length < EARN_RULES.minOwnChars) issues.push('LOW_EFFORT');
      checks.push({ id: 'integrity', label: 'Running integrity checks', state: issues.length ? 'fail' : 'pass', detail: issues.length ? issues.map(c => reason(c).message).join(' · ') : 'Standalone, public, recent and in your own words' }); reasons.push(...issues.map(reason));
      const twins = Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_earn_submissions WHERE content_hash=? AND x_user_id<>? AND state IN ('approved','pending_review')", hash, x.id)?.n ?? 0);
      review = twins >= EARN_RULES.reviewTwins;
      if (!reasons.length) {
        try { market = await this.market(true); rewardCents = rewardCentsFor(market.marketCapUsd); checks.push({ id: 'reward', label: 'Calculating live reward', state: 'pass', detail: `$${(rewardCents / 100).toFixed(2)} at $${Math.round(market.marketCapUsd).toLocaleString('en-US')} market cap` }); }
        catch { temporary = true; checks.push({ id: 'reward', label: 'Calculating live reward', state: 'pending', detail: 'Market data could not be confirmed' }); reasons.push(reason('MARKET_UNAVAILABLE')); }
        if (market && this.spentCents() + rewardCents > settings.budgetUsd * 100) { checks.push({ id: 'budget', label: 'Checking campaign budget', state: 'fail', detail: 'Campaign budget used up' }); reasons.push(reason('BUDGET_REACHED')); }
      } else checks.push({ id: 'reward', label: 'Calculating live reward', state: 'skip', detail: 'Not calculated because a check failed' });
    }
    const allTemporary = reasons.length > 0 && reasons.every(r => ['X_UNAVAILABLE', 'MARKET_UNAVAILABLE'].includes(r.code));
    let state = reasons.length ? (temporary && allTemporary ? 'verification_error' : 'rejected') : review ? 'pending_review' : 'approved';
    if (review && state === 'pending_review') reasons.push(reason('MANUAL_REVIEW'));
    const id = existing?.id ?? crypto.randomUUID();
    const row = this.store.atomic(() => {
      // Re-checked inside the transaction: concurrent submissions can never exceed the daily allowance or the budget.
      if (state === 'approved' || state === 'pending_review') {
        const again = this.row(postId); if (again && again.owner !== owner) throw new ApiError('POST_TAKEN', 409);
        if (this.usedToday(x.id).used >= settings.dailyMax) { state = 'rejected'; reasons.push(reason('DAILY_LIMIT')); rewardCents = 0; }
        else if (this.spentCents() + rewardCents > settings.budgetUsd * 100) { state = 'rejected'; reasons.push(reason('BUDGET_REACHED')); rewardCents = 0; }
      }
      const approved = state === 'approved';
      this.store.run('DELETE FROM op_earn_submissions WHERE post_id=? AND owner=?', postId, owner);
      this.store.run('INSERT INTO op_earn_submissions(id,post_id,owner,x_user_id,handle,name,avatar,url,text,media,metrics,posted_at,content_hash,state,reasons,checks,reward_cents,reward_state,mcap_usd,price_usd,submitted_at,verified_at,approved_at,matures_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id, postId, owner, x.id, post?.handle || x.handle, post?.name || x.name, post?.avatar || x.avatar, `https://x.com/${post?.handle || x.handle || 'i'}/status/${postId}`, post?.text ?? '', JSON.stringify(post?.media ?? []), post?.metrics ? JSON.stringify(post.metrics) : null, post?.createdAt ?? 0, hash, state, JSON.stringify(reasons), JSON.stringify(checks),
        state === 'approved' || state === 'pending_review' ? rewardCents : 0, approved ? 'pending' : 'none', market?.marketCapUsd ?? null, market?.priceUsd ?? null, existing?.submitted_at ?? now, now, approved ? now : null, approved ? now + EARN_RULES.holdHours * HOUR : null);
      this.audit(id, owner, state, state === 'approved' ? `Approved. Reward locked at $${(rewardCents / 100).toFixed(2)} (market cap $${Math.round(market?.marketCapUsd ?? 0).toLocaleString('en-US')}, price $${market?.priceUsd ?? 0}). Credits after ${EARN_RULES.holdHours}h live.` : reasons.map(r => r.message).join(' · ') || state);
      return this.row(postId)!;
    });
    this.store.metric(state === 'approved' ? 'submission_approved' : state === 'rejected' ? 'submission_rejected' : state === 'pending_review' ? 'submission_review' : 'submission_error');
    for (const r of reasons) this.store.metric(`earn_reject_${r.code.toLowerCase()}`);
    return { submission: this.view(row, true), already: false };
  }
  /**
   * Credits rewards whose post stayed live for the minimum period. A post deleted before then moves its reward to review
   * (never silently clawed back). Bounded per call so X API usage stays small.
   */
  async mature(owner: string): Promise<void> {
    const due = this.store.all<SubRow>("SELECT * FROM op_earn_submissions WHERE owner=? AND state='approved' AND reward_state='pending' AND matures_at<=? ORDER BY matures_at LIMIT 5", owner, Date.now());
    for (const row of due) {
      let alive: boolean | null = null;
      try { const post = await this.fetchPost(row.post_id); alive = post.authorId === row.x_user_id; } catch (error) { const code = error instanceof ApiError ? error.code : ''; if (code === 'POST_NOT_FOUND' || code === 'POST_PROTECTED') alive = false; }
      if (alive === null) continue;
      this.store.atomic(() => {
        if (alive) { this.store.run("UPDATE op_earn_submissions SET reward_state='available' WHERE id=? AND reward_state='pending'", row.id); this.store.run("INSERT OR IGNORE INTO op_earn_ledger(id,owner,kind,amount_cents,ref,created_at) VALUES (?,?,'reward',?,?,?)", crypto.randomUUID(), owner, row.reward_cents, row.id, Date.now()); this.audit(row.id, owner, 'credited', `Post still live after ${EARN_RULES.holdHours}h. $${(row.reward_cents / 100).toFixed(2)} added to your balance.`); }
        else { this.store.run("UPDATE op_earn_submissions SET reward_state='review' WHERE id=? AND reward_state='pending'", row.id); this.audit(row.id, owner, 'under_review', 'Post was removed or hidden before the minimum live period. Reward placed under review.'); }
      });
    }
  }

  // ---------------------------------------------------------------- balances & claims
  private sum(sql: string, ...args: (string | number)[]): number { return Number(this.store.one<{ s: number }>(sql, ...args)?.s ?? 0); }
  balances(owner: string): Record<string, number> {
    const c = (v: number) => v / 100;
    return {
      availableUsd: c(this.sum('SELECT COALESCE(SUM(amount_cents),0) AS s FROM op_earn_ledger WHERE owner=?', owner)),
      pendingVerificationUsd: c(this.sum("SELECT COALESCE(SUM(reward_cents),0) AS s FROM op_earn_submissions WHERE owner=? AND ((state='approved' AND reward_state IN ('pending','review')) OR state='pending_review')", owner)),
      pendingPayoutUsd: c(this.sum("SELECT COALESCE(SUM(amount_cents),0) AS s FROM op_earn_claims WHERE owner=? AND state IN ('queued','submitted')", owner)),
      lifetimeUsd: c(this.sum("SELECT COALESCE(SUM(amount_cents),0) AS s FROM op_earn_ledger WHERE owner=? AND kind='reward'", owner)),
      claimedUsd: c(this.sum("SELECT COALESCE(SUM(amount_cents),0) AS s FROM op_earn_claims WHERE owner=? AND state='confirmed'", owner)),
    };
  }
  private claimView(r: ClaimRow): Record<string, unknown> { return { id: r.id, amountUsd: r.amount_cents / 100, wallet: r.wallet, ethUsd: r.eth_usd, amountWei: r.amount_wei, state: r.state, hash: r.tx_hash, error: r.error, createdAt: r.created_at, updatedAt: r.updated_at, audit: this.store.all('SELECT event,detail,at FROM op_earn_audit WHERE ref=? ORDER BY at', r.id) }; }
  private fail(r: ClaimRow, why: string): void {
    this.store.atomic(() => { this.store.run("UPDATE op_earn_claims SET state='failed',error=?,updated_at=? WHERE id=? AND state IN ('queued','submitted')", why.slice(0, 200), Date.now(), r.id); this.store.run("INSERT OR IGNORE INTO op_earn_ledger(id,owner,kind,amount_cents,ref,created_at) VALUES (?,?,'claim_refund',?,?,?)", crypto.randomUUID(), r.owner, r.amount_cents, r.id, Date.now()); this.audit(r.id, r.owner, 'failed', `${why}. $${(r.amount_cents / 100).toFixed(2)} returned to your balance.`); });
    this.store.metric('claim_failed');
  }
  /** Confirms or fails submitted payouts from their on-chain receipts. */
  async reconcile(owner?: string): Promise<void> {
    const rows = owner ? this.store.all<ClaimRow>("SELECT * FROM op_earn_claims WHERE owner=? AND state='submitted' AND tx_hash IS NOT NULL", owner) : this.store.all<ClaimRow>("SELECT * FROM op_earn_claims WHERE state='submitted' AND tx_hash IS NOT NULL LIMIT 20");
    const client = serverClient(this.runtime.env);
    for (const r of rows) {
      const receipt = await client.getTransactionReceipt({ hash: r.tx_hash as Hex }).catch(() => null); if (!receipt) continue;
      if (receipt.status === 'success') { this.store.run("UPDATE op_earn_claims SET state='confirmed',updated_at=? WHERE id=? AND state='submitted'", Date.now(), r.id); this.audit(r.id, r.owner, 'confirmed', `Confirmed in block ${receipt.blockNumber}.`); this.store.metric('claim_completed'); }
      else this.fail(r, 'Transaction reverted on-chain');
    }
  }
  /**
   * Pays out available balance in ETH from the ObjectPad treasury at the live ETH/USD price. Idempotent per client key:
   * the balance is debited and the claim recorded in one transaction before anything is broadcast, and a claim is sent once.
   */
  async claim(owner: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const idem = typeof input.idempotencyKey === 'string' && UUID.test(input.idempotencyKey) ? input.idempotencyKey.toLowerCase() : null; if (!idem) throw new ApiError('INVALID_INPUT');
    const prior = this.store.one<ClaimRow>('SELECT * FROM op_earn_claims WHERE idem=?', idem);
    if (prior) { if (prior.owner !== owner) throw new ApiError('FORBIDDEN', 403); return this.claimView(prior); }
    if (!this.settings().payouts) throw new ApiError('PAYOUTS_PAUSED', 503);
    const wallet = typeof input.wallet === 'string' ? input.wallet.toLowerCase() : '';
    if (!this.accounts.wallets(owner).some(w => w.address === wallet)) throw new ApiError('WALLET_NOT_LINKED', 403);
    const x = await this.xIdentity(owner); if (!x) throw new ApiError('X_NOT_LINKED', 409);
    if (this.blocked(owner, `x:${x.id}`, wallet)) throw new ApiError('ACCOUNT_REVIEW', 403);
    this.store.rate(`earn-claim:${owner}`, 10, HOUR);
    await this.mature(owner);
    const amount = Math.floor(Number(input.amountCents)); if (!Number.isFinite(amount) || amount < EARN_RULES.minClaimUsd * 100 || amount > 10_000_000) throw new ApiError('CLAIM_AMOUNT_INVALID');
    const ethUsd = await this.ethUsd(); if (!ethUsd) throw new ApiError('ETH_PRICE_UNAVAILABLE', 503);
    const wei = BigInt(amount) * 10n ** 22n / BigInt(Math.round(ethUsd * 1e6));
    const client = serverClient(this.runtime.env); const [status, gasPrice] = await Promise.all([this.sponsor.status(true), client.getGasPrice()]);
    if (BigInt(status.balanceWei) - BigInt(status.launchCostWei) * 3n - 21_000n * gasPrice * 2n < wei) { this.store.metric('claim_treasury_low'); throw new ApiError('TREASURY_LOW', 503); }
    const id = crypto.randomUUID(); const now = Date.now();
    this.store.atomic(() => {
      const available = this.sum('SELECT COALESCE(SUM(amount_cents),0) AS s FROM op_earn_ledger WHERE owner=?', owner); if (available < amount) throw new ApiError('INSUFFICIENT_BALANCE', 409);
      this.store.run("INSERT INTO op_earn_claims(id,owner,idem,amount_cents,wallet,eth_usd,amount_wei,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'queued',?,?)", id, owner, idem, amount, wallet, ethUsd, wei.toString(), now, now);
      this.store.run("INSERT INTO op_earn_ledger(id,owner,kind,amount_cents,ref,created_at) VALUES (?,?,'claim',?,?,?)", crypto.randomUUID(), owner, -amount, id, now);
      this.audit(id, owner, 'queued', `Claim $${(amount / 100).toFixed(2)} to ${wallet} at ETH $${ethUsd.toFixed(2)}.`);
    });
    this.store.metric('claim_started');
    let row = this.store.one<ClaimRow>('SELECT * FROM op_earn_claims WHERE id=?', id)!;
    try {
      const nonce = await this.sponsor.nextNonce();
      const hash = await this.sponsor.wallet().sendTransaction({ to: wallet as Address, value: wei, gas: 21_000n, nonce, chain: robinhoodChain });
      this.sponsor.markNonce(nonce); this.sponsor.invalidate();
      this.store.run("UPDATE op_earn_claims SET state='submitted',tx_hash=?,updated_at=? WHERE id=?", hash, Date.now(), id); this.audit(id, owner, 'submitted', `Broadcast ${hash}.`);
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 25_000 }).catch(() => null);
      row = this.store.one<ClaimRow>('SELECT * FROM op_earn_claims WHERE id=?', id)!;
      if (receipt?.status === 'success') { this.store.run("UPDATE op_earn_claims SET state='confirmed',updated_at=? WHERE id=?", Date.now(), id); this.audit(id, owner, 'confirmed', `Confirmed in block ${receipt.blockNumber}.`); this.store.metric('claim_completed'); }
      else if (receipt) this.fail(row, 'Transaction reverted on-chain');
    } catch (error) { console.warn('objectpad.earn.claim', error instanceof Error ? error.message.slice(0, 160) : ''); this.fail(row, 'The network did not accept the payout'); }
    return this.claimView(this.store.one<ClaimRow>('SELECT * FROM op_earn_claims WHERE id=?', id)!);
  }

  // ---------------------------------------------------------------- read models
  rules(): Record<string, unknown> {
    const s = this.settings(); return { ...EARN_RULES, dailyMax: s.dailyMax, submissionsOpen: s.submissions, payoutsOpen: s.payouts, budgetUsd: s.budgetUsd, budgetLeftUsd: Math.max(0, s.budgetUsd - this.spentCents() / 100), campaignStart: s.campaignStart, token: EARN_TOKEN, payout: 'ETH on Robinhood Chain at the live ETH/USD price when you claim' };
  }
  async me(owner: string): Promise<Record<string, unknown>> {
    let x: XIdentity | null = null; let xError: string | null = null;
    try { x = await this.xIdentity(owner); } catch (error) { xError = error instanceof ApiError ? error.code : 'AUTH_UNAVAILABLE'; }
    await this.reconcile(owner).catch(() => undefined); await this.mature(owner).catch(() => undefined);
    const daily = x ? this.usedToday(x.id) : { used: 0, oldest: null };
    return {
      x, xError, blocked: this.blocked(owner, x ? `x:${x.id}` : ''), balances: this.balances(owner),
      daily: { used: daily.used, max: this.settings().dailyMax, resetsAt: daily.oldest ? daily.oldest + DAY : null },
      wallets: this.accounts.wallets(owner), rules: this.rules(),
      submissions: this.store.all<SubRow>('SELECT * FROM op_earn_submissions WHERE owner=? ORDER BY submitted_at DESC LIMIT 40', owner).map(r => this.view(r, true)),
      claims: this.store.all<ClaimRow>('SELECT * FROM op_earn_claims WHERE owner=? ORDER BY created_at DESC LIMIT 30', owner).map(r => this.claimView(r)),
    };
  }
  /** Public live activity: genuine submissions and payouts only. Wallets are truncated server-side. */
  feed(filter: string): Record<string, unknown> {
    const where: Record<string, string> = { all: "state IN ('approved','pending_review','rejected')", approved: "state='approved'", pending: "state IN ('pending_review','verification_error')", rejected: "state='rejected'", paid: '0' };
    const posts = this.store.all<SubRow>(`SELECT * FROM op_earn_submissions WHERE ${where[filter] ?? where.all} ORDER BY verified_at DESC LIMIT 40`).map(r => ({ kind: 'post', id: r.id, handle: r.handle, avatar: r.avatar, preview: r.text.slice(0, 180), url: r.url, state: r.state, reason: (JSON.parse(r.reasons) as EarnReason[])[0]?.message ?? null, rewardUsd: r.reward_cents / 100, rewardState: r.reward_state, at: r.verified_at }));
    const payouts = ['all', 'paid'].includes(filter) ? this.store.all<ClaimRow & { handle: string | null }>("SELECT c.*, x.handle AS handle FROM op_earn_claims c LEFT JOIN op_x_identities x ON x.owner=c.owner WHERE c.state IN ('submitted','confirmed','failed') ORDER BY c.updated_at DESC LIMIT 30")
      .map(c => ({ kind: 'payout', id: c.id, handle: c.handle ?? '', wallet: `${c.wallet.slice(0, 6)}…${c.wallet.slice(-4)}`, amountUsd: c.amount_cents / 100, amountWei: c.amount_wei, state: c.state, hash: c.tx_hash, at: c.updated_at })) : [];
    const items = [...posts, ...payouts].sort((a, b) => b.at - a.at).slice(0, 50);
    return { items, stats: { approved: this.sum("SELECT COUNT(*) AS s FROM op_earn_submissions WHERE state='approved'"), earners: this.sum("SELECT COUNT(DISTINCT x_user_id) AS s FROM op_earn_submissions WHERE state='approved'"), paidUsd: this.sum("SELECT COALESCE(SUM(amount_cents),0) AS s FROM op_earn_claims WHERE state='confirmed'") / 100, payouts: this.sum("SELECT COUNT(*) AS s FROM op_earn_claims WHERE state='confirmed'") }, updatedAt: Date.now() };
  }
  proof(id: string): Record<string, unknown> {
    const row = this.store.one<SubRow>("SELECT * FROM op_earn_submissions WHERE id=? AND state IN ('approved','pending_review')", id); if (!row) throw new ApiError('NOT_FOUND', 404);
    const { reasons: _r, checks, ...rest } = this.view(row) as Record<string, unknown>; void _r; return { ...rest, checks };
  }

  // ---------------------------------------------------------------- operator
  async overview(): Promise<Record<string, unknown>> {
    const liabilities = this.sum('SELECT COALESCE(SUM(amount_cents),0) AS s FROM op_earn_ledger') / 100;
    return { settings: this.settings(), rules: this.rules(), liabilities: { availableUsd: liabilities, pendingUsd: this.sum("SELECT COALESCE(SUM(reward_cents),0) AS s FROM op_earn_submissions WHERE (state='approved' AND reward_state IN ('pending','review')) OR state='pending_review'") / 100, inFlightUsd: this.sum("SELECT COALESCE(SUM(amount_cents),0) AS s FROM op_earn_claims WHERE state IN ('queued','submitted')") / 100 },
      treasury: await this.sponsor.status(true).catch(() => null), review: this.store.all<SubRow>("SELECT * FROM op_earn_submissions WHERE state='pending_review' OR reward_state='review' ORDER BY submitted_at LIMIT 50").map(r => this.view(r, true)),
      stuckClaims: this.store.all<ClaimRow>("SELECT * FROM op_earn_claims WHERE state IN ('queued','submitted') ORDER BY created_at LIMIT 50").map(r => this.claimView(r)),
      metrics: this.store.all("SELECT name,value FROM op_metrics WHERE name LIKE 'earn_%' OR name LIKE 'submission_%' OR name LIKE 'claim_%' OR name IN ('earn_page_viewed','auth_started','auth_completed','post_draft_copied','post_link_pasted','proof_shared') ORDER BY name"),
      blocks: this.store.all('SELECT subject,reason,at FROM op_earn_blocks ORDER BY at DESC LIMIT 100') };
  }
  review(id: string, decision: string, why: string, actor: string): Record<string, unknown> {
    const row = this.store.one<SubRow>('SELECT * FROM op_earn_submissions WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404);
    if (why.trim().length < 5) throw new ApiError('REASON_REQUIRED');
    const now = Date.now();
    this.store.atomic(() => {
      if (decision === 'approve' && row.state === 'pending_review') this.store.run("UPDATE op_earn_submissions SET state='approved',reward_state='pending',approved_at=?,matures_at=? WHERE id=?", now, Math.max(row.submitted_at + EARN_RULES.holdHours * HOUR, now), id);
      else if (decision === 'reject' && row.state === 'pending_review') this.store.run("UPDATE op_earn_submissions SET state='rejected',reward_cents=0,reasons=? WHERE id=?", JSON.stringify([{ code: 'REVIEW_REJECTED', message: `Rejected in review: ${why.slice(0, 200)}`, fix: 'Contact support to appeal.', retryable: false }]), id);
      else if (decision === 'release' && row.reward_state === 'review') { this.store.run("UPDATE op_earn_submissions SET reward_state='available' WHERE id=?", id); this.store.run("INSERT OR IGNORE INTO op_earn_ledger(id,owner,kind,amount_cents,ref,created_at) VALUES (?,?,'reward',?,?,?)", crypto.randomUUID(), row.owner, row.reward_cents, id, now); }
      else if (decision === 'reverse' && row.reward_state === 'review') this.store.run("UPDATE op_earn_submissions SET reward_state='reversed' WHERE id=?", id);
      else throw new ApiError('REVIEW_INVALID', 409);
      this.audit(id, row.owner, `review_${decision}`, `${why.slice(0, 300)} (operator ${actor.slice(0, 12)})`);
    });
    return this.view(this.store.one<SubRow>('SELECT * FROM op_earn_submissions WHERE id=?', id)!, true);
  }
}
