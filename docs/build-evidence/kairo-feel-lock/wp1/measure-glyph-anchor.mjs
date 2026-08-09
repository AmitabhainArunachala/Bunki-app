/**
 * WP1 acceptance 3: the base glyph of a token must not move as the token
 * changes activation state. Budget: <= 0.5px.
 *
 * Two dial paths are walked, because they exercise different code:
 *
 *   default dials (furigana:2) — ruby is already up, so activation 1 mounts
 *     the English gloss row. Exercises the render-time wrapper.
 *   furigana:0 (?dials=0,0,0) — activation 1 BUILDS ruby on the spot through
 *     paintTok's rebuild branch, activation 2 mounts the gloss. This is the
 *     path the wrapper had to keep working.
 *
 * The glyph is measured with a DOM Range over the first base character (the
 * first non-<rt> text node inside .tok-word), not the token's border box: the
 * border box legitimately grows when a gloss mounts, the glyph must not move.
 * Coordinates are document-absolute and nothing scrolls between the three
 * samples of a token, so a delta is a real glyph movement.
 *
 * Usage: node measure-glyph-anchor.mjs [--json OUT.json]
 */
/* global console */
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(HERE, '../../../../prototypes/corridor');
const VIEWPORT = { width: 390, height: 844 };
const BUDGET = 0.5; // px
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
    response.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

/* Injected into the page: the glyph probe. */
const PROBE = `
window.__glyphRect = (index) => {
  const tok = document.querySelector('#reader .tok[data-index="' + index + '"]');
  if (!tok) return null;
  const row = tok.querySelector('.tok-word') || tok;
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.parentElement && n.parentElement.closest('rt')) continue;
    if (!n.textContent.trim()) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    r.setEnd(n, 1); // the FIRST base character only — that is the anchor
    const b = r.getBoundingClientRect();
    const box = tok.getBoundingClientRect();
    return {
      x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height,
      // witnesses that the activation actually landed — a 0px shift is only
      // meaningful if the state really changed between samples
      hasRuby: !!row.querySelector('ruby'),
      hasEn: !!tok.querySelector('.tok-en'),
      lit: tok.classList.contains('lit'),
      tokH: +box.height.toFixed(2),
      rows: tok.querySelectorAll(':scope > *').length,
    };
  }
  return null;
};
window.__stemRubyTokens = () => {
  const out = [];
  for (const tok of document.querySelectorAll('#reader button.tok.content')) {
    // tolerate the pre-fix DOM (no .tok-word) so this same probe can be run
    // against the unfixed tree for comparison
    const row = tok.querySelector('.tok-word') || tok;
    const ruby = row.querySelector('ruby');
    if (!ruby) continue;
    // okurigana: a real text node trailing the ruby inside the same row
    let tail = '';
    for (let s = ruby.nextSibling; s; s = s.nextSibling) tail += s.textContent || '';
    if (!tail.trim()) continue;
    out.push({ index: tok.dataset.index, text: tok.textContent, tail: tail.trim() });
  }
  return out;
};
`;

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

/* ---- pick stem-ruby token indices from the default (ruby-up) render ----
 * stem-ruby tokens are only identifiable while ruby is up, so they are chosen
 * from the furigana:2 render and the same indices are reused on furigana:0. */
await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
await page.waitForSelector('.shelf-item');
await page.click('.shelf-item[data-passage="wikinews:1403"]');
await page.waitForSelector('#reader button.tok');
let prev = -1;
for (let i = 0; i < 40; i += 1) {
  const n = await page.evaluate(`document.querySelectorAll('#reader button.tok').length`);
  if (n === prev && n > 0) break;
  prev = n; await page.waitForTimeout(120);
}
await page.evaluate(PROBE);
const stem = await page.evaluate(`window.__stemRubyTokens()`);
console.log(`stem-ruby tokens found in wikinews:1403 — ${stem.length}`);
const picks = stem.slice(0, 8);
console.log(`measuring ${picks.length}: ${picks.map((p) => p.text).join(' ')}\n`);

const results = [];

