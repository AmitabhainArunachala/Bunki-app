/** Browser acceptance for the additive redesign shell, room identity and docking. */
/* global document, innerWidth */
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const releaseVersion = JSON.parse(
  readFileSync(new URL('../release.json', import.meta.url)),
).version;
const horizontalSamples = [];
const browserVersions = {};
const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium } : { chromium, webkit };
try {
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch();
    browserVersions[engine] = browser.version();
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
          await page.locator('[data-learn-section="focus"]').waitFor({ state: 'attached' });
          assert.deepEqual(
            await page
              .locator('[data-learn-section]')
              .evaluateAll((nodes) => nodes.map((n) => n.dataset.learnSection)),
            ['guided', 'decks', 'focus'],
          );
          await page.locator('#tab-me').click();
          await page.locator('#me-settings').click();
          await page.waitForFunction(() => document.documentElement.dataset.room === 'settings');
          assert.equal(
            await page.locator('#settings-release-version').getAttribute('data-version'),
            releaseVersion,
          );
          assert.equal(
            await page.locator('#settings-release-notes').getAttribute('href'),
            `https://github.com/Amitabhainarunachala/Bunki-app/releases/tag/v${releaseVersion}`,
          );
          assert.equal(await page.locator('html').getAttribute('data-room'), 'settings');
          assert.equal(
            await page.locator('.crumb').getAttribute('title'),
            lang === 'ja' ? '私 › 設定' : 'Me › Settings',
          );
          for (const [theme, en, ja] of [
            ['sumi', 'Ink on kozo paper', '墨・楮紙'],
            ['yoru', 'Gold on indigo', '紺紙金泥'],
            ['kaku', 'Electric phosphor', '攻殻・燐光'],
          ]) {
            const name = lang === 'ja' ? ja : en;
            await page.locator('#settings-world').click();
            await page.getByRole('button', { name, exact: true }).click();
            await page.waitForFunction(
              (id) => document.documentElement.dataset.theme === id,
              theme,
            );
            assert.equal(
              await page.locator('#settings-world .settings-world-value').textContent(),
              name,
              'The live selection is recognizable without reopening its picker',
            );
            const worldRect = await page.locator('#settings-world').boundingBox();
            assert(
              worldRect.height >= 44 && worldRect.x >= 0 && worldRect.x + worldRect.width <= width,
              'The selected world fits the actual Settings control',
            );
          }
          await page.locator('#back').click();
          await page.waitForFunction(() => document.body.dataset.view === 'me');
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
          // S (John, 2026-10-16: "why is the plus bar gone???? … how do we know where to add something"): it pinned "the bar
          // carries no Save of its own" (John, 2026-10-15 17:20). The new truth: the bar carries exactly one keep, and it is
          // the one Save component — the same path as the popup's — naming the word just touched; never a second kind
          const barKeeps = await page.evaluate(() =>
            [...document.querySelectorAll('#app > .chrome button')]
              .filter(
                (n) => n.id === 'reader-take' || /^(保存|Save)/u.test((n.textContent || '').trim()),
              )
              .map((n) => ({
                id: n.id,
                one: n.matches('button.save-one[data-save-one]'),
                word: n.querySelector('.save-bar-word')?.textContent ?? '',
              })),
          );
          const touched = await page.evaluate(
            () => document.querySelector('#mini .mini-word')?.textContent ?? '',
          );
          assert(
            barKeeps.length === 1 &&
              barKeeps[0].id === 'chrome-keep' &&
              barKeeps[0].one &&
              barKeeps[0].word === touched,
            `The bar carries one keep, the one Save naming the touched word, while the popup is open: ${JSON.stringify({ barKeeps, touched })}`,
          );
          const popupCapture = await page.locator('#mini-take').boundingBox();
          assert(
            popupCapture && popupCapture.width >= 44 && popupCapture.height >= 44,
            'The visible popup Save keeps its 44px touch target',
          );
          assert(
            await page.locator('#mini-take').evaluate((node) => {
              const r = node.getBoundingClientRect();
              return node.contains(
                document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
              );
            }),
            'The popup Save owns its actual centre',
          );
          const dictionary = page.locator('#mini button.mini-word');
          {
            await dictionary.click();
            await page.locator('#sheet').waitFor();
            // the one-hand pass (2026-10-15): the tabs stay mounted under a sheet so the chrome never re-lays;
            // the bar itself is not displayed, and the header keeps the height it had
            assert.deepEqual(
              await page.evaluate(() => {
                const tabs = [...document.querySelectorAll('#primary-tabs')];
                return {
                  mounted: tabs.length,
                  shown: tabs.filter((el) => el.getClientRects().length).length,
                  display: tabs.map((el) => document.defaultView.getComputedStyle(el).display),
                  clearance: document.body.classList.contains('has-primary-tabs'),
                };
              }),
              { mounted: 1, shown: 0, display: ['none'], clearance: true },
              'A sheet hides the bottom tabs without taking their layout away',
            );
            assert.equal(
              await page.evaluate(
                () => document.querySelector('.chrome').getBoundingClientRect().height,
              ),
              headerAfter,
              'Opening the entry must not re-lay the header',
            );
            await page.keyboard.press('Escape');
            await page.locator('#sheet').waitFor({ state: 'detached' });
            // closing the full entry clears the reading and its slip (contract §1); S: the bar keeps its one keep (the one
            // Save, it pinned "no Save") and no second one, and the header keeps its height
            await page.locator('#mini').waitFor({ state: 'detached' });
            assert.equal(
              await page
                .evaluate(() => ({
                  barSaves: [...document.querySelectorAll('#app > .chrome button')]
                    .filter(
                      (n) =>
                        n.id === 'reader-take' ||
                        /^(保存|Save)/u.test((n.textContent || '').trim()),
                    )
                    .filter(
                      (n) =>
                        !(n.id === 'chrome-keep' && n.matches('button.save-one[data-save-one]')),
                    ).length,
                  one: document.querySelectorAll('#app > .chrome #chrome-keep.save-one').length,
                  header: document.querySelector('.chrome').getBoundingClientRect().height,
                }))
                .then((s) => JSON.stringify(s)),
              JSON.stringify({ barSaves: 0, one: 1, header: headerAfter }),
              'After closing the entry the bar carries its one keep and no other Save, and keeps its height',
            );
          }
          await page.locator('#tab-read').click();
          // Room changes may finish after click dispatch (including WebKit's
          // transition lifecycle). Measure the returned shelf, not its caller.
          await page.waitForFunction(
            () =>
              document.body.dataset.view === 'shelf' &&
              document.documentElement.dataset.room === 'shelf',
          );
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
          assert.equal(
            horizontal.view,
            'shelf',
            'Read returns to the bookshelf before measurement',
          );
          assert.equal(horizontal.room, 'shelf', 'The returned shelf owns the room shell');
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
    `${JSON.stringify({ checks, horizontalSamples, diagnostics, browserVersions }, null, 2)}\n`,
  );
  await host.close();
}
