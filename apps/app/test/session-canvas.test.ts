/**
 * The session and canvas loop, driven from the app end (WP-08; REQ-UI-05,
 * REQ-SCH-06, T-08, T-13).
 *
 * `packages/domain/test/session/` proves the rules. This file proves the *app*
 * reaches them: the same store the capture screen writes to, the same seed the
 * word page reads, the real contracts, the real gate. A classification that is
 * correct in the kernel and unreachable from `apps/app` would satisfy every
 * domain test and ship a canvas that quietly counted taps as reviews.
 *
 * ## The gestures are made here, because the app no longer makes them
 *
 * Every harness below *captures and promotes first*, through the same two
 * commands the capture screen's Keep and "Take it up for study" buttons
 * dispatch, and only then bootstraps a workspace. That is not setup ceremony: it
 * is the defect this file failed to catch. `bootstrapSessionWorkspace` used to
 * run those two commands itself, from a React state initialiser, so opening the
 * Session route fabricated an encounter and a promotion in the learner's durable
 * log with no gesture behind either — definition-of-done §2 item 6, and the ruin
 * of §3 step 3. Every test here supplied a store the bootstrap then wrote to, so
 * all 1236 of them passed with the defect present. `a session is planned, never
 * manufactured` below is the assertion that would have failed.
 *
 * WP-08's two named proofs live here as well as in the kernel, deliberately:
 *
 *   - a canvas reveal-before-recall grades `Again`;
 *   - a passive tap logs exposure only.
 *
 * There is no React Native test renderer in this project, so these drive
 * `bootstrapSessionWorkspace` and `applySessionCommand` directly — the exact
 * functions the screens call, with the screens' own arguments. What is *not*
 * covered by that, and is covered by source assertions in
 * `screen-contract.test.ts` instead, is the rendering itself.
 */

import { describe, expect, it } from 'vitest';

import {
  applySessionCommand,
  classifyCanvasInteraction,
  createDeterministicContext,
  isEvidenceEventType,
  latestStumble,
  type CanvasProbeOffer,
  type DomainContext,
  type Grade,
  type SessionWorkspaceState,
} from '@bunki/domain';

import {
  answerCloze,
  canAttempt,
  exposeOnCanvas,
  presentCloze,
  revealCloze,
  targetIsHidden,
  type ClozePresentation,
  type ClozeTarget,
} from '../src/screens/canvas-cloze.ts';
import { segmentPassage, targetSegments } from '../src/screens/canvas-passage.ts';
import { DEFAULT_CANONICAL_TARGET, findLexemeByHeadword } from '../src/data/catalog.ts';
import {
  bootstrapSessionWorkspace,
  NO_PROMOTED_TARGET_NOTE,
  passageMarks,
  probeOfferFor,
  type SessionTarget,
} from '../src/screens/session-loop.ts';
import { elapsedMs } from '../src/screens/session-timing.ts';
import { createDurableAppStore } from '../src/state/durable-store.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import type { AppStore } from '../src/state/store.ts';

const ASOF = '2026-07-27T10:00:00.000Z';

function newContext(prefix = 'app-wp08-'): DomainContext {
  return createDeterministicContext({ instants: ASOF, idPrefix: prefix });
}

/** Exactly what the capture screen records for a typed query (REQ-SRC-01). */
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
 * The learner's own two gestures: Keep, then "Take it up for study".
 *
 * These are the exact commands `capture-screen.tsx` dispatches from its two
 * press handlers. Nothing else in the app produces either one — which is the
 * property the P0 fix installed and the reason this helper lives in the test
 * rather than in the bootstrap.
 */
function takeUpForStudy(store: AppStore, headword: string = DEFAULT_CANONICAL_TARGET): string {
  const lexeme = findLexemeByHeadword(headword);
  if (lexeme === null) throw new Error(`the seed has no lexeme for ${headword}`);
  const kept = store.execute({
    kind: 'capture',
    text: lexeme.headword,
    sourceRef: MANUAL_SOURCE,
    provenance: MANUAL_PROVENANCE,
    uncertainty: null,
    lexemeId: lexeme.id,
  });
  store.execute({ kind: 'promote', threadId: kept.threadId, to: 'keep' });
  store.execute({ kind: 'promote', threadId: kept.threadId, to: 'learn' });
  return kept.threadId;
}

interface Harness {
  readonly context: DomainContext;
  readonly store: AppStore;
  readonly target: SessionTarget;
  readonly offer: CanvasProbeOffer | null;
  readonly state: SessionWorkspaceState;
}

