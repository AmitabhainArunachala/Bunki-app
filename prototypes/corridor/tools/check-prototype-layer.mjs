#!/usr/bin/env node
/** The prototype layer's own check (integrate/everything-on-20261110): prototype-layer.mjs and prototype-layer.css,
 * driven in a SERVED build as John drives it, in headless Chromium or WebKit (Playwright's launchers only).
 *
 * At 390x844 with touch and at 1280x800 with the mouse and the keyboard:
 *   first-open   the one line shows beside the prototype button, the button covers neither the report entry nor the
 *                navigation, OK dismisses the line and a reload does not bring it back
 *   three-screens the button opens the sheet on the first screen, in the reader, and inside an open dialog
 *   go           every Go of "New in this build" lands on its new thing, which wears the mark
 *   note         a note with a pointed-at element is sent (the pointed tap does not act on the page), appears as
 *                "Received", and a reply written into the store shows in the list
 *   no-endpoint  where /__feedback is missing the box says so and keeps the text
 *   japanese     in the Japanese interface the mark reads 新
 *
 * The note checks talk to an in-memory stand-in for /__feedback that follows the lead's contract, so John's real
 * notes are never touched. --live sends ONE marked test note to the real endpoint instead, answers it with
 * ../feedback/feedback.py and removes it again.
 *
 *   node prototypes/corridor/tools/check-prototype-layer.mjs [--base http://127.0.0.1:18841/] [--engine webkit]
 *        [--only <name,name>] [--shots <dir>] [--live <path to the feedback folder>]
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://127.0.0.1:18841/').replace(/\/?$/, '/');
const ONLY = arg('--only', '').split(',').filter(Boolean);
const SHOTS = arg('--shots', '');
const LIVE = arg('--live', '');
const ENGINE = arg('--engine', 'chromium');
if (SHOTS) mkdirSync(resolve(SHOTS), { recursive: true });
const engines = createRequire(join(repo, 'package.json'))('playwright-core');
if (!['chromium', 'webkit'].includes(ENGINE)) { console.error('--engine is chromium or webkit'); process.exit(2); }
const ORIGIN = new URL(BASE).origin;
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ENGINE === 'chromium' },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const results = [];
const browser = await engines[ENGINE].launch({ headless: true });
const must = (ok, message) => { if (!ok) throw new Error(message); };

/** a fresh profile; `store` is the stand-in for /__feedback (null = the served endpoint, 'missing' = no endpoint) */
async function fresh(device, { store = [], dismissed = false } = {}) {
  const context = await browser.newContext({ ...DEVICES[device], locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  if (dismissed) await context.addInitScript(() => { try { localStorage.setItem('bunki-prototype:intro-dismissed:v1', '1'); } catch { /* none */ } });
  if (store) await context.route(/\/(api\/)?__feedback$/, async (route) => {
    if (store === 'missing') return route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' });
    const request = route.request();
    if (request.method() === 'POST') {
      const note = { id: `check-${store.length + 1}`, ts: new Date().toISOString(), status: 'received', reply: null, replyTs: null, ...JSON.parse(request.postData()) };
      store.unshift(note);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: note.id }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: store }) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' && !(store === 'missing' && /404/.test(m.text()))) problems.push(`console: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => problems.push(`uncaught: ${String(e.message || e).slice(0, 240)}`));
  const touch = !!DEVICES[device].hasTouch;
  const press = (target) => (typeof target === 'string' ? page.locator(target).first() : target)[touch ? 'tap' : 'click']();
  const tapAt = (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const open = async (path = '') => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1' || document.querySelector('[data-shared-study]'), null, { timeout: 45000 });
    await page.locator('#prototype-open').waitFor();
  };
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(resolve(SHOTS), `${name}-${device}.png`) }); };
  const openSheet = async (tab) => {
    await press('#prototype-open');
    await page.locator('#prototype-sheet[open]').waitFor();
    if (tab) await press(`[data-pl-tab="${tab}"]`);
  };
  return { context, page, problems, press, tapAt, open, shot, openSheet, device, touch };
}
async function check(name, device, expected, options, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const session = await fresh(device, options);
  const row = { check: name, device, expected, pass: false, detail: '' };
  try {
    row.detail = String((await fn(session)) || '');
    row.pass = session.problems.length === 0;
    if (!row.pass) row.detail += ` | FIRST ERROR: ${session.problems[0]}${session.problems.length > 1 ? ` (+${session.problems.length - 1} more)` : ''}`;
  } catch (error) {
    row.detail = `did not work: ${String(error.message || error).split('\n')[0].slice(0, 300)}`;
    if (session.problems.length) row.detail += ` | FIRST ERROR: ${session.problems[0]}`;
    if (SHOTS) await session.page.screenshot({ path: join(resolve(SHOTS), `FAILED-${name}-${device}.png`) }).catch(() => {});
  }
  await session.context.close();
  results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${name} @ ${device}: ${row.detail}`);
}
const box = (page, selector) => page.evaluate((selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; }, selector);
const overlap = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const mark = (page, selector, pseudo = '::after') => page.evaluate(([selector, pseudo]) => { const n = document.querySelector(selector); return n ? getComputedStyle(n, pseudo).content : 'absent'; }, [selector, pseudo]);

/** where each Go must land, and the element that wears the mark there */
const GO = {
  quests: { there: '#kanji-quest-door', wears: '#kanji-quest-door' },
  worldcraft: { there: '#worldcraft-door', wears: '#worldcraft-door' },
  passage: { there: '#passage-door', wears: '#passage-door' },
  orbit: { there: 'dialog#orbit-preview[open] .orbit-preview-tag', wears: '.orbit-preview-bar .orbit-preview-tag' },
  library: { there: '.shelf-item .library-candidate-tag', wears: '.shelf-item .library-candidate-tag', inView: true },
  sakura: { there: '#listen-open', wears: null, then: async ({ page, press }) => {
    if (await page.locator('#mini').waitFor({ timeout: 2500 }).then(() => true, () => false)) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    await press('#listen-open'); await page.locator('.listen-row[data-open="true"]').waitFor();
    return '.listen-row[data-passage="jawiki:5294446"]';
  } },
  'shared-study': { there: '[data-shared-study="ready"] iframe[src*="deck=n2"]', wears: '[data-shared-study="ready"] > p' },
  grammar: { there: '[data-shared-study="ready"] iframe[src*="deck=shared-grammar"]', wears: '[data-shared-study="ready"] > p' },
  rajomon: { there: '#kanji-world-door.kanji-world-door-held', wears: '#kanji-world-door' },
  places: { there: ':root[data-layout="places"] #primary-tabs', wears: '#primary-tabs', pseudo: '::before' },
};

for (const device of ['phone', 'desktop']) {
  await check('first-open', device, 'the line shows once, the button covers neither the report entry nor the navigation', {}, async ({ page, press, open, shot }) => {
    await open('');
    await page.locator('.pl-intro').waitFor();
    const line = (await page.locator('.pl-intro-text').innerText()).trim();
    must(/prototype/i.test(line) && /new/i.test(line) && /notes/i.test(line), `the line reads "${line}"`);
    await shot('layer-first-open');
    const places = [];
    for (const path of ['', '?entry=shelf', '?read=bunki-essay-n1-city']) {
      if (path) await open(path);
      await page.waitForTimeout(700);
      const button = await box(page, '#prototype-open'), bug = await box(page, '#bunki-reports-root .br-rail'), nav = await box(page, '#primary-tabs');
      must(button && button.x >= 0 && button.y >= 0 && button.x + button.w <= DEVICES[device].viewport.width && button.y + button.h <= DEVICES[device].viewport.height, `the button is off the screen on "${path}": ${JSON.stringify(button)}`);
      must(!overlap(button, bug), `the button covers the report entry on "${path}"`);
      must(!overlap(button, nav), `the button covers the navigation on "${path}"`);
      places.push(`${Math.round(button.x)},${Math.round(button.y)}`);
    }
    await open('');
    await press('.pl-intro-ok');
    must(!(await page.locator('.pl-intro').isVisible()), 'OK did not dismiss the line');
    await open('');
    await page.waitForTimeout(600);
    must(!(await page.locator('.pl-intro').isVisible()), 'the line came back after a reload');
    return `"${line}"; the button stands at ${places.join(' / ')} (first screen / bookshelf / reader), clear of the report entry and the navigation; OK dismisses it and a reload keeps it away`;
  });

  await check('three-screens', device, 'the button opens the sheet on the first screen, in the reader and inside an open dialog', { dismissed: true }, async ({ page, press, open, openSheet, shot, touch }) => {
    const seen = [];
    await open('');
    if (touch) await openSheet(); else { await page.locator('#prototype-open').focus(); await page.keyboard.press('Enter'); await page.locator('#prototype-sheet[open]').waitFor(); }
    must(await page.locator('.pl-item').count() === 10, `the first tab lists ${await page.locator('.pl-item').count()} new things`);
    must(await page.locator('.pl-rest li').count() >= 5, 'the "not connected yet" list is missing');
    await shot('layer-sheet-new');
    await page.keyboard.press('Escape');
    await page.locator('#prototype-sheet[open]').waitFor({ state: 'detached' }).catch(() => {});
    must(await page.locator('#prototype-sheet[open]').count() === 0, 'Escape did not close the sheet');
    if (!touch) must(await page.evaluate(() => document.activeElement?.id) === 'prototype-open', 'the focus did not return to the button');
    seen.push(`first screen (${touch ? 'tap' : 'Enter key'})`);
    await open('?read=bunki-essay-n1-city');
    await page.locator('.reader .tok.content').first().waitFor();
    if (await page.locator('#mini').waitFor({ timeout: 2500 }).then(() => true, () => false)) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    await openSheet('notes');
    const about = (await page.locator('.pl-context').innerText()).trim();
    must(/view=reader/.test(about) && /bunki-essay-n1-city/.test(about), `in the reader the note would carry "${about}"`);
    await press('.pl-close');
    seen.push('reader');
    await open(`?room=search&kanji=${encodeURIComponent('職')}`);
    await press('#passage-door');
    await page.locator('#passage-count').waitFor();
    await page.locator('#passage-dialog #prototype-open').waitFor();
    await openSheet('notes');
    const inDialog = (await page.locator('.pl-context').innerText()).trim();
    must(/dialog=passage-dialog/.test(inDialog), `inside the passage the note would carry "${inDialog}"`);
    await shot('layer-sheet-in-dialog');
    await press('.pl-close');
    must(await page.locator('#passage-dialog[open]').count() === 1, 'closing the sheet closed the passage');
    seen.push('inside the passage dialog');
    return `opened on: ${seen.join(', ')}; in the reader a note carries "${about.slice(0, 90)}"`;
  });
}

await check('go', 'desktop', 'every Go lands on its new thing, which wears the mark', { dismissed: true }, async (session) => {
  const { page, press, open, openSheet, shot } = session;
  const reached = [];
  for (const [id, want] of Object.entries(GO)) {
    await open('');
    await openSheet();
    await press(`[data-pl-go="${id}"]`);
    await page.locator(want.there).first().waitFor({ state: want.there.includes('iframe') ? 'attached' : 'visible', timeout: 30000 });
    const wears = want.then ? await want.then(session) : want.wears;
    await page.waitForTimeout(400);
    const content = await mark(page, wears, want.pseudo);
    must(/new/.test(content), `at "${id}" ${wears} wears ${content}`);
    if (want.inView) {
      const top = await page.evaluate((selector) => document.querySelector(selector).getBoundingClientRect().top, want.there);
      must(top > 0 && top < 800, `the first candidate is at ${Math.round(top)}px, not in view`);
    }
    await shot(`layer-go-${id}`);
    reached.push(id);
    if (id === 'places') {
      await openSheet();
      await press('[data-pl-go="places-back"]');
      await page.waitForFunction(() => document.body.dataset.ready === '1' && document.documentElement.dataset.layout !== 'places', null, { timeout: 30000 });
    }
  }
  return `${reached.length} of ${Object.keys(GO).length}: ${reached.join(', ')}; "Usual layout" leads back from five places`;
});

await check('go', 'phone', 'on a phone Go lands on the quest word and on the candidates', { dismissed: true }, async (session) => {
  const { page, press, open, openSheet } = session;
  const reached = [];
  for (const id of ['quests', 'library', 'orbit']) {
    await open('');
    await openSheet();
    await press(`[data-pl-go="${id}"]`);
    await page.locator(GO[id].there).first().waitFor({ timeout: 30000 });
    reached.push(id);
  }
  return reached.join(', ');
});

for (const device of ['phone', 'desktop']) {
  const store = [];
  await check('note', device, 'a note with a pointed-at element is sent, shows as Received, and a reply shows', LIVE ? { store: null, dismissed: true } : { store, dismissed: true }, async ({ page, press, tapAt, open, openSheet, shot }) => {
    const text = LIVE ? `[check-prototype-layer ${device}] automated test note, removed again by the check` : 'The wording on this door is too long.';
    const run = (...args) => execFileSync(join(resolve(LIVE), 'feedback.py'), args, { encoding: 'utf8' });
    await open(`?room=search&kanji=${encodeURIComponent('職')}`);
    await page.locator('#worldcraft-door').waitFor();
    await openSheet('notes');
    await page.locator('#pl-text').fill(text);
    await press('[data-pl-action="point"]');
    await page.locator('.pl-point-hint').waitFor();
    const door = await box(page, '#worldcraft-door');
    await tapAt(door.x + door.w / 2, door.y + door.h / 2);
    await page.locator('#prototype-sheet[open]').waitFor();
    must(await page.locator('#worldcraft-dialog').count() === 0, 'the pointed tap opened the builder: it acted on the page');
    const pointed = (await page.locator('.pl-target').innerText()).replace(/\s+/g, ' ').trim();
    must(/Build 職 from its parts/.test(pointed), `the note points at "${pointed}"`);
    must(await page.locator('#pl-text').inputValue() === text, 'the text was lost while pointing');
    await shot('layer-note-pointed');
    await press('[data-pl-action="send"]');
    const row = page.locator('.pl-note-row', { hasText: text }).first();
    await row.waitFor();
    must(await row.locator('.pl-status').getAttribute('data-pl-status') === 'received', 'the new note is not "received"');
    must(await page.locator('#pl-text').inputValue() === '', 'the box kept the sent text');
    const id = await row.getAttribute('data-pl-note');
    let sent;
    if (LIVE) sent = JSON.parse(run('list', '--json')).items.find((item) => item.id === id);
    else sent = store[0];
    try {
      must(sent && sent.text === text, 'the store does not hold the note');
      must(/page=kanji:職/.test(sent.route) && /view=search/.test(sent.route), `route: ${sent.route}`);
      must(typeof sent.heading === 'string' && sent.heading.length > 0, `heading: "${sent.heading}"`);
      must(/^[a-f0-9]{40}$/.test(sent.build), `build: ${sent.build}`);
      must(sent.viewport.w === DEVICES[device].viewport.width && sent.viewport.h === DEVICES[device].viewport.height, `viewport: ${JSON.stringify(sent.viewport)}`);
      must(sent.target && sent.target.path === '#worldcraft-door' && /Build 職/.test(sent.target.text) && sent.target.rect.w > 0, `target: ${JSON.stringify(sent.target)}`);
      must(sent.lang === 'en', `lang: ${sent.lang}`);
      const reply = 'Shortened on the next build.';
      if (LIVE) run('reply', id, 'working', reply);
      else Object.assign(store[0], { status: 'working', reply, replyTs: new Date().toISOString() });
      // the list refreshes every 15 s while the sheet is open
      await row.locator('.pl-reply').waitFor({ timeout: 20000 });
      must(await row.locator('.pl-status').getAttribute('data-pl-status') === 'working', 'the status did not follow the store');
      const shown = (await row.locator('.pl-reply').innerText()).replace(/\s+/g, ' ').trim();
      must(shown.includes(reply), `the reply reads "${shown}"`);
      await shot('layer-note-reply');
      return `pointed at "${sent.target.text.slice(0, 40)}" (${sent.target.path}) without opening it; sent with heading "${sent.heading}", ${sent.route.split(' address=')[0]}, ${sent.viewport.w}×${sent.viewport.h}, build ${sent.build.slice(0, 9)}; listed as Received; the reply "${reply}" showed within the 15 s refresh${LIVE ? `; real endpoint, test note ${id} removed` : '; stand-in store'}`;
    } finally {
      if (LIVE && id) run('remove', id);
    }
  });
}

await check('no-endpoint', 'phone', 'with no /__feedback the box says so and keeps the text', { store: 'missing', dismissed: true }, async ({ page, press, open, openSheet }) => {
  await open('');
  await openSheet('notes');
  const only = page.locator('[data-pl-notice="missing"]');
  await only.waitFor();
  const says = (await only.innerText()).trim();
  must(/Mac prototype only/.test(says), `the box says "${says}"`);
  must(await page.locator('[data-pl-action="send"]').isDisabled(), 'Send is not switched off');
  await page.locator('#pl-text').fill('Kept for later.');
  await press('.pl-close');
  await open('?entry=shelf');
  await openSheet('notes');
  must(await page.locator('#pl-text').inputValue() === 'Kept for later.', 'the text was not kept');
  return `"${says}"; Send is off; the text is still there after a reload`;
});

await check('japanese', 'phone', 'in the Japanese interface the mark reads 新', {}, async ({ page, open, openSheet }) => {
  await open(`?ui=ja&room=search&kanji=${encodeURIComponent('間')}`);
  await page.locator('#kanji-world-door').waitFor();
  const content = await mark(page, '#kanji-world-door');
  must(/新/.test(content), `the mark reads ${content}`);
  const line = (await page.locator('.pl-intro-text').innerText()).trim();
  must(/試作版/.test(line), `the line reads "${line}"`);
  await openSheet();
  const tabs = await page.locator('.pl-nav button').allInnerTexts();
  must(tabs.join('|') === 'この版の新しいもの|気になるところを書く', `the tabs read ${tabs.join(' | ')}`);
  return `mark ${content}; line "${line.slice(0, 40)}…"; tabs ${tabs.join(' / ')}`;
});

await browser.close();
const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. ${BASE} (${ENGINE}${LIVE ? ', live notes' : ''})`);
process.exit(failed.length ? 1 : 0);
