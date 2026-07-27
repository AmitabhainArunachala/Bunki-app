/**
 * WP-02 stops where WP-06 and WP-08 begin (orchestration spec §2.4).
 *
 * The WP-02 closure predicate says "no FSRS, no evidence gate, no session
 * logic". That is a claim about *absence*, and absence is the one thing a
 * normal test suite cannot demonstrate — every green test is evidence that
 * something works, none is evidence that something was left alone.
 *
 * So this file asserts the absence directly: the three directories another work
 * package owns are still empty, no scheduler dependency was installed, and the
 * derived state carries no memory state. A verifier can read this instead of
 * diffing the tree by hand, and the next builder finds their surface untouched.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PHASE0_SEAMS, WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION, replay } from '../../src/index.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Directories controller §5 assigns to another work package. */
const OTHER_PACKAGES_SURFACES = [
  { directory: 'src/contracts', owner: 'WP-06' },
  { directory: 'src/evidence', owner: 'WP-06' },
  { directory: 'src/session', owner: 'WP-08' },
] as const;

describe('surfaces owned by another work package are untouched', () => {
  it.each(OTHER_PACKAGES_SURFACES.map((surface) => [surface.directory, surface.owner] as const))(
    '%s still contains nothing but its placeholder (owner: %s)',
    (directory) => {
      const entries = readdirSync(join(PACKAGE_ROOT, directory)).filter(
        (name) => name !== '.gitkeep',
      );
      expect(entries).toEqual([]);
    },
  );

  it("installs no scheduler dependency — one FSRS implementation, and it is WP-06's", () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(declared).not.toContain('ts-fsrs');
  });
});

describe('the seam register is honest about what is missing', () => {
  it('names an owner, a directory, and a rationale for every seam', () => {
    expect(PHASE0_SEAMS.length).toBeGreaterThanOrEqual(4);
    PHASE0_SEAMS.forEach((seam) => {
      expect(seam.capability.length).toBeGreaterThan(0);
      expect(seam.owner).toMatch(/^WP-\d\d$/);
      expect(seam.directory.length).toBeGreaterThan(0);
      expect(seam.rationale.length).toBeGreaterThan(40);
      expect(seam.anchors.length).toBeGreaterThan(0);
    });
  });

  it('covers FSRS, the evidence gate, contracts, and the session planner', () => {
    const owners = PHASE0_SEAMS.map((seam) => `${seam.owner}:${seam.capability}`).join(' | ');
    expect(owners).toMatch(/WP-06:FSRS/);
    expect(owners).toMatch(/WP-06:Evidence gate/);
    expect(owners).toMatch(/WP-06:RetrievalContract/);
    expect(owners).toMatch(/WP-08:Session/);
  });

  it('records the open contract-to-thread question rather than closing it by inventing a field', () => {
    expect(WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION).toMatch(/targetComponentId/);
    expect(WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION).toMatch(/ADR-002/);
  });
});

describe('derived state derives no scheduling', () => {
  it('has no memory state, no due dates, and no session plan', () => {
    const serialised = JSON.stringify(replay([]));
    [
      'memoryState',
      'stability',
      'difficulty',
      'dueAt',
      'interval',
      'retrievability',
      'plan',
    ].forEach((word) => {
      expect(serialised).not.toContain(word);
    });
  });
});
