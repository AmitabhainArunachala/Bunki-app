/* global process, document, console */
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
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const results = [];

for (const deck of ['mine', 'mcd'])
  for (const theme of ['light', 'nightMode'])
    for (const face of ['front', 'back']) {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 } }),
        p = await c.newPage();
      const html = readFileSync(`${out}/anki-render-${deck}-${face}.html`, 'utf8');
      await p.setContent(
        `<html lang="ja"><body class="card ${theme === 'nightMode' ? theme : ''}">${html}</body></html>`,
      );
      await p.screenshot({ path: `${out}/anki-${deck}-${theme}-${face}.png`, fullPage: true });
      let a = await new AxeBuilder({ page: p }).include('.km').analyze();
      results.push({
        deck,
        theme,
        face,
        scrollWidth: await p.evaluate(() => document.documentElement.scrollWidth),
        violations: a.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        })),
      });
      await c.close();
    }
writeFileSync(`${out}/anki-browser-results.json`, JSON.stringify(results, null, 2));
await browser.close();
server.close();
console.log(results);
