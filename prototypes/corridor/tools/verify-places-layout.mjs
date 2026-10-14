/**
 * The layout under test (1.2.0): five places named for what is inside them — Review, Bookshelf,
 * Dictionary, Tests, Progress — chosen in Settings → Layout, with the clean top bar, Today's next
 * step folded into Review and the focus room in the decks. Real Chromium at 390 × 844 on the
 * built site, the record imported through the app's own importer.
 *
 * 1. Default: a fresh device opens the current layout, unmarked, and Settings offers the switch
 *    with Current pressed.
 * 2. Switched on through Settings (a seeded 140-word record, 57 cards today): the bar's five names
 *    and no two labels touching; each room's top bar holding only Back and search and lighting its
 *    own station; Review's one number (Begin, the deck row, the badge); every deck and list in
 *    Review and no tests there; Begin and the way back; Saved, its lists, Browse, the backup door
 *    and each way back; Tests and each of its rooms' way back; today's reading; the day's word;
 *    Progress → Saved and Settings; the opening screen's Review button and its described menu.
 * 3. The focus room (an empty record, so the stage offers the N2 deck): no top bar, tab bar or
 *    report button while a card is up; the left half of the card stays still and the right half
 *    turns it; every reading on the back, with the passage's lines unmoved; the Readings switch
 *    returns the clean text and moves nothing.
 * 4. Switched back through Settings: the current layout returns, unmarked.
 *
 * Claim boundary: Chromium only, synthetic records; no physical-device or learner acceptance claim.
 * Usage: KAIRO_SITE_DIR=<staged site> node verify-places-layout.mjs
 */
/* global document, getComputedStyle, innerWidth, NodeFilter */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';

const out = resolveCorridorEvidence();
const host = await startCorridorDev(0);
const identity = JSON.parse(readFileSync(join(host.site, 'build-identity.json'), 'utf8'));
const verifierSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const startedAt = new Date().toISOString();
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
};

/** 140 real core-dictionary words: 37 due now, 73 reviewed and due later, 30 never started; two
 * named lists; a week of reviews. Today's queue is 37 due + 20 new = 57. */
function seed() {
  const dict = JSON.parse(readFileSync(join(host.site, 'data/share_alike/dict.json'), 'utf8')).words;
  const words = Object.keys(dict)
    .filter((w) => /^\p{Script=Han}{2,3}$/u.test(w) && Array.isArray(dict[w].m) && dict[w].m.some((m) => typeof m === 'string' && m.trim()))
    .filter((_, i) => i % 7 === 3)
    .slice(0, 140);
  if (words.length !== 140) throw new Error('The seed needs 140 core words with answers');
  const T = Date.now();
  const DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const taken = [];
  const srs = {};
  words.forEach((id, i) => {
    const ts = T - (i < 70 ? 30 : 8) * DAY - i * 3600000;
    taken.push({ t: 'word', id, label: id, ts, started: ts });
    if (i < 37) srs[`word:${id}`] = { due: iso(T - (i + 1) * 900000), last_review: iso(T - 6 * DAY), stability: 6, difficulty: 5, elapsed_days: 6, scheduled_days: 6, reps: 3, lapses: 0, learning_steps: 0, state: 2 };
    else if (i < 110) srs[`word:${id}`] = { due: iso(T + ((i % 12) + 1) * DAY), last_review: iso(T - 3 * DAY), stability: 9, difficulty: 5, elapsed_days: 3, scheduled_days: 9, reps: 4, lapses: 0, learning_steps: 0, state: 2 };
  });
  const p = (n) => String(n).padStart(2, '0');
  const dk = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const stats = {};
  [42, 55, 38, 61, 47, 0, 52].forEach((n, i) => { if (n) stats[dk(new Date(T - (7 - i) * DAY))] = { n, again: Math.round(n * 0.12) }; });
  const item = (id) => taken.find((t) => t.id === id);
  const lists = { 'N1 読解で出会った語': words.slice(5, 17).map(item), '仏教とヴェーダーンタ': words.slice(40, 47).map(item) };
  return { v: 1, taken, srs, lists, stats };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
  await silenceBrowserAudio(context);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/u, (route) => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}
const ready = (page) => page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
const view = (page) => page.evaluate(() => document.body.dataset.view);
const station = (page) => page.evaluate(() => document.querySelector('#primary-tabs')?.dataset.station || '');
const layout = (page) => page.evaluate(() => document.documentElement.dataset.layout || 'current');
const tabNames = (page) => page.locator('#primary-tabs .primary-tab').evaluateAll((ns) => ns.map((n) => n.firstChild.textContent.trim()));
/** The grade pads as the learner chose them on 10-08 (D1: four, colour coded): each word's colour as
 * painted, its contrast on the pad as painted over the dock (canvas compositing), and four hues
 * apart from one another. */
