/**
 * T-14 over the operator's actual session data (WP-10; controller §11,
 * REQ-ARCH-08, definition of done §2 item 4).
 *
 * ## What was wrong, and why a green `verify:export` did not catch it
 *
 * `npm run verify:export` was green throughout, over hand-built fixtures in
 * `packages/export/test/`. The definition of done anticipated exactly that and
 * names it a failure of done rather than a nuance: *"`verify:export` green on a
 * toy fixture but the operator's actual session data fails round-trip."* It did
 * not fail the round trip — it was not in the export at all. A learner could
 * promote a thread, answer a review, meet the word in the canvas, close the
 * sitting, and export a file containing none of it.
 *
 * So this file runs the loop the operator runs, through the app's own store and
 * the app's own session functions, and then asks the export the T-14 question
 * about *that* log. Nothing here is a fixture: the capture and the promotions are
 * the two commands the capture screen dispatches, the sitting is
 * `bootstrapSessionWorkspace` + `applySessionCommand` (the exact pair the screens
 * call), and the export is `prepareExport`, the exact call behind the button.
 *
 * ## Why the store is the durable one
 *
 * `createDurableAppStore` over an injected snapshot map, so the second half of
 * each test can throw the store away and open a new one over the same bytes.
 * That is the operator's step 7 — force-quit and reopen — and it is the only way
 * to tell "the events are in the log" from "the events are in a closure that is
 * about to be garbage collected".
 *
 * ## What this file does not claim
 *
 * Native durability (WP-11), and anything about the *plan*. A session's plan is
 * not an event and is not exported; what round-trips is what the learner did.
 */

import { describe, expect, it } from 'vitest';

import {
  applySessionCommand,
  createDeterministicContext,
  type DomainContext,
  type SessionWorkspaceState,
} from '@bunki/domain';
import { appVersionsForBuild, prepareExport } from '@bunki/export';

import { DEFAULT_CANONICAL_TARGET, findLexemeByHeadword } from '../src/data/catalog.ts';
import { buildEvidenceChain, type EvidenceChain } from '../src/screens/evidence-chain.ts';
import {
  bootstrapSessionWorkspace,
  passageMarks,
  persistWorkspaceEvents,
  persistedEventIds,
  probeOfferFor,
  type SessionTarget,
} from '../src/screens/session-loop.ts';
import {
  answerCloze,
  exposeOnCanvas,
  presentCloze,
  type ClozeTarget,
} from '../src/screens/canvas-cloze.ts';
import { createDurableAppStore, type DurableAppStore } from '../src/state/durable-store.ts';
import type { AppStore } from '../src/state/store.ts';

const ASOF = '2026-07-27T10:00:00.000Z';

const MANUAL_SOURCE = {
  sourceId: 'manual-entry',
  kind: 'manual',
  locator: 'capture-screen',
} as const;

const MANUAL_PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

/**
 * One browser profile's worth of storage, reused across "restarts".
 *
 * A plain `Map` standing in for `localStorage`; the web adapter's own contract
 * test covers the adapter, and what matters here is that the second store reads
 * bytes the first store wrote rather than sharing its memory.
 */
type Snapshot = Map<string, string>;

async function openStore(snapshot: Snapshot, context: DomainContext): Promise<DurableAppStore> {
  return createDurableAppStore({
    appVersions: { domain: '@bunki/domain@0.0.0', fsrs: null },
    clock: context.clock,
    context,
    snapshotKey: 'closed-loop-export-test',
    snapshotStore: {
      getItem: (key) => snapshot.get(key) ?? null,
      setItem: (key, value) => {
        snapshot.set(key, value);
      },
      removeItem: (key) => {
        snapshot.delete(key);
      },
    },
    resolveLexemeId: (text) => findLexemeByHeadword(text)?.id ?? null,
  });
}

