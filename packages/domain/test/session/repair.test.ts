/**
 * The minimal repair branch (WP-08; controller §10 screen 7, REQ-JRN-01/02).
 *
 * The requirement this file is really about is one clause: *"Rejoin is declared
 * by an evidence criterion, never an arbitrary step count."* So the central test
 * is a negative one — fifty attempts, none of them qualifying, and the branch is
 * still open — because a step-count rejoin passes every happy-path test ever
 * written and only shows up when someone tries to grind through it.
 *
 * The rest guards the two other Phase-0 boundaries: exactly two paths are
 * offered and neither is filtered away by an inference (REQ-JRN-01 forbids
 * inferring a cause confidently from one stumble), and the untaken path is kept
 * without becoming a queue (REQ-JRN-02).
 */

import { describe, expect, it } from 'vitest';

import {
  JOURNEY_COMPILER_SEAM,
  REJOIN_CRITERION,
  REPAIR_BRANCHES,
  REPAIR_BRANCH_IDS,
  REPAIR_UNTAKEN_POLICY,
  applyRejoin,
  applySessionCommand,
  createDeterministicContext,
  createSessionWorkspace,
  enterBranch,
  evaluateRejoin,
  latestStumble,
  leaveRepair,
  openRepair,
  planSession,
  recommendedBranch,
  satisfiesRejoin,
  selectDueContracts,
  type RejoinObservation,
  type RepairState,
  type RepairStumble,
} from '../../src/index.ts';
import { seededLog } from './support.ts';

const AT = {
  stumble: '2026-07-27T09:03:00.000Z',
  entered: '2026-07-27T09:04:00.000Z',
  attempt: (n: number) => `2026-07-27T09:${String(5 + (n % 50)).padStart(2, '0')}:00.000Z`,
};

const STUMBLE: RepairStumble = {
  contractId: 'contract-reading',
  threadId: 'thread-wp06',
  skill: 'orthography_to_reading',
  eventId: 'ev-stumble',
  at: AT.stumble,
};

const observation = (overrides: Partial<RejoinObservation> = {}): RejoinObservation => ({
  eventId: 'ev-attempt',
  contractId: STUMBLE.contractId,
  effectiveGrade: 'good',
  admitted: true,
  hintsUsed: 0,
  revealedBeforeRecall: false,
  at: AT.entered,
  ...overrides,
});

const entered = (): RepairState => enterBranch(openRepair(STUMBLE), 'reading', AT.entered);

// ---------------------------------------------------------------------------

describe('rejoin is an evidence criterion, not a step count (REQ-JRN-02)', () => {
  it('stays open through fifty non-qualifying attempts', () => {
    const state = entered();
    const grinding: RejoinObservation[] = Array.from({ length: 50 }, (_value, index) =>
      observation({
        eventId: `ev-grind-${String(index)}`,
        effectiveGrade: index % 2 === 0 ? 'again' : 'hard',
        at: AT.attempt(index),
      }),
    );

    const decision = evaluateRejoin(state, grinding);
    expect(decision.rejoined).toBe(false);
    if (decision.rejoined) throw new Error('unreachable');
    expect(decision.reason).toBe('no_qualifying_evidence_yet');
    // The refusal quotes the criterion back, so a screen showing it cannot
    // paraphrase the rule into something the learner cannot predict.
    expect(decision.detail).toBe(REJOIN_CRITERION);
    expect(applyRejoin(state, decision).phase).toBe('in_branch');
  });

  it('closes on the very first qualifying success, however early', () => {
    const state = entered();
    const decision = evaluateRejoin(state, [observation({ eventId: 'ev-first' })]);
    expect(decision).toEqual({ rejoined: true, byEventId: 'ev-first', at: AT.entered });
    expect(applyRejoin(state, decision).phase).toBe('rejoined');
  });

  it('credits the earliest qualifying observation, not the latest', () => {
    const state = entered();
    const decision = evaluateRejoin(state, [
      observation({ eventId: 'ev-early', at: AT.attempt(1) }),
      observation({ eventId: 'ev-late', at: AT.attempt(9) }),
    ]);
    expect(decision.rejoined && decision.byEventId).toBe('ev-early');
  });

  it('mentions no number anywhere in the criterion it shows the learner', () => {
    expect(REJOIN_CRITERION).toMatch(/Not after a number of steps/i);
    expect(REJOIN_CRITERION).not.toMatch(/\b\d+\b/);
  });
});

