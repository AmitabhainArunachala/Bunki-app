/** Real reader popup and optional list-popover journeys against one immutable artifact.
 * G5 (hold = seal, 2026-10-18; MASTER_SPEC §7 line 10: "his lists open in one small menu, each one tap … it never covers
 * another button; many lists scroll inside it"): with twelve of his lists, on a phone (390×844), the strip a hold opens
 * shows six lists and "All lists · 12", which unfolds the other six inside the strip; the strip stays under 40 % of the
 * screen, covers no button and not its word, and every list is one tap (the twelfth adds the word to that list alone);
 * Save ▾'s menu, unfolded in the card with the same twelve, stays under 40 % and covers no button either.
 * Round 1 retired the modal chooser: Save captures immediately; the lists are checkboxes, and
 * card context remains available in the full entry. Round 4 (John T5, "click save and then add to
 * list from there") and 1.3.0's Save ▾: one Save, whose menu (Review · lists · + New list · Copy)
 * unfolds inside the card once the word is saved; its Review row is the way back out.
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
const listName = page => page.locator('#vocabulary-list-popover #vocabulary-list-name');
/** In Save ▾'s menu a new list is one row until it is asked for; then the row becomes the name field. */
async function nameField(page) {
  const row = page.locator('#vocabulary-list-new');
  if (await row.isVisible()) await row.click();
  assert.equal(await listName(page).getAttribute('aria-label'), 'Name a new list');
  return listName(page);
}
async function addList(page) {
  await nameField(page);
  await create(page).click();
}
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
  if (!await page.locator('#mini').count()) {
    await token(page).click();
    // G3's ladder: on touch the first activation raises only the reading, the second brings the stage. Only an observed
    // reading rung permits the second activation; a dead door is never rescued with an unconditional extra tap.
    await page.waitForFunction((index) => !!document.getElementById('mini') ||
      document.querySelector(`#reader .tok.content[data-index="${index}"]`)?.dataset.ladderRung === 'reading', tokenIndex);
    if (!await page.locator('#mini').count()) {
      assert.equal(await token(page).getAttribute('data-ladder-rung'), 'reading', 'the first activation stopped at the reading rung');
      await token(page).click();
    }
  }
  await page.locator('#mini-take').waitFor();
  assert.equal(await page.locator('#mini .mini-word').textContent(), word);
  assert.equal(await page.locator('#mini-take').isDisabled(), false);
}
async function openChooser(page) {
  await openPopup(page);
  // one path (round 4, T5; 1.3.0 Save ▾): the popup has no list button — Save saves the word and unfolds its menu
  // inside the card; on a saved word the same button opens the menu again
  if (!await dialog(page).count()) {
    assert.equal(await page.locator('#mini-lists, #mini .mini-entry').count(), 0, 'The popup has one Save ▾ and no list or entry button');
    const unsaved = await page.locator('#mini-take').getAttribute('aria-pressed') !== 'true';
    // a press within a breath (SAVE_PRESS_MS, 600 ms) of the last press on the same Save ▾ is the same press: reopening the
    // menu on a saved word waits that breath out, as a finger would
    if (!unsaved) await page.waitForTimeout(650);
    await page.locator('#mini-take').click();
    if (unsaved) await saved(page);
  }
  await dialog(page).waitFor();
  assert.equal(await dialog(page).getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#mini-take').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#mini #vocabulary-list-popover.is-inline').count(), 1, 'Save ▾ unfolds its menu inside the card');
  assert.equal(await page.locator('#vocabulary-list-dialog, #capture-panel').count(), 0, 'Optional lists use the compact popover');
}
async function closeChooser(page) {
  await dialog(page).press('Escape');
  await dialog(page).waitFor({ state: 'detached' });
  assert.equal(await page.locator('#mini-take').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#mini-take').evaluate(node => node === document.activeElement), true, 'Escape returns focus to Save ▾');
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
  await page.locator('#mini button.mini-word').click(); // the band is the door into the full entry
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
    const check = async (name, body, { viewport = { width: 1024, height: 900 }, phone = false } = {}) => {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
      // G3's one-time demonstration opens a word by itself on a fresh record; it is not under test here (verify-word-grammar
      // and verify-design-reader-shelf pin it), so it is marked seen, as verify-word-grammar does for every walk but its own
      await context.addInitScript(() => localStorage.setItem('kairo-word-ladder-demo-v1', '1'));
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
        // N (2026-10-17) rewrites two pins of the old shelf: "ten glossary definitions stand on it" and "a search for
        // 育児休業 finds two of them". The ten left through the cull queue as not articles: none stands, the one tally
        // names none, and the search is pinned on the new shelf's own rows — exactly the stories the shelf's own
        // filter takes (title, English title, snippet, topics), the three Nobel pieces among them.
        const glossaryIds = new Set(stories.filter(item => item.source === 'isa-yasashii-glossary').map(item => item.id));
        assert.equal(glossaryIds.size, 0, 'no glossary definition stands on the shelf');
        const tally = (total, glossary) => glossary
          ? [`読み物 ${total} 本（うち用語集 ${glossary}）`, `${total} articles, ${glossary} of them short word definitions`]
          : [`読み物 ${total} 本`, `${total} articles`];
        assert(tally(stories.length, 0).includes((await page.locator('.shelf-results-count').textContent()).trim()));
        await openShelfTools(page);
        const term = 'ノーベル';
        const expected = stories.filter(item => `${item.title} ${item.titleEn || ''} ${item.snippet || ''} ${(item.readingFacets?.topics || []).join(' ')}`
          .toLocaleLowerCase().includes(term.toLocaleLowerCase())).map(item => item.id).sort();
        await page.locator('#shelf-reading-search').fill(term);
        await page.locator('#shelf-reading-search').press('Enter');
        const filtered = await page.locator('#shelf-reading-results .shelf-item').evaluateAll(nodes => nodes.map(node => node.dataset.passage));
        assert(filtered.length < ids.length);
        assert(['bunki-read-n1-soai-nobel', 'bunki-read-n1-optogenetics-nobel', 'bunki-read-n1-nobel-economics'].every(id => filtered.includes(id)));
        assert.deepEqual([...filtered].sort(), expected, 'the search keeps exactly the stories the shelf filter names');
        assert.equal(new Set(filtered).size, filtered.length);
        assert(tally(filtered.length, 0).includes((await page.locator('.shelf-results-count').textContent()).trim()));
        return { stories: stories.length, glossary: glossaryIds.size, uniqueCards: ids.length, search: filtered };
      });
      await check('popup-cancel-direct-save-and-three-context-scopes', async page => {
        await reader(page);
        const before = learning(await readAppRecord(page));
        // one path (round 4, T5; 1.3.0 Save ▾): Save first; the save unfolds the menu inside the card
        await openPopup(page);
        assert.equal(await page.locator('#mini-lists, #mini .mini-entry').count(), 0, 'The popup has one Save ▾ and no list or entry button');
        assert.equal(await dialog(page).count(), 0, 'No menu is open before Save');
        await page.locator('#mini-take').click();
        const initial = await saved(page);
        await dialog(page).waitFor();
        assert.equal(await page.locator('#mini #vocabulary-list-popover.is-inline').count(), 1, 'One Save captures directly and unfolds its menu inside the card');
        contextIs(initial, 'sent');
        assert.deepEqual(initial.srs || {}, before.srs);
        assert.deepEqual(initial.revlog || [], before.revlog);
        assert.deepEqual(initial.lists || {}, before.lists);
        assert.equal(initial.taken.filter(item => item.id === word).length, 1);
        const afterSave = learning(await readAppRecord(page));
        await openChooser(page);
        const mini = await page.locator('#mini').elementHandle();
        assert.deepEqual(learning(await readAppRecord(page)), afterSave, 'Opening optional lists is not another capture');
        await closeChooser(page);
        assert.deepEqual(learning(await readAppRecord(page)), afterSave, 'Closing without choosing a list changes no learning roots');
        assert.equal(await mini.evaluate(node => node.isConnected), true, 'Closing lists preserves the word popup');
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
        await (await nameField(page)).fill('Chooser history fixture');
        await addList(page);
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
        // the way back out of review is the menu's own Review row (Save ▾ on a saved word opens the menu)
        await openChooser(page);
        await page.locator('#mini-review').uncheck();
        const removed = await waitForAppRecord(page, value => !row(value), { description: 'explicit removal from review' });
        // S · the toast says what Save says — 外しました · Removed — and nothing about review (it pinned "Removed from review")
        await page.locator('#reader-toast .reader-toast-text').filter({ hasText: /^Removed$/ }).waitFor();
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
        await (await nameField(page)).fill('Existing chooser list');
        await addList(page);
        await waitForAppRecord(page, value => value.lists?.['Existing chooser list']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Added to Existing chooser list.' }).waitFor();
        assert.equal(await listName(page).inputValue(), '', 'Adding the typed name clears that draft');
        await (await nameField(page)).fill('N1 読解');
        await closeChooser(page);
        await openChooser(page);
        await page.locator('#mini-review').uncheck();
        await waitForAppRecord(page, value => !row(value));
        await page.locator('#reader-toast-action').click(); // a press outside the menu folds it away
        await saved(page);
        await openChooser(page);
        assert.equal(await listName(page).inputValue(), 'N1 読解', 'Review off and its Undo keep the unrelated typed name');
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
        await addList(page);
        await waitForAppRecord(page, value => value.lists?.['N1 読解']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Added to N1 読解.' }).waitFor();
        assert.equal(await listName(page).inputValue(), '');
        await closeChooser(page);
        await reader(page);
        await openChooser(page);
        assert.equal(await listName(page).inputValue(), '', 'The saved name does not return as a draft');
        return { kept: ['review Save/Undo', 'existing list checkbox'], cleared: 'form submit of the typed name' };
      });
      await check('twelve-lists-strip-and-save-menu-phone', async page => {
        await reader(page);
        const names = ['仕事', '旅', 'N1 読解', 'ニュースで出会った語', 'Kanji I keep missing', '漢字', '会話', 'Politics and the cabinet',
          '経済', '科学', '料理', '映画の台詞'];
        const seeded = await readAppRecord(page);
        await restoreAppFixture(page, { ...seeded, lists: Object.fromEntries(names.map(name => [name, []])) });
        await reader(page);
        const place = (selector) => page.evaluate(({ selector, index }) => {
          const menu = document.querySelector(selector);
          if (!menu) return null;
          const r = menu.getBoundingClientRect();
          const under = (x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && menu.contains(document.elementFromPoint(x, y));
          const covered = [];
          for (const node of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"]')) {
            if (menu.contains(node) || node.closest('[inert], [hidden]')) continue;
            if (selector === '#vocabulary-list-popover' && node.closest('#mini')) continue; // the card that holds Save ▾'s menu is its own surface
            const b = node.getBoundingClientRect();
            if (!b.width || !b.height || b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom) continue;
            const style = getComputedStyle(node);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            const points = [[b.left + b.width / 2, b.top + b.height / 2], [b.left + 2, b.top + 2], [b.right - 2, b.top + 2], [b.left + 2, b.bottom - 2], [b.right - 2, b.bottom - 2]];
            if (points.some(([x, y]) => under(x, y))) covered.push((node.getAttribute('aria-label') || node.textContent || node.id).trim().slice(0, 30));
          }
          const word = document.querySelector(`#reader .tok.content[data-index="${index}"]`)?.getBoundingClientRect();
          const overWord = !!word && !(word.right <= r.left || word.left >= r.right || word.bottom <= r.top || word.top >= r.bottom);
          const chips = [...menu.querySelectorAll('.seal-list[data-list]')];
          return { share: r.height / innerHeight, height: r.height, covered, overWord, scrolls: menu.scrollHeight > menu.clientHeight + 1,
            shown: chips.filter(chip => chip.getClientRects().length).map(chip => chip.dataset.list), all: chips.map(chip => chip.dataset.list),
            allButton: menu.querySelector('#seal-strip-all')?.textContent.trim() ?? null, expanded: menu.querySelector('#seal-strip-all')?.getAttribute('aria-expanded') ?? null };
        }, { selector, index: tokenIndex });
        // the mouse's hold: a right-click seals 底 and opens the strip beside it
        await token(page).click({ button: 'right' });
        await page.locator('#seal-strip').waitFor();
        await waitForAppRecord(page, record => !!row(record), { description: 'the hold keeps 底' });
        const folded = await place('#seal-strip');
        assert.equal(folded.shown.length, 6, `the strip shows his first six lists: ${JSON.stringify(folded.shown)}`);
        assert.equal(folded.allButton, 'All lists · 12', 'past six, All lists names how many');
        assert(folded.share <= 0.4 && folded.covered.length === 0 && !folded.overWord, `the folded strip: ${JSON.stringify(folded)}`);
        await page.locator('#seal-strip-all').click();
        const open = await place('#seal-strip');
        assert.equal(open.expanded, 'true');
        assert.deepEqual([...open.all].sort(), [...names].sort(), 'every list stands inside the strip');
        assert(open.share <= 0.4 && open.covered.length === 0 && !open.overWord, `the unfolded strip stays under 40 % and covers nothing: ${JSON.stringify(open)}`);
        const before = await readAppRecord(page);
        const last = page.locator(`#seal-strip .seal-list[data-list="${names[11]}"]`);
        await last.scrollIntoViewIfNeeded();
        await last.click();
        const after = await waitForAppRecord(page, record => record.lists?.[names[11]]?.some(item => item.id === word), { description: 'one tap on the twelfth list' });
        assert.equal(await last.getAttribute('aria-pressed'), 'true', 'the tapped list wears the chosen mark');
        for (const name of names.slice(0, 11)) assert.deepEqual(after.lists[name], before.lists[name], `one tap touched only its own list (${name})`);
        assert.equal(after.taken.filter(item => item.id === word).length, 1, 'a list tap never duplicates the card');
        const unfolded = await place('#seal-strip');
        assert(unfolded.share <= 0.4 && unfolded.covered.length === 0, `after the tap the strip still covers nothing: ${JSON.stringify(unfolded)}`);
        await page.keyboard.press('Escape');
        await page.locator('#seal-strip').waitFor({ state: 'detached' });
        // Save ▾'s menu, the same twelve lists, unfolded inside the card
        await openPopup(page);
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'true', 'the stage knows the hold kept 底');
        await page.waitForTimeout(650);
        await page.locator('#mini-take').click();
        await dialog(page).waitFor();
        const menu = await place('#vocabulary-list-popover');
        const boxes = await dialog(page).locator('input[type="checkbox"]').count();
        assert(boxes >= 12, `Save ▾'s menu offers every list: ${boxes}`);
        assert(menu.share <= 0.4 && menu.covered.length === 0, `Save ▾'s menu with twelve lists: ${JSON.stringify(menu)}`);
        return { strip: { folded: folded.share, open: open.share, scrolls: open.scrolls }, saveMenu: menu.share, lists: names.length };
      }, { viewport: { width: 390, height: 844 }, phone: true });
      await check('native-write-failures-preserve-draft-and-retry', async page => {
        await reader(page);
        // one path (round 4, T5): the capture is Save's, before any list is offered, so its fault is Save's
        await openPopup(page);
        const before = learning(await readAppRecord(page));
        await armRecordWriteFailure(page, 'quota', { roots: ['taken'] });
        await page.locator('#mini-take').click();
        await page.locator('#reader-toast').filter({ hasText: /Could not save/iu }).waitFor();
        await page.locator('#record-reload').waitFor();
        const captureFault = await clearRecordWriteFailure(page);
        assert(captureFault.fired > 0, 'A native capture transaction really failed');
        assert.deepEqual(learning(await readAppRecord(page)), before);
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'false');
        assert.equal(await dialog(page).count(), 0, 'A failed Save opens no menu');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-expanded'), 'false');
        // the fault protects the record until reload: a second Save, past its bounce guard, is refused and writes nothing
        await page.waitForTimeout(650);
        await page.locator('#mini-take').click();
        await page.locator('#reader-toast').filter({ hasText: /not ready/iu }).waitFor();
        assert.deepEqual(learning(await readAppRecord(page)), before, 'A failed native write protects the host until reload');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'false');
        await recoverRecord(page);
        assert.deepEqual(learning(await readAppRecord(page)), before, 'The protected reload keeps the record as it was');
        await openChooser(page);
        await (await nameField(page)).fill('Retry vocabulary');
        await addList(page);
        await waitForAppRecord(page, value => value.lists?.['Retry vocabulary']?.some(item => item.id === word));
        await status(page).filter({ hasText: 'Added to Retry vocabulary.' }).waitFor();
        assert.equal(await listName(page).inputValue(), '');
        assert.equal(await page.locator('#mini-take').getAttribute('aria-pressed'), 'true');
        const captured = learning(await readAppRecord(page));
        await (await nameField(page)).fill('Second retry list');
        await armRecordWriteFailure(page, 'abort', { roots: ['lists'] });
        await addList(page);
        await status(page).filter({ hasText: /Please retry adding it to the list|reload/iu }).waitFor();
        const listFault = await clearRecordWriteFailure(page);
        assert(listFault.fired > 0);
        assert.deepEqual(learning(await readAppRecord(page)), captured);
        assert.equal(await listName(page).inputValue(), 'Second retry list');
        assert.equal(await create(page).isDisabled(), true, 'A failed native write protects the host until reload');
        await recoverProtectedChooser(page);
        assert.equal(await listName(page).inputValue(), 'Second retry list', 'List-only recovery also preserves the unsaved list name');
        await addList(page);
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
  const passed = results.length === engines.length * 6 && results.every(result => result.passed);
  writeFileSync(resolve(evidence, 'vocabulary-chooser.json'), JSON.stringify({
    artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope: 'One-tap popup, direct Save, optional checkbox lists with keyboard focus, native durability, Full entry context scopes, typed-name drafts, preserved synthetic history, toast Undo, native failure/retry, popup reuse, shelf article/definition census, and twelve lists in the hold strip and Save ▾ menu on a phone (≤ 40 %, no overlap, one tap each)',
    results, passed,
  }, null, 2) + '\n');
  if (!passed) process.exitCode = 1;
}
