import { DurableObject } from 'cloudflare:workers';
import type { DraftInput, Env, LaunchDraft, ObjectContext, Runtime } from './types';
import { objectSpecsText, normalizeObjectName, objectNameSeed, objectTagFrom, type Readiness, type SponsorStatus } from '../shared/domain';
import { ApiError, boundedBody, publicName, randomToken, requireOwner, safeTelegramUrl, safeXUrl, sha256, validAddress } from '../shared/security';
import { MAX_IMAGE_BYTES, perceptualDistance } from '../shared/capture';
import { verifyAccessToken } from './auth';
import { Store } from './store';
import { CaptureService, coinUrlFor } from './capture-service';
import { RecordService } from './record-service';
import { probeToolkit, toolkitProbeStatus } from './toolkit';
import { SponsorService } from './sponsor';
import { HouseService } from './house';
import { BurnService } from './burn';
import { UniquenessService } from './uniqueness';
import { MarketService } from './market';
import { normalizeImage } from './media';
import { visionJson } from './ai';

export const OBJECTPAD_CLASS = 'ObjectPad';
export const OBJECTPAD_INSTANCE = 'objectpad-production-v1';
export const DEFAULT_ORIGIN = 'https://objectpad.fun';
/** ObjectPad's own production domains. Always allowed, whatever the env says. */
const OWN_ORIGINS = new Set<string>(['https://objectpad.fun', 'https://www.objectpad.fun', 'https://objectpad.com', 'https://www.objectpad.com', 'https://objectpad.rork.app']);
const DEFAULT_API_ORIGIN = 'https://objectpad-backend.rork.app';
const PROJECT_ID = 'pdud1tb5ce6u6kv0hgpfl';
const KEY_PROMPT = 'You verify an "Object Key" check-in. Image 1 is the original scan of a physical object. Image 2 is a new photo taken now. Decide whether image 2 shows the very same physical object (same shape, colours, materials and distinguishing marks; lighting and angle may differ). A photo of a screen, a printout, a different item of the same kind, or a digitally altered copy is NOT a match. Return JSON only: {"same": boolean, "confidence": number from 0 to 1, "reason": short phrase}.';

const clean = (value: string | undefined): string => (value ?? '').trim().replace(/\/$/, '');
export function canonicalOrigin(env: Env): string { const value = clean(env.OBJECTPAD_ORIGIN); return /^https:\/\/[a-z0-9.-]+$/i.test(value) && !/\.rork\.(app|live)$/i.test(value) ? value : DEFAULT_ORIGIN; }
/** Origins allowed to mutate state: the canonical site, explicitly listed origins and this project's own Rork hosts. */
export function originAllowed(env: Env, origin: string | null): boolean {
  if (!origin) return false;
  if (OWN_ORIGINS.has(origin) || origin === canonicalOrigin(env) || clean(env.OBJECTPAD_ALLOWED_ORIGINS).split(',').map(clean).filter(Boolean).includes(origin)) return true;
  const project = clean(env.EXPO_PUBLIC_PROJECT_ID) || PROJECT_ID;
  return new RegExp(`^https://[a-z0-9-]*${project}[a-z0-9-]*\\.(?:rork\\.live|rork\\.app)$`).test(origin);
}

/** Transparent trending score: decayed, deduplicated views and model interactions plus current watchlist saves. Never price. */
export function trending(store: Store, now = Date.now()): { objectId: string; score: number; views: number; interactions: number; saves: number }[] {
  const since = now - 72 * 3_600_000; const scores = new Map<string, { score: number; views: number; interactions: number; saves: number }>();
  const entry = (id: string) => { let value = scores.get(id); if (!value) { value = { score: 0, views: 0, interactions: 0, saves: 0 }; scores.set(id, value); } return value; };
  for (const row of store.all<{ object_id: string; kind: string; created_at: number }>('SELECT object_id,kind,created_at FROM op_signals WHERE created_at>?', since)) { const e = entry(row.object_id); const decay = Math.exp(-(now - row.created_at) / (24 * 3_600_000)); if (row.kind === 'interact') { e.interactions++; e.score += 3 * decay; } else { e.views++; e.score += decay; } }
  for (const row of store.all<{ object_id: string; saves: number }>('SELECT object_id,COUNT(*) AS saves FROM op_watchlist GROUP BY object_id')) { const e = entry(row.object_id); e.saves = Number(row.saves); e.score += 5 * e.saves; }
  const visible = new Set(store.all<{ id: string }>("SELECT id FROM op_records WHERE state='confirmed' AND moderation_state='clear'").map(r => r.id));
  return [...scores.entries()].filter(([id]) => visible.has(id)).map(([objectId, v]) => ({ objectId, ...v, score: Math.round(v.score * 1000) / 1000 })).sort((a, b) => b.score - a.score).slice(0, 50);
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
async function body(request: Request): Promise<Record<string, unknown>> { if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError('JSON_REQUIRED', 415); try { const parsed = JSON.parse(new TextDecoder().decode(await boundedBody(request, 32_000))); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(); return parsed; } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('INVALID_JSON'); } }
const string = (input: unknown, max = 200): string => { if (typeof input !== 'string' || input.length > max) throw new ApiError('INVALID_INPUT'); return input; };

/** Strict launch-draft validation: coin name (written onchain), ticker, one-line story and optional X profile. */
export function parseLaunchDraft(data: Record<string, unknown>): LaunchDraft {
  const allowed = ['publicName', 'symbol', 'story', 'xUrl', 'telegram', 'feeWallet', 'sessionId', 'rights', 'category'];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new ApiError('INVALID_INPUT');
  let name: string; try { name = publicName(string(data.publicName, 64)); } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('METADATA_INVALID'); }
  const symbol = string(data.symbol, 10).trim().toUpperCase(); const story = string(data.story ?? '', 400).normalize('NFC').trim(); const xUrl = string(data.xUrl ?? '', 200).trim();
  const telegram = string(data.telegram ?? '', 200).trim(); const feeWallet = string(data.feeWallet ?? '', 42).trim();
  if (name.length > 32 || !/^[A-Z0-9]{2,10}$/.test(symbol) || story.length < 10 || story.length > 280 || (xUrl && !safeXUrl(xUrl))) throw new ApiError('METADATA_INVALID');
  if (telegram && !safeTelegramUrl(telegram)) throw new ApiError('LINK_INVALID');
  if (feeWallet && !validAddress(feeWallet)) throw new ApiError('WALLET_INVALID');
  return { publicName: name, symbol, story, xUrl, ...(telegram ? { telegram } : {}), ...(feeWallet ? { feeWallet: feeWallet.toLowerCase() } : {}) };
}
/** Manual record creation input (the automatic flow builds the same shape from the saved draft or AI suggestion). */
export function parseDraft(data: Record<string, unknown>): DraftInput {
  const draft = parseLaunchDraft(data); const sessionId = string(data.sessionId, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) || data.rights !== true) throw new ApiError('INVALID_INPUT');
  return { sessionId, ...draft, category: typeof data.category === 'string' ? data.category.slice(0, 40) : '', rights: true };
}

