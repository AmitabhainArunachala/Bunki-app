/**
 * T-03 — replaying the same events produces identical derived state (WP-02).
 *
 * At WP-02 the claim is scoped to the pure in-memory reference implementation,
 * which is what controller §6.3 asks for at this stage. The sqlite and web
 * adapters join the same gate at WP-03, native at WP-11, and E2E-produced logs
 * at WP-10. This file is deliberately written against `replay` and the shared
 * harness in `src/replay/golden.ts` so those later runs re-use it rather than
 * writing a second, subtly different comparison.
 */

import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  DuplicateEventIdError,
  EMPTY_DERIVED_STATE,
  IdempotencyConflictError,
  parseEventLog,
  ReducerInvariantError,
  replay,
  replayJson,
  replayTwiceAndCompare,
  type DomainEvent,
} from '../../src/index.ts';
import {
  AT,
  candidateAcceptedAsNote,
  candidateAttached,
  contentPurged,
  contractCreated,
  dataExported,
  encounterCaptured,
  evidenceSuperseded,
  exposureLogged,
  lookupFrictionLogged,
  productionObserved,
  reviewGraded,
  sessionClosed,
  sessionStarted,
  threadPromotionChanged,
  threadTombstoned,
} from '../support/events.ts';

/**
 * A log that touches every family, so the determinism claim is about the whole
 * catalog rather than the two or three families a smaller fixture would reach.
 */
function fullLog(): readonly DomainEvent[] {
  return parseEventLog([
    encounterCaptured({ eventId: 'ev-01', at: AT.t0, encounterId: 'enc-01', threadId: 'thread-b' }),
    encounterCaptured({ eventId: 'ev-02', at: AT.t0, encounterId: 'enc-02', threadId: 'thread-a' }),
    threadPromotionChanged({
      eventId: 'ev-03',
      at: AT.t1,
      threadId: 'thread-a',
      from: 'captured',
      to: 'learn',
    }),
    contractCreated({ eventId: 'ev-04', at: AT.t1, contractId: 'contract-x' }),
    contractCreated({
      eventId: 'ev-05',
      at: AT.t1,
      contractId: 'contract-a',
      componentId: 'component-2',
    }),
    sessionStarted({ eventId: 'ev-06', at: AT.t1, sessionId: 'session-1' }),
    reviewGraded({ eventId: 'ev-07', at: AT.t2, contractId: 'contract-x' }),
    productionObserved({ eventId: 'ev-08', at: AT.t2 }),
    exposureLogged({ eventId: 'ev-09', at: AT.t2 }),
    lookupFrictionLogged({ eventId: 'ev-10', at: AT.t2 }),
    evidenceSuperseded({ eventId: 'ev-11', at: AT.t3, supersededEventId: 'ev-07' }),
    candidateAttached({
      eventId: 'ev-12',
      at: AT.t3,
      threadId: 'thread-b',
      candidateId: 'candidate-1',
    }),
    candidateAcceptedAsNote({ eventId: 'ev-13', at: AT.t3, candidateId: 'candidate-1' }),
    sessionClosed({ eventId: 'ev-14', at: AT.t4, sessionId: 'session-1' }),
    dataExported({ eventId: 'ev-15', at: AT.t4 }),
    threadTombstoned({ eventId: 'ev-16', at: AT.t5, threadId: 'thread-b' }),
    contentPurged({
      eventId: 'ev-17',
      at: AT.t5,
      tombstoneEventId: 'ev-16',
      targetIds: ['thread-b'],
    }),
  ]);
}

