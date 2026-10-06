/** Unique assertions retained from the consolidated standalone workflows. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export function supplementalGates(out) {
  const node = (name, file, args = [], env = {}) => ({
    name,
    command: process.execPath,
    args: [file, ...args],
    requiredPath: file,
    env: { KAIRO_EVIDENCE_DIR: join(out, name), ...env },
  });
  return [
    {
      name: 'ci-contracts',
      command: process.execPath,
      args: [
        '--test',
        'scripts/ci/battery.test.mjs',
        'scripts/ci/receipts.test.mjs',
        'scripts/ci/ledger.test.mjs',
        'scripts/ci/runner.integration.test.mjs',
      ],
      requiredPath: 'scripts/ci/receipts.test.mjs',
    },
    node('deck-frozen-build', 'scripts/ci/deck-frozen.mjs'),
    node('deck-gloss-ja', 'scripts/ci/python-deck.mjs', ['test_gloss_ja.py']),
    node('deck-export-mcd', 'scripts/ci/python-deck.mjs', ['test_export_mcd.py']),
    node('deck-player-browser', 'prototypes/corridor/tools/verify-kotoba-mine.mjs'),
    node(
      'personal-collections-contract',
      'prototypes/corridor/tools/test-personal-collections.mjs',
    ),
    {
      name: 'personal-host-bridge',
      command: process.execPath,
      args: ['--test', 'prototypes/corridor/decks/personal/tests/host-bridge.test.mjs'],
      requiredPath: 'prototypes/corridor/decks/personal/tests/host-bridge.test.mjs',
    },
    node(
      'personal-collections-browser',
      'prototypes/corridor/tools/verify-personal-collections.mjs',
      [],
      { PERSONAL_QA_OUT: join(out, 'personal-collections-browser') },
    ),
    node('personal-host-chromium', 'prototypes/corridor/tools/verify-personal-host.mjs'),
    node('personal-host-webkit', 'prototypes/corridor/tools/verify-personal-host.mjs', [], {
      PERSONAL_HOST_BROWSER: 'webkit',
    }),
    node('experience-require-skip', 'prototypes/corridor/tools/verify-experience.mjs', [
      '--require-skip',
    ]),
    node('legacy-drift-storage', 'prototypes/drift/tools/verify-storage-integrity.mjs', [
      '--out',
      join(out, 'legacy-drift-storage.json'),
    ]),
    node('runtime-syntax', 'scripts/ci/runtime-syntax.mjs'),
    node('standalone-build', 'prototypes/corridor/tools/build-standalone.mjs', [
      join(out, 'bunki-standalone.html'),
    ]),
  ].map((gate) => ({ ...gate, env: { KAIRO_EVIDENCE_DIR: join(out, gate.name), ...gate.env } }));
}
export function frozenDeck(root = process.cwd()) {
  for (const args of [[], ['--profile', 'public']])
    execFileSync('python3', ['decks/kotoba-mine/tools/build.py', '--frozen', ...args], {
      cwd: root,
      stdio: 'inherit',
    });
  execFileSync(
    'git',
    [
      'diff',
      '--stat',
      '--exit-code',
      '--',
      'prototypes/corridor/decks',
      'decks/kotoba-mine',
      ':(exclude)*.apkg',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  const untracked = execFileSync(
    'git',
    [
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      'prototypes/corridor/decks',
      'decks/kotoba-mine',
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  assert.equal(untracked, '', 'Deck build wrote uncommitted outputs');
}
