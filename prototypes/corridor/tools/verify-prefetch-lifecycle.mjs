/** Background article lifecycle regression on the actual staged app.
 * The timer observer retains the app's own callback; native fetch and every
 * article body remain intact. Synthetic lifecycle contracts are reported apart
 * from real browser pagehide/history navigation. They do not certify an iPhone.
 * KAIRO_PREFETCH_RUNTIME_SOURCE is diagnostic only; its receipt cannot certify
 * the selected artifact. Release verification must leave it unset. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { chromium, webkit } from 'playwright-core';
import {
  resolveCorridorEvidence,
  resolveCorridorSite,
} from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';

const OUT = resolveCorridorEvidence();
const SITE = resolveCorridorSite();
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const runtimeOverride = process.env.KAIRO_PREFETCH_RUNTIME_SOURCE;
if (runtimeOverride) assert(isAbsolute(runtimeOverride));
const runtimePath = runtimeOverride || resolve(SITE, 'corridor.js');
const runtime = readFileSync(runtimePath, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const end = runtime.indexOf(
  '/* ------------------------------------------------------- navigation state */',
);
const start = runtime.indexOf('let articlePrefetchDeparted = false;');
const prefetchStart = runtime.indexOf('function prefetchArticles() {');
assert(prefetchStart >= 0 && end > prefetchStart);
const lifecycleSource = runtime.slice(
  start >= 0 && start < prefetchStart ? start : prefetchStart,
  end,
);
const callback = lifecycleSource.match(
  /const next = (\(\) => \{[\s\S]*?\n {2}\});\n {2}(?:timer = )?setTimeout\(next, 350\);/,
);
assert(callback, 'The actual staged prefetch callback must be identifiable');
const expectedCallbackSource = callback[1];
const engines =
  process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all'
    ? [process.env.KAIRO_BROWSER]
    : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const timerModes = [
  'ordinary-timer-control',
  'real-pagehide-reload',
  'real-pagehide-close',
  'demanded-reader-while-queue-held',
  'real-pagehide-history-back',
];
const nativeModes = [
  'real-beforeunload-delayed-reload',
  'real-beforeunload-cancelled-shared-demand',
];
const modes = [...timerModes, ...nativeModes];
const filter = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
if (filter) assert(modes.includes(filter));
const startedAt = new Date().toISOString();
const verifierSha256 = sha(readFileSync(fileURLToPath(import.meta.url)));
const results = [];
const contractResults = [];
const failure = (error) => ({ name: error.name, message: error.message, stack: error.stack });

