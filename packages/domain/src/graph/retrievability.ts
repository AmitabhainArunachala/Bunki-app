/**
 * The retrievability projection — what the map is allowed to draw
 * (Campaign E / A2; REQ-UI-07, REQ-LM-03, REQ-LM-04, REQ-SCH-03).
 *
 * ## The requirement, and the shape it forces
 *
 * REQ-UI-07: capability lenses *"preserve stability, retrievability,
 * uncertainty, and coverage"*. Four values, listed separately, in a sentence
 * whose main verb is "never collapse". So {@link LensProjection} carries four
 * fields and no fifth that summarises them, and there is no function anywhere in
 * this package that reduces a node — or a learner — to one number. REQ-LM-03
 * says the same thing from the other end: no global scalar, no mastery
 * percentage, no level claim.
 *
 * The temptation this file is written against is real and specific: a map wants
 * one brightness per dot, and averaging four numbers produces one. What that
 * average would mean is nothing — a node with strong reading evidence and no
 * listening evidence at all would render identically to a node with mediocre
 * evidence for both, and the learner would have no way to find out which they
 * were looking at. The map gets four channels or it gets one lens at a time.
 *
 * ## Unknown is not zero
 *
 * The distinction the map lives or dies on:
 *
 *   - **unknown** — nothing has ever been observed. `retrievability` is `null`,
 *     `stabilityDays` is `null`, `uncertainty` is `unknown`, `coverage` is
 *     `none`. A node in this state is not weak; it is unmeasured, and drawing it
 *     as weak would be a claim about the learner that no evidence supports.
 *   - **fragile** — observed, and the pinned scheduler says recall is unlikely
 *     or the memory is shallow. `retrievability` is a real number from the real
 *     `MemoryState`.
 *
 * `ts-fsrs` answers `0` for a never-reviewed card, which is why
 * `memoryStateRetrievability` in the scheduler wrapper returns `null` instead —
 * see the note there. Every `null` in this file traces back to that decision.
 *
 * ## This module reads. It does not write.
 *
 * REQ-SCH-03 forbids anything but the scheduler from writing memory state, and
 * REQ-ARCH-04 makes the evidence gate the sole factory for evidence. Nothing
 * here mints, grades, schedules, or mutates: every function takes state and an
 * instant and returns a description. Opening the map is not a review, and
 * scrubbing history is not a hundred reviews.
 */

import type { ContractId, IsoInstant } from '../primitives.ts';
import type { RetrievalSkill } from '../contracts/retrieval-contract.ts';
import { FSRS_DESIRED_RETENTION } from '../reducers/fsrs-pin.ts';
import {
  applyAdmittedReview,
  initialMemoryState,
  memoryStateRetrievability,
  type AdmittedReview,
  type MemoryState,
} from '../reducers/memory-state.ts';
import { compareInstants } from '../primitives.ts';
import { CAPABILITY_LENSES, LENS_SKILLS, type CapabilityLens } from './lenses.ts';
import type { GraphNode } from './model.ts';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * The three contract fields this projection needs.
 *
 * Structural rather than the whole `RetrievalContract` so a caller holding
 * replay's `ContractRecord` can narrow to it without reconstructing an entity
 * — and so this module cannot accidentally start depending on scoring, hint
 * policy, or anything else that would let it form an opinion about a grade.
 */
export interface ProjectedContract {
  readonly contractId: ContractId;
  readonly targetComponentId: string;
  readonly skill: RetrievalSkill;
}

/**
 * The Trace, indexed for the map.
 *
 * Two halves, deliberately separated, because only one of them depends on time:
 *
 *   - `byComponentSkill` is a function of the **contract set** alone. It says
 *     which contracts test a given (component, skill) pair, and that answer does
 *     not change when the instant changes.
 *   - `stateOf` is the half that does change. It answers with the pinned
 *     scheduler's state for one contract *at this index's instant*, or `null`.
 *
 * Built once from replay output; every node query afterwards is a map lookup
 * per component id. Over the dictionary tier this is what keeps a full-map
 * render linear in the number of *drawn* nodes rather than in the number of
 * contracts.
 *
 * The split is also what makes the time scrubber affordable: a timeline over one
 * contract set builds the bucketing once and gives every frame its own
 * `stateOf`. Collapsing the two halves back together was a real defect here,
 * with a measured cost — see {@link buildRetrievabilityIndexTimeline}.
 */
