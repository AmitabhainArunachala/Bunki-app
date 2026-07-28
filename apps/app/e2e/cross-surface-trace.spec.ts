/**
 * The cross-surface trace — the master definition-of-done's "clean and
 * integrated" clause, walked in a real browser.
 *
 * > **Clean and integrated** — one learner state under every surface
 * > (REQ-CORE-01); a word met anywhere shows up everywhere it should.
 * > *Final test:* cross-surface trace test: one encounter followed through
 * > conversation → thread → kanji page → review → canvas → export.
 *
 * Six links. This file drives all six by clicking, in one browser context, on
 * the exported bundle, and asserts at every stop that the thing on screen is the
 * *same* encounter rather than a different word that happens to be there.
 *
 * ## The link that was missing, and how it was closed
 *
 * The chain used to break at **conversation → thread**. The 案内人 opens a word
 * page (its road's stations are links), but a word page with no thread said
 * *"Keep it from the capture screen to start a thread"* — so the trace stopped
 * and asked the learner to walk to the front door and type the word they were
 * already looking at. Wave D put a Keep on the word page itself
 * (`word-keep`), executing the same `capture` + `promote → keep` pair the
 * capture screen executes, through the same store, with a source record that
 * says which surface it happened on.
 *
 * That is a real closure, not a stubbed step: the assertions below read the
 * thread out of the *durable snapshot* the app itself wrote, and the export at
 * the end verifies over the same log.
 *
 * ## What this test refuses to do
 *
 * It never seeds a store, never sets a flag that changes behaviour, and never
 * reaches into React. Every step is a click a person can make. A step that could
 * only be reached by a fixture would be a step the operator cannot walk, which
 * is precisely the failure the definition-of-done calls "tests pass but the app
 * doesn't".
 */

import { expect, test, live, type AppDriver } from './support/app.ts';
import type { Page } from '@playwright/test';

/**
 * The visible instance of a test id.
 *
 * This file uses the `support/app.ts` fixture rather than the adversarial one,
 * because the trace's last link needs {@link AppDriver.persistedEventTypes} —
 * an independent read of the durable snapshot, which is the only way to say
 * "the export is over the log this walk wrote" rather than "a badge said so".
 */
const v = (page: Page, id: string) => live(page, id);

/** Open a route and wait for the shell to have rendered into the empty document. */
async function open(app: AppDriver, path: string): Promise<void> {
  await app.page.goto(`${app.baseUrl}${path}`);
  await v(app.page, 'nav-shell').waitFor({ timeout: 30_000 });
}

/** The seed's canonical target, and the guide's first turn is about it. */
const TARGET = '分岐';
const TARGET_KANJI = '分';

