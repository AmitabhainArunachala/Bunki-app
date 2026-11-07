/** Learner-state interface (G6a; SPEC S1-R11, S1-R12, S1-R19, S1-R20): the engine task contract, not yet active.
 *
 *  Every recall or grade from any surface (Rajōmon, Speak, M2, M4, anything new) is a typed task-contract event
 *  {kind: 'graded', task (a G9 task id), modality, answer, assistance, source}; a card created by the learner's save is
 *  an enrolment record {kind: 'enrolment', task, source, card} that carries no rating, mastery or dictionary change
 *  (S1-R11). The answer union is exactly what the canonical engine's srs-core validAnswer accepts, and the grade rule
 *  mirrors its decideReview (knew 3, missed 1, a claim is never a grade, answer-showing help gives 1, other help caps at
 *  2). Evidence stays per modality: reading recognition, listening, speaking, writing and grammar are separate rows and
 *  no function here returns a merged level (S1-R19). A graded event maps onto the engine's 'review' type and an
 *  enrolment onto 'manual-card', never the other way round; the types and field lists come from w4-engine-shape.json,
 *  generated from the vendored engine, and a shape the engine lacks is refused with 'engine-change-needed: route
 *  through W4 (S1-R20)', never added here. Pure: nothing is written to any store, no scheduler is called, no clock is
 *  read; the engine itself is reached only through W4's seam in a later node. */
import shape from './w4-engine-shape.json' with { type: 'json' };
import { entryId, readingId, senseId, taskId } from '../identity/identity.mjs';

