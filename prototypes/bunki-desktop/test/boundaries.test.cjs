'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { runtimeOptions, externalPath } = require('../lib/paths.cjs');
const { isAppURL, publisherURL, mayRequestMicrophone } = require('../lib/navigation-policy.cjs');
const { verifyBundledArtifact } = require('../lib/artifact.cjs');

const output = externalPath(process.env.KAIRO_EVIDENCE_DIR || path.join(os.homedir(), '.dharma', 'bunki-desktop', 'boundary-tests'));
fs.mkdirSync(output, { recursive: true });
const root = fs.mkdtempSync(path.join(output, 'boundaries-'));
const origin = 'http://localhost:60123';
const base = { resourcesPath: '/portable/Bunki.app/Contents/Resources', appDirectory: '/checkout/prototypes/bunki-desktop' };

test('packaged mode preserves its original origin/profile and ignores source/live/port env overrides', () => {
  const result = runtimeOptions({ ...base, isPackaged: true, env: { BUNKI_SRC_DIR: '/wrong-checkout', BUNKI_LIVE: '1', BUNKI_PORT: '9999' } });
  assert.equal(result.site, '/portable/Bunki.app/Contents/Resources/site/corridor');
  assert.equal(result.port, 5198);
  assert.equal(result.profile, undefined);
  assert.equal(result.live, false);
});

test('development uses a separate profile/port and only explicitly enables live reload', () => {
  const result = runtimeOptions({ ...base, isPackaged: false, env: {} });
  assert.equal(result.site, '/checkout/prototypes/corridor');
  assert.equal(result.port, 5199);
  assert(result.profile.startsWith(path.join(os.homedir(), '.dharma') + path.sep));
  assert.equal(result.live, false);
  assert.equal(runtimeOptions({ ...base, isPackaged: false, env: { BUNKI_LIVE: '1' } }).live, true);
});

test('QA requires an external profile/evidence directory and a separate port', () => {
  const env = { BUNKI_TEST_MODE: '1', BUNKI_TEST_PROFILE: path.join(root, 'profile'), BUNKI_TEST_EVIDENCE: path.join(root, 'evidence'), BUNKI_TEST_PORT: '60123' };
  assert.equal(runtimeOptions({ ...base, isPackaged: true, env }).port, 60123);
  for (const bad of [{ BUNKI_TEST_PROFILE: '/tmp/not-authorized' }, { BUNKI_TEST_PORT: '5198' }, { BUNKI_TEST_PORT: '0' }, { BUNKI_TEST_EVIDENCE: '' }]) {
    assert.throws(() => runtimeOptions({ ...base, isPackaged: true, env: { ...env, ...bad } }));
  }
});

test('output paths cannot escape through symlinks or replace existing output', () => {
  fs.symlinkSync(path.resolve(__dirname, '../../..'), path.join(root, 'escape'));
  assert.throws(() => externalPath(path.join(root, 'escape', 'output')));
  assert.throws(() => externalPath(root, { fresh: true }));
  assert.equal(externalPath(path.join(root, 'fresh'), { fresh: true }), path.join(root, 'fresh'));
});

test('origin comparison contains same-origin navigation without prefix or credential tricks', () => {
  for (const url of [origin, origin + '/#reader', origin + '/index.html']) assert.equal(isAppURL(url, origin), true);
  for (const url of ['http://localhost:60123.evil.example/', origin + '@evil.example/', 'http://user:pass@localhost:60123/', 'http://localhost:60124/', 'http://127.0.0.1:60123/', 'https://localhost:60123/', 'javascript:alert(1)', 'file:///tmp/file', 'data:text/html,test']) assert.equal(isAppURL(url, origin), false, url);
});

test('publisher URLs allow only clean public HTTP(S) targets on standard ports', () => {
  for (const url of ['https://www.asahi.com/articles/fixture', 'http://www.mainichi.jp/news', 'https://www.yomiuri.co.jp/']) assert.equal(publisherURL(url, origin), url);
  for (const url of ['javascript:alert(1)', 'file:///Applications/Test.app', 'data:text/html,test', 'https://user:password@example.com/', 'https://example.com:8443/', 'http://localhost/', 'http://127.0.0.1/', 'http://0x7f000001/', 'https://[::1]/', 'https://news.local/', 'https://host.internal/', 'https://example.com\\@evil.example/', 'https://example.com/\nsecret', origin]) assert.equal(publisherURL(url, origin), null, url);
});

