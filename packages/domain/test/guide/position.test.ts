/**
 * Position as state (Campaign E / B6; map document §4.1).
 *
 * The three rules, and the property that ties them together: the guide is ahead
 * of the learner *unless* it is at a fork, and it is never anywhere else.
 */

import { describe, expect, it } from 'vitest';

import {
  declaredBranchFromStumble,
  formEstimate,
  guidePositionOn,
  learnerOrdinalOn,
  openConversation,
  positionSentence,
  proposeRoute,
  routeRecord,
  guideProvenance,
  type WaypointProgress,
} from '../../src/guide/index.ts';
import type { RepairStumble } from '../../src/session/repair.ts';

import { AT, CANDIDATES } from './support.ts';

const route = proposeRoute({
  estimate: formEstimate(openConversation([]), AT),
  candidates: CANDIDATES,
  recordId: 'route-1',
  title: '分かれた道',
  provenance: { author: 'guide_offline_fixture', at: AT },
});

const emptyRoad = routeRecord({
  recordId: 'route-empty',
  title: 'nothing yet',
  waypoints: [],
  provenance: guideProvenance({ author: 'guide_offline_fixture', at: AT }),
});

/** Everything up to and including `ordinal` has been taken up for study. */
function passedThrough(ordinal: number): readonly WaypointProgress[] {
  return route.waypoints.map((waypoint) => ({
    waypointId: waypoint.id,
    reached: waypoint.ordinal <= ordinal,
    passed: waypoint.ordinal <= ordinal,
  }));
}

/**
 * A stumble, in the shape `src/session/commands.ts` produces from a graded
 * review the evidence gate admitted. Constructed here as a fixture; the point
 * of the type is that the guide cannot make one from anything it produces.
 */
const stumble: RepairStumble = {
  contractId: 'contract-douro-reading',
  threadId: 'thread-douro',
  skill: 'orthography_to_reading',
  eventId: 'event-42',
  at: AT,
};

describe('where the learner is', () => {
  it('is the first station they have not taken up', () => {
    expect(learnerOrdinalOn(route, passedThrough(0))).toBe(1);
    expect(learnerOrdinalOn(route, passedThrough(3))).toBe(4);
  });

  it('is the last station when the whole road is walked, never past the end', () => {
    expect(learnerOrdinalOn(route, passedThrough(8))).toBe(8);
  });

  it('is null on an empty road', () => {
    expect(learnerOrdinalOn(emptyRoad, [])).toBeNull();
  });

  it('treats a station that was merely met as not passed', () => {
    const met = route.waypoints.map((waypoint) => ({
      waypointId: waypoint.id,
      reached: true,
      passed: false,
    }));
    expect(learnerOrdinalOn(route, met)).toBe(1);
  });
});

describe('where the guide is', () => {
  it('stands one station ahead when no fork has been declared', () => {
    const position = guidePositionOn(route, passedThrough(2), []);
    expect(position.stance).toBe('ahead_on_road');
    expect(position.learnerOrdinal).toBe(3);
    expect(position.ordinal).toBe(4);
    expect(position.branch).toBeNull();
    expect(positionSentence(position)).toBe('Station 4 of 8');
  });

  it('waits at the last station when the learner has walked the road', () => {
    const position = guidePositionOn(route, passedThrough(8), []);
    expect(position.stance).toBe('at_the_end');
    expect(position.ordinal).toBe(8);
    expect(position.waypointId).toBe('wp-bunki');
  });

  it('says there is no road rather than pretending there is one', () => {
    const position = guidePositionOn(emptyRoad, [], []);
    expect(position.stance).toBe('no_road');
    expect(position.ordinal).toBeNull();
    expect(position.total).toBe(0);
    expect(positionSentence(position)).toMatch(/no road/);
  });

  it('stands at the fork when one is declared', () => {
    const branch = declaredBranchFromStumble(stumble, 'wp-douro');
    const position = guidePositionOn(route, passedThrough(2), [branch]);

    expect(position.stance).toBe('at_branch');
    expect(position.waypointId).toBe('wp-douro');
    expect(position.ordinal).toBe(5);
    expect(position.branch).toBe(branch);
  });

  it('stands at the nearest fork when two are open', () => {
    const near = declaredBranchFromStumble(stumble, 'wp-wakareru');
    const far = declaredBranchFromStumble(stumble, 'wp-eki');
    expect(guidePositionOn(route, passedThrough(0), [far, near]).waypointId).toBe('wp-wakareru');
  });

  it('ignores a fork on some other road', () => {
    const elsewhere = declaredBranchFromStumble(stumble, 'wp-not-on-this-road');
    const position = guidePositionOn(route, passedThrough(2), [elsewhere]);
    expect(position.stance).toBe('ahead_on_road');
  });

  /**
   * The one case the guide is behind the learner, stated as a property.
   *
   * The map document says "somewhere on the road, ahead of you" and "when you
   * branch, it is at the branch". Those two can conflict — a fork is at a
   * station the learner already walked past — and the second wins. This asserts
   * that the conflict is resolved the way the document resolves it and nowhere
   * else.
   */
  it('is never behind the learner except at a fork', () => {
    for (let walked = 0; walked <= route.waypoints.length; walked += 1) {
      const progress = passedThrough(walked);
      const clear = guidePositionOn(route, progress, []);
      expect(clear.ordinal ?? 0).toBeGreaterThanOrEqual(clear.learnerOrdinal ?? 0);
      expect(clear.stance).not.toBe('at_branch');
    }

    const behind = declaredBranchFromStumble(stumble, 'wp-michi');
    const atFork = guidePositionOn(route, passedThrough(5), [behind]);
    expect(atFork.stance).toBe('at_branch');
    expect(atFork.ordinal).toBe(1);
    expect(atFork.learnerOrdinal).toBe(6);
  });

  it('is total: every walked position on the road produces a position', () => {
    for (let walked = 0; walked <= route.waypoints.length; walked += 1) {
      const position = guidePositionOn(route, passedThrough(walked), []);
      expect(position.total).toBe(8);
      expect(position.ordinal).not.toBeNull();
      expect(position.because.length).toBeGreaterThan(0);
    }
  });
});

describe('who declares a fork', () => {
  it('records the gate’s own facts and phrases the cause as a fact, not a diagnosis', () => {
    const branch = declaredBranchFromStumble(stumble, 'wp-douro');
    expect(branch.declaredBy).toBe('evidence_gate_stumble');
    expect(branch.contractId).toBe('contract-douro-reading');
    expect(branch.eventId).toBe('event-42');
    expect(branch.at).toBe(AT);
    expect(branch.because).toMatch(/not a judgement about you/);
    // No claim about a cause. REQ-JRN-01 forbids inferring one from a stumble.
    expect(branch.because).not.toMatch(/because you (do not|don't) know/i);
  });

  it('cannot be built from anything the guide produced', () => {
    // A compile-time claim, made checkable at runtime: the guide's own outputs
    // have no `contractId`, `eventId` and `skill`, so none of them is a
    // `RepairStumble`. `@ts-expect-error` is the assertion; the runtime check
    // below is what makes a failure legible if the type ever widens.
    const estimate = formEstimate(openConversation([]), AT);
    // @ts-expect-error a guide estimate is not a stumble and must never become one
    const attempted = (): unknown => declaredBranchFromStumble(estimate, 'wp-michi');
    expect(typeof attempted).toBe('function');
    expect(Object.keys(estimate)).not.toContain('contractId');
    expect(Object.keys(estimate)).not.toContain('eventId');
  });
});
