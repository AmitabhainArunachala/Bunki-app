/**
 * Real Chromium service-worker lifecycle checks. The HTTPS server and fresh
 * browser profile are private to this run; no existing browser data is read.
 *
 * KAIRO_SITE_DIR selects a staged artifact; otherwise one is assembled externally.
 * KAIRO_EVIDENCE_DIR selects receipts/screenshots. CHROMIUM_PATH is optional.
 * KAIRO_SW_SOURCE may select an earlier worker for a negative baseline only.
 *
 * This verifies the boot core and individual cached resources, not a complete
 * offline article/audio library, browser eviction policy, or native iOS.
 */
import { execFileSync } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import { createServer } from 'node:https';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { chromium } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = resolveCorridorSite();
const EVIDENCE_DIR = resolveCorridorEvidence();
mkdirSync(EVIDENCE_DIR, { recursive: true });
const RUN_DIR = mkdtempSync(join(EVIDENCE_DIR, 'run-'));
const SW_FILE = resolve(process.env.KAIRO_SW_SOURCE || join(SITE_DIR, 'sw.js'));
const SW_SOURCE = readFileSync(SW_FILE, 'utf8');
const SOURCE_HASH = createHash('sha256').update(SW_SOURCE).digest('hex');
const VERSION_MATCH = SW_SOURCE.match(/const (?:DEVELOPMENT_)?VERSION = ['"]([^'"]+)['"]/);
if (!VERSION_MATCH) throw new Error('The worker must declare its development VERSION');
const STAMP_ASSIGNMENT = /^self\.KAIRO_ASSET_VERSION = (['"])([a-f0-9]{64})\1;\n/;
const SUPPORTS_BUILD_STAMP = SW_SOURCE.includes('const DEVELOPMENT_VERSION =');
const UNSTAMPED_SOURCE = SW_SOURCE.replace(STAMP_ASSIGNMENT, '');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const HOST = 'kairo-offline.test';
const APP = '/Bunki-app/';
const OTHER = '/another-kairo/';
const AUTO = '/automatic-install/';
const LEGACY = '/legacy-migration/';
const LEGACY_HEAD = '124f08b3845c89bd874c0b0dabae91b9eb1466f5';
const CACHED_SHARD = 'data/share_alike/dict-v2/00.json';
const LATE_SHARD = 'data/share_alike/dict-v2/01.json';
const STREAM_SHARD = 'data/share_alike/dict-v2/02.json';
const PAGE_ERROR_PROBE = process.argv.includes('--page-error-probe');
const GENERATION_ONLY = process.argv.includes('--generation-only');
const LEGACY_ONLY = process.argv.includes('--legacy-migration-only');
const results = [];
const requests = [];
const browserErrors = [];
let failures = 0;
let context;
let server;

function check(name, pass, detail = '') {
  const row = { name, pass: Boolean(pass), detail };
  results.push(row);
  if (!pass) failures += 1;
  console.log(`${pass ? 'ok' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

// Snapshot the asset tree once: concurrent repository work must not mutate a
// running fixture. Release B changes real JavaScript, boot JSON and lazy
// dictionary shards, then derives both manifest digests using the builder's
// schema. Staged release A retains its original asset bytes and identity.
const state = {
  online: true,
  release: 'initial',
  failingPath: null,
  corruptPath: null,
  manifestMode: null,
  streaming: false,
  legacyWorker: null,
};
const snapshots = new Map();
const identityFile = join(SITE_DIR, 'build-identity.json');
const stagedIdentity = JSON.parse(readFileSync(identityFile, 'utf8'));
const assetPaths = stagedIdentity.files.map((entry) => entry.path);
for (const path of assetPaths) snapshots.set(path, readFileSync(join(SITE_DIR, path)));
snapshots.set('sw.js', Buffer.from(UNSTAMPED_SOURCE));
snapshots.set('404.html', snapshots.get('index.html'));
const generationBytes = (release, path) => {
  const bytes = snapshots.get(path);
  if (release !== 'update' || !bytes) return bytes;
  if (path === 'index.html' || path === '404.html')
    return Buffer.from(
      bytes
        .toString()
        .replace('</head>', '<meta name="offline-fixture-release" content="update"></head>'),
    );
  if (path === 'corridor.js')
    return Buffer.from(`${bytes}\nglobalThis.__KAIRO_FIXTURE_GENERATION__ = 'update';\n`);
  if (['modules/reading-core.mjs', 'modules/feed-core.mjs', 'modules/assessment-core.mjs', 'modules/record-core.mjs', 'reading-controller.mjs', 'feed-controller.mjs', 'assessment-controller.mjs', 'record-controller.mjs', 'record-host.mjs', 'publisher-controller.mjs'].includes(path))
    return Buffer.from(`${bytes}\nexport const offlineFixtureGeneration = 'update';\n`);
  if (['data/manifest.json', CACHED_SHARD, LATE_SHARD, STREAM_SHARD].includes(path)) {
    return Buffer.from(
      JSON.stringify({ ...JSON.parse(bytes), offlineFixtureGeneration: 'update' }),
    );
  }
  return bytes;
};
const generations = new Map();
for (const name of ['initial', 'update']) {
  const files = new Map([...snapshots.keys()].map((path) => [path, generationBytes(name, path)]));
  const inputs = [...files]
    .filter(([path]) => path !== '404.html')
    .map(([path, bytes]) => ({ path, sha256: hash(bytes) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const sourceAssetSha256 = hash(JSON.stringify(inputs));
  const worker = SUPPORTS_BUILD_STAMP
    ? `self.KAIRO_ASSET_VERSION = "${sourceAssetSha256}";\n${UNSTAMPED_SOURCE}`
    : UNSTAMPED_SOURCE.replace(
        VERSION_MATCH[0],
        `const VERSION = '${VERSION_MATCH[1]}${name === 'update' ? '-offline-update' : ''}'`,
      );
  files.set('sw.js', Buffer.from(worker));
  const orderedPaths = stagedIdentity
    ? stagedIdentity.files.map((entry) => entry.path)
    : [...files.keys()].sort();
  const entries = orderedPaths.map((path) => ({
    path,
    bytes: files.get(path).length,
    sha256: hash(files.get(path)),
  }));
  const manifest = {
    ...stagedIdentity,
    schemaVersion: 1,
    product: 'KAIRO',
    gitSha: stagedIdentity?.gitSha || 'synthetic-source-snapshot',
    sourceDirty: stagedIdentity?.sourceDirty ?? true,
    sourceAssetSha256,
    artifactSha256: hash(JSON.stringify(entries)),
    files: entries,
  };
  files.set('build-identity.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  generations.set(name, {
    files,
    manifest,
    worker,
    entries: new Map(entries.map((entry) => [entry.path, entry])),
  });
}
const INITIAL = generations.get('initial');
const UPDATE = generations.get('update');
const VERSION = SUPPORTS_BUILD_STAMP
  ? `kairo-${INITIAL.manifest.sourceAssetSha256}`
  : VERSION_MATCH[1];
const UPDATE_VERSION = SUPPORTS_BUILD_STAMP
  ? `kairo-${UPDATE.manifest.sourceAssetSha256}`
  : `${VERSION_MATCH[1]}-offline-update`;

function candidateSource() {
  return generations.get(state.release).worker;
}

function stampedSource(stamp) {
  return `self.KAIRO_ASSET_VERSION = '${stamp}';\n${SW_SOURCE.replace(STAMP_ASSIGNMENT, '')}`;
}

async function startServer() {
  const cert = join(RUN_DIR, 'localhost-cert.pem');
  const key = join(RUN_DIR, 'localhost-key.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      `/CN=${HOST}`,
    ],
    { stdio: 'ignore' },
  );
  server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const path = new URL(req.url, 'https://fixture.invalid').pathname;
    requests.push({
      path,
      at: new Date().toISOString(),
      release: state.release,
      online: state.online,
      manifestMode: state.manifestMode,
      failingPath: state.failingPath,
      corruptPath: state.corruptPath,
    });
    if (!state.online) {
      req.socket.destroy();
      return;
    }
    res.setHeader('cache-control', 'no-store');
    if (path === '/probe.html') {
      res.setHeader('content-type', MIME['.html']);
      res.end('<!doctype html><title>Isolated offline verifier</title>');
      return;
    }
    const prefix = [APP, OTHER, AUTO, LEGACY].find((scope) => path.startsWith(scope));
    if (!prefix) {
      res.writeHead(404).end('outside test installation');
      return;
    }
    if (path === state.failingPath) {
      res.writeHead(503).end('deliberate incomplete release');
      return;
    }
    const rel = decodeURIComponent(path.slice(prefix.length)) || 'index.html';
    if (rel === 'sw.js') {
      res.setHeader('content-type', MIME['.js']);
      res.end(prefix === LEGACY && state.legacyWorker ? state.legacyWorker : candidateSource());
      return;
    }
    const generation = generations.get(state.release);
    let bytes = generation.files.get(rel);
    if (!bytes) {
      res.writeHead(404).end('missing fixture asset');
      return;
    }
    if (path === state.corruptPath) bytes = INITIAL.files.get(rel);
    if (rel === 'build-identity.json' && state.manifestMode === 'wrong-generation')
      bytes = INITIAL.files.get(rel);
    if (rel === 'build-identity.json' && state.manifestMode === 'forged-source') {
      const manifest = structuredClone(generation.manifest);
      manifest.files.find((entry) => entry.path === LATE_SHARD).sha256 =
        INITIAL.entries.get(LATE_SHARD).sha256;
      manifest.artifactSha256 = hash(JSON.stringify(manifest.files));
      bytes = Buffer.from(JSON.stringify(manifest));
    }
    res.setHeader('content-type', MIME[extname(rel)] || 'application/octet-stream');
    if (rel === STREAM_SHARD && state.streaming) {
      res.write(bytes.subarray(0, 64));
      setTimeout(() => res.end(bytes.subarray(64)), 700);
      return;
    }
    res.end(bytes);
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  // The ephemeral key is no longer needed once the server has loaded it.
  rmSync(key);
  rmSync(cert);
  return `https://${HOST}:${server.address().port}`;
}

async function launch(profile) {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1024, height: 768 },
    args: [
      `--host-resolver-rules=MAP ${HOST} 127.0.0.1`,
      '--ignore-certificate-errors',
      '--proxy-server=direct://',
      '--proxy-bypass-list=*',
    ],
  });
  context.on('page', (page) => page.on('pageerror', (error) => browserErrors.push(error.message)));
  return context;
}

