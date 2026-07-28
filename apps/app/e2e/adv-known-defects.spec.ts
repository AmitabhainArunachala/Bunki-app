/**
 * T3/T4 — defects this lane found, pinned so they cannot be lost or quietly fixed.
 *
 * Every test in this file asserts **the behaviour that ought to hold**, and is
 * annotated `test.fail()` for as long as the defect it names is open. That shape
 * is deliberate and it is doing three jobs at once:
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
 *      outlive its defect is the only kind worth having. That is not
 *      hypothetical: it is what happened to T3-1 and T3-2 in the W5 closeout,
 *      and the tests stayed behind as regression pins with their annotations
 *      removed.
 *
 * Each finding below carries its id, severity, the requirement it touches, and
 * the reproduction. Severities are this lane's assessment, offered to CON for
 * triage — the owning builder decides the fix.
 *
 * ## State after the W5 closeout
 *
 * Two of these findings are **closed**, and their tests stayed — without their
 * annotations — as regression pins:
 *
 *   - **T3-1** (a finished sitting reported as `abandoned`) — fixed in
 *     `resolveCompletionState`.
 *   - **T3-2** (the nav shell stacking screens without bound) — fixed by
 *     `router.replace` in `NavShell`.
 *
 * Three remain open and annotated. Two of them are narrower successors rather
 * than survivors: closing a defect here has twice revealed a smaller one behind
 * it, and recording that is the point of the file.
 *
 *   - **T4-2 (P2)** — no `SessionClosed` reaches the durable log at all
 *     (COORD-B8-2). Found by fixing T3-1.
 *   - **T4-1b (P2)** — the pre-hydration bytes still ship an empty `<title>`.
 *     Left by fixing T4-1.
 *   - **T3-3 (P2)** — an abandoned AI request still attaches a candidate.
 *
 * Finding **T4-1** itself (empty `<title>` on every exported page) is closed;
 * the positive assertion that replaced it lives with the rest of the
 * accessibility evidence in `adv-a11y-audit.spec.ts`.
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
 * **T3-1 (P1) — FIXED in the W5 closeout. This test is now a regression pin.**
 *
 * *The defect.* `completed` was unreachable through the UI. Every finished
 * sitting was recorded and displayed as `abandoned`, under the words "Ended
 * early. Some steps were left" — 16 of 16 recorded executions.
 *
 * *Mechanism.* `resolveCompletionState` (`packages/domain/src/session/runtime.ts`)
 * returned `abandoned` when any step outcome was still `pending`, and the
 * closure step is one of the plan's steps. The only control the closure step
 * offers is "Finish the session", which dispatches `close` — so the closure
 * step's own outcome was always `pending` at the moment the state was resolved.
 *
 * *The fix.* `resolveCompletionState` now asks whether the learner left *work*
 * pending, excluding the closure step, which carries no work and is settled by
 * the act of closing. `abandoned` is unchanged for a sitting closed with real
 * steps outstanding — `t13-plan-cannot-grow.test.ts` pins both directions, so
 * this is not a weakened assertion but a corrected question.
 *
 * *Still true, and deliberately not "fixed".* The `step === null` branch (testID
 * `session-finish`) does not render on this path and never did. It is not dead
 * code: it is what a zero-budget plan reaches, where the planner emits no
 * closure step at all (`plan.ts` — "a plan without closure is only reachable
 * from a zero budget"). Left as-is.
 */
