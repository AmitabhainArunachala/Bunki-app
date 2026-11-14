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
    // `press`: his play (the bar, the lock screen); without it, a read that starts by itself
    r.read = ({ press = false } = {}) =>
      new Promise((done) =>
        r.seam.read({
          voiceKey: 'article:a1',
          sentences: [X],
          press,
          onState: (state, code) =>
            ['done', 'stopped', 'error'].includes(state) && done(code ? `${state}:${code}` : state),
        }),
      );
    return r;
  };
  // Rule 8 (the ruling's amendment, 2026-11-14; the review's B2) replaces fix round 2's "a play inside the wait ends with
  // the same reason as the first stop": the wait holds back only a read that starts by itself; his play asks.
  it('after a slow server, inside its 15 s wait a read by itself ends at once as that slow server (voice-timeout), asking nothing; his play asks and speaks', async () => {
    const r = rig();
    r.next.push('voice-timeout');
    expect(await r.read({ press: true })).toBe('error:voice-timeout');
    expect(r.asked).toHaveLength(1);
    r.at += 3000;
    expect(await r.read()).toBe('error:voice-timeout');
    expect(r.asked).toHaveLength(1);
    expect(r.seam.cannot('article:a1')).toBe('voice-timeout');
    // a wait, not a refusal: nothing is shown as blocked
    expect(r.seam.status().blocked).toBe(null);
    expect(await r.read({ press: true })).toBe('done');
    expect(r.asked).toHaveLength(2);
    expect(r.seam.cannot('article:a1')).toBe(null);
  });
  it('after a lost connection, inside its 15 s wait a read by itself ends at once as no connection (network-failed); his play asks, and failing again starts the wait again', async () => {
    const r = rig();
    r.next.push('network-failed');
    expect(await r.read({ press: true })).toBe('error:network-failed');
    r.at += 3000;
    expect(await r.read()).toBe('error:network-failed');
    expect(r.asked).toHaveLength(1);
    expect(r.seam.cannot('article:a1')).toBe('network-failed');
    expect(r.seam.status().blocked).toBe(null);
    r.next.push('network-failed');
    expect(await r.read({ press: true })).toBe('error:network-failed');
    expect(r.asked).toHaveLength(2);
    r.at += 14_000;
    expect(r.seam.cannot('article:a1')).toBe('network-failed');
    r.at += 1_001;
    expect(r.seam.cannot('article:a1')).toBe(null);
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

describe('play on a read he had paused is his press (the re-review’s F1; rule 8)', () => {
  const S4 = [
    { text: '雨の日は本を読む。' },
    { text: '猫が窓の外を見ている。' },
    { text: '駅の前で友達を待った。' },
    { text: '新しい靴を買いました。' },
  ];
  /** A read of four sentences on a clock the test moves. The client answers in order with the codes in `next` (none: a
   * clip); the first sentence plays until the test lets it end, so the read can be paused while its window is fetched. */
  const rig = () => {
    const r = {
      at: Date.parse('2026-11-12T02:00:00Z'),
      asked: [],
      next: [],
      played: [],
      states: [],
    };
    let release = null;
    r.endFirst = () => release?.('ended');
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
    const player = {
      play: (clip) => {
        r.played.push(clip.inputKey);
        return r.played.length === 1
          ? new Promise((done) => (release = done))
          : Promise.resolve('ended');
      },
      pause() {},
      resume() {},
      stop() {},
      setRate() {},
    };
    r.seam = createVoiceSeam({
      client,
      player,
      sleep: async () => {},
      gapSleep: async () => {},
      now: () => r.at,
    });
    r.end = new Promise((done) => {
      r.session = r.seam.read({
        voiceKey: 'article:a1',
        sentences: S4,
        press: true,
        onState: (state, code) => {
          r.states.push(code ? `${state}:${code}` : state);
          if (['done', 'stopped', 'error'].includes(state)) done(code ? `${state}:${code}` : state);
        },
      });
    });
    return r;
  };
  /** The read is on its first sentence and its window has been asked; the later sentence `code` stands for met it. */
  const pausedAfter = async (code) => {
    const r = rig();
    r.next.push(undefined, undefined, code);
    await tick(10);
    expect(r.asked).toEqual(S4.slice(0, 3).map((s) => s.text));
    expect(r.session.state).toBe('playing');
    r.session.pause();
    expect(r.session.state).toBe('paused');
    r.at += 1000;
    return r;
  };
  it('a later sentence lost its connection; paused; play at +1 s asks for it again and the read speaks on to the end', async () => {
    const r = await pausedAfter('network-failed');
    r.session.resume({ press: true });
    r.endFirst();
    expect(await Promise.race([r.end, tick(500).then(() => 'still going')])).toBe('done');
    // the lost sentence asked again, then the last one: every sentence spoken, in order
    expect(r.asked).toEqual([S4[0], S4[1], S4[2], S4[2], S4[3]].map((s) => s.text));
    expect(r.played).toEqual(S4.map((s) => s.text));
  });
  it('the same after a slow answer (voice-timeout): play at +1 s asks again and speaks on', async () => {
    const r = await pausedAfter('voice-timeout');
    r.session.resume({ press: true });
    r.endFirst();
    expect(await Promise.race([r.end, tick(500).then(() => 'still going')])).toBe('done');
    expect(r.played).toEqual(S4.map((s) => s.text));
  });
  it('a resume nobody pressed: as before, the read ends at the lost sentence and asks nothing more', async () => {
    const r = await pausedAfter('network-failed');
    r.session.resume();
    r.endFirst();
    expect(await Promise.race([r.end, tick(500).then(() => 'still going')])).toBe(
      'error:network-failed',
    );
    expect(r.asked).toEqual(S4.slice(0, 3).map((s) => s.text));
    expect(r.played).toEqual(S4.slice(0, 2).map((s) => s.text));
  });
  it('a press inside the per-minute wait sends nothing: the read ends at that sentence with the minute’s line', async () => {
    const r = await pausedAfter('request-rate-limit');
    r.session.resume({ press: true });
    r.endFirst();
    expect(await Promise.race([r.end, tick(500).then(() => 'still going')])).toBe(
      'error:request-rate-limit',
    );
    expect(r.asked).toEqual(S4.slice(0, 3).map((s) => s.text));
    expect(r.played).toEqual(S4.slice(0, 2).map((s) => s.text));
  });
  it('his play with the connection still gone asks once and ends there; the wait starts again from that failure', async () => {
    const r = await pausedAfter('network-failed');
    r.next.push('network-failed');
    r.session.resume({ press: true });
    r.endFirst();
    expect(await Promise.race([r.end, tick(500).then(() => 'still going')])).toBe(
      'error:network-failed',
    );
    expect(r.asked).toEqual(
      [S4[0], S4[1], S4[2], S4[2], S4[3]].map((s) => s.text).slice(0, r.asked.length),
    );
    expect(r.asked.filter((t) => t === S4[2].text)).toHaveLength(2);
    expect(r.played).toEqual(S4.slice(0, 2).map((s) => s.text));
    r.at += 14_000;
    expect(r.seam.cannot('article:a1')).toBe('network-failed');
  });
});

describe('with no press, a read that comes to a sentence it held ends there at once and asks nothing more (the follow-up review’s M1)', () => {
  const S5 = [
    { text: '雨の日は本を読む。' },
    { text: '猫が窓の外を見ている。' },
    { text: '駅の前で友達を待った。' },
    { text: '新しい靴を買いました。' },
    { text: '明日は晴れるでしょう。' },
  ];
  const texts = (list) => list.map((s) => s.text);
  /** A read of five sentences on a clock the test moves, with no device store (the quickest way to the server). The
   * client answers in order with `next` (a code: that refusal; 'hang': an answer that never comes; none: a clip) and
   * keeps each request's signal. `told` is everything the read tells its caller, in order: a sentence's index (-1: no
   * sentence is lit any more) or a state. The first sentence plays until the test lets it end. */
  const rig = () => {
    const r = {
      at: Date.parse('2026-11-12T02:00:00Z'),
      asked: [],
      signals: [],
      next: [],
      played: [],
      told: [],
      stops: 0,
    };
    let release = null;
    r.endFirst = () => release?.('ended');
    const client = {
      configured: () => true,
      ready: async () => {},
      paired: () => true,
      scope: () => ({ installation: 'bunki-' + 'b'.repeat(32) }),
      async speak({ text, signal }) {
        r.asked.push(text);
        r.signals.push(signal);
        const code = r.next.shift();
        if (code === 'hang') return new Promise(() => {});
        if (code) throw new VoiceError(code, 0);
        return {
          bytes: new Uint8Array([1]),
          contentType: 'audio/wav',
          voiceId: 'v',
          inputKey: text,
        };
      },
    };
    const player = {
      play: (clip) => {
        r.played.push(clip.inputKey);
        return r.played.length === 1
          ? new Promise((done) => (release = done))
          : Promise.resolve('ended');
      },
      pause() {},
      resume() {},
      stop() {
        r.stops += 1;
      },
      setRate() {},
    };
    r.seam = createVoiceSeam({
      client,
      player,
      sleep: async () => {},
      gapSleep: async () => {},
      now: () => r.at,
    });
    r.end = new Promise((done) => {
      r.session = r.seam.read({
        voiceKey: 'article:a1',
        sentences: S5,
        press: true,
        onSentence: (index) => r.told.push(index),
        onState: (state, code) => {
          const name = code ? `${state}:${code}` : state;
          r.told.push(name);
          if (['done', 'stopped', 'error'].includes(state)) done(name);
        },
      });
    });
    return r;
  };
  /** The read is on its first sentence; the third lost its connection on the way (the short wait began then). */
  const thirdLost = async (second) => {
    const r = rig();
    r.next.push(undefined, second, 'network-failed');
    await tick(10);
    expect(r.asked).toEqual(texts(S5.slice(0, 3)));
    expect(r.session.state).toBe('playing');
    return r;
  };
  /** The end was told once, and nothing after it: no sentence lit, then the cause. */
  const endedOnceWithNoConnection = (r) => {
    expect(r.told.slice(-2)).toEqual([-1, 'error:network-failed']);
    expect(r.told.filter((entry) => entry === -1)).toHaveLength(1);
    expect(r.told.filter((entry) => String(entry).startsWith('error'))).toHaveLength(1);
  };
  it('it reaches that sentence after the wait has run out: it ends there, and the sentence its queue asked for in the same turn is never sent', async () => {
    const r = await thirdLost();
    r.at += 16_000;
    r.endFirst();
    expect(await Promise.race([r.end, tick(500).then(() => 'still going')])).toBe(
      'error:network-failed',
    );
    await tick(10);
    // the fourth was asked while the second played (the wait was over by then), as it always was; the fifth, asked for
    // as the read came to the lost third, is given up before it leaves
    expect(r.asked).toEqual(texts(S5.slice(0, 4)));
    expect(r.played).toEqual(texts(S5.slice(0, 2)));
    endedOnceWithNoConnection(r);
    expect(r.stops).toBe(0);
  });
  it('a jump onto that sentence (the lock screen’s next) ends the read before the jump returns, and nothing is sent', async () => {
    const r = await thirdLost();
    r.at += 16_000;
    r.session.jump(2);
    expect(r.told.slice(-2)).toEqual([-1, 'error:network-failed']);
    expect(r.session.state).toBe('error');
    expect(r.session.ended).toBe(true);
    expect(r.seam.active()).toBe(null);
    await tick(10);
    expect(r.asked).toEqual(texts(S5.slice(0, 3)));
    endedOnceWithNoConnection(r);
    // the jump's own stop of the player, and no other
    expect(r.stops).toBe(1);
  });
  it.each(['pause', 'stop', 'cut'])(
    'after that end %s does nothing more: the request still on its way is given up, the player is not stopped again, and a play on the ended read ends no wait',
    async (control) => {
      const r = await thirdLost('hang');
      r.at += 1000;
      r.session.jump(2);
      r.session.resume({ press: true });
      r.session[control]();
      await tick(10);
      expect(r.signals[1].aborted).toBe(true);
      expect(r.asked).toEqual(texts(S5.slice(0, 3)));
      endedOnceWithNoConnection(r);
      expect(r.stops).toBe(1);
      expect(r.seam.cannot('article:a1')).toBe('network-failed');
    },
  );
});

describe('a wait Settings shows tells its listeners once when it ends (the first review’s C2)', () => {
  const S2 = [{ text: '雨の日は本を読む。' }, { text: '猫が窓の外を見ている。' }];
  /** A seam on a clock and an `after` the test moves; the client's answers are held until the test settles them. */
  const rig = () => {
    const r = { at: Date.parse('2026-11-12T02:00:00Z'), timers: [], told: [], pending: [] };
    const client = {
      configured: () => true,
      ready: async () => {},
      paired: () => true,
      scope: () => ({ installation: 'bunki-' + 'b'.repeat(32) }),
      budget: async () => {
        throw new VoiceError('budget-unavailable', 500);
      },
      speak: ({ text }) =>
        new Promise((resolve, reject) => r.pending.push({ text, resolve, reject })),
    };
    r.refuse = (index, code) => r.pending[index].reject(new VoiceError(code, 429));
    r.seam = createVoiceSeam({
      client,
      player: { play: async () => 'ended', pause() {}, resume() {}, stop() {}, setRate() {} },
      sleep: async () => {},
      gapSleep: async () => {},
      now: () => r.at,
      after: (ms, run) => {
        const timer = { ms, due: r.at + ms, run, live: true };
        r.timers.push(timer);
        return () => {
          timer.live = false;
        };
      },
      onStatus: (status) => r.told.push(status),
    });
    r.live = () => r.timers.filter((t) => t.live);
    r.read = () =>
      new Promise((done) =>
        r.seam.read({
          voiceKey: 'article:a1',
          sentences: S2,
          press: true,
          onState: (state, code) =>
            ['done', 'stopped', 'error'].includes(state) && done(code ? `${state}:${code}` : state),
        }),
      );
    /** The clock moves to the live timer's time and it runs, as the page's clock would run it. */
    r.fire = (timer) => {
      r.at = timer.due;
      timer.live = false;
      timer.run();
    };
    return r;
  };
  it('after a per-minute refusal the listener is told at the minute’s end, and nothing is blocked then', async () => {
    const r = rig();
    const ended = r.read();
    await tick(5);
    r.refuse(0, 'request-rate-limit');
    expect(await ended).toBe('error:request-rate-limit');
    expect(r.seam.status().blocked).toBe('request-rate-limit');
    expect(r.live()).toHaveLength(1);
    expect(r.live()[0].ms).toBe(60_000);
    const before = r.told.length;
    r.fire(r.live()[0]);
    expect(r.told.length).toBe(before + 1);
    expect(r.told.at(-1).blocked).toBe(null);
    expect(r.seam.status().blocked).toBe(null);
  });
  it('a second refusal inside the minute moves the timer; it does not add one', async () => {
    const r = rig();
    const ended = r.read();
    await tick(5);
    expect(r.pending.map((p) => p.text)).toEqual(S2.map((s) => s.text));
    const t0 = r.at;
    r.refuse(1, 'request-rate-limit'); // the second sentence, fetched ahead, is refused first
    await tick(5);
    expect(r.live()).toHaveLength(1);
    r.at = t0 + 20_000;
    r.refuse(0, 'request-rate-limit'); // twenty seconds later the first one is refused too
    expect(await ended).toBe('error:request-rate-limit');
    expect(r.live()).toHaveLength(1);
    expect(r.live()[0].due).toBe(t0 + 80_000);
    const before = r.told.length;
    r.fire(r.live()[0]);
    expect(r.told.length).toBe(before + 1);
    expect(r.told.at(-1).blocked).toBe(null);
  });
  it('today’s limit: the listener is told at the server’s new day (00:00 UTC)', async () => {
    const r = rig();
    const ended = r.read();
    await tick(5);
    r.refuse(0, 'day-budget');
    expect(await ended).toBe('error:day-budget');
    expect(r.live()).toHaveLength(1);
    expect(r.live()[0].due).toBe(Date.parse('2026-11-13T00:00:00Z'));
    r.fire(r.live()[0]);
    expect(r.told.at(-1).blocked).toBe(null);
  });
  it('repaired() (the pairing changed) clears it: no timer is left', async () => {
    const r = rig();
    const ended = r.read();
    await tick(5);
    r.refuse(0, 'request-rate-limit');
    await ended;
    expect(r.live()).toHaveLength(1);
    r.seam.repaired();
    expect(r.live()).toHaveLength(0);
  });
});
