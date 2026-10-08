/** Real reader popup and optional list-popover journeys against one immutable artifact.
 * Round 1 retired the modal chooser: Save captures immediately; Add to list opens
 * checkboxes, and card context remains available in Full entry.
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
import { openShelfTools } from './shelf-tools-support.mjs';

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
const dialog = page => page.locator('#vocabulary-list-popover');
const status = page => page.locator('#vocabulary-list-popover .vocabulary-list-status');
const listName = page => page.getByRole('textbox', { name: 'Name a new list', exact: true });
const create = page => page.locator('#vocabulary-list-create');
const listBox = (page, name) => dialog(page).locator('input[type="checkbox"]').filter({ visible: true }).and(page.locator(`[data-list=${JSON.stringify(name)}]`));
const token = page => page.locator(`#reader .tok.content[data-index="${tokenIndex}"]`);
async function shelf(page) {
  await page.goto(`${host.origin}/?entry=shelf&ui=bi&dials=0,1,0`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#shelf-reading-results .shelf-item').first().waitFor();
}
async function reader(page) {
  await shelf(page);
  await openShelfTools(page);
  await page.locator('#shelf-reading-search').fill('やまなし');
  await page.locator('#shelf-reading-search').press('Enter');
  await page.locator(`#shelf-reading-results [data-passage="${passageId}"] .shelf-open`).click();
  await token(page).waitFor();
}
async function openPopup(page) {
  if (!await page.locator('#mini').count()) await token(page).click();
  await page.locator('#mini-take').waitFor();
  assert.equal(await page.locator('#mini .mini-word').textContent(), word);
  assert.equal(await page.locator('#mini-take').isDisabled(), false);
}
async function openChooser(page) {
  await openPopup(page);
  await page.locator('#mini-lists').click();
  await dialog(page).waitFor();
  assert.equal(await dialog(page).getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#mini-lists').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#vocabulary-list-dialog, #capture-panel').count(), 0, 'Optional lists use the compact popover');
}
async function closeChooser(page) {
  await dialog(page).press('Escape');
  await dialog(page).waitFor({ state: 'detached' });
  assert.equal(await page.locator('#mini-lists').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#mini-lists').evaluate(node => node === document.activeElement), true, 'Escape returns focus to Add to list');
}
async function recoverRecord(page) {
  if (await dialog(page).count()) await closeChooser(page);
  await page.locator('#record-reload').waitFor();
  await Promise.all([page.waitForEvent('load'), page.locator('#record-reload').click()]);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await reader(page);
}
async function recoverProtectedChooser(page) {
  assert.match(await status(page).textContent(), /reload/iu, 'The failure explains the protected record recovery path');
  await recoverRecord(page);
  await openChooser(page);
}
async function saved(page) {
  const record = await waitForAppRecord(page, record => !!row(record), { description: 'captured reader word' });
  await page.waitForFunction(() => document.querySelector('#mini-take')?.getAttribute('aria-pressed') === 'true');
  return record;
}
async function openContext(page) {
  await openPopup(page);
  await page.locator('#mini .mini-entry').click();
  await page.locator('#sheet [data-ctx-scope="sent"]').waitFor();
}
async function chooseScope(page, scope) {
  await page.locator(`#sheet [data-ctx-scope="${scope}"]`).click();
  const record = await waitForAppRecord(page, record => scope === 'word' ? !row(record)?.ctx : row(record)?.ctx?.scope === scope,
    { description: `durable ${scope} card context` });
  await page.locator(`#sheet [data-ctx-scope="${scope}"].on-list`).waitFor();
  return record;
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
        await page.screenshot({ path: screenshot, fullPage: false }).catch(() => {});
        results.push({ engine, name, passed: false, error: error.stack || String(error), errors, screenshot });
        console.log(`FAIL ${engine}/${name}: ${error.message}`);
      } finally { await context.close(); }
    };
    try {
      await check('shelf-census-and-search', async page => {
        await shelf(page);
        const ids = await page.locator('#shelf-reading-results .shelf-item').evaluateAll(nodes => nodes.map(node => node.dataset.passage));
        // one card per story (design pass): an N3 rewrite whose original stands folds into it, and a
        // story in today's six stands in that band inside the grid instead of its ordinary card
        const standing = new Set(articles.map(item => item.id));
        const stories = articles.filter(item => !(item.adaptation?.basedOn && standing.has(item.adaptation.basedOn)));
        assert.equal(new Set(ids).size, ids.length, 'Each story has exactly one card across the grid and today’s six');
        assert.deepEqual([...ids].sort(), stories.map(item => item.id).sort(), 'The grid carries every bundled story once');
        const glossaryIds = new Set(stories.filter(item => item.source === 'isa-yasashii-glossary').map(item => item.id));
        assert.equal(glossaryIds.size, 10);
        // the shelf's one tally counts every story and says how many are glossary entries
        const tally = (total, glossary) => glossary
          ? [`読み物 ${total} 本（うち用語集 ${glossary}）`, `${total} articles, ${glossary} of them short word definitions`]
          : [`読み物 ${total} 本`, `${total} articles`];
        assert(tally(stories.length, glossaryIds.size).includes((await page.locator('.shelf-results-count').textContent()).trim()));
        await openShelfTools(page);
        await page.locator('#shelf-reading-search').fill('育児休業');
        await page.locator('#shelf-reading-search').press('Enter');
        const filtered = await page.locator('#shelf-reading-results .shelf-item').evaluateAll(nodes => nodes.map(node => node.dataset.passage));
        assert(filtered.length < ids.length);
        assert(filtered.includes('yasashii:1') && filtered.includes('yasashii:2'));
        assert.equal(new Set(filtered).size, filtered.length);
        const glossary = filtered.filter(id => glossaryIds.has(id)).length;
        assert(tally(filtered.length, glossary).includes((await page.locator('.shelf-results-count').textContent()).trim()));
        return { stories: stories.length, glossary: glossaryIds.size, uniqueCards: ids.length, search: filtered };
      });
      await check('popup-cancel-direct-save-and-three-context-scopes', async page => {
        await reader(page);
        const before = learning(await readAppRecord(page));
        await openChooser(page);
        const mini = await page.locator('#mini').elementHandle();
        assert.deepEqual(learning(await readAppRecord(page)), before, 'Opening optional lists is not capture');
        await closeChooser(page);
        assert.deepEqual(learning(await readAppRecord(page)), before, 'Closing without saving changes no learning roots');
        assert.equal(await mini.evaluate(node => node.isConnected), true, 'Closing lists preserves the word popup');
        await page.locator('#mini-take').click();
        const initial = await saved(page);
        assert.equal(await dialog(page).count(), 0, 'One Save captures directly without opening lists');
        contextIs(initial, 'sent');
        assert.deepEqual(initial.srs || {}, before.srs);
        assert.deepEqual(initial.revlog || [], before.revlog);
        assert.deepEqual(initial.lists || {}, before.lists);
        assert.equal(initial.taken.filter(item => item.id === word).length, 1);
        const original = { ...row(initial) }; delete original.ctx;
        await openContext(page);
        for (const scope of ['word', 'sent', 'para']) {
          contextIs(await chooseScope(page, scope), scope);
          await reader(page); // reload the durable native record
          const restored = await readAppRecord(page);
          contextIs(restored, scope);
          const rest = { ...row(restored) }; delete rest.ctx;
          assert.deepEqual(rest, original, 'Changing scope preserves capture identity and start time');
          await openContext(page);
          assert.equal(await page.locator(`#sheet [data-ctx-scope="${scope}"]`).evaluate(node => node.classList.contains('on-list')), true);
        }
        return { word, defaultScope: 'sent', restoredScopes: ['word', 'sent', 'para'], directSave: true };
      });
      await check('list-checkboxes-popup-reuse-and-history-preserving-undo', async page => {
        await reader(page);
        await openChooser(page);
        const mini = await page.locator('#mini').elementHandle();
        await listName(page).fill('Chooser history fixture');
        await create(page).click();
        await waitForAppRecord(page, value => value.lists?.['Chooser history fixture']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Added to Chooser history fixture.' }).waitFor();
        assert.equal(await mini.evaluate(node => node.isConnected), true, 'The original popup survives list capture');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'true');
        assert.equal(await listBox(page, 'Chooser history fixture').isChecked(), true);
        const captured = row(await readAppRecord(page));
        await listBox(page, 'Chooser history fixture').uncheck();
        await status(page).filter({ hasText: 'Taken off Chooser history fixture.' }).waitFor();
        const off = await waitForAppRecord(page, value => value.lists?.['Chooser history fixture']?.length === 0);
        assert.deepEqual(row(off), captured, 'Unticking a list does not remove or restart the saved card');
        await listBox(page, 'Chooser history fixture').focus();
        await page.keyboard.press('Space');
        await status(page).filter({ hasText: 'Added to Chooser history fixture.' }).waitFor();
        assert.equal(await listBox(page, 'Chooser history fixture').evaluate(node => node === document.activeElement), true, 'Checkbox repaint retains keyboard focus');
        await closeChooser(page);
        assert.equal(await mini.evaluate(node => node.isConnected), true);
        await openChooser(page);
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
        await openPopup(page);
        const prior = history(await readAppRecord(page));
        assert(Object.keys(prior.srs).length && prior.revlog.length && Object.keys(prior.lists).length);
        await page.locator('#mini-take').click();
        const removed = await waitForAppRecord(page, value => !row(value), { description: 'explicit removal from review' });
        await page.locator('#reader-toast').filter({ hasText: 'Removed from review' }).waitFor();
        assert.deepEqual(history(removed), prior, 'Removing from review preserves schedules, review history, and lists');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'false');
        await page.locator('#reader-toast-action').click();
        await saved(page);
        assert.deepEqual(history(await readAppRecord(page)), prior, 'Toast Undo restores the card without rewriting its history');
        await reader(page);
        assert(row(await readAppRecord(page)), 'Undo survives reload');
        assert.deepEqual(history(await readAppRecord(page)), prior);
        return { list: 'Chooser history fixture', retainedReviewRows: prior.revlog.length, retainedScheduleKeys: Object.keys(prior.srs), popupReused: true, checkboxKeyboard: true };
      });
      await check('only-a-named-add-clears-the-typed-list-name', async page => {
        await reader(page);
        await openChooser(page);
        await listName(page).fill('Existing chooser list');
        await create(page).click();
        await waitForAppRecord(page, value => value.lists?.['Existing chooser list']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Added to Existing chooser list.' }).waitFor();
        assert.equal(await listName(page).inputValue(), '', 'Adding the typed name clears that draft');
        await listName(page).fill('N1 読解');
        await closeChooser(page);
        await page.locator('#mini-take').click();
        await waitForAppRecord(page, value => !row(value));
        await page.locator('#reader-toast-action').click();
        await saved(page);
        await openChooser(page);
        assert.equal(await listName(page).inputValue(), 'N1 読解', 'Review Save/Undo keeps the unrelated typed name');
        await listBox(page, 'Existing chooser list').uncheck();
        await status(page).filter({ hasText: 'Taken off Existing chooser list.' }).waitFor();
        await listBox(page, 'Existing chooser list').check();
        await status(page).filter({ hasText: 'Added to Existing chooser list.' }).waitFor();
        assert.equal(await listName(page).inputValue(), 'N1 読解', 'Changing existing list membership keeps the typed name');
        assert.equal((await readAppRecord(page)).lists?.['N1 読解'], undefined, 'An unsubmitted name creates no list');
        await closeChooser(page);
        await reader(page);
        await openChooser(page);
        assert.equal(await listName(page).inputValue(), 'N1 読解', 'The draft survives close and reload');
        await create(page).click();
        await waitForAppRecord(page, value => value.lists?.['N1 読解']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Added to N1 読解.' }).waitFor();
        assert.equal(await listName(page).inputValue(), '');
        await closeChooser(page);
        await reader(page);
        await openChooser(page);
        assert.equal(await listName(page).inputValue(), '', 'The saved name does not return as a draft');
        return { kept: ['review Save/Undo', 'existing list checkbox'], cleared: 'form submit of the typed name' };
      });
      await check('native-write-failures-preserve-draft-and-retry', async page => {
        await reader(page);
        await openChooser(page);
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
        await status(page).filter({ hasText: 'Added to Retry vocabulary.' }).waitFor();
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
        await status(page).filter({ hasText: 'Added to Second retry list.' }).waitFor();
        await closeChooser(page);
        await openContext(page);
        const priorScope = await readAppRecord(page);
        contextIs(priorScope, 'sent');
        await armRecordWriteFailure(page, 'abort', { roots: ['taken'] });
        await page.locator('[data-ctx-scope="para"]').click();
        await page.locator('#record-reload').waitFor();
        const contextFault = await clearRecordWriteFailure(page);
        assert(contextFault.fired > 0);
        assert.deepEqual(learning(await readAppRecord(page)), learning(priorScope));
        assert.equal(await page.locator('[data-ctx-scope="sent"]').evaluate(node => node.classList.contains('on-list')), true);
        await recoverRecord(page);
        await openChooser(page);
        contextIs(await readAppRecord(page), 'sent');
        assert.equal(await listName(page).inputValue(), '', 'A successfully saved list name does not reappear as a recovery draft');
        await closeChooser(page);
        await openContext(page);
        contextIs(await chooseScope(page, 'para'), 'para');
        return { captureFault: captureFault.fired, listFault: listFault.fired, contextFault: contextFault.fired, retries: 'saved once after each failure' };
      });
    } finally { await browser.close(); }
  }
} finally {
  await host.close();
  const passed = results.length === engines.length * 5 && results.every(result => result.passed);
  writeFileSync(resolve(evidence, 'vocabulary-chooser.json'), JSON.stringify({
    artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope: 'One-tap popup, direct Save, optional checkbox lists with keyboard focus, native durability, Full entry context scopes, typed-name drafts, preserved synthetic history, toast Undo, native failure/retry, popup reuse, and shelf article/definition census',
    results, passed,
  }, null, 2) + '\n');
  if (!passed) process.exitCode = 1;
}
