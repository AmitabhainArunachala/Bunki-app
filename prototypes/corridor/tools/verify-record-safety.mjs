/** K · his record is kept, and a stop is never silent (slice K, 2026-10-16). Rendered app, 390×844, every
 * learner byte synthetic; no operator profile is opened.
 *   P1 persist() is asked once per boot, only after his first gesture (a spy stands in for the browser)
 *   P2 Me → Settings says what the browser answered — protected / not protected — in both layouts
 *   P3 a quota error on the ACTIVE path (a real IndexedDB put, the repo's armRecordWriteFailure) pauses saving AND
 *      the record band stands — opaque, one line, on top, with Export now — in Today · Read · Learn · Words · Me;
 *      it cannot be dismissed while saving is paused (an aborted transaction does the same)
 *   P4 the band's Export now downloads the record as last saved (the durable record, byte for byte)
 *   P5 the LEGACY path failing at first boot (localStorage quota) shows the band from boot
 *   P6 a record past half the ceiling shows its share on the Settings line; past 80 % Today carries one note
 *   P7 a healthy boot shows no band
 * Negative control: `--control hide-band` hides the band with one injected rule; P3 must then fail.
 * Claim boundary: the spy proves the ask and the line's honesty, not that iOS Safari grants persistence; the quota
 * error is injected after real native puts, not a physically full disk; contrast is computed on the rendered pair. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecordSnapshot } from './record-test-support.mjs';

const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const ENGINES = process.env.KAIRO_BROWSER === 'all' ? ['webkit', 'chromium'] : [process.env.KAIRO_BROWSER || 'webkit'];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const CONTROL = process.argv.includes('--control') ? process.argv[process.argv.indexOf('--control') + 1] : null;
assert(CONTROL === null || CONTROL === 'hide-band', `unknown control ${CONTROL}`);
const FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const verifierSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    if (!file.startsWith(`${SITE}/`) || !statSync(file).isFile()) throw new Error('missing');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const errors = [];
const externalRequests = [];
const browserVersions = {};
const startedAt = new Date().toISOString();
const ROOMS = [['today', 'tray'], ['read', 'shelf'], ['learn', 'dojo'], ['words', 'search'], ['me', 'me']];
const BAND_LINE = 'Your learning is not being saved';
// the export's own bound (corridor.js IMPORT_MAX_NODES): the share the line and the note report
const CEILING_VALUES = 500000;

function values(value) {
  let count = 0;
  const stack = [value];
  while (stack.length) {
    const item = stack.pop();
    count += 1;
    if (Array.isArray(item)) for (const child of item) stack.push(child);
    else if (item && typeof item === 'object') for (const key of Object.keys(item)) stack.push(item[key]);
  }
  return count;
}
/** A seeded record whose tap rows bring record + archive to `target` values (each tap row is six). */
function grownRecord(record, archive, target) {
  const base = values({ ...record, obslog: [] }) + values(archive);
  const rows = Math.max(0, Math.ceil((target - base) / 6));
  const obslog = Array.from({ length: rows }, (_, i) => [1760000000000 + i * 1000, 'tap', `word:語${i % 4000}`, 1 + (i % 3), `article-${i % 300}`]);
  return { ...record, obslog };
}
async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 }); }
async function settle(page) {
  await page.waitForFunction(() => !document.documentElement.dataset.roomTransition, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(350);
}
async function safety(page) { return page.evaluate(() => window.__KAIRO_RECORD_SAFETY__.state()); }
async function room(page, tab, view) {
  const button = page.locator(`#tab-${tab}`);
  if (await page.evaluate(() => document.body.dataset.view) !== view) {
    await button.click();
    await page.waitForFunction((v) => document.body.dataset.view === v, view, { timeout: 10000 });
  }
  await settle(page);
}
async function openSettings(page) {
  await page.locator('#tab-me, #tab-progress').first().click();
  await settle(page);
  await page.locator('#me-settings').click();
  await page.waitForFunction(() => document.body.dataset.view === 'settings', null, { timeout: 10000 });
  await settle(page);
}
/** Everything the learner sees of the band: drawn, opaque, one line, on top, beside the bar, legible, its key. */
async function band(page) {
  return page.evaluate(() => {
    const node = document.getElementById('record-band');
    if (!node) return { present: false };
    const cs = getComputedStyle(node); const r = node.getBoundingClientRect();
    const drawn = !node.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.99 && r.width > 0 && r.height > 0;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = (fill) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = fill; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data]; };
    const lum = (c) => { const [a, b, d] = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * a + 0.7152 * b + 0.0722 * d; };
    const ratio = (p, q) => { const [hi, lo] = [lum(p), lum(q)].sort((m, n) => n - m); return (hi + 0.05) / (lo + 0.05); };
    const line = node.querySelector('.record-band-line');
    const go = node.querySelector('#record-band-export');
    // paint order, not hit-testing: lift pointer-events for the one probe
    const top = (el) => {
      if (!el) return false;
      const b = el.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(0, b.left + Math.min(b.width / 2, 24))); const y = Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2));
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit) || node === hit);
    };
    const chrome = [...document.querySelectorAll('.chrome, .nav-symbol, .zen-exit, .zen-more, .focus-hud')]
      .map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0).reduce((edge, b) => Math.max(edge, b.bottom), 0);
    const alert = document.getElementById('store-alert');
    const alertRect = alert && !alert.hidden && getComputedStyle(alert).display !== 'none' ? alert.getBoundingClientRect() : null;
    const background = rgba(cs.backgroundColor);
    return { present: true, drawn, rect: [r.left, r.top, r.width, r.height].map(Math.round), chromeBottom: Math.round(chrome),
      opaque: background[3] === 255, background: cs.backgroundColor, color: cs.color,
      contrast: Math.round(ratio(rgba(cs.color), background) * 100) / 100,
      line: line ? { text: line.textContent, rects: line.getClientRects().length, height: Math.round(line.getBoundingClientRect().height),
        clipped: line.scrollWidth > line.clientWidth + 1, onTop: top(line) } : null,
      export: go ? { text: go.textContent.trim(), onTop: top(go), height: Math.round(go.getBoundingClientRect().height),
        contrast: Math.round(ratio(rgba(getComputedStyle(go).color), background) * 100) / 100 } : null,
      closeControls: node.querySelectorAll('button').length - (go ? 1 : 0),
      alertBelow: alertRect ? alertRect.top >= r.bottom - 1 : null,
      bodyMarked: document.body.classList.contains('record-not-saving') };
  });
}
function assertBand(state, where, { exportable = true } = {}) {
  assert.equal(state.present && state.drawn, true, `${where}: the record band is drawn`);
  assert.equal(state.opaque, true, `${where}: the band is opaque (${state.background})`);
  assert.ok(state.rect[1] >= state.chromeBottom - 1 && state.rect[1] <= state.chromeBottom + 1, `${where}: the band stands flush under the bar (${state.rect[1]} vs ${state.chromeBottom})`);
  assert.equal(state.rect[0], 0, `${where}: full width`); assert.equal(state.rect[2], 390, `${where}: full width`);
  assert.ok(state.rect[3] <= 60, `${where}: one line high (${state.rect[3]} px)`);
  assert.equal(state.line?.text, BAND_LINE, `${where}: the band says the learning is not being saved`);
  assert.equal(state.line.rects, 1, `${where}: the line is one line`); assert.equal(state.line.clipped, false, `${where}: the line is not cut`);
  assert.equal(state.line.onTop, true, `${where}: nothing paints over the band`);
  assert.ok(state.contrast >= 4.5, `${where}: band words read at ≥ 4.5:1 (${state.contrast})`);
  assert.equal(state.closeControls, 0, `${where}: there is nothing that dismisses it`);
  if (exportable) {
    assert.equal(state.export?.text, 'Export now', `${where}: Export now is offered`);
    assert.equal(state.export.onTop, true, `${where}: Export now is reachable`);
    assert.ok(state.export.height >= 44, `${where}: Export now is a 44 px target`);
    assert.ok(state.export.contrast >= 4.5, `${where}: Export now reads at ≥ 4.5:1 (${state.export.contrast})`);
  }
  assert.notEqual(state.alertBelow, false, `${where}: the alert's reason hangs below the band, never over it`);
  assert.equal(state.bodyMarked, true, `${where}: the page knows saving is paused`);
}
// The spy sits on StorageManager.prototype: WebKit may hand out a fresh navigator.storage wrapper after a collection,
// and an own property on the old wrapper would silently vanish (measured: the tap fired, the instance spy saw nothing)
const keepSpy = (answer) => `(() => {
  const spy = window.__keepSpy = { persistCalls: 0, persistedCalls: 0, answer: ${answer ? 'true' : 'false'}, granted: false, firstAt: null };
  const persist = () => { spy.persistCalls += 1; spy.firstAt ??= performance.now(); spy.granted = spy.answer; return Promise.resolve(spy.answer); };
  const persisted = () => { spy.persistedCalls += 1; return Promise.resolve(spy.granted); };
  const target = typeof StorageManager === 'function' ? StorageManager.prototype : null;
  if (target) for (const [name, value] of [['persist', persist], ['persisted', persisted]])
    Object.defineProperty(target, name, { configurable: true, writable: true, value });
  else Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist, persisted } });
})();`;
// the control hides the band with one rule once the document has a head (an init script runs before it exists)
const hideBand = `(() => { const add = () => { const s = document.createElement('style'); s.textContent = '#record-band { display: none !important; }';
  document.head.append(s); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add, { once: true }); })();`;

