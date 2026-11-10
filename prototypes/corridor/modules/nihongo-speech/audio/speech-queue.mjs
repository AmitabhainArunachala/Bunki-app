/** A sentence queue for universal speech: play one clip at a time, fetch a
 * bounded window ahead, and report what a stop could or could not prevent.
 *
 * Deliberately pure and runtime-neutral: no DOM, network, storage or provider
 * work, and no imports. The caller supplies fetching, playback and sleeping.
 */

export const SPEEDS = Object.freeze([0.75, 1, 1.25]);

const noop = () => {};

export function createSpeechQueue({
  fetchClip,
  player,
  prefetch = 2,
  gapMs = 260,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onSentence = noop,
  onState = noop,
} = {}) {
  if (typeof fetchClip !== 'function') throw new TypeError('fetchClip must be a function');
  if (!player || typeof player.play !== 'function') throw new TypeError('player.play must be a function');

  const ahead = Number.isInteger(prefetch) && prefetch >= 0 ? prefetch : 2;

  let sentences = [];
  let current = 0;
  let rate = 1;
  let state = 'idle';
  let paused = false;
  let active = false;
  let session = 0;
  let requested = new Set();
  let clips = new Map();
  let activePlay = null;
  let gapToken = null;
  let pendingAdvance = false;
  let notifiedEnd = false;

  const setState = (next, code) => {
    if (state === next) return;
    state = next;
    if (code === undefined) onState(next);
    else onState(next, code);
  };

  const notifyEnd = () => {
    if (notifiedEnd) return;
    notifiedEnd = true;
    onSentence(-1);
  };

  const abortPending = () => {
    for (const entry of clips.values()) {
      if (entry.status !== 'pending') continue;
      entry.status = 'aborted';
      entry.controller.abort();
    }
  };

  const request = index => {
    requested.add(index);
    const owner = session;
    const controller = new AbortController();
    const entry = {status: 'pending', controller, clip: undefined, error: undefined};
    clips.set(index, entry);
    let pending;
    try {
      pending = fetchClip(sentences[index], index, controller.signal);
    } catch (error) {
      pending = Promise.reject(error);
    }
    Promise.resolve(pending).then(
      clip => {
        if (entry.status !== 'pending' || owner !== session || !active) return;
        entry.status = 'resolved';
        entry.clip = clip;
        pump();
      },
      error => {
        if (entry.status !== 'pending' || owner !== session || !active) return;
        entry.status = 'rejected';
        entry.error = error;
        pump();
      },
    );
  };

  const ensureWindow = () => {
    const last = Math.min(sentences.length - 1, current + ahead);
    for (let i = current; i <= last; i++) {
      if (!requested.has(i)) request(i);
    }
  };

  const fail = (error, override) => {
    if (!active) return;
    const code = override ?? (error && typeof error.code === 'string' && error.code
      ? error.code
      : 'speak-failed');
    active = false;
    session++;
    activePlay = null;
    gapToken = null;
    pendingAdvance = false;
    paused = false;
    abortPending();
    notifyEnd();
    setState('error', code);
  };

  const finish = () => {
    if (!active) return;
    active = false;
    session++;
    activePlay = null;
    gapToken = null;
    pendingAdvance = false;
    paused = false;
    abortPending();
    notifyEnd();
    setState('done');
  };

  const advanced = () => {
    current++;
    pump();
  };

  const afterSentence = () => {
    if (current >= sentences.length - 1) {
      finish();
      return;
    }
    const token = {};
    const owner = session;
    gapToken = token;
    const wait = async () => {
      try {
        await sleep(gapMs);
      } catch {
        return;
      }
      if (gapToken !== token || owner !== session || !active) return;
      gapToken = null;
      if (paused) {
        pendingAdvance = true;
        return;
      }
      advanced();
    };
    wait();
  };

  function play(clip) {
    const token = {};
    const owner = session;
    const index = current;
    activePlay = token;
    setState('playing');
    onSentence(index);
    let pending;
    try {
      pending = player.play(clip, rate);
    } catch (error) {
      pending = Promise.reject(error);
    }
    Promise.resolve(pending).then(
      outcome => {
        if (activePlay !== token || owner !== session) return;
        activePlay = null;
        if (outcome === 'ended') afterSentence();
      },
      error => {
        if (activePlay !== token || owner !== session) return;
        activePlay = null;
        fail(error, 'decode');
      },
    );
  }

  function pump() {
    if (!active || paused || activePlay || gapToken) return;
    ensureWindow();
    const entry = clips.get(current);
    if (!entry || entry.status === 'pending') {
      setState('loading');
      return;
    }
    if (entry.status === 'rejected') {
      fail(entry.error);
      return;
    }
    if (entry.status === 'resolved') play(entry.clip);
  }

  const start = (list, from = 0) => {
    if (!Array.isArray(list) || list.length === 0) {
      throw new RangeError('sentences must be a non-empty array');
    }
    for (const sentence of list) {
      if (sentence === null || typeof sentence !== 'object' || typeof sentence.text !== 'string') {
        throw new TypeError('each sentence needs a string text');
      }
    }
    if (!Number.isInteger(from) || from < 0 || from >= list.length) {
      throw new RangeError('from is out of range');
    }

    const wasActive = active;
    session++;
    active = false;
    activePlay = null;
    gapToken = null;
    pendingAdvance = false;
    abortPending();
    if (wasActive && typeof player.stop === 'function') player.stop();

    sentences = list;
    current = from;
    paused = false;
    notifiedEnd = false;
    requested = new Set();
    clips = new Map();
    active = true;
    pump();
  };

  const pause = () => {
    if (!active || paused) return;
    paused = true;
    if (activePlay && typeof player.pause === 'function') player.pause();
    setState('paused');
  };

  const resume = () => {
    if (!active || !paused) return;
    paused = false;
    if (activePlay) {
      if (typeof player.resume === 'function') player.resume();
      setState('playing');
      return;
    }
    if (pendingAdvance) {
      pendingAdvance = false;
      advanced();
      return;
    }
    pump();
  };

  const stop = () => {
    let inFlight = 0;
    for (const entry of clips.values()) if (entry.status === 'pending') inFlight++;
    let unsent = 0;
    for (let i = current; i < sentences.length; i++) if (!requested.has(i)) unsent++;
    if (!active) return {unsent, inFlight};

    active = false;
    session++;
    activePlay = null;
    gapToken = null;
    pendingAdvance = false;
    abortPending();
    if (typeof player.stop === 'function') player.stop();
    paused = false;
    notifyEnd();
    setState('stopped');
    return {unsent, inFlight};
  };

  const jump = index => {
    if (!Number.isInteger(index) || index < 0 || index >= sentences.length) {
      throw new RangeError('index is out of range');
    }
    if (!active) return;
    activePlay = null;
    gapToken = null;
    pendingAdvance = false;
    if (typeof player.stop === 'function') player.stop();
    current = index;
    pump();
  };

  const setRate = next => {
    if (!SPEEDS.includes(next)) throw new RangeError('unsupported speed');
    rate = next;
    player.setRate(rate);
  };

  return {
    start,
    pause,
    resume,
    stop,
    jump,
    setRate,
    get state() { return state; },
    get index() { return current; },
    get rate() { return rate; },
  };
}