/** The capture screen's Keep, then its "Take it up for study". */
function takeUpForStudy(store: AppStore): string {
  const lexeme = findLexemeByHeadword(DEFAULT_CANONICAL_TARGET);
  if (lexeme === null) throw new Error('the seed has no default target');
  const kept = store.execute({
    kind: 'capture',
    text: lexeme.headword,
    sourceRef: MANUAL_SOURCE,
    provenance: MANUAL_PROVENANCE,
    uncertainty: 'reading',
    lexemeId: lexeme.id,
  });
  store.execute({ kind: 'promote', threadId: kept.threadId, to: 'keep' });
  store.execute({ kind: 'promote', threadId: kept.threadId, to: 'learn' });
  return kept.threadId;
}

/**
 * The session, dispatched exactly as `useOwnSessionLoop` dispatches it.
 *
 * Including the persist step, which is the behaviour under test: apply the
 * command, then carry everything the store has not seen, sealed. The hook does
 * this in a `useCallback`; there is no React Native test renderer in this
 * project, so the loop is driven here through the same three calls.
 */
function runSitting(
  store: AppStore,
  context: DomainContext,
): { readonly target: SessionTarget; readonly workspace: SessionWorkspaceState } {
  const boot = bootstrapSessionWorkspace(store, context);
  if (boot.target === null) throw new Error(boot.error ?? 'no sitting could be planned');

  const persisted = persistedEventIds(store);
  let workspace = boot.workspace;

  // The hook's `dispatch`, minus React. Both halves are the exported functions
  // `useOwnSessionLoop` calls, not re-implementations of them — a
  // re-implementation that persisted correctly while the hook did not would have
  // been green over the exact defect this lane closes.
  const dispatch = (command: Parameters<typeof applySessionCommand>[2]): void => {
    workspace = applySessionCommand(context, workspace, command);
    persistWorkspaceEvents(store, workspace, persisted);
  };

  // 1. Start the sitting. This is the gesture that also writes the contracts the
  //    bootstrap minted — nothing was written by navigating here.
  dispatch({
    kind: 'start',
    timeBudgetMin: 10,
    newBudget: 1,
    asOf: ASOF,
    canvasId: boot.target.passage.id,
    labelByContract: boot.target.contractLabels,
  });

  // 2. One scored standalone review.
  dispatch({
    kind: 'answerStep',
    attempt: { grade: 'good', latencyMs: 2400, hintsUsed: 0, revealedBeforeRecall: false },
  });

  // 3. One contextual reuse, in two halves so both REQ-SCH-06 branches are in the
  //    log: a tap on a neighbouring word (exposure, tier D) and an answered cloze
  //    on the target under its declared contract (declared probe, tier A). Built
  //    through `canvas-cloze.ts`, which is what `canvas-screen.tsx` calls — the
  //    same interaction payloads, with the same `targetWasHidden`.
  const clozeTarget: ClozeTarget = {
    experienceId: boot.target.passage.id,
    componentId: boot.target.componentId,
    probeContractId: boot.target.probeContractId,
  };
  const cloze = presentCloze(ASOF);

  const neighbour = passageMarks(boot.target).find((mark) => !mark.isTarget);
  if (neighbour !== undefined) {
    dispatch({
      kind: 'canvasInteraction',
      offer: probeOfferFor(workspace, boot.target),
      interaction: exposeOnCanvas(cloze, boot.target.passage.id, 'tap', [neighbour.componentId]),
    });
  }

  const answered = answerCloze(cloze, clozeTarget, { grade: 'good', at: ASOF });
  dispatch({
    kind: 'canvasInteraction',
    offer: probeOfferFor(workspace, boot.target),
    interaction: answered.interaction,
  });

  // 4. Finish the finite session.
  dispatch({ kind: 'completeStep' });
  dispatch({ kind: 'close' });

  return { target: boot.target, workspace };
}

