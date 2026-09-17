/* 検索の間の字引 — every way of finding a kanji, as explicit lenses in the
 * search room (operator, 2026-09-17: "we need the option for skip, for regular
 * word search, radical search, frequency of use search, by grade search, as
 * well as the Kodansha Kanji Learners dictionary NUMBER … for every kanji").
 *
 * Against one pinned artifact, open the search room and ASSERT on the DOM:
 * the lens row names ことば · SKIP · 部品 · 部首 · 手書き · 音訓 · 意味 · 画数 ·
 * 頻度 · 漢検 · Kodansha; 頻度 1–100 lists hits in ascending rank; 漢検 10級
 * lists only 10級 kanji; 部首 radical 1 lists 一; Kodansha number 1 lists the
 * kanji the data file says (川 in the 2013 edition) and typing 遺 shows its
 * numbers. Expected values are read from the artifact's own data files.
 *
 * Claim boundary: proves the lenses exist and filter by the shipped data in
 * headless Chromium; it does not judge the room's feel, handwriting quality,
 * or the 2022 printing's numbering.
 *
 * Usage: KAIRO_SITE_DIR=<site> KAIRO_ARTIFACT_SHA256=<digest> KAIRO_EVIDENCE_DIR=<dir>
 *        node prototypes/corridor/tools/verify-search-lenses.mjs
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

const kkldPath = join(CORRIDOR, 'data/share_alike/kkld.json');
const kkld = existsSync(kkldPath) ? JSON.parse(readFileSync(kkldPath, 'utf8')) : null;
const kanjiTable = JSON.parse(readFileSync(join(CORRIDOR, 'data/share_alike/kanji.json'), 'utf8')).kanji;
const kanjiRows = Array.isArray(kanjiTable) ? kanjiTable : Object.values(kanjiTable);
const kkOf = Object.fromEntries(kanjiRows.map((k) => [k.c, k.kk]));

const failures = [];
const receipt = { schemaVersion: 1, site: CORRIDOR, kkldPresent: !!kkld };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
await silenceBrowserAudio(context);
const page = await context.newPage();
const shot = async (n) => { await page.waitForTimeout(250); await page.screenshot({ path: join(OUT, `${n}.png`) }); };
const lens = async (id) => { await page.click(`[data-search-lens="${id}"]`); await page.waitForTimeout(500); };
const glyphs = () => page.evaluate(`[...document.querySelectorAll('#search-finder .kdx-glyph')].map((g) => ({ c: g.dataset.kdxHit, freq: g.dataset.freq, kk: g.dataset.kk, rad: g.dataset.rad, kkld: g.dataset.kkld }))`);

await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray', { timeout: 30000 });
await page.click('#chrome-search');
await page.waitForSelector('#nav-search-input', { timeout: 30000 });
const names = await page.evaluate(`[...document.querySelectorAll('#search-lenses [data-search-lens]')].map((b) => b.dataset.searchLens)`);
receipt.lenses = names;
for (const need of ['words', 'skip', 'parts', 'radical', 'draw', 'reading', 'meaning', 'strokes', 'freq', 'level', 'kkld']) {
  if (!names.includes(need)) failures.push(`lens missing: ${need}`);
}
await shot('lenses');
if (names.length) {
  // 頻度 — first band, ascending rank
  await lens('freq');
  await page.waitForFunction(`!!document.querySelector('[data-kdx-freq="1"]')`, null, { timeout: 15000 }).catch(() => {});
  const bandBtn = await page.$('[data-kdx-freq="1"]');
  if (!bandBtn) failures.push('頻度: band 1–100 button missing');
  else {
    await bandBtn.click(); await page.waitForTimeout(500);
    const g = await glyphs();
    receipt.freqHits = g.length;
    if (g.length < 50) failures.push(`頻度 1–100: only ${g.length} hits`);
    const ranks = g.map((x) => Number(x.freq));
    if (!ranks.every((r, i) => i === 0 || ranks[i - 1] <= r)) failures.push('頻度: hits not in ascending rank');
    if (ranks.some((r) => !(r >= 1 && r <= 100))) failures.push('頻度: a hit outside 1–100');
    await shot('freq');
  }
  // 漢検 — 10級 only
  await lens('level');
  const lv = await page.$('[data-kdx-kk="10級"]');
  if (!lv) failures.push('漢検: 10級 button missing');
  else {
    await lv.click(); await page.waitForTimeout(500);
    const g = await glyphs();
    receipt.levelHits = g.length;
    if (!g.length) failures.push('漢検 10級: no hits');
    for (const x of g) if (kkOf[x.c] !== '10級') { failures.push(`漢検 10級: ${x.c} is ${kkOf[x.c]}`); break; }
    await shot('level');
  }
  // 部首 — radical 1 (一)
  await lens('radical');
  const r1 = await page.$('[data-kdx-rad="1"]');
  if (!r1) failures.push('部首: radical 1 button missing');
  else {
    await r1.click(); await page.waitForTimeout(500);
    const g = await glyphs();
    receipt.radicalHits = g.length;
    if (!g.some((x) => x.c === '一')) failures.push('部首 1: 一 missing from hits');
    await shot('radical');
  }
  // Kodansha — number → kanji, kanji → numbers
  await lens('kkld');
  await page.waitForFunction(`!!document.querySelector('#kdx-kkld')`, null, { timeout: 15000 }).catch(() => {});
  const field = await page.$('#kdx-kkld');
  if (!field) failures.push('Kodansha: number field missing');
  else if (!kkld) failures.push('Kodansha: data/share_alike/kkld.json missing from the artifact');
  else {
    const expect1 = (kkld.byNumber2013['1'] || [])[0];
    await page.fill('#kdx-kkld', '1'); await page.waitForTimeout(400);
    const g = await glyphs();
    receipt.kkld1 = { expect: expect1, got: g.map((x) => x.c) };
    if (!g.some((x) => x.c === expect1)) failures.push(`Kodansha #1: expected ${expect1}, got ${g.map((x) => x.c).join('')}`);
    await page.fill('#kdx-kkld', '遺'); await page.waitForTimeout(400);
    const text = await page.evaluate(`document.querySelector('#kdx-kkld-results')?.textContent || ''`);
    const n = kkld.entries['遺']?.ed2013;
    receipt.kkldKanji = { expect: n, text: text.slice(0, 120) };
    if (!n || !text.includes(`#${n}`)) failures.push(`Kodansha 遺: expected #${n} in "${text.slice(0, 80)}"`);
    await shot('kkld');
    // the kanji sheet names its entry in the paper dictionary
    const hit = await page.$('#search-finder .kdx-glyph');
    if (hit) {
      await hit.click();
      await page.waitForSelector('#sheet', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(400);
      const sheetText = await page.evaluate(`document.querySelector('#sheet')?.textContent || ''`);
      receipt.sheetChip = sheetText.match(/Kodansha[^·]{0,40}#\\d+/)?.[0] || null;
      if (!/Kodansha/.test(sheetText) || !new RegExp(`#${n}\\b`).test(sheetText)) failures.push(`kanji sheet for 遺 does not name Kodansha #${n}`);
      await shot('sheet');
      await page.keyboard.press('Escape');
    }
  }
}
await browser.close();
server.close();
receipt.failures = failures;
receipt.status = failures.length ? 'failed' : 'passed';
writeFileSync(join(OUT, 'search-lenses.json'), JSON.stringify(receipt, null, 2) + '\n');
if (failures.length) { console.log('SEARCH LENS FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log(`SEARCH LENSES CLEAN — ${names.length} lenses; 頻度, 漢検, 部首 and Kodansha filter by the shipped data; evidence ${OUT}`);
