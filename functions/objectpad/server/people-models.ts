import { ApiError, sha256 } from '../shared/security';
import { CAPTURE_PLAN, MODEL_ATTEMPTS, secureNonce, type CaptureMode, type CaptureView, type ModelJobState, type ModelJobView } from '../shared/people';
import { inspectThumbnail, normalizeImage } from './media';
import { visionJson } from './ai';
import type { MeshyProvider } from './meshy';
import type { Store } from './store';
import type { Runtime } from './types';

interface DraftLite { id: string; creator: string; subject: string | null; state: string; capture_mode: CaptureMode; profile_id: string | null; }
interface JobRow { id: string; draft_id: string; state: ModelJobState; mode: CaptureMode; views: string; provider_id: string | null; attempt: number; counted: number; progress: number; queue: number | null; failure: string | null; model_key: string | null; thumb_key: string | null; model_hash: string | null; bytes: number | null; triangles: number | null; created_at: number; updated_at: number; }
const ALL_VIEWS: CaptureView[] = ['front', 'left', 'right', 'back', 'body_front', 'body_side', 'body_back'];
const ACTIVE: ModelJobState[] = ['submitting', 'queued', 'generating', 'validating'];
/** Engine answers that prove nothing was started or charged: the person may simply try again, at no cost to their budget. */
const DEFINITE = ['PROVIDER_REJECTED_INPUT', 'PROVIDER_CREDITS', 'PROVIDER_RATE_LIMIT', 'PROVIDER_AUTH', 'PROVIDER_PAYLOAD_TOO_LARGE', 'PROVIDER_UNAVAILABLE', 'RECONSTRUCTION_NOT_CONFIGURED'];
const JOB_TIMEOUT_MS = 20 * 60_000;
const PHONE_LINK_TTL_MS = 30 * 60_000;

/**
 * People capture and 3D preview pipeline. Photos are private (subject only), EXIF-stripped, quality-checked and
 * screened for one clothed adult face; the 3D engine is a rendering service, never an identity check. Jobs are queued,
 * polled with real provider progress, validated as GLB, reviewed by the subject and only then approved. Source photos
 * are deleted once a model is approved or the draft is deleted.
 */
