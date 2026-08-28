'use strict';

/**
 * Bunki desktop shell — serves the current integrated prototype, the
 * Corridor (掌 TENOHIRA line), exactly as GitHub Pages does: the corridor IS
 * the site. One static server on 127.0.0.1:5198, one window, no children.
 *
 * Source resolution order:
 *   1. BUNKI_SRC_DIR override
 *   2. the workspace checkout on main — ~/Bunki-app/prototypes/corridor
 *   3. the bundled snapshot of origin/main — site/corridor beside this file
 * A corridor is "current era" only if it ships sw.js (the TENOHIRA PWA
 * marker); stale checkouts without it are skipped.
 */

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.BUNKI_PORT || 5198);

// Live mode (default on): watch the corridor source and auto-reload the
// window on every save — the co-editing loop. BUNKI_LIVE=0 for faithful mode.
const LIVE = process.env.BUNKI_LIVE !== '0';
const LIVE_IGNORE = /\/(data|vendor|design|evidence|tools|audio|fonts|node_modules|\.git)\//;
const liveClients = new Set();

function broadcastReload() {
  for (const res of liveClients) {
    try {
      res.write('data: reload\n\n');
    } catch {
      liveClients.delete(res);
    }
  }
}

function watchSource(src) {
  let timer = null;
  try {
    fs.watch(src, { recursive: true }, (_event, name) => {
      const rel = '/' + String(name || '').replace(/\\/g, '/') + '/';
      if (LIVE_IGNORE.test(rel) || rel.includes('/.')) return;
      clearTimeout(timer);
      timer = setTimeout(broadcastReload, 250);
    });
  } catch {
    /* watching is best-effort; manual reload still works */
  }
}

const LIVE_CLIENT =
  '<script>(function(){var s=new EventSource("/__live");' +
  's.onmessage=function(){location.reload()};})()</script>';

const SNAPSHOT_DIR = app.isPackaged
  ? '/Users/dhyana/Bunki-app/prototypes/bunki-desktop/site/corridor'
  : path.join(__dirname, 'site', 'corridor');

function isCurrentCorridor(dir) {
  return fs.existsSync(path.join(dir, 'index.html')) && fs.existsSync(path.join(dir, 'sw.js'));
}

function resolveSrc() {
  const candidates = [
    process.env.BUNKI_SRC_DIR,
    '/Users/dhyana/Bunki-app/prototypes/corridor',
    SNAPSHOT_DIR,
  ].filter(Boolean);
  return candidates.find(isCurrentCorridor) || null;
}

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
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// The recorded voices need seekable audio; honor simple byte ranges.
function sendRange(res, file, size, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m) return false;
  let start = m[1] === '' ? NaN : Number(m[1]);
  let end = m[2] === '' ? size - 1 : Number(m[2]);
  if (Number.isNaN(start)) {
    // Suffix range (bytes=-N): the last N bytes. RFC 7233 §2.1 — when N
    // exceeds the representation length, the entire representation is used;
    // clamp instead of letting start go negative (createReadStream throws
    // ERR_OUT_OF_RANGE on start < 0 and the request dies as a 500).
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) return false;
  res.writeHead(206, {
    'content-type': contentType(file),
    'content-range': `bytes ${start}-${end}/${size}`,
    'accept-ranges': 'bytes',
    'content-length': end - start + 1,
  });
  fs.createReadStream(file, { start, end }).pipe(res);
  return true;
}

async function handle(req, res, src) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (LIVE && pathname === '/__live') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write(': live\n\n');
    liveClients.add(res);
    const beat = setInterval(() => {
      try {
        res.write(': beat\n\n');
      } catch {
        /* closed */
      }
    }, 25_000);
    req.on('close', () => {
      clearInterval(beat);
      liveClients.delete(res);
    });
    return;
  }

  const rel = pathname.replace(/^\/+/, '') || 'index.html';
  let file = path.normalize(path.join(src, rel));
  if (file !== src && !file.startsWith(src + path.sep)) file = path.join(src, 'index.html');

  let st = await fsp.stat(file).catch(() => null);
  if (st && st.isDirectory()) {
    file = path.join(file, 'index.html');
    st = await fsp.stat(file).catch(() => null);
  }
  if (!st || !st.isFile()) {
    // One app means one landing: any missed path returns to the front door.
    file = path.join(src, 'index.html');
    st = await fsp.stat(file).catch(() => null);
    if (!st) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      return res.end(`corridor missing at ${src}`);
    }
  }

  const type = contentType(file);

  // Shell files revalidate every load so saved edits always land; the big
  // immutable shards (data/vendor/fonts/audio) keep default caching.
  const revalidate = /^text\/html|^text\/css|^text\/javascript|manifest/.test(type);

  if (LIVE && type.startsWith('text/html')) {
    let doc = await fsp.readFile(file, 'utf8');
    doc = doc.includes('</body>') ? doc.replace('</body>', LIVE_CLIENT + '</body>') : doc + LIVE_CLIENT;
    const body = Buffer.from(doc);
    res.writeHead(200, {
      'content-type': type,
      'content-length': body.length,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  }

  if (req.headers.range && sendRange(res, file, st.size, req.headers.range)) return;

  res.writeHead(200, {
    'content-type': type,
    'content-length': st.size,
    'accept-ranges': 'bytes',
    ...(revalidate ? { 'cache-control': 'no-cache' } : {}),
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function startServer(src) {
  const server = http.createServer((req, res) => {
    handle(req, res, src).catch((err) => {
      try {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(String(err));
      } catch {
        /* response already closed */
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

let mainWindow = null;

async function launch() {
  const src = resolveSrc();
  if (!src) {
    dialog.showErrorBox(
      'Bunki could not start',
      'No current corridor found. Checkout main in ~/Bunki-app or set BUNKI_SRC_DIR.',
    );
    app.quit();
    return;
  }

  try {
    await startServer(src);
    if (LIVE) watchSource(src);
  } catch (err) {
    dialog.showErrorBox(
      'Bunki could not start',
      `Port ${PORT} is unavailable: ${String((err && err.message) || err)}`,
    );
    app.quit();
    return;
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Bunki',
        submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );

  // 掌 — the corridor is a phone-first surface (390×844 design frame).
  mainWindow = new BrowserWindow({
    width: 440,
    height: 956,
    minWidth: 390,
    minHeight: 700,
    show: false,
    backgroundColor: '#F4EFE6',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith('http://localhost:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://localhost:${PORT}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.setName('Bunki');
  app.whenReady().then(launch);
  app.on('window-all-closed', () => app.quit());
}
