/**
 * Hfix-2e part 2 · three items, each red on the base and green on this branch, on one pinned build (KAIRO_SITE_DIR +
 * KAIRO_ARTIFACT_SHA256) in the one engine KAIRO_BROWSER names: WebKit at 390×844 with touch (and 320×568 where a row needs
 * the narrow phone), Chromium at 1440×900 with a mouse (the Mac), and Chromium at the two phone sizes for X-13.
 *
 *   X13   on a phone, 層 resting at the foot (the layers closed) never stands over the reading. Through the whole of a long
 *         article (知床, wikinews:1403) at 390×844 and 320×568, at every scroll stop: no reading token's box, nor its 44 px
 *         press region, inside the open glass (between the frame at the top and whatever stands at the foot: the tab bar,
 *         the reader's dock) meets 層's box, and a press at any visible token's centre near 層 lands on the token, not on
 *         層. 層 stays reachable: shown, 44×44, the top thing at its own centre, and one press opens the layers and one folds
 *         them home. On the Mac (1440×900) the mark, its box and its styles are exactly the base's. Round 2 (the critic's
 *         shape 1): in hokusai, yoru and sumi at 390×844 and 320×568 the dock is the tab bar's own surface (the same
 *         colour and paint, the pixels either side of the seam the same, no hairline or shade between them), 層 is 44×44
 *         at the bar's right end inside the dock, and its disc reads at 3:1 or more against the bar's pixels around it;
 *         the dock fades away as the layers open and back as they fold (two frames or more between, one way, by 450 ms),
 *         and under reduced motion it goes and comes at once.
 *   G61   a reading folded away on touch fades: the frames after the fold (Escape) show it fading (opacity strictly between
 *         0.05 and 0.95 on ≥ 3 frames, never rising, its box gone by 400 ms); the line never moves while it fades (every
 *         other word of its paragraph within 0.5 px, its overhang kept) and comes back to the fresh layout; the reveal
 *         stands at once (its first frame at full opacity), as on the base; at rest after a fold the document is 320 wide at
 *         320 (fresh, revealed and folded; revealed at 390 then folded at 320; folded at 390 then shown at 320); the 599
 *         token press regions of 知床 at 320 are the base's, before and after a fold; the fold writes nothing to the record
 *         (the whole native snapshot, not one field stripped, with the scroll captured on both sides of Escape); under
 *         reduced motion the conceal stays instant. Run only at a 1-minute load of 20 or less (recorded).
 *   NAMI  in nami, the idioms label on the shelf tools' door (button#yoji-link > span.l-ja) and "Practice it"
 *         (button#entry-sentence-practice > span.l-ja) read at 4.6:1 or more, at rest and under a pointer, measured by the
 *         contrast sweep's own pixel method (verify-contrast-sweep.mjs, unchanged; only its navigation is replaced).
 *
 * HFIX2E2_MODE: branch (every row green) · base (the two files this lane changed, editorial.css and corridor.js, are served
 * at the base commit, so base and branch are judged by the same rows on the same server, as verify-hfix2b does) · control
 * (HFIX2E2_CONTROL names one defect put back by a route-mutated file; its rows must go red):
 *   x13   the reader's dock is not drawn while 層 rests at the foot           → X13.cover must go red
 *   look  round 1's dock: a raised strip of its own, the Line's hairline between, the disc ringless → X13.look must go red
 *   snap  the dock appears and goes in one frame                                → X13.fade must go red
 *   fade  the folded reading's transition is dropped (the base's instant conceal) → G61.fade must go red
 *   seat  the fold unseats its reading at once, while it still fades            → G61.still must go red
 *   nami  nami's label ink is not declared (the accent, #8fb3d1, again)         → NAMI must go red
 * A control whose mutation does not apply exactly once stops the run. HFIX2E2_CASE=X13|G61|NAMI (comma-separated) runs a
 * part. The fold row's machine load is read before it starts; above 20 the row is not run and counts as a failure.
 */
/* global window, document, getComputedStyle, innerWidth, innerHeight, visualViewport, performance, MutationObserver,
   requestAnimationFrame, NodeFilter */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const engine = process.env.KAIRO_BROWSER;
assert(['webkit', 'chromium'].includes(engine), 'Choose exactly one engine (KAIRO_BROWSER=webkit|chromium)');
const mode = process.env.HFIX2E2_MODE || 'branch';
assert(['base', 'branch', 'control'].includes(mode), `unknown HFIX2E2_MODE ${mode}`);
const CONTROL = process.env.HFIX2E2_CONTROL || '';
assert(mode === 'control' ? ['x13', 'look', 'snap', 'fade', 'seat', 'nami'].includes(CONTROL) : !CONTROL, 'HFIX2E2_CONTROL names one control, and only in control mode');
const BASE_SHA = process.env.HFIX2E2_BASE_SHA || '1f790977';
// HFIX2E2_SERVE_DIR: serve this build's two files from a directory instead of the site's own (a check of this lane's change
// on another lane's build before the two are merged, e.g. Ladder's site with this lane's hunks applied to its two files)
const SERVE_DIR = process.env.HFIX2E2_SERVE_DIR || '';
const ONLY = (process.env.HFIX2E2_CASE || '').split(',').map((s) => s.trim()).filter(Boolean);
assert(ONLY.every((c) => ['X13', 'G61', 'NAMI'].includes(c)), `unknown HFIX2E2_CASE ${ONLY}`);
const runs = (item) => !ONLY.length || ONLY.includes(item);
const NAMI_VIEWPORT = process.env.HFIX2E2_NAMI_VIEWPORT || 'phone';
assert(['phone', 'desktop'].includes(NAMI_VIEWPORT) && !(NAMI_VIEWPORT === 'desktop' && engine === 'webkit'), `bad HFIX2E2_NAMI_VIEWPORT ${NAMI_VIEWPORT}`);
const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const identity = JSON.parse(readFileSync(join(process.env.KAIRO_SITE_DIR, 'build-identity.json'), 'utf8'));
const load = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
const load1 = () => Number(execFileSync('sysctl', ['-n', 'vm.loadavg'], { encoding: 'utf8' }).trim().replace(/[{}]/gu, '').trim().split(/\s+/u)[0]);
const sha = (text) => createHash('sha256').update(text).digest('hex');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const STORY = 'wikinews:1403'; // 知床: 17 paragraphs, the long article the X-13 walk and G6's 599 press regions are taken on

/* ---------------------------------------------------------------- what the base serves, and the controls */
const FILES = { 'editorial.css': 'prototypes/corridor/editorial.css', 'corridor.js': 'prototypes/corridor/corridor.js' };
const baseText = new Map();
const atBase = (file) => {
  if (!baseText.has(file)) baseText.set(file, execFileSync('git', ['show', `${BASE_SHA}:${FILES[file]}`], { cwd: REPO, maxBuffer: 1 << 29 }).toString('utf8'));
  return baseText.get(file);
};
const DOCK = "body[data-view='reader']:not(.zen):has(#layers-mark):not(:has(.listen-row.play-bar[data-open='true'])) #app::after {\n    display: block;\n";
const MUTATIONS = {
  x13: [['editorial.css', DOCK, DOCK.replace('display: block;', 'display: none;')]],
  // round 2's look put back to round 1's: the dock a raised strip of its own, the Line's hairline between them, the disc ringless
  look: [['editorial.css', '    background-color: var(--color-bar);\n    background-image: var(--tone-line-paint);\n', '    background-color: var(--raised);\n    background-image: none;\n'],
    ['editorial.css', '    border-top-color: transparent;\n    box-shadow: none;\n', ''],
    ['editorial.css', '    box-shadow: inset 0 0 0 1px var(--color-bar-quiet);\n', '    box-shadow: none;\n']],
  // the dock appears and goes in one frame
  snap: [['editorial.css', DOCK + '    transition: opacity var(--motion-room) var(--ease-standard);\n', DOCK]],
  fade: [['editorial.css', '  transition: opacity var(--motion-fast) var(--ease-exit), display var(--motion-fast) allow-discrete;\n', '']],
  seat: [['corridor.js', '  if (touchReadingFading(rt)) return;\n', '']],
  nami: [['editorial.css', '{ --color-accent-label: #a8c4db; }', '{ }']],
};
const mutated = [];
/** The bytes a session is served for one of the two files: the base's, or this build's with the control's defect put back.
 * A control that does not apply exactly once is an error, never a silent green. */
