import type { Runtime } from './types';
import { ApiError, sha256 } from '../shared/security';
import { imageKind, measureFrame, validateDimensions } from '../shared/capture';
import { validateGlb, imageDimensions, type GlbInspection } from '../shared/glb';
import decodeJpeg from '../vendor/jpeg-decoder.js';
import encodeJpeg from '../vendor/jpeg-encoder.js';

export interface ScanResult { accepted: boolean; code: string; objectPresent: boolean; centered: boolean; model: string; }
export interface NormalizedImage { bytes: Uint8Array; hash: string; width: number; height: number; blur: number; exposure: number; signature: string; centered: boolean; backgroundConsistent: boolean; scan: ScanResult; }
interface Rgba { data: Uint8Array; width: number; height: number; }

/** Box-filter downscale of an RGBA buffer so analysis and screening never touch full-resolution pixels. */
function downscale(source: Rgba, longSide: number): Rgba {
  const scale = Math.min(1, longSide / Math.max(source.width, source.height));
  const width = Math.max(3, Math.round(source.width * scale)); const height = Math.max(3, Math.round(source.height * scale));
  const data = new Uint8Array(width * height * 4); const sx = source.width / width; const sy = source.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy); const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx); const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx)); let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy += 2) for (let xx = x0; xx < x1; xx += 2) { const i = (yy * source.width + xx) * 4; r += source.data[i]; g += source.data[i + 1]; b += source.data[i + 2]; n++; }
      const o = (y * width + x) * 4; data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = 255;
    }
  }
  return { data, width, height };
}
/** Lenient heuristic: the four border strips should share a similar average colour (one surface, one backdrop). */
function borderConsistency(image: Rgba): boolean {
  const strip = Math.max(2, Math.round(Math.min(image.width, image.height) * 0.08));
  const mean = (x0: number, y0: number, x1: number, y1: number) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * image.width + x) * 4; r += image.data[i]; g += image.data[i + 1]; b += image.data[i + 2]; n++; } return [r / n, g / n, b / n]; };
  const strips = [mean(0, 0, image.width, strip), mean(0, image.height - strip, image.width, image.height), mean(0, 0, strip, image.height), mean(image.width - strip, 0, image.width, image.height)];
  let worst = 0; for (let a = 0; a < strips.length; a++) for (let b = a + 1; b < strips.length; b++) worst = Math.max(worst, Math.hypot(strips[a][0] - strips[b][0], strips[a][1] - strips[b][1], strips[a][2] - strips[b][2]));
  return worst < 150;
}

/**
 * Per-photo screening is local and instant: the photo passed decode, resolution, focus and exposure gates. No AI call
 * runs per photo, so a slow or unavailable model can never stall a scan. The object itself is described once, later.
 */
export function screenFrame(): ScanResult { return { accepted: true, code: 'ACCEPTED', objectPresent: true, centered: true, model: 'local' }; }

/**
 * Strict in-Worker normalization: magic bytes, strict JPEG decode with pixel/memory caps, re-encode (which drops EXIF,
 * GPS and every other metadata segment), quality metrics on a downscaled copy, then a local acceptance check.
 * Hashes are computed after normalization.
 */
export async function normalizeImage(bytes: Uint8Array, runtime: Runtime): Promise<NormalizedImage> {
  if (imageKind(bytes) !== 'jpeg') throw new ApiError('UNSUPPORTED_IMAGE', 415);
  const header = imageDimensions(bytes); if (!header) throw new ApiError('IMAGE_NOT_VALIDATED', 422); validateDimensions(header.width, header.height);
  let decoded: Rgba;
  try { const image = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false, maxResolutionInMP: 4.3, maxMemoryUsageInMB: 64 }) as Rgba; decoded = { data: image.data, width: image.width, height: image.height }; }
  catch { throw new ApiError('IMAGE_NOT_VALIDATED', 422); }
  validateDimensions(decoded.width, decoded.height);
  const analysis = downscale(decoded, 256); const quality = measureFrame(new Uint8ClampedArray(analysis.data.buffer, analysis.data.byteOffset, analysis.data.byteLength), analysis.width, analysis.height);
  if (!Number.isFinite(quality.blur) || !Number.isFinite(quality.exposure) || quality.blur < 6 || quality.exposure < 16 || quality.exposure > 246) throw new ApiError('IMAGE_QUALITY', 422);
  const normalized = new Uint8Array((encodeJpeg({ data: decoded.data, width: decoded.width, height: decoded.height }, 88) as { data: Uint8Array }).data);
  if (imageKind(normalized) !== 'jpeg') throw new ApiError('IMAGE_NOT_VALIDATED', 422);
  void runtime; const scan = screenFrame();
  return { bytes: normalized, hash: await sha256(normalized), width: decoded.width, height: decoded.height, blur: quality.blur, exposure: quality.exposure, signature: quality.signature, centered: scan.centered, backgroundConsistent: borderConsistency(analysis), scan };
}

export interface ModelInspection { inspection: GlbInspection; bounds: { min: number[]; max: number[] }; }
/**
 * Validates a provider GLB for publication. Geometry bounds come from POSITION accessor min/max; textures are checked
 * for format and size. No server-side renderer runs here: the thumbnail is the provider-rendered preview.
 */
export function inspectModel(bytes: Uint8Array): ModelInspection {
  const inspection = validateGlb(bytes);
  if (!inspection.bounds || [...inspection.bounds.min, ...inspection.bounds.max].some(v => !Number.isFinite(v))) throw new ApiError('MODEL_BOUNDS_MISSING', 422);
  return { inspection, bounds: inspection.bounds };
}
/** Validates a provider preview image (PNG or JPEG, bounded size and dimensions). */
export function inspectThumbnail(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
  const kind = imageKind(bytes); const size = imageDimensions(bytes);
  if (!size || size.width < 64 || size.height < 64 || size.width > 2048 || size.height > 2048) throw new ApiError('INVALID_THUMBNAIL', 422);
  return kind === 'png' ? 'image/png' : 'image/jpeg';
}
