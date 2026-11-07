/** Exercise the actual excerpt control and playback functions without playing
 * audio.
 *
 * V (2026-10-17): this suite ran ZERO assertions — its source boundary `/** Lists are chosen`
 * had been deleted from corridor.js, so it threw at import, and it was named in no battery, so
 * nobody saw. The quote audio John asked for on 09-29 had no executing test at all. The boundary
 * is repaired, the fixtures speak manifest v2, and the two behaviours never covered — an excerpt
 * resolving inside ITS OWN article, and an excerpt retiring when the room's audio stops — are
 * covered below. Media completion/failure and the minimal quote DOM are fixture inputs;
 * the voice label, retry state, cancellation, and preference policy are source.
 * The clip player and the answer card's voice door run from source against a
 * media stand-in that pauses the way the HTML media element does. Kore paths
 * below are future-recording fixtures, never a claim that those clips ship. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { runtimeLock } from './voice-lock.mjs';

/** The source under test. KAIRO_CORRIDOR_SOURCE lets the mutant adjudicator point this
 * suite at a one-line mutation of corridor.js and prove each control actually goes red;
 * unset — which is every real run — it is the shipped file. */
const source = readFileSync(process.env.KAIRO_CORRIDOR_SOURCE
  || new URL('../corridor.js', import.meta.url), 'utf8');
function between(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `Missing source boundary: ${start}`);
  return source.slice(from, to);
}
const controlSource = between('function enhanceJapaneseProse(', '/* Save is one tap');
const playbackSource = between('function excerptListenLabel(', 'function stopReadAloud(');
const voiceHelpersSource = between('const narrationVoiceName =', 'function excerptListenLabel(');
const preferenceSource = between('let recManifest;', 'function ensureRecManifest(');
// the slice must start at the generated lock, because the roster and the role law are read
// from it: starting at NARRATION_VOICES would leave VOICE_LOCK undefined
const voiceNamesSource = between('/* === VOICE_LOCK', 'const LISTEN_RATES =');
const clipSource = between('function stopRecAudio(', '/** 音 — the answer card');
const cardSource = between('let cardAudioSerial = 0', 'function refreshListenRow(');
const quoteText = '「引用の始まり。続きです。引用の終わり。」';
const LOCK = runtimeLock();
const MAIN = LOCK.main, VOICE = LOCK.voices[LOCK.main];
const lockBlock = { model: LOCK.model, main: LOCK.main, second: LOCK.second };
const clipSet = (stem) => ['記事。', '引用の始まり。', '続きです。', '引用の終わり。', '記事の続き。']
  .map((text, index) => ({ text, src: `audio/narration/${MAIN}/${stem}-${index}.m4a`,
    voice: MAIN, speakerRole: 'narrator', model: LOCK.model }));
const clips = clipSet('excerpt');

/** A media element stand-in: pause() fires `pause` from a queued task, before
 * `ended` could be true; end() and fail() finish playback the two other ways. */
