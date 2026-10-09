/** Tour the built N2/N1 decks on a phone, including first-use and offline answers. */
/* global navigator, caches, location, URL, window */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { cardTokens, defTokens, validateDeck } from '../decks/player/engine.js';

const ids = ['n2', 'n1', 'senmon'];
const chromeTitles = ['N2 words · in short passages', 'N1 words · in short passages', 'Your fields · master\'s level'];
const titles = ['N2の語・短い文章で', 'N1の語・短い文章で', '専門・あなたの分野'];
const out = resolveCorridorEvidence();
const host = await startCorridorDev(0);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const report = { viewport: { width: 390, height: 844 }, site: host.site, decks: [], tours: [] };
const errors = [];

try {
  for (const [i, id] of ids.entries()) {
    const deck = JSON.parse(readFileSync(join(host.site, `decks/${id}/deck.json`), 'utf8'));
    const side = JSON.parse(readFileSync(join(host.site, `decks/${id}/tokens.json`), 'utf8'));
    assert.equal(deck.id, id);
    assert.equal(deck.titleJa, titles[i]);
    assert.deepEqual(validateDeck(deck), []);
    assert.equal(side.deck, id);
    const cards = deck.words.flatMap((w) => w.cards);
    assert(cards.length > 0);
    assert.deepEqual(Object.keys(side.cards).sort(), cards.map((c) => c.id).sort());
    for (const word of deck.words) {
      assert(word.defJa, `${id}/${word.id}: Japanese definition`);
      assert.equal(defTokens(word, side)?.map((t) => t.s).join(''), word.defJa);
      for (const card of word.cards) {
        assert.equal(card.ruby.map((s) => s[0]).join(''), card.ja);
        assert.equal(card.ruby.filter((s) => s[2] === 1).length, 1);
        assert.equal(cardTokens(card, side)?.map((t) => t.s).join(''), card.ja);
      }
    }
    report.decks.push({ id, words: deck.words.length, cards: cards.length });
  }

  for (const look of ['ai', 'washi']) {
    for (const [i, id] of ids.entries()) {
      const context = await browser.newContext({ viewport: report.viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      console.log(`Tour ${id} / ${look}`);
      page.on('pageerror', (error) => errors.push(`${id}/${look}: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`${id}/${look}: ${message.text()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400) console.log(`HTTP ${response.status()} ${response.url()}`);
      });
      // Install from an inert release page, then exercise the first controlled
      // app visit so first-use resources pass through the installed worker.
      await page.goto(`${host.origin}/build-identity.json`, { waitUntil: 'load' });
      // The production entry registers on HTTPS. Loopback is also a secure
      // context, so install the same built worker explicitly for this tour.
      await page.evaluate(() => navigator.serviceWorker.register('sw.js'));
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await page.goto(`${host.origin}/index.html`, { waitUntil: 'load' });
      await page.locator('#ginga-symbol').click();
      await page.locator('.nav-dojo').click();
      await page.locator(`[data-deck="${id}"]`).waitFor();
      const rows = await page.locator('.dojo-deck').evaluateAll((nodes) => nodes.map((n) => n.dataset.deck));
      assert.deepEqual(rows, ['personal', ...ids, 'kotoba-mcd', 'kotoba-mine', 'context', 'mine']);
      assert.equal(await page.locator(`[data-deck="${id}"] .dojo-deck-t`).textContent(), chromeTitles[i]);
      await page.locator(`[data-deck="${id}"]`).click();
      await page.locator('#kp-start').waitFor();
      await page.locator('#kp-to-settings').click();
      await page.locator(`[data-pref="look:${look}"]`).click();
      await page.locator('.kp-settings .kp-icon').click();
      assert.equal(await page.locator('.kp').getAttribute('data-look'), look);
      await page.screenshot({ path: join(out, `${id}-home-${look}.png`) });
      await page.locator('#kp-start').click();
      await page.locator('#kp-card .kp-target').waitFor();
      assert.equal(await page.locator('#kp-card rt, #kp-card details, #kp-card .kp-answer').count(), 0);
      await page.screenshot({ path: join(out, `${id}-front-${look}.png`), fullPage: true });
      await page.locator('#kp-reveal').click();
      await page.locator('#kp-grade-good').waitFor();
      assert(await page.locator('#kp-card rt').count() > 0, `${id}: furigana`);
      assert((await page.locator('#kp-card .kp-def').textContent()).trim(), `${id}: defJa`);
      for (const [fold, content] of [['.kp-f-gloss', '.kp-gloss'], ['.kp-f-en', '.kp-en']]) {
        assert.equal(await page.locator(`#kp-card ${fold}`).getAttribute('open'), null);
        assert.equal(await page.locator(`#kp-card ${content}`).isVisible(), false);
        await page.locator(`#kp-card ${fold} > summary`).click();
        assert.equal(await page.locator(`#kp-card ${content}`).isVisible(), true);
        assert((await page.locator(`#kp-card ${content}`).textContent()).trim());
        await page.locator(`#kp-card ${fold} > summary`).click();
      }
      await page.locator('#kp-card .kp-tok').first().waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(out, `${id}-back-${look}.png`), fullPage: true });
      await page.locator('#kp-card .kp-sentence .kp-tok:not([data-deck-word])').first().click();
      await page.locator('#kp-sheet').waitFor();
      assert((await page.locator('#kp-sheet-term').textContent()).trim());
      await page.locator('#kp-sheet-close').click();
      await page.waitForFunction(async (deckId) => {
        const response = await caches.match(new URL(`decks/${deckId}/tokens.json`, location.href).href);
        return !!response;
      }, id);
      console.log(`${id} / ${look}: online answer and cached tokens passed`);
      await context.setOffline(true);
      await page.goto(`${host.origin}/index.html?deck=${id}`, { waitUntil: 'load' });
      await page.locator('#kp-start').waitFor();
      await page.locator('#kp-start').click();
      await page.locator('#kp-reveal').click();
      await page.locator('#kp-card .kp-tok').first().waitFor();
      assert(await page.locator('#kp-card rt').count() > 0);
      assert((await page.locator('#kp-card .kp-def').textContent()).trim());
      report.tours.push({ id, look, furigana: true, defJa: true, englishFolds: true, tapToDefine: true, offline: true });
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  report.status = 'passed';
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  report.consoleErrors = errors;
  throw error;
} finally {
  writeFileSync(join(out, 'n2n1-tour.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await host.close();
}
