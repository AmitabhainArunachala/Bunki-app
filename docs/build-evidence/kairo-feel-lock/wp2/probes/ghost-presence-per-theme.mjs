/**
 * Evidence probe for WP2 revision round — per-theme presence of a receded word.
 *
 * Answers the verifier's LAW-CONFLICT measurements directly, in all five
 * pigment worlds, on both trees:
 *   · rendered (composited) opacity of every ghost
 *   · its contrast ratio against that theme's ground
 *   · the residual-signal test (verifier's probe 5 method): screenshot, then
 *     display:none THAT ONE WORD, screenshot, diff its own box. Kept words in
 *     the same frame are the control.
 *   · pointer-events, and whether the word has a reachable point of its own
 *
 * Usage:
 *   node ghost-presence-per-theme.mjs --src PATH [--out FILE] [--label NAME]
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const SRC = arg('--src', '');
const OUT = arg('--out', '/tmp/ghost-presence.json');
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '8990'));
if (!SRC) throw new Error('--src is required');

const body = fs.readFileSync(SRC, 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server = http
  .createServer((q, r) => {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    r.end(html);
  })
  .listen(PORT);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
const cdp = await ctx.newCDPSession(p);
const touch = (t, pts) => cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: pts });
const wait = (ms) => p.waitForTimeout(ms);
const tap = async (x, y) => {
  await touch('touchEnd', []).catch(() => {});
  await touch('touchStart', [{ x, y }]);
  await wait(30);
  await touch('touchEnd', []);
  await wait(280);
};

await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await wait(3500);

const themeBox = await p.evaluate(() => {
  const r = document.getElementById('theme').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});

const snapshot = () =>
  p.evaluate(() => {
    const lin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const parse = (s) => {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const q = m[1].split(',').map((x) => parseFloat(x));
      return [q[0], q[1], q[2], q[3] == null ? 1 : q[3]];
    };
    const gh = (getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#FBFAF5').replace('#', '');
    const gr = [parseInt(gh.slice(0, 2), 16), parseInt(gh.slice(2, 4), 16), parseInt(gh.slice(4, 6), 16)];
    const gl = lum(gr[0], gr[1], gr[2]);
    const rows = [];
    for (const n of nodes) {
      if (n.kind !== 'word' || n.gone || n.removed || !n.el) continue;
      const cs = getComputedStyle(n.el);
      const op = parseFloat(cs.opacity);
      if (!(op > 0.002)) continue;
      const r = n.el.getBoundingClientRect();
      if (r.width < 4 || r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue;
      const c = parse(cs.color);
      const a = (c[3] == null ? 1 : c[3]) * op;
      const fl = lum(c[0] * a + gr[0] * (1 - a), c[1] * a + gr[1] * (1 - a), c[2] * a + gr[2] * (1 - a));
      let reach = false;
      for (let gx = 1; gx <= 5 && !reach; gx++)
        for (let gy = 1; gy <= 5; gy++) {
          const x = r.left + (r.width * gx) / 6;
          const y = r.top + (r.height * gy) / 6;
          if (x < 1 || x > innerWidth - 1 || y < 1 || y > innerHeight - 1) continue;
          const he = document.elementFromPoint(x, y);
          const hw = he && he.closest ? he.closest('.word') : null;
          if (hw === n.el) reach = true;
        }
      rows.push({
        id: n.seqId,
        w: n.w.slice(0, 6),
        ghost: !!(n.collide != null && n.collide < 0.5),
        op: +op.toFixed(4),
        contrast: +((Math.max(fl, gl) + 0.05) / (Math.min(fl, gl) + 0.05)).toFixed(3),
        pe: cs.pointerEvents,
        reach,
        box: { x: Math.round(r.left), y: Math.round(r.top), ww: Math.round(r.width), hh: Math.round(r.height) },
      });
    }
    return { theme: document.getElementById('theme').textContent, rows };
  });

const out = {};
for (let ti = 0; ti < 5; ti++) {
  await wait(1400);
  // pin positions so the residual diff isolates the hidden word
  await p.evaluate(() => {
    window.__pins = nodes.map((n) => ({ n, x: n.x, y: n.y }));
    window.__pl = setInterval(() => {
      for (const q of window.__pins) {
        q.n.x = q.x;
        q.n.y = q.y;
      }
    }, 8);
  });
  await wait(600);
  const snap = await snapshot();
  const ghosts = snap.rows.filter((r) => r.ghost);
  const kept = snap.rows.filter((r) => !r.ghost && r.op > 0.4);
  const baseBuf = await p.screenshot();
  const baseD = 'data:image/png;base64,' + baseBuf.toString('base64');
  const residual = async (it) => {
    await p.evaluate((id) => {
      const n = nodes.find((n) => n.seqId === id);
      if (n) n.el.style.display = 'none';
    }, it.id);
    await wait(240);
    const buf = await p.screenshot();
    const d = await p.evaluate(
      async ([a, bb, r]) => {
        const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = s; });
        const [ia, ib] = await Promise.all([load(a), load(bb)]);
        const c = document.createElement('canvas');
        c.width = ia.width;
        c.height = ia.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(ia, 0, 0);
        const A = g.getImageData(0, 0, c.width, c.height).data;
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(ib, 0, 0);
        const B = g.getImageData(0, 0, c.width, c.height).data;
        let maxD = 0, sum = 0, n = 0, gt8 = 0;
        for (let y = r.y; y < Math.min(c.height, r.y + r.hh); y++)
          for (let x = r.x; x < Math.min(c.width, r.x + r.ww); x++) {
            const i = (y * c.width + x) * 4;
            const dd = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
            maxD = Math.max(maxD, dd);
            sum += dd;
            n++;
            if (dd > 8) gt8++;
          }
        return { maxD, mean: +(sum / Math.max(1, n)).toFixed(2), pctGt8: +((100 * gt8) / Math.max(1, n)).toFixed(1) };
      },
      [baseD, 'data:image/png;base64,' + buf.toString('base64'), it.box],
    );
    await p.evaluate((id) => {
      const n = nodes.find((n) => n.seqId === id);
      if (n) n.el.style.display = '';
    }, it.id);
    await wait(160);
    return d;
  };
  const gRows = [];
  for (const it of ghosts.slice(0, 4)) gRows.push({ kind: 'GHOST', ...it, ...(await residual(it)) });
  const kRows = [];
  for (const it of kept.slice(0, 3)) kRows.push({ kind: 'KEPT', ...it, ...(await residual(it)) });
  const ops = ghosts.map((g) => g.op);
  const crs = ghosts.map((g) => g.contrast);
  out[snap.theme] = {
    words: snap.rows.length,
    ghosts: ghosts.length,
    ghostOpMin: ops.length ? Math.min(...ops) : null,
    ghostOpMax: ops.length ? Math.max(...ops) : null,
    ghostContrastMin: crs.length ? Math.min(...crs) : null,
    ghostContrastMax: crs.length ? Math.max(...crs) : null,
    ghostsPeNone: ghosts.filter((g) => g.pe === 'none').length,
    ghostsUnreachable: ghosts.filter((g) => !g.reach).length,
    residual: [...gRows, ...kRows],
  };
  console.log(
    `${snap.theme}: ${ghosts.length}/${snap.rows.length} ghosted · rendered op ${out[snap.theme].ghostOpMin}–${out[snap.theme].ghostOpMax} · contrast ${out[snap.theme].ghostContrastMin}–${out[snap.theme].ghostContrastMax}:1 · pe:none ${out[snap.theme].ghostsPeNone} · unreachable ${out[snap.theme].ghostsUnreachable}`,
  );
  console.log(
    `   residual mean Δ — ghosts ${gRows.map((r) => r.mean).join('/') || '—'} · kept controls ${kRows.map((r) => r.mean).join('/') || '—'}`,
  );
  await p.evaluate(() => clearInterval(window.__pl));
  await tap(themeBox.x, themeBox.y);
}
fs.writeFileSync(OUT, JSON.stringify({ label: LABEL, src: SRC, when: new Date().toISOString(), errs, themes: out }, null, 2));
console.log('\nerrors:', errs.length ? errs : 'none');
console.log('-> ' + OUT);
await b.close();
server.close();
process.exit(0);