function harness() {
  let id = 0;
  const timers = new Map();
  const listeners = new Map();
  const requested = [];
  const pending = [];
  const warnings = [];
  const passages = [
    { id: 'one', file: 'one.json' },
    { id: 'two', file: 'two.json' },
    { id: 'archive', file: 'archive/one.json' },
    { id: 'warm', tokens: [] },
  ];
  const scope = {
    D: { passages },
    S: { ready: true },
    console: { warn: (...args) => warnings.push(args) },
    addEventListener(name, fn) {
      const rows = listeners.get(name) || [];
      rows.push(fn);
      listeners.set(name, rows);
    },
    setTimeout(fn, delay) {
      const key = ++id;
      timers.set(key, { fn, delay });
      return key;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
    ensureArticle(p) {
      requested.push(p.id);
      return new Promise((done, fail) =>
        pending.push({
          done: () => {
            p.tokens = [];
            done(p);
          },
          fail,
        }),
      );
    },
  };
  runInNewContext(lifecycleSource, scope, { filename: runtimePath });
  return {
    ...scope,
    timers,
    requested,
    pending,
    warnings,
    dispatch(name, event = {}) {
      for (const listener of listeners.get(name) || []) listener(event);
    },
    take() {
      assert.equal(timers.size, 1, 'Exactly one continuation may be scheduled');
      const [key, timer] = timers.entries().next().value;
      timers.delete(key);
      return timer;
    },
  };
}
async function settle() {
  for (let index = 0; index < 5; index++) await Promise.resolve();
}
async function contract(name, run) {
  try {
    await run(harness());
    contractResults.push({ name, pass: true });
  } catch (error) {
    contractResults.push({ name, pass: false, error: failure(error) });
  }
}
await contract(
  'ordinary queue retains delays and excludes loaded and archive bodies',
  async (h) => {
    h.prefetchArticles();
    const first = h.take();
    assert.equal(first.delay, 350);
    first.fn();
    assert.deepEqual(h.requested, ['one']);
    assert.equal(h.timers.size, 0);
    h.pending.shift().done();
    await settle();
    const second = h.take();
    assert.equal(second.delay, 40);
    second.fn();
    h.pending.shift().done();
    await settle();
    h.take().fn();
    assert.deepEqual(h.requested, ['one', 'two']);
    assert.equal(h.timers.size, 0);
  },
);
await contract('pagehide clears a pending native timer', (h) => {
  h.prefetchArticles();
  assert.equal(h.timers.size, 1);
  h.dispatch('pagehide');
  assert.equal(h.timers.size, 0);
});
await contract('retained callback cannot start an article after pagehide', (h) => {
  h.prefetchArticles();
  const retained = h.take();
  h.dispatch('pagehide');
  retained.fn();
  assert.deepEqual(h.requested, []);
  assert.equal(h.timers.size, 0);
});
await contract('boot completion after pagehide cannot start a queue', (h) => {
  h.dispatch('pagehide');
  h.prefetchArticles();
  assert.equal(h.timers.size, 0);
});
await contract('in-flight completion cannot reschedule after pagehide', async (h) => {
  h.prefetchArticles();
  h.take().fn();
  h.dispatch('pagehide');
  h.pending.shift().done();
  await settle();
  assert.deepEqual(h.requested, ['one']);
  assert.equal(h.timers.size, 0);
});
await contract(
  'failed in-flight request remains observable and cannot restart after pagehide',
  async (h) => {
    h.prefetchArticles();
    h.take().fn();
    h.dispatch('pagehide');
    const reason = new Error('actual request failure fixture');
    h.pending.shift().fail(reason);
    await settle();
    assert.equal(h.warnings.length, 1);
    assert.equal(h.warnings[0][1], reason);
    assert.equal(h.timers.size, 0);
  },
);
await contract(
  'persisted return starts one new queue and permanently fences retained old callback',
  async (h) => {
    h.prefetchArticles();
    const retained = h.take();
    h.dispatch('pagehide');
    h.dispatch('pageshow', { persisted: false });
    assert.equal(h.timers.size, 0);
    h.dispatch('pageshow', { persisted: true });
    const fresh = h.take();
    assert.equal(fresh.delay, 350);
    retained.fn();
    assert.deepEqual(h.requested, []);
    fresh.fn();
    h.pending.shift().done();
    await settle();
    assert.equal(h.timers.size, 1);
  },
);
await contract(
  'old in-flight completion cannot create a second queue after persisted return',
  async (h) => {
    h.prefetchArticles();
    h.take().fn();
    h.dispatch('pagehide');
    h.dispatch('pageshow', { persisted: true });
    assert.equal(h.timers.size, 1);
    const freshTimer = h.timers.keys().next().value;
    h.pending.shift().done();
    await settle();
    assert.equal(h.timers.size, 1);
    assert.equal(h.timers.keys().next().value, freshTimer);
  },
);
await contract('replacing a queue fences its retained callback', (h) => {
  h.prefetchArticles();
  const old = h.take();
  h.prefetchArticles();
  old.fn();
  assert.deepEqual(h.requested, []);
  assert.equal(h.timers.size, 1);
});
await contract('persisted return before boot waits for boot to schedule', (h) => {
  h.S.ready = false;
  h.dispatch('pagehide');
  h.dispatch('pageshow', { persisted: true });
  assert.equal(h.timers.size, 0);
  h.S.ready = true;
  h.prefetchArticles();
  assert.equal(h.timers.size, 1);
});
await contract('beforeunload clears the pending native timer before pagehide', (h) => {
  h.prefetchArticles();
  assert.equal(h.timers.size, 1);
  h.dispatch('beforeunload');
  assert.equal(h.timers.size, 0);
});
await contract('retained callback cannot start during provisional navigation', (h) => {
  h.prefetchArticles();
  const retained = h.take();
  h.dispatch('beforeunload');
  retained.fn();
  assert.deepEqual(h.requested, []);
  assert.equal(h.timers.size, 0);
});
await contract(
  'in-flight rejection after beforeunload stays visible and cannot restart',
  async (h) => {
    h.prefetchArticles();
    h.take().fn();
    h.dispatch('beforeunload');
    const reason = new Error('actual provisional navigation cancellation fixture');
    h.pending.shift().fail(reason);
    await settle();
    assert.equal(h.warnings.length, 1);
    assert.equal(h.warnings[0][1], reason);
    assert.equal(h.timers.size, 0);
  },
);
for (const row of contractResults)
  console.log(`${row.pass ? 'PASS' : 'FAIL'} contract: ${row.name}`);

const articleIndex = JSON.parse(readFileSync(resolve(SITE, 'data/articles/index.json'), 'utf8'));
const firstArticles = articleIndex.articles
  .filter((p) => !p.tokens && !String(p.file || '').startsWith('archive/'))
  .slice(0, 4);
assert.equal(firstArticles.length, 4);
const target = '/data/articles/' + firstArticles[3].file;
const predecessors = firstArticles.slice(0, 3).map((p) => '/data/articles/' + p.file);
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
};
let active = null;
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const row = active;
  row?.serverEvents.push({ kind: 'request', path, at: Date.now() });
  if (row?.nativeDeparture) {
    response.on('finish', () => row.serverEvents.push({ kind: 'finish', path, at: Date.now() }));
    response.on('close', () =>
      row.serverEvents.push({
        kind: 'close',
        path,
        at: Date.now(),
        writableFinished: response.writableFinished,
      }),
    );
  }
  if (path === '/__prefetch_probe__/inspect.html') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><meta charset="utf-8"><title>Lifecycle storage observer</title>');
    return;
  }
  try {
    const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
    assert(file.startsWith(SITE + sep) && statSync(file).isFile());
    const body = path === '/corridor.js' ? Buffer.from(runtime) : readFileSync(file);
    if (path === '/corridor.js' || path.startsWith('/data/articles/'))
      row?.serverEvents.push({ kind: 'body', path, sha256: sha(body) });
    const send = () => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    };
    if (
      row?.nativeDeparture &&
      path === '/index.html' &&
      ++row.documentRequests === 2 &&
      row.reloadDocumentDelayMs
    ) {
      row.serverEvents.push({
        kind: 'document-delay',
        path,
        at: Date.now(),
        delayMs: row.reloadDocumentDelayMs,
      });
      setTimeout(send, row.reloadDocumentDelayMs);
    } else if (row?.nativeDeparture && path === row.holdArticlePath && !row.releaseHeldArticle) {
      row.heldArticleResponse = response;
      row.releaseHeldArticle = send;
      row.serverEvents.push({ kind: 'held-article', path, at: Date.now() });
    } else send();
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

