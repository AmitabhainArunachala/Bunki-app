/**
 * An article read in his pocket (package L1, 2026-11-12). The plan: "An article plays through with the screen locked.
 * Done when: your iPhone, in your pocket, reads an article to the end." John: "when i hit play, the only thing that
 * should stop that is hitting the pause button itself."
 *
 * The law these tests hold, from plain inputs (no browser, no sound):
 *  - between two sentences nothing waits on a timer while the page is hidden (a hidden page's timers are slowed or
 *    stopped); shown, the pause between sentences is as before;
 *  - a pause of the one audio element that this app did not ask for (a call, another app's sound, the lock screen,
 *    headphones out) is told, so the read is paused there; the app's own pause, a stop, a new clip and a clip's end
 *    are not; a resume the browser refuses is told too, and so is a next clip it will not let start, for the article's
 *    read only (any other read fails as before);
 *  - while a read waits for its next clip on a hidden page, the element plays silence in a loop, and lets go of it
 *    when the clip comes, when he pauses or when the read ends;
 *  - the lock screen (Media Session): the article's title, "Bunki", the app's icon, play, pause, next and previous;
 *    its state follows the read; cleared when the read ends; where the interface does not exist nothing breaks.
 */
/* global Event, EventTarget, setTimeout, clearTimeout */
import { describe, expect, it } from 'vitest';

import { createAudioPlayer } from '../prototypes/corridor/modules/nihongo-speech/audio/speech-player.mjs';
import {
  createPocketPlayer,
  createReaderMediaSession,
  gapSleep,
} from '../prototypes/corridor/modules/reader-pocket.mjs';

const tick = (ms = 0) => new Promise((done) => setTimeout(done, ms));

/** A page that can be hidden and shown, with its own timers counted. */
function page({ hidden = false } = {}) {
  const doc = new EventTarget();
  const timers = [];
  doc.hidden = hidden;
  doc.defaultView = {
    setTimeout: (fn, ms) => {
      timers.push(ms);
      return setTimeout(fn, ms);
    },
    clearTimeout: (id) => clearTimeout(id),
  };
  doc.set = (next) => {
    doc.hidden = next;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { doc, timers };
}

/** The one audio element as a browser keeps it: a pause the page or anyone else asks for is told a moment later (the
 * browser's own task), a clip that reaches its end is paused and ended at once, a new address while playing pauses it
 * without the page asking (some engines tell that too). `refuse` makes the next play() refused (true: NotAllowedError, or
 * the error's name). */
class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.ended = false;
    this.loop = false;
    this.hidden = false;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this._src = '';
    this.started = [];
    this.refuse = false;
  }
  get src() {
    return this._src;
  }
  set src(value) {
    const wasPlaying = !this.paused;
    this._src = value;
    this.ended = false;
    if (wasPlaying) {
      this.paused = true;
      setTimeout(() => this.dispatchEvent(new Event('pause')), 0);
    }
  }
  setAttribute() {}
  play() {
    if (this.refuse) {
      const error = new Error('refused');
      error.name = typeof this.refuse === 'string' ? this.refuse : 'NotAllowedError';
      this.refuse = false;
      return Promise.reject(error);
    }
    this.paused = false;
    this.ended = false;
    this.started.push(this._src);
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    setTimeout(() => this.dispatchEvent(new Event('pause')), 0);
  }
  /** The clip played to its end, as a browser tells it: pause, then ended, in one task. */
  finish() {
    this.ended = true;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
    this.dispatchEvent(new Event('ended'));
  }
}

/** The speech team's own player (speech-player.mjs, unchanged) on a fake element, wrapped as the reader uses it. */
function rig({ refusalIsPause = () => false } = {}) {
  const audio = new FakeAudio();
  let blobs = 0;
  const document = {
    createElement: () => audio,
    querySelector: () => audio,
    body: { append() {} },
    defaultView: {
      URL: { createObjectURL: () => `blob:clip-${++blobs}`, revokeObjectURL() {} },
      Blob: class {},
    },
  };
  const inner = createAudioPlayer(document);
  const pocket = createPocketPlayer({
    player: inner,
    audio,
    silence: () => 'blob:silence',
    refusalIsPause,
  });
  const told = [];
  pocket.onOutsidePause(() => told.push('outside'));
  const clip = () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'audio/wav' });
  return { audio, pocket, told, clip, player: pocket.player };
}

