/**
 * The retrievability projection is real, separate, and honest about what it
 * does not know (Campaign E / A2; REQ-UI-07, REQ-LM-03, REQ-SCH-03).
 *
 * The two claims this file exists to defend:
 *
 *   1. **Nothing is collapsed.** Stability, retrievability, uncertainty and
 *      coverage come back as four values, and no function anywhere reduces a
 *      node — or a learner — to one number.
 *   2. **Unknown is not weak.** A node nobody has been tested on projects
 *      `null` retrievability, not `0`, and no fragility policy can report it as
 *      fragile.
 */

import { describe, expect, it } from 'vitest';

import {
  applyAdmittedReview,
  buildMemoryHistories,
  buildRetrievabilityIndex,
  buildRetrievabilityIndexTimeline,
  CAPABILITY_LENSES,
  coverageForReviewCount,
  DEFAULT_FRAGILITY_POLICY,
  initialMemoryState,
  isAscendingByFrom,
  isFragile,
  isUnknown,
  isUntested,
  lensOf,
  memoryStateAsOf,
  memoryStateRetrievability,
  projectNodeRetrievability,
  projectNodeRetrievabilityOverTime,
  projectRetrievability,
  uncertaintyForReviewCount,
  UNCERTAINTY_RULE,
  type AdmittedReview,
  type MemoryState,
  type ProjectedContract,
} from '../../src/index.ts';
import { randomFrom } from '../adversarial/support/fuzz.ts';
import { activationsFor, contractsFor, instant } from './support.ts';

const COMPONENT = 'kc:分岐';
const NODE = { id: 'lex-bunki', componentIds: [COMPONENT] };
const UNTOUCHED_NODE = { id: 'lex-never-captured', componentIds: [] };

const CONTRACTS = contractsFor(COMPONENT, ['orthography_to_reading', 'form_to_meaning']);
const READING_CONTRACT = CONTRACTS[0] as ProjectedContract;
const MEANING_CONTRACT = CONTRACTS[1] as ProjectedContract;

const ACTIVATED_AT = instant(0);

function reviewed(
  contractId: string,
  grades: readonly { readonly grade: AdmittedReview['effectiveGrade']; readonly day: number }[],
): MemoryState {
  return grades.reduce<MemoryState>(
    (state, entry) =>
      applyAdmittedReview(state, {
        contractId,
        effectiveGrade: entry.grade,
        reviewedAt: instant(entry.day),
      }),
    initialMemoryState(contractId, ACTIVATED_AT),
  );
}

describe('the four values stay four values', () => {
  it('reports all five lenses, always, in requirement order', () => {
    const index = buildRetrievabilityIndex([], []);
    const projection = projectNodeRetrievability(index, NODE, instant(10));
    expect(projection.lenses.map((lens) => lens.lens)).toEqual([...CAPABILITY_LENSES]);
  });

  it('emits stability, retrievability, uncertainty and coverage as separate fields', () => {
    const state = reviewed(READING_CONTRACT.contractId, [
      { grade: 'good', day: 1 },
      { grade: 'good', day: 4 },
      { grade: 'good', day: 12 },
    ]);
    const index = buildRetrievabilityIndex([READING_CONTRACT], [state]);
    const lens = lensOf(projectNodeRetrievability(index, NODE, instant(20)), 'reading');

    expect(lens?.stabilityDays).toBeTypeOf('number');
    expect(lens?.retrievability).toBeTypeOf('number');
    expect(lens?.uncertainty).toBe('moderate');
    expect(lens?.coverage).toBe('established');
  });

  /**
   * The negative claim, asserted structurally rather than by reading the code:
   * serialise a fully-populated projection and look for a collapsed scalar by
   * name. A field called `mastery` would fail here even if it were computed
   * somewhere this test never calls.
   */
  it('never emits a single collapsed mastery number', () => {
    const index = buildRetrievabilityIndex(CONTRACTS, [
      reviewed(READING_CONTRACT.contractId, [{ grade: 'good', day: 1 }]),
      reviewed(MEANING_CONTRACT.contractId, [{ grade: 'again', day: 1 }]),
    ]);
    const serialised = JSON.stringify(projectNodeRetrievability(index, NODE, instant(9)));

    [
      'mastery',
      'overall',
      'score',
      'level',
      'percent',
      'percentage',
      'brightness',
      'proficiency',
      'jlpt',
      'grade',
      'rating',
    ].forEach((word) => {
      expect(
        serialised.toLowerCase(),
        `a field named ${word} would be a collapsed scalar`,
      ).not.toContain(word);
    });
  });

  it('has no key on a node projection that summarises across lenses', () => {
    const index = buildRetrievabilityIndex(CONTRACTS, []);
    const projection = projectNodeRetrievability(index, NODE, instant(9));
    expect(Object.keys(projection).sort()).toEqual(['at', 'lenses', 'nodeId']);
  });

  it('takes the weakest contract of a lens, never the average', () => {
    const strong = reviewed(READING_CONTRACT.contractId, [
      { grade: 'easy', day: 1 },
      { grade: 'easy', day: 8 },
    ]);
    const secondContract: ProjectedContract = {
      contractId: 'contract:second:orthography_to_reading',
      targetComponentId: COMPONENT,
      skill: 'orthography_to_reading',
    };
    const weak = reviewed(secondContract.contractId, [
      { grade: 'again', day: 1 },
      { grade: 'again', day: 2 },
    ]);

    const index = buildRetrievabilityIndex([READING_CONTRACT, secondContract], [strong, weak]);
    const lens = lensOf(projectNodeRetrievability(index, NODE, instant(30)), 'reading');

    const strongR = memoryStateRetrievability(strong, instant(30));
    const weakR = memoryStateRetrievability(weak, instant(30));
    expect(weakR).not.toBeNull();
    expect(lens?.retrievability).toBe(Math.min(strongR ?? 1, weakR ?? 1));
    expect(lens?.contributingContractIds).toHaveLength(2);
  });
});