describe('T-03: replay determinism', () => {
  it('produces deeply equal state when the same log is replayed twice', () => {
    const log = fullLog();
    const first = replay(log);
    const second = replay(log);

    expect(second).toEqual(first);
    expect(second).toStrictEqual(first);
  });

  it('produces byte-identical canonical JSON on both passes', () => {
    // Structural equality is not enough: two states can be `toEqual` and
    // serialise differently, and the serialised form is what WP-03 exports and
    // re-imports (T-14).
    const result = replayTwiceAndCompare(fullLog());
    expect(result.identical).toBe(true);
    expect(result.secondJson).toBe(result.firstJson);
  });

  it('does not carry state between replays through module scope', () => {
    const log = fullLog();
    const before = canonicalJson(replay(log));
    replay(
      parseEventLog([
        encounterCaptured({ eventId: 'x1', at: AT.t0, encounterId: 'x', threadId: 'other' }),
      ]),
    );
    expect(canonicalJson(replay(log))).toBe(before);
  });

  it('orders collections by a declared key, not by insertion', () => {
    const state = replay(fullLog());
    expect(state.threads.map((thread) => thread.threadId)).toEqual(['thread-a', 'thread-b']);
    expect(state.contracts.map((contract) => contract.contractId)).toEqual([
      'contract-a',
      'contract-x',
    ]);
    // Observations stay in log order — that order is part of the evidence.
    expect(state.observations.map((observation) => observation.eventId)).toEqual([
      'ev-07',
      'ev-08',
      'ev-09',
      'ev-10',
      'ev-11',
    ]);
  });

  it('is unaffected by the order the same threads were first captured in', () => {
    const forwards = replay(
      parseEventLog([
        encounterCaptured({ eventId: 'a1', at: AT.t0, encounterId: 'e-a', threadId: 'thread-a' }),
        encounterCaptured({ eventId: 'b1', at: AT.t1, encounterId: 'e-b', threadId: 'thread-b' }),
      ]),
    );
    const backwards = replay(
      parseEventLog([
        encounterCaptured({ eventId: 'b1', at: AT.t1, encounterId: 'e-b', threadId: 'thread-b' }),
        encounterCaptured({ eventId: 'a1', at: AT.t0, encounterId: 'e-a', threadId: 'thread-a' }),
      ]),
    );

    expect(forwards.threads.map((thread) => thread.threadId)).toEqual(
      backwards.threads.map((thread) => thread.threadId),
    );
  });

  it('returns the empty state for an empty log', () => {
    expect(replay([])).toEqual(EMPTY_DERIVED_STATE);
    expect(replayJson([])).toEqual(EMPTY_DERIVED_STATE);
  });

  it('freezes its result', () => {
    const state = replay(fullLog());
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.threads)).toBe(true);
    expect(Object.isFrozen(state.observations)).toBe(true);
  });
});

