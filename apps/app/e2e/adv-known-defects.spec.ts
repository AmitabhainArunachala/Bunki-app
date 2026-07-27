/**
 * T3/T4 — defects this lane found, pinned so they cannot be lost or quietly fixed.
 *
 * Every test in this file asserts **the behaviour that ought to hold** and is
 * annotated `test.fail()`. That shape is deliberate and it is doing three jobs
 * at once:
 *
 *   1. The correct expectation stays written down, in executable form, in the
 *      repository. Nothing here is a weakened assertion or a characterisation of
 *      the wrong behaviour dressed up as a requirement — controller §18a's ban
 *      on weakening a test would forbid that, and it would also mean the fix had
 *      nothing to aim at.
 *   2. The suite stays green while the defects are open, so this lane can be
 *      merged and CI-wired without painting the whole pipeline red for work that
 *      belongs to the owning builders (§17.2 lanes are tests only).
 *   3. **Playwright fails a test that was expected to fail and passed.** So the
 *      moment a defect is fixed, this file turns the pipeline red and forces
 *      whoever fixed it to delete the annotation. An exemption that cannot
 *      outlive its defect is the only kind worth having.
 *
 * Each finding below carries its id, severity, the requirement it touches, and
 * the reproduction. Severities are this lane's assessment, offered to CON for
 * triage — the owning builder decides the fix.
 *
 * **Not in this file:** finding T4-1 (empty `<title>` on every exported page),
 * which lives with the rest of the accessibility evidence in
 * `adv-a11y-audit.spec.ts`, in the same `test.fail()` form.
 */

import type { Page } from '@playwright/test';

import {
  expect,
  test,
  openApp,
  onCaptureScreen,
  keepWord,
  takeUpForStudy,
  durableEventTypes,
  hangEverythingOffOrigin,
  mountedScreenCount,
  visibleTestId,
} from './support/adv-harness.ts';

/* ------------------------------------------------------------------ *
 * T3-1 — a completed sitting is reported as abandoned
 * ------------------------------------------------------------------ */

/**
 * **T3-1 (P1).** `completed` is unreachable through the UI. Every finished
 * sitting is recorded and displayed as `abandoned`, under the words
 * "Ended early. Some steps were left".
 *
 * *Mechanism.* `resolveCompletionState` (`packages/domain/src/session/runtime.ts`)
 * returns `abandoned` when any step outcome is still `pending`, and the closure
 * step is one of the plan's steps. The only control the closure step offers is
 * "Finish the session", which dispatches `close` — so the closure step's own
 * outcome is always `pending` at the moment the state is resolved. There is no
 * path in the screen that settles it first: the `step === null` branch (testID
 * `session-finish`) can only render once *every* step is settled, which for the
 * same reason never happens, making that branch dead code as well.
 *
 * *Why it matters.* The domain's own comment says inferring this "would turn 'I
 * stopped early because I was done enough' into 'abandoned', which is a claim
 * about the learner that the learner did not make". The app then makes that
 * claim, in the one direction that is always wrong. It reaches the durable log
 * as `SessionClosed.completionState`, so it is in the export and in the evidence
 * inspector, and definition-of-done §3 step 6 — "the session reaches its
 * explicit end screen" — is met in form while the screen misdescribes what
 * happened.
 *
 * *Suggested owner.* WP-08 (session orchestrator) with WP-09 for the wording.
 * The fix is the caller's to make: `closeSession` already takes the completion
 * state as a parameter precisely so the screen can say which of the three
 * happened.
 */
test('T3-1: a sitting with every step answered is recorded as completed', async ({ page, app }) => {
  test.fail(
    true,
    'T3-1 (P1): the closure step is never settled, so resolveCompletionState always returns ' +
      '"abandoned" — "completed" is unreachable through the UI.',
  );

  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await takeUpForStudy(page);
  await visibleTestId(page, 'nav-session').click();
  await visibleTestId(page, 'session-start').click();

  // Answer the item and read the passage: every step that carries work is done.
  await visibleTestId(page, 'session-grade-good').click();
  await visibleTestId(page, 'session-complete-canvas').click();
  await visibleTestId(page, 'session-close').click();

  await expect(visibleTestId(page, 'session-completion')).toBeVisible();
  await expect(visibleTestId(page, 'session-completion-state')).toHaveText('completed');
});

/**
 * The same defect, seen from the durable log rather than the screen.
 *
 * Kept separate because the screen and the log are two different claims: one is
 * what the learner is told, the other is what the export and the evidence
 * inspector will say about this sitting forever.
 */
test('T3-1: the SessionClosed event records the sitting as completed', async ({ page, app }) => {
  test.fail(true, 'T3-1 (P1): see above — the event carries the same wrong completion state.');

  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await takeUpForStudy(page);
  await visibleTestId(page, 'nav-session').click();
  await visibleTestId(page, 'session-start').click();
  await visibleTestId(page, 'session-grade-good').click();
  await visibleTestId(page, 'session-complete-canvas').click();
  await visibleTestId(page, 'session-close').click();
  await expect(visibleTestId(page, 'session-completion')).toBeVisible();

  const closed = (await sessionClosedStates(page)).at(-1);
  expect(closed, 'no SessionClosed event reached the log').toBeDefined();
  expect(closed).toBe('completed');
});

async function sessionClosedStates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const storage = globalThis.localStorage;
    const states: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null) continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      try {
        const parsed = JSON.parse(raw) as { events?: unknown };
        if (!Array.isArray(parsed.events)) continue;
        for (const event of parsed.events) {
          const record = event as { type?: unknown; completionState?: unknown };
          if (record.type === 'SessionClosed') states.push(String(record.completionState));
        }
      } catch {
        /* not our snapshot */
      }
    }
    return states;
  });
}

