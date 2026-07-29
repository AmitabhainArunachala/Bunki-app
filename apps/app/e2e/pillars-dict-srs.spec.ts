/**
 * The two pillars, each driven whole in a real browser.
 *
 * ## Why this file exists rather than more unit tests
 *
 * The operator's judgement of the state of the build was that nobody — including
 * the people who built it — could see whether any of it was wired together,
 * because nothing produced a populated state and every surface rendered its
 * empty case. A unit test that calls `bootstrapSessionWorkspace` proves the
 * function; it does not prove that a person with a keyboard can reach it.
 *
 * So both walks here are made of presses and typing against the *shipped
 * bundle*, and each one ends with a screenshot into
 * `docs/build-evidence/pillar-dict-srs/`. Anything the screenshots do not show
 * is reported as not shown.
 *
 * ## The two claims under test
 *
 * **The dictionary, with zero learner state.** Type romaji, get the word. Type a
 * component, get characters built from it. Open the shelves and reach a kanji
 * page by browsing rather than by knowing what to ask for. Nothing on this walk
 * writes an event.
 *
 * **The SRS, with no AI, no passage and no map.** Take three words up for study
 * from three different pages, sit a finite sitting over them, grade through the
 * real gate, and read the standing back. The three words are deliberately words
 * the hand-written passage does not contain, because that was the ceiling: until
 * this lane, 稽古 answered a learner with three promoted words by saying nothing
 * was taken up for study.
 *
 * Scope, stated because the honesty rules require it: Chromium on Expo Web, one
 * engine, one Linux container, desktop and phone widths only. No device, no
 * Safari, no screen reader.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, hydrated, openApp, visibleTestId } from './support/adv-harness.ts';
import type { Page, TestInfo } from '@playwright/test';

const SHOTS = 'docs/build-evidence/pillar-dict-srs';

/** Words the seed's one hand-written passage does not contain. */
const OFF_PASSAGE = ['時間', '学校', '友達'] as const;

function shotPath(testInfo: TestInfo, name: string): string {
  const root = join(testInfo.project.testDir, '..', '..', '..', SHOTS);
  mkdirSync(root, { recursive: true });
  return join(root, `${name}.png`);
}

async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: shotPath(testInfo, name), fullPage: true });
}

/** Type into the dictionary's search box and wait for the answer to settle. */
async function search(page: Page, query: string): Promise<void> {
  const field = visibleTestId(page, 'capture-search-input');
  await field.fill('');
  await field.fill(query);
  await expect(visibleTestId(page, 'capture-top-answer')).toBeVisible({ timeout: 15_000 });
}

/**
 * Take a word up for study from its own word page, in one press.
 *
 * Deliberately *not* through the capture screen's two-rung ladder: this is the
 * one-action door, and driving it here is what shows it reaches `learn` rather
 * than stopping at `keep`.
 */
async function takeUpFromWordPage(page: Page, headword: string): Promise<void> {
  await search(page, headword);
  await visibleTestId(page, 'capture-open-word').click();
  await expect(visibleTestId(page, 'word-take-up')).toBeVisible({ timeout: 15_000 });
  await visibleTestId(page, 'word-take-up').click();
  await expect(visibleTestId(page, 'word-promotion-state')).toHaveText('learn');
}

test.describe('the dictionary, standing alone', () => {
  test('answers romaji, a component, and a browse, with no learner state', async ({
    page,
    app,
  }, testInfo) => {
    await openApp(page, app.origin, '/capture');

    // --- romaji. The door that did not exist.
    await search(page, 'bunki');
    await expect(visibleTestId(page, 'capture-top-headword')).toContainText('分岐');
    await shoot(page, testInfo, 'dict-01-romaji-bunki');

    await search(page, 'jikan');
    await expect(visibleTestId(page, 'capture-top-answer')).toContainText('時間');

    // --- English gloss, which already worked, kept in the walk so the
    //     screenshot set shows every door rather than only the new ones.
    await search(page, 'branching');
    await expect(visibleTestId(page, 'capture-top-answer')).toBeVisible();

    // --- a component. 氵 is an element of many characters and is not one of
    //     them, so every row here is reached by decomposition.
    await search(page, '氵');
    await expect(visibleTestId(page, 'capture-other-results')).toBeVisible();
    await shoot(page, testInfo, 'dict-02-component-search');

    // --- a typo. Not a result: a labelled way out of a dead end.
    const field = visibleTestId(page, 'capture-search-input');
    await field.fill('');
    await field.fill('jikna');
    await expect(visibleTestId(page, 'capture-near-misses')).toBeVisible({ timeout: 15_000 });
    await expect(visibleTestId(page, 'capture-near-misses')).toContainText('not answers');
    await shoot(page, testInfo, 'dict-05-near-miss-for-a-typo');

    // --- browse: open an axis, open a shelf, land on a kanji page.
    await search(page, '分');
    const axis = visibleTestId(page, 'browse-axis-grade');
    await axis.scrollIntoViewIfNeeded();
    await axis.getByRole('button').first().click();
    const shelf = visibleTestId(page, 'browse-shelf-grade-1');
    await expect(shelf).toBeVisible({ timeout: 15_000 });
    await shelf.getByRole('button').first().click();
    await shoot(page, testInfo, 'dict-03-browse-by-grade');

    const cell = page.locator('[data-testid^="browse-cell-"]').locator('visible=true').first();
    await expect(cell).toBeVisible({ timeout: 15_000 });
    await cell.click();
    await expect(visibleTestId(page, 'screen-kanji')).toBeVisible({ timeout: 15_000 });
    await shoot(page, testInfo, 'dict-04-kanji-page-reached-by-browsing');

    // --- and nothing on that walk wrote anything.
    const events = await page.evaluate(() =>
      Object.keys(globalThis.localStorage)
        .filter((key) => key.includes('bunki'))
        .map((key) => globalThis.localStorage.getItem(key) ?? '')
        .join(''),
    );
    expect(events).not.toContain('EncounterCaptured');
  });
});

