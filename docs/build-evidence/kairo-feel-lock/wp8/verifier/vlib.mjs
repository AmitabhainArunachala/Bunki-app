/* Verifier's own harness for WP8. Written independently; only the static
 * server shape and the touch-dispatch trick are the same as any Playwright
 * probe of this prototype. */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORRIDOR = fileURLToPath(new URL('../../../../../prototypes/corridor', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function serve(root = CORRIDOR) {
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const file = resolve(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('404');
      return;
    }
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    res.end(readFileSync(file));
  });
  return new Promise((ok, bad) => {
    server.once('error', bad);
    server.listen(0, '127.0.0.1', () =>
      ok({ server, base: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

export const R = { pass: 0, fail: 0, rows: [] };
export function check(name, ok, detail = '') {
  R.rows.push({ name, ok: !!ok, detail: String(detail) });
  if (ok) R.pass += 1;
  else R.fail += 1;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

export function noiseWatch(page, bucket, label = '') {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      bucket.push({ label, kind: `console:${m.type()}`, text: m.text() });
  });
  page.on('pageerror', (e) => bucket.push({ label, kind: 'pageerror', text: String(e) }));
  page.on('requestfailed', (r) =>
    bucket.push({ label, kind: 'requestfailed', text: `${r.url()} ${r.failure()?.errorText}` }),
  );
}

export async function touchAt(page, selector, index = 0, holdMs = 0) {
  const target = page.locator(selector).nth(index);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  const box = await target.evaluate((n) => {
    const r = n.getClientRects()[0] ?? n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box || !box.width) throw new Error(`no box for ${selector}`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 6, radiusY: 6, force: 1 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(120);
}
export const tap = (p, s, i = 0) => touchAt(p, s, i, 0);
export const hold = async (p, s, i = 0) => {
  await touchAt(p, s, i, 2400);
  await p.waitForTimeout(220);
};

/** WCAG relative luminance + contrast from computed rgb()/rgba() strings. */
export function parseRGB(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str || '');
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(fgStr, bgStr) {
  const fg = parseRGB(fgStr);
  const bg = parseRGB(bgStr);
  if (!fg || !bg) return null;
  // composite fg over bg if translucent
  const c = fg.a >= 1 ? fg : {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
  const L1 = lum(c);
  const L2 = lum(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
