/**
 * T-13, unit half — *"Session reaches a finite completion state; queue cannot
 * silently grow"* (controller §17.1, §6.4; REQ-SCH-04).
 *
 * The E2E half is WP-10's. This file owns the property, and it owns it as a
 * property rather than as a scenario: a scenario proves the plan did not grow
 * *that time*, which is the weaker claim and the one that passes right up until
 * the ordering nobody tried.
 *
 * Two shapes are hammered here, because there are two ways in.
 *
 *   1. **The runtime.** Arbitrary interleavings of every event family in the v1
 *      catalog, mixed with skips and completions, folded into a running session.
 *      After every single step the plan must still be the *same object*, with
 *      the same steps, the same count, and the same backlog number.
 *   2. **The command handler.** The same idea one layer up, through
 *      `applySessionCommand` — the path a screen actually takes, where real
 *      events are minted and the log is really replayed. A planner that were
 *      immutable in isolation but re-planned on every append would pass (1) and
 *      fail (2).
 *
 * And then the other clause: the session *ends*. A plan is finite, so a finite
 * number of skips exhausts it, and closing produces a `SessionClosed` carrying
 * one of the three terminal completion states — never "still running".
 */

import { describe, expect, it } from 'vitest';

import {
  SESSION_COMPLETION_STATES,
  advance,
  applySessionCommand,
  closeSession,
  completeCurrentStep,
  createDeterministicContext,
  createSessionWorkspace,
  observe,
  parseEvent,
  planSession,
  resolveCompletionState,
  sessionProgress,
  startSession,
  type DomainContext,
  type DomainEvent,
  type SessionCommand,
  type SessionRuntime,
} from '../../src/index.ts';
import { oneOfEachFamily } from '../support/events.ts';
import { manyDue, seededLog, seededRandom } from './support.ts';

const FIXED = '2026-07-27T10:00:00.000Z';

function newContext(prefix = 't13-'): DomainContext {
  return createDeterministicContext({ instants: FIXED, idPrefix: prefix });
}

/** One parsed event of every v1 family — the whole space an interleaving draws from. */
const EVENT_POOL: readonly DomainEvent[] = Object.values(oneOfEachFamily()).map(
  (raw) => parseEvent(raw) as DomainEvent,
);

const planFixture = () =>
  planSession({
    timeBudgetMin: 20,
    dueContracts: [
      ...manyDue(3),
      ...manyDue(2, { phase: 'relearning' }).map((entry, index) => ({
        ...entry,
        contractId: `fragile-${String(index)}`,
      })),
      { ...manyDue(1, { phase: 'new' })[0]!, contractId: 'fresh-0' },
    ],
    newBudget: 1,
    canvasId: 'pas-bunki-01',
  });

