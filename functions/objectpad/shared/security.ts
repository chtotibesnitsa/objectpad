/** Canonical JSON for our closed schema: lexically sorted object keys, NFC strings, no floats. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) throw new Error('Non-canonical number'); return String(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(',')}}`;
  throw new Error('Unsupported canonical value');
}
export async function sha256(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
export function validHash(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function validTx(value: unknown): value is `0x${string}` { return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value); }
export function validAddress(value: unknown): value is `0x${string}` { return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value) && !/^0x0{40}$/i.test(value); }
/** Derived from the source application's URL guards; stricter HTTPS and credential rules. */
export function safeHttpUrl(raw: unknown): string | null {
  // Control characters are rejected on purpose: they enable URL smuggling.
  // eslint-disable-next-line no-control-regex
  if (typeof raw !== 'string' || raw.length > 2000 || /[\u0000-\u0020\u007f-\u009f\\]/u.test(raw)) return null;
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function safeTelegramUrl(raw: string): string | null { const url = safeHttpUrl(raw); if (!url) return null; const parsed = new URL(url); return ['t.me', 'telegram.me'].includes(parsed.hostname) && /^\/[a-zA-Z0-9_]{4,32}\/?$/.test(parsed.pathname) && !parsed.search && !parsed.hash ? url : null; }
export function safeXUrl(raw: string): string | null { const url = safeHttpUrl(raw); if (!url) return null; const parsed = new URL(url); return ['x.com', 'www.x.com', 'twitter.com'].includes(parsed.hostname) && /^\/[a-zA-Z0-9_]{1,15}\/?$/.test(parsed.pathname) && !parsed.search && !parsed.hash ? url : null; }
// Hidden control and bidi-override characters are rejected on purpose: they disguise onchain names.
// eslint-disable-next-line no-control-regex
export function publicName(raw: string): string { const name = raw.normalize('NFC').trim(); if (name.length < 2 || new TextEncoder().encode(name).length > 96 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)) throw new Error('Use 2–96 UTF-8 bytes without hidden control characters.'); return name; }
export function shortHash(hash: string): string { return hash.length > 18 ? `${hash.slice(0, 9)}…${hash.slice(-7)}` : hash; }
export class ApiError extends Error { constructor(public readonly code: string, public readonly status: number = 400) { super(code); } }
export async function boundedBody(response: Response | Request, maxBytes: number): Promise<Uint8Array> {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new ApiError('FILE_TOO_LARGE', 413);
  const reader = response.body?.getReader(); if (!reader) throw new ApiError('EMPTY_FILE');
  const chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > maxBytes) throw new ApiError('FILE_TOO_LARGE', 413); chunks.push(value); } } finally { await reader.cancel(); }
  const output = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output;
}
export function requireOwner(actual: string, expected: string): void { if (!actual || actual !== expected) throw new ApiError('NOT_FOUND', 404); }
export function handoffAllowed(input: { owner: string; actor: string; expiresAt: number; now: number; used: boolean; cancelled: boolean; purpose: string }): void {
  requireOwner(input.actor, input.owner);
  if (input.purpose !== 'capture' || input.used || input.cancelled || input.now >= input.expiresAt) throw new ApiError('HANDOFF_EXPIRED_OR_USED', 410);
}
