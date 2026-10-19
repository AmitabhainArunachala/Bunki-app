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
const narrationSource = between('const readAloud =', '/* ------------------------------------------------ 収録の声');
// anchored on the manifest state, not on the deleted chooser: V removed REC_VOICE_KEY,
// REC_ROSTER, sessionVoicePref and recVoicePref outright
const recordedSource = between('let recManifest;', 'function refreshListenRow(');
const barSource = between('function voicePendingNote(', 'function renderReader(');
const controlSource = between('function enhanceJapaneseProse(', '/* Save is one tap');
const settle = () => new Promise(resolve => setImmediate(resolve));
const passage = { id: 'fixture' };
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
  const listeners = new Map();
  return { el, document: { getElementById: id => ids.get(id) || null, addEventListener(type, handler) {
    if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler);
  }, dispatchEvent(event) { for (const handler of listeners.get(event.type) || []) handler(event); } } };
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
  sessionPreference = null, storageThrows = false, fetchError = false, language = 'en' } = {}) {
  const dom = domFixture(), media = mediaFixture();
  const preferences = new Map(preference ? [['kairo-rec-voice-v1', preference]] : []);
  const fetches = [], writes = [], deviceVoiceCalls = [];
  let refreshes = 0;
  const context = {
    window: { ...flags }, S: { view: 'reader', stack: [], review: { ix: 0, revealed: true, history: [] } },
    ...dom, Audio: media.Audio, clearTimeout,
    tx: (ja, en) => language === 'ja' ? ja : en, bi: () => language !== 'ja',
    uiIcon: () => dom.el('svg'),
    refreshListenRow: () => { refreshes += 1; },
    speechSynthesis: { speak: value => deviceVoiceCalls.push(value), cancel() {} },
    SpeechSynthesisUtterance: class { constructor(value) { deviceVoiceCalls.push(value); } },
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
    fixtureSessionPreference: sessionPreference,
  };
  context.window.speechSynthesis = context.speechSynthesis;
  vm.createContext(context);
  vm.runInContext(`${narrationSource}\n${recordedSource}\n${barSource}\n${controlSource}\nsessionVoicePref = fixtureSessionPreference;`, context);
  await context.ensureArticleNarration(); await context.ensureRecManifest();
  return {
    context, ...media, ...dom, fetches, writes, preferences, deviceVoiceCalls,
    get refreshes() { return refreshes; },
    state: vm.runInContext('readAloud', context),
    loadedNarration: () => vm.runInContext('articleNarration', context),
    bar: () => context.buildListenRow({ id: passageId }),
    wordClip: (surface, reading, role, seq) =>
      context.wordClipFor(vm.runInContext('recManifest', context), surface, reading, role, seq),
    card() {
      const wrapper = dom.el('div'), button = dom.el('button'), note = dom.el('span', 'say-note');
      wrapper.append(button, note); return { button, note };
    },
  };
}

/* ============================================================ REAL-MANIFEST CASES
 * These read the files this build ships. They are the cases that can go red when the audio is
 * missing — which is the only reason this suite exists. */

test('REAL · the shipped build is pending and silent, and no stale interim choice can speak', async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const boot = vm.createContext({ window: {}, navigator: {}, location: { protocol: 'http:' } });
  for (const [, attributes, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\bsrc\s*=/.test(attributes)) vm.runInContext(code, boot);
  }
  const words = shipped('manifest.json');
  const approved = words?.v === 2 ? Object.keys(words.words || {}).length : 0;
  const admitted = words?.v === 2 && words.lock?.model === LOCK.model && !!words.words && typeof words.words === 'object';
  // TRIPWIRE. The pending state is honest only while the locked voice has recorded nothing. The
  // day a clip lands this fails, and the positive case below must carry the proof instead.
  const onDisk = clipsOnDisk(`w/${MAIN}`);
  if (!approved) assert.equal(onDisk.length, 0,
    `audio/w/${MAIN} holds ${onDisk.length} clip(s) while the manifest approves none — run tools/build-voice-manifest.mjs --write`);
  // the probe is a word no manifest will ever hold, so this case stays true after the render: a
  // word with a real clip is the positive case's to prove, never this one's to deny
  const probe = ['未収録の語', 'みしゅうろくのご'];
  assert.equal(Object.hasOwn(words?.words || {}, probe.join('|')), false, 'the absent probe must stay absent');
  for (const language of ['en', 'ja']) for (const preference of [null, 'f1', 'ami', 'metan', 'zundamon', 'takehiro', SECOND]) {
    const f = await fixture({ flags: boot.window, words, preference, language });
    const { button, note } = f.card();
    f.context.speakCardReading(probe[1], button, probe[0]);
    await settle();
    assert.equal(f.created.length, 0, `a saved ${preference} choice cannot play an interim word clip`);
    assert.equal(f.deviceVoiceCalls.length, 0, 'never the device voice');
    assert.deepEqual(f.writes, [], 'nothing is written to storage');
    assert.equal(f.preferences.get('kairo-rec-voice-v1') ?? null, preference, 'the old value is left untouched');
    assert.equal(button.dataset.voiceUnavailable, admitted ? 'not-recorded' : 'no-recordings');
    const expected = admitted
      ? language === 'ja' ? `${LOCK.voices[MAIN]} の収録音声はありません（準備中）` : `No ${LOCK.voices[MAIN]} recording yet — on its way`
      : language === 'ja' ? 'この版には収録音声がありません' : 'This build has no recorded voices';
    assert.equal(note.textContent, expected, 'REAL unavailable copy is exact and visible');
    assert.equal(button.title, expected, 'REAL unavailable title equals the visible reason');
  }
});

