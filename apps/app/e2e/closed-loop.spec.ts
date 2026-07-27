/**
 * T-17 — the closed loop, walked by clicking (WP-10; controller §17.1,
 * REQ-PH-01).
 *
 * > paste or select one provenance-labeled seeded encounter → immediate durable
 * > thread → bounded AI candidate explanation → explicit promotion → one stable
 * > retrieval contract → one contextual reuse → scored probe → finite session →
 * > inspect and export the evidence.
 *
 * That sentence is the mission (controller §1) and this file is it, in order,
 * against the real `expo export --platform web` bundle. Every step below is a
 * click or a keystroke a person could make; nothing is seeded, stubbed, or
 * shortcut. The one non-visual read is the durable snapshot, and it is a read.
 *
 * ## The reload is the point of the middle of this test
 *
 * The loop is reloaded twice. The first reload comes immediately after the save,
 * because "immediate durable thread" is two claims and a screenshot only proves
 * the first: the acknowledgment is on screen before enrichment, *and* the thread
 * is still there when the page comes back cold. The second reload stands in for
 * the operator's force-quit (definition of done §3.7) and happens before the
 * inspector, so the chain that gets traced and the bytes that get exported are
 * read out of storage rather than out of a session's memory.
 *
 * ## What this test deliberately does not claim
 *
 * **Native durability.** This is the provisional web adapter; the store says so
 * on screen and so does this comment. T-16-native is WP-11's and only WP-11's.
 *
 * **A live model.** The web bundle holds no API key by construction
 * (`candidate-runtime.ts`), so the candidate here is the scripted fallback and
 * the test asserts it is *labelled as one*. Live-call evidence is OD-08's open
 * gate; this file does not close it and does not pretend to.
 *
 * **That the session's observations are in the export.** They are not, and the
 * app says why on the session screen. Step 9 asserts the seam is disclosed
 * rather than quietly asserting around it — see the note there.
 */

import { CANDIDATE_LABEL, OFFLINE_FALLBACK_LABEL } from '@bunki/ai';

import { expect, test, TARGET } from './support/app.ts';

