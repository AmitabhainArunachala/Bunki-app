/**
 * The session command handler (WP-08; controller §5, §6.4).
 *
 * This is the seam a screen talks to, so it is the seam where "apps/app holds no
 * scheduling, grading, or evidence logic" is either true or not. The assertions
 * are about what a caller can and cannot make happen from outside: it can submit
 * an attempt, and it cannot choose a tier, cannot set a probe context, cannot
 * bypass the gate, and cannot get a `SessionClosed` that says anything but one of
 * the three terminal states.
 */

import { describe, expect, it } from 'vitest';

import {
  IdempotencyConflictError,
  SESSION_COMPLETION_STATES,
  applySessionCommand,
  createDeterministicContext,
  createSessionWorkspace,
  isEvidenceEventType,
  latestStumble,
  parseEvent,
  rejoinObservations,
  replay,
  sessionProgress,
  threadIndexByContract,
  type CanvasInteraction,
  type DomainContext,
  type SessionWorkspaceState,
} from '../../src/index.ts';
import { COMPONENT, seededLog, seededLogWithReview } from './support.ts';

const ASOF = '2026-07-27T10:00:00.000Z';

const newContext = (prefix = 'cmd-'): DomainContext =>
  createDeterministicContext({ instants: ASOF, idPrefix: prefix });

const started = (context: DomainContext): SessionWorkspaceState =>
  applySessionCommand(context, createSessionWorkspace(seededLog()), {
    kind: 'start',
    timeBudgetMin: 20,
    newBudget: 1,
    canvasId: 'pas-bunki-01',
    asOf: ASOF,
  });

describe('opening a session', () => {
  it('appends exactly one SessionStarted carrying the budget the learner chose', () => {
    const context = newContext();
    const before = createSessionWorkspace(seededLog());
    const after = started(context);

    const opened = after.log.at(-1);
    expect(after.log).toHaveLength(before.log.length + 1);
    expect(opened?.type).toBe('SessionStarted');
    if (opened?.type !== 'SessionStarted') throw new Error('unreachable');
    expect(opened.budget).toEqual({ timeBudgetMin: 20, newBudget: 1 });
    expect(opened.sessionId).toBe(after.runtime?.sessionId);
  });

  it('projects the open session into derived state, so the ledger agrees', () => {
    const after = started(newContext());
    const projected = after.derived.sessions.find(
      (session) => session.sessionId === after.runtime?.sessionId,
    );
    expect(projected?.status).toBe('open');
    expect(projected?.completionState).toBeNull();
  });

  it('refuses to open a second session over an open one', () => {
    const context = newContext();
    const once = started(context);
    const twice = applySessionCommand(context, once, {
      kind: 'start',
      timeBudgetMin: 5,
      newBudget: 0,
      asOf: ASOF,
    });
    expect(twice).toBe(once);
  });

  it('plans only over contracts the log can link to a promoted thread', () => {
    const state = started(newContext());
    const linked = threadIndexByContract(state);
    state.runtime?.plan.steps
      .filter((step) => step.contractId !== null)
      .forEach((step) => {
        expect(linked.has(step.contractId!)).toBe(true);
      });
  });
});