function served(file, text, bytes) {
  if (bytes === 'base') return atBase(file);
  const own = SERVE_DIR ? readFileSync(join(SERVE_DIR, file), 'utf8') : text;
  let body = own;
  if (bytes === 'control') for (const [f, from, to] of MUTATIONS[CONTROL]) {
    if (f !== file) continue;
    assert.equal(body.split(from).length, 2, `control ${CONTROL}: "${from.slice(0, 60)}" must be in ${file} exactly once`);
    body = body.replace(from, to);
    mutated.push({ control: CONTROL, file, original: sha(own), served: sha(body) });
  }
  return body;
}
// in branch mode a session is served this build; in base mode the base's two files; in control mode the control's defect
const BYTES = mode === 'base' ? 'base' : mode === 'control' ? 'control' : 'branch';

const BRIDGE = `
window.__H2E2__ = {
  open: async (id) => { try { removeMini(); } catch {} S.stack = []; const p = D.passages.find((x) => x.id === id); if (!p) return false; await ensureArticle(p); openPassage(p.id); window.scrollTo(0, 0); return true; },
};`;

/* ---------------------------------------------------------------- the harness */
const host = await startCorridorDev(0);
const browser = await ({ webkit, chromium }[engine]).launch();
const version = browser.version();
const results = [];
console.log(`engine ${engine} ${version} · mode ${mode}${CONTROL ? ` (${CONTROL})` : ''} · build ${identity.gitSha} · artifact ${identity.artifactSha256}${SERVE_DIR ? ` · its two files served from ${SERVE_DIR}` : ''} · base ${BASE_SHA}`);
console.log(`load at start: ${load()}`);

