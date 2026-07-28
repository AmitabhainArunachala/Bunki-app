/**
 * The EDRDG acknowledgement, in a browser, on every screen that has one.
 *
 * ## Why this exists as a separate lane
 *
 * §3 of the EDRDG licence statement requires the acknowledgement "on each screen
 * display" of words from the files. Twice the build shipped a screen without it,
 * and both times the mechanism was the same: a hand-written list of routes that
 * somebody had to remember to extend. `/` was missed, then fixed by adding one
 * entry — and `/canvas`, which renders the target's headword and reading inside
 * the passage, was still missing when a verifier drove the browser and looked.
 *
 * `test/edrdg-acknowledgement.test.ts` closes the list problem by deriving the
 * obligation from the seed's own provenance and scanning every destination in
 * the navigation map. It cannot, however, tell whether the component it found in
 * the source is *on the screen*: an import renders nothing, and a notice in a
 * branch nobody reaches is a notice nobody sees.
 *
 * So this lane walks the loop the operator walks and asserts the acknowledgement
 * is visible at each stop — including the three screens that only exist once
 * there is a promoted target, which is why they cannot be reached by typing a
 * URL and are therefore the ones a route-list check silently skips.
 *
 * ## What is asserted, and why it is the licence rather than a selector
 *
 * A `data-testid` proves an element exists. The licence asks for an
 * acknowledgement, so each stop also asserts the licensor is *named in the
 * page's text* — an empty element carrying the right test id would satisfy a
 * selector and breach the licence.
 */

import {
  expect,
  test,
  hydrated,
  openApp,
  keepWord,
  takeUpForStudy,
  visibleTestId,
} from './support/adv-harness.ts';

/** Verbatim from `@bunki/seed`. Duplicated so the *bundle* is what is checked. */
const SEED_ENTRY_DISCLOSURE =
  'Word readings, senses and kanji meanings come from JMdict and KANJIDIC2, property of the Electronic Dictionary Research and Development Group, used under CC BY-SA 4.0. Stroke order comes from KanjiVG under CC BY-SA 3.0. Imported example sentences come from the Tatoeba Project under CC BY 2.0 FR and name the member who contributed each one. Sense and reading lists are flattened here and may not show every distinction upstream draws. The eight worked examples, the grammar notes and the reading passage are written by this project, not taken from any corpus.';

const LICENSOR = 'Electronic Dictionary Research and Development Group';

/** The whole obligation, in one place: the notice is there, and it says who. */
async function expectAcknowledged(page: Parameters<typeof visibleTestId>[0], where: string) {
  const disclosure = visibleTestId(page, 'seed-entry-disclosure');
  await expect(
    disclosure,
    `${where} displays licensed words with no acknowledgement`,
  ).toBeVisible();
  await expect(disclosure).toHaveText(SEED_ENTRY_DISCLOSURE);
  await expect(page.locator('body'), `${where} does not name the licensor`).toContainText(LICENSOR);
}

/**
 * Grade forward until the sitting offers the passage.
 *
 * The canvas is a *step* in the plan, not a route anyone can type, and it is
 * several presses in. An earlier draft of this file reached for the door as soon
 * as the session started, did not find it, and skipped — which is how a lane
 * ends up green while never once visiting the screen it was written for. This
 * throws instead, so "the canvas was checked" cannot quietly become "the canvas
 * was skipped".
 */
async function advanceToCanvas(page: Parameters<typeof visibleTestId>[0]): Promise<void> {
  const door = visibleTestId(page, 'session-open-canvas');
  for (let pressed = 0; pressed < 20; pressed += 1) {
    if (await door.isVisible().catch(() => false)) return;
    const grade = visibleTestId(page, 'session-grade-good');
    if (await grade.isVisible().catch(() => false)) {
      await grade.click();
      continue;
    }
    throw new Error(
      'The sitting reached no canvas step and offered nothing more to grade. ' +
        `Screen was:\n${await visibleTestId(page, 'screen-session').innerText()}`,
    );
  }
  throw new Error('The sitting never offered the passage in 20 presses.');
}