describe('what a caller can and cannot say', () => {
  it('cannot choose the tier or the probe context of a standalone review', () => {
    const context = newContext('cmd-tier-');
    const after = applySessionCommand(context, started(context), {
      kind: 'answerStep',
      attempt: {
        response: 'mountain pass',
        effort: 'good',
        latencyMs: 2000,
        hintsUsed: 0,
        revealedBeforeRecall: false,
      },
    });

    const graded = after.log.at(-1);
    expect(graded?.type).toBe('ReviewGraded');
    if (graded?.type !== 'ReviewGraded') throw new Error('unreachable');
    // Both are stamped by the mint, and the command type has no field for either.
    expect(graded.tier).toBe('A');
    expect(graded.probeContext).toBe('standalone');
  });

  it('produces only events the fail-closed parser accepts', () => {
    const context = newContext('cmd-parse-');
    let state = started(context);
    state = applySessionCommand(context, state, {
      kind: 'answerStep',
      attempt: {
        response: 'mountain pass',
        effort: 'good',
        latencyMs: 2000,
        hintsUsed: 0,
        revealedBeforeRecall: false,
      },
    });
    state = applySessionCommand(context, state, { kind: 'close' });

    state.log.forEach((event) => {
      expect(() => parseEvent(event)).not.toThrow();
    });
  });

  it('routes every evidence-class event it emits through the gate', () => {
    const context = newContext('cmd-gate-');
    let state = started(context);
    state = applySessionCommand(context, state, {
      kind: 'answerStep',
      attempt: {
        response: 'mountain pass',
        effort: 'good',
        latencyMs: 2000,
        hintsUsed: 0,
        revealedBeforeRecall: false,
      },
    });

    const evidence = state.log.filter((event) => isEvidenceEventType(event.type));
    expect(evidence.length).toBeGreaterThan(0);
    evidence.forEach((event) => {
      expect(
        state.derived.gateDecisions.some((decision) => decision.eventId === event.eventId),
        `${event.type} ${event.eventId} was never put to the gate`,
      ).toBe(true);
    });
  });

  it('is a no-op when the command cannot apply', () => {
    const context = newContext('cmd-noop-');
    const empty = createSessionWorkspace(seededLog());
    expect(
      applySessionCommand(context, empty, {
        kind: 'answerStep',
        attempt: {
          response: 'mountain pass',
          effort: 'good',
          latencyMs: 1,
          hintsUsed: 0,
          revealedBeforeRecall: false,
        },
      }),
    ).toBe(empty);
    expect(applySessionCommand(context, empty, { kind: 'skipStep' })).toBe(empty);
    expect(applySessionCommand(context, empty, { kind: 'close' })).toBe(empty);
    expect(applySessionCommand(context, empty, { kind: 'checkRejoin' })).toBe(empty);
  });
});

/**
 * The handler's idempotency note, checked rather than believed (§7, §17.2).
 *
 * It used to claim one rule for all three evidence paths — "content, never a
 * counter … so a double tap produces the same key and replay collapses it into
 * one event". That is true of `answerStep` and false of the other two, and a
 * later reader would have relied on it. These tests pin what each path does and
 * the reason the difference is deliberate.
 */
