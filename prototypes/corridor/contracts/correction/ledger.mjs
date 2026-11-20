/** Correction-state interface (G14; SPEC S11-R6): one correction ledger keyed by attempt identity. A text correction and a
 *  voice correction are rows of the same ledger, each with its original (what was marked and the natural form, with the
 *  Speak sensei's code), its basis (who marked it and on what), its status (open · qualified · retracted) and its
 *  retraction. A disputed correction can be inspected, qualified with a note or retracted; nothing is ever deleted, and a
 *  retraction is itself a row. The spoken and the written view of one attempt id are the same rows: the base's voice
 *  corrections live inside a Speak turn result and are invisible to the text side; here they enter the ledger through
 *  fromSpeakTurn and are read back from either view. Pure: no store, clock or network; an attempt id is required. */
import { SENSEI_CODES } from '../../speak-core.mjs';

export const CORRECTION_CHANNELS = Object.freeze(['voice', 'text']);
export const CORRECTION_STATUSES = Object.freeze(['open', 'qualified', 'retracted']);
export const BASIS_KINDS = Object.freeze(['sensei', 'reviewer', 'native-reviewer', 'learner']);
export const ROW_KINDS = Object.freeze(['correction', 'retraction']);
export { SENSEI_CODES };

export class CorrectionLedgerError extends TypeError { constructor(reason, detail) { super(detail ? `${reason}: ${detail}` : reason); this.name = 'CorrectionLedgerError'; this.reason = reason; } }
const refuse = (reason, detail) => { throw new CorrectionLedgerError(reason, detail); };
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const filled = (v) => typeof v === 'string' && v.trim() !== '';
const int0 = (v) => Number.isSafeInteger(v) && v >= 0;
const keysOf = (o) => Object.keys(o).sort().join(',');
const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