export interface RetrievabilityIndex {
  /**
   * Key: `componentId` + `\u0000` + `skill`.
   *
   * A NUL separator because it is the one character a component id or a
   * skill name can never contain, so no pair of distinct (component, skill)
   * pairs can collide on one key. Written as an escape rather than as a raw
   * byte: a literal NUL in a source file makes it binary to `git diff`, and
   * a separator nobody can see in review is a separator nobody can check.
   *
   * Buckets are sorted by contract id so a node with two contracts on one skill
   * projects identically whichever order replay happened to emit them in.
   */
  readonly byComponentSkill: ReadonlyMap<string, readonly ProjectedContract[]>;
  /**
   * The pinned scheduler's state for one contract at this index's instant, or
   * `null` when the contract has none yet.
   *
   * A lookup, never a derivation. Nothing behind this function grades,
   * schedules, or folds a review the gate has not already admitted; a static
   * index answers from a map built out of replay's own states, and a scrubber
   * frame answers from the version list {@link buildMemoryHistories} folded with
   * the same reducer replay uses.
   */
  readonly stateOf: (contractId: ContractId) => MemoryState | null;
  readonly contractCount: number;
  readonly memoryStateCount: number;
}

function key(componentId: string, skill: RetrievalSkill): string {
  return `${componentId}\u0000${skill}`;
}

/**
 * The time-invariant half of an index, alone, so a timeline can build it once
 * for a whole scrubber run instead of once per frame.
 */
interface ContractBuckets {
  readonly byComponentSkill: ReadonlyMap<string, readonly ProjectedContract[]>;
  readonly contractCount: number;
}

function buildContractBuckets(contracts: readonly ProjectedContract[]): ContractBuckets {
  const byComponentSkill = new Map<string, ProjectedContract[]>();
  contracts.forEach((contract) => {
    const bucketKey = key(contract.targetComponentId, contract.skill);
    const bucket = byComponentSkill.get(bucketKey);
    if (bucket === undefined) byComponentSkill.set(bucketKey, [contract]);
    else bucket.push(contract);
  });

  const frozen = new Map<string, readonly ProjectedContract[]>();
  byComponentSkill.forEach((bucket, bucketKey) => {
    // Sorted so a node with two contracts on one skill projects identically
    // whichever order replay happened to emit them in.
    bucket.sort((left, right) => (left.contractId < right.contractId ? -1 : 1));
    frozen.set(bucketKey, Object.freeze(bucket));
  });

  return Object.freeze({ byComponentSkill: frozen, contractCount: contracts.length });
}

export function buildRetrievabilityIndex(
  contracts: readonly ProjectedContract[],
  memoryStates: readonly MemoryState[],
): RetrievabilityIndex {
  const stateByContract = new Map<ContractId, MemoryState>();
  memoryStates.forEach((state) => stateByContract.set(state.contractId, state));
  const buckets = buildContractBuckets(contracts);

  return Object.freeze({
    byComponentSkill: buckets.byComponentSkill,
    stateOf: (contractId: ContractId) => stateByContract.get(contractId) ?? null,
    contractCount: buckets.contractCount,
    memoryStateCount: memoryStates.length,
  });
}

export const EMPTY_RETRIEVABILITY_INDEX: RetrievabilityIndex = buildRetrievabilityIndex([], []);

// ---------------------------------------------------------------------------
// The four values, kept apart
// ---------------------------------------------------------------------------

/**
 * Whether anything has been observed at all — the unknown/fragile split, as a
 * closed list rather than as an inference from `retrievability === null`.
 */
export const EVIDENCE_PRESENCE = ['unknown', 'activated_untested', 'attested'] as const;
export type EvidencePresence = (typeof EVIDENCE_PRESENCE)[number];

/**
 * How much evidence there is. REQ-UI-07's fourth value.
 *
 * Coverage is not strength. A node reviewed twenty times and failed twenty
 * times has `established` coverage and terrible retrievability, and the map
 * should be able to show that combination — "we know a lot about this and it is
 * not going well" is the most actionable state there is.
 */
export const EVIDENCE_COVERAGE = ['none', 'activated', 'sparse', 'established'] as const;
export type EvidenceCoverage = (typeof EVIDENCE_COVERAGE)[number];

