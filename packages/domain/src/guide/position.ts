/**
 * The guide's position on the road (Campaign E / B6; map document §4.1).
 *
 * > The guide is not a bubble in the corner. It is **somewhere on the road,
 * > ahead of you**. It walks. When you branch, it is at the branch. This one
 * > decision does more for "constant presence" than any amount of personality
 * > writing, and it means the guide can be redesigned later without
 * > re-architecting anything.
 *
 * So position is modelled as state and derived by a total function, not drawn.
 * A later character design changes what stands at a waypoint and changes
 * nothing here — which is the whole point of building this before anyone has
 * decided what the 案内人 looks like or sounds like.
 *
 * ## The three rules, in order of precedence
 *
 * 1. **At a declared branch, if there is one.** A fork wins over everything,
 *    including being ahead: the fork is the thing worth standing at. This is
 *    the only case in which the guide is behind the learner, and it is behind
 *    them because the fork is.
 * 2. **Otherwise one station ahead.** Not two, not at the end of the road — a
 *    presence you can see from where you are.
 * 3. **At the last station when the learner is at the last station.** A guide
 *    that walked off the end of the road would be nowhere.
 *
 * ## Where the learner is, and why it is not self-reported
 *
 * A station is *passed* when the learner has taken its word up for study, and
 * *reached* when they have met it at all. Both are facts the event log already
 * holds — a promotion is an explicit act with an event behind it — so the
 * learner's position is real state rather than a thing they tell the guide. The
 * caller supplies it as {@link WaypointProgress}; this module computes nothing
 * about promotion itself and imports nothing that could.
 *
 * ## Who declares a fork
 *
 * Not this module, and structurally not this module: {@link DeclaredBranch} has
 * exactly one constructor, {@link declaredBranchFromStumble}, and its parameter
 * type is `RepairStumble` from `src/session/` — a value that exists only because
 * a graded review reached the evidence gate. No guide artefact is assignable to
 * it, so the guide cannot manufacture the thing it stands at.
 */

import type { RepairStumble } from '../session/repair.ts';
import type { IsoInstant } from '../primitives.ts';
import type { GuideArtefact } from './boundary.ts';
import type { GuideRouteRecord } from './records.ts';

// ---------------------------------------------------------------------------
// Where the learner is
// ---------------------------------------------------------------------------

/**
 * One station, as the learner's own history left it.
 *
 * Two booleans and no third state, because there is no third fact the log
 * holds: either a thread exists for this word or it does not, and either the
 * learner promoted it or they did not.
 */
export interface WaypointProgress {
  readonly waypointId: string;
  /** A thread exists for this station's word. */
  readonly reached: boolean;
  /** The learner explicitly took it up for study. Only a person can do this. */
  readonly passed: boolean;
}

export const EMPTY_PROGRESS: readonly WaypointProgress[] = Object.freeze([]);

function progressIndex(
  progress: readonly WaypointProgress[],
): ReadonlyMap<string, WaypointProgress> {
  return new Map(progress.map((entry) => [entry.waypointId, entry]));
}

/**
 * The learner's own ordinal: the first station they have not passed.
 *
 * `null` for an empty road. Equal to the road's length plus nothing when every
 * station is passed — in that case the learner stands at the last one, because
 * there is nowhere further on this road and reporting a position past its end
 * would be a count nobody could point at.
 */
export function learnerOrdinalOn(
  route: GuideRouteRecord,
  progress: readonly WaypointProgress[],
): number | null {
  if (route.waypoints.length === 0) return null;
  const index = progressIndex(progress);
  const firstUnpassed = route.waypoints.find((waypoint) => index.get(waypoint.id)?.passed !== true);
  return firstUnpassed?.ordinal ?? route.waypoints.length;
}

// ---------------------------------------------------------------------------
// A fork the data declared
// ---------------------------------------------------------------------------

/**
 * A fork on this road.
 *
 * `declaredBy` has one member on purpose. Widening it means adding another real
 * decider — the review timing when a contract goes fragile is the obvious next
 * one — and that widening is a visible edit here rather than a string a caller
 * can pass.
 */
export const BRANCH_DECLARERS = ['evidence_gate_stumble'] as const;
export type BranchDeclarer = (typeof BRANCH_DECLARERS)[number];

export interface DeclaredBranch {
  readonly waypointId: string;
  readonly declaredBy: BranchDeclarer;
  /** The contract that was missed. */
  readonly contractId: string;
  /** The `ReviewGraded` event that recorded the miss. */
  readonly eventId: string;
  readonly at: IsoInstant;
  /** What happened, in one line. A fact, never a diagnosis (REQ-JRN-01). */
  readonly because: string;
}