function installProbe({ expectedCallbackSource, traceKey, firedKey, mode }) {
  const nativeFetch = window.fetch;
  const nativeSetTimeout = window.setTimeout;
  const nativeClearTimeout = window.clearTimeout;
  const fnSource = Function.prototype.toString;
  const docId = crypto.randomUUID();
  const secondary = localStorage.getItem(firedKey) === '1';
  const h = (window.__articlePrefetchProbe = {
    docId,
    held: null,
    restartHeld: null,
    ordinal: 0,
    delivered: false,
  });
  const note = (kind, detail = {}) => {
    const row = { kind, docId, nativeFetchUnchanged: window.fetch === nativeFetch, ...detail };
    const events = JSON.parse(localStorage.getItem(traceKey) || '[]');
    events.push(row);
    localStorage.setItem(traceKey, JSON.stringify(events));
    console.debug('__ARTICLE_PREFETCH__' + JSON.stringify(row));
  };
  note('document-init', { secondary, nativeFetchSource: fnSource.call(nativeFetch) });
  for (const name of ['pagehide', 'pageshow'])
    addEventListener(name, (event) =>
      note(name, { trusted: event.isTrusted, persisted: event.persisted }),
    );
  // WebKit's runBeforeUnload close path needs the observed unload lifecycle.
  // These listeners only record events. Do not add them to the history case,
  // where they could change the browser's back/forward cache eligibility.
  if (mode === 'real-pagehide-close')
    for (const name of ['beforeunload', 'unload'])
      addEventListener(name, (event) => note(name, { trusted: event.isTrusted }));
  addEventListener('unhandledrejection', (event) =>
    note('unhandledrejection', { message: String(event.reason?.message ?? event.reason) }),
  );
  addEventListener('error', (event) => note('window-error', { message: event.message }));
  let actualNext = null;
  const hold = (fn, delay, args, slot, kind) => {
    if (h[slot]) throw new Error('Duplicate held callback: ' + slot);
    const timer = nativeSetTimeout(() => {}, delay);
    h[slot] = { fn, delay, args, timer };
    note(kind, { timer, delay });
    return timer;
  };
  window.clearTimeout = function (timer) {
    if (h.held?.timer === timer || h.restartHeld?.timer === timer)
      note('clear-held-timer', { timer });
    return nativeClearTimeout(timer);
  };
  window.setTimeout = function (fn, delay, ...args) {
    if (delay === 350 && typeof fn === 'function' && fn.name === 'next') {
      if (fnSource.call(fn) !== expectedCallbackSource)
        throw new Error('Captured next is not the actual staged article callback');
      note('capture-actual-next', { source: fnSource.call(fn) });
      if (actualNext || secondary) return hold(fn, delay, args, 'restartHeld', 'hold-restart-next');
      actualNext = fn;
    }
    if (actualNext && fn === actualNext) {
      h.ordinal++;
      note('schedule-original-next', { ordinal: h.ordinal, delay });
      if (h.ordinal === 4) return hold(fn, delay, args, 'held', 'hold-fourth-next');
    }
    return nativeSetTimeout(fn, delay, ...args);
  };
  h.arm = (mode) => {
    if (!h.held || h.delivered) throw new Error('Fourth actual callback is not held exactly once');
    localStorage.setItem(firedKey, '1');
    note('arm', { mode });
    const deliver = (event) => {
      if (h.delivered) throw new Error('Duplicate actual callback delivery');
      h.delivered = true;
      note('deliver-original-next', {
        eventType: event?.type ?? null,
        trusted: event?.isTrusted ?? null,
      });
      h.held.fn(...h.held.args);
      note('original-next-returned');
    };
    if (mode === 'ordinary-timer-control' || mode === 'demanded-reader-while-queue-held')
      nativeSetTimeout(() => deliver(null), h.held.delay);
    else addEventListener('pagehide', deliver, { once: true });
  };
  h.replayRetained = () => {
    if (!h.held || !h.delivered) throw new Error('No original callback to replay');
    note('replay-retained-next');
    h.held.fn(...h.held.args);
    note('retained-next-returned');
  };
  h.releaseRestart = () => {
    if (!h.restartHeld) throw new Error('No actual restart callback is held');
    const held = h.restartHeld;
    note('release-restart-next');
    h.restartHeld = null;
    held.fn(...held.args);
  };
  h.tick = () => new Promise((done) => nativeSetTimeout(done, 80));
}

