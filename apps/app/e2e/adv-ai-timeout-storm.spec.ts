/**
 * T3 — timeout storm (controller §17.2; T-11 at app level).
 *
 * The requirement: **a timed-out AI call neither loses nor blocks a capture.**
 *
 * ## How a real timeout is reached in a bundle that normally never calls out
 *
 * The Phase-0 web target has no `process`, so `@bunki/ai` finds no key and
 * short-circuits to the labelled fallback without touching a transport. That is
 * correct (REQ-AI-03) and it is what `adv-offline-storm.spec.ts` asserts — but
 * it also means the timeout path is unreachable through the UI, and a lane that
 * stopped there would be testing the absence of a call rather than the handling
 * of a slow one.
 *
 * `ambientEnv()` reads `globalThis.process?.env` behind a guard
 * (`packages/ai/src/platform.ts`). Setting that global before the bundle loads
 * therefore takes the *shipped* code down its *live* branch: `createAnthropicProvider`
 * finds a key, builds the request, and calls `fetch`. Every off-origin request is
 * then held open and never settled, so `runtime.requestCandidate` runs out its
 * own `DEFAULT_TIMEOUT_MS`, aborts, and serves the labelled fallback.
 *
 * Nothing is stubbed: the timer, the `AbortController`, the fallback selection
 * and the labels are all the ones a release would run.
 *
 * **On the key.** It is the literal `fixture-not-a-real-key`, it lives in this
 * test file, and it is worthless: the request carrying it is intercepted inside
 * the browser and never continued, so no byte reaches a provider. This is a
 * fixture, not a secret, and no real credential may ever be substituted for it
 * (controller §15).
 *
 * **What this does not establish.** That a live model answers, or that the live
 * route produces good text. OD-08 governs that and it remains an open gate; the
 * only live-shaped thing exercised here is the failure path.
 */

import type { Page } from '@playwright/test';

import {
  expect,
  test,
  openApp,
  hydrated,
  onCaptureScreen,
  keepWord,
  keptThreadCount,
  durableEventCount,
  candidateEvents,
  hangEverythingOffOrigin,
  visibleTestId,
} from './support/adv-harness.ts';

/** The runtime's own budget (`packages/ai/src/runtime.ts`). Not configurable from the UI. */
const RUNTIME_TIMEOUT_MS = 10_000;

/**
 * A worthless placeholder whose only job is to make `hasApiKey` true.
 *
 * Named so that a reader, a grep, and a secret scanner all reach the same
 * conclusion in one look.
 */
const FIXTURE_KEY = 'fixture-not-a-real-key';

async function armLiveRoute(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    (globalThis as { process?: { env: Record<string, string> } }).process = {
      env: { ANTHROPIC_API_KEY: key },
    };
  }, FIXTURE_KEY);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
  return errors;
}

