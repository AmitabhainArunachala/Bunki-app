/**
 * Domain identity contract (G9): entries, spellings and readings, senses, occurrences, kanji, components,
 * evidence targets and study tasks.
 *
 * The typed declaration of the contract that `prototypes/corridor/contracts/identity/identity.mjs` implements
 * for the prototype at runtime; the two carry the same id forms and the same rules, and the prototype's pinned
 * judge (`identity.contract.test.mjs`) is the behavioural proof. Pure: no platform import, no clock, no
 * randomness (REQ-ARCH-02). Ids are deterministic strings so that a scheduler, a ledger and an export agree
 * without a registry.
 *
 * What the base (`srs-core.mjs` wordIdentity / itemIdentity, `spelling|reading`) cannot express, and this adds:
 *   1. two entries with the same spelling and reading under two JMdict seqs are two ids (the seq is in the id);
 *   2. senses are distinct under one entry, and a study task is keyed by (entry, reading, sense, modality);
 *   3. one kanji drawn twice in a character gives two occurrence ids `comp:<kanji id>:<position>` on one part id;
 *   4. a version-1 key migrates to exactly one version-2 id or to an explicit `ambiguous: 'needs seq'`, with a
 *      recorded migration step; unknown versions are refused;
 *   5. evidence events carry a typed target (S4-R14, S8(g)).
 */

export const IDENTITY_VERSION = 2 as const;

/** `kanji:<literal>` — the base's form, kept */
export type KanjiId = `kanji:${string}`;
/** `part:<literal>` — a part of the parts graph (S6-R6) */
export type PartId = `part:${string}`;
/** `reading:<kanji>|<hiragana reading>` — the base pair, kept; okurigana marks are part of the reading */
export type ReadingId = `reading:${string}`;
/** `entry:<seq>:<spelling>|<hiragana reading>` — the JMdict seq is part of the id */
export type EntryId = `entry:${string}`;
/** `<entry id>#s<index>` — scoped by its entry */
export type SenseId = `${EntryId}#s${number}`;
/** `task:<entry>|<reading>|<sense>|<modality>` */
export type TaskId = `task:${string}`;
/** `comp:<kanji id>:<position>` (SPEC-v1 §S6, "Component occurrence") */
export type ComponentOccurrenceId = `comp:${KanjiId}:${number}`;

export type Modality = 'recognition' | 'recall' | 'production' | 'listening' | 'reading' | 'writing' | 'speaking';
export const MODALITIES: readonly Modality[] = ['recognition', 'recall', 'production', 'listening', 'reading', 'writing', 'speaking'];

/** full provenance on every relation: the dataset, its pinned version and its licence */
export interface Provenance {
  readonly dataset: string;
  readonly version: string;
  readonly licence: string;
}

export interface Relation {
  readonly kanji: KanjiId;
  readonly reading: ReadingId;
  readonly entry: string;
  readonly provenance: Provenance;
}

export interface ComponentOccurrence {
  readonly id: ComponentOccurrenceId;
  readonly kanji: KanjiId;
  readonly position: number;
  readonly part: PartId;
}

/** the base's key, carried forward: version 1 is `spelling|reading` */
export interface IdentityRecordV1 {
  readonly version: 1;
  readonly key: string;
}

export interface MigrationStep {
  readonly from: 1;
  readonly to: typeof IDENTITY_VERSION;
  readonly rule: string;
}

export type MigrationResult =
  | { readonly version: 2; readonly from: string; readonly id: EntryId; readonly migration: readonly MigrationStep[] }
  | { readonly version: 2; readonly from: string; readonly id: null; readonly ambiguous: 'needs seq'; readonly candidates: readonly EntryId[]; readonly migration: readonly MigrationStep[] }
  | { readonly version: 2; readonly from: string; readonly id: null; readonly ambiguous: 'no candidate'; readonly candidates: readonly []; readonly migration: readonly MigrationStep[] };

export interface EntryCandidate {
  readonly seq: string | number;
  readonly spelling: string;
  readonly reading: string;
}

export interface LexicalTarget {
  readonly kind: 'lexical';
  readonly entry: EntryId;
}

export interface SectionRange {
  readonly start: number;
  readonly end: number;
  readonly wholeSentence: boolean;
  readonly validated: boolean;
  readonly forcedFirstWord?: boolean;
}

export interface SectionTarget {
  readonly kind: 'section';
  readonly sourceOccurrence: string;
  /** sha256, lowercase hex */
  readonly transcriptDigest: string;
  readonly range: SectionRange;
  readonly retypedFrom?: 'lexical';
  readonly lexicalConfidence?: 'confident' | 'uncertain';
}

export type EvidenceTarget = LexicalTarget | SectionTarget;

export interface EvidenceEventShape {
  readonly kind: string;
  readonly target: unknown;
}

export class IdentityError extends TypeError {
  override readonly name = 'IdentityError';
}

const toHiragana = (text: string): string =>
  text.replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const filled = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const plainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function need(ok: unknown, message: string): asserts ok {
  if (!ok) throw new IdentityError(message);
}
const SHA256 = /^[0-9a-f]{64}$/u;

export function kanjiId(literal: string): KanjiId {
  need(filled(literal), 'kanjiId: a kanji literal is required');
  return `kanji:${literal}`;
}

export function partId(literal: string): PartId {
  need(filled(literal), 'partId: a part literal is required');
  return `part:${literal}`;
}

export function readingId(input: { readonly kanji: string; readonly reading: string }): ReadingId {
  need(filled(input.kanji), 'readingId: a kanji is required');
  need(filled(input.reading), 'readingId: a reading is required');
  return `reading:${input.kanji}|${toHiragana(input.reading)}`;
}

