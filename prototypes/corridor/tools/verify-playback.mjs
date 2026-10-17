/** Real reader navigation with deterministic browser audio doubles. These probes establish playback
 * lifecycle behaviour, not voice or codec quality.
 * The voice is locked (operator's blind audition, 2026-09-29): Google Gemini TTS Kore reads and Charon
 * is the second speaker. F1 is withdrawn. There is no device voice, no voice picker and no interim
 * voice. An article with no recording in that voice draws no listen mark at all (F, the lead's ruling 2026-10-18: no
 * dead control): that state is checked as the build serves it. The bar's own lifecycle — play, pause, restart, a failed clip, a passage switch, a late manifest —
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
 *   withdrawn manifest         → drop `if (!Object.hasOwn(NARRATION_VOICES, clip.voice)) return false;`
 *                                from approvedNarrationClip: an F1 manifest opens the bar
 *   interim card voice         → drop `if (entry.voice !== wanted) return null;` from wordClipFor:
 *                                a clip in a withdrawn voice plays (see also
 *                                tools/adjudicate-voice-mutants.mjs, which runs this family)
 *   pending grade/undo/leave   → delete `if (serial !== cardAudioSerial) return;` in speakCardReading
 *   playing grade / leave      → delete `if (!readAloud.on) stopRecAudio();` in retireCardAudioOnFaceChange
 *   late page error            → throw an uncaught error from the page during the final observation:
 *                                the receipt must carry a '· late page errors' row and exit nonzero */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
// verify-corridor.mjs resolves the site when it loads, so it is imported inside the receipt's try
let CORRIDOR_DIR = null, startCorridorServer;
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { runtimeLock } from './voice-lock.mjs';

const out = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/playback'));
mkdirSync(out, { recursive: true });
const filter = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
// server and browser start inside the receipt's try below, so a launch failure still writes JSON
let server = null, base = null, browser = null, browserVersion = null;
/* V (2026-10-17): the engine is the one KAIRO_BROWSER names, and the receipt records the exact
 * build that ran. A verifier that silently picks its own engine cannot be read as evidence for
 * the engine the operator asked for. This file drives one engine per process; `all` therefore
 * runs the default here and is recorded as such, never claimed as two. */
