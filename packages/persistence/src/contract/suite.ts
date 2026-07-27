/**
 * The port contract-test suite (WP-03; controller §7, §18 WP-03).
 *
 * > sqlite + provisional web adapters passing **the same** port contract-test
 * > suite
 *
 * "The same" is the requirement, so the suite is written once, here, in `src/`
 * rather than in `test/`. Three consequences follow, and all three are the point:
 *
 *   1. Both adapters are held to identical assertions, not to two hand-written
 *      test files that started identical and drifted.
 *   2. It carries **no test-framework dependency**. Cases are plain async
 *      functions that throw; `test/` wraps them in Vitest. WP-11 can run the
 *      identical list on a device with a ten-line runner and report the results
 *      as native evidence — which is the only way a device claim can be
 *      compared with a CI claim at all.
 *   3. A new adapter (IndexedDB, a sync backend in a later phase) is admitted by
 *      passing this list, not by someone deciding it looks equivalent.
 *
 * Each case names the controller anchors it stands for, and the runner is
 * required to put `harness.runtimeLabel` in every emitted test name — which is
 * how `ci-substitute` and `web-provisional` reach the report rather than
 * stopping at the code (controller §7, P0-CAP-15).
 */

import {
  canonicalJson,
  DuplicateEventIdError,
  IdempotencyConflictError,
  replay,
  type DomainEvent,
} from '@bunki/domain';
import { EXPORT_VERSION, verifyExportRoundTrip } from '@bunki/export';

import { PurgeWithoutTombstoneError, StoreClosedError } from '../errors.ts';
import type { EventStore, RuntimeLabel } from '../port.ts';
import { PURGED_TEXT_PLACEHOLDER } from '../purge.ts';
import {
  candidateAccepted,
  candidateAttached,
  contentPurged,
  encounterCaptured,
  representativeLog,
  SECOND_PURGE_CANARY_TEXT,
  PURGE_CANARY_TEXT,
  T,
  threadPromoted,
  threadTombstoned,
} from './fixtures.ts';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * What an adapter must provide to be tested.
 *
 * `open()` is called more than once per case on purpose: opening a *second*
 * store over the same underlying storage is what a restart is (T-01, T-16), and
 * a harness that could only be opened once could not tell durability from
 * memory.
 */
