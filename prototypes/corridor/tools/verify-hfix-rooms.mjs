#!/usr/bin/env node
/** Hfix-1B · the rooms' own rows, walked in real browsers against a built site: WebKit (the referee) and Chromium.
 *
 *   T  item 11 (H0-5, H-kaku-04, G-13) · the tutor's doors. With no tutor set up on this device none is drawn; with one set
 *      up each returns. Covers the reading room's "ask the tutor to write one", the sentence card's Ask the tutor, the hold
 *      strip's "Ask the tutor about the word" and the word page's Ask the tutor. Saving the sentence stays in both; with a
 *      tutor set up nothing is sent to it unasked.
 *   B  item 15 (G-10, Grok's round-1 walk) · a settled deck back: the last line of what the answer says ends at or above
 *      the grade bar's top. Checked at 320×568, 390×844 and 430×932, on the first three cards of a sitting.
 *   R  item 13 (H0-4) · the rest pass of the H0 walk: Today, Me, Settings, the tutor's page, the report sheet, Speak, a word
 *      looked up, Guided and a mock in study mode. It logs no console error and no page error, and gets no same-origin
 *      response of 400 or more.
 *   S  item 8 (H0-2, H-hokusai-07, H-sumi-09) · Settings shows no frame time and offers no Layout; the week's roughest
 *      moment is in the report sheet's Details; at the end of its scroll the last of Settings sits clear above the tab bar.
 *   F  item 3 · the deck front's foot band is a real element: a point on passage text under it lands on the band (what it
 *      covers is covered, for a tap and for the contrast sweep), and a tap on it turns the card in its right half only.
 *
 * Usage:
 *   KAIRO_SITE_DIR=<built site> KAIRO_EVIDENCE_DIR=~/.dharma/… KAIRO_BROWSER=all|webkit|chromium \
 *     node prototypes/corridor/tools/verify-hfix-rooms.mjs
 *   HFIX_CASES=T,B runs only those cases: a partial run exits 3 when green, never an acceptance.
 *
 * Negative control: the base build (09c9239d) must fail each case's new rows:
 * - T: the four doors drawn with no tutor;
 * - B: the note under the bar at 320×568;
 * - R: the report sheet's /api/config 404;
 * - S: Settings' frame time and Layout;
 * - F: no band element (the base drew the band as the study's ::after, which a point and a tap passed through).
 *
 * Claim boundary: headless engines at phone viewports with touch; not the iPhone itself.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfDoor } from './shelf-tools-support.mjs';
import { DEVICE_TUTOR, setUpDeviceTutorForContext } from './tutor-fixture-support.mjs';

const ALL = ['T', 'B', 'R', 'S', 'F'];
const CASES = (process.env.HFIX_CASES || ALL.join(',')).split(',').map((name) => name.trim()).filter(Boolean);
for (const name of CASES) if (!ALL.includes(name)) throw new Error(`HFIX_CASES: unknown case ${name}`);
const ENGINES = process.env.KAIRO_BROWSER === 'webkit' ? { webkit } : process.env.KAIRO_BROWSER === 'chromium' ? { chromium } : { webkit, chromium };
const out = resolveCorridorEvidence();
const shots = join(out, 'shots');
mkdirSync(shots, { recursive: true });
const host = await startCorridorDev(0);
const ORIGIN = host.origin;

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function session(browserType, { width = 390, height = 844, world = 'hokusai', tutor = false, init = null } = {}) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', reducedMotion: 'no-preference' });
  await silenceBrowserAudio(context);
  await context.addInitScript((id) => { try { if (localStorage.getItem('kairo-theme') === null) localStorage.setItem('kairo-theme', id); } catch { /* none */ } }, world);
  if (tutor) await setUpDeviceTutorForContext(context);
  if (init) await context.addInitScript(init.fn, init.arg);
  const seen = { external: [], console: [], pageErrors: [], bad: [] };
  // nothing leaves the site: every other origin is refused and named
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url === ORIGIN || url.startsWith(`${ORIGIN}/`)) return route.continue();
    seen.external.push(url.slice(0, 160));
    return route.abort();
  });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') seen.console.push(`${message.text().slice(0, 200)} @ ${message.location()?.url || ''}`); });
  page.on('pageerror', (error) => seen.pageErrors.push(String(error?.message || error).slice(0, 200)));
  page.on('response', (response) => { if (response.status() >= 400 && response.url().startsWith(ORIGIN)) seen.bad.push(`${response.status()} ${response.url().slice(ORIGIN.length)}`); });
  return { browser, context, page, seen, close: () => browser.close() };
}
async function settle(page, ms = 600) {
  await sleep(ms);
  await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' &&
    a.effect?.getComputedTiming?.().iterations !== Infinity).length === 0, null, { timeout: 4000 }).catch(() => {});
  await page.evaluate(async () => { try { await document.fonts.ready; } catch { /* none */ } }).catch(() => {});
  await sleep(150);
}
async function boot(page, query = '?entry=shelf&ui=bi') {
  await page.goto(`${ORIGIN}/index.html${query}`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 60_000 });
  await settle(page, 700);
}
const waitView = (page, views, timeout = 15_000) => page.waitForFunction((list) => list.includes(document.body?.dataset.view), views, { timeout });
async function tab(page, name, views) {
  await page.locator(`#tab-${name}`).click();
  await waitView(page, views);
  await settle(page, 600);
}
/** A finger held on a word: CDP touch in Chromium, the touch pointer events WebKit's own finger sends otherwise. */
async function holdOn(page, engine, locator, ms = 760) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(220);
  const box = await locator.boundingBox();
  if (!box) throw new Error('the held word is not on the glass');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (engine === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 5, radiusY: 5, force: 1 }] });
    await sleep(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  const fire = (type) => page.evaluate(({ type, x, y }) => {
    const target = type === 'pointerdown' ? document.elementFromPoint(x, y) : window.__hfixHoldTarget;
    window.__hfixHoldTarget = target;
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'touch',
      isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerdown' ? 1 : 0, pressure: type === 'pointerdown' ? 0.5 : 0 }));
  }, { type, x, y });
  await fire('pointerdown');
  await sleep(ms);
  await fire('pointerup');
}

