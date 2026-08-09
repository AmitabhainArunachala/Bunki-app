/**
 * WP1 acceptance 4: the English-under-word state (.tok.has-en) still works.
 *
 * Mounts the gloss row on a run of stem-ruby tokens (the exact tokens that used
 * to tear) and screenshots the result, asserting on the DOM that each one holds
 * a .tok-word row plus a .tok-en row and stays inside one reader line box.
 *
 * Run it against any build file to get a matched pair:
 *   node capture-has-en.mjs --build FIXED.html   --label fixed
 *   node capture-has-en.mjs --build PREFIX.html  --label prefix
 *
 * Usage: node capture-has-en.mjs --build B.html --label L [--shots DIR] [--json OUT.json]
 */
/* global console */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWPORT = { width: 390, height: 844 };
const ARTICLE = 'wikinews:1403';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const buildPath = resolve(arg('--build'));
const label = arg('--label', 'build');
const shotsDir = resolve(arg('--shots', join(HERE, 'shots')));
const jsonOut = arg('--json');
mkdirSync(shotsDir, { recursive: true });

function serveFile(file) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

const { server, base } = await serveFile(buildPath);
const browser = await chromium.launch();
const context = await browser.newContext({ ...VIEWPORT, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/?entry=shelf`, { waitUntil: 'load' });
await page.waitForSelector('.shelf-item');
await page.click(`.shelf-item[data-passage="${ARTICLE}"]`);
await page.waitForSelector('#reader button.tok');
let prev = -1;
for (let i = 0; i < 40; i += 1) {
  const n = await page.evaluate(`document.querySelectorAll('#reader button.tok').length`);
  if (n === prev && n > 0) break;
  prev = n; await page.waitForTimeout(120);
}

await page.evaluate(`window.scrollTo(0, 0)`);
await page.waitForTimeout(150);
await page.screenshot({ path: join(shotsDir, `reader-rest-${label}.png`) });

/* tokens that used to tear: a ruby over the stem with okurigana trailing it */
const picks = await page.evaluate(`(() => {
  const out = [];
  for (const t of document.querySelectorAll('#reader button.tok.content')) {
    const row = t.querySelector('.tok-word') || t;
    const ruby = row.querySelector('ruby');
    if (!ruby) continue;
    let tail = '';
    for (let s = ruby.nextSibling; s; s = s.nextSibling) tail += s.textContent || '';
    if (!tail.trim()) continue;
    const r = t.getClientRects()[0];
    if (!r || r.top < 0 || r.top > 700) continue; // keep them on the first screen
    out.push(t.dataset.index);
    if (out.length >= 6) break;
  }
  return out;
})()`);

async function tapToken(index) {
  const box = await page.evaluate(`(() => {
    const t = document.querySelector('#reader .tok[data-index="${index}"]');
    const r = t.getClientRects()[0] || t.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.w / 2, y: box.y + box.h / 2, radiusX: 6, radiusY: 6, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(140);
}

for (const index of picks) await tapToken(index);
await page.waitForTimeout(200);
await page.screenshot({ path: join(shotsDir, `has-en-${label}.png`) });

const state = await page.evaluate(`(() => {
  const rows = [];
  for (const t of document.querySelectorAll('#reader .tok.has-en')) {
    const r = t.getBoundingClientRect();
    rows.push({
      text: t.textContent,
      hasWordRow: !!t.querySelector(':scope > .tok-word'),
      hasEnRow: !!t.querySelector(':scope > .tok-en'),
      childRows: t.querySelectorAll(':scope > *').length,
      en: t.querySelector('.tok-en')?.textContent ?? null,
      height: Math.round(r.height * 100) / 100,
      display: getComputedStyle(t).display,
    });
  }
  return rows;
})()`);

console.log(`build ${label} — tokens tapped: ${picks.length}, .has-en mounted: ${state.length}`);
for (const s of state) {
  console.log(`  ${s.text.padEnd(14)} display:${s.display} h:${s.height} rows:${s.childRows} wordRow:${s.hasWordRow ? 'y' : 'n'} enRow:${s.hasEnRow ? 'y' : 'n'}  en="${(s.en || '').slice(0, 44)}"`);
}
const tall = state.filter((s) => s.height > 50);
console.log(`  taller than 50px: ${tall.length}`);
console.log(`  console/page errors: ${errors.length}`);
console.log(`  shots → ${join(shotsDir, `has-en-${label}.png`)}`);

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ build: buildPath, label, article: ARTICLE, tapped: picks.length, hasEn: state, tallerThan50: tall.length, errors }, null, 2));

await browser.close();
server.close();
