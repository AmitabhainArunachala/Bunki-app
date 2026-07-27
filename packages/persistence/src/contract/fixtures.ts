/**
 * Event fixtures for the port contract suite (WP-03).
 *
 * Hand-written literals rather than `@bunki/domain`'s factories, for one
 * reason: the suite has to construct evidence-class events (`ReviewGraded`) and
 * the generic factory deliberately refuses to (REQ-ARCH-04 — only the evidence
 * gate mints those, and the gate is WP-06's). A fixture set that used factories
 * where it could and literals where it could not would be less legible than one
 * that is consistently literal.
 *
 * Nothing is lost by that choice: every event is re-parsed by
 * `@bunki/domain`'s fail-closed parser on the way into a store, so a fixture
 * that drifted from the schema fails immediately and loudly rather than testing
 * a shape the product cannot hold.
 *
 * All ids and timestamps are fixed strings. The suite must be able to compare
 * exported bytes, and a fixture that reached for a clock would make that a
 * coin toss.
 */

import type {
  CandidateAcceptedAsNoteEvent,
  CandidateAttachedEvent,
  ContentPurgedEvent,
  ContractCreatedEvent,
  DomainEvent,
  EncounterCapturedEvent,
  ReviewGradedEvent,
  SessionClosedEvent,
  SessionStartedEvent,
  ThreadPromotionChangedEvent,
  ThreadTombstonedEvent,
} from '@bunki/domain';

export const T = {
  thread: 'thread-c1',
  otherThread: 'thread-c2',
  encounter: 'encounter-c1',
  secondEncounter: 'encounter-c2',
  contract: 'contract-c1',
  candidate: 'candidate-c1',
  session: 'session-c1',
} as const;

/**
 * The text the purge test proves is gone.
 *
 * Distinctive on purpose: a scan of raw storage for this string must return
 * zero hits after a purge, and a generic string like "hello" could match
 * something incidental and make the assertion pass for the wrong reason.
 *
 * Named a canary rather than a secret because controller §15's pre-commit scan
 * greps staged diffs for `secret`. A fixture constant that trips the repository's
 * own secret detector on every commit trains everyone to ignore it, which is a
 * worse outcome than any naming preference.
 */
export const PURGE_CANARY_TEXT = '峠を越えると視界が開けた・PURGE-CANARY-9f3c';

export const SECOND_PURGE_CANARY_TEXT = '分岐点で道を選ぶ・PURGE-CANARY-4a71';

export function encounterCaptured(overrides?: {
  eventId?: string;
  threadId?: string;
  encounterId?: string;
  text?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  license?: string;
  attribution?: string;
  sourceId?: string;
  locator?: string;
}): EncounterCapturedEvent {
  const eventId = overrides?.eventId ?? 'evt-c001';
  return {
    eventId,
    v: 1,
    occurredAt: overrides?.occurredAt ?? '2026-07-27T08:00:00.000Z',
    idempotencyKey: overrides?.idempotencyKey ?? `capture:${eventId}`,
    type: 'EncounterCaptured',
    encounterId: overrides?.encounterId ?? T.encounter,
    threadId: overrides?.threadId ?? T.thread,
    text: overrides?.text ?? PURGE_CANARY_TEXT,
    sourceRef: {
      sourceId: overrides?.sourceId ?? 'source-contract-suite',
      kind: 'text',
      locator: overrides?.locator ?? 'https://example.invalid/private/page#42',
    },
    provenance: {
      source: 'user_encounter',
      sourceVersion: '2026-07-27',
      license: overrides?.license ?? 'user_owned',
      attribution: overrides?.attribution ?? 'captured by the learner while reading',
      modificationStatus: 'unmodified',
      confidence: 1,
      reviewStatus: 'user_reviewed',
    },
  };
}

export function threadPromoted(overrides?: {
  eventId?: string;
  threadId?: string;
  from?: 'captured' | 'keep' | 'learn' | 'master';
  to?: 'captured' | 'keep' | 'learn' | 'master';
  occurredAt?: string;
  idempotencyKey?: string;
}): ThreadPromotionChangedEvent {
  const eventId = overrides?.eventId ?? 'evt-c002';
  return {
    eventId,
    v: 1,
    occurredAt: overrides?.occurredAt ?? '2026-07-27T08:05:00.000Z',
    idempotencyKey: overrides?.idempotencyKey ?? `promote:${eventId}`,
    type: 'ThreadPromotionChanged',
    threadId: overrides?.threadId ?? T.thread,
    from: overrides?.from ?? 'captured',
    to: overrides?.to ?? 'keep',
    origin: 'user',
  };
}

export function contractCreated(overrides?: {
  eventId?: string;
  contractId?: string;
  occurredAt?: string;
}): ContractCreatedEvent {
  const eventId = overrides?.eventId ?? 'evt-c003';
  return {
    eventId,
    v: 1,
    occurredAt: overrides?.occurredAt ?? '2026-07-27T08:10:00.000Z',
    idempotencyKey: `contract:${eventId}`,
    type: 'ContractCreated',
    contractId: overrides?.contractId ?? T.contract,
    contractVersion: 1,
    targetComponentId: 'component-c1',
    skill: 'form_to_meaning',
    cueModality: 'text',
    responseModality: 'free',
    acceptedAnswers: ['a fork in the path'],
    hintPolicy: { hintsAllowed: true, maxHints: 1 },
    revealPolicy: { revealAllowed: true, revealIsRecorded: true },
    promptFamilyVersion: 'pf-1',
  };
}

