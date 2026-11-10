/** The voice seam: everything Bunki says aloud goes through here, one sound at a time.
 *
 * Source order for each sentence (speech team's contract v1, 2026-11-10):
 *   1. an approved recorded clip, when the surface has one for that sentence;
 *   2. the voice server (modules/voice-client.mjs), when this device is paired and the server takes the text;
 *   3. the device's own Japanese voice: unpaired, offline, out of budget, or the server refusing.
 *
 * The contract's error codes each have one behaviour here:
 *   401 authentication-required   the client drops the token; device voice; the status says "pair again"
 *   402 budget-exhausted          device voice from then on (the $25 total is used)
 *   404 not-in-release            device voice from then on (the server's dynamic mode is off)
 *   413 speech-input-too-large    the sentence is split further and its parts are asked for in order
 *   429 day-budget                device voice until 00:00 UTC
 *   429 request-rate-limit        no request for 60 s; device voice meanwhile
 *   503 voice-unavailable         once more after 2 s, then device voice for that sentence
 *   400 (client bug), 500         device voice for that sentence; never asked twice
 *
 * The queue, the gap between sentences, the two-ahead fetch and the three speeds are the speech team's own
 * (./nihongo-speech/audio/speech-queue.mjs, unchanged). Nothing here touches the DOM. */
import { SPEEDS, createSpeechQueue } from './nihongo-speech/audio/speech-queue.mjs';
import { isJapaneseEnough, isVoiceKey, normaliseSpeechText, splitSentences } from './nihongo-speech/audio/speech-text.mjs';

export { SPEEDS };
const DAY = 24 * 3600 * 1000;
const CACHE_CLIPS = 64;
const KINDS = new Set(['article', 'conv', 'word']);

/** A voice key the server accepts: kind `article`, `conv` or `word`, and an id without spaces or control characters,
 * at most 120 code points. One key keeps one narrator. */
export function voiceKeyOf(kind, id) {
  const cleaned = [...String(id ?? '').normalize('NFC').replace(/[\s\p{Cc}]+/gu, '')].slice(0, 120).join('') || 'bunki';
  const key = `${KINDS.has(kind) ? kind : 'word'}:${cleaned}`;
  return isVoiceKey(key) ? key : 'word:bunki';
}

/** Text as sentences the server takes: canonical form, at most 400 code points each. */
export function sentencesOf(text) {
  try { return splitSentences(normaliseSpeechText(String(text ?? ''))).map((piece) => ({ text: piece.text })); } catch { return []; }
}

