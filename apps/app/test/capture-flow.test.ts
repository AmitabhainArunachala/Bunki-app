/**
 * The capture flow at the seam (REQ-UI-01, controller §10.1).
 *
 * The load-bearing assertion is the *ordering*: an acknowledgment must exist
 * before any enrichment runs. The screen guarantees it by calling a synchronous
 * `execute` and scheduling enrichment afterwards; this file proves the store
 * half — that `execute` returns a complete acknowledgment with the event
 * already applied, with nothing awaited in between.
 *
 * It also proves the properties a UI seam is most likely to get wrong: that a
 * double tap yields one thread, that every event came from the kernel's
 * validated factory, and that no evidence-class event can be produced here at
 * all.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createDeterministicContext,
  createDomainEvent,
  EvidenceFactoryBoundaryError,
  isEvidenceEventType,
  parseEvent,
  type DomainContext,
  type NonEvidenceEventType,
} from '@bunki/domain';

import { createMemoryAppStore, targetKeyOf } from '../src/state/memory-store.ts';
import {
  DURABILITY_NOTES,
  UNCERTAINTY_DIMENSIONS,
  type CaptureCommand,
} from '../src/state/store.ts';

const SOURCE = { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' } as const;
const PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

const capture = (text: string, overrides: Partial<CaptureCommand> = {}): CaptureCommand => ({
  kind: 'capture',
  text,
  sourceRef: SOURCE,
  provenance: PROVENANCE,
  uncertainty: null,
  ...overrides,
});

/** Enough scripted instants for any test in this file; running out throws loudly. */
const INSTANTS = Array.from(
  { length: 40 },
  (_value, index) =>
    `2026-07-27T09:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
);

function newContext(): DomainContext {
  return createDeterministicContext({ instants: INSTANTS, idPrefix: 'test-' });
}

function newStore(): ReturnType<typeof createMemoryAppStore> {
  return createMemoryAppStore({ context: newContext() });
}

describe('acknowledgment ordering (REQ-UI-01)', () => {
  it('returns a complete acknowledgment synchronously', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐'));

    expect(ack.threadId).not.toBe('');
    expect(ack.acknowledgedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(ack.events).toHaveLength(1);
    // The event is already in the log and already projected when execute returns.
    expect(store.readAll()).toHaveLength(1);
    expect(store.getSnapshot().threadsById[ack.threadId]?.displayText).toBe('分岐');
  });

  it('acknowledges before any deferred work can run', async () => {
    const store = newStore();
    const order: string[] = [];

    const ack = store.execute(capture('分岐'));
    order.push('ack');
    // Anything scheduled after the tap — a timer, a microtask, a promise —
    // cannot have run yet, which is exactly what "ack before enrichment" means.
    await new Promise<void>((done) => {
      setTimeout(() => {
        order.push('enrichment');
        done();
      }, 0);
    });

    expect(order).toEqual(['ack', 'enrichment']);
    expect(ack.events).toHaveLength(1);
  });

  it('reports its real durability and never upgrades it', () => {
    const store = newStore();
    expect(store.durability).toBe('in-memory-session-only');
    expect(store.execute(capture('分岐')).durability).toBe('in-memory-session-only');
    expect(DURABILITY_NOTES['in-memory-session-only']).toMatch(/session only/i);
    expect(DURABILITY_NOTES['in-memory-session-only']).toMatch(/reloading/i);
  });
});

describe('idempotency (controller §17.2: a double tap makes one thread)', () => {
  it('collapses an identical repeat into a no-op', () => {
    const store = newStore();
    const first = store.execute(capture('分岐'));
    const second = store.execute(capture('分岐'));

    expect(second.deduplicated).toBe(true);
    expect(second.threadId).toBe(first.threadId);
    expect(second.events).toHaveLength(0);
    expect(store.readAll()).toHaveLength(1);
    expect(store.getSnapshot().threads).toHaveLength(1);
  });

  it('treats a different source locator as a genuine re-encounter on the same thread', () => {
    const store = newStore();
    const first = store.execute(capture('分岐'));
    const again = store.execute(
      capture('分岐', { sourceRef: { ...SOURCE, locator: 'seed-passage' } }),
    );

    expect(again.threadId).toBe(first.threadId);
    expect(again.deduplicated).toBe(false);
    expect(store.getSnapshot().threads).toHaveLength(1);
    expect(store.getSnapshot().threadsById[first.threadId]?.state.encounterIds).toHaveLength(2);
  });

  it('matches a thread through width and whitespace differences', () => {
    expect(targetKeyOf(' 分岐 ')).toBe(targetKeyOf('分岐'));
    const store = newStore();
    const first = store.execute(capture('分岐'));
    const padded = store.execute(capture('  分岐  '));
    expect(padded.threadId).toBe(first.threadId);
  });
});

describe('promotion goes through the domain reducer', () => {
  it('moves captured → keep and records the transition', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐'));
    expect(store.getSnapshot().threadsById[ack.threadId]?.state.promotion).toBe('captured');

    store.execute({ kind: 'promote', threadId: ack.threadId, to: 'keep' });
    const thread = store.getSnapshot().threadsById[ack.threadId];
    expect(thread?.state.promotion).toBe('keep');
    expect(thread?.state.promotionHistory).toHaveLength(1);
    expect(thread?.state.promotionHistory[0]?.origin).toBe('user');
  });

  it('rejects a promotion of an unknown thread rather than inventing one', () => {
    const store = newStore();
    expect(() => store.execute({ kind: 'promote', threadId: 'thread-nope', to: 'keep' })).toThrow(
      /unknown thread/,
    );
  });

  it('collapses a double-tapped promotion', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐'));
    store.execute({ kind: 'promote', threadId: ack.threadId, to: 'keep' });
    const repeat = store.execute({ kind: 'promote', threadId: ack.threadId, to: 'keep' });
    expect(repeat.deduplicated).toBe(true);
    expect(store.readAll().filter((event) => event.type === 'ThreadPromotionChanged')).toHaveLength(
      1,
    );
  });
});

describe('the uncertainty mark', () => {
  it('records the *fact* of a mark on the event and the dimension beside it', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐', { uncertainty: 'reading' }));

    const event = ack.events[0];
    expect(event?.type).toBe('EncounterCaptured');
    expect(event && 'uncertaintyMark' in event ? event.uncertaintyMark : undefined).toBe(true);

    const thread = store.getSnapshot().threadsById[ack.threadId];
    expect(thread?.uncertainty?.dimension).toBe('reading');
    expect(thread?.uncertainty?.markedAtCapture).toBe(true);
  });

  it('omits the field entirely when nothing was marked', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐'));
    expect(ack.events[0] && 'uncertaintyMark' in ack.events[0]).toBe(false);
  });

  it('stays editable after capture and writes no event when edited', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐', { uncertainty: 'meaning' }));
    const before = store.readAll().length;

    const edit = store.execute({
      kind: 'markUncertainty',
      threadId: ack.threadId,
      dimension: 'use',
    });

    expect(edit.events).toHaveLength(0);
    expect(store.readAll()).toHaveLength(before);
    expect(store.getSnapshot().threadsById[ack.threadId]?.uncertainty?.dimension).toBe('use');
  });

  it('clears the mark when the same chip is turned off', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐', { uncertainty: 'kanji' }));
    store.execute({ kind: 'markUncertainty', threadId: ack.threadId, dimension: null });
    expect(store.getSnapshot().threadsById[ack.threadId]?.uncertainty).toBeNull();
  });

  it('offers exactly the five dimensions REQ-UI-01 names', () => {
    expect([...UNCERTAINTY_DIMENSIONS]).toEqual(['meaning', 'reading', 'use', 'kanji', 'not-sure']);
  });
});

describe('the evidence boundary holds at this seam (REQ-ARCH-04)', () => {
  it('emits only events the kernel’s parser accepts', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐', { uncertainty: 'meaning' }));
    store.execute({ kind: 'promote', threadId: ack.threadId, to: 'keep' });

    for (const event of store.readAll()) {
      expect(() => parseEvent(event)).not.toThrow();
    }
  });

  it('never produces an evidence-class event', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐'));
    store.execute({ kind: 'promote', threadId: ack.threadId, to: 'learn' });
    store.execute({ kind: 'markUncertainty', threadId: ack.threadId, dimension: 'use' });

    for (const event of store.readAll()) {
      expect(isEvidenceEventType(event.type)).toBe(false);
    }
  });

  it('cannot mint one even when the app reaches for the factory directly', () => {
    // The type parameter already excludes evidence families at compile time;
    // this is the runtime backstop for a caller that arrived through `any`,
    // asserted from `apps/app` because `apps/app` is the caller the boundary
    // exists to constrain (controller §5).
    expect(() =>
      createDomainEvent(
        newContext(),
        'ReviewGraded' as unknown as NonEvidenceEventType,
        {} as never,
        { idempotencyKey: 'k' },
      ),
    ).toThrow(EvidenceFactoryBoundaryError);
  });
});

describe('subscription', () => {
  it('notifies subscribers and hands out a new snapshot each time', () => {
    const store = newStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const before = store.getSnapshot();
    store.execute(capture('分岐'));
    const after = store.getSnapshot();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(after).not.toBe(before);
    expect(after.revision).toBeGreaterThan(before.revision);

    unsubscribe();
    store.execute(capture('岐路'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
