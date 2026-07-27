/**
 * T1 — double-tap and concurrent capture produce exactly one thread
 * (WP-10; controller §17.2: "double-tap/concurrent capture produces exactly one
 * thread (idempotency)").
 *
 * ## Why this is asserted against the durable store and not the reducer
 *
 * The kernel's idempotency rule is already proven in `@bunki/domain`
 * (`replay` skips a byte-identical re-append) and in `@bunki/persistence`
 * (`planAppend` refuses a conflicting one). Both can be perfectly correct while
 * the *app* still forks a thread, because the app is where the key is minted:
 * `captureIdempotencyKey` derives it from the source reference and the folded
 * text, and if that derivation were unstable — if it folded width differently
 * from the thread lookup, or varied with a timestamp — every layer below would
 * dutifully store two honest, distinct, non-conflicting captures. The learner
 * would then have two threads for one word and nothing would have failed.
 *
 * So every assertion here goes through `AppStore.execute`, over a real durable
 * store, and reads the thread list a screen would render.
 *
 * ## What "concurrent" means on this runtime
 *
 * `execute` is synchronous by contract (REQ-UI-01: acknowledge before
 * persisting), so two commands cannot interleave *inside* it. The concurrency
 * that exists is in the write queue behind it: `execute` returns, the durable
 * append is started, and the next command can arrive before that promise
 * settles. That is the window a double tap actually lands in, and it is the one
 * exercised below — a burst of `execute` calls with no `await` between them,
 * followed by a `flush` and a relaunch to see what was really written.
 *
 * The hostile inputs are the ones a real gesture produces: the identical text
 * twice, the same word with a stray space, a width variant pasted from a
 * different source, and a repeat after a reload — each of which must land on
 * the thread the learner already has.
 */

import { describe, expect, it } from 'vitest';

import { createDeterministicContext, type DomainContext } from '@bunki/domain';

import { createDurableAppStore } from '../../src/state/durable-store.ts';
import type { CaptureCommand } from '../../src/state/store.ts';

