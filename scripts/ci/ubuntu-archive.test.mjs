import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { supplementalGates } from './supplemental.mjs';
import { rewriteUbuntuArchive } from './ubuntu-archive.mjs';

const host = 'azure.archive.ubuntu.com';
const archive = 'archive.ubuntu.com';
// Exact bytes from runner-images tag ubuntu24/20260927.320 configure-apt-sources.sh.
const observedMirrors =
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n' +
  'https://archive.ubuntu.com/ubuntu/\tpriority:2\n' +
  'https://security.ubuntu.com/ubuntu/\tpriority:3\n';
const deb822 = `# Archive: http://${host}/ubuntu is the measured source
Types: deb deb-src
URIs: http://${host}/ubuntu/
Suites: noble noble-updates noble-backports
Components: main restricted universe multiverse
Architectures: amd64
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: http://security.ubuntu.com/ubuntu/
Suites: noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: https://packages.example.invalid/vendor
Suites: stable
Components: main
Signed-By:
 -----BEGIN PGP PUBLIC KEY BLOCK-----
 synthetic-http://${host}/ubuntu
 -----END PGP PUBLIC KEY BLOCK-----
`;

test('pinned observed mirror file changes only the Azure URI and preserves priorities and fallbacks', () => {
  assert.equal(Buffer.byteLength(observedMirrors), 144);
  const result = rewriteUbuntuArchive(observedMirrors, 'mirrors');
  assert.deepEqual(result, {
    text: observedMirrors.replace(host, archive),
    replacements: 1,
    unsupported: 0,
  });
  assert.deepEqual(rewriteUbuntuArchive(result.text, 'mirrors'), {
    text: result.text,
    replacements: 0,
    unsupported: 0,
  });
});

test('mirror-file adversarial entries and indirection retain every non-target byte', () => {
  const unchanged =
    `# http://${host}/ubuntu/\tpriority:1\r\n` +
    `https://security.ubuntu.com/ubuntu/\tpriority:3\r\n` +
    `https://${archive}/ubuntu/\tpriority:2\r\n` +
    `https://vendor.example.invalid/ubuntu/\tpriority:4 # http://${host}/ubuntu/\r\n` +
    `http://${host}.example.invalid/ubuntu/\tpriority:5\r\n` +
    `http://user@${host}/ubuntu/\tpriority:6\r\n` +
    `http://${host}:80/ubuntu/\tpriority:7\r\n` +
    `http://${host}/ubuntu/private\tpriority:8\r\n` +
    `http://${host}/ubuntu?source=other\tpriority:9\r\n` +
    `mirror+file:/etc/apt/mirrors/ubuntu.list\r\n` +
    `unknown http://${host}/ubuntu/\r\n`;
  assert.deepEqual(rewriteUbuntuArchive(unchanged, 'mirrors'), {
    text: unchanged,
    replacements: 0,
    unsupported: 0,
  });
  const active = `\t https://${host}/ubuntu\tpriority:17 # keep metadata`;
  assert.deepEqual(rewriteUbuntuArchive(unchanged + active, 'mirrors'), {
    text: unchanged + active.replace(host, archive),
    replacements: 1,
    unsupported: 0,
  });
  const source =
    'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble\nComponents: main\nSigned-By: /fixed/key.gpg\n';
  assert.equal(rewriteUbuntuArchive(source, 'sources').text, source);
  for (const suffix of ['', '\tpriority:bad', '\tpriority:1 unknown:metadata']) {
    const fixture = `http://${host}/ubuntu/${suffix}\r\n`;
    assert.deepEqual(rewriteUbuntuArchive(fixture, 'mirrors'), {
      text: fixture,
      replacements: 0,
      unsupported: 1,
    });
  }
});

test('Deb822 rewrites only the active exact archive URI and preserves security, suites and keys', () => {
  const result = rewriteUbuntuArchive(deb822, 'sources');
  assert.deepEqual(result, {
    text: deb822.replace(`URIs: http://${host}/ubuntu/`, `URIs: http://${archive}/ubuntu/`),
    replacements: 1,
    unsupported: 0,
  });
  assert.deepEqual(rewriteUbuntuArchive(result.text, 'sources'), {
    text: result.text,
    replacements: 0,
    unsupported: 0,
  });
});

test('Deb822 folded and multiple URIs preserve HTTPS, paths, CRLF and absent final newline', () => {
  const fixture = `Types: deb\r\nURIs: https://${host}/ubuntu\r\n http://${host}/ubuntu/ https://mirror.example.invalid/ubuntu\r\nSuites: noble\r\nComponents: main\r\nSigned-By: /fixed/key.gpg`;
  assert.deepEqual(rewriteUbuntuArchive(fixture, 'sources'), {
    text: fixture.replaceAll(host, archive),
    replacements: 2,
    unsupported: 0,
  });
});

test('legacy sources preserve options, spacing, comments, security and vendor entries', () => {
  const fixture = `# deb http://${host}/ubuntu noble main\r\n  deb [arch=amd64 signed-by=/fixed/key.gpg] https://${host}/ubuntu/   noble main universe # keep comment\r\ndeb-src http://${host}/ubuntu noble-updates main\r\ndeb http://security.ubuntu.com/ubuntu noble-security main\r\ndeb https://vendor.example.invalid/debian stable main # ${host}`;
  const expected = fixture
    .replace(`https://${host}/ubuntu/`, `https://${archive}/ubuntu/`)
    .replace(`deb-src http://${host}/ubuntu`, `deb-src http://${archive}/ubuntu`);
  assert.deepEqual(rewriteUbuntuArchive(fixture, 'list'), {
    text: expected,
    replacements: 2,
    unsupported: 0,
  });
});