/**
 * REQ-UI-07's third value, as an interpretable band rather than a fabricated
 * interval.
 *
 * REQ-LM-04 is explicit: *"Start with interpretable evidence-weighted rules, not
 * BKT/neural models"*, and names cold-start false precision as the risk. A
 * confidence interval computed from two reviews would be exactly that — a number
 * with three decimal places standing on nothing. So uncertainty is a band, the
 * rule that produces it is one line of arithmetic over the admitted review
 * count, and it is stated on {@link UNCERTAINTY_RULE} so a surface can show the
 * learner how it was decided.
 */
export const UNCERTAINTY_BANDS = ['unknown', 'wide', 'moderate', 'narrow'] as const;
export type UncertaintyBand = (typeof UNCERTAINTY_BANDS)[number];

export const UNCERTAINTY_RULE =
  'Uncertainty is a band, not a percentage: no admitted reviews is “unknown”, one or two is “wide”, three to five is “moderate”, six or more is “narrow”. It counts evidence; it does not model your brain.';

export function uncertaintyForReviewCount(admittedReviewCount: number): UncertaintyBand {
  if (admittedReviewCount <= 0) return 'unknown';
  if (admittedReviewCount <= 2) return 'wide';
  if (admittedReviewCount <= 5) return 'moderate';
  return 'narrow';
}

export function coverageForReviewCount(
  contractCount: number,
  admittedReviewCount: number,
): EvidenceCoverage {
  if (contractCount === 0) return 'none';
  if (admittedReviewCount === 0) return 'activated';
  if (admittedReviewCount <= 2) return 'sparse';
  return 'established';
}

/** Where this lens stands relative to its own schedule, at the queried instant. */
export const DUE_STATES = ['not_scheduled', 'due', 'not_due'] as const;
export type DueState = (typeof DUE_STATES)[number];

/**
 * One lens over one node, at one instant. Four values, never combined.
 *
 * `contributingContractIds` is here so every rendered mark is inspectable back
 * to the contracts it came from (REQ-UI-06): a dot the learner cannot trace to
 * its evidence is decoration.
 */
export interface LensProjection {
  readonly lens: CapabilityLens;
  readonly presence: EvidencePresence;
  /** REQ-UI-07 value 1. Days. `null` when nothing has been observed. */
  readonly stabilityDays: number | null;
  /** REQ-UI-07 value 2. Real FSRS R(t) from the pinned scheduler. `null` when unknown. */
  readonly retrievability: number | null;
  /** REQ-UI-07 value 3. */
  readonly uncertainty: UncertaintyBand;
  /** REQ-UI-07 value 4. */
  readonly coverage: EvidenceCoverage;
  readonly dueState: DueState;
  readonly contractCount: number;
  readonly admittedReviewCount: number;
  readonly lapses: number;
  readonly contributingContractIds: readonly ContractId[];
}

/**
 * One node's whole state, as five independent lenses.
 *
 * There is no field on this interface that summarises the array. That absence
 * is the requirement.
 */
export interface NodeRetrievability {
  readonly nodeId: string;
  readonly at: IsoInstant;
  /** Always all five, in {@link CAPABILITY_LENSES} order. */
  readonly lenses: readonly LensProjection[];
}

function unknownLens(lens: CapabilityLens): LensProjection {
  return Object.freeze({
    lens,
    presence: 'unknown' as EvidencePresence,
    stabilityDays: null,
    retrievability: null,
    uncertainty: 'unknown' as UncertaintyBand,
    coverage: 'none' as EvidenceCoverage,
    dueState: 'not_scheduled' as DueState,
    contractCount: 0,
    admittedReviewCount: 0,
    lapses: 0,
    contributingContractIds: Object.freeze([]),
  });
}

/**
 * Project one lens.
 *
 * When a lens has several contracts (the same kanji captured twice, so two
 * canonical component ids), the four values are taken from the **weakest**
 * retrievability rather than an average. Averaging would let a strong contract
 * hide a forgotten one, and the map's job is to show the frontier. Where
 * retrievability is unavailable on every contract, the lens is untested, not
 * weak.
 */
