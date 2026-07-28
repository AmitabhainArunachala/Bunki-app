/**
 * Turning an estimate into a road and a plan (Campaign E / B6; map document
 * §4.2).
 *
 * Two pure functions and one rule between them: **the guide may only propose
 * stations the caller already offered it.** `proposeRoute` takes the candidate
 * set as an argument and can neither invent a word nor reach a dictionary, so a
 * route can never contain something the data does not have. That is the same
 * discipline the journey compiler applies to branch affordances — "a branch
 * that has nowhere to go is not a branch" — one level up.
 *
 * The selection itself is deliberately dull. Candidates whose lens the exchange
 * pointed at come first, in the road's own order; the rest follow, so the road
 * stays a road and nothing is silently dropped. A cleverer ranking would be a
 * ranking nobody could check, and the competitive review is explicit that an
 * invented relevance model is the failure mode here.
 */

import { routeLayerRank, type RouteWaypointCandidate } from './records.ts';
import { proposedLenses, type GuideEstimate } from './assessment.ts';
import {
  guideProvenance,
  planRecord,
  routeRecord,
  type GuideProvenanceInput,
  type GuidePlanRecord,
  type GuideRouteRecord,
  type PlanStep,
} from './records.ts';

/** How many stations the short-term plan may hold. Days, not months. */
export const MAX_PLAN_STEPS = 3;

/**
 * Sort candidates onto a road.
 *
 * Oldest layer first, then by the order the caller supplied — which is the
 * caller's own statement about how the road runs. Within a layer the guide has
 * no opinion, and pretending to one would be inventing a curriculum.
 */
function roadOrder(
  candidates: readonly RouteWaypointCandidate[],
): readonly RouteWaypointCandidate[] {
  return [...candidates]
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        routeLayerRank(left.candidate.layer) - routeLayerRank(right.candidate.layer) ||
        left.index - right.index,
    )
    .map((entry) => entry.candidate);
}

export interface ProposeRouteInput {
  readonly estimate: GuideEstimate;
  readonly candidates: readonly RouteWaypointCandidate[];
  readonly recordId: string;
  readonly title: string;
  readonly provenance: GuideProvenanceInput;
}

/**
 * The long-term route.
 *
 * Every candidate appears. The estimate decides the *order of attention*, not
 * membership: dropping stations the exchange did not happen to point at would
 * make a six-turn conversation decide what a learner never gets to see, which
 * is a much stronger claim than a six-turn conversation can carry.
 */
export function proposeRoute(input: ProposeRouteInput): GuideRouteRecord {
  const focus = new Set(proposedLenses(input.estimate));
  const ordered = roadOrder(input.candidates);
  const first = ordered.filter((candidate) => focus.has(candidate.lens));
  const rest = ordered.filter((candidate) => !focus.has(candidate.lens));

  return routeRecord({
    recordId: input.recordId,
    title: input.title,
    waypoints: focus.size === 0 ? ordered : [...first, ...rest],
    provenance: guideProvenance(input.provenance),
  });
}

export interface ProposePlanInput {
  readonly route: GuideRouteRecord;
  readonly recordId: string;
  readonly title: string;
  readonly provenance: GuideProvenanceInput;
  /**
   * Stations the learner has already taken up, by waypoint id.
   *
   * Supplied by the caller from the event log, never derived here. The plan
   * skips them because inviting someone to start something they started is the
   * kind of small wrongness that makes a guide feel like it is not looking.
   */
  readonly alreadyTakenUp?: readonly string[] | undefined;
}

/**
 * The next few stations.
 *
 * Bounded by {@link MAX_PLAN_STEPS}, which is what makes it a plan rather than a
 * queue. The competitive round-2 finding is that an unbounded list is the whole
 * disease; a short-term plan that could grow to the length of the road would
 * reproduce it under a friendlier name.
 */
export function proposePlan(input: ProposePlanInput): GuidePlanRecord {
  const taken = new Set(input.alreadyTakenUp ?? []);
  const steps: Omit<PlanStep, 'ordinal'>[] = input.route.waypoints
    .filter((waypoint) => !taken.has(waypoint.id))
    .slice(0, MAX_PLAN_STEPS)
    .map((waypoint) => ({
      id: `${input.recordId}-${waypoint.id}`,
      targetForm: waypoint.targetForm,
      lens: waypoint.lens,
      invitation: `Go and look at ${waypoint.targetForm} — ${waypoint.note}`,
    }));

  return planRecord({
    recordId: input.recordId,
    title: input.title,
    steps,
    provenance: guideProvenance(input.provenance),
  });
}