test('REAL · the shipped narration manifest plays the very clips this build ships', async () => {
  const narration = shipped('article-narration.json');
  assert.equal(narration?.v, 2, 'the shipped narration manifest is v2 — v1 could not name a clip\u2019s own voice');
  assert.equal(narration.lock?.model, LOCK.model, 'it declares the locked model');
  const ids = Object.keys(narration.articles || {});
  assert(ids.length > 0, 'at least one article is narrated; this is the positive the suite lacked');
  for (const id of ids) {
    const clips = narration.articles[id].clips;
    for (const clip of clips) {
      assert.equal(clip.voice, MAIN, 'prose is the main voice');
      assert.equal(clip.speakerRole, 'narrator');
      assert.equal(clip.model, LOCK.model, 'every clip states the locked model');
      assert(existsSync(new URL(`../${clip.src}`, import.meta.url)), `${clip.src} is on disk`);
    }
    const f = await fixture({ narration, passageId: id });
    assert.equal(f.loadedNarration()?.v, 2, 'the runtime admits the shipped manifest');
    const row = f.bar();
    assert.equal(row.querySelector('#listen-note').textContent, LOCK.voices[MAIN]);
    row.querySelector('#listen-open').handlers.click();
    f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
    assert.equal(f.created[0].src, clips[0].src, 'the reader plays the first real clip, by its real path');
    assert.equal(f.deviceVoiceCalls.length, 0);
    f.created[0].end(); await settle();
    if (clips.length > 1) assert.equal(f.created[1].src, clips[1].src, 'then the second, in the shelf\u2019s own order');
  }
});

test('REAL · a word with a shipped clip plays it, keyed by the reading the card shows', async () => {
  const words = shipped('manifest.json');
  const entries = words?.v === 2 ? Object.entries(words.words || {}) : [];
  if (!entries.length) {
    // the honest empty case is proven by the tripwire above; nothing to play, so nothing to claim
    assert.equal(clipsOnDisk(`w/${MAIN}`).length, 0);
    return;
  }
  const [key, entry] = entries[0];
  const [surface, reading] = key.split('|');
  const f = await fixture({ words });
  const { button, note } = f.card();
  f.context.speakCardReading(reading, button, surface); await settle();
  assert.equal(f.created[0]?.src, entry.src, 'the first shipped word plays its own clip');
  assert.equal(note.textContent, '');
  assert.equal(f.deviceVoiceCalls.length, 0);
});

/* ============================================================ NEGATIVE CONTROLS
 * Each of these must be RED if the law it names is removed. They are the discriminating cases. */

test('CONTROL · the second voice is never a fallback for a missing main-voice clip', async () => {
  // a word clip recorded in the second voice is refused on a single-speaker surface
  const f = await fixture({ words: approvedWords({ voice: SECOND, role: 'word' }) });
  const { button, note } = f.card();
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  assert.equal(f.created.length, 0, 'the second speaker does not read a word');
  assert.equal(f.deviceVoiceCalls.length, 0);
  assert.equal(button.dataset.voiceUnavailable, 'not-recorded');
  assert.equal(f.wordClip('電車', 'でんしゃ', 'word'), null, 'the resolver itself refuses it');

  // the same clip, lawfully marked as the dialogue's second speaker, IS admissible
  const dialogue = await fixture({ words: approvedWords({ voice: SECOND, role: 'speaker-b' }) });
  assert.notEqual(dialogue.wordClip('電車', 'でんしゃ', 'speaker-b'), null,
    'the one lawful use of the second voice still works — the refusal above is the role law, not an accident');
  assert.equal(dialogue.wordClip('電車', 'でんしゃ', 'word'), null);

  // prose voiced by the second speaker takes the whole manifest down
  const prose = await fixture({ narration: approvedManifest({ voice: SECOND, role: 'narrator' }) });
  assert.equal(prose.loadedNarration(), null, 'a narrator clip in the second voice is refused at load');
});

