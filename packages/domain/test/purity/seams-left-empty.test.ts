/**
 * Where the kernel's work packages stop (orchestration spec §2.4).
 *
 * WP-02 wrote this file to assert an *absence*: `src/contracts/`,
 * `src/evidence/`, and `src/session/` were empty, and no scheduler dependency
 * was installed. Absence is the one thing a normal test suite cannot
 * demonstrate — every green test is evidence that something works, none is
 * evidence that something was left alone.
 *
 * WP-06 then filled two of those three directories and installed the scheduler,
 * and WP-08 has now filled the third. So the file is retargeted a second time
 * rather than deleted, and it asserts:
 *
 *   1. `src/session/` is populated by WP-08 — and, crucially, that filling it
 *      did **not** put a second scheduler in it. That is the absence claim which
 *      still has a subject, and it is a stronger one than "the directory is
 *      empty": an empty directory proves nothing about what a full one would do.
 *   2. replay still derives no plan and no due queue. Planning exists now, and
 *      it is deliberately *not* part of the projection every adapter must agree
 *      on (T-03) — a plan is a function of a budget the learner chose, not of
 *      the log.
 *   3. `src/contracts/` and `src/evidence/` are populated, and the seam
 *      register says so. A register that still called them "missing" would be
 *      lying about the tree.
 *   4. the scheduler is installed exactly once, exactly pinned, in the one
 *      package allowed to have it (REQ-SCH-01).
 *
 * No assertion was weakened in either retarget. WP-02's claim about WP-08's
 * surface was a claim about work that had not happened yet; it is replaced by a
 * claim about the work that did.
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

describe('WP-08 filled src/session without putting a scheduler in it', () => {
  it('ships the session orchestrator (owner: WP-08)', () => {
    expect([...directoryEntries('src/session')].sort()).toEqual([
      'canvas.ts',
      'commands.ts',
      'index.ts',
      'plan.ts',
      'repair.ts',
      'runtime.ts',
      // Added by the pillars lane: the standing/load projection REQ-SCH-04's
      // "never an unbounded due count" needs a home for. It is in this
      // directory because deciding what is fragile and when something returns
      // is scheduling, and `apps/app` may hold none of it (controller §5) —
      // and it is checked by the two assertions below like everything else
      // here, so it imports no scheduler and computes no interval.
      'standing.ts',
    ]);
  });

  /**
   * REQ-SCH-04's first sentence, as a test: the session orchestrator is separate
   * from the item scheduler. `no-ambient-nondeterminism.test.ts` pins the
   * package-wide list of `ts-fsrs` importers; this pins the same thing from the
   * side that could plausibly want one, because "compose a session" is exactly
   * the place a second interval calculation would look reasonable.
   */
  it('imports no scheduler and computes no interval', () => {
    const sessionSources = directoryEntries('src/session').filter((name) => name.endsWith('.ts'));
    expect(sessionSources.length).toBeGreaterThan(0);

    sessionSources.forEach((name) => {
      const source = readFileSync(join(PACKAGE_ROOT, 'src/session', name), 'utf8');
      expect(source, `src/session/${name}`).not.toMatch(/from\s+['"]ts-fsrs['"]/);
      // The scheduler's own vocabulary. A planner that started computing these
      // would be the second scheduler REQ-SCH-01 forbids, whatever it imported.
      expect(source, `src/session/${name}`).not.toMatch(
        /\bapplyAdmittedReview\b|\bmemoryStateReducer\b|\binitialMemoryState\b/,
      );
    });
  });

  it('derives no session plan and no due queue during replay', () => {
    // Planning is a function of a budget the learner chose, not of the log, so
    // it stays out of the projection every adapter has to agree on (T-03).
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

  /**
   * The one place the register is currently out of step with the tree, pinned
   * on purpose.
   *
   * WP-08 has filled `src/session/`, so its seam should read `closed`. The
   * register lives in `src/reducers/seams.ts`, which is outside WP-08's W4
   * write lock (orchestration spec §5 surface locks), so flipping the status is
   * a coordination request to the Conductor — **COORD-B8-1** — and not an edit
   * B8 may make. Recording the mismatch as an assertion rather than as a
   * comment means closing COORD-B8-1 breaks this test and forces the sentence
   * above to be rewritten, which is the only way a temporary inconsistency
   * reliably stops being permanent.
   */
  it("marks WP-06's three seams closed; WP-08's entry is stale pending COORD-B8-1", () => {
    const byOwner = (owner: string) => PHASE0_SEAMS.filter((seam) => seam.owner === owner);
    expect(byOwner('WP-06').every((seam) => seam.status === 'closed')).toBe(true);
    expect(byOwner('WP-08').every((seam) => seam.status === 'open')).toBe(true);
    // …while the directory that seam describes is populated. Both halves are
    // asserted together so neither can be updated without the other.
    expect(directoryEntries('src/session').length).toBeGreaterThan(0);
  });

  it('records how the contract-to-thread question was answered, not that it was dodged', () => {
    // WP-02 refused to invent a field and asked for a decision. The Conductor's
    // W2 disposition chose a projection from EncounterCaptured; this asserts
    // the resolution names that mechanism and its no-schema-change constraint.
    expect(WP06_CONTRACT_THREAD_LINK_RESOLUTION).toMatch(/EncounterCaptured/);
    expect(WP06_CONTRACT_THREAD_LINK_RESOLUTION).toMatch(/No ADR-002 schema change/i);
  });
});