function projectLens(
  index: RetrievabilityIndex,
  componentIds: readonly string[],
  lens: CapabilityLens,
  at: IsoInstant,
): LensProjection {
  const entries: ProjectedContract[] = [];
  LENS_SKILLS[lens].forEach((skill) => {
    componentIds.forEach((componentId) => {
      const bucket = index.byComponentSkill.get(key(componentId, skill));
      if (bucket !== undefined) entries.push(...bucket);
    });
  });

  if (entries.length === 0) return unknownLens(lens);

  let admittedReviewCount = 0;
  let lapses = 0;
  let weakestState: MemoryState | null = null;
  let weakestRetrievability: number | null = null;
  let anyScheduled = false;
  let anyDue = false;
  const contributingContractIds: ContractId[] = [];

  for (const entry of entries) {
    contributingContractIds.push(entry.contractId);
    const state = index.stateOf(entry.contractId);
    if (state === null) continue;
    admittedReviewCount += state.admittedReviewCount;
    lapses += state.lapses;
    if (!state.active) continue;
    anyScheduled = true;
    if (compareInstants(state.dueAt, at) <= 0) anyDue = true;

    const retrievability = memoryStateRetrievability(state, at);
    if (retrievability === null) continue;
    if (weakestRetrievability === null || retrievability < weakestRetrievability) {
      weakestState = state;
      weakestRetrievability = retrievability;
    }
  }

  contributingContractIds.sort();

  const observed = weakestState !== null && weakestRetrievability !== null;
  const presence: EvidencePresence = observed ? 'attested' : 'activated_untested';

  return Object.freeze({
    lens,
    presence,
    stabilityDays: weakestState === null ? null : weakestState.stability,
    retrievability: weakestRetrievability,
    uncertainty: uncertaintyForReviewCount(admittedReviewCount),
    coverage: coverageForReviewCount(entries.length, admittedReviewCount),
    dueState: !anyScheduled ? 'not_scheduled' : anyDue ? 'due' : 'not_due',
    contractCount: entries.length,
    admittedReviewCount,
    lapses,
    contributingContractIds: Object.freeze(contributingContractIds),
  });
}

/** Project every lens for one node at one instant. */
export function projectNodeRetrievability(
  index: RetrievabilityIndex,
  node: Pick<GraphNode, 'id' | 'componentIds'>,
  at: IsoInstant,
): NodeRetrievability {
  return Object.freeze({
    nodeId: node.id,
    at,
    lenses: Object.freeze(
      CAPABILITY_LENSES.map((lens) => projectLens(index, node.componentIds, lens, at)),
    ),
  });
}

/** Project a set of nodes — one map render. Order follows the input. */
export function projectRetrievability(
  index: RetrievabilityIndex,
  nodes: readonly Pick<GraphNode, 'id' | 'componentIds'>[],
  at: IsoInstant,
): readonly NodeRetrievability[] {
  return Object.freeze(nodes.map((node) => projectNodeRetrievability(index, node, at)));
}

/** The lens by name, from a projection. */
export function lensOf(
  projection: NodeRetrievability,
  lens: CapabilityLens,
): LensProjection | null {
  return projection.lenses.find((candidate) => candidate.lens === lens) ?? null;
}

// ---------------------------------------------------------------------------
// Unknown versus fragile, as predicates rather than as a stored verdict
// ---------------------------------------------------------------------------

export function isUnknown(lens: LensProjection): boolean {
  return lens.presence === 'unknown';
}

/** Observed, but no retrieval has happened yet. Distinct from both neighbours. */
export function isUntested(lens: LensProjection): boolean {
  return lens.presence === 'activated_untested';
}

/**
 * How a surface decides what counts as fragile.
 *
 * A *policy*, passed in and reversible, not a fact stored on the projection.
 * Fragility is a rendering decision — the frontier the learner is asked to look
 * at — and different surfaces legitimately want different frontiers. What is
 * not negotiable is `requiresAttestation`: an unmeasured lens can never be
 * reported as fragile, because "we have never tested this" is not a finding
 * about the learner.
 *
 * The retrievability threshold defaults to the scheduler's own desired
 * retention rather than to a designer's number: below it, the pinned scheduler
 * itself considers the item overdue for a review.
 */
export interface FragilityPolicy {
  readonly belowRetrievability: number;
  readonly orStabilityBelowDays: number;
  readonly requiresAttestation: true;
}

