/** Browser proof for the A1 静かな朝 → 自分 → 分かれた道 loop. */

import { expect, test } from './support/app.ts';

const SOURCE_ID = 'source-bunki-graded-n5-morning';
const ANCHOR_ID = 'anchor-jibun-01';
const TARGET = '自分';

test('A1: exact source lineage survives drill, export, reload, and focused return', async ({
  app,
}) => {
  const pageErrors: string[] = [];
  app.page.on('pageerror', (error) => pageErrors.push(String(error)));

  // The only door to the source is a visible learner-facing route.
  await app.open('/');
  await app.testId('capture-open-golden-source').click();
  await expect(app.testId('screen-golden-source')).toBeVisible();
  await expect(app.testId('screen-golden-source')).toContainText('静かな朝');
  await expect(app.testId('golden-source-body')).toContainText(TARGET);
  await expect(app.testId('golden-source-body')).toContainText(
    `Exact anchor ${ANCHOR_ID} · UTF-16 [283, 285)`,
  );

  // A quick look is an explicit gesture and has no grade-bearing payload.
  await app.testId('golden-source-target').click();
  await expect(app.testId('golden-lookup-panel')).toContainText('じぶん');
  await expect(app.testId('golden-lookup-panel')).toContainText('oneself');
  await expect(app.testId('golden-action-note')).toContainText(
    'friction only — no grade, no review-memory update',
  );
  let events = await app.persistedEvents();
  const lookups = events.filter((event) => event['type'] === 'LookupFrictionLogged');
  expect(lookups).toHaveLength(1);
  expect(lookups[0]).not.toHaveProperty('grade');
  expect(lookups[0]).not.toHaveProperty('tier');
  expect(events.filter((event) => event['type'] === 'ContractCreated')).toEqual([]);

  // Reload proves the lookup is canonical and that view mount minted nothing.
  await app.reload();
  await expect(app.testId('screen-golden-source')).toBeVisible();
  await expect(app.testId('golden-progress-lookup')).toContainText('●');
  expect(
    (await app.persistedEvents()).filter((event) => event['type'] === 'LookupFrictionLogged'),
  ).toHaveLength(1);

  // Keep retains the whole source but selects exactly [283,285) as identity.
  await app.testId('golden-keep').click();
  await expect(app.testId('golden-action-note')).toContainText('Kept exact 自分 at [283, 285)');
  await expect(app.testId('golden-progress-keep')).toContainText('●');
  events = await app.persistedEvents();
  const capture = events.find((event) => event['type'] === 'EncounterCaptured');
  expect(capture).toMatchObject({
    sourceRef: { sourceId: SOURCE_ID, kind: 'text', locator: `anchor:${ANCHOR_ID}` },
    span: { start: 283, end: 285 },
  });
  const sourceBody = String(capture?.['text'] ?? '');
  expect(sourceBody).toHaveLength(301);
  expect(sourceBody.slice(283, 285)).toBe(TARGET);
  expect(events.filter((event) => event['type'] === 'ContractCreated')).toEqual([]);

  await app.reload();
  await expect(app.testId('golden-progress-keep')).toContainText('●');
  await expect(app.testId('golden-learn')).toBeEnabled();

  // Learn is one separate user gesture and creates only the shared stable pair.
  await app.testId('golden-learn').click();
  await expect(app.testId('golden-action-note')).toContainText(
    'one reading contract and one meaning contract',
  );
  await expect(app.testId('golden-progress-learn')).toContainText('●');
  events = await app.persistedEvents();
  const contracts = events.filter((event) => event['type'] === 'ContractCreated');
  expect(contracts).toHaveLength(2);
  expect(contracts.map((event) => event['skill']).sort()).toEqual([
    'form_to_meaning',
    'orthography_to_reading',
  ]);
  for (const contract of contracts) {
    expect(contract['contractId']).toMatch(/^contract:learn:/);
    expect(contract['contractVersion']).toBe(1);
    expect(contract['targetComponentId']).toBe('kc:自分');
  }

  // Cold reload retains the pair. Beginning the drill must not mint a legacy
  // replacement pair; the plan is composed from these two durable ids.
  await app.reload();
  await expect(app.testId('golden-progress-learn')).toContainText('●');
  await app.testId('golden-begin-drill').click();
  await expect(app.testId('screen-session')).toBeVisible();
  await app.testId('session-start').click();
  await expect(app.testId('session-plan')).toBeVisible();
  const planSteps = app.all('session-plan-step-');
  const composed = await planSteps.count();
  expect(composed).toBeGreaterThanOrEqual(3);

  // The pair stays distinct, while the finite planner admits one new target per
  // sitting. The other contract is deferred, never silently appended.
  await expect(app.testId('session-prompt')).toContainText(TARGET);
  await app.testId('session-grade-good').click();
  await expect(app.testId('session-grade-evidence')).toContainText(
    'ReviewGraded · good · tier A · admitted by the evidence gate',
  );
  await expect(app.testId('session-memory-evidence')).toContainText(
    'Review memory updated · 1 repetition(s)',
  );
  await expect(app.testId('session-progress')).toContainText('1 answered');
  expect(await planSteps.count()).toBe(composed);

  // The different-context reintroduction is the authored 分かれた道 passage.
  await expect(app.testId('session-current')).toContainText('分かれた道');
  await app.testId('session-open-canvas').click();
  await expect(app.testId('screen-canvas')).toContainText('分かれた道');
  await expect(app.testId('canvas-passage')).toContainText(
    'それでも、▢▢で選んだ道だけが▢▢の道になる',
  );
  await app.testId('canvas-read-through').click();
  await expect(app.testId('canvas-ledger')).toContainText('exposure');

  await app.button('Back').click();
  await expect(app.testId('screen-session')).toBeVisible();
  await app.testId('session-complete-canvas').click();
  await app.testId('session-close').click();
  await expect(app.testId('session-completion')).toBeVisible();
  expect(await planSteps.count()).toBe(composed);

  // Inspector binds both contracts back to the exact source authority, then the
  // existing export surface verifies replay from the same canonical log.
  await app.testId('session-inspect-evidence').click();
  await expect(app.testId('screen-evidence')).toBeVisible();
  await expect(app.testId('evidence-lineage')).toContainText(`Target “${TARGET}”`);
  await expect(app.testId('evidence-lineage')).toContainText(SOURCE_ID);
  await expect(app.testId('evidence-lineage')).toContainText('anchor:anchor-jibun-01');
  await expect(app.testId('evidence-lineage')).toContainText('[283, 285) UTF-16');
  await expect(app.testId('evidence-lineage')).toContainText('Grading method: accepted_answers');
  await expect(app.testId('evidence-lineage')).toContainText('origin encounter');
  await app.testId('evidence-disclosure').click();
  await expect(app.testId('evidence-chain')).toContainText('ReviewGraded');
  await expect(app.testId('evidence-chain')).toContainText('ExposureLogged');

  await app.testId('evidence-export-button').click();
  await expect(app.testId('evidence-export-badge')).toContainText('Replay check passed');
  await expect(app.testId(`evidence-export-licence-${SOURCE_ID}`)).toContainText(SOURCE_ID);

  // Reload the inspector itself, then return to the exact source target. The
  // target receives focus, and navigating/mounting adds no encounter or grade.
  await app.reload();
  await expect(app.testId('screen-evidence')).toBeVisible();
  await expect(app.testId('evidence-lineage')).toContainText('[283, 285) UTF-16');
  const beforeReturn = (await app.persistedEvents()).length;
  await app.testId('evidence-return-source').click();
  await expect(app.testId('screen-golden-source')).toBeVisible();
  await expect(app.testId('golden-source-target')).toBeFocused();
  await expect(app.testId('golden-progress-grade')).toContainText('1 admitted graded response(s)');
  await expect(app.testId('golden-progress-reintroduction')).toContainText(
    '1 exposure(s) in 分かれた道',
  );
  expect((await app.persistedEvents()).length).toBe(beforeReturn);

  events = await app.persistedEvents();
  const contractIds = new Set(contracts.map((contract) => String(contract['contractId'])));
  const reviews = events.filter((event) => event['type'] === 'ReviewGraded');
  expect(reviews).toHaveLength(1);
  for (const review of reviews) {
    expect(review).toMatchObject({ grade: 'good', tier: 'A', probeContext: 'standalone' });
    expect(contractIds.has(String(review['contractId']))).toBe(true);
  }
  expect(events.filter((event) => event['type'] === 'ExposureLogged')).toHaveLength(1);
  expect(events.filter((event) => event['type'] === 'DataExported')).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});
