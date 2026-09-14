/** SKIP must ship in served, installed, and standalone builds. No network. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(dir, path), 'utf8');
const assets = ['skip-core.js', 'skip-ui.js', 'skip-ui.css', 'data/share_alike/skip.json'];

test('served entry loads SKIP in dependency order', () => {
  const html = read('index.html');
  for (const asset of assets.slice(0, 3)) {
    assert(html.includes(`"${asset}"`), `${asset} is linked`);
    assert(existsSync(resolve(dir, asset)));
  }
  assert(html.indexOf('src="skip-core.js"') < html.indexOf('src="skip-ui.js"'));
  assert(html.indexOf('src="skip-ui.js"') < html.indexOf('src="corridor.js"'));
});

test('service-worker install preloads all SKIP assets', async () => {
  const events = {};
  let installed = [];
  const self = {
    addEventListener: (name, handler) => { events[name] = handler; },
    skipWaiting: () => {},
  };
  runInNewContext(read('sw.js'), {
    self,
    caches: { open: async () => ({ addAll: async (paths) => { installed = paths; } }) },
  });
  let completed;
  events.install({ waitUntil: (promise) => { completed = promise; } });
  await completed;
  for (const asset of assets) assert(installed.includes(asset), `${asset} installs offline`);
  for (const asset of installed) assert(existsSync(resolve(dir, asset)), `${asset} exists`);
});

test('standalone and Pages packaging retain SKIP data, code and styles', () => {
  const builder = read('tools/build-standalone.mjs');
  assert(builder.includes("'share_alike/skip': 'data/share_alike/skip.json'"));
  for (const asset of assets.slice(0, 3)) assert(builder.includes(`read('${asset}')`));
  const workflow = read('../../.github/workflows/pages-app.yml');
  for (const asset of assets.slice(0, 3)) assert(workflow.includes(`prototypes/corridor/${asset} \\`));
  assert(workflow.includes("'data/share_alike/skip.json'"));
});
