import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
test('the maintained approved-voice contract completes green', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--test', join(here, 'test-approved-voice.mjs')], {
    cwd: join(here, '../../..'), env, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(child.signal, null, child.stderr || child.stdout);
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
});
