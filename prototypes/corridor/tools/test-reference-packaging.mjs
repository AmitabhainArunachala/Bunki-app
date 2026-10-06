import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { installPackagedWorker, packagedSite } from './reference-packaging-support.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = ['reference-core.js', 'reference-ui.js', 'reference-ui.css'];
const read = file => readFileSync(resolve(packagedSite(), file), 'utf8');

test('packaged reference scripts load before the canonical app and styles are linked', () => {
  const html = read('index.html');
  for (const asset of assets) assert.ok(html.includes(asset), `missing ${asset}`);
  assert.ok(html.indexOf('reference-core.js') < html.indexOf('reference-ui.js'));
  assert.ok(html.indexOf('reference-ui.js') < html.indexOf('src="corridor.js"'));
});

test('stamped service-worker installation verifies and caches reference assets', async () => {
  const result = await installPackagedWorker();
  for (const asset of [...assets, 'data/share_alike/reference-extra.json']) {
    assert(result.requested.includes(asset));
    assert(result.cached.includes(asset));
  }
});

test('a corrupt reference file cannot publish a candidate generation', async () => {
  await installPackagedWorker({ corrupt: 'data/share_alike/reference-extra.json' });
});

test('standalone and fragment embed reference, SKIP and loadable durable record modules', async () => {
  const site = packagedSite();
  const identity = JSON.parse(read('build-identity.json'));
  const dir = mkdtempSync(join(resolveCorridorEvidence(), 'embedded-reference-'));
  for (const fragment of [false, true]) {
    const out = resolve(dir, fragment ? 'fragment.html' : 'standalone.html');
    execFileSync(process.execPath, [resolve(root, 'tools/build-standalone.mjs'), out, ...(fragment ? ['--fragment'] : [])], {
      timeout: 120000, stdio: 'pipe',
      env: { ...process.env, KAIRO_SITE_DIR: site, KAIRO_ARTIFACT_SHA256: identity.artifactSha256, KAIRO_EVIDENCE_DIR: dir },
    });
    const html = readFileSync(out, 'utf8');
    for (const asset of [...assets, 'skip-core.js', 'skip-ui.js', 'skip-ui.css']) {
      assert(html.includes(read(asset)), `${asset} is not embedded`);
      assert(!new RegExp(`(?:src|href)=["']${asset}`).test(html));
    }
    assert(html.indexOf(read('reference-core.js')) < html.indexOf(read('reference-ui.js')));
    for (const name of ['share_alike/words', 'proprietary_safe/kanken', 'share_alike/reference-extra', 'share_alike/skip']) {
      assert(html.includes(JSON.stringify(name)), `${name} is missing`);
    }
    const embedded = html.match(/<script type="application\/octet-stream" id="standalone-record-module">([A-Za-z0-9+/=]+)<\/script>/u);
    assert(embedded, 'Standalone has no record runtime');
    assert(!/window\.__[A-Z0-9_]+__\s*=\s*["']data:text\/javascript/u.test(html), 'Embedded modules must use local Blob URLs');
    const modules = await import('data:text/javascript;base64,' + embedded[1]);
    assert.equal(typeof modules.binding.openLocalRecordBinding, 'function');
    assert.equal(typeof modules.core.IndexedDbReplicationStore, 'function');
    assert.equal(typeof modules.sync.createRecordSyncAdapter, 'function');
    for (const path of ['./record-controller.mjs', './record-binding.mjs', './record-app.mjs', './record-sync.mjs', './modules/record-core.mjs', './corridor-ink.js']) {
      for (const quote of ["'", '"']) {
        assert(!html.includes(`import(${quote}${path}${quote})`), `Standalone still requires missing sibling ${path}`);
      }
    }
    const receipt = JSON.parse(readFileSync(out + '.build.json', 'utf8'));
    assert.equal(receipt.artifactSha256, identity.artifactSha256);
    assert.match(receipt.recordRuntimeSha256, /^[a-f0-9]{64}$/u);
    assert.match(receipt.inkModuleSha256, /^[a-f0-9]{64}$/u);
    assert.equal(receipt.recordModuleTransport, 'blob');
    assert.equal(receipt.inlinedModuleTransport, 'blob');
    assert.equal(receipt.driftSharesRecordRuntime, true);
  }
});
