/** Learner-projection interface (G12; SPEC S8-R7, S8-R9): one read model of evidence with modality, assistance, source
 *  and declared coverage per source. The input is a log of observations — exposures (tier D: the form appeared, nobody
 *  retrieved anything), lookups (fluency friction, never a grade), recalls (G6a typed task events), imitations (production
 *  with assistance) and independent productions — plus feedback on attempts and each source's own declared coverage. The
 *  output keeps the four concerns of S8-R9 under four keys: knowledge (what the log refers to), live (the open thread),
 *  evidence (one row per entry, modality, assistance and source; counts of retrievals only), estimates (derived; the
 *  numeric estimate is out of scope here, so every estimate carries its basis and a null value). An exposure or a lookup
 *  never becomes an attempt or an estimate, a repeated exposure changes nothing, coverage is reported exactly as a source
 *  declared it and never extrapolated, and the log is never written to. Pure: no store, no clock, no network. */
import { parseTaskEvent, parseTaskId, EVIDENCE_MODALITIES, ASSISTANCE } from '../learner-state/task-contract.mjs';

export const OBSERVATION_KINDS = Object.freeze(['exposure', 'lookup', 'recall', 'imitation', 'production', 'feedback']);
export const RETRIEVAL_KINDS = Object.freeze(['recall', 'imitation', 'production']);
export const FEEDBACK_CHANNELS = Object.freeze(['oral', 'written']);
export const CONCERNS = Object.freeze(['knowledge', 'live', 'evidence', 'estimates']);
const ENTRY_ID = /^entry:[^:|]+:[^|]+\|.+$/u;

export class ProjectionError extends TypeError { constructor(reason, detail) { super(detail ? `${reason}: ${detail}` : reason); this.name = 'ProjectionError'; this.reason = reason; } }
const refuse = (reason, detail) => { throw new ProjectionError(reason, detail); };
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const filled = (v) => typeof v === 'string' && v.trim() !== '';
const int0 = (v) => Number.isSafeInteger(v) && v >= 0;
const keysOf = (o) => Object.keys(o).sort().join(',');
const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

function parseSource(source) {
  if (!plain(source) || !filled(source.surface) || !int0(source.at)) refuse('invalid-source', 'a source is {surface, at, sourceId?}');
  if (Object.keys(source).some((k) => !['surface', 'at', 'sourceId'].includes(k))) refuse('invalid-source', `unknown source field in {${Object.keys(source)}}`);
  if (source.sourceId !== undefined && !filled(source.sourceId)) refuse('invalid-source', 'sourceId is a non-empty string');
  return { surface: source.surface, at: source.at, sourceId: source.sourceId ?? null };
}
/** one observation of the log, typed by kind; a shape outside the six kinds is refused by name */
export function parseObservation(raw) {
  if (!plain(raw)) refuse('not-an-object');
  if (!filled(raw.id)) refuse('invalid-observation', 'an observation carries its id');
  if (!OBSERVATION_KINDS.includes(raw.kind)) refuse('unknown-observation-kind', `one of ${OBSERVATION_KINDS.join(', ')}; got ${JSON.stringify(raw.kind)}`);
  if (raw.kind === 'feedback') {
    if (keysOf(raw) !== 'attemptId,channel,id,kind,text') refuse('invalid-feedback', 'feedback is {id, kind, attemptId, channel, text}');
    if (!filled(raw.attemptId) || !FEEDBACK_CHANNELS.includes(raw.channel) || !filled(raw.text)) refuse('invalid-feedback', 'attemptId, channel (oral or written) and text are required');
    return freeze({ id: raw.id, kind: 'feedback', attemptId: raw.attemptId, channel: raw.channel, text: raw.text });
  }
  if (raw.kind === 'recall') {
    if (keysOf(raw) !== 'event,id,kind') refuse('invalid-recall', 'a recall is {id, kind, event} with a G6a graded event');
    const event = parseTaskEvent(raw.event);
    if (event.kind !== 'graded') refuse('invalid-recall', 'an enrolment is not a recall');
    return freeze({ id: raw.id, kind: 'recall', event });
  }
  if (keysOf(raw) !== 'assistance,entry,id,kind,modality,source') refuse('invalid-observation', `${raw.kind} is {id, kind, entry, modality, assistance, source}`);
  if (!filled(raw.entry) || !ENTRY_ID.test(raw.entry)) refuse('invalid-entry', 'a G9 entry id is required');
  if (!EVIDENCE_MODALITIES.includes(raw.modality)) refuse('invalid-modality', `one of ${EVIDENCE_MODALITIES.join(', ')}`);
  if (!ASSISTANCE.includes(raw.assistance)) refuse('invalid-assistance', `one of ${ASSISTANCE.join(', ')}`);
  if (raw.kind === 'imitation' && raw.assistance === 'none') refuse('invalid-assistance', 'an imitation is production with assistance');
  if (raw.kind === 'production' && raw.assistance !== 'none') refuse('invalid-assistance', 'an independent production has no assistance');
  if ((raw.kind === 'exposure' || raw.kind === 'lookup') && raw.assistance !== 'none') refuse('invalid-assistance', `${raw.kind} carries no assistance`);
  return freeze({ id: raw.id, kind: raw.kind, entry: raw.entry, modality: raw.modality, assistance: raw.assistance, source: parseSource(raw.source) });
}
function parseDeclaredSource(raw) {
  if (!plain(raw) || keysOf(raw) !== 'coverage,sourceId' || !filled(raw.sourceId)) refuse('invalid-declared-source', 'a source declares {sourceId, coverage: {covered, of} | null}');
  if (raw.coverage === null) return { sourceId: raw.sourceId, coverage: null };
  if (!plain(raw.coverage) || keysOf(raw.coverage) !== 'covered,of' || !int0(raw.coverage.covered) || !int0(raw.coverage.of) || raw.coverage.of < 1 || raw.coverage.covered > raw.coverage.of) refuse('invalid-declared-source', 'coverage is {covered, of} with covered ≤ of');
  return { sourceId: raw.sourceId, coverage: { covered: raw.coverage.covered, of: raw.coverage.of } };
}
const retrievalOf = (o) => (o.kind === 'recall'
  ? { entry: parseTaskId(o.event.task).entry, modality: o.event.modality, assistance: o.event.assistance, source: { surface: o.event.source.surface, at: o.event.source.at, sourceId: null }, kind: 'recall' }
  : { entry: o.entry, modality: o.modality, assistance: o.assistance, source: o.source, kind: o.kind });

