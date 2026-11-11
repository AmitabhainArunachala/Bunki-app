/**
 * An article read in his pocket (package L1, 2026-11-12): the seam's part. John: "when i hit play, the only thing that
 * should stop that is hitting the pause button itself."
 *
 *  - the pause between two sentences is asked of the page's own gap (modules/reader-pocket.mjs, gapSleep: none while
 *    the page is hidden), never of the seam's own sleep, which keeps its other waits (the 2 s after a 503);
 *  - a recorded clip paused from outside (a call, another app, the lock screen) pauses the read at that sentence; it
 *    does not end it, nothing takes it up by itself, and play says that sentence again;
 *  - with the repaired head merged (349769763, a kept clip that will not play is dropped): a start the browser does not
 *    allow (NotAllowedError) pauses the article's read and its clip is kept; a clip that will not play for any other
 *    reason is dropped from the page and the device and the read ends with 'decode'. They are told apart by the error's
 *    name, as the browser gives it.
 */
/* global EventTarget, setTimeout */
import { describe, expect, it } from 'vitest';

import { createPocketPlayer } from '../prototypes/corridor/modules/reader-pocket.mjs';
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
