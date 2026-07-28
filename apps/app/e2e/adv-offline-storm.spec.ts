/**
 * T3 — offline storm (controller §17.2; T-10 at app level).
 *
 * The requirement: **capture, lookup, review and export work with AI
 * unavailable.** These tests make "unavailable" mean the strongest thing this
 * runtime allows — every request that leaves the origin is aborted at the
 * browser boundary — and then run the operator's own acceptance script through
 * it (definition-of-done §3 steps 1–9) against the exported bundle.
 *
 * ## Why "zero requests attempted" is the assertion, not "it degraded well"
 *
 * On the Phase-0 web target there is no `process`, so `@bunki/ai` finds no key
 * and takes the labelled fallback route *before* reaching a transport
 * (`packages/ai/src/platform.ts`, `provider/anthropic.ts`). That makes a much
 * stronger statement available than "it survived the network being down": the
 * shipped bundle does not touch the network at all. Asserting the blocked list
 * is empty is what turns REQ-AI-03 — a secret never enters a client bundle —
 * into something a reviewer can watch fail if it ever stops being true.
 *
 * It also means the *live* AI route is not exercised here, and nothing in this
 * file may be read as evidence that it was. That gap is the definition-of-done's
 * comes-up-short item 3, it is owned by OD-08, and `adv-ai-timeout-storm.spec.ts`
 * is the only file in this lane that drives the transport at all.
 *
 * ## Scope, stated rather than implied
 *
 * Chromium on Expo Web, one engine, one platform (REQ-GATE-03). Nothing here is
 * evidence about native (WP-11), about a real radio dropping, or about a
 * provider outage in production.
 */

import type { Page } from '@playwright/test';

import {
  expect,
  test,
  openApp,
  onCaptureScreen,
  keepWord,
  keptThreadCount,
  takeUpForStudy,
  runSessionToCompletion,
  exportAndVerify,
  durableEventCount,
  expectDurableStoreFound,
  blockEverythingOffOrigin,
  visibleTestId,
} from './support/adv-harness.ts';

