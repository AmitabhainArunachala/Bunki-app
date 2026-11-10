#!/usr/bin/env node
/** Walk the Orbit word field preview (廻 Meguri) through the real app in an owned browser, as a learner does:
 * the first screen → the door's menu → the door tagged "preview" → the rings turn and words pass → a word opens and
 * closes → Back → the app is where it was. Phone (390x844, touch) and desktop (1280x800, mouse).
 *
 *   KAIRO_SITE_DIR=<built site> KAIRO_EVIDENCE_DIR=<folder outside the checkout> node verify-orbit-preview.mjs
 *   KAIRO_BROWSER=chromium (default) | webkit | all
 *
 * Fails on any console error, uncaught error, failed request, HTTP error or request that leaves the site's address.
 * The room stays quiet: media and speech are silenced by browser-audio-silence.mjs, and every Web Audio output is
 * routed through a zero gain; what the page asked for is counted, not heard.
 * Writes result.json and the screenshots to the evidence folder. Exit 0 only when every check passes.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const site = process.env.KAIRO_SITE_DIR;
const evidence = process.env.KAIRO_EVIDENCE_DIR;
assert(site && evidence, 'Name the built test site (KAIRO_SITE_DIR) and an evidence folder outside the checkout (KAIRO_EVIDENCE_DIR)');
mkdirSync(evidence, { recursive: true });
const ENGINES = { chromium, webkit };
const engines = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
assert(engines.every((name) => ENGINES[name]), 'KAIRO_BROWSER is chromium, webkit or all');
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const rows = [];

/** Runs in every frame before its scripts: counts what asks for sound and keeps Web Audio silent. */
function soundProbe() {
  const seen = (window.__orbitSound = { webaudio: 0, speech: 0, media: 0 });
  for (const name of ['AudioBufferSourceNode', 'OscillatorNode']) {
    const proto = window[name]?.prototype, start = proto?.start;
    if (start) proto.start = function (...args) { seen.webaudio += 1; return start.apply(this, args); };
  }
  const connect = window.AudioNode?.prototype.connect;
  if (connect) window.AudioNode.prototype.connect = function (target, ...rest) {
    if (!(target instanceof window.AudioDestinationNode)) return connect.call(this, target, ...rest);
    const context = this.context;
    if (!context.__quiet) { context.__quiet = context.createGain(); context.__quiet.gain.value = 0; connect.call(context.__quiet, target); }
    return connect.call(this, context.__quiet, ...rest);
  };
  const synth = window.speechSynthesis && Object.getPrototypeOf(window.speechSynthesis), speak = synth?.speak;
  if (speak) synth.speak = function (...args) { seen.speech += 1; return speak.apply(this, args); };
  const media = window.HTMLMediaElement?.prototype, play = media?.play;
  if (play) media.play = function (...args) { seen.media += 1; return play.apply(this, args); };
}

const overlap = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function session(browser, origin, device, query = '') {
  const context = await browser.newContext({ ...DEVICES[device], locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await silenceBrowserAudio(context);
  await context.addInitScript(soundProbe);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const log = { problems: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.problems.push(`console error: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => log.problems.push(`uncaught: ${String(e.message || e).slice(0, 240)}`));
  page.on('requestfailed', (r) => {
    // The report sheet reads only the head of build-identity.json and drops the rest: that abort is the app's design.
    if (r.url().endsWith('/build-identity.json') && r.failure()?.errorText === 'net::ERR_ABORTED') return;
    log.problems.push(`request failed: ${r.failure()?.errorText} ${r.url().slice(0, 160)}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) log.problems.push(`http ${r.status()} ${r.url().slice(0, 160)}`); });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return;
    log.requests.push(url.href);
    if (url.origin !== origin) log.problems.push(`left this address: ${url.href.slice(0, 160)}`);
  });
  const touch = !!DEVICES[device].hasTouch;
  const press = (locator, options) => (touch ? locator.tap(options) : locator.click(options));
  await page.goto(`${origin}/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  await page.locator('#ginga-symbol').waitFor();
  return { context, page, log, press, device };
}

async function check(tag, name, fn) {
  const row = { name: `${tag}/${name}`, pass: false, detail: '' };
  try { row.detail = String((await fn()) || ''); row.pass = true; }
  catch (error) { row.detail = String(error.message || error).split('\n')[0].slice(0, 300); }
  rows.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name} — ${row.detail}`);
  return row.pass;
}

/** The page inside the preview's frame, once it has booted. */
async function orbitFrame(page) {
  const handle = await page.locator('#orbit-preview-frame').elementHandle();
  const frame = await handle.contentFrame();
  await frame.waitForFunction(() => !!window.__meguri && document.querySelector('#live').width > 0);
  return frame;
}