test('CONTROL · a spelling alone is never a key, and a reading picks its own clip', async () => {
  // the bug this key exists to prevent: 年 reads ねん in 令和8年 and とし on its own
  const manifest = { v: 2, lock: lockBlock, words: {
    '年|ねん': { surface: '年', reading: 'ねん', voice: MAIN, speakerRole: 'word', model: LOCK.model, src: `audio/w/${MAIN}/nen.m4a` },
    '年|とし': { surface: '年', reading: 'とし', voice: MAIN, speakerRole: 'word', model: LOCK.model, src: `audio/w/${MAIN}/toshi.m4a` },
  } };
  const f = await fixture({ words: manifest });
  const a = f.card(); f.context.speakCardReading('ねん', a.button, '年'); await settle();
  assert.equal(f.created[0].src, `audio/w/${MAIN}/nen.m4a`, 'the card showing ねん plays the ねん clip');
  f.created[0].end(); await settle();
  const b = f.card(); f.context.speakCardReading('とし', b.button, '年'); await settle();
  assert.equal(f.created[1].src, `audio/w/${MAIN}/toshi.m4a`, 'the card showing とし plays the とし clip');
  assert.notEqual(f.created[0].src, f.created[1].src, 'two readings are two different assets');

  // a spelling-only key resolves to nothing at all
  const spelling = await fixture({ words: { v: 2, lock: lockBlock, words: {
    '年': { surface: '年', voice: MAIN, speakerRole: 'word', model: LOCK.model, src: `audio/w/${MAIN}/nen.m4a` } } } });
  const c = spelling.card(); spelling.context.speakCardReading('ねん', c.button, '年'); await settle();
  assert.equal(spelling.created.length, 0, 'a spelling-keyed entry is not playable');
  assert.equal(spelling.wordClip('年', 'ねん', 'word'), null);
  assert.equal(spelling.deviceVoiceCalls.length, 0);
});

test('CONTROL · the device voice is never reached by any absence path', async () => {
  for (const options of [{ words: null }, { words: { v: 1, words: { 電車: { id: 'x', voices: ['ami'] } } } },
    { words: approvedWords({ model: 'some-other-model' }) }, { fetchError: true },
    { words: approvedWords({ key: '電車' }) }]) {
    const f = await fixture(options);
    const { button } = f.card();
    f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
    assert.equal(f.deviceVoiceCalls.length, 0, `device speech reached through ${JSON.stringify(options).slice(0, 60)}`);
    assert.equal(f.created.length, 0);
    assert(button.dataset.voiceUnavailable, 'the absence is said where it can be seen');
  }
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
    { text: '最初の台詞。', src: `audio/narration/${MAIN}/a.m4a`, voice: MAIN, speakerRole: 'narrator', model: LOCK.model },
    { text: '次の台詞。', src: `audio/narration/${SECOND}/b.m4a`, voice: SECOND, speakerRole: 'speaker-b', model: LOCK.model },
  ];
  // prose that labels a clip speaker-b does not become a dialogue by saying so
  const prose = { v: 2, lock: lockBlock, articles: { fixture: { clips: dialogueClips() } } };
  assert.equal((await fixture({ narration: prose })).loadedNarration(), null, 'speaker-b in prose is refused');
  // a dialogue, declared as one, admits its second speaker in the second voice
  const dialogue = { v: 2, lock: lockBlock, articles: { fixture: { kind: 'dialogue', clips: dialogueClips() } } };
  const f = await fixture({ narration: dialogue });
  assert.equal(f.loadedNarration()?.v, 2, 'the lawful use of the second voice still loads');
  f.bar().querySelector('#listen-open').handlers.click();
  f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
  f.created[0].end(); await settle();
  assert.equal(f.created[1].src, `audio/narration/${SECOND}/b.m4a`, 'the second speaker reads the second line');
  // even in a dialogue the second voice never reads as the narrator
  const swapped = dialogueClips(); swapped[0].voice = SECOND; swapped[0].src = `audio/narration/${SECOND}/a.m4a`;
  assert.equal((await fixture({ narration: { v: 2, lock: lockBlock, articles: { fixture: { kind: 'dialogue', clips: swapped } } } }))
    .loadedNarration(), null);
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
  const f = await fixture({ words: { v: 1, words: { 電車: { id: 'densha', voices: [MAIN, SECOND] } } } });
  assert.equal(f.wordClip('電車', 'でんしゃ', 'word'), null, 'a v1 entry is never promoted to an approved clip');
  const { button } = f.card();
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  assert.equal(f.created.length, 0);
  assert.equal(button.dataset.voiceUnavailable, 'no-recordings');
});

