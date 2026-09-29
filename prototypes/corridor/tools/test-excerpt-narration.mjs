/** Exercise the actual excerpt control and playback functions without playing
 * audio. Media completion/failure and the minimal quote DOM are fixture inputs;
 * the voice label, retry state, cancellation, and preference policy are source. */
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
const quoteText = '「引用の始まり。続きです。引用の終わり。」';
const clips = ['記事。', '引用の始まり。', '続きです。', '引用の終わり。', '記事の続き。']
  .map((text, index) => ({ text, src: `audio/narration/f1/excerpt-${index}.m4a` }));

function fixture({ language = 'en', preference = null, results = [] } = {}) {
  const preferences = new Map(preference ? [['kairo-rec-voice-v1', preference]] : []);
  const requests = [], writes = [], stops = [];
  const quote = {
    textContent: quoteText,
    nextElementSibling: null,
    after(button) { this.nextElementSibling = button; },
  };
  const context = {
    S: { view: 'reader' }, sessionVoicePref: null,
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
  vm.createContext(context);
  vm.runInContext(`let excerptPlayback = 0;\n${controlSource}\n${playbackSource}`, context);
  context.enhanceJapaneseProse({ querySelectorAll: selector => selector === 'blockquote.sentence-original' ? [quote] : [] });
  return { context, button: quote.nextElementSibling, requests, writes, stops, preferences };
}

test('The quote control names the F1 audition before a click, in both languages, without selecting a saved voice', () => {
  for (const language of ['en', 'ja']) {
    for (const preference of [null, 'zundamon']) {
      const f = fixture({ language, preference });
      assert.equal(f.button.textContent, language === 'ja' ? 'F1の声で聞く（試聴版）' : 'Listen · F1 audition voice');
      assert.equal(f.button.type, 'button');
      assert.equal(typeof f.button.handlers.click, 'function');
      assert.deepEqual(f.requests, []);
      assert.deepEqual(f.writes, []);
      assert.equal(f.preferences.get('kairo-rec-voice-v1') ?? null, preference);
      assert.equal(f.context.sessionVoicePref, null);
    }
  }
});

test('Successful excerpt playback uses only its matching F1 clips and leaves the reader voice unchanged', async () => {
  const f = fixture({ preference: 'zundamon' });
  await f.context.playNarratedExcerpt(quoteText, f.button);
  assert.deepEqual(f.requests, clips.slice(1, 4).map(clip => clip.src));
  assert.deepEqual(f.stops, ['reader']);
  assert.equal(f.button.textContent, 'Listen · F1 audition voice');
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get('kairo-rec-voice-v1'), 'zundamon');
  assert.equal(f.context.sessionVoicePref, null);
});

test('A failed clip stops the excerpt with an enabled, explicit F1 retry control; retry can complete', async () => {
  const f = fixture({ results: [true, false] });
  await f.context.playNarratedExcerpt(quoteText, f.button);
  assert.deepEqual(f.requests, clips.slice(1, 3).map(clip => clip.src));
  assert.equal(f.button.textContent, 'Playback failed · Retry F1 audition voice');
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.equal(f.button.disabled, false);
  await f.context.playNarratedExcerpt(quoteText, f.button);
  assert.deepEqual(f.requests.slice(2), clips.slice(1, 4).map(clip => clip.src));
  assert.equal(f.button.textContent, 'Listen · F1 audition voice');
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.has('kairo-rec-voice-v1'), false);
  assert.equal(f.context.sessionVoicePref, null);
});

test('Rejected playback is a visible retryable failure instead of an unhandled rejection', async () => {
  const f = fixture({ language: 'ja', results: [new Error('media unavailable')] });
  await assert.doesNotReject(f.context.playNarratedExcerpt(quoteText, f.button));
  assert.equal(f.button.textContent, '再生できませんでした · F1の試聴音声で再試行');
  assert.equal(f.button.disabled, false);
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.deepEqual(f.writes, []);
});

test('An explicit stop remains a cancellation, without a false playback failure or another clip', async () => {
  const f = fixture();
  let settle;
  f.context.playRecClip = src => { f.requests.push(src); return new Promise(resolve => { settle = resolve; }); };
  f.context.stopRecAudio = () => { f.stops.push('audio'); settle(false); };
  const playing = f.context.playNarratedExcerpt(quoteText, f.button);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.button.textContent, 'Stop · F1 audition voice');
  await f.context.playNarratedExcerpt(quoteText, f.button);
  await playing;
  assert.deepEqual(f.requests, [clips[1].src]);
  assert.equal(f.button.textContent, 'Listen · F1 audition voice');
  assert.equal(f.button.classList.contains('is-speaking'), false);
  assert.deepEqual(f.writes, []);
});
