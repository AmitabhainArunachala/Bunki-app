/**
 * The minimal repair branch (WP-08; controller §10 screen 7, REQ-JRN-01/02
 * Phase-0 scope).
 *
 * ## Exactly how much of the journey compiler exists
 *
 * REQ-JRN-02 is unusually precise about the size of this: *"Generalized routing
 * is Phase 2+ (experiment); Phase 0 contains the compiler interface and one
 * hard-coded repair branch only."* So this file contains two things and nothing
 * between them:
 *
 *   - {@link JourneyCompiler} — the interface, declared and deliberately
 *     unimplemented, in the same style as `PROMOTION_RATE_LIMIT_SEAM`. A typed
 *     seam is honest; a stub that routed something would be a generalized
 *     router with a small dictionary.
 *   - one hard-coded flow for the seeded target: a stumble raises exactly two
 *     candidate-cause hypotheses, one cheap diagnostic chooses between them, and
 *     the branch ends when an **evidence criterion** is met.
 *
 * ## Rejoin is evidence, not arithmetic
 *
 * REQ-JRN-02: *"Rejoin is declared by an evidence criterion, never an arbitrary
 * step count."* {@link REJOIN_CRITERION} is that criterion in one sentence, and
 * {@link evaluateRejoin} is it in code. Nothing in this file counts steps,
 * attempts, minutes, or screens — `test/session/repair.test.ts` drives fifty
 * unaided-but-wrong attempts through it and asserts the branch is still open,
 * then one qualifying success and asserts it closed.
 *
 * The criterion is deliberately strict on two axes the requirement implies but
 * does not spell out. The success must be on the **exact contract that
 * stumbled** — repairing the reading and then rejoining on a meaning probe would
 * declare a repair of something that was never broken — and it must be
 * **unaided**: a hinted or revealed success is a success of the hint. The
 * evidence has to be admitted by the gate too, so a review on a demoted or
 * tombstoned thread cannot silently end a branch.
 *
 * ## Untaken branches
 *
 * REQ-JRN-02 again: they "persist as decaying, quiet opportunities unless
 * pinned; they must not become a new backlog". So the untaken branch is kept on
 * the state as data and is deliberately *not* returned by anything the session
 * planner reads. `plan.ts` takes due contracts and nothing else; there is no
 * path from here into a plan, which is the structural version of "not a new
 * backlog".
 */

import { compareInstants } from '../primitives.ts';
import type { ContractId, EventId, IsoInstant, ThreadId } from '../primitives.ts';
import type { RetrievalSkill } from '../contracts/retrieval-contract.ts';
import type { Grade } from '../events/shared.ts';

// ---------------------------------------------------------------------------
// The interface Phase 0 declares and does not implement
// ---------------------------------------------------------------------------

/**
 * The journey compiler's shape (REQ-JRN-01), declared for Phase 2+.
 *
 * `compile` is the whole of REQ-JRN-01's rule as a signature: a stumble in, a
 * small set of candidate causes and diagnostics out. Phase 0 implements exactly
 * one hard-coded instance of it ({@link openRepair}) and does not implement this
 * interface, because an implementation that handled arbitrary stumbles *is*
 * generalized routing.
 */
export interface JourneyCompiler {
  compile(stumble: RepairStumble): readonly RepairBranchOption[];
}

/** Recorded so the seam is data a verifier can read rather than an absence. */
export const JOURNEY_COMPILER_SEAM = Object.freeze({
  capability: 'Generalized journey compilation (stumble → hypotheses → diagnostics → routing)',
  owner: 'Phase 2+ (REQ-JRN-02 marks it `experiment`)',
  whatPhase0Has:
    'The JourneyCompiler interface, plus one hard-coded diagnostic→branch→rejoin flow for the seeded target, offering two of REQ-JRN-01’s branch families.',
  whatIsMissing:
    'Inference of a cause from a stumble, the full branch-family ontology, and any routing that is not the hard-coded pair. REQ-JRN-01 forbids inferring a cause confidently from one stumble, and Phase 0 has no second stumble to reason from.',
  anchors: Object.freeze(['REQ-JRN-01', 'REQ-JRN-02', 'controller §10 screen 7', 'DL-25']),
});

// ---------------------------------------------------------------------------
// The stumble
// ---------------------------------------------------------------------------

/** What went wrong, as the ledger recorded it. */
export interface RepairStumble {
  /** The contract the learner missed. The rejoin criterion is bound to it. */
  readonly contractId: ContractId;
  readonly threadId: ThreadId;
  readonly skill: RetrievalSkill;
  /** The `ReviewGraded` event that recorded the miss. */
  readonly eventId: EventId;
  readonly at: IsoInstant;
}

// ---------------------------------------------------------------------------
// The two hard-coded branch families
// ---------------------------------------------------------------------------

