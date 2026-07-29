/**
 * Shared corpus for the scripted-learner tests.
 *
 * Synthetic on purpose. `@bunki/domain` may not import `@bunki/seed`
 * (ADR-001 boundary 1) and the generator takes its corpus as an argument for
 * exactly that reason, so the kernel's own tests supply their own. What the app
 * passes — real JMdict entries — is covered by `apps/app/test/demo-*.test.ts`,
 * one layer up, where the seed is available.
 *
 * The entries are distinguishable by index so an assertion that lands on the
 * wrong one is readable in a failure message.
 */

import type { DemoTarget } from '../../src/demo/index.ts';

export function testCorpus(size: number): readonly DemoTarget[] {
  const targets: DemoTarget[] = [];
  for (let index = 0; index < size; index += 1) {
    targets.push({
      key: `lex-${String(index).padStart(4, '0')}`,
      text: `語${String(index).padStart(4, '0')}`,
      reading: `ご${String(index).padStart(4, '0')}`,
      senses: [`meaning ${index}`, `sense ${index}b`],
    });
  }
  return targets;
}

/** The app's own contract-id convention, mirrored so the tests exercise it. */
export const testContractIdFor = (target: DemoTarget, skill: string): string =>
  `contract-${skill}-${target.key}`;

export const TEST_START_DAY = '2024-01-01T00:00:00.000Z';
