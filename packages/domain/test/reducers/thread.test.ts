/**
 * Thread state projection (WP-02).
 */

import { describe, expect, it } from 'vitest';

import {
  initialThreadState,
  parseEvent,
  ReducerInvariantError,
  threadReducer,
  type CandidateAcceptedAsNoteEvent,
  type CandidateAttachedEvent,
  type ContentPurgedEvent,
  type EncounterCapturedEvent,
  type ThreadPromotionChangedEvent,
  type ThreadState,
  type ThreadTombstonedEvent,
} from '../../src/index.ts';
import {
  AT,
  candidateAcceptedAsNote,
  candidateAttached,
  contentPurged,
  encounterCaptured,
  threadPromotionChanged,
  threadTombstoned,
} from '../support/events.ts';

const capture = (eventId: string, at: string, encounterId: string) =>
  parseEvent(
    encounterCaptured({ eventId, at, encounterId, threadId: 'thread-1' }),
  ) as EncounterCapturedEvent;

const promote = (eventId: string, at: string, from: string, to: string) =>
  parseEvent(
    threadPromotionChanged({ eventId, at, threadId: 'thread-1', from, to }),
  ) as ThreadPromotionChangedEvent;

const attach = (eventId: string, at: string, candidateId: string) =>
  parseEvent(
    candidateAttached({ eventId, at, threadId: 'thread-1', candidateId }),
  ) as CandidateAttachedEvent;

const accept = (eventId: string, at: string, candidateId: string) =>
  parseEvent(candidateAcceptedAsNote({ eventId, at, candidateId })) as CandidateAcceptedAsNoteEvent;

const tombstone = (eventId: string, at: string) =>
  parseEvent(threadTombstoned({ eventId, at, threadId: 'thread-1' })) as ThreadTombstonedEvent;

const purge = (eventId: string, at: string, tombstoneEventId: string) =>
  parseEvent(
    contentPurged({ eventId, at, tombstoneEventId, targetIds: ['thread-1'] }),
  ) as ContentPurgedEvent;

const fresh = (): ThreadState => initialThreadState(capture('e1', AT.t0, 'encounter-1'));

describe('a thread is born from its first encounter', () => {
  it('starts captured, with the encounter recorded and no promotion history', () => {
    const state = fresh();
    expect(state.threadId).toBe('thread-1');
    expect(state.promotion).toBe('captured');
    expect(state.encounterIds).toEqual(['encounter-1']);
    expect(state.promotionHistory).toEqual([]);
    expect(state.candidateIds).toEqual([]);
    expect(state.acceptedCandidateIds).toEqual([]);
    expect(state.lifecycle).toBe('active');
    expect(state.tombstoneEventId).toBeNull();
    expect(state.createdAt).toBe(AT.t0);
    expect(state.lastEventAt).toBe(AT.t0);
  });

  it('capture alone never leaves captured — capture is not card creation (DL-05, T-02 precondition)', () => {
    const state = threadReducer(fresh(), capture('e2', AT.t1, 'encounter-2'));
    expect(state.promotion).toBe('captured');
    expect(state.encounterIds).toEqual(['encounter-1', 'encounter-2']);
  });
});

describe('re-encounters', () => {
  it('appends in log order and advances lastEventAt', () => {
    const state = threadReducer(fresh(), capture('e2', AT.t2, 'encounter-2'));
    expect(state.encounterIds).toEqual(['encounter-1', 'encounter-2']);
    expect(state.lastEventAt).toBe(AT.t2);
    expect(state.createdAt).toBe(AT.t0);
  });

  it('rejects the same encounter twice', () => {
    expect(() => threadReducer(fresh(), capture('e2', AT.t1, 'encounter-1'))).toThrow(
      ReducerInvariantError,
    );
  });
});

describe('promotion on a thread', () => {
  it('records each transition with its origin and instant', () => {
    const kept = threadReducer(fresh(), promote('e2', AT.t1, 'captured', 'keep'));
    const learning = threadReducer(kept, promote('e3', AT.t2, 'keep', 'learn'));

    expect(learning.promotion).toBe('learn');
    expect(learning.promotionHistory).toEqual([
      { eventId: 'e2', at: AT.t1, from: 'captured', to: 'keep', origin: 'user' },
      { eventId: 'e3', at: AT.t2, from: 'keep', to: 'learn', origin: 'user' },
    ]);
  });

  it('propagates the state machine rejection rather than swallowing it', () => {
    expect(() => threadReducer(fresh(), promote('e2', AT.t1, 'learn', 'master'))).toThrow(
      /authored against promotion state learn/,
    );
  });
});

