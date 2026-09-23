/** A2: multidimensional monthly truth, with non-retrieval authority kept apart. */

import { describe, expect, it } from 'vitest';

import {
  availableMonthlyTruthMonths,
  canonicalJson,
  componentIdForTargetKey,
  deriveMonthlyTruth,
  IdempotencyConflictError,
  MonthlyTruthProjectionError,
  parseEventLog,
  type DomainEvent,
} from '../../src/index.ts';
import {
  candidateAcceptedAsNote,
  candidateAttached,
  contractCreated,
  encounterCaptured,
  exposureLogged,
  lookupFrictionLogged,
  productionObserved,
  reviewGraded,
  threadPromotionChanged,
  USER_PROVENANCE,
} from '../support/events.ts';

type Raw = Record<string, unknown>;

const AUG = {
  capture: '2026-08-01T00:00:00.000Z',
  keep: '2026-08-01T00:01:00.000Z',
  learn: '2026-08-01T00:02:00.000Z',
  master: '2026-08-01T00:03:00.000Z',
  contract: '2026-08-02T10:00:00.000Z',
  review: '2026-08-03T10:00:00.000Z',
  signal: '2026-08-04T10:00:00.000Z',
} as const;

const THREAD = 'thread-monthly';
const TARGET = '分岐';
const COMPONENT = componentIdForTargetKey(TARGET);

function contract(
  id: string,
  skill:
    | 'orthography_to_reading'
    | 'form_to_meaning'
    | 'meaning_to_production'
    | 'audio_to_meaning'
    | 'discrimination',
  overrides: Raw = {},
): Raw {
  return contractCreated(
    {
      eventId: `ev-${id}`,
      at: AUG.contract,
      contractId: id,
      componentId: COMPONENT,
    },
    { skill, ...overrides },
  );
}

function rubricContract(id: string): Raw {
  const event = contract(id, 'meaning_to_production', {
    cueModality: 'text',
    responseModality: 'free',
    rubricId: 'rubric-monthly-production',
    rubricVersion: '1',
    hintPolicy: { hintsAllowed: false, maxHints: 0 },
  });
  delete event['acceptedAnswers'];
  return event;
}

function fullLog(): readonly DomainEvent[] {
  const raw: Raw[] = [
    encounterCaptured(
      {
        eventId: 'ev-capture-monthly',
        at: AUG.capture,
        encounterId: 'encounter-monthly',
        threadId: THREAD,
        text: `${TARGET}点`,
      },
      {
        span: { start: 0, end: TARGET.length },
        uncertaintyMark: true,
        sourceRef: { sourceId: 'source-monthly', kind: 'text', locator: 'p:1' },
      },
    ),
    threadPromotionChanged({
      eventId: 'ev-promote-keep',
      at: AUG.keep,
      threadId: THREAD,
      from: 'captured',
      to: 'keep',
    }),
    threadPromotionChanged({
      eventId: 'ev-promote-learn',
      at: AUG.learn,
      threadId: THREAD,
      from: 'keep',
      to: 'learn',
    }),
    threadPromotionChanged({
      eventId: 'ev-promote-master',
      at: AUG.master,
      threadId: THREAD,
      from: 'learn',
      to: 'master',
    }),
    contract('contract-recognition', 'form_to_meaning', {
      responseModality: 'choice',
      acceptedAnswers: ['a branching point'],
    }),
    contract('contract-meaning', 'form_to_meaning', {
      responseModality: 'text',
      acceptedAnswers: ['a branching point'],
    }),
    rubricContract('contract-production'),
    contract('contract-listening', 'audio_to_meaning', {
      cueModality: 'audio',
      responseModality: 'choice',
      acceptedAnswers: ['a branching point'],
    }),
    contract('contract-reading', 'orthography_to_reading', {
      responseModality: 'text',
      acceptedAnswers: ['ぶんき'],
    }),
    contract('contract-discrimination', 'discrimination', {
      responseModality: 'choice',
      acceptedAnswers: ['分岐'],
    }),
    reviewGraded({
      eventId: 'ev-review-recognition',
      at: AUG.review,
      contractId: 'contract-recognition',
    }),
    reviewGraded({
      eventId: 'ev-review-meaning',
      at: AUG.review,
      contractId: 'contract-meaning',
    }),
    reviewGraded({
      eventId: 'ev-review-production',
      at: AUG.review,
      contractId: 'contract-production',
    }),
    reviewGraded({
      eventId: 'ev-review-listening',
      at: AUG.review,
      contractId: 'contract-listening',
    }),
    reviewGraded({
      eventId: 'ev-review-reading',
      at: AUG.review,
      contractId: 'contract-reading',
    }),
    reviewGraded({
      eventId: 'ev-review-discrimination',
      at: AUG.review,
      contractId: 'contract-discrimination',
    }),
    productionObserved(
      { eventId: 'ev-production-observed', at: AUG.review, tier: 'B' },
      {
        contractId: 'contract-production',
        rubricId: 'rubric-monthly-production',
        rubricVersion: '1',
      },
    ),
    exposureLogged(
      { eventId: 'ev-exposure', at: AUG.signal },
      { componentIds: [COMPONENT], experienceId: 'passage-monthly' },
    ),
    lookupFrictionLogged(
      { eventId: 'ev-lookup', at: AUG.signal },
      { targetRef: { targetType: 'lexeme', targetId: 'lex-bunki' }, context: 'reading' },
    ),
    candidateAttached({
      eventId: 'ev-ai-attached',
      at: AUG.signal,
      threadId: THREAD,
      candidateId: 'candidate-monthly',
    }),
    candidateAcceptedAsNote({
      eventId: 'ev-ai-accepted',
      at: AUG.signal,
      candidateId: 'candidate-monthly',
    }),
    encounterCaptured(
      {
        eventId: 'ev-import',
        at: AUG.signal,
        encounterId: 'encounter-import',
        threadId: 'thread-import',
        text: '移行',
      },
      {
        sourceRef: { sourceId: 'anki-import-1', kind: 'import', locator: 'note:7' },
        provenance: {
          ...USER_PROVENANCE,
          source: 'anki_import',
          modificationStatus: 'derived',
        },
      },
    ),
  ];
  return parseEventLog(raw, { path: '<monthly-full-log>' });
}

