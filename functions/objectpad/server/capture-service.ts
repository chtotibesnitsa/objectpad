import { VIEWS, type CaptureSession, type CaptureView, type ModelArtifact } from '../shared/domain';
import { captureManifest, isViewId, MAX_IMAGE_BYTES, perceptualDistance, validateCoverage } from '../shared/capture';
import { ApiError, boundedBody, handoffAllowed, randomToken, requireOwner, sha256 } from '../shared/security';
import type { JobRow, Runtime, SavedSession, SessionRow } from './types';
import { Store } from './store';
import { inspectThumbnail, normalizeImage } from './media';
import { MeshyProvider } from './meshy';
import { probeToolkit } from './toolkit';
import type { Screening } from './uniqueness';

/** Within one capture, two views closer than this (of 64 bits) are treated as the same angle. */
const SAME_ANGLE_DISTANCE = 3;
/** A capture is a near-duplicate of an archived one when this many same-angle views are nearly identical. */
const ARCHIVE_MATCH_VIEWS = 8;
const ARCHIVE_MATCH_DISTANCE = 3;
/** A creator may ask for a fresh 3D rebuild of the same photos this many times before launching. */
export const MAX_REGENERATIONS = 2;
export const MAX_FAILURE_RETRIES = 8;
/** Create-request failures where the engine answered (so no paid task exists) and a retry is always safe. */
const DEFINITE = ['PROVIDER_REJECTED_INPUT', 'PROVIDER_CREDITS', 'PROVIDER_RATE_LIMIT', 'RECONSTRUCTION_NOT_CONFIGURED', 'PROVIDER_PAYLOAD_TOO_LARGE', 'PROVIDER_AUTH', 'PROVIDER_UNAVAILABLE', 'FOUR_CANONICAL_VIEWS_REQUIRED', 'PROVIDER_AMBIGUOUS_CREATE'];
/** Deterministic Object ID for a capture session, known before anything launches. */
export const objectIdFor = (sessionId: string): Promise<string> => sha256(`objectpad:v1:${sessionId}`);
/** The coin's permanent short link on ObjectPad (first 12 hex characters of the Object ID). */
export const coinUrlFor = (origin: string, objectId: string): string => `${origin}/o/${objectId.slice(0, 12)}`;

