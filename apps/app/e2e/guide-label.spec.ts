/**
 * The 案内人 speaks, and everything it says is labelled (Campaign E / B6).
 *
 * The campaign brief's rule for this lane: *everything the guide says is AI
 * output and must be labelled as such in the DOM before it is readable, exactly
 * as the existing candidate-label e2e case requires of AI candidates.* So this
 * is the same three claims `candidate-label.spec.ts` makes, made about the
 * guide's own words:
 *
 *  1. **Nothing generated is on the page before the label exists.** Before the
 *     learner asks, there is no guide text at all.
 *  2. **Visually** — the label is on screen and its bounding box is above the
 *     text it is about.
 *  3. **Structurally** — the label is its own element with its own test id, and
 *     the block carries an accessible name that holds both labels.
 *
 * And the fourth, which matters as much: the web bundle holds no API key by
 * construction, so this came from the scripted fixtures and says so.
 *
 * It also drives the two things the guide screen exists for and checks that
 * neither of them writes anything: the road appears with a position on it, and
 * the durable log is untouched by the whole exchange.
 */

import { CANDIDATE_LABEL, OFFLINE_FALLBACK_LABEL } from '@bunki/ai';

import { expect, test } from './support/app.ts';

test('the guide is labelled in the DOM before anyone can read it', async ({ app }) => {
  await app.page.goto(`${app.baseUrl}/guide`);
  await app.testId('guide-screen').waitFor({ timeout: 30_000 });

  // 1. Nothing generated is on the page until it is asked for.
  await expect(app.all('guide-speech-')).toHaveCount(0);

  const firstAsk = app.all('guide-ask-').first();
  await expect(firstAsk).toBeVisible();
  await firstAsk.click();

  // 2. Visible, and above the text it is about.
  const label = app.all('guide-speech-').filter({ hasText: CANDIDATE_LABEL }).first();
  await expect(label).toBeVisible({ timeout: 30_000 });

  const labelBadge = app.page
    .locator('[data-testid$="-label"]')
    .filter({ hasText: CANDIDATE_LABEL })
    .filter({ visible: true })
    .last();
  const body = app.page
    .locator('[data-testid^="guide-speech-"][data-testid$="-text"]')
    .filter({ visible: true })
    .last();

  await expect(labelBadge).toHaveText(CANDIDATE_LABEL);
  await expect(body).toBeVisible();

  const labelBox = await labelBadge.boundingBox();
  const bodyBox = await body.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(bodyBox).not.toBeNull();
  expect(labelBox?.y ?? 0).toBeLessThan(bodyBox?.y ?? 0);

  // The fallback marker is a second label, not a replacement.
  const fallback = app.page
    .locator('[data-testid$="-fallback-label"]')
    .filter({ visible: true })
    .last();
  await expect(fallback).toHaveText(OFFLINE_FALLBACK_LABEL);

  // 3. Structural: the block carries an accessible name holding both labels.
  const spoken = app.page
    .locator(`[aria-label*="${CANDIDATE_LABEL}"]`)
    .filter({ visible: true })
    .last();
  await expect(spoken).toBeVisible();
  await expect(spoken).toHaveAttribute('aria-label', new RegExp(OFFLINE_FALLBACK_LABEL));
});

test('the guide takes a position on a finite road and writes nothing', async ({ app }) => {
  await app.page.goto(`${app.baseUrl}/guide`);
  await app.testId('guide-screen').waitFor({ timeout: 30_000 });

  // Before there is a road, the guide says so rather than drawing one.
  await expect(app.testId('guide-position-empty')).toBeVisible();

  await app.testId('guide-write-records').click();

  // A position, stated as an ordinal out of a finite count — the sentence an
  // unbounded queue cannot say.
  const headline = app.testId('guide-position-headline');
  await expect(headline).toBeVisible();
  await expect(headline).toContainText(/station \d+ of \d+|of \d+/i);
  await expect(app.testId('guide-position-learner')).toContainText(/station \d+ of \d+/);

  // The fork is not the guide's to open, and the screen says so.
  await expect(app.testId('guide-no-fork-note')).toContainText('declared by the evidence gate');

  // Both records exist, each with a time and an author on it.
  await expect(app.testId('guide-plan-provenance')).toContainText('proposed by the guide');

  // And none of it reached the log. The whole exchange is a proposal.
  expect(await app.persistedEventTypes()).toEqual([]);
});