describe('unknown, untested, and fragile are three different things', () => {
  it('projects a node nobody has captured as unknown, with null values', () => {
    const index = buildRetrievabilityIndex(CONTRACTS, []);
    const lens = lensOf(projectNodeRetrievability(index, UNTOUCHED_NODE, instant(30)), 'reading');

    expect(lens?.presence).toBe('unknown');
    expect(lens?.retrievability).toBeNull();
    expect(lens?.stabilityDays).toBeNull();
    expect(lens?.uncertainty).toBe('unknown');
    expect(lens?.coverage).toBe('none');
    expect(lens?.dueState).toBe('not_scheduled');
    expect(isUnknown(lens!)).toBe(true);
    expect(isFragile(lens!)).toBe(false);
  });

  it('distinguishes an activated but never-reviewed contract from both', () => {
    const index = buildRetrievabilityIndex(
      [READING_CONTRACT],
      [initialMemoryState(READING_CONTRACT.contractId, ACTIVATED_AT)],
    );
    const lens = lensOf(projectNodeRetrievability(index, NODE, instant(30)), 'reading');

    expect(lens?.presence).toBe('activated_untested');
    expect(lens?.retrievability).toBeNull();
    expect(lens?.coverage).toBe('activated');
    expect(isUnknown(lens!)).toBe(false);
    expect(isUntested(lens!)).toBe(true);
    expect(isFragile(lens!)).toBe(false);
  });

  it('projects a weak memory as fragile, with a real number behind it', () => {
    const state = reviewed(READING_CONTRACT.contractId, [
      { grade: 'again', day: 1 },
      { grade: 'hard', day: 2 },
    ]);
    const index = buildRetrievabilityIndex([READING_CONTRACT], [state]);
    const lens = lensOf(projectNodeRetrievability(index, NODE, instant(60)), 'reading');

    expect(lens?.presence).toBe('attested');
    expect(lens?.retrievability).toBeTypeOf('number');
    expect(lens?.retrievability).toBeLessThan(DEFAULT_FRAGILITY_POLICY.belowRetrievability);
    expect(isUnknown(lens!)).toBe(false);
    expect(isFragile(lens!)).toBe(true);
  });

  it('renders unknown and fragile as structurally different objects', () => {
    const fragileIndex = buildRetrievabilityIndex(
      [READING_CONTRACT],
      [reviewed(READING_CONTRACT.contractId, [{ grade: 'again', day: 1 }])],
    );
    const unknownIndex = buildRetrievabilityIndex([], []);

    const fragile = lensOf(projectNodeRetrievability(fragileIndex, NODE, instant(60)), 'reading');
    const unknown = lensOf(projectNodeRetrievability(unknownIndex, NODE, instant(60)), 'reading');

    expect(fragile).not.toEqual(unknown);
    expect(fragile?.presence).not.toBe(unknown?.presence);
    expect(typeof fragile?.retrievability).not.toBe(typeof unknown?.retrievability);
  });

  it('never calls an unmeasured lens fragile, whatever the policy asks for', () => {
    const index = buildRetrievabilityIndex([], []);
    const lens = lensOf(projectNodeRetrievability(index, UNTOUCHED_NODE, instant(60)), 'listening');
    expect(
      isFragile(lens!, {
        belowRetrievability: 1,
        orStabilityBelowDays: 10_000,
        requiresAttestation: true,
      }),
    ).toBe(false);
  });

  it('leaves the writing lens unknown for a node with contracts on other lenses', () => {
    const index = buildRetrievabilityIndex(CONTRACTS, [
      reviewed(READING_CONTRACT.contractId, [{ grade: 'good', day: 1 }]),
    ]);
    const projection = projectNodeRetrievability(index, NODE, instant(30));
    expect(lensOf(projection, 'writing')?.presence).toBe('unknown');
    expect(lensOf(projection, 'reading')?.presence).toBe('attested');
  });
});

