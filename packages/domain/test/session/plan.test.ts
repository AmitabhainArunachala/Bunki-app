/**
 * The session planner (WP-08; controller §6.4, REQ-SCH-04, REQ-UI-05).
 *
 * The planner's whole job is to turn "I have twelve minutes" into a finite
 * sitting, so the assertions here are mostly about *bounds*: the plan never
 * exceeds the budget, never grows past one new item, never visits two canvases,
 * and always ends. The determinism assertions matter for a less obvious reason —
 * a plan that depended on array order would produce a different sitting from a
 * live store than from a replayed log, and every screenshot and E2E fixture
 * downstream would be quietly unreproducible.
 */

import { describe, expect, it } from 'vitest';

import {
  PHASE0_MAX_NEW_ITEMS,
  SESSION_PHASE0_COLLAPSE,
  SESSION_STEP_KINDS,
  STEP_COST_MINUTES,
  classifyDueContract,
  planSession,
  selectDueContracts,
  type SessionPlan,
  type SessionStepKind,
} from '../../src/index.ts';
import { due, manyDue, seededRandom } from './support.ts';

const kinds = (plan: SessionPlan): readonly SessionStepKind[] =>
  plan.steps.map((step) => step.kind);

const countOf = (plan: SessionPlan, kind: SessionStepKind): number =>
  plan.steps.filter((step) => step.kind === kind).length;

describe('every session ends (REQ-SCH-04)', () => {
  it('puts exactly one closure step last', () => {
    const plan = planSession({ timeBudgetMin: 20, dueContracts: manyDue(4), newBudget: 1 });
    expect(countOf(plan, 'closure')).toBe(1);
    expect(plan.steps.at(-1)?.kind).toBe('closure');
  });

  it('reserves closure before anything else, so a tight budget still ends', () => {
    // One minute buys exactly the closure step and nothing else. A planner that
    // filled reviews first would spend it on a review and produce a sitting with
    // no ending, which is the treadmill REQ-SCH-04 exists to stop.
    const plan = planSession({
      timeBudgetMin: STEP_COST_MINUTES.closure,
      dueContracts: manyDue(9),
      newBudget: 3,
    });
    expect(kinds(plan)).toEqual(['closure']);
    expect(plan.deferredDueCount).toBe(9);
  });

  it('produces an empty plan rather than throwing on a zero budget', () => {
    const plan = planSession({ timeBudgetMin: 0, dueContracts: manyDue(3), newBudget: 1 });
    expect(plan.steps).toEqual([]);
    expect(plan.recipe).toBe('nothing fits this budget');
    expect(plan.deferredDueCount).toBe(3);
  });
});

describe('the plan never exceeds the budget it was given', () => {
  it('holds across 400 randomised inputs', () => {
    const random = seededRandom(0x5e5510);
    for (let trial = 0; trial < 400; trial += 1) {
      const timeBudgetMin = Math.floor(random() * 40);
      const dueCount = Math.floor(random() * 25);
      const newBudget = Math.floor(random() * 4);
      const withCanvas = random() < 0.5;

      const dueContracts = manyDue(dueCount).map((entry, index) =>
        index % 3 === 0
          ? { ...entry, phase: 'new' as const }
          : index % 3 === 1
            ? { ...entry, phase: 'relearning' as const }
            : entry,
      );

      const plan = planSession({
        timeBudgetMin,
        dueContracts,
        newBudget,
        ...(withCanvas ? { canvasId: 'passage-1' } : {}),
      });

      expect(
        plan.estimatedMinutes,
        `budget ${String(timeBudgetMin)} exceeded by ${JSON.stringify(plan.recipe)}`,
      ).toBeLessThanOrEqual(timeBudgetMin);
      expect(plan.estimatedMinutes).toBe(
        plan.steps.reduce((total, step) => total + step.costMinutes, 0),
      );
      expect(plan.stepCount).toBe(plan.steps.length);
      expect(countOf(plan, 'closure')).toBeLessThanOrEqual(1);
      expect(countOf(plan, 'canvas')).toBeLessThanOrEqual(1);
      expect(countOf(plan, 'new')).toBeLessThanOrEqual(PHASE0_MAX_NEW_ITEMS);
    }
  });
});

