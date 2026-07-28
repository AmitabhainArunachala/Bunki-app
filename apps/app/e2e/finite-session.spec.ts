/**
 * T-13, E2E half — "session reaches a finite completion state; queue cannot
 * silently grow" (WP-10 for WP-08; controller §17.1, §6.4, REQ-SCH-04).
 *
 * WP-08 proved the planner: a property test over budgets shows the plan is
 * bounded and terminal. But the failure the definition of done names is not a
 * planner failure — it is "the session 'ends' but the queue regrows silently:
 * T-13 passing while the UI still manufactures unbounded work" (§2 item 5). A
 * pure function cannot be caught doing that. A screen can.
 *
 * So this file measures the plan the moment it is composed and then re-measures
 * it after every kind of thing a learner can do inside a sitting — answering,
 * reading a passage in the canvas, coming back, closing. The number that matters
 * is not "is it small" but "is it the same number", and the denominator the
 * progress line reports has to agree with it, because two counters that can
 * disagree are how a queue grows without anyone noticing.
 *
 * The finite end is asserted as the domain defines it: one of the three
 * `SessionCompletionState` members, rendered on an explicit closing panel, with
 * the `SessionClosed` event named. Which of the three this build reports for a
 * fully worked sitting is recorded as an annotation rather than asserted, and is
 * filed as a finding with WP-08 — see the note at the assertion.
 */

import { expect, test, TARGET } from './support/app.ts';

/** The three states `SessionCompletionState` admits (controller §6.4). */
const COMPLETION_STATES = ['completed', 'abandoned', 'budget_exhausted'];

test('T-13: the sitting ends explicitly and the plan never grows', async ({ app }) => {
  await app.open('/');
  await app.captureAndKeep(TARGET, null);
  await app.promoteButton().click();
  await expect(app.promotedNote()).toBeVisible();

  await app.nav('session').click();
  await expect(app.testId('screen-session')).toBeVisible();
  await app.testId('session-start').click();
  await expect(app.testId('session-plan')).toBeVisible();

  const planSteps = app.all('session-plan-step-');
  const composed = await planSteps.count();
  expect(composed).toBeGreaterThan(0);

  /** The plan's size, from the list and from the progress line, at one moment. */
  const measure = async (): Promise<{ steps: number; reported: string }> => ({
    steps: await planSteps.count(),
    reported: (await app.testId('session-progress').innerText()).replace(/\s+/g, ' '),
  });

  const denominator = new RegExp(`of ${String(composed)} done`);
  const atComposition = await measure();
  expect(atComposition.reported).toMatch(denominator);

  // --- a graded answer
  await app.testId('session-grade-good').click();
  const afterAnswer = await measure();
  expect(afterAnswer.steps).toBe(composed);
  expect(afterAnswer.reported).toMatch(denominator);
  expect(afterAnswer.reported).toContain('1 answered');

  // --- a canvas visit, where a second observation is recorded against the same
  //     sitting. A probe answered inside a passage is exactly the kind of work
  //     that could plausibly enqueue "one more"; it must not.
  await app.testId('session-open-canvas').click();
  await expect(app.testId('screen-canvas')).toBeVisible();
  await app.all('canvas-tap-').first().click();
  await app.testId('canvas-grade-again').click();
  await expect(app.testId('canvas-settled')).toBeVisible();

  await app.button('Back').click();
  await expect(app.testId('screen-session')).toBeVisible();
  const afterCanvas = await measure();
  expect(afterCanvas.steps).toBe(composed);
  expect(afterCanvas.reported).toMatch(denominator);

  await app.testId('session-complete-canvas').click();
  const afterReading = await measure();
  expect(afterReading.steps).toBe(composed);
  expect(afterReading.reported).toMatch(denominator);

  // --- the explicit end
  await app.testId('session-close').click();
  await expect(app.testId('session-completion')).toBeVisible();

  const completionState = (await app.testId('session-completion-state').innerText()).trim();
  // The requirement is a *finite, explicit* end state, and the domain defines
  // exactly three. Which one a fully worked sitting earns is a separate question
  // from whether the sitting ended, and pinning the current answer here would
  // make this test enforce a defect instead of the requirement.
  expect(COMPLETION_STATES).toContain(completionState);
  test.info().annotations.push({
    type: 'completion-state',
    description: `completionState="${completionState}" after every work step was settled.`,
  });

  await expect(app.testId('session-completion')).toContainText('Recorded as SessionClosed for');
  await expect(app.testId('session-completion')).toContainText('Nothing was queued behind it.');

  // --- and still the same plan, after the end
  const atClose = await measure();
  expect(atClose.steps).toBe(composed);
  expect(atClose.reported).toMatch(denominator);

  // Nothing offers to compose another sitting on top of this one, and the step
  // controls are gone: the closed session has no path back to producing work.
  await expect(app.testId('session-start')).toHaveCount(0);
  await expect(app.testId('session-grade-good')).toHaveCount(0);
  await expect(app.testId('session-skip')).toHaveCount(0);

  // What did not fit is reported, not queued — the whole of REQ-SCH-04's promise
  // that a budget is a boundary rather than a suggestion.
  await app.testId('session-backlog-toggle').click();
  await expect(app.testId('session-backlog')).toContainText('Reported, never queued.');
  await expect(app.testId('session-backlog')).toContainText(
    'nothing will be added while you are in it',
  );
  expect((await measure()).steps).toBe(composed);
});