const LAUNCHERS = { chromium, webkit };
const REQUESTED = process.env.KAIRO_BROWSER || '(unset)';
const ENGINE = LAUNCHERS[process.env.KAIRO_BROWSER] ? process.env.KAIRO_BROWSER : 'chromium';
const results = [];
// N (2026-10-17) rewrites the fixture pin "yasashii:7 and yasashii:6 stand on the shelf, one a glossary-ref door from the
// other": the ten glossary definitions left the shelf through the cull queue. The two passages are now a shelf story and
// its N3 rewrite, and the reader's own version switch (原文 / やさしい版, which calls openPassage without leaving the
// reader, as the glossary door did) is the door between them.
const FIRST = 'govonline:article-202609-radio-3741';
const OTHER = `adapt-n3:${FIRST}`;
const clipName = (passage, i) => `${passage.replaceAll(':', '_')}-${String(i).padStart(3, '0')}.m4a`;
const clipAt = (passage, i) => new RegExp(`${clipName(passage, i).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u');
// V (2026-10-17): the fixtures speak manifest v2, because the runtime now reads v2 only. Every
// clip carries its own voice, role and model, and a word is keyed by (surface, reading) — a
// spelling cannot choose between 年 ねん and 年 とし. The model and the roster come from the lock,
// so swapping the voice does not leave this gate asserting a name nobody ships.
const LOCK = runtimeLock();
const MAIN = LOCK.main;
const lockBlock = { model: LOCK.model, main: LOCK.main, second: LOCK.second };
// synthetic narration in the locked voice: FIRST has three clips, so a stop at the second is
// visible as a third never asked for
const kore = (passage, n) => Array.from({ length: n }, (_, i) =>
  ({ text: `${passage} sentence ${i + 1}`, src: `audio/narration/${MAIN}/${clipName(passage, i)}`,
    voice: MAIN, speakerRole: 'narrator', model: LOCK.model }));
const narration = { v: 2, lock: lockBlock, articles: { [FIRST]: { clips: kore(FIRST, 3) }, [OTHER]: { clips: kore(OTHER, 2) } } };
// FIRST absent from a manifest that exists: the article is simply not narrated yet
const partialNarration = { v: 2, lock: lockBlock, articles: { [OTHER]: { clips: kore(OTHER, 2) } } };
// the withdrawn F1 voice, shaped exactly like an approved manifest: it must never open the bar
const withdrawnNarration = { v: 2, lock: lockBlock, articles: { [FIRST]: { clips: kore(FIRST, 3)
  .map((clip) => ({ ...clip, voice: 'f1', src: clip.src.replace(`/${MAIN}/`, '/f1/') })) } } };
// two answer cards whose words are recorded in the approved voice. The readings come from the
// shipped word data, never from a guess: the card's 音 is handed the reading it is showing.
const WORD_DATA = JSON.parse(readFileSync(new URL('../data/share_alike/words.json', import.meta.url), 'utf8')).words;
// [surface, reading, clip id]. The reading comes from the shipped word data, never a guess:
// the card's 音 is handed the reading it is showing, and that reading is half of the key.
const CARD_WORDS = [['会う', 'f4c916752a'], ['青', '1ca69c4be0']]
  .map(([surface, id]) => [surface, WORD_DATA[surface].r, id]);
const cardManifest = (voice) => ({
  v: 2, lock: lockBlock, sentences: {},
  words: Object.fromEntries(CARD_WORDS.map(([surface, reading, id]) => [`${surface}|${reading}`,
    { surface, reading, voice, speakerRole: 'word', model: LOCK.model,
      src: `audio/w/${voice}/${id}.m4a` }])),
});
const MODES = {
  // the build as it ships: no narration flag, the shipped word manifest
  quiet: {},
  narration: { narration },
  'narration-delayed': { narration, hold: true },
  'narration-delayed-fail': { narration: 404, hold: true },
  'narration-partial': { narration: partialNarration },
  'narration-withdrawn': { narration: withdrawnNarration },
  card: { words: cardManifest(MAIN) },
  'card-held': { words: cardManifest(MAIN), hold: true },
  // a legacy stored voice that is no longer an authority at all: the clip still plays, in the
  // locked voice, because the content role decides and the stored value decides nothing
  'card-invalid': { words: cardManifest(MAIN), pref: 'bogus' },
  // an interim voice only: nothing plays, and the card says why — never the second speaker,
  // never the device
  'card-interim': { words: cardManifest('ami'), pref: 'ami' },
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
    // index.html raises the narration flag since the 10-15 Kore probe; the test raises it too, so a
    // narration case never depends on the shipped page for the flag it is testing
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
      // the sealed front (V): before the answer is revealed there is no voice door and nothing has
      // played — 声 can only ever speak a revealed card
      await page.waitForSelector('#reveal');
      assert.equal(await page.locator('#card-say').count(), 0, 'the sealed front has no voice door');
      assert.equal(await page.evaluate(() => window.__playbackFixture.clips.length), 0, 'nothing plays before the reveal');
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
  await page.locator(`[data-passage="${FIRST}"]:not([data-recommendation]) .shelf-open`).click();
  await page.waitForSelector(`#reader .tok`);
  await page.waitForSelector(`.version-choice[data-version="${OTHER}"]`);
}

