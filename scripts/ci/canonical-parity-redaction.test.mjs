import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const source = process.env.BUNKI_CANONICAL_SOURCE;
assert(source, 'A verified external canonical closure is required; never skip this test');
test('canonical parity failure never exposes private output bytes or streams', () => {
  const temp = mkdtempSync(join(tmpdir(), 'canonical-parity-privacy-'));
  try {
    const marker = 'SYNTHETIC_PRIVATE_DECK_BYTES_MUST_NOT_ESCAPE_47319',
      root = join(temp, 'bunki'),
      out = join(temp, 'output'),
      python = join(temp, 'fake-python.mjs');
    for (const pack of ['n2', 'n1', 'senmon', 'kotoba-master'])
      for (const name of ['deck.json', 'tokens.json']) {
        const file = join(root, 'prototypes/corridor/decks', pack, name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, 'expected bytes\n');
      }
    writeFileSync(
      python,
      `#!/usr/bin/env node\nimport {mkdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';const out=process.argv.at(-1),marker=${JSON.stringify(marker)};process.stdout.write(marker);process.stderr.write(marker);for(const pack of ['n2','n1','senmon','kotoba-master'])for(const name of ['deck.json','tokens.json']){mkdirSync(join(out,pack),{recursive:true});writeFileSync(join(out,pack,name),marker);}\n`,
    );
    chmodSync(python, 0o700);
    const url = pathToFileURL(resolve('scripts/ci/canonical-decks.mjs')).href;
    const program = `import {buildCanonicalFrozenDecks} from ${JSON.stringify(url)};buildCanonicalFrozenDecks(${JSON.stringify(root)},{sourceDirectory:${JSON.stringify(source)},python:${JSON.stringify(python)},outputDirectory:${JSON.stringify(out)}});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.notEqual(result.status, 0, 'wrong bytes must fail parity');
    assert(
      !output.includes(marker),
      'private deck bytes or child output escaped in parity exception',
    );
    assert.match(output, /Canonical deck byte parity mismatch: n2\/deck\.json/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