describe('idempotency keys, per path', () => {
  const tap: CanvasInteraction = {
    experienceId: 'pas-bunki-01',
    kind: 'tap',
    componentIds: [COMPONENT],
    declaredContractId: null,
    targetWasHidden: true,
  };

  const tapTwice = (context: DomainContext): SessionWorkspaceState => {
    let state = createSessionWorkspace(seededLog());
    for (let press = 0; press < 2; press += 1) {
      state = applySessionCommand(context, state, {
        kind: 'canvasInteraction',
        offer: null,
        interaction: tap,
      });
    }
    return state;
  };

  it('collapses a double-tapped answerStep, because the key names the step', () => {
    const context = newContext('cmd-key-review-');
    const open = started(context);
    const attempt = {
      response: 'mountain pass',
      effort: 'good' as const,
      latencyMs: 2000,
      hintsUsed: 0,
      revealedBeforeRecall: false,
    };

    // Both presses see the same prior state — that *is* the racing double tap.
    const once = applySessionCommand(context, open, { kind: 'answerStep', attempt });
    const twice = applySessionCommand(context, open, { kind: 'answerStep', attempt });

    expect(once.log.at(-1)?.idempotencyKey).toBe(twice.log.at(-1)?.idempotencyKey);
    expect(once.log.at(-1)?.idempotencyKey).toMatch(/^review:/);
  });

  it('gives the canvas a positional key, so a repeat is a second encounter', () => {
    const state = tapTwice(newContext('cmd-key-canvas-'));
    const keys = state.log.slice(-2).map((event) => event.idempotencyKey);
    expect(keys).toEqual(['canvas:pas-bunki-01:0', 'canvas:pas-bunki-01:1']);
    expect(state.log.filter((event) => event.type === 'ExposureLogged')).toHaveLength(2);
  });

  it('shows why: a content-derived key on that path would refuse the whole log', () => {
    // Each mint draws a fresh `eventId` from the injected generator, and replay
    // collapses a repeated key only on a byte-identical re-append. Give the two
    // taps one shared "content" key and replay does not deduplicate them — it
    // rejects the log, which is worse than the counter it would have replaced.
    const state = tapTwice(newContext('cmd-key-content-'));
    const contentKeyed = state.log.map((event, index) =>
      index >= state.log.length - 2 ? { ...event, idempotencyKey: 'canvas:content' } : event,
    );
    expect(() => replay(contentKeyed)).toThrow(IdempotencyConflictError);
  });

  it('gives each repair probe its own ordinal, because the criterion counts them', () => {
    const context = newContext('cmd-key-repair-');
    let state = createSessionWorkspace(
      seededLogWithReview({ contractId: 'contract-reading', grade: 'again' }),
    );
    const stumble = latestStumble(state);
    expect(stumble).not.toBeNull();

    state = applySessionCommand(context, state, { kind: 'openRepair', stumble: stumble! });
    state = applySessionCommand(context, state, {
      kind: 'chooseRepairBranch',
      branch: state.repair!.recommended,
      at: ASOF,
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      state = applySessionCommand(context, state, {
        kind: 'repairProbe',
        attempt: {
          response: 'ぶんき',
          effort: 'hard',
          latencyMs: 1200,
          hintsUsed: 0,
          revealedBeforeRecall: false,
        },
      });
    }

    expect(state.log.slice(-2).map((event) => event.idempotencyKey)).toEqual([
      'repair:contract-reading:0',
      'repair:contract-reading:1',
    ]);
  });
});

describe('closing a session', () => {
  it('emits SessionClosed with a terminal completion state', () => {
    const context = newContext('cmd-close-');
    const after = applySessionCommand(context, started(context), { kind: 'close' });

    const closed = after.log.at(-1);
    expect(closed?.type).toBe('SessionClosed');
    if (closed?.type !== 'SessionClosed') throw new Error('unreachable');
    expect(SESSION_COMPLETION_STATES).toContain(closed.completionState);
    expect(after.derived.sessions[0]?.status).toBe('closed');
    expect(after.runtime?.status).toBe('closed');
  });

  it('mints nothing on a second close', () => {
    const context = newContext('cmd-reclose-');
    const once = applySessionCommand(context, started(context), { kind: 'close' });
    const twice = applySessionCommand(context, once, { kind: 'close' });
    expect(twice.log).toHaveLength(once.log.length);
  });

  it('honours an explicit completion state over the suggested one', () => {
    const context = newContext('cmd-explicit-');
    const after = applySessionCommand(context, started(context), {
      kind: 'close',
      completionState: 'budget_exhausted',
    });
    const closed = after.log.at(-1);
    expect(closed?.type === 'SessionClosed' && closed.completionState).toBe('budget_exhausted');
  });
});

describe('progress is about the sitting, never about the learner', () => {
  it('counts steps, and reports answered and skipped separately', () => {
    const context = newContext('cmd-progress-');
    let state = started(context);
    const total = state.runtime?.plan.stepCount ?? 0;

    state = applySessionCommand(context, state, {
      kind: 'answerStep',
      attempt: {
        response: 'mountain pass',
        effort: 'good',
        latencyMs: 1500,
        hintsUsed: 0,
        revealedBeforeRecall: false,
      },
    });
    state = applySessionCommand(context, state, { kind: 'skipStep' });

    const progress = sessionProgress(state.runtime!);
    expect(progress.stepCount).toBe(total);
    expect(progress.answeredCount).toBe(1);
    expect(progress.skippedCount).toBe(1);
    expect(progress.settledCount).toBe(2);
    expect(progress.remainingCount).toBe(total - 2);
    expect(progress.remainingMinutes).toBeLessThan(progress.estimatedMinutes);
  });

  it('counts an answered step even when the gate refused the review', () => {
    // A learner who answered has answered. Whether it moved anything is a
    // separate question with a separate answer (REQ-SCH-06, REQ-LM-03).
    const context = newContext('cmd-refused-');
    const state = applySessionCommand(context, started(context), {
      kind: 'answerStep',
      // `easy` with no confirmation: representable, recordable, and refused.
      attempt: {
        response: 'mountain pass',
        effort: 'easy',
        latencyMs: 900,
        hintsUsed: 0,
        revealedBeforeRecall: false,
      },
    });

    const decision = state.derived.gateDecisions.at(-1);
    expect(decision?.admitted).toBe(false);
    expect(decision?.reason).toBe('easy_requires_user_confirmation');
    expect(sessionProgress(state.runtime!).answeredCount).toBe(1);
  });
});

describe('the observation join the repair criterion reads', () => {
  it('pairs every graded review with the gate verdict on it', () => {
    const context = newContext('cmd-join-');
    const state = applySessionCommand(context, started(context), {
      kind: 'answerStep',
      attempt: {
        response: 'mountain pass',
        effort: 'good',
        latencyMs: 1500,
        hintsUsed: 0,
        revealedBeforeRecall: false,
      },
    });

    const observations = rejoinObservations(state);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.admitted).toBe(true);
    expect(observations[0]?.effectiveGrade).toBe('good');
    expect(observations[0]?.hintsUsed).toBe(0);
    expect(observations[0]?.revealedBeforeRecall).toBe(false);
  });
});