export function entryId(input: { readonly seq: string | number; readonly spelling: string; readonly reading: string }): EntryId {
  need(input.seq != null && filled(String(input.seq)), 'entryId: an entry id needs its seq');
  need(filled(input.spelling), 'entryId: a spelling is required');
  need(filled(input.reading), 'entryId: a reading is required');
  return `entry:${String(input.seq)}:${input.spelling}|${toHiragana(input.reading)}`;
}

export function senseId(input: { readonly entry: EntryId; readonly index: number }): SenseId {
  need(filled(input.entry) && input.entry.startsWith('entry:'), 'senseId: an entry id is required');
  need(Number.isInteger(input.index) && input.index >= 1, 'senseId: a 1-based sense index is required');
  return `${input.entry}#s${input.index}`;
}

export function taskId(input: { readonly entry: EntryId; readonly reading: ReadingId; readonly sense: SenseId; readonly modality: Modality }): TaskId {
  need(filled(input.entry) && input.entry.startsWith('entry:'), 'taskId: an entry id is required');
  need(filled(input.reading) && input.reading.startsWith('reading:'), 'taskId: a reading id is required');
  need(filled(input.sense) && input.sense.startsWith(`${input.entry}#s`), 'taskId: a sense id of this entry is required');
  need(filled(input.modality) && (MODALITIES as readonly string[]).includes(input.modality), `taskId: a modality is required (${MODALITIES.join(', ')})`);
  return `task:${input.entry}|${input.reading}|${input.sense}|${input.modality}`;
}

export function validProvenance(provenance: unknown): provenance is Provenance {
  return plainObject(provenance) && (['dataset', 'version', 'licence'] as const).every((k) => filled(provenance[k]));
}

export function relate(input: { readonly reading: ReadingId; readonly kanji: KanjiId; readonly entry: string; readonly provenance: Provenance }): Relation {
  need(filled(input.reading) && input.reading.startsWith('reading:'), 'relate: a reading id is required');
  need(filled(input.kanji) && input.kanji.startsWith('kanji:'), 'relate: a kanji id is required');
  need(filled(input.entry), 'relate: an entry id is required');
  need(validProvenance(input.provenance), 'relate: provenance.dataset, provenance.version and provenance.licence are required');
  const { dataset, version, licence } = input.provenance;
  return { kanji: input.kanji, reading: input.reading, entry: input.entry, provenance: { dataset, version, licence } };
}

export function componentOccurrenceId(input: { readonly kanji: string; readonly position: number; readonly part: string }): ComponentOccurrence {
  const kanji = kanjiId(input.kanji);
  need(Number.isInteger(input.position) && input.position >= 1, 'componentOccurrenceId: a 1-based position is required');
  return { id: `comp:${kanji}:${input.position}`, kanji, position: input.position, part: partId(input.part) };
}

export function migrateIdentity(record: IdentityRecordV1, context: { readonly candidates?: readonly EntryCandidate[] }): MigrationResult {
  need(plainObject(record), 'migrateIdentity: an identity record is required');
  const version: unknown = (record as { version?: unknown }).version;
  need(version === 1, `migrateIdentity: unknown identity version ${version === undefined ? '(missing)' : JSON.stringify(version)}; only version 1 migrates to ${IDENTITY_VERSION}`);
  need(filled(record.key) && record.key.includes('|'), 'migrateIdentity: a version-1 key has the form spelling|reading');
  const bar = record.key.indexOf('|');
  const spelling = record.key.slice(0, bar);
  const reading = toHiragana(record.key.slice(bar + 1));
  const ids = [...new Set((context.candidates ?? [])
    .filter((c) => c.spelling === spelling && toHiragana(c.reading) === reading && c.seq != null)
    .map((c) => entryId(c)))].sort();
  const migration: readonly MigrationStep[] = [{ from: 1, to: IDENTITY_VERSION, rule: 'spelling|reading → entry:<seq>:spelling|reading; the seq comes from the candidate set' }];
  const first = ids[0];
  if (ids.length === 1 && first !== undefined) return { version: 2, from: record.key, id: first, migration };
  if (ids.length === 0) return { version: 2, from: record.key, id: null, ambiguous: 'no candidate', candidates: [], migration };
  return { version: 2, from: record.key, id: null, ambiguous: 'needs seq', candidates: ids, migration };
}

/** true, or throws IdentityError naming the first rule the target breaks */
export function validateEvidenceTarget(event: EvidenceEventShape): true {
  need(plainObject(event) && filled(event['kind']), 'evidence: an event with a kind is required');
  const target: unknown = event['target'];
  need(plainObject(target) && filled(target['kind']), 'evidence: untyped target; a target carries kind "lexical" or "section"');
  if (target['kind'] === 'lexical') {
    const entry = target['entry'];
    need(filled(entry) && entry.startsWith('entry:'), 'evidence: a lexical target needs its entry id');
    return true;
  }
  if (target['kind'] === 'section') {
    need(filled(target['sourceOccurrence']), 'evidence: a section target needs its source occurrence');
    const digest = target['transcriptDigest'];
    need(filled(digest) && SHA256.test(digest), 'evidence: a section target needs a sha256 transcript digest');
    const range: unknown = target['range'];
    need(plainObject(range) && Number.isInteger(range['start']) && Number.isInteger(range['end']) && (range['end'] as number) > (range['start'] as number), 'evidence: a section target needs a range');
    need(range['wholeSentence'] === true && range['validated'] === true && !range['forcedFirstWord'], 'evidence: a section must be a validated whole sentence, never forced to its first word');
    need(!(target['retypedFrom'] === 'lexical' && target['lexicalConfidence'] !== 'confident'), 'evidence: an uncertain lexical capture retyped as a section is refused');
    return true;
  }
  throw new IdentityError(`evidence: untyped target kind ${JSON.stringify(target['kind'])}`);
}