export interface AdapterHarness {
  /** Reaches the test name and every report. */
  readonly runtimeLabel: RuntimeLabel;
  /** Adapter identity for reports, e.g. `sqlite/node:sqlite (file)`. */
  readonly name: string;
  /** Open a store over this harness's storage, restoring whatever is there. */
  open(): Promise<EventStore>;
  /**
   * Everything the adapter has written, as text, for the purge case.
   *
   * The purge assertion cannot be made through the port — the port would only
   * ever show what it chooses to show. This is the escape hatch that lets a
   * shared case check the *bytes*: the SQLite harness returns the payload column
   * plus the raw database file, the web harness returns the snapshot string, and
   * a device harness returns the file it wrote. Any adapter that cannot answer
   * this cannot prove it deleted anything.
   */
  rawStorageDump(): Promise<string>;
  /** Drop all storage, for per-case isolation. */
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Assertions (no framework)
// ---------------------------------------------------------------------------

export class ContractAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractAssertionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function assertTrue(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContractAssertionError(message);
}

/** Canonical-JSON equality: the same comparison replay and export use. */
function assertSame(actual: unknown, expected: unknown, message: string): void {
  const left = canonicalJson(actual);
  const right = canonicalJson(expected);
  if (left !== right) {
    throw new ContractAssertionError(
      `${message}\n--- actual ---\n${left}\n--- expected ---\n${right}`,
    );
  }
}

async function assertRejects(
  body: () => Promise<unknown>,
  predicate: (error: unknown) => boolean,
  message: string,
): Promise<unknown> {
  try {
    await body();
  } catch (error) {
    if (predicate(error)) return error;
    throw new ContractAssertionError(
      `${message} — threw the wrong error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    );
  }
  throw new ContractAssertionError(`${message} — nothing was thrown`);
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export interface PortContractCase {
  /** Stable id; part of the emitted test name so a failure is greppable. */
  readonly id: string;
  readonly title: string;
  /** Controller/test anchors this case stands for. */
  readonly anchors: readonly string[];
  run(harness: AdapterHarness): Promise<void>;
}

const KEY = (name: string): { idempotencyKey: string } => ({ idempotencyKey: `batch:${name}` });

async function withStore<T>(
  harness: AdapterHarness,
  body: (store: EventStore) => Promise<T>,
): Promise<T> {
  const store = await harness.open();
  try {
    return await body(store);
  } finally {
    await store.close();
  }
}

/** Seed a store with the representative log and close it. */
async function seed(harness: AdapterHarness): Promise<readonly DomainEvent[]> {
  const log = representativeLog();
  await withStore(harness, async (store) => {
    await store.append(log, KEY('seed'));
  });
  return log;
}

export const PORT_CONTRACT_CASES: readonly PortContractCase[] = [
  {
    id: 'append-is-immediate-and-durable-across-reopen',
    title: 'an appended encounter is readable at once and survives a close/reopen',
    anchors: ['T-01', 'T-16', 'controller §7'],
    async run(harness) {
      const event = encounterCaptured();

      const immediate = await withStore(harness, async (store) => {
        const result = await store.append([event], KEY('t01'));
        assertTrue(result.outcome === 'appended', 'first append must report "appended"');
        assertTrue(
          result.eventCount === 1,
          `store should hold 1 event, holds ${result.eventCount}`,
        );
        // Immediacy is read-your-write on the *same* handle, before any reopen.
        return store.readAll();
      });
      assertSame(immediate, [event], 'the event must be readable immediately after append');

      // Durability is the same bytes from a *different* handle over the same
      // storage. Anything less is a memory test wearing a durability name.
      const afterReopen = await withStore(harness, async (store) => store.readAll());
      assertSame(afterReopen, [event], 'the event must survive a close and reopen unchanged');
    },
  },

  {
    id: 'repeated-batch-key-with-identical-payload-is-a-noop',
    title: 'the same idempotencyKey with the same events writes nothing the second time',
    anchors: ['controller §7', 'REQ-DM-04.4'],
    async run(harness) {
      const events = [encounterCaptured()];

      await withStore(harness, async (store) => {
        const first = await store.append(events, KEY('double-tap'));
        const second = await store.append(events, KEY('double-tap'));

        assertTrue(first.outcome === 'appended', 'first append must write');
        assertTrue(
          second.outcome === 'duplicate-noop',
          `second append must be a no-op, was "${second.outcome}"`,
        );
        assertTrue(
          second.appendedEventIds.length === 0,
          'a no-op append must report no newly appended events',
        );
        assertTrue(
          (await store.countEvents()) === 1,
          'a double-tapped capture must produce exactly one event',
        );
        const state = await store.snapshot();
        assertTrue(
          state.threads.length === 1,
          'a double-tapped capture must produce exactly one thread',
        );
      });
    },
  },

  {
    id: 'repeated-batch-key-with-different-payload-throws',
    title: 'the same idempotencyKey with different events is a typed conflict, not a merge',
    anchors: ['controller §7', 'IdempotencyConflictError'],
    async run(harness) {
      await withStore(harness, async (store) => {
        await store.append([encounterCaptured()], KEY('conflict'));

        await assertRejects(
          () =>
            store.append(
              [encounterCaptured({ text: 'a different capture entirely' })],
              KEY('conflict'),
            ),
          (error) => error instanceof IdempotencyConflictError,
          'a conflicting payload under a used batch key must throw IdempotencyConflictError',
        );

        assertTrue(
          (await store.countEvents()) === 1,
          'a rejected append must leave the store exactly as it was',
        );
      });
    },
  },

  {
    id: 'event-level-idempotency-key-is-a-noop',
    title: 'an event whose own idempotencyKey is already stored is skipped, not duplicated',
    anchors: ['controller §7', 'ADR-002'],
    async run(harness) {
      const event = encounterCaptured();

      await withStore(harness, async (store) => {
        await store.append([event], KEY('first'));
        const second = await store.append([event], KEY('second-batch-same-event'));

        assertTrue(second.appendedEventIds.length === 0, 'the event must not be written twice');
        assertSame(
          second.skippedEventIds,
          [event.eventId],
          'the skipped event must be reported, not silently folded into the appended list',
        );
        assertTrue((await store.countEvents()) === 1, 'the log must still hold one event');
      });
    },
  },

  {
    id: 'event-level-key-with-different-payload-throws',
    title: 'reusing an event idempotencyKey for different content is a typed conflict',
    anchors: ['controller §7', 'WP-02 replay parity'],
    async run(harness) {
      const original = encounterCaptured();

      await withStore(harness, async (store) => {
        await store.append([original], KEY('a'));

        await assertRejects(
          () =>
            store.append(
              [
                encounterCaptured({
                  eventId: 'evt-other',
                  encounterId: 'encounter-other',
                  // Same key as the stored event, different everything else:
                  // two histories claiming one key, which is the situation with
                  // no safe resolution.
                  idempotencyKey: original.idempotencyKey,
                  text: 'different content, same key',
                }),
              ],
              KEY('b'),
            ),
          (error) => error instanceof IdempotencyConflictError,
          'reusing an event key for different content must throw IdempotencyConflictError',
        );
        assertTrue((await store.countEvents()) === 1, 'nothing may have been written');
      });
    },
  },

  {
    id: 'duplicate-event-id-throws',
    title: 'two different events claiming one eventId is a corrupt log, not a last-writer-wins',
    anchors: ['REQ-DM-04.4', 'DuplicateEventIdError'],
    async run(harness) {
      await withStore(harness, async (store) => {
        await store.append([encounterCaptured()], KEY('a'));

        await assertRejects(
          () =>
            store.append(
              [encounterCaptured({ idempotencyKey: 'a-different-key', text: 'different' })],
              KEY('b'),
            ),
          (error) => error instanceof DuplicateEventIdError,
          'a repeated eventId with different content must throw DuplicateEventIdError',
        );
        assertTrue((await store.countEvents()) === 1, 'nothing may have been written');
      });
    },
  },

  {
    id: 'a-batch-that-fails-writes-nothing',
    title: 'append is atomic: a batch rejected on its last event leaves the store untouched',
    anchors: ['controller §21.3(4)'],
    async run(harness) {
      await withStore(harness, async (store) => {
        const good = encounterCaptured();
        // A promotion for a thread the log never captured. Replay rejects it
        // (`replay.thread-exists`), so the whole batch must be refused — the
        // valid first event included.
        const orphan = threadPromoted({ eventId: 'evt-orphan', threadId: 'thread-never-captured' });

        await assertRejects(
          () => store.append([good, orphan], KEY('atomic')),
          (error) => error instanceof Error,
          'a batch containing an unreplayable event must be rejected',
        );

        assertTrue(
          (await store.countEvents()) === 0,
          'a failed batch must write nothing at all — not even its valid prefix',
        );
      });
    },
  },

  {
    id: 'snapshot-equals-domain-replay',
    title: 'snapshot() equals replaying readAll() through @bunki/domain',
    anchors: ['T-03', 'controller §6.3'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        const events = await store.readAll();
        assertSame(
          await store.snapshot(),
          replay(events),
          'the store must not have its own opinion about derived state',
        );
      });
    },
  },

  {
    id: 'read-stream-by-thread-resolves-indirect-references',
    title: 'a thread stream includes the events that name the thread only indirectly',
    anchors: ['controller §7', 'REQ-UI-06'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        const stream = await store.readStream({ threadId: T.thread });
        const ids = stream.map((event) => event.eventId);

        assertTrue(
          ids.includes(candidateAttached().eventId),
          'CandidateAttached names the thread and must be in its stream',
        );
        assertTrue(
          ids.includes(candidateAccepted().eventId),
          'CandidateAcceptedAsNote names only a candidate; the store must resolve it to the thread',
        );
        assertTrue(
          !ids.includes('evt-c004'),
          'a ReviewGraded belongs to a contract stream, not a thread stream',
        );
        assertSame(
          await store.readStream({ threadId: 'thread-that-does-not-exist' }),
          [],
          'an unknown thread yields an empty stream, never everything',
        );
      });
    },
  },

  {
    id: 'read-stream-by-contract',
    title: 'a contract stream holds the contract and the evidence recorded against it',
    anchors: ['controller §7'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        const ids = (await store.readStream({ contractId: T.contract })).map((e) => e.eventId);
        assertSame(ids, ['evt-c003', 'evt-c004'], 'contract stream must be exactly its own events');
      });
    },
  },

  {
    id: 'export-envelope-replays-to-the-live-state',
    title: 'exportJson() produces a §11 envelope that replays to the store’s own derived state',
    anchors: ['T-14', 'controller §11', 'P0-CAP-12'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        const envelope = await store.exportJson();

        assertTrue(
          envelope.exportVersion === EXPORT_VERSION,
          `envelope must declare exportVersion ${EXPORT_VERSION}`,
        );
        assertTrue(typeof envelope.generatedAt === 'string', 'envelope must carry generatedAt');
        assertTrue(
          envelope.appVersions.schema === 1,
          'envelope must carry the event schema version',
        );
        assertSame(
          envelope.events,
          await store.readAll(),
          'export must be the log verbatim — no filtering, no summarising',
        );

        const result = verifyExportRoundTrip(envelope, await store.snapshot());
        assertTrue(
          result.equal,
          `export must replay to the live derived state; first difference: ${String(result.firstDifference)}`,
        );
      });
    },
  },

  {
    id: 'provenance-survives-the-store-round-trip',
    title: 'source, licence and attribution survive append → reopen → export',
    anchors: ['T-15', 'REQ-SRC-01'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        const envelope = await store.exportJson();

        const stored = envelope.events.find((event) => event.eventId === 'evt-c001b');
        assertTrue(
          stored !== undefined && stored.type === 'EncounterCaptured',
          'the encounter must be present',
        );
        assertSame(
          stored.provenance,
          {
            source: 'user_encounter',
            sourceVersion: '2026-07-27',
            license: 'CC BY-SA 4.0',
            attribution: 'Fixture attribution that must survive export (T-15)',
            modificationStatus: 'unmodified',
            confidence: 1,
            reviewStatus: 'user_reviewed',
          },
          'every provenance field must survive the store round trip intact',
        );

        const ref = envelope.seedRefs.find((candidate) => candidate.license === 'CC BY-SA 4.0');
        assertTrue(
          ref !== undefined,
          'the export must surface a share-alike licence obligation at the top level, not only inside an event',
        );
        assertTrue(
          ref.attribution === 'Fixture attribution that must survive export (T-15)',
          'the attribution text must be carried verbatim into seedRefs',
        );
      });
    },
  },

  {
    id: 'tombstone-then-purge-removes-content-bytes-and-keeps-the-audit-trail',
    title: 'purge physically removes the encounter text while the deletion record survives',
    anchors: ['ADR-002', 'controller §7', 'P0-CAP-14'],
    async run(harness) {
      await seed(harness);

      const dumpBefore = await harness.rawStorageDump();
      assertTrue(
        dumpBefore.includes(PURGE_CANARY_TEXT),
        'precondition: the encounter text must actually be in storage before the purge, or this case proves nothing',
      );

      await withStore(harness, async (store) => {
        await store.append([threadTombstoned()], KEY('tombstone'));
        await store.append([contentPurged()], KEY('purge'));
      });

      const dumpAfter = await harness.rawStorageDump();
      assertTrue(
        !dumpAfter.includes(PURGE_CANARY_TEXT),
        'the purged encounter text must be gone from raw storage, not merely hidden behind a flag',
      );
      assertTrue(
        !dumpAfter.includes(SECOND_PURGE_CANARY_TEXT),
        'every encounter on the purged thread must be emptied, not only the one named by id',
      );
      assertTrue(
        !dumpAfter.includes('https://example.invalid/private/page#42'),
        'the source locator points back at the purged material and must go with it',
      );

      await withStore(harness, async (store) => {
        // The audit trail: both deletion events are still there, in full.
        const tombstone = await store.eventById('evt-c007');
        const purge = await store.eventById('evt-c008');
        assertTrue(tombstone?.type === 'ThreadTombstoned', 'the tombstone must survive the purge');
        assertTrue(purge?.type === 'ContentPurged', 'the purge record must survive the purge');

        const encounter = await store.eventById('evt-c001');
        assertTrue(
          encounter?.type === 'EncounterCaptured' && encounter.text === PURGED_TEXT_PLACEHOLDER,
          'the encounter row must remain, emptied of content, so the chain is not broken',
        );
        assertTrue(
          encounter.type === 'EncounterCaptured' && encounter.span === undefined,
          'a span into text that no longer exists must be dropped',
        );
        assertTrue(
          encounter.type === 'EncounterCaptured' &&
            encounter.provenance.license === 'user_owned' &&
            encounter.provenance.attribution !== undefined,
          'provenance is the audit trail, not the content: a licence obligation outlives the material',
        );

        const state = await store.snapshot();
        const thread = state.threads.find((candidate) => candidate.threadId === T.thread);
        assertTrue(
          thread?.lifecycle === 'purged',
          'derived state must record the thread as purged',
        );
        assertTrue(state.purges.length === 1, 'derived state must record that a purge ran');
      });
    },
  },

  {
    id: 'purge-citing-an-unknown-tombstone-is-refused',
    title: 'a purge whose tombstone is not in the log destroys nothing',
    anchors: ['ADR-002', 'controller §21.3'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        await assertRejects(
          () =>
            store.append(
              [contentPurged({ tombstoneEventId: 'evt-no-such-tombstone' })],
              KEY('bad-purge'),
            ),
          (error) => error instanceof Error,
          'a purge citing an unknown tombstone must be refused',
        );

        const encounter = await store.eventById('evt-c001');
        assertTrue(
          encounter?.type === 'EncounterCaptured' && encounter.text === PURGE_CANARY_TEXT,
          'a refused purge must not have emptied anything',
        );
      });
    },
  },

  {
    id: 'purge-may-only-empty-what-its-tombstone-marked',
    title: 'a purge whose targets exclude the tombstoned thread is refused',
    anchors: ['ADR-002'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        await store.append([threadTombstoned()], KEY('tombstone'));

        await assertRejects(
          () =>
            store.append(
              [contentPurged({ targetIds: ['some-unrelated-id'], tombstoneEventId: 'evt-c007' })],
              KEY('mismatched-purge'),
            ),
          (error) => error instanceof PurgeWithoutTombstoneError,
          'a purge whose targets do not include the tombstoned thread must be refused',
        );
      });
    },
  },

  {
    id: 're-appending-purged-content-does-not-resurrect-it',
    title: 'replaying an old capture after a purge is a no-op, never a restoration',
    anchors: ['ADR-002', 'controller §7'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        await store.append([threadTombstoned()], KEY('tombstone'));
        await store.append([contentPurged()], KEY('purge'));

        // A caller still holding the original event — a retry queue, a stale
        // client — replays it. The learner asked for those bytes to be gone.
        const result = await store.append([encounterCaptured()], KEY('resurrect-attempt'));
        assertTrue(result.appendedEventIds.length === 0, 'nothing may be written');

        const encounter = await store.eventById('evt-c001');
        assertTrue(
          encounter?.type === 'EncounterCaptured' && encounter.text === PURGED_TEXT_PLACEHOLDER,
          'purged content must stay purged',
        );
      });
      assertTrue(
        !(await harness.rawStorageDump()).includes(PURGE_CANARY_TEXT),
        'the purged text must still be absent from raw storage',
      );
    },
  },

  {
    id: 'restart-preserves-the-whole-log-and-its-streams',
    title: 'restart simulation: a reopened store answers identically to the one that wrote',
    anchors: ['T-16', 'controller §7'],
    async run(harness) {
      const log = await seed(harness);

      const before = await withStore(harness, async (store) => ({
        all: await store.readAll(),
        thread: await store.readStream({ threadId: T.thread }),
        contract: await store.readStream({ contractId: T.contract }),
        state: await store.snapshot(),
        threads: await store.listThreadIds(),
      }));

      const after = await withStore(harness, async (store) => ({
        all: await store.readAll(),
        thread: await store.readStream({ threadId: T.thread }),
        contract: await store.readStream({ contractId: T.contract }),
        state: await store.snapshot(),
        threads: await store.listThreadIds(),
      }));

      assertSame(after, before, 'every port answer must be identical across a restart');
      assertSame(after.all, log, 'the log must come back exactly as it went in');
    },
  },

  {
    id: 'derived-state-cache-tracks-the-log-and-never-leads-it',
    title: 'the cache records the last replay and snapshot() still replays',
    anchors: ['controller §7', 'controller §21.4'],
    async run(harness) {
      await withStore(harness, async (store) => {
        assertTrue(
          (await store.derivedStateCacheMeta()) === null,
          'an untouched store has no cached state to report',
        );
        await store.append([encounterCaptured()], KEY('cache'));

        const meta = await store.derivedStateCacheMeta();
        const state = await store.snapshot();
        assertTrue(meta !== null, 'the cache must be written on append');
        assertTrue(
          meta.eventCount === state.appliedEventCount && meta.lastEventId === state.lastEventId,
          'the cache must describe the log as stored',
        );
        assertTrue(
          meta.stateSchemaVersion === state.schemaVersion,
          'the cache must record which derived-state shape it holds',
        );
      });
    },
  },

  {
    id: 'a-closed-store-refuses-every-operation',
    title:
      'close() is final: further calls throw StoreClosedError rather than returning stale data',
    anchors: ['controller §7'],
    async run(harness) {
      const store = await harness.open();
      await store.append([encounterCaptured()], KEY('closed'));
      await store.close();

      await assertRejects(
        () => store.readAll(),
        (error) => error instanceof StoreClosedError,
        'readAll on a closed store must throw',
      );
      await assertRejects(
        () => store.append([threadPromoted()], KEY('after-close')),
        (error) => error instanceof StoreClosedError,
        'append on a closed store must throw',
      );
      // Idempotent close: a caller cleaning up twice is not an error.
      await store.close();
    },
  },

  {
    id: 'generated-at-comes-from-the-injected-clock',
    title: 'export timestamps are injected, so two exports of one store are byte-identical',
    anchors: ['REQ-ARCH-02', 'T-14'],
    async run(harness) {
      await seed(harness);
      await withStore(harness, async (store) => {
        const first = await store.exportJson();
        const second = await store.exportJson();
        assertSame(
          first,
          second,
          'a store whose clock is injected must export identical bytes twice; a difference means an ambient clock leaked in',
        );
      });
    },
  },
];

/**
 * The name a runner must emit.
 *
 * Two things are in it and neither is decoration.
 *
 * `runtimeLabel` first, because it is how `ci-substitute` reaches the CI log,
 * the verifier's report, and the evidence capsule — controller §7 requires the
 * label in test names, and a label that stops at the code has not been applied.
 *
 * The controller anchors next, so `T-01` and `T-16` are greppable in test output
 * by the people auditing the T-map, instead of living only in a source comment
 * nobody runs.
 */
export function contractCaseName(harness: AdapterHarness, testCase: PortContractCase): string {
  return `[${harness.runtimeLabel}] ${testCase.anchors.join(' ')} — ${testCase.id}: ${testCase.title}`;
}

/**
 * Framework-free runner, for WP-11's device checkpoint and for anyone verifying
 * this package outside Vitest.
 */
export async function runPortContractSuite(
  harness: AdapterHarness,
): Promise<
  readonly { readonly name: string; readonly passed: boolean; readonly error?: string }[]
> {
  const results: { name: string; passed: boolean; error?: string }[] = [];
  for (const testCase of PORT_CONTRACT_CASES) {
    const name = contractCaseName(harness, testCase);
    await harness.reset();
    try {
      await testCase.run(harness);
      results.push({ name, passed: true });
    } catch (error) {
      results.push({
        name,
        passed: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
    }
  }
  return results;
}
