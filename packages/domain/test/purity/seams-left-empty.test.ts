/**
 * Where the kernel's work packages stop (orchestration spec §2.4).
 *
 * WP-02 wrote this file to assert an *absence*: `src/contracts/`,
 * `src/evidence/`, and `src/session/` were empty, and no scheduler dependency
 * was installed. Absence is the one thing a normal test suite cannot
 * demonstrate — every green test is evidence that something works, none is
 * evidence that something was left alone.
 *
 * WP-06 has now filled two of those three directories and installed the
 * scheduler, because that is precisely its closure predicate. So the file is
 * retargeted rather than deleted, and it now asserts three things:
 *
 *   1. `src/session/` is **still empty** — WP-08's surface, untouched. This is
 *      the absence claim that still has a subject.
 *   2. `src/contracts/` and `src/evidence/` are populated, and the seam
 *      register says so. A register that still called them "missing" would be
 *      lying about the tree.
 *   3. the scheduler is installed exactly once, exactly pinned, in the one
 *      package allowed to have it (REQ-SCH-01).
 *
 * No assertion here was weakened: every claim WP-02 made about WP-08's surface
 * is intact, and the claims about WP-06's surface were statements about work
 * that had not happened yet.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PHASE0_SEAMS, WP06_CONTRACT_THREAD_LINK_RESOLUTION, replay } from '../../src/index.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function directoryEntries(directory: string): readonly string[] {
  return readdirSync(join(PACKAGE_ROOT, directory)).filter((name) => name !== '.gitkeep');
}

describe('surfaces owned by another work package are untouched', () => {
  it('src/session still contains nothing but its placeholder (owner: WP-08)', () => {
    expect(directoryEntries('src/session')).toEqual([]);
  });

  it('derives no session plan and no due queue — WP-08 owns both', () => {
    const serialised = JSON.stringify(replay([]));
    ['sessionPlan', 'dueContracts', 'plannedItems'].forEach((word) => {
      expect(serialised).not.toContain(word);
    });
  });
});

describe('WP-06 filled its own surface', () => {
  it.each([['src/contracts'], ['src/evidence']])('%s is implemented, not a placeholder', (dir) => {
    expect(directoryEntries(dir).length).toBeGreaterThan(0);
  });

  it('installs the scheduler exactly once, exactly pinned, and only in @bunki/domain', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    // Exact: no caret, no tilde. A patch bump that changed an interval would
    // change recorded evidence (controller §6.3, REQ-SCH-01).
    expect(manifest.dependencies?.['ts-fsrs']).toBe('5.4.1');
    expect(manifest.devDependencies?.['ts-fsrs']).toBeUndefined();
  });

  it('derives memory state only through the pinned scheduler', () => {
    // The empty log is the honest floor: no events, no schedule. `memoryStates`
    // exists as a key and is empty, which is a different claim from the key not
    // existing at all (that was WP-02's, and it no longer holds).
    const state = replay([]);
    expect(state.memoryStates).toEqual([]);
    expect(state.gateDecisions).toEqual([]);
  });
});

describe('the seam register is honest about what is missing', () => {
  it('names an owner, a directory, a status, and a rationale for every seam', () => {
    expect(PHASE0_SEAMS.length).toBeGreaterThanOrEqual(4);
    PHASE0_SEAMS.forEach((seam) => {
      expect(seam.capability.length).toBeGreaterThan(0);
      expect(seam.owner).toMatch(/^WP-\d\d$/);
      expect(seam.directory.length).toBeGreaterThan(0);
      expect(['open', 'closed']).toContain(seam.status);
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

  it("marks WP-06's three seams closed and WP-08's still open", () => {
    const byOwner = (owner: string) => PHASE0_SEAMS.filter((seam) => seam.owner === owner);
    expect(byOwner('WP-06').every((seam) => seam.status === 'closed')).toBe(true);
    expect(byOwner('WP-08').every((seam) => seam.status === 'open')).toBe(true);
  });

  it('records how the contract-to-thread question was answered, not that it was dodged', () => {
    // WP-02 refused to invent a field and asked for a decision. The Conductor's
    // W2 disposition chose a projection from EncounterCaptured; this asserts
    // the resolution names that mechanism and its no-schema-change constraint.
    expect(WP06_CONTRACT_THREAD_LINK_RESOLUTION).toMatch(/EncounterCaptured/);
    expect(WP06_CONTRACT_THREAD_LINK_RESOLUTION).toMatch(/No ADR-002 schema change/i);
  });
});