/* ------------------------------------------------------------------------------------------------------------------ T */
async function tutorDoors(engine, browserType, tutor) {
  const label = `${engine} · ${tutor ? 'a tutor set up' : 'no tutor set up'}`;
  const s = await session(browserType, { tutor });
  const { page } = s;
  const got = {};
  try {
    // the reading room
    await boot(page);
    await openShelfDoor(page, '#airead-link');
    await page.locator('#airead-connect, #airead-make').first().waitFor({ timeout: 15_000 });
    await settle(page, 400);
    got.room = { make: await page.locator('#airead-make').count(), connect: await page.locator('#airead-connect').count() };
    // a story: the sentence card, then the hold strip, then the word page it opens
    await boot(page);
    await page.locator('[data-passage="bunki-read-n3-rule-of-72"]').first().click();
    await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20_000 });
    await settle(page, 900);
    const word = page.locator('#reader .tok.content').nth(4);
    await word.scrollIntoViewIfNeeded();
    await word.click();
    await page.waitForFunction(() => !!document.getElementById('mini') || !!document.querySelector('#reader .tok[data-ladder-rung="reading"]'), null, { timeout: 8000 });
    if (!(await page.locator('#mini').count())) await word.click();
    await page.locator('#mini').waitFor({ timeout: 8000 });
    await page.locator('#mini-sentence-open').click();
    await page.locator('.mini-sentence-choices').waitFor({ timeout: 8000 });
    await settle(page, 400);
    got.card = await page.evaluate(() => [...document.querySelectorAll('.mini-sentence-choices button')].map((b) => b.id));
    await page.screenshot({ path: join(shots, `${engine}-T-${tutor ? 'tutor' : 'none'}-card.png`) });
    await page.keyboard.press('Escape'); await settle(page, 300);
    await page.keyboard.press('Escape'); await settle(page, 300);
    await holdOn(page, engine, page.locator('#reader .tok.content').nth(6));
    await page.locator('#seal-strip').waitFor({ timeout: 6000 });
    await settle(page, 300);
    got.strip = await page.evaluate(() => [...document.querySelectorAll('#seal-strip [data-strip-action]')].filter((n) => !n.hidden).map((n) => n.dataset.stripAction));
    await page.screenshot({ path: join(shots, `${engine}-T-${tutor ? 'tutor' : 'none'}-strip.png`) });
    await page.locator('#seal-strip [data-strip-action="entry"]').click();
    await page.locator('#sheet').waitFor({ timeout: 10_000 });
    await settle(page, 700);
    got.page = { ask: await page.locator('#sheet .teacher-discuss').count(), save: await page.locator('#sheet .teacher-save').count() };
  } catch (error) {
    check(`T · ${label} · the walk ran to its end`, false, String(error?.message || error).split('\n')[0]);
  }
  const ask = tutor ? 1 : 0;
  check(`T · ${label} · the reading room ${tutor ? 'offers' : 'draws no'} "ask the tutor to write one"${tutor ? '' : ', only its door to set one up'}`,
    got.room && got.room.make === ask && (tutor || got.room.connect === 1), got.room || 'not reached');
  check(`T · ${label} · the sentence card ${tutor ? 'offers' : 'draws no'} Ask the tutor; Practice it stays`,
    Array.isArray(got.card) && JSON.stringify(got.card) === JSON.stringify(tutor ? ['reader-teacher', 'reader-sentence-practice'] : ['reader-sentence-practice']), got.card || 'not reached');
  check(`T · ${label} · the hold strip's acts are ${tutor ? 'remove, entry, sentence, copy and ask-tutor' : 'remove, entry, sentence and copy'}`,
    Array.isArray(got.strip) && got.strip.join(',') === (tutor ? 'remove,entry,sentence,copy,ask-tutor' : 'remove,entry,sentence,copy'), got.strip || 'not reached');
  check(`T · ${label} · the word page ${tutor ? 'offers' : 'draws no'} Ask the tutor; Save this sentence stays`,
    got.page && got.page.ask === ask && got.page.save === 1, got.page || 'not reached');
  const toTutor = s.seen.external.filter((url) => url.startsWith(DEVICE_TUTOR.credential.origin));
  check(`T · ${label} · nothing is sent to a tutor unasked; no page error`, toTutor.length === 0 && s.seen.pageErrors.length === 0,
    { toTutor, pageErrors: s.seen.pageErrors });
  await s.close();
}

