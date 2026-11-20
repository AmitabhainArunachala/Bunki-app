/** Domain identity contract (G9): entries, spellings and readings, senses, occurrences, kanji, components,
 * evidence targets and study tasks.
 *
 * The base keys a word by `spelling|reading` (srs-core.mjs wordIdentity / itemIdentity). That already keeps
 * 生/せい and 生/なま apart, and this module keeps that behaviour (the `reading:` id is the same pair). What the
 * base cannot express, and this module adds:
 *   1. two entries with the same spelling and reading under two JMdict seqs are two ids (`entry:` carries the seq);
 *   2. senses are distinct under one entry, and a study task is keyed by (entry, reading, sense, modality);
 *   3. one kanji drawn twice in a character gives two occurrence ids `comp:<kanji id>:<position>` on one part id;
 *   4. a version-1 key migrates to exactly one version-2 id or to an explicit `ambiguous: 'needs seq'`, with a
 *      recorded migration step; unknown versions are refused;
 *   5. evidence events carry a typed target: a lexical target needs its entry id, a section target needs its source
 *      occurrence, transcript digest and a validated whole-sentence range; a section forced to its first word or an
 *      uncertain lexical capture retyped as a section is refused (S4-R14, S8(g)).
 *
 * Pure: no I/O, no clock, no randomness. Ids are deterministic strings so that a scheduler, a ledger and an export
 * agree without a registry. The typed declaration of the same contract lives in packages/domain/src/identity/.
 */

export const IDENTITY_VERSION = 2;

const toHiragana = (text) => String(text || '').replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const filled = (value) => typeof value === 'string' && value.trim() !== '';
const plainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const need = (ok, message) => { if (!ok) throw new TypeError(message); };
const SHA256 = /^[0-9a-f]{64}$/u;
const MODALITIES = new Set(['recognition', 'recall', 'production', 'listening', 'reading', 'writing', 'speaking']);

/** a kanji by its literal, the base's form kept: 'kanji:森' */
export function kanjiId(literal) {
  need(filled(literal), 'kanjiId: a kanji literal is required');
  return `kanji:${literal}`;
}

/** a part of the parts graph (S6-R6) by its literal: 'part:木' */
export function partId(literal) {
  need(filled(literal), 'partId: a part literal is required');
  return `part:${literal}`;
}

/** a reading of a kanji, the base pair kept ('生|せい'): 'reading:生|せい'; okurigana marks are part of the reading */
export function readingId({ kanji, reading } = {}) {
  need(filled(kanji), 'readingId: a kanji is required');
  need(filled(reading), 'readingId: a reading is required');
  return `reading:${kanji}|${toHiragana(reading)}`;
}

/** a dictionary entry: the JMdict seq is part of the id, so one spelling and reading under two seqs are two entries */
export function entryId({ seq, spelling, reading } = {}) {
  need(seq != null && filled(String(seq)), 'entryId: an entry id needs its seq');
  need(filled(spelling), 'entryId: a spelling is required');
  need(filled(reading), 'entryId: a reading is required');
  return `entry:${String(seq)}:${spelling}|${toHiragana(reading)}`;
}

/** a sense under one entry, scoped by the entry: 'entry:…#s1' */
export function senseId({ entry, index } = {}) {
  need(filled(entry) && entry.startsWith('entry:'), 'senseId: an entry id is required');
  need(Number.isInteger(index) && index >= 1, 'senseId: a 1-based sense index is required');
  return `${entry}#s${index}`;
}

/** a study task, keyed by (entry, reading, sense, modality): the scheduler sees one task per sense and modality */
export function taskId({ entry, reading, sense, modality } = {}) {
  need(filled(entry) && entry.startsWith('entry:'), 'taskId: an entry id is required');
  need(filled(reading) && reading.startsWith('reading:'), 'taskId: a reading id is required');
  need(filled(sense) && sense.startsWith(entry + '#s'), 'taskId: a sense id of this entry is required');
  need(filled(modality) && MODALITIES.has(modality), `taskId: a modality is required (${[...MODALITIES].join(', ')})`);
  return `task:${entry}|${reading}|${sense}|${modality}`;
}

/** full provenance for every relation: the dataset, its pinned version and its licence */
export function validProvenance(provenance) {
  return plainObject(provenance) && ['dataset', 'version', 'licence'].every((k) => filled(provenance[k]));
}

