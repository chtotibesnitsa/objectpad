// Vercel Routing Middleware: gives every major ObjectPad page its own link-preview card
// (og:image / og:title / og:description / twitter:*) instead of always showing the home banner.
// The SPA itself never renders server-side, so this is what link unfurlers (X, Discord, iMessage,
// Slack...) actually see when someone pastes an objectpad.fun/<page> URL.
// Lives at the repo root because that's the Vercel project root (see vercel.json at repo root).

export const config = {
  matcher: [
    '/',
    '/launch',
    '/launch/:path*',
    '/capture',
    '/capture/:path*',
    '/explore',
    '/coin/:path*',
    '/objects/:path*',
    '/earn',
    '/earn/:path*',
    '/rewards',
    '/rewards/:path*',
    '/burn',
    '/treasury',
    '/vaults',
    '/vaults/:path*',
    '/whitepaper',
    '/docs',
    '/verify',
    '/verify/:path*',
    '/v2',
    '/people',
    '/people/:path*',
    '/People',
    '/People/:path*',
    '/hiring',
    '/hiring/:path*',
    '/apply',
    '/apply/:path*',
    '/admin/:path*',
  ],
};

type PageMeta = { title: string; description: string; image: string; alt: string };

const PAGES: Record<string, PageMeta> = {
  home: {
    title: 'ObjectPad — the launchpad for real-world objects',
    description: 'Scan any real object in 3D and launch its coin for free on Robinhood Chain. No account needed.',
    image: '/og/card-home.jpg',
    alt: 'A liquid-glass browser window scans a duck figurine into a glowing digital coin. ObjectPad.fun — the launchpad for real-world objects.',
  },
  create: {
    title: 'ObjectPad · Create — scan & launch free',
    description: 'Point your phone at any real object, capture it in 3D, and launch its coin free in seconds. No account needed.',
    image: '/og/card-launch.jpg',
    alt: 'A phone scanning a figurine into a glowing 3D point cloud, with Scan it / Launch it glass cards. ObjectPad.fun — scan, launch, free.',
  },
  market: {
    title: 'ObjectPad · Market — browse live object coins',
    description: 'Every scanned object becomes a tradable coin. Browse live prices, charts, and creators on Robinhood Chain.',
    image: '/og/card-market.jpg',
    alt: 'A grid of glassy object coin cards each with a rising green chart. ObjectPad.fun — browse live object coins.',
  },
  earn: {
    title: 'ObjectPad · Earn — get paid to post',
    description: 'Post about ObjectPad on X, get verified, and get paid in ETH for real engagement.',
    image: '/og/card-earn.jpg',
    alt: 'Coins raining from a glass X logo into an open glass hand. ObjectPad.fun — get paid to post.',
  },
  burn: {
    title: 'ObjectPad · $OBJECTPAD burn',
    description: 'Every trade fuels the buyback & burn. Track supply, scarcity, and the live burn log.',
    image: '/og/card-burn.jpg',
    alt: 'A metallic coin engulfed in green digital flame shattering into glass shards. ObjectPad.fun — $OBJECTPAD burn.',
  },
  treasury: {
    title: 'ObjectPad · The launch treasury',
    description: 'The treasury that pays for every free launch. See live balance, inflows, and how it grows.',
    image: '/og/card-treasury.jpg',
    alt: 'A glass vault door open with glowing coins inside and a rising balance chart. ObjectPad.fun — the launch treasury.',
  },
  vaults: {
    title: 'ObjectPad · Object Vaults — baskets of coins',
    description: 'Non-custodial baskets of object coins. One buy, weighted exposure across a curated set.',
    image: '/og/card-vaults.jpg',
    alt: 'A glass sphere containing several object coins orbiting like a mini solar system, each trailing a green chart line. ObjectPad.fun — Object Vaults.',
  },
  whitepaper: {
    title: 'ObjectPad · White paper — how it works',
    description: 'Fingerprinting, Merkle proofs, and signed attestations — the real cryptography behind every ObjectPad coin.',
    image: '/og/card-whitepaper.jpg',
    alt: 'A glass panel showing a Merkle tree diagram, a fingerprint icon, and hex hashes. ObjectPad.fun — how ObjectPad works.',
  },
  people: {
    title: 'ObjectPad People — People are next',
    description: 'Preview: private profile drafts, creator nominations and applications are open. Verification, 3D likeness and launches are being built and stay off until they pass review.',
    image: '/og/card-people-next.jpg',
    alt: 'PEOPLE ARE NEXT. A white marble bust dissolving into black dots beside a yellow rubber duck. objectpad.fun/People — preview live, building this week.',
  },
  apply: {
    title: 'ObjectPad — We’re hiring: 100+ creator roles, lead developers from $5,000/month',
    description: 'Build what the world touches. Lead developer roles from $5,000/month, 100+ creator roles, remote worldwide + San Francisco. No purchase, wallet or token needed to apply.',
    image: '/og/card-apply.jpg',
    alt: 'ObjectPad hiring announcement in a bright professional technology studio. A large yellow duck mascot stands before connected phones and a global time-zone map. Text announces 100+ creator roles, lead developer roles from $5,000 per month, remote and San Francisco opportunities, and objectpad.fun/apply.',
  },
  hiring: {
    title: 'ObjectPad — Now Recruiting',
    description: 'Build the physical world onchain. ObjectPad is hiring across engineering, mobile, product design and growth.',
    image: '/og/card-hiring.jpg',
    alt: 'NOW RECRUITING. Build the physical world onchain. Four glass workstations for code, mobile, design and growth on a glass platform above the clouds. objectpad.fun/hiring',
  },
  v2: {
    title: 'ObjectPad · What’s new in V2',
    description: 'Anti-impersonation identity, Uniqueness v2, Object Vaults, and the white paper — see what shipped.',
    image: '/og/card-v2.jpg',
    alt: 'A glossy glass number 2 orbited by feature icons: fingerprint, shield, basket, scroll. ObjectPad.fun — what’s new in V2.',
  },
};