async function newPage(base, path) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  return page;
}

async function install(page, scope) {
  return page.evaluate(async (scopePath) => {
    const registration = await navigator.serviceWorker.register(`${scopePath}sw.js`);
    if (registration.active) return registration.active.state;
    const worker = registration.installing || registration.waiting;
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('install did not activate')), 30000);
      const observe = () => {
        if (worker.state === 'activated' || worker.state === 'redundant') {
          clearTimeout(timer);
          ok(worker.state);
        }
      };
      worker.addEventListener('statechange', observe);
      observe();
    });
  }, scope);
}

async function update(page, scope) {
  return page.evaluate(async (scopePath) => {
    const registration = await navigator.serviceWorker.getRegistration(scopePath);
    if (!registration) throw new Error('update requires an installed registration');
    let cleanup = () => undefined;
    const terminal = new Promise((ok, fail) => {
      const observers = new Map();
      const timer = setTimeout(
        () =>
          fail(
            new Error(
              `update did not settle: ${JSON.stringify({
                active: registration.active?.state || null,
                waiting: registration.waiting?.state || null,
                installing: registration.installing?.state || null,
                observed: window.__offlineCandidate?.state || null,
              })}`,
            ),
          ),
        30000,
      );
      const watch = (worker) => {
        if (!worker || observers.has(worker)) return;
        window.__offlineCandidate = worker;
        const observe = () => {
          if (['installed', 'activated', 'redundant'].includes(worker.state)) ok(worker.state);
        };
        observers.set(worker, observe);
        worker.addEventListener('statechange', observe);
        observe();
      };
      const found = () => watch(registration.installing);
      registration.addEventListener('updatefound', found);
      // The actual entry page also registers this scope. A candidate may already
      // be installing or waiting; checking identical script bytes need not emit
      // another updatefound event. Never reuse a prior failed terminal worker.
      const existing = registration.installing || registration.waiting;
      if (existing?.state !== 'redundant') watch(existing);
      cleanup = () => {
        clearTimeout(timer);
        registration.removeEventListener('updatefound', found);
        for (const [worker, observer] of observers) worker.removeEventListener('statechange', observer);
      };
    });
    try {
      // Drain the explicit update job too, so a following fault fixture cannot
      // change server bytes while this same-script check is still queued.
      const [result] = await Promise.all([terminal, registration.update()]);
      return result;
    } finally {
      cleanup();
    }
  }, scope);
}

