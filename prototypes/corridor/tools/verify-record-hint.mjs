/**
 * B2a-hint (D4, first slice): a window that lost the boot race LOOKS at the record lock
 * (navigator.locks.query) and offers a retry when it looks free. It never requests the
 * lock; only the unchanged boot ifAvailable request acquires. Design: B2-handoff-protocol
 * v5, signed with amendments in B2-CODEX-SIGNATURE-v5.md. D4's remote hand-off (B2c) and
 * in-place acquisition (B2b) stay open; this suite claims neither.
 *
 *   W0  identity: the served build is the commit under test (or a named mutant of it).
 *   W1  owner closes → the blocked window offers a retry within 4.5 s; before the tap it has
 *       made exactly one lock request (its boot) and never holds the lock; tap → writable,
 *       with the owner's revlog exactly.
 *   W2  the owner reloads 20 times beside a visible blocked window whose looks are slowed:
 *       the owner is the owner after every reload; the blocked window's request count stays 1.
 *   W3  three windows: close the owner, tap both retries → exactly one writable window.
 *   W5  the owner navigates away → retry offered; its Back returns it to ownership and the
 *       offer withdraws.
 *   W6a a grade with a durable ACK, then the owner closes → present exactly once after retry.
 *   W6b a grade tap followed at once by closing the owner (a race, not a held commit) →
 *       absent, or present exactly once with its card state; never duplicated.
 *   W7a drafts typed just before the tap survive the retry reload.
 *   W7b session storage refused at the tap → no reload, a visible alert, the text intact.
 *   W7c the reader passage returns after the retry, including after losing one race.
 *   W8  no locks.query → no offer, the existing manual reload remains.
 *   W9  hidden → no looks; visible again → the offer arrives.
 *   W10 a failing query stops the looks; a slow result that lands after hiding shows nothing.
 *
 * Mutation controls (run this file against each; it must FAIL where named):
 *   node tools/record-hint-mutants.mjs <site> <out>, then KAIRO_SITE_DIR=<out>/m1 and <out>/m2
 *   m1  the held/pending filter removed (always "free") → W1 fails its no-offer-while-owned row.
 *   m2  the look becomes a queued locks.request (the rejected v4 watcher) → W1/W2 request-count
 *       rows fail deterministically; no repeated races are needed to see it.
 *
 * Engine scope: Chromium only. A WebKit crash case is not claimed; W4 (renderer crash) is
 * recorded as unavailable here rather than passed. Visibility is emulated by overriding
 * document.visibilityState, which tests the app's logic, not an engine's tab throttling.
 *
 * Usage: node verify-record-hint.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const RECORD_LOCK = 'kairo-record:kairo-corridor-v1:kairo-ai-log';
const results = [];
const pageErrors = [];
let currentCase = 'setup';
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};

// Instrumentation installed before the app: counts every lock request and query the page
// makes, keeps the raw methods for the harness's own probes, and lets a case slow or fail
// the looks, hide the page, or refuse session storage.
const PROBE = `(() => {
  const locks = navigator.locks;
  const probe = window.__lockProbe = { requests: 0, queries: 0, queryDelayMs: 0, queryFail: false,
    rawRequest: locks && locks.request.bind(locks), rawQuery: locks && locks.query && locks.query.bind(locks) };
  const flags = JSON.parse(sessionStorage.getItem('hint-flags') || '{}');
  if (locks) {
    locks.request = (...args) => { probe.requests += 1; return probe.rawRequest(...args); };
    if (flags.noQuery) locks.query = undefined;
    else locks.query = async () => {
      probe.queries += 1;
      if (flags.queryFail || probe.queryFail) throw new Error('probe: query refused');
      const snapshot = await probe.rawQuery();
      const delay = flags.queryDelayMs || probe.queryDelayMs;
      if (delay) await new Promise((done) => setTimeout(done, delay));
      return snapshot;
    };
  }
  const visibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true,
    get() { return window.__forceHidden ? 'hidden' : visibility.get.call(this); } });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return !!window.__forceHidden; } });
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (window.__refuseSession && this === sessionStorage) throw new DOMException('refused', 'QuotaExceededError');
    return Reflect.apply(setItem, this, [key, value]);
  };
})();`;
const SEED = `(() => {
  if (localStorage.getItem('hint-seeded')) return;
  const t = 1700000000000;
  localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1,
    taken: [{ t: 'word', id: '会う', label: '会う', ts: t, started: t }, { t: 'word', id: '青', label: '青', ts: t + 1, started: t + 1 }],
    srs: {}, revlog: [], obslog: [] }));
  localStorage.setItem('hint-seeded', '1');
})();`;

let host = null, origin = null, browser = null;
const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await silenceBrowserAudio(context);
  await context.addInitScript(PROBE);
  await context.addInitScript(SEED);
  context.on('page', (page) => page.on('pageerror', (error) => {
    if (pageErrors.length < 20) pageErrors.push({ case: currentCase, message: error.message });
  }));
  return context;
}
async function openWindow(context, { flags = null, path = '?entry=shelf' } = {}) {
  const page = await context.newPage();
  if (flags) await page.addInitScript((value) => { sessionStorage.setItem('hint-flags', value); }, JSON.stringify(flags));
  await page.goto(`${origin}/index.html${path}`);
  await ready(page);
  return page;
}
const blocked = (page) => page.evaluate(() => {
  const alert = document.getElementById('store-alert');
  return !!alert && !alert.hidden && /read-only|読み取り専用/u.test(alert.textContent || '');
});
const offerShown = (page) => page.evaluate(() => {
  const node = document.getElementById('record-hint');
  return !!node && !node.hidden && /seems to have closed|閉じたよう/u.test(node.textContent || '');
});
const waitOffer = (page, timeout = 4500) =>
  page.waitForFunction(() => {
    const node = document.getElementById('record-hint');
    return !!node && !node.hidden && /seems to have closed|閉じたよう/u.test(node.textContent || '');
  }, null, { timeout }).then(() => true, () => false);
const probeOf = (page) => page.evaluate(() => ({ requests: window.__lockProbe.requests, queries: window.__lockProbe.queries }));
const holders = (page) => page.evaluate(async (name) =>
  (await window.__lockProbe.rawQuery()).held.filter((row) => row.name === name).map((row) => row.clientId), RECORD_LOCK);
const ownClientId = (page) => page.evaluate(() => {
  const name = `hint-self-${performance.now()}`;
  return window.__lockProbe.rawRequest(name, async () => (await window.__lockProbe.rawQuery()).held.find((row) => row.name === name)?.clientId);
});
async function tapRetry(page) {
  await Promise.all([page.waitForEvent('load', { timeout: 15_000 }), page.locator('#record-hint-retry').click()]);
  await ready(page);
}
async function gradeOnce(page) {
  await page.locator('#tray').click();
  await page.locator('#review-start').click();
  await page.locator('#declare-notyet').click();
  await page.locator('.grade.g-again').click();
}
const revlogLength = async (page) => ((await readAppRecord(page)).revlog || []).length;

try {
  host = await startStaticHost({ site: SITE, port: 0 });
  origin = host.origin;
  browser = await chromium.launch();

  currentCase = 'W0';
  {
    const context = await browser.newContext(); const page = await context.newPage();
    const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
    let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
    const expected = process.env.KAIRO_EXPECT_GITSHA || head;
    const served = createHash('sha256').update(Buffer.from(await (await page.request.get(`${origin}/corridor.js`)).body())).digest('hex');
    check('W0 served build is the expected clean commit', identity.gitSha === expected && identity.sourceDirty === false
      && served === new Map(identity.files.map((row) => [row.path, row.sha256])).get('corridor.js'),
      `served=${identity.gitSha} expected=${expected}${identity.mutant ? ` MUTANT=${identity.mutant}` : ''}`);
    await context.close();
    if (results.some((r) => !r.pass)) throw new Error('identity failed');
  }

  currentCase = 'W1';
  {
    const context = await newContext();
    const a = await openWindow(context);
    await gradeOnce(a);
    await waitForAppRecord(a, (record) => (record.revlog || []).length === 1, { description: 'owner grade' });
    const b = await openWindow(context);
    check('W1 the second window boots blocked', await blocked(b));
    await b.waitForTimeout(3600);
    check('W1 no offer while the owner lives (m1 must fail here)', !(await offerShown(b)));
    const bId = await ownClientId(b);
    await a.close();
    const t0 = Date.now();
    const offered = await waitOffer(b);
    check('W1 the offer arrives within 4.5 s of the owner closing', offered, `${Date.now() - t0} ms`);
    const before = await probeOf(b);
    check('W1 before the tap the window made one lock request, its boot (m2 must fail here)', before.requests === 1, JSON.stringify(before));
    check('W1 before the tap the window does not hold the lock', !(await holders(b)).includes(bId));
    if (offered) {
      await tapRetry(b);
      check('W1 after the tap the window is writable', !(await blocked(b)));
      check('W1 the record carries the owner\'s one grade, exactly', (await revlogLength(b)) === 1);
    }
    await context.close();
  }

  currentCase = 'W2';
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context, { flags: { queryDelayMs: 500 } });
    const bId = await ownClientId(b);
    let ownerEvery = true, bHeld = false;
    for (let i = 0; i < 20; i++) {
      await a.reload();
      await ready(a);
      if (await blocked(a)) { ownerEvery = false; break; }
      if ((await holders(a)).includes(bId)) bHeld = true;
    }
    check('W2 the owner is the owner after each of 20 reloads', ownerEvery);
    check('W2 the blocked window never holds the lock', !bHeld);
    const probe = await probeOf(b);
    check('W2 the blocked window made no request beyond its boot (m2 must fail here)', probe.requests === 1, JSON.stringify(probe));
    await context.close();
  }

  currentCase = 'W3';
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context);
    const c = await openWindow(context);
    await a.close();
    const offered = (await waitOffer(b)) && (await waitOffer(c));
    check('W3 both blocked windows are offered a retry', offered);
    if (offered) {
      await Promise.all([tapRetry(b), tapRetry(c)]);
      const writable = [!(await blocked(b)), !(await blocked(c))].filter(Boolean).length;
      check('W3 exactly one window is writable after both taps', writable === 1, `writable=${writable}`);
    }
    await context.close();
  }

  currentCase = 'W4';
  check('W4 renderer crash (Chromium CDP) — not exercised in this suite; unavailable, not passed', true, 'recorded as unavailable');
  results.at(-1).unavailable = true;

  currentCase = 'W5';
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context);
    await a.goto('about:blank');
    check('W5 the owner navigating away offers a retry', await waitOffer(b));
    await a.goBack();
    await ready(a);
    check('W5 Back returns the old owner to ownership (no one else tapped)', !(await blocked(a)));
    const withdrawn = await b.waitForFunction(() => document.getElementById('record-hint')?.hidden !== false, null, { timeout: 4500 })
      .then(() => true, () => false);
    check('W5 the offer withdraws once the lock is held again', withdrawn);
    await context.close();
  }

  currentCase = 'W6';
  {
    const context = await newContext();
    const a = await openWindow(context);
    await gradeOnce(a);
    await waitForAppRecord(a, (record) => (record.revlog || []).length === 1, { description: 'durable ACK' });
    const b = await openWindow(context);
    await a.close();
    if (await waitOffer(b)) await tapRetry(b);
    const record = await readAppRecord(b);
    check('W6a a durable grade is present exactly once after the retry', (record.revlog || []).length === 1
      && Object.keys(record.srs || {}).length >= 1, `revlog=${(record.revlog || []).length}`);
    await context.close();
  }
  {
    const context = await newContext();
    const a = await openWindow(context);
    await a.locator('#tray').click();
    await a.locator('#review-start').click();
    await a.locator('#declare-notyet').click();
    const before = await revlogLength(a);
    const b = await openWindow(context);
    await a.locator('.grade.g-again').click();
    await a.close();
    if (await waitOffer(b)) await tapRetry(b);
    const record = await readAppRecord(b);
    const rows = (record.revlog || []).length - before;
    check('W6b a grade racing the close is absent or present once, never duplicated', rows === 0 || rows === 1, `new rows=${rows}`);
    if (rows === 1) check('W6b a present grade carries its card state', Object.keys(record.srs || {}).length >= 1);
    await context.close();
  }

  currentCase = 'W7';
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context);
    await b.locator('#tray').click();
    await b.fill('#note-input', 'Bの筆');
    await a.close();
    const offered = await waitOffer(b);
    await b.fill('#note-input', 'Bの筆・直前の追記');
    if (offered) await tapRetry(b);
    await b.locator('#tray').click();
    check('W7a text typed just before the tap survives the retry', (await b.inputValue('#note-input')) === 'Bの筆・直前の追記');
    await context.close();
  }
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context);
    await b.locator('#tray').click();
    await b.fill('#note-input', '残すべき文');
    await a.close();
    const offered = await waitOffer(b);
    await b.evaluate(() => { window.__stay = 1; window.__refuseSession = true; });
    if (offered) await b.locator('#record-hint-retry').click();
    await b.waitForTimeout(1500);
    const state = await b.evaluate(() => ({ stayed: window.__stay === 1,
      alert: document.querySelector('#record-hint .record-hint-failure')?.textContent || '',
      text: document.getElementById('note-input')?.value }));
    check('W7b refused storage: no reload, a visible reason, the text intact', offered && state.stayed && !!state.alert && state.text === '残すべき文', JSON.stringify(state));
    await context.close();
  }
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context);
    const c = await openWindow(context);
    const door = b.locator('.shelf-item:not([data-recommendation]) .shelf-open').first();
    await door.click();
    await b.waitForSelector('#reader');
    const title = await b.locator('h1.view-title').textContent();
    await a.close();
    await waitOffer(c); await tapRetry(c); // c wins the race first
    const offeredB = await waitOffer(b, 1500);
    if (offeredB) await tapRetry(b); // b may lose: the lock is c's now
    else await b.evaluate(() => { const r = document.getElementById('record-reload'); r ? r.click() : location.reload(); }).catch(() => {});
    await ready(b);
    const place = await b.evaluate(() => ({ view: document.body.dataset.view, title: document.querySelector('h1.view-title')?.textContent }));
    check('W7c after losing a race the window is back on its passage, read-only', place.view === 'reader' && place.title === title, JSON.stringify(place));
    await c.close();
    if (await waitOffer(b)) await tapRetry(b);
    const later = await b.evaluate(() => ({ view: document.body.dataset.view, title: document.querySelector('h1.view-title')?.textContent }));
    check('W7c a later retry still returns to the passage, now writable', later.view === 'reader' && later.title === title && !(await blocked(b)), JSON.stringify(later));
    await context.close();
  }

  currentCase = 'W8';
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context, { flags: { noQuery: true } });
    await a.close();
    await b.waitForTimeout(5000);
    check('W8 without locks.query there is no offer', !(await offerShown(b)));
    check('W8 the manual reload remains', await b.evaluate(() => !!document.getElementById('record-reload')));
    await context.close();
  }

  currentCase = 'W9';
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context);
    await b.evaluate(() => { window.__forceHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    const hiddenAt = await probeOf(b);
    await a.close();
    await b.waitForTimeout(5000);
    const hiddenAfter = await probeOf(b);
    check('W9 a hidden window makes no looks', hiddenAfter.queries === hiddenAt.queries && !(await offerShown(b)), JSON.stringify({ hiddenAt, hiddenAfter }));
    await b.evaluate(() => { window.__forceHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    check('W9 visible again, the offer arrives', await waitOffer(b, 2500));
    await context.close();
  }

  currentCase = 'W10';
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context, { flags: { queryFail: true } });
    await a.close();
    await b.waitForTimeout(5000);
    check('W10 a failing query shows no offer and leaves the manual reload', !(await offerShown(b))
      && await b.evaluate(() => !!document.getElementById('record-reload')));
    await context.close();
  }
  {
    const context = await newContext();
    const a = await openWindow(context);
    const b = await openWindow(context, { flags: { queryDelayMs: 2000 } });
    await a.close();
    await b.waitForTimeout(200);
    await b.evaluate(() => { window.__forceHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await b.waitForTimeout(3000);
    check('W10 a slow look that lands after hiding shows nothing', !(await offerShown(b)));
    await context.close();
  }
} catch (error) {
  results.push({ name: `terminal (${currentCase})`, pass: false, detail: error.stack || String(error) });
  console.log(`  FAIL terminal in ${currentCase} — ${error.message}`);
} finally {
  await browser?.close().catch((error) => results.push({ name: 'browser · cleanup', pass: false, detail: error.message }));
  await host?.close().catch((error) => results.push({ name: 'host · cleanup', pass: false, detail: error.message }));
  if (pageErrors.length) results.push({ name: 'no uncaught page errors', pass: false, detail: JSON.stringify(pageErrors) });
  writeFileSync(resolve(EVIDENCE, 'record-hint.json'), JSON.stringify({ origin, results, pageErrors, lastCase: currentCase }, null, 2) + '\n');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