export const REPAIR_BRANCH_IDS = ['reading', 'meaning'] as const;
export type RepairBranchId = (typeof REPAIR_BRANCH_IDS)[number];

export interface RepairBranchOption {
  readonly id: RepairBranchId;
  /** REQ-JRN-01's branch-family name this path belongs to. */
  readonly family: string;
  /** The candidate cause, phrased as a hypothesis — never as a diagnosis. */
  readonly hypothesis: string;
  /** The one cheap diagnostic probe that distinguishes it. */
  readonly diagnostic: string;
  /** What the branch actually does, in one line the screen renders. */
  readonly work: string;
}

/**
 * The two paths, hard-coded.
 *
 * REQ-JRN-02 permits "at most two or three relevant paths"; two is what Phase 0
 * can offer honestly, because the seed supports a reading route (constituent
 * kanji readings) and a meaning route (constituent kanji senses) and nothing
 * else. Every string is phrased as a hypothesis — REQ-JRN-01 forbids inferring a
 * cause confidently from one stumble, and copy that said "you don't know the
 * reading" would be exactly that inference.
 */
export const REPAIR_BRANCHES: readonly RepairBranchOption[] = Object.freeze([
  Object.freeze({
    id: 'reading' as RepairBranchId,
    family: 'form/reading parsing',
    hypothesis: 'The form may be readable but its reading may not be coming back.',
    diagnostic: 'Could you say it aloud, even if you were not sure of the meaning?',
    work: 'Read the constituent kanji, then the compound, then the target again.',
  }),
  Object.freeze({
    id: 'meaning' as RepairBranchId,
    family: 'sense/meaning contrast',
    hypothesis: 'The reading may be coming back but the sense may not be settled.',
    diagnostic: 'Could you say roughly what it means, even without the reading?',
    work: 'Contrast the constituent senses, then place the target in the passage again.',
  }),
]);

/**
 * Which branch the flow recommends, from the skill that stumbled.
 *
 * This is the entire "routing" Phase 0 has, and it is a lookup, not an
 * inference: a reading contract that missed recommends the reading path. A
 * recommendation is not a selection — REQ-JRN-03's reversible default is "a
 * choice between at most two paths with a recommended default", so the learner
 * still chooses, and choosing the other one is not an error.
 */
