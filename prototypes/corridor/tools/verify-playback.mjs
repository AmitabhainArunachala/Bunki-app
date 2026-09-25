/** Real reader navigation with deterministic browser audio doubles. These
 * probes establish playback lifecycle behavior, not voice or codec quality.
 * Since 2026-09-25 (D13b) there is no device voice and no automatic voice: the
 * recorded modes choose アミ explicitly, the speech double must never be called,
 * and a passage with nothing playable keeps its listen door shut with a reason.
 * D13 r2 obligations (Codex): a failure on the second clip; the failure note bound
 * to its article and voice; unrecorded-article, invalid and chosen-but-unrecorded
 * voices; a refused preference save then a saved one surviving reload; a late
 * manifest (success and failure) settling the row while focus and place hold; and
 * answer-card audio retired by grade, undo and leave, pending or playing.
 * Every case writes a named row, fixture failures included; the JSON is written
 * from the finally, so a crash still leaves a receipt.
 *
 * Discriminating controls, one per case (a historical build where one fails for the
 * named reason, otherwise a named one-line source mutant of corridor.js):
 *   article/voice binding  → 19e5b1ec (a global failure flag follows the learner)
 *   new choice clears      → 19e5b1ec, or delete `readAloud.failed = null` in the picker
 *   second clip errors     → delete the `return` after the failure stop: the third clip is asked for
 *   refused-then-saved     → delete `readAloud.voiceNotSaved = false`
 *   late manifest (both)   → replace refreshListenRow() with render(): focus leaves the probe
 *   pending grade+undo     → delete `if (serial !== cardAudioSerial) return;`
 *   pending leave          → the same mutant (9101b3b0 already passes this case; it is no control)
 *   playing grade / leave  → delete `if (!readAloud.on) stopRecAudio();` in retireCardAudioOnFaceChange
 *   unrecorded / invalid / chosen-unrecorded → invert `passageRecorded` / accept any stored value /
 *                            drop `pref === 'ami'` from playable */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { CORRIDOR_DIR, startCorridorServer } from './verify-corridor.mjs';
import { readAppRecord } from './record-test-support.mjs';

const out = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/playback'));
mkdirSync(out, { recursive: true });
const filter = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
// server and browser start inside the receipt's try below, so a launch failure still writes JSON
let server = null, base = null, browser = null;
const results = [];
// yasashii:7 has three recorded sentences, so a stop at the second is visible as a third never asked for
const manifest = { v: 1, words: {}, sentences: { 'yasashii:7': { have: [0, 1, 2] }, 'yasashii:6': { have: [0, 1] } } };
// yasashii:7 absent from a manifest that exists: the article is simply not recorded yet
const partialManifest = { v: 1, words: {}, sentences: { 'yasashii:6': { have: [0, 1] } } };
// two answer cards whose words are recorded in ずんだもん (ids from the shipped manifest)
const CARD_WORDS = [['会う', 'f4c916752a'], ['青', '1ca69c4be0']];
const cardManifest = { v: 1, words: Object.fromEntries(CARD_WORDS.map(([word, id]) => [word, { id, voices: ['zundamon'] }])), sentences: {} };
const PREF = { recorded: 'ami', delayed: 'ami', 'delayed-fail': 'ami', partial: 'ami', invalid: 'bogus', zundamon: 'zundamon',
  card: 'zundamon', 'card-held': 'zundamon' };

