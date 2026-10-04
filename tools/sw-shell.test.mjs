/**
 * 回廊's service worker shell (review findings F49, F51; standard amendment A22).
 *
 * The deck player imports vendor/ts-fsrs.mjs and fetches data/fsrs-pin.json at
 * load, so both must be in the install-time SHELL: a first visit followed by
 * going offline (a home-screen install) must still open a deck. Activation
 * deletes only this app's own older caches (`kairo-` prefix), never another
 * app's cache on the same origin. Every SHELL path must exist, or
 * cache.addAll() rejects and the worker never installs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '../prototypes/corridor');
const SW = readFileSync(resolve(CORRIDOR, 'sw.js'), 'utf8');

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
    },
    caches: {
      open: async () => ({
        addAll: async (paths) => {
          record.added = paths;
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

  it('cleans up only caches with its own kairo- prefix', () => {
    expect(SW).toContain("k.startsWith('kairo-') && k !== VERSION");
  });

  it('install caches exactly SHELL; activate keeps other apps’ caches', async () => {
    const version = SW.match(/const VERSION = '([^']+)'/)?.[1];
    expect(version).toMatch(/^kairo-/);
    const { run, record } = loadWorker(['kairo-v10-gloss', version, 'other-app-v1', 'sentinel']);
    await run('install');
    expect(record.added).toEqual(shell);
    await run('activate');
    expect(record.deleted).toEqual(['kairo-v10-gloss']);
  });
});
