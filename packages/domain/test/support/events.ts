/**
 * Test builders for the v1 event catalog (WP-02).
 *
 * These produce raw JSON-shaped objects rather than parsed events, so a test
 * can hand the same value to `parseEvent` (to check validation) or to
 * `parseEventLog` + `replay` (to check projection) without a cast. Every
 * builder emits a valid event by default; a test breaks exactly the one field
 * it is about via the `overrides` argument, which keeps the interesting part of
 * each test visible instead of buried in twenty lines of fixture.
 */

import type { ProvenanceRecord, SourceRef } from '../../src/index.ts';

export const AT = {
  t0: '2026-07-27T09:00:00.000Z',
  t1: '2026-07-27T09:01:00.000Z',
  t2: '2026-07-27T09:02:00.000Z',
  t3: '2026-07-27T09:03:00.000Z',
  t4: '2026-07-27T09:04:00.000Z',
  t5: '2026-07-27T09:05:00.000Z',
} as const;

export const USER_PROVENANCE: ProvenanceRecord = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'user_reviewed',
};

export const READER_SOURCE: SourceRef = {
  sourceId: 'source-nhk-easy-2026-07-27',
  kind: 'text',
  locator: 'https://example.invalid/article/1#p2',
};

type Raw = Record<string, unknown>;

const envelope = (eventId: string, occurredAt: string, idempotencyKey?: string): Raw => ({
  eventId,
  v: 1,
  occurredAt,
  idempotencyKey: idempotencyKey ?? `idem-${eventId}`,
});

export function encounterCaptured(
  args: { eventId: string; at: string; encounterId: string; threadId: string; text?: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'EncounterCaptured',
    encounterId: args.encounterId,
    threadId: args.threadId,
    text: args.text ?? '峠を越えた。',
    sourceRef: READER_SOURCE,
    provenance: USER_PROVENANCE,
    ...overrides,
  };
}

export function threadPromotionChanged(
  args: {
    eventId: string;
    at: string;
    threadId: string;
    from: string;
    to: string;
    origin?: string;
  },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'ThreadPromotionChanged',
    threadId: args.threadId,
    from: args.from,
    to: args.to,
    origin: args.origin ?? 'user',
    ...overrides,
  };
}

export function contractCreated(
  args: { eventId: string; at: string; contractId: string; componentId?: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'ContractCreated',
    contractId: args.contractId,
    contractVersion: 1,
    targetComponentId: args.componentId ?? 'component-0001',
    skill: 'form_to_meaning',
    cueModality: 'text',
    responseModality: 'text',
    acceptedAnswers: ['mountain pass'],
    hintPolicy: { hintsAllowed: true, maxHints: 1 },
    revealPolicy: { revealAllowed: true, revealIsRecorded: true },
    promptFamilyVersion: 'pf-2026-07-27.1',
    ...overrides,
  };
}

export function reviewGraded(
  args: { eventId: string; at: string; contractId: string; grade?: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'ReviewGraded',
    contractId: args.contractId,
    grade: args.grade ?? 'good',
    latencyMs: 4200,
    hintsUsed: 0,
    revealedBeforeRecall: false,
    probeContext: 'standalone',
    tier: 'A',
    ...overrides,
  };
}

export function productionObserved(
  args: { eventId: string; at: string; tier?: 'B' | 'C' },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'ProductionObserved',
    elicited: true,
    tier: args.tier ?? 'B',
    rubricId: 'rubric-production-basic',
    rubricVersion: '1.0.0',
    ...overrides,
  };
}

export function exposureLogged(args: { eventId: string; at: string }, overrides: Raw = {}): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'ExposureLogged',
    componentIds: ['component-0001'],
    experienceId: 'experience-0001',
    tier: 'D',
    ...overrides,
  };
}

export function lookupFrictionLogged(
  args: { eventId: string; at: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'LookupFrictionLogged',
    targetRef: { targetType: 'lexeme', targetId: 'lexeme-0001' },
    context: 'reading',
    ...overrides,
  };
}

export function candidateAttached(
  args: { eventId: string; at: string; threadId: string; candidateId: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'CandidateAttached',
    threadId: args.threadId,
    candidateId: args.candidateId,
    envelope: {
      taskClass: 'T2',
      inputHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      promptFamilyId: 'pf-gloss',
      promptVersion: '1.0.0',
      model: 'offline-fallback',
      provider: 'fixture',
      createdAt: args.at,
      checks: { targetFormPresent: true, isLabeled: true },
    },
    status: 'generated',
    ...overrides,
  };
}