const PHONE = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const MAC = { isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
async function session({ width, height, device, bytes = BYTES, reduced = false, world = 'hokusai' }) {
  const context = await browser.newContext({ viewport: { width, height }, ...device, serviceWorkers: 'block', timezoneId: 'Asia/Tokyo',
    colorScheme: 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await silenceBrowserAudio(context);
  await context.addInitScript((w) => {
    try { localStorage.setItem('kairo-theme', w); localStorage.setItem('kairo-word-ladder-demo-v1', '1'); localStorage.setItem('kairo-tip-reader-v1', '1'); } catch { /* private */ }
  }, world);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.fallback() : route.abort()));
  for (const file of Object.keys(FILES)) {
    await context.route(new RegExp(`/${file.replace('.', '\\.')}(\\?.*)?$`, 'u'), async (route) => {
      const response = await route.fetch();
      let body = served(file, await response.text(), bytes);
      if (file === 'corridor.js') body += BRIDGE;
      await route.fulfill({ response, body });
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error).slice(0, 240)));
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.__H2E2__, null, { timeout: 60_000 });
  return { context, page, errors };
}
async function openStory(page, id = STORY) {
  assert(await page.evaluate((x) => window.__H2E2__.open(x), id), `the story ${id} opens`);
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await delay(900);
}
const frames = (page, n = 2) => page.evaluate((k) => new Promise((done) => { let i = 0; const tick = () => (++i >= k ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
async function row(name, item, body) {
  const before = load();
  let pass = false; let detail = null; let error = null;
  try {
    detail = await body();
    pass = true;
  } catch (problem) {
    error = String(problem.stack || problem).split('\n').slice(0, 4).join(' | ');
    detail = problem.detail ?? null;
  }
  results.push({ name, item, pass, detail, error, before, after: load() });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${error ? `  — ${error.slice(0, 600)}` : ''}`);
}
async function shot(page, name) { await page.screenshot({ path: join(out, `${engine}-${mode}${CONTROL ? `-${CONTROL}` : ''}-${name}.png`) }).catch(() => {}); }

/* ---------------------------------------------------------------- X13 */
/** One scroll stop: 層's box against every reading token's box and press region inside the open glass. */
const coverAt = (page) => page.evaluate(() => {
  const mark = document.getElementById('layers-mark');
  const m = mark?.getBoundingClientRect();
  const ms = mark && getComputedStyle(mark);
  const fixedEdge = (selector, side) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const style = getComputedStyle(node);
    if (!['fixed', 'sticky'].includes(style.position) || style.display === 'none') return null;
    const box = node.getBoundingClientRect();
    return box.height ? box[side] : null;
  };
  // the reader's dock (#app::after): where it is drawn it is the foot of the open glass
  const app = document.getElementById('app'), dockStyle = app && getComputedStyle(app, '::after');
  const dock = dockStyle && dockStyle.display !== 'none' && dockStyle.position === 'fixed' && dockStyle.content !== 'none' && Number(dockStyle.opacity) >= 0.99
    ? { top: innerHeight - parseFloat(dockStyle.bottom) - parseFloat(dockStyle.height), bottom: innerHeight - parseFloat(dockStyle.bottom),
      background: dockStyle.backgroundColor } : null;
  const top = Math.max(0, fixedEdge('#app > .chrome', 'bottom') ?? 0, fixedEdge('#app > .scale-thread', 'bottom') ?? 0);
  const foot = Math.min(innerHeight, fixedEdge('#primary-tabs', 'top') ?? innerHeight, fixedEdge('.listen-row', 'top') ?? innerHeight, dock?.top ?? innerHeight);
  const glass = { top, bottom: foot, left: 0, right: innerWidth };
  const clip = (b) => ({ left: Math.max(b.left, glass.left), right: Math.min(b.right, glass.right), top: Math.max(b.top, glass.top), bottom: Math.min(b.bottom, glass.bottom) });
  const meet = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0.5 && h > 0.5 ? { w: +w.toFixed(1), h: +h.toFixed(1) } : null; };
  const shown = !!m && m.width > 0 && ms.display !== 'none' && ms.visibility === 'visible';
  const over = [], press = [], hits = [];
  let tokens = 0;
  for (const tok of document.querySelectorAll('#reader .tok')) {
    const text = (tok.textContent || '').trim().slice(0, 10);
    for (const b of tok.getClientRects()) {
      const part = clip(b);
      if (part.right - part.left <= 0.5 || part.bottom - part.top <= 0.5) continue;
      tokens += 1;
      if (!shown) continue;
      const o = meet(part, m);
      if (o) over.push({ text, ...o });
      // a press at the visible part's centre, where it is near the mark: the token takes it, never 層
      if (part.bottom > m.top - 60 && part.top < m.bottom + 60) {
        const hit = document.elementFromPoint((part.left + part.right) / 2, (part.top + part.bottom) / 2);
        if (hit && mark.contains(hit)) hits.push({ text });
      }
    }
    // its 44 px press region (the ::before reach), inside the open glass
    const reach = getComputedStyle(tok, '::before');
    if (shown && reach.content !== 'none' && reach.position === 'absolute') {
      const b = tok.getBoundingClientRect(), w = parseFloat(reach.width), h = parseFloat(reach.height);
      if (w > 0 && h > 0) {
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const o = meet(clip({ left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 }), m);
        if (o) press.push({ text, ...o });
      }
    }
  }
  const centre = shown ? document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2) : null;
  return { y: Math.round(window.scrollY), shown, mark: shown ? [m.left, m.top, m.right, m.bottom].map((v) => +v.toFixed(1)) : null,
    size: shown ? [m.width, m.height] : null, reachable: !!centre && mark.contains(centre), glass: [glass.top, glass.bottom].map((v) => +v.toFixed(1)), dock,
    tokens, over, press, hits };
});

async function x13Walk(width, height) {
  await row(`X13.cover · ${engine} ${width}×${height} · through the whole of 知床, 層 at rest never stands over a reading token or its press region, and stays reachable`, 'X13', async () => {
    const { context, page, errors } = await session({ width, height, device: PHONE });
    try {
      await openStory(page);
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      const step = Math.round(height / 4);
      const stops = [];
      for (let y = 0; y <= max + step - 1; y += step) {
        await page.evaluate((top) => window.scrollTo(0, top), Math.min(y, max));
        await frames(page, 2);
        await delay(40);
        stops.push(await coverAt(page));
      }
      await page.evaluate((top) => window.scrollTo(0, top), Math.round(max / 2));
      await frames(page, 2);
      await shot(page, `X13-${width}x${height}-mid`);
      const covered = stops.filter((s) => s.over.length || s.press.length || s.hits.length);
      const unreachable = stops.filter((s) => !s.shown || !s.reachable || s.size?.[0] !== 44 || s.size?.[1] !== 44);
      const detail = { stops: stops.length, scrollMax: max, covered: covered.length, unreachable: unreachable.length,
        firstCovered: covered.slice(0, 3).map((s) => ({ y: s.y, mark: s.mark, glass: s.glass, over: s.over.slice(0, 4), press: s.press.slice(0, 4), hits: s.hits.slice(0, 4) })),
        sample: stops[Math.floor(stops.length / 2)] && { ...stops[Math.floor(stops.length / 2)], over: undefined, press: undefined, hits: undefined },
        tokensSeen: stops.reduce((n, s) => n + s.tokens, 0), errors };
      const words = new Set(covered.flatMap((s) => [...s.over, ...s.press, ...s.hits].map((o) => o.text)));
      Object.assign(detail, { wordsUnder: words.size, stopsWithBox: covered.filter((s) => s.over.length).length,
        stopsWithReach: covered.filter((s) => s.press.length).length, stopsWithPress: covered.filter((s) => s.hits.length).length });
      const fail = (message) => { const problem = new Error(message); problem.detail = detail; throw problem; };
      if (!(stops.length >= 8 && max > height * 3)) fail(`the walk covers a long article: ${JSON.stringify(detail)}`);
      if (unreachable.length) fail(`層 is shown, 44×44 and the top thing at its own centre at every stop: ${JSON.stringify(unreachable.slice(0, 2))}`);
      if (covered.length) fail(`層 stands over the reading at ${covered.length} of ${stops.length} stops (${words.size} words): ${JSON.stringify(detail.firstCovered)}`);
      if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
      return detail;
    } finally { await context.close(); }
  });
  await row(`X13.reach · ${engine} ${width}×${height} · mid-article one press on 層 opens the layers and one folds them home`, 'X13', async () => {
    const { context, page, errors } = await session({ width, height, device: PHONE });
    try {
      await openStory(page);
      await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) / 2)));
      await frames(page, 2); await delay(200);
      const home = await page.evaluate(() => { const r = document.getElementById('layers-mark').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
      await page.locator('#layers-mark').tap();
      await page.locator('#reader-layers').waitFor({ timeout: 6000 });
      await delay(450);
      const open = await page.evaluate(() => ({ pressed: document.getElementById('layers-mark').getAttribute('aria-pressed'), docked: !!document.getElementById('layers-mark').dataset.docked,
        dock: getComputedStyle(document.getElementById('app'), '::after').display }));
      await page.locator('#layers-mark').tap();
      await delay(500);
      const back = await page.evaluate(() => { const m = document.getElementById('layers-mark'), r = m.getBoundingClientRect();
        return { block: !!document.getElementById('reader-layers'), pressed: m.getAttribute('aria-pressed'), docked: !!m.dataset.docked, box: [r.left, r.top, r.width, r.height],
          dock: getComputedStyle(document.getElementById('app'), '::after').display }; });
      const detail = { home, open, back, errors };
      assert(open.pressed === 'true' && open.docked, `one press opens the layers, 層 in their corner: ${JSON.stringify(detail)}`);
      assert(!back.block && back.pressed === 'false' && !back.docked && back.box.every((v, i) => Math.abs(v - home[i]) <= 1), `one press folds them, 層 home: ${JSON.stringify(detail)}`);
      assert.deepEqual(errors, [], 'no page error');
      return detail;
    } finally { await context.close(); }
  });
}
/** The Mac: the mark, its box, its styles, the dock's absence and the first screen's words, served this build and the base. */
async function x13Mac() {
  await row(`X13.mac · ${engine} 1440×900 · on the Mac 層, its box and its styles, and the reading around it, are exactly the base's`, 'X13', async () => {
    const facts = {};
    for (const [side, bytes] of [['base', 'base'], ['build', BYTES]]) {
      const { context, page, errors } = await session({ width: 1440, height: 900, device: MAC, bytes });
      try {
        await openStory(page);
        await page.evaluate(() => window.scrollTo(0, 1200)); await frames(page, 2); await delay(200);
        facts[side] = { errors, ...await page.evaluate(() => {
          const mark = document.getElementById('layers-mark'), r = mark.getBoundingClientRect(), s = getComputedStyle(mark);
          const dock = getComputedStyle(document.getElementById('app'), '::after');
          return { box: [r.left, r.top, r.width, r.height], style: [s.position, s.right, s.bottom, s.zIndex, s.display, s.backgroundColor, s.color, s.borderRadius].join(' | '),
            dock: [dock.display, dock.height].join(' '), words: [...document.querySelectorAll('#reader .tok[data-index]')].slice(0, 120).map((t) => { const b = t.getBoundingClientRect(); return [+b.left.toFixed(2), +b.top.toFixed(2)]; }) };
        }) };
      } finally { await context.close(); }
    }
    const { base, build } = facts;
    assert.deepEqual(build.box, base.box, `the box: ${JSON.stringify({ base: base.box, build: build.box })}`);
    assert.equal(build.style, base.style, 'the styles');
    assert.equal(build.dock, base.dock, 'the dock');
    assert.deepEqual(build.words, base.words, 'the reading around it');
    assert.deepEqual([...base.errors, ...build.errors], [], 'no page error');
    return { base: { box: base.box, style: base.style, dock: base.dock }, build: { box: build.box, style: build.style, dock: build.dock }, words: build.words.length };
  });
}

/* ---------------------------------------------------------------- X13 round 2: how the dock looks, and how it comes and goes */
/** A screenshot's pixels (8-bit RGB or RGBA, not interlaced: what Playwright writes). */
function decodePng(buffer) {
  let at = 8, width = 0, height = 0, type = 0;
  const idat = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at), kind = buffer.toString('ascii', at + 4, at + 8), data = buffer.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9];
      assert(data[8] === 8 && data[12] === 0, 'PNG: 8-bit, not interlaced');
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    at += 12 + length;
  }
  const channels = type === 6 ? 4 : type === 2 ? 3 : 0;
  assert(channels, `PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, rgb = Buffer.alloc(width * height * 3);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels] : 0, b = previous[x], c = x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = value & 255;
    }
    for (let x = 0; x < width; x += 1) for (let k = 0; k < 3; k += 1) rgb[(y * width + x) * 3 + k] = line[x * channels + k];
    previous = line;
  }
  return { width, height, at: (x, y) => { const i = (Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))) * 3; return [rgb[i], rgb[i + 1], rgb[i + 2]]; } };
}
/** A computed colour, rgb()/rgba() or color(srgb …), as [r, g, b, alpha] on 0–255. */
function parseColor(text) {
  let m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/u.exec(String(text));
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])];
  m = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+))?\s*\)/u.exec(String(text));
  if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] == null ? 1 : Number(m[4])];
  return null;
}
const luminance = ([r, g, b]) => { const f = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrastOf = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
const channelGap = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const median = (list) => { const sorted = [...list].sort((p, q) => p - q); return sorted[Math.floor(sorted.length / 2)]; };

async function x13Look(world, width, height) {
  await row(`X13.look · ${engine} ${world} ${width}×${height} · the dock is the tab bar's own surface, one bar with no line between them; 層 at its right end, its disc at 3:1 or more against it`, 'X13', async () => {
    const { context, page, errors } = await session({ width, height, device: PHONE, world });
    try {
      await openStory(page);
      await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) / 2)));
      await frames(page, 2); await delay(450);
      const f = await page.evaluate(() => {
        const tabs = document.getElementById('primary-tabs'), ts = getComputedStyle(tabs), tr = tabs.getBoundingClientRect();
        const a = getComputedStyle(document.getElementById('app'), '::after');
        const m = document.getElementById('layers-mark'), ms = getComputedStyle(m), mr = m.getBoundingClientRect();
        const bug = document.querySelector('#bunki-reports-root .br-rail')?.getBoundingClientRect();
        return { dpr: window.devicePixelRatio, vw: innerWidth, theme: document.documentElement.dataset.theme || 'hokusai',
          tabs: { top: tr.top, bg: ts.backgroundColor, image: ts.backgroundImage, border: ts.borderTopColor, shadow: ts.boxShadow },
          dock: { display: a.display, opacity: Number(a.opacity), bg: a.backgroundColor, image: a.backgroundImage,
            top: innerHeight - parseFloat(a.bottom) - parseFloat(a.height), bottom: innerHeight - parseFloat(a.bottom) },
          mark: { box: [mr.left, mr.top, mr.right, mr.bottom], fill: ms.backgroundColor, ring: ms.boxShadow, ink: ms.color },
          bug: bug ? [bug.left, bug.top, bug.right, bug.bottom] : null };
      });
      const png = decodePng(await page.screenshot({ type: 'png' }));
      await shot(page, `X13-look-${world}-${width}x${height}`);
      const dpr = f.dpr, seam = f.tabs.top;
      const drawn = f.dock.display !== 'none' && f.dock.opacity >= 0.99 && Math.abs(f.dock.bottom - seam) <= 1;
      // one surface: the same colour and the same paint, and the pixels either side of the seam the same
      const xs = [];
      for (let x = 6; x < Math.min(f.bug?.[0] ?? f.vw, f.mark.box[0]) - 8; x += 3) xs.push(x);
      const across = xs.map((x) => channelGap(png.at(x * dpr, (seam - 3) * dpr), png.at(x * dpr, (seam + 3) * dpr)));
      const evenAcross = across.filter((g) => g <= 3).length / Math.max(1, across.length);
      // no line between them: each device row across the seam reads as the rows either side of it
      const rowColour = (y) => [0, 1, 2].map((k) => median(xs.map((x) => png.at(x * dpr, y)[k])));
      const outside = [rowColour((seam - 6) * dpr), rowColour((seam + 6) * dpr)];
      const lines = [];
      for (let y = Math.round((seam - 2) * dpr); y <= Math.round((seam + 2) * dpr); y += 1) {
        const c = rowColour(y), gap = Math.min(channelGap(c, outside[0]), channelGap(c, outside[1]));
        if (gap > 3) lines.push({ y: +(y / dpr).toFixed(1), colour: c, gap });
      }
      // 層's disc against the bar: its ring (or, with none, its fill) against the bar's pixels just outside it
      const boundary = parseColor(/(?:rgba?|color)\([^)]*\)/u.exec(f.mark.ring)?.[0]) ?? parseColor(f.mark.fill);
      const cx = (f.mark.box[0] + f.mark.box[2]) / 2, cy = (f.mark.box[1] + f.mark.box[3]) / 2;
      const around = [];
      for (let deg = 0; deg < 360; deg += 20) {
        const x = cx + 26 * Math.cos((deg * Math.PI) / 180), y = cy + 26 * Math.sin((deg * Math.PI) / 180);
        if (y > f.dock.top + 1.5 && y < f.dock.bottom - 1.5 && x > 1 && x < f.vw - 1) around.push(png.at(x * dpr, y * dpr));
      }
      const discContrast = boundary && around.length ? Math.min(...around.map((c) => contrastOf(boundary.slice(0, 3), c))) : 0;
      const seated = f.mark.box[2] - f.mark.box[0] === 44 && f.mark.box[3] - f.mark.box[1] === 44 && f.vw - f.mark.box[2] <= 8
        && f.mark.box[1] >= f.dock.top - 0.5 && f.mark.box[3] <= f.dock.bottom + 0.5;
      const borderGone = (parseColor(f.tabs.border)?.[3] ?? 1) === 0 && f.tabs.shadow === 'none';
      const detail = { world: f.theme, drawn, dock: { ...f.dock, image: f.dock.image.slice(0, 90) }, tabs: { ...f.tabs, image: f.tabs.image.slice(0, 90) },
        sameColour: f.dock.bg === f.tabs.bg, samePaint: f.dock.image === f.tabs.image, evenAcross: +evenAcross.toFixed(3), worstAcross: Math.max(0, ...across),
        lines, outside, borderGone, ring: f.mark.ring, boundary: boundary?.map((v) => Math.round(v)), discContrast: +discContrast.toFixed(2), samples: around.length,
        mark: f.mark.box, seated, errors };
      const fail = (message) => { const problem = new Error(message); problem.detail = detail; throw problem; };
      if (f.theme !== world) fail(`the world is ${world}: ${f.theme}`);
      if (!drawn) fail(`the dock stands on the tab bar: ${JSON.stringify(detail.dock)}`);
      if (!detail.sameColour || !detail.samePaint) fail(`the dock wears the tab bar's colour and paint: ${JSON.stringify({ dock: detail.dock, tabs: detail.tabs })}`);
      if (evenAcross < 0.9) fail(`the pixels either side of the seam are the same (${Math.round(evenAcross * 100)} % of ${across.length} columns within 3/255)`);
      if (lines.length || !borderGone) fail(`no hairline or shade between the dock and the tab bar: ${JSON.stringify({ lines, borderGone })}`);
      if (!(discContrast >= 3)) fail(`層's disc reads at 3:1 or more against the bar: ${detail.discContrast}`);
      if (!seated) fail(`層 is 44×44 at the bar's right end, inside the dock: ${JSON.stringify({ mark: f.mark.box, dock: [f.dock.top, f.dock.bottom], vw: f.vw })}`);
      if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
      return detail;
    } finally { await context.close(); }
  });
}