/* ------------------------------------------------------------------------------------------------------------------ B */
const BACK_FACTS = () => {
  const bar = document.querySelector('.kp-grades')?.getBoundingClientRect();
  const answer = document.querySelector('#kp-card .kp-answer');
  if (!bar || !answer) return null;
  // what the answer says: every part before its folds (mount.js answerSaid), its last line box
  const parts = [...answer.children].filter((n) => !n.classList.contains('kp-folds') && !n.classList.contains('kp-ladder') && n.getClientRects().length);
  const last = parts.at(-1);
  const range = document.createRange();
  range.selectNodeContents(last);
  const lines = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  const lastLine = lines.length ? Math.max(...lines.map((r) => r.bottom)) : last.getBoundingClientRect().bottom;
  return { word: answer.querySelector('.kp-word, .kp-term')?.textContent.trim().slice(0, 12) || '', part: last.className.slice(0, 40),
    lastLine: Math.round(lastLine * 10) / 10, barTop: Math.round(bar.top * 10) / 10, scrollY: Math.round(scrollY) };
};
async function settledBack(engine, browserType, [width, height]) {
  const label = `${engine} · ${width}×${height}`;
  const s = await session(browserType, { width, height });
  const { page } = s;
  const cards = [];
  try {
    await boot(page);
    await tab(page, 'learn', ['dojo', 'tests']);
    const begin = page.getByRole('button', { name: /Begin .*cards?/u }).first();
    await begin.waitFor({ timeout: 10_000 });
    await begin.click();
    for (let k = 0; k < 3; k++) {
      await page.locator('#kp-reveal').waitFor({ timeout: 15_000 });
      await settle(page, 600);
      await page.locator('#kp-reveal').click();
      await page.locator('.kp-grades').first().waitFor({ timeout: 10_000 });
      await settle(page, 900);
      // settled: the page has stopped moving
      let facts = await page.evaluate(BACK_FACTS);
      for (let i = 0; i < 10; i++) {
        await sleep(200);
        const again = await page.evaluate(BACK_FACTS);
        if (again && facts && again.scrollY === facts.scrollY && again.lastLine === facts.lastLine) { facts = again; break; }
        facts = again;
      }
      cards.push(facts);
      if (k === 0) await page.screenshot({ path: join(shots, `${engine}-B-${width}x${height}-back.png`) });
      await page.locator('#kp-grade-good').click();
      await settle(page, 500);
    }
  } catch (error) {
    check(`B · ${label} · the sitting ran through three cards`, false, String(error?.message || error).split('\n')[0]);
  }
  check(`B · ${label} · on a settled back the last line of what the answer says ends at or above the grade bar's top (three cards)`,
    cards.length === 3 && cards.every((c) => c && c.lastLine <= c.barTop + 0.5), cards);
  await s.close();
}

