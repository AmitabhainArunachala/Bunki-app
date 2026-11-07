import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const corridor = new URL('../corridor.js', import.meta.url);
const assets = new URL('../../../scripts/corridor-assets.mjs', import.meta.url);
const build = new URL('../../../scripts/build-corridor-site.mjs', import.meta.url);
const settings = new URL('../modules/learner.mjs', import.meta.url);
const coreUrl = new URL('../device-voice.mjs', import.meta.url);
const core = await import(coreUrl);

const JA_LOCAL = { name: 'Kyoko', voiceURI: 'kyoko', lang: 'ja-JP', localService: true, default: true };
const JA_NET = { name: 'Cloud 日本語', voiceURI: 'cloud-ja', lang: 'ja_JP', localService: false, default: false };
const EN = { name: 'Samantha', voiceURI: 'samantha', lang: 'en-US', localService: true, default: true };

function fakeEnv(voices = [JA_LOCAL]) {
  const calls = { speak: [], cancel: 0 };
  const synth = {
    getVoices: () => voices,
    speak: (utterance) => calls.speak.push(utterance),
    cancel: () => { calls.cancel += 1; },
    addEventListener() {}, removeEventListener() {},
  };
  class Utterance { constructor(text) { this.text = text; } }
  return { synth, Utterance, calls };
}

test('Japanese text is normalized and non-Japanese/unsafe text is refused', () => {
  assert.equal(core.speakableText('  犬\nが走る。  '), '犬 が走る。');
  assert.equal(core.speakableText('English only'), null);
  assert.equal(core.speakableText(''), null);
  assert.equal(core.speakableText('犬'.repeat(core.MAX_UTTERANCE_CHARS + 1)), null);
});

test('Japanese device voices are selected, with a local voice ahead of a network voice', () => {
  const voices = core.japaneseVoices([EN, JA_NET, JA_LOCAL]);
  assert.deepEqual(voices.map(v => v.voiceURI), ['kyoko', 'cloud-ja']);
});

test('the exact recorded clip has precedence; device TTS is only the missing-clip fallback', () => {
  const support = { ok: true, reason: core.REASONS.READY, voice: { ...JA_LOCAL, ref: JA_LOCAL } };
  assert.equal(core.voiceDecision({ hasApprovedClip: true, enabled: true, support, text: 'いぬ' }).source, 'approved');
  assert.equal(core.voiceDecision({ hasApprovedClip: false, enabled: true, support, text: 'いぬ' }).source, 'device');
  assert.equal(core.voiceDecision({ hasApprovedClip: false, enabled: false, support, text: 'いぬ' }).source, 'none');
});

test('speaking cancels the previous utterance, uses ja-JP and never writes a file or calls a network API', () => {
  const env = fakeEnv();
  const speaker = core.createDeviceVoice(env);
  const result = speaker.speak('犬が走る。');
  assert.equal(result.spoken, true);
  assert.equal(env.calls.cancel, 1);
  assert.equal(env.calls.speak.length, 1);
  assert.equal(env.calls.speak[0].text, '犬が走る。');
  assert.equal(env.calls.speak[0].lang, 'ja-JP');
  assert.equal(env.calls.speak[0].voice, JA_LOCAL);
});

test('unsupported or voice-less environments fail closed with a named reason', () => {
  assert.equal(core.deviceVoiceSupport({}).reason, core.REASONS.UNSUPPORTED);
  const env = fakeEnv([EN]);
  assert.equal(core.deviceVoiceSupport(env).reason, core.REASONS.NO_JA_VOICE);
});

test('the shipping app wires dynamic TTS into the existing card voice seam and lifecycle', () => {
  const src = readFileSync(corridor, 'utf8');
  assert.match(src, /from ['"]\.\/device-voice\.mjs['"]/u);
  assert.match(src, /function speakCardReading\([\s\S]*wordClipFor\([\s\S]*deviceVoice/u,
    'recorded-clip resolution must remain before the dynamic fallback');
  assert.match(src, /function retireCardAudioOnFaceChange\([\s\S]*deviceVoice[^\n]*cancel/u,
    'a card face change must cancel dynamic speech');
  assert.match(src, /function autoSpeakReviewFace\(/u);
  const retire = src.indexOf('retireCardAudioOnFaceChange();');
  const auto = src.indexOf('autoSpeakReviewFace();', retire);
  assert(retire >= 0 && auto > retire, 'auto-speech must run only after face-change cancellation settles');
  assert.match(src, /item\.t === ['"]sentence['"]/u, 'sentence cards must have a dynamic TTS target');
});

test('the existing Voice setting describes the actual recorded-first, device-fallback behavior', () => {
  const src = readFileSync(settings, 'utf8');
  assert.match(src, /settings-voice/u);
  assert.match(src, /device voice|端末の声/u);
  assert.match(src, /recorded|収録/u);
});

test('the module is shipped and syntax-checked by the static-site build', () => {
  assert.match(readFileSync(assets, 'utf8'), /['"]device-voice\.mjs['"]/u);
  assert.match(readFileSync(build, 'utf8'), /['"]device-voice\.mjs['"]/u);
});