/**
 * An evidence-class event, written as a literal.
 *
 * The suite needs one in the log to prove `readStream({contractId})` and the
 * export round trip carry evidence, not to make any judgement about it. Whether
 * this grade counts, and what it does to a memory state, is the gate's word
 * (WP-06) and appears nowhere in this package.
 */
export function reviewGraded(overrides?: {
  eventId?: string;
  contractId?: string;
  occurredAt?: string;
}): ReviewGradedEvent {
  const eventId = overrides?.eventId ?? 'evt-c004';
  return {
    eventId,
    v: 1,
    occurredAt: overrides?.occurredAt ?? '2026-07-27T08:20:00.000Z',
    idempotencyKey: `review:${eventId}`,
    type: 'ReviewGraded',
    contractId: overrides?.contractId ?? T.contract,
    grade: 'good',
    latencyMs: 3400,
    hintsUsed: 0,
    revealedBeforeRecall: false,
    probeContext: 'standalone',
    tier: 'A',
  };
}

export function candidateAttached(overrides?: {
  eventId?: string;
  threadId?: string;
  candidateId?: string;
}): CandidateAttachedEvent {
  const eventId = overrides?.eventId ?? 'evt-c005';
  return {
    eventId,
    v: 1,
    occurredAt: '2026-07-27T08:25:00.000Z',
    idempotencyKey: `candidate:${eventId}`,
    type: 'CandidateAttached',
    threadId: overrides?.threadId ?? T.thread,
    candidateId: overrides?.candidateId ?? T.candidate,
    envelope: {
      taskClass: 'T2',
      inputHash: 'hash-c1',
      promptFamilyId: 'pf-explain',
      promptVersion: '1',
      model: 'fixture-model',
      provider: 'fixture-provider',
      createdAt: '2026-07-27T08:24:59.000Z',
      checks: { targetFormPresent: true, isLabeled: true },
    },
    status: 'generated',
  };
}

export function candidateAccepted(overrides?: {
  eventId?: string;
  candidateId?: string;
}): CandidateAcceptedAsNoteEvent {
  const eventId = overrides?.eventId ?? 'evt-c006';
  return {
    eventId,
    v: 1,
    occurredAt: '2026-07-27T08:26:00.000Z',
    idempotencyKey: `accept:${eventId}`,
    type: 'CandidateAcceptedAsNote',
    candidateId: overrides?.candidateId ?? T.candidate,
    userAction: true,
  };
}

export function threadTombstoned(overrides?: {
  eventId?: string;
  threadId?: string;
}): ThreadTombstonedEvent {
  const eventId = overrides?.eventId ?? 'evt-c007';
  return {
    eventId,
    v: 1,
    occurredAt: '2026-07-27T09:00:00.000Z',
    idempotencyKey: `tombstone:${eventId}`,
    type: 'ThreadTombstoned',
    threadId: overrides?.threadId ?? T.thread,
    reason: 'user_deleted',
  };
}

export function contentPurged(overrides?: {
  eventId?: string;
  targetIds?: readonly string[];
  tombstoneEventId?: string;
}): ContentPurgedEvent {
  const eventId = overrides?.eventId ?? 'evt-c008';
  return {
    eventId,
    v: 1,
    occurredAt: '2026-07-27T09:00:05.000Z',
    idempotencyKey: `purge:${eventId}`,
    type: 'ContentPurged',
    targetIds: [...(overrides?.targetIds ?? [T.thread, T.encounter])],
    tombstoneEventId: overrides?.tombstoneEventId ?? 'evt-c007',
  };
}

export function sessionStarted(): SessionStartedEvent {
  return {
    eventId: 'evt-c009',
    v: 1,
    occurredAt: '2026-07-27T08:30:00.000Z',
    idempotencyKey: 'session-start:evt-c009',
    type: 'SessionStarted',
    sessionId: T.session,
    budget: { timeBudgetMin: 10, newBudget: 1 },
  };
}

export function sessionClosed(): SessionClosedEvent {
  return {
    eventId: 'evt-c010',
    v: 1,
    occurredAt: '2026-07-27T08:40:00.000Z',
    idempotencyKey: 'session-close:evt-c010',
    type: 'SessionClosed',
    sessionId: T.session,
    completionState: 'completed',
  };
}

/**
 * A log covering every family the suite exercises, in an order replay accepts.
 * Deletion is deliberately *not* included — cases that need it append the
 * tombstone and purge themselves, so that a case which only wants a populated
 * store does not silently get a purged one.
 */
export function representativeLog(): readonly DomainEvent[] {
  return [
    encounterCaptured(),
    encounterCaptured({
      eventId: 'evt-c001b',
      encounterId: T.secondEncounter,
      text: SECOND_PURGE_CANARY_TEXT,
      occurredAt: '2026-07-27T08:02:00.000Z',
      license: 'CC BY-SA 4.0',
      attribution: 'Fixture attribution that must survive export (T-15)',
      sourceId: 'source-contract-suite-2',
    }),
    threadPromoted(),
    contractCreated(),
    reviewGraded(),
    candidateAttached(),
    candidateAccepted(),
    sessionStarted(),
    sessionClosed(),
  ];
}
