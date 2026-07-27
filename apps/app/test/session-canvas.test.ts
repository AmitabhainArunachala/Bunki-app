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
  createDeterministicContext,
  isEvidenceEventType,
  latestStumble,
  type CanvasProbeOffer,
  type DomainContext,
  type SessionWorkspaceState,
} from '@bunki/domain';

import { segmentPassage, targetSegments } from '../src/screens/canvas-passage.ts';
import {
  bootstrapSessionWorkspace,
  passageMarks,
  probeOfferFor,
  type SessionTarget,
} from '../src/screens/session-loop.ts';
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