export const DEFAULT_FRAGILITY_POLICY: FragilityPolicy = Object.freeze({
  belowRetrievability: FSRS_DESIRED_RETENTION,
  orStabilityBelowDays: 7,
  requiresAttestation: true,
});

export function isFragile(
  lens: LensProjection,
  policy: FragilityPolicy = DEFAULT_FRAGILITY_POLICY,
): boolean {
  if (lens.presence !== 'attested') return false;
  if (lens.retrievability === null) return false;
  if (lens.retrievability < policy.belowRetrievability) return true;
  return lens.stabilityDays !== null && lens.stabilityDays < policy.orStabilityBelowDays;
}

// ---------------------------------------------------------------------------
// The time scrubber
// ---------------------------------------------------------------------------

/**
 * One version of a contract's memory state, and the instant it became current.
 *
 * The scrubber needs the state *as it stood* at each frame, not today's state
 * evaluated at an earlier instant — the second would draw a learner who already
 * knew, in March, everything they learned in June. Versions are the honest
 * answer and they are a projection of the log, not new bookkeeping: the log
 * already contains every admitted review, and folding it forward with the same
 * reducer replay uses is what {@link buildMemoryHistories} does.
 */
export interface MemoryStateVersion {
  readonly from: IsoInstant;
  readonly state: MemoryState;
}

export interface MemoryHistory {
  /**
   * The contract this is a history of.
   */
  readonly contractId: ContractId;
  /**
   * The versions, oldest first. The first entry is activation.
   *
   * **Ascending by `from` is a precondition of {@link memoryStateAsOf}, not a
   * property of this type.** TypeScript cannot express it, so it is established
   * by the one producer in this package — {@link buildMemoryHistories}, which
   * enforces it explicitly and is property-tested for it — and can be checked by
   * anyone else with {@link isAscendingByFrom}. Nothing here enforces it on a
   * hand-assembled value, and this comment does not claim otherwise.
   */
  readonly versions: readonly MemoryStateVersion[];
}

/**
 * Is this history's version list ascending by `from`?
 *
 * Exported because the invariant {@link memoryStateAsOf} needs is otherwise only
 * a sentence in a comment, and this codebase has been bitten before by comments
 * asserting properties nothing enforced. A caller assembling a `MemoryHistory`
 * from some other source can assert this in its own tests; the suite here
 * asserts it over generated inputs to {@link buildMemoryHistories}.
 *
 * O(versions), so it is a check to run in a test or at a seam, not per frame —
 * which is exactly why the binary search cannot simply call it.
 */
export function isAscendingByFrom(history: MemoryHistory): boolean {
  for (let index = 1; index < history.versions.length; index += 1) {
    const previous = history.versions[index - 1];
    const current = history.versions[index];
    if (previous === undefined || current === undefined) return false;
    if (compareInstants(previous.from, current.from) > 0) return false;
  }
  return true;
}

/** When promotion activated a contract. Read from the log by the caller. */
export interface ContractActivation {
  readonly contractId: ContractId;
  readonly activatedAt: IsoInstant;
}

/**
 * Rebuild each contract's state history by folding the reviews the gate already
 * admitted.
 *
 * This calls the same `initialMemoryState` / `applyAdmittedReview` pair that
 * `replay.ts` calls, in the same order, so the final version of every history is
 * identical to the state replay derives — by construction, not by coincidence.
 * It does not re-run the gate and cannot: an `AdmittedReview` is by definition
 * one the gate already accepted, so a scrubber can never admit evidence that a
 * replay would refuse.
 *
 * Reviews naming a contract with no activation are ignored and are not an
 * error here: replay is where that invariant is enforced, and a projection that
 * threw would take the map down over a defect the ledger already records.
 *
 * ## The ascending invariant is established here
 *
 * {@link memoryStateAsOf} binary-searches `versions`, which is only correct on
 * an ascending list. Sorting the reviews is not enough to guarantee that: a
 * review whose `reviewedAt` precedes its contract's `activatedAt` would still be
 * appended after the activation version and the list would go backwards, and the
 * search would then return a version that is not the one current at `at`. Such a
 * review is the same class of defect as a review with no activation at all —
 * replay is where it is caught — so it gets the same treatment here: it is
 * skipped, not applied, and the projection stays queryable.
 *
 * The invariant is asserted over generated inputs in `retrievability.test.ts`,
 * including inputs built to violate it, and {@link isAscendingByFrom} is
 * exported so the claim is checkable rather than merely written down.
 */
