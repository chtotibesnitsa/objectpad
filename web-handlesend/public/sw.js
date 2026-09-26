/* ObjectPad home-screen app: offline shell + cached app art and sounds. Live data (API, chain) is never cached. */
const VERSION = 'objectpad-app-v1';
const SHELL = ['/app/', '/app.webmanifest', '/app/icon-192.png', '/app/icon-512.png', '/fonts/anybody.ttf', '/fonts/geist.ttf', '/fonts/geistmono.ttf'];

self.addEventListener('install', event => { event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).catch(() => undefined)); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', event => {
  const request = event.request; if (request.method !== 'GET') return;
  const url = new URL(request.url); if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Pages: network first so every visit gets the latest build; the cached shell opens the app offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => { const copy = response.clone(); if (response.ok) caches.open(VERSION).then(c => c.put('/app/', copy)).catch(() => undefined); return response; }).catch(() => caches.match('/app/').then(hit => hit || Response.error())));
    return;
  }
  // Hashed bundles, app art, sounds and fonts never change at a given URL: cache first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/app/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(c => c.put(request, copy)).catch(() => undefined); } return response; })));
  }
});