function harness(prefix?: string): Harness {
  const context = newContext(prefix);
  const store = createMemoryAppStore({ context });
  takeUpForStudy(store);
  const boot = bootstrapSessionWorkspace(store, context);
  if (boot.target === null) throw new Error(boot.error ?? 'the seed could not bootstrap a session');
  return {
    context,
    store,
    target: boot.target,
    offer: probeOfferFor(boot.workspace, boot.target),
    state: boot.workspace,
  };
}

// ---------------------------------------------------------------------------

/**
 * The WP-10 repair round's P0, as executable assertions.
 *
 * Each of these fails against the bootstrap that shipped: it captured the seeded
 * headword and promoted it to `learn` on the way to building a workspace, so a
 * fresh store came out of `bootstrapSessionWorkspace` holding an
 * `EncounterCaptured` (a seed passage stamped `user_encounter` / `user_owned`)
 * and a `ThreadPromotionChanged` stamped `origin: "user"` — both durable, both
 * exportable, neither caused by a person.
 */
describe('a session is planned, never manufactured (definition-of-done §2.6, §3.3)', () => {
  it('appends nothing to a durable store, however many times it is built', async () => {
    // A durable store, because that is what makes the defect permanent: the
    // fabricated events survived a reload and travelled in the export.
    const context = newContext('app-wp10-durable-');
    const map = new Map<string, string>();
    const durable = await createDurableAppStore({
      appVersions: { domain: '@bunki/domain@0.0.0', fsrs: null },
      clock: context.clock,
      context,
      snapshotKey: 'session-bootstrap-test',
      snapshotStore: {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
          map.set(key, value);
        },
        removeItem: (key) => {
          map.delete(key);
        },
      },
    });

    expect(durable.store.readAll()).toHaveLength(0);

    // The mount of `(session)/_layout` — and then a re-render, and then a
    // screen rendered outside the provider, which is three bootstraps.
    for (let build = 0; build < 3; build += 1) {
      const boot = bootstrapSessionWorkspace(durable.store, context);
      expect(boot.target).toBeNull();
      expect(boot.error).toBe(NO_PROMOTED_TARGET_NOTE);
    }

    await durable.flush();
    expect(durable.store.readAll()).toEqual([]);
    expect(durable.store.getSnapshot().threads).toEqual([]);
    expect(durable.store.getSnapshot().eventCount).toBe(0);

    // …and the same store, after the learner's own two gestures, does have a
    // sitting. The empty state is the honest answer, not a broken one.
    takeUpForStudy(durable.store);
    const after = bootstrapSessionWorkspace(durable.store, context);
    expect(after.target?.lexeme.headword).toBe(DEFAULT_CANONICAL_TARGET);
  });

  it('leaves a capture that was never taken up for study out of the sitting', () => {
    // `keep` activates no contracts (REQ-DM-09), so a session over it would be a
    // session whose every observation the gate refuses. Capture is not card
    // creation (DL-05), and this is that rule where a learner can feel it.
    const context = newContext('app-wp10-keep-only-');
    const store = createMemoryAppStore({ context });
    const lexeme = findLexemeByHeadword(DEFAULT_CANONICAL_TARGET);
    const kept = store.execute({
      kind: 'capture',
      text: lexeme!.headword,
      sourceRef: MANUAL_SOURCE,
      provenance: MANUAL_PROVENANCE,
      uncertainty: null,
      lexemeId: lexeme!.id,
    });
    store.execute({ kind: 'promote', threadId: kept.threadId, to: 'keep' });
    const before = store.readAll().length;

    const boot = bootstrapSessionWorkspace(store, context);
    expect(boot.target).toBeNull();
    expect(store.readAll()).toHaveLength(before);
  });

  it('records no promotion the learner did not make', () => {
    const { state, target } = harness('app-wp10-origin-');
    const promotions = state.log.filter((event) => event.type === 'ThreadPromotionChanged');
    expect(promotions.length).toBeGreaterThan(0);
    promotions.forEach((event) => {
      expect(event.type === 'ThreadPromotionChanged' && event.threadId).toBe(target.threadId);
    });
    // Every one of them came from `takeUpForStudy` above — a press handler's
    // command. The bootstrap contributed none: it appends only contracts.
    const minted = state.log.filter((event) => event.type === 'ContractCreated');
    expect(minted).toHaveLength(2);
  });

  it('never stamps a seed passage as an encounter the learner had', () => {
    const { state } = harness('app-wp10-provenance-');
    const captures = state.log.filter((event) => event.type === 'EncounterCaptured');
    expect(captures).toHaveLength(1);
    captures.forEach((event) => {
      if (event.type !== 'EncounterCaptured') throw new Error('unreachable');
      // The one capture in the log is the learner's typed query, and it says so.
      // The old bootstrap wrote `sourceId: 'seed-passage'` with
      // `provenance.source: 'user_encounter'` — a hand-written project passage
      // recorded as something the learner met and owns (§2 item 7).
      expect(event.sourceRef.sourceId).toBe('manual-entry');
      expect(event.sourceRef.sourceId).not.toBe('seed-passage');
    });
  });

  it('takes the contract answers from the seed entry rather than from a literal', () => {
    // The contracts used to hard-code 分岐's reading and glosses, which was
    // invisible while the bootstrap also hard-coded 分岐 as the target. Now the
    // target is whatever the learner promoted, so an answer set typed here would
    // grade one word against another word's answers.
    const { state, target } = harness('app-wp10-answers-');
    const contracts = state.log.filter((event) => event.type === 'ContractCreated');
    expect(contracts).toHaveLength(2);

    const answersFor = (skill: string): readonly string[] | null => {
      const event = contracts.find(
        (candidate) => candidate.type === 'ContractCreated' && candidate.skill === skill,
      );
      if (event === undefined || event.type !== 'ContractCreated') return null;
      return event.acceptedAnswers ?? null;
    };

    expect(answersFor('orthography_to_reading')).toEqual([target.lexeme.reading]);
    expect(answersFor('form_to_meaning')).toEqual([...target.lexeme.senses]);
    expect(target.lexeme.headword).toBe(DEFAULT_CANONICAL_TARGET);
  });
});