test.describe('the SRS, standing alone', () => {
  test('takes three off-passage words up and sits a finite sitting over them', async ({
    page,
    app,
  }, testInfo) => {
    await openApp(page, app.origin, '/capture');

    for (const headword of OFF_PASSAGE) {
      await takeUpFromWordPage(page, headword);
      await page.goBack();
      await expect(visibleTestId(page, 'capture-search-input')).toBeVisible({ timeout: 15_000 });
    }
    await shoot(page, testInfo, 'srs-01-three-words-taken-up');

    // --- 稽古. This is the screen that used to say "Nothing is taken up for
    //     study yet." for exactly this state.
    await page.goto(`${app.origin}/session`, { waitUntil: 'load' });
    await hydrated(page);
    await expect(visibleTestId(page, 'session-intro')).toBeVisible({ timeout: 20_000 });
    await expect(visibleTestId(page, 'session-study-list')).toContainText(OFF_PASSAGE[0]);
    await expect(visibleTestId(page, 'session-study-list')).toContainText(OFF_PASSAGE[2]);
    await shoot(page, testInfo, 'srs-02-session-intro-and-standing');

    // --- the standing: six contracts, three per lens, no total anywhere.
    await expect(visibleTestId(page, 'srs-standing')).toContainText('6 contracts');
    await expect(visibleTestId(page, 'srs-count-reading-unasked')).toContainText('3 never asked');
    await expect(visibleTestId(page, 'srs-count-meaning-unasked')).toContainText('3 never asked');
    await expect(visibleTestId(page, 'srs-load')).toBeVisible();
    await shoot(page, testInfo, 'srs-03-standing-per-lens');

    // --- compose and sit.
    await visibleTestId(page, 'session-start').click();
    await expect(visibleTestId(page, 'session-plan')).toBeVisible({ timeout: 15_000 });
    await shoot(page, testInfo, 'srs-04-the-finite-plan');

    // The prompt is a word, never an internal contract id — the defect a
    // narrower label map produced the last time this set grew.
    const prompt = visibleTestId(page, 'session-prompt');
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await expect(prompt).not.toContainText('contract-');

    await visibleTestId(page, 'session-grade-good').click();
    await expect(visibleTestId(page, 'session-progress')).toContainText('1 answered');

    // --- finish, explicitly.
    await visibleTestId(page, 'session-close').click();
    await expect(visibleTestId(page, 'session-completion')).toBeVisible({ timeout: 15_000 });
    await shoot(page, testInfo, 'srs-05-explicit-completion');

    // --- the answer moved something. Re-open and read the standing back.
    await page.goto(`${app.origin}/session`, { waitUntil: 'load' });
    await hydrated(page);
    await expect(visibleTestId(page, 'srs-standing')).toBeVisible({ timeout: 20_000 });
    await shoot(page, testInfo, 'srs-06-standing-after-an-answer');
  });

  test('shows the standing and the load on a phone without scrolling sideways', async ({
    page,
    app,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, app.origin, '/capture');
    await takeUpFromWordPage(page, OFF_PASSAGE[0]);

    await page.goto(`${app.origin}/session`, { waitUntil: 'load' });
    await hydrated(page);
    await expect(visibleTestId(page, 'srs-load')).toBeVisible({ timeout: 20_000 });
    await shoot(page, testInfo, 'srs-07-phone-390');

    const overflow = await page.evaluate(() => ({
      scrollWidth: globalThis.document.documentElement.scrollWidth,
      clientWidth: globalThis.document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