test('CONTROL · a stored voice preference decides nothing at all', async () => {
  for (const preference of [null, MAIN, SECOND, 'f1', 'ami', 'constructor']) {
    for (const sessionPreference of [null, SECOND, 'f1']) {
      const f = await fixture({ words: approvedWords(), preference, sessionPreference });
      assert.equal(f.context.voiceForRole('word'), MAIN, 'the content role decides, not the learner\u2019s old choice');
      const { button } = f.card();
      f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
      assert.equal(f.created[0]?.src, `audio/w/${MAIN}/densha.m4a`);
      f.created[0].end(); await settle();
      assert.deepEqual(f.writes, []);
      assert.equal(f.preferences.get('kairo-rec-voice-v1') ?? null, preference);
      assert.equal(f.deviceVoiceCalls.length, 0);
    }
  }
  const denied = await fixture({ storageThrows: true });
  assert.equal(denied.context.voiceForRole('word'), MAIN);
  assert.deepEqual(denied.writes, []);
});

/* ============================================================ MECHANICS
 * Synthetic manifests, because a failure, a cancellation and a late completion cannot be staged
 * with real media. These never stand in for a real-manifest positive. */

test('VH COPY-VOICE · unavailable copy and title follow manifest admission in both languages', async () => {
  for (const language of ['en', 'ja']) for (const [kind, words, admitted] of [
    ['null', null, false], ['legacy', { v: 1, words: {} }, false],
    ['empty-v2', { v: 2, lock: lockBlock, words: {} }, true], ['missing-word-v2', approvedWords(), true],
  ]) {
    const f = await fixture({ words, language }), { button, note } = f.card();
    f.context.speakCardReading('みしゅうろく', button, '未収録'); await settle();
    const expected = admitted
      ? language === 'ja' ? `${LOCK.voices[MAIN]} の収録音声はありません（準備中）` : `No ${LOCK.voices[MAIN]} recording yet — on its way`
      : language === 'ja' ? 'この版には収録音声がありません' : 'This build has no recorded voices';
    assert.equal(note.textContent, expected, `unavailable visible copy: ${kind}/${language}`);
    assert.equal(button.title, expected, `unavailable title: ${kind}/${language}`);
    assert.equal(button.dataset.voiceUnavailable, admitted ? 'not-recorded' : 'no-recordings');
    assert.equal(f.created.length, 0); assert.equal(f.deviceVoiceCalls.length, 0);
  }
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
  const narration = approvedManifest(), f = await fixture({ narration });
  const row = f.bar(), toggle = row.querySelector('#listen-toggle'), rate = row.querySelector('#listen-rate');
  toggle.handlers.click(); await settle();
  assert.equal(f.state.on, true);
  assert.equal(f.created[0].src, narration.articles.fixture.clips[0].src);
  assert.equal(f.created[0].playbackRate, 1);
  f.created[0].time(0.5);
  assert.equal(row.querySelector('#listen-progress').getAttribute('aria-valuenow'), '25');
  rate.handlers.click();
  assert.equal(f.created[0].playbackRate, 1.25);
  assert.equal(rate.textContent, '1.25×');
  f.created[0].end(); await settle();
  assert.equal(f.created[1].src, narration.articles.fixture.clips[1].src);
  assert.equal(f.created[1].playbackRate, 1.25);
  assert.equal(row.querySelector('#listen-progress').getAttribute('aria-valuenow'), '50');
  rate.handlers.click(); assert.equal(f.created[1].playbackRate, 0.8);
  rate.handlers.click(); assert.equal(f.created[1].playbackRate, 1);
  f.created[1].end(); await settle();
  assert.equal(f.state.on, false);
  assert.equal(f.state.failed, null);
  assert.equal(f.state.clip, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.deviceVoiceCalls.length, 0);
});

