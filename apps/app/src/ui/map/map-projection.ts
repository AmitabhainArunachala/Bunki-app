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
 * A mark is a rendering of two real values from the pinned reducer and nothing
 * else — both copied from the kernel's projection, neither computed here:
 *
 *   - the chance of recall at the queried instant — real FSRS R(t);
 *   - the current interval in days — the same state's FSRS stability.
 *
 * The steps are declared as data below and stated on screen through
 * {@link MAP_MARK_RULE}, so a learner can see how the light was decided. The
 * floor is the scheduler's own `FSRS_DESIRED_RETENTION` (0.90) rather than a
 * designer's number: under it, the pinned scheduler itself considers the item
 * overdue. A due item literally drops off the luminance ramp because R(t)
 * genuinely fell — nothing decorative stands in for it.
 *
 * ## Why a map mark is not simply a `RecallBand`
 *
 * The design system's ramp has five steps and only three of them may be drawn
 * as a **bare** mark: `RECALL_BAND_MARKS` declares the two dimmest ones
 * meter-only, because they sit below 3:1 on purpose and may appear only inside a
 * component that supplies its own labelled boundary. A map node is 12 points
 * wide with no room for a boundary or a word, so it cannot carry them, and
 * `RecallIndicator` handed one resolves to `RecallMeter` — three lines of text
 * under a dot. On a fresh install every node is in one of those two steps, so
 * that is not an edge case, it is the common one.
 *
 * So a map mark is its **own** three-state union: the three standalone bands
 * where luminance carries the number, and two states below the standalone floor
 * where **form** carries it instead — a dotted ring for nothing observed, a
 * dashed ring for observed and under the floor. Both are drawn in the neutral
 * edge tokens `theme-ground.test.ts` already checks at 3:1 against every era
 * ground, and both are spoken in words by the node's own label, so neither is
 * encoded by colour alone (WCAG 1.4.1). `test/theme-tokens.test.ts` keeps the
 * two meter-only band names out of every surface file, and this union is how
 * this lane satisfies that rule rather than an exemption from it.
 *
 * ## Unknown is not weak, and untested is neither
 *
 * The domain draws a three-way distinction the map must not flatten:
 *
 *   - **`unknown`** — nothing has ever been observed. Not weak: unmeasured.
 *   - **`activated_untested`** — a contract exists, no retrieval has happened.
 *   - **`attested`** — a real R(t) from a real `MemoryState`.
 *
 * The first two both draw the same "nothing observed" mark — a map node has one
 * form to spend and there is no third ring shape worth inventing — but they are
 * kept apart in {@link MapLensView.presence} and worded apart in
 * {@link presenceNote}, because "you have never met this" and "you have met this
 * and never been tested on it" are different facts and the second is the more
 * actionable one. The node's spoken label carries the difference.
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
  buildMemoryHistories,
  buildRetrievabilityIndex,
  buildRetrievabilityIndexTimeline,
  isFragile,
  projectNodeRetrievability,
  type AdmittedReview,
  type CapabilityLens,
  type ContractActivation,
  type GraphNode,
  type IsoInstant,
  type LensProjection,
  type ProjectedContract,
  type RetrievabilityIndex,
} from '@bunki/domain';

import type { CapabilityId } from '../capability.ts';
import { RECALL_BANDS, isStandaloneRecallBand, type StandaloneRecallBand } from '../theme.ts';

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
 * What a map node's mark is. Three lit steps, and two below the lit floor.
 *
 * The union is the map's own, not the design system's ramp, and the header says
 * why: the ramp's two dimmest steps may not be drawn bare, and a map node is a
 * bare mark. `nothing-observed` and `under-the-floor` are drawn as *form* — a
 * dotted ring and a dashed ring — and never as a luminance step.
 */
export type MapMark =
  | { readonly kind: 'lit'; readonly band: StandaloneRecallBand }
  /** No retrieval has been observed on this lens. Unmeasured, not weak. */
  | { readonly kind: 'nothing-observed' }
  /** Observed, and R(t) is under the floor the pinned model aims at. */
  | { readonly kind: 'under-the-floor' };