describe('between two sentences: no timer while the page is hidden', () => {
  it('shown, the pause between sentences waits on the page’s timer, as before', async () => {
    const { doc, timers } = page();
    const sleep = gapSleep(doc);
    let over = false;
    void sleep(30).then(() => (over = true));
    await tick(5);
    expect(over).toBe(false);
    await tick(60);
    expect(over).toBe(true);
    expect(timers).toEqual([30]);
  });
  it('hidden, there is no pause: the next sentence starts from the end of the one before, with no timer', async () => {
    const { doc, timers } = page({ hidden: true });
    const sleep = gapSleep(doc);
    let over = false;
    void sleep(260).then(() => (over = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(over).toBe(true);
    expect(timers).toEqual([]);
  });
  it('a pause under way when the page is hidden ends then, so it never waits on a stopped timer', async () => {
    const { doc } = page();
    const sleep = gapSleep(doc);
    let over = false;
    void sleep(10_000).then(() => (over = true));
    await tick(5);
    doc.set(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(over).toBe(true);
  });
});

describe('the one audio element: a pause from outside is told; the app’s own are not', () => {
  it('a pause nobody in this app asked for, while a clip plays, is told once', async () => {
    const r = rig();
    void r.player.play(r.clip(), 1);
    await tick();
    r.audio.pause(); // a call comes in, another app plays, the lock screen's own button
    await tick(5);
    expect(r.told).toEqual(['outside']);
  });
  it('the app’s own pause, a stop and a clip that reaches its end are not from outside', async () => {
    const r = rig();
    void r.player.play(r.clip(), 1);
    await tick();
    r.player.pause();
    await tick(5);
    r.player.resume();
    await tick();
    r.player.stop();
    await tick(5);
    const ended = r.player.play(r.clip(), 1);
    await tick();
    r.audio.finish();
    expect(await ended).toBe('ended');
    await tick(5);
    expect(r.told).toEqual([]);
  });
  it('a new clip in place of the one playing is not a pause from outside', async () => {
    const r = rig();
    void r.player.play(r.clip(), 1);
    await tick();
    void r.player.play(r.clip(), 1); // the engine may tell a pause as the address changes
    await tick(5);
    expect(r.told).toEqual([]);
    expect(r.audio.paused).toBe(false);
  });
  it('a resume the browser refuses is told, so the bar can say paused', async () => {
    const r = rig();
    void r.player.play(r.clip(), 1);
    await tick();
    r.player.pause();
    await tick(5);
    r.audio.refuse = true;
    r.player.resume();
    await tick(5);
    expect(r.told).toEqual(['outside']);
  });
  it('a next clip the browser will not let start: for the article’s read a pause from outside, the clip stopped', async () => {
    const r = rig({ refusalIsPause: () => true });
    r.audio.refuse = true;
    const outcome = await r.player.play(r.clip(), 1);
    expect(outcome).toBe('stopped');
    expect(r.told).toEqual(['outside']);
  });
  it('…and for any other read it fails as before, and nothing is told', async () => {
    const r = rig({ refusalIsPause: () => false });
    r.audio.refuse = true;
    await expect(r.player.play(r.clip(), 1)).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(r.told).toEqual([]);
  });
  it('a clip that cannot play for another reason fails as before, for the article’s read too', async () => {
    const r = rig({ refusalIsPause: () => true });
    r.audio.refuse = 'NotSupportedError';
    await expect(r.player.play(r.clip(), 1)).rejects.toMatchObject({ name: 'NotSupportedError' });
    expect(r.told).toEqual([]);
  });
});

describe('waiting on a hidden page: silence in a loop keeps the page playing', () => {
  it('hold plays the silence in a loop; the next clip turns the loop off and takes the element', async () => {
    const r = rig();
    r.pocket.hold();
    expect(r.audio.loop).toBe(true);
    expect(r.audio.started).toEqual(['blob:silence']);
    expect(r.pocket.holding()).toBe(true);
    r.pocket.hold(); // already holding: nothing more
    expect(r.audio.started).toHaveLength(1);
    void r.player.play(r.clip(), 1);
    expect(r.audio.loop).toBe(false);
    expect(r.pocket.holding()).toBe(false);
    expect(r.audio.started.at(-1)).toMatch(/^blob:clip-/);
    await tick(5);
    expect(r.told).toEqual([]);
  });
  it('letGo stops the silence and is not a pause from outside; with nothing held it touches nothing', async () => {
    const r = rig();
    r.pocket.hold();
    r.pocket.letGo();
    expect(r.audio.loop).toBe(false);
    expect(r.audio.paused).toBe(true);
    await tick(5);
    expect(r.told).toEqual([]);
    void r.player.play(r.clip(), 1);
    await tick();
    r.pocket.letGo(); // a clip is playing: it is not the silence's to stop
    expect(r.audio.paused).toBe(false);
  });
  it('the silence paused from outside (a call while the read waits) is told', async () => {
    const r = rig();
    r.pocket.hold();
    r.audio.pause();
    await tick(5);
    expect(r.told).toEqual(['outside']);
    expect(r.audio.loop).toBe(false);
  });
});

describe('the lock screen (Media Session)', () => {
  const session = () => {
    const handlers = {},
      sets = [];
    const mediaSession = {
      metadata: undefined,
      playbackState: 'none',
      refuse: null,
      setActionHandler(action, fn) {
        if (action === this.refuse) throw new TypeError('not supported');
        handlers[action] = fn;
        sets.push([action, typeof fn]);
      },
    };
    class MediaMetadata {
      constructor(init) {
        Object.assign(this, init);
      }
    }
    return { navigator: { mediaSession }, MediaMetadata, mediaSession, handlers, sets };
  };
  const artwork = [{ src: 'https://bunki.test/icon-512.png', sizes: '512x512', type: 'image/png' }];
  it('shows the article’s title, Bunki and the app’s icon, with play, pause, next and previous', () => {
    const s = session();
    const media = createReaderMediaSession({ ...s, artwork });
    const done = [];
    const actions = {
      play: () => done.push('play'),
      pause: () => done.push('pause'),
      nexttrack: () => done.push('next'),
      previoustrack: () => done.push('previous'),
    };
    media.show({ title: '第2次高市内閣', playing: true, actions });
    expect(s.mediaSession.metadata).toMatchObject({
      title: '第2次高市内閣',
      artist: 'Bunki',
      artwork,
    });
    expect(s.mediaSession.playbackState).toBe('playing');
    expect(Object.keys(s.handlers).sort()).toEqual(['nexttrack', 'pause', 'play', 'previoustrack']);
    for (const action of ['pause', 'play', 'nexttrack', 'previoustrack']) s.handlers[action]();
    expect(done).toEqual(['pause', 'play', 'next', 'previous']);
  });
  it('follows the read: paused and playing again change the state, not the title or the handlers', () => {
    const s = session();
    const media = createReaderMediaSession({ ...s, artwork });
    const actions = { play() {}, pause() {}, nexttrack() {}, previoustrack() {} };
    media.show({ title: 'A', playing: true, actions });
    const meta = s.mediaSession.metadata,
      count = s.sets.length;
    media.show({ title: 'A', playing: false, actions });
    expect(s.mediaSession.playbackState).toBe('paused');
    media.show({ title: 'A', playing: true, actions });
    expect(s.mediaSession.playbackState).toBe('playing');
    expect(s.mediaSession.metadata).toBe(meta);
    expect(s.sets).toHaveLength(count);
  });
  it('is cleared when the read ends or is stopped: no title, no handlers, state none', () => {
    const s = session();
    const media = createReaderMediaSession({ ...s, artwork });
    media.show({ title: 'A', playing: true, actions: { play() {}, pause() {} } });
    media.clear();
    expect(s.mediaSession.metadata).toBe(null);
    expect(s.mediaSession.playbackState).toBe('none');
    for (const action of ['play', 'pause', 'nexttrack', 'previoustrack'])
      expect(s.handlers[action]).toBe(null);
    media.show({ title: 'B', playing: false, actions: { play() {}, pause() {} } }); // a new read shows itself again
    expect(s.mediaSession.metadata.title).toBe('B');
    expect(typeof s.handlers.play).toBe('function');
  });
  it('an action this browser does not take leaves the others in place', () => {
    const s = session();
    s.mediaSession.refuse = 'previoustrack';
    const media = createReaderMediaSession({ ...s, artwork });
    const actions = { play() {}, pause() {}, nexttrack() {}, previoustrack() {} };
    expect(() => media.show({ title: 'A', playing: true, actions })).not.toThrow();
    expect(Object.keys(s.handlers).sort()).toEqual(['nexttrack', 'pause', 'play']);
    expect(s.mediaSession.playbackState).toBe('playing');
  });
  it('where the interface does not exist, nothing breaks', () => {
    for (const env of [
      {},
      { navigator: {} },
      { navigator: { mediaSession: {} } },
      { navigator: { mediaSession: { setActionHandler() {} } } },
    ]) {
      const media = createReaderMediaSession({ ...env, artwork });
      expect(() => media.show({ title: 'A', playing: true, actions: { play() {} } })).not.toThrow();
      expect(() => media.clear()).not.toThrow();
    }
  });
});
