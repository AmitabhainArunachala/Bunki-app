/**
 * 回廊's service worker shell (review findings F49, F51; standard amendment A22).
 *
 * The deck player imports vendor/ts-fsrs.mjs and fetches data/fsrs-pin.json at
 * load, so both must be in the install-time SHELL: a first visit followed by
 * going offline (a home-screen install) must still open a deck. Since the
 * consolidation fold (A51) the cache is one generation per release stamp,
 * scoped to the worker's own scope (`kairo:<scope>:<version>`); activation
 * deletes only this installation's older generations, never another app's
 * cache or another installation's on the same origin. Every SHELL path must
 * exist and be a required release asset (scripts/corridor-assets.mjs), or a
 * stamped install rejects and the worker never installs.
 *
 * Bundled fonts are not part of the install (owner ruling R5-19): each is
 * cached on first request, and a background fill after activation reuses
 * digest-matching entries from the previous generation before the network.
 */
import { createHash, webcrypto } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { CORRIDOR_REQUIRED_ROOTS } from '../scripts/corridor-assets.mjs';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '../prototypes/corridor');
const SW = readFileSync(resolve(CORRIDOR, 'sw.js'), 'utf8');
const SCOPE = 'https://example.test/app/';

/** the SHELL array as written in sw.js */
function shellPaths(text) {
  const body = text.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!body) throw new Error('sw.js: no SHELL array');
  return [...body[1].matchAll(/^\s*'([^']+)',/gm)].map((m) => m[1]);
}

/** a path array as written in sw.js */
function listPaths(text, name) {
  const body = text.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!body) throw new Error(`sw.js: no ${name} array`);
  return [...body[1].matchAll(/^\s*'([^']+)',/gm)].map((m) => m[1]);
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const FONT_A = 'fonts/a.woff2';
const FONT_B = 'fonts/b.woff2';

/** a stamped release sw.js accepts: its boot core plus two fonts, with synthetic bodies */
function buildRelease() {
  const paths = new Set([
    ...shellPaths(SW).filter((path) => path !== '.'),
    ...listPaths(SW, 'BOOT_DATA'),
    ...listPaths(SW, 'GUIDED_ROOM'),
    FONT_A,
    FONT_B,
  ]);
  const bodies = new Map([...paths].map((path) => [path, Buffer.from(`body of ${path}`)]));
  const inputs = [...paths, 'sw.js']
    .map((path) => ({ path, sha256: path === 'sw.js' ? sha(SW) : sha(bodies.get(path)) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const version = sha(JSON.stringify(inputs));
  const source = `self.KAIRO_ASSET_VERSION = "${version}";\n${SW}`;
  bodies.set('404.html', bodies.get('index.html'));
  bodies.set('sw.js', Buffer.from(source));
  const files = [...bodies].map(([path, bytes]) => ({
    path,
    bytes: bytes.byteLength,
    sha256: sha(bytes),
  }));
  bodies.set(
    'build-identity.json',
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        product: 'KAIRO',
        sourceAssetSha256: version,
        artifactSha256: sha(JSON.stringify(files)),
        files,
      }),
    ),
  );
  return { source, bodies, cacheName: `kairo:${SCOPE}:kairo-${version}` };
}

async function until(check) {
  for (let turn = 0; turn < 400; turn += 1) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 5));
  }
  throw new Error('condition never held');
}

/** run sw.js with fake caches and a fake network; return its handlers and what it cached,
 *  fetched and deleted. `existing` names caches already present, or maps them to entries. */
