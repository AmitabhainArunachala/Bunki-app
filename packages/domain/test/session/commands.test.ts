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
  SESSION_COMPLETION_STATES,
  applySessionCommand,
  createDeterministicContext,
  createSessionWorkspace,
  isEvidenceEventType,
  parseEvent,
  rejoinObservations,
  sessionProgress,
  threadIndexByContract,
  type DomainContext,
  type SessionWorkspaceState,
} from '../../src/index.ts';
import { seededLog } from './support.ts';

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
      attempt: { grade: 'good', latencyMs: 2000, hintsUsed: 0, revealedBeforeRecall: false },
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
      attempt: { grade: 'good', latencyMs: 2000, hintsUsed: 0, revealedBeforeRecall: false },
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
      attempt: { grade: 'good', latencyMs: 2000, hintsUsed: 0, revealedBeforeRecall: false },
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
        attempt: { grade: 'good', latencyMs: 1, hintsUsed: 0, revealedBeforeRecall: false },
      }),
    ).toBe(empty);
    expect(applySessionCommand(context, empty, { kind: 'skipStep' })).toBe(empty);
    expect(applySessionCommand(context, empty, { kind: 'close' })).toBe(empty);
    expect(applySessionCommand(context, empty, { kind: 'checkRejoin' })).toBe(empty);
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
      attempt: { grade: 'good', latencyMs: 1500, hintsUsed: 0, revealedBeforeRecall: false },
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
      attempt: { grade: 'easy', latencyMs: 900, hintsUsed: 0, revealedBeforeRecall: false },
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
      attempt: { grade: 'good', latencyMs: 1500, hintsUsed: 0, revealedBeforeRecall: false },
    });

    const observations = rejoinObservations(state);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.admitted).toBe(true);
    expect(observations[0]?.effectiveGrade).toBe('good');
    expect(observations[0]?.hintsUsed).toBe(0);
    expect(observations[0]?.revealedBeforeRecall).toBe(false);
  });
});
