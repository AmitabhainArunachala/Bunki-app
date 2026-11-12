/**
 * An article read in his pocket (package L1, 2026-11-12): the seam's part. John: "when i hit play, the only thing that
 * should stop that is hitting the pause button itself."
 *
 *  - the pause between two sentences is asked of the page's own gap (modules/reader-pocket.mjs, gapSleep: none while
 *    the page is hidden), never of the seam's own sleep;
 *  - a recorded clip paused from outside (a call, another app, the lock screen) pauses the read at that sentence; it
 *    does not end it, nothing takes it up by itself, and play says that sentence again;
 *  - with the repaired head merged (349769763, a kept clip that will not play is dropped): a start the browser does not
 *    allow (NotAllowedError) pauses the article's read and its clip is kept; a clip that will not play for any other
 *    reason is dropped from the page and the device and the read ends with 'decode'. They are told apart by the error's
 *    name, as the browser gives it.
 *  - fix round 1 (the review's F2, L1-2 again: nothing in the path to the next sentence waits on a timer while the page
 *    is hidden): the one retry after a 503 waits on the page's gap (none while hidden), never on the seam's own sleep;
 *    the device store's 1.5 s and the client's 20 s are asked of the page's clock (`after`), which reads the wall clock
 *    at every tick of the sounding element (reader-pocket.mjs, pageTimer), not of a timer of their own.
 */
/* global EventTarget, setTimeout */
import { describe, expect, it } from 'vitest';

import { createPocketPlayer } from '../prototypes/corridor/modules/reader-pocket.mjs';
import {
  createMemoryTokenStore,
  createVoiceClient,
  VoiceError,
} from '../prototypes/corridor/modules/voice-client.mjs';
import { createVoiceSeam } from '../prototypes/corridor/modules/voice-seam.mjs';

const tick = (ms = 0) => new Promise((done) => setTimeout(done, ms));

