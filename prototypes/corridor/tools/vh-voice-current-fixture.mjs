/** Playback contract checks, never an audition or an audio render.
 *
 * V (2026-10-17). This suite used to prove playback against a world that did not exist: it
 * invented {電車:{id:'densha',voices:['kore','charon']}} — a word in no shipped manifest — watched
 * it play, then loaded the REAL manifest and asserted the PENDING state. It asserted that he
 * hears nothing, and that assertion passed, every day, for seventeen days.
 *
 * So the suite is now in two declared halves:
 *   · REAL-MANIFEST cases read the files this build actually ships and assert what a learner
 *     actually gets. They are the ones that can go red when the audio is missing, and the
 *     pending ones carry a tripwire: the moment a clip lands on disk, the pending case fails
 *     and the positive one must be satisfied instead. Silence can no longer stay green.
 *   · MECHANICS cases keep synthetic manifests, because a failure, a cancellation and a late
 *     completion cannot be staged with real media. They are labelled as mechanics and they
 *     never stand in for a real-manifest positive.
 *
 * No test fetches a URL, instantiates real Audio, or claims voice quality.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { runtimeLock } from './voice-lock.mjs';
import { createDeviceVoice, REASONS as DEVICE_VOICE_REASONS } from '../device-voice.mjs';
// the voice's one vocabulary, which corridor.js imports (its lines and words reach the lifted functions from here)
import { VOICE_NOTES, VOICE_WORDS, voiceLineOf, voiceShortOf } from '../modules/voice-lines.mjs';

/** The source under test. KAIRO_CORRIDOR_SOURCE lets the mutant adjudicator point this
 * suite at a one-line mutation of corridor.js and prove each control actually goes red;
 * unset — which is every real run — it is the shipped file. */
const source = readFileSync(process.env.KAIRO_CORRIDOR_SOURCE
  || new URL('../corridor.js', import.meta.url), 'utf8');
const voiceSource = readFileSync(new URL('../modules/voice.mjs', import.meta.url), 'utf8');
const wordSource = readFileSync(new URL('../modules/word-entry.mjs', import.meta.url), 'utf8');
function between(start, end, input = source) {
  const from = input.indexOf(start), to = input.indexOf(end, from);
  assert(from >= 0 && to > from, `Missing source boundary: ${start}`);
  return input.slice(from, to);
}
const narrationSource = between('const readAloud =', '/* ------------------------------------------------ 収録の声');
// anchored on the manifest state, not on the deleted chooser: V removed REC_VOICE_KEY,
// REC_ROSTER, sessionVoicePref and recVoicePref outright
const recordedSource = between('let recManifest;', '/** F · the listen door');
const barSource = between('function buildListenRow(', '/* G5 · LAYERS');
// G3 moved these declarations into modules; keep exercising their actual bodies.
const voiceHelpersSource = between('function voiceForRole(', 'function refreshListenRow(', voiceSource);
const wordHelpersSource = between('function wordClipKey(', 'function openSlip(', wordSource);
const controlSource = between('function enhanceJapaneseProse(', '/* Save is one tap');
const settle = () => new Promise(resolve => setImmediate(resolve));
const passage = { id: 'fixture' };
const JA_LOCAL = { name: 'Kyoko', voiceURI: 'kyoko', lang: 'ja-JP', localService: true, default: true };
const EN_LOCAL = { name: 'Samantha', voiceURI: 'samantha', lang: 'en-US', localService: true };
const LOCK = runtimeLock();
const MAIN = LOCK.main, SECOND = LOCK.second;
const lockBlock = { model: LOCK.model, main: MAIN, second: SECOND };
/** MECHANICS fixture. A clip carries its own voice, role and model — v1's single global voice
 * could not say which speaker was talking, so the second voice was unreachable by construction. */