const SOURCE = { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' } as const;
const OTHER_SOURCE = { sourceId: 'reader', kind: 'text', locator: 'article-7#p2' } as const;
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

/** Enough instants that a burst of commands never exhausts the scripted clock. */
const INSTANTS = Array.from(
  { length: 600 },
  (_value, index) =>
    `2026-07-27T09:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
);

function newContext(idPrefix: string): DomainContext {
  return createDeterministicContext({ instants: INSTANTS, idPrefix });
}

/** `localStorage`'s shape, which is the interface the web adapter asks for. */
function newSnapshotStore(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const APP_VERSIONS = { domain: '@bunki/domain@0.0.0', fsrs: null } as const;

async function launch(
  snapshotStore: ReturnType<typeof newSnapshotStore>,
  idPrefix: string,
): ReturnType<typeof createDurableAppStore> {
  const context = newContext(idPrefix);
  return createDurableAppStore({
    appVersions: APP_VERSIONS,
    clock: context.clock,
    context,
    snapshotKey: 'adversarial-store',
    snapshotStore,
  });
}

const capturedEventCount = (store: { readAll: () => readonly { type: string }[] }): number =>
  store.readAll().filter((event) => event.type === 'EncounterCaptured').length;

describe('T1 — a burst of identical captures produces exactly one thread', () => {
  it('collapses twenty un-awaited captures into one thread and one event', async () => {
    const snapshotStore = newSnapshotStore();
    const app = await launch(snapshotStore, 'burst-');

    // No `await` inside the loop: this is the double-tap window, where the
    // first durable write has not settled when the second command arrives.
    const acks = Array.from({ length: 20 }, () => app.store.execute(capture('分岐')));
    await app.flush();

    expect(app.store.getSnapshot().threads, 'a burst forked threads').toHaveLength(1);
    expect(capturedEventCount(app.store), 'a burst appended more than one capture').toBe(1);

    // Every acknowledgment names the same thread, so no screen ever navigated
    // to a thread that a later tap replaced.
    const threadIds = new Set(acks.map((ack) => ack.threadId));
    expect(threadIds.size, 'the burst acknowledged more than one thread id').toBe(1);

    // Exactly one of them did the work; the rest are honest no-ops.
    expect(acks.filter((ack) => ack.events.length > 0)).toHaveLength(1);
    expect(acks.filter((ack) => ack.deduplicated)).toHaveLength(19);

    // And the write state settled cleanly — a rejected append would have moved
    // the store into `failed`, which is the outcome a colliding key produces.
    expect(app.getWriteState()).toEqual({ kind: 'settled' });
  });

  it('survives the reload: the burst left one thread on disk, not twenty', async () => {
    const snapshotStore = newSnapshotStore();
    const first = await launch(snapshotStore, 'burst-');
    for (let index = 0; index < 12; index += 1) first.store.execute(capture('分岐'));
    await first.flush();

    const second = await launch(snapshotStore, 'reload-');
    expect(second.store.getSnapshot().threads, 'the reload found forked threads').toHaveLength(1);
    expect(capturedEventCount(second.store), 'the reload found duplicate captures').toBe(1);
  });

  it('a repeat after a reload is still the same capture', async () => {
    const snapshotStore = newSnapshotStore();
    const first = await launch(snapshotStore, 'run1-');
    const original = first.store.execute(capture('分岐'));
    await first.flush();

    // A second launch has a *different* id generator, so a store that keyed on
    // anything it minted itself would fork here.
    const second = await launch(snapshotStore, 'run2-');
    const repeat = second.store.execute(capture('分岐'));
    await second.flush();

    expect(repeat.deduplicated, 'a repeat after a reload was treated as new').toBe(true);
    expect(repeat.threadId, 'a repeat after a reload landed on a new thread').toBe(
      original.threadId,
    );
    expect(second.store.getSnapshot().threads).toHaveLength(1);
    expect(capturedEventCount(second.store)).toBe(1);
  });
});

describe('T1 — near-miss forms land on the thread the learner already has', () => {
  /**
   * The interesting half of the property.
   *
   * An exact repeat is caught by the idempotency key. These are not exact
   * repeats: a trailing space, a full-width variant, a different source. Each
   * produces a *different* key, so the deduplication path does not fire — and
   * the thread must still be one, because §6.1's `threadId` is "new or
   * existing" and the existing one is found by folded target. A build where
   * these forked would pass every idempotency test and still show the learner
   * three 分岐 threads.
   */
  const variants: readonly (readonly [string, string])[] = [
    ['a trailing space', '分岐 '],
    ['a leading space', ' 分岐'],
    ['a full-width space around it', '　分岐　'],
  ];

  for (const [label, text] of variants) {
    it(`folds ${label} onto the same thread`, async () => {
      const snapshotStore = newSnapshotStore();
      const app = await launch(snapshotStore, 'fold-');

      const first = app.store.execute(capture('分岐'));
      const second = app.store.execute(capture(text));
      await app.flush();

      expect(second.threadId, `${label} forked a thread`).toBe(first.threadId);
      expect(app.store.getSnapshot().threads, `${label} forked a thread`).toHaveLength(1);
    });
  }

  it('the same word met in a second source continues one thread', async () => {
    const snapshotStore = newSnapshotStore();
    const app = await launch(snapshotStore, 'source-');

    const first = app.store.execute(capture('分岐'));
    // A different source reference: a genuinely new encounter, so a *second*
    // `EncounterCaptured` is correct here. What must not happen is a second
    // thread — meeting a word again is the same word.
    const second = app.store.execute(capture('分岐', { sourceRef: OTHER_SOURCE }));
    await app.flush();

    expect(second.deduplicated, 'a genuinely new encounter was swallowed as a duplicate').toBe(
      false,
    );
    expect(second.threadId, 'a second encounter forked a thread').toBe(first.threadId);
    expect(app.store.getSnapshot().threads, 'a second encounter forked a thread').toHaveLength(1);
    expect(capturedEventCount(app.store), 'the second encounter was not recorded').toBe(2);
    expect(app.getWriteState()).toEqual({ kind: 'settled' });
  });

  it('two genuinely different words are two threads', async () => {
    // The control. A test that only ever collapses would pass if the store
    // collapsed everything, which would be a far worse bug than forking.
    const snapshotStore = newSnapshotStore();
    const app = await launch(snapshotStore, 'distinct-');

    app.store.execute(capture('分岐'));
    app.store.execute(capture('峠'));
    await app.flush();

    expect(app.store.getSnapshot().threads).toHaveLength(2);
    expect(capturedEventCount(app.store)).toBe(2);
  });
});

describe('T1 — interleaved bursts of several words stay separated', () => {
  it('round-robins four words at ten taps each into four threads', async () => {
    const snapshotStore = newSnapshotStore();
    const app = await launch(snapshotStore, 'mixed-');

    const words = ['分岐', '峠', '流れ', '境界'];
    for (let round = 0; round < 10; round += 1) {
      for (const word of words) app.store.execute(capture(word));
    }
    await app.flush();

    const threads = app.store.getSnapshot().threads;
    expect(threads, 'interleaved bursts forked threads').toHaveLength(words.length);
    expect(capturedEventCount(app.store), 'interleaved bursts duplicated captures').toBe(
      words.length,
    );
    expect(new Set(threads.map((thread) => thread.displayText))).toEqual(new Set(words));
    expect(app.getWriteState()).toEqual({ kind: 'settled' });

    // The durable log agrees with the screen after a reload.
    const reloaded = await launch(snapshotStore, 'mixed-reload-');
    expect(reloaded.store.getSnapshot().threads).toHaveLength(words.length);
  });

  it('a double-tapped promotion produces one promotion event', async () => {
    const snapshotStore = newSnapshotStore();
    const app = await launch(snapshotStore, 'promote-');

    const ack = app.store.execute(capture('分岐'));
    const promotions = Array.from({ length: 8 }, () =>
      app.store.execute({ kind: 'promote', threadId: ack.threadId, to: 'learn' }),
    );
    await app.flush();

    const promotionEvents = app.store
      .readAll()
      .filter((event) => event.type === 'ThreadPromotionChanged');
    expect(promotionEvents, 'a double-tapped promotion appended more than one event').toHaveLength(
      1,
    );
    expect(promotions.every((entry) => entry.threadId === ack.threadId)).toBe(true);
    expect(app.store.getSnapshot().threadsById[ack.threadId]?.state.promotion).toBe('learn');
    expect(app.getWriteState()).toEqual({ kind: 'settled' });
  });
});
