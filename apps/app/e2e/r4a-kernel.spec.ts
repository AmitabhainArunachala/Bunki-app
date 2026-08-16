/**
 * RENKAN R4-A — apps/app kernel probes, by clicking (P1-18, P2-18).
 *
 * Three behaviours landed in R4-A, each pinned here against the exported web
 * bundle so a reverted build is convicted by a click path rather than by a
 * unit suite's imports:
 *
 *   1. **One contract lineage (P1-18).** "Take it up for study" dispatches the
 *      validated `activateLearn`, so the immutable reading/meaning pair lands
 *      in the durable log *at the gesture*, under the kernel's deterministic
 *      `contract:learn:…` ids. The pre-unification build minted
 *      `contract-reading-*` / `contract-meaning-*` at session bootstrap
 *      instead — so both the ids and the timing convict it.
 *
 *   2. **Durable uncertainty (P2-18).** The five-way dimension survives a
 *      reload — including a mark edited *after* Keep, which no event ever
 *      carried. The reverted build loses both to the first reload.
 *
 *   3. **The kanji page enters the loop (P2-18).** A character can be kept
 *      from its own page through the domain command handler, and the keep
 *      creates no review debt: no contract, no session, nothing queued.
 */

import { expect, test, TARGET } from './support/app.ts';

test('R4-A: taking a thread up for study mints the validated pair at the gesture', async ({
  app,
}) => {
  await app.open('/');
  await app.captureAndKeep(TARGET, null);

  // Nothing contract-shaped exists after Keep — capture is not card creation.
  expect(await app.persistedEventTypes()).toEqual(['EncounterCaptured', 'ThreadPromotionChanged']);

  await app.promoteButton().click();
  await expect(app.promotedNote()).toContainText('Taken up for study');

  // The pair arrives with the promotion — before any session exists. The
  // pre-unification build has zero ContractCreated here (they appeared only
  // when a sitting started), so the count alone convicts it; the id shape
  // convicts the half-reverted variant that still mints at the old ids.
  await expect
    .poll(
      async () =>
        (await app.persistedEventTypes()).filter((type) => type === 'ContractCreated').length,
      { timeout: 10_000 },
    )
    .toBe(2);

  const events = await app.persistedEvents();
  expect(events.map((event) => String(event['type']))).not.toContain('SessionStarted');

  const contracts = events.filter((event) => event['type'] === 'ContractCreated');
  const skills = contracts.map((event) => String(event['skill'])).sort();
  expect(skills).toEqual(['form_to_meaning', 'orthography_to_reading']);
  for (const contract of contracts) {
    const contractId = String(contract['contractId']);
    expect(contractId, 'the unified lineage id shape').toMatch(/^contract:learn:/);
    expect(contractId, 'the pre-unification compatibility shape').not.toMatch(
      /^contract-(reading|meaning)-/,
    );
  }

  // The promotion itself is still the learner's: origin user, keep → learn.
  const promotions = events.filter((event) => event['type'] === 'ThreadPromotionChanged');
  expect(promotions.at(-1)).toMatchObject({ from: 'keep', to: 'learn', origin: 'user' });
});

test('R4-A: the uncertainty dimension survives a reload, even edited after Keep', async ({
  app,
}) => {
  await app.open('/');
  await app.captureAndKeep(TARGET, 'reading');
  await expect(app.testId('capture-threads')).toContainText('uncertain: reading');

  // Edit the mark *after* Keep. This writes no event at all (the frozen v1
  // schema has no family for it), so only the R4-A annotation side-store can
  // carry it across the reload — which is exactly what makes this the
  // convicting probe.
  await app.testId('capture-mark-use').click();
  await expect(app.testId('capture-threads')).toContainText('uncertain: use');

  await app.reload();
  await expect(app.testId('capture-threads')).toContainText('Kept threads (1)');
  await expect(app.testId('capture-threads')).toContainText('uncertain: use');

  // And the log stayed exactly what the schema allows: the capture-time mark
  // fact, never a dimension, and no event for the edit.
  const events = await app.persistedEvents();
  expect(events.map((event) => String(event['type']))).toEqual([
    'EncounterCaptured',
    'ThreadPromotionChanged',
  ]);
  for (const event of events) {
    // No field anywhere in the event carries the dimension as its value.
    expect(JSON.stringify(event)).not.toContain(':"use"');
  }
});

test('R4-A: the kanji page keeps an encounter through the command handler, with no review debt', async ({
  app,
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(`${app.baseUrl}/kanji/${encodeURIComponent('岐')}`);
  await app.testId('screen-kanji').waitFor({ timeout: 30_000 });

  // Mark the kanji dimension before keeping — one gesture, rides the event.
  await app.testId('kanji-mark-kanji').click();
  await app.testId('kanji-keep').click();

  const acknowledgment = app.testId('kanji-keep-acknowledgment');
  await expect(acknowledgment).toContainText('Kept — 岐');
  await expect(acknowledgment).toContainText('EncounterCaptured, ThreadPromotionChanged');

  // No review debt: the durable log holds the capture and the keep-rung
  // promotion and nothing the scheduler could ever see.
  await expect
    .poll(async () => (await app.persistedEventTypes()).length, { timeout: 10_000 })
    .toBe(2);
  expect(await app.persistedEventTypes()).toEqual(['EncounterCaptured', 'ThreadPromotionChanged']);

  const capture = (await app.persistedEvents()).find(
    (event) => event['type'] === 'EncounterCaptured',
  );
  expect(capture).toMatchObject({
    text: '岐',
    uncertaintyMark: true,
    sourceRef: { sourceId: 'seed-kanji-page', kind: 'text', locator: 'kanji:岐' },
  });

  // The session tab agrees: nothing is taken up for study.
  await app.nav('session').click();
  await expect(app.testId('state-empty')).toContainText('Nothing is taken up for study yet.');

  // The thread is on the capture screen, with its dimension, and survives a
  // cold reload like any other capture.
  await app.nav('capture').click();
  await expect(app.testId('capture-threads')).toContainText('Kept threads (1)');
  await expect(app.testId('capture-threads')).toContainText('岐');
  await expect(app.testId('capture-threads')).toContainText('uncertain: kanji');

  await app.reload();
  await expect(app.testId('capture-threads')).toContainText('Kept threads (1)');
  await expect(app.testId('capture-threads')).toContainText('uncertain: kanji');

  expect(pageErrors).toEqual([]);
});