/**
 * Where each lit step starts, in the two real numbers.
 *
 * Read top-down: the first row a projection satisfies wins, and a projection
 * that satisfies none of them is under the floor. Declared as data so the legend
 * and the arithmetic cannot disagree, and so a reviewer can check the steps
 * against the scheduler's own constant rather than against prose.
 *
 * The bands are typed `StandaloneRecallBand`, so a step naming one of the two
 * meter-only names would not compile — the rule that keeps them off a map node
 * is a type here rather than a promise.
 */
export const MAP_MARK_STEPS: readonly {
  readonly band: StandaloneRecallBand;
  readonly minChance: number;
  readonly minIntervalDays: number;
}[] = Object.freeze([
  Object.freeze({ band: 'durable' as StandaloneRecallBand, minChance: 0.9, minIntervalDays: 60 }),
  Object.freeze({ band: 'settled' as StandaloneRecallBand, minChance: 0.9, minIntervalDays: 21 }),
  Object.freeze({
    band: 'emerging' as StandaloneRecallBand,
    minChance: FSRS_DESIRED_RETENTION,
    minIntervalDays: 0,
  }),
]);

/**
 * How the light was decided, in the learner's words.
 *
 * Rendered verbatim by the map legend. It says what the two numbers are and it
 * says what the mark is *not* — a score — because the whole reason there are
 * steps rather than percentages is that two percentages on one screen get
 * averaged by the reader and the average is the global scalar REQ-LM-03 forbids.
 */
export const MAP_MARK_RULE =
  'A lit node is the chance you would recall this right now, read together with how long its current interval is. At or above 0.90 — the target this build’s pinned memory model aims at — a node lights: 21 days is settled, 60 is durable. Below 0.90 it stops being lit and becomes a dashed ring, which is what a due item looks like. A dotted ring means nothing has been observed at all. It is a reading of two real numbers for one capability, never a score for the word.';

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
 * The mark one lens currently draws.
 *
 * Takes a `LensProjection` — one lens — and never a `NodeRetrievability`, which
 * is the type-level half of the no-collapsed-light rule.
 */
export function markOf(lens: LensProjection): MapMark {
  if (lens.presence !== 'attested') return { kind: 'nothing-observed' };
  const { chance, intervalDays } = readProjection(lens);
  if (chance === null) return { kind: 'nothing-observed' };
  const held = intervalDays ?? 0;
  for (const step of MAP_MARK_STEPS) {
    if (chance >= step.minChance && held >= step.minIntervalDays) {
      return { kind: 'lit', band: step.band };
    }
  }
  return { kind: 'under-the-floor' };
}

/**
 * Rank on the design system's ramp, for "has this reached at least X?".
 *
 * Read off `RECALL_BANDS`, so the order is the design system's rather than a
 * second copy of it. The two unlit map marks rank below every lit step, which is
 * true of both of them: unmeasured has reached nothing, and under the floor has
 * fallen back below the first lit step.
 */
export function markRank(mark: MapMark): number {
  return mark.kind === 'lit' ? RECALL_BANDS.indexOf(mark.band) : -1;
}

/**
 * Has this lens reached `atLeast`, on the ramp?
 *
 * Takes the map's own {@link MapLensView} rather than the kernel's projection,
 * so a caller that already holds a drawn view — the route strip does — does not
 * have to reconstruct one. Reconstructing it was the first shape of this and it
 * meant a screen assembling a fake `LensProjection` field by field, which is a
 * second place the two vocabularies could drift.
 *
 * `atLeast` is a `StandaloneRecallBand`: a road may only count stations at a
 * step a node can actually be *seen* to have reached, and asking for one of the
 * meter-only steps would be asking for a threshold no map mark expresses.
 */
export function hasReached(lens: MapLensView, atLeast: StandaloneRecallBand): boolean {
  return markRank(lens.mark) >= RECALL_BANDS.indexOf(atLeast);
}

/**
 * Narrow a band from anywhere to one a map node may draw.
 *
 * Exported for the surfaces that hold a band from the design system — the route
 * strip's "reached at" threshold arrives as one — so the narrowing happens once,
 * here, rather than as a cast at each call site.
 */
export function asStandaloneBand(band: string): StandaloneRecallBand | null {
  const found = RECALL_BANDS.find((candidate) => candidate === band);
  return found !== undefined && isStandaloneRecallBand(found) ? found : null;
}

/* ------------------------------------------------------------------ *
 * One lens, ready to draw
 * ------------------------------------------------------------------ */