async function cacheInventory(page, scope) {
  return page.evaluate(async (scopePath) => {
    const rows = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const entries = [];
      for (const request of await cache.keys()) {
        if (!new URL(request.url).pathname.startsWith(scopePath)) continue;
        const response = await cache.match(request);
        entries.push({ url: request.url, bytes: (await response.arrayBuffer()).byteLength });
      }
      if (entries.length) rows.push({ name, entries });
    }
    return rows;
  }, scope);
}

async function ready(page, name) {
  const pass = await page
    .locator('body[data-ready="1"]')
    .waitFor({ timeout: 15000 })
    .then(
      () => true,
      () => false,
    );
  check(name, pass);
  return pass;
}

async function cacheValue(page, url) {
  return page.evaluate(async (requestUrl) => {
    for (const name of await caches.keys()) {
      if (name.startsWith('neighbor-') || name === 'kairo-neighbor-v1') continue;
      const response = await (await caches.open(name)).match(requestUrl);
      if (response) return response.text();
    }
    return null;
  }, url);
}

async function fetchOutcome(page, url) {
  return page.evaluate(async (requestUrl) => {
    const response = await fetch(requestUrl);
    const bytes = await response.arrayBuffer();
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return {
      status: response.status,
      sha256,
      updateNeeded: response.headers.get('x-kairo-update-needed'),
    };
  }, url);
}

