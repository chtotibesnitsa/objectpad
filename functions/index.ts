// ObjectPad backend (Cloudflare Worker + one Durable Object).
// /api/*  -> ObjectPad DO (capture sessions, private frames, Meshy jobs, artifacts, Object Records, launches)
// /ping   -> liveness
// /api/logos/:token -> cached on-chain Pons coin logo (public)
import { OBJECTPAD_CLASS, OBJECTPAD_INSTANCE, originAllowed } from './objectpad/server/worker';
import type { Env } from './objectpad/server/types';

export { ObjectPad } from './objectpad/server/worker';

type WorkerEnv = Env & { DO: NonNullable<Env['DO']> };

const ALLOWED_HEADERS = 'Authorization,Content-Type,X-Upload-Token,X-Capture-Device';
const baseHeaders = (): Record<string, string> => ({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });

function withCors(response: Response, origin: string | null, allowed: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Origin');
  if (allowed && origin) headers.set('Access-Control-Allow-Origin', origin);
  else if (!origin) headers.set('Access-Control-Allow-Origin', '*');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = originAllowed(env, origin);
    const isPublicRead = request.method === 'GET' && /^\/api\/(status|market|house|tokens|curves|objects|activity|trending|messages|artifacts|creators|items|logos)(\/|$)/.test(url.pathname);

    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403, headers: baseHeaders() });
      return new Response(null, { status: 204, headers: { ...baseHeaders(), 'Access-Control-Allow-Origin': origin!, 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': ALLOWED_HEADERS, 'Access-Control-Max-Age': '600' } });
    }
    if (url.pathname === '/ping') return Response.json({ ok: true, service: 'objectpad', now: new Date().toISOString() }, { headers: { ...baseHeaders(), 'Access-Control-Allow-Origin': '*' } });
    if (!url.pathname.startsWith('/api/')) return Response.json({ error: 'NOT_FOUND' }, { status: 404, headers: baseHeaders() });

    // Browsers on other sites may read public data; only ObjectPad origins may act on an account.
    if (origin && !allowed && !isPublicRead) return Response.json({ error: 'ORIGIN_REJECTED' }, { status: 403, headers: baseHeaders() });

    const inner = new Request(request.url, request);
    inner.headers.set('X-Rork-DO-Class', OBJECTPAD_CLASS);
    inner.headers.set('X-Rork-DO-Id', OBJECTPAD_INSTANCE);
    const response = await env.DO.fetch(inner);
    if (isPublicRead && origin && !allowed) { const headers = new Headers(response.headers); headers.set('Access-Control-Allow-Origin', '*'); headers.set('Vary', 'Origin'); return new Response(response.body, { status: response.status, headers }); }
    return withCors(response, origin, allowed);
  },
};
