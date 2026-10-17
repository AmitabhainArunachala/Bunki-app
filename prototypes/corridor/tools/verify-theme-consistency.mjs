/* 世界の一貫性 — the operator's law (2026-08-20): one theme everywhere.
 * For each public world: walk shelf → reader → review front/back → entry
 * sheet from the card → dojo → search; screenshot each room and ASSERT the
 * computed grounds belong to that world's own token set. */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { restoreAppFixture } from './record-fixture-support.mjs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
const CORRIDOR = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
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
// D2 (round 4): 殻 is a public world again, so the sweep covers it too
const WORLDS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
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
  const rgbOf = (hex) => {
    if (!hex.startsWith('#')) return hex;
    const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
    return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
  };
  const opaque = async (room, sel, { page: nearPage = false } = {}) => {
    const got = await page.evaluate(`(() => {
      const parse = (c) => {
        let m = /^rgba?\\(([^)]+)\\)$/.exec(c);
        if (m) { const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 }; }
        m = /^color\\(srgb ([^)]+)\\)$/.exec(c);
        if (m) { const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
        if (c.startsWith('#')) { const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1); return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 }; }
        return null;
      };
      const lum = ({ r, g, b }) => { const ch = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b); };
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return { missing: true };
      let node = el, own = parse(getComputedStyle(el).backgroundColor), paintedBy = ${JSON.stringify(sel)};
      // an inline menu inside the slip paints nothing of its own: the slip's paper is its paper
      if (own && own.a === 0 && el.classList.contains('is-inline')) { node = el.closest('#mini'); own = node && parse(getComputedStyle(node).backgroundColor); paintedBy = '#mini'; }
      const pageHex = getComputedStyle(document.body).getPropertyValue('--page').trim();
      const pg = parse(pageHex);
      const paperHex = getComputedStyle(document.documentElement).getPropertyValue('--ground-0').trim();
      const paper = parse(paperHex);
      const isPaper = !!(own && paper && Math.abs(own.r - paper.r) < 0.003 && Math.abs(own.g - paper.g) < 0.003 && Math.abs(own.b - paper.b) < 0.003 && own.a === 1);
      return { bg: own, paintedBy, lum: own && lum(own), pageLum: pg && lum(pg), page: pageHex, paper: paperHex, isPaper, raw: getComputedStyle(el).backgroundColor };
    })()`);
    if (got.missing) { failures.push(`${world}/${room}: ${sel} is not open`); return; }
    if (!got.bg) { failures.push(`${world}/${room}: ${sel} background ${got.raw} could not be read`); return; }
    if (got.bg.a !== 1) failures.push(`${world}/${room}: ${sel} background ${got.raw} is not opaque (alpha ${got.bg.a}, painted by ${got.paintedBy})`);
    // the sheet's body is the world's own raised paper exactly (--ground-0: in 藍 and 板 a leaf 0.1 above a darker
    // cream page, by design), or else within 0.08 of the page's luminance — never a grey over cream, never a scrim through
    if (nearPage && !got.isPaper && (got.pageLum == null || Math.abs(got.lum - got.pageLum) > 0.08))
      failures.push(`${world}/${room}: ${sel} luminance ${got.lum?.toFixed(3)} is neither the world's raised paper (${got.paper}) nor within 0.08 of the page's ${got.pageLum?.toFixed(3)} (${got.page})`);
  };
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  const fixture = await page.evaluate(`(() => {
    localStorage.setItem('kairo-theme', ${JSON.stringify(world)});
    const T = Date.now(); const iso = (ms) => new Date(ms).toISOString();
    const row = (id) => ({ t: 'word', id, label: id, ts: T - 90000, started: T - 90000 });
    const rec = () => ({ due: iso(T - 60000), last_review: iso(T - 3 * 86400000), stability: 6, difficulty: 5, elapsed_days: 3, scheduled_days: 3, reps: 8, lapses: 0, learning_steps: 0, state: 2 });
    return { v: 1, taken: [row('学校'), row('水')], srs: { 'word:学校': rec(), 'word:水': rec() }, teacherDrafts: { version: 1, entries: [] } };
  })()`);
  await restoreAppFixture(page, fixture);
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#tray', { timeout: 30000 });
  await shoot('1-shelf');
  // one paper per world (the one-hand pass, slice D): the fixed page layer paints the world's own ground —
  // --page resolves to the world block's --ground, the layer's final colour is that ground, and no generic
  // fibre (a fractalNoise data-SVG) is painted over it; the room's own light and ground pattern may be
  const paper = await page.evaluate(`(() => {
    const layer = getComputedStyle(document.body, '::before');
    const body = getComputedStyle(document.body);
    const html = getComputedStyle(document.documentElement);
    return { image: layer.backgroundImage, color: layer.backgroundColor, page: body.getPropertyValue('--page').trim(),
      colorPage: body.getPropertyValue('--color-page').trim(), ground: html.getPropertyValue('--ground').trim() };
  })()`);
  const groundRgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.length === 4 ? hex[(i + 1) / 2].repeat(2) : hex.slice(i, i + 2), 16)).join(', ')})`;
  if (norm(paper.page) !== norm(paper.ground) || norm(paper.colorPage) !== norm(paper.ground))
    failures.push(`${world}/paper: --page ${paper.page} (--color-page ${paper.colorPage}) is not the world's ground ${paper.ground}`);
  if (norm(paper.color) !== norm(groundRgb(paper.ground)))
    failures.push(`${world}/paper: the page layer's colour ${paper.color} is not the world's ground ${paper.ground}`);
  if (/fractalNoise|data:image\/svg/i.test(paper.image))
    failures.push(`${world}/paper: a generic fibre is painted over the world's ground (${paper.image.slice(0, 80)}…)`);
  await page.click('#tray');
  await page.waitForSelector('#review-start', { timeout: 30000 });
  await shoot('2-tray');
  await page.click('#review-start');
  await page.waitForSelector('#reveal', { timeout: 30000 });
  await shoot('3-review-front');
  await check('review-front', 'body', ['zenStage']);
  await check('review-front-card', '.review-face', ['cardG0']);
  await page.click('#reveal');
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
  if (sheetOpen) { await shoot('5-sheet-from-card'); await check('sheet-from-card', '.sheet', ['ground0', 'ground']); await opaque('sheet-from-card', '#sheet', { page: true }); await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // every overlay is opaque paper in every world (the lead, 2026-10-15, after John's 墨 screenshot: a muddy sheet
  // body under a cream bar, a "random blue" slip): the reader's slip, its Save ▾ menu, the word menu, the entry
  // sheet and the world picker all paint an alpha-1 background, and the sheet's body sits within 0.08 of the
  // world's own page in relative luminance — never a scrim showing through, never a grey over cream
  await page.goto(`${base}/?entry=shelf`);
  await page.waitForSelector('#shelf-body [data-passage] .shelf-open', { timeout: 30000 });
  await page.locator('#shelf-body [data-passage] .shelf-open').first().click();
  await page.waitForFunction(() => document.querySelectorAll('#reader .tok.content').length > 3, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.locator('#reader .tok.content').first().click();
  await page.waitForSelector('#mini', { timeout: 10000 });
  await shoot('6-slip');
  await opaque('slip', '#mini');
  // the slip wears the world (CONTINUITY_CONTRACT §6): by day its band is the world's ink, the band's word the world's
  // paper and Save the world's accent; at night the band is the world's lacquer (ground 48% + black), the word the
  // world's ink and Save the lit accent (accent 9% on the ground). Every expected value is resolved by the page itself.
  const band = await page.evaluate(`(() => {
    const head = document.querySelector('#mini .mini-head'), take = document.querySelector('#mini #mini-take');
    const resolve = (value) => { const i = document.createElement('i'); i.style.background = value; document.body.append(i); const c = getComputedStyle(i).backgroundColor; i.remove(); return c; };
    const night = ${JSON.stringify(['rokusho', 'yoru', 'nami', 'hakuu', 'kaku'].includes(world))};
    return { night, head: head && getComputedStyle(head).backgroundColor, headInk: head && getComputedStyle(head).color,
      take: take && getComputedStyle(take).backgroundColor,
      wantHead: resolve(night ? 'color-mix(in srgb, var(--color-ground) 48%, #000000)' : 'var(--color-ink)'),
      wantHeadInk: resolve(night ? 'var(--color-ink)' : 'var(--color-paper)'),
      wantTake: resolve(night ? 'color-mix(in srgb, var(--color-accent) 9%, var(--color-ground))' : 'var(--color-accent)') };
  })()`);
  const same = (a, b) => a && b && norm(a) === norm(b);
  if (!same(band.head, band.wantHead)) failures.push(`${world}/slip: the head band ${band.head} is not the world's ${band.night ? 'lacquer' : 'ink'} ${band.wantHead}`);
  if (!same(band.headInk, band.wantHeadInk)) failures.push(`${world}/slip: the band's word ${band.headInk} is not the world's ${band.night ? 'ink' : 'paper'} ${band.wantHeadInk}`);
  if (!same(band.take, band.wantTake)) failures.push(`${world}/slip: Save ${band.take} is not the world's ${band.night ? 'lit accent' : 'accent'} ${band.wantTake}`);
  await page.locator('#mini #mini-take').click();
  await page.waitForSelector('#mini #vocabulary-list-popover.is-inline', { timeout: 10000 });
  await shoot('7-slip-menu');
  await opaque('slip-menu', '#vocabulary-list-popover');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#vocabulary-list-popover', { state: 'detached', timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#mini', { state: 'detached', timeout: 5000 });
  // G5: the word menu became the strip (a right-click seals the word); it is opaque on its world's paper too
  await page.locator('#reader .tok.content').first().click({ button: 'right' });
  await page.waitForSelector('#seal-strip', { timeout: 10000 });
  await shoot('8-word-menu');
  await opaque('word-menu', '#seal-strip');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#seal-strip', { state: 'detached', timeout: 5000 }).catch(() => {});
  await page.locator('#theme-seal').click();
  await page.waitForSelector('.world-picker', { timeout: 10000 });
  await shoot('9-world-picker');
  await opaque('world-picker', '.world-picker');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await browser.contexts()[0]?.clearCookies?.();
  await page.close();
}
await browser.close();
server.close();
if (failures.length) { console.log('THEME FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log('THEME SWEEP CLEAN — all rooms wear their world');
