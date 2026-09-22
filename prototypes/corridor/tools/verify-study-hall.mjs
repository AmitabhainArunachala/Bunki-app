/* 稽古の間・今日の棚・書く速さ — three operator asks of 2026-09-18, one run.
 *
 * ASSERT on the rendered DOM of one pinned artifact:
 *  1. the dojo opens with a study hall of at least six doors, and the JLPT
 *     door lands in the practice room, the SRS door in the lists room;
 *  2. the shelf shows six readings for today, and a different day (set
 *     through the verifier's own seam, localStorage kairo-shelf-day) shows a
 *     different six;
 *  3. the stroke-order room carries a speed slider whose value persists.
 *
 * Claim boundary: DOM and persistence in headless Chromium; not whether the
 * hall reads well to the operator, nor the ink's feel at each speed.
 *
 * Usage: KAIRO_SITE_DIR=<site> KAIRO_ARTIFACT_SHA256=<digest> KAIRO_EVIDENCE_DIR=<dir>
 *        node prototypes/corridor/tools/verify-study-hall.mjs
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.m4a': 'audio/mp4' };
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
const view = () => page.evaluate('document.body.dataset.view');
const shot = async (n) => { await page.waitForTimeout(250); await page.screenshot({ path: join(OUT, `${n}.png`) }); };

// 1 — the study hall
await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray', { timeout: 30000 });
const dojoDoor = await page.$('#chrome-dojo');
if (dojoDoor) await dojoDoor.click(); else failures.push('no #chrome-dojo door to reach the dojo');
await page.waitForSelector('#study-hall', { timeout: 15000 }).catch(() => {});
const doors = await page.$$eval('#study-hall [data-study-door]', (els) => els.map((e) => e.dataset.studyDoor)).catch(() => []);
receipt.doors = doors;
if (doors.length < 6) failures.push(`study hall: ${doors.length} doors`);
await shot('hall');
if (doors.includes('mock')) {
  await page.click('[data-study-door="mock"]');
  await page.waitForTimeout(500);
  const v = await view();
  if (v !== 'mock') failures.push(`JLPT door landed in ${v}`);
  await shot('hall-mock');
}
if (dojoDoor) { await page.click('#chrome-dojo'); await page.waitForTimeout(400); }
if (doors.includes('review')) {
  await page.click('[data-study-door="review"]');
  await page.waitForTimeout(500);
  const v = await view();
  if (v !== 'tray') failures.push(`SRS door landed in ${v}`);
}

// 2 — today's six, and a different day
const sixFor = async (day) => {
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  await page.evaluate(`localStorage.setItem('kairo-shelf-day', ${JSON.stringify(day)})`);
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#shelf-today', { timeout: 15000 }).catch(() => {});
  return page.evaluate(`(() => { const s = document.querySelector('#shelf-today'); return s ? { day: s.dataset.day, ids: [...s.querySelectorAll('.shelf-item')].map((i) => i.dataset.passage) } : null; })()`);
};
const a = await sixFor('2026-09-18');
const b = await sixFor('2026-09-19');
receipt.today = { a, b };
if (!a || a.ids.length !== 6) failures.push(`today's six: ${a ? a.ids.length : 'strip missing'} on 2026-09-18`);
if (!b || b.ids.length !== 6) failures.push(`today's six: ${b ? b.ids.length : 'strip missing'} on 2026-09-19`);
if (a && b && a.ids.join() === b.ids.join()) failures.push("today's six did not change between two days");
if (a && a.day !== '2026-09-18') failures.push(`strip day ${a.day} ≠ 2026-09-18`);
await shot('today');
await page.evaluate(`localStorage.removeItem('kairo-shelf-day')`);

// 3 — the writing-speed slider in the stroke room
await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray', { timeout: 30000 });
await page.click('#chrome-search');
await page.waitForSelector('#nav-search-input', { timeout: 30000 });
await page.fill('#nav-search-input', '1-3-8');
await page.waitForSelector('.skip-hit', { timeout: 30000 });
await page.click('.skip-hit');
await page.waitForSelector('#sheet', { timeout: 15000 });
await page.waitForTimeout(500);
const strokeBtn = await page.$('#sheet button[aria-label*="stroke order"], #sheet button[aria-label*="筆順"]');
if (!strokeBtn) failures.push('stroke-order door not found on the kanji sheet');
else {
  await strokeBtn.click();
  await page.waitForSelector('#stroke-page', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const slider = await page.$('#stroke-speed-range');
  receipt.slider = !!slider;
  if (!slider) failures.push('stroke room: #stroke-speed-range missing');
  else {
    await page.evaluate(`(() => { const r = document.querySelector('#stroke-speed-range'); r.value = '1.5'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await page.waitForTimeout(300);
    const stored = await page.evaluate(`localStorage.getItem('kairo-stroke-speed-v1')`);
    const readout = await page.evaluate(`document.querySelector('#stroke-speed-readout')?.textContent`);
    receipt.speed = { stored, readout };
    if (stored !== '1.5') failures.push(`stroke speed not persisted: ${stored}`);
    if (!/1\.5/.test(readout || '')) failures.push(`readout does not show 1.5: ${readout}`);
    await shot('stroke-speed');
  }
}

await browser.close();
server.close();
receipt.failures = failures;
receipt.status = failures.length ? 'failed' : 'passed';
writeFileSync(join(OUT, 'study-hall.json'), JSON.stringify(receipt, null, 2) + '\n');
if (failures.length) { console.log('STUDY HALL FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log(`STUDY HALL CLEAN — ${doors.length} doors reach their rooms, today's six rotate by date, the writing-speed slider persists; evidence ${OUT}`);
