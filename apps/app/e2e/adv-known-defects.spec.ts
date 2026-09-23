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
 * Three of these findings are **closed**, and their tests stayed — without their
 * annotations — as regression pins:
 *
 *   - **T3-1** (a finished sitting reported as `abandoned`) — fixed in
 *     `resolveCompletionState`.
 *   - **T3-2** (the nav shell stacking screens without bound) — fixed by
 *     `router.replace` in `NavShell`.
 *   - **T4-2** (no `SessionClosed` reaching the durable log at all) — fixed by
 *     the WP-10 export lane: `AppStore.persistMinted` takes a sealed batch of
 *     kernel-minted events, so the store can accept the sitting without becoming
 *     able to accept a forgery (COORD-B8-2 closed).
 *
 * The two successors are now closed as well:
 *
 *   - **T4-1b** — root-layout metadata renders before storage boot, so the
 *     exported HTML has a title with JavaScript disabled.
 *   - **T3-3** — page teardown invalidates a candidate request before aborting,
 *     and a late result cannot write or clear a newer request.
 *
 * Finding **T4-1** itself (empty `<title>` on every exported page) is closed;
 * the positive assertion that replaced it lives with the rest of the
 * accessibility evidence in `adv-a11y-audit.spec.ts`.
 */

import { relative, sep } from 'node:path';

import type { Page } from '@playwright/test';

import { DESTINATIONS } from '../src/ui/navigation.ts';
import { startExportHost } from './support/export-server.ts';

import {
  expect,
  test,
  openApp,
  onCaptureScreen,
  keepWord,
  takeUpForStudy,
  durableEventTypes,
  candidateEvents,
  exportFiles,
  keptThreadCount,
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
 * T4-1b: AppProvider returns null until its storage-opening effect completes.
 * Per-screen Head components therefore never mounted during static export.
 * Root-layout metadata now sits outside that boot boundary. Every HTML file,
 * including grouped aliases and the not-found route, is loaded without JS.
 */
test('T4-1b: every exported HTML document names itself before JavaScript runs', async ({
  browser,
  app,
}) => {
  const documents = exportFiles(app.distDir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => relative(app.distDir, file).split(sep).join('/'));
  expect(documents).toContain('index.html');
  expect(documents).toContain('+not-found.html');
  expect(documents, 'the diagnostic sitemap is disabled in the production router').not.toContain(
    '_sitemap.html',
  );

  const cold = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await cold.newPage();
    for (const file of documents) {
      const path = file === 'index.html' ? '/' : `/${file.slice(0, -'.html'.length)}`;
      const href = path
        .split('/')
        .filter((segment) => !segment.startsWith('('))
        .join('/');
      const label =
        href === '/+not-found'
          ? 'Page not found'
          : DESTINATIONS.find((destination) => destination.href === href)?.label;
      expect(label, `exported route ${file} has no title requirement`).toBeDefined();
      const response = await page.goto(`${app.origin}${path}`, { waitUntil: 'load' });
      expect(response?.status(), `could not load exported route ${file}`).toBe(200);
      await expect(page.locator('head title'), `${file} must have exactly one title`).toHaveCount(
        1,
      );
      await expect(page, `${file} has the wrong cold-load title`).toHaveTitle(
        `${label} · Bunki 分岐`,
      );
    }
  } finally {
    await cold.close();
  }
});

test('T4-1b: an unknown URL returns a named 404 and a working way back to Capture', async ({
  page,
  app,
}) => {
  // This existing host serves +not-found.html with HTTP 404, including for
  // deep paths. The adversarial host only serves literal exported routes.
  const host = await startExportHost(app.distDir);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await openApp(page, host.baseUrl);
    await keepWord(page, '分岐');
    const before = await durableEventTypes(page);

    const response = await page.goto(`${host.baseUrl}/missing/chapter/fixture`, {
      waitUntil: 'load',
    });
    expect(response?.status()).toBe(404);
    await expect(visibleTestId(page, 'screen-not-found')).toBeVisible();
    await expect(page).toHaveTitle('Page not found · Bunki 分岐');
    expect(await durableEventTypes(page)).toEqual(before);
    await visibleTestId(page, 'not-found-capture').click();
    await onCaptureScreen(page);
    await expect(page).toHaveURL(`${host.baseUrl}/`);
    expect(await keptThreadCount(page)).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await host.close();
  }
});

/* ------------------------------------------------------------------ *
 * T3-3 — abandoning an AI request must not attach a candidate
 * ------------------------------------------------------------------ */

/**
 * The runtime intentionally resolves cancellation to a labelled fallback.
 * The panel owns whether that result still belongs to an active request.
 * A document reload does not trigger React unmount, so pagehide must invalidate
 * the request before its aborted transport can settle and append an event.
 */
