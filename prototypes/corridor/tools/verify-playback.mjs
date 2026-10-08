/** Real reader navigation with deterministic browser audio doubles. These probes establish playback
 * lifecycle behaviour, not voice or codec quality.
 * The voice is locked (operator's blind audition, 2026-09-29): Google Gemini TTS Kore reads and Charon
 * is the second speaker. F1 is withdrawn. There is no device voice, no voice picker and no interim
 * voice. Until the Kore clips ship, index.html raises no narration flag and the reader's play bar is a
 * quiet 音声準備中 · Kore line with nothing to press: that shipped state is checked as the build serves
 * it. The bar's own lifecycle — play, pause, restart, a failed clip, a passage switch, a late manifest —
 * is checked on the same code with a synthetic Kore narration manifest (the test raises the flag; an
 * Audio double answers every clip): the bar Kore will use, before its clips exist. Answer-card 音 follows
 * the same roster: a word manifest voiced in Kore plays; a stored interim voice, or a word recorded only
 * in interim voices, plays nothing and says why.
 * Every case writes a named row, fixture failures included; the JSON is written from the finally, so a
 * crash still leaves a receipt. The speech double must never be called, in any case.
 *
 * Discriminating controls (one-line source mutants of corridor.js; each must fail the named case):
 *   stale-clip restart         → speakPassage's `current` drops its generation (`() => readAloud.on`):
 *                                the stopped read's late onended asks for a third clip
 *   passage switch             → delete openPassage's `stopReadAloud();`: the clip keeps playing
 *   withdrawn manifest         → drop `!Object.hasOwn(NARRATION_VOICES, value.voice) ||` from
 *                                approvedNarrationManifest: an F1 manifest opens the bar
 *   interim card voice         → recVoicePref returns any stored value: a stored アミ plays her clip
 *   pending grade/undo/leave   → delete `if (serial !== cardAudioSerial) return;` in speakCardReading
 *   playing grade / leave      → delete `if (!readAloud.on) stopRecAudio();` in retireCardAudioOnFaceChange
 *   late page error            → throw an uncaught error from the page during the final observation:
 *                                the receipt must carry a '· late page errors' row and exit nonzero */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
// verify-corridor.mjs resolves the site when it loads, so it is imported inside the receipt's try
let CORRIDOR_DIR = null, startCorridorServer;
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

const out = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/playback'));
mkdirSync(out, { recursive: true });
const filter = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
// server and browser start inside the receipt's try below, so a launch failure still writes JSON
let server = null, base = null, browser = null;
const results = [];
// synthetic Kore narration: yasashii:7 has three clips, so a stop at the second is visible as a third never asked for
const kore = (passage, n) => Array.from({ length: n }, (_, i) =>
  ({ text: `${passage} sentence ${i + 1}`, src: `audio/narration/kore/${passage.replace(':', '_')}-${String(i).padStart(3, '0')}.m4a` }));
const narration = { v: 1, voice: 'kore', articles: { 'yasashii:7': { clips: kore('yasashii:7', 3) }, 'yasashii:6': { clips: kore('yasashii:6', 2) } } };
// yasashii:7 absent from a manifest that exists: the article is simply not narrated yet
const partialNarration = { v: 1, voice: 'kore', articles: { 'yasashii:6': { clips: kore('yasashii:6', 2) } } };
// the withdrawn F1 voice, shaped exactly like an approved manifest: it must never open the bar
const withdrawnNarration = { v: 1, voice: 'f1', articles: { 'yasashii:7': { clips: kore('yasashii:7', 3)
  .map((clip) => ({ ...clip, src: clip.src.replace('/kore/', '/f1/') })) } } };
// two answer cards whose words are recorded in the approved voice (ids from the shipped manifest)
const CARD_WORDS = [['会う', 'f4c916752a'], ['青', '1ca69c4be0']];
const cardManifest = (voices) => ({ v: 1, words: Object.fromEntries(CARD_WORDS.map(([word, id]) => [word, { id, voices }])), sentences: {} });
const MODES = {
  // the build as it ships: no narration flag, the shipped word manifest
  quiet: {},
  narration: { narration },
  'narration-delayed': { narration, hold: true },
  'narration-delayed-fail': { narration: 404, hold: true },
  'narration-partial': { narration: partialNarration },
  'narration-withdrawn': { narration: withdrawnNarration },
  card: { words: cardManifest(['kore']) },
  'card-held': { words: cardManifest(['kore']), hold: true },
  // a legacy stored voice that is no longer on the roster: it reads as Kore
  'card-invalid': { words: cardManifest(['kore']), pref: 'bogus' },
  // interim voices only, and a stored interim choice: nothing plays
  'card-interim': { words: cardManifest(['ami', 'zundamon']), pref: 'ami' },
};
const NARRATION_PATH = '/audio/article-narration.json';