function loadWorker(existing, { source = SW, network } = {}) {
  const handlers = {};
  const record = { added: null, deleted: [], fetched: [] };
  const stores = new Map(
    (Array.isArray(existing) ? existing.map((name) => [name, {}]) : Object.entries(existing)).map(
      ([name, entries]) => [
        name,
        new Map(Object.entries(entries).map(([path, body]) => [SCOPE + path, new Response(body)])),
      ],
    ),
  );
  const handle = (store) => ({
    addAll: async (requests) => {
      record.added = requests.map((request) => request.url);
    },
    match: async (key) => store.get(key.url ?? key)?.clone(),
    put: async (key, response) => {
      store.set(key.url ?? key, response);
    },
  });
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name, fn) => {
        handlers[name] = fn;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      location: { origin: 'https://example.test' },
      registration: { scope: SCOPE },
    },
    URL,
    Response,
    Headers,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    crypto: webcrypto,
    fetch: async (request) => {
      const path = decodeURIComponent(request.url.slice(SCOPE.length));
      record.fetched.push(path);
      if (!network) throw new TypeError('network unavailable');
      return network(path);
    },
    Request: class {
      constructor(url) {
        this.url = url;
      }
    },
    caches: {
      open: async (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return handle(stores.get(name));
      },
      keys: async () => [...stores.keys()],
      delete: async (key) => {
        record.deleted.push(key);
        return stores.delete(key);
      },
    },
  });
  const run = async (name) => {
    let pending;
    handlers[name]({ waitUntil: (p) => (pending = p) });
    await pending;
  };
  const request = async (path) => {
    let response;
    const holds = [];
    handlers.fetch({
      request: { method: 'GET', url: SCOPE + path, mode: 'no-cors' },
      respondWith: (p) => (response = p),
      waitUntil: (p) => holds.push(p),
    });
    const answered = await response;
    await Promise.all(holds);
    return answered;
  };
  const stored = async (cacheName, path) => {
    const hit = stores.get(cacheName)?.get(SCOPE + path);
    return hit ? Buffer.from(await hit.clone().arrayBuffer()).toString() : undefined;
  };
  return { run, request, stored, record, stores };
}

