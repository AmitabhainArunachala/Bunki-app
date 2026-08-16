/**
 * WP1 acceptance 1: across ALL articles at default dials, no button.tok may
 * render taller than 50px. A torn token (ruby element and its okurigana text
 * as sibling flex items in a column) stacks into two rows and blows past it.
 *
 * Measures EVERY token in EVERY article in real Chromium at 390x844 touch and
 * reports the max height plus every offender. Also collects console + page
 * errors for the whole walk.
 *
 * Usage: node measure-token-heights.mjs [--json OUT.json]
 */
/* global console */
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { chromium } from 'playwright-core';

// same static server verify-corridor.mjs uses; inlined because that module
// runs its whole walk on import (it has no main guard).
const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(HERE, '../../../../prototypes/corridor');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
function startCorridorServer(rootDir = CORRIDOR_DIR) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(rootDir, rel);
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

const VIEWPORT = { width: 390, height: 844 };
const LIMIT = 50; // px — a single reader line box is ~45px; 2 stacked rows blow past

const jsonArg = process.argv.indexOf('--json');
const jsonOut = jsonArg > -1 ? process.argv[jsonArg + 1] : null;

const { server, base } = await startCorridorServer();
const browser = await chromium.launch();
const context = await browser.newContext({ ...VIEWPORT, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));

async function gotoShelf() {
  await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await page.waitForSelector('.shelf-item', { timeout: 20000 });
}

await gotoShelf();
const passages = await page.evaluate(
  `[...document.querySelectorAll('.shelf-item')].map((n) => n.dataset.passage)`,
);
console.log(`shelf: ${passages.length} articles`);

const perArticle = [];
const offenders = [];
let maxHeight = 0;
let maxWhere = null;
let totalTokens = 0;
let minHeight = Infinity;
let smallHitTotal = 0;

for (const id of passages) {
  await gotoShelf();
  await page.click(`.shelf-item[data-passage="${id}"]`);
  // tokens arrive after the article JSON is fetched and rendered
  await page.waitForSelector('#reader button.tok', { timeout: 20000 });
  // the article JSON arrives async; wait for the token count to stop moving
  // rather than for a fixed floor (the shortest texts hold under 10 tokens)
  let prev = -1;
  for (let i = 0; i < 40; i += 1) {
    const n = await page.evaluate(`document.querySelectorAll('#reader button.tok').length`);
    if (n === prev && n > 0) break;
    prev = n;
    await page.waitForTimeout(120);
  }
  const data = await page.evaluate(`(() => {
    const toks = [...document.querySelectorAll('#reader button.tok')];
    let max = 0; let maxText = null; let min = Infinity; const bad = [];
    // the immutable law: an interactive token keeps a real 44px hit region via
    // button.tok::before. The wrapper must not shrink it.
    let smallHit = 0;
    for (const t of toks) {
      const h = t.getBoundingClientRect().height;
      if (h > max) { max = h; maxText = t.textContent; }
      if (h < min) min = h;
      if (h > ${LIMIT}) bad.push({ text: t.textContent, h: Math.round(h * 100) / 100, index: t.dataset.index });
      const before = getComputedStyle(t, '::before');
      const hw = parseFloat(before.width); const hh = parseFloat(before.height);
      if (!(hw >= 44 && hh >= 44)) smallHit += 1;
    }
    return {
      count: toks.length, max: Math.round(max * 100) / 100, maxText,
      min: Math.round(min * 100) / 100, smallHit, bad,
    };
  })()`);
  totalTokens += data.count;
  if (data.max > maxHeight) { maxHeight = data.max; maxWhere = { id, text: data.maxText }; }
  for (const b of data.bad) offenders.push({ article: id, ...b });
  if (data.min < minHeight) minHeight = data.min;
  smallHitTotal += data.smallHit;
  perArticle.push({ id, tokens: data.count, maxTokenHeight: data.max, minTokenHeight: data.min, offenders: data.bad.length, hitRegionsUnder44: data.smallHit });
  console.log(
    `  ${data.bad.length === 0 ? 'ok  ' : 'FAIL'} ${id.padEnd(28)} ${String(data.count).padStart(4)} tokens  max ${String(data.max).padStart(6)}px  offenders ${data.bad.length}`,
  );
}

const report = {
  viewport: VIEWPORT,
  limitPx: LIMIT,
  articles: passages.length,
  totalTokens,
  maxTokenHeight: maxHeight,
  maxTokenAt: maxWhere,
  minTokenHeight: minHeight,
  hitRegionsUnder44: smallHitTotal,
  offenderCount: offenders.length,
  offenders: offenders.slice(0, 200),
  consoleErrors,
  pageErrors,
  pass: offenders.length === 0 && smallHitTotal === 0 && consoleErrors.length === 0 && pageErrors.length === 0,
  perArticle,
};

console.log('\n---------------------------------------------');
console.log(`articles          ${passages.length}`);
console.log(`tokens measured   ${totalTokens}`);
console.log(`max token height  ${maxHeight}px  (${maxWhere?.text} in ${maxWhere?.id})`);
console.log(`min token height  ${minHeight}px`);
console.log(`hit regions <44px ${smallHitTotal}   (button.tok::before — the touch-target law)`);
console.log(`offenders >${LIMIT}px   ${offenders.length}`);
if (offenders.length) {
  const uniq = [...new Set(offenders.map((o) => o.text))];
  console.log(`  distinct torn tokens (${uniq.length}): ${uniq.slice(0, 40).join(' ')}`);
}
console.log(`console errors    ${consoleErrors.length}`);
console.log(`page errors       ${pageErrors.length}`);
console.log(`RESULT            ${report.pass ? 'PASS' : 'FAIL'}`);

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));

await browser.close();
server.close();
process.exit(report.pass ? 0 : 1);
