/** Real reader vocabulary chooser journeys against one immutable artifact.
 * Uses native learner records; review history is a labelled synthetic fixture
 * restored only into this verifier's isolated loopback browser through import.
 * Faults abort real native record writes. No voice or design acceptance claim. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable artifact and exact digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const readJson = path => JSON.parse(readFileSync(resolve(site, path), 'utf8'));
const articles = readJson('data/articles/index.json').articles;
const article = readJson('data/articles/aozora-046605.json');
const passageId = 'aozora:046605', word = '底', tokenIndex = 3;
assert.deepEqual(article.tokens[tokenIndex], { s: word, b: word, p: '名詞', r: 'そこ', f: [{ t: word, r: 'そこ' }], c: true });
assert(readJson('data/share_alike/dict.json').words[word]?.m?.length, 'The capture fixture has a real core-dictionary meaning');
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const host = await startStaticHost({ site, port: 0 }), results = [];
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all'
  ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)));
const row = record => record.taken?.find(item => item.t === 'word' && item.id === word);
const learning = record => ({ taken: record.taken || [], lists: record.lists || {}, srs: record.srs || {}, revlog: record.revlog || [] });
const history = record => ({ lists: record.lists || {}, srs: record.srs || {}, revlog: record.revlog || [] });
const dialog = page => page.locator('#vocabulary-list-dialog');
const status = page => page.locator('#vocabulary-list-dialog .vocabulary-list-status');
const listName = page => page.getByRole('textbox', { name: 'Name a new vocabulary list', exact: true });
const create = page => page.getByRole('button', { name: 'Create list & save', exact: true });
const token = page => page.locator(`#reader .tok.content[data-index="${tokenIndex}"]`);
async function shelf(page) {
  await page.goto(`${host.origin}/?entry=shelf&ui=bi&dials=0,1,0`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#shelf-reading-results .shelf-item').first().waitFor();
}
async function reader(page) {
  await shelf(page);
  await page.locator('#shelf-reading-search').fill('やまなし');
  await page.locator('#shelf-reading-search').press('Enter');
  await page.locator(`#shelf-reading-results [data-passage="${passageId}"] .shelf-open`).click();
  await token(page).waitFor();
}
async function openChooser(page, { mini = false } = {}) {
  if (mini) {
    await token(page).scrollIntoViewIfNeeded();
    const box = await token(page).boundingBox();
    assert(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.locator('#mini-take').waitFor();
    assert.equal(await page.locator('#mini .mini-word').textContent(), word);
    assert.equal(await page.locator('#mini-take').isDisabled(), false);
    await page.locator('#mini-take').click();
  } else {
    await token(page).click();
    await page.locator('#reader-take').click();
  }
  await dialog(page).waitFor();
  assert.equal(await dialog(page).evaluate(node => node.open), true);
  assert.equal(await page.locator('#capture-panel').count(), 0, 'Normal capture uses the focused chooser');
}
async function closeChooser(page) {
  await page.locator('#vocabulary-list-close').click();
  await dialog(page).waitFor({ state: 'detached' });
}
async function recoverProtectedChooser(page) {
  assert.match(await status(page).textContent(), /reload/iu, 'The failure explains the protected record recovery path');
  await closeChooser(page);
  await Promise.all([page.waitForEvent('load'), page.locator('#record-reload').click()]);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await reader(page);
  await openChooser(page, { mini: true });
}
async function saved(page) {
  const record = await waitForAppRecord(page, record => !!row(record), { description: 'captured reader word' });
  await page.locator('#vocabulary-list-stop').waitFor();
  return record;
}
async function chooseScope(page, scope) {
  await page.locator(`#vocabulary-list-dialog [data-ctx-scope="${scope}"]`).click();
  return waitForAppRecord(page, record => scope === 'word' ? !row(record)?.ctx : row(record)?.ctx?.scope === scope,
    { description: `durable ${scope} card context` });
}
function contextIs(record, scope) {
  assert(row(record), 'The same word remains captured');
  if (scope === 'word') assert.equal(row(record).ctx, undefined);
  else assert.deepEqual(row(record).ctx, { p: passageId, i: tokenIndex, scope });
}
try {
  for (const engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const check = async (name, body) => {
      const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await silenceBrowserAudio(context);
      await context.route('**/*', route => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      try {
        const observed = await body(page);
        assert.deepEqual(errors, [], 'No uncaught application errors');
        results.push({ engine, name, passed: true, observed });
        console.log(`PASS ${engine}/${name}`);
      } catch (error) {
        const screenshot = resolve(evidence, `${engine}-${name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
        results.push({ engine, name, passed: false, error: error.stack || String(error), errors, screenshot });
        console.log(`FAIL ${engine}/${name}: ${error.message}`);
      } finally { await context.close(); }
    };
    try {
      await check('shelf-census-and-search', async page => {
        await shelf(page);
        const ids = await page.locator('#shelf-reading-results .shelf-item').evaluateAll(nodes => nodes.map(node => node.dataset.passage));
        assert.equal(new Set(ids).size, ids.length, 'Each collection card has a unique passage identity');
        assert.deepEqual([...ids].sort(), articles.map(item => item.id).sort(), 'The grid carries the whole bundled collection');
        const glossaryIds = new Set(articles.filter(item => item.source === 'isa-yasashii-glossary').map(item => item.id));
        assert.equal(ids.length - glossaryIds.size, 116);
        assert.equal(glossaryIds.size, 10);
        assert.equal((await page.locator('.shelf-results-count').textContent()).trim(), '116 readings · 10 glossary entries');
        await page.locator('#shelf-reading-search').fill('育児休業');
        await page.locator('#shelf-reading-search').press('Enter');
        const filtered = await page.locator('#shelf-reading-results .shelf-item').evaluateAll(nodes => nodes.map(node => node.dataset.passage));
        assert(filtered.length < ids.length);
        assert(filtered.includes('yasashii:1') && filtered.includes('yasashii:2'));
        assert.equal(new Set(filtered).size, filtered.length);
        const glossary = filtered.filter(id => glossaryIds.has(id)).length, readings = filtered.length - glossary;
        assert.equal((await page.locator('.shelf-results-count').textContent()).trim(),
          `${readings} ${readings === 1 ? 'reading' : 'readings'} · ${glossary} glossary ${glossary === 1 ? 'entry' : 'entries'}`);
        return { readings: 116, glossary: 10, uniqueCards: ids.length, search: filtered };
      });
      await check('cancel-default-and-three-context-scopes', async page => {
        await reader(page);
        const before = learning(await readAppRecord(page));
        await openChooser(page);
        assert.deepEqual(learning(await readAppRecord(page)), before, 'Opening is not capture');
        await closeChooser(page);
        assert.deepEqual(learning(await readAppRecord(page)), before, 'Closing without saving changes no learning roots');
        await openChooser(page);
        await page.locator('#vocabulary-list-save').click();
        const initial = await saved(page);
        contextIs(initial, 'sent');
        assert.deepEqual(initial.srs || {}, before.srs);
        assert.deepEqual(initial.revlog || [], before.revlog);
        const original = { ...row(initial) }; delete original.ctx;
        for (const scope of ['word', 'sent', 'para']) {
          contextIs(await chooseScope(page, scope), scope);
          await closeChooser(page);
          await reader(page); // a new document reloads the native record
          const restored = await readAppRecord(page);
          contextIs(restored, scope);
          const rest = { ...row(restored) }; delete rest.ctx;
          assert.deepEqual(rest, original, 'Changing scope does not rewrite capture identity or its start time');
          await openChooser(page);
          assert.equal(await page.locator(`[data-ctx-scope="${scope}"]`).evaluate(node => node.classList.contains('on-list')), true);
        }
        return { word, defaultScope: 'sent', restoredScopes: ['word', 'sent', 'para'] };
      });
      await check('named-list-mini-reuse-and-history-preserving-undo', async page => {
        await reader(page);
        await openChooser(page, { mini: true });
        const mini = await page.locator('#mini').elementHandle();
        await listName(page).fill('Chooser history fixture');
        await create(page).click();
        await waitForAppRecord(page, value => value.lists?.['Chooser history fixture']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Saved to Chooser history fixture.' }).waitFor();
        assert.equal(await mini.evaluate(node => node.isConnected), true, 'The original mini survives the modal and save');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'true');
        assert.match(await status(page).textContent(), /Saved to Chooser history fixture/u);
        await closeChooser(page);
        assert.equal(await mini.evaluate(node => node.isConnected), true);
        await page.locator('#mini-take').click();
        await dialog(page).waitFor();
        assert.equal((await readAppRecord(page)).taken.filter(item => item.id === word).length, 1, 'Reopening never duplicates or removes the card');
        await closeChooser(page);
        // Explicitly synthetic reviewed history, isolated to this verifier browser.
        const record = await readAppRecord(page);
        const card = { due: '2020-01-01T00:00:00.000Z', last_review: '2019-12-31T00:00:00.000Z', stability: 3,
          difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 1, lapses: 0, learning_steps: 0, state: 2 };
        const fixture = { ...record, srs: { ...record.srs, [`word:${word}`]: card },
          revlog: [[1754000000000, `word:${word}`, 3, 0, null, null, null, null, 3, 5, 1, 1200]] };
        await restoreAppFixture(page, fixture);
        await reader(page);
        await openChooser(page, { mini: true });
        const prior = history(await readAppRecord(page));
        assert(Object.keys(prior.srs).length && prior.revlog.length && Object.keys(prior.lists).length);
        await page.locator('#vocabulary-list-stop').click();
        const removed = await waitForAppRecord(page, value => !row(value), { description: 'explicit stop memorizing' });
        await status(page).filter({ hasText: /Stopped memorizing/u }).waitFor();
        assert.deepEqual(history(removed), prior, 'Undo preserves non-empty schedules, review history, and list membership');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'false');
        assert.match(await status(page).textContent(), /Stopped memorizing/u);
        await closeChooser(page);
        assert.equal(await page.locator('#mini').count(), 1);
        await reader(page);
        assert.equal(row(await readAppRecord(page)), undefined);
        assert.deepEqual(history(await readAppRecord(page)), prior);
        return { list: 'Chooser history fixture', retainedReviewRows: prior.revlog.length, retainedScheduleKeys: Object.keys(prior.srs), miniReused: true };
      });
      await check('native-write-failures-preserve-draft-and-retry', async page => {
        await reader(page);
        await openChooser(page, { mini: true });
        await listName(page).fill('Retry vocabulary');
        const before = learning(await readAppRecord(page));
        await armRecordWriteFailure(page, 'quota', { roots: ['taken'] });
        await create(page).click();
        await status(page).filter({ hasText: /Could not save|Could not finish saving|reload/iu }).waitFor();
        const captureFault = await clearRecordWriteFailure(page);
        assert(captureFault.fired > 0, 'A native capture transaction really failed');
        assert.deepEqual(learning(await readAppRecord(page)), before);
        assert.equal(await listName(page).inputValue(), 'Retry vocabulary');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'false');
        assert.equal(await create(page).isDisabled(), true, 'A failed native write protects the host until reload');
        await recoverProtectedChooser(page);
        assert.equal(await listName(page).inputValue(), 'Retry vocabulary', 'The required recovery reload preserves the unsaved list name');
        await create(page).click();
        await waitForAppRecord(page, value => value.lists?.['Retry vocabulary']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Saved to Retry vocabulary.' }).waitFor();
        assert.equal(await listName(page).inputValue(), '');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'true');
        const captured = learning(await readAppRecord(page));
        await listName(page).fill('Second retry list');
        await armRecordWriteFailure(page, 'abort', { roots: ['lists'] });
        await create(page).click();
        await status(page).filter({ hasText: /Please retry adding it to the list|reload/iu }).waitFor();
        const listFault = await clearRecordWriteFailure(page);
        assert(listFault.fired > 0);
        assert.deepEqual(learning(await readAppRecord(page)), captured);
        assert.equal(await listName(page).inputValue(), 'Second retry list');
        await recoverProtectedChooser(page);
        assert.equal(await listName(page).inputValue(), 'Second retry list', 'List-only recovery also preserves the unsaved list name');
        await create(page).click();
        await waitForAppRecord(page, value => value.lists?.['Second retry list']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Saved to Second retry list.' }).waitFor();
        const priorScope = await readAppRecord(page);
        contextIs(priorScope, 'sent');
        await armRecordWriteFailure(page, 'abort', { roots: ['taken'] });
        await page.locator('[data-ctx-scope="para"]').click();
        await status(page).filter({ hasText: /Could not save the context change|reload/iu }).waitFor();
        const contextFault = await clearRecordWriteFailure(page);
        assert(contextFault.fired > 0);
        assert.deepEqual(learning(await readAppRecord(page)), learning(priorScope));
        assert.equal(await page.locator('[data-ctx-scope="sent"]').evaluate(node => node.classList.contains('on-list')), true);
        await recoverProtectedChooser(page);
        contextIs(await readAppRecord(page), 'sent');
        assert.equal(await listName(page).inputValue(), '', 'A successfully saved list name does not reappear as a recovery draft');
        contextIs(await chooseScope(page, 'para'), 'para');
        return { captureFault: captureFault.fired, listFault: listFault.fired, contextFault: contextFault.fired, retries: 'saved once after each failure' };
      });
    } finally { await browser.close(); }
  }
} finally {
  await host.close();
  const passed = results.length === engines.length * 4 && results.every(result => result.passed);
  writeFileSync(resolve(evidence, 'vocabulary-chooser.json'), JSON.stringify({
    artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope: 'Chooser lifecycle, native record durability, three context scopes, named lists, preserved synthetic review history, refusal/retry, mini reuse, and distinct shelf reading/glossary census',
    results, passed,
  }, null, 2) + '\n');
  if (!passed) process.exitCode = 1;
}
