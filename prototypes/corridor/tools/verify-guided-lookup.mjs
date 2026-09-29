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
import { readAppRecord } from './record-test-support.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const readJson = async path => JSON.parse(readFileSync(resolve(site, path), 'utf8'));
const set = await loadGuidedSet((await loadGuidedIndex(readJson))[0], readJson);
const key = `kairo-guided-session-v1:${set.id}`, Q = set.questions;
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const host = await startStaticHost({ site, port: 0 }), results = [];
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all'
  ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)));
const act = (page, action) => page.locator(`.guided-room [data-action="${action}"]`).first();
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const lookup = page => page.locator('.guided-room .gs-question .japanese-lookup-word').first();
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
  await page.locator('.gs-eyebrow').first().click();
  await page.locator('#mini').waitFor({ state: 'detached' });
}
try {
  for (const engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const check = async (name, body) => {
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
            if (!document.getElementById('mini') || window.__guidedHintSnapshots.length) return;
            window.__guidedHintSnapshots.push(JSON.parse(localStorage.getItem(key)));
          }).observe(document.body, { childList: true, subtree: true });
        });
      }, key);
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      try {
        await start(page);
        const before = await learning(page);
        const observed = await body(page);
        assert.deepEqual(await learning(page), before, 'Lookup and answers never invent deck cards or review grades');
        assert.deepEqual(errors, []);
        results.push({ engine, name, passed: true, observed });
        console.log(`PASS ${engine}/${name}`);
      } catch (error) {
        const screenshot = resolve(evidence, `${engine}-${name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
        results.push({ engine, name, passed: false, error: error.stack || String(error), errors, screenshot });
        console.log(`FAIL ${engine}/${name}: ${error.message}`);
      } finally {
        await context.close();
      }
    };
    try {
      await check('lookup-before-and-after-answer', async page => {
        const first = Q[0].id, second = Q[1].id;
        assert.notEqual((await stored(page)).answers[first].lookupBefore, true, 'Rendering a lookup button is not help');
        await lookup(page).click();
        await page.locator('#mini').waitFor();
        const atHint = await page.evaluate(() => window.__guidedHintSnapshots[0]);
        assert.equal(atHint.answers[first].lookupBefore, true, 'Help is durable before the popup appears');
        assert.equal(atHint.answers[first].choice, null);
        assert.equal(atHint.answers[first].correct, null);
        assert.equal(atHint.answers[first].helpBefore, false);
        assert.equal(atHint.answers[first].explained, false, 'Dictionary help does not reveal the explanation');
        await closeMini(page);
        await answer(page, 0);
        assert.match(await page.locator('.gs-feedback').innerText(), /looked up a word before answering/u);
        await act(page, 'next').click();
        await answer(page, 1);
        await lookup(page).click();
        await page.locator('#mini').waitFor();
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
        return { beforeHint: atHint.answers[first], first: state.answers[first], second: state.answers[second] };
      });
      await check('refused-write-retry-and-retired-question', async page => {
        const first = Q[0].id, second = Q[1].id, before = await stored(page);
        await page.evaluate(() => { window.__refuseGuidedSave = true; });
        await lookup(page).click();
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#mini').count(), 0, 'A refused help write cannot expose the hint');
        assert.deepEqual(await stored(page), before, 'A refused write leaves the saved session unchanged');
        assert.doesNotMatch(await page.locator('.gs-sheet').innerText(), /Word looked up/u);
        await page.evaluate(() => { window.__refuseGuidedSave = false; });
        await lookup(page).click();
        await page.locator('#mini').waitFor();
        await closeMini(page);
        const stale = await lookup(page).elementHandle();
        await page.locator('.guided-room [data-action="source"][data-index="1"]').click();
        await stale.evaluate(node => node.click());
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#mini').count(), 0, 'A retired question cannot expose a new hint');
        const state = await stored(page);
        assert.equal(state.answers[first].lookupBefore, true);
        assert.equal(state.answers[second].lookupBefore, false);
        assert.equal(state.events.filter(event => event.type === 'LOOKUP').length, 1, 'The successful retry records help exactly once');
        return { first: state.answers[first], second: state.answers[second], lookupEvents: 1 };
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await host.close();
  const passed = results.length === engines.length * 2 && results.every(row => row.passed);
  writeFileSync(resolve(evidence, 'guided-lookup.json'), JSON.stringify({
    artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope: 'Real guided question lookup lifecycle, before-hint durability, after-answer honesty, refused write retry and retired-question guard; no design or voice claim',
    results, passed,
  }, null, 2) + '\n');
  if (!passed) process.exitCode = 1;
}