/* ------------------------------------------------------------------------------------------------------------------ R */
async function restPass(engine, browserType, [width, height, world]) {
  const label = `${engine} · ${world} ${width}×${height}`;
  const s = await session(browserType, { width, height, world });
  const { page } = s;
  const steps = [];
  const step = async (name, body) => {
    const before = { console: s.seen.console.length, bad: s.seen.bad.length };
    try { await body(); await settle(page, 700); steps.push({ name, ok: true }); } catch (error) {
      steps.push({ name, ok: false, error: String(error?.message || error).split('\n')[0].slice(0, 160) });
    }
    const at = steps.at(-1);
    at.console = s.seen.console.slice(before.console);
    at.bad = s.seen.bad.slice(before.bad);
  };
  await step('Today', () => boot(page, '?room=tray&ui=bi'));
  await step('Me', () => tab(page, 'me', ['me']));
  await step('Settings', async () => { await page.locator('#me-settings').click(); await waitView(page, ['settings']); });
  await step('Tutor', async () => { await page.locator('#settings-tutor').click(); await waitView(page, ['ai']); });
  await step('report sheet', async () => {
    await tab(page, 'me', ['me']);
    await page.locator('#bunki-report-bug').click();
    await page.locator('#br-actual').waitFor({ timeout: 10_000 });
    await settle(page, 1500);
    await page.locator('.br-sheet .br-close').click();
  });
  await step('Speak', async () => {
    await tab(page, 'learn', ['dojo', 'tests']);
    await page.locator('[data-study-door="speak"]').click();
    await waitView(page, ['speak']);
    await settle(page, 1500);
  });
  await step('a word looked up', async () => {
    await boot(page);
    await page.locator('#chrome-search').click();
    await page.locator('#nav-search-input').fill('猫');
    await page.locator('.nav-search-row').first().waitFor({ timeout: 15_000 });
    await page.locator('.nav-search-row').first().click();
    await page.locator('#sheet').waitFor({ timeout: 15_000 });
  });
  await step('Guided', async () => {
    await boot(page);
    await tab(page, 'learn', ['dojo', 'tests']);
    await page.locator('[data-study-door="guided"]').click();
    await waitView(page, ['guided']);
    await page.locator('.guided-room').waitFor({ timeout: 20_000 });
  });
  await step('a mock in study mode', async () => {
    await boot(page);
    await tab(page, 'learn', ['dojo', 'tests']);
    await page.locator('[data-study-door="mock"]').click();
    await page.locator('[data-exam-level="N5"]').first().click();
    await page.locator('[data-exam-start]').first().click();
    await page.locator('#exam-practice-start').click();
    await page.locator('.exam-prompt').waitFor({ timeout: 20_000 });
  });
  const failed = steps.filter((x) => !x.ok);
  check(`R · ${label} · the rest pass walked all nine rooms`, failed.length === 0, failed);
  const noisy = steps.filter((x) => x.console.length || x.bad.length).map((x) => ({ step: x.name, console: x.console, bad: x.bad }));
  check(`R · ${label} · no console error and no same-origin response of 400 or more in any room`, noisy.length === 0 && s.seen.console.length === 0 && s.seen.bad.length === 0, noisy);
  check(`R · ${label} · no page error`, s.seen.pageErrors.length === 0, s.seen.pageErrors);
  await s.close();
}

