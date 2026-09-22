/** Node-only mechanics tests. These API-shaped doubles do not establish
 * native playback, trusted browser events, silence at speakers, or speech timing. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { silenceBrowserAudio, TEST_AUDIO_OUTPUT } from './browser-audio-silence.mjs';

async function fixture({ speech = true } = {}) {
  const mediaState = new WeakMap(), utteranceState = new WeakMap(), synths = new WeakSet();
  const calls = [], receiverError = new TypeError('native receiver error'), argumentError = new TypeError('native utterance error');
  class HTMLMediaElement {
    constructor(result) { mediaState.set(this, { muted: false, result, error: null });
      this.duration = 4.644; this.currentTime = 0; this.playbackRate = 1; this.paused = true; this.ended = false; }
    get muted() { if (!mediaState.has(this)) throw receiverError; return mediaState.get(this).muted; }
    set muted(value) { if (!mediaState.has(this)) throw receiverError; mediaState.get(this).muted = value; }
    play(...args) {
      if (!mediaState.has(this)) throw receiverError;
      calls.push({ kind: 'play', receiver: this, args });
      const state = mediaState.get(this); if (state.error) throw state.error; return state.result;
    }
  }
  class SpeechSynthesisUtterance {
    constructor(text) { utteranceState.set(this, { volume: 1 }); this.text = text; this.lang = 'ja-JP'; this.rate = 0.92; this.pitch = 1; }
    get volume() { if (!utteranceState.has(this)) throw argumentError; return utteranceState.get(this).volume; }
    set volume(value) { if (!utteranceState.has(this)) throw argumentError; utteranceState.get(this).volume = value; }
  }
  class SpeechSynthesis {
    constructor() { synths.add(this); this.result = {}; this.error = null; }
    get pending() { if (!synths.has(this)) throw receiverError; return false; }
    speak(...args) {
      if (!synths.has(this)) throw receiverError;
      if (!utteranceState.has(args[0])) throw argumentError;
      calls.push({ kind: 'speak', receiver: this, args });
      if (this.error) throw this.error; return this.result;
    }
  }
  const synth = new SpeechSynthesis();
  const globals = { HTMLMediaElement, ...(speech ? { SpeechSynthesis, SpeechSynthesisUtterance, speechSynthesis: synth } : {}) };
  let callback, registrations = 0;
  const disclosure = await silenceBrowserAudio({ addInitScript: async fn => { callback = fn; registrations++; } });
  runInNewContext(`(${callback.toString()})()`, globals);
  return { globals, HTMLMediaElement, SpeechSynthesisUtterance, synth, calls, mediaState, receiverError, argumentError,
    disclosure, registrations, reinstall: () => runInNewContext(`(${callback.toString()})()`, globals) };
}

test('media delegates once with original receiver/arguments and exact returned Promise', async () => {
  const f = await fixture(), promise = Promise.resolve('native result'), media = new f.HTMLMediaElement(promise), arg = {};
  let eventCalls = 0; media.onended = () => eventCalls++;
  const before = { duration: media.duration, currentTime: media.currentTime, playbackRate: media.playbackRate,
    paused: media.paused, ended: media.ended, onended: media.onended };
  assert.equal(media.play(arg), promise); assert.equal(media.muted, true);
  assert.deepEqual(f.calls, [{ kind: 'play', receiver: media, args: [arg] }]);
  for (const [key, value] of Object.entries(before)) assert.equal(media[key], value);
  assert.equal(eventCalls, 0); assert.equal(await promise, 'native result');
});

test('native media rejection and synchronous exception are retained', async () => {
  const f = await fixture(), rejection = new Error('native blocked playback'), promise = Promise.reject(rejection);
  promise.catch(() => {}); const media = new f.HTMLMediaElement(promise);
  assert.equal(media.play(), promise); await assert.rejects(promise, error => error === rejection);
  const failure = new Error('native synchronous failure'); f.mediaState.get(media).error = failure;
  assert.throws(() => media.play(), error => error === failure);
  assert.throws(() => f.HTMLMediaElement.prototype.play.call({}), error => error === f.receiverError);
});

test('speech delegates same utterance/receiver once without fabricating callbacks or changing content/rate', async () => {
  const f = await fixture(), u = new f.SpeechSynthesisUtterance('窓から海が見えます。'), extra = {};
  let events = 0; u.onend = () => events++;
  const callback = u.onend;
  assert.equal(f.synth.speak(u, extra), f.synth.result);
  assert.equal(u.volume, 0); assert.equal(u.text, '窓から海が見えます。'); assert.equal(u.lang, 'ja-JP');
  assert.equal(u.rate, 0.92); assert.equal(u.pitch, 1); assert.equal(u.onend, callback); assert.equal(events, 0);
  assert.deepEqual(f.calls, [{ kind: 'speak', receiver: f.synth, args: [u, extra] }]);
});

test('speech errors and invalid argument/receiver paths remain native', async () => {
  const f = await fixture(), failure = new Error('native voice failure'), u = new f.SpeechSynthesisUtterance('文');
  f.synth.error = failure; assert.throws(() => f.synth.speak(u), error => error === failure);
  const untouched = new f.SpeechSynthesisUtterance('別の文');
  assert.throws(() => f.synth.speak.call({}, untouched), error => error === f.receiverError);
  assert.equal(untouched.volume, 1);
  assert.throws(() => f.synth.speak({}), error => error === f.argumentError);
});

test('installation is idempotent per global and absence of speech does not fabricate an API', async () => {
  const f = await fixture({ speech: false }), play = f.HTMLMediaElement.prototype.play;
  f.reinstall(); assert.equal(f.HTMLMediaElement.prototype.play, play);
  assert.equal('speechSynthesis' in f.globals, false); assert.equal(f.registrations, 1);
  assert.equal(f.disclosure, TEST_AUDIO_OUTPUT); assert(TEST_AUDIO_OUTPUT.excludes.includes('unmuted-autoplay'));
});

test('init registration failures propagate instead of claiming silent installation', async () => {
  const failure = new Error('init registration failed');
  await assert.rejects(silenceBrowserAudio({ addInitScript: async () => { throw failure; } }), error => error === failure);
});
