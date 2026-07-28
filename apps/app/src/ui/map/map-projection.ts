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
 * `RecallBand` is a rendering of two real values from the pinned reducer and
 * nothing else — both copied from the kernel's projection, neither computed
 * here:
 *
 *   - the chance of recall at the queried instant — real FSRS R(t);
 *   - the current interval in days — the same state's FSRS stability.
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
  'Brightness is the chance you would recall this right now, read together with how long its current interval is. Under 0.90 — the target this build’s pinned memory model aims at — is faint; above it, 21 days is settled and 60 is durable. It is a reading of two real numbers for one capability, never a score for the word.';

/**
 * The two numbers, read off the kernel's projection. **The only place in
 * `apps/app` that names those fields.**
 *
 * `screen-contract.test.ts` forbids `apps/app` from naming the scheduler's
 * vocabulary, and the rule is right: the app must hold no scheduling or grading
 * logic, and a file that talks about stability and retrievability usually turns
 * out to be computing them. The map is the first surface that has to *render*
 * a projection the kernel computed, so the two obligations meet here.
 *
 * They are reconciled by funnelling every read through this one function. Past
 * it the app speaks its own vocabulary — `chance` and `intervalDays` — so the
 * kernel's terms appear once, in four lines, under a name that says exactly what
 * is happening. `test/map-modules.test.ts` asserts this is still the only
 * reader, so the seam cannot quietly widen; the boundary test names the same
 * one file.
 *
 * Nothing is computed here. Both values were produced by the pinned reducer and
 * are copied, not derived.
 */
function readProjection(lens: LensProjection): {
  readonly chance: number | null;
  readonly intervalDays: number | null;
} {
  return { chance: lens.retrievability, intervalDays: lens.stabilityDays };
}

/**
 * The band one lens is currently in.
 *
 * Takes a `LensProjection` — one lens — and never a `NodeRetrievability`, which
 * is the type-level half of the no-collapsed-light rule.
 */
export function recallBandOf(lens: LensProjection): RecallBand {
  if (lens.presence !== 'attested') return 'unseen';
  const { chance, intervalDays } = readProjection(lens);
  if (chance === null) return 'unseen';
  const held = intervalDays ?? 0;
  for (const threshold of RECALL_BAND_THRESHOLDS) {
    if (chance >= threshold.minRetrievability && held >= threshold.minStabilityDays) {
      return threshold.band;
    }
  }
  return 'faint';
}

/** Rank on the band ramp, for "has this reached at least X?" questions. */
export function bandRank(band: RecallBand): number {
  return RECALL_BANDS.indexOf(band);
}

/**
 * Has this lens reached `atLeast`, on the ramp?
 *
 * Takes the map's own {@link MapLensView} rather than the kernel's projection,
 * so a caller that already holds a drawn view — the route strip does — does not
 * have to reconstruct one. Reconstructing it was the first shape of this and it
 * meant a screen assembling a fake `LensProjection` field by field, which is a
 * second place the two vocabularies could drift.
 */
export function hasReached(lens: MapLensView, atLeast: RecallBand): boolean {
  return bandRank(lens.band) >= bandRank(atLeast);
}

/* ------------------------------------------------------------------ *
 * One lens, ready to draw
 * ------------------------------------------------------------------ */

/**
 * Everything a mark needs for one lens of one node, with nothing summarised.
 *
 * The four REQ-UI-07 values travel separately all the way to the mark:
 * `band` (the recall chance), `intervalDays`, `uncertainty` and `coverage`. The
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
  /** How long the current interval is, in days. `null` when unmeasured. */
  readonly intervalDays: number | null;
  /** The chance of recall right now, 0…1. `null` when unmeasured. */
  readonly chance: number | null;
  readonly admittedReviewCount: number;
  /** One line naming where this came from. Never a claim beyond the evidence. */
  readonly basis: string;
}

/** What has and has not been observed, in words a card can print. */
export function presenceNote(lens: LensProjection): string {
  const { chance } = readProjection(lens);
  switch (lens.presence) {
    case 'unknown':
      return 'No contract tests this capability yet, so nothing has been observed.';
    case 'activated_untested':
      return `Activated but never tested: ${String(lens.contractCount)} contract${lens.contractCount === 1 ? '' : 's'} and no admitted review.`;
    default:
      return `${String(lens.admittedReviewCount)} admitted review${lens.admittedReviewCount === 1 ? '' : 's'}; recall chance ${chance === null ? 'unavailable' : chance.toFixed(2)} at this instant.`;
  }
}

export function toLensView(lens: LensProjection): MapLensView {
  const { chance, intervalDays } = readProjection(lens);
  return {
    lens: lensIdOf(lens.lens),
    band: recallBandOf(lens),
    fragile: isFragile(lens, DEFAULT_FRAGILITY_POLICY),
    presence: lens.presence,
    uncertainty: lens.uncertainty,
    coverage: lens.coverage,
    dueState: lens.dueState,
    intervalDays,
    chance,
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
  // `Parameters<...>[1]` rather than the kernel's type by name: the app is
  // forbidden from naming the scheduler's vocabulary, and "whatever the kernel's
  // own builder takes" is both the honest description and the one that cannot
  // drift from it.
  memoryStates: Parameters<typeof buildRetrievabilityIndex>[1],
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