describe('the app bootstraps a real closed loop, not a fixture', () => {
  it('plans over the thread the learner captured and promoted', () => {
    const { state, target } = harness();
    const types = state.log.map((event) => event.type);
    expect(types).toContain('EncounterCaptured');
    expect(types).toContain('ThreadPromotionChanged');
    expect(types.filter((type) => type === 'ContractCreated')).toHaveLength(2);

    const thread = state.derived.threads.find((entry) => entry.threadId === target.threadId);
    expect(thread?.promotion).toBe('learn');
  });

  it('creates meaning and reading as two distinct contracts (T-05, REQ-DM-05)', () => {
    const { state } = harness('app-wp08-two-');
    const skills = state.derived.contracts.map((contract) => contract.skill).sort();
    expect(skills).toEqual(['form_to_meaning', 'orthography_to_reading']);
    expect(new Set(state.derived.contracts.map((contract) => contract.contractId)).size).toBe(2);
  });

  it('offers exactly one probe, on the promoted target’s reading contract', () => {
    const { offer, target } = harness('app-wp08-offer-');
    expect(offer).not.toBeNull();
    expect(offer?.contractId).toBe(target.probeContractId);
    expect(offer?.targetComponentId).toBe(target.componentId);
    expect(offer?.promotion).toBe('learn');
  });

  it('is idempotent, so a re-render bootstraps nothing twice', () => {
    const context = newContext('app-wp08-idem-');
    const store = createMemoryAppStore({ context });
    takeUpForStudy(store);
    const eventsBefore = store.readAll().length;

    const first = bootstrapSessionWorkspace(store, context);
    const second = bootstrapSessionWorkspace(store, context);
    // Identity lives in the contract ids and idempotency keys, deliberately
    // not in the event ids — the kernel's own learn-contracts suite pins that
    // a re-mint draws fresh event ids. What a re-render must reproduce is the
    // *same pair under the same keys*, which is what makes the second copy a
    // no-op at the persist seam rather than a duplicate.
    expect(second.workspace.log.map((event) => event.idempotencyKey)).toEqual(
      first.workspace.log.map((event) => event.idempotencyKey),
    );
    const contractIdsOf = (log: readonly { type: string }[]): readonly string[] =>
      log
        .filter(
          (event): event is { type: string; contractId: string } =>
            event.type === 'ContractCreated',
        )
        .map((event) => event.contractId);
    expect(contractIdsOf(second.workspace.log)).toEqual(contractIdsOf(first.workspace.log));
    // …and neither build touched the store, which is the stronger property.
    expect(store.readAll()).toHaveLength(eventsBefore);
  });
});

