/* 回廊's service worker (TENOHIRA PR 一): the app installed on a real phone
 * must open in a tunnel and on a mountain. Two honest rules, nothing clever:
 *
 *   - the SHELL (html/css/js — the app itself) goes network-first with a
 *     cache fallback: online you always get the newest corridor, offline
 *     you get the last one that ran. No version pinning to go stale.
 *   - CONTENT (data/, vendor/, design/ — big, effectively immutable shards)
 *     goes cache-first with a network fill: fetched once, kept, and a shard
 *     that changes upstream is picked up when the cache is dropped by a
 *     VERSION bump here.
 *
 * The learner's record never passes through here — it lives in
 * localStorage/IndexedDB, outside HTTP caching entirely. */

// v2: dict-v2 went schema 3 (sense tags) — the cache-first shards must drop
const VERSION = 'kairo-v2';
const SHELL = [
  '.',
  'index.html',
  'corridor.css',
  'corridor.js',
  'corridor-ink.js',
  'dictionary-worker.js',
  'drift-layer.css',
  'drift-layer.js',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
];
// The corridor cannot BOOT without these three — an install that precaches
// the shell but not them produces an app icon that opens to nothing in the
// tunnel it was promised to survive. They stay content-routed (cache-first),
// this only seeds the cache at install instead of hoping for a first visit.
const BOOT_DATA = ['data/manifest.json', 'data/fsrs-pin.json', 'data/articles/index.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL.concat(BOOT_DATA)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // ours alone: CacheStorage is origin-wide while the worker's scope is
      // not — on a shared Pages origin, deleting every foreign key would
      // wipe caches that belong to the neighbours
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kairo-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // the AI key's traffic is never ours

  const isContent = /^\/(data|vendor|design)\//.test(url.pathname) || /\/(data|vendor|design)\//.test(url.pathname);

  if (isContent) {
    // cache-first: a dictionary shard fetched once is kept
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              // waitUntil: the response returns immediately, but the worker
              // must stay alive until the shard actually lands in the cache
              event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // shell (and navigations): network-first, offline falls back to the last
  // corridor that ran — a navigation with no cache row falls back to the door
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())),
      ),
  );
});
