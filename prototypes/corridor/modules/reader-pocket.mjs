/** An article read in his pocket (package L1 of the speech lane, 2026-11-12). The plan: "An article plays through with
 * the screen locked. Done when: your iPhone, in your pocket, reads an article to the end." John: "when i hit play, the
 * only thing that should stop that is hitting the pause button itself."
 *
 * Three small pieces the voice layer (voice-layer.mjs) puts around the article reader, each with plain inputs:
 *  - gapSleep: the pause between two sentences. A hidden page's timers are slowed or stopped, so while the page is
 *    hidden there is no pause at all: the next sentence starts from the end of the one before. Shown, it is as before.
 *  - createPocketPlayer: the one audio element as the seam drives it, plus what the reader needs from it. A pause this
 *    app did not ask for (a call, another app's sound, the lock screen's own button, headphones taken out) is told, so
 *    the read is paused there and the bar and the lock screen say so; a resume the browser refuses is told the same way,
 *    and so is a next clip it will not let start (for the article's read only: refusalIsPause).
 *    While a read waits for its next clip on a hidden page, the element plays silence in a loop (hold), so the page is
 *    still playing sound when the clip comes; it lets go when the clip plays, when he pauses and when the read ends.
 *  - createReaderMediaSession: the lock screen. The article's title, "Bunki", the app's icon; play, pause, next and
 *    previous sentence; its state follows the read; cleared when the read ends or is stopped. Where the interface does
 *    not exist, nothing happens.
 * Nothing here decides when a read ends: that stays the reader's (voice-layer.mjs) and the seam's (voice-seam.mjs). */

/** The pause between two sentences of a read, for the queue (`sleep(ms)`): a timer while the page is shown; none while
 * it is hidden; and a pause under way when the page is hidden ends then, so it never waits on a stopped timer. */
export function gapSleep(doc, view = doc.defaultView) {
  return (ms) => new Promise((resolve) => {
    if (doc.hidden || !(ms > 0)) { resolve(); return; }
    let timer = 0;
    const end = () => { view.clearTimeout(timer); doc.removeEventListener('visibilitychange', onHide); resolve(); };
    const onHide = () => { if (doc.hidden) end(); };
    doc.addEventListener('visibilitychange', onHide);
    timer = view.setTimeout(end, ms);
  });
}

/** The page's clock for a deadline in the path to the next sentence (the client's 20 s, the device store's 1.5 s):
 * `after(ms, run)` runs `run` once `ms` have passed by the wall clock and returns a cancel. A timer stands as before; and
 * because a hidden page's timers may be held (L1-2), the clock is also read at every tick of the element that is sounding
 * (`timeupdate`: a clip, or the silence a waiting read holds) and at every change of visibility, so a held timer cannot
 * leave a read waiting without end (fix round 1, the review's F2). */
export function pageTimer({ doc, ticks = null, view = doc.defaultView, now = () => Date.now() }) {
  return (ms, run) => {
    const until = now() + ms;
    let over = false;
    let timer = 0;
    const off = () => {
      over = true;
      view.clearTimeout(timer);
      ticks?.removeEventListener?.('timeupdate', check);
      doc.removeEventListener('visibilitychange', check);
    };
    const fire = () => { if (over) return; off(); run(); };
    function check() { if (!over && now() >= until) fire(); }
    ticks?.addEventListener?.('timeupdate', check);
    doc.addEventListener('visibilitychange', check);
    timer = view.setTimeout(fire, ms);
    return off;
  };
}

/** `player` is the speech team's player on `audio` (speech-player.mjs, unchanged); `silence()` gives the address of a
 * short silent clip. `refusalIsPause()` says whether the read now playing takes a clip the browser will not let sound
 * (a locked phone may refuse a new start) as a pause from outside, held at its sentence; otherwise that clip fails as
 * before. `heldPaused()` says whether his read is paused now: the element started by nobody in this app meanwhile (an
 * interruption that ends, a headset button) is paused again at once, so the sound never disagrees with the bar and the
 * lock screen (fix round 1). Returns { player, hold, letGo, holding, onOutsidePause }: `player` is what the seam drives. */