async function gradesColourCoded(page, world) {
  const pads = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const paint = (...fills) => {
      g.clearRect(0, 0, 1, 1);
      for (const fill of fills) { g.fillStyle = fill; g.fillRect(0, 0, 1, 1); }
      return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = (c) => {
      const [r, gg, b] = c.map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
    const dock = getComputedStyle(document.querySelector('.kp')).getPropertyValue('--kp-dock').trim();
    return ['again', 'hard', 'good', 'easy'].map((id) => {
      const pad = document.querySelector(`#kp-grade-${id}`);
      const ink = paint(getComputedStyle(pad.querySelector('b')).color);
      const ground = paint(dock, getComputedStyle(pad).backgroundColor);
      return { id, ink, ratio: Math.round(ratio(ink, ground) * 10) / 10 };
    });
  });
  const apart = pads.every((a, i) => pads.every((b, j) => i === j || Math.max(...a.ink.map((v, k) => Math.abs(v - b.ink[k]))) >= 40));
  const detail = pads.map((p) => `${p.id} rgb(${p.ink.join(',')}) ${p.ratio}:1`).join(' · ');
  check(`focus · ${world}: the four grades are colour coded, each in its own hue`, apart, detail);
  check(`focus · ${world}: every grade word reads at 4.5:1 or more on its pad`, pads.every((p) => p.ratio >= 4.5), detail);
}
async function openSettings(page) {
  await page.locator('#tab-me, #tab-progress').first().click();
  await page.waitForTimeout(600);
  await page.locator('#me-settings').click();
  await page.locator('#settings-layout').waitFor();
}