function installNativeDepartureProbe({ traceKey, mode }) {
  const nativeFetch = window.fetch;
  const nativeSetTimeout = window.setTimeout;
  const nativeClearTimeout = window.clearTimeout;
  const docId = crypto.randomUUID();
  const note = (kind, detail = {}) => {
    const event = {
      kind,
      docId,
      browserAt: Date.now(),
      nativeFetchUnchanged: window.fetch === nativeFetch,
      nativeTimersUnchanged:
        window.setTimeout === nativeSetTimeout && window.clearTimeout === nativeClearTimeout,
      ...detail,
    };
    const trace = JSON.parse(localStorage.getItem(traceKey) || '[]');
    trace.push(event);
    localStorage.setItem(traceKey, JSON.stringify(trace));
    console.debug('__ARTICLE_DEPARTURE__' + JSON.stringify(event));
  };
  window.__articleDepartureProbe = { docId, note };
  note('document-init', {
    mode,
    nativeFetchSource: Function.prototype.toString.call(nativeFetch),
    nativeSetTimeoutSource: Function.prototype.toString.call(nativeSetTimeout),
  });
  // Synchronous storage retains Chromium departure events whose console
  // notifications may disappear together with the old document's session.
  for (const name of ['beforeunload', 'pagehide', 'pageshow'])
    addEventListener(
      name,
      (event) => note(name, { trusted: event.isTrusted, persisted: event.persisted ?? null }),
      { capture: true },
    );
  addEventListener('unhandledrejection', (event) =>
    note('unhandledrejection', { message: String(event.reason?.message ?? event.reason) }),
  );
  addEventListener('error', (event) => note('window-error', { message: event.message }));
}