try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit })[engine].launch();
    browserVersions[engine] = browser.version();
    const directory = resolve(OUT, engine); mkdirSync(directory, { recursive: true });
    const test = async (name, body, { init = [], layout = null } = {}) => {
      if (FILTER && FILTER !== name) return;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        externalRequests.push({ engine, origin: url.origin }); return route.abort();
      });
      for (const script of [...init, ...(CONTROL === 'hide-band' ? [hideBand] : [])]) await context.addInitScript(script);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push({ engine, name, message: error.message }));
      const began = Date.now();
      try {
        if (layout) {
          await page.goto(`${origin}/build-identity.json`);
          await page.evaluate((value) => localStorage.setItem('kairo-layout', value), layout);
        }
        await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
        await ready(page);
        const detail = await body({ page, directory, context });
        results.push({ engine, name, pass: true, elapsedMs: Date.now() - began, ...(detail ? { detail } : {}) });
      } catch (error) {
        results.push({ engine, name, pass: false, error: String(error.stack || error), elapsedMs: Date.now() - began });
        await page.screenshot({ path: resolve(directory, `${name}-failure.png`) }).catch(() => {});
      } finally { await context.close(); }
      console.log(`${engine} ${name}: ${results.at(-1).pass ? 'PASS' : 'FAIL'}`);
      if (!results.at(-1).pass) console.error(results.at(-1).error);
    };
    try {
      // P1 · P2 · P7 — the ask, its answer, and a healthy record with no band
      for (const layout of ['current', 'places']) for (const answer of [true, false]) {
        await test(`persist-after-first-gesture-${answer ? 'granted' : 'refused'}-${layout}`, async ({ page, directory }) => {
          await page.waitForTimeout(1500);
          const before = await page.evaluate(() => ({ ...window.__keepSpy }));
          assert.equal(before.persistCalls, 0, 'nothing is asked before he touches the app');
          assert.ok(before.persistedCalls >= 1, 'boot reads whether the site is already kept');
          assert.equal((await band(page)).drawn, false, 'a healthy record shows no band');
          assert.equal((await safety(page)).notSaving, false);
          await page.locator('#tab-me, #tab-progress').first().tap();
          await page.waitForFunction(() => window.__keepSpy.persistCalls === 1, null, { timeout: 5000 });
          await settle(page);
          await page.locator('#me-settings').tap();
          await page.waitForFunction(() => document.body.dataset.view === 'settings');
          await settle(page);
          assert.equal(await page.evaluate(() => window.__keepSpy.persistCalls), 1, 'asked once per boot, not per gesture');
          const line = page.locator('#record-kept');
          await line.waitFor({ state: 'visible' });
          const expected = answer ? 'Saved on this device: protected' : 'Saved on this device: not protected — Export keeps a copy';
          assert.equal((await line.textContent()).trim(), expected);
          assert.equal(await line.getAttribute('data-kept'), answer ? 'yes' : 'no');
          assert.equal((await safety(page)).keep.persisted, answer);
          if (layout === 'places') assert.equal(await page.locator('#settings-record #record-kept').count(), 1, 'among the five places the line stands in Backup');
          await line.evaluate((node) => node.scrollIntoView({ block: 'center' }));
          await page.screenshot({ path: resolve(directory, `me-line-${answer ? 'protected' : 'not-protected'}-${layout}.png`) });
          return { expected };
        }, { init: [keepSpy(answer)], layout });
      }
      // P3 · P4 — the active path: a real IndexedDB put fails; the band stands in all five rooms, and its Export keeps a copy
      for (const mode of ['quota', 'abort']) await test(`${mode}-pauses-saving-and-the-band-stands-in-every-room`, async ({ page, directory }) => {
        await room(page, 'today', 'tray');
        const durable = await readAppRecordSnapshot(page);
        await armRecordWriteFailure(page, mode);
        await page.fill('#note-input', `A note that cannot be saved (${mode}).`);
        await page.click('#note-send');
        await page.waitForFunction(() => window.__KAIRO_RECORD_SAFETY__.state().storeReadOnly === true, null, { timeout: 10000 });
        assert.ok((await clearRecordWriteFailure(page)).fired > 0, 'the native write fault fired');
        const state = await safety(page);
        assert.equal(state.storeReadOnly, true, 'the failed write sets storeReadOnly');
        assert.equal(state.notSaving, true); assert.equal(state.exportable, true, 'a copy can still be read');
        const seen = {};
        for (const [tab, view] of ROOMS) {
          await room(page, tab, view);
          const shown = await band(page);
          assertBand(shown, `${mode} · ${tab}`);
          seen[tab] = { rect: shown.rect, contrast: shown.contrast };
          if (mode === 'quota') await page.screenshot({ path: resolve(directory, `band-${tab}.png`) });
        }
        // it cannot be dismissed: Escape, a tap on it, and a room change leave it standing
        await page.keyboard.press('Escape');
        await page.locator('#record-band .record-band-line').tap();
        await room(page, 'read', 'shelf');
        assertBand(await band(page), `${mode} · after Escape, a tap and a room change`);
        if (mode === 'quota') {
          // P4 · Export now, from the band in Read: the record as last saved, byte for byte
          const download = page.waitForEvent('download', { timeout: 20000 });
          await page.locator('#record-band-export').tap();
          const file = await download;
          const path = resolve(directory, 'band-export.json');
          await file.saveAs(path);
          const backup = JSON.parse(readFileSync(path, 'utf8'));
          assert.equal(backup.format, 'kairo-backup');
          const portable = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => !['ai', 'aiEvidence', 'recordGeneration'].includes(key)));
          assert.deepEqual(backup.record, portable(durable.record), 'the copy is the durable record');
          assert.ok(!(backup.record.obslog || []).some((row) => String(row[3] || '').includes('cannot be saved')), 'the unsaved note is not claimed');
          await page.waitForFunction(() => /as last saved/.test(document.getElementById('record-portability-status')?.textContent || ''));
          assertBand(await band(page), `${mode} · after Export now`);
          seen.export = { filename: file.suggestedFilename(), revision: durable.revision };
        }
        assert.deepEqual((await readAppRecordSnapshot(page)).record, durable.record, 'the record on disk is unchanged');
        return seen;
      });
      // P5 — the legacy path: the first boot's empty legacy record cannot be written
      await test('legacy-first-boot-failure-shows-the-band-from-boot', async ({ page, directory }) => {
        assert.equal(await page.evaluate(() => window.__kLegacyFault || 0) > 0, true, 'the legacy write fault fired');
        const state = await safety(page);
        assert.equal(state.storeReadOnly, true); assert.equal(state.exportable, false, 'no recovered record, no copy offered');
        for (const [tab, view] of ROOMS) {
          await room(page, tab, view);
          assertBand(await band(page), `legacy · ${tab}`, { exportable: false });
        }
        await page.screenshot({ path: resolve(directory, 'band-legacy-first-boot.png') });
      }, { init: [`(() => { const native = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
        if (this === window.localStorage && key === 'kairo-corridor-v1') { window.__kLegacyFault = (window.__kLegacyFault || 0) + 1;
          throw new DOMException('Synthetic legacy quota', 'QuotaExceededError'); } return native.call(this, key, value); }; })();`] });
      // P6 — the share on the line past half the ceiling, and Today's one note past 80 %
      for (const target of [0.52, 0.82]) await test(`record-at-${Math.round(target * 100)}-percent`, async ({ page, directory }) => {
        const initial = await readAppRecordSnapshot(page);
        const record = grownRecord(initial.record, initial.archive, Math.round(target * CEILING_VALUES));
        await restoreAppFixture(page, record);
        await page.waitForFunction(() => !!window.__KAIRO_RECORD_SAFETY__.state().size, null, { timeout: 30000 });
        const stored = await readAppRecordSnapshot(page);
        const expectedValues = values(stored.record) + values(stored.archive);
        const size = (await safety(page)).size;
        assert.equal(size.values, expectedValues, 'the measure counts the stored record and archive as the export does');
        const percent = Math.floor((size.values / CEILING_VALUES) * 100);
        assert.ok(percent >= 50, `seeded past half (${percent} %)`);
        if (target < 0.8) {
          await openSettings(page);
          const line = page.locator('#record-kept');
          await line.waitFor({ state: 'visible' });
          assert.match(await line.textContent(), new RegExp(`^Saved on this device: (protected|not protected — Export keeps a copy) · ${percent} % full$`));
          await line.evaluate((node) => node.scrollIntoView({ block: 'center' }));
          await page.screenshot({ path: resolve(directory, 'me-line-share.png') });
          await room(page, 'today', 'tray');
          assert.equal(await page.locator('#record-size-nudge').count(), 0, 'below 80 % Today asks for nothing');
        } else {
          await room(page, 'today', 'tray');
          const note = page.locator('#record-size-nudge');
          await note.waitFor({ state: 'attached' });
          assert.equal((await note.textContent()).trim(), `Your record is ${percent} % full. Keep a copy while one file can hold it.`);
          assert.equal(await page.locator('#app main .store-nudge').count(), 1, 'one quiet note, not two');
          await note.evaluate((node) => node.scrollIntoView({ block: 'center' }));
          await page.screenshot({ path: resolve(directory, 'today-size-note.png') });
        }
        assert.equal((await band(page)).drawn, false, 'a large but healthy record shows no band');
        return { values: size.values, percent };
      });
    } finally { await browser.close(); }
  }
} finally {
  await new Promise((done) => server.close(done));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify({ suite: 'record-safety', version: 1, control: CONTROL,
    artifactSha256: manifest.artifactSha256, gitSha: manifest.gitSha, verifierSha256, engines: ENGINES, browserVersions, startedAt,
    completedAt: new Date().toISOString(), results, errors, externalRequests,
    pass: results.length > 0 && results.every((row) => row.pass) && !errors.length && !externalRequests.length,
    limitations: ['The persist() spy proves the ask and the honesty of the line, not that a real browser grants persistence.',
      'The quota error is injected after real native IndexedDB puts (armRecordWriteFailure), not a physically full disk.',
      'Headless WebKit stands in for iOS Safari; eviction itself is not observable here.'] }, null, 2));
}
assert(results.length > 0 && results.every((row) => row.pass), 'Record safety cases failed');
assert.deepEqual(errors, [], 'page errors'); assert.deepEqual(externalRequests, [], 'external requests');
console.log(`record-safety: ${results.length} cases PASS${CONTROL ? ` (control ${CONTROL} — expected to fail)` : ''}`);
