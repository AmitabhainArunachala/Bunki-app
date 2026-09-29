/** Exercise the actual excerpt control and playback functions without playing
 * audio. Media completion/failure and the minimal quote DOM are fixture inputs;
 * the voice label, retry state, cancellation, and preference policy are source.
 * The clip player and the answer card's voice door run from source against a
 * media stand-in that pauses the way the HTML media element does. Kore paths
 * below are future-recording fixtures, never a claim that those clips ship. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
function between(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `Missing source boundary: ${start}`);
  return source.slice(from, to);
}
const controlSource = between('function enhanceJapaneseProse(', '/** Lists are chosen');
const playbackSource = between('function excerptListenLabel(', 'function stopReadAloud(');
const voiceHelpersSource = between('const narrationVoiceName =', 'function excerptListenLabel(');
const preferenceSource = between('const REC_VOICE_KEY =', 'function ensureRecManifest(');
const voiceNamesSource = between('const NARRATION_VOICES =', 'const LISTEN_RATES =');
const clipSource = between('function stopRecAudio(', '/** 音 — the answer card');
const cardSource = between('let cardAudioSerial = 0', 'function refreshListenRow(');
const quoteText = '「引用の始まり。続きです。引用の終わり。」';
const clips = ['記事。', '引用の始まり。', '続きです。', '引用の終わり。', '記事の続き。']
  .map((text, index) => ({ text, src: `audio/narration/kore/excerpt-${index}.m4a` }));

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

function fixture({ language = 'en', preference = null, results = [], quotes = 1, media = null } = {}) {
  const preferences = new Map(preference ? [['kairo-rec-voice-v1', preference]] : []);
  const requests = [], writes = [], stops = [];
  const quoteList = Array.from({ length: quotes }, () => ({
    textContent: quoteText,
    nextElementSibling: null,
    after(button) { this.nextElementSibling = button; },
  }));
  const context = {
    S: { view: 'reader' }, sessionVoicePref: null,
    articleNarration: { v: 1, voice: 'kore', articles: { fixture: { clips } } },
    tx: (ja, en) => language === 'ja' ? ja : en,
    localStorage: {
      getItem: key => preferences.get(key) ?? null,
      setItem: (key, value) => { writes.push([key, value]); preferences.set(key, value); },
      removeItem: key => { writes.push([key, null]); preferences.delete(key); },
    },
    ensureArticleNarration: async () => ({ articles: { fixture: { clips } } }),
    playRecClip: async src => {
      requests.push(src);
      const result = results.length ? results.shift() : true;
      if (result instanceof Error) throw result;
      return result;
    },
    stopReadAloud: () => stops.push('reader'),
    stopRecAudio: () => stops.push('audio'),
    el(tagName, className, textContent = '') {
      const classes = new Set(className.split(' '));
      return {
        tagName, className, textContent, isConnected: true, disabled: false,
        handlers: {},
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
      assert.equal(f.button.textContent, language === 'ja' ? 'Koreの声で聞く' : 'Listen · Kore');
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
  assert.deepEqual(f.stops, ['reader']);
  assert.equal(f.button.textContent, 'Listen · Kore');
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
  assert.equal(f.button.textContent, 'Listen · Kore');
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
  f.context.stopRecAudio = () => { f.stops.push('audio'); settle(null); };
  const playing = f.context.playNarratedExcerpt(quoteText, f.button);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.button.textContent, 'Stop · Kore');
  await f.context.playNarratedExcerpt(quoteText, f.button);
  await playing;
  assert.deepEqual(f.requests, [clips[1].src]);
  assert.equal(f.button.textContent, 'Listen · Kore');
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.deepEqual(f.writes, []);
});

test('Starting a second connected excerpt retires the first control; only the current one can stop', async () => {
  const media = mediaFixture();
  const f = fixture({ quotes: 2, media, preference: 'zundamon' });
  const [first, second] = f.buttons;
  const firstRun = f.context.playNarratedExcerpt(quoteText, first);
  await settle();
  assert.equal(first.textContent, 'Stop · Kore');
  const secondRun = f.context.playNarratedExcerpt(quoteText, second);
  await settle(); await settle();
  await firstRun;
  assert.equal(first.textContent, 'Listen · Kore', 'The retired control returns to its idle voice label');
  assert.equal(first.classList.contains('is-speaking'), false);
  assert.equal(second.textContent, 'Stop · Kore');
  assert.equal(second.classList.contains('is-speaking'), true);
  assert.equal(media.created[0].paused, true, 'The first excerpt\'s clip stopped on handoff');
  assert.equal(media.created.filter(clip => !clip.paused).length, 1);
  await f.context.playNarratedExcerpt(quoteText, second);
  await settle();
  await secondRun;
  assert.equal(second.textContent, 'Listen · Kore');
  assert.equal(second.classList.contains('is-speaking'), false);
  assert.equal(first.textContent, 'Listen · Kore');
  assert.equal(media.created.every(clip => clip.paused), true);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get('kairo-rec-voice-v1'), 'zundamon');
  assert.equal(f.context.sessionVoicePref, null);
});

test('The clip player resolves a stopped clip as a cancellation, distinct from a failure or completion', async () => {
  const media = mediaFixture();
  const f = fixture({ media });
  const stopped = f.context.playRecClip('audio/w/kore/stopped.m4a', null);
  const replacement = f.context.playRecClip('audio/w/kore/replacement.m4a', null);
  assert.equal(await stopped, null);
  media.created[1].end();
  assert.equal(await replacement, true);
  const broken = f.context.playRecClip('audio/w/kore/broken.m4a', null);
  media.created[2].fail();
  assert.equal(await broken, false);
});

test('Replaying a card word leaves no false failure; a real failure still says so', async () => {
  const media = mediaFixture();
  const note = { textContent: '' };
  const btn = { title: '', dataset: {}, parentElement: { querySelector: selector => selector === '.say-note' ? note : null },
    classList: { add() {}, remove() {} } };
  const context = { S: { view: 'review' }, readAloud: { on: false }, Audio: media.Audio, setImmediate,
    tx: (ja, en) => en, localStorage: { getItem: () => 'kore' },
    ensureRecManifest: async () => ({ words: { 電車: { id: 'densha', voices: ['kore'] } } }) };
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
