/**
 * RENKAN R2-X — apps/app kernel honesty, in the browser (full-review ledger
 * P1-16, P1-17; terminal T7).
 *
 * Two findings from the full-instrument review, each proved closed against the
 * exported web bundle by clicking, with the durable snapshot read back as the
 * independent witness:
 *
 *   - **P1-16** — the session time budget was hardcoded at 12 minutes; "the
 *     time the learner chose" (REQ-SCH-04) had no UI anywhere. Now the session
 *     start surface carries the choice, the choice survives a reload, and the
 *     `SessionStarted` event in the durable log records the budget the domain
 *     planner actually received.
 *   - **P1-17** — the `LookupFrictionLogged` channel (T-07) fired only from the
 *     scripted golden route; real lookups recorded nothing. Now the capture
 *     surface's own lookup gesture records exactly one grade-free event.
 */

import { expect, test, TARGET, TARGET_LEXEME_ID } from './support/app.ts';

test('P1-16: the session budget is the learner’s — chosen, persisted, and received by the planner', async ({
  app,
}) => {
  await app.open('/');
  await app.captureAndKeep(TARGET, null);
  await app.promoteButton().click();
  await expect(app.promotedNote()).toBeVisible();

  await app.nav('session').click();
  await expect(app.testId('screen-session')).toBeVisible();

  // Before any choice: the default is the 12 the old constant hardcoded.
  await expect(app.testId('screen-session')).toContainText('12 minutes');
  await expect(app.testId('session-budget')).toBeVisible();

  // The choice is one tap, and the start surface restates it immediately.
  await app.testId('session-budget-5').click();
  await expect(app.testId('session-budget-5')).toContainText('✓');
  await expect(app.testId('screen-session')).toContainText('5 minutes');

  // A reload is the honesty test for "persisted": the same URL, a cold bundle,
  // nothing carried over but what the app wrote down.
  await app.reload();
  await expect(app.testId('screen-session')).toBeVisible();
  await expect(app.testId('screen-session')).toContainText('5 minutes');
  await expect(app.testId('session-budget-5')).toContainText('✓');

  // Compose the sitting. The plan states the learner's number back, and its
  // estimate never exceeds it.
  await app.testId('session-start').click();
  await expect(app.testId('session-plan')).toBeVisible();
  await expect(app.testId('screen-session')).toContainText('of the 5 you gave');
  const subtitle = await app.testId('screen-session').innerText();
  const estimated = Number(/about (\d+) min of the 5 you gave/.exec(subtitle)?.[1] ?? 'NaN');
  expect(estimated).toBeLessThanOrEqual(5);

  // What did not fit names the learner's own bound, and is reported, never
  // queued (REQ-SCH-04).
  await app.testId('session-backlog-toggle').click();
  await expect(app.testId('session-backlog')).toContainText('did not fit the 5-minute budget');

  // The log agrees with the screen: the domain planner received the chosen
  // budget, recorded on the SessionStarted event in the durable snapshot.
  await expect
    .poll(async () =>
      (await app.persistedEvents()).filter((event) => event['type'] === 'SessionStarted'),
    )
    .toHaveLength(1);
  const started = (await app.persistedEvents()).filter(
    (event) => event['type'] === 'SessionStarted',
  );
  expect(started[0]?.['budget']).toMatchObject({ timeBudgetMin: 5 });
});

test('P1-17 / T-07: a real lookup records exactly one grade-free LookupFrictionLogged', async ({
  app,
}) => {
  await app.open('/');

  // The real lookup path: type a word, get the answer, open its full entry.
  // The typing and the ambient top answer record nothing — the deliberate
  // press that opens the entry is the gesture.
  await app.testId('capture-search-input').fill(TARGET);
  await app.testId('capture-top-answer').waitFor();
  await app.testId('capture-open-word').click();
  await expect(app.testId('screen-word')).toBeVisible();

  await expect
    .poll(async () =>
      (await app.persistedEvents()).filter((event) => event['type'] === 'LookupFrictionLogged'),
    )
    .toHaveLength(1);

  const lookups = (await app.persistedEvents()).filter(
    (event) => event['type'] === 'LookupFrictionLogged',
  );
  // T-07: no grade field exists to fill in, and none was invented beside it.
  expect(lookups[0]).not.toHaveProperty('grade');
  expect(lookups[0]).not.toHaveProperty('tier');
  expect(lookups[0]).not.toHaveProperty('contractId');
  expect(lookups[0]).toMatchObject({
    context: 'capture',
    targetRef: { targetType: 'lexeme', targetId: TARGET_LEXEME_ID },
  });

  // The lookup is the whole of what the gesture wrote: no contract, no grade,
  // no thread — looking a word up is neither a success nor a failure, and it
  // creates no review debt.
  expect(await app.persistedEventTypes()).toEqual(['LookupFrictionLogged']);

  // It is canonical: a reload keeps it, and the remount adds nothing.
  await app.reload();
  await expect(app.testId('screen-word')).toBeVisible();
  expect(
    (await app.persistedEvents()).filter((event) => event['type'] === 'LookupFrictionLogged'),
  ).toHaveLength(1);
  expect(await app.persistedEventTypes()).toEqual(['LookupFrictionLogged']);
});
