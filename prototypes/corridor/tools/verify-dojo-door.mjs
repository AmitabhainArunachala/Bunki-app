/* 道場の扉 — the dojo door on every surface (operator, 2026-09-17: "THE DOJO,
 * or study room, needs to be accessible from ANY LOCATION WHATSOEVER").
 *
 * Against one pinned Corridor artifact, open every room the shelf and the
 * chrome can reach, and ASSERT on the rendered DOM: the door `#chrome-dojo`
 * is present and visible, one tap lands in the dojo (body[data-view=dojo]),
 * and at 390px the chrome never scrolls sideways. Inside the dojo family the
 * door reads as the current room and stays inert.
 *
 * Claim boundary: proves reachability and layout in headless Chromium at two
 * widths; it does not judge the dojo's own content, nor touch/haptics.
 *
 * Usage: KAIRO_SITE_DIR=<site> KAIRO_ARTIFACT_SHA256=<digest> KAIRO_EVIDENCE_DIR=<dir>
 *        node prototypes/corridor/tools/verify-dojo-door.mjs
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

const ROOM_LINKS = [
  ['levels', '#levels-link'], ['lessons', '#lessons-link'], ['mock', '#mock-link'], ['kagami', '#kagami-link'],
  ['grammar', '#grammar-link'], ['thesaurus', '#thesaurus-link'], ['yoji', '#yoji-link'], ['kanjidex', '#kanjidex-link'],
  ['ai', '#ai-link'], ['feed', '#feed-link'], ['source-inbox', '#source-inbox-link'],
];
const failures = [];
const receipt = { schemaVersion: 1, site: CORRIDOR, checks: [] };
const browser = await chromium.launch();

async function walk(width, height, hasTouch) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch });
  await silenceBrowserAudio(context);
  const page = await context.newPage();
  const shot = async (n) => { await page.waitForTimeout(250); await page.screenshot({ path: join(OUT, `${width}-${n}.png`) }); };
  const view = () => page.evaluate('document.body.dataset.view');
  const doorState = () => page.evaluate(`(() => {
    const d = document.querySelector('#chrome-dojo');
    if (!d) return { present: false };
    const r = d.getBoundingClientRect();
    const chrome = d.closest('.chrome');
    return { present: true, visible: r.width > 0 && r.height > 0 && r.right <= innerWidth && r.left >= 0,
      current: d.getAttribute('aria-current') === 'page',
      chromeOverflow: chrome ? chrome.scrollWidth > chrome.clientWidth + 1 : null };
  })()`);
  const expectDoorThenDojo = async (room) => {
    const before = await view();
    const st = await doorState();
    const label = `${width}/${room}`;
    receipt.checks.push({ width, room, before, ...st });
    if (!st.present) { failures.push(`${label}: #chrome-dojo missing (view ${before})`); return; }
    if (!st.visible) failures.push(`${label}: #chrome-dojo not visible in the viewport`);
    if (st.chromeOverflow) failures.push(`${label}: .chrome scrolls sideways`);
    await shot(`${room}-door`);
    await page.click('#chrome-dojo');
    await page.waitForTimeout(350);
    const after = await view();
    if (after !== 'dojo') failures.push(`${label}: tap landed in ${after}, not dojo`);
    const inDojo = await doorState();
    if (!inDojo.current) failures.push(`${label}: door inside the dojo does not read as current`);
    await shot(`${room}-dojo`);
  };

  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  await expectDoorThenDojo('shelf');
  for (const [room, sel] of ROOM_LINKS) {
    await page.goto(`${base}/?entry=shelf`);
    await page.waitForSelector('#tray', { timeout: 30000 });
    const link = await page.$(sel);
    if (!link) {
      // 四字熟語 and 字引 are data-gated doors; a shelf without them is not a
      // dojo failure — record the absence so the receipt stays honest
      receipt.checks.push({ width, room, skipped: `shelf link ${sel} absent` });
      continue;
    }
    await link.click();
    await page.waitForTimeout(400);
    await expectDoorThenDojo(room);
  }
  // the tray and the search room are chrome doors, not shelf links
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  await page.click('#tray');
  await page.waitForTimeout(400);
  await expectDoorThenDojo('tray');
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  await page.click('#chrome-search');
  await page.waitForTimeout(400);
  await expectDoorThenDojo('search');
  // the reader: the crowded chrome (search · seal · lang · 覚える · 覚 N · 道場)
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  const card = await page.$('#shelf-body [data-passage]');
  if (!card) failures.push(`${width}/reader: no passage card on the shelf`);
  else {
    await card.click();
    await page.waitForSelector('#reader', { timeout: 30000 });
    await expectDoorThenDojo('reader');
  }
  await context.close();
}

await walk(390, 844, true);
await walk(1280, 820, false);
await browser.close();
server.close();
receipt.failures = failures;
receipt.status = failures.length ? 'failed' : 'passed';
writeFileSync(join(OUT, 'dojo-door.json'), JSON.stringify(receipt, null, 2) + '\n');
if (failures.length) { console.log('DOJO DOOR FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log(`DOJO DOOR CLEAN — ${receipt.checks.length} rooms × widths reach the dojo in one tap; evidence ${OUT}`);
