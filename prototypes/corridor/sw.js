/* 回廊's service worker: a successful install includes the complete boot core.
 *
 * The boot shell and data stay on one installed version, online or offline.
 * A new worker waits for the old app's windows to close before activation;
 * a failed or incomplete install cannot replace the working boot cache.
 * Lazy content is verified against that installed generation before use.
 * This is not a complete offline
 * article/audio download, and storage can still be evicted by the browser.
 *
 * The learner's record never passes through here — it lives in
 * localStorage/IndexedDB, outside HTTP caching entirely. */

// The release builder prepends the SHA-256 of its sorted source asset paths
// and digests. Every packaged change then gets a distinct atomic boot cache.
// Unstaged development installs retain an explicit manually bumped fallback.
const DEVELOPMENT_VERSION = 'kairo-v8-dev';
const assetVersion = self.KAIRO_ASSET_VERSION;
if (
  assetVersion !== undefined &&
  (typeof assetVersion !== 'string' || !/^[a-f0-9]{64}$/.test(assetVersion))
) {
  throw new Error('KAIRO_ASSET_VERSION must be a lowercase SHA-256 digest');
}
const VERSION = assetVersion === undefined ? DEVELOPMENT_VERSION : `kairo-${assetVersion}`;
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `kairo:${SCOPE}:`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const STAMPED = assetVersion !== undefined;
const IDENTITY_PATH = 'build-identity.json';
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_MANIFEST_FILES = 100000;
const DIGEST = /^[a-f0-9]{64}$/;
const SHELL = [
  '.',
  'index.html',
  'fonts.css',
  'corridor.css',
  'corridor.js',
  'reading-controller.mjs',
  'teacher-context.mjs',
  'teacher-drafts.mjs',
  'teacher-draft-controller.mjs',
  'sentence-drafts.mjs',
  'sentence-draft-controller.mjs',
  'reading-position.mjs',
  'feed-controller.mjs',
  'assessment-controller.mjs',
  'record-controller.mjs',
  'record-host.mjs',
  'record-app.mjs',
  'record-binding.mjs',
  'record-sync.mjs',
  'publisher-controller.mjs',
  'source-inbox.mjs',
  'source-processing.mjs',
  'corridor-ink.js',
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
];

// Keep this in step with boot()'s awaited data and scheduler import. Testing
// installs from an inert page, then starts Corridor for the first time
// offline: an ordinary online visit would hide a missing prerequisite.
const BOOT_DATA = [
  'data/manifest.json',
  'data/fsrs-pin.json',
  'data/articles/index.json',
  'data/proprietary_safe/kanken.json',
  'data/proprietary_safe/sem.json',
  'data/share_alike/kanji.json',
  'data/share_alike/words.json',
  'data/share_alike/idioms.json',
  'data/share_alike/dict.json',
  'data/share_alike/strokes.json',
  'data/share_alike/radicals214.json',
  'data/original/grammar-v11.json',
  'vendor/ts-fsrs.mjs',
  'modules/reading-core.mjs',
  'modules/feed-core.mjs',
  'modules/assessment-core.mjs',
  'modules/record-core.mjs',
];
const PRECACHE_URLS = new Set([...SHELL, ...BOOT_DATA].map((path) => new URL(path, SCOPE).href));

const assetUrl = (path) => new URL(path.split('/').map(encodeURIComponent).join('/'), SCOPE).href;
const IDENTITY_URL = assetUrl(IDENTITY_PATH);
const WORKER_URL = assetUrl('sw.js');
let installedRelease;

async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Bound response consumption before allocating the final buffer. Manifest
 * lengths describe decoded file bytes, not HTTP compression or range bytes. */
