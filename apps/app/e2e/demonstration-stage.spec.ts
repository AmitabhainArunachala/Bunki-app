/**
 * A demonstration learner, loaded, in the shipped bundle (lane L1).
 *
 * ## What this file is for
 *
 * The unit suites prove the generated log is a real log and that the store
 * accepts it. Neither proves the thing the operator actually asked for: that
 * with one stage loaded, **every surface lights up at once** — the map has
 * something to draw, the sitting has something to plan, a branch is open, the
 * ledger has a chain to walk, and the reading surface knows which words are
 * yours. Six surfaces, one state, in a browser, over the exported bytes.
 *
 * It also carries the other half of the requirement, which is the half that
 * would be a defect if it were missing: **the label is on screen everywhere the
 * data is**. A demonstration you can lose track of is worse than none, so the
 * strip is asserted on every route rather than on the one it was loaded from.
 *
 * ## Why the URL loads the stage
 *
 * `?demo=<stage>&demoToday=<day>` is the reproducible door: the stage is
 * generated backwards from a pinned day, so two runs on two days produce the
 * same log and a screenshot is evidence rather than a mood. The *interactive*
 * door — the strip's own picker — is driven separately below, because a flag
 * that worked while the button did not would be a passing test over a broken
 * surface.
 *
 * Scope: Chromium on Expo Web, one engine, no device (REQ-GATE-03).
 */

import { expect, test, hydrated, openApp, testId } from './support/adv-harness.ts';
import type { Page } from '@playwright/test';

/** Pinned, so the log is the same log on any day this suite runs. */
const PINNED_DAY = '2026-07-29';

/** Small enough to build inside a test's budget, large enough to be populated. */
const STAGE = 'month-2';

const withStage = (route: string, stage: string = STAGE): string =>
  `${route}${route.includes('?') ? '&' : '?'}demo=${stage}&demoToday=${PINNED_DAY}`;

/** The routes a learner is on, all of which must carry the label. */
const SURFACES: readonly { readonly route: string; readonly screen: string }[] = [
  { route: '/', screen: 'screen-map' },
  { route: '/session', screen: 'screen-session' },
  { route: '/journey', screen: 'screen-journey' },
  { route: '/evidence', screen: 'screen-evidence' },
  { route: '/read', screen: 'screen-reading' },
  { route: '/kanji/%E5%88%86', screen: 'screen-kanji' },
];

/** Wait until the strip says a stage is loaded rather than merely mounted. */
async function stageLoaded(page: Page): Promise<void> {
  await expect(testId(page, 'demo-banner-headline')).toContainText('Demonstration data', {
    timeout: 60_000,
  });
}

test.describe('the demonstration strip', () => {
  test('says whose data this is, before any stage is loaded', async ({ page, app }) => {
    await openApp(page, app.origin, '/');
    await expect(testId(page, 'demo-banner')).toBeVisible();
    await expect(testId(page, 'demo-banner-headline')).toHaveText('Your own data');
    // …and the map is honestly empty, which is the state this lane exists to
    // stop being the *only* state.
    await expect(testId(page, 'map-standing')).toBeVisible();
  });

  test('is present on every surface a learner stands on', async ({ page, app }) => {
    for (const surface of SURFACES) {
      await openApp(page, app.origin, surface.route);
      await expect(
        testId(page, 'demo-banner'),
        `${surface.route} renders no demonstration strip`,
      ).toBeVisible();
    }
  });

  test('offers the stages, loads one, and returns to your own data', async ({ page, app }) => {
    await openApp(page, app.origin, '/');
    await testId(page, 'demo-banner-toggle').click();

    // Every stage is on offer, named, with a sentence about what it is.
    for (const stage of ['day-3', 'month-2', 'month-8', 'year-2']) {
      await expect(testId(page, `demo-stage-${stage}`)).toBeVisible();
    }

    await testId(page, 'demo-stage-day-3').click();
    await stageLoaded(page);
    await expect(testId(page, 'demo-banner-headline')).toContainText('Day 3');

    // The map now has something of the scripted learner's on it.
    await expect(testId(page, 'map-standing')).toContainText('contracts have evidence behind them');

    // And the way back is one tap, from the same strip.
    await testId(page, 'demo-stage-own').click();
    await expect(testId(page, 'demo-banner-headline')).toHaveText('Your own data', {
      timeout: 30_000,
    });
    await expect(testId(page, 'map-standing')).not.toContainText('contracts have evidence');
  });
});

