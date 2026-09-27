import decodeJpeg from '../vendor/jpeg-decoder.js';
import { CANONICAL_VIEWS } from '../shared/domain';
import { canonicalJson, sha256 } from '../shared/security';
import { fingerprintJson, combinedSimilarity, DUPLICATE_RULE, FINGERPRINT_VERSION, geometryFingerprint, viewSurface, WEIGHTS, type GeometryFingerprint, type SurfaceFingerprint } from '../shared/fingerprint';
import { attestationMessage, leafHash, merkleLevels, type ObjectProof, type ProofLeaf } from '../shared/proof';
import type { Runtime } from './types';
import type { Store } from './store';
import type { SponsorService } from './sponsor';

interface FpRow { session_id: string; geometry: string; surface: string; geometry_hash: string; surface_hash: string; score: number | null; nearest: number | null; nearest_session: string | null; compared: number; created_at: number; }
export interface Fingerprints { geometry: GeometryFingerprint | null; surface: SurfaceFingerprint; geometryHash: string; surfaceHash: string; }
export interface UniquenessResult { score: number; nearest: number; nearestSession: string | null; compared: number; duplicate: boolean; breakdown: { geometry: number; surface: number; phash: number } | null; }

/**
 * Uniqueness v2: geometry + surface fingerprints for every scanned object, a combined similarity against the whole archive,
 * and a signed SHA-256 Merkle proof per coin. Runs after the 3D model is validated (new scans) and as a background backfill
 * for coins launched before v2 existed.
 */