const approvedManifest = ({ voice = MAIN, role = 'narrator', model = LOCK.model, id = 'fixture' } = {}) => ({
  v: 2, lock: lockBlock, articles: { [id]: { clips: [
    { text: '最初の文。', src: `audio/narration/${voice}/first.m4a`, voice, speakerRole: role, model },
    { text: '次の文。', src: `audio/narration/${voice}/second.m4a`, voice, speakerRole: role, model },
  ] } },
});
/** MECHANICS fixture: one word, keyed the only way a word may be keyed — surface AND reading. */
const approvedWords = ({ voice = MAIN, role = 'word', model = LOCK.model,
  key = '電車|でんしゃ', surface = '電車', reading = 'でんしゃ' } = {}) => ({
  v: 2, lock: lockBlock, words: { [key]: { surface, reading, voice, speakerRole: role, model,
    src: `audio/w/${voice}/densha.m4a` } },
});
/** The files this build actually ships. */
const shipped = (name) => { try { return JSON.parse(readFileSync(new URL(`../audio/${name}`, import.meta.url), 'utf8')); } catch { return null; } };
const clipsOnDisk = (dir) => { try { return readdirSync(new URL(`../audio/${dir}/`, import.meta.url)).filter((f) => f.endsWith('.m4a')); } catch { return []; } };

function eventTarget() {
  const listeners = new Map();
  return { addEventListener(type, handler) {
    if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler);
  }, dispatchEvent(event) { for (const handler of listeners.get(event.type) || []) handler(event); } };
}

