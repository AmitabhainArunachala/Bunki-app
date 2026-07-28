/**
 * Real FSRS, made drawable — per capability lens, never collapsed (Campaign E / B1).
 *
 * ## The one number the map may not have
 *
 * REQ-UI-07 forbids collapsing reading/meaning/listening/production/writing into
 * one mastery light, and the domain's `retrievability.ts` is built so that the
 * collapse is not available: `NodeRetrievability` carries five `LensProjection`s
 * and *"there is no field on this interface that summarises the array. That
 * absence is the requirement."*
 *
 * This module keeps that absence. It converts one `LensProjection` into one
 * drawable band, and there is no function here that takes a `NodeRetrievability`
 * and returns a band, a score, or a brightness — because a node does not have
 * one. A map node draws five marks, or it draws the mark for the lens the
 * learner has chosen, and either way the lens is named beside it.
 * `test/map-modules.test.ts` asserts that no export of this file accepts a whole
 * node projection, so the missing function stays missing.
 *
 * ## Brightness is a number that exists
 *
 * `RecallBand` is a rendering of two real values from the pinned scheduler and
 * nothing else:
 *
 *   - `retrievability` — FSRS R(t) at the queried instant, through
 *     `memoryStateRetrievability`;
 *   - `stabilityDays` — the FSRS stability of the same state.
 *
 * The thresholds are declared as data below and stated on screen through
 * {@link RECALL_BAND_RULE}, so a learner can see how the light was decided.
 * `belowDesiredRetention` is the scheduler's own `FSRS_DESIRED_RETENTION`
 * (0.90) rather than a designer's number: under it, the pinned scheduler itself
 * considers the item overdue. A due item is literally dimmer than the same item
 * yesterday because R(t) genuinely fell — nothing decorative stands in for it.
 *
 * ## Unknown is not weak, and untested is neither
 *
 * The domain draws a three-way distinction the map must not flatten:
 *
 *   - **`unknown`** — nothing has ever been observed. Not weak: unmeasured.
 *   - **`activated_untested`** — a contract exists, no retrieval has happened.
 *   - **`attested`** — a real R(t) from a real `MemoryState`.
 *
 * The first two both render as the `unseen` band, whose label is already
 * "No evidence yet" — but they are kept apart in {@link MapLensView.presence}
 * and worded apart in {@link presenceNote}, because "you have never met this"
 * and "you have met this and never been tested on it" are different facts and
 * the second is the more actionable one.
 *
 * ## Nothing here writes
 *
 * Every function takes state and an instant and returns a description. Opening
 * the map is not a review; scrubbing a year is not a hundred reviews. The
 * evidence gate remains the sole factory for accepted evidence and this file
 * cannot reach it — it imports no command, no minter, and no store.
 */

import {
  CAPABILITY_LENSES,
  DEFAULT_FRAGILITY_POLICY,
  FSRS_DESIRED_RETENTION,
  LENS_SKILLS,
  buildRetrievabilityIndex,
  isFragile,
  projectNodeRetrievability,
  type CapabilityLens,
  type GraphNode,
  type IsoInstant,
  type LensProjection,
  type MemoryState,
  type ProjectedContract,
  type RetrievabilityIndex,
} from '@bunki/domain';

import type { CapabilityId } from '../capability.ts';
import { RECALL_BANDS, type RecallBand } from '../theme.ts';

/* ------------------------------------------------------------------ *
 * The lens vocabularies are the same five, in two packages
 * ------------------------------------------------------------------ */

/**
 * `CapabilityLens` (domain) and `CapabilityId` (UI) are the same five strings.
 *
 * Two declarations because the domain must not import a UI module and the UI
 * vocabulary predates the projection. The identity is asserted by `satisfies` in
 * both directions below, so a rename on either side fails `npm run typecheck`
 * rather than producing a lens row whose chips address nothing.
 */
export const LENS_IDS = CAPABILITY_LENSES satisfies readonly CapabilityId[];

export function lensIdOf(lens: CapabilityLens): CapabilityId {
  return lens;
}

