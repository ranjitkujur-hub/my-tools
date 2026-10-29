// Service worker: precaches the app shell and the encrypted data; caches pictures as they are viewed.
// The build replaces __VERSION__ and the precache list.
const VERSION = "1.0.0+20261029.bb80b1";
const PRECACHE = ["./","./css/app.css","./icons/icon-192.png","./icons/icon-512.png","./icons/icon.svg","./js/core/amount.js","./js/core/checker.js","./js/core/crypto.js","./js/core/dates.js","./js/core/engine.js","./js/core/money.js","./js/core/rules.js","./js/core/search.js","./js/core/share.js","./js/core/text.js","./js/data.js","./js/main.js","./js/store.js","./js/ui/answer.js","./js/ui/ask.js","./js/ui/dom.js","./js/ui/plan.js","./js/ui/rfp.js","./js/ui/settings.js","./js/ui/sources.js","./manifest.webmanifest","./vendor/fflate.js","./index.html","./build.json","./data/keys.json","./data/general.bin","./data/office.bin"];
const SHELL = `drip-shell-${VERSION}`;
const MEDIA = `drip-media-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('drip-') && k !== SHELL && k !== MEDIA) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);

  if (rel.startsWith('m/')) {
    // pictures: cache as viewed
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    if (req.mode === 'navigate') {
      const hit = await cache.match('./index.html') || await cache.match('./');
      if (hit) return hit;
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      return new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});
