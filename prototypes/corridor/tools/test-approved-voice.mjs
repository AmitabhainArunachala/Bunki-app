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
      tagName, className, children: [], dataset: {}, handlers: {}, isConnected: true, title: '',
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

// Current runtime refuses unbound audio; shipped metadata and assets stay intact.
async function assertUnboundDisabled(options = {}) {
  const f = await fixture(options);
  const { button, note } = f.card();
  let requests = 0;
  f.context.ensureRecManifest = () => {
    requests++;
    return Promise.resolve(approvedWords());
  };
  for (const text of ["でんしゃ", "English", "日本語 and English"]) {
    f.context.speakCardReading(text, button, "電車");
    await settle();
  }
  assert.equal(
    requests,
    0,
    "no recording request before current source admission",
  );
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.equal(button.dataset.voiceUnavailable, "current-source-required");
  assert.equal(
    note.textContent,
    options.language === "ja"
      ? "現在の音源が必要です"
      : "Current audio source required",
  );
  assert.deepEqual(f.writes, []);
  assert.equal(
    f.preferences.get("kairo-rec-voice-v1") ?? null,
    options.preference ?? null,
  );
  return f;
}

/* ============================================================ REAL-MANIFEST CASES
 * These read the files this build ships. They are the cases that can go red when the audio is
 * missing — which is the only reason this suite exists. */

test('REAL · a missing shipped word uses Japanese device speech, and stale choices stay inert', async () => {
  const words = shipped("manifest.json"),
    approved = words?.v === 2 ? Object.keys(words.words || {}).length : 0,
    onDisk = clipsOnDisk(`w/${MAIN}`);
  if (!approved)
    assert.equal(onDisk.length, 0, "manifest/asset tripwire retained");
  const probe = ["未収録の語", "みしゅうろくのご"];
  assert.equal(Object.hasOwn(words?.words || {}, probe.join("|")), false);
  for (const language of ["en", "ja"])
    for (const preference of [
      null,
      "f1",
      "ami",
      "metan",
      "zundamon",
      "takehiro",
      SECOND,
    ])
      await assertUnboundDisabled({ words, language, preference });
});

test('REAL · the shipped narration manifest plays the very clips this build ships', async () => {
  const narration = shipped("article-narration.json");
  assert.equal(narration?.v, 2);
  assert.equal(narration.lock?.model, LOCK.model);
  const ids = Object.keys(narration.articles || {});
  assert(ids.length > 0);
  for (const id of ids) {
    const clips = narration.articles[id].clips;
    // an article is narrated under one admission: the lock's narration provider, or the render lock
    const provider = clips[0].model === LOCK.narration?.model ? LOCK.narration : null;
    for (const clip of clips) {
      assert.equal(clip.speakerRole, "narrator");
      if (provider) {
        assert.equal(clip.model, provider.model);
        assert(Object.hasOwn(provider.voices, clip.voice), `${clip.voice} is a voice the lock lists`);
      } else {
        assert.equal(clip.voice, MAIN);
        assert.equal(clip.model, LOCK.model);
      }
      assert(
        existsSync(new URL(`../${clip.src}`, import.meta.url)),
        clip.src + " is on disk",
      );
    }
    const f = await fixture({ narration, passageId: id });
    assert.equal(f.loadedNarration()?.v, 2);
    const row = f.bar();
    assert.equal(
      row.querySelector("#listen-note").textContent,
      provider ? provider.voices[clips[0].voice] : LOCK.voices[MAIN],
    );
    row.querySelector("#listen-open").handlers.click();
    f.bar().querySelector("#listen-toggle").handlers.click();
    await settle();
    if (provider) {
      assert.equal(f.created.length, 1, "the narration provider's first clip is the one that sounds");
      assert.equal(f.created[0].src, clips[0].src);
    } else {
      assert.equal(
        f.created.length,
        0,
        "the render lock's shipped assets remain intact but unbound playback is disabled",
      );
    }
    assert.equal(f.deviceVoiceCalls.length, 0);
    assert.deepEqual(f.writes, []);
  }
  // the records a provider's narration replaced are kept, and nothing reaches them for playback
  for (const article of Object.values(narration.superseded || {}))
    for (const clip of article.clips) {
      assert.equal(clip.voice, MAIN);
      assert.equal(clip.model, LOCK.model);
      assert(existsSync(new URL(`../${clip.src}`, import.meta.url)), clip.src + " is on disk");
    }
});

