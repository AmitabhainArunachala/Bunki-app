/** One hidden audio element for universal speech playback.
 *
 * The queue owns ordering; this module owns the single reusable <audio>
 * element so speed changes apply to the clip that is already playing.
 */

const MEDIA_ERR_DECODE = 3, MEDIA_ERR_SRC_NOT_SUPPORTED = 4, HAVE_FUTURE_DATA = 3;
/** N7 fix 4 (the lane proof of 232729f, item 2): how long an element that should sound, and has its data, may keep its time
 * still before the player calls it a stall (looked at every STALL_POLL_MS; held within about 6.4 s). The lead's ruling: 6 s,
 * not 2. WebKit's ordinary restart after a resume keeps the time still for about 1.1 s in the lane, and a real start can be
 * slower (earphones waking, a car, a busy phone); a start held too early shows him "couldn't play" on one that was only slow,
 * often, while a real stall named late costs him a few seconds, rarely. */
export const STALL_MS = 6000, STALL_POLL_MS = 400;
/** N7 fix 1 (the lead's ruling, F1): a clip is forgotten only when the clip itself is bad: it will not decode, or the media
 * element reports a decode or source error. A start the browser refused (NotAllowedError), an interruption, an abort and a
 * pause never forget anything. The one rule for both players of the client: this element (app.mjs queuePlayer) and the
 * card's whole clip through the AudioContext (app.mjs playCardSpeakBytes). */
export function clipBroken(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.name === 'NotSupportedError' || error.name === 'EncodingError') return true;
  return error.name === 'MediaError' && (error.mediaCode === MEDIA_ERR_DECODE || error.mediaCode === MEDIA_ERR_SRC_NOT_SUPPORTED);
}

/** onOutsideStart (N7 fix 3): told after the player paused a start that came from outside, so the page can put the media
 * session's state back to what it holds (WebKit leaves it at 'playing').
 * N7 fix 4 (the lead's finding; ruling: what the app makes, the app takes away): dispose() ends what the player holds,
 * removes every listener it added to the element, takes the element out of the document if this player made it, and after
 * it none of the player's functions does anything. Without it, a study app disposed and mounted again on the same page
 * left its first player listening on the one element: that player's 'play' listener held no clip, took the second
 * player's own start for a start from outside and paused it, so no read played again on that page. (Two players alive at
 * once on one document is not a case of this client: the app makes one, and disposes it before another is made.) */