async function nativeDepartureCase(browser, engine, mode) {
  const delayed = mode === 'real-beforeunload-delayed-reload';
  const first = firstArticles[0];
  const second = firstArticles[1];
  const firstPath = '/data/articles/' + first.file;
  const secondPath = '/data/articles/' + second.file;
  const row = {
    engine,
    name: mode,
    mode,
    browserVersion: browser.version(),
    pass: false,
    events: [],
    serverEvents: [],
    nativeDeparture: true,
    nativeTimersUnmodified: true,
    documentRequests: 0,
    holdArticlePath: delayed ? null : firstPath,
    reloadDocumentDelayMs: delayed ? 600 : 0,
  };
  active = row;
  results.push(row);
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 1200 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const traceKey = `__article_departure_trace:${engine}:${mode}`;
  const observe = (kind, detail = {}) => row.events.push({ at: Date.now(), kind, ...detail });
  page.on('pageerror', (error) => observe('pageerror', failure(error)));
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('__ARTICLE_DEPARTURE__'))
      observe('probe', { event: JSON.parse(text.slice('__ARTICLE_DEPARTURE__'.length)) });
    else if (['warning', 'error'].includes(message.type()))
      observe('console', { type: message.type(), text });
  });
  page.on('request', (request) => observe('request', { url: request.url() }));
  page.on('response', (response) =>
    observe('response', { url: response.url(), status: response.status() }),
  );
  page.on('requestfinished', (request) => observe('requestfinished', { url: request.url() }));
  page.on('requestfailed', (request) =>
    observe('requestfailed', { url: request.url(), failure: request.failure() }),
  );
  await page.addInitScript(installNativeDepartureProbe, { traceKey, mode });
  const bodyPaths = () =>
    row.serverEvents
      .filter(
        (event) =>
          event.kind === 'request' &&
          event.path.startsWith('/data/articles/') &&
          !event.path.endsWith('/index.json'),
      )
      .map((event) => event.path);
  try {
    await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    const docId = await page.evaluate(() => window.__articleDepartureProbe.docId);
    if (delayed) {
      assert.deepEqual(bodyPaths(), [], 'The native first prefetch timer is still pending');
      observe('reload-start');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      assert.notEqual(await page.evaluate(() => window.__articleDepartureProbe.docId), docId);
      await page.waitForLoadState('networkidle');
    } else {
      const limit = Date.now() + 10000;
      while (!row.releaseHeldArticle && Date.now() < limit)
        await new Promise((done) => setTimeout(done, 10));
      assert(row.releaseHeldArticle, 'The first real HTTP response must be held');
      await page.locator(`.shelf-item[data-passage="${first.id}"] .shelf-open`).click();
      await page.waitForFunction(() => document.body.dataset.view === 'reader');
      assert.equal(await page.locator('#reader .tok').count(), 0);
      // The click supplies native user activation. This fixture-only listener
      // asks for the browser's real dismissal dialog, then is removed once.
      await page.evaluate(() =>
        addEventListener(
          'beforeunload',
          (event) => {
            event.preventDefault();
            event.returnValue = 'Synthetic navigation cancellation';
          },
          { once: true },
        ),
      );
      const dismissed = new Promise((done, reject) =>
        page.once('dialog', async (dialog) => {
          try {
            observe('beforeunload-dialog', { type: dialog.type() });
            assert.equal(dialog.type(), 'beforeunload');
            await dialog.dismiss();
            observe('beforeunload-dialog-dismissed');
            done();
          } catch (error) {
            reject(error);
          }
        }),
      );
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 3000 }).then(
        () => {
          row.cancelledReloadReturned = true;
        },
        (error) => {
          row.cancelledReloadError = error.message;
        },
      );
      await Promise.race([
        dismissed,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('No dismissed beforeunload dialog')), 5000),
        ),
      ]);
      assert.equal(await page.evaluate(() => window.__articleDepartureProbe.docId), docId);
      let trace = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || '[]'),
        traceKey,
      );
      assert(trace.some((event) => event.kind === 'beforeunload' && event.trusted));
      assert(!trace.some((event) => event.kind === 'pagehide'));
      assert.equal(
        row.heldArticleResponse.destroyed,
        false,
        'Cancelled navigation preserves the shared request',
      );
      row.releaseHeldArticle();
      await page.waitForFunction(() => document.querySelectorAll('#reader .tok').length > 10);
      row.sharedReaderTokens = await page.locator('#reader .tok').count();
      await new Promise((done) => setTimeout(done, 250));
      assert.deepEqual(
        bodyPaths(),
        [firstPath],
        'Shared reader completes once; warming remains paused',
      );
      await page.locator('#back').click();
      await page.locator(`.shelf-item[data-passage="${second.id}"] .shelf-open`).click();
      await page.waitForFunction(() => document.querySelectorAll('#reader .tok').length > 10);
      row.demandedReaderTokens = await page.locator('#reader .tok').count();
      await page.waitForLoadState('networkidle');
      assert.deepEqual(
        bodyPaths(),
        [firstPath, secondPath],
        'Fresh demanded reading remains available',
      );
    }
    row.trace = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || '[]'),
      traceKey,
    );
    assert(row.trace.every((event) => event.nativeFetchUnchanged && event.nativeTimersUnchanged));
    assert(
      row.trace
        .filter((event) => event.kind === 'document-init')
        .every(
          (event) =>
            event.nativeFetchSource.includes('[native code]') &&
            event.nativeSetTimeoutSource.includes('[native code]'),
        ),
    );
    const oldTrace = row.trace.filter((event) => event.docId === docId);
    const leaving = oldTrace.find((event) => event.kind === 'beforeunload' && event.trusted);
    assert(leaving);
    if (delayed) {
      const hidden = oldTrace.find((event) => event.kind === 'pagehide' && event.trusted);
      assert(hidden);
      assert(
        hidden.browserAt - leaving.browserAt >= 500,
        'Actual provisional navigation spans the native prefetch timer',
      );
      row.beforeunloadToPagehideMs = hidden.browserAt - leaving.browserAt;
      assert.deepEqual(
        row.events.filter(
          (event) =>
            event.kind === 'request' &&
            event.url.includes('/data/articles/') &&
            event.at >= leaving.browserAt &&
            event.at < hidden.browserAt,
        ),
        [],
        'No new body starts during provisional navigation',
      );
      assert.deepEqual(
        bodyPaths().slice(0, 4),
        firstArticles.map((article) => '/data/articles/' + article.file),
        'The new document resumes warming in the original order',
      );
    }
    assert.deepEqual(
      row.trace.filter((event) => ['unhandledrejection', 'window-error'].includes(event.kind)),
      [],
    );
    assert.deepEqual(
      row.events.filter((event) => event.kind === 'pageerror' || event.kind === 'console'),
      [],
      'No browser error or warning is filtered',
    );
    assert.deepEqual(
      row.events.filter(
        (event) => event.kind === 'request' && new URL(event.url).origin !== origin,
      ),
      [],
    );
    const screenshot = resolve(OUT, `${engine}-${mode}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    row.screenshot = { path: screenshot, sha256: sha(readFileSync(screenshot)) };
    row.pass = true;
  } catch (error) {
    row.error = failure(error);
    const screenshot = resolve(OUT, `${engine}-${mode}-failure.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).then(
      () => {
        row.failureScreenshot = { path: screenshot, sha256: sha(readFileSync(screenshot)) };
      },
      () => {},
    );
  } finally {
    row.releaseHeldArticle?.();
    await context.close();
    row.pass =
      row.pass &&
      !row.events.some((event) => event.kind === 'pageerror' || event.kind === 'console');
    delete row.releaseHeldArticle;
    delete row.heldArticleResponse;
    active = null;
    writeFileSync(resolve(OUT, `${engine}-${mode}.json`), JSON.stringify(row, null, 2) + '\n');
    console.log(
      `${row.pass ? 'PASS' : 'FAIL'} ${engine}: ${mode}${row.error ? ' — ' + row.error.message : ''}`,
    );
  }
}