describe('idempotency during replay (controller §7)', () => {
  const capture = encounterCaptured({
    eventId: 'ev-01',
    at: AT.t0,
    encounterId: 'enc-01',
    threadId: 'thread-1',
  });

  it('treats an identical re-append as a no-op — a double-tapped capture is one thread', () => {
    const state = replayJson([capture, capture]);
    expect(state.threads).toHaveLength(1);
    expect(state.threads[0]?.encounterIds).toEqual(['enc-01']);
    expect(state.appliedEventCount).toBe(1);
    expect(state.skippedDuplicateCount).toBe(1);
  });

  it('produces the same state as the log without the duplicate', () => {
    expect(canonicalJson(replayJson([capture, capture]))).not.toBe(
      canonicalJson(replayJson([capture])),
    );
    // Only the duplicate counter differs; the projected content does not.
    expect(replayJson([capture, capture]).threads).toEqual(replayJson([capture]).threads);
  });

  it('rejects one key claimed by two different events', () => {
    const conflicting = { ...capture, eventId: 'ev-02', encounterId: 'enc-02' };
    let thrown: unknown;
    try {
      replayJson([capture, conflicting]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IdempotencyConflictError);
    expect((thrown as IdempotencyConflictError).idempotencyKey).toBe('idem-ev-01');
  });

  // The test above changes *both* the eventId and the payload, so on its own it
  // only ever exercises the differing-eventId branch. The two below pin the case
  // it cannot see: same key, same eventId, different content. Without them a
  // check keyed on eventId alone passes the suite while silently dropping a
  // materially different event.
  it('rejects one key and event id re-used to claim different content', () => {
    const restated = { ...capture, encounterId: 'enc-02', text: 'a different encounter entirely' };
    let thrown: unknown;
    try {
      replayJson([capture, restated]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IdempotencyConflictError);
    expect((thrown as IdempotencyConflictError).idempotencyKey).toBe('idem-ev-01');
    expect((thrown as IdempotencyConflictError).existingEventId).toBe('ev-01');
    expect((thrown as IdempotencyConflictError).conflictingEventId).toBe('ev-01');
  });

  it('does not let a differing payload through as a skipped duplicate', () => {
    // The failure this guards against is not an exception with the wrong type;
    // it is no exception at all, and a second history quietly discarded.
    const restated = { ...capture, encounterId: 'enc-02' };
    expect(() => replayJson([capture, restated])).toThrow(IdempotencyConflictError);
  });

  it('still treats a re-append as identical when only key order differs', () => {
    // Canonical comparison, not textual: the same event serialised with its
    // fields in another order is the same event, and rejecting it would break
    // honest re-appends across producers that order JSON differently.
    const reordered = Object.fromEntries(
      Object.entries(capture as Record<string, unknown>).reverse(),
    );
    const state = replayJson([capture, reordered]);
    expect(state.appliedEventCount).toBe(1);
    expect(state.skippedDuplicateCount).toBe(1);
  });

  it('rejects one event id reused under a different key', () => {
    const collision = { ...capture, idempotencyKey: 'idem-other', encounterId: 'enc-02' };
    expect(() => replayJson([capture, collision])).toThrow(DuplicateEventIdError);
  });
});

describe('replay refuses to skip what it cannot apply', () => {
  it.each([
    [
      'a promotion for a thread with no capture',
      [
        threadPromotionChanged({
          eventId: 'p1',
          at: AT.t1,
          threadId: 'ghost',
          from: 'captured',
          to: 'keep',
        }),
      ],
    ],
    [
      'a candidate accepted but never attached',
      [candidateAcceptedAsNote({ eventId: 'c1', at: AT.t1, candidateId: 'ghost' })],
    ],
    [
      'a session closed but never started',
      [sessionClosed({ eventId: 's1', at: AT.t1, sessionId: 'ghost' })],
    ],
    [
      'a purge citing a tombstone that is not in the log',
      [
        contentPurged({
          eventId: 'g1',
          at: AT.t1,
          tombstoneEventId: 'ghost',
          targetIds: ['thread-1'],
        }),
      ],
    ],
    [
      'a supersession of an observation that is not in the log',
      [evidenceSuperseded({ eventId: 'x1', at: AT.t1, supersededEventId: 'ghost' })],
    ],
  ])('throws on %s', (_label, log) => {
    expect(() => replayJson(log)).toThrow(ReducerInvariantError);
  });

  it('rejects a second contract with the same id', () => {
    expect(() =>
      replayJson([
        contractCreated({ eventId: 'c1', at: AT.t0, contractId: 'contract-1' }),
        contractCreated({ eventId: 'c2', at: AT.t1, contractId: 'contract-1' }),
      ]),
    ).toThrow(/already created/);
  });

  it('rejects closing a session twice', () => {
    expect(() =>
      replayJson([
        sessionStarted({ eventId: 's1', at: AT.t0, sessionId: 'session-1' }),
        sessionClosed({ eventId: 's2', at: AT.t1, sessionId: 'session-1' }),
        sessionClosed({ eventId: 's3', at: AT.t2, sessionId: 'session-1' }),
      ]),
    ).toThrow(/already closed/);
  });

  it('rejects superseding one observation twice — history is never rewritten', () => {
    expect(() =>
      replayJson([
        contractCreated({ eventId: 'c1', at: AT.t0, contractId: 'contract-1' }),
        reviewGraded({ eventId: 'r1', at: AT.t1, contractId: 'contract-1' }),
        evidenceSuperseded({ eventId: 'x1', at: AT.t2, supersededEventId: 'r1' }),
        evidenceSuperseded({ eventId: 'x2', at: AT.t3, supersededEventId: 'r1' }),
      ]),
    ).toThrow(/already superseded/);
  });
});

describe('what replay deliberately does not derive (WP-06/WP-08 seams)', () => {
  it('projects observations without judging them: no memory state, no schedule, no grade rollup', () => {
    const state = replay(fullLog());
    const keys = Object.keys(state).sort();
    expect(keys).toEqual([
      'appliedEventCount',
      'contracts',
      'exports',
      'lastEventId',
      'lastOccurredAt',
      'observations',
      'purges',
      'schemaVersion',
      'sessions',
      'skippedDuplicateCount',
      'threads',
    ]);
    expect(keys).not.toContain('memoryStates');
    expect(keys).not.toContain('dueContracts');
    expect(keys).not.toContain('sessionPlan');
  });

  it('records a superseded observation rather than removing it (REQ-DM-04.2)', () => {
    const state = replay(fullLog());
    const graded = state.observations.find((observation) => observation.eventId === 'ev-07');
    expect(graded?.superseded).toBe(true);
    expect(graded?.supersededByEventId).toBe('ev-11');
  });

  it('records a lookup with no tier and no contract (T-07)', () => {
    const lookup = replay(fullLog()).observations.find(
      (observation) => observation.eventId === 'ev-10',
    );
    expect(lookup?.tier).toBeNull();
    expect(lookup?.contractId).toBeNull();
  });

  it('records exposure as tier D and attaches it to no contract (T-08)', () => {
    const exposure = replay(fullLog()).observations.find(
      (observation) => observation.eventId === 'ev-09',
    );
    expect(exposure?.tier).toBe('D');
    expect(exposure?.contractId).toBeNull();
  });
});