export class PeopleModels {
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly provider: () => MeshyProvider | null) {
    const s = (q: string) => store.run(q);
    s('CREATE TABLE IF NOT EXISTS op_people_photos (draft_id TEXT NOT NULL, view TEXT NOT NULL, storage_key TEXT NOT NULL, hash TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(draft_id, view))');
    s('CREATE TABLE IF NOT EXISTS op_people_model_jobs (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, state TEXT NOT NULL, mode TEXT NOT NULL, views TEXT NOT NULL, provider_id TEXT UNIQUE, attempt INTEGER NOT NULL, counted INTEGER NOT NULL DEFAULT 1, progress INTEGER NOT NULL DEFAULT 0, queue INTEGER, failure TEXT, model_key TEXT, thumb_key TEXT, model_hash TEXT, bytes INTEGER, triangles INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    s('CREATE INDEX IF NOT EXISTS op_people_model_jobs_draft ON op_people_model_jobs(draft_id, created_at)');
    s('CREATE TABLE IF NOT EXISTS op_people_phone_links (token_hash TEXT PRIMARY KEY, draft_id TEXT NOT NULL, owner TEXT NOT NULL, expires INTEGER NOT NULL, revoked_at INTEGER, used_at INTEGER, created_at INTEGER NOT NULL)');
  }

  /**
   * Desktop-to-phone capture link. 32 random bytes, stored only as a SHA-256 hash, valid 30 minutes, scoped to one
   * draft and to photos only: no consents, wallet, fee policy, 3D jobs or publishing. A new link revokes older ones.
   */
  async phoneLink(id: string, owner: string): Promise<{ token: string; expiresAt: number }> {
    this.subject(id, owner); this.adult(id, owner);
    this.store.rate(`people-phone-link:${owner}`, 30, 3_600_000);
    const token = secureNonce(); const now = Date.now(); const expiresAt = now + PHONE_LINK_TTL_MS;
    this.store.run('UPDATE op_people_phone_links SET revoked_at=? WHERE draft_id=? AND revoked_at IS NULL', now, id);
    this.store.run('INSERT INTO op_people_phone_links(token_hash,draft_id,owner,expires,created_at) VALUES (?,?,?,?,?)', await sha256(`people-phone:${token}`), id, owner, expiresAt, now);
    return { token, expiresAt };
  }
  revokePhoneLinks(id: string, owner: string): { ok: true } { this.subject(id, owner, false); this.store.run('UPDATE op_people_phone_links SET revoked_at=? WHERE draft_id=? AND revoked_at IS NULL', Date.now(), id); return { ok: true }; }
  /** Resolves a phone link to its draft and subject, re-checking that the draft is still editable and consented. */
  async resolvePhone(token: string): Promise<{ id: string; owner: string; mode: CaptureMode; name: string; expiresAt: number }> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError('PHONE_LINK_INVALID', 404);
    const hash = await sha256(`people-phone:${token}`);
    const row = this.store.one<{ draft_id: string; owner: string; expires: number; revoked_at: number | null }>('SELECT draft_id,owner,expires,revoked_at FROM op_people_phone_links WHERE token_hash=?', hash);
    if (!row || row.revoked_at) throw new ApiError('PHONE_LINK_INVALID', 404);
    if (row.expires < Date.now()) throw new ApiError('PHONE_LINK_EXPIRED', 410);
    const d = this.subject(row.draft_id, row.owner); this.adult(d.id, row.owner);
    this.store.run('UPDATE op_people_phone_links SET used_at=COALESCE(used_at,?) WHERE token_hash=?', Date.now(), hash);
    const name = this.store.one<{ display_name: string }>('SELECT display_name FROM op_people_drafts WHERE id=?', d.id)?.display_name ?? '';
    return { id: d.id, owner: row.owner, mode: d.capture_mode, name, expiresAt: row.expires };
  }

  private draft(id: string): DraftLite { if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError('NOT_FOUND', 404); const row = this.store.one<DraftLite>('SELECT id,creator,subject,state,capture_mode,profile_id FROM op_people_drafts WHERE id=?', id); if (!row || row.state === 'deleted') throw new ApiError('NOT_FOUND', 404); return row; }
  /** Photos and previews belong to the subject alone; a collaborator who prepared the draft never sees them. */
  private subject(id: string, owner: string, editable = true): DraftLite {
    const d = this.draft(id); if (d.subject !== owner) throw new ApiError(d.creator === owner ? 'SUBJECT_ONLY' : 'NOT_FOUND', d.creator === owner ? 403 : 404);
    if (editable && (d.state === 'published' || d.state === 'withdrawn')) throw new ApiError('DRAFT_LOCKED', 409); return d;
  }
  private adult(id: string, owner: string): void { if (!this.store.one("SELECT id FROM op_people_consents WHERE draft_id=? AND subject=? AND kind='adult' AND withdrawn_at IS NULL", id, owner)) throw new ApiError('ADULT_CONSENT_REQUIRED', 409); }

  photos(id: string, owner: string) { this.subject(id, owner, false); return this.store.all<{ view: CaptureView; width: number; height: number; created_at: number }>('SELECT view,width,height,created_at FROM op_people_photos WHERE draft_id=?', id).map(p => ({ view: p.view, width: p.width, height: p.height, createdAt: p.created_at })); }

  /** One guided photo. Normalization re-encodes the JPEG (dropping EXIF/GPS) and rejects blurry, dark or tiny images. */
  async putPhoto(id: string, owner: string, view: string, raw: Uint8Array) {
    const d = this.subject(id, owner); this.adult(id, owner);
    const v = ALL_VIEWS.find(x => x === view); if (!v) throw new ApiError('VIEW_INVALID');
    this.store.rate(`people-photo:${owner}`, 80, 86_400_000);
    const image = await normalizeImage(raw, this.runtime);
    await this.screen(image.bytes, v);
    const key = `objectpad/people/v1/${d.id}/${v}-${image.hash}.jpg`;
    await this.runtime.privateBucket.put(key, image.bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    const old = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_people_photos WHERE draft_id=? AND view=?', id, v);
    this.store.run('INSERT INTO op_people_photos(draft_id,view,storage_key,hash,width,height,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(draft_id,view) DO UPDATE SET storage_key=excluded.storage_key,hash=excluded.hash,width=excluded.width,height=excluded.height,created_at=excluded.created_at', id, v, key, image.hash, image.width, image.height, Date.now());
    if (old && old.storage_key !== key) await this.runtime.privateBucket.delete(old.storage_key).catch(() => undefined);
    this.store.metric('people_photo_accepted');
    return this.photos(id, owner);
  }
  async deletePhoto(id: string, owner: string, view: string) {
    this.subject(id, owner); const row = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_people_photos WHERE draft_id=? AND view=?', id, view);
    if (row) { await this.runtime.privateBucket.delete(row.storage_key).catch(() => undefined); this.store.run('DELETE FROM op_people_photos WHERE draft_id=? AND view=?', id, view); }
    return this.photos(id, owner);
  }
  /**
   * Content screen with the vision model: exactly one person, clothed, a real camera photo (not a screen or print), and a
   * visible face for face views. This is a capture-quality and safety gate only. It is not liveness and not identity.
   */
  private async screen(bytes: Uint8Array, view: CaptureView): Promise<void> {
    const faceView = view === 'front' || view === 'left' || view === 'right' || view === 'body_front';
    let r: Record<string, unknown>;
    try { r = await visionJson(this.runtime, 'You check photos for a consent-based 3D avatar tool. Answer only JSON: {"people": number of distinct people visible, "face_visible": boolean, "clothed": boolean, "screen_or_print": boolean (true if this is a photo of a screen, poster, printed photo or magazine), "clearly_child": boolean (true only if the person is obviously a young child)}.', `View requested: ${view}.`, [bytes], 200); }
    catch { throw new ApiError('MEDIA_VALIDATION_UNAVAILABLE', 503); }
    const people = Number(r.people);
    if (r.clearly_child === true) throw new ApiError('PHOTO_CHILD', 422);
    if (r.clothed === false) throw new ApiError('PHOTO_NOT_CLOTHED', 422);
    if (r.screen_or_print === true) throw new ApiError('PHOTO_OF_SCREEN', 422);
    if (Number.isFinite(people) && people > 1) throw new ApiError('PHOTO_MULTIPLE_PEOPLE', 422);
    if (!Number.isFinite(people) || people < 1) throw new ApiError('PHOTO_NO_PERSON', 422);
    if (faceView && r.face_visible === false) throw new ApiError('PHOTO_NO_FACE', 422);
  }

  private view(row: JobRow): ModelJobView {
    const used = Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_people_model_jobs WHERE draft_id=? AND counted=1', row.draft_id)?.n ?? 0);
    return { id: row.id, state: row.state, mode: row.mode, progress: row.progress, queue: row.queue, attempt: row.attempt, attemptsLeft: Math.max(0, MODEL_ATTEMPTS - used), failure: row.failure, createdAt: row.created_at, updatedAt: row.updated_at, model: row.model_key ? { bytes: row.bytes ?? 0, triangles: row.triangles ?? 0 } : null };
  }
  private latestRow(id: string): JobRow | undefined { return this.store.one<JobRow>('SELECT * FROM op_people_model_jobs WHERE draft_id=? ORDER BY created_at DESC LIMIT 1', id); }
  latest(id: string, owner: string) {
    this.subject(id, owner, false); const row = this.latestRow(id);
    const used = Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_people_model_jobs WHERE draft_id=? AND counted=1', id)?.n ?? 0);
    return { job: row ? this.view(row) : null, attemptsLeft: Math.max(0, MODEL_ATTEMPTS - used), configured: Boolean(this.provider()) };
  }
  hasActiveJobs(): boolean { return Boolean(this.store.one(`SELECT id FROM op_people_model_jobs WHERE state IN (${ACTIVE.map(() => '?').join(',')}) LIMIT 1`, ...ACTIVE)); }

  /** Queues one generation. The paid engine call happens after the job row is reserved, so a double tap can't start two. */
  async start(id: string, owner: string) {
    const d = this.subject(id, owner); this.adult(id, owner);
    const provider = this.provider(); if (!provider) throw new ApiError('RECONSTRUCTION_NOT_CONFIGURED', 503);
    const plan = CAPTURE_PLAN[d.capture_mode];
    const photos = this.store.all<{ view: CaptureView; storage_key: string }>('SELECT view,storage_key FROM op_people_photos WHERE draft_id=?', id);
    const missing = plan.required.filter(v => !photos.some(p => p.view === v)); if (missing.length) throw new ApiError(`PHOTOS_MISSING:${missing.join(',')}`, 409);
    const selected = plan.views.map(v => photos.find(p => p.view === v)).filter((p): p is { view: CaptureView; storage_key: string } => Boolean(p)).slice(0, 4);
    const jobId = crypto.randomUUID(); const now = Date.now();
    this.store.atomic(() => {
      if (this.store.one(`SELECT id FROM op_people_model_jobs WHERE draft_id=? AND state IN (${ACTIVE.map(() => '?').join(',')})`, id, ...ACTIVE)) throw new ApiError('MODEL_JOB_ACTIVE', 409);
      const used = Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_people_model_jobs WHERE draft_id=? AND counted=1', id)?.n ?? 0);
      if (used >= MODEL_ATTEMPTS) throw new ApiError('MODEL_ATTEMPTS_USED', 429);
      const attempt = Number(this.store.one<{ n: number }>('SELECT COUNT(*) AS n FROM op_people_model_jobs WHERE draft_id=?', id)?.n ?? 0) + 1;
      this.store.run('INSERT INTO op_people_model_jobs(id,draft_id,state,mode,views,attempt,counted,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', jobId, id, 'submitting', d.capture_mode, JSON.stringify(selected.map(p => p.view)), attempt, 1, now, now);
    });
    try { this.store.budget('people_models', Math.max(1, Number((this.runtime.env as { OBJECTPAD_PEOPLE_DAILY_MODELS?: string }).OBJECTPAD_PEOPLE_DAILY_MODELS) || 60), 'PEOPLE_MODEL_BUDGET_REACHED'); }
    catch (error) { this.fail(jobId, error instanceof ApiError ? error.code : 'PEOPLE_MODEL_BUDGET_REACHED', false); throw error; }
    const images: Uint8Array[] = [];
    for (const p of selected) { const obj = await this.runtime.privateBucket.get(p.storage_key); if (!obj) { this.fail(jobId, 'CAPTURE_STORAGE_MISSING', false); throw new ApiError('CAPTURE_STORAGE_MISSING', 503); } images.push(new Uint8Array(await obj.arrayBuffer())); }
    try {
      const providerId = await provider.createPeopleTask(images, { preserve: d.capture_mode !== 'stylized_head', polycount: d.capture_mode === 'clothed_body' ? 50_000 : 40_000 });
      this.store.run("UPDATE op_people_model_jobs SET state='queued',provider_id=?,updated_at=? WHERE id=?", providerId, Date.now(), jobId);
      this.store.metric('people_model_submitted');
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'PROVIDER_UNAVAILABLE';
      // A timeout or odd answer may mean paid work started: counted and marked uncertain, never silently resubmitted.
      if (DEFINITE.includes(code)) this.fail(jobId, code, false); else this.store.run("UPDATE op_people_model_jobs SET state='uncertain',failure=?,updated_at=? WHERE id=?", code, Date.now(), jobId);
    }
    return this.latest(id, owner);
  }
  private fail(jobId: string, code: string, counted: boolean): void { this.store.run(`UPDATE op_people_model_jobs SET state='failed',failure=?,updated_at=?${counted ? '' : ',counted=0'} WHERE id=?`, code, Date.now(), jobId); }

  /** Polls up to three active jobs with the provider's real status and progress; stores validated GLB + preview privately. */
  async poll(): Promise<void> {
    const provider = this.provider(); if (!provider) return;
    for (const stale of this.store.all<JobRow>("SELECT * FROM op_people_model_jobs WHERE state='submitting' AND updated_at<?", Date.now() - 120_000)) this.store.run("UPDATE op_people_model_jobs SET state='uncertain',failure='PROVIDER_SUBMISSION_UNCERTAIN',updated_at=? WHERE id=?", Date.now(), stale.id);
    for (const job of this.store.all<JobRow>("SELECT * FROM op_people_model_jobs WHERE state IN ('queued','generating') AND provider_id IS NOT NULL ORDER BY updated_at ASC LIMIT 3")) {
      try {
        if (Date.now() - job.created_at > JOB_TIMEOUT_MS) throw new ApiError('PROVIDER_TIMEOUT');
        const task = await provider.getTask(job.provider_id!);
        if (task.status === 'FAILED' || task.status === 'CANCELED') { this.fail(job.id, 'PROVIDER_FAILED', false); this.store.metric('people_model_provider_failed'); continue; }
        const progress = Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0))); const queue = typeof task.preceding_tasks === 'number' ? task.preceding_tasks : null;
        if (task.status !== 'SUCCEEDED') { this.store.run("UPDATE op_people_model_jobs SET state=?,progress=?,queue=?,updated_at=? WHERE id=?", task.status === 'PENDING' ? 'queued' : 'generating', progress, queue, Date.now(), job.id); continue; }
        this.store.run("UPDATE op_people_model_jobs SET state='validating',progress=100,updated_at=? WHERE id=?", Date.now(), job.id);
        const art = await provider.fetchArtifacts(task); const checked = provider.validateArtifacts(art.model); const thumbType = inspectThumbnail(art.thumbnail);
        const hash = await sha256(art.model); const modelKey = `objectpad/people/v1/${job.draft_id}/model-${hash}.glb`; const thumbKey = `objectpad/people/v1/${job.draft_id}/thumb-${hash}.${thumbType === 'image/png' ? 'png' : 'jpg'}`;
        await this.runtime.privateBucket.put(modelKey, art.model, { httpMetadata: { contentType: 'model/gltf-binary' } });
        await this.runtime.privateBucket.put(thumbKey, art.thumbnail, { httpMetadata: { contentType: thumbType } });
        const stored = await this.runtime.privateBucket.get(modelKey); if (!stored || await sha256(new Uint8Array(await stored.arrayBuffer())) !== hash) throw new ApiError('ARTIFACT_STORAGE_VERIFICATION');
        this.store.run("UPDATE op_people_model_jobs SET state='ready',model_key=?,thumb_key=?,model_hash=?,bytes=?,triangles=?,failure=NULL,updated_at=? WHERE id=?", modelKey, thumbKey, hash, art.model.byteLength, checked.inspection.triangles, Date.now(), job.id);
        this.store.metric('people_model_ready');
      } catch (error) {
        const code = error instanceof ApiError ? error.code : 'VALIDATION_UNAVAILABLE';
        if (['PROVIDER_RATE_LIMIT', 'PROVIDER_REQUEST_FAILED'].includes(code)) continue;
        this.fail(job.id, code, code.startsWith('GLB')); console.warn('objectpad.people.model_failed', code);
      }
    }
  }

  /** The subject approves (becomes the canonical model version) or rejects the preview. Approval deletes source photos. */
  async decide(id: string, owner: string, approve: boolean) {
    this.subject(id, owner); const job = this.latestRow(id); if (!job || job.state !== 'ready' || !job.model_hash) throw new ApiError('MODEL_NOT_READY', 409);
    const now = Date.now();
    if (!approve) { this.store.run("UPDATE op_people_model_jobs SET state='rejected',updated_at=? WHERE id=?", now, job.id); return this.latest(id, owner); }
    this.store.atomic(() => {
      this.store.run("UPDATE op_people_models SET state='superseded' WHERE draft_id=? AND state='approved'", id);
      this.store.run('INSERT INTO op_people_models(id,draft_id,digest,state,approved_at,created_at) VALUES (?,?,?,?,?,?)', job.id, id, job.model_hash, 'approved', now, job.created_at);
      this.store.run("UPDATE op_people_model_jobs SET state='approved',updated_at=? WHERE id=?", now, job.id);
      this.store.run('UPDATE op_people_drafts SET updated_at=?,version=version+1 WHERE id=?', now, id);
    });
    await this.purgePhotos(id); this.store.metric('people_model_approved');
    return this.latest(id, owner);
  }
  /** Private preview bytes for the subject. */
  async file(id: string, owner: string, kind: 'model' | 'thumb'): Promise<{ bytes: ArrayBuffer; type: string }> {
    this.subject(id, owner, false); const job = this.store.one<JobRow>("SELECT * FROM op_people_model_jobs WHERE draft_id=? AND model_key IS NOT NULL AND state IN ('ready','approved','rejected') ORDER BY created_at DESC LIMIT 1", id);
    return this.read(kind === 'model' ? job?.model_key : job?.thumb_key);
  }
  /** Approved model of a published profile. Public by the subject's likeness consent; withdrawn profiles return 404. */
  async publicFile(profileId: string, kind: 'model' | 'thumb'): Promise<{ bytes: ArrayBuffer; type: string }> {
    if (!/^[a-f0-9]{20}$/.test(profileId)) throw new ApiError('NOT_FOUND', 404);
    const job = this.store.one<JobRow>("SELECT j.* FROM op_people_model_jobs j JOIN op_people_drafts d ON d.id=j.draft_id WHERE d.profile_id=? AND d.state='published' AND j.state='approved' ORDER BY j.updated_at DESC LIMIT 1", profileId);
    return this.read(kind === 'model' ? job?.model_key : job?.thumb_key);
  }
  hasPublicModel(profileId: string): boolean { return Boolean(this.store.one("SELECT j.id FROM op_people_model_jobs j JOIN op_people_drafts d ON d.id=j.draft_id WHERE d.profile_id=? AND d.state='published' AND j.state='approved' LIMIT 1", profileId)); }
  private async read(key: string | null | undefined): Promise<{ bytes: ArrayBuffer; type: string }> {
    if (!key) throw new ApiError('NOT_FOUND', 404); const obj = await this.runtime.privateBucket.get(key); if (!obj) throw new ApiError('NOT_FOUND', 404);
    return { bytes: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType ?? 'application/octet-stream' };
  }
  private async purgePhotos(id: string): Promise<void> {
    for (const p of this.store.all<{ storage_key: string }>('SELECT storage_key FROM op_people_photos WHERE draft_id=?', id)) await this.runtime.privateBucket.delete(p.storage_key).catch(() => undefined);
    this.store.run('DELETE FROM op_people_photos WHERE draft_id=?', id);
  }
  /** Deletes every hosted photo and model of a deleted draft. */
  async purge(id: string): Promise<void> {
    await this.purgePhotos(id);
    for (const j of this.store.all<{ model_key: string | null; thumb_key: string | null }>('SELECT model_key,thumb_key FROM op_people_model_jobs WHERE draft_id=?', id)) for (const k of [j.model_key, j.thumb_key]) if (k) await this.runtime.privateBucket.delete(k).catch(() => undefined);
    this.store.run("UPDATE op_people_model_jobs SET model_key=NULL,thumb_key=NULL,state=CASE WHEN state IN ('submitting','queued','generating','validating') THEN 'failed' ELSE state END WHERE draft_id=?", id);
  }
}
