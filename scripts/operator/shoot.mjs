import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
const DIST = '/home/user/Bunki-app/apps/app/dist';
const OUT = process.argv[2];
const targets = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};
const DYN = { word: 'word/[lexemeId].html', kanji: 'kanji/[character].html' };
function rf(u) {
  const c = decodeURIComponent(u.split('?')[0] || '/');
  if (c === '/' || c === '') return join(DIST, 'index.html');
  const d = join(DIST, c);
  if (extname(d) && existsSync(d)) return d;
  const s = c.split('/').filter(Boolean);
  if (s.length === 2 && DYN[s[0]]) {
    const f = join(DIST, DYN[s[0]]);
    if (existsSync(f)) return f;
  }
  const h = join(DIST, c.replace(/^\//, '') + '.html');
  if (existsSync(h)) return h;
  return join(DIST, 'index.html');
}
const srv = createServer((q, r) => {
  const f = rf(q.url || '/');
  try {
    const b = readFileSync(f);
    r.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    r.end(b);
  } catch {
    r.writeHead(404).end('nf');
  }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${srv.address().port}`;
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const scheme of (process.env.SHOT_SCHEMES || 'light,dark').split(',')) {
  const ctx = await br.newContext({
    viewport: { width: 430, height: Number(process.env.SHOT_H || 932) },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 130)));
  pg.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text().slice(0, 130));
  });
  for (const r of targets) {
    const slug = r.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'index';
    await pg.goto(`${origin}${r}`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1200);
    const t = (await pg.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 105);
    await pg.screenshot({ path: `${OUT}/${slug}-${scheme}.png`, fullPage: true });
    console.log(`${scheme} ${r} :: ${t}`);
  }
  if (errs.length) console.log('  !!', scheme, [...new Set(errs)].slice(0, 2));
  await ctx.close();
}
await br.close();
srv.close();