describe('AI candidates', () => {
  it('attaches, then accepts only what was attached', () => {
    const attached = threadReducer(fresh(), attach('e2', AT.t1, 'candidate-1'));
    expect(attached.candidateIds).toEqual(['candidate-1']);
    expect(attached.acceptedCandidateIds).toEqual([]);

    const accepted = threadReducer(attached, accept('e3', AT.t2, 'candidate-1'));
    expect(accepted.acceptedCandidateIds).toEqual(['candidate-1']);
  });

  it('rejects accepting a candidate that was never attached', () => {
    expect(() => threadReducer(fresh(), accept('e2', AT.t1, 'candidate-ghost'))).toThrow(
      /never attached/,
    );
  });

  it('rejects accepting the same candidate twice', () => {
    const attached = threadReducer(fresh(), attach('e2', AT.t1, 'candidate-1'));
    const accepted = threadReducer(attached, accept('e3', AT.t2, 'candidate-1'));
    expect(() => threadReducer(accepted, accept('e4', AT.t3, 'candidate-1'))).toThrow(
      /already accepted/,
    );
  });

  it('rejects attaching the same candidate twice', () => {
    const attached = threadReducer(fresh(), attach('e2', AT.t1, 'candidate-1'));
    expect(() => threadReducer(attached, attach('e3', AT.t2, 'candidate-1'))).toThrow(
      /already attached/,
    );
  });

  it('leaves promotion untouched — accepting an AI note is not a promotion', () => {
    const attached = threadReducer(fresh(), attach('e2', AT.t1, 'candidate-1'));
    const accepted = threadReducer(attached, accept('e3', AT.t2, 'candidate-1'));
    expect(accepted.promotion).toBe('captured');
  });
});

describe('deletion: tombstone, then purge', () => {
  it('marks the tombstone and remembers which event set it', () => {
    const dead = threadReducer(fresh(), tombstone('e2', AT.t1));
    expect(dead.lifecycle).toBe('tombstoned');
    expect(dead.tombstoneEventId).toBe('e2');
  });

  it('purges only after a tombstone, and only citing that tombstone', () => {
    const dead = threadReducer(fresh(), tombstone('e2', AT.t1));
    const purged = threadReducer(dead, purge('e3', AT.t2, 'e2'));
    expect(purged.lifecycle).toBe('purged');
  });

  it('rejects a purge with no tombstone — deletion must stay auditable', () => {
    expect(() => threadReducer(fresh(), purge('e2', AT.t1, 'e-nonexistent'))).toThrow(
      /must follow a tombstone/,
    );
  });

  it('rejects a purge citing a different tombstone', () => {
    const dead = threadReducer(fresh(), tombstone('e2', AT.t1));
    expect(() => threadReducer(dead, purge('e3', AT.t2, 'e-other'))).toThrow(/cites tombstone/);
  });

  it.each([
    ['a re-encounter', () => capture('e9', AT.t3, 'encounter-9')],
    ['a promotion', () => promote('e9', AT.t3, 'captured', 'keep')],
    ['a candidate attachment', () => attach('e9', AT.t3, 'candidate-9')],
    ['a second tombstone', () => tombstone('e9', AT.t3)],
  ])(
    'refuses %s after the tombstone — a deleted thread does not keep accruing',
    (_label, build) => {
      const dead = threadReducer(fresh(), tombstone('e2', AT.t1));
      expect(() => threadReducer(dead, build())).toThrow(ReducerInvariantError);
    },
  );
});

describe('purity', () => {
  it('never mutates the state it was given', () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    threadReducer(before, promote('e2', AT.t1, 'captured', 'keep'));
    threadReducer(before, capture('e3', AT.t1, 'encounter-3'));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('returns frozen state, so a consumer cannot make two replays diverge after the fact', () => {
    expect(Object.isFrozen(fresh())).toBe(true);
    expect(Object.isFrozen(threadReducer(fresh(), promote('e2', AT.t1, 'captured', 'keep')))).toBe(
      true,
    );
  });
});