test('T-11: a hung AI call does not block the capture that was already made', async ({
  page,
  app,
}) => {
  const errors = collectPageErrors(page);
  const hung = await hangEverythingOffOrigin(page, app.origin);
  await armLiveRoute(page);
  const v = (id: string) => visibleTestId(page, id);

  await openApp(page, app.origin);
  await keepWord(page, '分岐');

  await v('capture-open-word').click();
  await expect(v('screen-word')).toBeVisible();

  // The baseline is read after the word-page press: that press is a real
  // lookup and legitimately appends one `LookupFrictionLogged` (T-07, RENKAN
  // R2-X), which is the learner's gesture and not the AI call's doing. The
  // poll lets that asynchronous durable append settle (capture + promotion +
  // lookup = 3), so the comparison below measures the hung request alone.
  await expect.poll(async () => durableEventCount(page)).toBe(3);
  const eventsAfterCapture = await durableEventCount(page);
  expect(eventsAfterCapture).toBeGreaterThan(0);

  const askedAt = Date.now();
  await v('candidate-request').click();

  // The request really did leave for the provider — otherwise everything below
  // would be measuring the no-key short circuit under a different name.
  await expect.poll(() => hung.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(hung.some((url) => url.includes('api.anthropic.com'))).toBe(true);

  // While the call hangs, the page is still a page: the panel is in its loading
  // state and the rest of the screen still answers. "Not blocked" has to be
  // demonstrated *during* the hang, not inferred after it.
  await expect(v('state-loading')).toBeVisible();
  await expect(v('word-headword')).toBeVisible();
  expect(Date.now() - askedAt).toBeLessThan(RUNTIME_TIMEOUT_MS);

  // The capture made before the call is untouched while the call is in flight.
  expect(await durableEventCount(page)).toBe(eventsAfterCapture);

  // And the call ends by itself, on the runtime's own budget, in a labelled
  // fallback — not in a spinner that outlives the sitting.
  await expect(v('candidate-card')).toBeVisible({ timeout: RUNTIME_TIMEOUT_MS + 20_000 });
  const settledMs = Date.now() - askedAt;
  await expect(v('candidate-label')).toHaveText('AI candidate / generated');
  await expect(v('candidate-fallback-label')).toHaveText('offline-fallback');
  await expect(v('candidate-standing-note')).toContainText('unavailable or timed out');

  expect(
    settledMs,
    'the request settled before the runtime timeout could have fired, so this test did not ' +
      'exercise the timeout it claims to',
  ).toBeGreaterThanOrEqual(RUNTIME_TIMEOUT_MS - 1_000);

  // Nothing was lost, and the capture is still exactly where the learner left it.
  expect(await durableEventCount(page)).toBeGreaterThanOrEqual(eventsAfterCapture);
  await v('nav-capture').click();
  await onCaptureScreen(page);
  expect(await keptThreadCount(page)).toBe(1);

  expect(errors).toEqual([]);
});

test('T-11: a capture made while a call hangs is acknowledged and kept', async ({ page, app }) => {
  const errors = collectPageErrors(page);
  await hangEverythingOffOrigin(page, app.origin);
  await armLiveRoute(page);
  const v = (id: string) => visibleTestId(page, id);

  await openApp(page, app.origin);
  await keepWord(page, '分岐');

  await v('capture-open-word').click();
  await expect(v('screen-word')).toBeVisible();
  await v('candidate-request').click();
  await expect(v('state-loading')).toBeVisible();

  // Leave the page mid-flight, which is what a learner who wanted to write
  // something down would do. The hook aborts on unmount by design; the question
  // is whether the capture screen is usable straight away or whether it waits
  // out somebody else's network.
  const leftAt = Date.now();
  await v('nav-capture').click();
  await onCaptureScreen(page);
  const ack = await keepWord(page, '岐');
  const capturedByMs = Date.now() - leftAt;

  expect(ack).toContain('Kept');
  expect(await keptThreadCount(page)).toBe(2);
  expect(
    capturedByMs,
    'navigating away from a hung AI call and capturing again should not wait on the timeout',
  ).toBeLessThan(RUNTIME_TIMEOUT_MS);

  expect(errors).toEqual([]);
});

test('T-11: reloading mid-flight loses no capture and writes nothing unlabelled', async ({
  page,
  app,
}) => {
  const errors = collectPageErrors(page);
  await hangEverythingOffOrigin(page, app.origin);
  await armLiveRoute(page);
  const v = (id: string) => visibleTestId(page, id);

  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  const eventsBefore = await durableEventCount(page);

  await v('capture-open-word').click();
  await expect(v('screen-word')).toBeVisible();
  await v('candidate-request').click();
  await expect(v('state-loading')).toBeVisible();

  // Kill the tab's document out from under the in-flight request. The reload
  // lands back on the word page, because that is where the learner was.
  await page.reload({ waitUntil: 'load' });
  await hydrated(page);
  await expect(v('screen-word')).toBeVisible();

  // Nothing was lost. Stated as "never shrank" rather than "is exactly what it
  // was", because tearing the document down *does* let one more event land —
  // finding T3-3, asserted precisely in `adv-known-defects.spec.ts`. The
  // invariant this lane owns is that the loss direction stays empty.
  expect(
    await durableEventCount(page),
    'the durable log lost events when the document was torn down mid-request',
  ).toBeGreaterThanOrEqual(eventsBefore);

  // Whatever the teardown wrote, it is labelled. This is the safety property
  // that has to hold whether or not T3-3 is fixed: no unlabelled generated
  // content may enter the record by any path (REQ-AI-02, T-12).
  for (const attached of await candidateEvents(page)) {
    expect(
      attached.envelope.provider,
      'a candidate reached the log without the offline-fallback provider label',
    ).toBe('offline-fallback');
    expect(
      attached.status,
      'a candidate reached the log already accepted, with no user action behind it',
    ).toBe('generated');
  }

  // The panel is back at "ask": candidate *text* is deliberately not durable
  // (`memory-store.ts` rehydrate note), so an empty panel is the honest state.
  await expect(v('candidate-request')).toBeVisible();
  expect(await page.getByTestId('candidate-card').count()).toBe(0);

  // And the capture is still there, on the screen that owns it.
  await v('nav-capture').click();
  await onCaptureScreen(page);
  expect(await keptThreadCount(page)).toBe(1);

  expect(errors).toEqual([]);
});
