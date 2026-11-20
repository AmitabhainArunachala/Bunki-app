// The ear's mark stands beside its gate in every frame the browser draws (speech lane, 2026-11-13).
//
// The app draws a room's bar again several times while the room loads (Learn five to eight times), and a page's bar
// stands over the room's. Each new bar used to come without the ear's mark; the mark came back at the voice layer's next
// look at the page, 60 ms and a whole scan later. On a slow machine that gap is long: the line's own check on GitHub read
// the Learn bar inside it and found no mark (run 43250667303, gate-everywhere.test.mjs cases 3 and 12), and a slow phone
// showed the mark blink. Since 9916f7f5c the voice layer places the mark in the same turn the bar is drawn
// (modules/ear.mjs placeMarks, called from the page observer in modules/voice-layer.mjs).
//
// These cases look at every frame from the first one that shows a mark, and count the frames in which a gate that is
// shown stands without its mark. None may. They also hold: each mark named for the bar it stands on, no mark moving
// from one bar to another, nothing added while the page rests, the armed ear carried through the five tabs, and a
// placement that fails not costing the page the voice layer's next look.
//
// Served from the source folder, Chromium only, silent (--mute-audio, media muted, speech stubbed).
//   node --test prototypes/corridor/tools/ear-place.test.mjs
// The lane's proof runs it with the processor slowed (the throttle is Chromium's):
//   EAR_PLACE_RATE=6 node --test prototypes/corridor/tools/ear-place.test.mjs
// and its negative control, which must FAIL on the frame cases: the voice layer served with the observer's own
// placement taken out, as it stood before 9916f7f5c:
//   EAR_PLACE_RATE=6 EAR_PLACE_WITHOUT=1 node --test prototypes/corridor/tools/ear-place.test.mjs
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
// the gates and where each stands are the module's own (placeMarks reads the same two): the page gets them as arguments,
// so this test cannot drift from the rule it checks
import { EAR_GATES, gateHome } from '../modules/ear.mjs';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(CORRIDOR, '../../package.json'))('playwright-core');
const RATE = Number(process.env.EAR_PLACE_RATE || 1);
const WITHOUT = process.env.EAR_PLACE_WITHOUT === '1';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const WIDE = { viewport: { width: 1728, height: 1050 }, deviceScaleFactor: 1 };
const ARTICLE = 'wikinews:1403';
// the observer's own placement, exactly as modules/voice-layer.mjs writes it; the negative control serves the file without it
const LAYER = resolve(CORRIDOR, 'modules/voice-layer.mjs');
const PLACED_WITH_THE_BAR = 'try { ear.place(); } finally { rescan(); }';

