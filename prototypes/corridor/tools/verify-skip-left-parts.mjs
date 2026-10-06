/* 左の部品 — the SKIP wheel's parts column (operator, 2026-09-17: "on the far
 * right side, we want to also be able to see and scroll through the left side
 * particles that appear on the left side of the kanji that CORRELATE WITH
 * THE left stroke order number").
 *
 * Open the search room, type 1-3-8, and ASSERT: a fifth column with
 * data-role="left-parts" lists parts whose stroke count is 3 (氵 among them),
 * choosing 氵 narrows every hit to a kanji that carries 氵, choosing Any
 * restores the full grid, and at 390 px the page itself never scrolls
 * sideways.
 *
 * Claim boundary: the component layer knows parts and their stroke counts,
 * not their position; "left" is the code's first count applied to parts.
 * The column's label says so; this check cannot prove position.
 *
 * Usage: KAIRO_SITE_DIR=<site> KAIRO_ARTIFACT_SHA256=<digest> KAIRO_EVIDENCE_DIR=<dir>
 *        node prototypes/corridor/tools/verify-skip-left-parts.mjs
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

async function run(width, height, hasTouch) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch });
  await silenceBrowserAudio(context);
  const page = await context.newPage();
  const tag = `${width}`;
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  await page.click('#chrome-search');
  await page.waitForSelector('#nav-search-input', { timeout: 30000 });
  await page.fill('#nav-search-input', '1-3-8');
  await page.waitForSelector('#skip-wheel-search-0', { timeout: 30000 });
  await page.waitForTimeout(600);
  const col = await page.$('[data-role="left-parts"]');
  if (!col) { failures.push(`${tag}: parts column missing`); await context.close(); return; }
  const info = await page.evaluate(`(() => {
    const col = document.querySelector('[data-role="left-parts"]');
    const label = col.querySelector('.skip-wheel-label')?.textContent || '';
    const options = [...col.querySelectorAll('.skip-wheel-option')].map((o) => o.querySelector('.skip-option-value')?.textContent || o.textContent.trim());
    const hits = [...document.querySelectorAll('.skip-hit')].map((h) => ({ c: h.dataset.skipHit, parts: h.dataset.parts || '' }));
    return { label, options, hits: hits.length, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  })()`);
  receipt[tag] = { label: info.label, options: info.options.slice(0, 12), hitsBefore: info.hits, pageOverflow: info.pageOverflow };
  if (!/3/.test(info.label)) failures.push(`${tag}: label does not name the count 3: "${info.label}"`);
  if (!info.options.includes('氵')) failures.push(`${tag}: 氵 not offered among 3-stroke parts (got ${info.options.slice(0, 8).join(' ')})`);
  if (info.pageOverflow) failures.push(`${tag}: page scrolls sideways with five wheels`);
  await page.screenshot({ path: join(OUT, `${tag}-column.png`) });
  const opt = await page.$('[data-role="left-parts"] .skip-wheel-option[aria-label^="氵"]');
  if (!opt) { failures.push(`${tag}: 氵 option not clickable`); await context.close(); return; }
  await opt.click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(`[...document.querySelectorAll('.skip-hit')].map((h) => ({ c: h.dataset.skipHit, parts: h.dataset.parts || '' }))`);
  receipt[tag].hitsAfter = after.length;
  receipt[tag].sample = after.slice(0, 8).map((h) => h.c).join('');
  if (!after.length) failures.push(`${tag}: no hits after choosing 氵`);
  if (after.length >= info.hits) failures.push(`${tag}: choosing 氵 did not narrow (${info.hits} → ${after.length})`);
  for (const h of after) if (!h.parts.includes('氵')) { failures.push(`${tag}: ${h.c} shown without 氵`); break; }
  await page.screenshot({ path: join(OUT, `${tag}-narrowed.png`) });
  const anyOpt = await page.$('[data-role="left-parts"] .skip-wheel-option');
  if (anyOpt) { await anyOpt.click(); await page.waitForTimeout(600); }
  const restored = await page.evaluate(`document.querySelectorAll('.skip-hit').length`);
  receipt[tag].hitsRestored = restored;
  if (restored !== info.hits) failures.push(`${tag}: Any did not restore (${info.hits} → ${restored})`);
  await context.close();
}

await run(1280, 820, false);
await run(390, 844, true);
await browser.close();
server.close();
receipt.failures = failures;
receipt.status = failures.length ? 'failed' : 'passed';
writeFileSync(join(OUT, 'skip-left-parts.json'), JSON.stringify(receipt, null, 2) + '\n');
if (failures.length) { console.log('LEFT PARTS FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log(`LEFT PARTS CLEAN — the parts column lists the 3-stroke parts among the 1-3-8 hits, 氵 narrows, Any restores, no sideways page scroll at 390; evidence ${OUT}`);
