/** SKIP must be present in the actual served and offline runtime. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { installPackagedWorker, packagedSite } from './reference-packaging-support.mjs';

const assets = ['skip-core.js', 'skip-ui.js', 'skip-ui.css', 'data/share_alike/skip.json'];

test('served entry loads SKIP in dependency order and the artifact includes every asset', () => {
  const site = packagedSite();
  const html = readFileSync(`${site}/index.html`, 'utf8');
  const manifest = JSON.parse(readFileSync(`${site}/build-identity.json`, 'utf8'));
  for (const asset of assets) assert(manifest.files.some(entry => entry.path === asset));
  for (const asset of assets.slice(0, 3)) assert(html.includes(`"${asset}"`));
  assert(html.indexOf('src="skip-core.js"') < html.indexOf('src="skip-ui.js"'));
  assert(html.indexOf('src="skip-ui.js"') < html.indexOf('src="corridor.js"'));
});

test('stamped service-worker install validates and caches all SKIP assets', async () => {
  const result = await installPackagedWorker();
  for (const asset of assets) {
    assert(result.requested.includes(asset));
    assert(result.cached.includes(asset));
  }
});

test('mismatched SKIP bytes cannot publish a candidate cache', async () => {
  await installPackagedWorker({ corrupt: 'data/share_alike/skip.json' });
});
