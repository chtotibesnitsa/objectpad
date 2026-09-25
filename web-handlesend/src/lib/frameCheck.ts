/** Live readout of one camera frame, measured on a small downscaled copy. Every flag comes from real pixels. */
export interface FrameCheck {
  /** Mean brightness of the centre, 0–255. */
  brightness: number;
  /** Laplacian variance in the centre: higher is sharper. */
  focus: number;
  /** How strongly the centre stands out from the border (edges and colour). */
  objectScore: number;
  light: 'dark' | 'bright' | 'ok';
  sharp: boolean;
  object: boolean;
  /** 64-bit perceptual signature of the whole frame, used for steadiness and "is this a new angle". */
  signature: string;
}

const DARK = 48; const BRIGHT = 222; const FOCUS_MIN = 26;

/**
 * Measures light, focus and whether something distinct sits in the middle of the frame (vs. an empty table or wall).
 * The object test compares edge density and average colour inside the centre box with the border ring around it.
 */
export function checkFrame(rgba: Uint8ClampedArray, width: number, height: number): FrameCheck {
  const n = width * height; const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) gray[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  const cx0 = Math.floor(width * 0.22); const cx1 = Math.ceil(width * 0.78); const cy0 = Math.floor(height * 0.2); const cy1 = Math.ceil(height * 0.8);
  const bw = Math.max(2, Math.floor(width * 0.1)); const bh = Math.max(2, Math.floor(height * 0.1));
  let cSum = 0; let cCount = 0; let lapMean = 0; let lapSq = 0; let cEdge = 0; let bEdge = 0; let bCount = 0;
  const cRgb = [0, 0, 0]; const bRgb = [0, 0, 0];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x; const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]; const edge = Math.abs(lap);
    if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) { cSum += gray[i]; cCount++; lapMean += lap; lapSq += lap * lap; cEdge += edge; cRgb[0] += rgba[i * 4]; cRgb[1] += rgba[i * 4 + 1]; cRgb[2] += rgba[i * 4 + 2]; }
    else if (x < bw || x >= width - bw || y < bh || y >= height - bh) { bEdge += edge; bCount++; bRgb[0] += rgba[i * 4]; bRgb[1] += rgba[i * 4 + 1]; bRgb[2] += rgba[i * 4 + 2]; }
  }
  const brightness = cSum / Math.max(1, cCount); const focus = lapSq / Math.max(1, cCount) - (lapMean / Math.max(1, cCount)) ** 2;
  const centreEdge = cEdge / Math.max(1, cCount); const borderEdge = bEdge / Math.max(1, bCount);
  const colourGap = Math.hypot(cRgb[0] / Math.max(1, cCount) - bRgb[0] / Math.max(1, bCount), cRgb[1] / Math.max(1, cCount) - bRgb[1] / Math.max(1, bCount), cRgb[2] / Math.max(1, cCount) - bRgb[2] / Math.max(1, bCount));
  const objectScore = centreEdge / (borderEdge + 1.5) + colourGap / 40;
  let signature = ''; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const row = Math.min(height - 1, Math.floor((y + 0.5) * height / 8)) * width; const a = Math.min(width - 1, Math.floor(x * width / 9)); const b = Math.min(width - 1, Math.floor((x + 1) * width / 9)); signature += gray[row + a] > gray[row + b] ? '1' : '0'; }
  return { brightness, focus, objectScore, light: brightness < DARK ? 'dark' : brightness > BRIGHT ? 'bright' : 'ok', sharp: focus > FOCUS_MIN, object: centreEdge > 3.2 && objectScore > 1.35, signature };
}

/** 16×12 grid of mean brightness, used to tell "phone is still" and "you moved to a new side" apart from sensor noise. */
export function thumbnail(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(192); const count = new Float32Array(192);
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) { const i = (y * width + x) * 4; const cell = Math.min(11, Math.floor(y * 12 / height)) * 16 + Math.min(15, Math.floor(x * 16 / width)); out[cell] += rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114; count[cell]++; }
  for (let i = 0; i < 192; i++) out[i] /= Math.max(1, count[i]);
  return out;
}
/** Mean absolute difference of two thumbnails (0–255). About 2–5 for a hand-held still phone, 20+ after moving to a new side. */
export function thumbDiff(a: Float32Array, b: Float32Array): number { let sum = 0; for (let i = 0; i < 192; i++) sum += Math.abs(a[i] - b[i]); return sum / 192; }
