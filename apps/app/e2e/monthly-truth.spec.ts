/** Real-Chromium proof for A2's non-scalar monthly truth route. */

import type { Page } from '@playwright/test';

import { expect, test, openApp, visibleTestId } from './support/adv-harness.ts';

const ROWS = [
  ['recognition', 'Recognition'],
  ['meaning_recall', 'Meaning recall'],
  ['production', 'Production'],
  ['listening', 'Listening'],
  ['kanji_reading', 'Kanji reading'],
  ['writing', 'Writing'],
  ['grammar_discrimination', 'Grammar discrimination'],
  ['source_familiarity_exposure', 'Source familiarity / exposure'],
] as const;

const SIGNAL_GROUPS = ['exposure', 'selfReport', 'lookup', 'ai', 'import'] as const;

async function expectEightSeparateRows(page: Page): Promise<void> {
  await expect(page.getByTestId(/^monthly-row-/)).toHaveCount(ROWS.length);
  for (const [id, title] of ROWS) {
    const row = visibleTestId(page, `monthly-row-${id}`);
    await expect(row).toBeVisible();
    await expect(row.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
}

async function expectNoScalarLeak(page: Page): Promise<void> {
  const screen = visibleTestId(page, 'screen-monthly-truth');
  const text = await screen.innerText();
  expect(text).not.toMatch(/\d+(?:\.\d+)?\s*%/);
  expect(text).not.toMatch(/\b(mastery|proficiency|overall score|ability level)\b/i);
  expect(text).not.toMatch(/\b(score|rank|average|total)\s*[:=]\s*\d/i);
  expect(
    await screen
      .locator(
        '[data-testid*="mastery"], [data-testid*="score"], [data-testid*="rank"], [data-testid*="average"], [data-testid*="total"]',
      )
      .count(),
  ).toBe(0);
}

async function expectNoHiddenTabStop(page: Page): Promise<void> {
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const seen = new Set<string>();
  for (let press = 0; press < 24; press += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (element === null || element === document.body) return null;
      const box = element.getBoundingClientRect();
      return {
        key: `${element.tagName}:${element.getAttribute('data-testid') ?? ''}:${element.getAttribute('aria-label') ?? ''}`,
        hiddenAncestor: element.closest('[aria-hidden="true"]') !== null,
        width: box.width,
        height: box.height,
      };
    });
    if (focused === null || seen.has(focused.key)) break;
    seen.add(focused.key);
    expect(focused.hiddenAncestor, `${focused.key} is inside an aria-hidden route`).toBe(false);
    expect(focused.width, `${focused.key} has no rendered width`).toBeGreaterThan(0);
    expect(focused.height, `${focused.key} has no rendered height`).toBeGreaterThan(0);
  }
  expect(seen.size, 'the monthly route exposed no keyboard stops').toBeGreaterThanOrEqual(5);
}

test('monthly truth switches exact UTC months, survives reload, and keeps unresolved authority visible', async ({
  page,
  app,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-07-31T23:59:59.999Z') });
  await openApp(page, app.origin, '/?scheme=light');

  await visibleTestId(page, 'capture-search-input').fill('分岐');
  await expect(visibleTestId(page, 'capture-top-answer')).toBeVisible();
  await visibleTestId(page, 'capture-mark-meaning').click();
  await visibleTestId(page, 'capture-keep').click();
  await expect(visibleTestId(page, 'capture-acknowledgment')).toBeVisible();

  // Cross the UTC boundary through the same injected runtime clock used by the
  // app's command path. No localStorage seeding or event fabrication occurs.
  await page.clock.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
  await openApp(page, app.origin, '/source?scheme=light');
  await visibleTestId(page, 'golden-source-target').click();
  await expect(visibleTestId(page, 'golden-lookup-panel')).toBeVisible();
  await visibleTestId(page, 'golden-keep').click();
  await expect(visibleTestId(page, 'golden-learn')).toBeEnabled();
  await visibleTestId(page, 'golden-learn').click();
  await expect(visibleTestId(page, 'golden-progress-learn')).toContainText('●');

  await visibleTestId(page, 'nav-monthly-truth').click();
  await expect(visibleTestId(page, 'screen-monthly-truth')).toBeVisible();
  await expectEightSeparateRows(page);
  await expectNoScalarLeak(page);

  for (const kind of SIGNAL_GROUPS) {
    await expect(visibleTestId(page, `monthly-signal-${kind}`)).toBeVisible();
  }
  await expect(visibleTestId(page, 'monthly-signal-lookup')).toContainText('friction only');
  await expect(visibleTestId(page, 'monthly-unresolved')).toContainText(
    'orthography_target_kind_missing',
  );
  await expect(visibleTestId(page, 'monthly-unresolved')).toContainText('capability unmeasured');

  await visibleTestId(page, 'monthly-month-2026-07').click();
  await expect(page).toHaveURL(/\/monthly\?month=2026-07$/);
  await expect(visibleTestId(page, 'screen-monthly-truth')).toContainText(
    '2026-07 · UTC event time',
  );
  await expect(visibleTestId(page, 'monthly-signal-selfReport')).toContainText(
    'uncertainty mark · diagnostic only',
  );
  await page.reload({ waitUntil: 'load' });
  await expect(visibleTestId(page, 'screen-monthly-truth')).toContainText(
    '2026-07 · UTC event time',
  );
  await expect(page).toHaveURL(/\/monthly\?month=2026-07$/);
  await expectNoHiddenTabStop(page);

  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('monthly-light-july.png'),
  });

  await openApp(page, app.origin, '/monthly?month=2026-08&scheme=dark');
  await expect(visibleTestId(page, 'screen-monthly-truth')).toContainText(
    '2026-08 · UTC event time',
  );
  await expectNoScalarLeak(page);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('monthly-dark-august.png'),
  });
});

test('monthly truth keeps an empty month explicit and fits a mobile viewport', async ({
  page,
  app,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-08-09T00:00:00.000Z') });
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, app.origin, '/monthly?month=2026-08&scheme=dark');

  await expectEightSeparateRows(page);
  for (const id of ROWS.slice(0, 7).map(([rowId]) => rowId)) {
    await expect(visibleTestId(page, `monthly-row-${id}`)).toContainText(
      'No classifiable records in this UTC month.',
    );
  }
  for (const kind of SIGNAL_GROUPS) {
    await expect(visibleTestId(page, `monthly-signal-${kind}`)).toBeVisible();
  }
  await expect(visibleTestId(page, 'monthly-unresolved')).toContainText(
    'No unresolved event-to-capability links',
  );
  await expectNoScalarLeak(page);
  await expectNoHiddenTabStop(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(
    overflow,
    'the monthly surface overflows horizontally on a 390px viewport',
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('monthly-dark-mobile-empty.png'),
  });

  await openApp(page, app.origin, '/monthly?month=2026-13&scheme=dark');
  await expect(visibleTestId(page, 'monthly-error')).toContainText('is not a UTC month');
  await expect(page.getByTestId(/^monthly-row-/)).toHaveCount(0);
});