test('Azure security, mixed security suites and disabled sources remain byte-identical', () => {
  for (const suites of ['noble-security', 'noble noble-security']) {
    const fixture = `Types: deb\nURIs: http://${host}/ubuntu\nSuites: ${suites}\nComponents: main\nSigned-By: /fixed/key.gpg\n`;
    assert.equal(rewriteUbuntuArchive(fixture, 'sources').text, fixture);
  }
  const disabled = `Types: deb\nURIs: http://${host}/ubuntu\nSuites: noble\nComponents: main\nEnabled: no\n`;
  assert.equal(rewriteUbuntuArchive(disabled, 'sources').text, disabled);
  const legacy = `deb [signed-by=/fixed/key.gpg] http://${host}/ubuntu noble-security main\n`;
  assert.equal(rewriteUbuntuArchive(legacy, 'list').text, legacy);
});

test('lookalike hosts, credentials, ports, queries and different paths are never rewritten', () => {
  const uris = [
    `http://${host}.example.invalid/ubuntu`,
    `http://user@${host}/ubuntu`,
    `http://${host}:80/ubuntu`,
    `http://${host}/ubuntu/private`,
    `http://${host}/ubuntu?source=other`,
    `http://${host}/ubuntu#fragment`,
    `ftp://${host}/ubuntu`,
  ];
  for (const uri of uris) {
    for (const [format, fixture] of [
      ['list', `deb ${uri} noble main\n`],
      ['sources', `Types: deb\nURIs: ${uri}\nSuites: noble\nComponents: main\n`],
    ]) {
      const result = rewriteUbuntuArchive(fixture, format);
      assert.equal(result.text, fixture, uri);
      assert.equal(result.replacements, 0, uri);
    }
  }
});

test('unsupported source layouts remain unchanged and report an unsupported entry', () => {
  const fixtures = [
    ['sources', `URIs: http://${host}/ubuntu\n`],
    ['sources', `Types: deb\nURIs: http://${host}/ubuntu\nSuites:\nComponents: main\n`],
    [
      'sources',
      `Types: deb\nURIs: http://${host}/ubuntu\nURIs: http://${host}/ubuntu\nSuites: noble\nComponents: main\n`,
    ],
    ['sources', `Types: deb\nURIs: "http://${host}/ubuntu"\nSuites: noble\nComponents: main\n`],
    [
      'sources',
      `Types: deb\nURIs: http://${host}/ubuntu\nunsupported standalone line\nSuites: noble\nComponents: main\n`,
    ],
    ['list', `deb [signed-by=/unclosed http://${host}/ubuntu noble main\n`],
    ['list', `deb http://${host}/ubuntu noble\n`],
    ['unknown', `http://${host}/ubuntu`],
  ];
  for (const [format, fixture] of fixtures) {
    const result = rewriteUbuntuArchive(fixture, format);
    assert.equal(result.text, fixture);
    assert.equal(result.replacements, 0);
    assert(result.unsupported > 0);
  }
});

test('real filesystem CLI refuses non-CI execution and arbitrary source-path overrides', () => {
  const helper = fileURLToPath(new globalThis.URL('./ubuntu-archive.mjs', import.meta.url));
  for (const [args, diagnostic] of [
    [[], /Real APT source writes require Ubuntu GitHub CI/],
    [['--sources', '/etc/apt/sources.list'], /No source-path override/],
  ]) {
    const result = spawnSync(process.execPath, [helper, ...args], {
      encoding: 'utf8',
      env: { ...process.env, CI: 'false', GITHUB_ACTIONS: 'false' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, diagnostic);
  }
});

test('hosted contracts run the fixture suite before unchanged Ubuntu dependency installations', () => {
  const contracts = supplementalGates('/unused').find((gate) => gate.name === 'ci-contracts');
  for (const suite of ['battery', 'receipts', 'ledger', 'runner.integration', 'ubuntu-archive'])
    assert(contracts.args.includes(`scripts/ci/${suite}.test.mjs`));
  const action = parse(
    readFileSync(
      new globalThis.URL('../../.github/actions/ci-setup/action.yml', import.meta.url),
      'utf8',
    ),
  );
  const steps = action.runs.steps;
  const rewrite = steps.findIndex((step) => step.run?.includes('scripts/ci/ubuntu-archive.mjs'));
  const browsers = steps.findIndex((step) =>
    step.run?.startsWith('npx playwright install --with-deps'),
  );
  const ffmpeg = steps.findIndex((step) => step.run?.includes('apt-get install'));
  assert(rewrite >= 0 && rewrite < browsers && browsers < ffmpeg);
  assert.equal(steps[rewrite].if, "inputs.browsers != '' && runner.os == 'Linux'");
  assert.equal(
    steps[rewrite].run,
    'sudo --preserve-env=CI,GITHUB_ACTIONS,RUNNER_OS "$(command -v node)" scripts/ci/ubuntu-archive.mjs',
  );
  assert.equal(steps[browsers].run, 'npx playwright install --with-deps ${{ inputs.browsers }}');
  assert.equal(
    steps[ffmpeg].run,
    'sudo apt-get update && sudo apt-get install --no-install-recommends -y ffmpeg',
  );
  assert.equal(steps[browsers].if, "inputs.browsers != ''");
  assert.equal(steps[ffmpeg].if, "inputs.browsers != ''");
  assert(!steps[rewrite]['continue-on-error']);
});