async function fixture(mode) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' });
  let release;
  const ready = new Promise((done) => { release = done; });
  // owned from the first line after the context exists: any later throw closes this context
  const errors = [];
  const f = { context, page: null, errors, release, manifestServed: false };
  try {
    if (mode !== 'delayed' && mode !== 'delayed-fail' && mode !== 'card-held') release();
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.endsWith('/audio/manifest.json')) {
        await ready;
        if (mode === 'delayed-fail') { await route.fulfill({ status: 404, body: '' }); f.manifestServed = true; return; }
        const body = mode === 'tts' ? null : mode === 'partial' ? partialManifest : mode.startsWith('card') ? cardManifest : manifest;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        f.manifestServed = true;
        return;
      }
      return route.continue();
    });
    if (PREF[mode]) {
      await context.addInitScript((value) => {
        if (sessionStorage.getItem('playback-pref-seeded')) return;
        try { localStorage.setItem('kairo-rec-voice-v1', value); sessionStorage.setItem('playback-pref-seeded', '1'); } catch { /* double */ }
      }, PREF[mode]);
    }
    if (mode.startsWith('card')) {
      // two fresh answer cards, due now, through the same legacy seed the voice-picker suite uses
      await context.addInitScript((words) => {
        if (localStorage.getItem('playback-cards-seeded')) return;
        const t = 1700000000000;
        localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1,
          taken: words.map((word, i) => ({ t: 'word', id: word, label: word, ts: t + i, started: t + i })), srs: {}, revlog: [], obslog: [] }));
        localStorage.setItem('playback-cards-seeded', '1');
      }, CARD_WORDS.map(([word]) => word));
    }
    // a storage double that refuses only the voice preference, and only while the page asks it to
    await context.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'kairo-rec-voice-v1' && window.__refuseVoiceSave) throw new DOMException('refused', 'QuotaExceededError');
        return Reflect.apply(setItem, this, [key, value]);
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
    if (mode.startsWith('card')) {
      await page.locator('#tray').click();
      await page.locator('#review-start').click();
      await page.locator('#declare-notyet').click();
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
const listenShut = (page) => page.evaluate(() => document.querySelector('#listen-toggle')?.disabled === true);
async function counts(page) {
  return page.evaluate(() => ({
    utterances: window.__playbackFixture.utterances.map((u) => u.text),
    clips: window.__playbackFixture.clips.map((a) => ({ src: a.src, paused: a.paused })),
    cancels: window.__playbackFixture.cancels,
    pressed: document.querySelector('#listen-toggle')?.getAttribute('aria-pressed'),
    note: document.querySelector('#listen-note')?.textContent,
  }));
}
async function switchPassage(page) {
  await page.locator('#reader [data-glossary-ref="yasashii:6"]').click();
  await page.waitForFunction(() => document.querySelector('h1.view-title')?.textContent === '印鑑登録証明書' && document.querySelector('#reader .tok'));
}
async function started(page, type, length = 1) {
  await page.waitForFunction(({ type, length }) => window.__playbackFixture[type].length === length, { type, length }, { timeout: 5000 });
}
/** The held manifest was actually served, and the page has run the tasks after it. */
async function manifestSettled(f) {
  const until = Date.now() + 5000;
  while (!f.manifestServed) {
    if (Date.now() > until) throw new Error('the held manifest was never served');
    await f.page.waitForTimeout(25);
  }
  await f.page.evaluate(() => new Promise((done) => setTimeout(() => setTimeout(done, 50), 0)));
}
/** Positive control inside a retirement test: a fresh tap on the current face does play once. */
async function freshTapPlays(page, word) {
  await page.locator('#card-say').click();
  await started(page, 'clips');
  await page.evaluate(() => new Promise((done) => setTimeout(done, 100)));
  const state = await cardState(page);
  assert.equal(state.clips.length, 1, 'exactly one clip: the fresh tap, never the retired one');
  if (word) assert.match(state.clips[0].src, new RegExp(`/${word}\\.m4a$`));
}
const cardState = (page) => page.evaluate(() => ({
  view: document.body.dataset.view,
  clips: window.__playbackFixture.clips.map((a) => ({ src: a.src, paused: a.paused })),
  utterances: window.__playbackFixture.utterances.length,
  speaking: document.querySelectorAll('.say.is-speaking').length,
  sayNote: document.querySelector('#card-say-note')?.textContent ?? null,
  unrevealed: !!document.querySelector('#declare-notyet'),
}));
async function check(name, mode, body, { learnerRecord = 'untouched' } = {}) {
  if (filter && name !== filter) return;
  let f = null;
  try {
    if (!browser) throw new Error('browser not started');
    f = await fixture(mode);
    await body(f);
    assert.deepEqual(f.errors, [], 'no uncaught application errors');
    if (learnerRecord === 'untouched') {
      const record = await readAppRecord(f.page);
      assert.deepEqual(record.taken || [], [], 'listening never promotes a card');
      assert.deepEqual(record.srs || {}, {}, 'listening never schedules a review');
      assert.deepEqual(record.revlog || [], [], 'listening never grades a review');
    }
    results.push({ name, pass: true, observed: await counts(f.page).catch((error) => ({ unreadable: error.message })) });
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
    if (f) await f.context.close().catch((error) => results.push({ name: `${name} · cleanup`, pass: false, error: error.message }));
  }
}

try {
  ({ server, base } = await startCorridorServer());
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  await check('no-recordings-listen-is-shut-and-silent', 'tts', async ({ page }) => {
    assert.equal(await listenShut(page), true, 'with no recordings the listen door is shut');
    await page.locator('#listen-toggle').click({ force: true }).catch(() => {});
    await page.waitForTimeout(350);
    const after = await counts(page);
    assert.equal(after.utterances.length, 0, 'no device voice, ever');
    assert.equal(after.clips.length, 0);
    assert.match(after.note, /no recorded voices|収録音声がありません/u);
  });
  await check('no-chosen-voice-listen-is-shut-and-silent', 'unchosen', async ({ page }) => {
    assert.equal(await listenShut(page), true, 'no voice chosen: the door is shut');
    const after = await counts(page);
    assert.equal(after.utterances.length, 0); assert.equal(after.clips.length, 0);
    assert.match(after.note, /recorded only in Koharune Ami|小春音アミ（仮の声・検収前）の収録だけ/u);
  });
  await check('stale-clip-events-cannot-change-a-restarted-read', 'recorded', async ({ page }) => {
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
    assert.ok(!/could not play|再生できません/u.test(active.note), 'a stale failure does not stop the live read');
    assert.equal(active.utterances.length, 0);
    await page.evaluate(() => window.__playbackFixture.clips[1].onended());
    await started(page, 'clips', 3);
  });
  await check('reader-settings-keep-the-active-recording-playing', 'recorded', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.locator('#dials-toggle').click();
    const after = await counts(page);
    assert.equal(after.pressed, 'true');
    assert.equal(after.clips.length, 1);
    assert.equal(after.clips[0].paused, false);
    assert.equal(after.utterances.length, 0);
  });
  await check('passage-switch-pauses-recording-and-ignores-late-error', 'recorded', async ({ page }) => {
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
    assert.equal(active.utterances.length, 0, 'old clip failure cannot start any device voice');
    assert.equal(active.clips.length, 2);
    await page.evaluate(() => window.__playbackFixture.clips[1].onended());
    await started(page, 'clips', 3);
    assert.match((await counts(page)).clips[2].src, /yasashii_6-001\.m4a$/);
  });
  await check('late-manifest-opens-listen-for-the-current-passage', 'delayed', async ({ page, release }) => {
    assert.equal(await listenShut(page), true, 'listen is shut while recordings are still being checked');
    await switchPassage(page);
    release();
    await page.waitForFunction(() => document.querySelector('#listen-toggle') && !document.querySelector('#listen-toggle').disabled, null, { timeout: 5000 });
    await press(page);
    await started(page, 'clips');
    const active = await counts(page);
    assert.equal(active.clips.length, 1);
    assert.match(active.clips[0].src, /yasashii_6-000\.m4a$/);
    assert.equal(active.pressed, 'true');
  });
  await check('a-shut-door-pressed-while-checking-starts-nothing-later', 'delayed', async ({ page, release }) => {
    await page.locator('#listen-toggle').click({ force: true }).catch(() => {});
    release();
    await page.waitForTimeout(350);
    const after = await counts(page);
    assert.equal(after.pressed, 'false');
    assert.equal(after.clips.length, 0);
    assert.equal(after.utterances.length, 0);
  });
  await check('current-recording-failure-stops-with-a-reason-and-no-device-voice', 'recorded', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await page.waitForFunction(() => document.querySelector('#listen-toggle')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
    const after = await counts(page);
    assert.equal(after.utterances.length, 0, 'no fallback voice of any kind');
    assert.match(after.note, /could not play|再生できません/u, 'the failure is named');
  });

  // --- D13 r2 obligations (Codex, D13B-INDEPENDENT-REVIEW-r2) ---
  const FAILED = /could not play|再生できません/u;
  await check('first-clip-ends-second-clip-errors-stops-with-a-reason', 'recorded', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onended());
    await started(page, 'clips', 2);
    await page.evaluate(() => window.__playbackFixture.clips[1].onerror());
    await page.waitForFunction(() => document.querySelector('#listen-toggle')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
    await page.evaluate(() => new Promise((done) => setTimeout(done, 600)));
    const after = await counts(page);
    assert.equal(after.clips.length, 2, 'the read stops at the failed sentence; the recorded third is never requested');
    assert.match(after.clips[1].src, /yasashii_7-001\.m4a$/);
    assert.match(after.note, FAILED, 'a mid-passage failure is named');
    assert.equal(after.utterances.length, 0);
  });
  await check('a-failure-note-does-not-follow-to-another-article', 'recorded', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await page.waitForFunction((re) => new RegExp(re, 'u').test(document.querySelector('#listen-note')?.textContent || ''), FAILED.source, { timeout: 5000 });
    await switchPassage(page);
    const other = await counts(page);
    assert.doesNotMatch(other.note, FAILED, 'yasashii:6 never failed; it must not inherit yasashii:7\'s note');
    assert.match(other.note, /synthetic voice: Koharune Ami|合成音声：小春音アミ/u);
    assert.equal(await listenShut(page), false, 'the other recorded article stays playable');
  });
  await check('a-new-voice-choice-clears-the-failure-note', 'recorded', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await page.waitForFunction((re) => new RegExp(re, 'u').test(document.querySelector('#listen-note')?.textContent || ''), FAILED.source, { timeout: 5000 });
    await page.locator('#listen-voice').selectOption('zundamon');
    assert.doesNotMatch((await counts(page)).note, FAILED);
    await page.locator('#listen-voice').selectOption('ami');
    const after = await counts(page);
    assert.doesNotMatch(after.note, FAILED, 'choosing again is a fresh start, not the old failure');
    assert.match(after.note, /synthetic voice: Koharune Ami|合成音声：小春音アミ/u);
  });
  await check('an-unrecorded-article-in-a-present-manifest-is-named-and-shut', 'partial', async ({ page }) => {
    assert.equal(await listenShut(page), true);
    const after = await counts(page);
    assert.match(after.note, /No recorded voice for this article yet|この記事の収録音声はまだありません/u);
    assert.equal(await page.locator('#listen-voice').inputValue(), 'ami', 'the picker still shows the chosen voice');
    assert.equal(after.clips.length, 0); assert.equal(after.utterances.length, 0);
  });
  await check('an-invalid-stored-voice-counts-as-no-choice', 'invalid', async ({ page }) => {
    assert.equal(await listenShut(page), true);
    assert.equal(await page.locator('#listen-voice').inputValue(), '', 'the picker asks for a choice');
    const after = await counts(page);
    assert.match(after.note, /recorded only in Koharune Ami|小春音アミ（仮の声・検収前）の収録だけ/u);
    assert.equal(after.clips.length, 0);
    assert.equal(after.utterances.length, 0, 'an invalid preference never reaches any device voice');
  });
  await check('a-chosen-voice-without-this-recording-stays-shut-with-a-reason', 'zundamon', async ({ page }) => {
    assert.equal(await listenShut(page), true, 'ずんだもん has no sentence recordings: nothing plays');
    assert.equal(await page.locator('#listen-voice').inputValue(), 'zundamon');
    const after = await counts(page);
    assert.match(after.note, /recorded only in Koharune Ami|小春音アミ（仮の声・検収前）の収録だけ/u);
    assert.equal(after.clips.length, 0); assert.equal(after.utterances.length, 0);
  });
  await check('a-refused-save-then-a-saved-choice-survives-reload', 'unchosen', async ({ page }) => {
    await page.evaluate(() => { window.__refuseVoiceSave = true; });
    await page.locator('#listen-voice').selectOption('ami');
    let now = await counts(page);
    assert.match(now.note, /could not be saved|保存できず/u, 'the refused save is named');
    assert.equal(await listenShut(page), false, 'the explicit choice holds for this session');
    await page.evaluate(() => { window.__refuseVoiceSave = false; });
    await page.locator('#listen-voice').selectOption('zundamon');
    now = await counts(page);
    assert.doesNotMatch(now.note, /could not be saved|保存できず/u, 'a successful save clears the warning');
    assert.equal(await page.evaluate(() => localStorage.getItem('kairo-rec-voice-v1')), 'zundamon');
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    if (!(await page.locator('#listen-voice').count())) await openPassage(page);
    await page.waitForSelector('#listen-voice');
    assert.equal(await page.locator('#listen-voice').inputValue(), 'zundamon', 'the saved choice, not the session one, survives');
    assert.doesNotMatch((await counts(page)).note, /could not be saved|保存できず/u);
  });
  for (const [name, mode, expect] of [
    ['a-late-manifest-refreshes-the-row-and-keeps-focus-and-place', 'delayed', { shut: false, note: /synthetic voice: Koharune Ami|合成音声：小春音アミ/u }],
    ['a-late-manifest-failure-settles-the-row-and-keeps-focus-and-place', 'delayed-fail', { shut: true, note: /no recorded voices|収録音声がありません/u }],
  ]) {
    await check(name, mode, async ({ page, release }) => {
      assert.match((await counts(page)).note, /Checking for recordings|収録音声を確認/u, 'the row starts in its checking state');
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
      await page.waitForFunction(() => !/Checking for recordings|収録音声を確認/u.test(document.querySelector('#listen-note')?.textContent || ''), null, { timeout: 5000 });
      const after = await page.evaluate(() => ({
        focusKept: document.activeElement?.dataset?.focusProbe === '1' && document.activeElement.isConnected,
        top: document.querySelector('[data-focus-probe="1"]')?.getBoundingClientRect().top ?? NaN,
        row: document.querySelector('.listen-row')?.getBoundingClientRect().height ?? 0, passage: document.querySelector('h1.view-title')?.textContent,
        shut: document.querySelector('#listen-toggle')?.disabled === true,
        note: document.querySelector('#listen-note')?.textContent || '',
      }));
      assert.equal(after.focusKept, true, 'the focused glossary control is the same node, still focused');
      // the only movement allowed is the listen row's own change of height (scroll anchoring may absorb even that)
      const allowed = Math.abs(after.row - before.row) + 2;
      assert.ok(Math.abs(after.top - before.top) <= allowed, `reading place kept (probe top ${before.top} → ${after.top}, allowed ${allowed})`);
      assert.equal(after.passage, before.passage, 'no navigation');
      assert.equal(after.shut, expect.shut);
      assert.match(after.note, expect.note);
    });
  }

  // answer-card 音: a clip belongs to the face that asked (grade, undo and leave retire it)
  await check('pending-card-audio-is-retired-by-grade-and-undo', 'card-held', async (f) => {
    const { page } = f;
    await page.locator('#card-say').click();
    await page.locator('.grade.g-again').click();
    await page.waitForSelector('.review-undo', { timeout: 10000 });
    await page.locator('.review-undo').click();
    // the only grade is taken back: no undo chip, and the first card is up again, unrevealed
    await page.waitForFunction(() => !document.querySelector('.review-undo') && !!document.querySelector('#declare-notyet'), null, { timeout: 10000 });
    f.release();
    await manifestSettled(f);
    const after = await cardState(page);
    assert.equal(after.clips.length, 0, 'the retired request never plays, even after undo restores that card');
    assert.equal(after.speaking, 0); assert.equal(after.utterances, 0);
    await page.locator('#declare-notyet').click();
    await page.waitForSelector('#card-say');
    await freshTapPlays(page);
  }, { learnerRecord: 'graded' });
  await check('pending-card-audio-is-retired-by-leaving-review', 'card-held', async (f) => {
    const { page } = f;
    await page.locator('#card-say').click();
    await page.goBack();
    await page.waitForFunction(() => location.pathname.endsWith('/index.html') && document.body.dataset.ready === '1'
      && document.body.dataset.view !== 'review', null, { timeout: 10000 });
    f.release();
    await manifestSettled(f);
    const after = await cardState(page);
    assert.equal(after.clips.length, 0, 'leaving retires the request');
    assert.equal(after.utterances, 0);
    // positive control: back in review, a fresh tap plays exactly once
    await page.locator('#tray').click();
    await page.locator('#review-start').click();
    await page.locator('#declare-notyet').click();
    await page.waitForSelector('#card-say');
    await freshTapPlays(page);
  }, { learnerRecord: 'graded' });
  await check('playing-card-audio-stops-on-grade-and-late-events-leave-the-next-card-alone', 'card', async ({ page }) => {
    await page.locator('#card-say').click();
    await started(page, 'clips');
    await page.locator('.grade.g-again').click();
    await page.waitForFunction(() => !!document.querySelector('#declare-notyet'), null, { timeout: 10000 });
    let now = await cardState(page);
    assert.equal(now.clips[0].paused, true, 'the playing clip stops when its card is graded');
    await page.locator('#declare-notyet').click();
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
  if (server) await new Promise((done) => server.close(done));
  if (!results.length) results.push({ name: filter || 'playback', pass: false, error: 'No matching tests' });
  const failures = results.filter((row) => !row.pass).length;
  writeFileSync(resolve(out, 'verify-playback.json'), `${JSON.stringify({
    site: CORRIDOR_DIR,
    corridorSha256: createHash('sha256').update(readFileSync(resolve(CORRIDOR_DIR, 'corridor.js'))).digest('hex'),
    simulatedBrowser: 'Chromium', audio: 'deterministic media doubles; the speech double must never be called; no voice-quality claim',
    results, failures,
  }, null, 2)}\n`);
  console.log(`Playback lifecycle: ${results.length - failures}/${results.length} passed.`);
  process.exitCode = failures ? 1 : 0;
}