test('T-17: the whole REQ-PH-01 loop, by clicking, on the exported web app', async ({
  app,
  page,
}) => {
  // A bundle that throws during the loop can still leave a green DOM behind, so
  // page errors are collected and asserted at the end rather than trusted away.
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  // ---------------------------------------------------------------- 1. capture
  await app.open('/');
  await app.captureAndKeep(TARGET, 'reading');

  const acknowledgment = app.testId('capture-acknowledgment');
  await expect(acknowledgment).toContainText(`Kept — ${TARGET}`);
  // Both events, named on screen: the capture and the one rung it moves off
  // `captured`. `keep` activates no contracts — that is what makes step 4's
  // empty session queue a fact about the design rather than a coincidence.
  await expect(acknowledgment).toContainText('EncounterCaptured, ThreadPromotionChanged');
  await expect(app.testId('durability-notice')).toContainText('Saved on this device.');

  // ------------------------------------------- 2. reload: the thread is durable
  await app.reload();
  await expect(app.testId('capture-threads')).toContainText('Kept threads (1)');
  await expect(app.testId('capture-threads')).toContainText(TARGET);
  // Still on the `keep` rung after the reload, and still offering the gesture
  // that would move it: what survived is the learner's capture, not a promotion
  // the app invented for them.
  await expect(app.testId('capture-threads')).toContainText('keep · marked uncertain');
  await expect(app.promoteButton()).toBeVisible();

  expect(await app.persistedEventTypes()).toEqual(['EncounterCaptured', 'ThreadPromotionChanged']);

  // --------------------------- 3. capture created no review debt (DoD §3 step 3)
  await app.nav('session').click();
  await expect(app.testId('screen-session')).toBeVisible();
  await expect(app.testId('state-empty')).toContainText('Nothing is taken up for study yet.');

  await app.nav('capture').click();
  await expect(app.testId('screen-capture')).toBeVisible();

  // ------------------------------------------------- 4. the bounded AI candidate
  await app.testId('capture-search-input').fill(TARGET);
  await expect(app.testId('capture-top-answer')).toBeVisible();
  await app.openWordPageFromCapture();
  await app.requestCandidate();

  // T-12's subject, asserted here as part of the loop and again on its own in
  // `candidate-label.spec.ts`: the label is in the DOM, next to the text.
  await expect(app.testId('candidate-label')).toHaveText(CANDIDATE_LABEL);
  await expect(app.testId('candidate-fallback-label')).toHaveText(OFFLINE_FALLBACK_LABEL);
  await expect(app.testId('candidate-text')).toContainText(TARGET);
  await expect(app.testId('candidate-status')).toContainText('Not kept.');

  // Accepting is a press, and it is the only thing that produces the acceptance
  // event (controller §6.1: `userAction: true`, never automatic).
  await app.testId('candidate-accept').click();
  await expect(app.testId('candidate-status')).toContainText('Kept as your note at');
  await expect(app.testId('candidate-status')).toContainText('stays labelled as generated');

  // ------------------------------------------------ 5. explicit promotion to Learn
  await app.nav('capture').click();
  await expect(app.testId('screen-capture')).toBeVisible();
  await app.promoteButton().click();
  await expect(app.promotedNote()).toContainText('Taken up for study');
  await expect(app.testId('capture-threads')).toContainText('learn');

  // ---------------------------------- 6. the retrieval contract, and the sitting
  await app.nav('session').click();
  await expect(app.testId('screen-session')).toBeVisible();
  await app.testId('session-start').click();
  await expect(app.testId('session-plan')).toBeVisible();

  const planSteps = app.all('session-plan-step-');
  const plannedStepCount = await planSteps.count();
  expect(plannedStepCount).toBeGreaterThan(0);
  await expect(app.testId('session-plan')).toContainText('it cannot grow while you are in it');

  // A contract on the promoted thread is what makes the next click a *review*
  // rather than a look: there is a prompt, and the four grades beneath it are the
  // contract's own response set (REQ-DM-05, REQ-DM-07).
  await expect(app.testId('session-current')).toBeVisible();
  await expect(app.testId('session-prompt')).toBeVisible();
  await expect(app.testId('session-grade-good')).toBeVisible();

  // NOT asserted here, and the omission is the finding rather than a shrug:
  // whether that prompt reads `分岐` or the raw string `contract-meaning-lex-bunki`
  // depends on whether the wall clock ticked a millisecond between the two
  // `createTargetContract` calls in `session-loop.ts`. Same gestures, different
  // sitting — and in the losing case the learner is asked to recall an internal
  // identifier. Filed as B9-1 against WP-08 with the mechanism and a repro
  // (`--repeat-each=6`); it is a defect in `src/screens/session*`, which is
  // another builder's surface and is being repaired under separate branches, so
  // this file reports it instead of pinning either outcome. What the loop needs
  // from this step — that a scored probe over the promoted thread happens and is
  // recorded — is asserted below and does not depend on which contract was drawn.
  const promptShown = (await app.testId('session-prompt').innerText()).trim();
  test.info().annotations.push({
    type: 'session-prompt',
    description: `the sitting opened on "${promptShown}" (finding B9-1: this varies run to run)`,
  });

  // ------------------------------------------------------- 7. one scored review
  await app.testId('session-grade-good').click();
  await expect(app.testId('session-progress')).toContainText(
    `1 of ${String(plannedStepCount)} done · 1 answered · 0 skipped`,
  );

  // ------------------------------------------- 8. one contextual reuse, classified
  await app.testId('session-open-canvas').click();
  await expect(app.testId('screen-canvas')).toBeVisible();
  await expect(app.testId('canvas-probe')).toContainText(`${TARGET}, under its reading contract`);
  // The target is a blank until it is answered — the priming rule of REQ-SCH-06
  // made physical. A form the page is showing you cannot be "retrieved".
  await expect(app.testId('canvas-probe-target')).toHaveText('▢▢');

  // A tap on another word, then the blank. One visible reading surface, two
  // different observations, and the ledger says which is which.
  await app.all('canvas-tap-').first().click();
  await app.testId('canvas-grade-good').click();

  const ledger = app.testId('canvas-ledger');
  await expect(ledger).toContainText('exposure');
  await expect(ledger).toContainText('declared review');
  await expect(ledger).toContainText('nobody retrieved anything');
  await expect(app.testId('canvas-settled')).toContainText('one blank, one answer');

  // ------------------------------------------------- 9. finish the finite session
  await app.button('Back').click();
  await expect(app.testId('screen-session')).toBeVisible();
  await app.testId('session-complete-canvas').click();
  await app.testId('session-close').click();

  await expect(app.testId('session-completion')).toBeVisible();
  const completionState = (await app.testId('session-completion-state').innerText()).trim();
  expect(['completed', 'abandoned', 'budget_exhausted']).toContain(completionState);
  await expect(app.testId('session-completion')).toContainText('Recorded as SessionClosed for');
  await expect(app.testId('session-completion')).toContainText('Nothing was queued behind it.');
  test.info().annotations.push({
    type: 'completion-state',
    description:
      `SessionClosed recorded completionState="${completionState}" after every work step ` +
      'was settled. See the finding filed with this work package: the closure step is ' +
      'never given an outcome, so `resolveCompletionState` reads it as pending.',
  });

  // The plan is the same size it was composed at, after everything above.
  expect(await planSteps.count()).toBe(plannedStepCount);

  // The seam this build has not closed, asserted rather than skirted: the
  // sitting's observations live in the session workspace and are not in the
  // durable log, and the app says so where the learner can read it.
  await app.testId('session-backlog-toggle').click();
  await expect(app.testId('session-backlog')).toContainText('Reported, never queued.');
  await expect(app.testId('session-backlog')).toContainText(
    'do not survive a reload and do not appear in an export',
  );

  // ------------------------- 10. reload again, then inspect what actually survived
  await app.reload();
  await app.nav('evidence').click();
  await expect(app.testId('screen-evidence')).toBeVisible();

  await expect(app.testId('evidence-why-this')).toContainText(`You took ${TARGET} up for study`);

  await app.testId('evidence-disclosure').click();
  await expect(app.testId('evidence-chain')).toBeVisible();

  // The chain, traced: two state changes, each naming the event that caused it
  // and the origin that authorised it. `origin user` twice is the whole of
  // "no state change without a gesture behind it" (DoD §2 item 6).
  const stateChanges = app.testId('evidence-state-changes');
  await expect(stateChanges).toContainText('captured → keep');
  await expect(stateChanges).toContainText('keep → learn');
  await expect(stateChanges).toContainText('origin user');
  await expect(app.testId('evidence-versions')).toContainText('Event schema version: v1');

  // ------------------------------------------- 11. export, and check it replays
  await app.testId('evidence-export-button').click();
  await expect(app.testId('evidence-export-badge')).toBeVisible();

  const badge = await app.testId('evidence-export-badge').innerText();
  expect(badge).toMatch(
    /^Replay check passed — \d+ events re-read and replayed to the same state\./,
  );
  // A failing round trip renders a first-difference line; its absence is the
  // negative half of the same assertion.
  await expect(app.testId('evidence-export-difference')).toHaveCount(0);
  await expect(app.testId('evidence-export')).toContainText(
    'Replaying the parsed events reproduced the derived state this export was taken from',
  );
  // T-15's export half: the encounter's source travels with the bytes.
  await expect(app.testId('evidence-export-licence-manual-entry')).toContainText('manual-entry');

  // The two projections agree: the badge counted the events it replayed, and the
  // browser's own storage holds that many. A screen willing to say "passed" over
  // a log that is not there would fail here.
  const claimedEventCount = Number(/— (\d+) events/.exec(badge)?.[1] ?? '0');
  expect(claimedEventCount).toBeGreaterThan(0);
  await expect
    .poll(async () => (await app.persistedEventTypes()).length, { timeout: 10_000 })
    .toBe(claimedEventCount);

  // Every step of the loop, in the order it was walked, as the store kept it.
  expect(await app.persistedEventTypes()).toEqual([
    'EncounterCaptured',
    'ThreadPromotionChanged',
    'CandidateAttached',
    'CandidateAcceptedAsNote',
    'ThreadPromotionChanged',
    'DataExported',
  ]);

  expect(pageErrors).toEqual([]);
});