describe('bounded expansion (controller §6.4: "one bounded new item")', () => {
  it('admits at most one new item however large newBudget is', () => {
    const plan = planSession({
      timeBudgetMin: 60,
      dueContracts: manyDue(6, { phase: 'new' }),
      newBudget: 99,
    });
    expect(countOf(plan, 'new')).toBe(1);
  });

  it('admits none when newBudget is zero', () => {
    const plan = planSession({
      timeBudgetMin: 60,
      dueContracts: manyDue(6, { phase: 'new' }),
      newBudget: 0,
    });
    expect(countOf(plan, 'new')).toBe(0);
    // Nothing sneaks in as a review instead: a never-reviewed contract is `new`
    // by classification, not by which list it happens to be filtered into.
    expect(kinds(plan)).toEqual(['closure']);
  });
});

describe('the integration canvas', () => {
  it('visits exactly one when a canvas is named', () => {
    const plan = planSession({
      timeBudgetMin: 30,
      dueContracts: manyDue(3),
      newBudget: 1,
      canvasId: 'pas-bunki-01',
    });
    expect(countOf(plan, 'canvas')).toBe(1);
    expect(plan.canvasId).toBe('pas-bunki-01');
    expect(plan.steps.find((step) => step.kind === 'canvas')?.canvasId).toBe('pas-bunki-01');
  });

  it('visits none when no canvas is named', () => {
    const plan = planSession({ timeBudgetMin: 30, dueContracts: manyDue(3), newBudget: 1 });
    expect(countOf(plan, 'canvas')).toBe(0);
    expect(plan.canvasId).toBeNull();
  });

  it('reports canvasId as null when the budget could not fit the visit', () => {
    // Honesty over optimism: `plan.canvasId` describes the plan, not the
    // request. A screen reading it must not offer a canvas the sitting skipped.
    const plan = planSession({
      timeBudgetMin: STEP_COST_MINUTES.closure,
      dueContracts: [],
      newBudget: 0,
      canvasId: 'pas-bunki-01',
    });
    expect(countOf(plan, 'canvas')).toBe(0);
    expect(plan.canvasId).toBeNull();
  });
});

describe('the §6.4 running order', () => {
  it('sequences reactivation → precision → new → canvas → closure', () => {
    const plan = planSession({
      timeBudgetMin: 40,
      dueContracts: [
        due('c-precision'),
        due('c-new', { phase: 'new' }),
        due('c-reactivation', { phase: 'relearning' }),
      ],
      newBudget: 1,
      canvasId: 'pas-bunki-01',
    });
    expect(kinds(plan)).toEqual(['reactivation', 'precision', 'new', 'canvas', 'closure']);
    expect([...SESSION_STEP_KINDS]).toEqual(kinds(plan));
  });

  it('indexes steps contiguously from zero and gives each a unique id', () => {
    const plan = planSession({
      timeBudgetMin: 40,
      dueContracts: manyDue(5),
      newBudget: 1,
      canvasId: 'pas-bunki-01',
    });
    expect(plan.steps.map((step) => step.index)).toEqual(plan.steps.map((_step, i) => i));
    expect(new Set(plan.steps.map((step) => step.stepId)).size).toBe(plan.stepCount);
  });
});

describe('fragility classification (REQ-SCH-04(1) vs (2))', () => {
  it.each([
    ['new', 0, 'new'],
    ['learning', 0, 'precision'],
    ['review', 0, 'precision'],
    ['relearning', 0, 'reactivation'],
    ['review', 2, 'reactivation'],
    ['learning', 1, 'reactivation'],
  ] as const)('phase %s with %i lapses is %s', (phase, lapses, expected) => {
    expect(classifyDueContract(due('c', { phase, lapses }))).toBe(expected);
  });

  it('reads fragility off the state FSRS derived rather than recomputing it', () => {
    // A relearning contract is reactivation whatever its due instant says; the
    // planner has no interval arithmetic of its own to disagree with (REQ-SCH-01).
    const plan = planSession({
      timeBudgetMin: 10,
      dueContracts: [
        due('c-old', { dueSince: '2026-07-01T00:00:00.000Z' }),
        due('c-fragile', { phase: 'relearning', dueSince: '2026-07-27T09:00:00.000Z' }),
      ],
      newBudget: 0,
    });
    expect(kinds(plan)).toEqual(['reactivation', 'precision', 'closure']);
    expect(plan.steps[0]?.contractId).toBe('c-fragile');
  });
});

