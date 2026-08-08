/** Canonical data adapter for the A1 静かな朝 → 自分 loop. */

import {
  learnContractIdentity,
  type DomainEvent,
  type EncounterCapturedEvent,
  type LearnContractPairSpecification,
  type ProvenanceRecord,
} from '@bunki/domain';
import {
  GOLDEN_SOURCE_ANCHOR_ID,
  GOLDEN_SOURCE_ID,
  findLexeme,
  findSource,
  seedDataset,
  type ProvenanceRecord as SeedProvenanceRecord,
  type SeedLexeme,
  type SeedPassage,
  type SeedSource,
  type SeedSourceAnchor,
} from '@bunki/seed';

import type {
  ActivateLearnCommand,
  CaptureCommand,
  RecordLookupFrictionCommand,
} from '../state/store.ts';

/** The authored passage in which the exact source target is met again. */
export const GOLDEN_REINTRODUCTION_PASSAGE_ID = 'pas-bunki-01';

/** One guided quick-look gesture, stable across a double dispatch or reload. */
export const GOLDEN_LOOKUP_ID = `${GOLDEN_SOURCE_ID}:${GOLDEN_SOURCE_ANCHOR_ID}:quick-look:v1`;

const SPECIFICATION_ID = `bunki:a1:${GOLDEN_SOURCE_ID}:${GOLDEN_SOURCE_ANCHOR_ID}:lex-jibun`;
const SPECIFICATION_VERSION = 1;

export interface GoldenSourceStudy {
  readonly source: SeedSource;
  readonly anchor: SeedSourceAnchor;
  readonly lexeme: SeedLexeme;
  readonly passage: SeedPassage;
  readonly targetText: string;
  readonly specification: LearnContractPairSpecification;
}

function fail(message: string): never {
  throw new Error(`Golden source fixture is invalid: ${message}`);
}

/**
 * Translate the seed registry's richer provenance vocabulary into ADR-002's
 * frozen event vocabulary without upgrading its standing.
 */
function eventProvenance(record: SeedProvenanceRecord): ProvenanceRecord {
  const modificationStatus =
    record.modification_status === 'derived'
      ? ('derived' as const)
      : record.modification_status === 'unmodified'
        ? ('unmodified' as const)
        : // `original` describes authorship in the seed registry. The event is
          // carrying that original text unchanged, which ADR-002 calls
          // `unmodified`; calling it `derived` would be the false claim.
          ('unmodified' as const);
  const reviewStatus =
    record.review_status === 'unreviewed' ? ('unreviewed' as const) : ('user_reviewed' as const);
  const confidence = record.confidence === 'high' ? 1 : record.confidence === 'medium' ? 0.7 : 0.4;

  return Object.freeze({
    source: record.source,
    sourceVersion: record.source_version,
    license: record.license,
    attribution: record.attribution,
    modificationStatus,
    confidence,
    reviewStatus,
  });
}

function buildStudy(): GoldenSourceStudy {
  const source = findSource(GOLDEN_SOURCE_ID);
  if (source === undefined) fail(`missing source ${GOLDEN_SOURCE_ID}`);
  const anchor = source.anchors.find((candidate) => candidate.id === GOLDEN_SOURCE_ANCHOR_ID);
  if (anchor === undefined) fail(`missing anchor ${GOLDEN_SOURCE_ANCHOR_ID}`);
  const lexeme = findLexeme(anchor.lexemeId);
  if (lexeme === undefined) fail(`anchor names missing lexeme ${anchor.lexemeId}`);
  const passage = seedDataset.passages.find(
    (candidate) => candidate.id === GOLDEN_REINTRODUCTION_PASSAGE_ID,
  );
  if (passage === undefined) fail(`missing passage ${GOLDEN_REINTRODUCTION_PASSAGE_ID}`);
  if (!passage.lexemeIds.includes(lexeme.id)) {
    fail(`${passage.id} does not declare ${lexeme.id}`);
  }

  const targetText = source.body.slice(anchor.start, anchor.end);
  if (targetText !== lexeme.headword) {
    fail(
      `${source.id}[${String(anchor.start)},${String(anchor.end)}) is ${JSON.stringify(targetText)}, not ${JSON.stringify(lexeme.headword)}`,
    );
  }
  if (!passage.body.includes(targetText)) {
    fail(`${passage.id} does not contain exact target ${JSON.stringify(targetText)}`);
  }

  const specification: LearnContractPairSpecification = Object.freeze({
    specificationId: SPECIFICATION_ID,
    specificationVersion: SPECIFICATION_VERSION,
    reading: Object.freeze({
      cueModality: 'text',
      responseModality: 'text',
      gradingMethod: Object.freeze({
        kind: 'accepted_answers',
        acceptedAnswers: Object.freeze([lexeme.reading]),
      }),
      hintPolicy: Object.freeze({ hintsAllowed: true, maxHints: 1 }),
      revealPolicy: Object.freeze({ revealAllowed: true, revealIsRecorded: true }),
      promptFamilyVersion: 'bunki-a1-reading@1',
    }),
    meaning: Object.freeze({
      cueModality: 'text',
      responseModality: 'text',
      gradingMethod: Object.freeze({
        kind: 'accepted_answers',
        acceptedAnswers: Object.freeze([...lexeme.senses]),
      }),
      hintPolicy: Object.freeze({ hintsAllowed: true, maxHints: 1 }),
      revealPolicy: Object.freeze({ revealAllowed: true, revealIsRecorded: true }),
      promptFamilyVersion: 'bunki-a1-meaning@1',
    }),
  });

  return Object.freeze({ source, anchor, lexeme, passage, targetText, specification });
}