test('T3-1: a sitting with every step answered is recorded as completed', async ({ page, app }) => {
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
 * **T4-2 (P2) — FIXED by the WP-10 export lane. This test is now a regression pin.**
 *
 * The same claim as T3-1, seen from the durable log rather than the screen, and
 * kept separate because they are two different claims: one is what the learner is
 * told, the other is what the export and the evidence inspector will say about
 * this sitting forever. Fixing T3-1 fixed only the first. This one used to fail
 * one step earlier — **no `SessionClosed` event reached the durable log at all**,
 * whatever its completion state — and it was marked `test.fail` with the reason.
 *
 * *The defect.* The sitting's events lived in the session screen's workspace
 * beside the durable log rather than in it (`SESSION_INTEGRATION_NOTE`,
 * COORD-B8-2). Joining them was refused, correctly, because it looked like giving
 * the store an `ingest(events)` — the evidence-gate bypass controller §5 exists
 * to close and §21.3(5) makes a stop condition.
 *
 * *The fix.* The kernel now records the exact objects its minters return
 * (`packages/domain/src/events/mint-registry.ts`) and `AppStore.persistMinted`
 * takes only a sealed batch, so the store accepts events it did not mint *and*
 * cannot accept events the kernel did not mint. The events are still minted where
 * they always were: by `applySessionCommand`, evidence-class ones through the
 * gate. `apps/app/test/persist-minted-boundary.test.ts` attacks the new path.
 *
 * *What this pin asserts.* Not merely that a `SessionClosed` exists, but that it
 * carries `completed` — so it fails again if either half regresses: the sitting
 * dropping out of the log (T4-2), or the completion state going back to
 * `abandoned` for a sitting the learner finished (T3-1).
 */
test('T3-1: the SessionClosed event records the sitting as completed', async ({ page, app }) => {
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
 * **T3-2 (P1) — FIXED in the W5 closeout. This test is now a regression pin.**
 *
 * *The defect.* Every press of the persistent nav shell pushed a new screen onto
 * the router stack and popped nothing. Five round trips between Evidence and
 * Capture left **8** mounted capture screens and **5** mounted evidence screens,
 * one of each visible; the count never fell. Each mounted capture screen is a
 * live component subscribed to the store, so every store write re-rendered all
 * of them — work growing with navigation for no reason the learner can see, the
 * same failure shape the definition of done names for the review queue in §2
 * item 5. It also walked the browser's Back button through a history the learner
 * never built.
 *
 * *The fix.* `NavShell`'s `NavLink` calls `router.replace`. `navigate` was tried
 * first and measured — still 6 mounted capture screens after the same five round
 * trips on expo-router 57, because it collapses onto an entry for the same path
 * rather than switching between siblings — so `replace` is what the shell uses.
 *
 * *What the numbers below mean.* One mounted screen for the destination the
 * learner is on, and **zero** for the one they left: `replace` unmounts it
 * rather than hiding it. That is stricter than this test originally asked for
 * (it expected 1 stale evidence screen, because that is what `push` produced),
 * and it is stricter in the right direction — a screen that does not exist
 * cannot be focused, cannot be scanned, and cannot re-render.
 *
 * *The property that outlives the numbers.* Counts after five round trips equal
 * counts after one. That is the actual claim — bounded, not merely small — and
 * it is what fails if someone reintroduces a push.
 *
 * *Not regressed.* `adv-a11y-audit.spec.ts` pins that no stale screen is
 * keyboard-reachable and that every route is axe-clean. Both still hold; with
 * nothing left mounted they hold trivially.
 */
test('T3-2: navigating between destinations does not accumulate mounted screens', async ({
  page,
  app,
}) => {
  const roundTrip = async (): Promise<void> => {
    await visibleTestId(page, 'nav-evidence').click();
    await expect(visibleTestId(page, 'screen-evidence')).toBeVisible();
    await visibleTestId(page, 'nav-capture').click();
    await onCaptureScreen(page);
  };

  await openApp(page, app.origin);
  await onCaptureScreen(page);
  expect(await mountedScreenCount(page, 'screen-capture')).toBe(1);

  await roundTrip();
  const afterOne = {
    capture: await mountedScreenCount(page, 'screen-capture'),
    evidence: await mountedScreenCount(page, 'screen-evidence'),
  };

  for (let trip = 0; trip < 4; trip += 1) await roundTrip();
  const afterFive = {
    capture: await mountedScreenCount(page, 'screen-capture'),
    evidence: await mountedScreenCount(page, 'screen-evidence'),
  };

  // The property: five round trips cost exactly what one costs. A push-based
  // shell fails here even if the absolute numbers below were ever relaxed.
  expect(afterFive, 'mounted screens grew between the first and fifth round trip').toEqual(
    afterOne,
  );

  // The absolute state, recorded so a regression says *what* changed.
  expect(afterFive.capture, 'mounted capture screens (the destination shown)').toBe(1);
  expect(afterFive.evidence, 'mounted evidence screens (the destination left)').toBe(0);
});

/* ------------------------------------------------------------------ *
 * T4-1b — the pre-hydration bytes still ship an empty <title>
 * ------------------------------------------------------------------ */

/**
 * **T4-1b (P2).** The residual left by the T4-1 fix, written down so it is not
 * mistaken for closed.
 *
 * T4-1 was "every exported page ships an empty `<title>`". Every route now sets
 * a real, distinct title through `src/ui/route-title.tsx`, and
 * `adv-a11y-audit.spec.ts` asserts that positively on all nine routes — so the
 * axe violation is gone and `KNOWN_AXE_FINDINGS` is empty.
 *
 * But axe scans the **hydrated** page. The bytes `expo export` writes still
 * contain `<title data-rh="true"></title>`, because expo-router's `Head` is
 * gated on `useIsFocused` and does not render during static pre-rendering. So
 * the tab is blank for the moment between first paint and hydration, and a
 * bookmark saved from a page that never finished loading is still blank.
 *
 * *Why P2 and not P1.* The window is short, no assistive-technology user is
 * left without a title once the app runs, and every route is correctly titled in
 * the state a person actually reads. It is a real gap, not a theoretical one,
 * and it is smaller than what it replaced.
 *
 * *What a fix looks like.* Something that renders a title during static export —
 * a non-focus-gated head for the pre-render, or expo-router growing static head
 * support. `+html.tsx` is deliberately *not* it: helmet emits its (empty) title
 * first, so a title added there is second in tree order and `document.title`
 * keeps reading the empty one. That was measured, not assumed.
 *
 * This test reads the export off the wire rather than through the DOM, because
 * the DOM is exactly what hides the defect.
 */
test('T4-1b: the exported HTML names itself before any JavaScript runs', async ({ page, app }) => {
  test.fail(
    true,
    'T4-1b (P2): expo-router Head is focus-gated, so static pre-rendering emits an empty ' +
      '<title>; the title only appears once the app hydrates.',
  );

  const response = await page.request.get(`${app.origin}/evidence`);
  const html = await response.text();

  const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '';
  expect(title.trim(), 'the pre-rendered document has a blank <title>').not.toBe('');
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