async function fixture(mode) {
  const spec = MODES[mode];
  assert(spec, `unknown fixture mode ${mode}`);
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' });
  let release;
  const ready = new Promise((done) => { release = done; });
  // owned from the first line after the context exists: any later throw closes this context
  const errors = [];
  const f = { context, page: null, errors, release, narrationAsked: 0, manifestServed: false, manifestArrived: false };
  try {
    if (!spec.hold) release();
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.endsWith(NARRATION_PATH)) {
        f.narrationAsked += 1;
        f.manifestArrived = true;
        await ready;
        if (spec.narration === 404 || !spec.narration) await route.fulfill({ status: 404, body: '' });
        else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(spec.narration) });
        f.manifestServed = true;
        return;
      }
      if (url.pathname.endsWith('/audio/manifest.json') && spec.words) {
        f.manifestArrived = true;
        await ready;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(spec.words) });
        f.manifestServed = true;
        return;
      }
      return route.continue();
    });
    // the test, not index.html, raises the narration flag: the shipped build keeps it down
    if (spec.narration) await context.addInitScript(() => { window.__KAIRO_NARRATION__ = 1; });
    if (spec.pref) {
      await context.addInitScript((value) => {
        if (sessionStorage.getItem('playback-pref-seeded')) return;
        try { localStorage.setItem('kairo-rec-voice-v1', value); sessionStorage.setItem('playback-pref-seeded', '1'); } catch { /* double */ }
      }, spec.pref);
    }
    if (spec.words) {
      // two fresh answer cards, due now, through the same legacy seed the voice-picker suite uses
      await context.addInitScript((words) => {
        if (localStorage.getItem('playback-cards-seeded')) return;
        const t = 1700000000000;
        localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1,
          taken: words.map((word, i) => ({ t: 'word', id: word, label: word, ts: t + i, started: t + i })), srs: {}, revlog: [], obslog: [] }));
        localStorage.setItem('playback-cards-seeded', '1');
      }, CARD_WORDS.map(([word]) => word));
    }
    // The app parses a manifest with Response.json(); its cache assignment and any waiting
    // continuation are promise reactions of that parse, so a task queued when the parse settles runs
    // only after them. A refused narration manifest is never parsed: its consumption signal is a task
    // queued when the fetch itself settles, after the app's synchronous null path has run.
    await context.addInitScript(() => {
      const signal = (key) => {
        const channel = new window.MessageChannel();
        channel.port1.onmessage = () => { window[key] = (window[key] || 0) + 1; channel.port1.close(); };
        channel.port2.postMessage(0);
      };
      const path = (url) => { try { return new URL(url, location.href).pathname; } catch { return ''; } };
      const nativeJson = Response.prototype.json;
      Response.prototype.json = function () {
        const parsed = Reflect.apply(nativeJson, this, []);
        const at = path(this.url);
        if (at.endsWith('/audio/manifest.json')) parsed.then(() => signal('__manifestConsumed'), () => {});
        if (at.endsWith('/audio/article-narration.json')) parsed.then(() => signal('__narrationConsumed'), () => {});
        return parsed;
      };
      const nativeFetch = window.fetch;
      window.fetch = function (input, init) {
        const pending = Reflect.apply(nativeFetch, this, [input, init]);
        if (path(typeof input === 'string' ? input : input?.url).endsWith('/audio/article-narration.json'))
          pending.then((response) => { if (!response.ok) signal('__narrationConsumed'); }, () => signal('__narrationConsumed'));
        return pending;
      };
    });
    await context.addInitScript(() => {
      const audio = { utterances: [], clips: [], cancels: 0 };
      window.__playbackFixture = audio;
      Object.defineProperty(window, '__KAIRO_AUDIO__', { value: true, writable: false });
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [{ lang: 'ja-JP', name: 'Synthetic Japanese', voiceURI: 'fixture', localService: true }],
        addEventListener() {},
        speak(utterance) { audio.utterances.push(utterance); },
        cancel() { audio.cancels += 1; },
      } });
      window.Audio = class {
        constructor(src) { this.src = src; this.paused = true; audio.clips.push(this); }
        play() { this.paused = false; this.onplay?.(); return Promise.resolve(); }
        pause() { this.paused = true; }
      };
    });
    const page = await context.newPage();
    f.page = page;
    page.on('pageerror', (error) => { if (errors.length < 20) errors.push(error.message); });
    await page.goto(`${base}/index.html?entry=shelf&ui=bi`);
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    if (spec.words) {
      await page.locator('#tray').click();
      await page.locator('#review-start').click();
      await page.locator('#reveal').click();
      await page.waitForSelector('#card-say', { timeout: 10000 });
    } else {
      await openPassage(page);
    }
  } catch (error) {
    // the fixture's own failure is a named row with its page errors, never a lost receipt
    error.fixture = f;
    throw error;
  }
  return f;
}
async function openPassage(page) {
  await page.locator('[data-passage="yasashii:7"] .shelf-open').click();
  await page.waitForSelector('#reader .glossary-ref');
}

