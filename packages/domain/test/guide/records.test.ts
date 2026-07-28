/**
 * The route and the plan as records (Campaign E / B6; map document §4.2).
 *
 * > Both are **visible, editable, and revisable**, and both are written down as
 * > records with provenance, so a learner can see what the guide believed and
 * > when.
 *
 * Editable and revisable are two claims. Editable is tested by editing;
 * revisable is tested by checking that an edit *supersedes* rather than
 * overwrites, and that the earlier record is still readable afterwards.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_GUIDE_LEDGER,
  MAX_PLAN_STEPS,
  currentPlan,
  currentRoute,
  formEstimate,
  guideProvenance,
  isSuperseded,
  openConversation,
  planHistory,
  proposePlan,
  proposeRoute,
  recordPlan,
  recordRoute,
  routeHistory,
  withRouteTitle,
  withWaypointMoved,
  withoutPlanStep,
  withoutWaypoint,
  answerTurn,
} from '../../src/guide/index.ts';

import { AT, CANDIDATES, LATER, PROMPTS } from './support.ts';

const estimateWith = (stance: 'knew_the_form_not_the_reading' | 'new_to_me' | null) => {
  const conversation =
    stance === null
      ? openConversation(PROMPTS)
      : answerTurn(openConversation(PROMPTS), 'turn-senro', stance, AT);
  return formEstimate(conversation, AT);
};

const aRoute = (recordId = 'route-1') =>
  proposeRoute({
    estimate: estimateWith(null),
    candidates: CANDIDATES,
    recordId,
    title: '分かれた道',
    provenance: { author: 'guide_offline_fixture', at: AT, basisTurnIds: ['turn-senro'] },
  });

describe('the long-term route', () => {
  it('is a finite, numbered road — the sentence an unbounded queue cannot say', () => {
    const route = aRoute();
    expect(route.waypoints).toHaveLength(CANDIDATES.length);
    expect(route.waypoints.map((waypoint) => waypoint.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(route.horizon).toBe('months');
  });

  it('runs oldest road first, because a layer is a coordinate and not a difficulty', () => {
    const route = aRoute();
    expect(route.waypoints.map((waypoint) => waypoint.layer)).toEqual([
      'kodo',
      'kodo',
      'kaido',
      'kaido',
      'kaido',
      'tetsudo',
      'tetsudo',
      'tetsudo',
    ]);
  });

  it('carries who proposed it, when, and from which turns', () => {
    const route = aRoute();
    expect(route.provenance.author).toBe('guide_offline_fixture');
    expect(route.provenance.at).toBe(AT);
    expect(route.provenance.basisTurnIds).toEqual(['turn-senro']);
    expect(route.provenance.standing).toBe('proposal');
  });

  it('contains only stations the caller offered it', () => {
    const offered = new Set(CANDIDATES.map((candidate) => candidate.targetForm));
    for (const waypoint of aRoute().waypoints) {
      expect(offered).toContain(waypoint.targetForm);
    }
  });

  it('reorders by the estimate and drops nothing', () => {
    const route = proposeRoute({
      estimate: estimateWith('knew_the_form_not_the_reading'),
      candidates: CANDIDATES,
      recordId: 'route-2',
      title: '分かれた道',
      provenance: { author: 'guide_offline_fixture', at: AT },
    });
    // Reading is the proposed lens, so reading stations come first…
    expect(route.waypoints[0]?.lens).toBe('reading');
    // …and every station is still on the road.
    expect(route.waypoints).toHaveLength(CANDIDATES.length);
    expect(new Set(route.waypoints.map((w) => w.id))).toEqual(new Set(CANDIDATES.map((c) => c.id)));
  });
});

describe('editing a route', () => {
  it('removes a station and renumbers, so "of 8" does not become a lie', () => {
    const first = aRoute();
    const second = withoutWaypoint(
      first,
      'wp-kiro',
      'route-2',
      guideProvenance({ author: 'learner_edit', at: LATER }),
    );

    expect(second.waypoints).toHaveLength(7);
    expect(second.waypoints.map((w) => w.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(second.waypoints.map((w) => w.id)).not.toContain('wp-kiro');
  });

  it('supersedes rather than overwrites, and the earlier belief stays readable', () => {
    const first = aRoute();
    const second = withoutWaypoint(
      first,
      'wp-kiro',
      'route-2',
      guideProvenance({ author: 'learner_edit', at: LATER }),
    );

    expect(second.supersedes).toBe('route-1');
    expect(second.provenance.author).toBe('learner_edit');
    // The first record is untouched — a record of what the guide believed then.
    expect(first.waypoints).toHaveLength(8);
    expect(first.provenance.at).toBe(AT);
  });

  it('is a no-op for a station that is not on the road', () => {
    const first = aRoute();
    const same = withoutWaypoint(
      first,
      'wp-nowhere',
      'route-2',
      guideProvenance({ author: 'learner_edit', at: LATER }),
    );
    expect(same).toBe(first);
  });

  it('moves a station one place and renumbers', () => {
    const first = aRoute();
    const moved = withWaypointMoved(
      first,
      'wp-wakareru',
      -1,
      'route-2',
      guideProvenance({ author: 'learner_edit', at: LATER }),
    );
    expect(moved.waypoints[0]?.id).toBe('wp-wakareru');
    expect(moved.waypoints[0]?.ordinal).toBe(1);
    expect(moved.waypoints[1]?.id).toBe('wp-michi');
    expect(moved.supersedes).toBe('route-1');
  });

  it('does not move a station off either end', () => {
    const first = aRoute();
    const provenance = guideProvenance({ author: 'learner_edit', at: LATER });
    expect(withWaypointMoved(first, 'wp-michi', -1, 'route-2', provenance)).toBe(first);
    expect(withWaypointMoved(first, 'wp-bunki', 1, 'route-2', provenance)).toBe(first);
  });

  it('lets the learner rename the road', () => {
    const renamed = withRouteTitle(
      aRoute(),
      '駅から山へ',
      'route-2',
      guideProvenance({ author: 'learner_edit', at: LATER }),
    );
    expect(renamed.title).toBe('駅から山へ');
    expect(renamed.supersedes).toBe('route-1');
  });
});

describe('the short-term plan', () => {
  const route = aRoute();
  const plan = proposePlan({
    route,
    recordId: 'plan-1',
    title: 'The next few stations',
    provenance: { author: 'guide_offline_fixture', at: AT },
  });

  it('is days, not months, and is bounded so it cannot become a queue', () => {
    expect(plan.horizon).toBe('days');
    expect(plan.steps.length).toBeLessThanOrEqual(MAX_PLAN_STEPS);
    expect(plan.steps).toHaveLength(3);
  });

  it('skips stations the learner already took up', () => {
    const skipping = proposePlan({
      route,
      recordId: 'plan-2',
      title: 'The next few stations',
      provenance: { author: 'guide_offline_fixture', at: AT },
      alreadyTakenUp: ['wp-michi', 'wp-wakareru'],
    });
    expect(skipping.steps.map((step) => step.targetForm)).toEqual(['岐路', '分岐点', '道路']);
  });

  it('gives every step a lens, so no invitation is capability-free', () => {
    for (const step of plan.steps) {
      expect(['reading', 'meaning', 'listening', 'production', 'writing']).toContain(step.lens);
    }
  });

  it('phrases every step as an invitation and never as a requirement', () => {
    for (const step of plan.steps) {
      expect(step.invitation).toMatch(/^Go and look at /);
      expect(step.invitation).not.toMatch(/\bmust\b|\brequired\b|\bdue\b/i);
    }
  });

  it('drops a step and renumbers', () => {
    const edited = withoutPlanStep(
      plan,
      plan.steps[1]?.id ?? '',
      'plan-2',
      guideProvenance({ author: 'learner_edit', at: LATER }),
    );
    expect(edited.steps).toHaveLength(2);
    expect(edited.steps.map((step) => step.ordinal)).toEqual([1, 2]);
    expect(edited.supersedes).toBe('plan-1');
  });
});

describe('the ledger', () => {
  it('keeps every record and hands back the one in force', () => {
    const first = aRoute('route-1');
    const second = withoutWaypoint(
      first,
      'wp-kiro',
      'route-2',
      guideProvenance({ author: 'learner_edit', at: LATER }),
    );

    let ledger = recordRoute(EMPTY_GUIDE_LEDGER, first);
    ledger = recordRoute(ledger, second);

    expect(ledger.routes).toHaveLength(2);
    expect(currentRoute(ledger)?.recordId).toBe('route-2');
    expect(routeHistory(ledger).map((record) => record.recordId)).toEqual(['route-2', 'route-1']);
    expect(isSuperseded(ledger, first)).toBe(true);
    expect(isSuperseded(ledger, second)).toBe(false);
  });

  it('is idempotent on a record it already holds', () => {
    const first = aRoute();
    const ledger = recordRoute(recordRoute(EMPTY_GUIDE_LEDGER, first), first);
    expect(ledger.routes).toHaveLength(1);
  });

  it('keeps plans and routes apart', () => {
    const route = aRoute();
    const plan = proposePlan({
      route,
      recordId: 'plan-1',
      title: 'The next few stations',
      provenance: { author: 'guide_ai', at: AT, model: 'a-model', provider: 'a-provider' },
    });
    const ledger = recordPlan(recordRoute(EMPTY_GUIDE_LEDGER, route), plan);

    expect(currentPlan(ledger)?.recordId).toBe('plan-1');
    expect(planHistory(ledger)).toHaveLength(1);
    expect(ledger.routes).toHaveLength(1);
  });

  it('starts empty and says so rather than inventing a road', () => {
    expect(currentRoute(EMPTY_GUIDE_LEDGER)).toBeNull();
    expect(currentPlan(EMPTY_GUIDE_LEDGER)).toBeNull();
  });
});