describe('sw.js shell', () => {
  const shell = shellPaths(SW);

  it('precaches the deck player with its scheduler and its pin', () => {
    for (const path of [
      'decks/player/mount.js',
      'decks/player/engine.js',
      'vendor/ts-fsrs.mjs',
      'data/fsrs-pin.json',
    ]) {
      expect(shell, path).toContain(path);
    }
  });

  it('precaches the six room stylesheets, registered once after editorial.css', () => {
    const rooms = ['today', 'read', 'learn', 'words', 'me', 'cards'].map(
      (room) => `rooms/${room}.css`,
    );
    const shell = shellPaths(SW);
    expect(shell).toEqual(expect.arrayContaining(rooms));
    expect(shell.indexOf('rooms/today.css')).toBe(shell.indexOf('editorial.css') + 1);
    for (const room of rooms) expect(CORRIDOR_REQUIRED_ROOTS).toContain(room);
    const html = readFileSync(resolve(CORRIDOR, 'index.html'), 'utf8');
    for (const room of rooms) expect(html.split(`href="${room}"`).length - 1).toBe(1);
  });

  it('lists only files that exist under prototypes/corridor/', () => {
    const missing = shell.filter((path) => path !== '.' && !existsSync(resolve(CORRIDOR, path)));
    expect(missing).toEqual([]);
  });

  it('every SHELL path ships in the release (a stamped install verifies each against the manifest)', () => {
    const outside = shell.filter(
      (path) =>
        path !== '.' &&
        !CORRIDOR_REQUIRED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`)),
    );
    expect(outside).toEqual([]);
  });

  it('precaches the deck player’s host adapter but not the decks’ tokens files (A52)', () => {
    expect(shell).toContain('decks/player/host.js');
    for (const path of ['decks/kotoba-mine/tokens.json', 'decks/kotoba-mcd/tokens.json']) {
      expect(shell, path).not.toContain(path);
    }
  });

  it('one version scheme: the release stamp, with a single development fallback', () => {
    expect(SW.match(/const DEVELOPMENT_VERSION = '([^']+)'/)?.[1]).toMatch(/^kairo-/);
    expect(SW).toContain('const VERSION = assetVersion === undefined ? DEVELOPMENT_VERSION');
    expect(SW.match(/const VERSION = '/g)).toBeNull();
  });

  it('unstamped install caches SHELL without any font, with the network down; activate deletes only this scope’s older generations', async () => {
    const version = SW.match(/const DEVELOPMENT_VERSION = '([^']+)'/)?.[1];
    const prefix = `kairo:${SCOPE}:`;
    const older = `${prefix}kairo-v8-dev`;
    const elsewhere = 'kairo:https://example.test/other/:kairo-v8-dev';
    const { run, record } = loadWorker([
      older,
      `${prefix}${version}`,
      elsewhere,
      'kairo-v17-merge-main',
      'other-app-v1',
    ]);
    await run('install');
    for (const path of shell) expect(record.added, path).toContain(new URL(path, SCOPE).href);
    expect(record.added.filter((url) => url.startsWith(`${SCOPE}fonts/`))).toEqual([]);
    expect(record.fetched).toEqual([]);
    await run('activate');
    expect(record.deleted).toEqual([older]);
  });

  it('installs the N2, N1 and specialist decks, leaving tokens for first use (A52)', async () => {
    const { run, record } = loadWorker([]);
    await run('install');
    for (const id of ['n2', 'n1', 'senmon']) {
      expect(record.added).toContain(new URL(`decks/${id}/deck.json`, SCOPE).href);
      expect(record.added).not.toContain(new URL(`decks/${id}/tokens.json`, SCOPE).href);
    }
    expect(record.added).not.toContain(new URL('decks/n2n1-sample/deck.json', SCOPE).href);
  });
});

describe('sw.js bundled fonts (R5-19)', () => {
  const release = buildRelease();
  const { source, bodies, cacheName } = release;
  const serve = (down = () => false) => (path) => {
    if (down(path)) throw new TypeError('font request failed');
    return bodies.has(path) ? new Response(bodies.get(path)) : new Response('', { status: 404 });
  };
  const isFont = (path) => path.startsWith('fonts/');

  it('stamped install succeeds and caches the boot core when every font request fails', async () => {
    const { run, stored, record, stores } = loadWorker([], { source, network: serve(isFont) });
    await run('install');
    const core = [
      ...shellPaths(SW).filter((path) => path !== '.'),
      ...listPaths(SW, 'BOOT_DATA'),
      ...listPaths(SW, 'GUIDED_ROOM'),
      'build-identity.json',
      'sw.js',
    ];
    for (const path of core) expect(await stored(cacheName, path), path).toBe(bodies.get(path).toString());
    expect([...stores.get(cacheName).keys()].filter((url) => url.includes('/fonts/'))).toEqual([]);
    expect(record.fetched.filter(isFont)).toEqual([]);
  });

  it('a font the background fill could not get is cached on its first request', async () => {
    let down = true;
    const { run, request, stored, record } = loadWorker([], {
      source,
      network: serve((path) => down && isFont(path)),
    });
    await run('install');
    await run('activate');
    await until(() => [FONT_A, FONT_B].every((path) => record.fetched.includes(path)));
    expect(await stored(cacheName, FONT_A)).toBeUndefined();
    down = false;
    const before = record.fetched.filter((path) => path === FONT_A).length;
    const answered = await request(FONT_A);
    expect(answered.status).toBe(200);
    expect(Buffer.from(await answered.arrayBuffer()).toString()).toBe(bodies.get(FONT_A).toString());
    expect(await stored(cacheName, FONT_A)).toBe(bodies.get(FONT_A).toString());
    expect((await request(FONT_A)).status).toBe(200);
    expect(record.fetched.filter((path) => path === FONT_A).length).toBe(before + 1);
    expect(await stored(cacheName, FONT_B)).toBeUndefined();
  });

  it('activation resolves while a font fails in the background fill, and the others are still filled', async () => {
    const { run, stored, record } = loadWorker([], {
      source,
      network: serve((path) => path === FONT_A),
    });
    await run('install');
    await expect(run('activate')).resolves.toBeUndefined();
    await until(async () => (await stored(cacheName, FONT_B)) !== undefined);
    await until(() => record.fetched.includes(FONT_A));
    expect(await stored(cacheName, FONT_B)).toBe(bodies.get(FONT_B).toString());
    expect(await stored(cacheName, FONT_A)).toBeUndefined();
  });

  it('reuses a digest-matching font from the previous generation without the network, and refetches a mismatching one', async () => {
    const previous = `kairo:${SCOPE}:kairo-previous`;
    const { run, stored, record } = loadWorker(
      { [previous]: { [FONT_A]: bodies.get(FONT_A), [FONT_B]: Buffer.from('another release') } },
      { source, network: serve() },
    );
    await run('install');
    await run('activate');
    expect(record.deleted).toEqual([previous]);
    await until(async () => (await stored(cacheName, FONT_B)) !== undefined);
    expect(await stored(cacheName, FONT_A)).toBe(bodies.get(FONT_A).toString());
    expect(await stored(cacheName, FONT_B)).toBe(bodies.get(FONT_B).toString());
    expect(record.fetched).not.toContain(FONT_A);
    expect(record.fetched.filter((path) => path === FONT_B).length).toBe(1);
  });
});
