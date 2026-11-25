// Exercise real text settings and persisted lexical text across Bunki's public rooms.
// KAIRO_SITE_DIR=<built app> KAIRO_BROWSER=webkit|chromium|all node prototypes/corridor/tools/test-reading-size.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';

const host = process.env.KAIRO_SITE_DIR
  ? await import('../../bunki-desktop/lib/static-host.cjs').then(({ default: api }) => api.startStaticHost({site: process.env.KAIRO_SITE_DIR, port: 0}))
  : null;
const origin = host?.origin || process.env.BUNKI_READING_URL;
assert(origin, 'Supply a built site or a running local app.');
const engines = process.env.KAIRO_BROWSER === 'all' || !process.env.KAIRO_BROWSER ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER];
const evidence = process.env.KAIRO_EVIDENCE_DIR;
if (evidence) await mkdir(evidence, { recursive: true });
const metrics = [];
try {
  for (const name of engines) {
    const browser = await ({ chromium, webkit })[name].launch({
      ...(name === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
    try {
      for (const theme of ['hokusai', 'yoru']) {
        // An existing appearance, in an otherwise empty learner profile.
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        try {
          await ctx.addInitScript((theme) => localStorage.setItem('kairo-theme', theme), theme);
          const page = await ctx.newPage();
          page.setDefaultTimeout(90000);
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          const visible = (selector) => page.locator(selector).first().waitFor();
          const font = (selector) => page.locator(selector).first().evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
          const checked = (value) => page.locator(`button[data-reading-size="${value}"]`).getAttribute('aria-pressed');
          const shot = async (key) => {
            if (evidence) await page.screenshot({ path: join(evidence, `${name}-${theme}-${key}.png`) });
          };
          const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
          const article = '[data-passage="wikinews:12024"] .shelf-open';
          const token = '#reader .tok.content';
          const word = page.locator(token).first();
          await page.goto(`${origin}/?entry=shelf&ui=bi&layout=current`);
          await page.waitForFunction(() => document.body?.dataset.ready === '1');
          if (await page.locator('.pl-intro-ok').isVisible()) await page.locator('.pl-intro-ok').click();
          await page.locator(article).first().click();
          await visible(token);
          // First-use reader help is attached at the end of the view transition.
          await page.locator('#dials-toggle').waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await font(token), 21);
          const systemType = await page.addStyleTag({content: 'html { font-size: 200%; }'});
          assert.equal(await font(token), 42);
          assert.equal(await font('#reader .tok.content ruby rt'), 21);
          assert(await fits());
          await systemType.evaluate(sheet => sheet.remove());
          const toggle = page.locator('#dials-toggle');
          await toggle.focus();
          await toggle.press('Enter');
          assert(await toggle.evaluate(n => n === document.activeElement));
          assert.equal(await checked(100), 'true');
          const furigana = page.locator('[data-dial="furigana:2"]');
          await furigana.focus();
          await furigana.press('Enter');
          await visible('#reader.fg-always');
          assert(await furigana.evaluate(n => n === document.activeElement));
          const sizeButton = page.locator('button[data-reading-size="125"]');
          await sizeButton.focus();
          await sizeButton.press('Enter');
          assert.equal(await checked(125), 'true');
          assert(await sizeButton.evaluate((n) => document.activeElement === n));
          assert.equal(await font(token), 26.25);
          await page.locator('button[data-reading-size="150"]').click();
          await shot('controls');
          await page.locator('#dials-toggle').click();
          const prose = [];
          for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1024, 768], [1440, 900]]) {
            await page.setViewportSize({ width, height });
            await word.evaluate(n => n.scrollIntoView({ block: 'center' }));
            const sizes = await word.evaluate((n) => {
              const ruby = n.querySelector('ruby'), reading = ruby.querySelector('rt');
              const rect = reading.getBoundingClientRect();
              return { base: parseFloat(getComputedStyle(ruby).fontSize), ruby: parseFloat(getComputedStyle(reading).fontSize),
                rubyWidth: rect.width, shown: getComputedStyle(reading).display !== 'none' };
            });
            assert.deepEqual([sizes.base, sizes.ruby], width === 844 ? [34.5, 17.25] : [31.5, 15.75]);
            assert(sizes.shown && sizes.rubyWidth > 0 && await fits(), `ruby and layout at ${width}px`);
            prose.push({ width, height, ...sizes });
            await shot(`article-${width}`);
          }
          await page.setViewportSize({width: 390, height: 844});
          for (let i = 0; i < 4 && !await page.locator('#mini .mini-word').isVisible(); i++) {
            const rung = await word.getAttribute('data-ladder-rung');
            await word.click();
            await page.waitForFunction(({ token, rung }) =>
              document.querySelector('#mini .mini-word') || document.querySelector(token)?.getAttribute('data-ladder-rung') !== rung, { token, rung });
          }
          const slip = await font('#mini .mini-word');
          assert.equal(slip, 36);
          await shot('quick-lookup');
          await page.locator('#mini .mini-word').click();
          await visible('#sheet .reading');
          const entry = await Promise.all(['.headword', '.reading', '.gloss', '.example-ja'].map(s => font('#sheet '+s)));
          assert.deepEqual(entry, [57, 31.5, 27, 31.5]);
          await shot('entry');
          await page.locator('#sheet-take').click();
          await page.locator('#vocabulary-list-popover.is-drawer #mini-review').click();
          await page.waitForFunction(() => document.querySelector('#sheet-take')?.getAttribute('aria-pressed') === 'true');
          await page.goto(`${origin}/?room=tray&ui=bi`);
          await visible('.tray-line[data-kept-key="word:新聞"] .w');
          const saved = await font('.tray-line[data-kept-key="word:新聞"] .w');
          assert.equal(saved, 31.5);
          await page.locator('#tab-words').click();
          await page.locator('#nav-search-input').fill('新聞');
          await visible('.nav-search-row .nsr-glyph');
          const search = await font('.nav-search-row .nsr-glyph');
          assert.equal(search, 31.5);
          assert(await page.locator('.search-page-results .nav-search-row').evaluateAll(rows => rows.every(row => {
            const box = row.getBoundingClientRect();
            return [...row.children].every(node => {
              const child = node.getBoundingClientRect();
              return child.left >= box.left && child.right <= box.right + 1;
            });
          })), 'search keeps each result inside its row');
          await shot('dictionary');
          await page.locator('#tab-me').click();
          await page.locator('#me-settings').click();
          assert.equal(await checked(150), 'true');
          await page.locator('button[data-reading-size="100"]').click();
          assert.equal(await page.evaluate(() => document.documentElement.dataset.readingSize), '100');
          assert.deepEqual(errors, []);
          metrics.push({name, version: browser.version(), theme, prose, slip, entry, saved, search, system200: 42});
          console.log('PASS', name, theme, 'reader → lookup → save → dictionary → settings');
        } finally { await ctx.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  if (evidence) await writeFile(join(evidence, 'reading-size.json'), JSON.stringify(metrics, null, 2) + '\n');
  await host?.close();
}