/* ------------------------------------------------------------------ *
 * T3-2 — the nav shell stacks screens without bound
 * ------------------------------------------------------------------ */

/**
 * **T3-2 (P1).** Every press of the persistent nav shell pushes a new screen
 * onto the router stack and pops nothing. Screens the learner has left stay
 * mounted, and their number grows linearly with ordinary navigation.
 *
 * *Measured.* Five round trips between Evidence and Capture leave **8** mounted
 * capture screens and **5** mounted evidence screens, one of each visible. The
 * count never falls.
 *
 * *Mechanism.* `NavShell`'s `NavLink` calls `router.push(destination.href)`
 * (`apps/app/src/ui/nav-shell.tsx`). A persistent shell is a *switch* between
 * destinations, not a stack push; `router.navigate` (or `replace`) is what
 * collapses an existing entry instead of adding one.
 *
 * *Why it matters.* Every mounted capture screen is a live component subscribed
 * to the store, so each store write re-renders all of them. Work grows with
 * navigation for no reason the learner can see — the same failure shape the
 * definition of done names for the review queue in §2 item 5, here in the
 * navigation shell. It also puts the §13 latency budgets quietly out of reach
 * over a long sitting, and it makes the browser's own Back button walk backwards
 * through a history the learner never built.
 *
 * *What is already ruled out.* The stale screens are not keyboard-reachable and
 * carry no axe violations — `adv-a11y-audit.spec.ts` holds both of those, so a
 * fix must not regress them.
 *
 * *Suggested owner.* WP-10 (the integration line owns the shell).
 */
test('T3-2: navigating between destinations does not accumulate mounted screens', async ({
  page,
  app,
}) => {
  test.fail(
    true,
    'T3-2 (P1): NavShell uses router.push, so every destination press stacks another screen and ' +
      'none are ever popped.',
  );

  await openApp(page, app.origin);
  await onCaptureScreen(page);
  expect(await mountedScreenCount(page, 'screen-capture')).toBe(1);

  for (let trip = 0; trip < 5; trip += 1) {
    await visibleTestId(page, 'nav-evidence').click();
    await expect(visibleTestId(page, 'screen-evidence')).toBeVisible();
    await visibleTestId(page, 'nav-capture').click();
    await onCaptureScreen(page);
  }

  expect(
    await mountedScreenCount(page, 'screen-capture'),
    'mounted capture screens after five round trips',
  ).toBe(1);
  expect(
    await mountedScreenCount(page, 'screen-evidence'),
    'mounted evidence screens after five round trips',
  ).toBe(1);
});

/* ------------------------------------------------------------------ *
 * T3-3 — abandoning an AI request still attaches a candidate
 * ------------------------------------------------------------------ */

/**
 * **T3-3 (P2).** Tearing the document down while a candidate request is in
 * flight causes the cancellation to be handled as a *fallback*, and the
 * resulting `CandidateAttached` event is written to the durable log during
 * unload. On the next load the panel says "Nothing has been requested yet"
 * while the log — and therefore the evidence inspector and any export —
 * contains a candidate that was generated by the act of leaving.
 *
 * *Reproduction.* Ask for a note with the live route armed and the transport
 * hung, then reload before it settles. Reproduced 3/3 in this environment;
 * treated as a race, because whether the write lands depends on the store
 * completing before the JS context is discarded.
 *
 * *Mechanism.* Navigation aborts the fetch; `fallbackReasonOf` maps the
 * `AiCancelledError` to a fallback like any other failure
 * (`packages/ai/src/runtime.ts`), so the runtime resolves with a scripted
 * candidate; `useCandidate`'s `.then()` still sees `active.current === true`,
 * because React never unmounts on a document teardown, and writes it
 * (`apps/app/src/candidate/use-candidate.ts`).
 *
 * *Why it is P2 and not higher.* Nothing is lost, no memory state changes, the
 * candidate is correctly labelled `offline-fallback` and correctly `generated`
 * rather than accepted, and candidate *text* is deliberately not durable
 * (`memory-store.ts`). The defect is the divergence: a record exists for
 * something the learner never saw, and the screen afterwards denies it. That is
 * adjacent to definition-of-done §2 item 6 without being it — the learner did
 * press Ask — but the inspector will show a candidate whose only proximate cause
 * was navigation.
 *
 * *The safety half is asserted positively, and passes:*
 * `adv-ai-timeout-storm.spec.ts` requires that whatever reaches the log this way
 * is labelled and unaccepted.
 *
 * *Suggested owner.* WP-07. A cancellation is not a fallback; distinguishing
 * `AiCancelledError` from the failure reasons would close it.
 */
test('T3-3: abandoning a request in flight writes nothing to the log', async ({ page, app }) => {
  test.fail(
    true,
    'T3-3 (P2): a cancellation is handled as a fallback, so the abandoned request attaches a ' +
      'scripted candidate to the durable log during unload.',
  );

  await hangEverythingOffOrigin(page, app.origin);
  await page.addInitScript(() => {
    (globalThis as { process?: { env: Record<string, string> } }).process = {
      env: { ANTHROPIC_API_KEY: 'fixture-not-a-real-key' },
    };
  });

  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  const before = await durableEventTypes(page);

  await visibleTestId(page, 'capture-open-word').click();
  await expect(visibleTestId(page, 'screen-word')).toBeVisible();
  await visibleTestId(page, 'candidate-request').click();
  await expect(visibleTestId(page, 'state-loading')).toBeVisible();

  await page.reload({ waitUntil: 'load' });
  await expect(visibleTestId(page, 'screen-word')).toBeVisible();

  expect(
    await durableEventTypes(page),
    'the log gained an event from a request the learner abandoned',
  ).toEqual(before);
});