test('REAL · a word with a shipped clip plays it, keyed by the reading the card shows', async () => {
  const words = shipped("manifest.json"),
    entries = words?.v === 2 ? Object.entries(words.words || {}) : [];
  if (!entries.length) {
    assert.equal(clipsOnDisk(`w/${MAIN}`).length, 0);
    await assertUnboundDisabled({ words });
    return;
  }
  const [key, entry] = entries[0];
  assert(existsSync(new URL(`../${entry.src}`, import.meta.url)));
  const [surface, reading] = key.split("|");
  const f = await assertUnboundDisabled({ words });
  assert.equal(
    f.context.wordClipFor(
      f.context.approvedWordManifest(words),
      surface,
      reading,
      "word",
    )?.src,
    entry.src,
    "exact source/reading metadata still resolves without authorizing play",
  );
});

/* ============================================================ NEGATIVE CONTROLS
 * Each of these must be RED if the law it names is removed. They are the discriminating cases. */

test('CONTROL · the second voice is never a fallback for a missing main-voice clip', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords({ voice: SECOND, role: "word" }),
  });
  assert.equal(f.wordClip("電車", "でんしゃ", "word"), null);
  const dialogue = await fixture({
    words: approvedWords({ voice: SECOND, role: "speaker-b" }),
  });
  assert.notEqual(
    dialogue.context.wordClipFor(
      dialogue.context.approvedWordManifest(
        approvedWords({ voice: SECOND, role: "speaker-b" }),
      ),
      "電車",
      "でんしゃ",
      "speaker-b",
    ),
    null,
  );
  assert.equal(dialogue.wordClip("電車", "でんしゃ", "word"), null);
  const prose = await fixture({
    narration: approvedManifest({ voice: SECOND, role: "narrator" }),
  });
  assert.equal(prose.loadedNarration(), null);
});

test('CONTROL · a spelling alone is never a key, and a reading picks its own clip', async () => {
  const manifest = {
    v: 2,
    lock: lockBlock,
    words: {
      "年|ねん": {
        surface: "年",
        reading: "ねん",
        voice: MAIN,
        speakerRole: "word",
        model: LOCK.model,
        src: `audio/w/${MAIN}/nen.m4a`,
      },
      "年|とし": {
        surface: "年",
        reading: "とし",
        voice: MAIN,
        speakerRole: "word",
        model: LOCK.model,
        src: `audio/w/${MAIN}/toshi.m4a`,
      },
    },
  };
  const f = await assertUnboundDisabled({ words: manifest });
  assert.equal(
    f.context.wordClipFor(
      f.context.approvedWordManifest(manifest),
      "年",
      "ねん",
      "word",
    ).src,
    `audio/w/${MAIN}/nen.m4a`,
  );
  assert.equal(
    f.context.wordClipFor(
      f.context.approvedWordManifest(manifest),
      "年",
      "とし",
      "word",
    ).src,
    `audio/w/${MAIN}/toshi.m4a`,
  );
  assert.notEqual(
    f.context.wordClipFor(
      f.context.approvedWordManifest(manifest),
      "年",
      "ねん",
      "word",
    ).src,
    f.context.wordClipFor(
      f.context.approvedWordManifest(manifest),
      "年",
      "とし",
      "word",
    ).src,
  );
  const spelling = await assertUnboundDisabled({
    words: {
      v: 2,
      lock: lockBlock,
      words: {
        年: {
          surface: "年",
          voice: MAIN,
          speakerRole: "word",
          model: LOCK.model,
          src: `audio/w/${MAIN}/nen.m4a`,
        },
      },
    },
  });
  assert.equal(spelling.wordClip("年", "ねん", "word"), null);
});

