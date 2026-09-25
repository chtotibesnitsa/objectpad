import type { ObjectSuggestion } from '../shared/domain';
import { ApiError } from '../shared/security';
import { visionJson } from './ai';
import type { Runtime } from './types';
import { Store } from './store';

const DESCRIBE = 'You catalogue physical objects for a launchpad that turns each real object into exactly one coin. You receive photos of ONE object from different angles. Return JSON only with keys: "object" (short noun phrase, e.g. "pink knitted beanie"), "category" (one word), "colors" (up to 4 dominant colour words), "materials" (up to 3 words), "markings" (visible text, logos, wear or unique marks, "" if none), "catalog" (a neutral museum-catalogue title for this exact object, 2-6 words, Title Case, colour + material + object type, e.g. "Pink Knitted Wool Beanie" or "Green Vinyl Frog Figurine", no brand names, no jokes), "keywords" (8-14 lowercase single words describing type, shape, colour, material and marks), "name" (a fun, memorable coin name for this exact object, 2-28 characters, no emoji, no brand names), "ticker" (3-8 uppercase letters A-Z), "story" (one playful sentence under 140 characters about the object, with no claims about value, rarity, authenticity or ownership).';
const COMPARE = 'You stop the same physical object from being tokenized twice. Image 1 is a new scan. Image 2 is an object already in the archive. Decide whether image 2 shows the same object or a practically indistinguishable copy of it (same product, colours, shape and markings), in which case the new scan must be rejected. Different items of the same general kind (two different mugs) are NOT the same. Return JSON only: {"same": boolean, "confidence": number from 0 to 1, "reason": short phrase}.';

export interface Fingerprint { object: string; category: string; colors: string[]; materials: string[]; markings: string; keywords: string[]; }
export interface Screening { fingerprint: Fingerprint; tokens: string[]; suggestion: ObjectSuggestion; model: string; }

const words = (value: unknown, max: number): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map(v => v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)).filter(v => v.length > 1).slice(0, max) : [];
// Control and bidi characters are stripped from model output before it can reach an onchain name.
// eslint-disable-next-line no-control-regex
const text = (value: unknown, max: number): string => typeof value === 'string' ? value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
/** Jaccard overlap of two keyword sets, used only to shortlist archive objects for a pairwise visual comparison. */
export function similarity(a: string[], b: string[]): number { const left = new Set(a); const right = new Set(b); let shared = 0; for (const word of left) if (right.has(word)) shared++; return shared / Math.max(1, left.size + right.size - shared); }
export function tickerFrom(name: string): string { const letters = name.toUpperCase().replace(/[^A-Z]/g, ''); return (letters.length >= 3 ? letters : `${letters}OBJ`).slice(0, 8); }

/**
 * AI duplicate-object screening, run before any paid reconstruction:
 * 1. A vision model fingerprints the object (type, colours, materials, marks) from two accepted views.
 * 2. Archive objects with overlapping fingerprints are shortlisted.
 * 3. Each shortlisted object's front view is compared side by side with the new scan; a confident match rejects it.
 * Exact-frame and perceptual-hash duplicate checks still run at upload and before this step.
 */
