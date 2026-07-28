/**
 * The branch families, and what a stumble looks like (Campaign E / A2;
 * REQ-JRN-01).
 *
 * REQ-JRN-01 names six *"useful route families, **not** a complete ontology"*:
 * form/reading/aural parsing; sense/meaning/contrast; usage/production/
 * register; grammar/construction; kanji structure/writing; task-
 * misunderstanding/unscored slip. That parenthesis is load-bearing and it is
 * why {@link BRANCH_FAMILY_STATUS} exists: the list is a working taxonomy, and
 * a compiler that presented it as exhaustive would be making a claim about the
 * shape of learning that nobody has evidence for.
 *
 * The sixth family is the one most systems omit and it is the most common:
 * the learner understood the word and misread the *task*. Without it, a
 * mis-tapped button becomes evidence of a meaning gap and the journey repairs
 * something that was never broken.
 */

import type { Modality, RetrievalSkill } from '../contracts/retrieval-contract.ts';
import type { Grade } from '../events/shared.ts';
import type { ContractId, EventId, IsoInstant, ThreadId } from '../primitives.ts';

export const BRANCH_FAMILIES = [
  'form_reading_aural',
  'sense_meaning_contrast',
  'usage_production_register',
  'grammar_construction',
  'kanji_structure_writing',
  'task_misunderstanding',
] as const;

export type BranchFamily = (typeof BRANCH_FAMILIES)[number];

/** REQ-JRN-01's own caveat, kept as data so a surface can repeat it. */
export const BRANCH_FAMILY_STATUS =
  'These are useful route families, not a complete ontology of why a retrieval failed. A cause that is not on this list is not thereby impossible — it is only one this build cannot route.';

export const BRANCH_FAMILY_LABELS: Readonly<Record<BranchFamily, string>> = Object.freeze({
  form_reading_aural: 'form, reading and aural parsing',
  sense_meaning_contrast: 'sense, meaning and contrast',
  usage_production_register: 'usage, production and register',
  grammar_construction: 'grammar and construction',
  kanji_structure_writing: 'kanji structure and writing',
  task_misunderstanding: 'task misunderstanding or unscored slip',
});

/**
 * Fixed presentation order.
 *
 * Every ordered result in this module breaks ties on this index, so two
 * compilations of one stumble produce identical output. Task misunderstanding
 * sorts last because offering it first would read as an accusation of
 * carelessness before anything has been probed.
 */
export function branchFamilyRank(family: BranchFamily): number {
  return BRANCH_FAMILIES.indexOf(family);
}

// ---------------------------------------------------------------------------
// The stumble
// ---------------------------------------------------------------------------

/**
 * What the ledger recorded about the miss. Facts only.
 *
 * Everything on this interface is something an event carries or a reducer
 * derived. There is deliberately no field for a belief, a confidence, or an AI
 * judgement: REQ-SCH-03 keeps the model out of memory state, and a compiler
 * that accepted "the tutor thinks this is a reading problem" as an input would
 * be laundering that judgement into a routing decision.
 */
export interface StumbleObservations {
  readonly hintsUsed: number;
  readonly revealedBeforeRecall: boolean;
  /** `null` when the surface did not measure it; never a default that pretends. */
  readonly latencyMs: number | null;
  /** How many reviews the gate has admitted for this contract, all-time. */
  readonly admittedReviewCount: number;
  readonly lapses: number;
  /** Prior misses on this contract, from the ledger. Zero means this is the first. */
  readonly priorStumbleCount: number;
}

/**
 * What routes are structurally available for this target.
 *
 * A branch that has nowhere to go is not a branch. Offering "look at the
 * components" for a word whose kanji the graph does not know produces an empty
 * screen and teaches the learner that the branches are decorative, so
 * admissibility is checked against the Atlas before anything is offered.
 * {@link import('./compiler.ts').affordancesFromGroups} derives this from a
 * graph neighbourhood.
 */
export interface BranchAffordances {
  readonly hasComponents: boolean;
  readonly hasContrastNeighbours: boolean;
  readonly hasReadingFamily: boolean;
  readonly hasGrammarConstruction: boolean;
  readonly hasProductionContract: boolean;
  readonly hasAudio: boolean;
  /** REQ-LM-02: handwriting is surfaced only when activated. */
  readonly writingActivated: boolean;
}

export const NO_AFFORDANCES: BranchAffordances = Object.freeze({
  hasComponents: false,
  hasContrastNeighbours: false,
  hasReadingFamily: false,
  hasGrammarConstruction: false,
  hasProductionContract: false,
  hasAudio: false,
  writingActivated: false,
});

export interface JourneyStumble {
  readonly contractId: ContractId;
  readonly threadId: ThreadId;
  readonly skill: RetrievalSkill;
  readonly cueModality: Modality;
  readonly responseModality: Modality;
  /** The `ReviewGraded` event that recorded the miss. */
  readonly eventId: EventId;
  readonly at: IsoInstant;
  /** The grade the gate admitted — already reveal-corrected (T-06). */
  readonly effectiveGrade: Grade;
  readonly observed: StumbleObservations;
  readonly available: BranchAffordances;
}