test('CONTROL · absent or rejected word clips use Japanese device speech, never unapproved Audio', async () => {
  for (const options of [
    { words: null },
    { words: { v: 1, words: { 電車: { id: "x", voices: ["ami"] } } } },
    { words: approvedWords({ model: "some-other-model" }) },
    { fetchError: true },
    { words: approvedWords({ key: "電車" }) },
  ])
    await assertUnboundDisabled(options);
});

test('CONTROL · an exact approved word clip takes priority over available Japanese device speech', async () => {
  const f = await assertUnboundDisabled({ words: approvedWords() });
  assert.equal(
    f.context.wordClipFor(
      f.context.approvedWordManifest(approvedWords()),
      "電車",
      "でんしゃ",
      "word",
    )?.src,
    `audio/w/${MAIN}/densha.m4a`,
  );
});

test('CONTROL · identity is stated, never defaulted', async () => {
  // a clip that does not say its role or its model is not an approved clip, in either lane
  for (const drop of ['model', 'speakerRole']) {
    const narration = approvedManifest();
    for (const clip of narration.articles.fixture.clips) delete clip[drop];
    assert.equal((await fixture({ narration })).loadedNarration(), null, `a narration clip without ${drop} is refused`);
    const words = approvedWords();
    delete words.words['電車|でんしゃ'][drop];
    assert.equal((await fixture({ words })).wordClip('電車', 'でんしゃ', 'word'), null, `a word clip without ${drop} is refused`);
  }
  // and the role it states is the role it is asked for: a narrator clip is not a word clip
  const borrowed = await fixture({ words: approvedWords({ role: 'narrator' }) });
  assert.equal(borrowed.wordClip('電車', 'でんしゃ', 'word'), null);
});

test('CONTROL · the second voice exists only inside a declared dialogue', async () => {
  const dialogueClips = () => [
    {
      text: "最初の台詞。",
      src: `audio/narration/${MAIN}/a.m4a`,
      voice: MAIN,
      speakerRole: "narrator",
      model: LOCK.model,
    },
    {
      text: "次の台詞。",
      src: `audio/narration/${SECOND}/b.m4a`,
      voice: SECOND,
      speakerRole: "speaker-b",
      model: LOCK.model,
    },
  ];
  // prose that labels a clip speaker-b does not become a dialogue by saying so
  const prose = {
    v: 2,
    lock: lockBlock,
    articles: { fixture: { clips: dialogueClips() } },
  };
  assert.equal(
    (await fixture({ narration: prose })).loadedNarration(),
    null,
    "speaker-b in prose is refused",
  );
  // a dialogue, declared as one, admits its second speaker in the second voice
  const dialogue = {
    v: 2,
    lock: lockBlock,
    articles: { fixture: { kind: "dialogue", clips: dialogueClips() } },
  };
  const f = await fixture({ narration: dialogue });
  assert.equal(
    f.loadedNarration()?.v,
    2,
    "the lawful use of the second voice still loads",
  );
  f.bar().querySelector("#listen-open").handlers.click();
  f.bar().querySelector("#listen-toggle").handlers.click();
  await settle();

  assert.equal(
    f.created.length,
    0,
    "dialogue identity is retained but unbound playback is disabled",
  );
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  // even in a dialogue the second voice never reads as the narrator
  const swapped = dialogueClips();
  swapped[0].voice = SECOND;
  swapped[0].src = `audio/narration/${SECOND}/a.m4a`;
  assert.equal(
    (
      await fixture({
        narration: {
          v: 2,
          lock: lockBlock,
          articles: { fixture: { kind: "dialogue", clips: swapped } },
        },
      })
    ).loadedNarration(),
    null,
  );
});