try {
  // ---- 1. a fresh device opens the current layout
  {
    const { context, page, errors } = await newPage();
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    check('default · the current layout, unmarked', (await layout(page)) === 'current', await layout(page));
    check('default · the current tab bar', (await tabNames(page)).join() === 'Today,Read,Learn,Words,Me', (await tabNames(page)).join());
    await openSettings(page);
    const pressed = await page.locator('#settings-layout [aria-pressed="true"]').getAttribute('data-layout');
    check('default · Settings offers Layout with Current pressed', pressed === 'current', pressed);
    check('default · no page errors', !errors.length, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ---- 2. the five places, switched on through Settings with a seeded record
  {
    const { context, page, errors } = await newPage();
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    await restoreAppFixture(page, seed());
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    await openSettings(page);
    await page.locator('#settings-layout [data-layout="places"]').click();
    await page.waitForTimeout(900);
    check('switch · Settings turns the new layout on', (await layout(page)) === 'places');
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    check('switch · the choice holds after a reload', (await layout(page)) === 'places');
    const wait = (ms = 700) => page.waitForTimeout(ms);
    const back = async () => { await page.locator('#back').click(); await wait(); };

    const names = await tabNames(page);
    check('bar · five places: Review · Bookshelf · Dictionary · Tests · Progress', names.join() === 'Review,Bookshelf,Dictionary,Tests,Progress', names.join());
    const touching = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('#primary-tabs .primary-tab')].map((b) => { const r = document.createRange(); r.selectNodeContents(b.firstChild); return r.getBoundingClientRect(); });
      return spans.some((a, i) => i && a.left < spans[i - 1].right + 4);
    });
    check('bar · no two labels touch at 390 px', !touching);
    for (const tab of ['review', 'bookshelf', 'dictionary', 'tests', 'progress']) {
      await page.locator(`#tab-${tab}`).click();
      await wait(700);
      const bar = await page.evaluate(() => [...document.querySelectorAll('#app > .chrome > button, #app > .chrome > .lang-seg')]
        .filter((n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width && s.display !== 'none' && s.visibility !== 'hidden'; }).map((n) => n.id));
      check(`${tab} · the top bar holds only Back and search`, bar.every((id) => ['back', 'chrome-search'].includes(id)), bar.join(',') || '(empty)');
      check(`${tab} · its station is lit`, (await station(page)) === tab, await station(page));
    }

    // Review
    await page.locator('#tab-review').click();
    await wait(900);
    const rv = await page.evaluate(() => ({
      title: document.querySelector('#learn-stage-title')?.textContent,
      begin: document.querySelector('#review-start .study-door-t')?.textContent,
      decks: [...document.querySelectorAll('.dojo-deck')].map((d) => d.dataset.deck),
      mine: document.querySelector('.dojo-deck[data-deck="mine"] .dojo-deck-sub')?.textContent,
      badge: document.querySelector('#tab-review .station-due')?.dataset.due,
      tests: !!document.querySelector('#study-hall [data-study-door="mock"], #study-hall [data-learn-section="tests"]'),
    }));
    check('review · titled Review', rv.title === 'Review', rv.title);
    check('review · Begin reads today\'s queue', rv.begin === 'Begin · 57 cards', rv.begin);
    check('review · Begin, the deck row and the badge give one number', /^57 /.test(rv.mine || '') && rv.badge === '57', `${rv.mine} · badge ${rv.badge}`);
    check('review · every deck, the saved words and the lists stand together', ['n2', 'n1', 'mine'].every((d) => rv.decks.includes(d)) && rv.decks.filter((d) => d.startsWith('list:')).length === 2, rv.decks.join(','));
    check('review · no tests here', !rv.tests);
    await page.locator('#review-start').click();
    await wait(900);
    check('review · Begin starts the review', (await view(page)) === 'review');
    await page.locator('#zen-exit').click();
    await wait(800);
    check('review · leaving the review returns to Review', (await view(page)) === 'dojo');
    await page.locator('#review-saved').click();
    await wait(800);
    check('saved · opens from Review and keeps Review lit', (await view(page)) === 'saved' && (await station(page)) === 'review');
    check('saved · holds the ledger, the lists, the list maker and the notes',
      await page.evaluate(() => ['#deck-table', '#list-maker-field', '#record-notes'].every((s) => document.querySelector(s)) && !document.querySelector('#record-sync')));
    await page.locator('.list-open').first().click();
    await wait(600);
    check('saved · a list opens its page', (await view(page)) === 'list');
    await back();
    check('saved · Back from a list returns to Saved', (await view(page)) === 'saved');
    await back();
    check('saved · Back from Saved returns to Review', (await view(page)) === 'dojo');
    await page.locator('#review-browse').click();
    await wait(700);
    check('review · Browse cards opens', (await view(page)) === 'browse');
    await back();
    check('review · Back from Browse returns to Review', (await view(page)) === 'dojo');
    await page.locator('#review-backup').click();
    await wait(1000);
    const atBackup = await page.evaluate(() => ({ view: document.body.dataset.view, focus: document.activeElement?.id }));
    check('review · Back up now opens Settings at Export', atBackup.view === 'settings' && atBackup.focus === 'export-store', JSON.stringify(atBackup));
    await back();
    check('review · Back from there returns to Review', (await view(page)) === 'dojo');

    // Tests
    await page.locator('#tab-tests').click();
    await wait(1000);
    const tt = await page.evaluate(() => ({
      title: document.querySelector('.tests-head .view-title')?.textContent,
      doors: [...document.querySelectorAll('#tests-hall [data-study-door]')].map((d) => d.dataset.studyDoor),
      decks: document.querySelectorAll('#tests-hall .dojo-deck').length,
    }));
    check('tests · titled Tests: JLPT tests, guided practice, lessons, sentence practice, level lists, no decks',
      tt.title === 'Tests' && ['mock', 'guided', 'lessons', 'sentence', 'levels'].every((d) => tt.doors.includes(d)) && !tt.decks, JSON.stringify(tt));
    for (const door of ['mock', 'lessons', 'guided']) {
      await page.locator(`#tests-hall [data-study-door="${door}"]`).click();
      await wait(1300);
      check(`tests · ${door} opens and keeps Tests lit`, (await view(page)) === door && (await station(page)) === 'tests', `${await view(page)} · ${await station(page)}`);
      await back();
      await wait(400);
      check(`tests · Back from ${door} returns to Tests`, (await view(page)) === 'tests', await view(page));
    }

    // Bookshelf and Dictionary
    await page.locator('#tab-bookshelf').click();
    await wait(1000);
    check('bookshelf · titled Bookshelf', (await page.locator('.shelf-mast-name .view-title').textContent()) === 'Bookshelf');
    // Today listed the bookmarks (栞) too; with Today folded into Review, the shelf is where they stand
    check('bookshelf · the bookmarks stand on the shelf', (await page.locator('#app main #record-reading-places').count()) === 1);
    const pick = (await page.locator('#shelf-today-read .shelf-today-read-t').textContent()) || '';
    await page.locator('#shelf-today-read').click();
    await wait(1500);
    const opened = await page.evaluate(() => `${document.title} ${document.querySelector('#app main h1')?.textContent || ''}`);
    check('bookshelf · today\'s reading opens its article', (await view(page)) === 'reader' && opened.includes(pick.slice(0, 6)), pick);
    await back();
    check('bookshelf · Back from the article returns to the shelf', (await view(page)) === 'shelf');
    await page.locator('#tab-dictionary').click();
    await wait(1000);
    check('dictionary · the day\'s word stands under the search', await page.locator('.today-dayword').isVisible());
    await page.locator('#nav-search-input').fill('天気');
    await wait(1300);
    check('dictionary · a search puts the day\'s word away', !(await page.locator('.today-dayword').isVisible()));

    // Progress
    await page.locator('#tab-progress').click();
    await wait(800);
    // the goals that are not begun say where their decks are: Review here, never the old Learn
    const homes = await page.locator('#app main').evaluate((m) => (m.textContent.match(/deck is in \w+/gu) || []).join(' ; '));
    check('progress · unbegun goals send you to Review, never to Learn', /deck is in Review/.test(homes) && !/in Learn/.test(homes), homes);
    await page.locator('#me-collections').click();
    await wait(800);
    check('progress · Saved words & lists opens Saved', (await view(page)) === 'saved');
    await back();
    check('progress · Back returns to Progress', (await view(page)) === 'me');
    await page.locator('#me-settings').click();
    await wait(800);
    await page.locator('.srs-preset[data-preset="gentle"]').click();
    await wait(900);
    check('settings · the pace stands open and applies', /Gentle/.test((await page.locator('#srs-preset-now').textContent()) || ''));
    await page.locator('.srs-preset[data-preset="standard"]').click();
    await wait(900);
    check('settings · language, colour theme, layout, sync, export, import and the builder note are here',
      await page.evaluate(() => ['.settings-language', '#settings-world', '#settings-layout', '#record-sync', '#export-store', '#import-store', '#note-input'].every((s) => document.querySelector(s))));

    // the opening screen
    await page.goto(`${host.origin}/?ui=bi`);
    await page.locator('#ginga-symbol').waitFor();
    await wait(900);
    check('door · its one button says Review · 57 cards', /Review · 57 cards/.test((await page.locator('#home-review').textContent()) || ''));
    await page.locator('#home-review').click();
    await wait(900);
    check('door · the button opens Review', (await view(page)) === 'dojo');
    for (const [tab, want] of [['review', 'dojo'], ['bookshelf', 'shelf'], ['dictionary', 'search'], ['tests', 'tests'], ['progress', 'me']]) {
      await page.goto(`${host.origin}/?ui=bi`);
      await page.locator('#ginga-symbol').waitFor();
      await wait(700);
      await page.locator('#ginga-symbol').click();
      await wait(400);
      if (tab === 'review') {
        const rows = await page.locator('.nav-station').evaluateAll((ns) => ns.map((n) => `${n.querySelector('.nav-station-t').textContent} | ${n.querySelector('.nav-station-sub').textContent}`));
        check('door · the menu: each place with a line saying what is inside', rows.length === 5 && rows.every((r) => r.split(' | ')[1].length > 5), rows.join(' ; '));
        check('door · no language switch on the door', !(await page.locator('.nav-bar #lang, .nav-bar .lang-slide').count()));
      }
      await page.locator(`#nav-${tab}`).click();
      await wait(900);
      check(`door · ${tab} opens its room`, (await view(page)) === want, await view(page));
      await back();
      await wait(300);
      check(`door · Back from ${tab} returns to the door`, (await view(page)) === 'drift', await view(page));
    }
    check('places · no page errors', !errors.length, errors.slice(0, 3).join(' | '));

    // ---- 4. switched back through Settings
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    await openSettings(page);
    await page.locator('#settings-layout [data-layout="current"]').click();
    await wait(900);
    check('switch back · the current layout returns, unmarked', (await layout(page)) === 'current');
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    check('switch back · the current tab bar after a reload', (await tabNames(page)).join() === 'Today,Read,Learn,Words,Me', (await tabNames(page)).join());
    await context.close();
  }

  // ---- 3. the focus room, from Review's stage on an empty record
  {
    const { context, page, errors } = await newPage();
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi&layout=places`);
    await ready(page);
    // a layout link is applied and kept on the device, and its word leaves the address
    check('link · ?layout=places applies, stays chosen and leaves the address',
      (await page.evaluate(() => [location.search, localStorage.getItem('kairo-layout')].join(' '))) === '?entry=shelf&ui=bi places' &&
        (await tabNames(page)).join() === 'Review,Bookshelf,Dictionary,Tests,Progress',
      await page.evaluate(() => location.search));
    await page.locator('#tab-review').click();
    await page.waitForTimeout(1200);
    await page.locator('.learn-go-deck[data-stage-deck="n2"]').click();
    await page.locator('#kp-card').waitFor();
    await page.waitForTimeout(800);
    const room = () => page.evaluate(() => {
      const shown = (s) => { const n = document.querySelector(s); return !!n && getComputedStyle(n).display !== 'none'; };
      return { revealed: !!document.querySelector('#kp-grade-good'), chrome: shown('#app > .chrome'), tabs: shown('#primary-tabs'), rail: shown('#bunki-reports-root .br-rail') };
    });
    const lines = () => page.evaluate(() => {
      const p = document.querySelector('#kp-card .kp-sentence');
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('rt') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      const rows = new Map();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        for (let i = 0; i < n.length; i++) {
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
          const b = r.getBoundingClientRect(); if (!b.width) continue;
          const key = Math.round(b.top / 4);
          rows.set(key, (rows.get(key) || '') + n.data[i]);
        }
      }
      return [...rows.values()].slice(0, 8);
    });
    const readings = () => page.evaluate(() => [...document.querySelectorAll('#kp-card .kp-sentence ruby[data-rt]')].filter((r) => getComputedStyle(r, '::after').content !== 'none').length);
    let s = await room();
    check('focus · while a card is up: no top bar, no tab bar, no report button', !s.chrome && !s.tabs && !s.rail, JSON.stringify(s));
    check('focus · the front shows no readings', !(await page.locator('#kp-card ruby').count()));
    const front = await lines();
    const width = await page.evaluate(() => innerWidth);
    await page.touchscreen.tap(Math.round(width * 0.22), 420);
    await page.waitForTimeout(500);
    check('focus · a tap on the left half leaves the front', !(await room()).revealed);
    await page.touchscreen.tap(Math.round(width * 0.8), 420);
    await page.waitForTimeout(800);
    check('focus · a tap on the right half turns the card', (await room()).revealed);
    await gradesColourCoded(page, 'day');
    const total = await page.locator('#kp-card .kp-sentence ruby[data-rt]').count();
    check('focus · after the turn every kanji carries its reading', total > 0 && (await readings()) === total, `${await readings()}/${total}`);
    check('focus · the readings move no line', JSON.stringify(await lines()) === JSON.stringify(front));
    await page.locator('#kp-readings').click();
    await page.waitForTimeout(500);
    check('focus · the Readings switch returns the clean text', (await readings()) <= 2, `${await readings()} shown`);
    check('focus · turning readings off moves no line', JSON.stringify(await lines()) === JSON.stringify(front));
    // the same pads in a night world (夜)
    await page.evaluate(() => localStorage.setItem('kairo-theme', 'yoru'));
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    await page.locator('#tab-review').click();
    await page.waitForTimeout(1200);
    await page.locator('.learn-go-deck[data-stage-deck="n2"]').click();
    await page.locator('#kp-card').waitFor();
    await page.waitForTimeout(800);
    await page.touchscreen.tap(Math.round(width * 0.8), 420);
    await page.waitForTimeout(800);
    await gradesColourCoded(page, 'night');
    check('focus · no page errors', !errors.length, errors.slice(0, 2).join(' | '));
    // a private collection boots on its own page and never runs render(); it wears the layout too
    await page.goto(`${host.origin}/index.html?deck=personal&ui=bi`);
    const leave = page.locator('.pc-top [data-action="leave"]');
    await leave.waitFor({ timeout: 20_000 });
    const marked = await page.evaluate(() => document.documentElement.dataset.layout || 'none');
    check('collection · a private collection page names its way back Review', (await leave.textContent()).trim() === '← Review' && marked === 'places', `${(await leave.textContent()).trim()} · ${marked}`);
    await context.close();
  }
} catch (error) {
  check('the run completed', false, error.stack || String(error));
} finally {
  await browser.close();
  await host.close();
  const passed = results.filter((r) => r.pass).length;
  const receipt = {
    suite: 'places-layout',
    startedAt,
    completedAt: new Date().toISOString(),
    site: host.site,
    artifactSha256: identity.artifactSha256,
    gitSha: identity.gitSha,
    verifierSha256,
    pass: results.length > 0 && results.every((r) => r.pass),
    passed,
    failed: results.length - passed,
    results,
    scope: 'Chromium 390 × 844, synthetic records imported through the app; no physical-device or learner acceptance claim.',
  };
  writeFileSync(join(out, 'places-layout.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`PLACES LAYOUT ${passed}/${results.length} passed`);
  if (!receipt.pass) process.exitCode = 1;
}
