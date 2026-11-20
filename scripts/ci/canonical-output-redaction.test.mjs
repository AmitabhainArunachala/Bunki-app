import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const source = process.env.BUNKI_CANONICAL_SOURCE;
assert(source, 'A verified external canonical closure is required; never skip this test');
const moduleURL = pathToFileURL(resolve('scripts/ci/canonical-decks.mjs')).href;
const marker = 'SYNTHETIC_PRIVATE_PRODUCER_OUTPUT_MUST_NOT_ESCAPE_98371';
for (const mode of ['success', 'exit', 'signal'])
  test(`canonical producer ${mode} never exposes raw child output`, () => {
    const temp = mkdtempSync(join(tmpdir(), 'canonical-output-privacy-'));
    try {
      const root = join(temp, 'bunki'),
        out = join(temp, 'fresh-output'),
        python = join(temp, 'fake-python');
      for (const pack of ['n2', 'n1', 'senmon', 'kotoba-master'])
        for (const name of ['deck.json', 'tokens.json']) {
          const path = join(root, 'prototypes/corridor/decks', pack, name);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, `${pack}/${name}\n`);
        }
      const script = `#!/usr/bin/env node\nimport {mkdirSync,writeFileSync} from 'node:fs';\nimport {join} from 'node:path';\nprocess.stdout.write(${JSON.stringify(marker + ' stdout\n')});process.stderr.write(${JSON.stringify(marker + ' stderr\n')});\n${mode === 'exit' ? 'process.exit(23);' : mode === 'signal' ? "process.kill(process.pid,'SIGTERM');" : `const out=process.argv.at(-1);for(const pack of ['n2','n1','senmon','kotoba-master'])for(const name of ['deck.json','tokens.json']){mkdirSync(join(out,pack),{recursive:true});writeFileSync(join(out,pack,name),pack+'/'+name+'\\n');}`}`;
      writeFileSync(python, script);
      chmodSync(python, 0o700);
      const program = `import {buildCanonicalFrozenDecks} from ${JSON.stringify(moduleURL)};buildCanonicalFrozenDecks(${JSON.stringify(root)},{sourceDirectory:${JSON.stringify(source)},python:${JSON.stringify(python)},outputDirectory:${JSON.stringify(out)}});`;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const output = (result.stdout || '') + (result.stderr || '');
      assert(
        !output.includes(marker),
        'private child stdout/stderr escaped through output, exception or cause',
      );
      if (mode === 'success')
        assert.equal(result.status, 0, 'successful exact parity must still pass');
      else {
        assert.notEqual(result.status, 0, 'producer failure must not pass');
        assert.match(
          output,
          mode === 'exit' ? /23/ : /SIGTERM/,
          'safe exit/signal remains diagnostic',
        );
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