async function press(page) { await page.locator('#listen-toggle').click(); }
/** The shut bar: the quiet pending line, with no play control to press and no picker. */
const barShut = (page) => page.evaluate(() => !document.querySelector('#listen-toggle') && !document.querySelector('#listen-voice')
  && !!document.querySelector('.listen-row.is-pending #listen-note'));
const PENDING = /^no recording yet · Kore$/u;
const FAILED = /could not play|再生できませんでした/u;
async function counts(page) {
  return page.evaluate(() => ({
    utterances: window.__playbackFixture.utterances.map((u) => u.text),
    clips: window.__playbackFixture.clips.map((a) => ({ src: a.src, paused: a.paused })),
    cancels: window.__playbackFixture.cancels,
    pressed: document.querySelector('#listen-toggle')?.getAttribute('aria-pressed'),
    note: document.querySelector('#listen-note')?.textContent,
    progress: document.querySelector('#listen-progress')?.getAttribute('aria-valuenow') ?? null,
  }));
}
async function switchPassage(page) {
  await page.locator('#reader [data-glossary-ref="yasashii:6"]').click();
  await page.waitForFunction(() => document.querySelector('h1.view-title')?.textContent === '印鑑登録証明書' && document.querySelector('#reader .tok'));
}
async function started(page, type, length = 1) {
  await page.waitForFunction(({ type, length }) => window.__playbackFixture[type].length === length, { type, length }, { timeout: 5000 });
}
/** The app consumed the held manifest and ran every reaction waiting on it (see the hooks above). */
async function manifestSettled(f, key = '__manifestConsumed') {
  await f.page.waitForFunction((key) => window[key] > 0, key, { timeout: 5000 })
    .catch(() => { throw new Error(`the app never consumed the manifest (served=${f.manifestServed})`); });
}
/** Positive control inside a retirement test: a fresh tap on the current face does play once. */
async function freshTapPlays(page) {
  await page.locator('#card-say').click();
  await started(page, 'clips');
  await page.evaluate(() => new Promise((done) => setTimeout(done, 100)));
  const state = await cardState(page);
  assert.equal(state.clips.length, 1, 'exactly one clip: the fresh tap, never the retired one');
  assert.match(state.clips[0].src, new RegExp(`^audio/w/kore/(${CARD_WORDS.map(([, id]) => id).join('|')})\\.m4a$`),
    'the fresh tap plays a seeded word in the approved voice');
}
const cardState = (page) => page.evaluate(() => ({
  view: document.body.dataset.view,
  clips: window.__playbackFixture.clips.map((a) => ({ src: a.src, paused: a.paused })),
  utterances: window.__playbackFixture.utterances.length,
  speaking: document.querySelectorAll('.say.is-speaking').length,
  sayNote: document.querySelector('#card-say-note')?.textContent ?? null,
  unrevealed: !!document.querySelector('#reveal'),
}));
async function check(name, mode, body, { learnerRecord = 'untouched' } = {}) {
  if (filter && name !== filter) return;
  let f = null;
  try {
    if (!browser) throw new Error('browser not started');
    f = await fixture(mode);
    await body(f);
    if (learnerRecord === 'untouched') {
      const record = await readAppRecord(f.page);
      assert.deepEqual(record.taken || [], [], 'listening never promotes a card');
      assert.deepEqual(record.srs || {}, {}, 'listening never schedules a review');
      assert.deepEqual(record.revlog || [], [], 'listening never grades a review');
    }
    // invariants of every case, from one final observation that the passing row also records
    const final = await counts(f.page);
    assert.equal(final.utterances.length, 0, 'the device voice is never called, in any case');
    assert.deepEqual(f.errors, [], 'no uncaught application errors');
    results.push({ name, pass: true, observed: final });
    console.log(`  ok  ${name}`);
  } catch (error) {
    const stage = f ? 'body' : 'fixture';
    f ||= error.fixture || null;
    results.push({ name, pass: false, stage, error: error.message, stack: error.stack,
      pageErrors: f?.errors || [], observed: f?.page ? await counts(f.page).catch((e) => ({ unreadable: e.message })) : null });
    console.error(` FAIL ${name}: ${error.message}`);
    if (f?.page) await f.page.screenshot({ path: resolve(out, `${name}.png`) }).catch(() => {});
  } finally {
    f?.release();
    // a context that will not close is a named failure, not a silent one
    const seen = f ? f.errors.length : 0;
    if (f) await f.context.close().catch((error) => results.push({ name: `${name} · cleanup`, pass: false, error: error.message }));
    // a page error raised during the final observation or the close is still this case's failure
    const row = results.findLast((entry) => entry.name === name);
    if (f && (f.errors.length > seen || (row?.pass && f.errors.length))) {
      results.push({ name: `${name} · late page errors`, pass: false, pageErrors: f.errors.slice() });
    }
  }
}

