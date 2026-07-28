/**
 * The fork, as data (Campaign E, lane B5; REQ-JRN-02, REQ-JRN-03).
 *
 * ## What a rail is
 *
 * 分岐 is a railway word — a branch point — and the frozen spec §3 says what
 * happens at one: *"Untaken branches stay visible on the map as dimmed rails —
 * revisitable."* So the fork has three kinds of rail and every one of them is
 * drawn:
 *
 *   - **taking** — the road being walked. Lit.
 *   - **open** — offered and not chosen. Dimmed, and still there.
 *   - **closed** — a family the compiler could not offer at all, because the
 *     data has nowhere for it to go. Dimmed further, drawn, and carrying the
 *     reason in its own words.
 *
 * The third kind is the one most systems omit, and omitting it is what makes a
 * branch feel arbitrary: a learner shown two roads with no account of the other
 * four cannot tell whether the other four were considered. `CandidateCause`
 * already carries `unavailableBecause` for exactly this, so the honest thing is
 * to render it rather than to filter it out.
 *
 * ## What this module does not do
 *
 * It does not rank, choose, or diagnose. `compileJourney` decides what is
 * offered and `selectBranch` decides what is recommended; both live in
 * `@bunki/domain` and both are pure. This turns their output into rows with an
 * opacity role attached, and it is deliberately the only thing between the
 * domain and the pixels — a projection that re-ranked would be a second,
 * unversioned compiler.
 */

import {
  BRANCH_FAMILY_LABELS,
  branchFamilyRank,
  type BranchFamily,
  type CompiledJourney,
  type JourneyState,
} from '@bunki/domain';

/** Whether a rail is being walked, is open and untaken, or has nowhere to go. */
export const RAIL_STATES = ['taking', 'open', 'closed'] as const;
export type RailState = (typeof RAIL_STATES)[number];

export interface Rail {
  readonly family: BranchFamily;
  readonly label: string;
  /** Always conditional — "may", "might". Never a diagnosis (REQ-JRN-01). */
  readonly hypothesis: string;
  /** What walking this road actually involves, in one line. */
  readonly work: string;
  /** Facts from the ledger that raised this route. Checkable, never a score. */
  readonly support: readonly string[];
  readonly state: RailState;
  /**
   * The default, from the skill that stumbled. A lookup, not an inference, and
   * choosing another rail is not an error (REQ-JRN-03).
   */
  readonly recommended: boolean;
  /** Why this rail has nowhere to go. `null` unless `state` is `closed`. */
  readonly closedBecause: string | null;
  /** True once this rail can be entered — i.e. the fork is still a fork. */
  readonly enterable: boolean;
}

/**
 * Every family, as a rail, in the compiler's own fixed order.
 *
 * All six, always. A fork that rendered only what was offered would be a fork
 * with the untaken roads deleted rather than dimmed, which is the one thing
 * §3 says not to do — and it would also make the offer look like the whole of
 * what was considered.
 */
export function railsOf(journey: CompiledJourney, chosen: BranchFamily | null): readonly Rail[] {
  const offered = new Map(journey.offered.map((option) => [option.family, option]));

  const rails = journey.hypotheses.map<Rail>((cause) => {
    const option = offered.get(cause.family);
    const isOffered = option !== undefined;
    const state: RailState = !isOffered
      ? 'closed'
      : chosen === cause.family
        ? 'taking'
        : 'open';

    return Object.freeze({
      family: cause.family,
      label: BRANCH_FAMILY_LABELS[cause.family],
      hypothesis: cause.hypothesis,
      work: cause.work,
      support: cause.support,
      state,
      recommended: journey.recommended === cause.family && isOffered,
      closedBecause: state === 'closed' ? cause.unavailableBecause : null,
      // Only an offered rail may be entered, and only while nothing has been
      // entered yet. `enterJourneyBranch` enforces both; this mirrors them so a
      // surface does not render a control the domain would refuse.
      enterable: isOffered && chosen === null,
    });
  });

  return Object.freeze(
    [...rails].sort((left, right) => branchFamilyRank(left.family) - branchFamilyRank(right.family)),
  );
}

/** The rails of a live journey. Nothing but a convenience over {@link railsOf}. */
export function railsOfState(state: JourneyState): readonly Rail[] {
  return railsOf(state.compiled, state.chosen);
}

/**
 * How lit a rail is, as a multiplier `BranchLight` can take as its floor.
 *
 * Three values, not a ramp. The reason is the one the visual language gives for
 * bands rather than percentages: a continuous dimness invites the reader to
 * compare two unlit rails and conclude one is more nearly taken than the other,
 * which is a claim nothing here holds. `closed` is dimmer than `open` because
 * one road has nowhere to go and the other is merely not being walked — and it
 * is still well clear of invisible, because `BranchLight` floors it at
 * `MIN_UNLIT_OPACITY` and would refuse anything lower.
 */
export const RAIL_RESTING_OPACITY: Readonly<Record<RailState, number>> = Object.freeze({
  taking: 1,
  open: 0.62,
  closed: 0.42,
});

/**
 * The one-line account of the fork, for a caption.
 *
 * Counts, never adjectives: "two roads open, four with nowhere to go" is a
 * sentence a learner can check against what is drawn. It is also the only place
 * this surface says anything summarising at all, and it summarises the *fork*
 * rather than the learner.
 */
export function railSummary(rails: readonly Rail[]): string {
  const taking = rails.filter((rail) => rail.state === 'taking').length;
  const open = rails.filter((rail) => rail.state === 'open').length;
  const closed = rails.filter((rail) => rail.state === 'closed').length;

  const plural = (count: number, one: string, many: string): string =>
    `${String(count)} ${count === 1 ? one : many}`;

  if (taking === 0) {
    return `${plural(open, 'road', 'roads')} open from here, ${plural(closed, 'road', 'roads')} with nowhere to go for this word.`;
  }
  return `On one road; ${plural(open, 'other', 'others')} still open, ${plural(closed, 'road', 'roads')} with nowhere to go for this word.`;
}