test('EDRDG §3: every screen of the walked loop acknowledges the licensor', async ({
  page,
  app,
}) => {
  // ---- capture, populated. A result row is a reading, senses and a part of
  // speech: JMdict fields, all three of them.
  await openApp(page, app.origin);
  await visibleTestId(page, 'capture-search-input').fill('分');
  await expect(visibleTestId(page, 'capture-top-answer')).toBeVisible();
  await expectAcknowledged(page, '/');

  // ---- word page, reached by its own door rather than by a URL.
  await keepWord(page, '分岐');
  await visibleTestId(page, 'capture-open-word').click();
  await expect(visibleTestId(page, 'word-headword')).toBeVisible();
  await expectAcknowledged(page, '/word');

  // ---- kanji page, from the word page's constituent list.
  await visibleTestId(page, 'word-kanji-分').click();
  await expect(visibleTestId(page, 'screen-kanji')).toBeVisible();
  await expectAcknowledged(page, '/kanji');

  // ---- session. Reachable only once something is taken up for study, which is
  // exactly why a URL-driven route list never covered it.
  await openApp(page, app.origin);
  await takeUpForStudy(page);
  await visibleTestId(page, 'nav-session').click();
  await expect(visibleTestId(page, 'screen-session')).toBeVisible();
  await expectAcknowledged(page, '/session');

  // ---- the canvas, from the session. The screen the verifier caught.
  await visibleTestId(page, 'session-start').click();
  await expect(visibleTestId(page, 'session-plan')).toBeVisible();
  await advanceToCanvas(page);
  await visibleTestId(page, 'session-open-canvas').click();
  await expect(visibleTestId(page, 'screen-canvas')).toBeVisible();
  await expectAcknowledged(page, '/canvas');

  // ---- evidence, and the About/Sources screen, both in the persistent shell.
  await visibleTestId(page, 'nav-evidence').click();
  await expect(visibleTestId(page, 'screen-evidence')).toBeVisible();
  await expectAcknowledged(page, '/evidence');

  await visibleTestId(page, 'nav-about-diagnostics').click();
  await expect(visibleTestId(page, 'screen-inspector-debug')).toBeVisible();
  await expectAcknowledged(page, '/debug');
});

test('EDRDG §3 clause 2: the About screen names every source and its licence', async ({
  page,
  app,
}) => {
  // The second clause, which LICENSES.md §2.2 recorded as unmet because no such
  // screen existed: "acknowledgement must be made, e.g. on a separate screen
  // accessed from a menu, such as one labelled 'About', 'Sources', etc."
  await openApp(page, app.origin);
  await visibleTestId(page, 'nav-about-diagnostics').click();

  const sources = visibleTestId(page, 'debug-sources');
  await expect(sources).toBeVisible();

  // Named, with the licence each is used under — not merely mentioned.
  for (const text of [
    'JMdict (EDRDG)',
    'KANJIDIC2 (EDRDG)',
    'KanjiVG',
    'CC BY-SA 4.0',
    'CC BY-SA 3.0',
  ]) {
    await expect(sources, `the Sources section does not name ${text}`).toContainText(text);
  }

  // And it is honest about what this project wrote itself, which is the
  // mirror-image claim: a list naming only the dictionaries would let the
  // reader take the project's own prose for licensed lexicography.
  await expect(sources).toContainText('Bunki Phase-0 seed');
});

test('the canvas cannot render a headword with no acknowledgement beside it', async ({
  page,
  app,
}) => {
  // The failure stated as itself, rather than as "the notice is present". If the
  // target's written form is on the canvas, the licensor is on the canvas.
  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await takeUpForStudy(page);
  await visibleTestId(page, 'nav-session').click();
  await visibleTestId(page, 'session-start').click();

  await advanceToCanvas(page);
  await visibleTestId(page, 'session-open-canvas').click();
  const canvas = visibleTestId(page, 'screen-canvas');
  await expect(canvas).toBeVisible();

  const body = await canvas.innerText();
  const showsTarget = body.includes('分岐') || body.includes('分');
  expect(showsTarget, 'the canvas rendered no JMdict form at all — the check is vacuous').toBe(
    true,
  );
  expect(body, 'the canvas shows a JMdict form with no EDRDG acknowledgement').toContain(LICENSOR);
});

test('EDRDG §3: a kept JMdict headword still names the licensor after the query is cleared and the page reloaded', async ({
  page,
  app,
}) => {
  // The third miss, and the one no gate could see.
  //
  // `/` used to render the acknowledgement only while a search result was on
  // screen. But keeping a result stores the *matched entry's headword* as the
  // thread's display text, and the kept-threads list outlives the query: clear
  // the box, reload, and the front door is a list of JMdict headwords in an
  // empty-search state that rendered no EDRDG string at all.
  //
  // The query is a **reading**, deliberately. がっこう is not the string that
  // ends up on screen — 学校 is — so a passing assertion below cannot be
  // satisfied by anything the learner typed. It can only have come from the
  // files.
  const READING = 'がっこう';
  const HEADWORD = '学校';

  await openApp(page, app.origin);
  await keepWord(page, READING);

  await visibleTestId(page, 'capture-clear').click();
  await page.reload({ waitUntil: 'load' });
  await hydrated(page);

  // The state the old gate rendered nothing in: no query, so no result card.
  await expect(visibleTestId(page, 'capture-search-input')).toHaveValue('');
  await expect(page.getByTestId('capture-top-answer')).toHaveCount(0);

  // Non-vacuity, stated as the licence breach itself rather than as a selector:
  // a JMdict headword is on the reloaded page, and it is not the typed string.
  const threads = visibleTestId(page, 'capture-threads');
  await expect(
    threads,
    'the kept thread did not survive the reload, so this check proved nothing',
  ).toContainText(HEADWORD);
  expect(
    await threads.innerText(),
    'the thread shows the typed reading rather than the JMdict headword — re-point this test',
  ).not.toContain(READING);

  await expectAcknowledged(page, '/ with a kept imported word and an empty query');
});