/* ------------------------------------------------------------------ *
 * Bands
 * ------------------------------------------------------------------ */

/**
 * Where each band starts, in the two real numbers.
 *
 * Read top-down: the first row a projection satisfies wins. Declared as data so
 * the legend and the arithmetic cannot disagree, and so a reviewer can check the
 * thresholds against the scheduler's own constants rather than against prose.
 */
export const RECALL_BAND_THRESHOLDS = Object.freeze([
  Object.freeze({ band: 'durable' as RecallBand, minRetrievability: 0.9, minStabilityDays: 60 }),
  Object.freeze({ band: 'settled' as RecallBand, minRetrievability: 0.9, minStabilityDays: 21 }),
  Object.freeze({
    band: 'emerging' as RecallBand,
    minRetrievability: FSRS_DESIRED_RETENTION,
    minStabilityDays: 0,
  }),
  Object.freeze({ band: 'faint' as RecallBand, minRetrievability: 0, minStabilityDays: 0 }),
]);

/**
 * How the light was decided, in the learner's words.
 *
 * Rendered verbatim by the map legend. It says what the two numbers are and it
 * says what the band is *not* — a score — because the whole reason bands exist
 * rather than percentages is that two percentages on one screen get averaged by
 * the reader and the average is the global scalar REQ-LM-03 forbids.
 */
export const RECALL_BAND_RULE =
  'Brightness is FSRS retrievability — the chance you would recall this right now — read together with stability, the current interval in days. Faint is under 0.90, the scheduler’s own target; above it, 21 days of stability is settled and 60 is durable. It is a reading of two numbers for one capability, not a score for the word.';

/**
 * The band one lens is currently in.
 *
 * Takes a `LensProjection` — one lens — and never a `NodeRetrievability`, which
 * is the type-level half of the no-collapsed-light rule.
 */
export function recallBandOf(lens: LensProjection): RecallBand {
  if (lens.presence !== 'attested') return 'unseen';
  const retrievability = lens.retrievability;
  if (retrievability === null) return 'unseen';
  const stability = lens.stabilityDays ?? 0;
  for (const threshold of RECALL_BAND_THRESHOLDS) {
    if (retrievability >= threshold.minRetrievability && stability >= threshold.minStabilityDays) {
      return threshold.band;
    }
  }
  return 'faint';
}

/** Rank on the band ramp, for "has this reached at least X?" questions. */
export function bandRank(band: RecallBand): number {
  return RECALL_BANDS.indexOf(band);
}

/** Has this lens reached `atLeast`, on the ramp? */
export function hasReached(lens: LensProjection, atLeast: RecallBand): boolean {
  return bandRank(recallBandOf(lens)) >= bandRank(atLeast);
}

/* ------------------------------------------------------------------ *
 * One lens, ready to draw
 * ------------------------------------------------------------------ */

/**
 * Everything a mark needs for one lens of one node, with nothing summarised.
 *
 * The four REQ-UI-07 values travel separately all the way to the mark:
 * `band` (retrievability), `stabilityDays`, `uncertainty` and `coverage`. The
 * mark encodes them in four different channels — luminance, the meter track, the
 * dashed edge, and the written line — so no two of them share one signal.
 */
export interface MapLensView {
  readonly lens: CapabilityId;
  readonly band: RecallBand;
  readonly fragile: boolean;
  readonly presence: LensProjection['presence'];
  readonly uncertainty: LensProjection['uncertainty'];
  readonly coverage: LensProjection['coverage'];
  readonly dueState: LensProjection['dueState'];
  readonly stabilityDays: number | null;
  readonly retrievability: number | null;
  readonly admittedReviewCount: number;
  /** One line naming where this came from. Never a claim beyond the evidence. */
  readonly basis: string;
}

