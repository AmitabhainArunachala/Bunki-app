/** Playback contract checks, never an audition or an audio render.
 * Production pending-state inputs come from index.html and audio/manifest.json.
 * Future Kore/Charon recordings are explicitly simulated manifests and media:
 * no test fetches a URL, instantiates real Audio, or claims voice quality. */
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
const narrationSource = between('const readAloud =', '/* ------------------------------------------------ 収録の声');
const recordedSource = between('const REC_VOICE_KEY =', 'function refreshListenRow(');
const barSource = between('function buildListenRow(', 'function renderReader(');
const controlSource = between('function enhanceJapaneseProse(', '/** Lists are chosen');
const settle = () => new Promise(resolve => setImmediate(resolve));
const passage = { id: 'fixture' };
const approvedManifest = (voice = 'kore') => ({
  v: 1, voice, articles: { fixture: { clips: [
    { text: '最初の文。', src: `audio/narration/${voice}/first.m4a` },
    { text: '次の文。', src: `audio/narration/${voice}/second.m4a` },
  ] } },
});
const approvedWords = () => ({ v: 1, words: { 電車: { id: 'densha', voices: ['kore', 'charon'] } } });

function domFixture() {
  const ids = new Map();
  function el(tagName, className = '', content = '') {
    const classes = new Set(className.split(/\s+/).filter(Boolean)), attributes = new Map();
    let id = '', text = content;
    const node = {
      tagName, className, children: [], dataset: {}, handlers: {}, isConnected: true,
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
  return { el, document: { getElementById: id => ids.get(id) || null } };
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
  flags = { __KAIRO_NARRATION__: 1, __KAIRO_AUDIO__: 1 }, preference = null,
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
    bar: () => context.buildListenRow(passage),
    card() {
      const wrapper = dom.el('div'), button = dom.el('button'), note = dom.el('span', 'say-note');
      wrapper.append(button, note); return { button, note };
    },
  };
}

test('The checked-in build stays pending and silent, including every stale saved interim voice', async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const boot = vm.createContext({ window: {}, navigator: {}, location: { protocol: 'http:' } });
  for (const [, attributes, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\bsrc\s*=/.test(attributes)) vm.runInContext(code, boot);
  }
  const words = JSON.parse(readFileSync(new URL('../audio/manifest.json', import.meta.url), 'utf8'));
  for (const preference of [null, 'f1', 'ami', 'metan', 'zundamon', 'takehiro']) {
    const f = await fixture({ flags: boot.window, words, preference });
    const row = f.bar();
    assert.equal(f.loadedNarration(), null);
    assert.equal(row.classList.contains('is-pending'), true);
    assert.match(row.textContent, /音声準備中 · Kore/);
    assert.match(row.textContent, /voice in preparation/);
    assert.equal(row.querySelectorAll('button').length, 0);
    assert.equal(row.querySelectorAll('select').length, 0);
    assert.equal(f.fetches.includes('audio/article-narration.json'), false, 'An absent narration flag makes no doomed fetch');
    const quote = { textContent: '引用。', after() { assert.fail('Pending narration must not create a listen button'); } };
    f.context.enhanceJapaneseProse({ querySelectorAll: selector => selector === 'blockquote.sentence-original' ? [quote] : [] });
    const { button, note } = f.card();
    f.context.speakCardReading('でんしゃ', button, '電車');
    await settle();
    assert.equal(f.created.length, 0, `The saved ${preference} preference cannot play an interim word clip`);
    assert.match(note.textContent, /not.*record|preparation|on its way/i);
    assert.equal(f.deviceVoiceCalls.length, 0);
    assert.deepEqual(f.writes, []);
    assert.equal(f.preferences.get('kairo-rec-voice-v1') ?? null, preference);
  }
});

test('Only the exact approved narration voice identities are accepted; missing or offline manifests stay silent', async () => {
  for (const voice of ['kore', 'charon']) {
    const f = await fixture({ narration: approvedManifest(voice) });
    assert.equal(f.loadedNarration()?.voice, voice);
    assert.equal(f.bar().querySelector('#listen-note').textContent, voice === 'kore' ? 'Kore' : 'Charon');
    assert.deepEqual(f.fetches.filter(url => url === 'audio/article-narration.json'), ['audio/article-narration.json']);
    assert.equal(f.created.length, 0, 'Loading an approved fixture does not autoplay');
  }
  for (const voice of ['f1', 'ami', 'metan', 'zundamon', 'takehiro', 'Kore', 'constructor', 'toString', '__proto__', '']) {
    const f = await fixture({ narration: approvedManifest(voice) });
    assert.equal(f.loadedNarration(), null, `Reject unapproved voice identity ${voice}`);
    assert.equal(f.bar().querySelector('#listen-toggle'), null);
    assert.equal(f.created.length, 0);
  }
  for (const options of [{ narration: null }, { fetchError: true }]) {
    const f = await fixture(options);
    assert.equal(f.loadedNarration(), null);
    assert.equal(f.bar().classList.contains('is-pending'), true);
    assert.equal(f.created.length + f.deviceVoiceCalls.length, 0);
  }
});

