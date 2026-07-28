/**
 * What the app costs on a phone-sized viewport, and what reduced motion does.
 *
 * ## Why the numbers are here rather than in a unit test
 *
 * `test/map-performance.test.ts` measures the domain's own work in Node —
 * atlas build, projection, layout — and is careful to say those are build-machine
 * numbers rather than device numbers. What it cannot measure is the part a
 * learner actually waits for: a cold bundle parsing, React mounting, a
 * 3,016-lexeme corpus being indexed, and a phone-width layout resolving. That is
 * a browser number and it needs a browser.
 *
 * Every figure below is printed to the run log, with its viewport, so it can be
 * read rather than only asserted. **Chromium on a Linux build machine at
 * 390 × 844 is not an iPhone**, and nothing here should be quoted as one; it is
 * a floor and an order-of-magnitude regression alarm, which is what the map lane
 * needed after A2's "the scrubber rebuilt the whole index on every frame"
 * defect passed every correctness test it had.
 *
 * The ceilings are deliberately loose, for the reason a tight one is worse than
 * none: a timing assertion that fails on a loaded runner gets deleted, and then
 * nothing is measured at all.
 *
 * ## Reduced motion: stopped, not shortened
 *
 * The fractal-dive document is explicit that `prefers-reduced-motion` must yield
 * a *stepped* dive — "discrete level transitions, no flight" — and calls it
 * non-negotiable. "Shortened" is the failure that looks like compliance: a 60 ms
 * animation still animates, still moves under a vestibular trigger, and still
 * reports as a running animation.
 *
 * So the assertion samples what the dive's canvas actually looks like over a
 * window of frames after a zoom: under `reduce` it must take exactly **one**
 * value, because a stepped transition has already landed. See {@link styleValues}
 * for why the obvious instrument — `document.getAnimations()` — is the wrong one
 * here, and for the negative probe that caught it being wrong.
 */

import { expect, test, live } from './support/app.ts';
import type { Page } from '@playwright/test';

const v = (page: Page, id: string) => live(page, id);

/** iPhone 12/13/14/15 CSS width, and the operator's device class. */
const PHONE = { width: 390, height: 844 } as const;

/** Milliseconds, from `performance.now()` in the page. */
async function timed(page: Page, body: () => Promise<void>): Promise<number> {
  const started = await page.evaluate(() => performance.now());
  await body();
  const finished = await page.evaluate(() => performance.now());
  return Math.round(finished - started);
}

/**
 * How many distinct values a property took over a window of frames.
 *
 * ## Why not `document.getAnimations()`
 *
 * That was the first instrument and the negative probe at the bottom of this
 * file caught it: with motion *allowed*, on the dive, `getAnimations()` returned
 * an empty list. React Native's `Animated` on web drives inline styles from
 * `requestAnimationFrame`; it authors no CSS animation and no Web Animations
 * object, so the compositor has nothing to report. Every reduced-motion
 * assertion written against it would have passed on a page that was animating
 * freely — a green check on a claim that was measuring nothing.
 *
 * Sampling the computed style over frames measures what actually moves,
 * whatever drives it. One distinct value across the window means the element
 * landed and stayed: motion **stopped**. Two or more means it moved, and a
 * *shortened* animation is caught by exactly the same test, because a 60 ms
 * transition still produces more than one value.
 */
async function styleValues(
  page: Page,
  testId: string,
  properties: readonly string[],
  windowMs: number,
): Promise<readonly string[]> {
  return page.evaluate(
    async ({ testId: id, properties: props, windowMs: span }) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (element === null) return [];
      const seen = new Set<string>();
      const deadline = performance.now() + span;
      while (performance.now() < deadline) {
        const style = getComputedStyle(element);
        seen.add(props.map((property) => style.getPropertyValue(property)).join('|'));
        await new Promise((resolve) => {
          requestAnimationFrame(() => resolve(null));
        });
      }
      return [...seen];
    },
    { testId, properties: [...properties], windowMs },
  );
}

/** The properties the dive's flight actually moves. */
const FLIGHT_PROPERTIES = ['transform', 'opacity'] as const;