export function buildMemoryHistories(
  activations: readonly ContractActivation[],
  admittedReviews: readonly AdmittedReview[],
): readonly MemoryHistory[] {
  const versionsByContract = new Map<ContractId, MemoryStateVersion[]>();

  [...activations]
    .sort((left, right) => {
      const byInstant = compareInstants(left.activatedAt, right.activatedAt);
      if (byInstant !== 0) return byInstant;
      return left.contractId < right.contractId ? -1 : 1;
    })
    .forEach((activation) => {
      if (versionsByContract.has(activation.contractId)) return;
      versionsByContract.set(activation.contractId, [
        {
          from: activation.activatedAt,
          state: initialMemoryState(activation.contractId, activation.activatedAt),
        },
      ]);
    });

  [...admittedReviews]
    .sort((left, right) => {
      const byInstant = compareInstants(left.reviewedAt, right.reviewedAt);
      if (byInstant !== 0) return byInstant;
      return left.contractId < right.contractId ? -1 : 1;
    })
    .forEach((review) => {
      const versions = versionsByContract.get(review.contractId);
      if (versions === undefined) return;
      const previous = versions[versions.length - 1];
      if (previous === undefined) return;
      // The guard that makes `versions` ascending rather than merely usually
      // ascending: a review dated before the version already current would push
      // the list backwards and silently break the binary search downstream.
      if (compareInstants(review.reviewedAt, previous.from) < 0) return;
      versions.push({
        from: review.reviewedAt,
        state: applyAdmittedReview(previous.state, review),
      });
    });

  const histories: MemoryHistory[] = [];
  versionsByContract.forEach((versions, contractId) => {
    histories.push(Object.freeze({ contractId, versions: Object.freeze(versions) }));
  });
  histories.sort((left, right) => (left.contractId < right.contractId ? -1 : 1));
  return Object.freeze(histories);
}

/**
 * The version current at `at`, or `null` if the contract did not exist yet.
 *
 * A binary search rather than a scan, because the scrubber asks this once per
 * frame per contract: the answer is the rightmost version whose `from` has not
 * passed `at`. Ties keep the last matching version, which is what a linear scan
 * did and what a review landing on the activation instant should mean.
 *
 * ## Precondition, stated rather than assumed
 *
 * `history.versions` must be ascending by `from`. That is not a property of the
 * `MemoryHistory` type — TypeScript cannot express it — so it is *established*
 * by {@link buildMemoryHistories}, which is the only producer in this package
 * and which skips any review that would push the list backwards. An earlier
 * version of this comment said "ascending by construction" and pointed at a
 * construction that did not enforce it; the enforcement is now real and
 * property-tested, and {@link isAscendingByFrom} exists so a caller with a
 * history from anywhere else can check rather than trust.
 *
 * On a list that is *not* ascending this returns some version from the list —
 * never out of range, never a throw — but not necessarily the one current at
 * `at`. It does not detect the violation: doing so is O(versions) and this
 * function is called once per frame per contract, which is the entire reason it
 * is a binary search.
 */
