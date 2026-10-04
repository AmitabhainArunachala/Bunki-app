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
// v4: the context deck (文脈札) joined the shell
// v5: the shelf index grew the 言葉の鉱脈 deck passages — drop the cached index
// v6: those passages left the shelf; the deck player joined the shell
// v12: the deck player's scheduler pin and the private-collection player join the shell
// v13: the deck player moved to card contract v2 (passage card) — drop the cached player and decks
// v14: the deck player's host lexicon adapter (host.js) joins the shell; the decks name their tokens side file
// v15: the deck player's tap-to-define (entry sheet, lookups) and the regenerated decks; tokens precached
const VERSION = 'kairo-v15-tap-define';
const SHELL = [
  '.',
  'index.html',
  'corridor.css',
  'corridor.js',
  'corridor-ink.js',
  'fonts.css',
  'vendor/ts-fsrs.mjs',
  'dictionary-worker.js',
  'skip-core.js',
  'skip-ui.js',
  'skip-ui.css',
  'data/share_alike/skip.json',
  'drift-layer.css',
  'drift-layer.js',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'reference-core.js',
  'reference-ui.js',
  'reference-ui.css',
  'data/share_alike/reference-extra.json',
  // 集中道場 › デッキ opens offline from install
  'decks/player/engine.js',
  'decks/player/mount.js',
  'decks/player/player.css',
  'decks/player/host.js',
  // …with what mount.js fetches at load, so a first visit then offline still opens a deck
  'data/fsrs-pin.json',
  // Private data lives in IndexedDB; only the reader and scheduler are cached.
  'decks/personal/mount.mjs',
  'decks/personal/engine.mjs',
  'decks/personal/schema.mjs',
  'decks/personal/store.mjs',
  'decks/personal/personal.css',
  'decks/kotoba-mine/deck.json',
  'decks/kotoba-mcd/deck.json',
  // …and their tokens side files (deck.tokens), so the back's tap targets draw offline too
  'decks/kotoba-mine/tokens.json',
  'decks/kotoba-mcd/tokens.json',
  'decks/context-dense/mount.js',
  'decks/context-dense/engine.js',
  'decks/context-dense/deck.json',
  'decks/context-dense/context-deck.css',
  'decks/context-dense/standalone.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // only this app's own older caches: other apps on the same origin keep theirs
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('kairo-') && k !== VERSION).map((k) => caches.delete(k)),
        ),
      )
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
              caches.open(VERSION).then((cache) => cache.put(request, copy));
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
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())),
      ),
  );
});