describe('a canvas reveal before recall grades Again (T-06, REQ-SCH-06)', () => {
  it('produces one tier-A embedded review with grade again, and the gate admits it', () => {
    const { context, state, target, offer } = harness('app-wp08-reveal-');

    const after = applySessionCommand(context, state, {
      kind: 'canvasInteraction',
      offer,
      interaction: {
        experienceId: target.passage.id,
        kind: 'reveal',
        componentIds: [target.componentId],
        declaredContractId: target.probeContractId,
        targetWasHidden: true,
      },
    });

    const minted = after.log.at(-1);
    expect(minted?.type).toBe('ReviewGraded');
    if (minted?.type !== 'ReviewGraded') throw new Error('unreachable');
    expect(minted.grade).toBe('again');
    expect(minted.tier).toBe('A');
    expect(minted.probeContext).toBe('embedded');
    expect(minted.revealedBeforeRecall).toBe(true);

    const decision = after.derived.gateDecisions.at(-1);
    expect(decision?.admitted).toBe(true);
    expect(decision?.effectiveGrade).toBe('again');

    expect(after.canvasLedger).toHaveLength(1);
    expect(after.canvasLedger[0]?.classification.kind).toBe('declared_probe');
  });

  it('forces again even when the learner presses easy after revealing', () => {
    const { context, state, target, offer } = harness('app-wp08-reveal-easy-');
    const after = applySessionCommand(context, state, {
      kind: 'canvasInteraction',
      offer,
      interaction: {
        experienceId: target.passage.id,
        kind: 'cloze_attempt',
        componentIds: [target.componentId],
        declaredContractId: target.probeContractId,
        targetWasHidden: true,
        attempt: {
          grade: 'easy',
          latencyMs: 700,
          hintsUsed: 0,
          revealedBeforeRecall: true,
          userConfirmedEasy: true,
        },
      },
    });

    const minted = after.log.at(-1);
    expect(minted?.type === 'ReviewGraded' && minted.grade).toBe('again');
  });
});

describe('a passive tap logs exposure only (T-08, REQ-SCH-06)', () => {
  it('mints one tier-D exposure and moves no memory at all', () => {
    const { context, state, target, offer } = harness('app-wp08-tap-');
    const marks = passageMarks(target);
    const other = marks.find((mark) => !mark.isTarget);
    expect(other).toBeDefined();

    const after = applySessionCommand(context, state, {
      kind: 'canvasInteraction',
      offer,
      interaction: {
        experienceId: target.passage.id,
        kind: 'tap',
        componentIds: [other!.componentId],
        declaredContractId: null,
        targetWasHidden: true,
      },
    });

    const minted = after.log.at(-1);
    expect(minted?.type).toBe('ExposureLogged');
    if (minted?.type !== 'ExposureLogged') throw new Error('unreachable');
    expect(minted.tier).toBe('D');
    expect(minted.experienceId).toBe(target.passage.id);

    expect(after.derived.memoryStates).toEqual(state.derived.memoryStates);
    expect(after.derived.gateDecisions.at(-1)?.admitted).toBe(false);
    expect(after.derived.gateDecisions.at(-1)?.reason).toBe('exposure_is_never_retrieval');
    expect(after.canvasLedger[0]?.classification.kind).toBe('exposure');
  });

  it('stays exposure even when the tap lands on the promoted target itself', () => {
    const { context, state, target, offer } = harness('app-wp08-tap-target-');
    const after = applySessionCommand(context, state, {
      kind: 'canvasInteraction',
      offer,
      interaction: {
        experienceId: target.passage.id,
        kind: 'tap',
        componentIds: [target.componentId],
        declaredContractId: null,
        targetWasHidden: true,
      },
    });
    expect(after.log.at(-1)?.type).toBe('ExposureLogged');
    expect(after.derived.memoryStates).toEqual(state.derived.memoryStates);
  });

  it('treats reading the passage through as exposure over everything seen', () => {
    const { context, state, target, offer } = harness('app-wp08-read-');
    const componentIds = passageMarks(target).map((mark) => mark.componentId);
    const after = applySessionCommand(context, state, {
      kind: 'canvasInteraction',
      offer,
      interaction: {
        experienceId: target.passage.id,
        kind: 'read',
        componentIds,
        declaredContractId: null,
        targetWasHidden: true,
      },
    });

    const minted = after.log.at(-1);
    expect(minted?.type === 'ExposureLogged' && minted.componentIds.length).toBe(
      componentIds.length,
    );
    expect(after.derived.memoryStates).toEqual(state.derived.memoryStates);
  });
});