describe('the seam: the queue’s gap is the page’s gap; its own waits are its own', () => {
  const S3 = [
    { text: '雨の日は本を読む。' },
    { text: '猫が窓の外を見ている。' },
    { text: '駅の前で友達を待った。' },
  ];
  const client = () => ({
    configured: () => true,
    ready: async () => {},
    paired: () => true,
    scope: () => ({ installation: 'bunki-' + 'b'.repeat(32) }),
    asked: [],
    async speak({ text, voiceKey }) {
      this.asked.push(text);
      return {
        bytes: new Uint8Array([1]),
        contentType: 'audio/wav',
        voiceId: 'v',
        inputKey: `${voiceKey}|${text}`,
      };
    },
  });
  const quietPlayer = {
    play: async () => 'ended',
    pause() {},
    resume() {},
    stop() {},
    setRate() {},
  };
  it('the pause between sentences is asked of gapSleep, never of the seam’s own sleep', async () => {
    const gaps = [],
      sleeps = [];
    const seam = createVoiceSeam({
      client: client(),
      player: quietPlayer,
      sleep: async (ms) => sleeps.push(ms),
      gapSleep: async (ms) => gaps.push(ms),
    });
    const end = await new Promise((done) =>
      seam.read({
        voiceKey: 'article:a1',
        sentences: S3,
        onState: (state) => ['done', 'stopped', 'error'].includes(state) && done(state),
      }),
    );
    expect(end).toBe('done');
    expect(gaps).toEqual([260, 260]);
    expect(sleeps).toEqual([]);
  });
  it('with no gapSleep given, the seam’s sleep is the gap, as before', async () => {
    const sleeps = [];
    const seam = createVoiceSeam({
      client: client(),
      player: quietPlayer,
      sleep: async (ms) => sleeps.push(ms),
    });
    await new Promise((done) =>
      seam.read({
        voiceKey: 'article:a1',
        sentences: S3,
        onState: (state) => state === 'done' && done(),
      }),
    );
    expect(sleeps).toEqual([260, 260]);
  });
  it('a recorded clip paused from outside pauses the read at that sentence; play says the sentence again', async () => {
    const c = client();
    let release = null;
    const recorded = [];
    const seam = createVoiceSeam({
      client: c,
      player: quietPlayer,
      sleep: async () => {},
      recorded: (src) => {
        recorded.push(src);
        return new Promise((done) => (release = done));
      },
    });
    const states = [];
    const session = seam.read({
      voiceKey: 'article:a1',
      sentences: [{ text: S3[0].text, recorded: { src: 'audio/narration/x-000.m4a' } }, S3[1]],
      onState: (state) => states.push(state),
    });
    await tick(5);
    expect(session.state).toBe('playing');
    release('paused'); // the recording's element was paused by nobody in this app
    await tick(5);
    expect(states.at(-1)).toBe('paused');
    expect(session.state).toBe('paused');
    expect(session.ended).toBe(false);
    expect(session.index).toBe(0);
    await tick(20);
    expect(states.at(-1)).toBe('paused'); // nothing takes itself up again
    expect(recorded).toHaveLength(1);
    session.resume();
    await tick(5);
    expect(recorded).toHaveLength(2); // the same sentence, from its start
    expect(session.index).toBe(0);
    expect(states.at(-1)).toBe('playing');
    session.stop();
  });
  it('a start the browser blocks pauses the article’s read and keeps its clip; a clip that will not play is dropped', async () => {
    const dropped = [];
    const store = {
      has: () => false,
      get: async () => null,
      put: async () => {},
      touch() {},
      drop: async (key) => dropped.push(key),
    };
    const refuse = { name: null };
    const inner = {
      async play() {
        if (!refuse.name) return 'ended';
        const error = new Error('refused');
        error.name = refuse.name;
        refuse.name = null;
        throw error;
      },
      pause() {},
      stop() {},
      setRate() {},
    };
    const audio = Object.assign(new EventTarget(), {
      paused: true,
      ended: false,
      loop: false,
      play: async () => {},
      pause() {},
    });
    let reading = null;
    let seam = null;
    const article = () => !!reading && seam.active() === reading;
    const pocket = createPocketPlayer({
      player: inner,
      audio,
      silence: () => 'blob:silence',
      refusalIsPause: article,
    });
    pocket.onOutsidePause(() => {
      if (article() && reading.state === 'playing') reading.pause();
    });
    seam = createVoiceSeam({
      client: client(),
      player: pocket.player,
      store,
      sleep: async () => {},
      gapSleep: async () => {},
    });
    // blocked: the article's read is paused at its sentence, and the clip stays
    refuse.name = 'NotAllowedError';
    const states = [];
    const ended = new Promise((done) => {
      reading = seam.read({
        voiceKey: 'article:a1',
        sentences: S3,
        onState: (state, code) => {
          states.push(code ? `${state}:${code}` : state);
          if (['done', 'stopped', 'error'].includes(state)) done(state);
        },
      });
    });
    await tick(5);
    expect(reading.state).toBe('paused');
    expect(reading.index).toBe(0);
    expect(dropped).toEqual([]);
    reading.resume();
    expect(await ended).toBe('done');
    expect(dropped).toEqual([]);
    // will not play (a media error): dropped from the device, and the read ends with 'decode'
    reading = null;
    refuse.name = 'NotSupportedError';
    const end = await new Promise((done) =>
      seam.read({
        voiceKey: 'word:猫',
        sentences: [{ text: 'ねこが好き。' }],
        onState: (state, code) =>
          ['done', 'stopped', 'error'].includes(state) && done(`${state}:${code}`),
      }),
    );
    expect(end).toBe('error:decode');
    expect(dropped).toEqual(['word:猫|ねこが好き。']);
  });
});