/** What has and has not been observed, in words a card can print. */
export function presenceNote(lens: LensProjection): string {
  switch (lens.presence) {
    case 'unknown':
      return 'No contract tests this capability yet, so nothing has been observed.';
    case 'activated_untested':
      return `Scheduled but never tested: ${String(lens.contractCount)} contract${lens.contractCount === 1 ? '' : 's'} and no admitted review.`;
    default:
      return `${String(lens.admittedReviewCount)} admitted review${lens.admittedReviewCount === 1 ? '' : 's'}; retrievability ${lens.retrievability === null ? 'unavailable' : lens.retrievability.toFixed(2)} at this instant.`;
  }
}

export function toLensView(lens: LensProjection): MapLensView {
  return {
    lens: lensIdOf(lens.lens),
    band: recallBandOf(lens),
    fragile: isFragile(lens, DEFAULT_FRAGILITY_POLICY),
    presence: lens.presence,
    uncertainty: lens.uncertainty,
    coverage: lens.coverage,
    dueState: lens.dueState,
    stabilityDays: lens.stabilityDays,
    retrievability: lens.retrievability,
    admittedReviewCount: lens.admittedReviewCount,
    basis: presenceNote(lens),
  };
}

/* ------------------------------------------------------------------ *
 * One node, five lenses
 * ------------------------------------------------------------------ */

/**
 * A node's whole state as the map draws it: five lenses, side by side.
 *
 * Deliberately an array with no summary field, mirroring `NodeRetrievability`.
 * A caller that wants "the" band for a node has to name a lens, which is the
 * entire point.
 */
export interface MapNodeView {
  readonly nodeId: string;
  readonly lenses: readonly MapLensView[];
}

export function lensView(view: MapNodeView, lens: CapabilityId): MapLensView | null {
  return view.lenses.find((candidate) => candidate.lens === lens) ?? null;
}

/**
 * Project one node at one instant.
 *
 * The index is built by the caller, once, and handed in. That is the shape lane
 * A2 had to repair after the scrubber rebuilt its index per frame, and the same
 * trap is available here: a convenience that took `contracts` and `memoryStates`
 * would be called from inside a render and would rebuild the bucketing on every
 * lens change.
 */
export function projectMapNode(
  index: RetrievabilityIndex,
  node: Pick<GraphNode, 'id' | 'componentIds'>,
  at: IsoInstant,
): MapNodeView {
  const projection = projectNodeRetrievability(index, node, at);
  return { nodeId: projection.nodeId, lenses: projection.lenses.map(toLensView) };
}

/**
 * The scheduled skills each lens reads, as plain strings.
 *
 * Read out of the domain's own `LENS_SKILLS` rather than retyped, so the drop
 * rule below cannot fall out of step with the mapping the projection actually
 * uses. `writing` contributes nothing, which is correct and load-bearing: Phase
 * 0 has no handwriting contract, so that lens is `unknown` forever until one
 * exists.
 */
const SCHEDULED_SKILL_NAMES: ReadonlySet<string> = new Set(
  CAPABILITY_LENSES.flatMap((lens) => [...LENS_SKILLS[lens]]),
);

/**
 * Build the index from replayed state.
 *
 * A thin adapter over the domain's own builder: the app's `readDerived()` gives
 * `ContractRecord`s whose `skill` is a `string`, and the projection wants a
 * `RetrievalSkill`. Records whose skill is not one the kernel schedules are
 * dropped rather than cast — a contract on an unrecognised skill is a contract
 * this build cannot interpret, and silently widening the type would make it
 * project as evidence for whichever lens the cast happened to land in.
 */
export function buildMapIndex(
  contracts: readonly {
    readonly contractId: string;
    readonly targetComponentId: string;
    readonly skill: string;
  }[],
  memoryStates: readonly MemoryState[],
): RetrievabilityIndex {
  const usable: ProjectedContract[] = [];
  for (const contract of contracts) {
    if (!SCHEDULED_SKILL_NAMES.has(contract.skill)) continue;
    usable.push({
      contractId: contract.contractId,
      targetComponentId: contract.targetComponentId,
      skill: contract.skill as ProjectedContract['skill'],
    });
  }
  return buildRetrievabilityIndex(usable, memoryStates);
}