describe('the loop the operator walks reaches the durable log', () => {
  it('puts the promotion, the graded review, the canvas observations and the session bounds in the store', async () => {
    const context = createDeterministicContext({ instants: ASOF, idPrefix: 'loop-durable-' });
    const snapshot: Snapshot = new Map();
    const durable = await openStore(snapshot, context);

    takeUpForStudy(durable.store);
    runSitting(durable.store, context);
    await durable.flush();

    const types = durable.store.readAll().map((event) => event.type);

    // Every family the loop produces, in the order the learner produced it.
    expect(types).toContain('EncounterCaptured');
    expect(types.filter((type) => type === 'ThreadPromotionChanged')).toHaveLength(2);
    expect(types).toContain('SessionStarted');
    expect(types.filter((type) => type === 'ContractCreated')).toHaveLength(2);
    expect(types).toContain('ReviewGraded');
    expect(types).toContain('ExposureLogged');
    expect(types).toContain('SessionClosed');

    // Ordering: the sitting's bounds enclose its observations.
    expect(types.indexOf('SessionStarted')).toBeLessThan(types.indexOf('ReviewGraded'));
    expect(types.lastIndexOf('ReviewGraded')).toBeLessThan(types.indexOf('SessionClosed'));

    // The canvas produced *both* REQ-SCH-06 outcomes, so the log distinguishes a
    // sighting from a retrieval rather than collapsing them.
    const derived = durable.store.readDerived();
    const embedded = derived.observations.filter(
      (observation) => observation.type === 'ReviewGraded',
    );
    expect(embedded.length).toBeGreaterThanOrEqual(2);
    expect(derived.observations.some((o) => o.type === 'ExposureLogged' && o.tier === 'D')).toBe(
      true,
    );
    // Tier D never reaches the scheduler (T-08), and the log records the refusal.
    const exposureDecision = derived.gateDecisions.find((d) => d.type === 'ExposureLogged');
    expect(exposureDecision?.admitted).toBe(false);
    expect(exposureDecision?.reason).toBe('exposure_is_never_retrieval');

    // The session is closed, with an explicit completion state (REQ-SCH-04).
    expect(derived.sessions).toHaveLength(1);
    expect(derived.sessions[0]?.status).toBe('closed');
    expect(derived.sessions[0]?.completionState).not.toBeNull();
  });

  it('writes the sitting’s contracts on the start gesture, not on opening the tab', async () => {
    // The ordering that keeps the persist path from reintroducing the WP-10
    // repair round's P0. `bootstrapSessionWorkspace` mints two `ContractCreated`
    // events before any gesture; if they were written there, navigating to the
    // Session route would put events in the learner's durable log with nothing
    // behind them (definition of done §2 item 6, and the ruin of §3 step 3).
    const context = createDeterministicContext({ instants: ASOF, idPrefix: 'loop-order-' });
    const snapshot: Snapshot = new Map();
    const durable = await openStore(snapshot, context);
    takeUpForStudy(durable.store);
    const afterCapture = durable.store.readAll().length;

    // Three bootstraps — a mount, a re-render, a screen rendered outside the
    // provider — and the log has not moved.
    for (let build = 0; build < 3; build += 1) bootstrapSessionWorkspace(durable.store, context);
    await durable.flush();
    expect(durable.store.readAll()).toHaveLength(afterCapture);
    expect(durable.store.readAll().map((event) => event.type)).not.toContain('ContractCreated');

    // Then the learner presses Start, and the contracts arrive with it.
    runSitting(durable.store, context);
    await durable.flush();
    const types = durable.store.readAll().map((event) => event.type);
    expect(types).toContain('ContractCreated');
    expect(types.indexOf('ContractCreated')).toBeLessThan(types.indexOf('SessionStarted'));
  });

  it('survives the force-quit: a new store over the same bytes has the whole sitting', async () => {
    const context = createDeterministicContext({ instants: ASOF, idPrefix: 'loop-restart-' });
    const snapshot: Snapshot = new Map();

    const first = await openStore(snapshot, context);
    takeUpForStudy(first.store);
    runSitting(first.store, context);
    await first.flush();
    const before = first.store.readAll().map((event) => event.eventId);

    // The force-quit. A second context, because a reopened app is a new process
    // with a new id prefix — nothing carries over but the bytes.
    const reopened = await openStore(
      snapshot,
      createDeterministicContext({ instants: ASOF, idPrefix: 'loop-restart-2-' }),
    );

    expect(reopened.store.readAll().map((event) => event.eventId)).toEqual(before);
    expect(reopened.store.readDerived().sessions).toHaveLength(1);
  });
});

