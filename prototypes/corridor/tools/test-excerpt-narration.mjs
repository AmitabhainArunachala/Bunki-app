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
import {fileURLToPath} from 'node:url';
import {createDeviceVoice,REASONS as DEVICE_VOICE_REASONS} from '../device-voice.mjs';
import {fixtureSource,fixtureDefinitions} from './corridor-fixture-source.mjs';
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
const authored=fixtureSource(fileURLToPath(new URL('../',import.meta.url)),{rootSource:source});
const definitions=names=>fixtureDefinitions(authored,names);
const playbackSource = definitions(['excerptListenLabel','retireExcerptControl','cancelExcerptPlayback','playNarratedExcerpt']);
const voiceHelpersSource = definitions(['narrationVoiceName','narrationClips']);
const preferenceSource = between('let recManifest;', 'function ensureRecManifest(');
// the slice must start at the generated lock, because the roster and the role law are read
// from it: starting at NARRATION_VOICES would leave VOICE_LOCK undefined
const voiceNamesSource = definitions(['VOICE_LOCK','NARRATION_VOICES','voiceForRole','approvedNarrationClip','approvedNarrationManifest']);
const clipSource = definitions(['stopRecAudio','playRecClip','approvedWordManifest','wordClipKey','wordClipFor']);
const cardSource = definitions(['deviceVoice','cardAudioSerial','reviewVoiceFace','retireCardSpeech','retireCardAudioOnFaceChange','cardVoiceStatus','deviceVoiceMessage','speakCardReading','reviewVoiceTarget','appendReviewVoice','autoSpeakReviewFace','readAloud','buildListenRow','excerptPlayback','retireExcerptControl','cancelExcerptPlayback','excerptListenLabel','stopReadAloud','stopPassageRead','sentenceListeningCatalog','stopSentenceListening']);
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
  Object.assign(context,{createDeviceVoice,DEVICE_VOICE_REASONS});
  context.deviceVoice=createDeviceVoice({});
  context.document??={hidden:false,getElementById:()=>null};
  const retireSource=definitions(['cardAudioSerial','retireCardSpeech']);
  vm.createContext(context);
  vm.runInContext(`${retireSource}\nlet excerptPlayback = 0, excerptControl = null, recAudioEl = null;\n${voiceNamesSource}\n${voiceHelpersSource}\n${controlSource}\n${playbackSource}${media ? `\n${clipSource}` : ''}`, context);
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
  const media = mediaFixture(),
    f = fixture({ quotes: 2, media, preference: "zundamon" });
  for (const button of f.buttons) {
    await f.context.playNarratedExcerpt(quoteText, button);
    await settle();
    assert.equal(button.classList.contains("is-speaking"), false);
    assert.equal(button.disabled, false);
  }
  assert.equal(media.created.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), "zundamon");
  assert.equal(f.context.sessionVoicePref, null);
});

test('The clip player resolves a stopped clip as a cancellation, distinct from a failure or completion', async () => {
  const media = mediaFixture(),
    f = fixture({ media });
  for (const name of ["stopped", "replacement", "broken"])
    assert.equal(
      await f.context.playRecClip(`audio/w/${MAIN}/${name}.m4a`, null),
      false,
    );
  assert.equal(media.created.length, 0);
  assert.deepEqual(f.writes, []);
});

test('Replaying a card word leaves no false failure; a real failure still says so', async () => {
  const media = mediaFixture(),
    note = { textContent: "" },
    btn = {
      isConnected: true,
      title: "",
      dataset: {},
      parentElement: { querySelector: () => note },
      classList: { add() {}, remove() {} },
    };
  const context = {
    S: { view: "review" },
    readAloud: { on: false },
    Audio: media.Audio,
    setImmediate,
    tx: (ja, en) => en,
    localStorage: { getItem: () => MAIN },
    document: { hidden: false, getElementById: () => null },
    createDeviceVoice,
    DEVICE_VOICE_REASONS,
  };
  vm.createContext(context);
  vm.runInContext(
    voiceNamesSource +
      "\n" +
      preferenceSource +
      "\n" +
      clipSource +
      "\n" +
      cardSource,
    context,
  );
  context.speakCardReading("でんしゃ", btn, "電車");
  context.speakCardReading("でんしゃ", btn, "電車");
  await settle();
  assert.equal(media.created.length, 0);
  assert.equal(btn.dataset.voiceUnavailable, "current-source-required");
  assert.equal(note.textContent, "Current audio source required");
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
  const media = mediaFixture(),
    f = fixture({ media });
  assert.equal(
    await f.context.playRecClip(`audio/w/${MAIN}/one.m4a`, null),
    false,
  );
  assert.deepEqual(f.stops, ["listening"]);
  assert.equal(media.created.length, 0);
});