export function createPocketPlayer({ player, audio, silence, refusalIsPause = () => false, heldPaused = () => false }) {
  // what this app last asked of the element: a clip to play, silence to hold, or nothing sounding
  let intent = 'still';
  let serial = 0;
  let keeping = false;
  const listeners = new Set();
  const tell = () => { for (const listener of listeners) { try { listener(); } catch { /* a listener's own fault */ } } };
  const unkeep = () => { if (!keeping) return; keeping = false; try { audio.loop = false; } catch { /* nothing to undo */ } };
  // the browser tells a pause a moment after it happened: by then a pause this app asked for has changed the intent,
  // a clip that reached its end is ended, and a new clip has the element playing again
  audio?.addEventListener?.('pause', () => {
    if ((intent !== 'play' && intent !== 'keep') || !audio.paused || audio.ended) return;
    intent = 'still';
    unkeep();
    tell();
  });
  // a start this app did not ask for while his read is paused: his pause wins, and the element is paused again at once
  // (its own pause is then not told: nothing in this app asked it to play)
  audio?.addEventListener?.('play', () => {
    if (intent !== 'still' || audio.paused || !heldPaused()) return;
    try { audio.pause(); } catch { /* already still */ }
  });
  const settled = (mine) => () => { if (serial === mine && intent === 'play') intent = 'still'; };
  return {
    player: {
      play(clip, rate) {
        unkeep();
        intent = 'play';
        const mine = ++serial;
        const pending = Promise.resolve(player.play(clip, rate)).catch((error) => {
          if (error?.name !== 'NotAllowedError' || serial !== mine || !refusalIsPause()) throw error;
          // told first, so the read is paused while this clip is still its own; the clip ends as stopped, and play says
          // its sentence again
          intent = 'still';
          tell();
          return 'stopped';
        });
        pending.then(settled(mine), settled(mine));
        return pending;
      },
      pause() { intent = 'still'; unkeep(); player.pause?.(); },
      // as the speech team's resume, and a refusal is told: the read must not say "playing" with nothing to hear
      resume() {
        intent = 'play';
        const refused = () => { if (intent === 'play' && audio.paused) { intent = 'still'; tell(); } };
        try { Promise.resolve(audio.play()).catch(refused); } catch { refused(); }
      },
      stop() { intent = 'still'; unkeep(); player.stop?.(); },
      setRate(rate) { player.setRate?.(rate); },
    },
    /** A read waits for its next clip on a hidden page: the element plays silence in a loop until the clip comes. */
    hold() {
      if (keeping || !audio) return;
      keeping = true;
      intent = 'keep';
      try {
        audio.loop = true;
        audio.src = silence();
        Promise.resolve(audio.play()).catch(() => { if (keeping) { unkeep(); intent = 'still'; } });
      } catch { unkeep(); intent = 'still'; }
    },
    /** The wait ended without a clip (paused, stopped, ended, shown again): the silence stops. A clip is never touched. */
    letGo() {
      if (!keeping) return;
      unkeep();
      intent = 'still';
      try { audio.pause(); } catch { /* already still */ }
    },
    holding: () => keeping,
    onOutsidePause(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

const ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack'];
/** The lock screen's view of the article read. `show({ title, playing, actions })` while a read exists (playing or
 * paused): the metadata when the title changes, the four handlers once, the state every time. `clear()` when it ends. */
export function createReaderMediaSession({ navigator: nav, MediaMetadata: Metadata, artwork = [] } = {}) {
  const session = nav?.mediaSession;
  const works = !!session && typeof session.setActionHandler === 'function';
  let title = null;
  let armed = false;
  const handle = (action, run) => { try { session.setActionHandler(action, run); } catch { /* this browser does not take that action */ } };
  return {
    show({ title: next = '', playing = false, actions = {} } = {}) {
      if (!works) return;
      if (next !== title) {
        title = next;
        try { session.metadata = typeof Metadata === 'function' ? new Metadata({ title: next || 'Bunki', artist: 'Bunki', artwork }) : null; } catch { /* no metadata here */ }
      }
      if (!armed) {
        armed = true;
        for (const action of ACTIONS) handle(action, typeof actions[action] === 'function' ? () => actions[action]() : null);
      }
      try { session.playbackState = playing ? 'playing' : 'paused'; } catch { /* the state is the browser's own here */ }
    },
    clear() {
      if (!works || (!armed && title === null)) return;
      title = null;
      armed = false;
      try { session.metadata = null; } catch { /* nothing shown */ }
      for (const action of ACTIONS) handle(action, null);
      try { session.playbackState = 'none'; } catch { /* the state is the browser's own here */ }
    },
  };
}
