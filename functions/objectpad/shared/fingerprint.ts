/**
 * ObjectPad Uniqueness v2: deterministic, reproducible object fingerprints.
 *
 * Geometry fingerprint (from the reconstructed GLB):
 *   - Surface points are drawn by area-weighted triangle sampling with a PRNG seeded from the model's SHA-256, so the
 *     same file always yields the same fingerprint.
 *   - Points are centred on their centroid and scaled by their RMS radius (translation and scale invariant).
 *   - D2 shape distribution: histogram of distances between random point pairs (Osada et al. 2002), rotation invariant.
 *   - A3 distribution: histogram of angles formed by random point triples, rotation invariant.
 *   - PCA spectrum: normalised eigenvalues of the 3x3 covariance matrix (Jacobi rotation), i.e. the object's proportions.
 *   - Sphericity: pi^(1/3) (6V)^(2/3) / A from the signed-tetrahedron volume and total surface area.
 *
 * Surface fingerprint (from the canonical capture photos):
 *   - HSV colour histogram (8 hue x 3 saturation x 3 value bins) over the central 70% of each view.
 *   - Local binary pattern texture histogram (256 bins), which responds to wear, stitching, scratches and print.
 *   - 64-bit DCT perceptual hash (32x32 grayscale, 2D DCT-II, 8x8 low-frequency block, median threshold).
 *
 * All similarities are in [0, 1]. The combined score and duplicate rule are defined in `combinedSimilarity`.
 */
import { validateGlb } from './glb';

export const FINGERPRINT_VERSION = 2;
export const D2_BINS = 32; export const A3_BINS = 16; export const SAMPLES = 4096; export const D2_RANGE = 3;
/** Published duplicate rule: all three gates must pass for two objects to be treated as the same object. */
export const DUPLICATE_RULE = { combined: 0.92, geometry: 0.9, surface: 0.85 } as const;
/** Published component weights of the combined similarity. */
export const WEIGHTS = { geometry: 0.4, surface: 0.3, phash: 0.3 } as const;

export interface GeometryFingerprint { v: 2; d2: number[]; a3: number[]; pca: number[]; sphericity: number; triangles: number; samples: number; }
export interface ViewSurface { view: string; hsv: number[]; lbp: number[]; phash: string; }
export interface SurfaceFingerprint { v: 2; views: ViewSurface[]; }
export interface Similarity { geometry: number; surface: number; phash: number; combined: number; duplicate: boolean; }

const round = (n: number, d = 5): number => Math.round(n * 10 ** d) / 10 ** d;
const normalise = (h: number[]): number[] => { const s = h.reduce((a, b) => a + b, 0) || 1; return h.map(v => round(v / s)); };

/** xorshift32 PRNG, seeded from the first 8 hex characters of a SHA-256. */
function prng(seedHex: string): () => number { let x = (parseInt(seedHex.slice(0, 8), 16) >>> 0) || 0x9e3779b9; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x1_0000_0000; }; }

/** Reads every triangle (as flat xyz triples) from a validated GLB. Node transforms are ignored (single-mesh scans). */
function triangles(glb: Uint8Array): Float32Array {
  const inspection = validateGlb(glb); const json = inspection.json; const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true); const bin = 20 + jsonLength + 8;
  const read = (index: number): { get: (i: number, lane: number) => number; count: number; lanes: number } => {
    const a = json.accessors![index]; const b = json.bufferViews![a.bufferView!]; const width = ({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>)[a.componentType];
    const lanes = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[a.type]; const stride = b.byteStride ?? width * lanes; const base = bin + (b.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const get = (i: number, lane: number): number => { const o = base + i * stride + lane * width; switch (a.componentType) { case 5126: return view.getFloat32(o, true); case 5125: return view.getUint32(o, true); case 5123: return view.getUint16(o, true); case 5121: return view.getUint8(o); case 5122: return view.getInt16(o, true); default: return view.getInt8(o); } };
    return { get, count: a.count, lanes };
  };
  const out: number[] = [];
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives) {
    const pos = read(p.attributes.POSITION); const idx = p.indices === undefined ? null : read(p.indices); const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) { const v = idx ? idx.get(i, 0) : i; if (v >= pos.count) continue; out.push(pos.get(v, 0), pos.get(v, 1), pos.get(v, 2)); }
  }
  return new Float32Array(out.slice(0, out.length - (out.length % 9)));
}

/** Symmetric 3x3 eigenvalues by cyclic Jacobi rotation. */
function eigen3(m: number[][]): number[] {
  const a = m.map(r => [...r]);
  for (let sweep = 0; sweep < 32; sweep++) {
    let off = 0; for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] ** 2; if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-20) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]); const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)); const c = 1 / Math.sqrt(t * t + 1); const s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p]; const akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k]; const aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    }
  }
  return [a[0][0], a[1][1], a[2][2]].map(v => Math.max(0, v)).sort((x, y) => y - x);
}