export function createVoiceSeam({ client, device, player, recorded = null, quiet = () => {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now(),
  online = () => globalThis.navigator?.onLine !== false, onStatus = () => {} } = {}) {
  if (!client || !device || !player) throw new TypeError('the seam needs a client, a device voice and a player');
  const cache = new Map();   // `${voiceKey}|${text}` → clip, most recent last
  let session = null;        // the one read that may sound
  let last = { source: 'none', reason: null, at: 0 };
  let blockedUntil = { 'day-budget': 0, 'request-rate-limit': 0, 'network-failed': 0 };
  let off = null;            // 'not-in-release' | 'budget-exhausted' for this page
  let pairAgain = false;
  let budget = null;
  let deviceStop = null;     // settles the device utterance that is speaking
  let playing = null;        // the clip the player is on

  const blocked = () => {
    if (off) return off;
    const at = now();
    for (const [code, until] of Object.entries(blockedUntil)) if (until > at) return code === 'network-failed' ? null : code;
    return null;
  };
  const status = () => ({
    configured: !!client.configured(),
    paired: !!client.paired(),
    pairAgain: pairAgain && !client.paired(),
    installation: client.scope()?.installation || null,
    durable: typeof client.durable === 'function' ? !!client.durable() : true,
    blocked: blocked(),
    last: { ...last },
    budget: budget ? { ...budget } : null,
  });
  const tell = () => { try { onStatus(status()); } catch { /* a listener's own fault */ } };

  /** Why the server is not asked for this sentence right now, or null when it may be. */
  function serverSkips(text, voiceKey) {
    if (!client.configured()) return 'not-configured';
    if (!client.paired()) return 'not-paired';
    if (!isVoiceKey(voiceKey) || !isJapaneseEnough(text)) return 'not-japanese';
    if (off) return off;
    const at = now();
    for (const [code, until] of Object.entries(blockedUntil)) if (until > at) return code;
    if (!online()) return 'offline';
    return null;
  }
  /** What a refusal means for the sentences after it. */
  function note(code) {
    const at = now();
    if (code === 'authentication-required') pairAgain = true;
    else if (code === 'budget-exhausted' || code === 'not-in-release') off = code;
    else if (code === 'day-budget') blockedUntil['day-budget'] = (Math.floor(at / DAY) + 1) * DAY;
    else if (code === 'request-rate-limit') blockedUntil['request-rate-limit'] = at + 60000;
    else if (code === 'network-failed' || code === 'voice-timeout') blockedUntil['network-failed'] = at + 15000;
  }
  const remember = (key, clip) => {
    cache.delete(key);
    cache.set(key, clip);
    while (cache.size > CACHE_CLIPS) cache.delete(cache.keys().next().value);
  };
  const aborted = (signal) => { if (signal?.aborted) { const error = new Error('aborted'); error.name = 'AbortError'; throw error; } };

  async function fromServer(text, voiceKey, signal) {
    const key = `${voiceKey}|${text}`;
    const kept = cache.get(key);
    if (kept) return kept;
    let clip;
    try {
      clip = await client.speak({ text, voiceKey, signal });
    } catch (error) {
      if (error?.code !== 'voice-unavailable') throw error;
      await sleep(2000);
      aborted(signal);
      clip = await client.speak({ text, voiceKey, signal });
    }
    const served = { ...clip, source: 'server' };
    remember(key, served);
    return served;
  }
  async function splitFurther(text, voiceKey, signal) {
    const half = Math.max(1, Math.ceil([...text].length / 2));
    const pieces = splitSentences(text, { max: Math.min(200, half) });
    if (pieces.length < 2) throw Object.assign(new Error('speech-input-too-large'), { code: 'speech-input-too-large' });
    const parts = [];
    for (const piece of pieces) { aborted(signal); parts.push(await fromServer(piece.text, voiceKey, signal)); }
    return { parts, source: 'server' };
  }
  /** The clip for one sentence, from the first source that has one. */
  async function clipFor(sentence, voiceKey, signal) {
    if (sentence.recorded && typeof recorded === 'function') return { recorded: sentence.recorded, source: 'recorded' };
    let text = '';
    try { text = normaliseSpeechText(sentence.text); } catch { /* not text */ }
    let why = serverSkips(text, voiceKey);
    if (!why) {
      try {
        return await fromServer(text, voiceKey, signal);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        why = typeof error?.code === 'string' ? error.code : 'speak-failed';
        if (why === 'speech-input-too-large') {
          try { return await splitFurther(text, voiceKey, signal); } catch (again) {
            if (again?.name === 'AbortError') throw again;
            why = typeof again?.code === 'string' ? again.code : 'speak-failed';
          }
        }
        note(why);
        tell();
      }
    }
    if (!device.support()?.ok || !text) throw Object.assign(new Error('no-voice'), { code: 'no-voice', reason: why });
    return { device: true, text, source: 'device', reason: why };
  }

  const said = (clip) => {
    last = { source: clip.source || 'none', reason: clip.reason || null, at: now() };
    tell();
  };
  // The seam's own stop settles the utterance first, so the device's cancel finds nothing left to report.
  const stopDevice = () => { const settle = deviceStop; deviceStop = null; settle?.('stopped'); device.cancel(); };
  /** Another lane silenced the sound this read was on (a card retired, a recording stopped): the read ends with it,
   * so it never stands "playing" with nothing to hear. */
  const endedFromOutside = (owner) => { Promise.resolve().then(() => { if (!owner.ended) owner.queue.stop(); }); };
  function sayOnDevice(clip, rate, owner) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (outcome) => { if (settled) return; settled = true; if (deviceStop === settle) deviceStop = null; resolve(outcome); };
      const answer = device.fallback(clip.text, { rate, onEnd: () => settle('ended'),
        onStop: () => { if (settled) return; settle('stopped'); endedFromOutside(owner); },
        onError: () => { if (settled) return; settled = true; if (deviceStop === settle) deviceStop = null; reject(new Error('device-voice-failed')); } });
      if (!answer?.spoken) { settled = true; reject(Object.assign(new Error('no-voice'), { code: 'no-voice' })); return; }
      if (!settled) deviceStop = settle;
    });
  }
  async function playOne(clip, rate, owner) {
    playing = clip;
    said(clip);
    if (clip.recorded) {
      const stops = owner.recordedStops;
      const outcome = await recorded(clip.recorded.src, rate);
      if (outcome === true) return 'ended';
      if (outcome === null) { if (owner.recordedStops === stops) endedFromOutside(owner); return 'stopped'; }
      throw new Error('audio-error');
    }
    if (clip.device) return sayOnDevice(clip, rate, owner);
    try { return await player.play(clip, rate); } catch (error) { if (error?.name === 'AbortError') return 'stopped'; throw error; }
  }
  /** The player the queue drives: one clip may be a recorded file, a server clip, its parts, or a device utterance. */
  const composite = (owner) => ({
    async play(clip, rate) {
      if (!clip.parts) return playOne(clip, rate, owner);
      for (const part of clip.parts) {
        const outcome = await playOne(part, owner.queue.rate, owner);
        if (outcome !== 'ended') return outcome;
      }
      return 'ended';
    },
    // a recorded clip and a device utterance cannot be held mid-word: a pause ends them and resume says the sentence again
    pause() {
      if (playing?.device) stopDevice();
      else if (playing?.recorded) { owner.recordedStops += 1; owner.stopRecorded?.(); }
      else player.pause?.();
    },
    resume() { if (playing && !playing.device && !playing.recorded) player.resume?.(); },
    stop() { stopDevice(); owner.recordedStops += 1; owner.stopRecorded?.(); player.stop?.(); playing = null; },
    setRate(rate) { player.setRate?.(rate); owner.rateRecorded?.(rate); },
  });

  /** Read sentences aloud. `sentences` is [{ text, recorded? }]; one read at a time: this one ends whatever was speaking.
   * Returns the read's own controls. */
  function read({ sentences, voiceKey, from = 0, rate = 1, prefetch = 2, gapMs = 260, onSentence = () => {}, onState = () => {},
    stopRecorded = null, rateRecorded = null } = {}) {
    stop();
    try { quiet(); } catch { /* another lane's fault */ }
    const owner = { queue: null, stopRecorded, rateRecorded, ended: false, recordedStops: 0 };
    const queue = createSpeechQueue({
      fetchClip: (sentence, _index, signal) => clipFor(sentence, voiceKey, signal),
      player: composite(owner),
      prefetch, gapMs, sleep,
      onSentence: (index) => { if (session === owner || index < 0) onSentence(index); },
      onState: (state, code) => {
        if (['done', 'stopped', 'error'].includes(state)) { owner.ended = true; if (session === owner) session = null; }
        onState(state, code);
      },
    });
    owner.queue = queue;
    const controls = {
      pause: () => queue.pause(),
      resume: () => queue.resume(),
      stop: () => { queue.stop(); },
      jump: (index) => { if (!owner.ended) queue.jump(index); },
      setRate: (next) => queue.setRate(next),
      get state() { return queue.state; },
      get index() { return queue.index; },
      get rate() { return queue.rate; },
      get ended() { return owner.ended; },
    };
    owner.controls = controls;
    session = owner;
    if (!Array.isArray(sentences) || !sentences.length) { owner.ended = true; session = null; onState('error', 'nothing-to-say'); return controls; }
    queue.setRate(SPEEDS.includes(rate) ? rate : 1);
    queue.start(sentences, Math.min(Math.max(0, from | 0), sentences.length - 1));
    return controls;
  }
  function stop() {
    const owner = session;
    session = null;
    if (owner && !owner.ended) owner.queue.stop();
  }
  async function refreshBudget() {
    try {
      await client.ready();
      if (!client.configured() || !client.paired()) { budget = null; return null; }
      budget = await client.budget();
      if (off === 'budget-exhausted' && budget.remainingCents > 0) off = null;
    } catch (error) {
      if (error?.code === 'authentication-required') pairAgain = true;
      budget = null;
    }
    tell();
    return budget;
  }
  return {
    read, stop, status, refreshBudget,
    active: () => (session && !session.ended ? session.controls : null),
    /** Pairing changed (paired, or the token was dropped): what was blocked is asked again. */
    repaired() { pairAgain = false; off = null; blockedUntil = { 'day-budget': 0, 'request-rate-limit': 0, 'network-failed': 0 }; tell(); },
  };
}
