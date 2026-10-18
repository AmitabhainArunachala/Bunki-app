/** Guided help attribution through the real app's lookup buttons. Native storage,
 * unmodified pinned runtime; only the refused-write case injects a storage fault.
 * This checks help timing and durability, not voice, design, or content approval. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { loadGuidedIndex, loadGuidedSet } from '../guided-session-content.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const readJson = async path => JSON.parse(readFileSync(resolve(site, path), 'utf8'));
const set = await loadGuidedSet((await loadGuidedIndex(readJson))[0], readJson);
const key = `kairo-guided-session-v1:${set.id}`, Q = set.questions;
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const cases = ['lookup-before-and-after-answer', 'refused-write-retry-and-retired-question', 'menu-records-help-only-on-reveal'];
const caseFilter = process.argv.find(arg => arg.startsWith('--case='))?.slice('--case='.length) || null;
const requiredEngines = ['chromium', 'webkit'];
const requireFull = process.argv.includes('--require-full');
assert(!caseFilter || cases.includes(caseFilter), `Unknown Guided lookup case: ${caseFilter}`);
const planned = [];
const results = [];
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all'
  ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)));
assert(!requireFull || (!caseFilter && engines.length === requiredEngines.length && requiredEngines.every(engine => engines.includes(engine))),
  '--require-full requires all three cases in both actual engines');
const host = await startStaticHost({ site, port: 0 });
const act = (page, action) => page.locator(`.guided-room [data-action="${action}"]`).first();
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
// A written kanji with a hidden reading exercises both rungs; kana may correctly skip to stage.
const lookup = page => page.locator('.guided-room .gs-question .japanese-lookup-word').filter({ hasText: /\p{Script=Han}/u }).first();
const learning = async page => {
  const record = await readAppRecord(page);
  return { taken: record.taken || [], srs: record.srs || {}, revlog: record.revlog || [] };
};
async function start(page) {
  await page.goto(`${host.origin}/?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#chrome-dojo').click();
  await page.locator('[data-study-door="guided"]').click();
  await act(page, 'setup').click();
  await act(page, 'start').click();
  await lookup(page).waitFor();
}
async function answer(page, index) {
  await page.locator(`.guided-room [name="answer"][value="${Q[index].correct}"]`).check();
  await act(page, 'check').click();
  await page.locator('.gs-feedback[data-verdict="correct"]').waitFor();
}
async function closeMini(page) {
  // Escape from inside the popup, its own dismissal: on the design pass the popup (and the sticky
  // chrome) can lie over the room's eyebrows, so a click outside may land on the popup itself.
  await page.locator('#mini button').first().press('Escape');
  await page.locator('#mini').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.guided-room [data-ladder-rung]').count(), 0, 'Closing the stage clears its reading rung');
  assert.equal(await lookup(page).locator('rt').count(), 0, 'The occurrence is bare again');
}
async function revealReading(page) {
  assert.equal(await lookup(page).locator('rt').count(), 0, 'No reading before activation');
  await lookup(page).click();
  await page.locator('.guided-room .gs-question [data-ladder-rung="reading"]').waitFor();
  assert.equal(await page.locator('#mini').count(), 0, 'First tap reveals only the reading');
  const visible = await lookup(page).locator('rt').evaluateAll(nodes => nodes.some(node => {
    const style = getComputedStyle(node);
    return node.textContent.trim() && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
  }));
  assert.equal(visible, true, 'The reading is actually visible, not only marked in state');
}
async function openStage(page) {
  await lookup(page).click();
  await page.locator('#mini').waitFor();
  assert.equal(await lookup(page).getAttribute('data-ladder-rung'), 'stage', 'The repeated tap advances the same occurrence');
}
async function visitEntryAndReturn(page) {
  const occurrence = await lookup(page).elementHandle();
  const stageKey = await page.locator('#mini').getAttribute('data-key');
  const before = await stored(page);
  await lookup(page).click();
  await page.locator('#sheet').waitFor();
  assert.equal(await page.locator('#sheet').getAttribute('data-node'), stageKey, 'The full page names the same entry as the stage');
  assert.equal(await occurrence.evaluate(n => n.isConnected && !!n.closest('[inert]') && !!n.closest('[aria-hidden="true"]')), true,
    'The original guided occurrence remains under the page, inert and hidden from accessibility');
  await page.locator('#sheet').focus();
  for (const key of ['3', 'u', 'Enter', 'Space']) await page.keyboard.press(key);
  assert.deepEqual(await stored(page), before, 'Covered-room keys cannot answer, advance or rewrite help');
  assert.equal(await page.locator('#sheet').count(), 1, 'The full page still owns the keys');
  await page.locator('#sheet-back').click();
  await page.locator('#mini').waitFor();
  assert.equal(await page.locator('#mini').getAttribute('data-key'), stageKey, 'Back restores the same stage');
  assert.equal(await occurrence.evaluate(n => n.isConnected && document.activeElement === n && n.dataset.ladderRung === 'stage'), true,
    'Back returns focus and stage to the exact original occurrence');
  assert.deepEqual(await stored(page), before, 'Page entry and return create no extra assistance event');
  return { stageKey, retainedOccurrence: true, helpUnchanged: true };
}
try {
  for (const engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const browserVersion = browser.version();
    console.log(`BROWSER ${engine} ${browserVersion}`);
    const check = async (name, body, { savedWord = null } = {}) => {
      planned.push({ engine, name, selected: !caseFilter || name === caseFilter });
      if (caseFilter && name !== caseFilter) return;
      const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await silenceBrowserAudio(context);
      await context.route('**/*', route => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
      await context.addInitScript(key => {
        const nativeSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) {
          if (name === key && window.__refuseGuidedSave) throw new DOMException('Guided fixture refusal', 'QuotaExceededError');
          return Reflect.apply(nativeSet, this, [name, value]);
        };
        window.__guidedHintSnapshots = [];
        addEventListener('DOMContentLoaded', () => {
          new MutationObserver(() => {
            const rung = document.querySelector('.guided-room [data-ladder-rung="reading"]') ? 'reading'
              : document.getElementById('mini') ? 'stage' : document.getElementById('sheet') ? 'entry' : null;
            if (!rung || window.__guidedHintSnapshots.some(row => row.rung === rung)) return;
            window.__guidedHintSnapshots.push({ rung, state: JSON.parse(localStorage.getItem(key)) });
          }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ladder-rung'] });
        });
      }, key);
      const page = await context.newPage(), errors = [], stages = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      try {
        await start(page);
        const before = await learning(page);
        const observed = await body(page, stages);
        const after = await learning(page);
        if (savedWord) {
          assert.equal(before.taken.some(row => row.t === 'word' && row.id === savedWord), false, 'The deliberately saved word starts unsaved');
          assert.equal(after.taken.filter(row => row.t === 'word' && row.id === savedWord).length, 1, 'Only one deliberate word Save is retained');
          assert.deepEqual(after.taken.filter(row => !(row.t === 'word' && row.id === savedWord)), before.taken, 'Menu actions preserve all other saved cards');
          assert.deepEqual(after.srs, before.srs, 'Menu actions and answers invent no review grade');
          assert.deepEqual(after.revlog, before.revlog);
        } else assert.deepEqual(after, before, 'Lookup and answers never invent deck cards or review grades');
        assert.deepEqual(errors, []);
        results.push({ engine, browserVersion, name, passed: true, observed, stages });
        console.log(`PASS ${engine}/${name}`);
      } catch (error) {
        const screenshot = resolve(evidence, `${engine}-${name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
        results.push({ engine, browserVersion, name, passed: false, error: error.stack || String(error), errors, screenshot, stages });
        console.log(`FAIL ${engine}/${name}: ${error.message}`);
      } finally {
        await context.close();
      }
    };
    try {
      await check('lookup-before-and-after-answer', async page => {
        const first = Q[0].id, second = Q[1].id;
        assert.notEqual((await stored(page)).answers[first].lookupBefore, true, 'Rendering a lookup button is not help');
        await revealReading(page);
        const atHint = await page.evaluate(() => window.__guidedHintSnapshots.find(row => row.rung === 'reading')?.state);
        assert(atHint, 'The initial reading exposure was observed');
        assert.equal(atHint.answers[first].lookupBefore, true, 'Help is durable before the reading appears');
        assert.equal(atHint.answers[first].choice, null);
        assert.equal(atHint.answers[first].correct, null);
        assert.equal(atHint.answers[first].helpBefore, false);
        assert.equal(atHint.answers[first].explained, false, 'Dictionary help does not reveal the explanation');
        await openStage(page);
        const atStage = await page.evaluate(() => window.__guidedHintSnapshots.find(row => row.rung === 'stage')?.state);
        assert.deepEqual(atStage?.answers[first], atHint.answers[first], 'Advancing to the stage does not change assistance or the answer');
        const returned = await visitEntryAndReturn(page);
        await closeMini(page);
        await answer(page, 0);
        assert.match(await page.locator('.gs-feedback').innerText(), /looked up a word before answering/u);
        await act(page, 'next').click();
        await answer(page, 1);
        await revealReading(page);
        await openStage(page);
        await closeMini(page);
        let state = await stored(page);
        assert.equal(state.answers[second].lookupBefore, false, 'Post-answer lookup does not rewrite an independent answer');
        assert.equal(state.events.filter(event => event.type === 'LOOKUP').length, 1);
        await act(page, 'explain').click();
        state = await stored(page);
        assert.equal(state.answers[second].helpBefore, false);
        assert.equal(state.answers[second].explained, true);
        await page.reload();
        await page.waitForFunction(() => document.body.dataset.ready === '1');
        assert.deepEqual((await stored(page)).answers, state.answers, 'Help and first responses survive reload');
        return { beforeHint: atHint.answers[first], first: state.answers[first], second: state.answers[second], returned };
      });
      await check('refused-write-retry-and-retired-question', async page => {
        const first = Q[0].id, second = Q[1].id, before = await stored(page);
        await page.evaluate(() => { window.__refuseGuidedSave = true; });
        await lookup(page).click();
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#mini').count(), 0, 'A refused help write cannot expose the hint');
        assert.equal(await page.locator('.guided-room [data-ladder-rung]').count(), 0, 'A refused write cannot expose the reading rung');
        assert.equal(await lookup(page).locator('rt').count(), 0, 'A refused write leaves the occurrence bare');
        assert.deepEqual(await page.evaluate(() => window.__guidedHintSnapshots), [], 'No transient hint preceded the refused write');
        assert.deepEqual(await stored(page), before, 'A refused write leaves the saved session unchanged');
        assert.doesNotMatch(await page.locator('.gs-sheet').innerText(), /Word looked up/u);
        await page.evaluate(() => { window.__refuseGuidedSave = false; });
        await revealReading(page);
        await openStage(page);
        await closeMini(page);
        const stale = await lookup(page).elementHandle();
        await page.locator('.guided-room [data-action="source"][data-index="1"]').click();
        await stale.evaluate(node => node.click());
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#mini').count(), 0, 'A retired question cannot expose a new hint');
        assert.equal(await page.locator('.guided-room [data-ladder-rung]').count(), 0, 'A retired question cannot expose a reading');
        const state = await stored(page);
        assert.equal(state.answers[first].lookupBefore, true);
        assert.equal(state.answers[second].lookupBefore, false);
        assert.equal(state.events.filter(event => event.type === 'LOOKUP').length, 1, 'The successful retry records help exactly once');
        return { first: state.answers[first], second: state.answers[second], lookupEvents: 1 };
      });
      await check('menu-records-help-only-on-reveal', async (page, stages) => {
        // This is generic Japanese prose in the real bank question, not a gs-word teaching door.
        const word = '橋', first = Q[0].id;
        const occurrence = page.locator(`.guided-room .gs-question .japanese-lookup-word[data-lookup-text="${word}"]`);
        assert.equal(await occurrence.count(), 1, 'The real first question has the selected generic lookup occurrence');
        const menu = page.locator('#reader-word-menu');
        const before = await stored(page), recordBefore = await readAppRecord(page);
        assert.notEqual(before.answers[first].lookupBefore, true);
        const bare = async label => {
          assert.equal(await page.locator('#mini, #sheet, .guided-room [data-ladder-rung]').count(), 0, `${label} reveals no hint or page`);
          assert.equal(await occurrence.locator('rt').count(), 0, `${label} leaves the occurrence bare`);
        };
        const menuActions = {};
        for (const [how, dismiss] of [['escape', () => page.keyboard.press('Escape')],
          ['outside', () => page.locator('.guided-room .gs-title').first().click()]]) {
          await occurrence.click({ button: 'right' });
          await menu.waitFor();
          const openState = await stored(page);
          menuActions[how] = await menu.locator('[role="menuitem"]').evaluateAll(nodes => nodes.map(node => node.dataset.menuAction));
          await dismiss();
          await menu.waitFor({ state: 'detached' });
          const actualState = await stored(page);
          stages.push({ name: `word-menu-dismiss-${how}`, modality: 'right-click', dismissal: how,
            openState, expectedState: before, actualState });
          assert.deepEqual(actualState, before, `Opening and dismissing the Guided word menu (${how}) records nothing`);
          assert.deepEqual(openState, before, `The open Guided menu (${how}) records nothing`);
          assert.deepEqual(await readAppRecord(page), recordBefore, `The dismissed Guided menu (${how}) leaves the learner record unchanged`);
          await bare(`The dismissed Guided menu (${how})`);
        }
        assert(['entry', 'copy', 'save-word'].every(action => menuActions.escape.includes(action)), 'The generic word menu offers Full entry, Copy and Save');
        await occurrence.click({ button: 'right' });
        await menu.locator('[data-menu-action="copy"]').click();
        await menu.waitFor({ state: 'detached' });
        const copyToast = page.locator('#reader-toast .reader-toast-text');
        await copyToast.waitFor();
        const copyOutcome = await copyToast.innerText();
        assert([`Copied ${word}`, 'Could not copy'].includes(copyOutcome), 'Native Copy reports its terminal outcome; OS clipboard contents are not asserted');
        assert.deepEqual(await stored(page), before, 'Copy records no Guided assistance or session change');
        assert.deepEqual(await readAppRecord(page), recordBefore, 'Copy leaves the learner record unchanged');
        await bare('Copy');
        stages.push({ name: 'word-menu-copy', copyOutcome, actualState: await stored(page), expectedState: before });

        assert.equal(recordBefore.taken.some(row => row.t === 'word' && row.id === word), false);
        await occurrence.click({ button: 'right' });
        const save = menu.locator('[data-menu-action="save-word"]');
        assert.notEqual(await save.getAttribute('aria-disabled'), 'true', 'The selected word can be deliberately saved');
        await save.click();
        await menu.waitFor({ state: 'detached' });
        const savedRecord = await waitForAppRecord(page, row => row.taken.some(saved => saved.t === 'word' && saved.id === word),
          { description: 'the deliberate menu Save' });
        assert.deepEqual(await stored(page), before, 'Save records no Guided assistance or session change');
        await bare('Save');
        const savedRows = savedRecord.taken.filter(row => row.t === 'word' && row.id === word);
        assert.equal(savedRows.length, 1);
        stages.push({ name: 'word-menu-save', savedRows, actualState: await stored(page), expectedState: before });

        await occurrence.click({ button: 'right' });
        const entry = menu.locator('[data-menu-action="entry"]');
        assert.notEqual(await entry.getAttribute('aria-disabled'), 'true', 'The selected occurrence has a full entry');
        await entry.click();
        await page.locator('#sheet').waitFor();
        const after = await stored(page), event = after.events.at(-1);
        assert.equal(after.events.length, before.events.length + 1, 'Full entry records exactly one Guided help event');
        assert.deepEqual(after.events.slice(0, -1), before.events);
        assert.equal(event.type, 'LOOKUP');
        assert.equal(event.source, 'guided-session');
        assert.equal(event.id, first, 'The new help event names the current question');
        assert(Number.isFinite(event.at));
        const expected = structuredClone(before);
        expected.answers[first].lookupBefore = true;
        expected.events.push(event);
        assert.deepEqual(after, expected, 'Full entry changes only this question’s lookup mark and its one event');
        const atEntry = await page.evaluate(() => window.__guidedHintSnapshots.find(row => row.rung === 'entry')?.state);
        assert.deepEqual(atEntry, after, 'The help is durable before the full entry first appears');
        assert.deepEqual(await readAppRecord(page), savedRecord, 'Full entry leaves the saved learner record unchanged');
        stages.push({ name: 'word-menu-entry', actualState: after, event, atEntry });
        await page.locator('#sheet-back').click();
        await page.locator('#sheet').waitFor({ state: 'detached' });
        assert.deepEqual(await stored(page), after, 'Returning from Full entry does not record help twice');

        // Exercise the three affected, visible Guided labels from this real assisted answer.
        await answer(page, 0);
        await act(page, 'explain').click();
        const anchorLabel = await page.locator('.gs-anchor').innerText();
        assert.match(anchorLabel, / · With help$/u);
        await page.locator(`.guided-room [data-action="source"][data-index="${Q.length - 1}"]`).click();
        await answer(page, Q.length - 1);
        await act(page, 'next').click();
        const summaryLabel = await page.locator('.gs-row').first().locator('p').innerText();
        assert.match(summaryLabel, / · With help$/u);
        await act(page, 'finish').click();
        const helpFact = page.locator('.gs-results-facts > div').nth(1);
        assert.equal(await helpFact.locator(':scope > span').innerText(), 'With help');
        assert.equal(await helpFact.locator('strong').innerText(), '1');
        const finalState = await stored(page);
        assert.equal(finalState.events.filter(row => row.type === 'LOOKUP').length, 1);
        assert.equal(finalState.answers[first].lookupBefore, true);
        return { word, menu: menuActions, copyOutcome, savedRows, event, atEntry,
          labels: { anchor: anchorLabel, summary: summaryLabel, results: await helpFact.innerText() } };
      }, { savedWord: '橋' });
    } finally {
      await browser.close();
    }
  }
} finally {
  await host.close();
  const expectedCases = engines.length * (caseFilter ? 1 : cases.length);
  const selectedPassed = planned.filter(row => row.selected).length === expectedCases && results.length === expectedCases && results.every(row => row.passed);
  const requiredKeys = requiredEngines.flatMap(engine => cases.map(name => `${engine}/${name}`));
  const observedKeys = results.map(row => `${row.engine}/${row.name}`);
  const fullCoverage = !caseFilter && engines.length === requiredEngines.length && requiredEngines.every(engine => engines.includes(engine)) &&
    requiredKeys.length === 6 && observedKeys.length === 6 && new Set(observedKeys).size === 6 && requiredKeys.every(key => observedKeys.includes(key));
  const passed = fullCoverage && selectedPassed;
  const acceptance = { passed, fullCoverage, requiredCases: 6, requiredKeys, observedKeys,
    mode: caseFilter || engines.length !== 2 ? 'diagnostic' : 'full', requireFull };
  writeFileSync(resolve(evidence, 'guided-lookup.json'), JSON.stringify({
    artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope: 'Real guided question lookup lifecycle, before-hint durability, retained full-page return, after-answer honesty, refused write retry, retired-question guard, generic prose menu non-assistance, deliberate Save and With help labels; no design or voice claim',
    caseFilter, caseInventory: { planned, expectedCases, observedCases: results.length }, results, selectedPassed, acceptance, passed,
  }, null, 2) + '\n');
  if (!selectedPassed || (requireFull && !passed)) process.exitCode = 1;
}