export const ENGINE_SHAPE = shape;
export const EVIDENCE_MODALITIES = Object.freeze(['reading-recognition', 'listening', 'speaking', 'writing', 'grammar']);
export const TASK_EVENT_KINDS = Object.freeze(['enrolment', 'graded']);
export const SOURCE_ACTIONS = Object.freeze(['answer', 'save']);
export const ASSISTANCE = Object.freeze(['none', 'hint', 'revealed']);
export const ENGINE_TYPE_BY_KIND = Object.freeze({ graded: 'review', enrolment: 'manual-card' });
/** the data keys each mapped engine type is given here; every one must be in the engine's own list for that type */
export const ENGINE_DATA_KEYS = Object.freeze({ review: Object.freeze(['taskKey', 'parent', 'contentRevision', 'rawRating', 'attempt']), 'manual-card': Object.freeze(['version', 'word', 'reading', 'meaning', 'example']) });
export const ENGINE_CHANGE_NEEDED = 'engine-change-needed: route through W4 (S1-R20)';
const GRADE_KEYS = Object.freeze(['rating', 'answer', 'mastery', 'level', 'score', 'streak', 'ease', 'interval', 'dictionary', 'sense']);
const TASK_MODALITIES = new Set(['recognition', 'recall', 'production', 'listening', 'reading', 'writing', 'speaking']);   // G9 taskId's set
// G9 ids carry a bar inside them (entry:<seq>:<spelling>|<reading>), so a task id is read by its sense's backreference to
// its entry, then proved by rebuilding it through G9's own builders (entryId, readingId, senseId, taskId): an id those
// builders would not produce — a katakana reading, a stray part — is not a G9 id
const TASK_ID = /^task:(entry:[^#]+?)\|(reading:[^#]+?)\|\1#s([1-9][0-9]*)\|([a-z]+)$/u;
const ENTRY_ID = /^entry:([^:|]+):([^|]+)\|(.+)$/u;
const READING_ID = /^reading:([^|]+)\|(.+)$/u;
const CARD_KEYS = 'example,meaning,reading,word';

export class TaskContractError extends TypeError {
  constructor(reason, detail) { super(detail ? `${reason}: ${detail}` : reason); this.name = 'TaskContractError'; this.reason = reason; }
}
const refuse = (reason, detail) => { throw new TaskContractError(reason, detail); };
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const filled = (v) => typeof v === 'string' && v.trim() !== '';
const int0 = (v) => Number.isSafeInteger(v) && v >= 0;
const keysOf = (o) => Object.keys(o).sort().join(',');
const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

/** exactly one of the engine's answer forms: {rating 1-4} · {selfCheck knew|missed} · {claim: true} (srs-core validAnswer) */
export function isAnswer(answer) {
  if (!plain(answer)) return false;
  const keys = Object.keys(answer);
  if (shape.answerUnion.exactlyOneKey && keys.length !== 1) return false;
  const form = shape.answerUnion.forms.find((f) => f.key === keys[0]);
  return !!form && form.values.includes(answer[keys[0]]);
}
/** a G9 task id: task:<entry>|<reading>|<sense of that entry>|<task modality> */
export function parseTaskId(task) {
  const m = typeof task === 'string' ? TASK_ID.exec(task) : null;
  if (!m) refuse('invalid-task-id', 'a task is a G9 task id task:<entry>|<reading>|<sense of that entry>|<modality>');
  const [, entry, reading, index, modality] = m, sense = `${entry}#s${index}`;
  if (!TASK_MODALITIES.has(modality)) refuse('invalid-task-id', `unknown task modality ${modality}`);
  const e = ENTRY_ID.exec(entry), r = READING_ID.exec(reading);
  if (!e || !r) refuse('invalid-task-id', 'the entry and reading ids are not G9\'s');
  let rebuilt;
  try {
    const builtEntry = entryId({ seq: e[1], spelling: e[2], reading: e[3] });
    rebuilt = taskId({ entry: builtEntry, reading: readingId({ kanji: r[1], reading: r[2] }), sense: senseId({ entry: builtEntry, index: Number(index) }), modality });
  } catch (error) { refuse('invalid-task-id', error.message); }
  if (rebuilt !== task) refuse('invalid-task-id', 'the id is not what G9\'s builders produce from its parts');
  return freeze({ entry, reading, sense, modality });
}
function parseSource(source) {
  if (!plain(source)) refuse('invalid-source', 'a source names its surface, action and time');
  if (Object.keys(source).some((k) => !['surface', 'action', 'at', 'contentRevision'].includes(k))) refuse('invalid-source', `unknown source field in {${Object.keys(source)}}`);
  if (!filled(source.surface)) refuse('invalid-source', 'surface is required');
  if (!SOURCE_ACTIONS.includes(source.action)) refuse('invalid-source', `action is one of ${SOURCE_ACTIONS.join(', ')}`);
  if (!int0(source.at)) refuse('invalid-source', 'at is the caller\'s instant (ms)');
  if (source.contentRevision !== undefined && !filled(source.contentRevision)) refuse('invalid-source', 'contentRevision is a non-empty string');
  return freeze({ surface: source.surface, action: source.action, at: source.at, ...(source.contentRevision !== undefined ? { contentRevision: source.contentRevision } : {}) });
}
function parseCard(card) {
  if (!plain(card) || keysOf(card) !== CARD_KEYS) refuse('invalid-card', 'a card is {word, reading, meaning, example}');
  for (const k of ['word', 'reading', 'meaning', 'example']) if (!filled(card[k])) refuse('invalid-card', `${k} is required`);
  return freeze({ word: card.word, reading: card.reading, meaning: card.meaning, example: card.example });
}
/** the typed event, or a refusal by name; a private-ledger shape never parses */
export function parseTaskEvent(raw) {
  if (!plain(raw)) refuse('not-an-object');
  if (!TASK_EVENT_KINDS.includes(raw.kind)) refuse('private-ledger-shape', `an event names its kind (${TASK_EVENT_KINDS.join(' or ')}); got {${Object.keys(raw)}}`);
  if (raw.kind === 'enrolment') {
    const grade = GRADE_KEYS.filter((k) => Object.hasOwn(raw, k));
    if (grade.length) refuse('enrolment-carries-grade', `an enrolment carries no ${grade.join(', ')} (S1-R11)`);
    if (keysOf(raw) !== 'card,kind,source,task') refuse('private-ledger-shape', `an enrolment is {kind, task, source, card}; got {${Object.keys(raw)}}`);
    const task = parseTaskId(raw.task), source = parseSource(raw.source), card = parseCard(raw.card);
    if (source.action !== 'save') refuse('invalid-source', 'an enrolment comes from the learner\'s save');
    return freeze({ kind: 'enrolment', task: raw.task, source, card });
  }
  if (keysOf(raw) !== 'answer,assistance,kind,modality,source,task') refuse('private-ledger-shape', `a graded event is {kind, task, modality, answer, assistance, source}; got {${Object.keys(raw)}}`);
  const source = parseSource(raw.source);
  parseTaskId(raw.task);
  if (source.action === 'save') refuse('enrolment-is-not-a-grade', 'a card created by the learner\'s save is an enrolment, not a review grade (S1-R11)');
  if (!EVIDENCE_MODALITIES.includes(raw.modality)) refuse('invalid-modality', `one of ${EVIDENCE_MODALITIES.join(', ')} (S1-R19)`);
  if (!isAnswer(raw.answer)) refuse('invalid-answer', 'exactly one of {rating 1-4}, {selfCheck knew|missed}, {claim: true}');
  if (!ASSISTANCE.includes(raw.assistance)) refuse('invalid-assistance', `one of ${ASSISTANCE.join(', ')}`);
  return freeze({ kind: 'graded', task: raw.task, modality: raw.modality, answer: { ...raw.answer }, assistance: raw.assistance, source });
}
/** the engine's grade for an answer (srs-core decideReview's rule): knew 3 · missed 1 · rating as given · a claim is never
 *  a grade; answer-showing help gives 1, any other help caps at 2 */
export function ratingFor(answer, assistance = 'none') {
  if (!isAnswer(answer)) refuse('invalid-answer');
  if (!ASSISTANCE.includes(assistance)) refuse('invalid-assistance');
  if (answer.claim) return freeze({ refuse: 'claim-without-check' });
  const from = answer.selfCheck ? (answer.selfCheck === 'knew' ? 3 : 1) : answer.rating;
  const rating = assistance === 'revealed' ? 1 : assistance === 'hint' ? Math.min(from, 2) : from;
  return freeze({ rating, from, capped: rating !== from });
}
/** the engine envelope a typed event maps onto: graded → 'review', enrolment → 'manual-card'; never a type the engine lacks */
export function engineEnvelopeFor(event) {
  const typed = parseTaskEvent(event);
  const type = ENGINE_TYPE_BY_KIND[typed.kind];
  if (typed.kind === 'enrolment') return freeze({ type, data: { version: 1, word: typed.card.word, reading: typed.card.reading, meaning: typed.card.meaning, example: typed.card.example } });
  const grade = ratingFor(typed.answer, typed.assistance);
  if (grade.refuse) return freeze({ refuse: grade.refuse, type: null });
  return freeze({ type, data: { taskKey: typed.task, parent: null, contentRevision: typed.source.contentRevision ?? null, rawRating: grade.rating,
    attempt: { id: `${typed.source.surface}:${typed.source.at}`, mode: 'scored', revealed: typed.assistance === 'revealed', foregroundValid: true, thinkMs: null, helpBeforeAnswer: typed.assistance !== 'none' } } });
}
/** evidence per entry and modality: separate rows, never one level */
export function evidenceRows(events) {
  const rows = new Map();
  for (const raw of events) {
    const event = parseTaskEvent(raw);
    if (event.kind !== 'graded') continue;
    const { entry } = parseTaskId(event.task), key = `${entry}|${event.modality}`;
    const row = rows.get(key) || { entry, modality: event.modality, attempts: 0, lastAt: null, surfaces: [] };
    row.attempts += 1; row.lastAt = row.lastAt === null ? event.source.at : Math.max(row.lastAt, event.source.at);
    if (!row.surfaces.includes(event.source.surface)) row.surfaces.push(event.source.surface);
    rows.set(key, row);
  }
  return freeze([...rows.values()]);
}
export function engineTypesUsed() { return [...new Set(Object.values(ENGINE_TYPE_BY_KIND))]; }
/** the contract against the engine's shape: every type used exists, every data key is the engine's; otherwise W4's door */
export function checkEngineMatch(engineShape = shape, typesUsed = engineTypesUsed()) {
  const known = [...engineShape.deviceTypes, ...engineShape.serverTypes];
  for (const type of typesUsed) {
    if (!known.includes(type)) refuse('engine-change-needed', `route through W4 (S1-R20); the engine has no event type ${JSON.stringify(type)}`);
    for (const key of ENGINE_DATA_KEYS[type] || []) if (!engineShape.fieldsByType[type].includes(key)) refuse('engine-change-needed', `route through W4 (S1-R20); ${type} has no field ${key}`);
  }
  if (ENGINE_TYPE_BY_KIND.enrolment === 'review') refuse('enrolment-is-not-a-grade', 'an enrolment never maps onto review (S1-R11)');
  return freeze({ ok: true, types: [...typesUsed], engine: engineShape.engine.sourceCommit, reducerPin: engineShape.engine.reducerPin, parameterSetId: engineShape.scheduler.parameterSetId });
}
