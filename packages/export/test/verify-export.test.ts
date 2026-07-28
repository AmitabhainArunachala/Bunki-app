/**
 * `npm run verify:export` (WP-03; T-14, controller §11).
 *
 * This file *is* the script. The root `verify:export` runs exactly this suite,
 * replacing the WP-01 placeholder that printed a notice and exited 0.
 *
 * What the controller asks for, verbatim:
 *
 * > `npm run verify:export` replays an export through the domain reducer and
 * > asserts derived-state equality with the live store (T-14).
 *
 * So the check runs against **real stores**, not against a hand-built envelope:
 * seed a store, export it, replay the export through `@bunki/domain`, compare
 * with the store's own derived state. It runs against **both** adapters,
 * because an export that round-trips on one and not the other is not a working
 * export.
 *
 * Both runs are labeled. The SQLite run is `ci-substitute`; the web run is
 * `web-provisional`. Neither is native (P0-CAP-15).
 *
 * This is the **T-14 skeleton** WP-03 owes. WP-09 owns the full T-14: the export
 * button in the evidence inspector, and the round trip driven from the UI.
 *
 * ## WP-10: a real sitting, because a representative log was not one
 *
 * `representativeLog()` is hand-assembled — every family, in a plausible order,
 * written by a person. It is the right fixture for "does the envelope survive
 * serialisation", and it is *not* evidence that the loop the operator walks
 * round-trips: it contains events no code path in the app produced.
 *
 * That distinction stopped being academic. Until this lane, no session event of
 * any kind reached the durable log, so this suite was green over exports that
 * could not have contained a sitting — exactly the failure the definition of done
 * names: *"`verify:export` green on a toy fixture but the operator's actual
 * session data fails round-trip."* The `[real sitting]` block below therefore
 * builds its log by *running a session* through `@bunki/domain`'s own command
 * handler — the same `applySessionCommand` the session screen dispatches, with
 * the evidence-class events minted by the gate — and asserts both that it
 * round-trips and that the session families are in the bytes. The second half is
 * what stops the first from being a tautology.
 *
 * `apps/app/test/closed-loop-export.test.ts` carries the same question one layer
 * up, through the app's durable store and a simulated force-quit.
 */

import {
  EMPTY_DERIVED_STATE,
  applySessionCommand,
  componentIdOfEncounter,
  createDeterministicContext,
  createDomainEvent,
  createSessionWorkspace,
  createTargetContract,
  replay,
  type DomainEvent,
  type EncounterCapturedEvent,
} from '@bunki/domain';
import {
  ProvisionalWebEventStore,
  SqliteEventStore,
  createMemorySnapshotStore,
  representativeLog,
  threadTombstoned,
  contentPurged,
  type EventStore,
  type EventStoreConfig,
} from '@bunki/persistence';
import { openNodeSqliteDriver } from '@bunki/persistence/ci-substitute';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  EXPORT_VERSION,
  parseExportEnvelope,
  serializeExportEnvelope,
  verifyExportRoundTrip,
} from '../src/index.ts';

const CONFIG: EventStoreConfig = {
  clock: { now: () => '2026-07-27T12:00:00.000Z' },
  // `fsrs: null` is the honest value at WP-03 — no scheduler is pinned in this
  // build. WP-06 owns the pin (controller §6.3).
  appVersions: { domain: '@bunki/domain@0.0.0', fsrs: null },
};

const temporaryDirectories: string[] = [];

function openSqliteStore(): EventStore {
  const directory = mkdtempSync(join(tmpdir(), 'bunki-verify-export-'));
  temporaryDirectories.push(directory);
  return SqliteEventStore.open(
    openNodeSqliteDriver({ location: join(directory, 'bunki.db') }),
    CONFIG,
  );
}

function openWebStore(): EventStore {
  return ProvisionalWebEventStore.open({ ...CONFIG, snapshotStore: createMemorySnapshotStore() });
}