async function walk(engine, browser, origin, device) {
  const tag = `${engine}/${device}`;
  const s = await session(browser, origin, device);
  const { page, press, log } = s;
  const shot = (name) => page.screenshot({ path: resolve(evidence, `${engine}-${device}-${name}.png`) });
  const { width, height } = DEVICES[device].viewport;
  let frame;

  await check(tag, 'first screen', async () => {
    assert.equal(await page.locator('#orbit-preview-door').count(), 0, 'the door stands on the first screen before the menu opens');
    assert.equal(log.requests.filter((url) => url.includes('orbit-preview')).length, 0, 'the preview loaded at boot');
    return 'the app is ready; nothing of the preview is loaded or shown';
  });

  await check(tag, 'door', async () => {
    await press(page.locator('#ginga-symbol'));
    const door = page.locator('#orbit-preview-door');
    await door.waitFor();
    const text = (await door.innerText()).replace(/\s+/g, ' ').trim();
    assert.match(text, /\bpreview\b/, `the door reads "${text}"`);
    await page.waitForTimeout(700); // the bubbles rise into place
    const box = await door.boundingBox();
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, 'the door is partly off the screen');
    assert(box.height >= 44, `the door is ${box.height}px tall`);
    for (const other of ['.bubble-shelf', '.bubble-sensei', '.nav-bar', '#bunki-reports-root .br-rail']) {
      const at = await page.locator(other).first().boundingBox().catch(() => null);
      assert(!overlap(box, at), `the door overlaps ${other}`);
    }
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#orbit-preview-door')?.id || '', [box.x + box.width / 2, box.y + box.height / 2]);
    assert.equal(top, 'orbit-preview-door', 'something covers the door');
    await shot('1-door');
    return `first screen → the galaxy symbol → "${text}" (${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)})`;
  });

  const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
  await check(tag, 'enter', async () => {
    await press(page.locator('#orbit-preview-door'));
    await page.locator('dialog#orbit-preview[open]').waitFor();
    frame = await orbitFrame(page);
    const bar = (await page.locator('.orbit-preview-bar').innerText()).replace(/\s+/g, ' ').trim();
    assert.match(bar, /\bpreview\b/, `the bar reads "${bar}"`);
    const box = await page.locator('#orbit-preview-frame').boundingBox();
    assert(Math.abs(box.x) < 1 && Math.abs(box.width - width) < 1 && box.y + box.height <= height + 1, `the frame is ${JSON.stringify(box)}`);
    assert(box.height >= height - 70, `the bar takes ${Math.round(height - box.height)}px`);
    // The app keeps its one report entry reachable inside every open dialog; here it sits on the bar, never on the instrument.
    const bug = await page.locator('#orbit-preview #bunki-reports-root .br-rail').boundingBox();
    assert(bug && !overlap(bug, box), `the report entry is ${bug ? `at ${JSON.stringify(bug)}, over the frame` : 'not inside the preview'}`);
    assert(!overlap(bug, await page.locator('.orbit-preview-note').boundingBox()), 'the report entry covers the note');
    assert.equal(await page.evaluate(() => document.getElementById('drift-layer').classList.contains('active')), false, 'the galaxy still runs under the preview');
    const inner = await frame.evaluate(() => ({
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      words: window.__meguri.stations.length,
      face: document.fonts.check("400 20px 'Meguri Dela'", '廻'),
      field: [document.querySelector('#live').clientWidth, document.querySelector('#live').clientHeight],
      passed: document.querySelector('#f-passed').textContent,
    }));
    assert.equal(inner.over, 0, `the page is ${inner.over}px wider than its frame`);
    assert.equal(inner.words, 36);
    assert(inner.face, 'the embedded display face is not loaded');
    assert(inner.field[0] >= 300 && inner.field[1] >= 380, `the field is ${inner.field.join('x')}`);
    await page.waitForTimeout(600);
    await shot('2-orbit');
    return `the door → "${bar}"; 36 words on a ${inner.field.join('x')} field; "${inner.passed}"`;
  });

  await check(tag, 'main action: the rings turn and words pass', async () => {
    await press(frame.locator('#b-play'));
    await frame.waitForFunction(() => /^[1-9]\d* passed/.test(document.querySelector('#f-passed').textContent) && document.querySelectorAll('#pad .key').length > 0, null, { timeout: 30000 });
    const seen = await frame.evaluate(() => ({
      foot: document.querySelector('#f-passed').textContent,
      heard: [...document.querySelectorAll('#pad .key')].map((key) => key.textContent),
      pulled: window.__meguri.stations.filter((st) => st.kT < 1).length,
      turn: document.querySelector('#b-play').dataset.on,
      sound: { ...window.__orbitSound },
    }));
    assert.equal(seen.turn, '1');
    assert(seen.pulled >= 1, 'no word was pulled toward the centre');
    assert(seen.sound.webaudio >= 1, 'no string was plucked');
    assert.equal(seen.sound.speech + seen.sound.media, 0, 'a voice spoke although spoken words are off');
    await shot('3-turning');
    return `回 turn → "${seen.foot}", heard ${seen.heard.join(' ')}; ${seen.pulled} word(s) pulled inward; strings asked for ${seen.sound.webaudio} time(s), no voice`;
  });

  await check(tag, 'a word opens and closes', async () => {
    const target = await frame.evaluate(() => {
      const live = document.querySelector('#live'), all = window.__meguri.stations;
      const alone = (a) => all.every((b) => a === b || Math.hypot(a.x - b.x, a.y - b.y) > 60);
      const st = all.find((a) => a.x > 40 && a.y > 40 && a.x < live.clientWidth - 40 && a.y < live.clientHeight - 40 && alone(a));
      return st ? { x: st.x, y: st.y, word: st.w.w, reading: st.w.r } : null;
    });
    assert(target, 'no word stands clear enough to tap');
    await press(frame.locator('#live'), { position: { x: target.x, y: target.y } });
    await frame.locator('#page.in').waitFor();
    await frame.waitForFunction(() => document.querySelector('#p-word').childElementCount > 0 && !!document.querySelector('#p-word').firstElementChild.firstElementChild);
    const shown = await frame.evaluate(() => ({ reading: document.querySelector('#p-reading').textContent, meaning: document.querySelector('#p-meaning').textContent, poster: document.querySelector('#p-word svg, #p-word canvas')?.tagName || '' }));
    assert.equal(shown.reading, target.reading, `tapped ${target.word}, the page reads ${shown.reading}`);
    assert(shown.meaning.length > 2 && shown.poster, 'the word page has no meaning or no poster');
    await page.waitForTimeout(700);
    // The tap that opens a word must not also press what the page puts under the finger (the poster's face, a kanji row).
    const after = await frame.evaluate(() => ({ face: window.__meguri.state.face || '', toast: document.querySelector('#toast').classList.contains('show') ? document.querySelector('#toast').textContent : '', rows: document.querySelectorAll('#p-kanji li.open').length }));
    assert.deepEqual(after, { face: '', toast: '', rows: 0 }, `the opening tap also pressed the page: ${JSON.stringify(after)}`);
    await shot('4-word');
    await press(frame.locator('#p-back'));
    await frame.waitForFunction(() => document.querySelector('#page').hidden);
    return `tapped ${target.word} on its ring → its page (${shown.reading}, "${shown.meaning}", ${shown.poster.toLowerCase()} poster) → back to the rings`;
  });

  await check(tag, 'return', async () => {
    await press(page.locator('#orbit-preview-back'));
    await page.locator('#orbit-preview').waitFor({ state: 'detached' });
    await page.locator('#ginga-symbol').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'orbit-preview-door', 'focus did not return to the door');
    assert.equal(await page.evaluate(() => document.getElementById('drift-layer').classList.contains('active')), true, 'the galaxy did not wake');
    const after = await page.evaluate(() => ({ keys: Object.keys(localStorage).sort(), own: JSON.parse(localStorage.getItem('meguri.v1') || 'null'), view: document.body.dataset.view }));
    const added = after.keys.filter((key) => !keysBefore.includes(key));
    assert.deepEqual(added, ['meguri.v1'], `storage keys added: ${added.join(', ') || 'none'}`);
    assert(Object.values(after.own.p).some((n) => n >= 1), 'the passes were not kept');
    await press(page.locator('#orbit-preview-door'));
    const again = await orbitFrame(page);
    const kept = await again.evaluate(() => document.querySelector('#f-passed').textContent);
    assert.match(kept, /^[1-9]\d* passed/, `opened again, it reads "${kept}"`);
    if (device === 'desktop') await page.keyboard.press('Escape'); else await press(page.locator('#orbit-preview-back'));
    await page.locator('#orbit-preview').waitFor({ state: 'detached' });
    await press(page.locator('.nav-scrim'), { position: { x: 8, y: Math.round(height / 2) } });
    await page.locator('#orbit-preview-door').waitFor({ state: 'detached' });
    await page.locator('#home-review').waitFor();
    assert.equal(await page.evaluate(() => document.querySelector('#bunki-reports-root')?.parentElement?.tagName), 'BODY', 'the report entry did not come back to the app');
    await shot('5-back');
    return `Back → the menu as it was (view "${after.view}", focus on the door); the only new stored key is meguri.v1; opened again it still reads "${kept}"; ${device === 'desktop' ? 'Escape' : 'Back'} closes it; the menu closes to the first screen`;
  });

  await check(tag, 'no errors', async () => {
    assert.deepEqual(log.problems, []);
    return `${log.requests.length} requests, all to the site's own address; no console error, uncaught error, failed request or HTTP error`;
  });
  await s.context.close();
}