describe('what the criterion refuses', () => {
  it.each([
    ['a success on another contract', observation({ contractId: 'contract-meaning' })],
    ['a success the gate did not admit', observation({ admitted: false })],
    ['a hard, which is success under strain', observation({ effectiveGrade: 'hard' })],
    ['an again', observation({ effectiveGrade: 'again' })],
    ['a hinted success', observation({ hintsUsed: 1 })],
    ['a revealed success', observation({ revealedBeforeRecall: true })],
    ['evidence from before the branch was entered', observation({ at: AT.stumble })],
  ])('%s does not rejoin', (_name, entry) => {
    expect(satisfiesRejoin(entered(), entry)).toBe(false);
    expect(evaluateRejoin(entered(), [entry]).rejoined).toBe(false);
  });

  it('accepts an easy on the same terms as a good', () => {
    expect(satisfiesRejoin(entered(), observation({ effectiveGrade: 'easy' }))).toBe(true);
  });

  it('refuses to evaluate before the diagnostic is answered', () => {
    const decision = evaluateRejoin(openRepair(STUMBLE), [observation()]);
    expect(decision.rejoined).toBe(false);
    if (decision.rejoined) throw new Error('unreachable');
    expect(decision.reason).toBe('no_branch_entered');
  });

  it('does not re-close a branch that already rejoined', () => {
    const rejoined = applyRejoin(entered(), evaluateRejoin(entered(), [observation()]));
    const second = evaluateRejoin(rejoined, [observation({ eventId: 'ev-second' })]);
    expect(second.rejoined).toBe(false);
    if (second.rejoined) throw new Error('unreachable');
    expect(second.reason).toBe('already_rejoined');
  });
});

describe('the two hard-coded paths (REQ-JRN-01/02)', () => {
  it('offers exactly two, and both every time', () => {
    expect(REPAIR_BRANCHES).toHaveLength(2);
    expect(openRepair(STUMBLE).offered).toHaveLength(2);
    expect(openRepair({ ...STUMBLE, skill: 'form_to_meaning' }).offered).toHaveLength(2);
  });

  it('names a REQ-JRN-01 branch family and phrases the cause as a hypothesis', () => {
    REPAIR_BRANCHES.forEach((branch) => {
      expect(branch.family.length).toBeGreaterThan(0);
      expect(branch.hypothesis).toMatch(/\bmay\b/);
      expect(branch.diagnostic).toMatch(/\?$/);
      expect(branch.work.length).toBeGreaterThan(0);
    });
  });

  it('recommends without selecting', () => {
    expect(recommendedBranch('orthography_to_reading')).toBe('reading');
    expect(recommendedBranch('form_to_meaning')).toBe('meaning');
    const state = openRepair(STUMBLE);
    expect(state.recommended).toBe('reading');
    expect(state.chosen).toBeNull();
    // Choosing the other one is a normal outcome, not an error.
    expect(enterBranch(state, 'meaning', AT.entered).chosen).toBe('meaning');
  });

  it('keeps the untaken path quietly and never as a queue', () => {
    const state = entered();
    expect(state.untaken).toEqual(['meaning']);
    expect(REPAIR_UNTAKEN_POLICY).toMatch(/not added to anything due/i);

    // The structural half of "not a new backlog": the planner takes due
    // contracts and nothing else, so there is no path from an untaken branch
    // into a plan at all.
    const plan = planSession({ timeBudgetMin: 30, dueContracts: [], newBudget: 0 });
    expect(JSON.stringify(plan)).not.toMatch(/untaken|meaning|reading/);
  });

  it('lists every branch id it can offer', () => {
    expect([...REPAIR_BRANCH_IDS]).toEqual(REPAIR_BRANCHES.map((branch) => branch.id));
  });
});