test('T3-3: abandoning a request in flight writes nothing to the log', async ({ page, app }) => {
  const hung = await hangEverythingOffOrigin(page, app.origin);
  await armLiveRoute(page);
  await openCandidatePanel(page, app.origin);
  const before = await durableEventTypes(page);

  await visibleTestId(page, 'candidate-request').click();
  await expect(visibleTestId(page, 'state-loading')).toBeVisible();
  await expect.poll(() => hung.some((url) => url.includes('api.anthropic.com'))).toBe(true);

  await page.reload({ waitUntil: 'load' });
  await expect(visibleTestId(page, 'screen-word')).toBeVisible();
  await expect(visibleTestId(page, 'candidate-request')).toBeVisible();
  expect(
    await durableEventTypes(page),
    'the log gained an event from a request the learner abandoned',
  ).toEqual(before);
  expect(await candidateEvents(page)).toEqual([]);
});

interface ControlledCandidateTransport {
  readonly calls: { readonly aborted: () => boolean; readonly fail: () => void }[];
  readonly settled: number[];
}

/**
 * A deliberately slow cancellation acknowledgment models a provider that does
 * not settle immediately on abort. This test dispatches persisted page events;
 * it tests the lifecycle handling, not whether Chromium admitted a page to BFCache.
 */
test('T3-3: a resumed page drops a late cancelled result and can finish a new request', async ({
  page,
  app,
}) => {
  await hangEverythingOffOrigin(page, app.origin);
  await armLiveRoute(page);
  await page.addInitScript(() => {
    const originalFetch = globalThis.fetch.bind(globalThis);
    const control: ControlledCandidateTransport = { calls: [], settled: [] };
    (globalThis as { candidateTransport?: ControlledCandidateTransport }).candidateTransport =
      control;
    globalThis.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith('https://api.anthropic.com/')) return originalFetch(input, init);
      const index = control.calls.length;
      return new Promise<Response>((_resolve, reject) => {
        control.calls.push({
          aborted: () => init?.signal?.aborted === true,
          fail: () => reject(new TypeError('Controlled transport failure')),
        });
      }).finally(() => control.settled.push(index));
    };
  });
  await openCandidatePanel(page, app.origin);
  const before = await durableEventTypes(page);
  const transport = () =>
    page.evaluate(() => {
      const control = (globalThis as { candidateTransport?: ControlledCandidateTransport })
        .candidateTransport;
      return {
        aborted: control?.calls.map((call) => call.aborted()),
        settled: control?.settled,
      };
    });

  await visibleTestId(page, 'candidate-request').click();
  await expect.poll(async () => (await transport()).aborted).toEqual([false]);
  await page.evaluate(() => {
    globalThis.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    globalThis.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect.poll(async () => (await transport()).aborted).toEqual([true]);
  await expect(visibleTestId(page, 'candidate-request')).toBeVisible();

  await visibleTestId(page, 'candidate-request').click();
  await expect.poll(async () => (await transport()).aborted).toEqual([true, false]);
  await page.evaluate(async () => {
    const control = (globalThis as { candidateTransport?: ControlledCandidateTransport })
      .candidateTransport;
    control?.calls[0]?.fail();
    // Flush the completion microtasks before asserting on the durable log.
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  });
  expect((await transport()).settled).toEqual([0]);
  await expect(visibleTestId(page, 'state-loading')).toBeVisible();
  expect(await durableEventTypes(page)).toEqual(before);
  expect((await transport()).aborted).toEqual([true, false]);

  await page.evaluate(() => {
    (
      globalThis as { candidateTransport?: ControlledCandidateTransport }
    ).candidateTransport?.calls[1]?.fail();
  });
  await expect(visibleTestId(page, 'candidate-card')).toBeVisible();
  await expect(visibleTestId(page, 'candidate-fallback-label')).toHaveText('offline-fallback');
  await expect.poll(async () => (await candidateEvents(page)).length).toBe(1);
  const [attached] = await candidateEvents(page);
  expect(attached?.status).toBe('generated');
  expect(attached?.envelope.provider).toBe('offline-fallback');
  expect(await durableEventTypes(page)).toEqual([...before, 'CandidateAttached']);
});

async function armLiveRoute(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (globalThis as { process?: { env: Record<string, string> } }).process = {
      env: { ANTHROPIC_API_KEY: 'fixture-not-a-real-key' },
    };
  });
}

async function openCandidatePanel(page: Page, origin: string): Promise<void> {
  await openApp(page, origin);
  await keepWord(page, '分岐');
  await visibleTestId(page, 'capture-open-word').click();
  await expect(visibleTestId(page, 'screen-word')).toBeVisible();
  // The deliberate word lookup appends an event asynchronously; settle it
  // before measuring what the candidate request adds.
  await expect
    .poll(async () => (await durableEventTypes(page)).includes('LookupFrictionLogged'))
    .toBe(true);
}