const STUDY = buildStudy();
const EVENT_PROVENANCE = eventProvenance(STUDY.source.provenance.body);

/** One validated fixture object, shared by routes, screens, and tests. */
export function goldenSourceStudy(): GoldenSourceStudy {
  return STUDY;
}

/** Capture the full authored source while selecting only the canonical span. */
export function goldenCaptureCommand(): CaptureCommand {
  return {
    kind: 'capture',
    text: STUDY.source.body,
    span: { start: STUDY.anchor.start, end: STUDY.anchor.end },
    sourceRef: {
      sourceId: STUDY.source.id,
      kind: 'text',
      locator: `anchor:${STUDY.anchor.id}`,
    },
    provenance: EVENT_PROVENANCE,
    uncertainty: null,
    lexemeId: STUDY.lexeme.id,
  };
}

/**
 * Find only the authored encounter this route is entitled to claim.
 *
 * Matching on target text alone would let an unrelated manual capture of 自分
 * unlock the source workflow. The full body, frozen coordinates, source
 * reference, and provenance must all agree; otherwise the route stays closed.
 */
export function findGoldenSourceCapture(
  events: readonly DomainEvent[],
): EncounterCapturedEvent | null {
  return (
    events.find(
      (event): event is EncounterCapturedEvent =>
        event.type === 'EncounterCaptured' &&
        event.text === STUDY.source.body &&
        event.span?.start === STUDY.anchor.start &&
        event.span.end === STUDY.anchor.end &&
        event.text.slice(event.span.start, event.span.end) === STUDY.targetText &&
        event.sourceRef.sourceId === STUDY.source.id &&
        event.sourceRef.kind === 'text' &&
        event.sourceRef.locator === `anchor:${STUDY.anchor.id}` &&
        event.provenance.source === EVENT_PROVENANCE.source &&
        event.provenance.sourceVersion === EVENT_PROVENANCE.sourceVersion &&
        event.provenance.license === EVENT_PROVENANCE.license &&
        event.provenance.attribution === EVENT_PROVENANCE.attribution &&
        event.provenance.modificationStatus === EVENT_PROVENANCE.modificationStatus &&
        event.provenance.confidence === EVENT_PROVENANCE.confidence &&
        event.provenance.reviewStatus === EVENT_PROVENANCE.reviewStatus,
    ) ?? null
  );
}

/** The explicit quick look; intentionally has no grade-bearing field. */
export function goldenLookupCommand(): RecordLookupFrictionCommand {
  return {
    kind: 'recordLookupFriction',
    userAction: true,
    lookupId: GOLDEN_LOOKUP_ID,
    targetRef: { targetType: 'lexeme', targetId: STUDY.lexeme.id },
    context: 'reading',
  };
}

/** The explicit user gesture that activates the immutable pair. */
export function goldenLearnCommand(threadId: string): ActivateLearnCommand {
  return {
    kind: 'activateLearn',
    userAction: true,
    threadId,
    specification: STUDY.specification,
  };
}

/** Stable identities used to read progress; creation remains in the domain. */
export function goldenContractIds(threadId: string): Readonly<{
  reading: ReturnType<typeof learnContractIdentity>;
  meaning: ReturnType<typeof learnContractIdentity>;
}> {
  return Object.freeze({
    reading: learnContractIdentity(threadId, STUDY.specification, 'orthography_to_reading'),
    meaning: learnContractIdentity(threadId, STUDY.specification, 'form_to_meaning'),
  });
}

/** Only this exact source/anchor pair is a valid guided return target. */
export function isGoldenSourceReturn(sourceId: string | undefined, anchorId: string | undefined) {
  return sourceId === STUDY.source.id && anchorId === STUDY.anchor.id;
}