describe('determinism', () => {
  it('produces a deeply equal plan from the same input', () => {
    const input = {
      timeBudgetMin: 15,
      dueContracts: manyDue(6),
      newBudget: 1,
      canvasId: 'pas-bunki-01',
    };
    expect(planSession(input)).toEqual(planSession(input));
  });

  it('does not depend on the order the due contracts arrive in', () => {
    const contracts = manyDue(8);
    const shuffled = [...contracts].reverse();
    expect(planSession({ timeBudgetMin: 15, dueContracts: shuffled, newBudget: 1 })).toEqual(
      planSession({ timeBudgetMin: 15, dueContracts: contracts, newBudget: 1 }),
    );
  });

  it('breaks a due-instant tie by contract id rather than by arrival', () => {
    const sameInstant = { dueSince: '2026-07-27T09:00:00.000Z' } as const;
    const forward = planSession({
      timeBudgetMin: 3,
      dueContracts: [due('c-b', sameInstant), due('c-a', sameInstant)],
      newBudget: 0,
    });
    expect(forward.steps[0]?.contractId).toBe('c-a');
  });
});

describe('the backlog is reported, never queued', () => {
  it('counts what did not fit and puts none of it in the plan', () => {
    const dueContracts = manyDue(10);
    const plan = planSession({ timeBudgetMin: 4, dueContracts, newBudget: 0 });
    const planned = new Set(plan.steps.map((step) => step.contractId));
    expect(plan.deferredDueCount).toBe(dueContracts.length - (plan.stepCount - 1));
    dueContracts
      .filter((entry) => !planned.has(entry.contractId))
      .forEach((entry) => {
        expect(plan.steps.some((step) => step.contractId === entry.contractId)).toBe(false);
      });
  });

  it('reports a zero backlog when everything fitted', () => {
    const plan = planSession({ timeBudgetMin: 40, dueContracts: manyDue(3), newBudget: 1 });
    expect(plan.deferredDueCount).toBe(0);
  });
});

describe('the visible recipe (REQ-UI-05)', () => {
  it('groups the sitting by kind rather than listing every step', () => {
    const plan = planSession({
      timeBudgetMin: 30,
      dueContracts: manyDue(3),
      newBudget: 0,
      canvasId: 'pas-bunki-01',
    });
    expect(plan.recipe).toBe('3 precision → canvas → closure');
  });
});

describe('what the Phase-0 collapse dropped is recorded', () => {
  it('names transfer as not implemented rather than leaving it absent', () => {
    expect(SESSION_PHASE0_COLLAPSE.notImplemented.join(' ')).toMatch(/REQ-SCH-04\(5\) transfer/);
    expect(SESSION_PHASE0_COLLAPSE.implemented).toHaveLength(5);
    expect(SESSION_PHASE0_COLLAPSE.anchors).toContain('REQ-SCH-04');
  });

  it('has no step kind for the part it did not implement', () => {
    expect([...SESSION_STEP_KINDS]).not.toContain('transfer');
  });
});

describe('selecting due contracts from derived state', () => {
  const asOf = '2026-07-27T12:00:00.000Z';
  const base = {
    contractId: 'contract-reading',
    active: true,
    phase: 'review' as const,
    lapses: 0,
    dueAt: '2026-07-27T09:00:00.000Z',
  };
  const threadByContract = new Map([['contract-reading', 'thread-1']]);

  it('takes an active, due, thread-linked contract', () => {
    const selected = selectDueContracts({ memoryStates: [base] }, { asOf, threadByContract });
    expect(selected.map((entry) => entry.contractId)).toEqual(['contract-reading']);
    expect(selected[0]?.threadId).toBe('thread-1');
  });

  it('skips a demoted contract without deleting its history', () => {
    const selected = selectDueContracts(
      { memoryStates: [{ ...base, active: false }] },
      { asOf, threadByContract },
    );
    expect(selected).toEqual([]);
  });

  it('skips a contract that is not due yet', () => {
    const selected = selectDueContracts(
      { memoryStates: [{ ...base, dueAt: '2026-07-28T09:00:00.000Z' }] },
      { asOf, threadByContract },
    );
    expect(selected).toEqual([]);
  });

  it('skips a contract whose component no capture instantiated', () => {
    // The same refusal the gate makes by name. A contract that cannot be linked
    // to a promotion state must not be planned, or the sitting would offer a
    // review that could never count.
    const selected = selectDueContracts(
      { memoryStates: [base] },
      { asOf, threadByContract: new Map() },
    );
    expect(selected).toEqual([]);
  });

  it('falls back to the contract id when no label was supplied', () => {
    const selected = selectDueContracts({ memoryStates: [base] }, { asOf, threadByContract });
    expect(selected[0]?.label).toBe('contract-reading');

    const labelled = selectDueContracts(
      { memoryStates: [base] },
      { asOf, threadByContract, labelByContract: new Map([['contract-reading', '分岐']]) },
    );
    expect(labelled[0]?.label).toBe('分岐');
  });
});