/** Read-only configuration status. A configured check is not acceptance-test evidence. */
export function readiness(runtime: Runtime, toolkitOk: boolean, sponsor: SponsorStatus | null): Readiness {
  const env = runtime.env; const capture = env.OBJECTPAD_CAPTURE_ENABLED !== 'false'; const launchSwitch = env.OBJECTPAD_LAUNCH_ENABLED !== 'false';
  const checks = [
    { id: 'storage', label: 'ObjectPad API & durable storage', ready: true },
    { id: 'auth', label: 'Optional sign-in (X, wallet, email)', ready: Boolean(runtime.privyAppId) },
    { id: 'media', label: 'Photo checks & AI content screening', ready: toolkitOk },
    { id: 'meshy', label: '3D scan engine', ready: toolkitOk },
    { id: 'uniqueness', label: 'AI duplicate-object check', ready: toolkitOk },
    { id: 'wallets', label: 'Automatic creator wallets', ready: Boolean((env.OBJECTPAD_PRIVY_APP_SECRET || env.PRIVY_APP_SECRET) && runtime.privyAppId) },
    { id: 'sponsor', label: 'Launch treasury funded', ready: Boolean(sponsor && sponsor.launchesAffordable >= 1) },
    { id: 'launch', label: 'Robinhood Chain launches (code-pinned)', ready: launchSwitch },
  ];
  // Sign-in is optional (guests launch without an account), so it gates neither scanning nor launching.
  const need = (ids: string[]) => ids.every(id => checks.find(c => c.id === id)?.ready);
  const captureReady = capture && need(['storage', 'media', 'meshy', 'uniqueness']); const launchReady = captureReady && need(['sponsor', 'launch']);
  const mode = launchReady ? 'launch_ready' : captureReady ? 'capture_ready' : 'operator_blocked';
  const blocker = mode === 'operator_blocked' ? (capture ? 'AI services are not configured, so scans are not accepted.' : 'Scanning is switched off by the operator.') : mode === 'capture_ready' ? (!need(['sponsor']) ? 'Scanning, AI checks and 3D models are live. Free launches start as soon as the launch treasury holds ETH on Robinhood Chain.' : 'Launches are switched off by the operator.') : 'Scan, AI check, 3D model and free launches are all live.';
  const address = (value?: string) => validAddress(value) ? value : null;
  return { mode, blocker, checks, chainId: 4663, productionAccepted: false, contracts: { registry: address(env.OBJECTPAD_REGISTRY_ADDRESS), vaultFactory: address(env.OBJECTPAD_VAULT_FACTORY_ADDRESS), forge: address(env.OBJECTPAD_FORGE_ADDRESS), burnEngine: address(env.OBJECTPAD_BURN_ENGINE_ADDRESS), token: address(env.OBJECTPAD_TOKEN_ADDRESS) }, feeRecipient: 'creator_wallet', sponsor };
}

