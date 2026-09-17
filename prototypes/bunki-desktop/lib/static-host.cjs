'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

const HEADERS = {
  'cache-control': 'no-cache',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'content-security-policy': "frame-ancestors 'none'",
};

function reply(req, res, status, message, extra = {}) {
  const body = Buffer.from(message);
  res.writeHead(status, {
    ...HEADERS,
    'content-type': 'text/plain; charset=utf-8',
    'content-length': body.length,
    ...extra,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function requestPath(target) {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) return null;
  const raw = target.split('?')[0];
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (/[\u0000-\u001f\u007f\\#]/.test(decoded)) return null;
  const segments = decoded.split('/').filter(Boolean);
  if (segments.some((part) => part === '.' || part === '..' || part.startsWith('.'))) return null;
  return segments.length === 0 ? ['index.html'] : segments;
}

async function regularFile(root, segments) {
  let file = root;
  for (const segment of segments) {
    file = path.join(file, segment);
    const stat = await fsp.lstat(file).catch(() => null);
    if (!stat || stat.isSymbolicLink()) return null;
  }
  let stat = await fsp.lstat(file);
  if (stat.isDirectory()) {
    file = path.join(file, 'index.html');
    stat = await fsp.lstat(file).catch(() => null);
  }
  if (!stat?.isFile() || stat.isSymbolicLink()) return null;
  const actual = await fsp.realpath(file);
  if (!actual.startsWith(root + path.sep)) return null;
  // Refuse a leaf swapped for a symlink between resolution and opening.
  const handle = await fsp.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const opened = await handle.stat();
  if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) {
    await handle.close();
    return null;
  }
  return { handle, file, size: opened.size };
}

function singleRange(value, size) {
  // RFC 9110: an unknown unit is ignored. Multipart ranges are unsupported.
  if (!value.startsWith('bytes=') || value.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return false;
  const length = BigInt(size);
  let start;
  let end;
  if (match[1] === '') {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return false;
    start = suffix >= length ? 0n : length - suffix;
    end = length - 1n;
  } else {
    start = BigInt(match[1]);
    end = match[2] === '' ? length - 1n : BigInt(match[2]);
    if (start >= length || end < start) return false;
    if (end >= length) end = length - 1n;
  }
  return { start: Number(start), end: Number(end) };
}

async function serve(req, res, root, port) {
  const hostCount = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length;
  const host = req.headers.host?.toLowerCase();
  if (hostCount !== 1 || (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`)) {
    return reply(req, res, 421, 'Misdirected request');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return reply(req, res, 405, 'Method not allowed', { allow: 'GET, HEAD' });
  }
  const segments = requestPath(req.url);
  if (!segments) return reply(req, res, 400, 'Invalid request path');
  const asset = await regularFile(root, segments);
  if (!asset) return reply(req, res, 404, 'Not found');
  const { handle, file, size } = asset;
  try {
    // Range is defined for GET only. Without a matching validator, If-Range
    // requires the complete representation, so this host ignores it.
    const range = req.method === 'GET' && typeof req.headers.range === 'string' && !req.headers['if-range']
      ? singleRange(req.headers.range.trim(), size)
      : null;
    if (range === false) {
      return reply(req, res, 416, 'Range not satisfiable', { 'content-range': `bytes */${size}` });
    }
    res.writeHead(range ? 206 : 200, {
      ...HEADERS,
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': range ? range.end - range.start + 1 : size,
      'accept-ranges': 'bytes',
      ...(range ? { 'content-range': `bytes ${range.start}-${range.end}/${size}` } : {}),
    });
    if (req.method === 'HEAD') return res.end();
    await pipeline(handle.createReadStream({ autoClose: false, ...(range || {}) }), res);
  } finally {
    await handle.close();
  }
}

async function startStaticHost({ site, port }) {
  const root = await fsp.realpath(site);
  if (!(await fsp.stat(root)).isDirectory()) throw new Error('The app resource directory is unavailable.');
  const server = http.createServer((req, res) => {
    const address = server.address();
    void serve(req, res, root, address.port).catch(() => {
      if (!res.headersSent) reply(req, res, 500, 'Resource unavailable');
      else res.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return {
    origin: `http://localhost:${server.address().port}`,
    port: server.address().port,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

module.exports = { startStaticHost };
