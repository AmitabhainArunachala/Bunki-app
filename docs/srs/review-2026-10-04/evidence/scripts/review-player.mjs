/* global process, localStorage, document, console */
// Run from repository root; set REVIEW_EVIDENCE_OUT to an existing scratch directory.
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { AxeBuilder } from '@axe-core/playwright';
const repo = process.cwd(),
  out = process.env.REVIEW_EVIDENCE_OUT;
mkdirSync(out, { recursive: true });
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
};
const server = createServer((req, res) => {
  let p = resolve(repo, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p)) {
    res.writeHead(404);
    return res.end('404');
  }
  res.setHeader('Content-Type', types[extname(p)] || 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const themes = ['dark', 'ai', 'matcha', 'kokuban', 'washi', 'sakura', 'light', 'contrast'];
const modes = ['read', 'self', 'choice'];
const results = [];
for (const deck of ['kotoba-mine', 'kotoba-mcd'])
  for (const mode of modes)
    for (const theme of themes) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      });
      await ctx.addInitScript(
        ({ deck, mode, theme }) =>
          localStorage.setItem(
            `bunki-cloze:prefs:v3:${deck}`,
            JSON.stringify({ mode, look: theme }),
          ),
        { deck, mode, theme },
      );
      let page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(
        `${base}/decks/kotoba-mine/release/${deck === 'kotoba-mcd' ? 'study-mcd' : 'study'}.html`,
      );
      await page.locator('#kp-start').click();
      for (const face of ['front', 'back']) {
        if (face === 'back') {
          if (mode === 'choice') {
            await page.locator('.kp-choice').first().click();
          } else await page.locator('#kp-reveal').click();
        }
        await page.screenshot({
          path: `${out}/${deck}-${mode}-${theme}-${face}.png`,
          fullPage: true,
        });
        const metrics = await page.evaluate(() => {
          const r = (n) => {
            let b = n.getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom };
          };
          return {
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            card: r(document.querySelector('#kp-card')),
            term: document.querySelector('.kp-term')?.textContent,
            gloss: document.querySelector('.kp-gloss')?.textContent,
            grade: [...document.querySelectorAll('.kp-grade,.kp-next,.kp-reveal')].map((n) => ({
              text: n.textContent,
              ...r(n),
            })),
            blank: document.querySelector('.kp-blank')?.textContent,
          };
        });
        const axe = await new AxeBuilder({ page }).include('.kp').analyze();
        results.push({
          deck,
          mode,
          theme,
          face,
          metrics,
          errors,
          violations: axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
          })),
        });
      }
      await ctx.close();
    }
writeFileSync(`${out}/matrix-results.json`, JSON.stringify(results, null, 2));
await browser.close();
server.close();
console.log(
  'screenshots',
  results.length,
  'violations',
  results
    .filter((x) => x.violations.length)
    .map((x) => [x.deck, x.mode, x.theme, x.face, x.violations.map((v) => v.id)]),
);