export function createAudioPlayer(document, {onOutsideStart = null} = {}) {
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('document is required');
  }
  const win = document.defaultView ?? globalThis;
  let audio = document.querySelector('audio[data-speak-audio]');
  const made = !audio;
  if (!audio) {
    audio = document.createElement('audio');
    audio.setAttribute('data-speak-audio', '');
    audio.hidden = true;
    audio.preload = 'auto';
    document.body.append(audio);
  }

  let current = null;
  // N7: what this player itself paused. Fix 1 (the lead's correction): a pause or an AbortError it did not cause comes from
  // outside (the lock screen, Control Center, earphones, a call): it is a pause, not an end. The clip is held where it is
  // with no reason (hooks.held(null)): no line, nothing starts again by itself, and the next resume goes on from there.
  let ownPauses = 0, heldByUs = false;
  // N7 fix 2: a start the player itself makes is its own (its 'play' event); any other start comes from outside. Fix 3b
  // (F2): 'wanted' is whether the player means the element to sound now: set by its own start, cleared by its own pause or
  // stop, by a hold (a pause from outside, a refused start) and by the end. A 'play' while it does is its own. (The
  // platform's play, pause and play in one task fire two 'play' events, and Chromium settles both starts before the second
  // arrives: a flag spent by the first 'play', or by a start's settling, took the second for an outside start and left the
  // read paused in silence under "Pause (P)".)
  let wanted = false;
  // Fix 3b (F2, the lead: a hold, a stop or a new resume that overtakes a pending resume ends that resume's check): only
  // the latest start of the element speaks for the clip. An earlier one that settles late, after a newer start, is no longer
  // the clip's: its refusal is not told, its success is not a new start.
  let latestStart = null;
  let disposed = false, lastUrl = null;  // fix 4: disposed; the object URL this player last gave the element
  // Fix 4 (the lane proof's item 2): in WebKit, the platform's play, pause and play 30 ms apart sometimes left the element
  // playing (not paused, its data there, its 'playing' event fired) with its time frozen: nothing sounded under "Pause (P)"
  // and the read never ended; a seek to the same time did not move it. A start that does not sound is held as rule F3
  // holds a refused one: paused where it is, 'start-refused' (C10), and his next press tries again from the same place.
  // The watch runs only while the player means the element to sound; it is cleared by a pause, a stop, a hold, the end
  // and dispose.
  let stall = null;
  const setTimer = (fn, ms) => (typeof win.setTimeout === 'function' ? win.setTimeout(fn, ms) : globalThis.setTimeout(fn, ms));
  const clearTimer = id => (typeof win.clearTimeout === 'function' ? win.clearTimeout(id) : globalThis.clearTimeout(id));
  const unwatch = () => { if (stall) { try { clearTimer(stall.timer); } catch { /* gone */ } stall = null; } };
  const watch = handle => {
    unwatch();
    if (typeof audio.currentTime !== 'number') return;  // an element with no clock to read is not watched
    // Stillness is counted in looks, not read from a clock: a page whose timers are slowed (hidden) is never called stalled
    // early.
    const mine = {time: audio.currentTime, still: 0, timer: null};
    const check = () => {
      if (stall !== mine) return;
      if (disposed || current !== handle || !wanted || audio.paused || audio.ended) { stall = null; return; }
      const time = audio.currentTime;
      if (time !== mine.time || audio.readyState < HAVE_FUTURE_DATA || audio.seeking) { mine.time = time; mine.still = 0; }
      else mine.still += STALL_POLL_MS;
      if (mine.still < STALL_MS) { mine.timer = setTimer(check, STALL_POLL_MS); return; }
      stall = null;
      ownPauses++; heldByUs = true;
      audio.pause();
      hold(handle, 'start-refused');
    };
    stall = mine;
    mine.timer = setTimer(check, STALL_POLL_MS);
  };

  const cleanup = handle => {
    if (handle.url) {
      try { win.URL.revokeObjectURL(handle.url); } catch { /* already revoked */ }
      handle.url = null;
    }
  };

  const finish = (outcome, error) => {
    const handle = current;
    if (!handle) return;
    current = null;wanted = false;unwatch();
    cleanup(handle);
    if (error) handle.reject(error);
    else handle.resolve(outcome);
  };

  const call = (handle, name, ...args) => { try { handle.hooks?.[name]?.(...args); } catch { /* the caller's hook */ } };
  // N7 fix 1 (F3): a start of the element (a clip's first play(), or a resume) that did not sound. An AbortError after a
  // pause of ours is that pause. A start the browser refused (NotAllowedError, C11) neither ends the clip nor is swallowed:
  // the clip is held where it is and the caller is told why (hooks.held('start-refused')); the next resume tries again
  // from the same place. Fix 3b (F2): a refusal that arrives after a pause of ours (his, or the platform's) is not told:
  // the clip was paused, nothing failed that he still asked for. Any other failure ends the clip (clipBroken tells a bad
  // one). A start that sounds: hooks.started().
  const hold = (handle, reason) => { wanted = false; unwatch(); call(handle, 'held', reason); };
  const startFailed = (handle, error, pausesAtStart) => {
    if (error?.name === 'AbortError') {
      if (ownPauses === pausesAtStart) hold(handle, null);
      return;
    }
    if (error?.name === 'NotAllowedError') { if (ownPauses === pausesAtStart) hold(handle, 'start-refused'); return; }
    finish('error', error);
  };
  const begin = handle => {
    const pausesAtStart = ownPauses, start = {};
    latestStart = start;
    wanted = true;
    let pending;
    try {
      pending = audio.play();
    } catch (error) {
      if (current === handle && latestStart === start) startFailed(handle, error, pausesAtStart);
      return;
    }
    const ours = () => current === handle && latestStart === start;
    Promise.resolve(pending).then(
      () => { if (ours()) { if (wanted) watch(handle); call(handle, 'started'); } },
      error => { if (ours()) startFailed(handle, error, pausesAtStart); },
    );
  };

  // The player's four listeners on the element, kept so dispose() removes exactly these (fix 4).
  const listeners = [
    ['ended', () => finish('ended')],
    // N7 fix 2 (the lead; the same rule as in his other app): a start from outside (the lock screen, earphones), while the
    // clip is paused, his pause or an outside one, or with nothing in flight, is paused again at once: nothing sounds for
    // more than an instant and nothing starts by itself. His own press resumes (begin, a start of its own).
    ['play', () => {
      if (current && wanted) return;
      wanted = false; ownPauses++; heldByUs = true;
      audio.pause();
      try { onOutsideStart?.(); } catch { /* the page's own */ }
    }],
    // The element's own error carries its code (3 decode, 4 source not supported), so clipBroken can tell a bad clip.
    ['error', () => finish('error', Object.assign(new Error('audio-error'), {name: 'MediaError', mediaCode: audio.error?.code ?? null}))],
    // The natural end fires 'pause' before 'ended' (audio.ended); a stale 'pause' of ours after a resume finds it playing.
    ['pause', () => {
      if (current && !heldByUs && !audio.ended && audio.paused) hold(current, null);
    }],
  ];
  for (const [type, listener] of listeners) audio.addEventListener(type, listener);

  return {
    // hooks (optional): started() when the clip sounds; held(reason) when it is held where it is without an end.
    play({ bytes, contentType } = {}, rate = 1, hooks = null) {
      if (disposed) return Promise.resolve('stopped');
      if (!(bytes instanceof Uint8Array)) {
        return Promise.reject(new TypeError('bytes must be a Uint8Array'));
      }
      if (current) finish('stopped');
      let url;
      try {
        url = win.URL.createObjectURL(new win.Blob([bytes], { type: contentType || 'audio/mpeg' }));
      } catch (error) {
        return Promise.reject(error);
      }
      audio.preservesPitch = true;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      audio.src = url;lastUrl = url;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      heldByUs = false;
      // A pause pressed before the clip started sounding rejects this play() with AbortError: that is a pause, not an end
      // (N6 fix round 1, C1); the clip still ends its turn on 'ended' after a resume, or on stop(). An AbortError with no
      // pause of ours since is a pause from outside (fix 1): the clip is held, as for any outside pause.
      return new Promise((resolve, reject) => {
        const handle = { url, resolve, reject, hooks };
        current = handle;
        begin(handle);
      });
    },

    pause() {
      if (disposed) return;
      ownPauses++; heldByUs = true; wanted = false; unwatch();
      audio.pause();
    },

    // Fix 1 (F3): a resume the browser refuses is told (held), not swallowed; an ended or stopped clip has nothing to resume.
    resume() {
      if (disposed) return;
      heldByUs = false;
      if (current) begin(current);
    },

    stop() {
      if (disposed) return;
      ownPauses++; heldByUs = true; wanted = false; unwatch();
      audio.pause();
      finish('stopped');
    },

    setRate(rate) {
      if (disposed) return;
      audio.preservesPitch = true;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
    },

    // Fix 4: what the player holds ends (its clip stops, paused if the element still has it, and its turn ends as
    // 'stopped'); its listeners leave the element; the element leaves the document if this player made it, and an element
    // it only found is left without this player's clip. Afterwards every function does nothing; a play() is a stop.
    dispose() {
      if (disposed) return;
      const mine = lastUrl !== null && audio.src === lastUrl;
      ownPauses++; heldByUs = true; wanted = false; unwatch();
      if (mine) audio.pause();
      finish('stopped');
      disposed = true; latestStart = null;
      for (const [type, listener] of listeners) audio.removeEventListener(type, listener);
      if (mine) { audio.removeAttribute('src'); try { audio.load(); } catch { /* nothing to reset */ } }
      if (made) audio.remove();
    },
  };
}