async function readBytes(response, limit) {
  if (response.status !== 200 || response.redirected) throw new Error('asset response unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('asset body unavailable');
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('asset exceeds declared length');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function responseFromBytes(response, bytes) {
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.set('content-length', String(bytes.byteLength));
  return new Response(bytes, { status: 200, headers });
}

async function verifiedResponse(response, entry) {
  const bytes = await readBytes(response, entry.bytes);
  if (bytes.byteLength !== entry.bytes || (await digest(bytes)) !== entry.sha256) {
    throw new Error('asset does not belong to installed release');
  }
  return responseFromBytes(response, bytes);
}

function networkAsset(url) {
  // Static assets have no account/credential authority. Request complete
  // bodies even for a media range request, because a partial response cannot
  // prove the file's digest. Returning the verified full 200 body is valid.
  return fetch(new Request(url, { cache: 'no-store', credentials: 'omit', redirect: 'error' }));
}

/** Validate both manifest digests. Its declared source stamp alone is not a
 * trust anchor: reconstruct the builder's sorted unstamped input digest.
 * 404.html is a derived index copy; sw.js is the sole stamped source file. */
async function validateRelease(identityResponse, workerResponse) {
  if (!identityResponse || !workerResponse) throw new Error('installed release identity missing');
  const identityBytes = await readBytes(identityResponse, MAX_MANIFEST_BYTES);
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(identityBytes));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.product !== 'KAIRO' ||
    manifest.sourceAssetSha256 !== assetVersion ||
    !DIGEST.test(manifest.artifactSha256) ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.length > MAX_MANIFEST_FILES
  ) {
    throw new Error('unsupported or mismatched release manifest');
  }
  const entries = new Map();
  for (const entry of manifest.files) {
    if (
      !entry ||
      Object.keys(entry).length !== 3 ||
      typeof entry.path !== 'string' ||
      !entry.path ||
      entry.path.length > 2048 ||
      entry.path.includes('\\') ||
      Array.from(entry.path).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      entry.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      entry.path === IDENTITY_PATH ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !DIGEST.test(entry.sha256)
    ) {
      throw new Error('invalid release file entry');
    }
    const url = assetUrl(entry.path);
    if (entries.has(url)) throw new Error('duplicate release file entry');
    entries.set(url, entry);
  }
  if (
    (await digest(new TextEncoder().encode(JSON.stringify(manifest.files)))) !==
    manifest.artifactSha256
  ) {
    throw new Error('release file manifest digest mismatch');
  }
  const index = entries.get(assetUrl('index.html'));
  const fallback = entries.get(assetUrl('404.html'));
  const worker = entries.get(WORKER_URL);
  if (
    !index ||
    !fallback ||
    !worker ||
    fallback.sha256 !== index.sha256 ||
    fallback.bytes !== index.bytes
  )
    throw new Error('release bootstrap entries missing or inconsistent');
  const verifiedWorker = await verifiedResponse(workerResponse, worker);
  const workerText = await verifiedWorker.clone().text();
  const stamp = workerText.match(/^self\.KAIRO_ASSET_VERSION = (["'])([a-f0-9]{64})\1;\n/);
  if (!stamp || stamp[2] !== assetVersion) throw new Error('release worker stamp mismatch');
  const unstampedHash = await digest(new TextEncoder().encode(workerText.slice(stamp[0].length)));
  const inputs = manifest.files
    .filter((entry) => entry.path !== '404.html')
    .map((entry) => ({
      path: entry.path,
      sha256: entry.path === 'sw.js' ? unstampedHash : entry.sha256,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if ((await digest(new TextEncoder().encode(JSON.stringify(inputs)))) !== assetVersion) {
    throw new Error('release source digest mismatch');
  }
  for (const path of [...SHELL.filter((path) => path !== '.'), ...BOOT_DATA]) {
    if (!entries.has(assetUrl(path))) throw new Error(`release boot entry missing: ${path}`);
  }
  return {
    entries,
    identity: responseFromBytes(identityResponse, identityBytes),
    worker: verifiedWorker,
  };
}

async function readInstalledRelease(cache) {
  if (!installedRelease) {
    installedRelease = Promise.all([cache.match(IDENTITY_URL), cache.match(WORKER_URL)]).then(
      ([identity, worker]) => validateRelease(identity, worker),
    );
    // Eviction/corruption must fail closed, but a later repaired cache may retry.
    installedRelease.catch(() => {
      installedRelease = undefined;
    });
  }
  return installedRelease;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (!STAMPED) {
        // Explicit development fallback: no production generation guarantee.
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll([...PRECACHE_URLS].map((url) => new Request(url, { cache: 'reload' })));
        return;
      }
      const [identity, worker] = await Promise.all([
        networkAsset(IDENTITY_URL),
        networkAsset(WORKER_URL),
      ]);
      const release = await validateRelease(identity, worker);
      const urls = [
        ...new Set([...SHELL.filter((path) => path !== '.'), ...BOOT_DATA].map(assetUrl)),
      ];
      const verified = await Promise.all(
        urls.map(async (url) => [
          url,
          await verifiedResponse(await networkAsset(url), release.entries.get(url)),
        ]),
      );
      verified.push([IDENTITY_URL, release.identity], [WORKER_URL, release.worker]);
      // No candidate entry is published until all mandatory bytes match. The
      // candidate is not active until every write commits; failed new caches
      // are removed without disturbing an existing generation of this identity.
      const existed = (await caches.keys()).includes(CACHE_NAME);
      const cache = await caches.open(CACHE_NAME);
      try {
        await Promise.all(verified.map(([url, response]) => cache.put(url, response.clone())));
      } catch (error) {
        if (!existed) await caches.delete(CACHE_NAME);
        throw error;
      }
      installedRelease = Promise.resolve(release);
      // Do not skipWaiting: existing controlled windows keep their generation.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // CacheStorage is origin-wide. Even another KAIRO installation on a
      // different Pages subpath owns its own cache. Legacy unscoped keys are
      // left alone because this worker cannot prove exclusive ownership.
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function fetchAndStore(request, cache) {
  return fetch(request).then((response) => ({
    response,
    // A cache failure must not turn a successful online request into a failed
    // read. Partial/range responses cannot be stored with Cache.put.
    stored:
      cache && response.status === 200
        ? cache.put(request, response.clone()).catch(() => {})
        : undefined,
  }));
}

function updateNeeded() {
  return new Response(
    'This resource is unavailable in the installed KAIRO version. Reconnect and close the app’s windows to finish an available update.',
    {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-kairo-update-needed': '1',
      },
    },
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // the AI key's traffic is never ours
  if (!url.href.startsWith(SCOPE)) return;

  const relativePath = url.href.slice(SCOPE.length);
  const isContent = /^(data|vendor|design|modules)\//.test(relativePath);
  const navigation = request.mode === 'navigate';
  const cacheFirst = navigation || PRECACHE_URLS.has(url.href) || isContent;
  const task = (async () => {
    const cache = await caches.open(CACHE_NAME).catch(() => null);
    if (STAMPED) {
      if (!cache) return { response: updateNeeded() };
      try {
        const release = await readInstalledRelease(cache);
        const canonical = navigation ? assetUrl('index.html') : `${url.origin}${url.pathname}`;
        if (canonical === IDENTITY_URL) return { response: release.identity.clone() };
        const entry = release.entries.get(canonical);
        if (!entry) return { response: updateNeeded() };
        const hit = await cache.match(canonical);
        if (hit) return { response: hit };
        const response = await verifiedResponse(await networkAsset(canonical), entry);
        return { response, stored: cache.put(canonical, response.clone()).catch(() => {}) };
      } catch {
        return { response: updateNeeded() };
      }
    }
    const cachedRequest = navigation ? new URL('index.html', SCOPE).href : request;
    const hit = cache ? await cache.match(cachedRequest).catch(() => undefined) : undefined;
    if (cacheFirst && hit) return { response: hit };
    try {
      return await fetchAndStore(request, cache);
    } catch (error) {
      if (hit) return { response: hit };
      throw error;
    }
  })();
  event.respondWith(task.then(({ response }) => response));
  // Register the lifetime hold during dispatch, including the asynchronous
  // put, while returning the network response without waiting for disk I/O.
  event.waitUntil(task.then(({ stored }) => stored).catch(() => {}));
});
