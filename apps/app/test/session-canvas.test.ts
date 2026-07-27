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
import {
  bootstrapSessionWorkspace,
  passageMarks,
  probeOfferFor,
  type SessionTarget,
} from '../src/screens/session-loop.ts';
import { elapsedMs } from '../src/screens/session-timing.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';

const ASOF = '2026-07-27T10:00:00.000Z';

function newContext(prefix = 'app-wp08-'): DomainContext {
  return createDeterministicContext({ instants: ASOF, idPrefix: prefix });
}

interface Harness {
  readonly context: DomainContext;
  readonly target: SessionTarget;
  readonly offer: CanvasProbeOffer | null;
  readonly state: SessionWorkspaceState;
}

function harness(prefix?: string): Harness {
  const context = newContext(prefix);
  const store = createMemoryAppStore({ context });
  const boot = bootstrapSessionWorkspace(store, context);
  if (boot.target === null) throw new Error(boot.error ?? 'the seed could not bootstrap a session');
  return {
    context,
    target: boot.target,
    offer: probeOfferFor(boot.workspace, boot.target),
    state: boot.workspace,
  };
}

// ---------------------------------------------------------------------------

describe('the app bootstraps a real closed loop, not a fixture', () => {
  it('captures and promotes through the same store the capture screen uses', () => {
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
    const first = bootstrapSessionWorkspace(store, context);
    const second = bootstrapSessionWorkspace(store, context);
    expect(second.workspace.log.map((event) => event.eventId)).toEqual(
      first.workspace.log.map((event) => event.eventId),
    );
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
