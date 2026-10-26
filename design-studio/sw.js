/* Offline cache for the app shell. Scope: design-studio/ only.
 * Saved designs live in IndexedDB and are never fetched or sent. */
'use strict';
var CACHE = 'design-studio-v1';
var ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/core/base.js', 'js/core/drawing.js', 'js/core/svg.js', 'js/core/dxf.js', 'js/core/csv.js', 'js/core/staad.js',
  'js/core/hecras.js', 'js/core/geo.js', 'js/core/store.js', 'js/core/note.js',
  'js/modules/hydrology.js', 'js/modules/canal.js', 'js/modules/weir.js', 'js/modules/basin.js', 'js/modules/spillway.js',
  'js/modules/falls.js', 'js/modules/regulator.js', 'js/modules/crossdrainage.js', 'js/modules/gravitydam.js',
  'js/modules/earthdam.js', 'js/modules/bridge.js', 'js/modules/rcc.js', 'js/modules/retwall.js', 'js/modules/software.js',
  'js/guide.js', 'js/db.js', 'js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('design-studio-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      if (req.mode === 'navigate') return caches.match('index.html');
      return Response.error();
    });
  }));
});