function pageFor(pathname: string): PageMeta {
  if (pathname === '/') return PAGES.home;
  if (pathname.startsWith('/launch') || pathname.startsWith('/capture')) return PAGES.create;
  if (pathname === '/explore' || pathname.startsWith('/coin/') || pathname.startsWith('/objects/')) return PAGES.market;
  if (pathname.startsWith('/earn') || pathname.startsWith('/rewards')) return PAGES.earn;
  if (pathname === '/burn') return PAGES.burn;
  if (pathname === '/treasury') return PAGES.treasury;
  if (pathname.startsWith('/vaults')) return PAGES.vaults;
  if (pathname === '/whitepaper' || pathname === '/docs' || pathname.startsWith('/verify')) return PAGES.whitepaper;
  if (pathname === '/v2') return PAGES.v2;
  if (/^\/people(\/|$)/i.test(pathname)) return PAGES.people;
  if (pathname === '/hiring') return PAGES.hiring;
  if (pathname === '/apply' || pathname.startsWith('/apply/')) return PAGES.apply;
  return PAGES.home;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  // Re-entry guard: subrequests issued by this middleware carry this header and pass through
  // untouched. Without it, internal hops re-enter middleware and Vercel can 508 with
  // INFINITE_LOOP_DETECTED.
  if (request.headers.get('x-objectpad-og')) return undefined;

  const url = new URL(request.url);
  // /People is the canonical campaign URL; the lowercase form is a permanent redirect.
  // Static files in public/people/ (images, models) are served as-is, never redirected.
  if (/^\/people\/.*\.[a-z0-9]{2,5}$/i.test(url.pathname)) return undefined;
  if (/^\/people(\/|$)/.test(url.pathname)) return Response.redirect(`${url.origin}/People${url.pathname.slice(7)}${url.search}`, 308);
  let meta = pageFor(url.pathname);
  // /hiring stays dark (home card, noindex) until HIRING_PAGE_ENABLED is on server-side. Fails closed.
  const hiringPath = /^\/hiring(\/|$)/.test(url.pathname);
  let hiringLive = false;
  if (hiringPath) {
    try { const r = await fetch('https://objectpad-backend.rork.app/api/hiring', { signal: AbortSignal.timeout(1500) }); hiringLive = r.ok && (await r.json() as { enabled?: boolean }).enabled === true; } catch { hiringLive = false; }
    if (!hiringLive || url.pathname !== '/hiring') meta = PAGES.home;
  }

  // Never follow redirects from inside middleware: each hop re-enters the routing layer.
  const origin = await fetch(request, { redirect: 'manual', headers: { 'x-objectpad-og': '1' } });
  if (origin.status >= 300 && origin.status < 400) return undefined;
  const contentType = origin.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return undefined;

  let html = await origin.text();
  const imageUrl = `${url.origin}${meta.image}`;
  const title = escapeAttr(meta.title);
  const description = escapeAttr(meta.description);
  const alt = escapeAttr(meta.alt);

  html = html
    .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeAttr(url.toString())}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${imageUrl}$2`)
    .replace(/(<meta property="og:image:width" content=")[^"]*(")/, `$11200$2`)
    .replace(/(<meta property="og:image:height" content=")[^"]*(")/, `$1630$2`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${alt}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${imageUrl}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${description}$2`);

  const headers = new Headers(origin.headers);
  headers.set('content-length', String(new TextEncoder().encode(html).length));
  // The body was decompressed for rewriting; the stale encoding header would break decoding.
  headers.delete('content-encoding');
  if ((hiringPath && (!hiringLive || url.pathname !== '/hiring')) || url.pathname.startsWith('/admin') || url.pathname.startsWith('/apply/status')) headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(html, { status: origin.status, headers });
}