export class UniquenessService {
  constructor(private readonly store: Store, private readonly runtime: Runtime) {}
  get model(): string { return this.runtime.env.OBJECTPAD_UNIQUENESS_MODEL?.trim() || this.runtime.env.OBJECTPAD_SCAN_MODEL?.trim() || 'google/gemini-3.8-flash'; }
  private async frame(sessionId: string, view: string): Promise<Uint8Array | null> {
    const row = this.store.one<{ storage_key: string }>('SELECT storage_key FROM op_capture_views WHERE session_id=? AND view_id=?', sessionId, view);
    const object = row ? await this.runtime.privateBucket.get(row.storage_key) : null; return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
  async screen(sessionId: string, owner: string): Promise<Screening> {
    const front = await this.frame(sessionId, 'front'); const side = (await this.frame(sessionId, 'right')) ?? (await this.frame(sessionId, 'left'));
    if (!front) throw new ApiError('CAPTURE_STORAGE_MISSING', 503);
    // Naming is best effort: if every AI model is unavailable the scan still goes straight to the 3D build with a
    // neutral name the creator can edit. Exact and perceptual duplicate checks already ran without AI.
    let described: Record<string, unknown>;
    try { described = await visionJson(this.runtime, DESCRIBE, 'Describe this object.', side ? [front, side] : [front], 600); }
    catch { this.store.metric('describe_fallback'); return { fingerprint: { object: 'real object', category: 'object', colors: [], materials: [], markings: '', keywords: [] }, tokens: [], model: 'fallback', suggestion: { object: 'real object', catalog: 'Real Object', colors: [], materials: [], name: 'Real Object', ticker: 'OBJECT', story: 'A real object, scanned in 3D and launched on ObjectPad.', compared: 0 } }; }
    const fingerprint: Fingerprint = { object: text(described.object, 60).toLowerCase(), category: text(described.category, 30).toLowerCase(), colors: words(described.colors, 4), materials: words(described.materials, 3), markings: text(described.markings, 160), keywords: words(described.keywords, 14) };
    if (!fingerprint.object) fingerprint.object = 'real object';
    const tokens = [...new Set([...fingerprint.keywords, ...fingerprint.colors, ...fingerprint.materials, ...words(fingerprint.object.split(' '), 6), ...words([fingerprint.category], 1)])].slice(0, 40);
    const archive = this.store.all<{ session_id: string; tokens: string; owner: string; state: string; launched: number }>('SELECT f.session_id, f.tokens, s.owner, s.state, (SELECT COUNT(*) FROM op_records r WHERE r.session_id=f.session_id) AS launched FROM op_fingerprints f JOIN op_capture_sessions s ON s.id=f.session_id WHERE f.session_id<>?', sessionId)
      // A creator may rescan their own object after a failed attempt; anything launched, or in progress for someone else, counts.
      .filter(row => Number(row.launched) > 0 || (row.owner !== owner && !['failed', 'cancelled', 'blocked', 'expired'].includes(row.state)));
    const shortlist = archive.map(row => ({ id: row.session_id, score: similarity(tokens, JSON.parse(row.tokens) as string[]) })).filter(row => row.score >= 0.15).sort((a, b) => b.score - a.score).slice(0, 4);
    for (const candidate of shortlist) {
      const other = await this.frame(candidate.id, 'front'); if (!other) continue;
      const verdict = await visionJson(this.runtime, COMPARE, 'Image 1: new scan. Image 2: archived object.', [front, other], 200).catch(() => ({} as Record<string, unknown>));
      if (verdict.same === true && Number(verdict.confidence) >= 0.7) { this.store.metric('duplicate_object_rejected'); throw new ApiError('DUPLICATE_OBJECT', 409); }
    }
    this.store.metric('uniqueness_passed');
    const name = text(described.name, 28) || fingerprint.object.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 28);
    const ticker = typeof described.ticker === 'string' && /^[A-Z]{3,8}$/.test(described.ticker) ? described.ticker : tickerFrom(name);
    const catalog = text(described.catalog, 48) || fingerprint.object.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 48);
    return { fingerprint, tokens, model: this.model, suggestion: { object: fingerprint.object, catalog, colors: fingerprint.colors, materials: fingerprint.materials, name: name.length >= 2 ? name : 'Real Object', ticker, story: text(described.story, 140) || `A real ${fingerprint.object}, scanned and launched on ObjectPad.`, compared: archive.length } };
  }
  save(sessionId: string, screening: Screening): void { this.store.run('INSERT OR REPLACE INTO op_fingerprints(session_id,tokens,payload,created_at) VALUES (?,?,?,?)', sessionId, JSON.stringify(screening.tokens), JSON.stringify(screening.fingerprint), Date.now()); }
}