describe('the flow is total', () => {
  it('ignores a branch choice that arrives twice', () => {
    const once = entered();
    expect(enterBranch(once, 'meaning', AT.attempt(2))).toBe(once);
  });

  it('lets a learner leave, and refuses to un-rejoin a repaired branch', () => {
    expect(leaveRepair(entered()).phase).toBe('left');
    const rejoined = applyRejoin(entered(), evaluateRejoin(entered(), [observation()]));
    expect(leaveRepair(rejoined)).toBe(rejoined);
  });

  it('leaves the state untouched when a refusal is applied', () => {
    const state = entered();
    expect(applyRejoin(state, evaluateRejoin(state, []))).toBe(state);
  });
});

describe('the diagnostic writes nothing to the ledger', () => {
  it('emits no event when a branch is opened or chosen', () => {
    // REQ-JRN-01's diagnostic is a routing question, not an observation of
    // constrained retrieval — the same reason a lookup carries no grade (T-07).
    // The v1 catalog has no family for one, and inventing it here would be an
    // ADR-002 change made in the wrong package.
    const context = createDeterministicContext({
      instants: '2026-07-27T10:00:00.000Z',
      idPrefix: 'repair-',
    });
    const before = createSessionWorkspace(seededLog());

    const opened = applySessionCommand(context, before, { kind: 'openRepair', stumble: STUMBLE });
    expect(opened.log).toEqual(before.log);
    expect(opened.repair?.phase).toBe('diagnosing');

    const chosen = applySessionCommand(context, opened, {
      kind: 'chooseRepairBranch',
      branch: 'reading',
      at: AT.entered,
    });
    expect(chosen.log).toEqual(before.log);
    expect(chosen.repair?.phase).toBe('in_branch');
  });
});

