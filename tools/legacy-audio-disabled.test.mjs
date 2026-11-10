/* global process, console, URL, AbortController */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
import { createDeviceVoice, REASONS } from '../prototypes/corridor/device-voice.mjs';
import { runtimeLock } from '../prototypes/corridor/tools/voice-lock.mjs';
test('unbound legacy speech and recording entry points fail closed', async () => {
  let speaks = 0,
    cancels = 0;
  const env = {
    speechSynthesis: {
      getVoices: () => [{ lang: 'ja-JP', localService: true, name: 'fixture' }],
      speak: () => speaks++,
      cancel: () => cancels++,
    },
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    },
  };
  const voice = createDeviceVoice(env);
  for (const text of ['日本語。', 'English only', '日本語 and English', '']) {
    const before = cancels,
      r = voice.speak(text);
    assert.equal(r.spoken, false);
    assert.equal(r.source, 'none');
    assert.equal(r.reason, REASONS.DISABLED);
    assert(cancels > before, 'cancel before refusing');
  }
  assert.equal(speaks, 0);
  const source = readFileSync(
      new URL('../prototypes/corridor/corridor.js', import.meta.url),
      'utf8',
    ),
    ast = ts.createSourceFile(
      'corridor.js',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
  assert.equal(ast.parseDiagnostics.length, 0);
  function actual(name) {
    const nodes = ast.statements.filter(
      (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
    );
    assert.equal(nodes.length, 1);
    return source.slice(nodes[0].getStart(ast), nodes[0].end);
  }
  // the learner's switch for words and answers said by themselves (corridor.js, WORD_VOICE): 'on' or 'off'
  let bySelf = 'on';
  let fetches = 0,
    starts = 0,
    retired = 0,
    stopped = 0,
    status = [];
  const sandbox = {
    Promise,
    window: { __KAIRO_AUDIO__: true },
    document: { hidden: false },
    // the clip player asks the lock and the admitted narration manifest; none is loaded here
    VOICE_LOCK: runtimeLock(),
    articleNarration: null,
    recManifest: undefined,
    recManifestWait: null,
    recAudioEl: null,
    readAloud: { on: false },
    S: { view: 'review', review: { revealed: true } },
    deviceVoice: {
      cancel: () => cancels++,
      speak: () => {
        speaks++;
      },
    },
    fetch: () => {
      fetches++;
      return Promise.resolve({ ok: true, json: async () => ({}) });
    },
    Audio: class {
      constructor() {
        starts++;
      }
      play() {
        starts++;
        return Promise.resolve();
      }
    },
    retireCardSpeech: () => retired++,
    stopReadAloud: () => {},
    stopRecAudio: () => stopped++,
    stopSentenceListening: () => {},
    cardVoiceStatus: (...args) => status.push(args),
    tx: (ja, en) => en,
    wordVoice: () => bySelf,
    wordClipFor: () => ({ src: 'retained-synthetic.m4a' }),
    approvedWordManifest: (x) => x,
    refreshListenRow: () => {},
    // the voice layer has not arrived (and never does in the single-file build): a reading stays retired
    voiceLayer: null,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    actual('ensureRecManifest') +
      ';' +
      actual('playRecClip') +
      ';' +
      actual('lockedNarrationClip') +
      ';' +
      actual('speakCardReading') +
      ';' +
      actual('verifiedSentenceAudio'),
    sandbox,
  );
  await sandbox.ensureRecManifest();
  assert.equal(fetches, 0, 'disabled legacy manifest cannot fetch');
  assert.equal(await sandbox.playRecClip('retained-synthetic.m4a', null), false);
  await sandbox.speakCardReading('日本語 and English', null, 'term');
  await Promise.resolve();
  assert.equal(fetches, 0);
  assert.equal(starts, 0);
  assert.equal(speaks, 0);
  assert(retired > 0 || cancels > 4);
  assert(stopped > 0);
  assert(status.some((row) => row[2] === 'current-source-required'));
  // With the voice layer the reading has ONE way out, the seam (a recorded clip, the voice server, the device voice as
  // the fallback): this function still starts no fetch, no Audio and no utterance of its own.
  const said = [];
  sandbox.voiceLayer = { sayWord: (request) => said.push(request) };
  status = [];
  sandbox.status = status;
  await sandbox.speakCardReading('きかい', null, '機械');
  await Promise.resolve();
  assert.equal(said.length, 1, 'the reading goes to the seam once');
  assert.equal(said[0].text, 'きかい');
  assert.equal(said[0].word, '機械');
  assert.equal(typeof said[0].onNote, 'function');
  assert.equal(fetches, 0);
  assert.equal(starts, 0);
  assert.equal(speaks, 0);
  // Said by itself (a card's answer shown, a word writing itself) is not his tap. With the switch off, which is the
  // default, nothing happens at all: no other sound is stopped and the seam is not asked.
  bySelf = 'off';
  const before = [retired, stopped, said.length];
  await sandbox.speakCardReading('きかい', null, '機械', { automatic: true });
  await Promise.resolve();
  assert.deepEqual(
    [retired, stopped, said.length],
    before,
    'by itself, with the switch off, nothing is asked or stopped',
  );
  // …and his own tap still speaks with the switch off
  await sandbox.speakCardReading('きかい', null, '機械');
  assert.equal(said.length, 2, 'a tap is his own act');
  assert.equal(said[1].automatic, false);
  // With the switch on the seam is asked, and told that this is not his tap (so it never uses the device voice)
  bySelf = 'on';
  await sandbox.speakCardReading('きかい', null, '機械', { automatic: true });
  assert.equal(said.length, 3);
  assert.equal(said[2].automatic, true);
  assert.equal(fetches, 0);
  assert.equal(starts, 0);
  assert.equal(speaks, 0);
  sandbox.voiceLayer = null;
  await assert.rejects(
    sandbox.verifiedSentenceAudio?.({ path: 'retained.m4a' }, new AbortController().signal) ??
      Promise.reject(Error('missing verifiedSentenceAudio')),
    /current-source-required/,
  );
  const roomSource = readFileSync(
      new URL('../prototypes/corridor/speak.js', import.meta.url),
      'utf8',
    ),
    roomAst = ts.createSourceFile(
      'speak.js',
      roomSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
  function roomFunction(name) {
    const found = [];
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node);
      ts.forEachChild(node, visit);
    }
    visit(roomAst);
    assert.equal(found.length, 1);
    return roomSource.slice(found[0].getStart(roomAst), found[0].end);
  }
  let posts = 0,
    media = 0,
    stops = 0;
  const room = {
    Promise,
    post: () => {
      posts++;
      throw Error('provider forbidden');
    },
    ensureAudio: () => {
      media++;
      throw Error('cached audio forbidden');
    },
    stopVoice: () => stops++,
  };
  vm.createContext(room);
  vm.runInContext(roomFunction('voiceLine') + ';' + roomFunction('playClip'), room);
  for (const text of ['日本語', 'English', '日本語 and English', '']) {
    const line = { text };
    assert.equal(room.voiceLine(line).length, 0);
    assert.equal(line.voice.length, 0);
    assert.equal(await room.playClip('blob:retained-cached-English', 1, 1), 'silent');
  }
  assert.equal(posts, 0);
  assert.equal(media, 0);
  assert.equal(stops, 4);
  assert.equal(fetches, 0);
  console.log(
    JSON.stringify({
      status: 'PASS',
      deviceSpeakCalls: 0,
      recordingFetches: 0,
      mediaStarts: 0,
      actualFunctions: true,
    }),
  );
});