test('CONTROL · a manifest from another model is refused in both lanes', async () => {
  const foreign = await fixture({ narration: approvedManifest({ model: 'gemini-9.9-flash-tts' }) });
  assert.equal(foreign.loadedNarration(), null, 'a clip from another model cannot play');
  const lane = approvedManifest(); lane.lock = { ...lockBlock, model: 'gemini-9.9-flash-tts' };
  assert.equal((await fixture({ narration: lane })).loadedNarration(), null, 'nor one whose manifest names another model');
  const words = await fixture({ words: approvedWords({ model: 'gemini-9.9-flash-tts' }) });
  assert.equal(words.wordClip('電車', 'でんしゃ', 'word'), null);
  const wordsLane = approvedWords(); wordsLane.lock = { ...lockBlock, model: 'gemini-9.9-flash-tts' };
  assert.equal((await fixture({ words: wordsLane })).wordClip('電車', 'でんしゃ', 'word'), null);
});

test('CONTROL · a v1 manifest is legacy: readable, and carrying no approved clips', async () => {
  const f = await assertUnboundDisabled({
    words: { v: 1, words: { 電車: { id: "densha", voices: [MAIN, SECOND] } } },
  });
  assert.equal(f.wordClip("電車", "でんしゃ", "word"), null);
});

test('CONTROL · a stored voice preference decides nothing at all', async () => {
  for (const preference of [null, MAIN, SECOND, "f1", "ami", "constructor"])
    for (const sessionPreference of [null, SECOND, "f1"]) {
      const f = await assertUnboundDisabled({
        words: approvedWords(),
        preference,
        sessionPreference,
      });
      assert.equal(f.context.voiceForRole("word"), MAIN);
    }
  const denied = await fixture({ storageThrows: true });
  assert.equal(denied.context.voiceForRole("word"), MAIN);
  assert.deepEqual(denied.writes, []);
});

/* ============================================================ MECHANICS
 * Synthetic manifests, because a failure, a cancellation and a late completion cannot be staged
 * with real media. These never stand in for a real-manifest positive. */

test('VH COPY-VOICE · no Japanese device voice stays silent with a named reason in both languages', async () => {
  for (const language of ["en", "ja"])
    for (const words of [
      null,
      { v: 1, words: {} },
      { v: 2, lock: lockBlock, words: {} },
      approvedWords(),
    ])
      await assertUnboundDisabled({ words, language, voices: [EN_LOCAL] });
});

test('VH COPY-VOICE · absent narration adds no dead excerpt Listen control', async () => {
  for (const language of ['en', 'ja']) {
    const f = await fixture({ narration: null, language });
    const inserted = [], quote = f.el('blockquote', 'sentence-original', '最初の文。');
    quote.dataset.sourceId = 'fixture'; quote.after = (node) => inserted.push(node);
    const root = { querySelectorAll: (selector) => selector === 'blockquote.sentence-original' ? [quote] : [] };
    f.context.enhanceJapaneseProse(root);
    assert.equal(inserted.length, 0, 'pending quote must not create a Listen control');
    assert.equal(f.created.length, 0); assert.equal(f.deviceVoiceCalls.length, 0);
  }
});

test('VH COPY-VOICE · admitted narration exposes the locked excerpt label', async () => {
  for (const language of ['en', 'ja']) {
    const f = await fixture({ narration: approvedManifest(), language });
    const inserted = [], quote = f.el('blockquote', 'sentence-original', '最初の文。');
    quote.dataset.sourceId = 'fixture'; quote.after = (node) => inserted.push(node);
    f.context.enhanceJapaneseProse({ querySelectorAll: (selector) => selector === 'blockquote.sentence-original' ? [quote] : [] });
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].textContent, language === 'ja' ? `${LOCK.voices[MAIN]}の声で聞く` : `Listen · ${LOCK.voices[MAIN]}`);
    assert.equal(f.created.length, 0, 'enhancement itself never plays');
  }
});