test('the map opens on a phone viewport at the full shipped tier', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize(PHONE);

  const started = Date.now();
  await page.goto(`${app.baseUrl}/`);
  // "Interactive" is the first moment the learner can act on the thing they came
  // for: the country panel is populated, which means the atlas is built and the
  // whole-corpus era census has run.
  await v(page, 'map-territory-headline').waitFor({ timeout: 60_000 });
  const cold = Date.now() - started;

  const headline = await v(page, 'map-territory-headline').innerText();
  // Non-vacuity: this is the full tier, not a stub. If the corpus shrinks, the
  // number below stops being a measurement of the thing it claims to measure.
  expect(headline, `the map opened on a corpus this small: ${headline}`).toMatch(/3,\d{3} words/);

  const lens = await timed(page, async () => {
    await v(page, 'map-lens-row').getByRole('button').nth(1).click();
    await page.waitForTimeout(0);
  });

  const scrub = await timed(page, async () => {
    const step = page.getByTestId(/^map-scrubber/).locator('visible=true');
    const buttons = await step.count();
    if (buttons > 1) await step.nth(1).click();
    await page.waitForTimeout(0);
  });

  console.log(
    `[phone] map @ ${String(PHONE.width)}×${String(PHONE.height)}: cold-to-interactive ${String(
      cold,
    )}ms (${headline.replace(/\s+/g, ' ')}), lens change ${String(lens)}ms, scrubber step ${String(
      scrub,
    )}ms`,
  );

  // Order-of-magnitude alarms, not targets.
  expect(cold, 'the map took over 20s to become interactive on a phone viewport').toBeLessThan(
    20_000,
  );
  expect(lens, 'a lens change took over 3s').toBeLessThan(3_000);
});

test('the dive opens and zooms on a phone viewport', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize(PHONE);

  const started = Date.now();
  await page.goto(`${app.baseUrl}/kanji/${encodeURIComponent('分')}`);
  await v(page, 'dive-centre-card-glyph').waitFor({ timeout: 60_000 });
  const cold = Date.now() - started;

  const zoom = await timed(page, async () => {
    const inward = page
      .getByTestId(/^kanji-component-/)
      .locator('visible=true')
      .first();
    await inward.click();
    await v(page, 'dive-back').waitFor();
  });

  const out = await timed(page, async () => {
    await v(page, 'dive-surface').click();
    await v(page, 'dive-at-surface').waitFor();
  });

  console.log(
    `[phone] dive @ ${String(PHONE.width)}×${String(PHONE.height)}: cold-to-centre ${String(
      cold,
    )}ms, zoom in ${String(zoom)}ms, surface ${String(out)}ms`,
  );

  expect(cold, 'the dive took over 20s to draw its centre on a phone viewport').toBeLessThan(
    20_000,
  );
  expect(zoom, 'a dive zoom took over 3s').toBeLessThan(3_000);
});

test('the dive stops under prefers-reduced-motion — it is not merely shortened', async ({
  app,
  browser,
}) => {
  // A fresh context, because `reducedMotion` is a context-level emulation and
  // the shared fixture's context is not built with it.
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: PHONE });
  try {
    const page = await context.newPage();
    await page.goto(`${app.baseUrl}/kanji/${encodeURIComponent('分')}`);
    await v(page, 'dive-centre-card-glyph').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1_000);

    // The zoom, sampled from the frame the press lands on. Under reduction the
    // transition is a *step*, so the canvas is already where it is going.
    await page
      .getByTestId(/^kanji-component-/)
      .locator('visible=true')
      .first()
      .click();
    const flight = await styleValues(page, 'dive-canvas', FLIGHT_PROPERTIES, 900);

    expect(flight.length, 'the dive canvas was not found, so nothing was sampled').toBeGreaterThan(
      0,
    );
    expect(
      flight,
      'the dive flew under prefers-reduced-motion. Stepped means one value, not a short ' +
        `animation; these were sampled across 900ms:\n${flight.join('\n')}`,
    ).toHaveLength(1);

    // The chrome says where you are and how to get out, which is the other half
    // of the dive document's reduced-motion requirement.
    await expect(v(page, 'dive-back')).toBeVisible();
    await expect(v(page, 'dive-ladder')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('the reduced-motion check can see the dive move when motion is allowed', async ({
  app,
  browser,
}) => {
  // The negative probe, and it has already earned its place once: it is what
  // caught `document.getAnimations()` reporting nothing on a page that was
  // animating, which would have made every assertion above vacuous.
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: PHONE });
  try {
    const page = await context.newPage();
    await page.goto(`${app.baseUrl}/kanji/${encodeURIComponent('分')}`);
    await v(page, 'dive-centre-card-glyph').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1_000);

    await page
      .getByTestId(/^kanji-component-/)
      .locator('visible=true')
      .first()
      .click();
    const flight = await styleValues(page, 'dive-canvas', FLIGHT_PROPERTIES, 900);

    expect(
      flight.length,
      'the dive canvas showed one value with motion allowed, so the reduced-motion assertion ' +
        'above is measuring nothing — re-read it before trusting it',
    ).toBeGreaterThan(1);
  } finally {
    await context.close();
  }
});
