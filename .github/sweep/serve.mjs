// Bunki stack preview: a plain static host for one built corridor site, bound to the Mac's Tailscale address.
// Serves exact bytes of the build directory; a directory answers with its index.html, a miss with the build's 404.html
// (GitHub-Pages behaviour), single byte ranges are honoured for media. No writes, no proxying, no app logic.
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { resolve, join, extname, sep, relative, isAbsolute } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const root = resolve(arg('--root', ''));
const host = arg('--host', '127.0.0.1');
const port = Number(arg('--port', '8810'));
if (!root || !existsSync(join(root, 'build-identity.json'))) { console.error('usage: serve.mjs --root <built site with build-identity.json> [--host ip] [--port n]'); process.exit(2); }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm', '.pdf': 'application/pdf',
};
const inside = (child) => { const r = relative(root, child); return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r)); };
const fileAt = (p) => { try { const s = statSync(p); return s.isFile() ? s : null; } catch { return null; } };

function locate(urlPath) {
  let decoded; try { decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const target = resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`);
  if (!inside(target)) return null;
  const direct = fileAt(target); if (direct) return { path: target, stat: direct, status: 200 };
  const index = fileAt(join(target, 'index.html')); if (index && (decoded.endsWith('/') || decoded === '')) return { path: join(target, 'index.html'), stat: index, status: 200 };
  if (index) return { redirect: `${decoded}/` };
  return null;
}

const notFound = () => { const p = join(root, '404.html'); const s = fileAt(p); return s ? { path: p, stat: s, status: 404 } : null; };
const started = new Date().toISOString();
let served = 0;

const server = createServer((req, res) => {
  const t0 = Date.now();
  const done = (status, extra = '') => { served += 1; console.log(`${new Date().toISOString()} ${req.socket.remoteAddress} ${req.method} ${req.url} ${status} ${Date.now() - t0}ms${extra}`); };
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return done(405); }
  if (req.url === '/__health') {
    const body = JSON.stringify({ ok: true, root, started, served, host, port });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(body); return done(200);
  }
  let hit = locate(req.url || '/');
  if (hit && hit.redirect) { res.writeHead(301, { location: hit.redirect }); res.end(); return done(301); }
  if (!hit) hit = notFound();
  if (!hit) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found'); return done(404); }
  const type = TYPES[extname(hit.path).toLowerCase()] || 'application/octet-stream';
  const headers = { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache', 'accept-ranges': 'bytes', 'last-modified': hit.stat.mtime.toUTCString() };
  const size = hit.stat.size;
  const range = hit.status === 200 ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '') : null;
  if (range && (range[1] !== '' || range[2] !== '')) {
    let start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
    let end = range[1] === '' ? size - 1 : (range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1));
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); res.end(); return done(416); }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return done(206); }
    createReadStream(hit.path, { start, end }).on('error', () => res.destroy()).pipe(res).on('finish', () => done(206, ` ${start}-${end}/${size}`));
    return;
  }
  res.writeHead(hit.status, { ...headers, 'content-length': size });
  if (req.method === 'HEAD') { res.end(); return done(hit.status); }
  createReadStream(hit.path).on('error', () => res.destroy()).pipe(res).on('finish', () => done(hit.status));
});
const hosts = host.split(',').map((h) => h.trim()).filter(Boolean);
for (const h of hosts) {
  const s = createServer(server.listeners('request')[0]);
  s.on('error', (e) => { console.error(`${new Date().toISOString()} listen ${h}:${port} failed: ${e.message}`); process.exit(1); });
  s.listen(port, h, () => console.log(`${started} bunki stack preview: http://${h}:${port}/ serving ${root}`));
}