/**
 * The only way to make a {@link DeclaredBranch}.
 *
 * Its input is `RepairStumble`, which `src/session/commands.ts` produces from a
 * `ReviewGraded` in the log with an admitted grade of `again`. The guide cannot
 * construct one of those — it has no minter, no gate and no log — so the guide
 * cannot construct a fork, which is exactly map document §4.3's boundary
 * expressed in the type system rather than in a sentence.
 */
export function declaredBranchFromStumble(
  stumble: RepairStumble,
  waypointId: string,
): DeclaredBranch {
  return Object.freeze({
    waypointId,
    declaredBy: 'evidence_gate_stumble' as const,
    contractId: stumble.contractId,
    eventId: stumble.eventId,
    at: stumble.at,
    because: `A ${stumble.skill.replace(/_/g, ' ')} retrieval did not come back here, and the evidence gate admitted the miss. The fork is a consequence of that, not a judgement about you.`,
  });
}

// ---------------------------------------------------------------------------
// The guide's own position
// ---------------------------------------------------------------------------

export const GUIDE_STANCES = ['at_branch', 'ahead_on_road', 'at_the_end', 'no_road'] as const;
export type GuideStance = (typeof GUIDE_STANCES)[number];

export interface GuidePosition extends GuideArtefact {
  readonly guideArtefact: 'guide_position';
  readonly stance: GuideStance;
  /** The station the guide is standing at, or `null` when there is no road. */
  readonly waypointId: string | null;
  /** 1-based, matching the waypoint. `null` when there is no road. */
  readonly ordinal: number | null;
  /** How long the road is. The finite count the learner is entitled to see. */
  readonly total: number;
  /** Where the learner stands. `null` when there is no road. */
  readonly learnerOrdinal: number | null;
  /** The fork the guide is standing at, when it is standing at one. */
  readonly branch: DeclaredBranch | null;
  /** Why the guide is here, in one line. */
  readonly because: string;
}

/**
 * Where the guide is standing, right now.
 *
 * Total: every road, every progress list and every branch set produces a
 * position, including the empty road, which produces `no_road` rather than an
 * exception. A guide that could not say "there is no road yet" would have to
 * pretend there was one.
 */
export function guidePositionOn(
  route: GuideRouteRecord,
  progress: readonly WaypointProgress[],
  branches: readonly DeclaredBranch[],
): GuidePosition {
  const total = route.waypoints.length;

  if (total === 0) {
    return Object.freeze({
      guideArtefact: 'guide_position' as const,
      stance: 'no_road' as GuideStance,
      waypointId: null,
      ordinal: null,
      total: 0,
      learnerOrdinal: null,
      branch: null,
      because: 'There is no road yet, so there is nowhere to stand. Talk to the guide first.',
    });
  }

  const onThisRoad = new Set(route.waypoints.map((waypoint) => waypoint.id));
  // Earliest fork on this road wins: a learner standing in front of two forks
  // has to be shown the near one, and "earliest" is the only ordering that does
  // not need an opinion about which fork matters more.
  const forks = branches
    .filter((branch) => onThisRoad.has(branch.waypointId))
    .map((branch) => ({
      branch,
      ordinal:
        route.waypoints.find((waypoint) => waypoint.id === branch.waypointId)?.ordinal ?? total,
    }))
    .sort((left, right) => left.ordinal - right.ordinal);

  const learnerOrdinal = learnerOrdinalOn(route, progress) ?? 1;
  const nearest = forks[0];

  if (nearest !== undefined) {
    return Object.freeze({
      guideArtefact: 'guide_position' as const,
      stance: 'at_branch' as GuideStance,
      waypointId: nearest.branch.waypointId,
      ordinal: nearest.ordinal,
      total,
      learnerOrdinal,
      branch: nearest.branch,
      because:
        'A fork was declared here, so this is where the guide is standing. The guide did not open it and cannot close it.',
    });
  }

  if (learnerOrdinal >= total) {
    const last = route.waypoints[total - 1];
    return Object.freeze({
      guideArtefact: 'guide_position' as const,
      stance: 'at_the_end' as GuideStance,
      waypointId: last?.id ?? null,
      ordinal: total,
      total,
      learnerOrdinal,
      branch: null,
      because:
        'This road ends here, and you have walked it. The guide is waiting at the last station.',
    });
  }

  const ahead = route.waypoints[learnerOrdinal];
  return Object.freeze({
    guideArtefact: 'guide_position' as const,
    stance: 'ahead_on_road' as GuideStance,
    waypointId: ahead?.id ?? null,
    ordinal: learnerOrdinal + 1,
    total,
    learnerOrdinal,
    branch: null,
    because: 'No fork has been declared, so the guide is one station ahead of you.',
  });
}

/** "Station 3 of 8" — the sentence an unbounded queue cannot say. */
export function positionSentence(position: GuidePosition): string {
  if (position.ordinal === null) return 'Nowhere yet — there is no road.';
  return `Station ${position.ordinal} of ${position.total}`;
}