test('microphone permission is limited to a recent top-frame audio-only gesture', () => {
  const args = { permission: 'media', requestingUrl: origin + '/', isMainFrame: true, mediaTypes: ['audio'], origin, trustedAt: 1000, now: 1001 };
  assert.equal(mayRequestMicrophone(args), true);
  for (const change of [{ permission: 'notifications' }, { permission: 'clipboard-read' }, { isMainFrame: false }, { requestingUrl: 'https://example.com/' }, { mediaTypes: ['video'] }, { mediaTypes: ['audio', 'video'] }, { mediaTypes: [] }, { trustedAt: 0, now: 3000 }, { trustedAt: 1002 }]) assert.equal(mayRequestMicrophone({ ...args, ...change }), false);
});

const digest = (data) => createHash('sha256').update(data).digest('hex');
function artifact() {
  const site = fs.mkdtempSync(path.join(root, 'site-'));
  const sourceAssetSha256 = digest('fixture source');
  const content = { 'index.html': '<p>fixture</p>', 'corridor.js': 'void 0;', 'manifest.webmanifest': '{}', 'sw.js': `self.KAIRO_ASSET_VERSION = "${sourceAssetSha256}";\nvoid 0;` };
  const files = Object.keys(content).sort().map((name) => {
    fs.writeFileSync(path.join(site, name), content[name]);
    return { path: name, bytes: Buffer.byteLength(content[name]), sha256: digest(content[name]) };
  });
  const manifest = { schemaVersion: 1, product: 'KAIRO', gitSha: 'a'.repeat(40), sourceDirty: true, sourceAssetSha256, artifactSha256: digest(JSON.stringify(files)), files };
  fs.writeFileSync(path.join(site, 'build-identity.json'), JSON.stringify(manifest));
  return { site, manifest };
}

test('portable manifest validation accepts real bytes without a checkout', () => {
  const { site, manifest } = artifact();
  assert.deepEqual(verifyBundledArtifact(site), manifest);
});

for (const defect of ['changed', 'missing', 'extra', 'symlink', 'manifest-path', 'stamp']) {
  test(`portable manifest rejects ${defect} artifact content`, () => {
    const { site, manifest } = artifact();
    if (defect === 'changed') fs.appendFileSync(path.join(site, 'index.html'), 'changed');
    if (defect === 'missing') fs.unlinkSync(path.join(site, 'index.html'));
    if (defect === 'extra') fs.writeFileSync(path.join(site, 'extra.txt'), 'extra');
    if (defect === 'symlink') fs.symlinkSync(__filename, path.join(site, 'linked.cjs'));
    if (defect === 'manifest-path') {
      manifest.files[0].path = '../escape';
      manifest.artifactSha256 = digest(JSON.stringify(manifest.files));
      fs.writeFileSync(path.join(site, 'build-identity.json'), JSON.stringify(manifest));
    }
    if (defect === 'stamp') {
      fs.writeFileSync(path.join(site, 'sw.js'), 'void 0;');
      const sw = manifest.files.find((file) => file.path === 'sw.js');
      sw.bytes = 7; sw.sha256 = digest('void 0;');
      manifest.artifactSha256 = digest(JSON.stringify(manifest.files));
      fs.writeFileSync(path.join(site, 'build-identity.json'), JSON.stringify(manifest));
    }
    assert.throws(() => verifyBundledArtifact(site));
  });
}

test('build CLI rejects missing arguments and refuses to replace an output directory', () => {
  const script = path.resolve(__dirname, '../tools/build.cjs');
  const site = artifact().site;
  const existing = path.join(root, 'existing-output');
  fs.mkdirSync(existing); fs.writeFileSync(path.join(existing, 'keep.txt'), 'keep');
  for (const args of [[], ['--site', site, '--out', existing], ['--site', site, '--out', '/tmp/unscoped-desktop-output']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1);
  }
  assert.equal(fs.readFileSync(path.join(existing, 'keep.txt'), 'utf8'), 'keep');
  assert.deepEqual(fs.readdirSync(existing), ['keep.txt']);
});

test('desktop verifier rejects unscoped app paths and existing evidence before launching', () => {
  const script = path.resolve(__dirname, '../tools/verify-desktop.cjs');
  const existing = path.join(root, 'existing-evidence');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'keep.txt'), 'keep');
  for (const args of [[], ['--app', '/tmp/not-a-QA-app/Bunki.app', '--evidence', path.join(root, 'unused')],
    ['--app', path.join(root, 'not-launched.app'), '--evidence', existing]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1);
  }
  assert(!fs.existsSync(path.join(root, 'unused')));
  assert.deepEqual(fs.readdirSync(existing), ['keep.txt']);
  assert.equal(fs.readFileSync(path.join(existing, 'keep.txt'), 'utf8'), 'keep');
});