/** The bar's one mark (John, 2026-10-15 17:20: "a simple character… elegant and nearly hidden but obvious"). F (the
 * lead's ruling on Grok f-86, 2026-10-18; was "folded, it is the whole bar — 44 px, the only thing drawn", fixed at the
 * phone's foot over the reading column): folded, it is one glyph in the reader's head, in the head's flow (static, at the
 * right end of the instrument line), 44 px, the only thing of the bar drawn, and no text box that shows meets it; open,
 * the bar is as it was; with no recording there is no mark at all — no dead control, nothing to focus. */
const markState = (page) => page.evaluate(() => {
  const row = document.querySelector('.listen-row.play-bar'), mark = document.querySelector('#listen-open');
  const box = (n) => { const r = n?.getBoundingClientRect(); return r ? { w: r.width, h: r.height, x: r.x, top: r.top, right: r.right, bottom: r.bottom } : null; };
  const shown = (n) => !!n && n.checkVisibility() && getComputedStyle(n).visibility !== 'hidden';
  // every text box of the room that shows, against the mark's own box
  const textHits = [];
  if (row && mark && shown(mark)) {
    const m = mark.getBoundingClientRect();
    const walk = document.createTreeWalker(document.querySelector('#app > main') || document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.data.trim() || row.contains(n) || !n.parentElement.checkVisibility()) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      for (const q of range.getClientRects()) if (q.width && q.height && q.left < m.right && q.right > m.left && q.top < m.bottom && q.bottom > m.top) textHits.push(n.data.trim().slice(0, 12));
    }
  }
  return { open: row?.dataset.open ?? null, pending: !!row?.classList.contains('is-pending'), rowHidden: !!row?.hidden,
    inHead: !!row?.closest('.reader-head'), position: row ? getComputedStyle(row).position : null,
    mark: box(mark), markShown: shown(mark),
    markDim: mark ? parseFloat(getComputedStyle(mark).opacity) : null, markDisabled: mark?.getAttribute('aria-disabled') ?? null,
    expanded: mark?.getAttribute('aria-expanded') ?? null, describedBy: mark?.getAttribute('aria-describedby') ?? null, tab: mark ? mark.tabIndex : null,
    toggleShown: shown(document.querySelector('#listen-toggle')), rateShown: shown(document.querySelector('#listen-rate')),
    noteShown: shown(document.querySelector('#listen-note')), buttons: row ? row.querySelectorAll('button').length : 0, textHits };
});
const folded = (s) => s.open === 'false' && s.markShown && s.inHead && s.position === 'static' && s.mark.w >= 44 && s.mark.h >= 44
  && !s.toggleShown && !s.rateShown && !s.noteShown && s.textHits.length === 0;
/** No recording: no mark, no control, no line — the row an empty, hidden place */
const absent = (s) => !s.markShown && s.buttons === 0 && s.rowHidden && s.pending;
async function openBar(page) {
  const s = await markState(page);
  if (s.open === 'true') return;
  assert.equal(folded(s), true, `the bar is folded to its mark before the mark opens it: ${JSON.stringify(s)}`);
  await page.locator('#listen-open').click();
  await page.waitForSelector('.listen-row.play-bar[data-open="true"]', { timeout: 5000 });
}
async function press(page) { await openBar(page); await page.locator('#listen-toggle').click(); }
/** The shut bar: no recording, so nothing at all — no mark, no play control, no picker, no line; an empty hidden row. */
const barShut = (page) => page.evaluate(() => !document.querySelector('#listen-open') && !document.querySelector('#listen-toggle')
  && !document.querySelector('#listen-voice') && !document.querySelector('#listen-note')
  && !!document.querySelector('.listen-row.is-pending[hidden]') && document.querySelector('.listen-row.is-pending')?.dataset.open === 'false');
