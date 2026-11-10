/** The tutor and the coach speak their replies (B4, speech lane, 2026-11-11): two small parts the voice layer uses,
 * with plain inputs and no DOM.
 *
 * The arrivals: the app says a reply has just come (corridor.js for the written tutor, modules/teacher.mjs for the
 * coach). When the reply stands on the screen with its listen mark, it is handed over once; drawn again later (a
 * refresh, the next question sent, a visit back) it is not, so it is never said twice. One that is not met within a few
 * seconds is forgotten. With the 声 switch off nothing is handed over and only his tap on the mark speaks.
 *
 * The queue: one reply said at a time, in the order they arrived. A reply that arrives while another is being said
 * waits its turn. A reply that is stopped (the screen left, his tap on something else) takes the waiting ones with it;
 * one that ends in silence (the server refusing) lets the next one try. */

const clean = (text) => String(text ?? '').replace(/\s+/gu, ' ').trim();
/** Whether a reply as the screen shows it is the reply that arrived (whitespace as drawn does not count). */
export const sameReply = (a, b) => !!clean(a) && clean(a) === clean(b);

export function createArrivals({ now = () => Date.now(), ttlMs = 8000 } = {}) {
  let waiting = []; // { text, at }
  const fresh = () => {
    const at = now();
    waiting = waiting.filter((row) => at - row.at <= ttlMs);
  };
  return {
    arrived(text) {
      const shown = clean(text);
      if (shown) waiting.push({ text: shown, at: now() });
    },
    /** True once for the shown text of a reply that has just arrived; that arrival is used up. */
    take(text) {
      fresh();
      const shown = clean(text);
      const at = waiting.findIndex((row) => row.text === shown);
      if (!shown || at < 0) return false;
      waiting.splice(at, 1);
      return true;
    },
    get size() {
      fresh();
      return waiting.length;
    },
  };
}

/** The replies on the screen whose listen mark stands (`shown`: [{ text, item }]): each that has just arrived is handed
 * to `push` when the switch is on, and let go when it is off. Returns how many were handed over. */
export function serveReplies({ shown = [], arrivals, bySelf = () => false, push }) {
  let handed = 0;
  for (const { text, item } of shown) {
    if (!arrivals.take(text)) continue;
    if (!bySelf()) continue;
    push(item);
    handed += 1;
  }
  return handed;
}

/** `start(item, done)` begins saying one reply and calls done(state) once when it ends ('done', 'stopped' or
 * 'error'); it returns false when the reply cannot be said now, and the next one is tried. An item may carry live():
 * false when its screen has gone, and it is then passed over. */
export function createReplyQueue({ start }) {
  const waiting = [];
  let current = null;
  function pump() {
    while (!current && waiting.length) {
      const item = waiting.shift();
      try { if (item.live && !item.live()) continue; } catch { continue; }
      const mine = { item, ended: false };
      current = mine;
      const done = (state) => {
        if (mine.ended) return;
        mine.ended = true;
        if (current === mine) current = null;
        if (state === 'stopped') waiting.length = 0;
        pump();
      };
      let started = false;
      try { started = start(item, done) !== false; } catch { started = false; }
      if (!started && !mine.ended) {
        mine.ended = true;
        if (current === mine) current = null;
      }
    }
  }
  return {
    push(item) { waiting.push(item); pump(); },
    clear() { waiting.length = 0; },
    get speaking() { return !!current; },
    get waiting() { return waiting.length; },
  };
}