function mediaFixture() {
  const created = [];
  class Audio {
    constructor(src) { this.src = src; this.ended = false; this.paused = true; created.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() {
      if (this.paused) return;
      this.paused = true;
      setImmediate(() => this.onpause?.());
    }
    end() { this.ended = true; this.paused = true; this.onpause?.(); this.onended?.(); }
    fail() { this.onerror?.(); }
  }
  return { Audio, created };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture({ language = 'en', preference = null, results = [], quotes = 1, media = null,
  articles = null, sourceId = null } = {}) {
  const preferences = new Map(preference ? [['kairo-rec-voice-v1', preference]] : []);
  const requests = [], writes = [], stops = [];
  const library = articles || { fixture: { clips } };
  const quoteList = Array.from({ length: quotes }, () => ({
    textContent: quoteText,
    nextElementSibling: null,
    dataset: sourceId ? { sourceId } : {},
    after(button) { this.nextElementSibling = button; },
  }));
  const context = {
    S: { view: 'reader' }, sessionVoicePref: null,
    articleNarration: { v: 2, lock: lockBlock, articles: library },
    tx: (ja, en) => language === 'ja' ? ja : en,
    localStorage: {
      getItem: key => preferences.get(key) ?? null,
      setItem: (key, value) => { writes.push([key, value]); preferences.set(key, value); },
      removeItem: key => { writes.push([key, null]); preferences.delete(key); },
    },
    ensureArticleNarration: async () => ({ v: 2, lock: lockBlock, articles: library }),
    playRecClip: async src => {
      requests.push(src);
      const result = results.length ? results.shift() : true;
      if (result instanceof Error) throw result;
      return result;
    },
    stopPassageRead: () => stops.push('reader'),
    stopSentenceListening: () => stops.push('listening'),
    stopReadAloud: () => { stops.push('reader'); },
    stopRecAudio: () => stops.push('audio'),
    el(tagName, className, textContent = '') {
      const classes = new Set(className.split(' '));
      return {
        tagName, className, textContent, isConnected: true, disabled: false,
        handlers: {}, dataset: {},
        classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
        addEventListener(type, handler) { this.handlers[type] = handler; },
      };
    },
  };
  if (media) {
    // The real clip player: every request goes through source playRecClip/stopRecAudio.
    Object.assign(context, { Audio: media.Audio, setImmediate });
    delete context.playRecClip; delete context.stopRecAudio;
  }
  vm.createContext(context);
  vm.runInContext(`let excerptPlayback = 0, excerptControl = null, recAudioEl = null;\n${voiceNamesSource}\n${voiceHelpersSource}\n${controlSource}\n${playbackSource}${media ? `\n${clipSource}` : ''}`, context);
  context.enhanceJapaneseProse({ querySelectorAll: selector => selector === 'blockquote.sentence-original' ? quoteList : [] });
  const buttons = quoteList.map(quote => quote.nextElementSibling);
  return { context, button: buttons[0], buttons, requests, writes, stops, preferences };
}

test('The quote control names the approved Kore fixture before a click without changing a saved voice', () => {
  for (const language of ['en', 'ja']) {
    for (const preference of [null, 'zundamon']) {
      const f = fixture({ language, preference });
      assert.equal(f.button.textContent, language === 'ja' ? `${VOICE}の声で聞く` : `Listen · ${VOICE}`);
      assert.equal(f.button.type, 'button');
      assert.equal(typeof f.button.handlers.click, 'function');
      assert.deepEqual(f.requests, []);
      assert.deepEqual(f.writes, []);
      assert.equal(f.preferences.get('kairo-rec-voice-v1') ?? null, preference);
      assert.equal(f.context.sessionVoicePref, null);
    }
  }
});

test('Successful excerpt playback uses only its matching approved fixture clips and leaves preferences unchanged', async () => {
  const f = fixture({ preference: 'zundamon' });
  await f.context.playNarratedExcerpt(quoteText, f.button);
  assert.deepEqual(f.requests, clips.slice(1, 4).map(clip => clip.src));
  // the excerpt lane is cleared first ('audio'), then the passage read yields to the quote
  // ('reader'): one owner at a time, and the quote never cancels itself doing it
  assert.deepEqual(f.stops, ['audio', 'reader']);
  assert.equal(f.button.textContent, `Listen · ${VOICE}`);
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get('kairo-rec-voice-v1'), 'zundamon');
  assert.equal(f.context.sessionVoicePref, null);
});

test('A failed clip stops the excerpt with an enabled retry control; retry can complete', async () => {
  const f = fixture({ results: [true, false] });
  await f.context.playNarratedExcerpt(quoteText, f.button);
  assert.deepEqual(f.requests, clips.slice(1, 3).map(clip => clip.src));
  assert.equal(f.button.textContent, 'Playback failed · try again');
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.equal(f.button.disabled, false);
  await f.context.playNarratedExcerpt(quoteText, f.button);
  assert.deepEqual(f.requests.slice(2), clips.slice(1, 4).map(clip => clip.src));
  assert.equal(f.button.textContent, `Listen · ${VOICE}`);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.has('kairo-rec-voice-v1'), false);
  assert.equal(f.context.sessionVoicePref, null);
});

test('Rejected playback is a visible retryable failure instead of an unhandled rejection', async () => {
  const f = fixture({ language: 'ja', results: [new Error('media unavailable')] });
  await assert.doesNotReject(f.context.playNarratedExcerpt(quoteText, f.button));
  assert.equal(f.button.textContent, '再生できませんでした · もう一度');
  assert.equal(f.button.disabled, false);
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.deepEqual(f.writes, []);
});

