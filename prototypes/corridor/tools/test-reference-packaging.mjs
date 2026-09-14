import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const assets = ['reference-core.js', 'reference-ui.js', 'reference-ui.css'];

test('reference scripts load before the canonical app and styles are linked', () => {
  const html = read('index.html');
  for (const asset of assets) assert.ok(html.includes(asset), `missing ${asset}`);
  assert.ok(html.indexOf('reference-core.js') < html.indexOf('reference-ui.js'));
  assert.ok(html.indexOf('reference-ui.js') < html.indexOf('src="corridor.js"'));
});

test('service-worker installation includes real reference assets', async () => {
  const handlers = {};
  let cached;
  vm.runInNewContext(read('sw.js'), {
    self: {
      addEventListener: (name, fn) => { handlers[name] = fn; },
      skipWaiting: async () => {},
    },
    caches: { open: async () => ({ addAll: async (paths) => { cached = paths; } }) },
  });
  let pending;
  handlers.install({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  for (const asset of assets) assert.ok(cached.includes(asset), asset);
  assert.ok(cached.includes('data/share_alike/reference-extra.json'));
  for (const path of cached) assert.ok(existsSync(resolve(root, path)), `missing shell asset ${path}`);
});

test('Pages workflow copies and smoke-tests all reference assets', () => {
  const workflow = read('../../.github/workflows/pages-app.yml');
  for (const asset of assets) {
    assert.ok(workflow.includes(`prototypes/corridor/${asset}`), `copy missing ${asset}`);
    assert.ok(workflow.includes(`'${asset}'`), `smoke check missing ${asset}`);
  }
});

test('standalone and fragment embed the complete reference implementation', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'bunki-reference-package-'));
  try {
    for (const fragment of [false, true]) {
      const out = resolve(dir, fragment ? 'fragment.html' : 'standalone.html');
      execFileSync(process.execPath, [resolve(root, 'tools/build-standalone.mjs'), out, ...(fragment ? ['--fragment'] : [])], {
        timeout: 30000,
        stdio: 'pipe',
      });
      const html = readFileSync(out, 'utf8');
      for (const asset of assets) assert.ok(html.includes(read(asset)), `${asset} is not embedded`);
      for (const asset of assets) assert.ok(!new RegExp(`(?:src|href)=["']${asset}`).test(html));
      assert.ok(html.indexOf(read('reference-core.js')) < html.indexOf(read('reference-ui.js')));
      assert.ok(html.includes('"share_alike/words"'), 'N1-bearing word table missing');
      assert.ok(html.includes('"proprietary_safe/kanken"'), 'Kentei table missing');
      assert.ok(html.includes('"share_alike/reference-extra"'), 'expanded reference corpus missing');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