try {
  ({ CORRIDOR_DIR, startCorridorServer } = await import('./verify-corridor.mjs'));
  ({ server, base } = await startCorridorServer());
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  // --- the shipped state: no narration flag, no approved clip ---
  await check('the-shipped-play-bar-is-a-quiet-pending-line-and-silent', 'quiet', async (f) => {
    const { page } = f;
    assert.equal(await barShut(page), true, 'no play control and no picker: the quiet pending line');
    const before = await counts(page);
    assert.match(before.note, PENDING, 'the line names the locked voice');
    assert.match(before.note, /no recording yet/u, 'and says, in English, that no recording exists yet');
    await page.locator('#listen-note').click({ force: true });
    await page.waitForTimeout(350);
    const after = await counts(page);
    assert.equal(after.clips.length, 0, 'nothing plays');
    assert.equal(f.narrationAsked, 0, 'a build without the flag never asks for narration');
    assert.equal(await page.evaluate(() => localStorage.getItem('kairo-rec-voice-v1')), null, 'no preference is written');
  });
  await check('a-withdrawn-voice-manifest-cannot-open-the-bar', 'narration-withdrawn', async (f) => {
    const { page } = f;
    await manifestSettled(f, '__narrationConsumed');
    assert.equal(f.narrationAsked, 1, 'the raised flag fetched the manifest');
    assert.equal(await barShut(page), true, 'an F1 manifest is refused: the bar stays the pending line');
    assert.match((await counts(page)).note, PENDING);
    assert.equal((await counts(page)).clips.length, 0);
  });
  await check('an-unnarrated-article-in-a-present-manifest-is-the-pending-line', 'narration-partial', async (f) => {
    const { page } = f;
    await manifestSettled(f, '__narrationConsumed');
    assert.equal(await barShut(page), true, 'yasashii:7 has no clip: nothing to press');
    assert.match((await counts(page)).note, PENDING);
    // positive control: the narrated article beside it opens its bar in the locked voice
    await switchPassage(page);
    assert.equal(await barShut(page), false, 'yasashii:6 is narrated: its bar opens');
    assert.equal((await counts(page)).note, 'Kore');
    assert.equal((await counts(page)).clips.length, 0);
  });

  // --- the bar's lifecycle, on the synthetic Kore manifest ---
  // reader lane 2026-10-02: the floating sentence bar is gone; what floats over the text now is the tapped word's popup
  await check('approved-player-is-touch-sized-and-clear-of-the-word-popup-on-phones', 'narration', async ({ page }) => {
    const measure = () => page.evaluate(() => {
      const bar = document.querySelector('.listen-row.play-bar').getBoundingClientRect();
      const popup = document.querySelector('#mini').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('#listen-toggle, #listen-rate')].map(node => {
        const r = node.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { id: node.id, width: r.width, height: r.height, left: r.left, right: r.right,
          top: r.top, bottom: r.bottom, reachable: hit === node || node.contains(hit) };
      });
      return { viewport: innerWidth, bar: { top: bar.top, bottom: bar.bottom }, popup: { top: popup.top, bottom: popup.bottom }, buttons,
        valid: buttons.length === 2 && buttons.every(r => r.width >= 44 && r.height >= 44 &&
          r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.reachable) &&
          popup.bottom <= bar.top && bar.bottom <= innerHeight };
    });
    const measurements = [];
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      // a popup left from the wider screen goes first: Escape on its word
      await page.locator('#reader .tok').first().focus();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('mini'));
      await page.locator('#reader .tok').first().click();
      await page.locator('#mini').waitFor({ state: 'visible' });
      const observed = await measure();
      measurements.push(observed);
      writeFileSync(resolve(out, 'phone-player-geometry.json'), JSON.stringify(measurements, null, 2));
      assert.equal(observed.valid, true, JSON.stringify(observed));
      await page.screenshot({ path: resolve(out, `phone-player-${width}.png`) });
    }
    const small = await page.addStyleTag({ content: '#listen-toggle { width:20px!important; min-width:20px!important; height:20px!important; min-height:20px!important; }' });
    assert.equal((await measure()).valid, false, 'the same check rejects a small play target');
    await small.evaluate(node => node.remove());
    const overlap = await page.addStyleTag({ content: '#mini { top:auto!important; bottom:0!important; }' });
    assert.equal((await measure()).valid, false, 'the same check rejects a popup covering the player');
    await overlap.evaluate(node => node.remove());
    assert.equal((await measure()).valid, true, 'removing the controls restores the usable layout');
  });
  await check('stale-clip-events-cannot-change-a-restarted-read', 'narration', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await press(page);
    await press(page);
    await started(page, 'clips', 2);
    await page.evaluate(() => {
      const old = window.__playbackFixture.clips[0];
      old.onended?.();
      old.onerror?.();
    });
    await page.waitForTimeout(350);
    const active = await counts(page);
    assert.equal(active.clips.length, 2, 'a stale clip cannot advance the restarted read');
    assert.equal(active.pressed, 'true');
    assert.doesNotMatch(active.note, FAILED, 'a stale failure does not stop the live read');
    await page.evaluate(() => window.__playbackFixture.clips[1].onended());
    await started(page, 'clips', 3);
    assert.match((await counts(page)).clips[2].src, /yasashii_7-001\.m4a$/u);
  });
  await check('reader-settings-keep-the-active-recording-playing', 'narration', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.locator('#dials-toggle').click();
    const after = await counts(page);
    assert.equal(after.pressed, 'true');
    assert.equal(after.clips.length, 1);
    assert.equal(after.clips[0].paused, false);
  });
  await check('passage-switch-pauses-recording-and-ignores-late-error', 'narration', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await switchPassage(page);
    assert.equal((await counts(page)).clips[0].paused, true);
    assert.equal((await counts(page)).pressed, 'false');
    await press(page);
    await started(page, 'clips', 2);
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await page.waitForTimeout(350);
    const active = await counts(page);
    assert.equal(active.pressed, 'true');
    assert.doesNotMatch(active.note, FAILED, 'the old article’s failure is not this read’s');
    assert.equal(active.clips.length, 2);
    await page.evaluate(() => window.__playbackFixture.clips[1].onended());
    await started(page, 'clips', 3);
    assert.match((await counts(page)).clips[2].src, /yasashii_6-001\.m4a$/u);
  });
  await check('late-manifest-opens-listen-for-the-current-passage', 'narration-delayed', async (f) => {
    const { page, release } = f;
    assert.equal(await barShut(page), true, 'while narration loads the bar is the pending line');
    await switchPassage(page);
    release();
    await page.waitForSelector('#listen-toggle', { timeout: 5000 });
    await press(page);
    await started(page, 'clips');
    const active = await counts(page);
    assert.equal(active.clips.length, 1);
    assert.match(active.clips[0].src, /yasashii_6-000\.m4a$/u);
    assert.equal(active.pressed, 'true');
  });
  await check('a-press-on-the-pending-line-starts-nothing-later', 'narration-delayed', async (f) => {
    const { page, release } = f;
    await page.locator('#listen-note').click({ force: true });
    release();
    await manifestSettled(f, '__narrationConsumed');
    await page.waitForSelector('#listen-toggle', { timeout: 5000 });
    await page.waitForTimeout(350);
    const after = await counts(page);
    assert.equal(after.pressed, 'false', 'the opened bar waits for its own press');
    assert.equal(after.clips.length, 0);
  });
  await check('current-recording-failure-stops-with-a-reason-and-no-device-voice', 'narration', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await page.waitForFunction(() => document.querySelector('#listen-toggle')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
    const after = await counts(page);
    assert.match(after.note, FAILED, 'the failure is named');
  });
  await check('first-clip-ends-second-clip-errors-stops-with-a-reason', 'narration', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onended());
    await started(page, 'clips', 2);
    await page.evaluate(() => window.__playbackFixture.clips[1].onerror());
    await page.waitForFunction(() => document.querySelector('#listen-toggle')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
    await page.evaluate(() => new Promise((done) => setTimeout(done, 600)));
    const after = await counts(page);
    assert.equal(after.clips.length, 2, 'the read stops at the failed sentence; the third clip is never requested');
    assert.match(after.clips[1].src, /yasashii_7-001\.m4a$/u);
    assert.match(after.note, FAILED, 'a mid-passage failure is named');
  });
  await check('a-failure-note-does-not-follow-to-another-article', 'narration', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await page.waitForFunction((re) => new RegExp(re, 'u').test(document.querySelector('#listen-note')?.textContent || ''), FAILED.source, { timeout: 5000 });
    await switchPassage(page);
    const other = await counts(page);
    assert.doesNotMatch(other.note, FAILED, 'yasashii:6 never failed; it must not inherit yasashii:7\'s note');
    assert.equal(other.note, 'Kore', 'the other article names its voice');
    assert.equal(await barShut(page), false, 'the other narrated article stays playable');
  });
  await check('listening-again-after-a-failure-clears-the-note-and-resumes-at-that-sentence', 'narration', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onended());
    await started(page, 'clips', 2);
    await page.evaluate(() => window.__playbackFixture.clips[1].onerror());
    await page.waitForFunction((re) => new RegExp(re, 'u').test(document.querySelector('#listen-note')?.textContent || ''), FAILED.source, { timeout: 5000 });
    await press(page);
    await started(page, 'clips', 3);
    const after = await counts(page);
    assert.doesNotMatch(after.note, FAILED, 'a new press is a fresh start, not the old failure');
    assert.equal(after.pressed, 'true');
    assert.match(after.clips[2].src, /yasashii_7-001\.m4a$/u, 'the read resumes at the sentence that failed');
  });
  await check('a-complete-read-returns-the-bar-to-its-start-and-writes-no-preference', 'narration', async ({ page }) => {
    await press(page);
    for (let clip = 0; clip < 3; clip += 1) {
      await started(page, 'clips', clip + 1);
      await page.evaluate((clip) => window.__playbackFixture.clips[clip].onended(), clip);
    }
    await page.waitForFunction(() => document.querySelector('#listen-toggle')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
    const done = await counts(page);
    assert.equal(done.clips.length, 3, 'three sentences, three clips, nothing more');
    assert.equal(done.progress, '0', 'the bar is back at its start');
    assert.equal(done.note, 'Kore');
    assert.equal(await page.evaluate(() => localStorage.getItem('kairo-rec-voice-v1')), null, 'listening writes no voice preference');
    await press(page);
    await started(page, 'clips', 4);
    assert.match((await counts(page)).clips[3].src, /yasashii_7-000\.m4a$/u, 'the next read starts at the first sentence');
  });
  for (const [name, mode, expect] of [
    ['a-late-manifest-refreshes-the-row-and-keeps-focus-and-place', 'narration-delayed', { shut: false, note: /^Kore$/u }],
    ['a-late-manifest-failure-settles-the-row-and-keeps-focus-and-place', 'narration-delayed-fail', { shut: true, note: PENDING }],
  ]) {
    await check(name, mode, async (f) => {
      const { page, release } = f;
      assert.match((await counts(page)).note, PENDING, 'the row starts as the pending line while narration loads');
      const before = await page.evaluate(() => {
        const refs = [...document.querySelectorAll('#reader .glossary-ref')];
        const target = refs[Math.min(1, refs.length - 1)];
        target.dataset.focusProbe = '1';
        target.focus();
        return { focused: document.activeElement === target, top: target.getBoundingClientRect().top,
          row: document.querySelector('.listen-row')?.getBoundingClientRect().height ?? 0, passage: document.querySelector('h1.view-title')?.textContent };
      });
      assert.equal(before.focused, true, 'the probe holds focus before the manifest settles');
      release();
      await manifestSettled(f, '__narrationConsumed');
      if (!expect.shut) await page.waitForSelector('#listen-toggle', { timeout: 5000 });
      const after = await page.evaluate(() => ({
        focusKept: document.activeElement?.dataset?.focusProbe === '1' && document.activeElement.isConnected,
        top: document.querySelector('[data-focus-probe="1"]')?.getBoundingClientRect().top ?? NaN,
        row: document.querySelector('.listen-row')?.getBoundingClientRect().height ?? 0, passage: document.querySelector('h1.view-title')?.textContent,
        note: document.querySelector('#listen-note')?.textContent || '',
      }));
      assert.equal(after.focusKept, true, 'the focused glossary control is the same node, still focused');
      // the only movement allowed is the listen row's own change of height (scroll anchoring may absorb even that)
      const allowed = Math.abs(after.row - before.row) + 2;
      assert.ok(Math.abs(after.top - before.top) <= allowed, `reading place kept (probe top ${before.top} → ${after.top}, allowed ${allowed})`);
      assert.equal(after.passage, before.passage, 'no navigation');
      assert.equal(await barShut(page), expect.shut);
      assert.match(after.note, expect.note);
      assert.equal((await counts(page)).clips.length, 0);
    });
  }

  // --- answer-card 音: the same roster; a clip belongs to the face that asked ---
  await check('a-stored-interim-voice-plays-no-answer-card-and-says-why', 'card-interim', async ({ page }) => {
    await page.locator('#card-say').click();
    // settled either way: a named reason, or (the failure this case exists for) a clip
    await page.waitForFunction(() => /Kore/u.test(document.querySelector('#card-say-note')?.textContent || '')
      || window.__playbackFixture.clips.length > 0, null, { timeout: 5000 });
    const after = await cardState(page);
    assert.equal(after.clips.length, 0, 'a word recorded only in interim voices never plays');
    assert.match(after.sayNote, /Kore の声を準備中|The Kore voice is on its way/u, 'the card names the voice it waits for');
    assert.equal(await page.evaluate(() => localStorage.getItem('kairo-rec-voice-v1')), 'ami', 'the old stored choice is left intact');
  }, { learnerRecord: 'graded' });
  await check('an-invalid-stored-voice-reads-as-kore', 'card-invalid', async ({ page }) => {
    await freshTapPlays(page);
  }, { learnerRecord: 'graded' });
  await check('pending-card-audio-is-retired-by-grade-and-undo', 'card-held', async (f) => {
    const { page } = f;
    const before = await readAppRecord(page);
    const cardKey = await page.evaluate(() => window.__KAIRO_SRS__.current());
    assert.ok(cardKey, 'the answer card is the one on the glass');
    await page.locator('#card-say').click();
    await page.locator('.grade.g-again').click();
    const graded = await waitForAppRecord(page, record => record.revlog.length === before.revlog.length + 1
      && record.revlog.at(-1)?.[1] === cardKey && record.revlog.at(-1)?.[2] === 1,
    { timeout: 10000, description: 'Again grade before pending-audio undo' });
    await page.locator('#reveal:not(:disabled)').waitFor({ state: 'visible', timeout: 10000 });
    // On the next card, undo is behind the real More door.
    await page.locator('#zen-more').click();
    await page.waitForSelector('.review-undo', { timeout: 10000 });
    await page.locator('.review-undo').click();
    await waitForAppRecord(page, record => record.revlog.length === graded.revlog.length + 1
      && record.revlog.at(-1)?.[1] === cardKey && record.revlog.at(-1)?.[2] === 0
      && record.revlog.at(-1)?.[3] === before.revlog.length,
    { timeout: 10000, description: 'durable revocation of the pending-audio grade' });
    // the only grade is taken back: no undo chip, and the first card is up again, unrevealed
    await page.waitForFunction(() => !document.querySelector('.review-undo') && !!document.querySelector('#reveal'), null, { timeout: 10000 });
    assert.equal(f.manifestArrived, true, 'the manifest request is being held before release');
    f.release();
    await manifestSettled(f);
    const after = await cardState(page);
    assert.equal(after.clips.length, 0, 'the retired request never plays, even after undo restores that card');
    assert.equal(after.speaking, 0); assert.equal(after.utterances, 0);
    await page.locator('#reveal').click();
    await page.waitForSelector('#card-say');
    await freshTapPlays(page);
  }, { learnerRecord: 'graded' });
  await check('pending-card-audio-is-retired-by-leaving-review', 'card-held', async (f) => {
    const { page } = f;
    await page.locator('#card-say').click();
    await page.goBack();
    await page.waitForFunction(() => location.pathname.endsWith('/index.html') && document.body.dataset.ready === '1'
      && document.body.dataset.view !== 'review', null, { timeout: 10000 });
    assert.equal(f.manifestArrived, true, 'the manifest request is being held before release');
    f.release();
    await manifestSettled(f);
    const after = await cardState(page);
    assert.equal(after.clips.length, 0, 'leaving retires the request');
    assert.equal(after.utterances, 0);
    // positive control: back in review, a fresh tap plays exactly once
    await page.locator('#tray').click();
    await page.locator('#review-start').click();
    await page.locator('#reveal').click();
    await page.waitForSelector('#card-say');
    await freshTapPlays(page);
  }, { learnerRecord: 'graded' });
  await check('playing-card-audio-stops-on-grade-and-late-events-leave-the-next-card-alone', 'card', async ({ page }) => {
    await page.locator('#card-say').click();
    await started(page, 'clips');
    await page.locator('.grade.g-again').click();
    await page.waitForFunction(() => !!document.querySelector('#reveal'), null, { timeout: 10000 });
    let now = await cardState(page);
    assert.equal(now.clips[0].paused, true, 'the playing clip stops when its card is graded');
    await page.locator('#reveal').click();
    await page.waitForSelector('#card-say');
    // only the error: an earlier onended would resolve the clip first and hide the failure continuation
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror?.());
    await page.evaluate(() => new Promise((done) => setTimeout(done, 200)));
    now = await cardState(page);
    assert.equal(now.clips.length, 1, 'no late event starts anything');
    assert.equal(now.speaking, 0, 'the next card is not marked speaking');
    assert.equal(now.sayNote, '', 'the next card carries no stale reason');
  }, { learnerRecord: 'graded' });
  await check('playing-card-audio-stops-on-leave', 'card', async ({ page }) => {
    await page.locator('#card-say').click();
    await started(page, 'clips');
    await page.goBack();
    await page.waitForFunction(() => location.pathname.endsWith('/index.html') && document.body.dataset.ready === '1'
      && document.body.dataset.view !== 'review', null, { timeout: 10000 });
    const now = await cardState(page);
    assert.equal(now.clips[0].paused, true, 'leaving review stops the clip');
  }, { learnerRecord: 'graded' });
} catch (error) {
  results.push({ name: 'terminal', pass: false, error: error.message, stack: error.stack });
} finally {
  await browser?.close().catch((error) => results.push({ name: 'browser · cleanup', pass: false, error: error.message }));
  if (server) {
    // a connection left by a failed browser close must not hold the receipt hostage
    server.closeAllConnections?.();
    const closed = new Promise((done) => server.close((error) => done(error ? error.message : null)));
    const outcome = await Promise.race([closed, new Promise((done) => setTimeout(() => done('server close timed out after 5 s'), 5000))]);
    if (outcome) results.push({ name: 'server · cleanup', pass: false, error: outcome });
  }
  if (!results.length) results.push({ name: filter || 'playback', pass: false, error: 'No matching tests' });
  // the identity read must never cost the receipt: a failure is recorded in place of the digest
  let corridorSha256;
  try { corridorSha256 = createHash('sha256').update(readFileSync(resolve(CORRIDOR_DIR ?? '', 'corridor.js'))).digest('hex'); }
  catch (error) { corridorSha256 = null; results.push({ name: 'identity · corridor.js digest', pass: false, error: error.message }); }
  writeFileSync(resolve(out, 'verify-playback.json'), `${JSON.stringify({
    site: CORRIDOR_DIR,
    corridorSha256,
    simulatedBrowser: 'Chromium', audio: 'deterministic media doubles; the speech double must never be called; no voice-quality claim',
    results, failures: results.filter((row) => !row.pass).length,
  }, null, 2)}\n`);
  const failures = results.filter((row) => !row.pass).length;
  console.log(`Playback lifecycle: ${results.length - failures}/${results.length} passed.`);
  process.exitCode = failures ? 1 : 0;
}
