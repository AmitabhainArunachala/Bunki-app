/** Unique assertions retained from the consolidated standalone workflows. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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
        'scripts/ci/verification-admission.test.mjs',
        'scripts/ci/gate-evidence.test.mjs',
        'scripts/ci/framework-receipt.test.mjs',
        'scripts/ci/gate-roster-coverage.test.mjs',
        'scripts/ci/vh-assessment-report-contracts.test.mjs',
        'scripts/ci/vh-deck-report-contracts.test.mjs',
        'scripts/ci/vh-existing-report-contracts.test.mjs',
        'scripts/ci/vh-learning-report-contracts.test.mjs',
        'scripts/ci/vh-media-report-contracts.test.mjs',
        'scripts/ci/vh-misc-report-contracts.test.mjs',
        'scripts/ci/vh-python-report-contracts.test.mjs',
        'scripts/ci/vh-retained-report-contracts.test.mjs',
        'scripts/ci/vh-visual-report-contracts.test.mjs',
        'scripts/ci/vh-voice-report-contracts.test.mjs',
        'scripts/ci/vh-batch3-report-contracts.test.mjs',
        'prototypes/corridor/tools/test-vh-type-ruby-controls.mjs',
        'prototypes/corridor/tools/vh-word-grammar-contracts.test.mjs',
        'prototypes/corridor/tools/vh-learning-contracts.test.mjs',
        'prototypes/corridor/tools/vh-learning-reader-receipt.test.mjs',
        'prototypes/corridor/tools/vh-contrast-arrival.test.mjs',
        'prototypes/corridor/tools/vh-visual-contracts.test.mjs',
        'prototypes/corridor/tools/reading-truth-proof.test.mjs',
        'prototypes/corridor/tools/reader-english-rung.test.mjs',
        'prototypes/corridor/tools/touch-reading-lifecycle.test.mjs',
        'prototypes/corridor/tools/test-vh-voice-contracts.mjs',
        'scripts/release/release.test.mjs',
      ],
      requiredPath: 'scripts/ci/receipts.test.mjs',
    },
    node('deck-frozen-build', 'scripts/ci/deck-frozen.mjs'),
    node('deck-gloss-ja', 'scripts/ci/python-deck.mjs', ['test_gloss_ja.py']),
    node('deck-export-mcd', 'scripts/ci/python-deck.mjs', ['test_export_mcd.py']),
    node('deck-player-browser', 'prototypes/corridor/tools/verify-kotoba-mine.mjs'),
    {
      name: 'deck-segment-overrides',
      command: 'python3',
      args: ['prototypes/corridor/tools/test_segment_overrides.py'],
      requiredPath: 'prototypes/corridor/tools/test_segment_overrides.py',
    },
    node('n2n1-decks-browser', 'prototypes/corridor/tools/verify-n2n1-decks.mjs'),
    node('places-layout', 'prototypes/corridor/tools/verify-places-layout.mjs'),
    node('report-delivery', 'prototypes/corridor/tools/verify-report-delivery.mjs', [], {
      KAIRO_BROWSER: 'all',
    }),
    {
      name: 'report-relay',
      command: process.execPath,
      args: ['--test', 'services/report-relay/test/worker.test.mjs'],
      requiredPath: 'services/report-relay/test/worker.test.mjs',
    },
    node('redesign-language', 'tools/lint-ui-language.mjs', ['--screenshots', '--both-languages']),
    node('redesign-foundation', 'tools/verify-redesign-foundation.mjs', [], {
      KAIRO_BROWSER: 'all',
    }),
    node('redesign-docks', 'tools/verify-redesign-docks.mjs', [], { KAIRO_BROWSER: 'all' }),
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
      {
        PERSONAL_QA_OUT: join(out, 'personal-collections-browser'),
        PERSONAL_BROWSERS: 'chromium,webkit',
      },
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
      join(out, 'legacy-drift-storage/report.json'),
    ]),
    node('runtime-syntax', 'scripts/ci/runtime-syntax.mjs'),
    node('standalone-build', 'prototypes/corridor/tools/build-standalone.mjs', [
      join(out, 'bunki-standalone.html'),
    ]),
  ].map((gate) => ({ ...gate, env: { KAIRO_EVIDENCE_DIR: join(out, gate.name), ...gate.env } }));
}
const DECK_PATHS = ['prototypes/corridor/decks', 'decks/kotoba-mine'];
export function frozenDeck(root = process.cwd()) {
  const generated = execFileSync('git', ['ls-files', '-z', '--', ...DECK_PATHS], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file.endsWith('.apkg'))
    .map((file) => [join(root, file), readFileSync(join(root, file))]);
  try {
    for (const args of [[], ['--profile', 'public']])
      execFileSync('python3', ['decks/kotoba-mine/tools/build.py', '--frozen', ...args], {
        cwd: root,
        stdio: 'inherit',
      });
    execFileSync(
      'git',
      ['diff', '--stat', '--exit-code', '--', ...DECK_PATHS, ':(exclude)*.apkg'],
      { cwd: root, stdio: 'inherit' },
    );
    const untracked = execFileSync(
      'git',
      ['ls-files', '--others', '--exclude-standard', '--', ...DECK_PATHS],
      { cwd: root, encoding: 'utf8' },
    ).trim();
    assert.equal(untracked, '', 'Deck build wrote uncommitted outputs');
  } finally {
    for (const [file, bytes] of generated) writeFileSync(file, bytes);
  }
}