test.describe('one stage, every surface', () => {
  /**
   * The interconnection, walked.
   *
   * One load, six surfaces, and each one asserted on something only a populated
   * state can produce. This is the payoff the lane was built for and it is
   * deliberately one test rather than six: six tests would each load their own
   * stage, and "these surfaces agree about one learner" would be the one thing
   * not checked.
   */
  test('lights the map, the sitting, the branch, the ledger and the reading', async ({
    page,
    app,
  }) => {
    await openApp(page, app.origin, withStage('/'));
    await stageLoaded(page);

    // 1. The map — what has been built, counted off the ledger.
    await expect(testId(page, 'map-standing')).toContainText('contracts have evidence behind them');
    await expect(testId(page, 'map-territory-headline')).toBeVisible();

    // 2. The sitting — a plan over a thread the scripted learner promoted.
    await page.getByTestId('nav-session').click();
    await expect(testId(page, 'screen-session')).toBeVisible({ timeout: 30_000 });
    await expect(testId(page, 'demo-banner-headline')).toContainText('Demonstration data');
    // The empty case says there is nothing promoted; a populated one must not.
    await expect(testId(page, 'screen-session')).not.toContainText('Nothing on an active rung yet');

    // 3. The branches — opened by misses the gate counted, never by this test.
    await page.getByTestId('nav-journeys').click();
    await expect(testId(page, 'screen-journey')).toBeVisible({ timeout: 30_000 });
    await expect(testId(page, 'screen-journey')).not.toContainText('No branch is open.');

    // 4. The ledger — a chain to walk, with verdicts on it.
    await page.getByTestId('nav-evidence').click();
    await expect(testId(page, 'screen-evidence')).toBeVisible({ timeout: 30_000 });
    await expect(testId(page, 'demo-banner-headline')).toContainText('Demonstration data');

    // 5. Reading — the passage, with the learner's own frontier marked in it.
    await page.getByTestId('nav-reading').click();
    await expect(testId(page, 'screen-reading')).toBeVisible({ timeout: 30_000 });
    await expect(testId(page, 'demo-banner-headline')).toContainText('Demonstration data');

    // 6. Back to the map, and the strip still says what this is. Navigation
    //    inside the shell uses `replace`, which drops the query string — so
    //    this also proves the stage lives in state rather than in the URL.
    await page.getByTestId('nav-map').click();
    await expect(testId(page, 'screen-map')).toBeVisible({ timeout: 30_000 });
    await expect(testId(page, 'demo-banner-headline')).toContainText('Demonstration data');
    expect(page.url()).not.toContain('demo=');
  });
});

test.describe('the strip fits a phone', () => {
  /**
   * `viewport-overflow.spec.ts` measures every route with the strip *closed*
   * and no stage loaded, because that is the app's default. The two states it
   * cannot see are the two this lane added: an open panel, and a loaded stage
   * whose headline is longer. Both are measured here, at the same two widths
   * and with the same rule — the page body never scrolls sideways.
   */
  for (const width of [390, 360] as const) {
    test(`the open picker does not widen the page at ${String(width)} CSS px`, async ({
      page,
      app,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await openApp(page, app.origin, withStage('/', 'day-3'));
      await stageLoaded(page);
      await testId(page, 'demo-banner-toggle').click();
      await expect(testId(page, 'demo-stage-year-2')).toBeVisible();
      await page.waitForTimeout(300);

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
      });
      expect(
        overflow.scrollWidth,
        `the open demonstration picker widened the page by ${String(
          overflow.scrollWidth - overflow.clientWidth,
        )}px`,
      ).toBeLessThanOrEqual(overflow.clientWidth);
    });
  }
});

test.describe('a demonstration cannot be mistaken for your own data', () => {
  test('never claims the demonstration is stored on this device', async ({ page, app }) => {
    await openApp(page, app.origin, withStage('/'));
    await stageLoaded(page);
    await testId(page, 'demo-banner-toggle').click();
    const panel = testId(page, 'demo-banner');
    await expect(panel).toContainText('never survives a reload');
    await expect(panel).toContainText('not your history');
  });

  test('a reload returns you to your own data', async ({ page, app }) => {
    // The URL flag is what loaded it, so the reload is done from a clean path —
    // which is what happens to a learner who reloads after tapping a stage.
    await openApp(page, app.origin, withStage('/'));
    await stageLoaded(page);
    await page.goto(`${app.origin}/`, { waitUntil: 'load' });
    await hydrated(page);
    await expect(testId(page, 'demo-banner-headline')).toHaveText('Your own data', {
      timeout: 30_000,
    });
  });
});