const listeningSource = definitions(['renderSentenceListening', 'retireCardSpeech',
  'stopReadAloud', 'stopPassageRead', 'cancelExcerptPlayback', 'retireExcerptControl',
  'stopRecAudio', 'stopSentenceListening', 'verifiedSentenceAudio']);

function listeningFixture({ loadAudio = null, retainedOwner = false } = {}) {
  const nodes = [], events = [], media = [], boundaries = [];
  function el(tagName, className = '', textContent = '') {
    const classes = new Set(className.split(' '));
    const node = {
      tagName, className, textContent, dataset: {}, childNodes: [], handlers: {},
      isConnected: true, value: '',
      classList: { remove: name => classes.delete(name), contains: name => classes.has(name) },
      append(...children) { this.childNodes.push(...children); },
      replaceChildren(...children) { this.childNodes = children; },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(type, handler) { this.handlers[type] = handler; },
    };
    nodes.push(node);
    return node;
  }
  const cue = { voice: MAIN, path: `audio/s/${MAIN}/retained.m4a` };
  const entry = { plan: { id: 'listening-fixture', listeningCue: cue },
    context: { title: 'Fixture', quote: quoteText, sourceId: 'fixture' } };
  const state = { listeningRun: { completedPlays: 0, revealed: false, pending: false } };
  const excerpt = el('button', 'is-speaking', 'Stop');
  const snapshot = operation => {
    events.push(operation);
    boundaries.push({ operation, cardRetired: context.cardAudioSerial > 0,
      deviceCancelled: events.includes('device:cancel'),
      excerptRetired: context.excerptControl === null && !excerpt.classList.contains('is-speaking'),
      passageStopped: !context.readAloud.on && context.readAloud.generation > 0,
      recordingStopped: context.recAudioEl === null });
  };
  const context = {
    AbortController, clearTimeout,
    recordEpoch: 1, recordReady: epoch => epoch === 1, recordWritable: () => true,
    S: { view: 'sentence-practice', sentencePracticeView: state },
    NARRATION_VOICES: { [MAIN]: VOICE },
    sentenceDraftController: null,
    attachSentenceDraft: () => ({ binding: {} }),
    sentencePracticeError: error => error.message,
    el, biLabel: (tag, cls, ja, en) => el(tag, cls, en), tx: (ja, en) => en,
    document: { getElementById: id => nodes.find(node => node.id === id) || null },
    cardAudioSerial: 0,
    deviceVoice: { cancel: () => events.push('device:cancel') },
    readAloud: { on: true, generation: 0 }, excerptControl: excerpt, excerptPlayback: 0,
    excerptListenLabel: () => 'Listen',
    recAudioEl: { pause: () => events.push('recording:pause') },
    sentenceListeningOwner: null,
    resolveSentenceListeningCue: async () => { snapshot('cue:resolve'); return cue; },
    fetch: async () => { snapshot('fetch'); throw new Error('unexpected media fetch'); },
    Blob: class extends Blob {
      constructor(...args) { snapshot('blob'); super(...args); }
    },
    URL: {
      createObjectURL: () => { snapshot('url:create'); return 'blob:silent-fixture'; },
      revokeObjectURL: url => events.push(`url:revoke:${url}`),
    },
    Audio: class {
      constructor(url) { snapshot('audio:construct'); this.src = url; media.push(this); }
      async play() { snapshot('audio:play'); }
      pause() { events.push('audio:pause'); }
    },
  };
  const retained = retainedOwner ? {
    controller: new AbortController(), url: 'blob:retained',
    audio: { pause: () => events.push('retained:pause'), onended: () => {}, onerror: () => {} },
    stopped: () => events.push('retained:stopped'),
  } : null;
  retained?.controller.signal.addEventListener('abort', () => events.push('retained:abort'));
  context.sentenceListeningOwner = retained;
  vm.createContext(context);
  vm.runInContext(listeningSource, context);
  const verified = context.verifiedSentenceAudio;
  context.verifiedSentenceAudio = (...args) => {
    snapshot('audio:verify');
    return loadAudio ? loadAudio(...args) : verified(...args);
  };
  context.renderSentenceListening(el('main'), entry, state);
  const find = id => nodes.find(node => node.id === id);
  return { context, state, retained, events, media, boundaries, find,
    click: () => find('sentence-listening-play').handlers.click() };
}

