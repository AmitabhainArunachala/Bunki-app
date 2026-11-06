/** The door registry (G4, assertions [3] and [4]): every door that leaves a surface, with its origin and how it returns;
 *  and every existing exact-return mechanism in corridor.js, listed as 'to adopt' with what it restores today. The judge
 *  scans the tree for the legacy mechanisms, so this list can never be shorter than reality. The doors adopt the contract
 *  in later nodes (S9-DD1 is checked at W1J); here they are registered, not rewired. */

/** what the legacy mechanisms restore today, read from their bodies (corridor.js at the G3 head) */
export const LEGACY = Object.freeze([
  { name: 'returnScroll', file: 'corridor.js', returnKind: 'to adopt', restores: ['scroll'],
    currentBehaviour: 'window.scrollTo to the per-view remembered scroll (reader, shelf, archive, publisher, source-reader, feed, yoji, levels); no selection, no focus, no anchor' },
  { name: 'returnFromNavigation', file: 'corridor.js', returnKind: 'to adopt', restores: ['view', 'stack', 'scroll'],
    currentBehaviour: 'pops S.navigationReturns, revokes stale reader tickets and course detours, restores the view and stack and scrolls to the frame; focus only for a kanji-course frame; no selection range' },
  { name: 'returnToScaleBead', file: 'corridor.js', returnKind: 'to adopt', restores: ['stack', 'scroll', 'focus'],
    currentBehaviour: 'replaces the scale pages back to a bead (index, source sentence or article) and requests a scale return; focus to the bead target; no selection range, no drafts' },
  { name: 'closeSealStrip', file: 'corridor.js', returnKind: 'to adopt', restores: ['focus'],
    currentBehaviour: 'closes the seal strip and, when restoreFocus is set, gives focus back to the prose word anchor; nothing else returns' },
  { name: 'history.back', file: 'corridor.js', returnKind: 'to adopt', restores: ['view'],
    sites: ['corridor.js:5691', 'corridor.js:5749'],
    currentBehaviour: 'browser history navigation out of a sheet or route; the previous view re-renders from state; no anchor, selection, focus or scroll guarantee' },
]);

/** the doors that leave a surface today, each with its origin and how it returns once adopted */
export const DOORS = Object.freeze([
  { door: 'word-entry', origin: 'reader', returnKind: 'contract', implementation: 'consumer.returnTo', purpose: 'word-entry' },
  { door: 'voice', origin: 'reader', returnKind: 'contract', implementation: 'consumer.returnTo', purpose: 'voice' },
  { door: 'world', origin: 'drift', returnKind: 'contract', implementation: 'consumer.returnTo', purpose: 'world' },
  { door: 'teacher', origin: 'reader', returnKind: 'contract', implementation: 'consumer.returnTo', purpose: 'teacher' },
  { door: 'search', origin: 'shelf', returnKind: 'contract', implementation: 'consumer.returnTo', purpose: 'search' },
  { door: 'capture', origin: 'source-reader', returnKind: 'contract', implementation: 'consumer.returnTo', purpose: 'capture' },
  { door: 'scale-bead', origin: 'reader', returnKind: 'to adopt', legacy: 'returnToScaleBead' },
  { door: 'seal-strip', origin: 'reader', returnKind: 'to adopt', legacy: 'closeSealStrip' },
  { door: 'sheet-back', origin: 'any', returnKind: 'to adopt', legacy: 'history.back' },
]);

const RETURN_KINDS = ['contract', 'to adopt'];
const IMPLEMENTATIONS = ['consumer.returnTo'];
const filled = (v) => typeof v === 'string' && v.trim() !== '';

export function doorRegistry() {
  const legacy = LEGACY.map((l) => ({ ...l, restores: [...l.restores], ...(l.sites ? { sites: [...l.sites] } : {}) }));
  const legacyCount = legacy.reduce((n, l) => n + (l.sites ? l.sites.length : 1), 0);
  return { doors: DOORS.map((d) => ({ ...d })), legacy, legacyCount };
}

/** true, or throws naming the first door that cannot return */
export function validateRegistry(reg) {
  if (!reg || !Array.isArray(reg.doors)) throw new TypeError('registry: doors must be an array');
  for (const d of reg.doors) {
    if (!filled(d.door)) throw new TypeError('registry: a door needs a name');
    if (!filled(d.origin)) throw new TypeError(`registry: door ${d.door} needs its origin surface`);
    if (!RETURN_KINDS.includes(d.returnKind)) throw new TypeError(`registry: door ${d.door} has an unknown return kind ${JSON.stringify(d.returnKind)}`);
    if (d.returnKind === 'contract' && !(filled(d.implementation) && IMPLEMENTATIONS.includes(d.implementation))) throw new TypeError(`registry: door ${d.door} names no return implementation`);
    if (d.returnKind === 'to adopt' && !filled(d.legacy)) throw new TypeError(`registry: door ${d.door} is 'to adopt' but names no legacy mechanism`);
  }
  return true;
}