test('a clip of the narration provider the lock lists plays; an unlisted voice, a bare path and the render lock do not', async () => {
  const lock = runtimeLock(),
    provider = lock.narration;
  assert(
    provider && Object.keys(provider.voices).length > 0,
    'the lock lists a narration provider',
  );
  const [voice] = Object.keys(provider.voices);
  // The actual functions: the manifest's admission from the voice seam, the player from corridor.js.
  const lift = (file, names) => {
    const source = readFileSync(new URL(`../prototypes/corridor/${file}`, import.meta.url), 'utf8'),
      ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    return names
      .map((name) => {
        const nodes = ast.statements.filter(
          (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
        );
        assert.equal(nodes.length, 1, `${file} declares ${name} once`);
        return source.slice(nodes[0].getStart(ast), nodes[0].end);
      })
      .join(';');
  };
  const created = [];
  const sandbox = {
    Promise,
    Object,
    RegExp,
    VOICE_LOCK: lock,
    NARRATION_VOICES: lock.voices,
    articleNarration: null,
    recAudioEl: null,
    deviceVoice: { cancel() {} },
    Audio: class {
      constructor(src) {
        this.src = src;
        created.push(this);
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    lift('modules/voice.mjs', [
      'voiceForRole',
      'approvedNarrationClip',
      'approvedNarrationManifest',
    ]) +
      ';' +
      lift('corridor.js', ['stopRecAudio', 'playRecClip', 'lockedNarrationClip']),
    sandbox,
  );
  const src = (name) => `audio/narration/${name}/fixture-000.m4a`;
  const manifest = (name, model, role = 'narrator') => ({
    v: 2,
    lock: { model: lock.model, main: lock.main, second: lock.second },
    articles: {
      fixture: {
        clips: [{ text: '最初の文。', src: src(name), voice: name, speakerRole: role, model }],
      },
    },
  });

  // A listed voice under the provider's model is admitted, and its clip is the one that sounds.
  sandbox.articleNarration = sandbox.approvedNarrationManifest(manifest(voice, provider.model));
  assert.equal(sandbox.articleNarration?.v, 2, 'the listed voice is admitted');
  const playing = sandbox.playRecClip(src(voice), null);
  assert.equal(created.length, 1);
  assert.equal(created[0].src, src(voice));
  created[0].ended = true;
  created[0].onended();
  assert.equal(await playing, true, 'and plays to its end');

  // Nothing wider. Each of these is refused at admission, whole.
  for (const [name, bad] of [
    ['a voice the provider does not list', manifest('asahi', provider.model)],
    ["the render lock's voice under the provider's model", manifest(lock.main, provider.model)],
    ['a listed voice in another role', manifest(voice, provider.model, 'speaker-b')],
    ['a listed voice under the render model', manifest(voice, lock.model)],
  ])
    assert.equal(sandbox.approvedNarrationManifest(bad), null, `${name} is refused`);

  // And the player is its own door: a manifest that reached it some other way opens nothing.
  // No Audio may exist before the answer, so the count is read first and the promise after.
  const refuses = async (path, why) => {
    const answer = sandbox.playRecClip(path, null);
    assert.equal(created.length, 1, `${why}: no Audio is constructed`);
    assert.equal(await answer, false, why);
  };
  sandbox.articleNarration = manifest('asahi', provider.model);
  await refuses(src('asahi'), 'an unlisted voice does not play');
  sandbox.articleNarration = null;
  await refuses(src(voice), 'a path no manifest names does not play');
  // The render lock's own narration is still admitted as a record and still does not sound.
  sandbox.articleNarration = sandbox.approvedNarrationManifest(manifest(lock.main, lock.model));
  assert.equal(sandbox.articleNarration?.v, 2);
  await refuses(src(lock.main), "the render lock's clip does not play");
  assert.equal(created.length, 1, 'one Audio in all: the listed clip');
});