/**
 * The canvas driven the way the screen drives it (WP-08 repair round).
 *
 * Everything above hands `targetWasHidden` in as an argument, and that is
 * precisely why 145 tests could not see the P0: the screen wrote
 * `targetWasHidden: true` as a literal on both probe paths, left the four grade
 * buttons enabled after the blank was settled, and every test obligingly agreed
 * that the word was hidden. These drive `canvas-cloze.ts` — the same transitions
 * and the same interaction payloads the component dispatches — and never state
 * the field under test.
 */
describe('one blank yields at most one declared probe (REQ-SCH-06, DL-19)', () => {
  const clozeTargetOf = (target: SessionTarget): ClozeTarget => ({
    experienceId: target.passage.id,
    componentId: target.componentId,
    probeContractId: target.probeContractId,
  });

  /** Press a grade the way the screen does: from the presentation it holds. */
  const press = (
    context: DomainContext,
    state: SessionWorkspaceState,
    target: SessionTarget,
    presentation: ClozePresentation,
    grade: Grade,
    at = ASOF,
  ): { state: SessionWorkspaceState; presentation: ClozePresentation } => {
    const step = answerCloze(presentation, clozeTargetOf(target), { grade, at });
    return {
      state: applySessionCommand(context, state, {
        kind: 'canvasInteraction',
        offer: probeOfferFor(state, target),
        interaction: step.interaction,
      }),
      presentation: step.next,
    };
  };

  it('settles the blank on the first answer, and says so', () => {
    const { context, state, target } = harness('app-wp08-settle-');
    const first = press(context, state, target, presentCloze(ASOF), 'good');

    expect(targetIsHidden(first.presentation)).toBe(false);
    expect(canAttempt(first.presentation)).toBe(false);

    const minted = first.state.log.at(-1);
    expect(minted?.type).toBe('ReviewGraded');
    expect(first.state.canvasLedger.at(-1)?.classification.kind).toBe('declared_probe');
    expect(first.state.derived.gateDecisions.at(-1)?.admitted).toBe(true);
  });

  it('classifies a second press as exposure, because the word is now on the page', () => {
    const { context, state, target } = harness('app-wp08-second-');
    const first = press(context, state, target, presentCloze(ASOF), 'good');

    // The buttons are disabled at this point, so this press has no UI to arrive
    // through. Forcing it anyway is the belt-and-braces check: if a future
    // change re-enables them, the kernel is told the truth and refuses.
    const forced = answerCloze(first.presentation, clozeTargetOf(target), {
      grade: 'good',
      at: ASOF,
    });
    expect(forced.interaction.targetWasHidden).toBe(false);
    expect(
      classifyCanvasInteraction(forced.interaction, probeOfferFor(first.state, target)),
    ).toEqual({
      kind: 'exposure',
      reason: 'target_was_already_visible',
      detail: expect.any(String) as unknown as string,
    });

    const second = press(context, first.state, target, first.presentation, 'good');
    expect(second.state.log.at(-1)?.type).toBe('ExposureLogged');
    expect(second.state.derived.gateDecisions.at(-1)?.admitted).toBe(false);
    expect(second.state.derived.memoryStates).toEqual(first.state.derived.memoryStates);
    expect(JSON.stringify(second.state.derived.memoryStates)).toBe(
      JSON.stringify(first.state.derived.memoryStates),
    );
  });

  it('moves memory once for ten presses of Good on one blank', () => {
    const { context, state, target } = harness('app-wp08-ten-');
    let current = press(context, state, target, presentCloze(ASOF), 'good');
    const afterFirst = current.state.derived.memoryStates;

    for (let press_ = 1; press_ < 10; press_ += 1) {
      current = press(context, current.state, target, current.presentation, 'good');
    }

    const graded = current.state.log.filter((event) => event.type === 'ReviewGraded');
    const exposures = current.state.log.filter((event) => event.type === 'ExposureLogged');
    expect(graded).toHaveLength(1);
    expect(exposures).toHaveLength(9);
    expect(current.state.derived.memoryStates).toEqual(afterFirst);
    expect(
      current.state.derived.gateDecisions.filter((decision) => decision.admitted),
    ).toHaveLength(1);
  });

  it('settles the blank on a reveal too, so revealing then grading is not two probes', () => {
    const { context, state, target } = harness('app-wp08-reveal-settle-');
    const step = revealCloze(presentCloze(ASOF), clozeTargetOf(target), ASOF);
    expect(step.interaction.targetWasHidden).toBe(true);
    expect(canAttempt(step.next)).toBe(false);

    const revealed = applySessionCommand(context, state, {
      kind: 'canvasInteraction',
      offer: probeOfferFor(state, target),
      interaction: step.interaction,
    });
    const minted = revealed.log.at(-1);
    expect(minted?.type === 'ReviewGraded' && minted.grade).toBe('again');

    const after = press(context, revealed, target, step.next, 'easy');
    expect(after.state.log.at(-1)?.type).toBe('ExposureLogged');
    expect(after.state.derived.memoryStates).toEqual(revealed.derived.memoryStates);
  });

  it('reports the blank’s real visibility on a tap, before and after it settles', () => {
    const { target } = harness('app-wp08-visibility-');
    const hidden = presentCloze(ASOF);
    expect(exposeOnCanvas(hidden, target.passage.id, 'tap', ['kc:x']).targetWasHidden).toBe(true);

    const settled = answerCloze(hidden, clozeTargetOf(target), { grade: 'good', at: ASOF }).next;
    expect(exposeOnCanvas(settled, target.passage.id, 'read', ['kc:x']).targetWasHidden).toBe(
      false,
    );
  });
});