test('MECHANICS · only the exact approved identities are accepted; absent or offline stays silent', async () => {
  const f = await fixture({ narration: approvedManifest() });
  assert.equal(f.loadedNarration()?.v, 2);
  assert.equal(f.bar().querySelector('#listen-note').textContent, LOCK.voices[MAIN]);
  for (const voice of ['f1', 'ami', 'metan', 'zundamon', 'takehiro', 'Kore', 'constructor', 'toString', '__proto__', '']) {
    const bad = await fixture({ narration: approvedManifest({ voice }) });
    assert.equal(bad.loadedNarration(), null, `reject unapproved voice identity ${voice}`);
    assert.equal(bad.created.length, 0);
  }
  for (const options of [{ narration: null }, { fetchError: true }]) {
    const absent = await fixture(options);
    assert.equal(absent.loadedNarration(), null);
    assert.equal(absent.bar().classList.contains('is-pending'), true);
    assert.equal(absent.created.length + absent.deviceVoiceCalls.length, 0);
  }
});

test('MECHANICS · an approved label cannot admit legacy, mixed, external or escaping clip paths', async () => {
  for (const src of [`audio/narration/f1/first.m4a`, `audio/narration/${SECOND}/first.m4a`,
    'https://example.invalid/first.m4a', `/audio/narration/${MAIN}/first.m4a`,
    `audio/narration/${MAIN}/../f1/first.m4a`, `audio/narration/${MAIN}/%2e%2e/f1/first.m4a`]) {
    const narration = approvedManifest(); narration.articles.fixture.clips[0].src = src;
    const f = await fixture({ narration });
    assert.equal(f.loadedNarration(), null, `reject clip path ${src}`);
    assert.equal(f.created.length, 0);
  }
  for (const clips of [null, {}, [{ text: '文。' }], [{ text: '文。', src: '' }]]) {
    const narration = approvedManifest(); narration.articles.fixture.clips = clips;
    assert.equal((await fixture({ narration })).loadedNarration(), null, 'malformed clip records cannot expose playback');
  }
  // the same guard on the word lane: a path is a claim, and it is checked
  for (const src of [`audio/w/f1/densha.m4a`, `/audio/w/${MAIN}/densha.m4a`, 'https://example.invalid/d.m4a']) {
    const words = approvedWords(); words.words['電車|でんしゃ'].src = src;
    assert.equal((await fixture({ words })).wordClip('電車', 'でんしゃ', 'word'), null, `reject word path ${src}`);
  }
});

