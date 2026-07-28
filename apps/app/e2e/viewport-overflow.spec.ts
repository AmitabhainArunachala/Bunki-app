/**
 * No route scrolls sideways on a phone.
 *
 * ## The defect, measured
 *
 * On the merged Campaign E branch, in Chromium at 390 × 844 — an iPhone 14's CSS
 * width — every route reported:
 *
 * ```
 *   /  /map  /guide  /journey  /read  /session  /evidence  /debug  /canvas  /repair
 *   scrollWidth = 699   clientWidth = 390   →   309 px of horizontal overflow
 * ```
 *
 * Seven lanes shipped it because nothing in the suite measured it. Sixty-four
 * end-to-end cases ran at 1100 × 1400, where 699 fits, and every unit test in
 * the project reads source rather than layout. A defect that is invisible at the
 * viewport the tests use is a defect the tests cannot have.
 *
 * ## What this asserts, and why it is `documentElement`
 *
 * `document.documentElement.scrollWidth <= clientWidth`, per route, at two
 * widths. That is the property a person experiences: the page does not move
 * under the thumb. It is measured on the root rather than on the body or on a
 * container, because the root is what the browser gives a horizontal scrollbar
 * to, and a container that overflows inside its own `overflow: auto` is
 * *allowed* — a wide table or a diagram scrolling inside its own box is a
 * deliberate affordance. The rule is that the page body never does.
 *
 * ## Two widths, both real
 *
 * **390** is the iPhone 12/13/14/15 CSS width and the operator's device class.
 * **360** is the narrowest width in common use — Android's most frequent
 * viewport, and what an iPhone SE gives at its larger text setting. A layout
 * that passes at 390 and fails at 360 has a fixed width in it somewhere, which
 * is exactly the defect class this file exists for, so both are checked rather
 * than one.
 *
 * ## Why it reports the offender
 *
 * A bare `expect(scrollWidth).toBeLessThanOrEqual(clientWidth)` says the page is
 * too wide and nothing else, and the last time this was diagnosed it took a
 * browser session to find which element. The failure message names the widest
 * elements crossing the right edge, with their test ids, so the next reader gets
 * the answer rather than the symptom.
 */

import { DESTINATIONS } from '../src/ui/navigation.ts';

import { expect, test, hydrated, openApp } from './support/adv-harness.ts';
import type { Page } from '@playwright/test';

/**
 * Concrete params for dynamic routes, so the sweep visits them rather than
 * skipping them.
 *
 * 分 is in the shipped dictionary and is the seed's canonical target's first
 * character; `lex-bunki` is that target. Both are the same fixtures the a11y
 * sweep uses, deliberately — two sweeps disagreeing about which word to test is
 * a way for one of them to be walking a page the other never sees.
 */
const ROUTE_PARAMS: Readonly<Record<string, readonly string[]>> = {
  '/word/[lexemeId]': ['/word/lex-bunki'],
  '/kanji/[character]': ['/kanji/%E5%88%86'],
};

const ROUTES: readonly string[] = DESTINATIONS.flatMap((destination) => {
  if (!destination.href.includes('[')) return [destination.href];
  const params = ROUTE_PARAMS[destination.href];
  if (params === undefined || params.length === 0) {
    // Thrown at module load, so the whole file goes red rather than one route
    // being quietly skipped — which is how the original defect survived.
    throw new Error(
      `viewport-overflow: dynamic route ${destination.href} has no entry in ROUTE_PARAMS; ` +
        'add one so the sweep measures it.',
    );
  }
  return [...params];
});

/** The viewports a phone actually has. */
const PHONE_WIDTHS = [390, 360] as const;

interface Overflow {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly offenders: readonly string[];
}

/**
 * Measure the root, and name what crosses the right edge.
 *
 * `right > clientWidth + 1` rather than `> clientWidth`: sub-pixel layout
 * rounding puts elements a fraction of a point past the edge routinely, and a
 * test that failed on 0.4 px would be noise. One whole CSS pixel is the
 * tolerance; the defect this file was written for was 309 of them.
 */
async function measure(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const limit = root.clientWidth;
    const offenders: { text: string; width: number }[] = [];
    for (const element of Array.from(document.querySelectorAll('*'))) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.right <= limit + 1 && box.left >= -1) continue;
      // Skip an element whose overflow is inherited from an ancestor that is
      // already listed: the useful answer is the outermost thing that is too
      // wide, not the fifty spans inside it.
      const parent = element.parentElement;
      if (parent !== null) {
        const parentBox = parent.getBoundingClientRect();
        if (parentBox.right > limit + 1 || parentBox.left < -1) continue;
      }
      const id = element.getAttribute('data-testid') ?? '';
      const label = id === '' ? element.tagName.toLowerCase() : `[${id}]`;
      offenders.push({
        text: `${label} ${Math.round(box.left)}…${Math.round(box.right)} (w=${Math.round(box.width)})`,
        width: box.width,
      });
    }
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: limit,
      offenders: offenders
        .sort((a, b) => b.width - a.width)
        .slice(0, 6)
        .map((entry) => entry.text),
    };
  });
}

for (const width of PHONE_WIDTHS) {
  test(`no route overflows horizontally at ${String(width)} CSS px`, async ({ page, app }) => {
    await page.setViewportSize({ width, height: 844 });

    const failures: string[] = [];
    for (const route of ROUTES) {
      await openApp(page, app.origin, route);
      await hydrated(page);
      // The shell is present before a screen's own data resolves, and the shell
      // is what overflowed. Waiting for the screen as well means the measurement
      // is of a settled page rather than of a loading panel.
      await page.waitForTimeout(400);

      const result = await measure(page);
      if (result.scrollWidth > result.clientWidth) {
        failures.push(
          `${route}: scrollWidth=${String(result.scrollWidth)} clientWidth=${String(
            result.clientWidth,
          )} (+${String(result.scrollWidth - result.clientWidth)}px)\n` +
            result.offenders.map((line) => `      ${line}`).join('\n'),
        );
      }
    }

    expect(failures, 'these routes scroll sideways on a phone:\n' + failures.join('\n')).toEqual(
      [],
    );
  });
}

/**
 * The measurement is capable of failing.
 *
 * Without this, `measure` could be quietly loosened — or the page could stop
 * loading altogether — and every assertion above would pass on an empty
 * document. A deliberately over-wide element is injected, measured, and removed.
 */
test('the overflow measurement catches an element that is too wide', async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, app.origin, '/');
  await hydrated(page);

  const clean = await measure(page);
  expect(clean.scrollWidth, 'the front door is already overflowing').toBeLessThanOrEqual(
    clean.clientWidth,
  );

  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'overflow-probe';
    probe.setAttribute('data-testid', 'overflow-probe');
    probe.style.cssText = 'width:900px;height:8px;background:transparent';
    document.body.append(probe);
  });

  const dirty = await measure(page);
  expect(dirty.scrollWidth, 'a 900 px element did not widen the page').toBeGreaterThan(
    dirty.clientWidth,
  );
  expect(dirty.offenders.join(' '), 'the offender was not named').toContain('overflow-probe');

  await page.evaluate(() => document.getElementById('overflow-probe')?.remove());
});