/** The single ObjectPad Durable Object: API state, private capture storage, public artifacts, launches and schedulers. */
export class ObjectPad extends DurableObject<Env> {
  private readonly store: Store; private readonly runtime: Runtime; private readonly captures: CaptureService; private readonly records: RecordService; private readonly sponsor: SponsorService; private readonly house: HouseService; private readonly uniqueness: UniquenessService; private readonly market: MarketService; private readonly burns: BurnService; private queue: Promise<void> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const context = ctx as unknown as ObjectContext; this.store = new Store(context);
    this.runtime = { env, origin: canonicalOrigin(env), apiOrigin: clean(env.OBJECTPAD_API_ORIGIN) || clean(env.EXPO_PUBLIC_RORK_FUNCTIONS_URL) || DEFAULT_API_ORIGIN, privyAppId: (env.OBJECTPAD_PRIVY_APP_ID || env.VITE_PRIVY_APP_ID || '').trim(), toolkitUrl: clean(env.EXPO_PUBLIC_TOOLKIT_URL) || 'https://toolkit.rork.com', toolkitKey: (env.EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY ?? '').trim(), privateBucket: this.store.bucket('private'), artifactBucket: this.store.bucket('artifacts') };
    this.captures = new CaptureService(this.store, this.runtime); this.sponsor = new SponsorService(this.store, this.runtime); this.records = new RecordService(this.store, this.runtime, this.captures, this.sponsor);
    this.uniqueness = new UniquenessService(this.store, this.runtime); this.market = new MarketService(this.store, this.runtime); this.house = new HouseService(this.store, this.runtime, this.sponsor); this.burns = new BurnService(this.store, this.runtime, this.sponsor);
    void context.blockConcurrencyWhile(async () => { this.store.migrate(); });
  }
  private exclusive<T>(action: () => Promise<T>): Promise<T> { const run = this.queue.then(action, action); this.queue = run.then(() => {}, () => {}); return run; }
  private failure(error: unknown): Response {
    const status = error instanceof ApiError ? error.status : 503; const code = error instanceof ApiError ? error.code : 'SERVICE_UNAVAILABLE';
    if (!(error instanceof ApiError)) console.error('objectpad.unhandled', error instanceof Error ? error.message.slice(0, 300) : 'unknown');
    try { this.store.metric(status === 401 || status === 403 ? 'security_rejected' : status >= 500 ? 'request_failed_server' : 'request_failed_client'); } catch { /* metrics never mask the response */ }
    return json({ error: code }, status);
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/^\/api(?=\/|$)/, ''); const method = request.method;
    try {
      // Network-bound work (downloads, AI screening, provider submission, chain reads) runs outside the serialized section.
      if (method === 'GET' && /^\/artifacts\/[a-f0-9]{64}$/.test(path)) return await this.artifact(request, path.slice(11));
      if (method === 'GET' && path === '/status') return json(readiness(this.runtime, await probeToolkit(this.runtime), await this.sponsor.status().catch(() => null)));
      if (method === 'GET' && path === '/market') return json(await this.market.snapshot());
      if (method === 'GET' && path === '/house') { if (this.house.pending()) await this.schedule(1_000); return json({ coins: this.house.list() }); }
      const logo = path.match(/^\/logos\/(0x[a-f0-9]{40})$/); if (method === 'GET' && logo) return await this.market.logo(logo[1]);
      const curveTrades = path.match(/^\/curves\/(0x[a-fA-F0-9]{40})\/trades$/); if (method === 'GET' && curveTrades) return json(await this.market.curveTrades(curveTrades[1]));
      const upload = path.match(/^\/uploads\/([a-f0-9-]{36})$/); if (method === 'PUT' && upload) return await this.upload(request, upload[1]);
      const reconstruct = path.match(/^\/sessions\/([a-f0-9-]{36})\/reconstruct$/); if (method === 'POST' && reconstruct) return await this.reconstruct(request, reconstruct[1]);
      const regenerate = path.match(/^\/sessions\/([a-f0-9-]{36})\/regenerate$/); if (method === 'POST' && regenerate) return await this.regenerate(request, regenerate[1]);
      const checkin = path.match(/^\/records\/([a-f0-9]{64})\/checkin$/); if (method === 'PUT' && checkin) return await this.checkin(request, checkin[1]);
    } catch (error) { return this.failure(error); }
    return this.exclusive(async () => { try { return await this.route(request, path); } catch (error) { return this.failure(error); } });
  }
  /** Durable alarm: provider polling, automatic launches, chain reconciliation and cleanup. */
  async onAlarm(): Promise<void> {
    await this.exclusive(async () => {
      try { await this.captures.poll(); await this.autoLaunch(); await this.records.poll(); await this.house.run().catch(error => console.warn('objectpad.house', error instanceof Error ? error.message.slice(0, 160) : '')); await this.burns.run().catch(error => console.warn('objectpad.burn', error instanceof Error ? error.message.slice(0, 160) : '')); const now = Date.now(); this.store.run('DELETE FROM op_rate_limits WHERE expires<?', now); this.store.run('DELETE FROM op_wallet_nonces WHERE expires<?', now); this.store.run('DELETE FROM op_upload_tickets WHERE expires<?', now - 3_600_000); }
      finally { if (this.records.hasPending()) await this.schedule(6_000); else if (this.captures.hasActiveJobs()) await this.schedule(8_000); else if (this.house.pending()) await this.schedule(15_000); else if (this.burns.token()) await this.schedule(60_000); else if (this.store.one("SELECT id FROM op_capture_sessions WHERE state IN ('model_review','approved') AND json_extract(payload,'$.autoLaunch')=1 AND NOT EXISTS (SELECT 1 FROM op_records r WHERE r.session_id=op_capture_sessions.id AND r.state='confirmed') LIMIT 1")) await this.schedule(300_000); }
    });
  }
  private async schedule(delay: number): Promise<void> { try { await this.env.DO?.setAlarm(OBJECTPAD_CLASS, OBJECTPAD_INSTANCE, Date.now() + delay); } catch (error) { console.warn('objectpad.alarm.unavailable', error instanceof Error ? error.message.slice(0, 120) : ''); } }
  /** Guest bearer tokens (g_…) are issued by POST /guests; only their hash is stored. Anything else must be a Privy token. */
  private async identity(request: Request): Promise<string> {
    const bearer = request.headers.get('Authorization') ?? '';
    if (bearer.startsWith('Bearer g_')) { const token = bearer.slice(7); if (!/^g_[a-f0-9]{64}$/.test(token)) throw new ApiError('UNAUTHORIZED', 401); const row = this.store.one<{ id: string }>('SELECT id FROM op_guests WHERE token_hash=?', await sha256(token)); if (!row) throw new ApiError('UNAUTHORIZED', 401); return `guest:${row.id}`; }
    return this.user(request);
  }
  private async guestOwner(token: string): Promise<string | null> { if (!/^g_[a-f0-9]{64}$/.test(token)) return null; const row = this.store.one<{ id: string }>('SELECT id FROM op_guests WHERE token_hash=?', await sha256(token)); return row ? `guest:${row.id}` : null; }
  /** Daily, hashed network identity used to rate-limit account-free actions. Never stored in clear. */
  private async visitor(request: Request): Promise<string> { return sha256(`objectpad:visitor:${Math.floor(Date.now() / 86_400_000)}:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`); }
  /**
   * Control of one capture session: its owner (account or guest token) or the phone paired to it by QR (device secret).
   * Returns the session owner so downstream services keep their ownership checks.
   */
  private async sessionAccess(request: Request, id: string): Promise<string> {
    const row = this.store.one<{ owner: string; claim_hash: string | null }>('SELECT owner,claim_hash FROM op_capture_sessions WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404);
    const device = request.headers.get('X-Capture-Device');
    if (device && /^[a-f0-9]{64}$/.test(device) && row.claim_hash && await sha256(device) === row.claim_hash) return row.owner;
    const who = await this.identity(request).catch(() => null); if (who && who === row.owner) return row.owner;
    throw new ApiError('NOT_FOUND', 404);
  }
  /** Session view plus launch progress and the on-chain object record, so one endpoint drives desktop and phone alike. */
  private async sessionView(id: string): Promise<Record<string, unknown>> {
    const view = this.captures.publicSession(id); const record = this.store.one<{ id: string; state: string; payload: string }>('SELECT id,state,payload FROM op_records WHERE session_id=?', id);
    if (!record) {
      // Preview of exactly what the launch will write on-chain, once the 3D model exists.
      const { session } = this.captures.load(id); let onchain: { objectName: string; objectTag: string; specs: string } | null = null;
      if (session.model && session.manifestHash) { const base = normalizeObjectName(session.suggestion?.catalog || session.suggestion?.object || '') || 'Physical Object'; const taken = Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_records WHERE json_extract(commitment,'$.objectName')=? OR json_extract(commitment,'$.objectName') LIKE ?", base, `${base} #%`)?.n ?? 0); const objectName = taken ? `${base} #${taken + 1}` : base; onchain = { objectName, objectTag: objectTagFrom(await sha256(objectNameSeed(objectName, session.model.originalHash, session.manifestHash))) , specs: objectSpecsText({ triangles: session.model.triangles, bounds: session.model.bounds, textures: session.model.textures, materials: session.suggestion?.materials, colors: session.suggestion?.colors, views: session.views.length }) }; }
      return { ...view, onchain, launch: null };
    }
    const payload = JSON.parse(record.payload) as { token?: string; launchHash?: string; launchDataSuffix?: string; commitment: { objectName?: string; objectTag?: string; publicName: string }; symbol: string; feeVault?: string; feeRecipientKind?: string };
    const tx = this.store.one<{ state: string; tx_hash: string | null }>("SELECT state,tx_hash FROM op_transactions WHERE record_id=? AND kind='launch'", record.id);
    return { ...view, launch: { recordId: record.id, recordState: record.state, state: tx?.state ?? 'prepared', hash: tx?.tx_hash ?? null, token: payload.token ?? null, objectName: payload.commitment.objectName ?? null, objectTag: payload.commitment.objectTag ?? null, suffix: payload.launchDataSuffix ?? null, feeWallet: payload.feeVault ?? null, feeRecipientKind: payload.feeRecipientKind ?? 'creator' } };
  }
  private async user(request: Request): Promise<string> { if (!this.runtime.privyAppId) throw new ApiError('AUTH_NOT_CONFIGURED', 503); const bearer = request.headers.get('Authorization'); if (!bearer?.startsWith('Bearer ')) throw new ApiError('UNAUTHORIZED', 401); return verifyAccessToken(bearer.slice(7), this.runtime.privyAppId); }
  private assertOrigin(request: Request): void { if (!originAllowed(this.env, request.headers.get('Origin'))) throw new ApiError('ORIGIN_REJECTED', 403); }
  private handoffOrigin(request: Request): string { const origin = request.headers.get('Origin'); return origin && originAllowed(this.env, origin) ? origin : this.runtime.origin; }
  /** Creates the public profile on first use: a generated alias, no forms. Rights are accepted when a scan starts. */
  private async ensureProfile(owner: string, rights = false): Promise<{ publicId: string; alias: string; wallet: string | null; rightsAccepted: boolean }> {
    const existing = this.store.one<{ public_id: string; alias: string; wallet: string | null; rights: number }>('SELECT public_id,alias,wallet,rights FROM op_profiles WHERE owner=?', owner);
    if (existing) { if (rights && !existing.rights) this.store.run('UPDATE op_profiles SET rights=1 WHERE owner=?', owner); return { publicId: existing.public_id, alias: existing.alias, wallet: existing.wallet, rightsAccepted: Boolean(existing.rights) || rights }; }
    const publicId = await sha256(`objectpad:identity:${owner}`); const alias = `maker-${publicId.slice(0, 6)}`;
    this.store.run('INSERT OR IGNORE INTO op_profiles(owner,public_id,alias,rights,created_at) VALUES (?,?,?,?,?)', owner, publicId, alias, rights ? 1 : 0, Date.now()); this.store.metric('profile_created');
    return { publicId, alias, wallet: null, rightsAccepted: rights };
  }
  private async artifact(request: Request, hash: string): Promise<Response> {
    const artifact = this.store.one<{ storage_key: string; kind: string; public: number; session_id: string }>('SELECT * FROM op_artifacts WHERE hash=?', hash); if (!artifact) throw new ApiError('NOT_FOUND', 404);
    if (!artifact.public) await this.sessionAccess(request, artifact.session_id);
    const object = await this.runtime.artifactBucket.get(artifact.storage_key); if (!object) throw new ApiError('ARTIFACT_UNAVAILABLE', 503);
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'Content-Length': String(object.size), 'Cache-Control': artifact.public ? 'public,max-age=31536000,immutable' : 'private,no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin', ETag: `"${hash}"` } });
  }
  /** Phone upload: authorised by the single-use ticket plus the paired device secret. No sign-in on the phone. */
  private async upload(request: Request, ticketId: string): Promise<Response> {
    this.assertOrigin(request);
    const started = await this.exclusive(async () => { const begun = await this.captures.beginUpload(ticketId, request); this.store.rate(`mutation:${begun.owner}`, 120, 60_000); return begun; });
    const normalized = await this.captures.normalizeUpload(request);
    return json(await this.exclusive(() => this.captures.finishUpload(started, request.headers.get('X-Capture-Device'), normalized)));
  }
  /** Coverage + duplicate checks → AI object fingerprint and archive comparison → paid Meshy submission. Idempotent. */
  private async reconstruct(request: Request, id: string): Promise<Response> {
    this.assertOrigin(request); const owner = await this.sessionAccess(request, id);
    const started = await this.exclusive(async () => { this.store.rate(`mutation:${owner}`, 120, 60_000); return this.captures.beginReconstruct(id, owner); });
    if (!started) return json(await this.sessionView(id));
    let screening: Awaited<ReturnType<UniquenessService['screen']>>;
    try { screening = await this.uniqueness.screen(id, owner); } catch (error) { await this.exclusive(async () => this.captures.screeningFailed(id, error)); throw error; }
    const prepared = await this.exclusive(() => this.captures.prepareReconstruct(id, screening, value => this.uniqueness.save(id, value)));
    let result: { providerId?: string; error?: unknown }; try { result = { providerId: await this.captures.submitTask(prepared.images) }; } catch (error) { result = { error }; }
    await this.exclusive(async () => this.captures.finishReconstruct(id, prepared.jobId, result)); await this.schedule(15_000);
    if (result.error instanceof ApiError && result.error.status < 500 && result.error.code !== 'PROVIDER_REQUEST_FAILED') throw result.error;
    return json(await this.sessionView(id));
  }
  /** Fresh Meshy rebuild from the same accepted photos. */
  private async regenerate(request: Request, id: string): Promise<Response> {
    this.assertOrigin(request); const owner = await this.sessionAccess(request, id);
    const prepared = await this.exclusive(async () => { this.store.rate(`mutation:${owner}`, 120, 60_000); return this.captures.beginRegenerate(id); });
    let result: { providerId?: string; error?: unknown }; try { result = { providerId: await this.captures.submitTask(prepared.images) }; } catch (error) { result = { error }; }
    await this.exclusive(async () => this.captures.finishReconstruct(id, prepared.jobId, result)); await this.schedule(12_000);
    return json(await this.sessionView(id));
  }
  /** Object Key check-in: the creator photographs the physical object again; the AI compares it with the original scan. */
  private async checkin(request: Request, id: string): Promise<Response> {
    this.assertOrigin(request); const owner = await this.identity(request);
    const { row } = this.records.load(id, owner); this.store.rate(`checkin:${owner}`, 12, 3_600_000);
    if (request.headers.get('content-type') !== 'image/jpeg') throw new ApiError('UNSUPPORTED_IMAGE', 415);
    const normalized = await normalizeImage(await boundedBody(request, MAX_IMAGE_BYTES), this.runtime);
    if (!normalized.scan.accepted) throw new ApiError(normalized.scan.code, 422);
    const frames = this.store.all<{ view_id: string; hash: string; storage_key: string; payload: string }>('SELECT view_id,hash,storage_key,payload FROM op_capture_views WHERE session_id=?', row.session_id);
    // Replaying a stored scan frame (exactly or near-exactly) is not a fresh photo of the object.
    if (frames.some(frame => frame.hash === normalized.hash || perceptualDistance((JSON.parse(frame.payload) as { signature: string }).signature, normalized.signature) < 4)) throw new ApiError('CHECKIN_REPLAY', 422);
    const front = frames.find(frame => frame.view_id === 'front'); const original = front ? await this.runtime.privateBucket.get(front.storage_key) : null; if (!original) throw new ApiError('CAPTURE_STORAGE_MISSING', 503);
    const verdict = await visionJson(this.runtime, KEY_PROMPT, 'Image 1: original scan. Image 2: new check-in photo.', [new Uint8Array(await original.arrayBuffer()), normalized.bytes], 200);
    const confidence = Math.max(0, Math.min(1, Number(verdict.confidence) || 0)); const matched = verdict.same === true && confidence >= 0.75;
    await this.exclusive(async () => {
      this.store.run('INSERT INTO op_checkins(id,record_id,matched,confidence,created_at) VALUES (?,?,?,?,?)', crypto.randomUUID(), id, matched ? 1 : 0, Math.round(confidence * 100), Date.now());
      if (matched) { const fresh = this.records.load(id); fresh.payload.checkin = { at: Date.now(), confidence: Math.round(confidence * 100) / 100 }; this.store.run('UPDATE op_records SET payload=? WHERE id=?', JSON.stringify(fresh.payload), id); }
      this.store.metric(matched ? 'checkin_matched' : 'checkin_rejected');
    });
    return json({ matched, confidence: Math.round(confidence * 100) / 100, reason: typeof verdict.reason === 'string' ? verdict.reason.slice(0, 120) : '' });
  }
  private draftFor(sessionId: string): DraftInput {
    const { session } = this.captures.load(sessionId); const draft = session.launchDraft; const suggestion = session.suggestion;
    if (draft) return { sessionId, ...draft, category: suggestion?.object ?? '', rights: true };
    if (!suggestion) throw new ApiError('LAUNCH_DRAFT_REQUIRED', 409);
    return { sessionId, publicName: suggestion.name, symbol: suggestion.ticker, story: suggestion.story.length >= 10 ? suggestion.story : `A real ${suggestion.object}, scanned on ObjectPad.`, xUrl: '', category: suggestion.object, rights: true };
  }
  /** Creates the Object Record (if needed) and sends the sponsored launch for one validated capture. */
  private async launchSession(sessionId: string, owner: string): Promise<{ recordId: string; state: string; hash?: string }> {
    const existing = this.store.one<{ id: string }>('SELECT id FROM op_records WHERE session_id=?', sessionId);
    const recordId = existing?.id ?? (await this.records.create(owner, this.draftFor(sessionId))).commitment.objectId;
    const result = await this.records.launch(recordId, owner); await this.schedule(4_000); return { recordId, ...result };
  }
  /** Launches validated captures automatically (up to three attempts each); the creator can always retry manually. */
  private async autoLaunch(): Promise<void> {
    const rows = this.store.all<{ id: string }>("SELECT id FROM op_capture_sessions WHERE state IN ('model_review','approved') ORDER BY created_at ASC LIMIT 5"); if (!rows.length) return;
    // An empty sponsor wallet or spent daily budget pauses automatic launches without using up retry attempts.
    const funded = await this.sponsor.status().then(s => s.launchesAffordable >= 1 && s.usedToday < s.dailyLimit).catch(() => false);
    for (const row of rows) {
      const { session } = this.captures.load(row.id); if (session.autoLaunch === false || (session.autoLaunchAttempts ?? 0) >= 3) continue;
      const record = this.store.one<{ id: string; state: string }>('SELECT id,state FROM op_records WHERE session_id=?', row.id);
      if (record && (record.state !== 'prepared' || this.store.one("SELECT id FROM op_transactions WHERE record_id=? AND kind='launch' AND tx_hash IS NOT NULL", record.id))) continue;
      if (!funded) { if (session.failureCode !== 'SPONSOR_EMPTY') { session.failureCode = 'SPONSOR_EMPTY'; this.captures.save(session); } continue; }
      session.autoLaunchAttempts = (session.autoLaunchAttempts ?? 0) + 1; delete session.failureCode; this.captures.save(session);
      try { await this.launchSession(row.id, session.owner); this.store.metric('autolaunch_submitted'); }
      catch (error) { const code = error instanceof ApiError ? error.code : 'LAUNCH_FAILED'; const fresh = this.captures.load(row.id).session; fresh.failureCode = code; this.captures.save(fresh); this.store.metric(`autolaunch_${code.toLowerCase().slice(0, 40)}`); console.warn('objectpad.autolaunch', code); }
    }
  }
  private engineCache: { at: number; value: Record<string, unknown> } | null = null;
  private async engineCheck(): Promise<Record<string, unknown>> {
    if (this.engineCache && Date.now() - this.engineCache.at < 120_000) return this.engineCache.value;
    const auth = { Authorization: `Bearer ${this.runtime.toolkitKey}` }; const t0 = Date.now();
    const mesh = await fetch(`${this.runtime.toolkitUrl}/v2/meshy/openapi/v1/multi-image-to-3d/00000000-0000-0000-0000-000000000000`, { headers: auth, signal: AbortSignal.timeout(10_000) }).then(r => r.status, () => 0); const meshMs = Date.now() - t0;
    const t1 = Date.now(); let vision = 0; let visionModel = '';
    for (const model of ['google/gemini-3.5-flash', 'openai/gpt-5.4-mini']) { vision = await fetch(`${this.runtime.toolkitUrl}/v2/vercel/v1/chat/completions`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Reply ok' }] }), signal: AbortSignal.timeout(15_000) }).then(r => r.status, () => 0); visionModel = model; if (vision === 200) break; }
    const value = { checkedAt: Date.now(), keyConfigured: Boolean(this.runtime.toolkitKey), engine3d: { status: mesh, authorized: mesh !== 0 && mesh !== 401 && mesh !== 403, ms: meshMs }, vision: { status: vision, ok: vision === 200, model: visionModel, ms: Date.now() - t1 } };
    this.engineCache = { at: Date.now(), value }; return value;
  }
  private operator(owner: string): void { if (!(this.env.OBJECTPAD_OPERATOR_DIDS ?? '').split(',').map(v => v.trim()).filter(Boolean).includes(owner)) throw new ApiError('FORBIDDEN', 403); }
  /** Opportunistic polling while a creator watches progress, in addition to the durable alarm. */
  private async pollIfDue(): Promise<void> {
    if (!this.captures.hasActiveJobs() && !this.records.hasPending() && !this.store.one("SELECT id FROM op_capture_sessions WHERE state IN ('model_review','approved','screening') LIMIT 1")) return;
    const last = this.store.one<{ value: number }>("SELECT value FROM op_scheduler WHERE name='last_poll'")?.value ?? 0; if (Date.now() - last < 3_000) return;
    this.store.run("INSERT INTO op_scheduler(name,value) VALUES ('last_poll',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", Date.now());
    await this.captures.poll(); await this.autoLaunch(); if (this.records.hasPending()) await this.records.poll();
    if (this.records.hasPending()) await this.schedule(6_000); else if (this.captures.hasActiveJobs()) await this.schedule(12_000);
  }
  private async route(request: Request, path: string): Promise<Response> {
    const url = new URL(request.url); const method = request.method;
    if (method === 'GET' && (path === '/objects' || path === '/activity')) {
      const cursor = Number(url.searchParams.get('cursor') ?? Number.MAX_SAFE_INTEGER); if (!Number.isSafeInteger(cursor) || cursor < 0) throw new ApiError('CURSOR_INVALID');
      const q = (url.searchParams.get('q') ?? '').slice(0, 160).toLowerCase(); const category = (url.searchParams.get('category') ?? '').slice(0, 40);
      const rows = this.store.all<{ id: string; rowid: number }>("SELECT id,rowid FROM op_records WHERE state='confirmed' AND moderation_state='clear' AND rowid<? AND (?='' OR lower(commitment||payload) LIKE ?) AND (?='' OR json_extract(commitment,'$.category')=?) ORDER BY rowid DESC LIMIT 25", cursor, q, `%${q.replace(/[%_]/g, '')}%`, category, category);
      return json({ items: rows.map(r => this.records.publicRecord(r.id)), nextCursor: rows.length === 25 ? String(rows[rows.length - 1].rowid) : null, ranking: 'newest_confirmed' });
    }
    const objectMatch = path.match(/^\/objects\/([a-f0-9]{64})$/); if (method === 'GET' && objectMatch) return json(this.records.publicRecord(objectMatch[1]));
    // Permanent short coin link (/o/<12 hex>), fixed before launch. Unlaunched objects are only reported as reserved.
    const shortMatch = path.match(/^\/objects\/short\/([a-f0-9]{12})$/);
    if (method === 'GET' && shortMatch) {
      const record = this.store.all<{ id: string; state: string }>('SELECT id,state FROM op_records WHERE id LIKE ? LIMIT 2', `${shortMatch[1]}%`);
      if (record.length === 1 && record[0].state === 'confirmed') return json({ state: 'live', objectId: record[0].id, record: this.records.publicRecord(record[0].id) });
      if (record.length === 1 || this.store.one('SELECT id FROM op_capture_sessions WHERE object_id LIKE ? LIMIT 1', `${shortMatch[1]}%`)) return json({ state: 'reserved' });
      throw new ApiError('NOT_FOUND', 404);
    }
    // $OBJECTPAD buyback & burn feed (public, real transactions only).
    if (method === 'GET' && path === '/burns') { if (this.burns.due()) await this.schedule(1_000); return json({ ...this.burns.summary(), items: this.burns.list() }); }
    // Live engine check from inside the backend: does the AI gateway and the 3D engine accept our key right now? Cached 2 min.
    if (method === 'GET' && path === '/engine') return json(await this.engineCheck());
    // Public pipeline heartbeat: anonymous recent capture states and failure codes (no ids, photos or owners). Live proof + diagnostics.
    if (method === 'GET' && path === '/pipeline') {
      const recent = this.store.all<{ state: string; payload: string; created_at: number }>('SELECT state,payload,created_at FROM op_capture_sessions ORDER BY created_at DESC LIMIT 12').map(row => { const s = JSON.parse(row.payload) as { failureCode?: string; job?: { state: string; progress: number }; views?: unknown[]; failureRetries?: number }; return { state: row.state, failureCode: s.failureCode ?? null, job: s.job ?? null, views: s.views?.length ?? 0, retries: s.failureRetries ?? 0, ageSec: Math.round((Date.now() - row.created_at) / 1000) }; });
      const jobs = this.store.all<{ state: string; updated_at: number }>('SELECT state,updated_at FROM op_reconstruction_jobs ORDER BY updated_at DESC LIMIT 12');
      const metrics = this.store.all<{ name: string; value: number }>("SELECT name,value FROM op_metrics WHERE name LIKE 'reconstruction%' OR name LIKE 'glb%' OR name LIKE 'provider%' OR name LIKE 'model%' OR name LIKE 'screening%' OR name LIKE 'frame%' OR name LIKE 'pipeline%' ORDER BY name");
      return json({ recent, jobs, metrics });
    }
    // Account-free creators: one guest token per browser, rate-limited per network.
    if (method === 'POST' && path === '/guests') { this.assertOrigin(request); this.store.rate(`guests:${await this.visitor(request)}`, 30, 86_400_000); const token = `g_${randomToken()}`; const id = crypto.randomUUID(); this.store.run('INSERT INTO op_guests(id,token_hash,created_at) VALUES (?,?,?)', id, await sha256(token), Date.now()); this.store.metric('guest_created'); return json({ token }); }
    // The phone joins a capture with the single-use QR token alone: no account, no sign-in.
    const claimMatch = path.match(/^\/sessions\/([a-f0-9-]{36})\/claim$/);
    if (method === 'POST' && claimMatch) { this.assertOrigin(request); this.store.rate(`claims:${await this.visitor(request)}`, 60, 3_600_000); const data = await body(request); return json(await this.captures.claim(claimMatch[1], string(data.token, 64))); }
    const deviceMatch = path.match(/^\/sessions\/([a-f0-9-]{36})(?:\/(handoff|tickets|cancel|draft|launch|views|rescan)(?:\/([a-z-]+))?)?$/);
    if (deviceMatch && (request.headers.get('X-Capture-Device') || (request.headers.get('Authorization') ?? '').startsWith('Bearer g_') || (request.headers.get('Authorization') ?? '').startsWith('Bearer '))) {
      const [, id, action, view] = deviceMatch;
      if (method !== 'GET') this.assertOrigin(request);
      const owner = await this.sessionAccess(request, id);
      if (method !== 'GET') this.store.rate(`mutation:${owner}`, 120, 60_000);
      if (!action && method === 'GET') { await this.captures.ensureObjectId(id); await this.pollIfDue(); return json(await this.sessionView(id)); }
      if (method === 'POST') {
        if (action === 'handoff') return json(await this.captures.rotateHandoff(id, owner, this.handoffOrigin(request)));
        if (action === 'rescan') return json(await this.captures.rescan(id, owner));
        if (action === 'cancel') { await this.captures.cancel(id, owner); return json({ state: 'cancelled', providerCancellation: 'not_guaranteed' }); }
        if (action === 'tickets') { const data = await body(request); return json(await this.captures.ticket(id, owner, string(data.view, 30), request.headers.get('X-Capture-Device'))); }
        if (action === 'draft') { const data = await body(request); const { session } = this.captures.load(id, owner); if (this.store.one('SELECT id FROM op_records WHERE session_id=?', id)) throw new ApiError('RECORD_ALREADY_COMMITTED', 409); if (['cancelled', 'blocked', 'failed', 'expired'].includes(session.state)) throw new ApiError('CAPTURE_CLOSED', 409); session.launchDraft = parseLaunchDraft(data); this.captures.save(session); return json(await this.sessionView(id)); }
        if (action === 'launch') {
          const { session } = this.captures.load(id, owner);
          // While the 3D model is still building, a launch tap doesn't fail: the name/ticker/story are sealed now and
          // the sponsored launch fires itself the instant the model finishes (autoLaunch, below), no second tap needed.
          const building = ['screening', 'reconstructing', 'validating'].includes(session.state);
          if (!building && !['model_review', 'approved'].includes(session.state)) throw new ApiError('MODEL_NOT_READY', 409);
          if ((request.headers.get('content-type') ?? '').startsWith('application/json')) { const data = await body(request); if (Object.keys(data).length && !this.store.one('SELECT id FROM op_records WHERE session_id=?', id)) { session.launchDraft = parseLaunchDraft(data); this.captures.save(session); } }
          if (owner.startsWith('guest:')) this.store.rate(`guest-launch:${await this.visitor(request)}`, 5, 86_400_000);
          session.autoLaunch = true; this.captures.save(session);
          if (building) { this.store.metric('launch_queued_building'); return json({ state: 'queued', reason: 'MODEL_BUILDING', session: await this.sessionView(id) }); }
          try { const result = await this.launchSession(id, owner); return json({ ...result, session: await this.sessionView(id) }); }
          catch (error) {
            // No ETH in the sponsor wallet (or today's free launches used up): the coin is sealed and launches automatically later.
            if (error instanceof ApiError && ['SPONSOR_EMPTY', 'LAUNCH_BUDGET_REACHED', 'PONS_LAUNCH_PAUSED'].includes(error.code)) { const fresh = this.captures.load(id).session; fresh.failureCode = error.code; this.captures.save(fresh); await this.schedule(60_000); return json({ state: 'queued', reason: error.code, session: await this.sessionView(id) }); }
            throw error;
          }
        }
      }
      // Live photo feed for the desktop studio: the session owner (or its paired phone) reads back each accepted angle as JPEG.
      if (method === 'GET' && action === 'views' && view) { this.store.rate(`view-read:${owner}`, 600, 3_600_000); const image = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_capture_views WHERE session_id=? AND view_id=?', id, view); const file = image ? await this.runtime.privateBucket.get(image.storage_key) : null; if (!file) throw new ApiError('NOT_FOUND', 404); return new Response(file.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private,no-store', 'X-Content-Type-Options': 'nosniff' } }); }
      if (method === 'DELETE' && action === 'views' && view) return json(await this.captures.retake(id, owner, view, request.headers.get('X-Capture-Device')));
      throw new ApiError('NOT_FOUND', 404);
    }
    const tokenMatch = path.match(/^\/tokens\/(0x[a-fA-F0-9]{40})$/); if (method === 'GET' && tokenMatch) { const launch = this.store.one<{ record_id: string }>('SELECT record_id FROM op_launches WHERE token=?', tokenMatch[1].toLowerCase()); if (!launch) throw new ApiError('NOT_FOUND', 404); return json(this.records.publicRecord(launch.record_id)); }
    const signalMatch = path.match(/^\/objects\/([a-f0-9]{64})\/signal$/);
    if (method === 'POST' && signalMatch) { const data = await body(request); const kind = data.kind === 'interact' ? 'interact' : data.kind === 'view' ? 'view' : null; if (!kind) throw new ApiError('SIGNAL_INVALID'); this.records.publicRecord(signalMatch[1]); const day = Math.floor(Date.now() / 86_400_000); const actor = await sha256(`objectpad:signal:${day}:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}:${(request.headers.get('User-Agent') ?? '').slice(0, 200)}`); this.store.rate(`signal:${actor}`, 120, 3_600_000); this.store.run('INSERT OR IGNORE INTO op_signals(object_id,kind,actor,day,created_at) VALUES (?,?,?,?,?)', signalMatch[1], kind, actor, day, Date.now()); return json({ accepted: true }); }
    if (method === 'GET' && path === '/messages') return json({ items: this.store.all("SELECT m.id,p.public_id AS creatorId,p.alias,m.text,m.created_at AS createdAt FROM op_messages m JOIN op_profiles p ON p.owner=m.owner WHERE m.hidden=0 ORDER BY m.created_at DESC LIMIT 60").reverse() });
    if (method === 'GET' && path === '/trending') return json({ items: trending(this.store), window: '72h', weights: { view: 1, interact: 3, save: 5 }, decayHours: 24 });
    const creatorMatch = path.match(/^\/creators\/([a-f0-9]{64})$/); if (method === 'GET' && creatorMatch) { const profile = this.store.one<{ owner: string; alias: string; public_id: string }>('SELECT owner,alias,public_id FROM op_profiles WHERE public_id=?', creatorMatch[1]); if (!profile) throw new ApiError('NOT_FOUND', 404); return json({ publicId: profile.public_id, alias: profile.alias, objects: this.store.all<{ id: string }>("SELECT id FROM op_records WHERE owner=? AND state='confirmed' AND moderation_state='clear'", profile.owner).map(row => this.records.publicRecord(row.id)) }); }
    const owner = await this.identity(request);
    if (method !== 'GET') { this.assertOrigin(request); this.store.rate(`mutation:${owner}`, 120, 60_000); }
    // A guest who signs in keeps every scan that hasn't launched yet: they move into the account's inventory.
    if (path === '/account/adopt' && method === 'POST') {
      if (owner.startsWith('guest:')) throw new ApiError('SIGN_IN_REQUIRED', 401); const data = await body(request); await this.ensureProfile(owner, true); let adopted = 0;
      const sessionId = typeof data.sessionId === 'string' && /^[a-f0-9-]{36}$/.test(data.sessionId) ? data.sessionId : undefined;
      if (typeof data.guestToken === 'string') { const guest = await this.guestOwner(string(data.guestToken, 80)); if (guest) adopted += this.captures.adopt(guest, owner, sessionId); }
      // A phone paired by QR can hand its capture to the account it just signed in with.
      if (sessionId && typeof data.deviceSecret === 'string') { const row = this.store.one<{ owner: string; claim_hash: string | null }>('SELECT owner,claim_hash FROM op_capture_sessions WHERE id=?', sessionId); if (row && row.owner.startsWith('guest:') && row.claim_hash && await sha256(string(data.deviceSecret, 64)) === row.claim_hash) adopted += this.captures.adopt(row.owner, owner, sessionId); }
      return json({ adopted });
    }
    if (path === '/account' && method === 'POST') { const profile = await this.ensureProfile(owner); let wallet = profile.wallet; if (!wallet) { try { wallet = await this.records.creatorWallet(owner); } catch { wallet = null; } } return json({ ...profile, wallet }); }
    if (path === '/profile' && method === 'GET') return json(this.store.one('SELECT public_id AS publicId,alias,wallet,rights AS rightsAccepted FROM op_profiles WHERE owner=?', owner) ?? null);
    if (path === '/profile' && method === 'POST') { const data = await body(request); const alias = string(data.alias, 32).trim(); if (!/^[a-zA-Z0-9_ -]{2,32}$/.test(alias)) throw new ApiError('PROFILE_INVALID'); const profile = await this.ensureProfile(owner); this.store.run('UPDATE op_profiles SET alias=? WHERE owner=?', alias, owner); return json({ ...profile, alias }); }
    if (path === '/sessions' && method === 'POST') { const data = await body(request); if (data.rights !== true) throw new ApiError('RIGHTS_AND_DRAFT_REQUIRED'); if (owner.startsWith('guest:')) this.store.rate(`guest-sessions:${await this.visitor(request)}`, 15, 86_400_000); await this.ensureProfile(owner, true); return json(await this.captures.create(owner, string(data.draftId, 36), true, this.handoffOrigin(request), data.autoLaunch === true)); }
    if (path === '/sessions' && method === 'GET') { const rows = this.store.all<{ id: string }>("SELECT id FROM op_capture_sessions WHERE owner=? AND state NOT IN ('cancelled') ORDER BY created_at DESC LIMIT 30", owner); for (const row of rows) await this.captures.ensureObjectId(row.id); return json({ items: await Promise.all(rows.map(row => this.sessionView(row.id))) }); }
    const recoverMatch = path.match(/^\/sessions\/([a-f0-9-]{36})\/recover-device$/);
    if (recoverMatch && method === 'POST') return json(await this.captures.recoverDevice(recoverMatch[1], owner));
    if (path === '/records' && method === 'POST') { const data = parseDraft(await body(request)); return json(await this.records.create(owner, data)); }
    if (path === '/records' && method === 'GET') return json({ items: this.store.all<{ id: string }>('SELECT id FROM op_records WHERE owner=? ORDER BY rowid DESC LIMIT 50', owner).map(row => this.records.ownerRecord(row.id, owner)) });
    const recordMatch = path.match(/^\/records\/([a-f0-9]{64})(?:\/(launch))?$/);
    if (recordMatch) { const [, id, action] = recordMatch; if (method === 'GET' && !action) { await this.pollIfDue(); return json(this.records.ownerRecord(id, owner)); } if (method === 'POST' && action === 'launch') { const result = await this.records.launch(id, owner); await this.schedule(4_000); return json(result); } }
    if (path === '/messages' && method === 'POST') { this.store.rate(`message:${owner}`, 4, 60_000); const data = await body(request); const text = string(data.text, 600).normalize('NFC').trim(); if (!text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) throw new ApiError('MESSAGE_INVALID'); await this.ensureProfile(owner); this.store.run('INSERT INTO op_messages(id,owner,text,created_at) VALUES (?,?,?,?)', crypto.randomUUID(), owner, text, Date.now()); return json({ accepted: true }); }
    if (path === '/watchlist' && method === 'GET') return json({ ids: this.store.all<{ object_id: string }>('SELECT object_id FROM op_watchlist WHERE owner=?', owner).map(r => r.object_id) });
    if (path === '/watchlist' && method === 'POST') { const data = await body(request); const id = string(data.objectId, 64); this.records.publicRecord(id); if (data.saved === true) this.store.run('INSERT OR IGNORE INTO op_watchlist(owner,object_id) VALUES (?,?)', owner, id); else this.store.run('DELETE FROM op_watchlist WHERE owner=? AND object_id=?', owner, id); return json({ saved: data.saved === true }); }
    if (path === '/reports' && method === 'POST') { this.store.rate(`report:${owner}`, 8, 86_400_000); const data = await body(request); const id = string(data.objectId, 64); this.records.publicRecord(id); const reason = string(data.reason, 1500).trim(); if (reason.length < 10) throw new ApiError('REPORT_REASON_REQUIRED'); const reportId = crypto.randomUUID(); this.store.run('INSERT INTO op_reports(id,owner,record_id,reason,created_at) VALUES (?,?,?,?,?)', reportId, owner, id, reason, Date.now()); this.store.metric('report_received'); return json({ id: reportId, status: 'received' }); }
    if (path.startsWith('/ops/')) { this.operator(owner);
      if (method === 'GET' && path === '/ops/overview') return json({ toolkit: toolkitProbeStatus(), sponsor: await this.sponsor.status(true).catch(() => ({ address: this.sponsor.address })), metrics: this.store.all('SELECT name,value FROM op_metrics ORDER BY name'), storage: this.store.one("SELECT COUNT(DISTINCT key) AS objects, COALESCE(SUM(length(data)),0) AS bytes FROM op_blobs"), captures: this.store.all("SELECT id,state,created_at FROM op_capture_sessions WHERE state IN ('review','screening','reconstructing','validating','model_review','blocked','failed') ORDER BY created_at DESC LIMIT 50"), reports: this.store.all('SELECT id,record_id,reason,created_at FROM op_reports ORDER BY created_at DESC LIMIT 50'), transactions: this.store.all("SELECT id,record_id,kind,state,tx_hash FROM op_transactions WHERE state IN ('unknown','reorg_review','submitted','confirming')"), audit: this.store.all('SELECT target,decision,reason,hash,previous_hash,created_at FROM op_moderation ORDER BY created_at DESC LIMIT 50') });
      if (method === 'POST' && path === '/ops/sponsor/sweep') { const data = await body(request); const hash = await this.sponsor.sweep(string(data.to, 42)); await this.store.audit(await sha256(owner), 'sponsor', 'sweep', `Swept sponsor balance in ${hash}`); return json({ hash }); }
      if (method === 'POST' && path === '/ops/moderation') { const data = await body(request); const target = string(data.target, 64); const reason = string(data.reason, 1000); const decision = string(data.decision, 30); if (reason.length < 10 || !['reject_capture', 'hide_record', 'hide_message'].includes(decision)) throw new ApiError('MODERATION_INVALID'); this.store.atomic(() => { if (decision === 'reject_capture') { const { session } = this.captures.load(target); session.moderation = 'rejected'; session.approvedManifestHash = undefined; session.state = 'blocked'; session.autoLaunch = false; this.captures.save(session); } if (decision === 'hide_record') { const { row } = this.records.load(target); this.store.run("UPDATE op_records SET state='hidden',moderation_state='hidden' WHERE id=?", target); this.store.run('UPDATE op_artifacts SET public=0 WHERE session_id=?', row.session_id); } if (decision === 'hide_message') this.store.run('UPDATE op_messages SET hidden=1 WHERE id=?', target); }); return json({ hash: await this.store.audit(await sha256(owner), target, decision, reason) }); }
      const frame = path.match(/^\/ops\/captures\/([a-f0-9-]{36})\/([a-z-]+)$/); if (method === 'GET' && frame) { const image = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_capture_views WHERE session_id=? AND view_id=?', frame[1], frame[2]); const file = image ? await this.runtime.privateBucket.get(image.storage_key) : null; if (!file) throw new ApiError('NOT_FOUND', 404); return new Response(file.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private,no-store', 'X-Content-Type-Options': 'nosniff' } }); }
    }
    void requireOwner; void coinUrlFor;
    throw new ApiError('NOT_FOUND', 404);
  }
}