function lens(truth: ReturnType<typeof deriveMonthlyTruth>, id: string) {
  const found = truth.capabilities.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing capability lens ${id}`);
  return found;
}

function allKeys(value: unknown, out = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => allKeys(entry, out));
    return out;
  }
  if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      out.add(key.toLowerCase());
      allKeys(child, out);
    });
  }
  return out;
}

describe('deriveMonthlyTruth', () => {
  it('keeps seven capabilities and source exposure visibly separate, with no scalar leak', () => {
    const truth = deriveMonthlyTruth(fullLog(), '2026-08');

    expect(truth.capabilities.map((entry) => entry.id)).toEqual([
      'recognition',
      'meaning_recall',
      'production',
      'listening',
      'kanji_reading',
      'writing',
      'grammar_discrimination',
    ]);
    expect(truth.sourceExposure.id).toBe('source_familiarity_exposure');
    expect(truth.sourceExposure.familiarityStanding).toBe('not_inferred');

    expect(lens(truth, 'recognition').retrievalClaims).toHaveLength(1);
    expect(lens(truth, 'meaning_recall').retrievalClaims).toHaveLength(1);
    expect(lens(truth, 'production').retrievalClaims).toHaveLength(1);
    expect(lens(truth, 'production').productionObservations).toHaveLength(1);
    expect(lens(truth, 'listening').retrievalClaims).toHaveLength(1);
    expect(lens(truth, 'kanji_reading').retrievalClaims).toEqual([]);
    expect(lens(truth, 'writing').support).toEqual({
      kind: 'unresolved_in_v1',
      reason: 'no_writing_retrieval_skill',
    });
    expect(lens(truth, 'grammar_discrimination').retrievalClaims).toEqual([]);

    const claim = lens(truth, 'meaning_recall').retrievalClaims[0];
    expect(claim).toMatchObject({
      kind: 'recorded_retrieval_claim',
      authority: {
        kind: 'recorded_claim',
        reason: 'response_and_grader_authority_not_recorded_in_v1',
      },
      gate: { kind: 'admitted_by_replay_gate', effectiveGrade: 'good' },
    });
    expect(lens(truth, 'meaning_recall').contracts[0]?.currentSchedule).toMatchObject({
      standing: 'current_at_replay_end_not_historical_month_end',
      admittedReviewCount: 1,
    });

    expect(truth.unresolvedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'contract',
          contractId: 'contract-reading',
          reason: 'orthography_target_kind_missing',
        }),
        expect.objectContaining({
          kind: 'recorded_retrieval_claim',
          contractId: 'contract-reading',
          reason: 'orthography_target_kind_missing',
        }),
        expect.objectContaining({
          contractId: 'contract-discrimination',
          reason: 'discrimination_target_kind_missing',
        }),
      ]),
    );

    expect(truth.nonRetrievalSignals.exposure.map((signal) => signal.kind)).toEqual(['exposure']);
    expect(truth.nonRetrievalSignals.selfReport.map((signal) => signal.kind)).toEqual([
      'self_report',
    ]);
    expect(truth.nonRetrievalSignals.lookup.map((signal) => signal.kind)).toEqual(['lookup']);
    expect(truth.nonRetrievalSignals.ai.map((signal) => signal.kind)).toEqual(['ai', 'ai']);
    expect(truth.nonRetrievalSignals.import.map((signal) => signal.kind)).toEqual(['import']);
    expect(truth.nonRetrievalSignals.exposure[0]).toMatchObject({
      standing: 'exposure_only_never_retrieval',
      sourceLink: { kind: 'unresolved', reason: 'exposure_event_has_no_source_ref' },
    });
    expect(truth.sourceExposure.exposureEventIds).toEqual(['ev-exposure']);

    const forbidden = [
      'mastery',
      'level',
      'overall',
      'percentage',
      'percent',
      'score',
      'rank',
      'known',
    ];
    const keys = allKeys(truth);
    forbidden.forEach((key) => expect(keys.has(key), `forbidden aggregate key ${key}`).toBe(false));
    expect(canonicalJson(truth)).toBe(canonicalJson(deriveMonthlyTruth(fullLog(), '2026-08')));
  });

  it('uses exact UTC boundaries and returns available applied months newest first', () => {
    const at = [
      '2026-07-31T23:59:59.999Z',
      '2026-08-01T00:00:00.000Z',
      '2026-08-31T23:59:59.999Z',
      '2026-09-01T00:00:00.000Z',
    ] as const;
    const events = parseEventLog(
      at.map((instant, index) =>
        encounterCaptured({
          eventId: `ev-boundary-${String(index)}`,
          at: instant,
          encounterId: `enc-boundary-${String(index)}`,
          threadId: `thread-boundary-${String(index)}`,
          text: `境${String(index)}`,
        }),
      ),
    );

    const august = deriveMonthlyTruth(events, '2026-08');
    expect(august.sourceExposure.sourceEncounters.map((entry) => entry.occurredAt)).toEqual([
      '2026-08-01T00:00:00.000Z',
      '2026-08-31T23:59:59.999Z',
    ]);
    expect(availableMonthlyTruthMonths(events)).toEqual(['2026-09', '2026-08', '2026-07']);
  });

  it('skips byte-identical re-appends, rejects conflicts and malformed runtime input', () => {
    const event = parseEventLog([
      encounterCaptured({
        eventId: 'ev-duplicate',
        at: AUG.capture,
        encounterId: 'enc-duplicate',
        threadId: 'thread-duplicate',
        text: '重複',
      }),
    ])[0];
    if (event === undefined) throw new Error('fixture did not parse');

    const duplicateTruth = deriveMonthlyTruth([event, event], '2026-08');
    expect(duplicateTruth.sourceExposure.sourceEncounters).toHaveLength(1);

    const conflict = parseEventLog([
      encounterCaptured(
        {
          eventId: 'ev-conflict-a',
          at: AUG.capture,
          encounterId: 'enc-conflict-a',
          threadId: 'thread-conflict-a',
          text: '甲',
        },
        { idempotencyKey: 'same-key' },
      ),
      encounterCaptured(
        {
          eventId: 'ev-conflict-b',
          at: AUG.keep,
          encounterId: 'enc-conflict-b',
          threadId: 'thread-conflict-b',
          text: '乙',
        },
        { idempotencyKey: 'same-key' },
      ),
    ]);
    expect(() => deriveMonthlyTruth(conflict, '2026-08')).toThrow(IdempotencyConflictError);
    expect(() => deriveMonthlyTruth([], '2026-13')).toThrow(MonthlyTruthProjectionError);
    expect(() =>
      deriveMonthlyTruth(
        [
          {
            eventId: 'ev-unknown',
            idempotencyKey: 'unknown',
            occurredAt: AUG.capture,
            type: 'FutureAbilityInferred',
            v: 99,
          } as unknown as DomainEvent,
        ],
        '2026-08',
      ),
    ).toThrow(/Unknown event schema version 99/);
  });

  it('deep-freezes every returned branch', () => {
    const truth = deriveMonthlyTruth(fullLog(), '2026-08');
    expect(Object.isFrozen(truth)).toBe(true);
    expect(Object.isFrozen(truth.capabilities)).toBe(true);
    expect(Object.isFrozen(truth.capabilities[0]?.retrievalClaims)).toBe(true);
    expect(Object.isFrozen(truth.nonRetrievalSignals.exposure[0]?.componentIds)).toBe(true);
    expect(() => {
      (truth.capabilities as unknown as unknown[]).push('forged');
    }).toThrow(TypeError);
  });
});