/** a reading → kanji → entry relation, each one carrying its provenance */
export function relate({ reading, kanji, entry, provenance } = {}) {
  need(filled(reading) && reading.startsWith('reading:'), 'relate: a reading id is required');
  need(filled(kanji) && kanji.startsWith('kanji:'), 'relate: a kanji id is required');
  need(filled(entry), 'relate: an entry id is required');
  need(validProvenance(provenance), 'relate: provenance.dataset, provenance.version and provenance.licence are required');
  return { kanji, reading, entry, provenance: { dataset: provenance.dataset, version: provenance.version, licence: provenance.licence } };
}

/** one occurrence of a part inside a kanji, by position: 'comp:kanji:森:1' and 'comp:kanji:森:2' both point at 'part:木' */
export function componentOccurrenceId({ kanji, position, part } = {}) {
  const k = kanjiId(kanji);
  need(Number.isInteger(position) && position >= 1, 'componentOccurrenceId: a 1-based position is required');
  return { id: `comp:${k}:${position}`, kanji: k, position, part: partId(part) };
}

/** a version-1 key ('spelling|reading', the base's wordIdentity) read forward to version 2.
 *  One candidate entry with that spelling and reading → its id; two or more → `ambiguous: 'needs seq'` with the
 *  candidate ids, never silently one of them; none → `ambiguous: 'no candidate'`. Nothing is dropped: the old key
 *  and the migration step travel with the result. Any version other than 1 is refused. */
export function migrateIdentity(record, { candidates = [] } = {}) {
  need(plainObject(record), 'migrateIdentity: an identity record is required');
  need(record.version === 1, `migrateIdentity: unknown identity version ${record.version === undefined ? '(missing)' : JSON.stringify(record.version)}; only version 1 migrates to ${IDENTITY_VERSION}`);
  need(filled(record.key) && record.key.includes('|'), 'migrateIdentity: a version-1 key has the form spelling|reading');
  const bar = record.key.indexOf('|');
  const spelling = record.key.slice(0, bar);
  const reading = toHiragana(record.key.slice(bar + 1));
  const ids = [...new Set(candidates
    .filter((c) => plainObject(c) && c.spelling === spelling && toHiragana(c.reading) === reading && c.seq != null)
    .map((c) => entryId({ seq: c.seq, spelling: c.spelling, reading: c.reading })))].sort();
  const migration = [{ from: 1, to: IDENTITY_VERSION, rule: 'spelling|reading → entry:<seq>:spelling|reading; the seq comes from the candidate set' }];
  if (ids.length === 1) return { version: IDENTITY_VERSION, from: record.key, id: ids[0], migration };
  if (ids.length === 0) return { version: IDENTITY_VERSION, from: record.key, id: null, ambiguous: 'no candidate', candidates: [], migration };
  return { version: IDENTITY_VERSION, from: record.key, id: null, ambiguous: 'needs seq', candidates: ids, migration };
}

/** an evidence event's target must be typed. lexical: needs its entry id. section: needs its source occurrence,
 *  a sha256 transcript digest and a validated whole-sentence range; a section forced to its first word, or an
 *  uncertain lexical capture retyped as a section, is refused. Returns true or throws. */
export function validateEvidenceTarget(event) {
  need(plainObject(event) && filled(event.kind), 'evidence: an event with a kind is required');
  const target = event.target;
  need(plainObject(target) && filled(target.kind), 'evidence: untyped target; a target carries kind "lexical" or "section"');
  if (target.kind === 'lexical') {
    need(filled(target.entry) && target.entry.startsWith('entry:'), 'evidence: a lexical target needs its entry id');
    return true;
  }
  if (target.kind === 'section') {
    need(filled(target.sourceOccurrence), 'evidence: a section target needs its source occurrence');
    need(filled(target.transcriptDigest) && SHA256.test(target.transcriptDigest), 'evidence: a section target needs a sha256 transcript digest');
    const range = target.range;
    need(plainObject(range) && Number.isInteger(range.start) && Number.isInteger(range.end) && range.end > range.start, 'evidence: a section target needs a range');
    need(range.wholeSentence === true && range.validated === true && !range.forcedFirstWord, 'evidence: a section must be a validated whole sentence, never forced to its first word');
    need(!(target.retypedFrom === 'lexical' && target.lexicalConfidence !== 'confident'), 'evidence: an uncertain lexical capture retyped as a section is refused');
    return true;
  }
  throw new TypeError(`evidence: untyped target kind ${JSON.stringify(target.kind)}`);
}