const PENDING = /^No recording for this article$/u;
const PENDING_VOICES = 'Approved voices: Kore (main), Charon (second).';
const FAILED = /could not play|再生できませんでした/u;
async function counts(page) {
  return page.evaluate(() => ({
    utterances: window.__playbackFixture.utterances.map((u) => u.text),
    clips: window.__playbackFixture.clips.map((a) => ({ src: a.src, paused: a.paused })),
    cancels: window.__playbackFixture.cancels,
    pressed: document.querySelector('#listen-toggle')?.getAttribute('aria-pressed'),
    note: document.querySelector('#listen-note')?.textContent,
    description: document.querySelector('#listen-note')?.getAttribute('aria-description') ?? null,
    progress: document.querySelector('#listen-progress')?.getAttribute('aria-valuenow') ?? null,
  }));
}
async function switchPassage(page) {
  await page.locator(`.version-choice[data-version="${OTHER}"]`).click();
  await page.waitForFunction((id) => document.querySelector('.listen-row[data-passage]')?.dataset.passage === id && document.querySelector('#reader .tok'), OTHER);
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
  assert.match(state.clips[0].src, new RegExp(`^audio/w/${MAIN}/(${CARD_WORDS.map(([, , id]) => id).join('|')})\\.m4a$`),
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
    if (PENDING.test(final.note)) assert.equal(final.description, PENDING_VOICES,
      'Every pending article names the locked voices in its accessible description');
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
  browser = await LAUNCHERS[ENGINE].launch(ENGINE === 'chromium'
    ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
  browserVersion = browser.version();
  console.log(`engine ${ENGINE} ${browserVersion} (KAIRO_BROWSER=${REQUESTED})`);

  // --- the shipped state: no narration flag, no approved clip ---
  await check('the-shipped-reader-draws-no-mark-without-a-recording-and-is-silent', 'quiet', async (f) => {
    const { page } = f;
    assert.equal(await barShut(page), true, 'no recording: no mark, no play control, no picker, no line');
    const mark = await markState(page);
    assert.equal(absent(mark), true, `no recording: the reader draws no listen mark and holds nothing of it to focus: ${JSON.stringify(mark)}`);
    // the keyboard's way through the head meets no listen stop
    assert.equal(await page.evaluate(() => document.querySelectorAll('.listen-row button, .listen-row [tabindex]').length), 0, 'no listen stop');
    await page.waitForTimeout(350);
    const after = await counts(page);
    assert.equal(after.clips.length, 0, 'nothing plays');
    // V (2026-10-17): narration HAS shipped — one article, six real clips in the locked voice —
    // so index.html raises the flag and the build asks once. Before V this asserted zero, which
    // was true only while nothing was recorded: it was a test of the silence, and it passed
    // every day the silence lasted. The contract now is that the ask is made exactly once and
    // that a 404 answer is the quiet pending line, never a stand-in voice.
    assert.equal(f.narrationAsked, 1, 'the build asks for narration exactly once');
    assert.equal(await page.evaluate(() => localStorage.getItem('kairo-rec-voice-v1')), null, 'no preference is written');
  });
  await check('a-withdrawn-voice-manifest-cannot-open-the-bar', 'narration-withdrawn', async (f) => {
    const { page } = f;
    await manifestSettled(f, '__narrationConsumed');
    assert.equal(f.narrationAsked, 1, 'the raised flag fetched the manifest');
    assert.equal(await barShut(page), true, 'an F1 manifest is refused: no mark is drawn');
    assert.equal(absent(await markState(page)), true, 'an F1 manifest arms nothing');
    assert.equal((await counts(page)).clips.length, 0);
  });
  await check('an-unnarrated-article-in-a-present-manifest-draws-no-mark', 'narration-partial', async (f) => {
    const { page } = f;
    await manifestSettled(f, '__narrationConsumed');
    assert.equal(await barShut(page), true, `${FIRST} has no clip: no mark, nothing to press`);
    assert.equal(absent(await markState(page)), true, `${FIRST} has no clip: the row is an empty hidden place`);
    // positive control: the narrated article beside it opens its bar in the locked voice
    await switchPassage(page);
    assert.equal(await barShut(page), false, `${OTHER} is narrated: its bar can open`);
    const live = await markState(page);
    assert.equal(folded(live) && !live.pending && live.markDisabled === null && live.expanded === 'false' && live.markDim === 1 && live.tab === 0, true,
      `narrated, the bar stands folded to its live mark in the head, in flow, on no text (a stop on the keyboard's way) until a tap: ${JSON.stringify(live)}`);
    assert.equal((await counts(page)).note, 'Kore');
    assert.equal((await counts(page)).clips.length, 0);
  });

  // --- the bar's lifecycle, on the synthetic Kore manifest ---
  // reader lane 2026-10-02: the floating sentence bar is gone; what floats over the text now is the tapped word's popup
  await check('approved-player-is-touch-sized-and-clear-of-the-word-popup-on-phones', 'narration', async ({ page }) => {
    await openBar(page);
    const measure = () => page.evaluate(() => {
      const bar = document.querySelector('.listen-row.play-bar').getBoundingClientRect();
      const popup = document.querySelector('#mini').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('#listen-open, #listen-toggle, #listen-rate')].map(node => {
        const r = node.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { id: node.id, width: r.width, height: r.height, left: r.left, right: r.right,
          top: r.top, bottom: r.bottom, reachable: hit === node || node.contains(hit) };
      });
      return { viewport: innerWidth, bar: { top: bar.top, bottom: bar.bottom }, popup: { top: popup.top, bottom: popup.bottom }, buttons,
        valid: buttons.length === 3 && buttons.every(r => r.width >= 44 && r.height >= 44 &&
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
    // the mark folds the bar (the slip goes first: a tap outside it puts it away by the mini's law)
    await page.locator('#reader .tok').first().focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('mini'));
    await page.locator('#listen-open').click();
    await page.waitForSelector('.listen-row.play-bar[data-open="false"]', { timeout: 5000 });
    const foldedState = await markState(page);
    assert.equal(folded(foldedState) && foldedState.expanded === 'false' && foldedState.mark.right <= 390 && foldedState.mark.bottom <= 844, true,
      `a tap on the mark folds the bar to the mark alone, on screen: ${JSON.stringify(foldedState)}`);
    await page.locator('#listen-open').click();
    await page.waitForSelector('.listen-row.play-bar[data-open="true"]', { timeout: 5000 });
    const reopened = await markState(page);
    assert.equal(reopened.expanded === 'true' && reopened.toggleShown && reopened.rateShown && reopened.mark.w >= 44, true,
      `a tap on the mark opens the bar again: ${JSON.stringify(reopened)}`);
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
    assert.match((await counts(page)).clips[2].src, clipAt(FIRST, 1));
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
    assert.match((await counts(page)).clips[2].src, clipAt(OTHER, 1));
  });
  await check('late-manifest-opens-listen-for-the-current-passage', 'narration-delayed', async (f) => {
    const { page, release } = f;
    assert.equal(await barShut(page), true, 'while narration loads there is no mark (no dead control)');
    await switchPassage(page);
    release();
    await page.waitForSelector('#listen-toggle', { state: 'attached', timeout: 5000 });
    assert.equal(folded(await markState(page)), true, 'the late manifest arms the mark; the bar stays folded until a tap');
    await press(page);
    await started(page, 'clips');
    const active = await counts(page);
    assert.equal(active.clips.length, 1);
    assert.match(active.clips[0].src, clipAt(OTHER, 0));
    assert.equal(active.pressed, 'true');
  });
  await check('no-pending-mark-to-press-and-the-armed-mark-waits-for-its-own-press', 'narration-delayed', async (f) => {
    const { page, release } = f;
    // while narration loads there is no mark: nothing to press, nothing to queue
    assert.equal(await page.locator('#listen-open').count(), 0, 'no pending mark to press');
    release();
    await manifestSettled(f, '__narrationConsumed');
    await page.waitForSelector('#listen-toggle', { state: 'attached', timeout: 5000 });
    await page.waitForTimeout(350);
    const after = await counts(page);
    assert.equal(after.pressed, 'false', 'the armed bar waits for its own press');
    assert.equal(after.clips.length, 0);
    assert.equal(folded(await markState(page)), true, 'the armed mark stands folded in the head until its own press');
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
    assert.match(after.clips[1].src, clipAt(FIRST, 1));
    assert.match(after.note, FAILED, 'a mid-passage failure is named');
  });
  await check('a-failure-note-does-not-follow-to-another-article', 'narration', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await page.waitForFunction((re) => new RegExp(re, 'u').test(document.querySelector('#listen-note')?.textContent || ''), FAILED.source, { timeout: 5000 });
    await switchPassage(page);
    const other = await counts(page);
    assert.doesNotMatch(other.note, FAILED, `${OTHER} never failed; it must not inherit ${FIRST}'s note`);
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
    assert.match(after.clips[2].src, clipAt(FIRST, 1), 'the read resumes at the sentence that failed');
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
    assert.match((await counts(page)).clips[3].src, clipAt(FIRST, 0), 'the next read starts at the first sentence');
  });
  for (const [name, mode, expect] of [
    ['a-late-manifest-refreshes-the-row-and-keeps-focus-and-place', 'narration-delayed', { shut: false, note: /^Kore$/u }],
    ['a-late-manifest-failure-settles-the-row-and-keeps-focus-and-place', 'narration-delayed-fail', { shut: true, note: /^$/u }],
  ]) {
    await check(name, mode, async (f) => {
      const { page, release } = f;
      assert.equal(await barShut(page), true, 'the row starts as an empty hidden place while narration loads (no mark, no line)');
      const before = await page.evaluate(() => {
        // a control in the text itself, as the glossary door was: the second word button of the read
        const refs = [...document.querySelectorAll('#reader .tok')];
        const target = refs[Math.min(1, refs.length - 1)];
        target.dataset.focusProbe = '1';
        target.focus();
        return { focused: document.activeElement === target, top: target.getBoundingClientRect().top,
          row: document.querySelector('.listen-row')?.getBoundingClientRect().height ?? 0, passage: document.querySelector('h1.view-title')?.textContent };
      });
      assert.equal(before.focused, true, 'the probe holds focus before the manifest settles');
      release();
      await manifestSettled(f, '__narrationConsumed');
      if (!expect.shut) await page.waitForSelector('#listen-toggle', { state: 'attached', timeout: 5000 });
      const after = await page.evaluate(() => ({
        focusKept: document.activeElement?.dataset?.focusProbe === '1' && document.activeElement.isConnected,
        top: document.querySelector('[data-focus-probe="1"]')?.getBoundingClientRect().top ?? NaN,
        row: document.querySelector('.listen-row')?.getBoundingClientRect().height ?? 0, passage: document.querySelector('h1.view-title')?.textContent,
        note: document.querySelector('#listen-note')?.textContent || '',
      }));
      assert.equal(after.focusKept, true, 'the focused word in the text is the same node, still focused');
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
    assert.match(after.sayNote, /Kore の収録音声はありません|No Kore recording/u, 'the card names the approved voice with no recording');
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
    engine: ENGINE, browserVersion, requestedBrowser: REQUESTED, enginesCovered: [ENGINE],
    simulatedBrowser: ENGINE, audio: 'deterministic media doubles; the speech double must never be called; no voice-quality claim',
    limits: ['one engine per process; KAIRO_BROWSER=all runs the default engine named above and is not evidence for any other'],
    results, failures: results.filter((row) => !row.pass).length,
  }, null, 2)}\n`);
  const failures = results.filter((row) => !row.pass).length;
  console.log(`Playback lifecycle: ${results.length - failures}/${results.length} passed.`);
  process.exitCode = failures ? 1 : 0;
}
