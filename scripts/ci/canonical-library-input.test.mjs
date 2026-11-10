import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { commandCheckEvidence } from './command-check-contracts.mjs';
test('canonical producer evidence retains its imported Bunki builder library', () => {
  const root = mkdtempSync(join(tmpdir(), 'bunki-canonical-library-input-'));
  const library = 'decks/n2n1/tools/build_n2n1.py';
  const paths = [
    'scripts/ci/supplemental.mjs',
    'scripts/ci/deck-frozen.mjs',
    'decks/kotoba-mine/tools/build.py',
    library,
    'scripts/ci/canonical-decks.mjs',
    'scripts/ci/canonical-decks-source.json',
  ];
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  try {
    for (const path of paths) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), `original ${path}\n`);
    }
    const gate = {
      name: 'deck-frozen-build',
      command: process.execPath,
      args: ['scripts/ci/deck-frozen.mjs'],
    };
    const before = commandCheckEvidence(gate, root);
    const prior = before.inputs.find((row) => row.path === library);
    assert.ok(
      prior,
      'Canonical2602 imports this Bunki builder; its source bytes must remain evidence inputs',
    );
    assert.equal(prior.sha256, digest(`original ${library}\n`));
    writeFileSync(join(root, library), 'changed imported library\n');
    const after = commandCheckEvidence(gate, root);
    assert.equal(
      after.inputs.find((row) => row.path === library).sha256,
      digest('changed imported library\n'),
    );
    assert.deepEqual(
      after.inputs.filter((row) => row.path !== library),
      before.inputs.filter((row) => row.path !== library),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
