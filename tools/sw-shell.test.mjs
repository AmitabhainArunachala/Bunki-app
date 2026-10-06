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
 */
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

/** run sw.js with fake caches; return its handlers and what it cached and deleted */
function loadWorker(existing) {
  const handlers = {};
  const record = { added: null, deleted: [] };
  vm.runInNewContext(SW, {
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
    Request: class {
      constructor(url) {
        this.url = url;
      }
    },
    caches: {
      open: async () => ({
        addAll: async (requests) => {
          record.added = requests.map((request) => request.url);
        },
      }),
      keys: async () => existing,
      delete: async (key) => {
        record.deleted.push(key);
        return true;
      },
    },
  });
  const run = async (name) => {
    let pending;
    handlers[name]({ waitUntil: (p) => (pending = p) });
    await pending;
  };
  return { run, record };
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

  it('precaches the deck player’s host adapter and both decks’ tokens files', () => {
    for (const path of [
      'decks/player/host.js',
      'decks/kotoba-mine/tokens.json',
      'decks/kotoba-mcd/tokens.json',
    ]) {
      expect(shell, path).toContain(path);
    }
  });

  it('one version scheme: the release stamp, with a single development fallback', () => {
    expect(SW.match(/const DEVELOPMENT_VERSION = '([^']+)'/)?.[1]).toMatch(/^kairo-/);
    expect(SW).toContain('const VERSION = assetVersion === undefined ? DEVELOPMENT_VERSION');
    expect(SW.match(/const VERSION = '/g)).toBeNull();
  });

  it('unstamped install caches SHELL; activate deletes only this scope’s older generations', async () => {
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
    await run('activate');
    expect(record.deleted).toEqual([older]);
  });
});