describe('a graded attempt carries a measured latency (REQ-SCH-06, REQ-SCH-05)', () => {
  it('reports the gap between the blank appearing and the grade being pressed', () => {
    const { context, state, target } = harness('app-wp08-latency-');
    const step = answerCloze(
      presentCloze('2026-07-27T10:00:00.000Z'),
      {
        experienceId: target.passage.id,
        componentId: target.componentId,
        probeContractId: target.probeContractId,
      },
      { grade: 'good', at: '2026-07-27T10:00:04.500Z' },
    );
    expect(step.interaction.attempt?.latencyMs).toBe(4500);

    const after = applySessionCommand(context, state, {
      kind: 'canvasInteraction',
      offer: probeOfferFor(state, target),
      interaction: step.interaction,
    });
    const minted = after.log.at(-1);
    expect(minted?.type === 'ReviewGraded' && minted.latencyMs).toBe(4500);
  });

  it('reads zero only when the clock genuinely did not move', () => {
    expect(elapsedMs(ASOF, ASOF)).toBe(0);
    expect(elapsedMs(ASOF, '2026-07-27T10:00:00.001Z')).toBe(1);
  });

  it('clamps a clock that ran backwards instead of emitting a negative duration', () => {
    // `latencyMs` is `int().min(0)`. A resync can hand two readings back out of
    // order; a negative duration is not a thing that can be true of an attempt.
    expect(elapsedMs('2026-07-27T10:00:05.000Z', ASOF)).toBe(0);
  });

  it('does not rescue an unparseable instant into a zero', () => {
    // Turning a broken clock into `0` would rebuild the defect this replaced.
    // NaN reaches the fail-closed event parser, which is where it should surface.
    expect(Number.isNaN(elapsedMs('not-an-instant', ASOF))).toBe(true);
  });
});