function assertListeningHandoff(fixture) {
  assert(fixture.boundaries.length > 0, 'the actual handler reached the audio boundary');
  for (const { operation, ...retired } of fixture.boundaries) {
    assert.deepEqual(retired, { cardRetired: true, deviceCancelled: true,
      excerptRetired: true, passageStopped: true, recordingStopped: true },
    `every previous voice yields before ${operation}`);
  }
}

test('ONE OWNER · the sentence-listening lane silences every other voice before media access', async () => {
  const f = listeningFixture({ loadAudio: async () => new Uint8Array(0) });
  await f.click();
  assertListeningHandoff(f);
  assert.deepEqual(f.boundaries.map(row => row.operation),
    ['cue:resolve', 'audio:verify', 'blob', 'url:create', 'audio:construct', 'audio:play']);
  assert.equal(f.media.length, 1);
  assert.equal(f.state.listeningRun.completedPlays, 0);
});

test('ONE OWNER · unbound retained listening recordings cancel other voices without media access', async () => {
  const f = listeningFixture();
  await f.click();
  assertListeningHandoff(f);
  assert.deepEqual(f.boundaries.map(row => row.operation), ['cue:resolve', 'audio:verify']);
  assert.equal(f.find('sentence-listening-audio-status').textContent, 'current-source-required');
  assert.equal(f.context.sentenceListeningOwner, null);
  assert.equal(f.media.length, 0);
  assert.equal(f.state.listeningRun.completedPlays, 0);
});

test('ONE OWNER · a retained listening owner is cancelled before a retry can access media', async () => {
  const f = listeningFixture({ retainedOwner: true });
  await f.click();
  assert.deepEqual(f.events, ['retained:abort', 'retained:pause', 'url:revoke:blob:retained', 'retained:stopped']);
  assert.equal(f.retained.controller.signal.aborted, true);
  assert.equal(f.retained.audio.onended, null);
  assert.equal(f.retained.audio.onerror, null);
  assert.equal(f.context.sentenceListeningOwner, null);
  assert.deepEqual(f.boundaries, []);
  assert.equal(f.media.length, 0);
  await f.click();
  assertListeningHandoff(f);
  assert.deepEqual(f.boundaries.map(row => row.operation), ['cue:resolve', 'audio:verify']);
  assert.equal(f.media.length, 0);
});

test('ONE OWNER · cancelling a pending cached listening read makes its completion inert', async () => {
  let release, signal;
  const f = listeningFixture({ loadAudio: (cue, ownerSignal) => {
    signal = ownerSignal;
    return new Promise(resolve => { release = resolve; });
  } });
  const playing = f.click();
  await settle();
  assertListeningHandoff(f);
  assert.equal(signal.aborted, false);
  await f.click();
  assert.equal(signal.aborted, true);
  release(new Uint8Array(0));
  await playing;
  assert.deepEqual(f.boundaries.map(row => row.operation), ['cue:resolve', 'audio:verify']);
  assert.equal(f.media.length, 0);
  assert.equal(f.context.sentenceListeningOwner, null);
  assert.equal(f.state.listeningRun.completedPlays, 0);
  assert.equal(f.find('sentence-listening-audio-status').textContent,
    'Playback stopped. You can listen again from the start.');
});
