import { CANONICAL_VIEWS, VIEWS, type CaptureView, type ViewId } from './domain';
import { ApiError, canonicalJson } from './security';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Server decodes every frame in a Worker, so frames are capped (the capture app scales to 1600px on the long side). */
export const MAX_IMAGE_PIXELS = 4_200_000;
export const MIN_IMAGE_SIDE = 720;
export const CAPTURE_LONG_SIDE = 1600;
export function imageKind(bytes: Uint8Array): 'jpeg' | 'png' {
  if (bytes.length < 64 || bytes.length > MAX_IMAGE_BYTES) throw new ApiError('INVALID_IMAGE_SIZE');
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'png';
  throw new ApiError('UNSUPPORTED_IMAGE');
}
export function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < MIN_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) throw new ApiError('IMAGE_RESOLUTION');
}
export function validateCoverage(views: CaptureView[]): CaptureView[] {
  if (views.length < VIEWS.length || views.length > 24) throw new ApiError('CAPTURE_INCOMPLETE');
  const ids = new Set(views.map(v => v.view));
  if (VIEWS.some(v => !ids.has(v.id)) || new Set(views.map(v => v.hash)).size !== views.length) throw new ApiError('COVERAGE_OR_DUPLICATE');
  return CANONICAL_VIEWS.map(id => { const view = views.find(v => v.view === id); if (!view) throw new ApiError('CANONICAL_VIEW_MISSING'); return view; });
}
export function captureManifest(sessionId: string, views: CaptureView[]): string {
  const canonical = validateCoverage(views);
  return canonicalJson({ version: 1, captureSessionId: sessionId, captureMethod: 'guided_mobile_camera', coverageEvidence: 'user_guided_angles_plus_server_image_checks_not_3d_pose_proof', processedByProvider: canonical.map(v => v.id), views: [...views].sort((a, b) => a.view.localeCompare(b.view)).map(({ id, hash, view, width, height, bytes, acceptedAt }) => ({ id, hash, view, width, height, bytes, acceptedAt })) });
}
/** Lightweight local heuristic. Server decoder and moderation are still authoritative. */
export function measureFrame(rgba: Uint8ClampedArray, width: number, height: number): { blur: number; exposure: number; signature: string } {
  if (rgba.length !== width * height * 4 || width < 3 || height < 3) throw new Error('Invalid pixel buffer');
  const gray = new Float32Array(width * height); let light = 0; let mean = 0; let square = 0; let count = 0;
  for (let i = 0; i < gray.length; i++) { const g = (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114); gray[i] = g; light += g; }
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) { const i = y * width + x; const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]; mean += lap; square += lap * lap; count++; }
  let signature = ''; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const row = Math.min(height - 1, Math.floor((y + 0.5) * height / 8)) * width; const a = Math.min(width - 1, Math.floor(x * width / 9)); const b = Math.min(width - 1, Math.floor((x + 1) * width / 9)); signature += gray[row + a] > gray[row + b] ? '1' : '0'; }
  return { blur: square / count - (mean / count) ** 2, exposure: light / gray.length, signature };
}
export function perceptualDistance(a: string, b: string): number { if (!/^[01]{64}$/.test(a) || !/^[01]{64}$/.test(b)) throw new Error('Invalid image signature'); return [...a].reduce((sum, bit, i) => sum + Number(bit !== b[i]), 0); }
export function isViewId(id: string): id is ViewId { return VIEWS.some(view => view.id === id); }