async function x13Fade(reduced) {
  await row(`X13.fade · ${engine} 390×844${reduced ? ' (reduced motion)' : ''} · ${reduced ? 'the dock goes and comes back at once' : 'the dock fades away as the layers open and back as they fold, in the chrome\'s beat'}`, 'X13', async () => {
    const { context, page, errors } = await session({ width: 390, height: 844, device: PHONE, reduced });
    try {
      await openStory(page);
      await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) / 2)));
      await frames(page, 2); await delay(450);
      const watch = (ms) => page.evaluate((ms) => {
        const app = document.getElementById('app'), mark = document.getElementById('layers-mark');
        const rec = { start: performance.now(), change: null, frames: [] };
        new MutationObserver(() => { if (rec.change == null) rec.change = performance.now(); }).observe(mark, { attributes: true, attributeFilter: ['data-docked'] });
        window.__h2e2dock = rec;
        const tick = () => { rec.frames.push([performance.now(), Number(getComputedStyle(app, '::after').opacity), getComputedStyle(app, '::after').display]); if (performance.now() - rec.start < ms) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }, ms);
      const read = () => page.evaluate(() => { const r = window.__h2e2dock, at = r.change;
        return { change: at == null ? null : Math.round(at - r.start), frames: r.frames.map(([t, o, d]) => [Math.round(t - (at ?? r.start)), +o.toFixed(3), d]) }; });
      await watch(800); await delay(60);
      await page.locator('#layers-mark').tap();
      await delay(850);
      const open = await read();
      await watch(800); await delay(60);
      await page.locator('#layers-mark').tap();
      await delay(850);
      const fold = await read();
      const judge = (rec, from, to) => {
        const before = rec.frames.filter(([t]) => t < 0).at(-1), after = rec.frames.filter(([t]) => t >= 0);
        const shownBefore = !!before && before[2] !== 'none' && Math.abs(before[1] - from) < 0.01;
        const between = after.filter(([, o, d]) => d !== 'none' && o > 0.05 && o < 0.95);
        const turned = after.filter(([, o], k) => k && (to > from ? o < after[k - 1][1] - 0.001 : o > after[k - 1][1] + 0.001));
        const done = after.find(([, o]) => Math.abs(o - to) < 0.01);
        return { change: rec.change, shownBefore, first: after[0] ?? null, between: between.length, turned: turned.length, doneAt: done?.[0] ?? null,
          frames: after.slice(0, 16) };
      };
      const opened = judge(open, 1, 0), folded = judge(fold, 0, 1);
      const detail = { opened, folded, errors };
      const fail = (message) => { const problem = new Error(message); problem.detail = detail; throw problem; };
      for (const [name, j, to] of [['as the layers open', opened, 0], ['as they fold', folded, 1]]) {
        if (j.change == null) fail(`${name}: 層 never moved`);
        if (!j.shownBefore) fail(`${name}: the dock stood as it should before the change: ${JSON.stringify(j)}`);
        if (reduced) {
          if (!j.first || Math.abs(j.first[1] - to) >= 0.01) fail(`${name}: at once under reduced motion: ${JSON.stringify(j)}`);
        } else if (j.between < 2 || j.turned || j.doneAt == null || j.doneAt > 450) fail(`${name}: a fade of two frames or more, one way, done by 450 ms: ${JSON.stringify(j)}`);
      }
      if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
      return detail;
    } finally { await context.close(); }
  });
}

