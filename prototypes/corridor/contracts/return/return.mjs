/** One return contract (G4; SPEC S9-R10, S9-R12, S9-R13).
 *
 * A return record is the one thing a surface hands over when the learner leaves it for a word entry, the voice room, a
 * world, the teacher or a search, and the one thing the destination hands back. It carries the origin surface, the object
 * (a G9 identity: entry, reading, sense, kanji, component occurrence or source occurrence), the exact anchor (token index,
 * UTF-16 offset, or media milliseconds), scroll, the focus target, open drafts and runs, and the learner's purpose. Every
 * field is required: a record missing any is refused by name, because a partial return is what the six legacy mechanisms
 * already do (returnScroll restores scroll only; returnFromNavigation restores the view and stack; history.back restores
 * nothing of the selection). Pure: no DOM, no clock, no I/O. The consumers (./stubs) restore exactly what the record says.
 */

export const PURPOSES = ['word-entry', 'voice', 'world', 'teacher', 'search', 'capture', 'study'];
export const ANCHOR_KINDS = ['token', 'utf16', 'media'];
export const REQUIRED_FIELDS = ['origin', 'object', 'anchor', 'scroll', 'focus', 'drafts', 'runs', 'purpose'];
/** object ids the contract accepts (S9-R12: word, sense, kanji or source occurrence), all from the G9 identity contract
 *  except the source occurrence, which is the capture record's own id */
const OBJECT_PREFIXES = ['entry:', 'reading:', 'kanji:', 'comp:', 'occ:'];
export const MEDIA_RETURN_TOLERANCE_MS = 250;

const filled = (v) => typeof v === 'string' && v.trim() !== '';
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const int0 = (v) => Number.isInteger(v) && v >= 0;
class ReturnContractError extends TypeError { constructor(msg) { super(msg); this.name = 'ReturnContractError'; } }
const need = (ok, msg) => { if (!ok) throw new ReturnContractError(msg); };

export function isObjectId(id) {
  return filled(id) && OBJECT_PREFIXES.some((p) => id.startsWith(p)) && (id.includes('#s') || !id.startsWith('entry:') || id.split(':').length >= 3);
}

export function validateAnchor(anchor) {
  need(plain(anchor) && filled(anchor.kind), 'anchor: a typed anchor is required');
  need(ANCHOR_KINDS.includes(anchor.kind), `anchor: unknown anchor kind ${JSON.stringify(anchor.kind)} (token, utf16, media)`);
  if (anchor.kind === 'token') need(int0(anchor.index), 'anchor: a token anchor needs its index');
  if (anchor.kind === 'utf16') need(int0(anchor.offset), 'anchor: a utf16 anchor needs its offset');
  if (anchor.kind === 'media') need(int0(anchor.ms), 'anchor: media milliseconds must be a non-negative integer');
  return true;
}

/** validate a complete record; true or throws naming the first missing or malformed field */
export function validateReturnRecord(rec) {
  need(plain(rec), 'a return record must be an object');
  for (const f of REQUIRED_FIELDS) need(f in rec && rec[f] !== undefined && rec[f] !== null, `return record: ${f} is required`);
  need(plain(rec.origin) && filled(rec.origin.surface), 'origin: the origin surface is required');
  need(int0(rec.origin.paragraph), 'origin: the paragraph index is required');
  need(isObjectId(rec.object), 'object: a G9 identity (entry:, reading:, kanji:, comp:) or a source occurrence (occ:) is required');
  validateAnchor(rec.anchor);
  need(plain(rec.scroll) && Number.isFinite(rec.scroll.x) && Number.isFinite(rec.scroll.y), 'scroll: {x, y} is required');
  need(plain(rec.focus) && filled(rec.focus.target), 'focus: the focus target is required');
  need(Array.isArray(rec.drafts) && rec.drafts.every((d) => plain(d) && filled(d.id)), 'drafts: an array of open drafts (each with an id) is required');
  need(Array.isArray(rec.runs) && rec.runs.every((r) => plain(r) && filled(r.id)), 'runs: an array of open runs (each with an id) is required');
  need(plain(rec.purpose) && filled(rec.purpose.kind), 'purpose: the learner\'s purpose is required');
  need(PURPOSES.includes(rec.purpose.kind), `purpose: unknown purpose ${JSON.stringify(rec.purpose.kind)} (${PURPOSES.join(', ')})`);
  return true;
}

let serial = 0;
/** build and freeze a return record; refuses a record missing any field (S9-R12) */
export function createReturnRecord(input) {
  need(plain(input), 'a return record must be built from an object');
  const rec = {
    id: `return:${(serial += 1)}`,
    origin: input.origin, object: input.object, anchor: input.anchor, scroll: input.scroll, focus: input.focus,
    drafts: input.drafts, runs: input.runs, purpose: input.purpose,
    // what the learner was investigating, so the return can use changed understanding rather than only restore an offset
    distinction: input.distinction ?? null, assistance: input.assistance ?? null, unresolved: input.unresolved ?? null,
  };
  validateReturnRecord(rec);
  return Object.freeze({ ...rec, origin: Object.freeze({ ...rec.origin }), anchor: Object.freeze({ ...rec.anchor }), scroll: Object.freeze({ ...rec.scroll }),
    focus: Object.freeze({ ...rec.focus }), drafts: Object.freeze(rec.drafts.map((d) => Object.freeze({ ...d }))), runs: Object.freeze(rec.runs.map((r) => Object.freeze({ ...r }))),
    purpose: Object.freeze({ ...rec.purpose }) });
}

/** the restore a consumer must perform, written once: paragraph, selection, focus, scroll, then owned media */
export function restorePlan(rec) {
  validateReturnRecord(rec);
  const plan = { paragraph: rec.origin.paragraph, focus: rec.focus.target, scroll: { x: rec.scroll.x, y: rec.scroll.y }, selection: null, mediaMs: null };
  if (rec.anchor.kind === 'media') plan.mediaMs = rec.anchor.ms;
  return plan;
}