test('one encounter: conversation → thread → kanji page → review → canvas → export', async ({
  app,
}) => {
  const page = app.page;
  // ---------------------------------------------------------------- 1. conversation
  //
  // The 案内人's own surface, reached the way the shell offers it — the presence
  // rail, which is on every route — rather than by typing a URL.
  await open(app, '/');
  await v(page, 'guide-presence').click();
  await expect(v(page, 'guide-screen')).toBeVisible();

  // Ask, and answer. Nothing generated is on the page until it is asked for,
  // which is the guide lane's own rule; this is the conversation happening.
  const firstAsk = page
    .getByTestId(/^guide-ask-/)
    .locator('visible=true')
    .first();
  await expect(firstAsk).toBeVisible();
  await firstAsk.click();
  await expect(
    page
      .getByTestId(/^guide-speech-/)
      .locator('visible=true')
      .first(),
  ).toBeVisible({
    timeout: 30_000,
  });

  // The guide writes a road from the conversation. Its stations are the words it
  // is proposing, and each is a link.
  await v(page, 'guide-write-records').click();
  await expect(v(page, 'guide-position-headline')).toBeVisible();

  // Any station opens a word; this one is chosen because the rest of the chain
  // is about a specific encounter and the canvas passage this build ships is
  // written around 分岐. Choosing it is not a way of avoiding the general case —
  // the road holds eight stations and every one of them has the same door, which
  // `recursive-exploration.spec.ts` walks at length.
  // `has:` an element whose whole text is the station's name, not `hasText:`.
  // `hasText` is a substring match over the row, and the row for 分かれる carries
  // the note "the same 分 as 分岐" — so a substring filter picked the wrong
  // station and the trace silently followed a different word. The station's
  // name is its own text node; matching it exactly is what makes "the page the
  // station opened" mean anything.
  const station = page
    .getByTestId(/^guide-road-open-/)
    .filter({ has: page.getByText(TARGET, { exact: true }) })
    .locator('visible=true')
    .first();
  await expect(
    station,
    `the guide's road has no station for ${TARGET}, so the conversation has no way into the ` +
      'encounter the rest of this trace follows',
  ).toBeVisible();

  // ---------------------------------------------------------------- 2. thread
  await station.click();
  await expect(v(page, 'screen-word')).toBeVisible();
  const headword = TARGET;
  // The page the station opened is about the word the station named — the join
  // that makes this a trace rather than two unrelated screens.
  await expect(
    v(page, 'word-headword'),
    'the word page the guide opened is not about the station it offered',
  ).toContainText(TARGET);

  // No thread yet — the page says so, and offers the way to start one *here*.
  await expect(v(page, 'word-promotion-state')).toHaveText('not kept');
  await v(page, 'word-keep').click();

  // The thread exists, under this word, and the page now shows its rung rather
  // than an invitation to go elsewhere.
  await expect(v(page, 'word-promotion-state')).toHaveText('keep');

  // …and it exists in the app's own durable log, not only on screen.
  const persisted = await app.persistedEventTypes();
  expect(persisted, 'the encounter did not reach the log').toContain('EncounterCaptured');
  expect(persisted).toContain('ThreadPromotionChanged');

  // ---------------------------------------------------------------- 3. kanji page
  //
  // From the word, into the character it is written with. This is the same hop
  // the recursive-exploration clause is about, taken here as one link of the
  // trace.
  const constituent = v(page, `word-kanji-${TARGET_KANJI}`);
  await expect(
    constituent,
    `the word page offers no way into ${TARGET_KANJI}, so the trace stops at the word`,
  ).toBeVisible();
  await constituent.click();
  await expect(v(page, 'screen-kanji')).toBeVisible();
  await expect(v(page, 'kanji-detail')).toContainText(TARGET_KANJI);

  // ---------------------------------------------------------------- 4. review
  //
  // A sitting is planned over what has been *taken up for study*, which is a
  // rung above Keep and is only ever reached by a press (REQ-DM-09). The word
  // page is where that press lives for a word already on screen.
  await page.goBack();
  await expect(v(page, 'screen-word')).toBeVisible();
  await v(page, 'word-promote-learn').click();
  await expect(v(page, 'word-promotion-state')).toHaveText('learn');

  await v(page, 'nav-session').click();
  await expect(v(page, 'screen-session')).toBeVisible();
  await v(page, 'session-start').click();
  await expect(v(page, 'session-plan')).toBeVisible();

  // The plan is about the word that was just taken up.
  await expect(v(page, 'session-plan')).toContainText(headword);

  // ---------------------------------------------------------------- 5. canvas
  //
  // The integration canvas is a *step of the sitting*, several presses in — not
  // a route anyone can type. Grading forward until it is offered is how a
  // learner reaches it, so it is how this reaches it.
  const canvasDoor = v(page, 'session-open-canvas');
  for (let pressed = 0; pressed < 20; pressed += 1) {
    if (await canvasDoor.isVisible().catch(() => false)) break;
    const grade = v(page, 'session-grade-good');
    if (await grade.isVisible().catch(() => false)) {
      await grade.click();
      continue;
    }
    throw new Error(
      'the sitting offered neither a canvas step nor anything to grade, so the trace cannot ' +
        `reach the canvas. Screen was:\n${await v(page, 'screen-session').innerText()}`,
    );
  }
  await expect(
    canvasDoor,
    'the sitting never offered the passage in 20 presses — the canvas link of the trace is broken',
  ).toBeVisible();
  await canvasDoor.click();
  await expect(v(page, 'screen-canvas')).toBeVisible();

  // The canvas is about the same encounter: the target's written form is in it.
  const canvasText = await v(page, 'screen-canvas').innerText();
  expect(
    canvasText.includes(TARGET) || canvasText.includes(TARGET_KANJI),
    'the canvas is not about the word the trace has been following',
  ).toBe(true);

  // ---------------------------------------------------------------- 6. export
  await v(page, 'nav-evidence').click();
  await expect(v(page, 'screen-evidence')).toBeVisible();

  // The inspector is showing the same thread, by name.
  await expect(v(page, 'screen-evidence')).toContainText(headword);

  await v(page, 'evidence-export-button').click();
  const badgeLocator = v(page, 'evidence-export-badge');
  await expect(badgeLocator).toBeVisible();
  const badge = (await badgeLocator.innerText()).trim();
  // The badge's own words, not a paraphrase. It says "replay check passed" and
  // then says what that does *not* cover — durability, storage — which is the
  // claim discipline this build is held to, so asserting on the word "verified"
  // would be asserting on a stronger claim than the app makes.
  expect(badge.toLowerCase(), `the export did not replay — the badge said: ${badge}`).toContain(
    'replay check passed',
  );
  expect(badge, 'the badge reported no event count, so it may have replayed nothing').toMatch(
    /\d+ events/,
  );

  // The export is over the log the trace wrote, not over an empty one.
  const finalLog = await app.persistedEventTypes();
  expect(finalLog).toContain('EncounterCaptured');
  expect(
    finalLog.some((type) => type.includes('Review') || type.includes('Evidence')),
    `the log holds no review or evidence event after a graded sitting: ${finalLog.join(', ')}`,
  ).toBe(true);
});

/**
 * The trace is capable of failing.
 *
 * Six clicks that each find *something* would pass a weaker version of the test
 * above. This one asserts the two properties that make the chain a chain: the
 * word page cannot start a thread without the press, and the session cannot plan
 * over a word that was only kept.
 */
test('the trace’s links are real: keeping is not studying, and studying is a press', async ({
  app,
}) => {
  const page = app.page;
  await open(app, '/word/lex-bunki');
  await expect(v(page, 'screen-word')).toBeVisible();

  // Nothing has been kept, and the page says exactly that rather than assuming.
  await expect(v(page, 'word-promotion-state')).toHaveText('not kept');

  // Keeping is one press and it does not activate anything: the sitting has
  // nothing to plan over, which is DL-05's "capture is not card creation" made
  // visible.
  await v(page, 'word-keep').click();
  await expect(v(page, 'word-promotion-state')).toHaveText('keep');

  await v(page, 'nav-session').click();
  await expect(v(page, 'screen-session')).toBeVisible();
  await expect(
    v(page, 'state-empty'),
    'a kept-but-not-studied word produced a sitting, so keeping activated a contract',
  ).toContainText('Nothing is taken up for study yet.');
});
