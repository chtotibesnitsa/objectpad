import { ApiError, boundedBody } from '../shared/security';
import { GLB_LIMIT } from '../shared/glb';
import { compactForProvider, inspectModel, type ModelInspection } from './media';
export interface ReconstructionTask { id: string; status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'; progress: number; preceding_tasks?: number; created_at?: number; started_at?: number; finished_at?: number; model_urls?: { glb?: string }; thumbnail_url?: string; consumed_credits?: number; task_error?: { message?: string } | null; }
export interface ReconstructionProvider {
  createTask(images: Uint8Array[]): Promise<string>;
  getTask(id: string): Promise<ReconstructionTask>;
  cancelTask(id: string): Promise<{ cancelled: boolean; requiresOperator: boolean }>;
  fetchArtifacts(task: ReconstructionTask): Promise<{ model: Uint8Array; thumbnail: Uint8Array }>;
  validateArtifacts(bytes: Uint8Array): ModelInspection;
}
const ARTIFACT_HOSTS = ['assets.meshy.ai', 'assets.meshy.ai.cn'];
export const MESHY_MODEL = 'meshy-7';
/**
 * Meshy Multi-Image to 3D (POST /openapi/v1/multi-image-to-3d, GET /openapi/v1/multi-image-to-3d/:id) reached through
 * the Rork Toolkit proxy, which injects the provider credential server-side. Request fields were verified against the
 * live validator (ai_model, geometry_resolution, topology, symmetry_mode, texture_resolution).
 */
export class MeshyProvider implements ReconstructionProvider {
  constructor(private readonly toolkitUrl: string, private readonly toolkitKey: string, private readonly options: { model?: string; geometry?: 'standard' | '2k' | '4k' } = {}, private readonly fetcher: typeof fetch = fetch) {}
  get model(): string { return this.options.model ?? MESHY_MODEL; }
  private async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    if (!this.toolkitKey) throw new ApiError('RECONSTRUCTION_NOT_CONFIGURED', 503);
    let response: Response;
    try { response = await this.fetcher(`${this.toolkitUrl}/v2/meshy/openapi/v1/multi-image-to-3d${path}`, { method, headers: { Authorization: `Bearer ${this.toolkitKey}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(method === 'POST' ? 55_000 : 20_000), redirect: 'error' }); }
    catch { throw new ApiError(method === 'POST' ? 'PROVIDER_REQUEST_TIMEOUT' : 'PROVIDER_REQUEST_FAILED', 502); }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200); console.warn('objectpad.meshy.http', method, response.status, detail);
      // Any HTTP answer to a create request means no task was started, so it is always safe to try again.
      if (response.status === 402) throw new ApiError('PROVIDER_CREDITS', 503); if (response.status === 429) throw new ApiError('PROVIDER_RATE_LIMIT', 503); if (response.status === 413) throw new ApiError('PROVIDER_PAYLOAD_TOO_LARGE', 422); if (response.status === 401 || response.status === 403) throw new ApiError('PROVIDER_AUTH', 503); if (response.status === 400 || response.status === 422) throw new ApiError('PROVIDER_REJECTED_INPUT', 422);
      throw new ApiError(method === 'POST' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REQUEST_FAILED', 502);
    }
    return response.json();
  }
  async createTask(images: Uint8Array[]): Promise<string> {
    if (images.length !== 4) throw new ApiError('FOUR_CANONICAL_VIEWS_REQUIRED');
    const image_urls = images.map(raw => { const image = compactForProvider(raw); let binary = ''; for (let offset = 0; offset < image.length; offset += 8192) binary += String.fromCharCode(...image.subarray(offset, offset + 8192)); return `data:image/jpeg;base64,${btoa(binary)}`; });
    const result = await this.request('', 'POST', { image_urls, ai_model: this.model, geometry_resolution: this.options.geometry ?? 'standard', should_texture: true, enable_pbr: false, texture_resolution: '2k', should_remesh: true, topology: 'triangle', target_polycount: 30000, symmetry_mode: 'auto' }) as { result?: string };
    if (!result.result || !/^[a-zA-Z0-9_-]{8,100}$/.test(result.result)) throw new ApiError('PROVIDER_AMBIGUOUS_CREATE', 502);
    return result.result;
  }
  async getTask(id: string): Promise<ReconstructionTask> { if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new ApiError('PROVIDER_ID'); const task = await this.request(`/${id}`) as ReconstructionTask; if (task.id !== id || !['PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELED'].includes(task.status)) throw new ApiError('PROVIDER_INVALID_RESULT', 502); return task; }
  async cancelTask(_id: string): Promise<{ cancelled: boolean; requiresOperator: boolean }> {
    // The documented DELETE endpoint deletes data; it is not a proven cancellation API. Local polling stops instead.
    return { cancelled: false, requiresOperator: true };
  }
  private async download(raw: string, limit: number): Promise<Uint8Array> {
    let url: URL; try { url = new URL(raw); } catch { throw new ApiError('PROVIDER_ARTIFACT_HOST', 502); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !ARTIFACT_HOSTS.includes(url.hostname)) throw new ApiError('PROVIDER_ARTIFACT_HOST', 502);
    const response = await this.fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new ApiError('PROVIDER_ARTIFACT_EXPIRED', 502);
    return boundedBody(response, limit);
  }
  /** Downloads the GLB and provider preview into memory before the signed provider URLs expire. */
  async fetchArtifacts(task: ReconstructionTask): Promise<{ model: Uint8Array; thumbnail: Uint8Array }> {
    if (task.status !== 'SUCCEEDED' || !task.model_urls?.glb || !task.thumbnail_url) throw new ApiError('MODEL_NOT_READY');
    const [model, thumbnail] = await Promise.all([this.download(task.model_urls.glb, GLB_LIMIT), this.download(task.thumbnail_url, 4 * 1024 * 1024)]);
    return { model, thumbnail };
  }
  validateArtifacts(bytes: Uint8Array): ModelInspection { return inspectModel(bytes); }
}
