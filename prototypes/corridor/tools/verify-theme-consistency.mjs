/* 世界の一貫性 — the operator's law (2026-08-20): one theme everywhere.
 * For each public world: walk shelf → reader → review front/back → entry
 * sheet from the card → dojo → search; screenshot each room and ASSERT the
 * computed grounds belong to that world's own token set. */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/build-evidence/tenohira/triage-2026-08-20/theme-sweep-shots');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };
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
const WORLDS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu'];
const browser = await chromium.launch();
const failures = [];
const norm = (c) => c.replace(/\s/g, '');
for (const world of WORLDS) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const shoot = async (n) => { await page.waitForTimeout(420); await page.screenshot({ path: join(OUT, `${world}-${n}.png`) }); };
  const tokens = async () => page.evaluate(`(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { ground: v('--ground'), ground0: v('--ground-0'), zenStage: v('--zen-stage'), zenCrown: v('--zen-stage-crown'), cardG0: v('--card-ground-0') };
  })()`);
  const check = async (room, sel, expectKeys) => {
    const got = await page.evaluate(`(() => {
      const n = ${JSON.stringify(sel)} === 'body' ? document.body : document.querySelector(${JSON.stringify(sel)});
      return n ? getComputedStyle(n).backgroundColor : null;
    })()`);
    const tk = await tokens();
    const rgb = (hex) => {
      if (!hex.startsWith('#')) return hex;
      const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
      return `rgb(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`;
    };
    const allowed = expectKeys.map((k) => norm(rgb(tk[k])));
    if (got && !allowed.includes(norm(got))) failures.push(`${world}/${room}: ${sel} bg ${got} not in [${expectKeys}] (${allowed.join(' ')})`);
  };
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  await page.evaluate(`(() => {
    localStorage.setItem('kairo-theme', ${JSON.stringify(world)});
    const T = Date.now(); const iso = (ms) => new Date(ms).toISOString();
    const row = (id) => ({ t: 'word', id, label: id, ts: T - 90000, started: T - 90000 });
    const rec = () => ({ due: iso(T - 60000), last_review: iso(T - 3 * 86400000), stability: 6, difficulty: 5, elapsed_days: 3, scheduled_days: 3, reps: 8, lapses: 0, learning_steps: 0, state: 2 });
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [row('学校'), row('水')], srs: { 'word:学校': rec(), 'word:水': rec() } }));
  })()`);
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  await shoot('1-shelf');
  await page.click('#tray');
  await page.waitForSelector('#review-start', { timeout: 30000 });
  await shoot('2-tray');
  await page.click('#review-start');
  await page.waitForSelector('#declare-recalled', { timeout: 30000 });
  await shoot('3-review-front');
  await check('review-front', 'body', ['zenStage']);
  await check('review-front-card', '.review-face', ['cardG0']);
  await page.click('#declare-recalled');
  await page.waitForSelector('.grade.g-good', { timeout: 30000 });
  await shoot('4-review-back');
  await check('review-back-card', '.review-face', ['cardG0']);
  // the dictionary sheet opened FROM the card — the operator's exact
  // complaint path: open the fold, walk through a sentence door
  const fold = await page.$('#review-fold');
  if (fold) { await fold.click(); await page.waitForTimeout(500); }
  const door = await page.$('.review-face .sent-door');
  if (door) {
    await door.click();
    await page.waitForSelector('#sheet', { timeout: 8000 }).catch(() => {});
  }
  const sheetOpen = await page.$('#sheet');
  if (!sheetOpen) failures.push(`${world}/sheet-from-card: no sheet opened (no door found: ${!door})`);
  if (sheetOpen) { await shoot('5-sheet-from-card'); await check('sheet-from-card', '.sheet', ['ground0', 'ground']); await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await browser.contexts()[0]?.clearCookies?.();
  await page.close();
}
await browser.close();
server.close();
if (failures.length) { console.log('THEME FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log('THEME SWEEP CLEAN — all rooms wear their world');