/** Geometry fingerprint of a GLB. `seedHex` is the model's SHA-256 so the result is reproducible by anyone. */
export function geometryFingerprint(glb: Uint8Array, seedHex: string): GeometryFingerprint {
  const tri = readTriangles(glb); const count = tri.length / 9; if (count < 1) throw new Error('GEOMETRY_EMPTY');
  const cumulative = new Float64Array(count); let area = 0; let volume = 0;
  for (let t = 0; t < count; t++) {
    const o = t * 9; const ax = tri[o], ay = tri[o + 1], az = tri[o + 2], bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5], cx = tri[o + 6], cy = tri[o + 7], cz = tri[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; area += Math.hypot(nx, ny, nz) / 2; cumulative[t] = area;
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  const rand = prng(seedHex); const pts = new Float64Array(SAMPLES * 3);
  for (let i = 0; i < SAMPLES; i++) {
    const target = rand() * area; let lo = 0, hi = count - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < target) lo = mid + 1; else hi = mid; }
    let r1 = rand(), r2 = rand(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; } const o = lo * 9;
    for (let k = 0; k < 3; k++) pts[i * 3 + k] = tri[o + k] + r1 * (tri[o + 3 + k] - tri[o + k]) + r2 * (tri[o + 6 + k] - tri[o + k]);
  }
  const c = [0, 0, 0]; for (let i = 0; i < SAMPLES; i++) for (let k = 0; k < 3; k++) c[k] += pts[i * 3 + k] / SAMPLES;
  let rms = 0; for (let i = 0; i < SAMPLES; i++) { for (let k = 0; k < 3; k++) pts[i * 3 + k] -= c[k]; rms += pts[i * 3] ** 2 + pts[i * 3 + 1] ** 2 + pts[i * 3 + 2] ** 2; }
  rms = Math.sqrt(rms / SAMPLES) || 1; for (let i = 0; i < pts.length; i++) pts[i] /= rms;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < SAMPLES; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] += pts[i * 3 + a] * pts[i * 3 + b] / SAMPLES;
  const ev = eigen3(cov); const evSum = ev.reduce((s, v) => s + v, 0) || 1;
  const d2 = new Array<number>(D2_BINS).fill(0); const a3 = new Array<number>(A3_BINS).fill(0);
  for (let i = 0; i < SAMPLES; i++) {
    const p = Math.floor(rand() * SAMPLES) * 3, q = Math.floor(rand() * SAMPLES) * 3, r = Math.floor(rand() * SAMPLES) * 3;
    const d = Math.hypot(pts[p] - pts[q], pts[p + 1] - pts[q + 1], pts[p + 2] - pts[q + 2]); d2[Math.min(D2_BINS - 1, Math.floor(d / D2_RANGE * D2_BINS))]++;
    const ux = pts[p] - pts[q], uy = pts[p + 1] - pts[q + 1], uz = pts[p + 2] - pts[q + 2], vx = pts[r] - pts[q], vy = pts[r + 1] - pts[q + 1], vz = pts[r + 2] - pts[q + 2];
    const den = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz); if (den > 1e-12) { const ang = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / den))); a3[Math.min(A3_BINS - 1, Math.floor(ang / Math.PI * A3_BINS))]++; }
  }
  const sphericity = area > 0 ? Math.min(1, Math.cbrt(Math.PI) * Math.pow(6 * Math.abs(volume), 2 / 3) / area) : 0;
  return { v: 2, d2: normalise(d2), a3: normalise(a3), pca: ev.map(v => round(v / evSum)), sphericity: round(sphericity), triangles: count, samples: SAMPLES };
}
const readTriangles = triangles;

/** 2D DCT-II based 64-bit perceptual hash from a 32x32 grayscale grid. */
function phash(gray32: Float64Array): string {
  const N = 32; const cos = new Float64Array(N * N); for (let u = 0; u < N; u++) for (let x = 0; x < N; x++) cos[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  const coeffs: number[] = [];
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let sum = 0; for (let y = 0; y < N; y++) { let row = 0; for (let x = 0; x < N; x++) row += gray32[y * N + x] * cos[v * N + x]; sum += row * cos[u * N + y]; } coeffs.push(sum); }
  const ac = coeffs.slice(1); const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)];
  let bits = ''; for (const c of coeffs) bits += c > median ? '1' : '0';
  let hex = ''; for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16); return hex;
}