test('An explicit stop remains a cancellation, without a false playback failure or another clip', async () => {
  const f = fixture();
  let settle;
  f.context.playRecClip = src => { f.requests.push(src); return new Promise(resolve => { settle = resolve; }); };
  f.context.stopRecAudio = () => { f.stops.push('audio'); settle?.(null); };
  const playing = f.context.playNarratedExcerpt(quoteText, f.button);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.button.textContent, `Stop · ${VOICE}`);
  await f.context.playNarratedExcerpt(quoteText, f.button);
  await playing;
  assert.deepEqual(f.requests, [clips[1].src]);
  assert.equal(f.button.textContent, `Listen · ${VOICE}`);
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.deepEqual(f.writes, []);
});

test('Starting a second connected excerpt retires the first control; only the current one can stop', async () => {
  const media = mediaFixture();
  const f = fixture({ quotes: 2, media, preference: 'zundamon' });
  const [first, second] = f.buttons;
  const firstRun = f.context.playNarratedExcerpt(quoteText, first);
  await settle();
  assert.equal(first.textContent, `Stop · ${VOICE}`);
  const secondRun = f.context.playNarratedExcerpt(quoteText, second);
  await settle(); await settle();
  await firstRun;
  assert.equal(first.textContent, `Listen · ${VOICE}`, 'The retired control returns to its idle voice label');
  assert.equal(first.classList.contains('is-speaking'), false);
  assert.equal(second.textContent, `Stop · ${VOICE}`);
  assert.equal(second.classList.contains('is-speaking'), true);
  assert.equal(media.created[0].paused, true, 'The first excerpt\'s clip stopped on handoff');
  assert.equal(media.created.filter(clip => !clip.paused).length, 1);
  await f.context.playNarratedExcerpt(quoteText, second);
  await settle();
  await secondRun;
  assert.equal(second.textContent, `Listen · ${VOICE}`);
  assert.equal(second.classList.contains('is-speaking'), false);
  assert.equal(first.textContent, `Listen · ${VOICE}`);
  assert.equal(media.created.every(clip => clip.paused), true);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get('kairo-rec-voice-v1'), 'zundamon');
  assert.equal(f.context.sessionVoicePref, null);
});

test('The clip player resolves a stopped clip as a cancellation, distinct from a failure or completion', async () => {
  const media = mediaFixture();
  const f = fixture({ media });
  const stopped = f.context.playRecClip(`audio/w/${MAIN}/stopped.m4a`, null);
  const replacement = f.context.playRecClip(`audio/w/${MAIN}/replacement.m4a`, null);
  assert.equal(await stopped, null);
  media.created[1].end();
  assert.equal(await replacement, true);
  const broken = f.context.playRecClip(`audio/w/${MAIN}/broken.m4a`, null);
  media.created[2].fail();
  assert.equal(await broken, false);
});

test('Replaying a card word leaves no false failure; a real failure still says so', async () => {
  const media = mediaFixture();
  const note = { textContent: '' };
  const btn = { title: '', dataset: {}, parentElement: { querySelector: selector => selector === '.say-note' ? note : null },
    classList: { add() {}, remove() {} } };
  const context = { S: { view: 'review' }, readAloud: { on: false }, Audio: media.Audio, setImmediate,
    tx: (ja, en) => en, localStorage: { getItem: () => MAIN },
    ensureRecManifest: async () => ({ v: 2, lock: lockBlock, words: { '電車|でんしゃ': {
      surface: '電車', reading: 'でんしゃ', voice: MAIN, speakerRole: 'word', model: LOCK.model,
      src: `audio/w/${MAIN}/densha.m4a` } } }) };
  vm.createContext(context);
  vm.runInContext(`${voiceNamesSource}\n${preferenceSource}\n${clipSource}\n${cardSource}`, context);
  context.speakCardReading('でんしゃ', btn, '電車');
  await settle();
  context.speakCardReading('でんしゃ', btn, '電車');
  await settle(); await settle();
  assert.equal(media.created.length, 2);
  assert.equal(media.created[0].paused, true);
  assert.equal(note.textContent, '', 'The retap restarts playback without a failure note');
  assert.equal(btn.title, '');
  media.created[1].fail();
  await settle();
  assert.equal(note.textContent, 'This recording could not play here');
});