/**
 * Everything a mark needs for one lens of one node, with nothing summarised.
 *
 * The four REQ-UI-07 values travel separately all the way to the mark:
 * `mark` (the recall chance), `intervalDays`, `uncertainty` and `coverage`. They
 * are drawn in four different channels — luminance, the written interval, the
 * dashed edge, and the written line — so no two of them share one signal.
 */
export interface MapLensView {
  readonly lens: CapabilityId;
  readonly mark: MapMark;
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
    mark: markOf(lens),
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
  return buildRetrievabilityIndex(usableContracts(contracts), memoryStates);
}

function usableContracts(
  contracts: readonly {
    readonly contractId: string;
    readonly targetComponentId: string;
    readonly skill: string;
  }[],
): readonly ProjectedContract[] {
  const usable: ProjectedContract[] = [];
  for (const contract of contracts) {
    if (!SCHEDULED_SKILL_NAMES.has(contract.skill)) continue;
    usable.push({
      contractId: contract.contractId,
      targetComponentId: contract.targetComponentId,
      skill: contract.skill as ProjectedContract['skill'],
    });
  }
  return usable;
}

/* ------------------------------------------------------------------ *
 * The scrubber's frames
 * ------------------------------------------------------------------ */

/**
 * The ledger slices the timeline needs, structurally.
 *
 * The three fields of an admitted review are exactly the three a
 * `GateDecisionRecord` carries — contract, effective grade, instant — which is
 * why the history can be rebuilt from the ledger rather than from a second
 * bookkeeping the app would have to maintain.
 */
export interface TimelineInput {
  readonly contracts: readonly {
    readonly contractId: string;
    readonly targetComponentId: string;
    readonly skill: string;
  }[];
  readonly memoryStates: readonly {
    readonly contractId: string;
    readonly activatedAt: IsoInstant;
  }[];
  readonly gateDecisions: readonly {
    readonly contractId: string | null;
    readonly admitted: boolean;
    readonly effectiveGrade: AdmittedReview['effectiveGrade'] | null;
    readonly at: IsoInstant;
  }[];
}

/**
 * One index per frame — the state **as it stood**, not today's state backdated.
 *
 * This is the distinction the whole scrubber turns on, and it is easy to get
 * silently wrong. The domain says why:
 *
 * > The scrubber needs the state *as it stood* at each frame, not today's state
 * > evaluated at an earlier instant — the second would draw a learner who
 * > already knew, in March, everything they learned in June.
 *
 * A static `RetrievabilityIndex` answers `stateOf` from *current* states, so
 * projecting it at a past instant produces exactly that lie: the March frame
 * would show June's stability with March's decay applied. It looks plausible,
 * it is smooth, and it is false. So the frames come from
 * `buildRetrievabilityIndexTimeline`, whose per-frame `stateOf` binary-searches
 * a version list rebuilt by folding the reviews the gate already admitted, with
 * the same reducer replay uses.
 *
 * It also cannot admit anything replay would refuse: an `AdmittedReview` is by
 * definition one the gate already accepted, and the filter below takes only
 * decisions whose `admitted` is true and whose grade the gate actually recorded.
 *
 * ## Cost
 *
 * Built **once** for a whole scrubber run — the (component, skill) bucketing is
 * invariant across frames and is shared, which is the repair lane A2 made after
 * measuring 426 daily frames at ~1.2s. Per frame this is one object; per node
 * read it is one binary search.
 */
export function buildMapTimeline(
  input: TimelineInput,
  frames: readonly IsoInstant[],
): readonly { readonly at: IsoInstant; readonly index: RetrievabilityIndex }[] {
  const activations: ContractActivation[] = input.memoryStates.map((state) => ({
    contractId: state.contractId,
    activatedAt: state.activatedAt,
  }));

  const admitted: AdmittedReview[] = [];
  for (const decision of input.gateDecisions) {
    if (!decision.admitted) continue;
    if (decision.contractId === null || decision.effectiveGrade === null) continue;
    admitted.push({
      contractId: decision.contractId,
      effectiveGrade: decision.effectiveGrade,
      reviewedAt: decision.at,
    });
  }

  return buildRetrievabilityIndexTimeline(
    usableContracts(input.contracts),
    buildMemoryHistories(activations, admitted),
    frames,
  );
}