/** the read model: four concerns, four keys; the log is read, never written */
export function project({ events = [], sources = [] } = {}) {
  if (!Array.isArray(events) || !Array.isArray(sources)) refuse('invalid-log', 'project({events, sources})');
  const observations = events.map(parseObservation), declared = sources.map(parseDeclaredSource);
  const ids = new Set();
  for (const o of observations) { if (ids.has(o.id)) refuse('duplicate-observation', o.id); ids.add(o.id); }
  const entries = new Map(), encounters = new Map(), friction = new Map(), rows = new Map(), estimates = new Map();
  const attemptIds = new Set(observations.filter((o) => RETRIEVAL_KINDS.includes(o.kind)).map((o) => o.id));
  for (const o of observations) {
    if (o.kind === 'feedback') { if (!attemptIds.has(o.attemptId)) refuse('unknown-attempt', `feedback ${o.id} names no attempt in the log`); continue; }
    const r = retrievalOf(o);
    entries.set(r.entry, true);
    if (o.kind === 'exposure') { const seen = encounters.get(r.entry) || new Set(); seen.add(r.source.sourceId ?? r.source.surface); encounters.set(r.entry, seen); continue; }
    if (o.kind === 'lookup') { friction.set(r.entry, (friction.get(r.entry) || 0) + 1); continue; }
    const key = `${r.entry}|${r.modality}|${r.assistance}|${r.source.sourceId ?? r.source.surface}`;
    const row = rows.get(key) || { entry: r.entry, modality: r.modality, assistance: r.assistance, source: r.source.sourceId ?? r.source.surface, surface: r.source.surface, kinds: [], attempts: 0, lastAt: null, evidenceIds: [] };
    row.attempts += 1; row.lastAt = row.lastAt === null ? r.source.at : Math.max(row.lastAt, r.source.at); row.evidenceIds.push(o.id);
    if (!row.kinds.includes(r.kind)) row.kinds.push(r.kind);
    rows.set(key, row);
    const ek = `${r.entry}|${r.modality}`;
    const est = estimates.get(ek) || { entry: r.entry, modality: r.modality, basis: [], value: null, method: 'out-of-scope (S8-R9: derived, never written back)' };
    est.basis.push(o.id); estimates.set(ek, est);
  }
  const feedback = observations.filter((o) => o.kind === 'feedback').map((o) => ({ id: o.id, attemptId: o.attemptId, channel: o.channel, evidenceId: o.attemptId }));
  const open = observations.filter((o) => RETRIEVAL_KINDS.includes(o.kind)).map((o) => ({ attemptId: o.id, kind: o.kind, at: retrievalOf(o).source.at }));
  const coverage = Object.fromEntries(declared.map((d) => [d.sourceId, d.coverage === null ? null : { covered: d.coverage.covered, of: d.coverage.of, declared: `${d.coverage.covered}/${d.coverage.of}` }]));
  return freeze({
    knowledge: { entries: [...entries.keys()].sort(), encounters: Object.fromEntries([...encounters].map(([k, v]) => [k, [...v].sort()])), friction: Object.fromEntries([...friction].sort()) },
    live: { attempts: open, lastAttempt: open.length ? open.reduce((a, b) => (b.at >= a.at ? b : a)) : null, feedback },
    evidence: { rows: [...rows.values()], coverage },
    estimates: { rows: [...estimates.values()] },
  });
}
