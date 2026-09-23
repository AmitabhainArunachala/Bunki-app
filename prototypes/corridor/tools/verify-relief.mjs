/* 浮き彫り — the relief pass (operator, 2026-09-18: "make the border of these
 * windows something that has some more pop and contrast … it can be very
 * subtle" · "needs to have more depth and texture" · "makes it hard to see
 * what the sections are for").
 *
 * ASSERT on computed styles in the layered variant (the default): the search
 * panel, the SKIP panel, the shelf's room doors, the study-hall doors and the
 * reader's listen row each carry a visible edge (border ≥1px whose colour is
 * not transparent and not the soft hairline) and a lifting shadow; section
 * eyebrows carry the accent rule. The baseline build fails every one.
 *
 * Claim boundary: rendered edges and shadows exist and differ from the
 * baseline; whether the relief READS well is the operator's eye, from the
 * before/after captures on the walk page. The ten-world theme sweep
 * (verify-theme-consistency.mjs) fails on the baseline too — a fixture
 * importer assertion — and is not evidence either way tonight.
 *
 * Usage: KAIRO_SITE_DIR=<site> KAIRO_ARTIFACT_SHA256=<digest> KAIRO_EVIDENCE_DIR=<dir>
 *        node prototypes/corridor/tools/verify-relief.mjs
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
const receipt = { schemaVersion: 1, site: CORRIDOR, surfaces: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await silenceBrowserAudio(context);
const page = await context.newPage();
// Chromium serialises a color-mix() result as color(srgb r g b / a) and a
// plain colour as rgb()/rgba(); both carry the alpha this check needs.
const EDGE = `(sel) => { const n = document.querySelector(sel); if (!n) return null; const s = getComputedStyle(n);
  const c = s.borderTopColor; let alpha = 0;
  const slash = c.match(/\\/\\s*([0-9.]+)\\s*\\)$/); const rgba = c.match(/rgba\\(([^)]+)\\)/);
  if (slash) alpha = parseFloat(slash[1]); else if (rgba) alpha = parseFloat(rgba[1].split(',')[3]); else if (/^rgb\\(|^color\\(/.test(c)) alpha = 1;
  return { width: parseFloat(s.borderTopWidth), color: c, alpha, shadow: s.boxShadow !== 'none', layered: document.body.classList.contains('v-depth-layered') }; }`;
const check = async (name, sel) => {
  const r = await page.evaluate(`(${EDGE})(${JSON.stringify(sel)})`);
  receipt.surfaces[name] = r;
  if (!r) { failures.push(`${name}: ${sel} not found`); return; }
  if (!(r.width >= 1)) failures.push(`${name}: no border (${r.width}px)`);
  if (!(r.alpha >= 0.25)) failures.push(`${name}: edge too faint (alpha ${r.alpha}, ${r.color})`);
  if (!r.shadow) failures.push(`${name}: no lifting shadow`);
};
const rule = async (name, sel) => {
  const r = await page.evaluate(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; const s = getComputedStyle(n, '::before'); return { content: s.content, height: parseFloat(s.height), bg: s.backgroundColor }; })()`);
  receipt.surfaces[name] = r;
  if (!r || r.content === 'none' || !(r.height >= 2)) failures.push(`${name}: no accent rule on the eyebrow`);
};

await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray', { timeout: 30000 });
await check('shelf room door', '#levels-link');
await rule('shelf section eyebrow', '.eyebrow.shelf-section');
await page.click('#chrome-search');
await page.waitForSelector('#nav-search-input', { timeout: 30000 });
await page.fill('#nav-search-input', '1-3-8');
await page.waitForSelector('.skip-ui', { timeout: 30000 });
await check('search panel', '.search-page');
await check('SKIP panel', '.skip-ui');
await page.screenshot({ path: join(OUT, 'search.png') });
const dojo = await page.$('#chrome-dojo');
if (dojo) { await dojo.click(); await page.waitForTimeout(500); await check('study door', '.study-door'); }
else failures.push('no dojo door (baseline)');
await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray', { timeout: 30000 });
const card = await page.$('#shelf-body [data-passage]');
if (card) { await card.click(); await page.waitForSelector('#reader', { timeout: 30000 }); await page.waitForTimeout(400); await check('listen row', '.listen-row'); await check('reader body', '#reader'); }
await browser.close();
server.close();
receipt.failures = failures;
receipt.status = failures.length ? 'failed' : 'passed';
writeFileSync(join(OUT, 'relief.json'), JSON.stringify(receipt, null, 2) + '\n');
if (failures.length) { console.log('RELIEF FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log(`RELIEF CLEAN — every annotated surface carries an ink edge (≥25% alpha) and a lifting shadow; eyebrows carry the rule; evidence ${OUT}`);