/**
 * Collect uncaught page errors.
 *
 * Asserted at the end of every test in this file, because the failure mode a
 * severed network actually produces is not a red screen — it is a component
 * that threw during an effect and left a calm-looking, dead surface behind.
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
  return errors;
}

const NO_EGRESS =
  'The exported web bundle attempted to leave the origin. On this target there is no API key, ' +
  'so `@bunki/ai` should never reach a transport at all (REQ-AI-03); a URL here is a finding ' +
  'about what the client sends, not a flaky test.';

test('T-10: the whole loop runs with every off-origin request severed', async ({ page, app }) => {
  const blocked = await blockEverythingOffOrigin(page, app.origin);
  const errors = collectPageErrors(page);
  const v = (id: string) => visibleTestId(page, id);

  // 1. Capture — definition-of-done §3.1.
  await openApp(page, app.origin);
  expect(await keepWord(page, '分岐')).toContain('Kept — 分岐');
  expect(await keptThreadCount(page)).toBe(1);

  // 2. Lookup — the word page, and through it a kanji page. Both are seed
  //    reads; neither may need a network to answer.
  await v('capture-open-word').click();
  await expect(v('screen-word')).toBeVisible();
  await expect(v('word-headword')).toBeVisible();
  await expect(v('seed-entry-disclosure')).toBeVisible();

  await page
    .getByTestId(/^word-kanji-/)
    .locator('visible=true')
    .first()
    .click();
  await expect(v('screen-kanji')).toBeVisible();
  // `kanji-layer-0` until lane B2: the character page's hero block was one of
  // four numbered "layers". The page is the fractal dive stopped at the
  // character level now, so the specimen in the middle is `dive-centre` and
  // there are no layers to be zero of. The assertion is unchanged in substance —
  // the character page rendered its specimen with the network severed.
  await expect(v('dive-centre')).toBeVisible();

  // 3. Promote — §3.3, by hand from the capture screen, as the learner would.
  await v('nav-capture').click();
  await onCaptureScreen(page);
  await takeUpForStudy(page);

  // 4. Review to the explicit end screen — §3.4 and §3.6.
  await v('nav-session').click();
  expect(await runSessionToCompletion(page)).not.toBe('');

  // 5. Export and verify — §3.8.
  await v('nav-evidence').click();
  await expect(v('screen-evidence')).toBeVisible();
  expect(await exportAndVerify(page)).toContain('Replay check passed');

  // 6. Inspect — §3.9. The chain sits behind the inspector's progressive
  //    disclosure, so it has to be opened; a test that only asserted the
  //    collapsed summary would never look at the evidence.
  await v('evidence-disclosure').click();
  await expect(v('evidence-chain')).toBeVisible();
  await expect(v('evidence-state-changes')).toContainText('learn');
  await expectDurableStoreFound(page);
  expect(await durableEventCount(page)).toBeGreaterThan(0);

  expect(errors, 'the page threw while the network was severed').toEqual([]);
  expect(blocked, NO_EGRESS).toEqual([]);
});

test('T-10: asking for a note with no network yields a labelled fallback, not a hang', async ({
  page,
  app,
}) => {
  const blocked = await blockEverythingOffOrigin(page, app.origin);
  const errors = collectPageErrors(page);
  const v = (id: string) => visibleTestId(page, id);

  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await v('capture-open-word').click();
  await expect(v('screen-word')).toBeVisible();

  const startedAt = Date.now();
  await v('candidate-request').click();
  await expect(v('candidate-card')).toBeVisible();
  const elapsedMs = Date.now() - startedAt;

  // Both badges, and both of them text rather than colour. The offline route is
  // the one that adds the second badge, so this is where its presence is
  // checked rather than assumed.
  await expect(v('candidate-label')).toHaveText('AI candidate / generated');
  await expect(v('candidate-fallback-label')).toHaveText('offline-fallback');
  await expect(v('candidate-origin')).toContainText('offline-fallback');
  await expect(v('candidate-standing-note')).toContainText('not from a live model');

  // No key means no transport, so the answer is immediate. If this ever takes
  // as long as the runtime's 10 s timeout, something began waiting on a network
  // that was never going to answer.
  expect(
    elapsedMs,
    'the no-key fallback should not be waiting out a timeout it never started',
  ).toBeLessThan(5_000);

  expect(errors).toEqual([]);
  expect(blocked, 'a request was attempted for a candidate with no API key present').toEqual([]);
});

test('T-10: reloading while severed loses nothing', async ({ page, app }) => {
  const blocked = await blockEverythingOffOrigin(page, app.origin);
  const errors = collectPageErrors(page);

  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await takeUpForStudy(page);

  const eventsBefore = await durableEventCount(page);
  const threadsBefore = await keptThreadCount(page);
  expect(eventsBefore).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'load' });
  await onCaptureScreen(page);

  expect(await keptThreadCount(page)).toBe(threadsBefore);
  expect(await durableEventCount(page)).toBe(eventsBefore);
  await expect(visibleTestId(page, 'capture-threads')).toContainText('learn');

  expect(errors).toEqual([]);
  expect(blocked, NO_EGRESS).toEqual([]);
});

test('T-10: with the radio down, capture still acknowledges and the state is labelled', async ({
  page,
  context,
  app,
}) => {
  const errors = collectPageErrors(page);
  const v = (id: string) => visibleTestId(page, id);
  await openApp(page, app.origin);

  // Set *after* load, on purpose: this test is about the app once the radio
  // drops, not about whether a browser can fetch a document it has no route to.
  // The document is already in memory; everything below is local.
  await context.setOffline(true);
  try {
    expect(await keepWord(page, '分岐')).toContain('Kept — 分岐');
    expect(await keptThreadCount(page)).toBe(1);

    await v('capture-open-word').click();
    await expect(v('screen-word')).toBeVisible();

    // REQ-UI-09's offline state: the panel says what asking will do *before*
    // the learner finds out by asking. Its absence would not be a crash, which
    // is exactly why it is asserted rather than assumed.
    await expect(v('candidate-offline-note')).toBeVisible();

    await v('candidate-request').click();
    await expect(v('candidate-card')).toBeVisible();
    await expect(v('candidate-fallback-label')).toHaveText('offline-fallback');
  } finally {
    await context.setOffline(false);
  }

  expect(errors).toEqual([]);
});