/* ---------------------------------------------------------------- G61 */
/** The word to fold: one whose hidden reading is wider than it (so its reading overhangs its neighbours), brought to the
 * middle of the glass. */
const chooseOverhang = (page) => page.evaluate(() => {
  for (const tok of document.querySelectorAll('#reader .tok[data-index]')) {
    const rt = tok.querySelector('ruby > rt.hidden-rt');
    if (!rt || rt.parentElement.querySelectorAll('rt').length !== 1) continue;
    const base = [...rt.parentElement.childNodes].filter((n) => n !== rt).map((n) => n.textContent).join('');
    if ([...rt.textContent].length * 0.5 <= [...base].length) continue;
    const r = tok.getBoundingClientRect();
    window.scrollBy(0, r.top - innerHeight / 2);
    return tok.dataset.index;
  }
  return null;
});
/** Frames from now until `ms` have passed: the reading's state and the place of every other word of its paragraph. */
const record = (page, index, ms) => page.evaluate(([i, ms]) => {
  const tok = document.querySelector(`#reader .tok[data-index="${i}"]`), rt = tok.querySelector('rt');
  const others = [...tok.closest('[data-reader-prose]').querySelectorAll('.tok[data-index]')].filter((t) => t !== tok);
  const place = () => others.map((t) => { const b = t.getBoundingClientRect(); return [b.left, b.top]; });
  const rec = { start: performance.now(), changes: [], frames: [], base: place() };
  new MutationObserver(() => rec.changes.push({ t: performance.now(), hidden: rt.classList.contains('hidden-rt') })).observe(rt, { attributes: true, attributeFilter: ['class'] });
  window.__h2e2rec = rec;
  const tick = () => {
    const s = getComputedStyle(rt), now = place();
    const moved = Math.max(0, ...now.map(([x, y], k) => Math.max(Math.abs(x - rec.base[k][0]), Math.abs(y - rec.base[k][1]))));
    rec.frames.push({ t: performance.now(), hidden: rt.classList.contains('hidden-rt'), display: s.display, opacity: Number(s.opacity),
      width: rt.getBoundingClientRect().width, margin: rt.style.marginInline || '', moved, doc: document.documentElement.scrollWidth });
    if (performance.now() - rec.start < ms) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, [index, ms]);
const recorded = (page) => page.evaluate(() => {
  const rec = window.__h2e2rec, at = rec.changes[0]?.t ?? null;
  return { at: at == null ? null : Math.round(at - rec.start), changes: rec.changes.map((c) => ({ ...c, t: Math.round(c.t - rec.start) })),
    frames: rec.frames.map((f) => ({ ...f, t: Math.round(f.t - (at ?? rec.start)), opacity: +f.opacity.toFixed(3), width: +f.width.toFixed(2), moved: +f.moved.toFixed(2) })) };
});
const widths = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth,
  reader: document.querySelector('#reader')?.scrollWidth ?? null, inner: innerWidth, visual: visualViewport?.width ?? null, scale: visualViewport?.scale ?? null }));
const exact320 = (w) => w.doc === 320 && w.body <= 320 && w.reader != null && w.reader <= 320 && w.inner === 320 && w.visual === 320 && w.scale === 1;
/** Every reader word's press region on the page now: its box and its ::before reach. */
const pressRegions = (page) => page.evaluate(() => [...document.querySelectorAll('#reader .tok[data-para]')].map((t) => {
  const b = t.getBoundingClientRect(), s = getComputedStyle(t, '::before');
  return [t.dataset.index ?? t.dataset.para, +b.left.toFixed(2), +(b.top + window.scrollY).toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2), s.width, s.height, s.transform, s.content];
}));
const press = (page, locator, phone) => (phone ? locator.tap() : locator.click());