/* ------------------------------------------------------------------------------------------------------------------ S */
// one of the week's roughest moves on this device, as the frame sampler writes it (corridor.js FRAMES_STORE)
const SEED_FRAME = { fn: () => { try { if (localStorage.getItem('kairo-frames') === null) localStorage.setItem('kairo-frames', JSON.stringify([[Date.now() - 60_000, 'room', 'shelf → me', 267, 3]])); } catch { /* none */ } }, arg: null };
async function settingsFoot(engine, browserType, [width, height]) {
  const label = `${engine} · ${width}×${height}`;
  const s = await session(browserType, { width, height, init: SEED_FRAME });
  const { page } = s;
  let facts = null, details = null;
  try {
    await boot(page);
    await tab(page, 'me', ['me']);
    await page.locator('#me-settings').click();
    await waitView(page, ['settings']);
    await settle(page, 700);
    const text = await page.locator('#app > main').innerText();
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await settle(page, 700);
    facts = await page.evaluate(() => {
      const tabs = document.getElementById('primary-tabs')?.getBoundingClientRect();
      // the page's own content and its foot (the report line under it), everything a learner reads or presses
      let bottom = -Infinity, what = '';
      for (const node of document.querySelectorAll('#app > main *, #app > .report-line-page, #app > .report-line-page *')) {
        if (!node.getClientRects().length) continue;
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'contents') continue;
        const ink = [...node.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) || node.matches('button, input, select, textarea, summary, a');
        if (!ink) continue;
        const r = node.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom > bottom) { bottom = r.bottom; what = `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''} "${node.textContent.trim().slice(0, 30)}"`; }
      }
      return { tabsTop: tabs ? Math.round(tabs.top * 10) / 10 : null, lastBottom: Math.round(bottom * 10) / 10, what, atEnd: Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight) <= 1 };
    });
    facts.frameTime = /\b\d+\s?ms\b/u.test(text) || /Roughest moment|いちばん重かった/u.test(text);
    facts.layout = await page.locator('#settings-layout, .settings-layout').count();
    await page.screenshot({ path: join(shots, `${engine}-S-${width}x${height}-settings-foot.png`) });
    await page.locator('#bunki-report-bug').click();
    await page.locator('#br-actual').waitFor({ timeout: 10_000 });
    await page.locator('.br-details > summary').first().click();
    details = await page.locator('.br-details pre').first().textContent();
  } catch (error) {
    check(`S · ${label} · the walk ran to its end`, false, String(error?.message || error).split('\n')[0]);
  }
  check(`S · ${label} · Settings shows no frame time and offers no Layout`, !!facts && facts.frameTime === false && facts.layout === 0,
    facts && { frameTime: facts.frameTime, layout: facts.layout });
  check(`S · ${label} · at the end of its scroll the last of Settings sits clear above the tab bar`,
    !!facts && facts.atEnd && facts.tabsTop !== null && facts.lastBottom <= facts.tabsTop + 0.5, facts);
  check(`S · ${label} · the week's roughest moment (267 ms) is in the report sheet's Details`,
    typeof details === 'string' && /"worst_ms":\s*267/u.test(details) && /"name":\s*"room"/u.test(details), (details || 'not reached').slice(0, 200));
  await s.close();
}

