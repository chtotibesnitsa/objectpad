import { ApiError } from './security';
export const GLB_LIMIT = 24 * 1024 * 1024;
export const MAX_TEXTURE_SIDE = 4096;
/** Material-only extensions that change shading, never geometry decoding or resource loading. */
export const SAFE_EXTENSIONS: ReadonlySet<string> = new Set(['KHR_materials_emissive_strength', 'KHR_texture_transform', 'KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_clearcoat', 'KHR_materials_sheen', 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_unlit']);
const URL_LIKE = /\b(?:https?|file|data|javascript|ftp|blob|ws|wss):/i;
interface Gltf { asset?: { version?: string }; buffers?: { uri?: string; byteLength: number }[]; bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[]; accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown; min?: number[]; max?: number[] }[]; images?: { uri?: string; bufferView?: number; mimeType?: string }[]; meshes?: { primitives: { mode?: number; indices?: number; attributes: Record<string, number>; extensions?: unknown }[] }[]; textures?: unknown[]; nodes?: unknown[]; animations?: unknown[]; skins?: unknown[]; extensionsUsed?: string[]; extensionsRequired?: string[]; }
export interface GlbImage { mimeType: string; offset: number; length: number; }
export interface GlbInspection { triangles: number; textures: number; bytes: number; json: Gltf; images: GlbImage[]; bounds: { min: number[]; max: number[] } | null; }
/**
 * Structural validation of a binary glTF: container, chunk and accessor bounds, a closed feature subset, no external
 * or data references, no URL-like or traversal strings anywhere in the JSON, and geometry/texture limits.
 */
export function validateGlb(input: Uint8Array): GlbInspection {
  if (input.byteLength < 28 || input.byteLength > GLB_LIMIT) throw new ApiError('GLB_SIZE');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== input.length) throw new ApiError('GLB_HEADER');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength % 4 || jsonLength > 2 * 1024 * 1024 || 20 + jsonLength + 8 > input.length) throw new ApiError('GLB_JSON');
  let json: Gltf; try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.subarray(20, 20 + jsonLength))); } catch { throw new ApiError('GLB_JSON'); }
  const binStart = 20 + jsonLength; const binLength = view.getUint32(binStart, true);
  if (view.getUint32(binStart + 4, true) !== 0x004e4942 || binLength % 4 || binStart + 8 + binLength !== input.length || json.asset?.version !== '2.0') throw new ApiError('GLB_BINARY');
  if ((json.extensionsUsed ?? []).some(name => !SAFE_EXTENSIONS.has(name)) || (json.extensionsRequired ?? []).some(name => !SAFE_EXTENSIONS.has(name)) || json.animations?.length || json.skins?.length || (json.nodes?.length ?? 0) > 500) throw new ApiError('GLB_UNSUPPORTED_FEATURE');
  // Closed static subset: never resolve external, data, file or archive references.
  function inspect(value: unknown, depth: number): void {
    if (depth > 32) throw new ApiError('GLB_COMPLEXITY');
    if (typeof value === 'string') { if (URL_LIKE.test(value) || value.includes('../') || value.includes('..\\')) throw new ApiError('GLB_EXTERNAL_OR_UNSAFE_DATA'); return; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new ApiError('GLB_NUMBER'); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (['uri', 'url', '__proto__', 'constructor', 'prototype'].includes(key)) throw new ApiError('GLB_EXTERNAL_OR_UNSAFE_DATA');
      if (key === 'extensions' && (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(name => !SAFE_EXTENSIONS.has(name)))) throw new ApiError('GLB_UNSUPPORTED_FEATURE');
      inspect(v, depth + 1);
    }
  }
  inspect(json, 0);
  if (json.buffers?.length !== 1 || json.buffers[0].byteLength > binLength || json.buffers[0].byteLength < binLength - 3) throw new ApiError('GLB_BUFFER');
  for (const b of json.bufferViews ?? []) if (b.buffer !== 0 || !Number.isSafeInteger(b.byteLength) || b.byteLength < 0 || (b.byteOffset ?? 0) < 0 || (b.byteOffset ?? 0) + b.byteLength > json.buffers[0].byteLength) throw new ApiError('GLB_BUFFER_BOUNDS');
  const widths: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }; const lanes: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  for (const a of json.accessors ?? []) { const b = json.bufferViews?.[a.bufferView ?? -1]; const size = widths[a.componentType] * lanes[a.type]; const stride = b?.byteStride ?? size; if (!b || a.sparse || !size || !Number.isInteger(a.count) || a.count < 1 || a.count > 600_000 || stride < size || stride > 252 || (a.byteOffset ?? 0) < 0 || (a.byteOffset ?? 0) + (a.count - 1) * stride + size > b.byteLength) throw new ApiError('GLB_ACCESSOR'); }
  let triangles = 0; const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity]; let bounded = false;
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives) {
    const position = json.accessors?.[p.attributes.POSITION]; const indices = p.indices === undefined ? undefined : json.accessors?.[p.indices];
    if ((p.mode ?? 4) !== 4 || !position || position.type !== 'VEC3' || position.componentType !== 5126 || (p.indices !== undefined && (!indices || indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType)))) throw new ApiError('GLB_PRIMITIVE');
    const count = indices?.count ?? position.count; if (count % 3) throw new ApiError('GLB_PRIMITIVE'); triangles += count / 3;
    if (position.min?.length === 3 && position.max?.length === 3) { bounded = true; for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], position.min[i]); max[i] = Math.max(max[i], position.max[i]); } }
  }
  if (triangles < 1 || triangles > 100_000 || (json.textures?.length ?? 0) > 16) throw new ApiError('GLB_GEOMETRY_LIMIT');
  const images: GlbImage[] = [];
  for (const image of json.images ?? []) {
    const bufferView = image.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
    if (!bufferView || !['image/png', 'image/jpeg'].includes(image.mimeType ?? '')) throw new ApiError('GLB_TEXTURE_FORMAT');
    const offset = binStart + 8 + (bufferView.byteOffset ?? 0); const dimensions = imageDimensions(input.subarray(offset, offset + bufferView.byteLength));
    if (!dimensions || dimensions.width > MAX_TEXTURE_SIDE || dimensions.height > MAX_TEXTURE_SIDE) throw new ApiError('GLB_TEXTURE_SIZE');
    images.push({ mimeType: image.mimeType!, offset, length: bufferView.byteLength });
  }
  return { triangles, textures: json.textures?.length ?? 0, bytes: input.byteLength, json, images, bounds: bounded ? { min, max } : null };
}
/** Reads width/height from a PNG IHDR or JPEG SOF header without decoding pixels. Null when the header is invalid. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1]; const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
      if (length < 2) return null; offset += 2 + length;
    }
  }
  return null;
}
