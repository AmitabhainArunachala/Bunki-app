/** Browser acceptance for the additive redesign shell, room identity and docking. */
/* global document, innerWidth */
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from '../prototypes/corridor/tools/browser-audio-silence.mjs';
import { openShelfTools } from '../prototypes/corridor/tools/shelf-tools-support.mjs';

const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const checks = [];
const diagnostics = [];
const horizontalSamples = [];
const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium } : { chromium, webkit };
try {
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch();
    try {
      for (const width of [320, 390, 768]) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
        });
        await silenceBrowserAudio(context);
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        for (const [lang, labels] of [
          ['bi', ['Today', 'Read', 'Learn', 'Words', 'Me']],
          ['ja', ['今日', '読む', '学ぶ', '辞書', '私']],
        ]) {
          await page.goto(`${host.origin}/?ui=${lang}`);
          await page.locator('#ginga-symbol').waitFor();
          assert.equal(
            await page.locator('#primary-tabs').count(),
            0,
            'The front door keeps its word sky',
          );
          await page.locator('#ginga-symbol').click();
          await page.locator('.bubble-shelf').click();
          await page.locator('#shelf-body').waitFor();
          const tabs = page.locator('#primary-tabs');
          await tabs.waitFor();
          assert.deepEqual(await tabs.locator('button').allTextContents(), labels);
          const targets = await tabs.locator('button').evaluateAll((nodes) =>
            nodes.map((node) => {
              const r = node.getBoundingClientRect();
              return {
                width: r.width,
                height: r.height,
                left: r.left,
                right: r.right,
                bottom: r.bottom,
              };
            }),
          );
          assert(
            targets.every(
              (r) =>
                r.width >= 44 &&
                r.height >= 44 &&
                r.left >= 0 &&
                r.right <= width &&
                r.bottom <= 844,
            ),
            JSON.stringify(targets),
          );
          for (const [tab, view, room] of [
            ['today', 'tray', 'tray'],
            ['learn', 'dojo', 'learn'],
            ['words', 'search', 'search'],
            ['me', 'me', 'me'],
            ['read', 'shelf', 'shelf'],
          ]) {
            await page.locator(`#tab-${tab}`).click();
            await page.waitForFunction((expected) => document.body.dataset.view === expected, view);
            assert.equal(await page.locator('html').getAttribute('data-room'), room);
            assert.equal(await page.locator(`#tab-${tab}`).getAttribute('aria-current'), 'page');
            assert.equal(await tabs.locator('[aria-current="page"]').count(), 1);
          }
          await page.locator('#tab-learn').click();
          assert.deepEqual(
            await page
              .locator('[data-learn-section]')
              .evaluateAll((nodes) => nodes.map((n) => n.dataset.learnSection)),
            ['guided', 'decks', 'focus'],
          );
          await page.locator('#tab-me').click();
          await page.locator('#me-settings').click();
          assert.equal(await page.locator('html').getAttribute('data-room'), 'settings');
          await page.locator('#back').click();
          assert.equal(
            await page.locator('body').getAttribute('data-view'),
            'me',
            'Settings returns to Me',
          );
          await page.locator('#tab-read').click();
          await openShelfTools(page);
          assert(await page.locator('#levels-link').isVisible(), 'Existing shelf links survive');
          await page.locator('.shelf-open').first().click();
          await page.locator('#reader').waitFor();
          assert.equal(await page.locator('html').getAttribute('data-room'), 'reader');
          if (width <= 600) {
            const dock = await page.evaluate(() => {
              const rect = (selector) => {
                const r = document.querySelector(selector).getBoundingClientRect();
                return { top: r.top, bottom: r.bottom };
              };
              return { tabs: rect('#primary-tabs'), play: rect('.listen-row.play-bar') };
            });
            assert(
              dock.play.bottom <= dock.tabs.top,
              `Reader play bar overlaps tabs: ${JSON.stringify(dock)}`,
            );
          }
          // Dictionary content stays Japanese; its sheet owns the layer and hides the tabs.
          // Read the connected chrome atomically: the room render replaces its
          // node, so a locator handle can briefly report a detached 0px box.
          const headerReady = await page.waitForFunction(() => {
            const height = document.querySelector('.chrome')?.getBoundingClientRect().height;
            return document.body.dataset.view === 'reader' && height > 0 ? height : false;
          });
          const headerBefore = await headerReady.jsonValue();
          await headerReady.dispose();
          await page.locator('#reader .tok.content').first().click();
          await page.locator('#mini').waitFor();
          const headerAfter = await page.evaluate(
            () => document.querySelector('.chrome').getBoundingClientRect().height,
          );
          assert(
            Math.abs(headerAfter - headerBefore) <= 1,
            `Selecting a word must not shift the header/article: ${engine}/${width}/${lang} ${headerBefore} → ${headerAfter}`,
          );
          const capture = await page.locator('#reader-take').boundingBox();
          assert(
            capture.width >= 44 && capture.height >= 44,
            'The retained capture door keeps its touch target',
          );
          const dictionary = page.locator('#mini .mini-entry');
          {
            await dictionary.click();
            await page.locator('#sheet').waitFor();
            assert.equal(
              await page.locator('#primary-tabs').count(),
              0,
              'A sheet has no active bottom tabs',
            );
            await page.keyboard.press('Escape');
          }
          await page.locator('#tab-read').click();
          const horizontal = await page.evaluate(() => ({
            noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth,
            view: document.body.dataset.view,
            room: document.documentElement.dataset.room,
            register: document.documentElement.dataset.register,
            innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            fontStatus: document.fonts.status,
            fontFamily: document.defaultView.getComputedStyle(document.body).fontFamily,
            layers: [...document.querySelectorAll('#sheet, #mini, [aria-modal="true"]')].map(
              (node) => ({ id: node.id, hidden: node.hidden, rects: node.getClientRects().length }),
            ),
          }));
          horizontalSamples.push({
            engine,
            width,
            lang,
            stage: 'return-to-read-after-dictionary',
            ...horizontal,
          });
          const noHorizontalScroll = horizontal.noHorizontalScroll;
          if (!noHorizontalScroll) {
            const overflow = await page.evaluate(() => {
              const rect = (node) => {
                const r = node.getBoundingClientRect();
                return {
                  left: r.left,
                  right: r.right,
                  top: r.top,
                  bottom: r.bottom,
                  width: r.width,
                  height: r.height,
                };
              };
              const identify = (node) =>
                `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${[...node.classList].map((name) => `.${name}`).join('')}`;
              const elements = [...document.querySelectorAll('body *')].flatMap((node) => {
                const style = document.defaultView.getComputedStyle(node);
                const bounds = rect(node);
                if (
                  !node.getClientRects().length ||
                  style.display === 'none' ||
                  style.visibility === 'hidden' ||
                  Number(style.opacity) === 0 ||
                  !bounds.width ||
                  !bounds.height
                )
                  return [];
                if (
                  node.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ===
                  false
                )
                  return [];
                if (
                  bounds.width <= 1 &&
                  bounds.height <= 1 &&
                  (style.overflowX === 'hidden' || style.clipPath !== 'none')
                )
                  return [];
                if (
                  bounds.left >= 0 &&
                  bounds.right <= innerWidth &&
                  node.scrollWidth <= node.clientWidth
                )
                  return [];
                return [
                  {
                    element: identify(node),
                    bounds,
                    scrollWidth: node.scrollWidth,
                    clientWidth: node.clientWidth,
                    text: (node.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 160),
                    style: {
                      display: style.display,
                      position: style.position,
                      overflowX: style.overflowX,
                      width: style.width,
                      minWidth: style.minWidth,
                      maxWidth: style.maxWidth,
                      gap: style.gap,
                      fontFamily: style.fontFamily,
                      fontSize: style.fontSize,
                      whiteSpace: style.whiteSpace,
                    },
                    parent: node.parentElement
                      ? { element: identify(node.parentElement), bounds: rect(node.parentElement) }
                      : null,
                  },
                ];
              });
              return {
                view: document.body.dataset.view,
                room: document.documentElement.dataset.room,
                register: document.documentElement.dataset.register,
                innerWidth,
                document: {
                  scrollWidth: document.documentElement.scrollWidth,
                  clientWidth: document.documentElement.clientWidth,
                },
                body: {
                  scrollWidth: document.body.scrollWidth,
                  clientWidth: document.body.clientWidth,
                },
                elements,
              };
            });
            const diagnostic = {
              engine,
              width,
              lang,
              url: page.url(),
              stage: 'return-to-read-after-dictionary',
              ...overflow,
            };
            diagnostics.push(diagnostic);
            console.error(`FOUNDATION HORIZONTAL OVERFLOW ${JSON.stringify(diagnostic)}`);
          }
          assert.equal(noHorizontalScroll, true, 'The shell cannot introduce horizontal scrolling');
          if (width === 390)
            await page.screenshot({ path: join(out, `${engine}-${lang}-shelf.png`) });
          if (width === 390) {
            // An in-page locale change must survive the full-document private-deck route.
            const chosen = lang === 'ja' ? 'bi' : 'ja';
            await page.locator(`#lang [data-lang="${chosen}"]`).click();
            await page.locator('#tab-learn').click();
            await page.locator('[data-deck="personal"]').click();
            await page.locator('.pc-file').waitFor({ state: 'attached' });
            assert.equal(new URL(page.url()).searchParams.get('ui'), chosen);
            assert.equal(await page.locator('html').getAttribute('data-room'), 'personal');
            // r4 skin: your own texts are a deck; the Line marks Learn there, where its ← leads
            assert.equal(await page.locator('#tab-learn').getAttribute('aria-current'), 'page');
            await page.locator('#tab-me').click();
            await page.locator('#me-settings').waitFor();
            await page.locator('#back').click();
            await page.locator('#shelf-body').waitFor();
            assert.equal(
              await page.locator('body').getAttribute('data-view'),
              'shelf',
              'Fresh Me route returns to Read',
            );
            assert.equal(
              await page.locator(`#lang [data-lang="${chosen}"]`).getAttribute('aria-pressed'),
              'true',
            );
          }
          checks.push({ engine, width, lang, passed: true, targets });
        }
        assert.deepEqual(errors, [], 'No room render errors');
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  console.log(`FOUNDATION PASS — ${checks.length} language × width × engine journeys`);
} finally {
  writeFileSync(
    join(out, 'foundation.json'),
    `${JSON.stringify({ checks, horizontalSamples, diagnostics }, null, 2)}\n`,
  );
  await host.close();
}