export function memoryStateAsOf(history: MemoryHistory, at: IsoInstant): MemoryState | null {
  const versions = history.versions;
  let low = 0;
  let high = versions.length - 1;
  let found: MemoryState | null = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const version = versions[middle];
    if (version === undefined) break;
    if (compareInstants(version.from, at) <= 0) {
      found = version.state;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * A scrubber run: one index per frame, over one contract set.
 *
 * ## The cost, stated correctly
 *
 * The first version of this function claimed O(frames + versions) and was
 * Theta(frames x contracts): it advanced a per-history cursor — which really is
 * linear — and then called `buildRetrievabilityIndex(contracts, ...)` *inside*
 * the per-frame loop, rebuilding the whole (component, skill) bucketing from
 * every contract on every frame. Measured on the 3,000-lexeme tier, 426 daily
 * frames took ~1.2s; with the frames placed entirely after the last review, so
 * that no cursor ever advanced, it still took ~1.1s. The cursor was not the
 * cost. The rebuild was, and it made one node's fourteen-month sparkline cost
 * about as much as the whole map's timeline.
 *
 * What is actually invariant across frames is the bucketing: it is a function of
 * `contracts`, and `contracts` does not change. So it is built once, and a frame
 * is that shared bucketing plus its own `stateOf`, which answers from the
 * contract's version list by binary search. The remaining per-frame work is one
 * object.
 *
 *   - setup: O(contracts + histories log histories)
 *   - per frame: O(1) to construct, O(log versions) per contract actually read
 *
 * Fourteen months at daily resolution is therefore paid for by the nodes a
 * surface chooses to draw, not by the length of the timeline — which is what
 * makes the scrubber a projection rather than a re-derivation.
 *
 * Frames are independent. Nothing is shared between them but the frozen
 * bucketing and the caller's own histories, so holding frame 3 and then reading
 * frame 0 cannot show frame 3's state — the failure mode a shared mutable
 * "current state" map would have introduced.
 */
export function buildRetrievabilityIndexTimeline(
  contracts: readonly ProjectedContract[],
  histories: readonly MemoryHistory[],
  frames: readonly IsoInstant[],
): readonly { readonly at: IsoInstant; readonly index: RetrievabilityIndex }[] {
  const ordered = [...frames].sort(compareInstants);
  const buckets = buildContractBuckets(contracts);

  const historyByContract = new Map<ContractId, MemoryHistory>();
  histories.forEach((history) => historyByContract.set(history.contractId, history));

  // `memoryStateCount` is the one per-frame number that is not a lookup. A
  // contract has a state at `at` exactly when its *first* version — activation —
  // has landed, so one ascending list of activation instants walked against the
  // sorted frames answers every frame in O(frames + histories). This is the
  // linear pass the old doc comment described; it just was not the expensive
  // part.
  const activatedAt = histories
    .flatMap((history) => {
      const first = history.versions[0];
      return first === undefined ? [] : [first.from];
    })
    .sort(compareInstants);

  let pending = 0;
  let activated = 0;
  const activatedByFrame = ordered.map((at) => {
    while (pending < activatedAt.length) {
      const from = activatedAt[pending];
      if (from === undefined) break;
      if (compareInstants(from, at) > 0) break;
      activated += 1;
      pending += 1;
    }
    return activated;
  });

  return Object.freeze(
    ordered.map((at, position) =>
      Object.freeze({
        at,
        index: Object.freeze({
          byComponentSkill: buckets.byComponentSkill,
          stateOf: (contractId: ContractId) => {
            const history = historyByContract.get(contractId);
            return history === undefined ? null : memoryStateAsOf(history, at);
          },
          contractCount: buckets.contractCount,
          memoryStateCount: activatedByFrame[position] ?? 0,
        }),
      }),
    ),
  );
}

/**
 * The scrubber's per-node answer: one projection per frame.
 *
 * Exposure is never retrieval (REQ-DM-07, T-08). Scrubbing a year of history is
 * a read of the log and produces no event, no grade, and no scheduling change —
 * there is nothing in this function that could.
 *
 * The caller hands over the whole contract set because it is the same set the
 * map holds; drawing *one* node's sparkline out of it should not be a whole-map
 * cost. Only contracts whose `targetComponentId` is one of this node's can ever
 * land in a bucket {@link projectLens} reads for it, so narrowing to those (and
 * to their histories) is result-preserving and costs one linear pass instead of
 * one per frame.
 */
export function projectNodeRetrievabilityOverTime(
  contracts: readonly ProjectedContract[],
  histories: readonly MemoryHistory[],
  node: Pick<GraphNode, 'id' | 'componentIds'>,
  frames: readonly IsoInstant[],
): readonly NodeRetrievability[] {
  const componentIds = new Set(node.componentIds);
  const nodeContracts = contracts.filter((contract) =>
    componentIds.has(contract.targetComponentId),
  );
  const nodeContractIds = new Set(nodeContracts.map((contract) => contract.contractId));
  const nodeHistories = histories.filter((history) => nodeContractIds.has(history.contractId));

  return Object.freeze(
    buildRetrievabilityIndexTimeline(nodeContracts, nodeHistories, frames).map((frame) =>
      projectNodeRetrievability(frame.index, node, frame.at),
    ),
  );
}