export class UniquenessV2 {
  /** Last fingerprint failure (no secrets), surfaced on /verify for diagnosis. */
  lastError = '';
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly sponsor: SponsorService) {
    store.run('CREATE TABLE IF NOT EXISTS op_fingerprints_v2 (session_id TEXT PRIMARY KEY, geometry TEXT NOT NULL, surface TEXT NOT NULL, geometry_hash TEXT NOT NULL, surface_hash TEXT NOT NULL, score REAL, nearest REAL, nearest_session TEXT, compared INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)');
    store.run('CREATE TABLE IF NOT EXISTS op_proofs (object_id TEXT PRIMARY KEY, root TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)');
  }
  row(sessionId: string): FpRow | undefined { return this.store.one<FpRow>('SELECT * FROM op_fingerprints_v2 WHERE session_id=?', sessionId); }

  /** Computes both fingerprints from stored bytes. Never throws for surface issues; geometry is null if the GLB can't be sampled. */
  async compute(sessionId: string, modelHash: string): Promise<Fingerprints> {
    let geometry: GeometryFingerprint | null = null;
    const model = await this.runtime.artifactBucket.get(`objectpad/v1/artifacts/${modelHash}`);
    if (model) { try { geometry = geometryFingerprint(new Uint8Array(await model.arrayBuffer()), modelHash); } catch (error) { this.lastError = `geometry: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`; console.warn('objectpad.uq2.geometry', this.lastError); } }
    const views: SurfaceFingerprint['views'] = [];
    for (const view of CANONICAL_VIEWS) {
      const row = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_capture_views WHERE session_id=? AND view_id=?', sessionId, view);
      const file = row ? await this.runtime.privateBucket.get(row.storage_key) : null; if (!file) continue;
      try { const img = decodeJpeg(new Uint8Array(await file.arrayBuffer()), { useTArray: true, formatAsRGBA: true, tolerantDecoding: true, maxResolutionInMP: 4.3, maxMemoryUsageInMB: 96 }) as { data: Uint8Array; width: number; height: number }; views.push(viewSurface(view, img.data, img.width, img.height)); } catch (error) { this.lastError = `surface ${view}: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`; }
    }
    const surface: SurfaceFingerprint = { v: 2, views };
    return { geometry, surface, geometryHash: await sha256(fingerprintJson(geometry ?? { v: 2, empty: true })), surfaceHash: await sha256(fingerprintJson(surface)) };
  }

  /** Sessions whose objects count as "taken": launched coins, and other people's scans still in progress. */
  private archive(sessionId: string, owner: string): FpRow[] {
    return this.store.all<FpRow & { owner: string; state: string; launched: number }>("SELECT f.*, s.owner, s.state, (SELECT COUNT(*) FROM op_records r WHERE r.session_id=f.session_id AND r.state='confirmed') AS launched FROM op_fingerprints_v2 f JOIN op_capture_sessions s ON s.id=f.session_id WHERE f.session_id<>?", sessionId)
      .filter(r => Number(r.launched) > 0 || (r.owner !== owner && !['failed', 'cancelled', 'blocked', 'expired'].includes(r.state)));
  }
  /** Compares one fingerprint set with the archive. Score = 100 x (1 - highest combined similarity). */
  compare(sessionId: string, owner: string, fp: Fingerprints): UniquenessResult {
    let best = 0; let bestSession: string | null = null; let breakdown: UniquenessResult['breakdown'] = null; let duplicate = false; const rows = this.archive(sessionId, owner);
    for (const r of rows) {
      const sim = combinedSimilarity(fp.geometry, JSON.parse(r.geometry) as GeometryFingerprint | null, fp.surface, JSON.parse(r.surface) as SurfaceFingerprint);
      if (sim.combined > best) { best = sim.combined; bestSession = r.session_id; breakdown = { geometry: sim.geometry, surface: sim.surface, phash: sim.phash }; }
      if (sim.duplicate) duplicate = true;
    }
    return { score: Math.round((1 - best) * 1000) / 10, nearest: best, nearestSession: bestSession, compared: rows.length, duplicate, breakdown };
  }
  save(sessionId: string, fp: Fingerprints, result: UniquenessResult): void {
    this.store.run('INSERT OR REPLACE INTO op_fingerprints_v2(session_id,geometry,surface,geometry_hash,surface_hash,score,nearest,nearest_session,compared,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', sessionId, JSON.stringify(fp.geometry), JSON.stringify(fp.surface), fp.geometryHash, fp.surfaceHash, result.score, result.nearest, result.nearestSession, result.compared, Date.now());
  }

  /** Background backfill: fingerprints launched coins that predate v2 (two per call to keep alarms short). */
  async backfill(limit = 2): Promise<number> {
    const rows = this.store.all<{ session_id: string; owner: string; model: string }>("SELECT r.session_id, r.owner, json_extract(r.commitment,'$.originalModelHash') AS model FROM op_records r WHERE r.state='confirmed' AND NOT EXISTS (SELECT 1 FROM op_fingerprints_v2 f WHERE f.session_id=r.session_id) ORDER BY r.rowid ASC LIMIT ?", limit);
    for (const r of rows) {
      try { const fp = await this.compute(r.session_id, r.model); const result = this.compare(r.session_id, r.owner, fp); this.save(r.session_id, fp, { ...result, duplicate: false }); this.store.metric('uq2_backfilled'); }
      catch (error) { this.lastError = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : String(error).slice(0, 200); console.warn('objectpad.uq2.backfill', this.lastError); this.store.run('INSERT OR REPLACE INTO op_fingerprints_v2(session_id,geometry,surface,geometry_hash,surface_hash,score,nearest,nearest_session,compared,created_at) VALUES (?,?,?,?,?,NULL,NULL,NULL,0,?)', r.session_id, 'null', '{"v":2,"views":[]}', '0'.repeat(64), '0'.repeat(64), Date.now()); }
    }
    return rows.length;
  }
  pendingBackfill(): boolean { return Boolean(this.store.one("SELECT r.id FROM op_records r WHERE r.state='confirmed' AND NOT EXISTS (SELECT 1 FROM op_fingerprints_v2 f WHERE f.session_id=r.session_id) LIMIT 1")); }

  /** Public summary for a coin page. */
  summary(sessionId: string): { version: 2; score: number | null; nearest: number | null; compared: number; geometryHash: string; surfaceHash: string; rule: typeof DUPLICATE_RULE; weights: typeof WEIGHTS; hasGeometry: boolean } | null {
    const r = this.row(sessionId); if (!r) return null;
    return { version: FINGERPRINT_VERSION, score: r.score, nearest: r.nearest, compared: r.compared, geometryHash: r.geometry_hash, surfaceHash: r.surface_hash, rule: DUPLICATE_RULE, weights: WEIGHTS, hasGeometry: r.geometry !== 'null' };
  }

  /** Builds (once) and returns the signed Merkle proof of one launched coin. */
  async proof(input: { objectId: string; sessionId: string; manifestHash: string; modelHash: string; creatorWallet: string; x: { id: string; handle: string } | null }): Promise<ObjectProof & { fingerprints: { geometry: unknown; surface: unknown } }> {
    const fp = this.row(input.sessionId);
    const identity = canonicalJson({ wallet: input.creatorWallet.toLowerCase(), xUserId: input.x?.id ?? null, xHandle: input.x?.handle ?? null });
    const values: [ProofLeaf['label'], string][] = [['object_id', input.objectId], ['capture_manifest', input.manifestHash], ['model_sha256', input.modelHash], ['geometry_fp', fp?.geometry_hash ?? 'pending'], ['surface_fp', fp?.surface_hash ?? 'pending'], ['creator_identity', identity]];
    const leaves: ProofLeaf[] = []; for (const [label, value] of values) leaves.push({ label, value, hash: await leafHash(label, value) });
    const levels = await merkleLevels(leaves.map(l => l.hash)); const root = levels[levels.length - 1][0];
    const cached = this.store.one<{ root: string; payload: string }>('SELECT root,payload FROM op_proofs WHERE object_id=?', input.objectId);
    const extra = { fingerprints: { geometry: fp ? JSON.parse(fp.geometry) : null, surface: fp ? JSON.parse(fp.surface) : null } };
    if (cached?.root === root) return { ...(JSON.parse(cached.payload) as ObjectProof), ...extra };
    const score = fp?.score ?? null; const message = attestationMessage({ objectId: input.objectId, root, creatorWallet: input.creatorWallet, xUserId: input.x?.id ?? null, score });
    let signature: string | null = null; try { signature = await this.sponsor.attest(message); } catch { /* unsigned proofs still verify by hash */ }
    const proof: ObjectProof = { version: 2, objectId: input.objectId, leaves, levels, root, score, nearest: fp?.nearest ?? null, compared: fp?.compared ?? 0, message, signature, signer: signature ? this.sponsor.address : null, issuedAt: Date.now() };
    if (fp) this.store.run('INSERT OR REPLACE INTO op_proofs(object_id,root,payload,created_at) VALUES (?,?,?,?)', input.objectId, root, JSON.stringify(proof), Date.now());
    return { ...proof, ...extra };
  }
}