let server, base, browser, layerWithout = null;
const contexts = [];
before(async () => {
  if (WITHOUT) {
    const source = readFileSync(LAYER, 'utf8');
    assert.equal(source.split(PLACED_WITH_THE_BAR).length - 1, 1, 'the negative control knows the observer\'s placement by its exact words, once');
    layerWithout = source.replace(PLACED_WITH_THE_BAR, 'rescan();');
  }
  server = createServer((request, response) => {
    const path = decodeURIComponent((request.url || '/').split('?')[0]);
    const file = resolve(CORRIDOR, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
    if (!file.startsWith(CORRIDOR) || !existsSync(file) || statSync(file).isDirectory()) {
      response.writeHead(404); response.end(); return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(layerWithout !== null && file === LAYER ? layerWithout : readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
});
after(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  await new Promise((done) => server?.close(done) ?? done());
});

/** In the page, from its first script on: one look per drawn frame at every gate that is shown. `rule`: the module's
 * gates' selector and its home rule's source (modules/ear.mjs EAR_GATES, gateHome). */
function watchFrames(rule) {
  if (globalThis.speechSynthesis) Object.getPrototypeOf(globalThis.speechSynthesis).speak = function () {};
  try { localStorage.setItem('bunki-prototype:intro-dismissed:v1', '1'); } catch { /* storage may be blocked */ }
  const seen = (globalThis.__earPlace = {
    frames: 0, bare: 0, bareByHome: {}, shownByHome: {}, worst: 0, run: 0, firstMark: null, ready: null,
    hidden: 0, jumps: 0, wrongHome: 0, lastChange: performance.now(), rest: false, changedAtRest: 0, addedAtRest: 0,
  });
  const GATES = rule.gates;
  const homeOf = new Function(`return (${rule.home});`)();
  const stoodAt = new WeakMap();
  const frame = () => {
    const now = Math.round(performance.now());
    if (seen.ready === null && document.body?.dataset.ready === '1') seen.ready = now;
    if (seen.firstMark === null && document.querySelector('.ear-spot')) seen.firstMark = now;
    const gates = [...document.querySelectorAll(GATES)].filter((gate) => gate.getClientRects().length > 0);
    let bare = false;
    for (const gate of gates) {
      const home = homeOf(gate), spot = gate.nextElementSibling;
      if (seen.firstMark === null) continue;
      seen.shownByHome[home] = (seen.shownByHome[home] || 0) + 1;
      if (!spot?.classList?.contains('ear-spot')) { bare = true; seen.bareByHome[home] = (seen.bareByHome[home] || 0) + 1; continue; }
      if (!spot.getClientRects().length) seen.hidden += 1;
      const before = stoodAt.get(spot);
      if (before && before !== home) seen.jumps += 1;
      stoodAt.set(spot, home);
      if (spot.getAttribute('data-ear-home') !== home) seen.wrongHome += 1;
    }
    if (gates.length && seen.firstMark !== null) {
      seen.frames += 1;
      if (bare) { seen.bare += 1; seen.run += 1; seen.worst = Math.max(seen.worst, seen.run); } else seen.run = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // when the page itself last changed (the ear's own nodes apart), and what was added while it rested
  const own = (node) => node.nodeType === 1 && node.hasAttribute('data-ear-own');
  new MutationObserver((records) => {
    for (const record of records) {
      const nodes = [...record.addedNodes, ...record.removedNodes];
      const ears = !!(record.target.nodeType === 1 && record.target.closest('[data-ear-own]')) || (nodes.length > 0 && nodes.every(own));
      if (!ears) { seen.lastChange = performance.now(); if (seen.rest) seen.changedAtRest += 1; }
      if (seen.rest) for (const node of record.addedNodes) if (node.nodeType === 1 && node.classList.contains('ear-spot')) seen.addedAtRest += 1;
    }
  }).observe(document, { childList: true, subtree: true });
}
/** The page has stopped changing: nothing but the ear's own nodes added or removed for a second. A room goes on drawing
 * after it says ready, for longer on a slow machine; what is read at rest is read after this, not after a fixed time. */
async function settled(page) {
  await page.waitForFunction(() => performance.now() - globalThis.__earPlace.lastChange > 1000, null, { timeout: 90000, polling: 100 });
}

async function open(device, address, { wait = null } = {}) {
  const context = await browser.newContext({ ...device, locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  contexts.push(context);
  await silenceBrowserAudio(context);
  await context.addInitScript(watchFrames, { gates: EAR_GATES, home: String(gateHome) });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error)));
  if (RATE > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.goto(base + address, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
  // the voice layer is loaded beside the app and may arrive after the app says ready: the ear is in once it has painted
  await page.waitForFunction(() => 'ear' in document.documentElement.dataset, null, { timeout: 120000 });
  if (wait) await page.locator(wait).waitFor({ timeout: 60000 });
  await page.evaluate(() => document.fonts?.ready);
  await settled(page);
  return { page, errors, context };
}
/** A second in which the page itself does not change (tried again if it did); then what the frames showed. */
async function rested(page) {
  for (let turn = 0; turn < 5; turn += 1) {
    await settled(page);
    await page.evaluate(() => Object.assign(globalThis.__earPlace, { rest: true, changedAtRest: 0, addedAtRest: 0 }));
    await page.waitForTimeout(1000);
    const seen = await page.evaluate(() => { globalThis.__earPlace.rest = false; return { ...globalThis.__earPlace, ear: document.documentElement.dataset.ear }; });
    if (seen.changedAtRest === 0) return seen;
  }
  return page.evaluate(() => ({ ...globalThis.__earPlace, ear: document.documentElement.dataset.ear }));
}
function assertPlaced(name, seen, errors, homes) {
  const where = `${name} (processor x${RATE})`;
  assert.notEqual(seen.firstMark, null, `${where}: a mark was seen`);
  assert.ok(seen.frames > 0, `${where}: frames with a gate shown were looked at`);
  assert.equal(seen.bare, 0, `${where}: ${seen.bare} of ${seen.frames} frames showed a gate without its mark ${JSON.stringify(seen.bareByHome)}, longest run ${seen.worst}`);
  for (const home of homes) assert.ok(seen.shownByHome[home] > 0, `${where}: the ${home} gate was shown (${JSON.stringify(seen.shownByHome)})`);
  assert.equal(seen.hidden, 0, `${where}: a mark beside a shown gate is shown too`);
  assert.equal(seen.jumps, 0, `${where}: no mark moved to a gate of another bar`);
  assert.equal(seen.wrongHome, 0, `${where}: each mark is named for the bar it stands on`);
  assert.equal(seen.changedAtRest, 0, `${where}: the page came to rest`);
  assert.equal(seen.addedAtRest, 0, `${where}: no mark is added while the page rests`);
  assert.deepEqual(errors, [], `${where}: no page errors`);
}
async function placedOn(name, device, address, homes, wait = null) {
  const { page, errors, context } = await open(device, address, { wait });
  const seen = await rested(page);
  await context.close();
  assertPlaced(name, seen, errors, homes);
}

test('Learn at 1728, whose bar is drawn again while the room loads: the mark never leaves it', async () => {
  await placedOn('learn@1728', WIDE, '?room=dojo', ['bar']);
});
test('Today at 1728', async () => {
  await placedOn('today@1728', WIDE, '?room=tray', ['bar']);
});
test('Words at 390', async () => {
  await placedOn('words@390', PHONE, '?room=search', ['bar']);
});
test('an article at 390', async () => {
  await placedOn('article@390', PHONE, `?read=${ARTICLE}`, ['bar']);
});
test('a word page at 1728: the room\'s bar and the page\'s bar each keep their own mark', async () => {
  await placedOn('word@1728', WIDE, `?read=${ARTICLE}&word=開催`, ['bar', 'sheet'], '#sheet > .sheet-bar > .bar-gate');
});
test('a kanji page at 390: the same', async () => {
  await placedOn('kanji@390', PHONE, '?room=shelf&kanji=産', ['bar', 'sheet'], '#sheet > .sheet-bar > .bar-gate');
});

test('the armed ear goes through the five tabs with its mark on every bar and stays armed', async () => {
  const { page, errors, context } = await open(WIDE, '?room=tray');
  await page.locator('#app > .chrome > .ear-spot .ear-mark').click();
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed');
  const walked = [];
  for (const [tab, view] of [['#tab-learn', 'dojo'], ['#tab-read', 'shelf'], ['#tab-words', 'search'], ['#tab-me', 'me'], ['#tab-today', 'tray']]) {
    await page.locator(tab).first().click();
    await page.waitForFunction((view) => document.body.dataset.view === view, view);
    await settled(page);
    walked.push(await page.evaluate(() => `${document.body.dataset.view}:${document.documentElement.dataset.ear}:${
      [...document.querySelectorAll('#app > .chrome > .bar-gate + .ear-spot')].filter((spot) => spot.getClientRects().length).length}`));
  }
  const seen = await rested(page);
  await context.close();
  assert.deepEqual(walked, ['dojo:armed:1', 'shelf:armed:1', 'search:armed:1', 'me:armed:1', 'tray:armed:1'], 'each room: armed, one mark shown beside its bar\'s gate');
  assertPlaced('five tabs@1728', seen, errors, ['bar']);
});

test('a placement that fails does not cost the page the voice layer\'s next look, and is not hidden', async () => {
  const { page, errors, context } = await open(WIDE, '?room=dojo');
  const during = await page.evaluate(async () => {
    const gate = document.querySelector('#app > .chrome > .bar-gate');
    const mark = gate?.nextElementSibling;
    if (!mark?.classList.contains('ear-spot')) return { setup: 'no mark beside the gate' };
    const place = Element.prototype.after;
    const state = (globalThis.__earRefuse = { on: true, refused: 0, place });
    Element.prototype.after = function refusing(...nodes) {
      if (state.on && nodes.some((node) => node?.classList?.contains?.('ear-spot'))) {
        state.refused += 1;
        throw new Error('ear-place.test: this placement is refused');
      }
      return place.apply(this, nodes);
    };
    // one change to the page: the bar's gate is drawn again and its old mark leaves with the old one; and a quoted
    // sentence arrives, which the voice layer's look at the page gives a listen control
    const again = gate.cloneNode(true);
    const quote = document.createElement('blockquote');
    quote.className = 'sentence-original';
    quote.lang = 'ja';
    quote.textContent = '今日は雨が降っています。';
    mark.remove();
    gate.replaceWith(again);
    document.querySelector('main').append(quote);
    // each thing is waited for, not a fixed time (a slow machine takes longer; a lost look never comes)
    const until = async (read, ms) => {
      for (const end = performance.now() + ms; performance.now() < end;) {
        if (read()) return true;
        await new Promise((done) => setTimeout(done, 50));
      }
      return !!read();
    };
    const control = () => (quote.nextElementSibling?.classList.contains('voice-say') ? quote.nextElementSibling : null);
    const listen = await until(control, 8000);
    // the look's last part: every voice control it finds is weighed against the ground it stands on (data-vt-look)
    const weighed = listen && await until(() => 'vtLook' in control().dataset, 3000);
    await new Promise((done) => setTimeout(done, 300));
    return { setup: 'ok', refused: state.refused, listen, weighed, marked: !!again.nextElementSibling?.classList.contains('ear-spot') };
  });
  assert.equal(during.setup, 'ok');
  assert.ok(during.refused >= 1, 'the mark was to be placed with the new gate, and that was refused');
  assert.equal(during.marked, false, 'while every placement is refused the gate has no mark');
  assert.equal(during.listen, true, 'the quoted sentence still got its listen control: the look at the page was not lost with the mark');
  assert.equal(during.weighed, true, 'and the look went on to its end: the new control was weighed against its ground');
  assert.ok(errors.length >= 1 && errors.every((line) => line.includes('this placement is refused')), `the failure is reported, and nothing else is: ${JSON.stringify(errors)}`);
  // the refusal ends; at the page's next change the mark is back beside its gate
  const afterwards = await page.evaluate(async () => {
    const state = globalThis.__earRefuse;
    state.on = false;
    Element.prototype.after = state.place;
    document.querySelector('main').append(document.createComment('one more change'));
    const marked = () => !!document.querySelector('#app > .chrome > .bar-gate')?.nextElementSibling?.classList.contains('ear-spot');
    for (const end = performance.now() + 5000; performance.now() < end && !marked();) await new Promise((done) => setTimeout(done, 50));
    return marked();
  });
  await context.close();
  assert.equal(afterwards, true, 'the mark is back at the next change to the page');
});
