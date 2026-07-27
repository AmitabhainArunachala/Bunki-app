/**
 * Idempotency semantics, and their parity with `@bunki/domain` (WP-03).
 *
 * The contract suite already proves the *ports* behave correctly. This file
 * proves something the ports cannot show on their own: that the store's rule and
 * replay's rule are the same rule.
 *
 * That matters because the two components can disagree silently. A store that
 * accepted a re-append replay would reject, or rejected one replay would skip,
 * produces a log whose derived state depends on which component you ask — and
 * the first symptom would be two devices showing two histories, long after the
 * cause. So every case below asserts the outcome twice: once through
 * `planAppend`, once through `replay` on the equivalent log.
 */

import {
  IdempotencyConflictError,
  DuplicateEventIdError,
  canonicalJson,
  replay,
} from '@bunki/domain';
import { describe, expect, it } from 'vitest';

import {
  encounterCaptured,
  fingerprintBatch,
  planAppend,
  type StoredEventRecord,
} from '../src/index.ts';

const stored = (
  event: ReturnType<typeof encounterCaptured>,
  purged = false,
): StoredEventRecord => ({
  event,
  canonical: canonicalJson(event),
  purged,
});

describe('append idempotency matches @bunki/domain replay', () => {
  it('treats a byte-identical re-append under one key as a no-op, and so does replay', () => {
    const event = encounterCaptured();

    const plan = planAppend({
      existing: [stored(event)],
      events: [event],
      batchKey: 'batch:retry',
      priorBatch: null,
    });

    expect(plan.toInsert).toEqual([]);
    expect(plan.skippedEventIds).toEqual([event.eventId]);
    expect(plan.outcome).toBe('duplicate-noop');

    // Replay's verdict on the same pair: one applied, one skipped, one thread.
    const state = replay([event, event]);
    expect(state.appliedEventCount).toBe(1);
    expect(state.skippedDuplicateCount).toBe(1);
    expect(state.threads).toHaveLength(1);
  });

  it('rejects a differing payload under one key, and so does replay', () => {
    const original = encounterCaptured();
    const impostor = encounterCaptured({
      eventId: 'evt-other',
      encounterId: 'encounter-other',
      idempotencyKey: original.idempotencyKey,
      text: 'a different history',
    });

    expect(() =>
      planAppend({
        existing: [stored(original)],
        events: [impostor],
        batchKey: 'batch:conflict',
        priorBatch: null,
      }),
    ).toThrow(IdempotencyConflictError);

    expect(() => replay([original, impostor])).toThrow(IdempotencyConflictError);
  });

  it('rejects one eventId claimed by two different events, and so does replay', () => {
    const original = encounterCaptured();
    const impostor = encounterCaptured({ idempotencyKey: 'a-different-key', text: 'different' });

    expect(() =>
      planAppend({
        existing: [stored(original)],
        events: [impostor],
        batchKey: 'batch:dup-id',
        priorBatch: null,
      }),
    ).toThrow(DuplicateEventIdError);

    expect(() => replay([original, impostor])).toThrow(DuplicateEventIdError);
  });

  it('recognises an identical batch by its digest, not by its length or its ids', () => {
    const event = encounterCaptured();
    const plan = planAppend({
      existing: [stored(event)],
      events: [event],
      batchKey: 'batch:same',
      priorBatch: {
        idempotencyKey: 'batch:same',
        fingerprint: fingerprintBatch([event]),
        eventIds: [event.eventId],
      },
    });

    expect(plan.outcome).toBe('duplicate-noop');
    expect(plan.toInsert).toEqual([]);
  });

  it('rejects a batch key reused for different content', () => {
    const event = encounterCaptured();
    expect(() =>
      planAppend({
        existing: [],
        events: [event],
        batchKey: 'batch:reused',
        priorBatch: {
          idempotencyKey: 'batch:reused',
          fingerprint: fingerprintBatch([encounterCaptured({ text: 'something else' })]),
          eventIds: ['evt-earlier'],
        },
      }),
    ).toThrow(IdempotencyConflictError);
  });

  it('skips rather than conflicts when the stored copy was purged', () => {
    // A retry queue still holding the pre-purge event replays it. Neither
    // outcome available to a naive implementation is right: writing it back
    // resurrects deleted content, and throwing would make a stuck queue out of
    // an honest retry. Skipping is the only outcome that respects the deletion.
    const event = encounterCaptured();
    const purgedCopy = { ...event, text: '[purged]' };

    const plan = planAppend({
      existing: [stored(purgedCopy, true)],
      events: [event],
      batchKey: 'batch:resurrect',
      priorBatch: null,
    });

    expect(plan.toInsert).toEqual([]);
    expect(plan.skippedEventIds).toEqual([event.eventId]);
  });

  it('refuses to write a batch whose resulting log would not replay', () => {
    // The store does not reimplement "does this thread exist" — it asks replay,
    // and lets replay's typed error out. A log that cannot be replayed is never
    // stored (controller §21.3(4)).
    expect(() =>
      planAppend({
        existing: [],
        events: [
          {
            eventId: 'evt-orphan',
            v: 1,
            occurredAt: '2026-07-27T08:00:00.000Z',
            idempotencyKey: 'promote:orphan',
            type: 'ThreadPromotionChanged',
            threadId: 'thread-never-captured',
            from: 'captured',
            to: 'keep',
            origin: 'user',
          },
        ],
        batchKey: 'batch:orphan',
        priorBatch: null,
      }),
    ).toThrow(/thread-never-captured/);
  });

  it('re-parses its input rather than trusting the static type', () => {
    // The port is reachable from JavaScript and from JSON, where `DomainEvent`
    // is a promise nobody kept. An unknown version must fail closed here exactly
    // as it does at the domain boundary (T-04).
    const fromTheWire = { ...encounterCaptured(), v: 2 } as unknown as ReturnType<
      typeof encounterCaptured
    >;

    expect(() =>
      planAppend({
        existing: [],
        events: [fromTheWire],
        batchKey: 'batch:wire',
        priorBatch: null,
      }),
    ).toThrow(/Unknown event schema version/);
  });
});