describe('the flow runs end to end on the seeded target', () => {
  const context = () =>
    createDeterministicContext({ instants: '2026-07-27T10:00:00.000Z', idPrefix: 'repair-e2e-' });

  it('finds the stumble, enters a branch, and rejoins only on qualifying evidence', () => {
    const ctx = context();
    let state = createSessionWorkspace(seededLog());

    // The contracts are due the moment promotion activated them, so a session
    // can offer the reading probe with no clock trickery.
    const due = selectDueContracts(state.derived, {
      asOf: '2026-07-27T10:00:00.000Z',
      threadByContract: new Map([
        ['contract-reading', 'thread-wp06'],
        ['contract-meaning', 'thread-wp06'],
      ]),
    });
    expect(due.map((entry) => entry.contractId).sort()).toEqual([
      'contract-meaning',
      'contract-reading',
    ]);

    state = applySessionCommand(ctx, state, {
      kind: 'start',
      timeBudgetMin: 20,
      newBudget: 1,
      asOf: '2026-07-27T10:00:00.000Z',
    });
    state = applySessionCommand(ctx, state, {
      kind: 'answerStep',
      attempt: { grade: 'again', latencyMs: 8000, hintsUsed: 0, revealedBeforeRecall: false },
    });

    const stumble = latestStumble(state);
    expect(stumble).not.toBeNull();
    expect(stumble?.threadId).toBe('thread-wp06');

    state = applySessionCommand(ctx, state, { kind: 'openRepair', stumble: stumble! });
    state = applySessionCommand(ctx, state, {
      kind: 'chooseRepairBranch',
      branch: state.repair!.recommended,
      at: '2026-07-27T10:00:00.000Z',
    });

    // No qualifying evidence yet — the stumble does not repair itself.
    state = applySessionCommand(ctx, state, { kind: 'checkRejoin' });
    expect(state.repair?.phase).toBe('in_branch');

    // Working the branch and getting it wrong keeps it open, however often.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      state = applySessionCommand(ctx, state, {
        kind: 'repairProbe',
        attempt: { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false },
      });
      state = applySessionCommand(ctx, state, { kind: 'checkRejoin' });
      expect(state.repair?.phase).toBe('in_branch');
    }

    // A hinted success is a success of the hint, so it keeps the branch open too.
    state = applySessionCommand(ctx, state, {
      kind: 'repairProbe',
      attempt: { grade: 'good', latencyMs: 3000, hintsUsed: 1, revealedBeforeRecall: false },
    });
    state = applySessionCommand(ctx, state, { kind: 'checkRejoin' });
    expect(state.repair?.phase).toBe('in_branch');

    // Unaided, on the contract that stumbled: the criterion is met.
    state = applySessionCommand(ctx, state, {
      kind: 'repairProbe',
      attempt: { grade: 'good', latencyMs: 2600, hintsUsed: 0, revealedBeforeRecall: false },
    });
    state = applySessionCommand(ctx, state, { kind: 'checkRejoin' });

    expect(state.repair?.phase).toBe('rejoined');
    expect(state.repair?.rejoinedByEventId).not.toBeNull();

    // The rejoin was credited to an event the gate actually admitted.
    const credited = state.derived.gateDecisions.find(
      (entry) => entry.eventId === state.repair?.rejoinedByEventId,
    );
    expect(credited?.admitted).toBe(true);
    expect(credited?.effectiveGrade).toBe('good');
  });

  it('probes the stumbled contract wherever the session cursor is', () => {
    const ctx = context();
    let state = applySessionCommand(ctx, createSessionWorkspace(seededLog()), {
      kind: 'start',
      timeBudgetMin: 20,
      newBudget: 1,
      asOf: '2026-07-27T10:00:00.000Z',
    });
    state = applySessionCommand(ctx, state, {
      kind: 'answerStep',
      attempt: { grade: 'again', latencyMs: 8000, hintsUsed: 0, revealedBeforeRecall: false },
    });
    const stumbledContract = latestStumble(state)?.contractId;

    state = applySessionCommand(ctx, state, { kind: 'openRepair', stumble: latestStumble(state)! });
    state = applySessionCommand(ctx, state, {
      kind: 'chooseRepairBranch',
      branch: 'reading',
      at: '2026-07-27T10:00:00.000Z',
    });
    state = applySessionCommand(ctx, state, {
      kind: 'repairProbe',
      attempt: { grade: 'good', latencyMs: 2000, hintsUsed: 0, revealedBeforeRecall: false },
    });

    const probe = state.log.at(-1);
    expect(probe?.type).toBe('ReviewGraded');
    if (probe?.type !== 'ReviewGraded') throw new Error('unreachable');
    expect(probe.contractId).toBe(stumbledContract);
    expect(probe.idempotencyKey.startsWith(`repair:${String(stumbledContract)}:`)).toBe(true);
  });

  it('refuses a repair probe outside a branch', () => {
    const ctx = context();
    const state = createSessionWorkspace(seededLog());
    expect(
      applySessionCommand(ctx, state, {
        kind: 'repairProbe',
        attempt: { grade: 'good', latencyMs: 1, hintsUsed: 0, revealedBeforeRecall: false },
      }),
    ).toBe(state);
  });

  it('opens on an again and not on a hard', () => {
    const ctx = context();
    let state = applySessionCommand(ctx, createSessionWorkspace(seededLog()), {
      kind: 'start',
      timeBudgetMin: 20,
      newBudget: 1,
      asOf: '2026-07-27T10:00:00.000Z',
    });
    state = applySessionCommand(ctx, state, {
      kind: 'answerStep',
      attempt: { grade: 'hard', latencyMs: 7000, hintsUsed: 0, revealedBeforeRecall: false },
    });
    expect(latestStumble(state)).toBeNull();
  });
});

describe('the journey compiler is a declared seam, not a stub', () => {
  it('records what Phase 0 has and what it does not', () => {
    expect(JOURNEY_COMPILER_SEAM.whatPhase0Has).toMatch(/one hard-coded/i);
    expect(JOURNEY_COMPILER_SEAM.whatIsMissing).toMatch(/generalized|ontology|Inference/i);
    expect(JOURNEY_COMPILER_SEAM.anchors).toContain('REQ-JRN-02');
  });
});