test('An excerpt resolves inside its OWN article, and refuses when it cannot tell which', async () => {
  // the same sentence stands in two articles — the shelf is full of shared stock phrases
  const articles = { 'article:a': { clips: clipSet('a') }, 'article:b': { clips: clipSet('b') } };
  const own = fixture({ articles, sourceId: 'article:b' });
  await own.context.playNarratedExcerpt(quoteText, own.button, 'article:b');
  assert.deepEqual(own.requests, clipSet('b').slice(1, 4).map(clip => clip.src),
    'the quote plays ITS OWN article\u2019s recording, not the first global substring match');
  assert.equal(own.button.textContent, `Listen · ${VOICE}`);

  // the control built by the reader carries the id, so the click cannot lose it
  assert.equal(typeof own.button.handlers.click, 'function');

  // with no id to go on, two candidates is a refusal, never a guess
  const blind = fixture({ articles });
  await blind.context.playNarratedExcerpt(quoteText, blind.button);
  assert.deepEqual(blind.requests, [], 'an ambiguous quote plays nothing');
  assert.equal(blind.button.dataset.excerptUnresolved, 'ambiguous');
  assert.equal(blind.button.textContent, 'This excerpt matches more than one article');

  // one candidate is still resolvable without an id
  const single = fixture({ articles: { 'article:a': { clips: clipSet('a') } } });
  await single.context.playNarratedExcerpt(quoteText, single.button);
  assert.deepEqual(single.requests, clipSet('a').slice(1, 4).map(clip => clip.src));
});

test('Cancelling the excerpt lane returns the control and makes a late finish inert', async () => {
  const f = fixture();
  let release;
  f.context.playRecClip = src => { f.requests.push(src); return new Promise(resolve => { release = resolve; }); };
  const playing = f.context.playNarratedExcerpt(quoteText, f.button);
  await settle();
  assert.equal(f.button.textContent, `Stop · ${VOICE}`);
  assert.equal(f.button.classList.contains('is-speaking'), true);
  // what leaving the passage, the view or Back now does
  f.context.cancelExcerptPlayback();
  assert.equal(f.button.textContent, `Listen · ${VOICE}`, 'the retired control returns to its idle label');
  assert.equal(f.button.classList.contains('is-speaking'), false);
  release(true);
  await playing;
  assert.equal(f.requests.length, 1, 'the retired run asks for no further clip');
  assert.equal(f.button.textContent, `Listen · ${VOICE}`, 'and a late completion cannot repaint it');
  assert.deepEqual(f.writes, []);
});

test('A quote that names its own article plays nothing when that article is unrendered', async () => {
  // the article the quote belongs to has no clips; another article happens to hold the same words.
  // Global uniqueness is not ownership: the known source fails closed.
  const articles = { 'article:other': { clips: clipSet('other') } };
  const f = fixture({ articles, sourceId: 'article:mine' });
  await f.context.playNarratedExcerpt(quoteText, f.button, 'article:mine');
  assert.deepEqual(f.requests, [], 'another article\u2019s recording is never borrowed');
  assert.equal(f.button.textContent, 'No recording for this excerpt');
  // the control built by the page passes the quote's own id on the click as well
  const page = fixture({ articles, sourceId: 'article:mine' });
  await page.button.handlers.click();
  await settle();
  assert.deepEqual(page.requests, []);
});

test('ONE OWNER · a recorded clip ends the sentence-listening lane before it plays', async () => {
  const media = mediaFixture();
  const f = fixture({ media });
  const playing = f.context.playRecClip(`audio/w/${MAIN}/one.m4a`, null);
  assert.deepEqual(f.stops, ['listening'], 'the other lane is stopped first');
  assert.equal(media.created.length, 1);
  media.created[0].end();
  assert.equal(await playing, true);
});

test('ONE OWNER · the sentence-listening lane silences every other voice before it speaks', () => {
  // structural: the listening player is wired deep in its room, so the law is pinned where it
  // lives — inside its play handler, before its own media element exists
  const at = source.indexOf('function renderSentenceListening(');
  assert(at > 0, 'renderSentenceListening moved; this control no longer knows where to look');
  const handler = source.indexOf("play.addEventListener('click', async () => {", at);
  const media = source.indexOf('new Audio(owner.url)', handler);
  const yields = source.indexOf('stopReadAloud(); stopRecAudio();', handler);
  assert(handler > at && media > handler, 'the listening play handler moved');
  assert(yields > handler && yields < media, 'the quote, the read and the card clip yield before the sentence speaks');
});