export class CaptureService {
  constructor(private readonly store: Store, private readonly runtime: Runtime) {}
  private provider(): MeshyProvider { const geometry = this.runtime.env.OBJECTPAD_MESHY_GEOMETRY; return new MeshyProvider(this.runtime.toolkitUrl, this.runtime.toolkitKey, { model: this.runtime.env.OBJECTPAD_MESHY_MODEL?.trim() || undefined, geometry: geometry === '2k' || geometry === '4k' ? geometry : 'standard' }); }
  captureEnabled(): boolean { return this.runtime.env.OBJECTPAD_CAPTURE_ENABLED !== 'false' && Boolean(this.runtime.toolkitKey); }
  load(id: string, owner?: string): { row: SessionRow; session: SavedSession } {
    const row = this.store.one<SessionRow>('SELECT * FROM op_capture_sessions WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404); if (owner) requireOwner(owner, row.owner);
    return { row, session: JSON.parse(row.payload) as SavedSession };
  }
  save(session: SavedSession): void { this.store.run('UPDATE op_capture_sessions SET state=?,payload=? WHERE id=?', session.state, JSON.stringify(session), session.id); }
  /** Public view of a capture. Access is checked by the caller (owner, guest token or paired phone). */
  publicSession(id: string, owner?: string): CaptureSession {
    const { row, session } = this.load(id, owner); const { owner: _owner, manifestHash: _manifest, approved: _approved, rights: _rights, moderation: _moderation, approvedManifestHash: _moderationHash, screeningAt: _screening, autoLaunchAttempts: _attempts, ...visible } = session;
    const objectId = row.object_id ?? undefined;
    return { ...visible, objectId, coinUrl: objectId ? coinUrlFor(this.runtime.origin, objectId) : undefined, deviceConnected: Boolean(row.claim_hash), guest: row.owner.startsWith('guest:') };
  }
  /** Backfills the deterministic Object ID for sessions created before it was stored. */
  async ensureObjectId(id: string): Promise<void> { const row = this.store.one<{ object_id: string | null }>('SELECT object_id FROM op_capture_sessions WHERE id=?', id); if (row && !row.object_id) this.store.run('UPDATE op_capture_sessions SET object_id=? WHERE id=?', await objectIdFor(id), id); }
  /** Moves captures that have not launched from one identity to another (a guest signing in keeps their scans). */
  adopt(from: string, to: string, onlyId?: string): number {
    const rows = this.store.all<{ id: string }>(`SELECT id FROM op_capture_sessions s WHERE owner=? AND NOT EXISTS (SELECT 1 FROM op_records r WHERE r.session_id=s.id)${onlyId ? ' AND id=?' : ''}`, ...(onlyId ? [from, onlyId] : [from]));
    this.store.atomic(() => { for (const row of rows) { const { session } = this.load(row.id); session.owner = to; this.store.run('UPDATE op_capture_sessions SET owner=?,payload=? WHERE id=?', to, JSON.stringify(session), row.id); this.store.run('UPDATE op_upload_tickets SET owner=? WHERE session_id=?', to, row.id); } });
    if (rows.length) this.store.metric('captures_adopted'); return rows.length;
  }
  private handoffUrl(origin: string, id: string, token: string): string { return `${origin}/capture/claim#session=${id}&token=${token}`; }
  async create(owner: string, draftId: string, rights: boolean, origin: string, autoLaunch = true): Promise<{ session: CaptureSession; handoffUrl?: string }> {
    if (!this.captureEnabled() || !await probeToolkit(this.runtime)) throw new ApiError('OPERATOR_SETUP_REQUIRED', 503);
    if (!rights || !/^[a-f0-9-]{36}$/.test(draftId)) throw new ApiError('RIGHTS_AND_DRAFT_REQUIRED');
    const existing = this.store.one<SessionRow>('SELECT * FROM op_capture_sessions WHERE id=?', draftId); if (existing) { requireOwner(owner, existing.owner); return { session: this.publicSession(draftId, owner) }; }
    const profile = this.store.one('SELECT owner FROM op_profiles WHERE owner=?', owner); if (!profile) throw new ApiError('PROFILE_REQUIRED', 409);
    this.store.rate(`sessions:${owner}`, 25, 86_400_000);
    const token = randomToken(); const now = Date.now(); const expiresAt = now + 2 * 60 * 60_000;
    const session: SavedSession = { id: draftId, owner, state: 'awaiting_mobile', createdAt: now, expiresAt, views: [], rights, moderation: 'pending', autoLaunch };
    this.store.run('INSERT INTO op_capture_sessions(id,owner,state,token_hash,claim_hash,handoff_expires,expires,created_at,payload,object_id) VALUES (?,?,?,?,?,?,?,?,?,?)', draftId, owner, session.state, await sha256(token), null, now + 10 * 60_000, expiresAt, now, JSON.stringify(session), await objectIdFor(draftId));
    this.store.metric('qr_created'); return { session: this.publicSession(draftId, owner), handoffUrl: this.handoffUrl(origin, draftId, token) };
  }
  /** New single-use phone link. Works while scanning and afterwards, so a phone can (re)join the same session at any point. */
  async rotateHandoff(id: string, owner: string, origin: string): Promise<{ handoffUrl: string; expiresAt: number }> { const { row } = this.load(id, owner); const capturing = ['awaiting_mobile', 'capturing', 'review'].includes(row.state); if (['cancelled', 'expired'].includes(row.state) || (capturing && row.expires <= Date.now()) || this.store.one('SELECT id FROM op_records WHERE session_id=?', id)) throw new ApiError('HANDOFF_UNAVAILABLE', 409); const token = randomToken(); const expiresAt = capturing ? Math.min(row.expires, Date.now() + 600_000) : Date.now() + 600_000; this.store.run('UPDATE op_capture_sessions SET token_hash=?,handoff_expires=? WHERE id=?', await sha256(token), expiresAt, id); this.store.metric('qr_rotated'); return { handoffUrl: this.handoffUrl(origin, id, token), expiresAt }; }
  /** The single-use QR token is the capability: whoever holds it pairs their phone to this capture, no sign-in needed. */
  async claim(id: string, token: string): Promise<{ session: CaptureSession; claimSecret: string }> {
    const { row, session } = this.load(id);
    const capturing = ['awaiting_mobile', 'capturing', 'review'].includes(row.state);
    try { handoffAllowed({ owner: row.owner, actor: row.owner, expiresAt: capturing ? Math.min(row.handoff_expires, row.expires) : row.handoff_expires, now: Date.now(), used: !row.token_hash, cancelled: ['cancelled', 'expired'].includes(row.state), purpose: 'capture' }); }
    catch (error) { this.store.metric(Date.now() >= row.handoff_expires ? 'qr_expired' : 'qr_rejected'); throw error; }
    if (!/^[a-f0-9]{64}$/.test(token) || await sha256(token) !== row.token_hash) { this.store.metric('qr_rejected'); throw new ApiError('HANDOFF_EXPIRED_OR_USED', 410); }
    // A new phone replaces any earlier one: its secret becomes the only device credential and old upload tickets die.
    const claimSecret = randomToken(); if (session.state === 'awaiting_mobile') session.state = 'capturing'; session.pairedAt = Date.now(); const claimHash = await sha256(claimSecret);
    this.store.atomic(() => { this.store.run('UPDATE op_capture_sessions SET token_hash=NULL,claim_hash=? WHERE id=?', claimHash, id); this.store.run('UPDATE op_upload_tickets SET consumed=1 WHERE session_id=?', id); this.save(session); });
    this.store.metric('qr_claimed'); return { session: this.publicSession(id), claimSecret };
  }
  async recoverDevice(id: string, owner: string): Promise<{ session: CaptureSession; claimSecret: string }> {
    const { row } = this.load(id, owner);
    if (row.expires <= Date.now() || !['capturing', 'review'].includes(row.state)) throw new ApiError('DEVICE_RECOVERY_UNAVAILABLE', 409);
    this.store.rate(`device_recovery:${owner}`, 6, 3_600_000);
    const claimSecret = randomToken(); const claimHash = await sha256(claimSecret);
    this.store.atomic(() => { this.store.run('UPDATE op_capture_sessions SET claim_hash=?,token_hash=NULL WHERE id=?', claimHash, id); this.store.run('UPDATE op_upload_tickets SET consumed=1 WHERE session_id=?', id); });
    this.store.metric('device_recovered'); return { session: this.publicSession(id, owner), claimSecret };
  }
  async authorizeDevice(id: string, owner: string, secret: string | null): Promise<SavedSession> { const { row, session } = this.load(id, owner); if (!secret || !/^[a-f0-9]{64}$/.test(secret) || await sha256(secret) !== row.claim_hash || row.expires <= Date.now() || !['capturing', 'review'].includes(row.state)) throw new ApiError('CAPTURE_DEVICE_NOT_AUTHORIZED', 403); return session; }
  async ticket(id: string, owner: string, view: string, secret: string | null): Promise<{ url: string; token: string; expiresAt: number }> { await this.authorizeDevice(id, owner, secret); if (!isViewId(view)) throw new ApiError('VIEW_INVALID'); this.store.rate(`uploads:${owner}`, 80, 3_600_000); const ticketId = crypto.randomUUID(); const token = randomToken(); const expiresAt = Date.now() + 120_000; this.store.run('INSERT INTO op_upload_tickets(id,session_id,owner,view_id,token_hash,expires) VALUES (?,?,?,?,?,?)', ticketId, id, owner, view, await sha256(token), expiresAt);
    // Announce the photo in flight so the desktop shows it arriving before the bytes land.
    const { session } = this.load(id); session.incoming = [...(session.incoming ?? []).filter(s => s.view !== view && Date.now() - s.at < 90_000), { view: view as CaptureView['view'], at: Date.now() }]; this.save(session);
    return { url: `/uploads/${ticketId}`, token, expiresAt }; }
  /** Step 1 (serialized): verify and consume a single-use upload ticket bound to this account and capture device. */
  async beginUpload(ticketId: string, request: Request): Promise<{ sessionId: string; view: string; owner: string }> {
    const ticket = this.store.one<{ session_id: string; owner: string; view_id: string; token_hash: string; expires: number; consumed: number }>('SELECT * FROM op_upload_tickets WHERE id=?', ticketId);
    if (!ticket) throw new ApiError('UPLOAD_TICKET_INVALID', 410); const owner = ticket.owner;
    const authorization = request.headers.get('X-Upload-Token') ?? ''; if (ticket.consumed || ticket.expires <= Date.now() || await sha256(authorization) !== ticket.token_hash) throw new ApiError('UPLOAD_TICKET_INVALID', 410);
    const session = await this.authorizeDevice(ticket.session_id, owner, request.headers.get('X-Capture-Device'));
    if (request.headers.get('content-type') !== 'image/jpeg') throw new ApiError('UNSUPPORTED_IMAGE', 415);
    if (session.views.length >= 24 || session.views.some(v => v.view === ticket.view_id)) throw new ApiError('RETAKE_REQUIRED', 409);
    this.store.run('UPDATE op_upload_tickets SET consumed=1 WHERE id=?', ticketId);
    return { sessionId: session.id, view: ticket.view_id, owner };
  }
  /** Step 2 (concurrent): bounded read, strict decode, metadata strip and screening. Nothing is stored here. */
  async normalizeUpload(request: Request): Promise<Awaited<ReturnType<typeof normalizeImage>>> {
    try { return await normalizeImage(await boundedBody(request, MAX_IMAGE_BYTES), this.runtime); }
    catch (error) { this.store.metric(`frame_rejected_${error instanceof ApiError ? error.code.toLowerCase().slice(0, 40) : 'decode'}`); throw error; }
  }
  /** Step 3 (serialized): duplicate checks against the latest state, durable storage and session update. */
  async finishUpload(started: { sessionId: string; view: string; owner: string }, secret: string | null, normalized: Awaited<ReturnType<typeof normalizeImage>>): Promise<CaptureSession> {
    const ticket = { view_id: started.view }; const owner = started.owner;
    const session = await this.authorizeDevice(started.sessionId, owner, secret);
    if (session.views.length >= 24 || session.views.some(v => v.view === ticket.view_id)) throw new ApiError('RETAKE_REQUIRED', 409);
    if (!normalized.scan.accepted) { this.store.metric(`frame_rejected_${normalized.scan.code.toLowerCase()}`); throw new ApiError(normalized.scan.code, 422); }
    const saved = this.store.all<{ payload: string }>('SELECT payload FROM op_capture_views WHERE session_id=?', session.id);
    let distance = 64; for (const entry of saved) { const previous = JSON.parse(entry.payload) as { signature: string }; distance = Math.min(distance, perceptualDistance(previous.signature, normalized.signature)); }
    // Centering and backdrop consistency are recorded as advisory quality flags: a table in front of a wall is a normal
    // setup and must not be rejected. Blocking gates are resolution, sharpness, exposure, duplicate angle and screening.
    if (distance < SAME_ANGLE_DISTANCE) { this.store.metric('frame_rejected_duplicate_view'); throw new ApiError('DUPLICATE_VIEW', 422); }
    if (!normalized.centered || !normalized.backgroundConsistent) this.store.metric('frame_framing_advisory');
    this.assertNotInArchive(session.id, normalized.hash);
    const id = crypto.randomUUID(); const storageKey = `objectpad/v1/captures/${session.id}/${normalized.hash}.jpg`;
    await this.runtime.privateBucket.put(storageKey, normalized.bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    const frame: CaptureView = { id, view: ticket.view_id as CaptureView['view'], hash: normalized.hash, width: normalized.width, height: normalized.height, bytes: normalized.bytes.byteLength, acceptedAt: Date.now(), quality: { blur: Math.round(normalized.blur), exposure: Math.round(normalized.exposure), duplicateDistance: distance, centered: normalized.centered, backgroundConsistent: normalized.backgroundConsistent } };
    session.moderation = 'pending'; delete session.approvedManifestHash; session.views.push(frame); session.incoming = (session.incoming ?? []).filter(s => s.view !== frame.view); if (session.views.length >= VIEWS.length) session.state = 'review';
    this.store.atomic(() => { this.store.run('INSERT INTO op_capture_views(id,session_id,view_id,hash,storage_key,payload) VALUES (?,?,?,?,?,?)', id, session.id, frame.view, frame.hash, storageKey, JSON.stringify({ ...frame, signature: normalized.signature, scan: { code: normalized.scan.code, model: normalized.scan.model } })); this.save(session); });
    this.store.metric('frame_accepted'); if (session.state === 'review') this.store.metric('capture_completed'); return this.publicSession(session.id, owner);
  }
  /** Exact normalized-frame reuse across captures is rejected before storage. */
  assertNotInArchive(sessionId: string, hash: string): void {
    if (this.store.one('SELECT id FROM op_capture_views WHERE hash=? AND session_id<>?', hash, sessionId)) { this.store.metric('archive_duplicate_rejected'); throw new ApiError('DUPLICATE_ARCHIVE_FRAME', 409); }
  }
  /**
   * Whole-capture near-duplicate check before any paid reconstruction: if most same-angle fingerprints nearly match
   * one archived capture, this is treated as the same object session and rejected. Imagery alone never proves uniqueness.
   */
  assertCaptureNotDuplicated(sessionId: string): void {
    const mine = this.store.all<{ view_id: string; payload: string }>('SELECT view_id,payload FROM op_capture_views WHERE session_id=?', sessionId).map(r => ({ view: r.view_id, signature: (JSON.parse(r.payload) as { signature: string }).signature }));
    const matches = new Map<string, number>();
    for (const own of mine) for (const row of this.store.all<{ session_id: string; payload: string }>('SELECT session_id,payload FROM op_capture_views WHERE view_id=? AND session_id<>? ORDER BY rowid DESC LIMIT 4000', own.view, sessionId)) {
      const other = (JSON.parse(row.payload) as { signature?: string }).signature;
      if (other && /^[01]{64}$/.test(other) && perceptualDistance(other, own.signature) <= ARCHIVE_MATCH_DISTANCE) matches.set(row.session_id, (matches.get(row.session_id) ?? 0) + 1);
    }
    if ([...matches.values()].some(count => count >= ARCHIVE_MATCH_VIEWS)) { this.store.metric('archive_near_duplicate_rejected'); throw new ApiError('NEAR_DUPLICATE_CAPTURE', 409); }
  }
  /** Removes one photo so it can be shot again. The paired phone (device secret) or the owner's computer may do this before the 3D build starts. */
  async retake(id: string, owner: string, viewId: string, secret: string | null): Promise<CaptureSession> { const session = secret ? await this.authorizeDevice(id, owner, secret) : (() => { const { row, session: s } = this.load(id, owner); if (row.expires <= Date.now() || !['awaiting_mobile', 'capturing', 'review'].includes(row.state)) throw new ApiError('CAPTURE_CLOSED', 409); return s; })(); const frame = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_capture_views WHERE session_id=? AND view_id=?', id, viewId); this.store.atomic(() => { this.store.run('DELETE FROM op_capture_views WHERE session_id=? AND view_id=?', id, viewId); session.views = session.views.filter(v => v.view !== viewId); session.incoming = (session.incoming ?? []).filter(s => s.view !== viewId); if (!secret) session.removed = [...(session.removed ?? []).slice(-9), { view: viewId, at: Date.now() }]; session.moderation = 'pending'; delete session.approvedManifestHash; session.state = 'capturing'; this.save(session); }); if (frame) await this.runtime.privateBucket.delete(frame.storage_key); return this.publicSession(id, owner); }
  /**
   * Linked rescan: a fresh capture for the same owner. The old scan points at it (`successor`), so the desktop follows
   * automatically, and a paired phone is paired to the new scan straight away (no new QR needed).
   */
  async rescan(id: string, owner: string): Promise<{ session: CaptureSession }> {
    const { row, session: old } = this.load(id, owner);
    if (old.successor) { const next = this.store.one<SessionRow>('SELECT id,state FROM op_capture_sessions WHERE id=?', old.successor); if (next && !['cancelled', 'expired'].includes(next.state)) return { session: this.publicSession(next.id) }; }
    if (this.store.one('SELECT id FROM op_records WHERE session_id=?', id)) throw new ApiError('RECORD_ALREADY_COMMITTED', 409);
    this.store.rate(`sessions:${owner}`, 20, 86_400_000);
    // The paired phone keeps its device secret: the new scan accepts the same phone, so it carries straight on.
    const nextId = crypto.randomUUID(); const now = Date.now(); const expiresAt = now + 2 * 60 * 60_000; const paired = row.claim_hash;
    const next: SavedSession = { id: nextId, owner, state: paired ? 'capturing' : 'awaiting_mobile', createdAt: now, expiresAt, views: [], rights: true, moderation: 'pending', autoLaunch: old.autoLaunch ?? true };
    const objectId = await objectIdFor(nextId);
    this.store.atomic(() => {
      this.store.run('INSERT INTO op_capture_sessions(id,owner,state,token_hash,claim_hash,handoff_expires,expires,created_at,payload,object_id) VALUES (?,?,?,?,?,?,?,?,?,?)', nextId, owner, next.state, null, paired, now, expiresAt, now, JSON.stringify(next), objectId);
      old.successor = nextId; if (!['model_review', 'approved'].includes(old.state)) old.state = 'cancelled'; this.save(old);
      this.store.run('UPDATE op_capture_sessions SET token_hash=NULL WHERE id=?', id); this.store.run('UPDATE op_upload_tickets SET consumed=1 WHERE session_id=?', id);
      this.store.run("UPDATE op_reconstruction_jobs SET state='cancelled' WHERE session_id=? AND state IN ('submitting','pending','generating','validating')", id);
    });
    this.store.metric('capture_rescanned'); return { session: this.publicSession(nextId) };
  }
  async cancel(id: string, owner: string): Promise<void> { const { session } = this.load(id, owner); if (this.store.one('SELECT id FROM op_records WHERE session_id=?', id)) throw new ApiError('RECORD_ALREADY_COMMITTED', 409); session.state = 'cancelled'; this.store.atomic(() => { this.save(session); this.store.run('UPDATE op_capture_sessions SET token_hash=NULL,claim_hash=NULL WHERE id=?', id); this.store.run('UPDATE op_upload_tickets SET consumed=1 WHERE session_id=?', id); this.store.run("UPDATE op_reconstruction_jobs SET state='cancelled' WHERE session_id=? AND state NOT IN ('complete','failed')", id); }); this.store.metric('capture_cancelled'); }
  /** Reconstruction step 1 (serialized): verify coverage and exact/perceptual duplicates, then reserve the capture for AI screening. */
  beginReconstruct(id: string, owner: string): boolean {
    const { session } = this.load(id, owner);
    if (this.store.one('SELECT id FROM op_reconstruction_jobs WHERE session_id=?', id) || session.state === 'screening') return false;
    if (session.state !== 'review' || session.expiresAt <= Date.now()) throw new ApiError('CAPTURE_INCOMPLETE', 409);
    validateCoverage(session.views); if (!this.runtime.toolkitKey) throw new ApiError('RECONSTRUCTION_NOT_CONFIGURED', 503);
    this.assertCaptureNotDuplicated(id);
    session.state = 'screening'; session.screeningAt = Date.now(); delete session.failureCode; this.save(session); return true;
  }
  /** Screening failed: a duplicate object blocks the capture for good; an unavailable screen returns it to review for a retry. */
  screeningFailed(id: string, error: unknown): void {
    const { session } = this.load(id); const code = error instanceof ApiError ? error.code : 'MEDIA_VALIDATION_UNAVAILABLE';
    session.state = code === 'DUPLICATE_OBJECT' ? 'blocked' : 'review'; session.failureCode = code; delete session.screeningAt; this.save(session); this.store.metric(`screening_${code.toLowerCase().slice(0, 40)}`);
  }
  /** Step 3 (serialized): record the AI fingerprint and suggestion, spend the daily budget and register a submitting job. */
  async prepareReconstruct(id: string, screening: Screening, save: (screening: Screening) => void): Promise<{ jobId: string; images: Uint8Array[] }> {
    const { session } = this.load(id); if (session.state !== 'screening') throw new ApiError('CAPTURE_INCOMPLETE', 409);
    const selected = validateCoverage(session.views);
    try { this.store.budget('reconstructions', Math.max(1, Number(this.runtime.env.OBJECTPAD_DAILY_RECONSTRUCTIONS) || 40), 'RECONSTRUCTION_BUDGET_REACHED'); }
    catch (error) { session.state = 'review'; session.failureCode = 'RECONSTRUCTION_BUDGET_REACHED'; this.save(session); throw error; }
    const manifest = captureManifest(id, session.views); const manifestHash = await sha256(manifest); await this.runtime.privateBucket.put(`objectpad/v1/manifests/${manifestHash}.json`, manifest, { httpMetadata: { contentType: 'application/json' } });
    const images: Uint8Array[] = []; for (const view of selected) { const row = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_capture_views WHERE id=?', view.id); const object = row ? await this.runtime.privateBucket.get(row.storage_key) : null; if (!object) throw new ApiError('CAPTURE_STORAGE_MISSING', 503); images.push(new Uint8Array(await object.arrayBuffer())); }
    const provider = this.provider(); const jobId = crypto.randomUUID(); const now = Date.now();
    session.state = 'reconstructing'; session.manifestHash = manifestHash; session.job = { state: 'submitting', progress: 0, startedAt: now, model: provider.model, images: images.length }; session.suggestion = screening.suggestion; delete session.screeningAt;
    this.store.atomic(() => { save(screening); this.store.run('INSERT INTO op_reconstruction_jobs(id,session_id,state,provider_id,created_at,updated_at,payload) VALUES (?,?,?,?,?,?,?)', jobId, id, 'submitting', null, now, now, JSON.stringify({ canonicalIds: selected.map(v => v.id), canonicalViews: selected.map(v => v.view), model: provider.model })); this.save(session); });
    return { jobId, images };
  }
  /** Step 4 (outside the queue): paid provider submission. */
  submitTask(images: Uint8Array[]): Promise<string> { return this.provider().createTask(images); }
  /** Step 5 (serialized): record the provider id, or classify the failure without ever retrying paid work blindly. */
  finishReconstruct(id: string, jobId: string, result: { providerId?: string; error?: unknown }): void {
    const { session } = this.load(id);
    if (result.providerId) { this.store.run("UPDATE op_reconstruction_jobs SET state='pending',provider_id=?,updated_at=? WHERE id=?", result.providerId, Date.now(), jobId); session.job = { ...session.job, state: 'pending', progress: 0, startedAt: session.job?.startedAt ?? Date.now(), submittedAt: Date.now(), taskRef: result.providerId.slice(0, 8), providerStatus: 'PENDING' }; this.save(session); this.store.metric('reconstruction_submitted'); return; }
    const error = result.error;
    // A rejected request never started paid work and can be retried; anything else is ambiguous and needs review.
    const definite = error instanceof ApiError && DEFINITE.includes(error.code);
    // The engine answered, so nothing was started or paid for: the capture waits in 'failed' and one tap (or the automatic retry) rebuilds it.
    if (definite) { this.store.atomic(() => { this.store.run("UPDATE op_reconstruction_jobs SET state='failed',updated_at=? WHERE id=?", Date.now(), jobId); session.state = 'failed'; session.failureCode = (error as ApiError).code; if (session.job) session.job = { ...session.job, state: 'failed', failureCode: (error as ApiError).code }; this.save(session); }); this.store.metric(`reconstruction_${(error as ApiError).code.toLowerCase().slice(0, 40)}`); return; }
    this.store.run("UPDATE op_reconstruction_jobs SET state='review_required',updated_at=? WHERE id=?", Date.now(), jobId); session.state = 'blocked'; session.failureCode = 'PROVIDER_SUBMISSION_UNCERTAIN'; this.save(session); this.store.metric('provider_submission_uncertain');
  }
  hasActiveJobs(): boolean { return Boolean(this.store.one("SELECT id FROM op_reconstruction_jobs WHERE state IN ('submitting','pending','generating','validating') LIMIT 1")); }
  async poll(): Promise<void> {
    if (!this.runtime.toolkitKey) return;
    // A crash after paid creation is ambiguous. Never blindly create a replacement job.
    // An interrupted AI screening returns the capture to review so the creator can retry; no paid work was started.
    for (const row of this.store.all<{ id: string }>("SELECT id FROM op_capture_sessions WHERE state='screening'")) { const { session } = this.load(row.id); if (Date.now() - (session.screeningAt ?? 0) > 180_000) { session.state = 'review'; session.failureCode = 'MEDIA_VALIDATION_UNAVAILABLE'; delete session.screeningAt; this.save(session); } }
    for (const stale of this.store.all<JobRow>("SELECT * FROM op_reconstruction_jobs WHERE state='submitting' AND updated_at<?", Date.now() - 120_000)) { this.store.run("UPDATE op_reconstruction_jobs SET state='review_required' WHERE id=?", stale.id); const { session } = this.load(stale.session_id); session.state = 'blocked'; session.failureCode = 'PROVIDER_SUBMISSION_UNCERTAIN'; this.save(session); }
    const provider = this.provider();
    for (const job of this.store.all<JobRow>("SELECT * FROM op_reconstruction_jobs WHERE state IN ('pending','generating','validating') ORDER BY updated_at ASC LIMIT 2")) {
      if (!job.provider_id) continue; const { session } = this.load(job.session_id); if (session.state === 'cancelled') continue;
      try {
        if (Date.now() - job.created_at > 20 * 60_000) throw new ApiError('PROVIDER_TIMEOUT');
        const task = await provider.getTask(job.provider_id); session.job = { ...session.job, state: task.status.toLowerCase(), progress: Math.max(0, Math.min(100, Number(task.progress) || 0)), startedAt: session.job?.startedAt ?? job.created_at, providerStatus: task.status, queue: typeof task.preceding_tasks === 'number' ? task.preceding_tasks : undefined, providerStartedAt: task.started_at || undefined, polledAt: Date.now(), polls: (session.job?.polls ?? 0) + 1 };
        if (task.status === 'FAILED' || task.status === 'CANCELED') throw new ApiError('PROVIDER_FAILED');
        if (task.status !== 'SUCCEEDED') { this.store.run("UPDATE op_reconstruction_jobs SET state='generating',updated_at=? WHERE id=?", Date.now(), job.id); this.save(session); continue; }
        session.state = 'validating'; this.save(session); this.store.run("UPDATE op_reconstruction_jobs SET state='validating',updated_at=? WHERE id=?", Date.now(), job.id);
        const downloaded = await provider.fetchArtifacts(task); const checked = provider.validateArtifacts(downloaded.model); const thumbnailType = inspectThumbnail(downloaded.thumbnail);
        const artifacts = [{ bytes: downloaded.model, kind: 'original', type: 'model/gltf-binary' }, { bytes: downloaded.thumbnail, kind: 'thumbnail', type: thumbnailType }];
        const hashes: Record<string, string> = {};
        for (const artifact of artifacts) { const hash = await sha256(artifact.bytes); const key = `objectpad/v1/artifacts/${hash}`; await this.runtime.artifactBucket.put(key, artifact.bytes, { httpMetadata: { contentType: artifact.type } }); const stored = await this.runtime.artifactBucket.get(key); if (!stored || await sha256(new Uint8Array(await stored.arrayBuffer())) !== hash) throw new ApiError('ARTIFACT_STORAGE_VERIFICATION'); hashes[artifact.kind] = hash; this.store.run('INSERT OR IGNORE INTO op_artifacts(hash,storage_key,kind,bytes,session_id) VALUES (?,?,?,?,?)', hash, key, artifact.kind, artifact.bytes.byteLength, session.id); }
        const origin = this.runtime.apiOrigin;
        const model: ModelArtifact = { originalHash: hashes.original, optimizedHash: hashes.original, thumbnailHash: hashes.thumbnail, modelUrl: `${origin}/api/artifacts/${hashes.original}`, thumbnailUrl: `${origin}/api/artifacts/${hashes.thumbnail}`, bytes: downloaded.model.byteLength, triangles: checked.inspection.triangles, textures: checked.inspection.textures, bounds: checked.bounds, generatedAt: Date.now(), provider: 'Meshy', providerModel: provider.model, processedViews: 4, validated: true, thumbnailSource: 'provider_preview', optimization: 'provider_output_within_limits' };
        session.model = model; session.state = 'model_review'; session.job = { ...session.job, state: 'complete', progress: 100, startedAt: session.job?.startedAt ?? job.created_at, providerStatus: 'SUCCEEDED', finishedAt: Date.now() }; delete session.failureCode;
        // Every stored frame already passed automated screening at upload. Record that as the capture's moderation decision.
        session.moderation = 'approved'; session.approvedManifestHash = session.manifestHash;
        this.store.atomic(() => { this.save(session); this.store.run("UPDATE op_reconstruction_jobs SET state='complete',updated_at=? WHERE id=?", Date.now(), job.id); });
        await this.store.audit('automated-screening', session.id, 'approve_capture', `All ${session.views.length} accepted frames passed automated content screening; model passed GLB validation.`);
        this.store.metric('model_validated'); this.store.run('INSERT INTO op_metrics(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=value+excluded.value', 'reconstruction_ms_total', Date.now() - job.created_at);
      } catch (error) { if (error instanceof ApiError && ['PROVIDER_RATE_LIMIT', 'PROVIDER_REQUEST_FAILED'].includes(error.code)) { this.store.metric('provider_poll_retry'); continue; } session.state = 'failed'; session.failureCode = error instanceof ApiError ? error.code : 'VALIDATION_UNAVAILABLE'; this.save(session); this.store.run("UPDATE op_reconstruction_jobs SET state='failed',updated_at=? WHERE id=?", Date.now(), job.id); this.store.metric(error instanceof ApiError && error.code.startsWith('GLB') ? 'glb_validation_failed' : 'reconstruction_failed'); console.warn('objectpad.reconstruction.failed', session.failureCode); }
    }
  }
  /**
   * Fresh 3D rebuild from the same accepted photos (the creator didn't like the first model, or the provider failed).
   * The duplicate check already passed, so only the paid Meshy step runs again. Capped per capture.
   */
  async beginRegenerate(id: string): Promise<{ jobId: string; images: Uint8Array[] }> {
    const { session } = this.load(id);
    if (this.store.one('SELECT id FROM op_records WHERE session_id=?', id)) throw new ApiError('RECORD_ALREADY_COMMITTED', 409);
    // A provider failure (or an uncertain submission) is our problem, not the creator's: those retries never use up the
    // two "I don't like it" rebuilds, up to MAX_FAILURE_RETRIES per capture.
    const failure = session.state === 'failed' || (session.state === 'blocked' && session.failureCode === 'PROVIDER_SUBMISSION_UNCERTAIN') || (session.state === 'review' && Boolean(session.manifestHash) && Boolean(session.failureCode));
    if (!(session.state === 'model_review' || failure) || !session.manifestHash) throw new ApiError('MODEL_NOT_READY', 409);
    if (failure ? (session.failureRetries ?? 0) >= MAX_FAILURE_RETRIES : (session.regenerations ?? 0) >= MAX_REGENERATIONS) throw new ApiError('REGENERATE_LIMIT', 429);
    const job = this.store.one<JobRow>('SELECT * FROM op_reconstruction_jobs WHERE session_id=?', id); if (!job || !['complete', 'failed', 'review_required'].includes(job.state)) throw new ApiError('MODEL_NOT_READY', 409);
    const canonical = (JSON.parse(job.payload) as { canonicalViews?: string[] }).canonicalViews ?? ['front', 'left', 'back', 'right'];
    const images: Uint8Array[] = []; for (const view of canonical) { const row = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_capture_views WHERE session_id=? AND view_id=?', id, view); const object = row ? await this.runtime.privateBucket.get(row.storage_key) : null; if (!object) throw new ApiError('CAPTURE_STORAGE_MISSING', 503); images.push(new Uint8Array(await object.arrayBuffer())); }
    this.store.budget('reconstructions', Math.max(1, Number(this.runtime.env.OBJECTPAD_DAILY_RECONSTRUCTIONS) || 40), 'RECONSTRUCTION_BUDGET_REACHED');
    const now = Date.now(); session.state = 'reconstructing'; session.job = { state: 'submitting', progress: 0, startedAt: now, model: this.provider().model, images: images.length }; if (failure) session.failureRetries = (session.failureRetries ?? 0) + 1; else session.regenerations = (session.regenerations ?? 0) + 1; delete session.model; delete session.failureCode;
    this.store.atomic(() => { this.store.run("UPDATE op_reconstruction_jobs SET state='submitting',provider_id=NULL,created_at=?,updated_at=? WHERE id=?", now, now, job.id); this.save(session); });
    this.store.metric('model_regenerated'); return { jobId: job.id, images };
  }
  approve(id: string, owner: string, approve: boolean): CaptureSession { const { session } = this.load(id, owner); if (session.state !== 'model_review' || !session.model?.validated) throw new ApiError('MODEL_NOT_READY', 409); session.approved = approve; session.state = approve ? 'approved' : 'cancelled'; this.save(session); this.store.metric(approve ? 'model_approved' : 'model_rejected_by_creator'); return this.publicSession(id, owner); }
}