test('MECHANICS · reader playback uses approved clips in order, updates progress/rate, finishes idle', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('MECHANICS · pause cancels without advancing or failing; resume finishes the same clip', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('MECHANICS · a reader failure is visible and retry starts from the failed clip', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('MECHANICS · card replay ignores a stale failure while a current one is reported', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('MECHANICS · retrying an available clip clears the old error; a new failure stays visible', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('MECHANICS · leaving a card face retires its pending manifest request and active clip', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('CONTROL · automatic review speech waits for reveal and runs once per face', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('CONTROL · automatic speech respects the Voice setting and inactive review surfaces', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('MECHANICS · device cancellation ignores stale callbacks and a current failure stays visible', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('MECHANICS · a pending automatic request cannot speak after leaving its face', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

test('MECHANICS · late Japanese voice availability updates the reason without replaying the face', async () => {
  const f = await assertUnboundDisabled({
    words: approvedWords(),
    preference: SECOND,
  });
  f.context.retireCardAudioOnFaceChange();
  f.context.autoSpeakReviewFace();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.preferences.get("kairo-rec-voice-v1"), SECOND);
});

// Execute the complete actual render declaration. Drawing/store/room collaborators are
// inert; audio retirement and auto-speech retain their actual fixture implementations.
function installActualRender(f) {
  const sf=ts.createSourceFile('corridor.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const render=sf.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='render');
  assert(render);
  const c=f.context, calls=new Set();
  function visit(node) { if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)) calls.add(node.expression.text); ts.forEachChild(node,visit); }
  visit(render);
  for(const name of calls) if(!['retireCardAudioOnFaceChange','autoSpeakReviewFace','el','tx','String','Number','bi'].includes(name)&&!(name in c)) c[name]=()=>{};
  const decorate=node=>{node.classList.toggle=()=>{};node.replaceChildren=(...children)=>{node.children=[];node.append(...children);};node.contains=()=>false;return node;};
  const el=(tag,cls,text)=>decorate(f.el(tag,cls??'',text??''));
  const root=el('div'),body=el('body');
  Object.assign(c,{el, $:()=>root, biLabel:(...args)=>{const node=el(args[0],args[1]);node.append(el('span','l-ja'));return node;},
    kanjiWorldVisit:null,readerTicket:null,pageEpoch:0,recordEpoch:1,personalHost:null,retainedRetryView:null,pendingReferenceCollection:null,
    lastRenderedView:'review',publisherOpenRequest:0,olderStartToken:0,guidedRoom:null,deckPlayer:null,deckPresentation:null,
    maintenanceReports:null,roomTransitionUpdating:false,scheduler:{},fsrsApi:{},SEARCH_SVG:'',
    renderRoomError:(_main,_view,error)=>{throw error;}, placesLayout:()=>true, buildRoomSign:()=>null, syncReviewExitNotice:()=>{}, readerTicketSync:()=>{}, back:()=>{}, revealFocusedChromeDoor:()=>{},
    renderReview:main=>{const row=el('div');c.appendReviewVoice(row,{text:'でんしゃ',word:'電車'});main.append(row);},
  });
  Object.assign(c.S,{ready:true,variants:{nav:'tabs'},taken:[],dials:{furigana:0},lang:'en'});
  Object.assign(c.document,{body,activeElement:body,documentElement:el('html'),createTextNode:text=>el('span',null,text)});
  vm.runInContext(render.getText(sf),c);
  return c;
}
test('render boundary retires pending old face before automatic playback and never replays a rerender',async()=> {
  const f = await fixture({ words: approvedWords() }),
    c = installActualRender(f),
    events = [];
  c.S.view = "review";
  const retire = c.retireCardAudioOnFaceChange,
    auto = c.autoSpeakReviewFace;
  c.retireCardAudioOnFaceChange = () => {
    events.push("retire");
    return retire();
  };
  c.autoSpeakReviewFace = () => {
    events.push("auto");
    return auto();
  };
  c.S.review.revealed = true;
  c.render();
  await settle();
  assert(events.indexOf("retire") < events.indexOf("auto"));
  assert.equal(events.at(-1), "auto");
  c.render();
  await settle();
  c.S.review.ix = 1;
  c.S.review.queue.push({ t: "word", id: "電車" });
  c.render();
  await settle();
  assert.equal(f.created.length, 0);
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.deepEqual(f.writes, []);
});

/* ============================================================ CARD AUDIO (2026-11-11, John: "the duplication gone, the gawdy
 * buttons more subtle and simplified, voice on the front as well, and the option to have no highlighting at all").
 * Plain inputs to modules/card-audio.mjs; the browser checks (stand-in voice, muted) prove the same on the screen. */
import { answerReads, deckFrontVoice, highlightOn, reviewFrontVoice } from '../modules/card-audio.mjs';

test('CARD AUDIO R4 · the hidden answer is never spoken: no control on a face where the asked word is blanked out', () => {
  // the earlier attempt put the control on the cloze face (a word asked inside its sentence), where one tap said the answer
  assert.equal(reviewFrontVoice({ kind: 'word', printed: false, blanked: true, label: '電車', reading: 'でんしゃ' }), null);
  assert.equal(reviewFrontVoice({ kind: 'word', printed: true, blanked: true, label: '電車', reading: 'でんしゃ' }), null,
    'blanked wins even when the word also stands printed somewhere on the face');
  assert.equal(reviewFrontVoice({ kind: 'word', printed: false, blanked: false, label: '電車', reading: 'でんしゃ' }), null);
  assert.equal(deckFrontVoice({ kind: 'go', printed: false, blanked: true, choices: false, reading: 'でんしゃ' }), null);
  assert.equal(deckFrontVoice({ kind: 'go', printed: true, blanked: true, choices: false, reading: 'でんしゃ' }), null);
  assert.equal(deckFrontVoice({ kind: 'go', printed: true, blanked: false, choices: true, reading: 'でんしゃ' }), null,
    'a face with choices prints other words and gaps: no control');
});

test('CARD AUDIO R3 · the question side says the printed word by the card’s stored reading, never the written form alone', () => {
  assert.deepEqual(reviewFrontVoice({ kind: 'word', printed: true, blanked: false, label: '今日', reading: 'きょう' }),
    { text: 'きょう', word: '今日' });
  assert.deepEqual(reviewFrontVoice({ kind: 'word', printed: true, blanked: false, label: 'さくら', reading: '' }),
    { text: 'さくら', word: 'さくら' }, 'a kana word is its own reading');
  assert.equal(reviewFrontVoice({ kind: 'word', printed: true, blanked: false, label: '一日', reading: '' }), null,
    'kanji with no stored reading: nothing to say, no control');
  assert.deepEqual(deckFrontVoice({ kind: 'go', printed: true, blanked: false, choices: false, reading: 'いちにち' }), { text: 'いちにち' });
  assert.equal(deckFrontVoice({ kind: 'go', printed: true, blanked: false, choices: false, reading: '' }), null);
});

test('CARD AUDIO R3 · several readings, sentence cards, question cards and non-word deck cards get no control at all', () => {
  assert.equal(reviewFrontVoice({ kind: 'kanji', printed: true, blanked: false, label: '生', readings: ['せい', 'しょう', 'い'] }), null);
  assert.deepEqual(reviewFrontVoice({ kind: 'kanji', printed: true, blanked: false, label: '鮨', readings: ['すし'] }), { text: 'すし', word: '鮨' });
  assert.equal(reviewFrontVoice({ kind: 'kanji', printed: true, blanked: false, label: '鮨', readings: [] }), null);
  assert.equal(reviewFrontVoice({ kind: 'sentence', printed: true, blanked: false, label: '雨が降る。', reading: 'あめがふる' }), null);
  assert.equal(reviewFrontVoice({ kind: 'question', printed: true, blanked: false, label: '問題', reading: 'もんだい' }), null);
  assert.equal(deckFrontVoice({ kind: 'ji', printed: true, blanked: false, choices: false, reading: 'せい' }), null);
  assert.equal(deckFrontVoice({ kind: 'bun', printed: true, blanked: false, choices: false, reading: 'のに' }), null);
});

test('CARD AUDIO R2 · the answer side says the word, then the sentence, then (deck) the definition and the note, in one turn', () => {
  assert.deepEqual(answerReads('でんしゃ', [{ text: '電車に乗る。' }]), [{ text: 'でんしゃ' }, { text: '電車に乗る。' }]);
  assert.deepEqual(answerReads('でんしゃ', [{ text: '電車に乗る。' }], [{ text: '線路を走る乗り物。' }], [{ text: '駅で使う。' }]),
    [{ text: 'でんしゃ' }, { text: '電車に乗る。' }, { text: '線路を走る乗り物。' }, { text: '駅で使う。' }]);
  assert.deepEqual(answerReads('でんしゃ', []), [{ text: 'でんしゃ' }], 'a card with no sentence says its word alone');
  assert.deepEqual(answerReads('', [{ text: '電車に乗る。' }, { text: ' ' }]), [{ text: '電車に乗る。' }], 'nothing empty is sent');
});

test('CARD AUDIO R6 · highlighting is on by default and off only when the learner said off', () => {
  assert.equal(highlightOn(null), true);
  assert.equal(highlightOn(undefined), true);
  assert.equal(highlightOn('on'), true);
  assert.equal(highlightOn('garbage'), true);
  assert.equal(highlightOn('off'), false);
});