async function g61() {
  const phone = engine === 'webkit';
  const [width, height] = phone ? [390, 844] : [1440, 900];
  const device = phone ? PHONE : MAC;
  const quiet = load1();
  await row(`G61 · ${engine} ${width}×${height} · a reading folded away fades, moves no line, writes nothing; its reveal stands at once (load ${quiet} ≤ 20)`, 'G61', async () => {
    assert(quiet <= 20, `the frame-timed fold runs only at a 1-minute load of 20 or less: ${quiet}`);
    const { context, page, errors } = await session({ width, height, device });
    try {
      await openStory(page);
      const index = await chooseOverhang(page);
      assert(index != null, 'a word whose reading is wider than it');
      await frames(page, 2); await delay(300);
      const word = page.locator(`#reader .tok[data-index="${index}"]`);
      const fresh = await page.evaluate((i) => [...document.querySelector(`#reader .tok[data-index="${i}"]`).closest('[data-reader-prose]').querySelectorAll('.tok[data-index]')]
        .filter((t) => t.dataset.index !== String(i)).map((t) => { const b = t.getBoundingClientRect(); return [b.left, b.top]; }), index);
      // the reveal: one press raises the reading
      await record(page, index, 400);
      await press(page, word, phone);
      await delay(600);
      const reveal = await recorded(page);
      const rung = await word.getAttribute('data-ladder-rung');
      const seat = await word.evaluate((n) => n.querySelector('rt').style.marginInline || '');
      // settled: the reveal's own writes are behind it; then the whole native record and the scroll, either side of the fold
      await delay(1500);
      const recordBefore = JSON.stringify(await readAppRecordSnapshot(page));
      const scrollBefore = await page.evaluate(() => [window.scrollX, window.scrollY]);
      await record(page, index, 700);
      await delay(60);
      await page.keyboard.press('Escape');
      await delay(900);
      const fold = await recorded(page);
      const scrollAfter = await page.evaluate(() => [window.scrollX, window.scrollY]);
      const recordAfter = JSON.stringify(await readAppRecordSnapshot(page));
      const rest = await page.evaluate((i) => [...document.querySelector(`#reader .tok[data-index="${i}"]`).closest('[data-reader-prose]').querySelectorAll('.tok[data-index]')]
        .filter((t) => t.dataset.index !== String(i)).map((t) => { const b = t.getBoundingClientRect(); return [b.left, b.top]; }), index);
      const after = await page.evaluate((i) => { const rt = document.querySelector(`#reader .tok[data-index="${i}"] rt`); return { hidden: rt.classList.contains('hidden-rt'), display: getComputedStyle(rt).display, margin: rt.style.marginInline || '' }; }, index);
      await shot(page, 'G61-folded');

      // the reveal stands at once: its first frame after the change shows the reading whole
      const revealFrames = reveal.frames.filter((f) => f.t >= 0 && !f.hidden);
      const fadeFrames = fold.frames.filter((f) => f.t >= 0);
      const fading = fadeFrames.filter((f) => f.display !== 'none' && f.opacity > 0.05 && f.opacity < 0.95);
      const shownWhileFolding = fadeFrames.filter((f) => f.display !== 'none');
      const rising = shownWhileFolding.filter((f, k) => k && f.opacity > shownWhileFolding[k - 1].opacity + 0.001);
      const gone = fadeFrames.find((f) => f.display === 'none');
      const movedWhileShown = Math.max(0, ...shownWhileFolding.map((f) => f.moved));
      const seatKept = shownWhileFolding.every((f) => f.margin === seat);
      const back = Math.max(0, ...rest.map(([x, y], k) => Math.max(Math.abs(x - fresh[k][0]), Math.abs(y - fresh[k][1]))));
      const detail = { index, rung, seat, load: quiet,
        reveal: { change: reveal.at, first: revealFrames[0] ?? null, frames: revealFrames.slice(0, 4).map((f) => [f.t, f.display, f.opacity]) },
        fold: { change: fold.at, frames: fadeFrames.slice(0, 16).map((f) => [f.t, f.display, f.opacity, f.margin, f.moved, f.doc]), fading: fading.length,
          rising: rising.length, goneAt: gone?.t ?? null, movedWhileShown, seatKept },
        after, back: +back.toFixed(2), scroll: { before: scrollBefore, after: scrollAfter }, recordEqual: recordBefore === recordAfter,
        record: { before: sha(recordBefore), after: sha(recordAfter) }, errors };
      results.push({ name: `G61.trace · ${engine}`, item: 'G61', pass: true, detail, error: null, before: null, after: null });
      // the four rows this one walk reads
      const sub = (name, ok, why) => {
        results.push({ name, item: 'G61', pass: !!ok, detail: why, error: ok ? null : JSON.stringify(why).slice(0, 900), before: null, after: null });
        console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok ? '' : `  — ${JSON.stringify(why).slice(0, 500)}`}`);
      };
      sub(`G61.fade · ${engine} ${width}×${height} · the fold's frames show the reading fading, never rising, gone by 400 ms`,
        rung === 'reading' && fold.at != null && fading.length >= 3 && !rising.length && !!gone && gone.t <= 400 && after.hidden && after.display === 'none',
        { rung, change: fold.at, fading: fading.length, rising: rising.length, goneAt: gone?.t ?? null, frames: detail.fold.frames, after });
      sub(`G61.still · ${engine} ${width}×${height} · while it fades no other word of the line moves and its overhang is kept; folded, every word is where it was`,
        !!seat && movedWhileShown < 0.5 && seatKept && back < 0.5 && after.margin === '',
        { seat, movedWhileShown, seatKept, back, after });
      sub(`G61.reveal · ${engine} ${width}×${height} · the reveal stands at once: its first frame shows the whole reading`,
        reveal.at != null && !!revealFrames[0] && revealFrames[0].display !== 'none' && revealFrames[0].opacity === 1,
        { change: reveal.at, first: revealFrames[0] ?? null });
      sub(`G61.record · ${engine} ${width}×${height} · the fold writes nothing: the whole native record and the scroll are the same either side of it`,
        recordBefore === recordAfter && JSON.stringify(scrollBefore) === JSON.stringify(scrollAfter),
        { recordEqual: recordBefore === recordAfter, scroll: detail.scroll, record: detail.record });
      assert.deepEqual(errors, [], 'no page error');
      return { index, load: quiet };
    } finally { await context.close(); }
  });
  // a walk that never reached its frames leaves its four rows red, never missing
  for (const part of ['fade', 'still', 'reveal', 'record']) {
    if (!results.some((r) => r.name.startsWith(`G61.${part} · ${engine} `))) {
      results.push({ name: `G61.${part} · ${engine} ${width}×${height} · not executed`, item: 'G61', pass: false, detail: null, error: 'the fold walk stopped before this row', before: null, after: null });
      console.log(` FAIL G61.${part} · ${engine} · not executed`);
    }
  }

  await row(`G61.reduced · ${engine} ${width}×${height} · under reduced motion the conceal stays instant`, 'G61', async () => {
    const { context, page, errors } = await session({ width, height, device, reduced: true });
    try {
      await openStory(page);
      const index = await chooseOverhang(page);
      await frames(page, 2); await delay(300);
      await press(page, page.locator(`#reader .tok[data-index="${index}"]`), phone);
      await delay(700);
      await record(page, index, 400);
      await delay(60);
      await page.keyboard.press('Escape');
      await delay(600);
      const fold = await recorded(page);
      const first = fold.frames.find((f) => f.t >= 0);
      const detail = { index, change: fold.at, first, frames: fold.frames.filter((f) => f.t >= 0).slice(0, 4).map((f) => [f.t, f.display, f.opacity]), errors };
      assert(fold.at != null && first && first.display === 'none', `the first frame after the fold has no reading: ${JSON.stringify(detail)}`);
      assert.deepEqual(errors, [], 'no page error');
      return detail;
    } finally { await context.close(); }
  });

  // at rest after a fold the page is 320 wide at 320: fresh, revealed and folded there; revealed at 390 then folded at 320;
  // folded at 390 then shown at 320
  await row(`G61.rest320 · ${engine} · at rest after a fold the document, body and reader are 320 wide at 320, in all three orders`, 'G61', async () => {
    const orders = {};
    for (const order of ['at-320', 'reveal-390-fold-320', 'fold-390-then-320']) {
      const start = order === 'at-320' ? 320 : 390;
      const { context, page, errors } = await session({ width: start, height: 700, device: phone ? PHONE : MAC });
      try {
        await openStory(page);
        const fresh = order === 'at-320' ? await widths(page) : null;
        const index = await page.evaluate(() => {
          let best = null;
          for (const tok of [...document.querySelectorAll('#reader .tok[data-index]')].slice(0, 260)) {
            const rt = tok.querySelector('ruby > rt.hidden-rt'), ruby = rt?.parentElement;
            if (!rt || ruby.querySelectorAll('rt').length !== 1) continue;
            const base = [...ruby.childNodes].filter((n) => n !== rt).map((n) => n.textContent).join('');
            if ([...rt.textContent].length * 0.5 <= [...base].length + 0.5) continue;
            let block = tok.parentElement;
            const inline = (n) => !!n && /^inline|^ruby|^contents$/u.test(getComputedStyle(n).display);
            while (block && (inline(block) || inline(block.parentElement))) block = block.parentElement;
            const room = block.getBoundingClientRect().right - parseFloat(getComputedStyle(block).paddingRight) - ruby.getBoundingClientRect().right;
            if (room >= 0 && (!best || room < best.room)) best = { index: tok.dataset.index, room };
          }
          return best?.index ?? null;
        });
        assert(index != null, `${order}: a word with a wider reading near its line's end`);
        const word = page.locator(`#reader .tok[data-index="${index}"]`);
        await word.scrollIntoViewIfNeeded(); await delay(200);
        await press(page, word, phone);
        await delay(500);
        const revealed = order === 'at-320' ? await widths(page) : null;
        if (order === 'reveal-390-fold-320') { await page.setViewportSize({ width: 320, height: 700 }); await delay(500); }
        await page.keyboard.press('Escape');
        await delay(700);
        if (order === 'fold-390-then-320') { await page.setViewportSize({ width: 320, height: 700 }); await delay(500); }
        await frames(page, 2);
        const folded = await widths(page);
        orders[order] = { index, fresh, revealed, folded, ok: exact320(folded) && (!fresh || exact320(fresh)) && (!revealed || exact320(revealed)), errors };
      } finally { await context.close(); }
    }
    for (const [order, o] of Object.entries(orders)) {
      assert(o.ok, `${order}: ${JSON.stringify(o)}`);
      assert.deepEqual(o.errors, [], `${order}: no page error`);
    }
    return orders;
  });

  // G6's 599 press regions of 知床 at 320: this build's are the base's, fresh, and again after a reading is raised and folded
  await row(`G61.press · ${engine} 320×568 · the 599 press regions of 知床 are the base's, and the same again after a fold`, 'G61', async () => {
    const regions = {};
    for (const [side, bytes] of [['base', 'base'], ['build', BYTES]]) {
      const { context, page, errors } = await session({ width: 320, height: 568, device: phone ? PHONE : MAC, bytes });
      try {
        await openStory(page);
        const fresh = await pressRegions(page);
        let folded = null;
        if (side === 'build') {
          const index = await chooseOverhang(page);
          const y = await page.evaluate(() => window.scrollY);
          await frames(page, 2); await delay(200);
          await press(page, page.locator(`#reader .tok[data-index="${index}"]`), phone);
          await delay(500);
          await page.keyboard.press('Escape');
          await delay(700);
          await page.evaluate((top) => window.scrollTo(0, top), y);
          await frames(page, 2);
          folded = await pressRegions(page);
        }
        regions[side] = { fresh, folded, errors };
      } finally { await context.close(); }
    }
    const { base, build } = regions;
    const differ = (a, b) => a.map((r, k) => (JSON.stringify(r) === JSON.stringify(b[k]) ? null : { a: r, b: b[k] })).filter(Boolean);
    const fresh = differ(base.fresh, build.fresh), folded = differ(build.fresh, build.folded || []);
    const detail = { count: build.fresh.length, base: base.fresh.length, freshDiffer: fresh.length, foldedDiffer: folded.length, firstDiffer: [...fresh, ...folded].slice(0, 3) };
    assert.equal(build.fresh.length, 599, `599 press regions: ${JSON.stringify(detail)}`);
    assert.equal(base.fresh.length, build.fresh.length, 'as many as the base');
    assert.equal(fresh.length, 0, `fresh, every one is the base's: ${JSON.stringify(detail)}`);
    assert.equal(folded.length, 0, `after a fold, every one is where it was: ${JSON.stringify(detail)}`);
    assert.deepEqual([...base.errors, ...build.errors], [], 'no page error');
    return detail;
  });
}