describe('the session the screen shows (REQ-UI-05)', () => {
  const openSession = (prefix: string) => {
    const { context, state, target } = harness(prefix);
    return {
      context,
      target,
      state: applySessionCommand(context, state, {
        kind: 'start',
        timeBudgetMin: 12,
        newBudget: 1,
        canvasId: target.passage.id,
        asOf: ASOF,
        // Exactly what `session-screen.tsx` passes. Omitting it here would make
        // this harness a *weaker* caller than the screen, and the defect below
        // — a raw contract id rendered as the recall prompt — is precisely what
        // a weaker caller hides.
        labelByContract: target.contractLabels,
      }),
    };
  };

  it('leads with a finite plan that ends in closure and has a readable recipe', () => {
    const { state } = openSession('app-wp08-plan-');
    const plan = state.runtime?.plan;
    expect(plan).toBeDefined();
    expect(plan!.stepCount).toBeGreaterThan(0);
    expect(plan!.steps.at(-1)?.kind).toBe('closure');
    expect(plan!.estimatedMinutes).toBeLessThanOrEqual(12);
    expect(plan!.recipe).toMatch(/closure/);
  });

  it('includes the integration canvas visit for the seeded passage', () => {
    const { state, target } = openSession('app-wp08-canvasstep-');
    const canvasStep = state.runtime?.plan.steps.find((step) => step.kind === 'canvas');
    expect(canvasStep?.canvasId).toBe(target.passage.id);
  });

  /**
   * W5 P1-1, as an executable assertion.
   *
   * `contractsFor` mints the reading and meaning contracts back-to-back on one
   * clock tick, so `compareDueContracts` finds equal `dueSince` values and falls
   * through to its id tiebreak — where `contract-meaning-…` sorts before
   * `contract-reading-…`. With `newBudget: 1` the planner therefore draws the
   * *meaning* contract, and the screen's old one-entry label map (built from
   * `probeContractId`, the reading contract) missed it. `selectDueContracts`
   * then fell back to `?? memory.contractId` and the learner was shown
   * `contract-meaning-lex-bunki` as the thing to recall.
   *
   * The assertion is written against the id *shape* rather than that one string,
   * so it also catches the next internal identifier that leaks — a test that
   * only knew about `contract-meaning-…` would go green the moment a third
   * contract family was added without a label.
   */
  it('never renders an internal identifier as a prompt (W5 P1-1)', () => {
    const { state } = openSession('app-wp08-labels-');
    const steps = state.runtime?.plan.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);

    // Anything that looks like one of this build's internal ids: a
    // hyphen-joined lowercase slug of the families the kernel mints.
    const INTERNAL_ID = /^(contract|thread|component|session|step|canvas|lex)-[a-z0-9-]+$/;

    for (const step of steps) {
      expect(step.label, `step ${step.stepId} (${step.kind}) shows an internal id`).not.toMatch(
        INTERNAL_ID,
      );
    }
  });

  /**
   * The half above cannot see: that the label map covers the contracts that are
   * actually minted. Without this, a map holding two *wrong* ids would still
   * pass — every label would be a fallback id, but so would every step, and the
   * shape assertion would fire on all of them rather than none.
   *
   * Asserted as an equality between two sets that are built from different
   * sources: the contracts in the workspace log, and the keys of the map the
   * screen hands the planner.
   */
  it('labels every contract the target actually mints (W5 P1-1)', () => {
    const { state, target } = harness('app-wp08-labelcover-');
    const minted = state.log
      .filter((event) => event.type === 'ContractCreated')
      .map((event) => (event as { contractId: string }).contractId)
      .sort();

    expect(minted.length).toBeGreaterThan(1);
    expect([...target.contractLabels.keys()].sort()).toEqual(minted);
    for (const label of target.contractLabels.values()) {
      expect(label).toContain(target.lexeme.headword);
    }
  });

  it('reaches an explicit completion state and records SessionClosed', () => {
    const { context, state } = openSession('app-wp08-close-');
    let current = state;
    for (let move = 0; move < (current.runtime?.plan.stepCount ?? 0); move += 1) {
      current = applySessionCommand(context, current, { kind: 'completeStep' });
    }
    current = applySessionCommand(context, current, { kind: 'close' });

    const closed = current.log.at(-1);
    expect(closed?.type).toBe('SessionClosed');
    expect(closed?.type === 'SessionClosed' && closed.completionState).toBe('completed');
    expect(current.runtime?.status).toBe('closed');
  });

  it('never lets the plan grow while the learner is in it (T-13 at the app seam)', () => {
    const { context, state, target } = openSession('app-wp08-nogrow-');
    const plan = state.runtime?.plan;
    let current = state;

    for (let move = 0; move < 8; move += 1) {
      current = applySessionCommand(context, current, {
        kind: 'canvasInteraction',
        offer: probeOfferFor(current, target),
        interaction: {
          experienceId: target.passage.id,
          kind: 'tap',
          componentIds: [target.componentId],
          declaredContractId: null,
          targetWasHidden: true,
        },
      });
      expect(current.runtime?.plan).toBe(plan);
    }
    expect(current.runtime?.plan.stepCount).toBe(plan?.stepCount);
  });

  it('opens the repair branch on an Again and rejoins only on unaided success', () => {
    const { context, state } = openSession('app-wp08-repair-');
    let current = applySessionCommand(context, state, {
      kind: 'answerStep',
      attempt: { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false },
    });

    const stumble = latestStumble(current);
    expect(stumble).not.toBeNull();

    current = applySessionCommand(context, current, { kind: 'openRepair', stumble: stumble! });
    current = applySessionCommand(context, current, {
      kind: 'chooseRepairBranch',
      branch: current.repair!.recommended,
      at: ASOF,
    });
    current = applySessionCommand(context, current, {
      kind: 'repairProbe',
      attempt: { grade: 'good', latencyMs: 2500, hintsUsed: 1, revealedBeforeRecall: false },
    });
    current = applySessionCommand(context, current, { kind: 'checkRejoin' });
    expect(current.repair?.phase).toBe('in_branch');

    current = applySessionCommand(context, current, {
      kind: 'repairProbe',
      attempt: { grade: 'good', latencyMs: 2100, hintsUsed: 0, revealedBeforeRecall: false },
    });
    current = applySessionCommand(context, current, { kind: 'checkRejoin' });
    expect(current.repair?.phase).toBe('rejoined');
  });
});