/* ------------------------------------------------------------------------------------------------------------------ F */
async function footBand(engine, browserType) {
  const label = `${engine} · 390×844`;
  const facts = {};
  for (const side of ['left', 'right']) {
    const s = await session(browserType);
    const { page } = s;
    try {
      await boot(page);
      await tab(page, 'learn', ['dojo', 'tests']);
      const begin = page.getByRole('button', { name: /Begin .*cards?/u }).first();
      await begin.waitFor({ timeout: 10_000 });
      await begin.click();
      await page.locator('#kp-reveal').waitFor({ timeout: 15_000 });
      await settle(page, 900);
      if (side === 'left') facts.covered = await page.evaluate(() => {
        const band = document.querySelector('#kp-card ~ .kp-foot-band, .kp-study > .kp-foot-band');
        if (!band) return null;
        const b = band.getBoundingClientRect();
        const runs = [...document.querySelectorAll('#kp-card .kp-sentence .kp-w')].map((n) => n.getBoundingClientRect())
          .filter((q) => q.width && q.bottom > b.top + 1 && q.top < b.bottom - 1);
        const landed = runs.map((q) => document.elementFromPoint(q.left + Math.min(q.width / 2, 10), (Math.max(q.top, b.top) + Math.min(q.bottom, b.bottom)) / 2));
        return { top: Math.round(b.top), runs: runs.length, onBand: landed.filter((h) => h === band).length };
      });
      const box = await page.locator('.kp-study > .kp-foot-band').boundingBox();
      if (!box) throw new Error('no foot band element');
      await page.touchscreen.tap(box.x + box.width * (side === 'right' ? 0.75 : 0.2), box.y + 12);
      await settle(page, 900);
      facts[side] = (await page.locator('.kp-grades').count()) > 0 ? 'revealed' : 'front';
    } catch (error) {
      facts[side] = `not reached: ${String(error?.message || error).split('\n')[0].slice(0, 120)}`;
    }
    await s.close();
  }
  check(`F · ${label} · passage text under the foot band is covered by it: every point on it lands on the band`,
    !!facts.covered && facts.covered.runs > 0 && facts.covered.onBand === facts.covered.runs, facts.covered || 'no band element');
  check(`F · ${label} · a tap on the band turns the card in its right half and not in its left, as the stage beside it does`,
    facts.right === 'revealed' && facts.left === 'front', { left: facts.left, right: facts.right });
}

try {
  for (const [engine, browserType] of Object.entries(ENGINES)) {
    console.log(`\n— ${engine}`);
    if (CASES.includes('T')) for (const tutor of [false, true]) await tutorDoors(engine, browserType, tutor);
    if (CASES.includes('B')) for (const size of [[320, 568], [390, 844], [430, 932]]) await settledBack(engine, browserType, size);
    if (CASES.includes('R')) for (const at of [[390, 844, 'hokusai'], [320, 568, 'sumi']]) await restPass(engine, browserType, at);
    if (CASES.includes('S')) for (const size of [[320, 568], [390, 844]]) await settingsFoot(engine, browserType, size);
    if (CASES.includes('F')) await footBand(engine, browserType);
  }
} finally {
  await host.close?.();
}

const failed = checks.filter((item) => !item.pass);
const partial = CASES.length !== ALL.length || Object.keys(ENGINES).length !== 2;
writeFileSync(join(out, 'verification-report.json'), `${JSON.stringify({ suite: 'hfix-rooms', site: host.site, cases: CASES,
  engines: Object.keys(ENGINES), partial, checks }, null, 2)}\n`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed${partial ? ' (a partial run: never an acceptance)' : ''}`);
process.exitCode = failed.length ? 1 : partial ? 3 : 0;
