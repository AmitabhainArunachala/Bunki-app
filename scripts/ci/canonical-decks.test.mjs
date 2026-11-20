import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  verifyCanonicalSource,
  verifyCanonicalDeckOutput,
  buildCanonicalFrozenDecks,
} from './canonical-decks.mjs';
const sourceDirectory = process.env.BUNKI_CANONICAL_SOURCE;
const python = process.env.BUNKI_CANONICAL_PYTHON || 'python3';
const root = resolve(import.meta.dirname, '../..');
const OUT = mkdtempSync(join(tmpdir(), 'bunki-producer-judge-'));
process.on('exit', () => rmSync(OUT, { recursive: true, force: true }));
test('pinned canonical producer recreates all eight committed files and refuses corruption', () => {
  assert.ok(
    sourceDirectory,
    'BUNKI_CANONICAL_SOURCE must identify the independently verified four-file closure',
  );
  assert.doesNotThrow(() => verifyCanonicalSource(sourceDirectory));
  const copied = join(OUT, 'source');
  cpSync(sourceDirectory, copied, { recursive: true });
  const file = join(copied, 'tools/build_bunki.py');
  writeFileSync(file, readFileSync(file) + '\n# changed\n');
  assert.throws(() => verifyCanonicalSource(copied), /hash|digest|mismatch|pin|bytes/i);
  rmSync(file);
  assert.throws(() => verifyCanonicalSource(copied));
  const outputDirectory = join(OUT, 'canonical');
  buildCanonicalFrozenDecks(root, { sourceDirectory, python, outputDirectory });
  assert.doesNotThrow(() => verifyCanonicalDeckOutput(root, outputDirectory));
  const deck = join(outputDirectory, 'n2/deck.json'),
    original = readFileSync(deck);
  writeFileSync(deck, Buffer.concat([original, Buffer.from(' ')]));
  assert.throws(() => verifyCanonicalDeckOutput(root, outputDirectory), /differ|mismatch|parity/i);
  writeFileSync(deck, original);
});
test('legacy N2 producer is rejected against the frozen canonical deck contract', () => {
  const legacy = join(OUT, 'legacy');
  for (const path of [
    'decks/n2n1',
    'decks/kotoba-mine/tools',
    'decks/kotoba-mine/source',
    'prototypes/corridor/tools',
    'prototypes/corridor/data/share_alike/kanji.json',
    'prototypes/corridor/data/share_alike/dict.json',
    'prototypes/drift/data/wbig.json',
    'prototypes/drift/data/sem.json',
    'docs/content',
    'corpus/src',
  ])
    cpSync(join(root, path), join(legacy, path), { recursive: true });
  execFileSync(python, [join(legacy, 'decks/n2n1/tools/build_n2n1.py')], {
    cwd: legacy,
    stdio: 'pipe',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.throws(
    () => verifyCanonicalDeckOutput(root, join(legacy, 'prototypes/corridor/decks')),
    /differ|mismatch|parity/i,
  );
});
