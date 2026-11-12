/** The voice seam: everything Bunki says aloud goes through here, one sound at a time.
 *
 * Real voices or silence (John, 2026-11-10). For each sentence:
 *   1. an approved recorded clip, when the surface has one for that sentence;
 *   2. a clip this device has kept (modules/voice-clip-store.mjs, B3): a clip the server made never changes, so a kept
 *      one plays at once, online or offline, and the server is not asked;
 *   3. the voice server (modules/voice-client.mjs), when this device is paired and the server takes the text; a
 *      successful audio answer is kept on the device, an error never;
 *   4. nothing. No other voice stands in: the read ends, silent, and names the reason, so the screen can say it in
 *      plain words (unpaired, offline, out of budget, the server refusing).
 * The store never breaks speech: an error from it is a miss; a wait over 1.5 seconds is a miss and switches the store
 * off for the rest of the page, so no later sentence waits for it.
 * A sentence the server would not take as Japanese is passed over without a word and the read goes on.
 *
 * The contract's error codes each have one behaviour here (speech team's contract v1):
 *   401 authentication-required   the client drops the token; the status says "pair again"
 *   402 budget-exhausted          the server is not asked again (its total budget is used; the server sets the amount)
 *   404 not-in-release            the server is not asked again on this page (its dynamic mode is off)
 *   413 speech-input-too-large    the sentence is split further and its parts are asked for in order
 *   429 day-budget                the server is not asked again until 00:00 UTC
 *   429 request-rate-limit        no request for 60 s
 *   503 voice-unavailable         once more after 2 s (at once while the page is hidden: L1, fix round 1)
 *   400 (client bug), 500         that sentence is not asked twice in the read
 * In every one of these the read ends with the code as its reason.
 *
 * Whether anything may start by itself is the app's rule, not this module's (corridor.js, WORD_VOICE).
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

/** `gapSleep` is the pause between two sentences of a read (the queue's `sleep`); the page gives one that does not wait
 * while it is hidden (modules/reader-pocket.mjs, L1). The one retry after a 503 waits on it too (fix round 1, the
 * review's F2: hidden, the retry goes at once; shown, after 2 s as before). Without it the seam's own `sleep` is both.
 * `after(ms, run)` is the clock of the device store's wait (storeWaitMs); the page gives one that a hidden page's held
 * timers cannot hold (reader-pocket.mjs, pageTimer); it returns a cancel. */
