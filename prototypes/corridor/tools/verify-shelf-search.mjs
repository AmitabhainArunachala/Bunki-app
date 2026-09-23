/** Real shelf input, current-query results, and delayed real worker replies.
 * Local browser timing is diagnostic evidence; it never certifies an iPhone.
 * A missed strict 100ms lookup budget is a failing row and a nonzero exit. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const OUT = resolveCorridorEvidence();
const SITE = resolveCorridorSite();
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all'
  ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((name) => ['chromium', 'webkit'].includes(name)));
const filter = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const sourceSha256 = sha(readFileSync(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((request, response) => {
  try {
    const file = resolve(SITE, decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html');
    assert(!relative(SITE, file).startsWith('..') && statSync(file).isFile());
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  } catch { response.writeHead(404); response.end('not found'); }
});
const base = await new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}`)));

function installObserver() {
  const f = window.__shelfSearchTest = { inputs: [], dom: [], workers: [], holdQuery: null, held: null, releases: [] };
  const requests = new WeakMap();
  const nativeAdd = Worker.prototype.addEventListener;
  const nativePost = Worker.prototype.postMessage;
  const cap = (list, row) => { list.push(row); if (list.length > 3000) list.splice(0, 1000); };
  const describe = (message, request) => ({
    id: message.id, generation: message.generation, ok: message.ok,
    type: request?.type, query: request?.query ?? null,
    resultQuery: message.result?.performance?.query ?? null,
    results: message.result?.results?.map((item) => ({ id: item.result?.id, seq: item.result?.seq })) ?? [],
  });
  // Wrap delivery to the registered listener. Hold the actual native
  // MessageEvent, then deliver that same event/data after a real later edit.
  // No dictionary rows, response IDs, generations, or app closures are replaced.
  Worker.prototype.addEventListener = function (type, listener, options) {
    if (type === 'message' && listener) {
      const deliver = (event, identity) => {
        cap(f.workers, { event: 'delivered', at: performance.now(), ...identity });
        return typeof listener === 'function' ? listener.call(this, event) : listener.handleEvent(event);
      };
      return nativeAdd.call(this, type, (event) => {
        const message = event.data || {};
        const request = requests.get(this)?.get(message.id);
        const identity = describe(message, request);
        cap(f.workers, { event: 'response', at: performance.now(), trusted: event.isTrusted, ...identity });
        if (request?.type === 'search' && request.query === f.holdQuery && !f.held) {
          f.holdQuery = null;
          f.held = { deliver, event, identity, payload: JSON.stringify(message), nativeTrusted: event.isTrusted };
          cap(f.workers, { event: 'held', at: performance.now(), ...identity });
          return;
        }
        return deliver(event, identity);
      }, options);
    }
    return nativeAdd.call(this, type, listener, options);
  };
  Worker.prototype.postMessage = function (message, ...rest) {
    let map = requests.get(this);
    if (!map) { map = new Map(); requests.set(this, map); }
    const request = { id: message?.id, generation: message?.generation, type: message?.type, query: message?.context?.q ?? null };
    map.set(request.id, request);
    cap(f.workers, { event: 'request', at: performance.now(), ...request });
    return nativePost.call(this, message, ...rest);
  };
  f.release = () => {
    if (!f.held) throw new Error('No actual worker response is held');
    const held = f.held;
    f.held = null;
    const unchanged = JSON.stringify(held.event.data) === held.payload;
    if (!unchanged) throw new Error('Held dictionary response payload changed');
    held.deliver(held.event, held.identity);
    const release = { ...held.identity, nativeTrusted: held.nativeTrusted, unchanged, at: performance.now(), payload: held.payload };
    f.releases.push(release);
    return release;
  };
  f.snapshot = () => {
    const input = document.getElementById('search');
    const body = document.getElementById('shelf-body');
    return {
      at: performance.now(), query: input?.value ?? null,
      renderedQuery: body?.dataset.renderToken?.split('\u0000')[0] ?? null,
      token: body?.dataset.renderToken ?? null,
      ids: [...document.querySelectorAll('#search-results [data-result]')].map((row) => row.dataset.result),
      shelfCount: document.querySelectorAll('.shelf-item').length,
      sameInput: input === f.inputNode,
      focused: document.activeElement === input,
      selection: input ? [input.selectionStart, input.selectionEnd] : null,
      view: document.body.dataset.view,
      opening: !!document.querySelector('#shelf-body .dictionary-opening'),
    };
  };
  document.addEventListener('input', (event) => {
    if (event.target.id !== 'search') return;
    cap(f.inputs, { at: performance.now(), query: event.target.value, trusted: event.isTrusted, inputType: event.inputType });
  }, true);
  new MutationObserver(() => {
    if (!document.getElementById('shelf-body')) return;
    const snapshot = f.snapshot();
    const prior = f.dom[f.dom.length - 1];
    if (prior?.token === snapshot.token && JSON.stringify(prior.ids) === JSON.stringify(snapshot.ids) && prior.query === snapshot.query) return;
    cap(f.dom, snapshot);
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-render-token'] });
}

async function boot(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.addInitScript(installObserver);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/index.html?entry=shelf`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && document.querySelectorAll('.shelf-item').length >= 24);
  await page.locator('#search').focus();
  await page.evaluate(() => { window.__shelfSearchTest.inputNode = document.getElementById('search'); });
  await page.waitForFunction(() => window.__KAIRO_DICTIONARY_PERF__?.mode === 'worker', null, { timeout: 30000 });
  return { context, page, errors };
}
const snap = (page) => page.evaluate(() => window.__shelfSearchTest.snapshot());
const match = (ids, wanted) => ids.some((id) => id === wanted || id.startsWith(`${wanted}:`));
async function settled(page, query, wanted = null) {
  await page.waitForFunction(({ query, wanted }) => {
    const s = window.__shelfSearchTest.snapshot();
    return s.query === query && s.renderedQuery === query && (wanted
      ? s.ids.some((id) => id === wanted || id.startsWith(`${wanted}:`))
      : query === '' && s.ids.length === 0 && s.shelfCount >= 24);
  }, { query, wanted }, { timeout: 10000 });
  return snap(page);
}
async function clear(page) {
  await page.locator('#search').press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  return settled(page, '');
}
async function type(page, text) { await page.keyboard.type(text, { delay: 20 }); }
async function resetTrace(page) {
  await page.evaluate(() => { window.__shelfSearchTest.inputs = []; window.__shelfSearchTest.dom = []; });
}
async function release(page) {
  const data = await page.evaluate(() => window.__shelfSearchTest.release());
  const payloadSha256 = sha(data.payload);
  delete data.payload;
  assert(data.nativeTrusted && data.unchanged && data.ok, 'Release must contain an unchanged successful native worker response');
  assert(data.id > 0 && data.generation > 0 && data.query === data.resultQuery);
  return { ...data, payloadSha256 };
}
async function holdQuery(page, query = 'kaisai') {
  await page.evaluate((q) => { window.__shelfSearchTest.holdQuery = q; }, query);
  await type(page, query);
  await settled(page, query, 'word:開催');
  await page.waitForFunction(() => !!window.__shelfSearchTest.held, null, { timeout: 30000 });
  return page.evaluate(() => ({ ...window.__shelfSearchTest.held.identity, nativeTrusted: window.__shelfSearchTest.held.nativeTrusted }));
}
function assertCurrent(snapshot, query, wanted) {
  assert.equal(snapshot.query, query);
  assert.equal(snapshot.renderedQuery, query);
  assert(snapshot.focused, 'Typing/backspace must retain focus on the existing field');
  assert(snapshot.sameInput, 'Typing/backspace must preserve the same input element');
  assert.deepEqual(snapshot.selection, [query.length, query.length]);
  if (wanted) assert(match(snapshot.ids, wanted));
  else assert(snapshot.ids.length === 0 && snapshot.shelfCount >= 24);
}
async function trace(page) {
  return page.evaluate(() => ({ inputs: window.__shelfSearchTest.inputs, dom: window.__shelfSearchTest.dom, workers: window.__shelfSearchTest.workers }));
}

const cases = [
  ['shelf-latest-query-core-result-under-100ms', async (page, row) => {
    for (const [query, wanted] of [['kaisai', 'word:開催'], ['peninsula', 'word:半島']]) {
      await type(page, query); await settled(page, query, wanted);
      await page.waitForFunction((q) => window.__KAIRO_DICTIONARY_PERF__?.lastSearch?.query === q, query, { timeout: 30000 });
      await clear(page);
    }
    await resetTrace(page);
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const [query, wanted] = i % 2 ? ['peninsula', 'word:半島'] : ['kaisai', 'word:開催'];
      await type(page, query);
      assertCurrent(await settled(page, query, wanted), query, wanted);
      const elapsed = await page.evaluate(({ query, wanted }) => {
        const f = window.__shelfSearchTest;
        const input = f.inputs.findLast((entry) => entry.query === query);
        const answer = f.dom.find((entry) => entry.at >= input.at && entry.query === query && entry.renderedQuery === query &&
          entry.ids.some((id) => id === wanted || id.startsWith(`${wanted}:`)));
        if (!answer) throw new Error('No observed current-query DOM answer');
        return { query, elapsedMs: answer.at - input.at, inputTrusted: input.trusted, inputAt: input.at, answerAt: answer.at };
      }, { query, wanted });
      samples.push(elapsed);
      await clear(page);
    }
    const sorted = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
    const p95Ms = sorted[Math.ceil(sorted.length * .95) - 1];
    row.measurements = { samples, count: samples.length, p95Ms, medianMs: sorted[4], minimumMs: sorted[0], targetMs: 100, comparator: '<', debounceIncluded: true };
    assert(samples.every((sample) => sample.inputTrusted), 'Latency samples must start at actual keyboard input events');
    assert(p95Ms < 100, `Local user-visible lookup p95 ${p95Ms.toFixed(1)}ms misses strict <100ms target`);
  }],
  ['shelf-rapid-edit-backspace-keeps-latest-results', async (page, row) => {
    await resetTrace(page);
    await type(page, 'kaisaiX'); await page.keyboard.press('Backspace');
    const first = await settled(page, 'kaisai', 'word:開催');
    assertCurrent(first, 'kaisai', 'word:開催');
    await page.locator('#search').press('ControlOrMeta+A'); await type(page, 'peninsula');
    const second = await settled(page, 'peninsula', 'word:半島');
    assertCurrent(second, 'peninsula', 'word:半島');
    for (let i = 0; i < 'peninsula'.length; i++) { await page.keyboard.press('Backspace'); await page.waitForTimeout(20); }
    const empty = await settled(page, '');
    assertCurrent(empty, '');
    await page.waitForTimeout(800);
    const after = await snap(page);
    assertCurrent(after, '');
    const history = await trace(page);
    assert(history.dom.filter((entry) => entry.at >= empty.at).every((entry) => entry.renderedQuery === '' && entry.ids.length === 0), 'No prior query may repaint after clear');
    await type(page, 'peninsula'); await settled(page, 'peninsula', 'word:半島');
    await page.locator('[data-result="word:半島"], [data-result^="word:半島:"]').first().click();
    await page.waitForSelector('#sheet[data-node="word:半島"]');
    row.observations = { first, second, empty, after, openedEntry: await page.locator('#sheet').getAttribute('data-node') };
  }],
  ['shelf-delayed-worker-reply-cannot-replace-new-query', async (page, row) => {
    row.held = await holdQuery(page);
    await page.locator('#search').press('ControlOrMeta+A'); await type(page, 'peninsula');
    const latest = await settled(page, 'peninsula', 'word:半島');
    assertCurrent(latest, 'peninsula', 'word:半島');
    await resetTrace(page);
    row.released = await release(page);
    await page.waitForFunction(() => window.__KAIRO_DICTIONARY_PERF__?.lastSearch?.query === 'peninsula', null, { timeout: 30000 });
    const after = await snap(page);
    assertCurrent(after, 'peninsula', 'word:半島');
    const history = await trace(page);
    assert(history.dom.every((entry) => entry.query === 'peninsula' && entry.renderedQuery === 'peninsula'), 'Late reply must never repaint the prior query');
    assert(!after.ids.some((id) => id === 'word:開催' || id.startsWith('word:開催:')), 'Old query answer must not enter latest results');
    assert.equal(history.workers.filter((event) => event.event === 'request' && event.type === 'search').map((event) => event.query).join(','), 'kaisai,peninsula');
    row.observations = { latest, after, lastSearch: await page.evaluate(() => window.__KAIRO_DICTIONARY_PERF__.lastSearch) };
  }],
  ['shelf-cleared-or-departed-query-ignores-late-worker', async (page, row, browser) => {
    row.clearHeld = await holdQuery(page);
    const empty = await clear(page); assertCurrent(empty, '');
    await resetTrace(page);
    row.clearRelease = await release(page);
    await page.waitForTimeout(800);
    const afterClear = await snap(page); assertCurrent(afterClear, '');
    const clearedTrace = await trace(page);
    assert(clearedTrace.dom.every((entry) => entry.renderedQuery === '' && entry.ids.length === 0));
    assert(!afterClear.opening, 'A late reply may not restore the old pending state');
    const next = await boot(browser);
    try {
      row.departureHeld = await holdQuery(next.page);
      // Clearing restores a real navigation door while the old response stays held.
      await clear(next.page);
      await next.page.locator('#levels-link').click();
      await next.page.waitForFunction(() => document.body.dataset.view === 'levels');
      const destination = await next.page.evaluate(() => {
        window.__shelfSearchTest.destinationFocus = document.activeElement;
        window.__shelfSearchTest.destinationMain = document.querySelector('main');
        return { view: document.body.dataset.view, title: document.querySelector('main .view-title')?.textContent, focus: { tag: document.activeElement?.tagName, id: document.activeElement?.id } };
      });
      row.departureRelease = await release(next.page);
      await next.page.waitForTimeout(800);
      const afterDeparture = await next.page.evaluate(() => ({ view: document.body.dataset.view, title: document.querySelector('main .view-title')?.textContent, sameFocus: document.activeElement === window.__shelfSearchTest.destinationFocus, sameMain: document.querySelector('main') === window.__shelfSearchTest.destinationMain, results: document.querySelectorAll('[data-result]').length, search: !!document.getElementById('search') }));
      assert.equal(afterDeparture.view, destination.view); assert.equal(afterDeparture.title, destination.title); assert(afterDeparture.sameFocus && afterDeparture.sameMain);
      assert.equal(afterDeparture.results, 0); assert.equal(afterDeparture.search, false); assert.deepEqual(next.errors, []);
      row.observations = { empty, afterClear, destination, afterDeparture, departureTrace: await trace(next.page) };
    } finally { await next.context.close(); }
  }],
];

const selected = cases.filter(([name]) => !filter || name === filter);
assert(selected.length, 'Unknown case filter');
const results = [];
const browserVersions = {};
try {
  for (const engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    browserVersions[engine] = browser.version();
    try {
      for (const [name, run] of selected) {
        const row = { engine, name, pass: false };
        let fixture;
        try {
          fixture = await boot(browser);
          await run(fixture.page, row, browser);
          assert.deepEqual(fixture.errors, [], 'No page errors');
          row.pass = true;
        } catch (error) { row.error = error.stack || String(error); }
        finally {
          if (fixture) {
            row.trace = await trace(fixture.page).catch((error) => ({ error: error.message }));
            row.pageErrors = fixture.errors;
            await fixture.page.screenshot({ path: resolve(OUT, `${engine}-${name}.png`) }).catch(() => {});
            await fixture.context.close();
          }
        }
        results.push(row);
        console.log(`${row.pass ? 'PASS' : 'FAIL'} ${engine} ${name}${row.error ? `: ${row.error.split('\n')[0]}` : ''}`);
      }
    } finally { await browser.close(); }
  }
} finally {
  server.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'shelf-search-report.json'), JSON.stringify({
    schemaVersion: 1, artifact: manifest.artifactSha256, sourceAssetSha256: manifest.sourceAssetSha256,
    site: SITE, sourceSha256, fixtureSha256: sha(installObserver.toString()), engines, browserVersions,
    methodology: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, typingDelayMs: 20, latencySamplesPerEngine: 10,
      latencyStart: 'captured trusted final keyboard input event', latencyEnd: 'MutationObserver sees current query and expected actual result identity',
      target: 'p95 <100ms; all UI debounce included; both warm-up queries finish their real worker batches before sampling', workerFault: 'queue delivery to the registered worker listener; release actual native MessageEvent with unchanged payload, request ID and generation',
      profile: 'headless desktop browsers; no-store uncompressed loopback; no native-device or input-to-present claim' },
    results, pass: results.length === selected.length * engines.length && results.every((row) => row.pass),
  }, null, 2) + '\n');
}
process.exitCode = results.length === selected.length * engines.length && results.every((row) => row.pass) ? 0 : 1;