afterAll(() => {
  temporaryDirectories.forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

const adapters: readonly { readonly label: string; readonly open: () => EventStore }[] = [
  { label: 'ci-substitute', open: openSqliteStore },
  { label: 'web-provisional', open: openWebStore },
];

/**
 * A log produced by *running a sitting*, not by writing one down.
 *
 * Capture and promote through the generic factory (what the store's capture and
 * promote commands do), then hand the whole thing to `applySessionCommand` and
 * drive it: start, answer, meet the word in the passage, close. Every
 * evidence-class event below is minted by `src/evidence/`, and the tiers are
 * stamped there rather than chosen here — this function *cannot* write a tier-A
 * review for a passage sighting even if it tried.
 *
 * The point of building it this way rather than listing events is that a change
 * to what a sitting produces changes this fixture automatically. A hand-written
 * log stays green while the product it claims to describe moves.
 */
function sittingLog(): readonly DomainEvent[] {
  const at = '2026-07-27T12:00:00.000Z';
  const context = createDeterministicContext({ instants: at, idPrefix: 'sitting-' });

  const capture: EncounterCapturedEvent = createDomainEvent(
    context,
    'EncounterCaptured',
    {
      encounterId: 'encounter-sitting-1',
      threadId: 'thread-sitting-1',
      text: '分岐',
      sourceRef: { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' },
      provenance: {
        source: 'user_encounter',
        license: 'user_owned',
        modificationStatus: 'unmodified',
        reviewStatus: 'unreviewed',
      },
      uncertaintyMark: true,
    },
    { idempotencyKey: 'capture:sitting-1' },
  );

  const componentId = componentIdOfEncounter(capture);
  const contractId = 'contract-sitting-reading';

  const seed: readonly DomainEvent[] = [
    capture,
    createDomainEvent(
      context,
      'ThreadPromotionChanged',
      { threadId: 'thread-sitting-1', from: 'captured', to: 'keep', origin: 'user' },
      { idempotencyKey: 'promote:sitting-1:captured->keep' },
    ),
    createDomainEvent(
      context,
      'ThreadPromotionChanged',
      { threadId: 'thread-sitting-1', from: 'keep', to: 'learn', origin: 'user' },
      { idempotencyKey: 'promote:sitting-1:keep->learn' },
    ),
    createTargetContract(
      context,
      {
        contractId,
        contractVersion: 1,
        targetComponentId: componentId,
        skill: 'orthography_to_reading',
        cueModality: 'text',
        responseModality: 'text',
        acceptedAnswers: ['ぶんき'],
        hintPolicy: { hintsAllowed: true, maxHints: 1 },
        revealPolicy: { revealAllowed: true, revealIsRecorded: true },
        promptFamilyVersion: 'pf-verify-export.1',
      },
      { idempotencyKey: `contract:${contractId}` },
    ),
  ];

  let workspace = createSessionWorkspace(seed);
  const step = (command: Parameters<typeof applySessionCommand>[2]): void => {
    workspace = applySessionCommand(context, workspace, command);
  };

  step({ kind: 'start', timeBudgetMin: 10, newBudget: 1, asOf: at, canvasId: 'passage-sitting' });
  step({
    kind: 'answerStep',
    attempt: { grade: 'good', latencyMs: 2400, hintsUsed: 0, revealedBeforeRecall: false },
  });
  // A tap on something else in the passage: exposure, tier D, never scheduled on.
  step({
    kind: 'canvasInteraction',
    offer: null,
    interaction: {
      experienceId: 'passage-sitting',
      kind: 'tap',
      componentIds: ['kc:other'],
      targetWasHidden: true,
    },
  });
  step({ kind: 'close', completionState: 'completed' });

  return workspace.log;
}

adapters.forEach(({ label, open }) => {
  describe(`[${label}] T-14 — export replays to the live derived state`, () => {
    it('round-trips a populated store', async () => {
      const store = open();
      await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });

      const envelope = await store.exportJson();
      const result = verifyExportRoundTrip(envelope, await store.snapshot());

      expect(
        result.equal,
        `export did not replay to the live state; first difference: ${String(result.firstDifference)}`,
      ).toBe(true);
      expect(result.eventCount).toBe(representativeLog().length);
      await store.close();
    });

    it('round-trips an empty store', async () => {
      const store = open();
      const result = verifyExportRoundTrip(await store.exportJson(), await store.snapshot());
      expect(result.equal).toBe(true);
      expect(result.eventCount).toBe(0);
      await store.close();
    });

    it('round-trips a store whose content has been tombstoned and purged', async () => {
      // The hardest case for a round trip: the stored log is no longer the log
      // that was written. If replay of the *purged* export did not reproduce the
      // store's state, deletion would quietly break exportability — which is how
      // a user who deletes one thread loses the ability to verify all the others.
      const store = open();
      await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });
      await store.append([threadTombstoned()], { idempotencyKey: 'batch:tombstone' });
      await store.append([contentPurged()], { idempotencyKey: 'batch:purge' });

      const result = verifyExportRoundTrip(await store.exportJson(), await store.snapshot());
      expect(result.equal).toBe(true);
      expect(result.replayedState.purges).toHaveLength(1);
      await store.close();
    });

    it('survives serialisation to text and back, which is what an export actually is', async () => {
      const store = open();
      await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });

      // An export leaves the process as bytes. Verifying the in-memory object
      // would skip the only step where a JSON-hostile value could be lost.
      const text = serializeExportEnvelope(await store.exportJson());
      const reparsed = parseExportEnvelope(JSON.parse(text));

      expect(reparsed.exportVersion).toBe(EXPORT_VERSION);
      expect(verifyExportRoundTrip(reparsed, await store.snapshot()).equal).toBe(true);
      expect(replay(reparsed.events)).toEqual(await store.snapshot());
      await store.close();
    });
  });

  describe(`[${label}] T-14 — a real sitting round-trips`, () => {
    it('exports a log produced by running a session, and replays it to the same state', async () => {
      const store = open();
      const log = sittingLog();
      await store.append(log, { idempotencyKey: 'batch:sitting' });

      const envelope = await store.exportJson();
      const result = verifyExportRoundTrip(envelope, await store.snapshot());

      expect(
        result.equal,
        `a real sitting did not replay; first difference: ${String(result.firstDifference)}`,
      ).toBe(true);
      expect(result.eventCount).toBe(log.length);

      // The half that stops the equality check being a tautology: the bytes
      // actually contain a sitting. An export with no session events in it
      // replays perfectly and proves nothing, which is what this suite was doing
      // before the durable-session join.
      const families = envelope.events.map((event) => event.type);
      for (const family of [
        'SessionStarted',
        'ContractCreated',
        'ReviewGraded',
        'ExposureLogged',
        'SessionClosed',
      ]) {
        expect(families, family).toContain(family);
      }

      // And the gate's verdicts survived the round trip, both ways: the declared
      // review counted, the passage sighting did not (T-08, REQ-SCH-06).
      const replayed = result.replayedState;
      expect(replayed.gateDecisions.find((d) => d.type === 'ReviewGraded')?.admitted).toBe(true);
      expect(replayed.gateDecisions.find((d) => d.type === 'ExposureLogged')?.admitted).toBe(false);
      expect(replayed.sessions).toHaveLength(1);
      expect(replayed.sessions[0]?.completionState).toBe('completed');

      await store.close();
    });

    it('survives serialisation to text and back with the sitting intact', async () => {
      const store = open();
      await store.append(sittingLog(), { idempotencyKey: 'batch:sitting' });

      const text = serializeExportEnvelope(await store.exportJson());
      const reparsed = parseExportEnvelope(JSON.parse(text));

      expect(replay(reparsed.events)).toEqual(await store.snapshot());
      expect(reparsed.events.map((event) => event.type)).toContain('SessionClosed');
      await store.close();
    });
  });
});

describe('verify:export fails when it should', () => {
  it('reports inequality rather than throwing when the state does not match', async () => {
    const store = openSqliteStore();
    await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });
    const envelope = await store.exportJson();

    // Replay a *different* store's state against this export. A verifier that
    // only ever returned `equal: true` would pass every export ever written, so
    // the negative control is load-bearing.
    const other = openWebStore();
    const result = verifyExportRoundTrip(envelope, await other.snapshot());

    expect(result.equal).toBe(false);
    expect(result.firstDifference).not.toBeNull();
    await store.close();
    await other.close();
  });

  it('refuses an envelope whose export version this build does not implement', async () => {
    const store = openSqliteStore();
    const envelope = await store.exportJson();
    const tampered = { ...envelope, exportVersion: 2 };

    expect(() => verifyExportRoundTrip(tampered, EMPTY_DERIVED_STATE)).toThrow(
      /Unknown export version/,
    );
    await store.close();
  });
});