describe('T-14 over real session data, not a fixture', () => {
  it('exports the sitting and replays it to identical derived state', async () => {
    const context = createDeterministicContext({ instants: ASOF, idPrefix: 'loop-export-' });
    const snapshot: Snapshot = new Map();
    const durable = await openStore(snapshot, context);

    takeUpForStudy(durable.store);
    runSitting(durable.store, context);

    // The export button's own order: record the export *first*, so the bytes
    // contain the record of themselves and the two sides describe logs of the
    // same length (see `RecordExportCommand`).
    durable.store.execute({ kind: 'recordExport', exportVersion: '1' });
    await durable.flush();

    const prepared = prepareExport({
      events: durable.store.readAll(),
      generatedAt: context.clock.now(),
      appVersions: appVersionsForBuild(),
      liveState: durable.store.readDerived(),
      // `survives-reload`, not the store's own `device-local` label: the two
      // vocabularies are deliberately different. `@bunki/export` describes what a
      // check did not establish and must not name an adapter (P0-CAP-15).
      storageDurability: 'survives-reload',
    });

    expect(prepared.verification.firstDifference).toBeNull();
    expect(prepared.verification.equal).toBe(true);
    expect(prepared.verification.eventCount).toBe(durable.store.readAll().length);

    // The assertion that makes this T-14 rather than a tautology: the bytes
    // being replayed actually contain the sitting. A round trip over a log with
    // no session events in it would pass the equality check and prove nothing —
    // which is precisely what `verify:export` was doing before this lane.
    const exported = prepared.envelope.events.map((event) => event.type);
    for (const family of [
      'SessionStarted',
      'ContractCreated',
      'ReviewGraded',
      'ExposureLogged',
      'SessionClosed',
    ]) {
      expect(exported, family).toContain(family);
    }

    // T-15's half: the encounter's provenance travelled with the bytes.
    expect(prepared.envelope.seedRefs.some((ref) => ref.sourceId === 'manual-entry')).toBe(true);
  });

  it('replays the exported bytes after a restart, from storage rather than memory', async () => {
    const context = createDeterministicContext({ instants: ASOF, idPrefix: 'loop-export-cold-' });
    const snapshot: Snapshot = new Map();

    const first = await openStore(snapshot, context);
    takeUpForStudy(first.store);
    runSitting(first.store, context);
    await first.flush();

    // Cold open, then export. This is the operator's step 8 after step 7: the
    // bytes exported are the bytes that survived the force-quit.
    const cold = await openStore(
      snapshot,
      createDeterministicContext({ instants: ASOF, idPrefix: 'loop-export-cold-2-' }),
    );
    cold.store.execute({ kind: 'recordExport', exportVersion: '1' });
    await cold.flush();

    const prepared = prepareExport({
      events: cold.store.readAll(),
      generatedAt: ASOF,
      appVersions: appVersionsForBuild(),
      liveState: cold.store.readDerived(),
      // `survives-reload`, not the store's own `device-local` label: the two
      // vocabularies are deliberately different. `@bunki/export` describes what a
      // check did not establish and must not name an adapter (P0-CAP-15).
      storageDurability: 'survives-reload',
    });

    expect(prepared.verification.equal).toBe(true);
    expect(prepared.envelope.events.map((event) => event.type)).toContain('ReviewGraded');
  });
});

