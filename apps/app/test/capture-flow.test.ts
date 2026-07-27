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
  uncertaintyLogNote,
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

  /**
   * The case the screens used to lie about.
   *
   * Keeping with no mark and then tapping a chip leaves the learner looking at
   * a selected chip and a thread row that says "uncertain: reading" — while the
   * log holds no `uncertaintyMark` at all, not even the bare fact of one. The
   * assertion is on `readAll()` rather than on the acknowledgment because the
   * acknowledgment is what the screen already showed; the log is what would be
   * exported.
   */
  it('leaves no uncertaintyMark in the log when the mark is applied after capture', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐', { uncertainty: null }));
    store.execute({ kind: 'markUncertainty', threadId: ack.threadId, dimension: 'reading' });

    for (const event of store.readAll()) {
      expect('uncertaintyMark' in event, `${event.type} carries a mark it never received`).toBe(
        false,
      );
    }
    expect(store.readAll().filter((event) => event.type === 'EncounterCaptured')).toHaveLength(1);

    // The annotation exists on the device and knows it is not from the event.
    const thread = store.getSnapshot().threadsById[ack.threadId];
    expect(thread?.uncertainty?.dimension).toBe('reading');
    expect(thread?.uncertainty?.markedAtCapture).toBe(false);
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

/**
 * What the screens *say* about the log has to be what the log holds
 * (REQ-GATE-03, P0-CAP-15).
 *
 * Each case below runs the real store path first and derives the sentence from
 * the resulting thread, so the wording cannot drift away from the behaviour: if
 * `markUncertainty` ever started writing an event, the third case would fail.
 */
describe('the sentence the screens render about the event log', () => {
  const marksInLog = (store: ReturnType<typeof createMemoryAppStore>): number =>
    store.readAll().filter((event) => 'uncertaintyMark' in event).length;

  it('promises, before Keep, only what Keep will actually write', () => {
    expect(uncertaintyLogNote(null, { kept: false })).toMatch(/Keeping this with a mark records/);
  });

  it('claims a logged mark exactly when the captured event carries one', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐', { uncertainty: 'reading' }));
    const thread = store.getSnapshot().threadsById[ack.threadId];

    expect(marksInLog(store)).toBe(1);
    const note = uncertaintyLogNote(thread?.uncertainty ?? null, { kept: true });
    expect(note).toMatch(/The event log records that a mark exists/);
    expect(note).toMatch(/this device only/);
  });

  it('says a post-capture mark is not in the log, because it is not', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐'));
    store.execute({ kind: 'markUncertainty', threadId: ack.threadId, dimension: 'reading' });
    const thread = store.getSnapshot().threadsById[ack.threadId];

    expect(marksInLog(store)).toBe(0);
    const note = uncertaintyLogNote(thread?.uncertainty ?? null, { kept: true });
    expect(note).toMatch(/not in the event log/);
    expect(note).toMatch(/will not be exported/);
    // The false claim this replaced.
    expect(note).not.toMatch(/The event log records that a mark exists/);
  });

  it('makes no claim about the log when a kept thread has no mark', () => {
    const store = newStore();
    const ack = store.execute(capture('分岐', { uncertainty: 'kanji' }));
    store.execute({ kind: 'markUncertainty', threadId: ack.threadId, dimension: null });
    const thread = store.getSnapshot().threadsById[ack.threadId];

    // Clearing cannot retract the mark already on the captured event, so the
    // sentence must not assert that the log is now empty of one.
    expect(marksInLog(store)).toBe(1);
    expect(thread?.uncertainty).toBeNull();
    const note = uncertaintyLogNote(thread?.uncertainty ?? null, { kept: true });
    expect(note).toMatch(/A mark added now stays on this device only/);
    expect(note).not.toMatch(/no mark is in the log|the log is empty/i);
  });

  it('names the deferred item in every branch, so the gap is always traceable', () => {
    const branches = [
      uncertaintyLogNote(null, { kept: false }),
      uncertaintyLogNote(null, { kept: true }),
      uncertaintyLogNote(
        { dimension: 'use', editedAt: INSTANTS[0] ?? '', markedAtCapture: true },
        { kept: true },
      ),
      uncertaintyLogNote(
        { dimension: 'use', editedAt: INSTANTS[0] ?? '', markedAtCapture: false },
        { kept: true },
      ),
    ];
    for (const note of branches) expect(note).toContain('WP05-D2');
    expect(new Set(branches).size).toBe(branches.length);
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
