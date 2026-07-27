/**
 * T-12, E2E half — "candidate/generated content is visually and structurally
 * labeled" (WP-10 for WP-07; controller §17.1, §9, REQ-AI-02).
 *
 * WP-07 proved the *rule*: `labelsFor` returns a primary label unconditionally,
 * so no code path can build a candidate view without one, and no screen holds
 * the wording as a literal (`test/candidate-labeling.test.ts`). That is a
 * statement about a function. This file is the statement about the page: in the
 * shipped web bundle, a human looking at the generated text sees the label, and
 * an assistive technology reading the same region is told the same thing.
 *
 * The three claims, separated because they fail separately:
 *
 *  1. **Nothing generated appears before the label exists.** Before the request
 *     there is no candidate text on the page at all; after it, label and text
 *     arrive together.
 *  2. **Visually** — the label is rendered, is on screen, and sits above the
 *     text rather than below it or off in a footnote.
 *  3. **Structurally** — it is its own element with its own test id, and the
 *     block carries an accessible name that names it, so the label is not merely
 *     a coloured pixel next to a paragraph.
 *
 * And one more that matters at least as much: the fallback says it is a
 * fallback. The web bundle holds no API key by construction, so this candidate
 * came from the scripted fixtures — presenting it as a live model's answer would
 * be the definition of done's "the AI exchange is a puppet" failure (§2 item 3)
 * wearing a better costume.
 */

import { CANDIDATE_LABEL, OFFLINE_FALLBACK_LABEL, OFFLINE_FALLBACK_STANDING_NOTE } from '@bunki/ai';

import { expect, test, TARGET } from './support/app.ts';

test('T-12: the AI candidate is labelled in the DOM before anyone can read it', async ({ app }) => {
  await app.open('/');
  await app.captureAndKeep(TARGET, null);
  await app.openWordPageFromCapture();

  // 1. Nothing generated is on the page until it is asked for.
  await expect(app.testId('candidate-card')).toHaveCount(0);
  await expect(app.testId('candidate-text')).toHaveCount(0);
  await expect(app.testId('candidate-request')).toBeVisible();

  await app.requestCandidate();

  // 2. Visible, and above the text it is about.
  const label = app.testId('candidate-label');
  const fallback = app.testId('candidate-fallback-label');
  const body = app.testId('candidate-text');

  await expect(label).toBeVisible();
  await expect(label).toHaveText(CANDIDATE_LABEL);
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveText(OFFLINE_FALLBACK_LABEL);
  await expect(body).toBeVisible();

  const labelBox = await label.boundingBox();
  const bodyBox = await body.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(bodyBox).not.toBeNull();
  expect(labelBox?.y ?? 0).toBeLessThan(bodyBox?.y ?? 0);

  // 3. Structural: the badge row carries an accessible name holding both labels,
  //    so a screen reader is told what this is without seeing the badges.
  const spoken = app.page
    .locator(`[aria-label*="${CANDIDATE_LABEL}"]`)
    .filter({ visible: true })
    .last();
  await expect(spoken).toBeVisible();
  await expect(spoken).toHaveAttribute('aria-label', new RegExp(OFFLINE_FALLBACK_LABEL));

  // The fallback says what it is, in `@bunki/ai`'s own words.
  await expect(app.testId('candidate-standing-note')).toHaveText(OFFLINE_FALLBACK_STANDING_NOTE);
  await expect(app.testId('candidate-origin')).toContainText(OFFLINE_FALLBACK_LABEL);

  // Accepting it keeps the label. "Kept as my note" changes what the learner has
  // decided about the text; it changes nothing about where the text came from.
  await app.testId('candidate-accept').click();
  await expect(app.testId('candidate-status')).toContainText('Kept as your note at');
  await expect(app.testId('candidate-label')).toHaveText(CANDIDATE_LABEL);
  await expect(app.testId('candidate-fallback-label')).toHaveText(OFFLINE_FALLBACK_LABEL);
  await expect(app.testId('candidate-status')).toContainText('stays labelled as generated');
});
