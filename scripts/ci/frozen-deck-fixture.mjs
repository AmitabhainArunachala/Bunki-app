import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyCanonicalDeckOutput } from './canonical-decks.mjs';
import { frozenDeck } from './supplemental.mjs';

export const CANONICAL_FIXTURE_FILES = Object.fromEntries(
  ['n2', 'n1', 'senmon', 'kotoba-master'].flatMap((pack) =>
    ['deck.json', 'tokens.json'].map((name) => [
      `${pack}/${name}`,
      JSON.stringify({ id: pack, kind: name }) + '\n',
    ]),
  ),
);

export function frozenFixtureDeck(root) {
  return frozenDeck(root, (bunkiRoot) => {
    const output = mkdtempSync(join(tmpdir(), 'bunki-frozen-fixture-'));
    try {
      execFileSync('python3', [join(bunkiRoot, 'tools/build_bunki.py'), bunkiRoot, output], {
        cwd: bunkiRoot,
        stdio: 'pipe',
      });
      verifyCanonicalDeckOutput(bunkiRoot, output);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
}