async function until(predicate, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

// Exact-source handler probes supplement the browser lifecycle. A blocked
// cache.put must remain in the fetch event's waitUntil promise set; a quota
// failure must not replace a successful network response with an error.
async function verifyHeldWrites() {
  if (SUPPORTS_BUILD_STAMP) {
    const self = { registration: { scope: 'https://invalid-stamp.test/' }, addEventListener() {} };
    let rejected = false;
    try {
      runInNewContext(stampedSource('invalid-digest'), { self, URL, Request, Response });
    } catch (error) {
      rejected = error.message.includes('KAIRO_ASSET_VERSION');
    }
    check('malformed release asset digest fails closed', rejected);
  }
  for (const path of [LATE_SHARD, 'corridor-ink.js']) {
    let handler;
    let releaseWrite;
    const pendingWrite = new Promise((ok) => {
      releaseWrite = ok;
    });
    const held = [];
    let responsePromise;
    const cache = {
      match: async (request) => {
        const url = typeof request === 'string' ? request : request.url;
        const path = new URL(url).pathname.slice(APP.length);
        return ['build-identity.json', 'sw.js'].includes(path)
          ? new Response(INITIAL.files.get(path))
          : undefined;
      },
      put: () => pendingWrite,
    };
    const origin = 'https://worker-probe.invalid';
    const self = {
      location: new URL(`${origin}${APP}sw.js`),
      registration: { scope: `${origin}${APP}` },
      addEventListener: (kind, listener) => {
        if (kind === 'fetch') handler = listener;
      },
    };
    runInNewContext(
      INITIAL.worker,
      {
        self,
        URL,
        Request,
        Response,
        Headers,
        TextEncoder,
        TextDecoder,
        crypto: webcrypto,
        caches: { open: async () => cache, match: cache.match },
        fetch: async () => new Response(INITIAL.files.get(path)),
      },
      { filename: SW_FILE },
    );
    handler({
      request: new Request(`${origin}${APP}${path}`),
      respondWith: (promise) => {
        responsePromise = promise;
      },
      waitUntil: (promise) => held.push(Promise.resolve(promise)),
    });
    const response = await responsePromise;
    check(
      `network response does not wait for ${path} cache write`,
      hash(Buffer.from(await response.arrayBuffer())) === INITIAL.entries.get(path).sha256,
    );
    let finished = false;
    const completion = Promise.all(held).then(() => {
      finished = true;
    });
    await new Promise((ok) => setTimeout(ok, 10));
    check(`fetch event holds pending ${path} cache write`, held.length > 0 && !finished);
    releaseWrite();
    await completion;

    held.length = 0;
    cache.put = async () => {
      throw new Error('deliberate quota failure');
    };
    handler({
      request: new Request(`${origin}${APP}${path}?quota-probe=1`),
      respondWith: (promise) => {
        responsePromise = promise;
      },
      waitUntil: (promise) => held.push(Promise.resolve(promise)),
    });
    const quotaResponse = await responsePromise;
    const quotaCompletion = await Promise.allSettled(held);
    check(
      `cache quota failure preserves successful ${path} network response`,
      hash(Buffer.from(await quotaResponse.arrayBuffer())) === INITIAL.entries.get(path).sha256 &&
        quotaCompletion.every((result) => result.status === 'fulfilled'),
    );
  }
}

async function verifyLegacyMigration(base) {
  if (context) await context.close();
  state.online = true;
  state.release = 'initial';
  state.failingPath = state.corruptPath = state.manifestMode = null;
  state.legacyWorker = execFileSync(
    'git',
    ['-C', resolve(TOOL_DIR, '../../..'), 'show', `${LEGACY_HEAD}:prototypes/corridor/sw.js`],
    { encoding: 'utf8' },
  );
  const profile = join(RUN_DIR, 'legacy-browser-profile');
  await launch(profile);
  let probe = await newPage(base, '/probe.html');
  check(
    'historical deployed v2 worker installs in an isolated profile',
    (await install(probe, LEGACY)) === 'activated' &&
      (await probe.evaluate(async () => (await caches.keys()).includes('kairo-v2'))),
  );
  let app = await newPage(base, `${LEGACY}?entry=shelf&ui=bi`);
  await ready(app, 'historical worker serves the online migration fixture');
  await probe.evaluate(async (scope) => {
    window.__legacyActive = (await navigator.serviceWorker.getRegistration(scope)).active;
  }, LEGACY);
  state.legacyWorker = null;
  check(
    'fixed candidate waits for the existing historical worker client',
    (await update(probe, LEGACY)) === 'installed' &&
      (await probe.evaluate(
        async (scope) =>
          (await navigator.serviceWorker.getRegistration(scope)).active === window.__legacyActive,
        LEGACY,
      )),
  );
  await app.close();
  await until(
    () =>
      probe.evaluate(
        async (scope) =>
          (await navigator.serviceWorker.getRegistration(scope)).active ===
            window.__offlineCandidate && window.__offlineCandidate?.state === 'activated',
        LEGACY,
      ),
    'fixed worker activates after historical client closes',
    30000,
  );
  check('fixed worker takes over after historical client closes', true);
  await context.close();
  context = null;
  state.online = false;
  await launch(profile);
  await context.setOffline(true);
  app = await newPage(base, `${LEGACY}?entry=shelf&ui=bi`);
  await ready(app, 'migration from historical worker cold-starts offline');
  check(
    'migrated installation retains its verified build identity offline',
    (await fetchOutcome(app, `${base}${LEGACY}build-identity.json`)).sha256 ===
      hash(INITIAL.files.get('build-identity.json')),
  );
}

try {
  if (!PAGE_ERROR_PROBE && !LEGACY_ONLY) await verifyHeldWrites();
  const base = await startServer();
  const profile = join(RUN_DIR, 'browser-profile');
  await launch(profile);
  let probe = await newPage(base, '/probe.html');
  if (PAGE_ERROR_PROBE) {
    const error = probe.waitForEvent('pageerror');
    await probe.evaluate(() => {
      setTimeout(() => {
        throw new Error('Synthetic unexpected page-error probe');
      }, 0);
    });
    await error;
  } else if (LEGACY_ONLY) {
    await verifyLegacyMigration(base);
  } else {
    if (stagedIdentity && !process.env.KAIRO_SW_SOURCE) {
      check(
        'initial fixture preserves the staged artifact identity',
        INITIAL.manifest.sourceAssetSha256 === stagedIdentity.sourceAssetSha256 &&
          INITIAL.manifest.artifactSha256 === stagedIdentity.artifactSha256,
      );
    }
    await probe.evaluate(async () => {
      for (const name of ['neighbor-reader-v1', 'kairo-neighbor-v1']) {
        await (await caches.open(name)).put('/neighbor/resource.json', new Response(name));
      }
    });

    check('Pages-subpath first install activates', (await install(probe, APP)) === 'activated');
    const initialInventory = await cacheInventory(probe, APP);
    writeFileSync(join(RUN_DIR, 'initial-cache.json'), JSON.stringify(initialInventory, null, 2));
    const totalBytes = initialInventory
      .flatMap((cache) => cache.entries)
      .reduce((n, row) => n + row.bytes, 0);
    check(
      'install caches a boot core before any app page opens',
      initialInventory.length > 0,
      `${totalBytes} bytes`,
    );
    check(
      'activation preserves other applications caches',
      await probe.evaluate(async () => {
        const names = await caches.keys();
        return names.includes('neighbor-reader-v1') && names.includes('kairo-neighbor-v1');
      }),
    );
    check('a second KAIRO installation activates', (await install(probe, OTHER)) === 'activated');
    const afterNeighbor = await cacheInventory(probe, APP);
    check(
      'second installation preserves first installation boot entries',
      JSON.stringify(afterNeighbor) === JSON.stringify(initialInventory),
    );
    const otherInventory = await cacheInventory(probe, OTHER);
    check(
      'two KAIRO installations use independent cache namespaces',
      !otherInventory.some((other) =>
        initialInventory.some((initial) => initial.name === other.name),
      ),
    );
    await context.close();
    context = null;

    // Browser restart + disabled HTTP cache + severed server, after an install
    // from an inert harness. No first online app visit can warm missing data.
    state.online = false;
    await launch(profile);
    await context.setOffline(true);
    let app = await newPage(base, `${APP}?entry=shelf&ui=bi`);
    const booted = await ready(app, 'first app startup after browser restart works offline');
    check(
      'offline startup uses the installed worker',
      await app.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    );
    check(
      'uncached network request really fails offline',
      await app.evaluate(async () => {
        try {
          return !(await fetch('never-cached-proof.json')).ok;
        } catch {
          return true;
        }
      }),
    );
    check(
      'pinned scheduler imports offline',
      await app.evaluate(async () => {
        try {
          return typeof (await import('./vendor/ts-fsrs.mjs')).fsrs === 'function';
        } catch {
          return false;
        }
      }),
    );
    check(
      'compiled shared reading core and authored controller execute after cold offline boot',
      await app.evaluate(async () => {
        try {
          const core = await import('./modules/reading-core.mjs');
          const controller = await import('./reading-controller.mjs');
          const feed = await import('./modules/feed-core.mjs');
          const sources = await import('./feed-controller.mjs');
          const assessments = await import('./assessment-controller.mjs');
          const assessmentCore = await import('./modules/assessment-core.mjs');
          const records = await import('./modules/record-core.mjs');
          const recordController = await import('./record-controller.mjs');
          const recordHost = await import('./record-host.mjs');
          const publishers = await import('./publisher-controller.mjs');
          return core.canonicalWebUrl('https://www.asahi.com/articles/example#part') === 'https://www.asahi.com/articles/example'
            && controller.readingSettings().length === 'medium'
            && typeof feed.parseFeedXml === 'function' && Object.keys(feed.SOURCE_REGISTRY).length >= 5
            && sources.parseFeedLibrary(null).v === 1
            && assessments.createLibrary({ scope: { accountId: 'offline-fixture', learnerId: 'learner' } }).attempts.length === 0
            && typeof assessmentCore.checkpointAttempt === 'function'
            && typeof records.IndexedDbReplicationStore.open === 'function'
            && typeof recordController.createRecordController === 'function'
            && typeof recordHost.createRecordHost === 'function'
            && publishers.parsePublisherLibrary(null).readings.length === 0;
        } catch { return false; }
      }),
    );
    if (booted) await app.screenshot({ path: join(RUN_DIR, 'cold-offline-shelf.png') });

    state.online = true;
    await context.setOffline(false);
    probe = await newPage(base, '/probe.html');
    // An origin-wide caches.match would accept this foreign value. The worker
    // must read only its own scope/version, then obtain the real network value.
    const poisonUrl = `${base}${APP}${CACHED_SHARD}`;
    await probe.evaluate(async (url) => {
      await (
        await caches.open('neighbor-poison')
      ).put(url, new Response('{"value":"foreign-cache"}'));
    }, poisonUrl);
    check(
      'foreign cache cannot supply KAIRO content',
      (await fetchOutcome(app, poisonUrl)).sha256 === INITIAL.entries.get(CACHED_SHARD).sha256,
    );

    const streamingUrl = `${base}${APP}${STREAM_SHARD}`;
    state.streaming = true;
    const streamRequestsBefore = requests.filter(
      (request) => request.path === `${APP}${STREAM_SHARD}`,
    ).length;
    await app.evaluate(async (url) => {
      void fetch(url)
        .then((response) => response.arrayBuffer())
        .catch(() => {});
    }, streamingUrl);
    await until(
      () =>
        requests.filter((request) => request.path === `${APP}${STREAM_SHARD}`).length >
        streamRequestsBefore,
      'streaming network response starts',
    );
    await app.close();
    app = null;
    await until(async () => {
      const body = await cacheValue(probe, streamingUrl);
      return body !== null && hash(body) === INITIAL.entries.get(STREAM_SHARD).sha256;
    }, 'streaming cache write after client close');
    check(
      'streaming content cache fill completes after requesting page closes',
      hash(await cacheValue(probe, streamingUrl)) === INITIAL.entries.get(STREAM_SHARD).sha256,
    );
    state.streaming = false;

    app = await newPage(base, `${APP}?entry=shelf&ui=bi`);
    await ready(app, 'installed app is ready before update probes');
    // The real page registers at window.load and can start its own update.
    // Publish the first fault with the changed release, never a valid candidate
    // between these two fixture states. Otherwise a waiting valid worker can
    // make the following same-script update a no-op instead of a fault probe.
    if (GENERATION_ONLY) state.corruptPath = `${APP}data/manifest.json`;
    else state.manifestMode = 'wrong-generation';
    state.release = 'update';
    check(
      'generation fixture changes actual JavaScript, boot data and lazy dictionary bytes',
      ['corridor.js', 'data/manifest.json', LATE_SHARD].every(
        (path) => INITIAL.entries.get(path).sha256 !== UPDATE.entries.get(path).sha256,
      ),
    );
    const identityA = await fetchOutcome(app, `${base}${APP}build-identity.json`);
    check(
      'old app reports its installed identity after the network release changes',
      identityA.sha256 === hash(INITIAL.files.get('build-identity.json')),
      JSON.stringify(identityA),
    );
    check(
      'old app keeps its installed JavaScript and boot data',
      (await fetchOutcome(app, `${base}${APP}corridor.js`)).sha256 ===
        INITIAL.entries.get('corridor.js').sha256 &&
        (await fetchOutcome(app, `${base}${APP}data/manifest.json`)).sha256 ===
          INITIAL.entries.get('data/manifest.json').sha256,
    );
    check(
      'previously verified old dictionary bytes remain available',
      (await fetchOutcome(app, poisonUrl)).sha256 === INITIAL.entries.get(CACHED_SHARD).sha256,
    );
    const late = await fetchOutcome(app, `${base}${APP}${LATE_SHARD}`);
    check(
      'old worker rejects a newly deployed lazy dictionary shard',
      late.status === 503 && late.updateNeeded === '1',
      JSON.stringify(late),
    );
    check(
      'rejected newer dictionary bytes are not cached under the old generation',
      (await cacheValue(probe, `${base}${APP}${LATE_SHARD}`)) === null,
    );

    if (GENERATION_ONLY) {
      state.corruptPath = `${APP}data/manifest.json`;
      check(
        'all-200 mixed-generation boot bytes reject update installation',
        (await update(probe, APP)) === 'redundant',
      );
    } else {
      for (const mode of ['wrong-generation', 'forged-source']) {
        state.manifestMode = mode;
        check(
          `${mode} manifest rejects update installation`,
          (await update(probe, APP)) === 'redundant',
        );
        check(
          `${mode} manifest publishes no candidate cache`,
          !(await cacheInventory(probe, APP)).some((cache) => cache.name.endsWith(UPDATE_VERSION)),
        );
      }
      state.manifestMode = null;
      for (const path of ['modules/reading-core.mjs', 'modules/feed-core.mjs', 'modules/assessment-core.mjs', 'modules/record-core.mjs', 'reading-controller.mjs', 'feed-controller.mjs', 'assessment-controller.mjs', 'record-controller.mjs', 'record-host.mjs', 'publisher-controller.mjs']) {
        state.failingPath = `${APP}${path}`;
        check(`missing ${path} rejects update installation`, (await update(probe, APP)) === 'redundant');
        state.failingPath = null;
        state.corruptPath = `${APP}${path}`;
        check(`stale ${path} rejects update installation`, (await update(probe, APP)) === 'redundant');
        check(`${path} failure publishes no candidate cache`, !(await cacheInventory(probe, APP)).some((cache) => cache.name.endsWith(UPDATE_VERSION)));
        state.corruptPath = null;
      }
      state.corruptPath = `${APP}data/manifest.json`;
      check(
        'all-200 mixed-generation boot bytes reject update installation',
        (await update(probe, APP)) === 'redundant',
      );
      check(
        'mixed-generation boot bytes publish no candidate cache',
        !(await cacheInventory(probe, APP)).some((cache) => cache.name.endsWith(UPDATE_VERSION)),
      );
      state.corruptPath = null;
      state.failingPath = `${APP}data/share_alike/strokes.json`;
      check('partial update installation fails', (await update(probe, APP)) === 'redundant');
      const failedInventory = await cacheInventory(probe, APP);
      writeFileSync(
        join(RUN_DIR, 'failed-update-cache.json'),
        JSON.stringify(failedInventory, null, 2),
      );
      check(
        'failed install does not publish a partial candidate cache',
        !failedInventory.some((cache) => cache.name.endsWith(UPDATE_VERSION)),
      );
      state.online = false;
      await context.close();
      context = null;
      await launch(profile);
      await context.setOffline(true);
      app = await newPage(base, `${APP}?entry=shelf&ui=bi`);
      await ready(app, 'previous installed app cold-starts offline after failed update');
      check(
        'failed update did not replace installed HTML',
        (await app.locator('meta[name="offline-fixture-release"]').count()) === 0,
      );

      state.online = true;
      state.failingPath = null;
      await context.setOffline(false);
      probe = await newPage(base, '/probe.html');
      const restartedLate = await fetchOutcome(app, `${base}${APP}${LATE_SHARD}`);
      check(
        'worker restart retains its pinned manifest and rejects newer lazy bytes',
        restartedLate.status === 503 &&
          restartedLate.updateNeeded === '1' &&
          (await fetchOutcome(app, `${base}${APP}build-identity.json`)).sha256 ===
            hash(INITIAL.files.get('build-identity.json')),
      );
      check(
        'complete update waits while an old app window is open',
        (await update(probe, APP)) === 'installed',
      );
      check(
        'checking an already waiting update retains the same candidate',
        (await update(probe, APP)) === 'installed' &&
          (await probe.evaluate(
            async (scope) =>
              (await navigator.serviceWorker.getRegistration(scope)).waiting ===
              window.__offlineCandidate,
            APP,
          )),
      );
      await app.reload({ waitUntil: 'domcontentloaded' });
      await ready(app, 'open app still uses its complete installed version');
      check(
        'waiting update does not mix new HTML into an old client',
        (await app.locator('meta[name="offline-fixture-release"]').count()) === 0,
      );
      check(
        'waiting update keeps old JavaScript and boot data together',
        (await app.evaluate(() => globalThis.__KAIRO_FIXTURE_GENERATION__ === undefined)) &&
          (await fetchOutcome(app, `${base}${APP}data/manifest.json`)).sha256 ===
            INITIAL.entries.get('data/manifest.json').sha256,
      );
      await app.close();
      app = null;
      await until(
        () =>
          probe.evaluate(async (scope) => {
            const registration = await navigator.serviceWorker.getRegistration(scope);
            return (
              registration.active === window.__offlineCandidate &&
              window.__offlineCandidate?.state === 'activated'
            );
          }, APP),
        'the completed candidate activates after closing old windows',
        30000,
      );
      check('new version activates after the old app closes', true);
      const updatedInventory = await cacheInventory(probe, APP);
      writeFileSync(join(RUN_DIR, 'updated-cache.json'), JSON.stringify(updatedInventory, null, 2));
      const oldNames = initialInventory.map((cache) => cache.name);
      const currentNames = await probe.evaluate(() => caches.keys());
      check(
        'successful update removes only its obsolete scope caches',
        oldNames.every((name) => !currentNames.includes(name)) &&
          currentNames.includes('neighbor-reader-v1') &&
          currentNames.includes('kairo-neighbor-v1') &&
          (await cacheInventory(probe, OTHER)).length > 0,
      );
      await context.close();
      context = null;

      state.online = false;
      await launch(profile);
      await context.setOffline(true);
      app = await newPage(base, `${APP}?entry=shelf&ui=bi`);
      await ready(app, 'new installed version cold-starts offline after browser restart');
      check(
        'cold restart uses completed updated HTML',
        (await app.locator('meta[name="offline-fixture-release"]').getAttribute('content')) ===
          'update',
      );
      check(
        'cold restart executes updated JavaScript with updated boot data',
        (await app.evaluate(() => globalThis.__KAIRO_FIXTURE_GENERATION__ === 'update')) &&
          (await fetchOutcome(app, `${base}${APP}data/manifest.json`)).sha256 ===
            UPDATE.entries.get('data/manifest.json').sha256,
      );
      state.online = true;
      await context.setOffline(false);
      check(
        'activated new generation accepts its matching lazy dictionary bytes',
        (await fetchOutcome(app, `${base}${APP}${LATE_SHARD}`)).sha256 ===
          UPDATE.entries.get(LATE_SHARD).sha256,
      );
      await app.screenshot({ path: join(RUN_DIR, 'updated-offline-shelf.png') });
      await app.close();

      // Exercise the actual HTTPS registration in index.html as well as the
      // install-before-first-visit harness above; no production HTML is modified.
      state.online = true;
      state.release = 'initial';
      await context.setOffline(false);
      const automatic = await newPage(base, `${AUTO}?entry=shelf`);
      await ready(automatic, 'actual HTTPS entry page boots');
      await automatic.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
        timeout: 30000,
      });
      check(
        'actual index.html automatically registers and controls its scope',
        await automatic.evaluate(async (scope) => {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration.scope.endsWith(scope);
        }, AUTO),
      );
      await verifyLegacyMigration(base);
    }
  }
} catch (error) {
  check('offline verifier completed without harness error', false, error.stack || String(error));
} finally {
  if (context) await context.close();
  if (server) await new Promise((ok) => server.close(ok));
  check('no unexpected page errors', browserErrors.length === 0, browserErrors.join(' | '));
  rmSync(join(RUN_DIR, 'browser-profile'), { recursive: true, force: true });
  rmSync(join(RUN_DIR, 'legacy-browser-profile'), { recursive: true, force: true });
  writeFileSync(
    join(RUN_DIR, 'receipt.json'),
    JSON.stringify(
      {
        siteDir: SITE_DIR,
        worker: SW_FILE,
        sourceHash: SOURCE_HASH,
        workerVersion: VERSION,
        fixtureMode: PAGE_ERROR_PROBE
          ? 'negative-page-error-probe'
          : GENERATION_ONLY
            ? 'generation-regressions'
            : LEGACY_ONLY
              ? 'historical-migration'
              : 'full-lifecycle',
        legacyWorkerHead: LEGACY_HEAD,
        initialSourceAssetSha256: INITIAL.manifest.sourceAssetSha256,
        initialArtifactSha256: INITIAL.manifest.artifactSha256,
        compiledModules: stagedIdentity.modules,
        updateSourceAssetSha256: UPDATE.manifest.sourceAssetSha256,
        results,
        failures,
        browserErrors,
        requests,
        limits: [
          'Chromium on a controlled HTTPS origin; not native iPhone or browser eviction testing.',
          'Core precache and individual resource fills; not whole article/audio corpus readiness.',
          'Cache write lifetime checked with an exact-source pending-promise probe and a real streaming response after client close.',
          'Update fixture changes real JavaScript, boot JSON and lazy dictionary bytes and recomputes the complete manifest.',
          'Unstamped development workers do not provide the stamped release generation guarantee.',
          'Historical kairo-v2 migration verifies waiting, activation after closing the old client and offline restart. The old v2 worker remains outside the new worker’s control until activation; its pre-existing generation-mixing behavior is not repaired while it is still active.',
        ],
      },
      null,
      2,
    ),
  );
  console.log(`Offline evidence: ${RUN_DIR}`);
  process.exitCode = failures ? 1 : 0;
}