describe('fix round 1: nothing in the path to the next sentence waits on a timer of its own', () => {
  const S2 = [{ text: '雨の日は本を読む。' }, { text: '猫が窓の外を見ている。' }];
  const quietPlayer = {
    play: async () => 'ended',
    pause() {},
    resume() {},
    stop() {},
    setRate() {},
  };
  const settle = (seam, sentences) =>
    new Promise((done) =>
      seam.read({
        voiceKey: 'article:a1',
        sentences,
        onState: (state, code) =>
          ['done', 'stopped', 'error'].includes(state) && done(code ? `${state}:${code}` : state),
      }),
    );
  const answering = (asked, busy = { text: null, times: 0 }) => ({
    configured: () => true,
    ready: async () => {},
    paired: () => true,
    scope: () => ({ installation: 'bunki-' + 'b'.repeat(32) }),
    async speak({ text }) {
      asked.push(text);
      if (text === busy.text && busy.times > 0) {
        busy.times -= 1;
        throw new VoiceError('voice-unavailable', 503);
      }
      return { bytes: new Uint8Array([1]), contentType: 'audio/wav', voiceId: 'v', inputKey: text };
    },
  });
  it('a 503 is asked once more on the page’s gap (none while hidden), never on the seam’s own sleep', async () => {
    const asked = [];
    const gaps = [],
      sleeps = [];
    const seam = createVoiceSeam({
      client: answering(asked, { text: S2[1].text, times: 1 }),
      player: quietPlayer,
      sleep: async (ms) => sleeps.push(ms),
      gapSleep: async (ms) => gaps.push(ms),
    });
    expect(await settle(seam, S2)).toBe('done');
    expect(sleeps).toEqual([]);
    expect(gaps).toContain(2000);
    // one retry, as today: the busy sentence was asked twice, the other once
    expect(asked.filter((t) => t === S2[1].text)).toHaveLength(2);
    expect(asked.filter((t) => t === S2[0].text)).toHaveLength(1);
  });
  it('…and two busy answers still end the read with that reason (the count of retries is as before)', async () => {
    const asked = [];
    const seam = createVoiceSeam({
      client: answering(asked, { text: S2[0].text, times: 2 }),
      player: quietPlayer,
      sleep: async () => {},
      gapSleep: async () => {},
    });
    expect(await settle(seam, S2)).toBe('error:voice-unavailable');
    expect(asked.filter((t) => t === S2[0].text)).toHaveLength(2);
  });
  it('a device store that does not answer is given up on the page’s clock (`after`), and the read goes on', async () => {
    const waits = [];
    const asked = [];
    const store = {
      has: () => false,
      get: () => new Promise(() => {}),
      put: async () => {},
      touch() {},
      drop: async () => {},
    };
    const seam = createVoiceSeam({
      client: answering(asked),
      player: quietPlayer,
      store,
      sleep: async () => {},
      gapSleep: async () => {},
      after: (ms, run) => {
        waits.push(ms);
        void Promise.resolve().then(run); // the page's clock: here its time has come at once
        return () => {};
      },
    });
    const end = await Promise.race([settle(seam, S2), tick(300).then(() => 'still waiting')]);
    expect(waits).toContain(1500);
    expect(end).toBe('done');
    expect(asked).toEqual(S2.map((s) => s.text));
  });
  it('the client’s deadline is the page’s clock (`after`): a request that never answers ends as voice-timeout', async () => {
    const store = createMemoryTokenStore();
    await store.write({
      server: 'http://127.0.0.1:19599',
      token: `nsrs_prod_abcd.${'a'.repeat(64)}`,
      scope: {
        environment: 'prod',
        learner: 'test-learner',
        installation: `bunki-${'c'.repeat(32)}`,
      },
    });
    const deadlines = [];
    let fire = null;
    const client = createVoiceClient({
      store,
      // a server that never answers: only an abort ends the request
      fetch: (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          ),
        ),
      after: (ms, run) => {
        deadlines.push(ms);
        fire = run;
        return () => {
          fire = null;
        };
      },
    });
    const asking = client.speak({ text: '雨の日は本を読む。', voiceKey: 'article:a1' }).then(
      () => 'answered',
      (error) => error.code || error.name,
    );
    await tick(5);
    expect(deadlines).toEqual([20000]);
    fire?.(); // the page's clock says the 20 s have passed (a tick of the element, or the page shown again)
    expect(await Promise.race([asking, tick(200).then(() => 'still waiting')])).toBe(
      'voice-timeout',
    );
  });
});

