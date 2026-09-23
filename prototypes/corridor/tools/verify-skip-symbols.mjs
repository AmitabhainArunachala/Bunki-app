/* SKIP の印 — the pattern marks read in ink and the radical wheel stands apart
 * (operator, 2026-09-17: "the left, right, up down and edges need to be shaped
 * in a darker color" · "is it traditional skip methodology? seems confusing").
 *
 * Open the search room, type the code 1-3-8 so the wheel opens, and ASSERT on
 * computed styles and DOM: every pattern mark's edge is ≥2px in the world's ink
 * token; the fourth column carries data-role="filter" with a label that says
 * it is not part of the code.
 *
 * Claim boundary: proves the marks' rendered edge and the filter's labelling
 * in headless Chromium; whether the wheel FEELS cleaner is the operator's eye.
 *
 * Usage: KAIRO_SITE_DIR=<site> KAIRO_ARTIFACT_SHA256=<digest> KAIRO_EVIDENCE_DIR=<dir>
 *        node prototypes/corridor/tools/verify-skip-symbols.mjs
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const CORRIDOR = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const { server, base } = await new Promise((ok, fail) => {
  const s = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const f = resolve(CORRIDOR, rel);
    if (!f.startsWith(CORRIDOR) || !existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  s.once('error', fail);
  s.listen(0, '127.0.0.1', () => ok({ server: s, base: `http://127.0.0.1:${s.address().port}` }));
});

const failures = [];
const receipt = { schemaVersion: 1, site: CORRIDOR };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
await silenceBrowserAudio(context);
const page = await context.newPage();
await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray', { timeout: 30000 });
await page.click('#chrome-search');
await page.waitForSelector('#nav-search-input', { timeout: 30000 });
await page.fill('#nav-search-input', '1-3-8');
await page.waitForSelector('#skip-wheel-search-0', { timeout: 30000 });
await page.waitForTimeout(500);
const probe = await page.evaluate(`(() => {
  const cs = getComputedStyle(document.documentElement);
  const norm = (c) => c.replace(/\\s/g, '');
  const rgb = (hex) => { hex = hex.trim(); if (!hex.startsWith('#')) return norm(hex); const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1); return 'rgb(' + parseInt(h.slice(0,2),16) + ',' + parseInt(h.slice(2,4),16) + ',' + parseInt(h.slice(4,6),16) + ')'; };
  const ink = rgb(cs.getPropertyValue('--ink'));
  const marks = [...document.querySelectorAll('#skip-wheel-search-0 .skip-symbol')].map((m) => {
    const edges = [...m.querySelectorAll('i')].filter((i) => getComputedStyle(i).display !== 'none').map((i) => { const s = getComputedStyle(i); return { width: parseFloat(s.borderTopWidth), color: norm(s.borderTopColor) }; });
    const own = getComputedStyle(m);
    return { cls: m.className, edges, ownBorder: parseFloat(own.borderTopWidth), ownColor: norm(own.borderTopColor), ownBg: norm(own.backgroundColor) };
  });
  const col = document.querySelectorAll('.skip-wheel-column')[3];
  const label = col ? (col.querySelector('.skip-wheel-label')?.textContent || '') : '';
  return { ink, marks, filterRole: col ? col.dataset.role : null, filterClass: col ? col.className : null, label };
})()`);
receipt.probe = probe;
if (!probe.marks.length) failures.push('no pattern marks found in the wheel');
for (const m of probe.marks) {
  const edges = m.edges.length ? m.edges : [{ width: m.ownBorder, color: m.ownColor }];
  for (const e of edges) {
    if (!(e.width >= 2)) failures.push(`${m.cls}: edge ${e.width}px < 2px`);
    if (e.color !== probe.ink) failures.push(`${m.cls}: edge color ${e.color} is not the ink ${probe.ink}`);
  }
  if (/skip-symbol-4/.test(m.cls) && m.ownBg !== probe.ink) failures.push(`solid mark background ${m.ownBg} is not the ink`);
}
if (probe.filterRole !== 'filter') failures.push(`fourth column role is ${probe.filterRole}, not filter`);
if (!/not part of the code|コード外/.test(probe.label)) failures.push(`radical label does not say it is outside the code: "${probe.label}"`);
await page.screenshot({ path: join(OUT, 'skip-wheel.png') });
await browser.close();
server.close();
receipt.failures = failures;
receipt.status = failures.length ? 'failed' : 'passed';
writeFileSync(join(OUT, 'skip-symbols.json'), JSON.stringify(receipt, null, 2) + '\n');
if (failures.length) { console.log('SKIP SYMBOL FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log(`SKIP SYMBOLS CLEAN — ${probe.marks.length} marks in 2px ink, radical column marked as a filter; evidence ${OUT}`);