function domFixture() {
  const ids = new Map();
  function el(tagName, className = '', content = '') {
    const classes = new Set(className.split(/\s+/).filter(Boolean)), attributes = new Map();
    let id = '', text = content;
    const node = {
      tagName, className, children: [], dataset: {}, handlers: {}, isConnected: true, title: '', disabled: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      style: { setProperty(name, value) { this[name] = value; } },
      get id() { return id; }, set id(value) { id = value; ids.set(value, node); },
      get textContent() { return text + this.children.map(child => child.textContent || '').join(''); },
      set textContent(value) { text = value; this.children = []; },
      append(...children) { this.children.push(...children); for (const child of children) child.parentElement = this; },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      addEventListener(type, callback) { this.handlers[type] = callback; },
      querySelectorAll(selector) {
        const match = child => selector.startsWith('#') ? child.id === selector.slice(1)
          : selector.startsWith('.') ? child.classList.contains(selector.slice(1))
            : child.tagName === selector;
        return this.children.flatMap(child => [...(match(child) ? [child] : []), ...child.querySelectorAll(selector)]);
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    };
    return node;
  }
  return { el, document: { ...eventTarget(), hidden: false, getElementById: id => ids.get(id) || null } };
}

function mediaFixture() {
  const created = [];
  class Audio {
    constructor(src) {
      this.src = src; this.ended = false; this.paused = true;
      this.duration = 10; this.currentTime = 0; created.push(this);
    }
    play() { this.paused = false; this.onplay?.(); return Promise.resolve(); }
    pause() {
      if (this.paused) return;
      this.paused = true; setImmediate(() => this.onpause?.());
    }
    end() { this.ended = true; this.paused = true; this.onpause?.(); this.onended?.(); }
    fail() { this.paused = true; this.onerror?.(); }
    time(fraction) { this.currentTime = this.duration * fraction; this.ontimeupdate?.(); }
  }
  return { Audio, created };
}

async function fixture({ narration = null, words = { v: 1, words: {} },
  flags = { __KAIRO_NARRATION__: 1, __KAIRO_AUDIO__: 1 }, preference = null, passageId = passage.id,
  sessionPreference = null, storageThrows = false, fetchError = false, language = 'en',
  voices = [EN_LOCAL, JA_LOCAL], voiceSetting = 'on' } = {}) {
  const dom = domFixture(), media = mediaFixture();
  const preferences = new Map(preference ? [['kairo-rec-voice-v1', preference]] : []);
  const fetches = [], writes = [], deviceVoiceCalls = [];
  let refreshes = 0, cancellations = 0;
  const context = {
    window: { ...eventTarget(), ...flags },
    S: { view: 'reader', stack: [], review: { ix: 0, revealed: true, history: [], queue: [{ t: 'word', id: '電車' }] } },
    ...dom, Audio: media.Audio, clearTimeout,
    tx: (ja, en) => language === 'ja' ? ja : en, bi: () => language !== 'ja',
    VOICE_NOTES, VOICE_WORDS, voiceLineOf, voiceShortOf,
    // no voice layer here, as in the single-file build, whose bundle is on the page
    __CORRIDOR_BUNDLE__: {},
    uiIcon: () => dom.el('svg'),
    refreshListenRow: () => { refreshes += 1; },
    stopSentenceListening() {}, wordVoice: () => voiceSetting,
    createDeviceVoice: () => createDeviceVoice(context), DEVICE_VOICE_REASONS,
    speechSynthesis: { ...eventTarget(), getVoices: () => voices,
      speak(utterance) { deviceVoiceCalls.push(utterance); utterance.onstart?.(); },
      cancel() { cancellations += 1; } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    localStorage: {
      getItem: key => { if (storageThrows) throw new Error('storage denied'); return preferences.get(key) ?? null; },
      setItem: (key, value) => { writes.push([key, value]); preferences.set(key, value); },
      removeItem: key => { writes.push([key, null]); preferences.delete(key); },
    },
    fetch: async url => {
      fetches.push(url);
      if (fetchError) throw new Error('offline');
      assert(['audio/article-narration.json', 'audio/manifest.json'].includes(url), `Unexpected fetch ${url}`);
      const value = url === 'audio/article-narration.json' ? narration : words;
      return { ok: value !== null, json: async () => value };
    },
    sessionVoicePref: sessionPreference,
  };
  context.window.speechSynthesis = context.speechSynthesis;
  vm.createContext(context);
  vm.runInContext(`${voiceHelpersSource}\n${wordHelpersSource}\n${narrationSource}\n${recordedSource}\n${barSource}\n${controlSource}`, context);
  await context.ensureArticleNarration(); await context.ensureRecManifest();
  return {
    context, ...media, ...dom, fetches, writes, preferences, deviceVoiceCalls,
    get refreshes() { return refreshes; },
    get cancellations() { return cancellations; },
    state: vm.runInContext('readAloud', context),
    loadedNarration: () => vm.runInContext('articleNarration', context),
    bar: () => context.buildListenRow({ id: passageId }),
    wordClip: (surface, reading, role, seq) =>
      context.wordClipFor(vm.runInContext('recManifest', context), surface, reading, role, seq),
    card() {
      const wrapper = dom.el('div'), button = dom.el('button'), note = dom.el('span', 'say-note');
      wrapper.append(button, note); return { button, note };
    },
    reviewCard() {
      context.S.view = 'review';
      const row = dom.el('div');
      context.appendReviewVoice(row, { text: 'でんしゃ', word: '電車' });
      context.retireCardAudioOnFaceChange();
      return { button: row.querySelector('#card-say'), note: row.querySelector('.say-note') };
    },
  };
}

// Parent-frozen fixture continuation. The original prefix above is byte-identical.
let lastFixture;
export async function createSixFixture(options = {}) { lastFixture = await fixture(options); return lastFixture; }
export function bindSixVoiceLayer(f, layer) {
  // VM fixture input only, never a production export, native input or source rewrite.
  f.context.__VH_SIX_LAYER_INPUT = layer;
  vm.runInContext('voiceLayer = __VH_SIX_LAYER_INPUT;', f.context);
  delete f.context.__VH_SIX_LAYER_INPUT;
}
export function fixtureSnapshot() { return lastFixture ? {createdAudio:lastFixture.created.length,deviceVoiceCalls:lastFixture.deviceVoiceCalls.length,fetches:[...lastFixture.fetches],writes:[...lastFixture.writes],bundleTruthy:!!lastFixture.context.__CORRIDOR_BUNDLE__} : null; }
export { approvedWords, EN_LOCAL, JA_LOCAL, settle };
export const loadedSixSourceText = source;