describe('fix round 2: the wait after a slow server or a lost connection is named by its cause (the re-check’s F3)', () => {
  const X = { text: '雨の日は本を読む。' };
  const quietPlayer = {
    play: async () => 'ended',
    pause() {},
    resume() {},
    stop() {},
    setRate() {},
  };
  /** A seam on a client whose next requests end with the codes in `next` (as the client throws them), on a clock the
   * test moves; `online` is the browser's word on the network. */
  const rig = () => {
    const r = { at: Date.parse('2026-11-12T02:00:00Z'), asked: [], next: [], online: true };
    const client = {
      configured: () => true,
      ready: async () => {},
      paired: () => true,
      scope: () => ({ installation: 'bunki-' + 'b'.repeat(32) }),
      async speak({ text }) {
        r.asked.push(text);
        const code = r.next.shift();
        if (code) throw new VoiceError(code, 0);
        return {
          bytes: new Uint8Array([1]),
          contentType: 'audio/wav',
          voiceId: 'v',
          inputKey: text,
        };
      },
    };
    r.seam = createVoiceSeam({
      client,
      player: quietPlayer,
      sleep: async () => {},
      gapSleep: async () => {},
      now: () => r.at,
      online: () => r.online,
    });
    r.read = () =>
      new Promise((done) =>
        r.seam.read({
          voiceKey: 'article:a1',
          sentences: [X],
          onState: (state, code) =>
            ['done', 'stopped', 'error'].includes(state) && done(code ? `${state}:${code}` : state),
        }),
      );
    return r;
  };
  it('after a slow server, a play inside its 15 s wait ends at once as that slow server (voice-timeout), asking nothing', async () => {
    const r = rig();
    r.next.push('voice-timeout');
    expect(await r.read()).toBe('error:voice-timeout');
    expect(r.asked).toHaveLength(1);
    r.at += 3000;
    expect(await r.read()).toBe('error:voice-timeout');
    expect(r.asked).toHaveLength(1);
    expect(r.seam.cannot('article:a1')).toBe('voice-timeout');
    // a wait, not a refusal: nothing is shown as blocked
    expect(r.seam.status().blocked).toBe(null);
    r.at += 12_001;
    expect(r.seam.cannot('article:a1')).toBe(null);
    expect(await r.read()).toBe('done');
    expect(r.asked).toHaveLength(2);
  });
  it('after a lost connection, a play inside its 15 s wait ends at once as no connection (network-failed)', async () => {
    const r = rig();
    r.next.push('network-failed');
    expect(await r.read()).toBe('error:network-failed');
    r.at += 3000;
    expect(await r.read()).toBe('error:network-failed');
    expect(r.asked).toHaveLength(1);
    expect(r.seam.cannot('article:a1')).toBe('network-failed');
    expect(r.seam.status().blocked).toBe(null);
  });
  it('the last cause names the wait: a slow server, then a lost connection, is no connection; the network gone, offline', async () => {
    const r = rig();
    r.next.push('voice-timeout');
    expect(await r.read()).toBe('error:voice-timeout');
    r.at += 15_001;
    r.next.push('network-failed');
    expect(await r.read()).toBe('error:network-failed');
    r.at += 1000;
    expect(r.seam.cannot('article:a1')).toBe('network-failed');
    r.at += 15_001;
    r.online = false;
    expect(await r.read()).toBe('error:offline');
    expect(r.asked).toHaveLength(2);
  });
});
