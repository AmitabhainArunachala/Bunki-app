#!/usr/bin/env node
/**
 * Concept evidence shooter (shared by every concept).
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/root/pw node docs/redesign/concepts/_kit/shoot.mjs docs/redesign/concepts/<key>
 *
 * Serves the REPO ROOT statically (so a concept can link /prototypes/corridor/fonts.css,
 * /prototypes/corridor/data/articles/pictures/... and /docs/redesign/concepts/_kit/content.json),
 * then reads <concept>/shots.json:
 *
 *   {
 *     "screens": [ { "name": "today", "path": "index.html#/today" }, ... ],
 *     "journey": [ { "go": "index.html#/today" }, { "wait": 600 }, { "frame": "today" },
 *                  { "click": "[data-go=read]" }, { "wait": 300 }, { "frame": "read: shelf" }, ... ]
 *   }
 *
 * Night is selected by appending `?theme=night` before the hash (the concept must honour it:
 * <html data-theme="night">). Outputs, all inside the concept folder:
 *   shots/<name>-day.png, shots/<name>-night.png        390x844 @2x
 *   shots/sheet-day.png, shots/sheet-night.png          all screens side by side
 *   motion/journey.webm                                  playwright-recorded journey (day)
 *   motion/frames/NN.png + motion-frames.png             8-12 frame contact sheet
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync, statSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve, extname, relative } from 'node:path';

const ROOT = resolve(new URL('../../../../', import.meta.url).pathname);
const dir = resolve(process.argv[2] || '.');
const cfg = JSON.parse(readFileSync(join(dir, 'shots.json'), 'utf8'));
const only = process.argv[3]; // optional: "screens" | "journey"

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('404 ' + p); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}/${relative(ROOT, dir)}/`;
const url = (path, night) => {
  const [p, h] = path.split('#');
  const q = night ? (p.includes('?') ? '&' : '?') + 'theme=night' : '';
  return base + p + q + (h !== undefined ? '#' + h : '');
};

const browser = await chromium.launch();
const errors = [];
const vp = { width: 390, height: 844 };

if (only !== 'journey') {
  mkdirSync(join(dir, 'shots'), { recursive: true });
  for (const night of [false, true]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${night ? 'night' : 'day'}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    for (const s of cfg.screens) {
      await page.goto(url(s.path, night), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      for (const step of s.steps || []) await runStep(page, step);
      await page.waitForTimeout(s.settle ?? 1400);
      await page.screenshot({ path: join(dir, 'shots', `${s.name}-${night ? 'night' : 'day'}.png`) });
    }
    await ctx.close();
  }
  for (const t of ['day', 'night']) {
    const imgs = cfg.screens.map(s => ({ src: `shots/${s.name}-${t}.png`, label: s.name }));
    await sheet(imgs, join(dir, 'shots', `sheet-${t}.png`), Math.min(imgs.length, 5), `${cfg.title || ''} · ${t}`);
  }
}

if (only !== 'screens' && cfg.journey) {
  const mdir = join(dir, 'motion');
  rmSync(mdir, { recursive: true, force: true });
  mkdirSync(join(mdir, 'frames'), { recursive: true });
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, recordVideo: { dir: mdir, size: vp } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`journey: ${e.message}`));
  const frames = [];
  for (const step of cfg.journey) {
    if (step.frame) {
      const f = join(mdir, 'frames', String(frames.length + 1).padStart(2, '0') + '.png');
      await page.screenshot({ path: f });
      frames.push({ src: relative(dir, f), label: step.frame });
    } else await runStep(page, step);
  }
  const video = page.video();
  await ctx.close();
  if (video) renameSync(await video.path(), join(mdir, 'journey.webm'));
  await sheet(frames, join(dir, 'motion-frames.png'), Math.min(frames.length, 6), `${cfg.title || ''} · motion journey`);
}

async function runStep(page, step) {
  if (step.go) { await page.goto(url(step.go, step.night), { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts && document.fonts.ready); }
  if (step.click) await page.click(step.click);
  if (step.tap) { const [x, y] = step.tap; await page.mouse.click(x, y); }
  if (step.scroll) await page.mouse.wheel(0, step.scroll);
  if (step.eval) await page.evaluate(step.eval);
  if (step.wait) await page.waitForTimeout(step.wait);
}

async function sheet(imgs, out, cols, title) {
  const ctx = await browser.newContext({ viewport: { width: cols * 410 + 20, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cells = imgs.map(i => `<figure><img src="${base}${i.src}"><figcaption>${i.label}</figcaption></figure>`).join('');
  await page.setContent(`<!doctype html><style>body{margin:0;padding:16px 10px;background:#111;color:#ddd;font:13px -apple-system,Helvetica,sans-serif}
    h1{font-size:15px;font-weight:600;margin:0 10px 12px}main{display:grid;grid-template-columns:repeat(${cols},390px);gap:20px;padding:0 10px}
    figure{margin:0}img{width:390px;height:844px;display:block;border-radius:6px}figcaption{padding:6px 2px;color:#aaa}</style>
    <h1>${title}</h1><main>${cells}</main>`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: true });
  await ctx.close();
}

await browser.close();
server.close();
if (errors.length) { console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n')); process.exitCode = 1; }
console.log('done', relative(ROOT, dir));