test('An approved manifest label cannot admit legacy, mixed, external or escaping clip paths', async () => {
  for (const src of ['audio/narration/f1/first.m4a', 'audio/narration/charon/first.m4a',
    'https://example.invalid/first.m4a', '/audio/narration/kore/first.m4a',
    'audio/narration/kore/../f1/first.m4a', 'audio/narration/kore/%2e%2e/f1/first.m4a']) {
    const narration = approvedManifest(); narration.articles.fixture.clips[0].src = src;
    const f = await fixture({ narration });
    assert.equal(f.loadedNarration(), null, `Reject clip path ${src}`);
    assert.equal(f.bar().querySelector('#listen-toggle'), null);
    assert.equal(f.created.length, 0);
  }
  for (const clips of [null, {}, [{ text: '文。' }], [{ text: '文。', src: '' }]]) {
    const narration = approvedManifest(); narration.articles.fixture.clips = clips;
    const f = await fixture({ narration });
    assert.equal(f.loadedNarration(), null, 'Malformed clip records cannot expose playback');
  }
});

test('Reader playback uses approved clips in order, updates progress/rate, and finishes idle', async () => {
  for (const voice of ['kore', 'charon']) {
    const narration = approvedManifest(voice), f = await fixture({ narration });
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
    assert.equal(f.bar().querySelector('#listen-toggle').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(f.writes, []);
    assert.equal(f.deviceVoiceCalls.length, 0);
  }
});

test('Reader pause cancels without advancing or failing; resume can finish the same clip', async () => {
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

test('A reader failure is visible and retry starts from the failed clip', async () => {
  const f = await fixture({ narration: approvedManifest() });
  f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
  f.created[0].end(); await settle(); f.created[1].fail(); await settle();
  assert.equal(f.state.on, false); assert.equal(f.state.failed?.pid, passage.id);
  assert.equal(f.bar().querySelector('#listen-note').textContent, 'could not play');
  f.bar().querySelector('#listen-toggle').handlers.click(); await settle();
  assert.equal(f.created[2].src, f.created[1].src);
  f.created[2].end(); await settle();
  assert.equal(f.state.on, false); assert.equal(f.state.failed, null);
  assert.equal(f.bar().querySelector('#listen-note').textContent, 'Kore');
});

test('Saved and session preferences resolve only to Kore or Charon without mutating storage', async () => {
  for (const preference of [null, 'kore', 'charon', 'f1', 'ami', 'metan', 'zundamon', 'takehiro', 'constructor']) {
    for (const sessionPreference of [null, 'charon', 'f1']) {
      const f = await fixture({ words: approvedWords(), preference, sessionPreference });
      const expected = sessionPreference === 'charon' ? 'charon' : preference === 'charon' ? 'charon' : 'kore';
      assert.equal(f.context.recVoicePref(), expected);
      const { button } = f.card(); f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
      assert.equal(f.created[0]?.src, `audio/w/${expected}/densha.m4a`);
      f.created[0].end(); await settle();
      assert.deepEqual(f.writes, []);
      assert.equal(f.preferences.get('kairo-rec-voice-v1') ?? null, preference);
      assert.equal(f.deviceVoiceCalls.length, 0);
    }
  }
  const denied = await fixture({ storageThrows: true });
  assert.equal(denied.context.recVoicePref(), 'kore');
  assert.deepEqual(denied.writes, []);
});

test('Card replay ignores stale failure completion while current playback can report a real failure', async () => {
  const f = await fixture({ words: approvedWords() }), { button, note } = f.card();
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  f.context.speakCardReading('でんしゃ', button, '電車');
  // The old failure arrives after the retap but before the next manifest
  // microtask can replace its clip. This is not an already-settled cancellation.
  f.created[0].fail(); await settle();
  assert.equal(f.created.length, 2);
  assert.equal(note.textContent, '');
  f.created[1].fail(); await settle();
  assert.equal(note.textContent, 'This recording could not play here');
});

test('Retrying an available card clip clears its old playback error; a new failure remains visible', async () => {
  const f = await fixture({ words: approvedWords() }), { button, note } = f.card();
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  f.created[0].fail(); await settle();
  assert.equal(note.textContent, 'This recording could not play here');
  assert.equal(button.title, 'This recording could not play here');
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  assert.equal(note.textContent, '', 'A currently playing retry must not retain the old failure');
  assert.equal(button.title || '', '');
  f.created[1].end(); await settle();
  assert.equal(note.textContent, '');
  f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  f.created[2].fail(); await settle();
  assert.equal(note.textContent, 'This recording could not play here');
  assert.equal(button.title, 'This recording could not play here');
});

test('Leaving a card face retires its pending manifest request and active clip', async () => {
  const f = await fixture({ words: approvedWords() }), { button, note } = f.card();
  let resolve;
  f.context.ensureRecManifest = () => new Promise(done => { resolve = done; });
  f.context.speakCardReading('でんしゃ', button, '電車');
  f.context.S.view = 'shelf'; f.context.retireCardAudioOnFaceChange();
  resolve(approvedWords()); await settle();
  assert.equal(f.created.length, 0); assert.equal(note.textContent, '');
  f.context.ensureRecManifest = async () => approvedWords();
  f.context.S.view = 'review'; f.context.speakCardReading('でんしゃ', button, '電車'); await settle();
  assert.equal(f.created.length, 1);
  f.context.S.review.ix += 1; f.context.retireCardAudioOnFaceChange(); await settle();
  assert.equal(f.created[0].paused, true); assert.equal(note.textContent, '');
});