export function candidateAcceptedAsNote(
  args: { eventId: string; at: string; candidateId: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'CandidateAcceptedAsNote',
    candidateId: args.candidateId,
    userAction: true,
    ...overrides,
  };
}

export function evidenceSuperseded(
  args: { eventId: string; at: string; supersededEventId: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'EvidenceSuperseded',
    supersededEventId: args.supersededEventId,
    reason: 'user_correction',
    correction: { note: 'graded the wrong contract' },
    ...overrides,
  };
}

export function sessionStarted(
  args: { eventId: string; at: string; sessionId: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'SessionStarted',
    sessionId: args.sessionId,
    budget: { timeBudgetMin: 12, newBudget: 1 },
    ...overrides,
  };
}

export function sessionClosed(
  args: { eventId: string; at: string; sessionId: string; completionState?: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'SessionClosed',
    sessionId: args.sessionId,
    completionState: args.completionState ?? 'completed',
    ...overrides,
  };
}

export function dataExported(args: { eventId: string; at: string }, overrides: Raw = {}): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'DataExported',
    exportVersion: '1',
    scope: { kind: 'all' },
    ...overrides,
  };
}

export function threadTombstoned(
  args: { eventId: string; at: string; threadId: string },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'ThreadTombstoned',
    threadId: args.threadId,
    reason: 'user_deleted',
    ...overrides,
  };
}

export function contentPurged(
  args: { eventId: string; at: string; tombstoneEventId: string; targetIds: string[] },
  overrides: Raw = {},
): Raw {
  return {
    ...envelope(args.eventId, args.at),
    type: 'ContentPurged',
    targetIds: args.targetIds,
    tombstoneEventId: args.tombstoneEventId,
    ...overrides,
  };
}

/**
 * One valid raw event of every family, keyed by type.
 *
 * Tests that must cover the whole catalog iterate this rather than listing
 * families by hand, so adding a family to the catalog without adding it here
 * fails the coverage test instead of silently going untested.
 */
export function oneOfEachFamily(): Record<string, Raw> {
  return {
    EncounterCaptured: encounterCaptured({
      eventId: 'e-cap',
      at: AT.t0,
      encounterId: 'encounter-1',
      threadId: 'thread-1',
    }),
    ThreadPromotionChanged: threadPromotionChanged({
      eventId: 'e-promo',
      at: AT.t1,
      threadId: 'thread-1',
      from: 'captured',
      to: 'keep',
    }),
    ContractCreated: contractCreated({
      eventId: 'e-contract',
      at: AT.t1,
      contractId: 'contract-1',
    }),
    ReviewGraded: reviewGraded({ eventId: 'e-review', at: AT.t2, contractId: 'contract-1' }),
    ProductionObserved: productionObserved({ eventId: 'e-production', at: AT.t2 }),
    ExposureLogged: exposureLogged({ eventId: 'e-exposure', at: AT.t2 }),
    LookupFrictionLogged: lookupFrictionLogged({ eventId: 'e-lookup', at: AT.t2 }),
    CandidateAttached: candidateAttached({
      eventId: 'e-candidate',
      at: AT.t3,
      threadId: 'thread-1',
      candidateId: 'candidate-1',
    }),
    CandidateAcceptedAsNote: candidateAcceptedAsNote({
      eventId: 'e-candidate-accept',
      at: AT.t3,
      candidateId: 'candidate-1',
    }),
    EvidenceSuperseded: evidenceSuperseded({
      eventId: 'e-supersede',
      at: AT.t4,
      supersededEventId: 'e-review',
    }),
    SessionStarted: sessionStarted({
      eventId: 'e-session-open',
      at: AT.t0,
      sessionId: 'session-1',
    }),
    SessionClosed: sessionClosed({ eventId: 'e-session-close', at: AT.t5, sessionId: 'session-1' }),
    DataExported: dataExported({ eventId: 'e-export', at: AT.t5 }),
    ThreadTombstoned: threadTombstoned({ eventId: 'e-tombstone', at: AT.t5, threadId: 'thread-1' }),
    ContentPurged: contentPurged({
      eventId: 'e-purge',
      at: AT.t5,
      tombstoneEventId: 'e-tombstone',
      targetIds: ['thread-1'],
    }),
  };
}