/** The side roads, once per engine: the layout under test, the Japanese interface, and the voice switch. */
async function sideRoads(engine, browser, origin) {
  const tag = `${engine}/side`;
  await check(tag, 'door in the five-places layout (phone)', async () => {
    const s = await session(browser, origin, 'phone', '?layout=places');
    await s.press(s.page.locator('#ginga-symbol'));
    const door = s.page.locator('#orbit-preview-door');
    await door.waitFor();
    await s.page.waitForTimeout(700);
    const box = await door.boundingBox();
    for (const other of ['.bubble-sensei', '.nav-bar', '#bunki-reports-root .br-rail']) {
      assert(!overlap(box, await s.page.locator(other).first().boundingBox().catch(() => null)), `the door overlaps ${other}`);
    }
    const text = (await door.innerText()).replace(/\s+/g, ' ').trim();
    await s.page.screenshot({ path: resolve(evidence, `${engine}-phone-places-door.png`) });
    assert.deepEqual(s.log.problems, []);
    await s.context.close();
    return `"${text}" stands clear of the five places and the tutor`;
  });
  await check(tag, 'the Japanese interface still says "preview" (phone)', async () => {
    const s = await session(browser, origin, 'phone', '?ui=ja');
    await s.press(s.page.locator('#ginga-symbol'));
    const door = s.page.locator('#orbit-preview-door');
    await door.waitFor();
    const text = (await door.innerText()).replace(/\s+/g, ' ').trim();
    assert.match(text, /廻.*\bpreview\b/, `the door reads "${text}"`);
    await s.press(door);
    await orbitFrame(s.page);
    const bar = (await s.page.locator('.orbit-preview-bar').innerText()).replace(/\s+/g, ' ').trim();
    assert.match(bar, /戻る.*\bpreview\b/, `the bar reads "${bar}"`);
    await s.press(s.page.locator('#orbit-preview-back'));
    await s.page.locator('#orbit-preview').waitFor({ state: 'detached' });
    assert.deepEqual(s.log.problems, []);
    await s.context.close();
    return `door "${text}", bar "${bar}"`;
  });
  await check(tag, 'spoken words only with ?orbitVoice=1 (desktop)', async () => {
    const s = await session(browser, origin, 'desktop', '?orbitVoice=1');
    await s.press(s.page.locator('#ginga-symbol'));
    await s.press(s.page.locator('#orbit-preview-door'));
    const frame = await orbitFrame(s.page);
    const bar = (await s.page.locator('.orbit-preview-bar').innerText()).replace(/\s+/g, ' ').trim();
    assert.doesNotMatch(bar, /voice off/);
    await frame.evaluate(() => window.__meguri.openPage(window.__meguri.stations[0]));
    await frame.locator('#page.in').waitFor();
    await s.press(frame.locator('#p-say'));
    await frame.waitForFunction(() => window.__orbitSound.speech + window.__orbitSound.media > 0);
    const sound = await frame.evaluate(() => ({ ...window.__orbitSound }));
    assert.deepEqual(s.log.problems, []);
    await s.context.close();
    return `with the switch the bar reads "${bar}" and 声 asks for a voice (${sound.media} clip, ${sound.speech} device utterance)`;
  });
}

const host = await startStaticHost({ site, port: 0 });
let failure;
try {
  for (const engine of engines) {
    const browser = await ENGINES[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
    try {
      for (const device of Object.keys(DEVICES)) await walk(engine, browser, host.origin, device);
      await sideRoads(engine, browser, host.origin);
    } finally { await browser.close(); }
  }
} catch (error) { failure = error; console.error(error); }
finally { await host.close(); }
const failed = rows.filter((row) => !row.pass).length + (failure ? 1 : 0);
writeFileSync(resolve(evidence, 'result.json'), JSON.stringify({ status: failed ? 'FAIL' : 'PASS', site, engines, error: failure ? String(failure.stack || failure) : undefined, results: rows }, null, 2) + '\n');
console.log(`${rows.length - rows.filter((row) => !row.pass).length}/${rows.length} checks · ${failed ? 'failed' : 'passed'}`);
process.exit(failed ? 1 : 0);