/* ---------------------------------------------------------------- NAMI (the sweep's own pixel method) */
function nami() {
  const source = new URL('./verify-contrast-sweep.mjs', import.meta.url);
  const original = readFileSync(source, 'utf8');
  let adapted = original.replace(/from '([^']+)'/gu, (whole, specifier) => (specifier.startsWith('.')
    ? `from ${JSON.stringify(new URL(specifier, source).href)}`
    : specifier === 'playwright-core' ? `from ${JSON.stringify(import.meta.resolve(specifier))}` : whole));
  const once = (before, after) => {
    assert.equal(adapted.split(before).length, 2, `contrast adapter seam must be unique: ${before.slice(0, 60)}`);
    adapted = adapted.replace(before, after);
  };
  assert.equal(adapted.split('import.meta.url').length - 1, 3, 'contrast adapter seam: the sweep names its own location three times');
  adapted = adapted.split('import.meta.url').join(JSON.stringify(source.href));
  // each slot navigates on its own: no prerequisite walk
  once("if (!states.includes(state) && !['shelf', 'reader', 'slip', 'page', 'today', 'me', 'deck-front'].includes(state)) continue;",
    'if (!states.includes(state)) continue;');
  // the sweep's own 390×844 touch phone, or (HFIX2E2_NAMI_VIEWPORT=desktop, Chromium) the Mac's 1440×900 with a mouse
  if (NAMI_VIEWPORT === 'desktop') once("viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' }",
    "viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' }");
  // the two files this lane changed, served at the base (base mode) or with the control's defect (control mode)
  const originRoute = "await context.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));";
  if (BYTES !== 'branch' || SERVE_DIR) {
    const swapped = served('editorial.css', readFileSync(join(process.env.KAIRO_SITE_DIR, 'editorial.css'), 'utf8'), BYTES);
    const file = join(out, `editorial-${BYTES}.css`);
    writeFileSync(file, swapped);
    once(originRoute, `${originRoute}
      await context.route('**/editorial.css', async (route) => {
        const response = await route.fetch();
        globalThis.__hfix2e2Swaps = (globalThis.__hfix2e2Swaps || 0) + 1;
        await route.fulfill({ response, body: readFileSync(${JSON.stringify(file)}, 'utf8') });
      });`);
  }
  // the four slots, each in nami: the shelf tools at rest and under a pointer on the idioms door; the sentence's page at
  // its examples, at rest and under a pointer on "Practice it"
  once('/* ------------------------------------------------------------------ run */', `
const ORIGINAL = { reader: STEPS.reader, examples: STEPS['page-examples'] };
const nowhere = async (page) => { await page.mouse.move(1, Math.round((await page.evaluate(() => innerHeight)) / 2)); };
const tools = async (page, hover) => {
  await page.goto(origin + '/index.html?entry=shelf&ui=bi'); await ready(page);
  await openShelfTools(page);
  await page.locator('#yoji-link').scrollIntoViewIfNeeded();
  if (hover) await page.locator('#yoji-link').hover(); else await nowhere(page);
  await settle(page, 600);
};
const practice = async (page, hover) => {
  await page.goto(origin + '/index.html?entry=shelf&ui=bi'); await ready(page);
  await ORIGINAL.reader(page);
  // the word climbs its ladder one press a rung until its box stands (the reading, then, once Ladder's English rung is
  // woven, the English under it), then its headword opens the page: a finger on the phone, a mouse on the Mac
  const desktop = ${NAMI_VIEWPORT === 'desktop'};
  const press = (locator) => (desktop ? locator.click() : locator.tap());
  const word = page.locator('#reader .tok[data-prose-label="' + WORD + '"]').first();
  for (let i = 0; i < 4 && !(await page.locator('#mini').count()); i += 1) { await press(word); await page.waitForTimeout(600); }
  await page.locator('#mini .mini-word').waitFor({ timeout: 15000 }); await settle(page, 1300);
  // the sweep's own page step, with the device's own press
  await press(page.locator('#mini .mini-word'));
  await page.locator('#sheet').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.cut-word') && !document.getAnimations().some((a) => a.id === 'kairo-cut' || String(a.effect?.pseudoElement || '').startsWith('::view-transition')), null, { timeout: 5000 }).catch(() => {});
  await settle(page, 600);
  await ORIGINAL.examples(page);
  await page.locator('#entry-sentence-practice').scrollIntoViewIfNeeded();
  if (hover) await page.locator('#entry-sentence-practice').hover(); else await nowhere(page);
  await settle(page, 600);
};
STEPS.learn = (page) => tools(page, false);
STEPS.words = (page) => tools(page, true);
STEPS.speak = (page) => practice(page, false);
STEPS['speak-key'] = (page) => practice(page, true);
/* ------------------------------------------------------------------ run */`);
  if (BYTES !== 'branch' || SERVE_DIR) once("writeFileSync(join(evidence, 'contrast-sweep.json'), JSON.stringify(report, null, 1));",
    "report.hfix2e2Swaps = globalThis.__hfix2e2Swaps || 0; writeFileSync(join(evidence, 'contrast-sweep.json'), JSON.stringify(report, null, 1));");
  const runner = join(out, 'hfix2e2-nami-runner.mjs');
  writeFileSync(runner, adapted);
  const before = load();
  const child = spawnSync(process.execPath, [runner], { stdio: 'inherit', env: { ...process.env, SWEEP_WORLDS: 'nami', SWEEP_STATES: 'learn,words,speak,speak-key' } });
  if (child.error) throw child.error;
  const report = JSON.parse(readFileSync(join(out, `sweep-${engine}.json`), 'utf8'));
  const swaps = BYTES === 'branch' && !SERVE_DIR ? null : JSON.parse(readFileSync(join(out, 'contrast-sweep.json'), 'utf8')).hfix2e2Swaps;
  const slots = { learn: ['tools', 'rest', 'button#yoji-link > span.l-ja'], words: ['tools', 'pointer', 'button#yoji-link > span.l-ja'],
    speak: ['practice', 'rest', 'button#entry-sentence-practice > span.l-ja'], 'speak-key': ['practice', 'pointer', 'button#entry-sentence-practice > span.l-ja'] };
  const found = {};
  for (const [state, [where, how, sel]] of Object.entries(slots)) {
    const result = report.results.find((r) => r.world === 'nami' && r.state === state && r.engine === engine);
    const pairs = (result?.pairs || []).filter((p) => p.sel === sel);
    const worst = pairs.reduce((low, p) => (!low || p.ratio < low.ratio ? p : low), null);
    found[`${where}.${how}`] = worst ? { ratio: worst.ratio, fg: worst.fg, bg: worst.bg, text: worst.text, pairs: pairs.length } : null;
    // the doors beside it, and the other quiet word, read in the same pass
    found[`${where}.${how}.siblings`] = (result?.pairs || []).filter((p) => p.sel !== sel && /grammar-link > span\.l-ja|teacher-door .*btn-tertiary|#entry-sentence-ask|teacher-actions > button\.chip/u.test(p.sel || ''))
      .map((p) => [p.sel, p.ratio, p.fg, p.bg]).slice(0, 12);
  }
  results.push({ name: `NAMI.sweep · ${engine}`, item: 'NAMI', pass: child.status !== null, detail: { exit: child.status, swaps, viewport: NAMI_VIEWPORT, browser: report.engines?.[engine], loadBefore: before, loadAfter: load() },
    error: null, before, after: load() });
  for (const [key, label] of [['tools', 'the idioms label on the shelf tools\' door'], ['practice', '"Practice it"']]) {
    for (const how of ['rest', 'pointer']) {
      const f = found[`${key}.${how}`];
      const ok = !!f && f.ratio >= 4.6 && ((BYTES === 'branch' && !SERVE_DIR) || swaps > 0);
      results.push({ name: `NAMI.${key}.${how} · ${engine} ${NAMI_VIEWPORT === 'desktop' ? '1440×900' : '390×844'} · in nami ${label} reads 4.6:1 or more ${how === 'rest' ? 'at rest' : 'under a pointer'}`, item: 'NAMI', pass: ok,
        detail: { ...f, siblings: found[`${key}.${how}.siblings`] }, error: ok ? null : `measured ${JSON.stringify(f)}`, before, after: load() });
      console.log(`${ok ? '  ok  ' : ' FAIL '} NAMI.${key}.${how} · ${engine} · ${f ? `${f.ratio} (${f.fg} on ${f.bg})` : 'not measured'}`);
    }
  }
}

