import type { Runtime } from './types';

let toolkitProbe: { at: number; ok: boolean; status: number } | null = null;
/**
 * Verifies the Rork Toolkit key actually authenticates (cached 10 minutes). A present-but-rejected key is not ready,
 * so capture is refused up front instead of failing after the creator has photographed twelve angles.
 */
export async function probeToolkit(runtime: Runtime): Promise<boolean> {
  if (!runtime.toolkitKey) return false;
  if (toolkitProbe && Date.now() - toolkitProbe.at < 600_000) return toolkitProbe.ok;
  try {
    const response = await fetch(`${runtime.toolkitUrl}/v2/meshy/openapi/v1/multi-image-to-3d/00000000-0000-0000-0000-000000000000`, { headers: { Authorization: `Bearer ${runtime.toolkitKey}` }, signal: AbortSignal.timeout(8000) });
    toolkitProbe = { at: Date.now(), ok: response.status !== 401 && response.status !== 403, status: response.status };
    if (!toolkitProbe.ok) console.warn('objectpad.toolkit.key_rejected', response.status);
  } catch { return toolkitProbe?.ok ?? false; }
  return toolkitProbe.ok;
}
/** Last probe outcome (diagnostics only; photo uploads no longer depend on the AI gateway) for operator diagnostics (never includes the key). */
export function toolkitProbeStatus(): { checkedAt: number; ok: boolean; status: number } | null { return toolkitProbe ? { checkedAt: toolkitProbe.at, ok: toolkitProbe.ok, status: toolkitProbe.status } : null; }