export function recommendedBranch(skill: RetrievalSkill): RepairBranchId {
  return skill === 'orthography_to_reading' ? 'reading' : 'meaning';
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const REPAIR_PHASES = ['diagnosing', 'in_branch', 'rejoined', 'left'] as const;
export type RepairPhase = (typeof REPAIR_PHASES)[number];

export interface RepairState {
  readonly stumble: RepairStumble;
  readonly phase: RepairPhase;
  /** Exactly the two options above. Never grown, never filtered by a model. */
  readonly offered: readonly RepairBranchOption[];
  readonly recommended: RepairBranchId;
  readonly chosen: RepairBranchId | null;
  /** When the chosen branch was entered. The rejoin criterion is measured after it. */
  readonly enteredAt: IsoInstant | null;
  /**
   * The path not taken. Kept as a quiet opportunity, never queued (REQ-JRN-02).
   * Nothing in `plan.ts` can read this.
   */
  readonly untaken: readonly RepairBranchId[];
  readonly rejoinedByEventId: EventId | null;
  readonly rejoinedAt: IsoInstant | null;
}

/** REQ-JRN-02's rule about untaken paths, kept next to the field it governs. */
export const REPAIR_UNTAKEN_POLICY =
  'The path you did not take stays available and quiet. It is not added to anything due, and nothing will ask you about it again unless you open it.';

/**
 * Open a repair branch on a stumble.
 *
 * Both hypotheses are offered every time. REQ-JRN-01's "do not infer a cause
 * confidently from one stumble" is the reason the offered list is not filtered
 * by the skill — the skill only decides which is *recommended*.
 */
export function openRepair(stumble: RepairStumble): RepairState {
  return Object.freeze({
    stumble,
    phase: 'diagnosing' as RepairPhase,
    offered: REPAIR_BRANCHES,
    recommended: recommendedBranch(stumble.skill),
    chosen: null,
    enteredAt: null,
    untaken: Object.freeze([...REPAIR_BRANCH_IDS]),
    rejoinedByEventId: null,
    rejoinedAt: null,
  });
}

/**
 * Answer the diagnostic and enter a branch.
 *
 * The diagnostic itself produces **no evidence event**. It is a routing question,
 * not an observation of constrained retrieval — the same reason a lookup carries
 * no grade (T-07, REQ-DM-07). The v1 event catalog has no family for a
 * diagnostic answer and inventing one here would be an ADR-002 schema change
 * made in the wrong package, so the answer lives on this state and is recorded
 * as a deferred item rather than smuggled into an existing family.
 */
export function enterBranch(
  state: RepairState,
  branch: RepairBranchId,
  at: IsoInstant,
): RepairState {
  if (state.phase !== 'diagnosing') return state;
  return Object.freeze({
    ...state,
    phase: 'in_branch' as RepairPhase,
    chosen: branch,
    enteredAt: at,
    untaken: Object.freeze(REPAIR_BRANCH_IDS.filter((id) => id !== branch)),
  });
}

/** Leave a branch without repairing. Not a failure; the stumble simply stays. */
export function leaveRepair(state: RepairState): RepairState {
  if (state.phase === 'rejoined') return state;
  return Object.freeze({ ...state, phase: 'left' as RepairPhase });
}

// ---------------------------------------------------------------------------
// The rejoin criterion
// ---------------------------------------------------------------------------

/**
 * The criterion, in the words the screen shows the learner.
 *
 * Rendered verbatim so the learner can see what would end the branch before it
 * ends — a rejoin the learner cannot predict is indistinguishable from a rejoin
 * the system invented.
 */
export const REJOIN_CRITERION =
  'This branch ends when you get the same contract right on your own — no hint, no reveal — at least once. Not after a number of steps.';

/** One observation offered to the criterion, with the gate's verdict attached. */
export interface RejoinObservation {
  readonly eventId: EventId;
  readonly contractId: ContractId;
  /** The grade the gate admitted — already reveal-corrected (T-06). */
  readonly effectiveGrade: Grade;
  /** Whether the evidence gate let this reach the scheduler at all. */
  readonly admitted: boolean;
  readonly hintsUsed: number;
  readonly revealedBeforeRecall: boolean;
  readonly at: IsoInstant;
}

export const REJOIN_REFUSAL_REASONS = [
  'no_branch_entered',
  'already_rejoined',
  'no_qualifying_evidence_yet',
] as const;

export type RejoinRefusalReason = (typeof REJOIN_REFUSAL_REASONS)[number];

export type RejoinDecision =
  | { readonly rejoined: true; readonly byEventId: EventId; readonly at: IsoInstant }
  | { readonly rejoined: false; readonly reason: RejoinRefusalReason; readonly detail: string };

/**
 * Does one observation satisfy the criterion for this branch?
 *
 * Exported because it is the whole rule, and a rule worth stating is worth being
 * able to test on its own. Every clause maps to a phrase in
 * {@link REJOIN_CRITERION}: same contract, admitted, succeeded, unaided, after
 * entering.
 */
export function satisfiesRejoin(state: RepairState, observation: RejoinObservation): boolean {
  if (state.enteredAt === null) return false;
  if (observation.contractId !== state.stumble.contractId) return false;
  if (!observation.admitted) return false;
  if (observation.effectiveGrade !== 'good' && observation.effectiveGrade !== 'easy') return false;
  if (observation.hintsUsed > 0) return false;
  if (observation.revealedBeforeRecall) return false;
  return compareInstants(observation.at, state.enteredAt) >= 0;
}

/**
 * Evaluate the branch against everything observed so far.
 *
 * Takes the whole observation set rather than one event so that the answer does
 * not depend on the order the caller happened to feed them — the criterion is a
 * property of the evidence, not of the walk over it. The *first* qualifying
 * observation in the supplied order is the one credited, so a caller passing the
 * ledger in log order gets the earliest repair rather than the latest.
 */
export function evaluateRejoin(
  state: RepairState,
  observations: readonly RejoinObservation[],
): RejoinDecision {
  if (state.phase === 'rejoined') {
    return {
      rejoined: false,
      reason: 'already_rejoined',
      detail: 'this branch has already rejoined; a second success does not re-close it',
    };
  }
  if (state.phase !== 'in_branch' || state.enteredAt === null) {
    return {
      rejoined: false,
      reason: 'no_branch_entered',
      detail: 'the diagnostic has not been answered, so there is no branch to rejoin from',
    };
  }

  const qualifying = observations.find((observation) => satisfiesRejoin(state, observation));
  if (qualifying === undefined) {
    return {
      rejoined: false,
      reason: 'no_qualifying_evidence_yet',
      detail: REJOIN_CRITERION,
    };
  }

  return { rejoined: true, byEventId: qualifying.eventId, at: qualifying.at };
}

/** Apply a rejoin decision. A refusal leaves the state exactly as it was. */
export function applyRejoin(state: RepairState, decision: RejoinDecision): RepairState {
  if (!decision.rejoined) return state;
  return Object.freeze({
    ...state,
    phase: 'rejoined' as RepairPhase,
    rejoinedByEventId: decision.byEventId,
    rejoinedAt: decision.at,
  });
}