describe('the derived bands are interpretable rules, not models', () => {
  it('maps review counts to uncertainty exactly as the rule states', () => {
    expect(uncertaintyForReviewCount(0)).toBe('unknown');
    expect(uncertaintyForReviewCount(1)).toBe('wide');
    expect(uncertaintyForReviewCount(2)).toBe('wide');
    expect(uncertaintyForReviewCount(3)).toBe('moderate');
    expect(uncertaintyForReviewCount(5)).toBe('moderate');
    expect(uncertaintyForReviewCount(6)).toBe('narrow');
    expect(UNCERTAINTY_RULE).toMatch(/band, not a percentage/i);
  });

  it('keeps coverage independent of strength', () => {
    expect(coverageForReviewCount(0, 0)).toBe('none');
    expect(coverageForReviewCount(1, 0)).toBe('activated');
    expect(coverageForReviewCount(1, 2)).toBe('sparse');
    expect(coverageForReviewCount(1, 3)).toBe('established');
  });

  it('can report established coverage and low retrievability at the same time', () => {
    // Learned, then forgotten: the state the map most needs to be able to draw.
    const state = reviewed(READING_CONTRACT.contractId, [
      { grade: 'good', day: 1 },
      { grade: 'good', day: 4 },
      { grade: 'good', day: 15 },
      { grade: 'again', day: 90 },
    ]);
    const index = buildRetrievabilityIndex([READING_CONTRACT], [state]);
    const lens = lensOf(projectNodeRetrievability(index, NODE, instant(150)), 'reading');

    expect(lens?.coverage).toBe('established');
    expect(lens?.retrievability).toBeLessThan(0.9);
    expect(lens?.lapses).toBeGreaterThan(0);
  });
});

describe('retrievability really decays, and really comes from the scheduler', () => {
  it('falls as time passes and rises after a successful review', () => {
    const state = reviewed(READING_CONTRACT.contractId, [
      { grade: 'good', day: 1 },
      { grade: 'good', day: 5 },
    ]);
    const index = buildRetrievabilityIndex([READING_CONTRACT], [state]);

    const soon = lensOf(projectNodeRetrievability(index, NODE, instant(6)), 'reading');
    const later = lensOf(projectNodeRetrievability(index, NODE, instant(40)), 'reading');
    const muchLater = lensOf(projectNodeRetrievability(index, NODE, instant(200)), 'reading');

    expect(soon?.retrievability).toBeGreaterThan(later?.retrievability ?? 0);
    expect(later?.retrievability).toBeGreaterThan(muchLater?.retrievability ?? 0);
    expect(muchLater?.retrievability).toBeGreaterThan(0);
  });

  it('flips dueState at the scheduled instant and not before', () => {
    const state = reviewed(READING_CONTRACT.contractId, [{ grade: 'easy', day: 1 }]);
    const index = buildRetrievabilityIndex([READING_CONTRACT], [state]);

    const before = lensOf(projectNodeRetrievability(index, NODE, instant(2)), 'reading');
    const after = lensOf(projectNodeRetrievability(index, NODE, instant(300)), 'reading');
    expect(before?.dueState).toBe('not_due');
    expect(after?.dueState).toBe('due');
  });

  it('is pure — two calls with the same inputs are deeply equal', () => {
    const index = buildRetrievabilityIndex(CONTRACTS, [
      reviewed(READING_CONTRACT.contractId, [{ grade: 'good', day: 3 }]),
    ]);
    expect(projectNodeRetrievability(index, NODE, instant(50))).toEqual(
      projectNodeRetrievability(index, NODE, instant(50)),
    );
  });

  it('projects a set of nodes in input order without cross-talk', () => {
    const index = buildRetrievabilityIndex(
      [READING_CONTRACT],
      [reviewed(READING_CONTRACT.contractId, [{ grade: 'good', day: 3 }])],
    );
    const projections = projectRetrievability(index, [NODE, UNTOUCHED_NODE], instant(50));

    expect(projections.map((entry) => entry.nodeId)).toEqual(['lex-bunki', 'lex-never-captured']);
    expect(lensOf(projections[0]!, 'reading')?.presence).toBe('attested');
    expect(lensOf(projections[1]!, 'reading')?.presence).toBe('unknown');
  });
});