/** Surface fingerprint of one decoded RGBA photo. */
export function viewSurface(view: string, rgba: Uint8Array, width: number, height: number): ViewSurface {
  const S = 96; const cropW = width * 0.7, cropH = height * 0.7; const x0 = (width - cropW) / 2, y0 = (height - cropH) / 2;
  const gray = new Float64Array(S * S); const hsv = new Array<number>(72).fill(0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = Math.min(width - 1, Math.floor(x0 + (x + 0.5) * cropW / S)); const sy = Math.min(height - 1, Math.floor(y0 + (y + 0.5) * cropH / S)); const i = (sy * width + sx) * 4;
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255; gray[y * S + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let h = 0;
    if (d > 0) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const s = max > 0 ? d / max : 0; hsv[Math.min(7, Math.floor(h / 6 * 8)) * 9 + Math.min(2, Math.floor(s * 3)) * 3 + Math.min(2, Math.floor(max * 3))]++;
  }
  const lbp = new Array<number>(256).fill(0); const offsets = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) { const c = gray[y * S + x]; let code = 0; offsets.forEach(([dx, dy], k) => { if (gray[(y + dy) * S + x + dx] >= c) code |= 1 << k; }); lbp[code]++; }
  const g32 = new Float64Array(32 * 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { let s = 0; for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) s += gray[(y * 3 + yy) * S + x * 3 + xx]; g32[y * 32 + x] = s / 9; }
  return { view, hsv: normalise(hsv), lbp: normalise(lbp), phash: phash(g32) };
}

const l1 = (a: number[], b: number[]): number => a.reduce((s, v, i) => s + Math.abs(v - (b[i] ?? 0)), 0);
const intersection = (a: number[], b: number[]): number => a.reduce((s, v, i) => s + Math.min(v, b[i] ?? 0), 0);
/** Hamming distance of two 64-bit hex hashes. */
export function hamming64(a: string, b: string): number { let d = 0; for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; }

/** Geometry similarity: 1 minus the weighted half-L1 distance of D2, A3 and the PCA spectrum, plus sphericity. */
export function geometrySimilarity(a: GeometryFingerprint, b: GeometryFingerprint): number {
  const dist = 0.45 * l1(a.d2, b.d2) / 2 + 0.3 * l1(a.a3, b.a3) / 2 + 0.15 * l1(a.pca, b.pca) / 2 + 0.1 * Math.abs(a.sphericity - b.sphericity);
  return round(Math.max(0, 1 - dist), 4);
}
/** Surface and perceptual-hash similarity, averaged over the views both captures share. pHash is chance-corrected (random = 0). */
export function surfaceSimilarity(a: SurfaceFingerprint, b: SurfaceFingerprint): { surface: number; phash: number } {
  let s = 0, p = 0, n = 0;
  for (const va of a.views) { const vb = b.views.find(v => v.view === va.view); if (!vb) continue; s += 0.6 * intersection(va.hsv, vb.hsv) + 0.4 * intersection(va.lbp, vb.lbp); p += Math.max(0, (1 - hamming64(va.phash, vb.phash) / 64 - 0.5) / 0.5); n++; }
  return n ? { surface: round(s / n, 4), phash: round(p / n, 4) } : { surface: 0, phash: 0 };
}
/** Combined score S = 0.4 G + 0.3 S_surface + 0.3 P, and the three-gate duplicate rule. */
export function combinedSimilarity(ga: GeometryFingerprint | null, gb: GeometryFingerprint | null, sa: SurfaceFingerprint, sb: SurfaceFingerprint): Similarity {
  const geometry = ga && gb ? geometrySimilarity(ga, gb) : 0; const { surface, phash: ph } = surfaceSimilarity(sa, sb);
  const combined = round(ga && gb ? WEIGHTS.geometry * geometry + WEIGHTS.surface * surface + WEIGHTS.phash * ph : (surface + ph) / 2, 4);
  return { geometry, surface, phash: ph, combined, duplicate: Boolean(ga && gb) && combined >= DUPLICATE_RULE.combined && geometry >= DUPLICATE_RULE.geometry && surface >= DUPLICATE_RULE.surface };
}

/**
 * Stable JSON for fingerprints: lexically sorted keys, NFC strings, and numbers printed with JavaScript's shortest
 * round-trip form (all fingerprint values are pre-rounded to 5 decimals, so this is deterministic across runtimes).
 */
export function fingerprintJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Non-finite number'); return String(Math.round(value * 1e5) / 1e5); }
  if (Array.isArray(value)) return `[${value.map(fingerprintJson).join(',')}]`;
  if (typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${fingerprintJson(v)}`).join(',')}}`;
  throw new Error('Unsupported value');
}