let fatal = null;
try {
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch(
      engine === 'chromium'
        ? {
            executablePath: process.env.CHROMIUM_PATH || undefined,
            ignoreDefaultArgs: ['--disable-back-forward-cache'],
          }
        : {},
    );
    try {
      for (const mode of timerModes.filter((mode) => !filter || mode === filter)) {
        const row = {
          engine,
          name: mode,
          mode,
          browserVersion: browser.version(),
          pass: false,
          events: [],
          serverEvents: [],
        };
        active = row;
        results.push(row);
        const context = await browser.newContext({
          serviceWorkers: 'block',
          viewport: { width: 1280, height: 2400 },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const traceKey = `__article_prefetch_trace:${engine}:${mode}`;
        const firedKey = `__article_prefetch_fired:${engine}:${mode}`;
        page.on('pageerror', (error) => row.events.push({ kind: 'pageerror', ...failure(error) }));
        page.on('console', (message) => {
          const text = message.text();
          if (text.startsWith('__ARTICLE_PREFETCH__'))
            row.events.push({
              kind: 'probe',
              event: JSON.parse(text.slice('__ARTICLE_PREFETCH__'.length)),
            });
          else if (['warning', 'error'].includes(message.type()))
            row.events.push({ kind: 'console', type: message.type(), text });
        });
        page.on('request', (request) => row.events.push({ kind: 'request', url: request.url() }));
        page.on('requestfailed', (request) =>
          row.events.push({
            kind: 'requestfailed',
            url: request.url(),
            failure: request.failure(),
          }),
        );
        page.on('requestfinished', (request) =>
          row.events.push({ kind: 'requestfinished', url: request.url() }),
        );
        await page.addInitScript(installProbe, {
          expectedCallbackSource,
          traceKey,
          firedKey,
          mode,
        });
        let observer;
        try {
          await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
          await page.waitForFunction(
            () => document.body.dataset.ready === '1' && window.__articlePrefetchProbe?.held,
          );
          const docId = await page.evaluate(() => window.__articlePrefetchProbe.docId);
          const articleRequests = () =>
            row.events
              .filter(
                (event) =>
                  event.kind === 'request' &&
                  event.url.includes('/data/articles/') &&
                  !event.url.endsWith('/index.json'),
              )
              .map((event) => new URL(event.url).pathname);
          const targetRequests = () =>
            row.events.filter((event) => event.kind === 'request' && event.url === origin + target);
          assert.deepEqual(
            articleRequests(),
            predecessors,
            'Exactly three real body loads precede the held fourth callback',
          );
          for (const path of predecessors)
            assert(
              row.events.some(
                (event) => event.kind === 'requestfinished' && event.url === origin + path,
              ),
            );
          const before = await readAppRecordSnapshot(page);
          row.before = {
            docId,
            recordSha256: sha(JSON.stringify(before.record)),
            archiveSha256: sha(JSON.stringify(before.archive)),
          };
          if (mode === 'demanded-reader-while-queue-held') {
            await page
              .locator(`.shelf-item[data-passage="${firstArticles[3].id}"] .shelf-open`)
              .click();
            await page.waitForFunction(
              () =>
                document.body.dataset.view === 'reader' &&
                document.querySelectorAll('#reader .tok').length > 10,
            );
            assert.equal(
              targetRequests().length,
              1,
              'The requested reader loads while the queue remains held',
            );
            row.demandedReaderTokens = await page.locator('#reader .tok').count();
          }
          await page.evaluate((mode) => window.__articlePrefetchProbe.arm(mode), mode);
          if (mode === 'ordinary-timer-control' || mode === 'demanded-reader-while-queue-held') {
            await page.waitForFunction(() => window.__articlePrefetchProbe.delivered);
            await page.waitForLoadState('networkidle');
            assert.equal(
              targetRequests().length,
              1,
              'The background queue loads the target exactly once including a prior reader demand',
            );
          } else if (mode === 'real-pagehide-reload') {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(
              (old) =>
                window.__articlePrefetchProbe?.docId !== old &&
                window.__articlePrefetchProbe.restartHeld &&
                document.body.dataset.ready === '1',
              docId,
            );
          } else if (mode === 'real-pagehide-close') {
            await page.close({ runBeforeUnload: true });
            if (!page.isClosed()) await page.waitForEvent('close');
          } else {
            await page.goto(origin + '/__prefetch_probe__/inspect.html');
            await page.goBack({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(
              () =>
                document.body.dataset.ready === '1' && window.__articlePrefetchProbe?.restartHeld,
            );
            const returnedDoc = await page.evaluate(() => window.__articlePrefetchProbe.docId);
            row.historyReturn = returnedDoc === docId ? 'persisted-document' : 'new-document';
            if (returnedDoc === docId) {
              await page.evaluate(() => window.__articlePrefetchProbe.replayRetained());
              await page.evaluate(() => window.__articlePrefetchProbe.tick());
            }
          }
          if (page.isClosed()) {
            observer = await context.newPage();
            await observer.goto(origin + '/__prefetch_probe__/inspect.html');
          } else observer = page;
          row.traceBeforeRestart = await observer.evaluate(
            (key) => JSON.parse(localStorage.getItem(key) || '[]'),
            traceKey,
          );
          const oldTrace = row.traceBeforeRestart.filter((event) => event.docId === docId);
          const delivered = oldTrace.filter((event) => event.kind === 'deliver-original-next');
          assert.equal(delivered.length, 1);
          assert(oldTrace.every((event) => event.nativeFetchUnchanged));
          assert(
            oldTrace
              .find((event) => event.kind === 'document-init')
              .nativeFetchSource.includes('[native code]'),
          );
          if (mode.startsWith('real-pagehide')) {
            assert.equal(delivered[0].eventType, 'pagehide');
            assert.equal(delivered[0].trusted, true);
            assert(oldTrace.some((event) => event.kind === 'pagehide' && event.trusted));
            assert.equal(
              targetRequests().length,
              0,
              'Leaving or retained stale callbacks must not request a new body',
            );
            assert.equal(
              row.serverEvents.filter((event) => event.kind === 'request' && event.path === target)
                .length,
              0,
            );
            assert(
              oldTrace.some((event) => event.kind === 'clear-held-timer'),
              'Page departure must clear its actual held timer',
            );
            const after = await readAppRecordSnapshot(observer);
            assert.deepEqual(
              after.record,
              before.record,
              'Background shutdown preserves the committed learner record',
            );
            assert.deepEqual(
              after.archive,
              before.archive,
              'Background shutdown preserves the conversation archive',
            );
            row.recordPreserved = true;
            if (mode !== 'real-pagehide-close') {
              await page.evaluate(() => window.__articlePrefetchProbe.releaseRestart());
              await page.waitForLoadState('networkidle');
              assert.equal(
                targetRequests().length,
                1,
                'The returned page resumes article warming exactly once',
              );
            }
            if (row.historyReturn === 'persisted-document') {
              assert(
                oldTrace.some(
                  (event) => event.kind === 'pageshow' && event.persisted && event.trusted,
                ),
              );
              assert(oldTrace.some((event) => event.kind === 'replay-retained-next'));
            }
          }
          row.trace = await observer.evaluate(
            (key) => JSON.parse(localStorage.getItem(key) || '[]'),
            traceKey,
          );
          assert(row.trace.every((event) => event.nativeFetchUnchanged));
          assert.deepEqual(
            row.trace.filter((event) =>
              ['unhandledrejection', 'window-error'].includes(event.kind),
            ),
            [],
          );
          assert.deepEqual(
            row.events.filter((event) => event.kind === 'pageerror'),
            [],
            'No unhandled browser error',
          );
          assert.deepEqual(
            row.events.filter((event) => event.kind === 'console'),
            [],
            'No browser console warning or error',
          );
          assert.deepEqual(
            row.events.filter(
              (event) => event.kind === 'request' && new URL(event.url).origin !== origin,
            ),
            [],
          );
          row.pass = true;
        } catch (error) {
          row.error = failure(error);
        } finally {
          await context.close();
          active = null;
          writeFileSync(
            resolve(OUT, `${engine}-${mode}.json`),
            JSON.stringify(row, null, 2) + '\n',
          );
          console.log(
            `${row.pass ? 'PASS' : 'FAIL'} ${engine}: ${mode}${row.error ? ' — ' + row.error.message : ''}`,
          );
        }
      }
      for (const mode of nativeModes.filter((mode) => !filter || mode === filter))
        await nativeDepartureCase(browser, engine, mode);
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  fatal = failure(error);
} finally {
  await new Promise((done) => server.close(done));
  const receipt = {
    version: 1,
    suite: 'prefetch-lifecycle',
    mode: filter ? 'filtered' : 'full',
    startedAt,
    completedAt: new Date().toISOString(),
    artifactSha256: manifest.artifactSha256,
    site: SITE,
    verifierSha256,
    runtimePath,
    runtimeSha256: sha(runtime),
    runtimeOverridden: Boolean(runtimeOverride),
    callbackSourceSha256: sha(expectedCallbackSource),
    lifecycleSourceSha256: sha(lifecycleSource),
    target,
    predecessors,
    nativeFetchUnmodified: true,
    responseInterception: false,
    articleIdentities: firstArticles.map((article) => ({
      path: '/data/articles/' + article.file,
      sha256: sha(readFileSync(resolve(SITE, 'data/articles', article.file))),
    })),
    engines,
    browserVersions: Object.fromEntries(results.map((row) => [row.engine, row.browserVersion])),
    filter: filter || null,
    expectedContractCases: 13,
    contractResults,
    expectedBrowserCases: engines.length * (filter ? 1 : modes.length),
    results,
    fatal,
    errors: results.flatMap((row) =>
      row.events
        .filter((event) => event.kind === 'pageerror' || event.kind === 'console')
        .map((event) => ({ engine: row.engine, name: row.name, ...event })),
    ),
    externalRequests: results.flatMap((row) =>
      row.events
        .filter((event) => event.kind === 'request' && new URL(event.url).origin !== origin)
        .map((event) => ({ engine: row.engine, name: row.name, ...event })),
    ),
    limitations: [
      'Original timer cases deliberately deliver the actual callback at native pagehide. New beforeunload cases leave browser timers untouched and delay only actual HTTP delivery.',
      'Native fetch and article bytes stay intact. No error, warning or rejection is suppressed or filtered from raw evidence.',
      'A dismissed navigation leaves speculative warming paused in the current document until persisted pageshow; existing shared and new demanded reader loads remain available.',
      'VM contracts test explicit persisted lifecycle inputs. Only historyReturn=persisted-document proves actual browser BFCache restoration.',
      'The isolated browser has no authenticated account, live provider or physical-device acceptance.',
    ],
  };
  receipt.failures =
    contractResults.filter((row) => !row.pass).length +
    results.filter((row) => !row.pass).length +
    Number(Boolean(fatal));
  receipt.pass =
    receipt.failures === 0 &&
    contractResults.length === receipt.expectedContractCases &&
    results.length === receipt.expectedBrowserCases;
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (!receipt.pass) process.exitCode = 1;
}