/* ---------------------------------------------------------------- run */
try {
  if (runs('X13')) {
    for (const [w, h] of [[390, 844], [320, 568]]) await x13Walk(w, h);
    for (const world of ['hokusai', 'yoru', 'sumi']) for (const [w, h] of [[390, 844], [320, 568]]) await x13Look(world, w, h);
    await x13Fade(false);
    await x13Fade(true);
    if (engine === 'chromium') await x13Mac();
  }
  if (runs('G61')) await g61();
} finally {
  await browser.close();
  await host.close?.();
}
if (runs('NAMI')) nami();
const counted = results.filter((r) => !/^(G61\.trace|NAMI\.sweep) /u.test(r.name));
const green = counted.filter((r) => r.pass).length;
const report = { engine, version, mode, control: CONTROL || null, base: BASE_SHA, only: ONLY, build: identity.gitSha, artifact: identity.artifactSha256,
  serveDir: SERVE_DIR || null, served: SERVE_DIR ? Object.fromEntries(Object.keys(FILES).map((f) => [f, sha(readFileSync(join(SERVE_DIR, f), 'utf8'))])) : null,
  mutations: mutated.filter((m, i, all) => all.findIndex((n) => n.file === m.file && n.served === m.served) === i), rows: results, green, total: counted.length,
  loadAtEnd: load() };
writeFileSync(join(out, `hfix2e2-${engine}-${mode}${CONTROL ? `-${CONTROL}` : ''}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(`HFIX-2E2 ${engine} ${version} · ${mode}${CONTROL ? ` ${CONTROL}` : ''} · ${green}/${counted.length} rows green · load at end: ${load()}`);
if (mode === 'control') assert(report.mutations.length > 0, `control ${CONTROL}: its mutation fired`);
process.exitCode = green === counted.length ? 0 : 1;