/** The inspector's own projection over a store, at the argument list the screen passes. */
function inspect(store: AppStore, threadId: string, componentId: string): EvidenceChain {
  const thread = store.getSnapshot().threadsById[threadId];
  if (thread === undefined) throw new Error(`no thread ${threadId}`);
  return buildEvidenceChain({
    state: store.readDerived(),
    log: store.readAll(),
    thread: thread.state,
    displayText: thread.displayText,
    componentId,
    uncertaintyMark: null,
    uncertaintyLogNote: '',
  });
}

describe('the evidence inspector can show the sitting it could not see before', () => {
  it('builds a chain containing the session’s own graded observations', async () => {
    const context = createDeterministicContext({ instants: ASOF, idPrefix: 'loop-inspect-' });
    const snapshot: Snapshot = new Map();
    const durable = await openStore(snapshot, context);

    const threadId = takeUpForStudy(durable.store);
    const { target } = runSitting(durable.store, context);
    await durable.flush();

    const chain = inspect(durable.store, threadId, target.componentId);

    // Rows, not an empty ledger. Before this lane the inspector had nothing to
    // show for a real sitting and the demonstration button was the only way to
    // make it non-empty.
    expect(chain.rows.length).toBeGreaterThan(0);
    expect(chain.rows.some((row) => row.type === 'ReviewGraded')).toBe(true);

    // And none of it is the demonstration chain: this came from the sitting.
    expect(chain.demonstration.present).toBe(false);

    // The promotion the learner made is still the reason the thread is in front
    // of them (REQ-LM-06), and both rungs are in the state-change list.
    expect(chain.stateChanges.map((change) => `${change.from}→${change.to}`)).toEqual([
      'captured→keep',
      'keep→learn',
    ]);
  });

  /**
   * The flag the screen renders the demonstration note on, over the operator's
   * own sitting (WP-10 repair P1).
   *
   * `demonstration.present` was already asserted false above, but only as one
   * line inside a test about the chain being non-empty — and nothing said the
   * *note* was rendered on it. The inspector rendered
   * `DEMONSTRATION_CHAIN_NOTE` unconditionally, so a learner who had just
   * answered two reviews was told those rows "were appended by the 'Add a
   * demonstration chain' button … not by a study session". Both directions are
   * pinned here on one log, because "the note is gone" is also a defect: a
   * build that simply stopped disclosing the demonstration would satisfy the
   * false half alone.
   */
  it('flips the demonstration flag only when the button has written to the chain', async () => {
    const context = createDeterministicContext({ instants: ASOF, idPrefix: 'loop-demo-gate-' });
    const snapshot: Snapshot = new Map();
    const durable = await openStore(snapshot, context);

    const threadId = takeUpForStudy(durable.store);
    const { target } = runSitting(durable.store, context);
    await durable.flush();

    const afterSitting = inspect(durable.store, threadId, target.componentId);
    // The sitting's own graded rows are in this chain…
    expect(afterSitting.rows.some((row) => row.type === 'ReviewGraded')).toBe(true);
    // …and the button wrote none of them, so the note must not be on screen.
    expect(afterSitting.demonstration.present).toBe(false);
    expect(afterSitting.demonstration.rowCount).toBe(0);

    durable.store.execute({
      kind: 'seedEvidenceDemonstration',
      threadId,
      acceptedAnswers: ['branching'],
      skill: 'form_to_meaning',
    });
    await durable.flush();

    const afterDemonstration = inspect(durable.store, threadId, target.componentId);
    expect(afterDemonstration.demonstration.present).toBe(true);
    expect(afterDemonstration.demonstration.rowCount).toBeGreaterThan(0);
    // Not every admitted row: the learner's sitting is still in here, which is
    // why the note has to name what the button wrote rather than the chain.
    expect(afterDemonstration.demonstration.allAdmittedAreDemonstration).toBe(false);
  });
});
