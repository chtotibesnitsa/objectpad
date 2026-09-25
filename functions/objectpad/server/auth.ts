import { ApiError } from '../shared/security';
interface Jwk extends JsonWebKey { kid: string; }
const caches = new Map<string, { at: number; keys: Jwk[] }>();
const attempts = new Map<string, number>();
const flights = new Map<string, Promise<Jwk[]>>();
function decode(segment: string): Uint8Array { if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new ApiError('UNAUTHORIZED', 401); return Uint8Array.from(atob(segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=')), c => c.charCodeAt(0)); }
async function keys(appId: string, refresh = false): Promise<Jwk[]> {
  const saved = caches.get(appId); if (!refresh && saved && Date.now() - saved.at < 3_600_000) return saved.keys;
  if (Date.now() - (attempts.get(appId) ?? 0) < 60_000) { const flight = flights.get(appId); if (flight) return flight; if (saved) return saved.keys; throw new ApiError('AUTH_UNAVAILABLE', 503); }
  if (!/^[a-zA-Z0-9_-]{6,100}$/.test(appId)) throw new ApiError('AUTH_NOT_CONFIGURED', 503);
  attempts.set(appId, Date.now());
  const load = (async () => {
  const response = await fetch(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new ApiError('AUTH_UNAVAILABLE', 503);
  const data = await response.json() as { keys?: Jwk[] }; if (!data.keys?.length) throw new ApiError('AUTH_UNAVAILABLE', 503);
  caches.set(appId, { at: Date.now(), keys: data.keys.filter(k => k.kty === 'EC' && k.crv === 'P-256' && (!k.alg || k.alg === 'ES256')) }); return caches.get(appId)!.keys;
  })();
  flights.set(appId, load);
  try { return await load; } finally { flights.delete(appId); }
}
/** Hardened derivative of the source JWT verifier: audience-keyed JWKS and strict kid/claim validation. */
export async function verifyAccessToken(token: string, appId: string): Promise<string> {
  if (token.length > 8192) throw new ApiError('UNAUTHORIZED', 401);
  const parts = token.split('.'); if (parts.length !== 3) throw new ApiError('UNAUTHORIZED', 401);
  try {
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as { alg?: string; kid?: string };
    if (header.alg !== 'ES256' || typeof header.kid !== 'string' || header.kid.length < 1 || header.kid.length > 200) throw new Error('algorithm');
    let key = (await keys(appId)).find(k => k.kid === header.kid); if (!key) key = (await keys(appId, true)).find(k => k.kid === header.kid); if (!key) throw new Error('key');
    const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, decode(parts[2]).buffer as ArrayBuffer, new TextEncoder().encode(`${parts[0]}.${parts[1]}`)); if (!valid) throw new Error('signature');
    return validateClaims(JSON.parse(new TextDecoder().decode(decode(parts[1]))), appId, Date.now() / 1000);
  } catch (error) { if (error instanceof ApiError && error.status === 503) throw error; throw new ApiError('UNAUTHORIZED', 401); }
}
export function validateClaims(claims: { iss?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; sub?: unknown }, appId: string, now: number): string {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== 'privy.io' || !audience.includes(appId) || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > now)) || typeof claims.sub !== 'string' || !claims.sub.startsWith('did:privy:') || claims.sub.length > 200) throw new ApiError('UNAUTHORIZED', 401);
  return claims.sub;
}