describe('the passage is cut without guessing', () => {
  it('finds the promoted target in the seed body', () => {
    const { target } = harness('app-wp08-seg-');
    const segments = segmentPassage(target.passage.body, passageMarks(target));
    expect(targetSegments(segments).length).toBeGreaterThan(0);
    expect(segments.map((segment) => segment.text ?? '').join('')).toBe(target.passage.body);
  });

  it('keeps every character, in order, whatever is marked', () => {
    const body = 'ABCDE';
    const marks = [
      { form: 'BC', componentId: 'kc:BC', isTarget: false },
      { form: 'E', componentId: 'kc:E', isTarget: true },
    ];
    const segments = segmentPassage(body, marks);
    expect(segments.map((segment) => segment.text).join('')).toBe(body);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'mark', 'text', 'mark']);
  });

  it('lets the promoted target win against a longer word that contains it', () => {
    // The seed passage embeds 分岐 only inside 分岐点. A plain longest-first
    // rule would swallow the target and leave the canvas with no probe at all —
    // a failure that renders as a perfectly normal page.
    const segments = segmentPassage('分岐点', [
      { form: '分岐', componentId: 'kc:分岐', isTarget: true },
      { form: '分岐点', componentId: 'kc:分岐点', isTarget: false },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.kind === 'mark' && segments[0].mark.isTarget).toBe(true);
    expect(segments[1]).toEqual({ kind: 'text', text: '点' });
  });

  it('still prefers the longer form among non-targets', () => {
    const segments = segmentPassage('線路と道路', [
      { form: '路', componentId: 'kc:路', isTarget: false },
      { form: '線路', componentId: 'kc:線路', isTarget: false },
      { form: '道路', componentId: 'kc:道路', isTarget: false },
    ]);
    const marks = segments.filter((segment) => segment.kind === 'mark');
    expect(marks.map((segment) => segment.text)).toEqual(['線路', '道路']);
  });

  it('numbers repeated occurrences so each has its own identity', () => {
    const segments = segmentPassage('道と道', [
      { form: '道', componentId: 'kc:道', isTarget: false },
    ]);
    const marks = segments.filter((segment) => segment.kind === 'mark');
    expect(marks).toHaveLength(2);
    expect(marks.map((segment) => (segment.kind === 'mark' ? segment.occurrence : -1))).toEqual([
      0, 1,
    ]);
  });

  it('marks nothing when nothing matches, rather than guessing a span', () => {
    const segments = segmentPassage('駅を出ると', [
      { form: '線路', componentId: 'kc:線路', isTarget: true },
    ]);
    expect(segments).toEqual([{ kind: 'text', text: '駅を出ると' }]);
  });
});

describe('the app end mints nothing of its own', () => {
  it('emits only kernel-built events, and every evidence one reaches the gate', () => {
    const { context, state, target } = harness('app-wp08-boundary-');
    let current = applySessionCommand(context, state, {
      kind: 'start',
      timeBudgetMin: 12,
      newBudget: 1,
      canvasId: target.passage.id,
      asOf: ASOF,
    });
    current = applySessionCommand(context, current, {
      kind: 'canvasInteraction',
      offer: probeOfferFor(current, target),
      interaction: {
        experienceId: target.passage.id,
        kind: 'reveal',
        componentIds: [target.componentId],
        declaredContractId: target.probeContractId,
        targetWasHidden: true,
      },
    });

    const evidence = current.log.filter((event) => isEvidenceEventType(event.type));
    expect(evidence.length).toBeGreaterThan(0);
    evidence.forEach((event) => {
      expect(
        current.derived.gateDecisions.some((decision) => decision.eventId === event.eventId),
      ).toBe(true);
    });
  });
});