export function createVoiceSeam({ client, player, recorded = null, store = null, storeWaitMs = 1500, quiet = () => {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), gapSleep = null, now = () => Date.now(),
  after = (ms, run) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer); },
  online = () => globalThis.navigator?.onLine !== false, onStatus = () => {} } = {}) {
  if (!client || !player) throw new TypeError('the seam needs a client and a player');
  const cache = new Map();   // `${voiceKey}|${text}` → clip, most recent last (this page's own; the device store is below)
  let session = null;        // the one read that may sound
  let last = { source: 'none', reason: null, at: 0 };   // the last sentence that was spoken
  let silent = null;         // { reason, at }: why the last read ended without a voice; cleared by the next spoken sentence
  let blockedUntil = { 'day-budget': 0, 'request-rate-limit': 0, 'network-failed': 0 };
  let off = null;            // 'not-in-release' | 'budget-exhausted' for this page
  let pairAgain = false;
  let budget = null;
  let limits = null;         // { dayCapCents?, capCents? } a refusal named in its own words
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
    // a 401 the seam saw, or one the client saw on a request nobody waited for (the combine's I13)
    pairAgain: (pairAgain || !!client.ended?.()) && !client.paired(),
    installation: client.scope()?.installation || null,
    durable: typeof client.durable === 'function' ? !!client.durable() : true,
    blocked: blocked(),
    last: { ...last },
    silent: silent ? { ...silent } : null,
    budget: budget ? { ...budget } : null,
    limits: limits ? { ...limits } : null,
  });
  const tell = () => { try { onStatus(status()); } catch { /* a listener's own fault */ } };

  /** Why the server is not asked right now, or null when it may be. */
  function serverSkips(voiceKey) {
    if (!client.configured() || !client.paired()) return 'not-paired';
    if (!isVoiceKey(voiceKey)) return 'not-speakable';
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
    else if (code === 'day-budget') {
      blockedUntil['day-budget'] = (Math.floor(at / DAY) + 1) * DAY;
      // the line that says so names the server's own day ceiling: its figures are read (free) when it refuses
      void refreshBudget();
    }
    else if (code === 'request-rate-limit') blockedUntil['request-rate-limit'] = at + 60000;
    else if (code === 'network-failed' || code === 'voice-timeout') blockedUntil['network-failed'] = at + 15000;
  }
  const remember = (key, clip) => {
    cache.delete(key);
    cache.set(key, clip);
    while (cache.size > CACHE_CLIPS) cache.delete(cache.keys().next().value);
  };
  const abortError = () => { const error = new Error('aborted'); error.name = 'AbortError'; return error; };
  const aborted = (signal) => { if (signal?.aborted) throw abortError(); };
  /** No voice for this sentence: the read ends, and `code` is the reason the screen will give. */
  const silence = (code) => Object.assign(new Error(code), { code });
  /** A store's fault is never the read's: what it throws is swallowed. */
  const quietly = (work) => { try { const out = work(); if (out && typeof out.catch === 'function') out.catch(() => {}); } catch { /* the store's own */ } };

  // a store that once did not answer in time is off for the rest of this page: no later sentence waits for it
  let storeOff = false;
  const storeOn = () => !!store && !storeOff;
  /** The clip this device keeps for `key`, asked before the server, online or offline: this page's memory first, then
   * the device store. A store that fails is a miss; one that does not answer within storeWaitMs is a miss, and is then
   * switched off for the page. */
  async function keptClip(key, signal) {
    const near = cache.get(key);
    if (near) { remember(key, near); if (storeOn()) quietly(() => store.touch?.(key)); return near; }
    if (!storeOn()) return null;
    let cancel = null;
    let clip = null;
    try {
      clip = await Promise.race([
        Promise.resolve().then(() => store.get(key)),
        new Promise((resolve) => { cancel = after(storeWaitMs, () => { storeOff = true; resolve(null); }); }),
      ]);
    } catch { clip = null; } finally { cancel?.(); }
    aborted(signal);
    if (!(clip?.bytes instanceof Uint8Array) || !clip.bytes.length) return null;
    const kept = { bytes: clip.bytes, contentType: clip.contentType || 'audio/mpeg', voiceId: clip.voiceId ?? null, inputKey: null, source: 'server', kept: true, key };
    remember(key, kept);
    return kept;
  }

  async function fromServer(text, voiceKey, signal) {
    const key = `${voiceKey}|${text}`;
    const kept = cache.get(key);
    if (kept) return kept;
    let clip;
    try {
      clip = await client.speak({ text, voiceKey, signal });
    } catch (error) {
      if (error?.code !== 'voice-unavailable') throw error;
      // once more, after 2 s; on the page's gap, so a hidden page asks again at once instead of waiting on a held timer
      await (gapSleep || sleep)(2000);
      aborted(signal);
      clip = await client.speak({ text, voiceKey, signal });
    }
    const served = { ...clip, source: 'server', key };
    remember(key, served);
    // only a successful audio answer reaches here (the client throws every error): it is kept on the device
    if (storeOn()) quietly(() => store.put(key, served));
    return served;
  }
  async function splitFurther(text, voiceKey, signal) {
    const half = Math.max(1, Math.ceil([...text].length / 2));
    const pieces = splitSentences(text, { max: Math.min(200, half) });
    if (pieces.length < 2) throw silence('speech-input-too-large');
    const parts = [];
    for (const piece of pieces) { aborted(signal); parts.push(await fromServer(piece.text, voiceKey, signal)); }
    return { parts, source: 'server' };
  }
  async function serverClip(text, voiceKey, signal) {
    try {
      return await fromServer(text, voiceKey, signal);
    } catch (error) {
      if (error?.code !== 'speech-input-too-large') throw error;
      return splitFurther(text, voiceKey, signal);
    }
  }

  /* A sentence on its way to the server is one request, whoever asks for it while it travels (the re-check's R1, fr2).
   * Each asker waits for it, leaves it (its read stopped: a request nobody waits for and nobody kept is aborted, as
   * before) or gives it up (its read was cut by the ear's own time limit: the request runs on, and its clip is kept so
   * the next ask plays at once, the review's K3). Asking again while it travels joins it: never a second request.
   * A request its only asker gave up on belongs to nobody: however it ends, nothing is recorded against the server,
   * nothing is told and nothing else is paused. While anyone waits, its end is theirs, as it always was: a refusal is
   * recorded once and each asker's read ends with it. One end is not the joiner's: the time a request ran out of, or the
   * connection it lost, was its sender's; when the sender no longer waits, whoever joined it asks once on its own, now
   * that the first is over, and that request's end is theirs (otherwise the ear's lost request ends the read that
   * reached its sentence: John, 2026-11-11, only pause stops a read). */
  const flights = new Map();   // `${voiceKey}|${text}` → { key, askers, sender, kept, stop }
  const ON_THE_WAY = new Set(['voice-timeout', 'network-failed']);
  function launch(key, text, voiceKey) {
    const flight = { key, askers: new Set(), sender: null, kept: false, stop: new AbortController() };
    flights.set(key, flight);
    serverClip(text, voiceKey, flight.stop.signal).then(
      (clip) => land(flight, { clip }),
      (error) => land(flight, error?.name === 'AbortError' ? { aborted: true }
        : { code: typeof error?.code === 'string' ? error.code : 'speak-failed', figures: error?.figures }));
    return flight;
  }
  function join(flight, signal, owner) {
    return new Promise((resolve, reject) => {
      const asker = { resolve };
      flight.sender ||= asker;
      flight.askers.add(asker);
      const leave = () => {
        if (!flight.askers.delete(asker)) return;
        if (owner.keep) flight.kept = true;
        else if (!flight.askers.size && !flight.kept) {
          if (flights.get(flight.key) === flight) flights.delete(flight.key);
          flight.stop.abort();
        }
        reject(abortError());
      };
      if (signal?.aborted) leave(); else signal?.addEventListener('abort', leave, { once: true });
    });
  }
  function land(flight, outcome) {
    if (flights.get(flight.key) === flight) flights.delete(flight.key);
    const waiting = [...flight.askers];
    flight.askers.clear();
    if (outcome.clip || !waiting.length) { for (const asker of waiting) asker.resolve(outcome); return; }
    if (outcome.aborted || (ON_THE_WAY.has(outcome.code) && !waiting.includes(flight.sender))) {
      for (const asker of waiting) asker.resolve({ again: true });
      return;
    }
    // a ceiling the refusal names in its own words is kept beside the budget (the server's figure, never Bunki's)
    const figures = outcome.figures && typeof outcome.figures === 'object' ? outcome.figures : {};
    for (const name of ['dayCapCents', 'capCents']) if (Number.isSafeInteger(figures[name])) limits = { ...(limits || {}), [name]: figures[name] };
    note(outcome.code);
    tell();
    for (const asker of waiting) asker.resolve(outcome);
  }

  /** The clip for one sentence: its recording, or the server's clip; otherwise the read ends with the reason. */
  async function clipFor(sentence, voiceKey, signal, owner) {
    if (sentence.recorded && typeof recorded === 'function') return { recorded: sentence.recorded, source: 'recorded' };
    let text = '';
    try { text = normaliseSpeechText(sentence.text); } catch { /* not text */ }
    // what the server would refuse as not Japanese (a line of Latin letters in an article) is passed over, never sent
    if (!text || !isJapaneseEnough(text)) return { skip: true, source: 'none', reason: 'not-japanese' };
    const key = `${voiceKey}|${text}`;
    // a clip this device has kept plays at once, with no request, online or offline (B3): this page's memory, then the store
    const kept = await keptClip(key, signal);
    if (kept) return kept;
    for (;;) {
      aborted(signal);
      // a sentence this page already holds never needs the server: a block on the server (a refusal of another turn a
      // moment ago, the minute's limit) does not silence it (the review's B3: a refusal belongs to the turn refused)
      const near = cache.get(key);
      if (near) return near;
      const why = serverSkips(voiceKey);
      if (why) throw silence(why);
      const answer = await join(flights.get(key) || launch(key, text, voiceKey), signal, owner);
      if (answer.clip) return answer.clip;
      if (!answer.again) throw silence(answer.code);
    }
  }

  const said = (clip) => {
    last = { source: clip.source || 'none', reason: null, at: now() };
    silent = null;
    tell();
  };
  /** Another lane stopped the recording this read was on (the app's own stop): the read ends with it, so it never
   * stands "playing" with nothing to hear. */
  const endedFromOutside = (owner) => { Promise.resolve().then(() => { if (!owner.ended) owner.queue.stop(); }); };
  async function playOne(clip, rate, owner) {
    if (clip.skip) return 'ended';
    playing = clip;
    said(clip);
    // the read learns where this sentence comes from as it starts (onSentence comes first and does not know yet)
    try { owner.onSource?.(clip.source || 'none', null); } catch { /* a listener's own fault */ }
    if (clip.recorded) {
      const stops = owner.recordedStops;
      const outcome = await recorded(clip.recorded.src, rate);
      if (outcome === true) return 'ended';
      // paused by nobody in this app (a call, another app, the lock screen), or a start the browser would not allow (a
      // locked phone may refuse a new element: fix round 1, as for a server clip): the read holds at this sentence and
      // says it again on play; nothing takes it up by itself (L1, John: only pause stops a read, and a pause is a pause)
      if (outcome === 'paused') { owner.queue.pause(); return 'stopped'; }
      if (outcome === null) { if (owner.recordedStops === stops) endedFromOutside(owner); return 'stopped'; }
      throw new Error('audio-error');
    }
    try { return await player.play(clip, rate); } catch (error) {
      if (error?.name === 'AbortError') return 'stopped';
      // a clip the player could not play (a media error, or WebKit's play() refusing its source) is kept no longer, in this
      // page or on the device: the next ask goes to the server again (the combine's review). A play the browser does not
      // allow yet (no tap: NotAllowedError) is not the clip's fault, and it stays. The read ends; its reason is the
      // queue's 'decode', whose line says the clip could not play (voice-layer.mjs), not that the server could not say it.
      // (During the article's read a NotAllowedError never comes here: the page's player makes it a pause, L1.)
      if (error?.name !== 'NotAllowedError' && clip.key) forget(clip);
      throw error;
    }
  }
  /** A clip that would not play leaves this page's memory and the device's store. */
  function forget(clip) {
    if (cache.get(clip.key) === clip) cache.delete(clip.key);
    if (store) quietly(() => store.drop?.(clip.key));
  }
  /** The player the queue drives: one clip may be a recorded file, a server clip, or the parts of a split sentence. */
  const composite = (owner) => ({
    async play(clip, rate) {
      if (!clip.parts) return playOne(clip, rate, owner);
      for (const part of clip.parts) {
        const outcome = await playOne(part, owner.queue.rate, owner);
        if (outcome !== 'ended') return outcome;
      }
      return 'ended';
    },
    // a recorded clip cannot be held mid-word: a pause ends it and resume says the sentence again
    pause() {
      if (playing?.recorded) { owner.recordedStops += 1; owner.stopRecorded?.(); }
      else player.pause?.();
    },
    resume() { if (playing && !playing.recorded) player.resume?.(); },
    stop() { owner.recordedStops += 1; owner.stopRecorded?.(); player.stop?.(); playing = null; },
    setRate(rate) { player.setRate?.(rate); owner.rateRecorded?.(rate); },
  });

  /** Read sentences aloud. `sentences` is [{ text, recorded? }]; one read at a time: this one ends whatever was speaking.
   * `onSentence(index)` says which sentence starts; `onSource(source)` then says where it comes from ('recorded' or
   * 'server'). A read that cannot be voiced ends with onState('error', reason). Returns the read's own controls. */
  function read({ sentences, voiceKey, from = 0, rate = 1, prefetch = 2, gapMs = 260, onSentence = () => {}, onState = () => {},
    onSource = null, stopRecorded = null, rateRecorded = null } = {}) {
    stop();
    try { quiet(); } catch { /* another lane's fault */ }
    // the queue gives up a sentence still on its way when the read ends (`keep`: after cut(), see join above)
    const owner = { queue: null, stopRecorded, rateRecorded, onSource, ended: false, recordedStops: 0, keep: false };
    const queue = createSpeechQueue({
      fetchClip: (sentence, _index, signal) => clipFor(sentence, voiceKey, signal, owner),
      player: composite(owner),
      prefetch, gapMs, sleep: gapSleep || sleep,
      onSentence: (index) => { if (session === owner || index < 0) onSentence(index); },
      onState: (state, code) => {
        if (['done', 'stopped', 'error'].includes(state)) { owner.ended = true; if (session === owner) session = null; }
        if (state === 'error') { silent = { reason: code || 'speak-failed', at: now() }; tell(); }
        onState(state, code);
      },
    });
    owner.queue = queue;
    const controls = {
      pause: () => queue.pause(),
      resume: () => queue.resume(),
      stop: () => { queue.stop(); },
      /** The read ends now, as stop() does, but a sentence already asked of the server is still received and kept, so
       * asking for it again plays at once (the ear's own time limit, the review's K3); if nobody else asks for it, its
       * end, whatever it is, is nobody's (the re-check's R1). */
      cut: () => { owner.keep = true; queue.stop(); },
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
    /** Why a sentence could not be voiced right now ('not-paired', 'offline', 'day-budget', …), or null when the
     * server may be asked. Asking is free: a read that would start by itself looks here first, and when there is no
     * voice to be had it does not start, so it stops no other sound. Given the sentence's `text`, a clip this device
     * keeps for it is a voice to be had, with or without the server. */
    cannot: (voiceKey = 'word:bunki', text = null) => {
      const why = serverSkips(voiceKey);
      if (!why || text == null) return why;
      let normal = '';
      try { normal = normaliseSpeechText(String(text)); } catch { /* not text */ }
      const key = `${voiceKey}|${normal}`;
      let kept = false;
      try { kept = !!normal && (cache.has(key) || (storeOn() && !!store.has?.(key))); } catch { kept = false; }
      return kept ? null : why;
    },
    active: () => (session && !session.ended ? session.controls : null),
    /** Pairing changed (paired, or the token was dropped): what was blocked is asked again. */
    repaired() { pairAgain = false; off = null; silent = null; blockedUntil = { 'day-budget': 0, 'request-rate-limit': 0, 'network-failed': 0 }; tell(); },
  };
}