describe('the plan cannot grow, whatever arrives and in whatever order', () => {
  it('survives 300 random interleavings of every event family', () => {
    const random = seededRandom(0x7113);

    for (let trial = 0; trial < 300; trial += 1) {
      const started = startSession(
        newContext(`t13-${String(trial)}-`),
        {
          timeBudgetMin: 20,
          dueContracts: planFixture().steps.flatMap((step) =>
            step.contractId === null
              ? []
              : [
                  {
                    contractId: step.contractId,
                    threadId: step.threadId ?? 'thread-x',
                    label: step.label,
                    phase: 'review' as const,
                    lapses: 0,
                    dueSince: FIXED,
                  },
                ],
          ),
          newBudget: 1,
          canvasId: 'pas-bunki-01',
        },
        { idempotencyKey: `t13:${String(trial)}` },
      );

      const plan = started.runtime.plan;
      const stepsSnapshot = JSON.stringify(plan.steps);
      let runtime: SessionRuntime = started.runtime;

      // A random walk of 30 moves: events in random order, skips, completions.
      for (let move = 0; move < 30; move += 1) {
        const roll = random();
        runtime =
          roll < 0.6
            ? observe(runtime, EVENT_POOL[Math.floor(random() * EVENT_POOL.length)]!)
            : roll < 0.8
              ? advance(runtime)
              : completeCurrentStep(runtime);

        // Identity, not equality. An equal-but-rebuilt plan would mean something
        // re-planned, and re-planning is exactly how a queue grows in silence.
        expect(runtime.plan, `trial ${String(trial)} move ${String(move)}`).toBe(plan);
        expect(runtime.plan.steps.length).toBe(plan.stepCount);
        expect(JSON.stringify(runtime.plan.steps)).toBe(stepsSnapshot);
        expect(runtime.plan.deferredDueCount).toBe(plan.deferredDueCount);
        expect(runtime.outcomes.length).toBe(plan.stepCount);
        expect(runtime.cursor).toBeLessThanOrEqual(plan.stepCount);
        expect(runtime.cursor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never settles a step twice, so progress cannot exceed the plan', () => {
    const started = startSession(
      newContext(),
      {
        timeBudgetMin: 10,
        dueContracts: manyDue(2),
        newBudget: 0,
      },
      { idempotencyKey: 't13:double' },
    );

    let runtime = started.runtime;
    const step = runtime.plan.steps[0]!;
    const review = parseEvent({
      eventId: 'ev-double',
      v: 1,
      occurredAt: FIXED,
      idempotencyKey: 'idem-double',
      type: 'ReviewGraded',
      contractId: step.contractId,
      grade: 'good',
      latencyMs: 1000,
      hintsUsed: 0,
      revealedBeforeRecall: false,
      probeContext: 'standalone',
      tier: 'A',
    }) as DomainEvent;

    runtime = observe(runtime, review);
    expect(runtime.cursor).toBe(1);
    // The same event arriving again (a retry, a replay, a double tap) moves
    // nothing: the step it named is already settled.
    runtime = observe(runtime, review);
    expect(runtime.cursor).toBe(1);
    expect(runtime.outcomes.filter((outcome) => outcome !== 'pending')).toHaveLength(1);
  });
});

describe('the plan cannot grow through the command handler either', () => {
  it('survives 60 random command sequences over a real replayed log', () => {
    const random = seededRandom(0xc0de);

    for (let trial = 0; trial < 60; trial += 1) {
      const context = newContext(`t13cmd-${String(trial)}-`);
      let state = applySessionCommand(context, createSessionWorkspace(seededLog()), {
        kind: 'start',
        timeBudgetMin: 20,
        newBudget: 1,
        canvasId: 'pas-bunki-01',
        asOf: FIXED,
      });

      const plan = state.runtime?.plan;
      expect(plan).toBeDefined();
      const snapshot = JSON.stringify(plan);

      const commands: readonly SessionCommand[] = [
        { kind: 'skipStep' },
        { kind: 'completeStep' },
        {
          kind: 'answerStep',
          attempt: { grade: 'good', latencyMs: 1200, hintsUsed: 0, revealedBeforeRecall: false },
        },
        {
          kind: 'answerStep',
          attempt: { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: true },
        },
        { kind: 'checkRejoin' },
      ];

      for (let move = 0; move < 12; move += 1) {
        state = applySessionCommand(
          context,
          state,
          commands[Math.floor(random() * commands.length)]!,
        );
        expect(state.runtime?.plan, `trial ${String(trial)} move ${String(move)}`).toBe(plan);
        expect(JSON.stringify(state.runtime?.plan)).toBe(snapshot);
      }

      // The log grew — that is what a session does — and the plan did not.
      expect(state.log.length).toBeGreaterThan(seededLog().length);
    }
  });

  it('does not re-plan when new evidence makes another contract due', () => {
    const context = newContext('t13-newdue-');
    let state = applySessionCommand(context, createSessionWorkspace(seededLog()), {
      kind: 'start',
      timeBudgetMin: 20,
      newBudget: 1,
      asOf: FIXED,
    });
    const plan = state.runtime?.plan;
    const before = plan?.stepCount ?? 0;

    // Answering moves memory state, which changes what `selectDueContracts`
    // would return *if it were asked again*. The whole point is that it is not.
    for (let move = 0; move < 6; move += 1) {
      state = applySessionCommand(context, state, {
        kind: 'answerStep',
        attempt: { grade: 'good', latencyMs: 1000, hintsUsed: 0, revealedBeforeRecall: false },
      });
    }

    expect(state.runtime?.plan).toBe(plan);
    expect(state.runtime?.plan.stepCount).toBe(before);
  });
});

describe('the session reaches a finite completion state', () => {
  it('exhausts a finite plan in a finite number of moves and closes', () => {
    const context = newContext('t13-finite-');
    const started = startSession(
      context,
      {
        timeBudgetMin: 20,
        dueContracts: manyDue(4),
        newBudget: 1,
        canvasId: 'pas-bunki-01',
      },
      { idempotencyKey: 't13:finite' },
    );

    let runtime = started.runtime;
    for (let move = 0; move < runtime.plan.stepCount; move += 1) {
      runtime = completeCurrentStep(runtime);
    }

    const progress = sessionProgress(runtime);
    expect(progress.planExhausted).toBe(true);
    expect(progress.remainingCount).toBe(0);
    expect(progress.remainingMinutes).toBe(0);

    const closed = closeSession(context, runtime, resolveCompletionState(runtime), {
      idempotencyKey: 't13:close',
    });
    expect(closed.event?.type).toBe('SessionClosed');
    expect(SESSION_COMPLETION_STATES).toContain(closed.event?.completionState);
    expect(closed.runtime.status).toBe('closed');
    expect(closed.runtime.completionState).toBe('completed');
  });

  it('reports abandonment honestly rather than calling an early exit complete', () => {
    const context = newContext('t13-abandon-');
    const started = startSession(
      context,
      {
        timeBudgetMin: 20,
        dueContracts: manyDue(4),
        newBudget: 0,
      },
      { idempotencyKey: 't13:abandon' },
    );

    const runtime = completeCurrentStep(started.runtime);
    expect(resolveCompletionState(runtime)).toBe('abandoned');
  });

  it('calls a budget that fitted no work exactly that', () => {
    const context = newContext('t13-tiny-');
    const started = startSession(
      context,
      {
        timeBudgetMin: 1,
        dueContracts: manyDue(4),
        newBudget: 0,
      },
      { idempotencyKey: 't13:tiny' },
    );
    expect(resolveCompletionState(started.runtime)).toBe('budget_exhausted');
  });

  it('mints nothing when a closed session is closed again', () => {
    const context = newContext('t13-reclose-');
    const started = startSession(
      context,
      {
        timeBudgetMin: 10,
        dueContracts: [],
        newBudget: 0,
      },
      { idempotencyKey: 't13:reclose' },
    );

    const first = closeSession(context, started.runtime, 'completed', { idempotencyKey: 'c1' });
    const second = closeSession(context, first.runtime, 'abandoned', { idempotencyKey: 'c2' });
    expect(second.event).toBeNull();
    expect(second.runtime.completionState).toBe('completed');
  });

  it('ignores every progress operation once the session is closed', () => {
    const context = newContext('t13-frozen-');
    const started = startSession(
      context,
      {
        timeBudgetMin: 20,
        dueContracts: manyDue(3),
        newBudget: 0,
      },
      { idempotencyKey: 't13:frozen' },
    );

    const closed = closeSession(context, started.runtime, 'abandoned', {
      idempotencyKey: 't13:frozen-close',
    }).runtime;

    expect(advance(closed)).toBe(closed);
    expect(completeCurrentStep(closed)).toBe(closed);
    expect(observe(closed, EVENT_POOL[0]!)).toBe(closed);
  });
});
