import type { Runtime } from './types';
import { ApiError } from '../shared/security';

const base64 = (bytes: Uint8Array): string => { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); return btoa(binary); };

/**
 * JSON-only vision call through the Rork Toolkit AI gateway with provider fallbacks. Fails closed: any transport,
 * status or parse problem throws MEDIA_VALIDATION_UNAVAILABLE so callers never treat "no answer" as "passed".
 */
const MODELS = ['google/gemini-3.8-flash', 'openai/gpt-5.4-mini', 'google/gemini-3.5-flash'];

/** One gateway attempt. Returns parsed JSON or null (never throws for transport/parse problems). */
async function attempt(runtime: Runtime, model: string, system: string, text: string, images: Uint8Array[], maxTokens: number, json: boolean): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${runtime.toolkitUrl}/v2/vercel/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.toolkitKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25_000), body: JSON.stringify({ model, temperature: 0.2, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: `${system} Reply with a single JSON object and nothing else.` }, { role: 'user', content: [{ type: 'text', text }, ...images.map(image => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64(image)}` } }))] }] }) });
    if (!response.ok) { console.warn('objectpad.vision.http', model, response.status); return null; }
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const match = (payload.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/); if (!match) return null;
    const parsed = JSON.parse(match[0]) as unknown; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { console.warn('objectpad.vision.failed', model); return null; }
}

/**
 * JSON-only vision call through the Rork Toolkit AI gateway. Every candidate model is raced in parallel (fastest
 * answer wins) instead of tried one at a time, so naming and duplicate checks come back as fast as the quickest
 * model responds. Throws MEDIA_VALIDATION_UNAVAILABLE only when every model fails, so callers can fall back.
 */
export async function visionJson(runtime: Runtime, system: string, text: string, images: Uint8Array[], maxTokens = 500): Promise<Record<string, unknown>> {
  if (!runtime.toolkitKey || !images.length) throw new ApiError('MEDIA_VALIDATION_UNAVAILABLE', 503);
  const preferred = runtime.env.OBJECTPAD_UNIQUENESS_MODEL?.trim() || runtime.env.OBJECTPAD_SCAN_MODEL?.trim();
  const models = [...new Set([...(preferred ? [preferred] : []), ...MODELS])];
  const race = models.map((model, i) => attempt(runtime, model, system, text, images, maxTokens, i === 0).then(result => { if (!result) throw new Error('empty'); return result; }));
  try { return await Promise.any(race); } catch { throw new ApiError('MEDIA_VALIDATION_UNAVAILABLE', 503); }
}
