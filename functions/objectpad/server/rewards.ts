/**
 * Paid Rewards v2: bounties for finding, scanning and tokenizing real objects.
 *
 * Two kinds share one board:
 *  - platform: ObjectPad's own bounties (shared/bounties.ts). Paid by the ObjectPad team; payout tx recorded by an operator.
 *  - community: posted by any signed-in user and backed by ETH escrow. The poster deposits the reward into the public
 *    ObjectPad Rewards escrow wallet; the deposit is verified on Robinhood Chain before the bounty goes live. Picking a
 *    winner releases the escrow straight to the winner's wallet; cancelling refunds the wallet that funded it.
 *
 * Hunters submit a photo proof (EXIF stripped on upload) and optionally the ObjectPad coin they launched. Every state
 * change is written to an append-only audit log that is public on each bounty.
 */
import { formatEther, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { ApiError, safeHttpUrl, validAddress } from '../shared/security';
import { BOUNTIES, bountyById } from '../shared/bounties';
import { robinhoodChain } from '../shared/pons';
import { rpcUrl, serverClient } from './chain';
import type { Store } from './store';
import type { Runtime } from './types';
import type { RecordService } from './record-service';

export interface Identity { handle: string; name: string; avatar: string; }
interface RewardRow { id: string; owner: string; title: string; object: string; brief: string; rules: string; category: string; adult: number; reward_usd: number; reward_wei: string; eth_usd: number; cover: string; cover_state: string; promo_url: string; state: string; funder: string | null; fund_tx: string | null; refund_tx: string | null; winner_sub: string | null; payout_tx: string | null; deadline: number; handle: string; name: string; avatar: string; wallet: string; created_at: number; updated_at: number; }
interface SubRow { id: string; reward_id: string; owner: string; wallet: string; photo: string; photo_hash: string; record_id: string; token: string; coin_name: string; coin_symbol: string; coin_image: string; note: string; state: string; review_note: string; payout_tx: string | null; handle: string; name: string; avatar: string; created_at: number; updated_at: number; }

export const REWARD_LIMITS = { minUsd: 5, maxUsd: 10_000, draftTtl: 24 * 3_600_000 } as const;
const CATEGORIES = ['find', 'scan', 'promo', 'meme', 'art', 'other'] as const;
const PHOTO = /^[a-f0-9]{64}$/;

export class RewardService {
  private key: Hex | null = null;
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly records: RecordService, private readonly identity: (owner: string) => Promise<Identity | null>, private readonly wallet: (owner: string) => Promise<string>) {
    store.run("CREATE TABLE IF NOT EXISTS op_rewards (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, object TEXT NOT NULL, brief TEXT NOT NULL, rules TEXT NOT NULL, category TEXT NOT NULL, adult INTEGER NOT NULL DEFAULT 0, reward_usd REAL NOT NULL, reward_wei TEXT NOT NULL, eth_usd REAL NOT NULL, cover TEXT NOT NULL DEFAULT '', cover_state TEXT NOT NULL DEFAULT 'none', promo_url TEXT NOT NULL DEFAULT '', state TEXT NOT NULL, funder TEXT, fund_tx TEXT UNIQUE, refund_tx TEXT, winner_sub TEXT, payout_tx TEXT, deadline INTEGER NOT NULL DEFAULT 0, handle TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '', wallet TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
    store.run('CREATE INDEX IF NOT EXISTS op_rewards_state ON op_rewards(state, created_at)');
    store.run("CREATE TABLE IF NOT EXISTS op_reward_subs (id TEXT PRIMARY KEY, reward_id TEXT NOT NULL, owner TEXT NOT NULL, wallet TEXT NOT NULL, photo TEXT NOT NULL DEFAULT '', photo_hash TEXT NOT NULL DEFAULT '', record_id TEXT NOT NULL DEFAULT '', token TEXT NOT NULL DEFAULT '', coin_name TEXT NOT NULL DEFAULT '', coin_symbol TEXT NOT NULL DEFAULT '', coin_image TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', state TEXT NOT NULL, review_note TEXT NOT NULL DEFAULT '', payout_tx TEXT, handle TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
    store.run('CREATE INDEX IF NOT EXISTS op_reward_subs_r ON op_reward_subs(reward_id, created_at)');
    store.run('CREATE TABLE IF NOT EXISTS op_reward_audit (id TEXT PRIMARY KEY, reward_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, tx TEXT, at INTEGER NOT NULL)');
    store.run('CREATE INDEX IF NOT EXISTS op_reward_audit_r ON op_reward_audit(reward_id, at)');
    store.run("CREATE TRIGGER IF NOT EXISTS op_reward_audit_no_update BEFORE UPDATE ON op_reward_audit BEGIN SELECT RAISE(ABORT, 'append-only'); END");
    store.run("CREATE TRIGGER IF NOT EXISTS op_reward_audit_no_delete BEFORE DELETE ON op_reward_audit BEGIN SELECT RAISE(ABORT, 'append-only'); END");
  }

  // ---------- escrow wallet ----------
  /** Dedicated escrow key, generated once and kept in durable storage. Separate from the launch treasury; never returned. */
  private escrowKey(): Hex {
    if (this.key) return this.key;
    const saved = this.store.one<{ value: string }>("SELECT value FROM op_secrets WHERE name='reward_escrow_key'");
    if (!saved) this.store.run("INSERT OR IGNORE INTO op_secrets(name,value,created_at) VALUES ('reward_escrow_key',?,?)", generatePrivateKey(), Date.now());
    this.key = this.store.one<{ value: string }>("SELECT value FROM op_secrets WHERE name='reward_escrow_key'")!.value as Hex; return this.key;
  }
  get escrow(): Address { return privateKeyToAccount(this.escrowKey()).address; }
  /** Releases `wei` from escrow minus the network fee. Returns the broadcast hash. */
  private async release(to: string, wei: bigint): Promise<Hex> {
    if (!validAddress(to)) throw new ApiError('WALLET_INVALID');
    const client = serverClient(this.runtime.env); const account = privateKeyToAccount(this.escrowKey());
    const [gasPrice, gas] = await Promise.all([client.getGasPrice(), client.estimateGas({ account: account.address, to: to as Address, value: 1n }).catch(() => 21_000n)]);
    const limit = gas * 13n / 10n; const reserve = limit * gasPrice * 3n; if (wei <= reserve) throw new ApiError('ESCROW_TOO_SMALL', 409);
    const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(rpcUrl(this.runtime.env), { timeout: 20_000 }) });
    return wallet.sendTransaction({ to: to as Address, value: wei - reserve, gas: limit, chain: robinhoodChain });
  }
  private async confirmed(hash: string): Promise<'success' | 'reverted' | 'pending'> {
    const receipt = await serverClient(this.runtime.env).getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
    return receipt ? receipt.status : 'pending';
  }

  private audit(rewardId: string, event: string, detail: string, tx: string | null = null): void { this.store.run('INSERT INTO op_reward_audit(id,reward_id,event,detail,tx,at) VALUES (?,?,?,?,?,?)', crypto.randomUUID(), rewardId, event, detail.slice(0, 500), tx, Date.now()); }
  private reward(id: string): RewardRow { const row = this.store.one<RewardRow>('SELECT * FROM op_rewards WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404); return row; }
  private sub(id: string): SubRow { const row = this.store.one<SubRow>('SELECT * FROM op_reward_subs WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404); return row; }

  // ---------- views ----------
  private subView(s: SubRow, viewer: string | null, full: boolean): Record<string, unknown> {
    return { id: s.id, rewardId: s.reward_id, photo: s.photo, recordId: s.record_id || null, token: s.token || null, coinName: s.coin_name, coinSymbol: s.coin_symbol, coinImage: s.coin_image, note: s.note, state: s.state, reviewNote: s.review_note, payoutTx: s.payout_tx, handle: s.handle, name: s.name, avatar: s.avatar, wallet: full ? s.wallet : `${s.wallet.slice(0, 6)}…${s.wallet.slice(-4)}`, mine: viewer === s.owner, createdAt: s.created_at };
  }
  private communityView(r: RewardRow, viewer: string | null, full = false): Record<string, unknown> {
    const subs = this.store.all<SubRow>('SELECT * FROM op_reward_subs WHERE reward_id=? ORDER BY created_at DESC LIMIT 200', r.id);
    const status = r.state === 'paid' ? 'paid' : r.state === 'paying' ? 'paying' : r.state === 'open' ? 'open' : r.state;
    return { id: r.id, kind: 'community', title: r.title, object: r.object, tagline: r.brief, rules: JSON.parse(r.rules) as string[], category: r.category, adult: Boolean(r.adult), rewardUsd: r.reward_usd, rewardWei: r.reward_wei, rewardEth: Number(formatEther(BigInt(r.reward_wei))), image: r.cover, coverState: r.cover_state, promoUrl: r.promo_url, status, deadline: r.deadline || null,
      poster: { handle: r.handle, name: r.name, avatar: r.avatar, wallet: `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}` }, fundTx: r.fund_tx, refundTx: r.refund_tx, payoutTx: r.payout_tx, winnerSub: r.winner_sub, escrow: this.escrow,
      mine: viewer === r.owner, postedAt: new Date(r.created_at).toISOString().slice(0, 10), createdAt: r.created_at, submissions: subs.map(s => this.subView(s, viewer, full || viewer === r.owner)),
      audit: this.store.all('SELECT event,detail,tx,at FROM op_reward_audit WHERE reward_id=? ORDER BY at DESC LIMIT 60', r.id) };
  }
  private platformView(id: string, viewer: string | null, full = false): Record<string, unknown> {
    const b = bountyById(id)!; const subs = this.store.all<SubRow>('SELECT * FROM op_reward_subs WHERE reward_id=? ORDER BY created_at DESC LIMIT 200', id);
    const won = subs.find(s => s.state === 'paid' || s.state === 'winner');
    const status = b.winner?.paid || won?.state === 'paid' ? 'paid' : won ? 'won' : 'open';
    return { ...b, kind: 'platform', tagline: b.tagline, category: b.adult ? 'other' : 'scan', status, poster: { handle: 'ObjectPadFun', name: 'ObjectPad', avatar: '/icon.png', wallet: 'ObjectPad team' }, escrow: null, mine: false, createdAt: Date.parse(b.postedAt), submissions: subs.map(s => this.subView(s, viewer, full)), audit: this.store.all('SELECT event,detail,tx,at FROM op_reward_audit WHERE reward_id=? ORDER BY at DESC LIMIT 60', id) };
  }
  /** Public board: live community bounties (funded or finished) plus ObjectPad's own. Drafts are only visible to their poster. */
  async board(viewer: string | null, operator = false): Promise<Record<string, unknown>> {
    await this.reconcile();
    const rows = this.store.all<RewardRow>("SELECT * FROM op_rewards WHERE state IN ('open','paying','paid','cancelled','refunding') OR (owner=? AND state='draft' AND created_at>?) ORDER BY CASE state WHEN 'open' THEN 0 WHEN 'paying' THEN 1 WHEN 'draft' THEN 2 WHEN 'paid' THEN 3 ELSE 4 END, reward_usd DESC LIMIT 200", viewer ?? '', Date.now() - REWARD_LIMITS.draftTtl);
    const community = rows.map(r => this.communityView(r, viewer, operator));
    const platform = BOUNTIES.map(b => this.platformView(b.id, viewer, operator));
    const all = [...platform, ...community] as { status: string; rewardUsd: number; kind: string }[];
    const openUsd = all.filter(b => b.status === 'open').reduce((t, b) => t + b.rewardUsd, 0);
    const paidUsd = all.filter(b => b.status === 'paid').reduce((t, b) => t + b.rewardUsd, 0);
    const escrowWei = this.store.all<{ reward_wei: string }>("SELECT reward_wei FROM op_rewards WHERE state IN ('open','paying')").reduce((t, r) => t + BigInt(r.reward_wei), 0n);
    const hunters = Number(this.store.one<{ n: number }>('SELECT COUNT(DISTINCT owner) AS n FROM op_reward_subs')?.n ?? 0);
    const proofs = Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_reward_subs')?.n ?? 0);
    return { bounties: all, stats: { openUsd, paidUsd, open: all.filter(b => b.status === 'open').length, paid: all.filter(b => b.status === 'paid').length, hunters, proofs, escrowEth: Number(formatEther(escrowWei)) }, escrow: this.escrow, operator, updatedAt: Date.now() };
  }
  async detail(id: string, viewer: string | null, operator = false): Promise<Record<string, unknown>> {
    if (bountyById(id)) return this.platformView(id, viewer, operator);
    await this.reconcile(); const r = this.reward(id);
    if (r.state === 'draft' && r.owner !== viewer && !operator) throw new ApiError('NOT_FOUND', 404);
    if (r.state === 'removed' && !operator) throw new ApiError('NOT_FOUND', 404);
    return this.communityView(r, viewer, operator);
  }

  // ---------- poster actions ----------
  /** Creates an unfunded draft with the reward priced in ETH at the live rate. It goes public once the deposit is verified. */
  async create(owner: string, input: Record<string, unknown>, ethUsd: number | null): Promise<Record<string, unknown>> {
    const text = (v: unknown, min: number, max: number, code: string): string => { const s = typeof v === 'string' ? v.normalize('NFC').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() : ''; if (s.length < min || s.length > max) throw new ApiError(code); return s; };
    const object = text(input.object, 2, 60, 'REWARD_OBJECT_INVALID');
    const title = text(input.title ?? `First ${object} scan`, 4, 70, 'REWARD_TITLE_INVALID');
    const brief = text(input.brief, 10, 280, 'REWARD_BRIEF_INVALID');
    const rules = (Array.isArray(input.rules) ? input.rules : []).map(r => typeof r === 'string' ? r.replace(/\s+/g, ' ').trim().slice(0, 80) : '').filter(r => r.length >= 3).slice(0, 4);
    const category = (CATEGORIES as readonly string[]).includes(String(input.category)) ? String(input.category) : 'find';
    const usd = Math.round(Number(input.rewardUsd)); if (!Number.isFinite(usd) || usd < REWARD_LIMITS.minUsd || usd > REWARD_LIMITS.maxUsd) throw new ApiError('REWARD_AMOUNT_INVALID');
    if (!ethUsd) throw new ApiError('ETH_PRICE_UNAVAILABLE', 503);
    const promo = typeof input.promoUrl === 'string' && input.promoUrl.trim() ? safeHttpUrl(input.promoUrl.trim()) : ''; if (promo === null) throw new ApiError('REWARD_LINK_INVALID');
    const days = Number(input.days); const deadline = [3, 7, 14, 30].includes(days) ? Date.now() + days * 86_400_000 : 0;
    const cover = typeof input.cover === 'string' && PHOTO.test(input.cover) ? input.cover : '';
    if (cover && !this.store.one("SELECT hash FROM op_artifacts WHERE hash=? AND kind='reward_photo'", cover)) throw new ApiError('REWARD_PHOTO_MISSING');
    const wallet = await this.wallet(owner).catch(() => ''); const who = await this.identity(owner).catch(() => null);
    const wei = BigInt(usd) * 10n ** 24n / BigInt(Math.round(ethUsd * 1e6));
    const id = crypto.randomUUID(); const now = Date.now();
    this.store.run('INSERT INTO op_rewards(id,owner,title,object,brief,rules,category,adult,reward_usd,reward_wei,eth_usd,cover,cover_state,promo_url,state,deadline,handle,name,avatar,wallet,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, owner, title, object, brief, JSON.stringify(rules.length ? rules : ['A real object, found and scanned in person', 'Clear photo proof', 'First approved proof wins']), category, input.adult === true ? 1 : 0, usd, wei.toString(), ethUsd, cover ? `${this.runtime.apiOrigin}/api/artifacts/${cover}` : '', cover ? 'upload' : 'generating', promo ?? '', 'draft', deadline, who?.handle ?? '', who?.name ?? '', who?.avatar ?? '', wallet, now, now);
    this.audit(id, 'created', `Bounty drafted: $${usd} (${formatEther(wei)} ETH at ETH $${ethUsd.toFixed(2)}).`);
    this.store.metric('reward_created');
    return this.communityView(this.reward(id), owner);
  }
  /** Prompt for the ObjectPad Rewards poster style: bright sky, bubbles, glass pedestal, object dissolving into voxels. */
  coverPrompt(id: string): string | null {
    const r = this.store.one<RewardRow>('SELECT * FROM op_rewards WHERE id=?', id); if (!r || r.cover_state !== 'generating') return null;
    const obj = r.object.replace(/[^\p{L}\p{N} '&-]/gu, '').slice(0, 40);
    return `Wide 16:9 promotional poster, hyperreal 3D render. Bright saturated blue sky with fluffy white cumulus clouds, a sun flare in the top-left corner, a few floating iridescent soap bubbles. On the right half: a realistic ${obj} standing on a glowing translucent blue glass pedestal disc; the back part of the ${obj} dissolves into a cloud of small glowing blue and white voxel cubes, some cubes carrying white digits 0 and 1 and # symbols. On the left half, huge bold white rounded sans-serif headline text with a soft shadow reading exactly: "FIRST ${obj.toUpperCase()} SCAN: $${r.reward_usd}". Under it smaller bold white caps: "REWARDS ONLY GO UP." Under that, large white text: "objectpad.fun". Crisp, clean, joyful, high contrast, no other text, no watermark.${r.adult ? ' Tasteful and non-explicit; depict the object abstractly as a smooth sculptural shape.' : ''}`;
  }
  setCover(id: string, url: string | null): void { this.store.run("UPDATE op_rewards SET cover=?,cover_state=?,updated_at=? WHERE id=? AND cover_state='generating'", url ?? '', url ? 'ready' : 'failed', Date.now(), id); }

  /** Verifies the escrow deposit on Robinhood Chain and opens the bounty. Any wallet may fund it; refunds go back to that wallet. */
  async fund(owner: string, id: string, hash: string): Promise<Record<string, unknown>> {
    const r = this.reward(id); if (r.owner !== owner) throw new ApiError('NOT_FOUND', 404);
    if (r.state !== 'draft') throw new ApiError('REWARD_ALREADY_FUNDED', 409);
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new ApiError('TX_INVALID');
    const tx = hash.toLowerCase(); if (this.store.one('SELECT id FROM op_rewards WHERE fund_tx=?', tx)) throw new ApiError('TX_ALREADY_USED', 409);
    const client = serverClient(this.runtime.env);
    const [t, receipt] = await Promise.all([client.getTransaction({ hash: tx as Hex }), client.getTransactionReceipt({ hash: tx as Hex })]).catch(() => { throw new ApiError('TX_NOT_FOUND', 404); });
    if (receipt.status !== 'success') throw new ApiError('TX_FAILED', 409);
    if ((t.to ?? '').toLowerCase() !== this.escrow.toLowerCase()) throw new ApiError('TX_WRONG_RECIPIENT', 409);
    if (t.value < BigInt(r.reward_wei) * 99n / 100n) throw new ApiError('TX_AMOUNT_LOW', 409);
    if (t.chainId !== undefined && t.chainId !== robinhoodChain.id) throw new ApiError('TX_WRONG_CHAIN', 409);
    const block = await client.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
    if (block && Number(block.timestamp) * 1000 < r.created_at - 10 * 60_000) throw new ApiError('TX_TOO_OLD', 409);
    this.store.run("UPDATE op_rewards SET state='open',funder=?,fund_tx=?,reward_wei=?,updated_at=? WHERE id=? AND state='draft'", t.from.toLowerCase(), tx, t.value.toString(), Date.now(), id);
    this.audit(id, 'funded', `${formatEther(t.value)} ETH locked in escrow from ${t.from}. Bounty is live.`, tx);
    this.store.metric('reward_funded');
    return this.communityView(this.reward(id), owner);
  }
  private canManage(r: RewardRow, actor: string, operator: boolean): void { if (r.owner !== actor && !operator) throw new ApiError('FORBIDDEN', 403); }

  /** Picks the winner and releases the escrow to their wallet in the same step. */
  async payout(actor: string, operator: boolean, subId: string): Promise<Record<string, unknown>> {
    const s = this.sub(subId); if (bountyById(s.reward_id)) throw new ApiError('PLATFORM_REWARD', 409);
    const r = this.reward(s.reward_id); this.canManage(r, actor, operator);
    if (r.state !== 'open') throw new ApiError('REWARD_NOT_OPEN', 409); if (s.state !== 'submitted') throw new ApiError('SUBMISSION_NOT_PENDING', 409);
    this.store.run("UPDATE op_rewards SET state='paying',winner_sub=?,updated_at=? WHERE id=? AND state='open'", s.id, Date.now(), r.id);
    this.store.run("UPDATE op_reward_subs SET state='winner',updated_at=? WHERE id=?", Date.now(), s.id);
    let hash: Hex;
    try { hash = await this.release(s.wallet, BigInt(r.reward_wei)); }
    catch (error) {
      this.store.run("UPDATE op_rewards SET state='open',winner_sub=NULL,updated_at=? WHERE id=?", Date.now(), r.id); this.store.run("UPDATE op_reward_subs SET state='submitted',updated_at=? WHERE id=?", Date.now(), s.id);
      console.warn('objectpad.reward.payout', error instanceof Error ? error.message.slice(0, 160) : ''); if (error instanceof ApiError) throw error; throw new ApiError('PAYOUT_FAILED', 503);
    }
    this.store.run('UPDATE op_rewards SET payout_tx=?,updated_at=? WHERE id=?', hash, Date.now(), r.id); this.store.run('UPDATE op_reward_subs SET payout_tx=? WHERE id=?', hash, s.id);
    this.audit(r.id, 'payout_sent', `Winner ${s.handle ? '@' + s.handle : s.wallet} picked by ${actor === r.owner ? 'the poster' : 'ObjectPad'}. Escrow released to ${s.wallet}.`, hash);
    this.store.metric('reward_paid');
    await this.reconcile();
    return this.communityView(this.reward(r.id), actor);
  }
  /** Cancels and refunds the funder. Blocked while proofs are waiting for a decision (unless the deadline passed), so posters can't pull a bounty out from under hunters. */
  async cancel(actor: string, operator: boolean, id: string, reason: string): Promise<Record<string, unknown>> {
    const r = this.reward(id); this.canManage(r, actor, operator);
    if (r.state === 'draft') { this.store.run("UPDATE op_rewards SET state='cancelled',updated_at=? WHERE id=?", Date.now(), id); this.audit(id, 'cancelled', 'Draft deleted before funding.'); return this.communityView(this.reward(id), actor); }
    if (r.state !== 'open') throw new ApiError('REWARD_NOT_OPEN', 409);
    const pending = Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_reward_subs WHERE reward_id=? AND state='submitted'", id)?.n ?? 0);
    if (pending && !operator && !(r.deadline && Date.now() > r.deadline)) throw new ApiError('REWARD_HAS_PENDING', 409);
    this.store.run("UPDATE op_rewards SET state='refunding',updated_at=? WHERE id=? AND state='open'", Date.now(), id);
    let hash: Hex;
    try { hash = await this.release(r.funder ?? '', BigInt(r.reward_wei)); }
    catch (error) { this.store.run("UPDATE op_rewards SET state='open',updated_at=? WHERE id=?", Date.now(), id); console.warn('objectpad.reward.refund', error instanceof Error ? error.message.slice(0, 160) : ''); if (error instanceof ApiError) throw error; throw new ApiError('REFUND_FAILED', 503); }
    this.store.run('UPDATE op_rewards SET refund_tx=?,updated_at=? WHERE id=?', hash, Date.now(), id);
    this.store.run("UPDATE op_reward_subs SET state='rejected',review_note='Bounty cancelled',updated_at=? WHERE reward_id=? AND state='submitted'", Date.now(), id);
    this.audit(id, 'refund_sent', `Cancelled by ${actor === r.owner ? 'the poster' : 'ObjectPad'}${reason ? `: ${reason.slice(0, 160)}` : ''}. Escrow refunded to ${r.funder}.`, hash);
    await this.reconcile();
    return this.communityView(this.reward(id), actor);
  }
  /** Poster (community) or operator rejects a proof with a public reason. */
  review(actor: string, operator: boolean, subId: string, state: string, note: string, tx: string): Record<string, unknown> {
    const s = this.sub(subId); const platform = bountyById(s.reward_id);
    if (platform) {
      if (!operator) throw new ApiError('FORBIDDEN', 403);
      if (!['submitted', 'winner', 'rejected', 'paid'].includes(state)) throw new ApiError('INVALID_INPUT');
      if (state === 'paid' && !/^0x[a-fA-F0-9]{64}$/.test(tx.trim())) throw new ApiError('PAYOUT_TX_REQUIRED');
      if ((state === 'winner' || state === 'paid') && this.store.one("SELECT id FROM op_reward_subs WHERE reward_id=? AND state IN ('winner','paid') AND id<>?", s.reward_id, s.id)) throw new ApiError('BOUNTY_ALREADY_WON', 409);
      this.store.run('UPDATE op_reward_subs SET state=?,review_note=?,payout_tx=?,updated_at=? WHERE id=?', state, note.trim().slice(0, 200), state === 'paid' ? tx.trim().toLowerCase() : s.payout_tx, Date.now(), s.id);
      this.audit(s.reward_id, state, `${s.handle ? '@' + s.handle : s.wallet}: ${note.trim() || state}`, state === 'paid' ? tx.trim().toLowerCase() : null);
      return this.platformView(s.reward_id, actor, true);
    }
    const r = this.reward(s.reward_id); this.canManage(r, actor, operator);
    if (state !== 'rejected' || s.state !== 'submitted') throw new ApiError('INVALID_INPUT');
    const reason = note.trim(); if (reason.length < 3) throw new ApiError('REVIEW_REASON_REQUIRED');
    this.store.run("UPDATE op_reward_subs SET state='rejected',review_note=?,updated_at=? WHERE id=?", reason.slice(0, 200), Date.now(), s.id);
    this.audit(r.id, 'rejected', `Proof from ${s.handle ? '@' + s.handle : s.wallet.slice(0, 10)} not accepted: ${reason.slice(0, 200)}`);
    return this.communityView(r, actor);
  }
  /** Operator: remove an abusive bounty. Funded ones are refunded first via cancel(). */
  async remove(actor: string, id: string, reason: string): Promise<Record<string, unknown>> {
    const r = this.reward(id); if (r.state === 'open') await this.cancel(actor, true, id, reason);
    this.store.run("UPDATE op_rewards SET state='removed',updated_at=? WHERE id=?", Date.now(), id); this.audit(id, 'removed', `Removed by ObjectPad: ${reason.slice(0, 200)}`);
    return { ok: true };
  }

  // ---------- hunter actions ----------
  /** A photo proof (required for community bounties) and/or the ObjectPad coin the hunter launched for it. */
  async submit(owner: string, rewardId: string, input: { photo: string; coin: string; note: string }): Promise<Record<string, unknown>> {
    const platform = bountyById(rewardId); const r = platform ? null : this.reward(rewardId);
    if (r && r.state !== 'open') throw new ApiError('BOUNTY_CLOSED', 409);
    if (r && r.owner === owner) throw new ApiError('REWARD_OWN_BOUNTY', 409);
    if (r?.deadline && Date.now() > r.deadline) throw new ApiError('REWARD_EXPIRED', 409);
    if (platform && (platform.winner || this.store.one("SELECT id FROM op_reward_subs WHERE reward_id=? AND state IN ('winner','paid')", rewardId))) throw new ApiError('BOUNTY_CLOSED', 409);
    const photo = PHOTO.test(input.photo) ? input.photo : '';
    if (photo && !this.store.one("SELECT hash FROM op_artifacts WHERE hash=? AND kind='reward_photo'", photo)) throw new ApiError('REWARD_PHOTO_MISSING');
    if (!photo && !input.coin.trim()) throw new ApiError('REWARD_PROOF_REQUIRED');
    if (photo && this.store.one('SELECT id FROM op_reward_subs WHERE reward_id=? AND photo_hash=?', rewardId, photo)) throw new ApiError('BOUNTY_ALREADY_SUBMITTED', 409);
    if (Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_reward_subs WHERE reward_id=? AND owner=? AND state='submitted'", rewardId, owner)?.n ?? 0) >= 3) throw new ApiError('REWARD_TOO_MANY', 429);
    let coin = { record: '', token: '', name: '', symbol: '', image: '' };
    if (input.coin.trim()) {
      const recordId = this.resolveCoin(input.coin); const { row } = this.records.load(recordId);
      if (row.owner !== owner) throw new ApiError('BOUNTY_NOT_YOUR_COIN', 403);
      let rec: ReturnType<RecordService['publicRecord']>; try { rec = this.records.publicRecord(recordId); } catch { throw new ApiError('BOUNTY_COIN_NOT_LIVE', 409); }
      if (this.store.one('SELECT id FROM op_reward_subs WHERE reward_id=? AND record_id=?', rewardId, recordId)) throw new ApiError('BOUNTY_ALREADY_SUBMITTED', 409);
      coin = { record: recordId, token: rec.tokenAddress.toLowerCase(), name: rec.publicName.slice(0, 80), symbol: rec.symbol.slice(0, 16), image: (rec as { iconUrl?: string }).iconUrl ?? rec.model.thumbnailUrl };
    }
    const wallet = await this.wallet(owner).catch(() => { throw new ApiError('WALLET_REQUIRED', 409); });
    const who = await this.identity(owner).catch(() => null);
    const id = crypto.randomUUID(); const now = Date.now();
    this.store.run('INSERT INTO op_reward_subs(id,reward_id,owner,wallet,photo,photo_hash,record_id,token,coin_name,coin_symbol,coin_image,note,state,handle,name,avatar,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, rewardId, owner, wallet.toLowerCase(), photo ? `${this.runtime.apiOrigin}/api/artifacts/${photo}` : '', photo, coin.record, coin.token, coin.name, coin.symbol, coin.image, input.note.replace(/\s+/g, ' ').trim().slice(0, 280), 'submitted', who?.handle ?? '', who?.name ?? '', who?.avatar ?? '', now, now);
    this.audit(rewardId, 'proof', `New proof from ${who?.handle ? '@' + who.handle : `${wallet.slice(0, 6)}…${wallet.slice(-4)}`}${coin.symbol ? ` with coin $${coin.symbol}` : ''}.`);
    this.store.metric('reward_proof');
    return this.subView(this.sub(id), owner, true);
  }
  private resolveCoin(input: string): string {
    const raw = input.trim(); const token = raw.match(/0x[a-fA-F0-9]{40}/)?.[0];
    if (token) { const row = this.store.one<{ record_id: string }>('SELECT record_id FROM op_launches WHERE token=?', token.toLowerCase()); if (row) return row.record_id; }
    const full = raw.match(/[a-f0-9]{64}/)?.[0]; if (full) return full;
    const short = raw.match(/\/o\/([a-f0-9]{12})/)?.[1];
    if (short) { const rows = this.store.all<{ id: string }>('SELECT id FROM op_records WHERE id LIKE ? LIMIT 2', `${short}%`); if (rows.length === 1) return rows[0].id; }
    throw new ApiError('BOUNTY_COIN_NOT_FOUND', 404);
  }

  /** Settles broadcast payouts/refunds once their receipts land. Reverted transfers go back to the previous state. */
  async reconcile(): Promise<void> {
    const rows = this.store.all<RewardRow>("SELECT * FROM op_rewards WHERE (state='paying' AND payout_tx IS NOT NULL) OR (state='refunding' AND refund_tx IS NOT NULL) LIMIT 10");
    for (const r of rows) {
      const hash = r.state === 'paying' ? r.payout_tx! : r.refund_tx!; const status = await this.confirmed(hash); if (status === 'pending') continue;
      if (status === 'success') {
        if (r.state === 'paying') { this.store.run("UPDATE op_rewards SET state='paid',updated_at=? WHERE id=?", Date.now(), r.id); this.store.run("UPDATE op_reward_subs SET state='paid',updated_at=? WHERE id=?", Date.now(), r.winner_sub ?? ''); this.audit(r.id, 'paid', 'Payout confirmed on Robinhood Chain. Winner paid.', hash); }
        else { this.store.run("UPDATE op_rewards SET state='cancelled',updated_at=? WHERE id=?", Date.now(), r.id); this.audit(r.id, 'refunded', 'Refund confirmed on Robinhood Chain.', hash); }
      } else {
        if (r.state === 'paying') { this.store.run("UPDATE op_rewards SET state='open',winner_sub=NULL,payout_tx=NULL,updated_at=? WHERE id=?", Date.now(), r.id); this.store.run("UPDATE op_reward_subs SET state='submitted',payout_tx=NULL,updated_at=? WHERE id=?", Date.now(), r.winner_sub ?? ''); }
        else this.store.run("UPDATE op_rewards SET state='open',refund_tx=NULL,updated_at=? WHERE id=?", Date.now(), r.id);
        this.audit(r.id, 'transfer_reverted', 'Escrow transfer reverted on-chain; funds are still in escrow. Retry.', hash);
      }
    }
  }
}