async function measurePath(label, query, stateNames) {
  console.log(`— ${label}`);
  const rows = [];
  for (const pick of picks) {
    await page.goto(`${base}/index.html?entry=shelf${query}`, { waitUntil: 'load' });
    await page.waitForSelector('.shelf-item');
    await page.click('.shelf-item[data-passage="wikinews:1403"]');
    await page.waitForSelector('#reader button.tok');
    let p2 = -1;
    for (let i = 0; i < 40; i += 1) {
      const n = await page.evaluate(`document.querySelectorAll('#reader button.tok').length`);
      if (n === p2 && n > 0) break;
      p2 = n; await page.waitForTimeout(120);
    }
    await page.evaluate(PROBE);
    // bring it on screen ONCE; nothing scrolls again, so deltas are real
    await page.evaluate(`document.querySelector('#reader .tok[data-index="${pick.index}"]').scrollIntoView({ block: 'center' })`);
    await page.waitForTimeout(120);

    const samples = [];
    samples.push({ state: stateNames[0], rect: await page.evaluate(`window.__glyphRect(${pick.index})`) });
    for (let s = 1; s < stateNames.length; s += 1) {
      await tapToken(pick.index);
      samples.push({ state: stateNames[s], rect: await page.evaluate(`window.__glyphRect(${pick.index})`) });
    }
    const a = samples[0].rect;
    let maxDx = 0; let maxDy = 0;
    for (const s of samples.slice(1)) {
      maxDx = Math.max(maxDx, Math.abs(s.rect.x - a.x));
      maxDy = Math.max(maxDy, Math.abs(s.rect.y - a.y));
    }
    // A 0px shift is only evidence if the state really changed. Two of the
    // stem-ruby verbs here (突き出る, 際する) carry no dictionary entry, so no
    // gloss row can ever mount for them — a content gap, not a layout result.
    // They are still measured (their furigana transition is real) but they do
    // not count toward the "gloss row mounted" quorum.
    const last = samples[samples.length - 1].rect;
    const first = samples[0].rect;
    const glossMounted = last.hasEn === true && first.hasEn === false;
    const rubyAppeared = stateNames.includes('furigana')
      ? samples[1].rect.hasRuby === true && first.hasRuby === false
      : true;
    const stateChanged = glossMounted && rubyAppeared;

    const row = {
      token: pick.text, index: pick.index,
      samples: samples.map((s) => ({
        state: s.state, x: +s.rect.x.toFixed(3), y: +s.rect.y.toFixed(3),
        hasRuby: s.rect.hasRuby, hasEn: s.rect.hasEn, tokH: s.rect.tokH, childRows: s.rect.rows,
      })),
      maxDx: +maxDx.toFixed(3), maxDy: +maxDy.toFixed(3),
      glossMounted, rubyAppeared, stateChanged,
      withinBudget: maxDx <= BUDGET && maxDy <= BUDGET,
      pass: maxDx <= BUDGET && maxDy <= BUDGET && rubyAppeared,
    };
    rows.push(row);
    const witness = row.samples.map((s) => `${s.state}[ruby:${s.hasRuby ? 'y' : 'n'} en:${s.hasEn ? 'y' : 'n'} h:${s.tokH} kids:${s.childRows}]`).join(' → ');
    const tag = row.glossMounted ? '' : '  (no dict entry — gloss row cannot mount)';
    console.log(`  ${row.pass ? 'ok  ' : 'FAIL'} ${pick.text.padEnd(12)} dx ${String(row.maxDx).padStart(6)}  dy ${String(row.maxDy).padStart(6)}  ${witness}${tag}`);
  }
  const worst = rows.reduce((m, r) => Math.max(m, r.maxDx, r.maxDy), 0);
  const withGloss = rows.filter((r) => r.glossMounted).length;
  const quorum = withGloss >= 5;
  console.log(`  worst shift on this path: ${worst.toFixed(3)}px · tokens that actually mounted a gloss row: ${withGloss}/${rows.length} (need >=5)\n`);
  results.push({
    path: label, query, budget: BUDGET, worst: +worst.toFixed(3),
    tokensWithGlossMounted: withGloss, quorum, rows,
    pass: rows.every((r) => r.pass) && quorum,
  });
}

await measurePath('default dials (furigana:2) — rest → English gloss', '', ['rest', 'gloss']);
await measurePath('furigana:0 dial — rest → furigana reveal → English gloss', '&dials=0,0,0', ['rest', 'furigana', 'gloss']);

const report = {
  viewport: VIEWPORT, budgetPx: BUDGET, article: 'wikinews:1403',
  tokensMeasured: picks.map((p) => p.text),
  paths: results,
  consoleErrors, pageErrors,
  pass: results.every((r) => r.pass) && consoleErrors.length === 0 && pageErrors.length === 0,
};
console.log('---------------------------------------------');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.path} — worst ${r.worst}px`);
console.log(`console errors ${consoleErrors.length} · page errors ${pageErrors.length}`);
console.log(`RESULT ${report.pass ? 'PASS' : 'FAIL'}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));

await browser.close();
server.close();
process.exit(report.pass ? 0 : 1);
