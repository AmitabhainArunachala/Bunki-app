import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { commandCheckEvidence } from './command-check-contracts.mjs';

const paths = [
  'scripts/ci/supplemental.mjs',
  'scripts/ci/deck-frozen.mjs',
  'decks/kotoba-mine/tools/build.py',
  'decks/n2n1/tools/build_n2n1.py',
  'scripts/ci/canonical-decks.mjs',
  'scripts/ci/canonical-decks-source.json',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const changedPath of paths.slice(-2)) {
  test(`frozen-deck evidence binds the actual bytes of ${changedPath}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'bunki-canonical-evidence-'));
    try {
      for (const path of paths) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), `original fixture for ${path}\n`);
      }
      const gate = {
        name: 'deck-frozen-build',
        command: process.execPath,
        args: ['scripts/ci/deck-frozen.mjs'],
      };
      const before = commandCheckEvidence(gate, root);
      const first = before.inputs.find((row) => row.path === changedPath);
      assert.ok(first, `Canonical producer input is absent from evidence: ${changedPath}`);
      assert.equal(first.sha256, digest(`original fixture for ${changedPath}\n`));
      const changed = `changed fixture for ${changedPath}\n`;
      writeFileSync(join(root, changedPath), changed);
      const after = commandCheckEvidence(gate, root);
      const second = after.inputs.find((row) => row.path === changedPath);
      assert.equal(second.sha256, digest(changed));
      assert.notEqual(second.sha256, first.sha256);
      assert.deepEqual(
        after.inputs.filter((row) => row.path !== changedPath),
        before.inputs.filter((row) => row.path !== changedPath),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