test('MECHANICS · pause cancels without advancing or failing; resume finishes the same clip', async () => {
  const f = await fixture({ narration: approvedManifest() });
  f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
  f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
  assert.equal(f.state.on, false); assert.equal(f.state.failed, null);
  assert.equal(f.created.length, 1); assert.equal(f.created[0].paused, true);
  f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
  assert.equal(f.created[1].src, f.created[0].src);
  f.created[1].end(); await settle(); f.created[2].end(); await settle();
  assert.equal(f.state.on, false); assert.equal(f.state.failed, null);
});

test('MECHANICS · a reader failure is visible and retry starts from the failed clip', async () => {
  const f = await fixture({ narration: approvedManifest() });
  f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
  f.created[0].end(); await settle(); f.created[1].fail(); await settle();
  assert.equal(f.state.on, false); assert.equal(f.state.failed?.pid, passage.id);
  assert.equal(f.state.failed?.voice, MAIN, 'the failure names the clip\u2019s own voice, from the lock');
  assert.equal(f.bar().querySelector('#listen-note').textContent, 'could not play');
  f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
  assert.equal(f.created[2].src, f.created[1].src);
  f.created[2].end(); await settle();
  assert.equal(f.state.on, false); assert.equal(f.state.failed, null);
  assert.equal(f.bar().querySelector('#listen-note').textContent, LOCK.voices[MAIN]);
});

test('MECHANICS · card replay ignores a stale failure while a current one is reported', async () => {
  const f = await fixture({ words: approvedWords() }), { button, note } = f.card();
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  f.context.speakCardReading('でんしゃ', button, '電車');
  f.created[0].fail(); await settle();
  assert.equal(f.created.length, 2);
  assert.equal(note.textContent, '');
  f.created[1].fail(); await settle();
  assert.equal(note.textContent, 'This recording could not play here');
});

test('MECHANICS · retrying an available clip clears the old error; a new failure stays visible', async () => {
  const f = await fixture({ words: approvedWords() }), { button, note } = f.card();
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  f.created[0].fail(); await settle();
  assert.equal(note.textContent, 'This recording could not play here');
  assert.equal(button.title, 'This recording could not play here', 'first failure title is exact');
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  assert.equal(note.textContent, '', 'a currently playing retry must not retain the old failure');
  assert.equal(button.title, '', 'retry title clears the old failure');
  f.created[1].end(); await settle();
  assert.equal(note.textContent, '');
  assert.equal(button.title, '', 'successful completion has no error title');
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  button.title = 'stale failure sentinel';
  f.created[2].fail(); await settle();
  assert.equal(note.textContent, 'This recording could not play here');
  assert.equal(button.title, 'This recording could not play here', 'subsequent failure updates its title');
});

test('MECHANICS · leaving a card face retires its pending manifest request and active clip', async () => {
  const f = await fixture({ words: approvedWords() }), { button, note } = f.card();
  let release;
  f.context.ensureRecManifest = () => new Promise(done => { release = done; });
  f.context.speakCardReading('でんしゃ', button, '電車');
  f.context.S.view = 'shelf'; f.context.retireCardAudioOnFaceChange();
  release(approvedWords()); await settle();
  assert.equal(f.created.length, 0); assert.equal(note.textContent, '');
  f.context.ensureRecManifest = async () => approvedWords();
  f.context.S.view = 'review'; f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  assert.equal(f.created.length, 1);
  f.context.S.review.ix += 1; f.context.retireCardAudioOnFaceChange(); await settle();
  assert.equal(f.created[0].paused, true); assert.equal(note.textContent, '');
});

test('CONTROL · the card\u2019s voice door exists only on a revealed face', () => {
  // 声=on must never speak before the learner has revealed the answer. There is no auto-speak
  // anywhere in this build — the door is a tap — so the law is structural, and this pins it:
  // the one place that builds `#card-say` sits inside the revealed branch, and nowhere else.
  const door = source.indexOf("say.id = 'card-say'");
  assert(door > 0, 'the card voice door moved; this control no longer knows where to look');
  assert.equal(source.indexOf("say.id = 'card-say'", door + 1), -1, 'there is exactly one voice door');
  const revealed = source.lastIndexOf("if (rv.revealed && !['sentence', 'question'].includes(item.t)) {", door);
  assert(revealed > 0 && revealed < door, 'the voice door is built inside the revealed branch');
  const speak = source.indexOf('speakCardReading(spoken', door);
  assert(speak > door, 'and the tap, not a timer, is what speaks');
  // nothing in the file speaks a card without a tap
  assert.equal(/setTimeout\([^)]*speakCardReading/u.test(source), false, 'no scheduled card speech');
});