export function emptyLedger() { return freeze({ version: 1, rows: [] }); }
export function parseLedger(raw) {
  if (!plain(raw) || raw.version !== 1 || !Array.isArray(raw.rows) || keysOf(raw) !== 'rows,version') refuse('invalid-ledger', 'a ledger is {version: 1, rows}');
  const ids = new Set();
  for (const row of raw.rows) {
    if (!plain(row) || !ROW_KINDS.includes(row.kind) || !filled(row.id) || !filled(row.attemptId)) refuse('invalid-ledger', 'every row has a kind, an id and an attempt id');
    if (ids.has(row.id)) refuse('invalid-ledger', `duplicate row ${row.id}`); ids.add(row.id);
  }
  return Object.isFrozen(raw) ? raw : freeze({ version: 1, rows: raw.rows.map((r) => ({ ...r })) });
}
function parseOriginal(o) {
  if (!plain(o) || !filled(o.wrong) || !filled(o.right) || !SENSEI_CODES.includes(o.code)) refuse('invalid-original', `an original is {wrong, right, code ∈ ${SENSEI_CODES.join('|')}, rightReading?, subject?, subjectType?}`);
  if (Object.keys(o).some((k) => !['wrong', 'right', 'rightReading', 'code', 'subject', 'subjectType'].includes(k))) refuse('invalid-original', `unknown field in {${Object.keys(o)}}`);
  return { wrong: o.wrong, right: o.right, rightReading: filled(o.rightReading) ? o.rightReading : null, code: o.code, subject: filled(o.subject) ? o.subject : null, subjectType: o.subjectType === 'kanji' || o.subjectType === 'word' ? o.subjectType : null };
}
function parseBasis(b) {
  if (!plain(b) || !BASIS_KINDS.includes(b.kind) || !filled(b.ref) || !int0(b.at) || keysOf(b) !== 'at,kind,ref') refuse('invalid-basis', 'a basis is {kind ∈ sensei|reviewer|native-reviewer|learner, ref, at}');
  return { kind: b.kind, ref: b.ref, at: b.at };
}
/** add one correction; a retry with the same bytes is idempotent, a different row under the same id is refused */
export function addCorrection(raw, input) {
  const ledger = parseLedger(raw);
  if (!plain(input)) refuse('not-an-object');
  if (!filled(input.attemptId)) refuse('attempt-id-required', 'a correction is keyed by the attempt it marks');
  if (!filled(input.id)) refuse('invalid-correction', 'a correction carries its id');
  if (!CORRECTION_CHANNELS.includes(input.channel)) refuse('invalid-channel', `one of ${CORRECTION_CHANNELS.join(', ')}`);
  if (keysOf(input) !== 'attemptId,basis,channel,id,original') refuse('invalid-correction', 'a correction is {id, attemptId, channel, original, basis}');
  const row = { kind: 'correction', id: input.id, attemptId: input.attemptId, channel: input.channel, original: parseOriginal(input.original), basis: parseBasis(input.basis), status: 'open', note: null, retraction: null };
  const previous = ledger.rows.find((r) => r.id === row.id);
  if (previous) { if (JSON.stringify({ ...previous, status: 'open', note: null, retraction: null }) !== JSON.stringify(row)) refuse('correction-conflict', row.id); return ledger; }
  return freeze({ version: 1, rows: [...ledger.rows, row] });
}
function correctionRow(ledger, id) {
  const row = ledger.rows.find((r) => r.id === id && r.kind === 'correction');
  if (!row) refuse('unknown-correction', id);
  return row;
}
/** partly right: the status becomes qualified with the note; the original and basis stay as they were; nothing is removed */
export function qualifyCorrection(raw, id, { note, by, at } = {}) {
  const ledger = parseLedger(raw), row = correctionRow(ledger, id);
  if (!filled(note) || !filled(by) || !int0(at)) refuse('invalid-qualification', '{note, by, at} are required');
  if (row.status === 'retracted') refuse('correction-retracted', id);
  return freeze({ version: 1, rows: ledger.rows.map((r) => (r === row ? { ...r, status: 'qualified', note: { text: note, by, at } } : r)) });
}
/** disputed and withdrawn: the status becomes retracted, the original and basis stay readable, and the retraction is a row of its own */
export function retractCorrection(raw, id, { by, reason, at } = {}) {
  const ledger = parseLedger(raw), row = correctionRow(ledger, id);
  if (!filled(by) || !filled(reason) || !int0(at)) refuse('invalid-retraction', '{by, reason, at} are required');
  if (row.status === 'retracted') return ledger;
  const retraction = { kind: 'retraction', id: `${id}:retraction`, attemptId: row.attemptId, of: id, by, reason, at };
  return freeze({ version: 1, rows: [...ledger.rows.map((r) => (r === row ? { ...r, status: 'retracted', retraction: { by, reason, at, row: retraction.id } } : r)), retraction] });
}
/** every row of one attempt, in ledger order, whatever the channel */
export function correctionsFor(raw, attemptId) {
  if (!filled(attemptId)) refuse('attempt-id-required');
  return freeze(parseLedger(raw).rows.filter((r) => r.attemptId === attemptId).map((r) => ({ ...r })));
}
export function textView(raw, attemptId) { return freeze({ attemptId, view: 'text', corrections: correctionsFor(raw, attemptId) }); }
export function spokenView(raw, attemptId) { return freeze({ attemptId, view: 'spoken', corrections: correctionsFor(raw, attemptId) }); }
/** the corrections of a parsed Speak turn (speak-core parseTurn), entering the ledger as voice rows keyed by the attempt */
export function fromSpeakTurn(raw, turn, { attemptId, at, ref } = {}) {
  if (!plain(turn) || !Array.isArray(turn.corrections)) refuse('invalid-turn', 'a parsed Speak turn with its corrections array');
  if (!filled(attemptId)) refuse('attempt-id-required', 'a Speak turn is keyed by its attempt');
  if (!int0(at) || !filled(ref)) refuse('invalid-basis', '{at, ref} are required');
  let ledger = parseLedger(raw);
  turn.corrections.forEach((c, i) => { ledger = addCorrection(ledger, { id: `${attemptId}:c${i + 1}`, attemptId, channel: 'voice', original: c, basis: { kind: 'sensei', ref, at } }); });
  return ledger;
}
