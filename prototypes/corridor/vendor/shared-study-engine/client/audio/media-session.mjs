/** N7 fix 3 (the lead): the page tells the platform (the lock screen, Control Center, the earphones) what it can do.
 *
 * While the page holds something his press can pause or resume, it shows it: play and pause handlers that call what his
 * own press calls, the playback state, and neutral metadata (words from voice-lines.mjs, never a card's text). When nothing
 * can be resumed it clears: the handlers are removed, the state is 'none' and the metadata is cleared, so the platform
 * offers no button that does nothing. A handler from an earlier holding, or one that arrives after the clear, does nothing.
 * A handler the platform refuses (its setter throws) is skipped without an error; with no media session nothing is touched.
 * Pure: the caller passes the window; no DOM. */

const ACTIONS = Object.freeze(['play', 'pause']);

/** N7 fix 3b (the lead, M): which shell tells the platform anything in this round: only the iPhone's web client. The
 * client tells its two shells apart as its Mac paths always have, by the speak bridge: the web client's says web: true
 * (web-speak.mjs installWebSpeak, before the app mounts); the Mac app's native bridge (NativeSpeakBridge.swift, injected at
 * document start) carries no such flag. Both are frozen, non-writable and non-configurable, so nothing in the page changes
 * the answer later. No bridge at all: nothing the page holds can be paused or resumed, so nothing is offered either way. */
export function webClientShell(win) {
  try { return win?.nihongoSpeak?.web === true; } catch { return false; }
}
const STATES = new Set(['playing', 'paused']);

export function createMediaSessionLink(win) {
  let session = null;
  try { session = win?.navigator?.mediaSession ?? null; } catch { session = null; }
  if (session && typeof session.setActionHandler !== 'function') session = null;

  let key = null;       // what is held now (a read, a clip); null when nothing is shown
  let token = null;     // the registration the platform's handlers belong to
  let actions = {};     // the latest press callbacks for that holding
  let shownWords = null, wanted = 'none', disposed = false;

  const set = (name, value) => { try { session[name] = value; return true; } catch { return false; } };
  // Read live: an engine may move the state itself with its media element (WebKit does), so no copy of it is kept here.
  const stateNow = () => { try { return session.playbackState; } catch { return null; } };
  const register = mine => {
    for (const action of ACTIONS) {
      try {
        session.setActionHandler(action, () => {
          if (token !== mine) return;
          try { actions[action]?.(); } catch { /* his press reports its own failure */ }
        });
      } catch { /* the platform does not support this action: skipped */ }
    }
  };
  const metadata = (title, artist) => {
    const Ctor = win?.MediaMetadata;
    if (typeof Ctor !== 'function') return;
    try { session.metadata = new Ctor({title, artist}); } catch { /* left as it was */ }
  };

  const link = Object.freeze({
    supported: !!session,
    /** Show a holding: key names it (a new key registers new handlers); state 'playing' or 'paused'; play and pause are
     * his own press's resume and pause. */
    show({key: next, state, title = '', artist = '', play = null, pause = null} = {}) {
      if (!session || disposed || next == null) return;
      actions = {play, pause};
      if (next !== key) {
        key = next;
        const mine = {};token = mine;
        register(mine);
      }
      if (STATES.has(state)) { wanted = state; if (stateNow() !== state) set('playbackState', state); }
      const words = `${title}\u0000${artist}`;
      if (words !== shownWords) { metadata(title, artist); shownWords = words; }
    },
    /** Nothing can be paused or resumed: take everything away. */
    clear() {
      if (!session || disposed || key === null) return;
      key = null;token = null;actions = {};shownWords = null;wanted = 'none';
      for (const action of ACTIONS) { try { session.setActionHandler(action, null); } catch { /* never registered */ } }
      set('playbackState', 'none');
      set('metadata', null);
    },
    /** After the page paused a start that came from outside: the state back to what the page holds ('none' when nothing),
     * for an engine that moved it to 'playing' by itself. */
    settle() {
      if (session && !disposed && stateNow() !== wanted) set('playbackState', wanted);
    },
    /** N7 fix 4 (what the app makes, the app takes away): the app is gone. Everything shown is taken away (as clear()), the
     * state is left at 'none' even if nothing was shown just now (WebKit moves it with its media element by itself: the
     * player's own dispose pauses and resets the element after the read was cleared, and WebKit reads 'paused' again), and
     * afterwards nothing this link does reaches the platform: a later show(), clear() or settle() of the disposed app does
     * nothing, so it cannot touch what the next app shows on the same page. */
    dispose() {
      if (disposed) return;
      link.clear();
      if (session && stateNow() !== 'none') set('playbackState', 'none');
      disposed = true;
    },
    get key() { return key; },
  });
  return link;
}