describe('the time scrubber replays growth from the log, and only reads', () => {
  const reviews: readonly AdmittedReview[] = [
    { contractId: READING_CONTRACT.contractId, effectiveGrade: 'good', reviewedAt: instant(10) },
    { contractId: READING_CONTRACT.contractId, effectiveGrade: 'good', reviewedAt: instant(20) },
    { contractId: READING_CONTRACT.contractId, effectiveGrade: 'good', reviewedAt: instant(45) },
  ];
  const histories = buildMemoryHistories(activationsFor([READING_CONTRACT], ACTIVATED_AT), reviews);

  it('builds one version per activation plus one per admitted review', () => {
    expect(histories).toHaveLength(1);
    expect(histories[0]?.versions).toHaveLength(4);
    expect(histories[0]?.versions[0]?.from).toBe(ACTIVATED_AT);
  });

  it('ends on exactly the state the reducer produces from the same reviews', () => {
    const folded = reviews.reduce<MemoryState>(
      (state, review) => applyAdmittedReview(state, review),
      initialMemoryState(READING_CONTRACT.contractId, ACTIVATED_AT),
    );
    const versions = histories[0]?.versions ?? [];
    expect(versions[versions.length - 1]?.state).toEqual(folded);
  });

  it('does not depend on the order the reviews were handed over', () => {
    const shuffled = buildMemoryHistories(
      activationsFor([READING_CONTRACT], ACTIVATED_AT),
      [...reviews].reverse(),
    );
    expect(shuffled).toEqual(histories);
  });

  it('answers with the state as it stood, not with today’s state', () => {
    const history = histories[0]!;
    expect(memoryStateAsOf(history, instant(5))?.admittedReviewCount).toBe(0);
    expect(memoryStateAsOf(history, instant(15))?.admittedReviewCount).toBe(1);
    expect(memoryStateAsOf(history, instant(30))?.admittedReviewCount).toBe(2);
    expect(memoryStateAsOf(history, instant(90))?.admittedReviewCount).toBe(3);
  });

  it('returns null before the contract existed', () => {
    const history = buildMemoryHistories(activationsFor([READING_CONTRACT], instant(50)), [])[0]!;
    expect(memoryStateAsOf(history, instant(10))).toBeNull();
  });

  /**
   * `memoryStateAsOf` binary-searches, which is correct only on an ascending
   * list. The doc comment used to justify that with "versions is ascending by
   * construction" while the construction enforced nothing — sorting the reviews
   * does not stop a review dated before its contract's activation from being
   * appended after the activation version, and the list would then go backwards.
   * These are the tests that make the claim true rather than asserted.
   */
  describe('the ascending invariant the binary search depends on', () => {
    it('holds for the ordinary case', () => {
      expect(isAscendingByFrom(histories[0]!)).toBe(true);
    });

    it('holds when a review predates the contract’s activation', () => {
      const backwards = buildMemoryHistories(activationsFor([READING_CONTRACT], instant(50)), [
        {
          contractId: READING_CONTRACT.contractId,
          effectiveGrade: 'good',
          reviewedAt: instant(10),
        },
        {
          contractId: READING_CONTRACT.contractId,
          effectiveGrade: 'good',
          reviewedAt: instant(60),
        },
      ]);
      const history = backwards[0]!;
      expect(isAscendingByFrom(history)).toBe(true);
      // The impossible review is skipped, exactly as a review naming a contract
      // with no activation is skipped — replay is where that defect is caught.
      expect(history.versions).toHaveLength(2);
      expect(history.versions.map((version) => version.from)).toEqual([instant(50), instant(60)]);
    });

    it('holds for every history over shuffled, adversarial input', () => {
      const random = randomFrom(0xa5ce4d);
      const contracts = [READING_CONTRACT, MEANING_CONTRACT];
      for (let trial = 0; trial < 300; trial += 1) {
        const activations = contracts.map((contract) => ({
          contractId: contract.contractId,
          activatedAt: instant(random.int(40)),
        }));
        const reviews: AdmittedReview[] = Array.from(
          { length: random.int(12) },
          (): AdmittedReview => ({
            contractId: random.pick(contracts).contractId,
            effectiveGrade: random.pick(['again', 'hard', 'good', 'easy'] as const),
            // Deliberately spans instants before every activation, so the
            // out-of-order case is generated rather than hoped for.
            reviewedAt: instant(random.int(60)),
          }),
        );
        buildMemoryHistories(activations, reviews).forEach((history) => {
          expect(isAscendingByFrom(history), `trial ${String(trial)}`).toBe(true);
        });
      }
    });

    it('detects a hand-assembled history that is not ascending', () => {
      // The predicate has to be able to say no, or asserting it proves nothing.
      const ascending = histories[0]!;
      const descending = {
        contractId: ascending.contractId,
        versions: [...ascending.versions].reverse(),
      };
      expect(isAscendingByFrom(ascending)).toBe(true);
      expect(isAscendingByFrom(descending)).toBe(false);
    });

    it('agrees with a linear scan on every frame of an ascending history', () => {
      const history = histories[0]!;
      const scan = (at: string): MemoryState | null => {
        let found: MemoryState | null = null;
        for (const version of history.versions) {
          if (version.from <= at) found = version.state;
        }
        return found;
      };
      for (let day = 0; day <= 60; day += 1) {
        const at = instant(day);
        expect(memoryStateAsOf(history, at), `day ${String(day)}`).toEqual(scan(at));
      }
    });
  });

  it('shows a node moving from unknown to attested across the frames', () => {
    const frames = [instant(1), instant(12), instant(25), instant(60)];
    const projections = projectNodeRetrievabilityOverTime(
      [READING_CONTRACT],
      histories,
      NODE,
      frames,
    );

    const presences = projections.map((entry) => lensOf(entry, 'reading')?.presence);
    expect(presences).toEqual(['activated_untested', 'attested', 'attested', 'attested']);
    expect(projections.map((entry) => entry.at)).toEqual(frames);
  });

  it('sorts the frames rather than trusting the caller', () => {
    const frames = [instant(60), instant(1), instant(25)];
    const timeline = buildRetrievabilityIndexTimeline([READING_CONTRACT], histories, frames);
    expect(timeline.map((frame) => frame.at)).toEqual([instant(1), instant(25), instant(60)]);
  });

  it('is a read: scrubbing produces no events and mutates no state', () => {
    const before = JSON.stringify(histories);
    projectNodeRetrievabilityOverTime([READING_CONTRACT], histories, NODE, [
      instant(1),
      instant(30),
      instant(90),
      instant(200),
    ]);
    expect(JSON.stringify(histories)).toBe(before);
  });

  /**
   * The hoist that made the scrubber affordable shares one frozen bucketing
   * across every frame, and the tempting next step — sharing one mutable "state
   * as of now" map too — would alias every frame onto the last one. Reading the
   * frames out of order is how that shows up, so this reads them backwards.
   */
  it('gives each frame its own answer, whatever order the frames are read in', () => {
    const timeline = buildRetrievabilityIndexTimeline([READING_CONTRACT], histories, [
      instant(1),
      instant(12),
      instant(25),
      instant(60),
    ]);

    const backwards = [...timeline]
      .reverse()
      .map((frame) => projectNodeRetrievability(frame.index, NODE, frame.at))
      .reverse();

    expect(backwards.map((entry) => lensOf(entry, 'reading')?.admittedReviewCount)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(timeline.map((frame) => frame.index.memoryStateCount)).toEqual([1, 1, 1, 1]);
  });

  /**
   * A node's sparkline narrows the contract set to the node's own components
   * before it walks the frames. That is only legitimate if it changes no answer,
   * so: the same node, once against its own contract and once against a contract
   * set with an unrelated component in it.
   */
  it('answers identically whether or not unrelated contracts are handed over', () => {
    const unrelated: ProjectedContract = {
      contractId: 'contract:kc:別:orthography_to_reading',
      targetComponentId: 'kc:別',
      skill: 'orthography_to_reading',
    };
    const unrelatedHistories = buildMemoryHistories(activationsFor([unrelated], instant(2)), [
      { contractId: unrelated.contractId, effectiveGrade: 'again', reviewedAt: instant(3) },
    ]);
    const frames = [instant(1), instant(12), instant(25), instant(60)];

    expect(
      projectNodeRetrievabilityOverTime(
        [READING_CONTRACT, unrelated],
        [...histories, ...unrelatedHistories],
        NODE,
        frames,
      ),
    ).toEqual(projectNodeRetrievabilityOverTime([READING_CONTRACT], histories, NODE, frames));
  });

  it('ignores a review for a contract nothing activated, without throwing', () => {
    const orphaned = buildMemoryHistories(
      [],
      [{ contractId: 'contract:ghost', effectiveGrade: 'good', reviewedAt: instant(4) }],
    );
    expect(orphaned).toEqual([]);
  });
});
