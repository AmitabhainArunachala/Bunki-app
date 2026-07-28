/**
 * The journey compiler (Campaign E / A2; REQ-JRN-01, REQ-JRN-02, REQ-JRN-03).
 *
 * REQ-JRN-01's rule, verbatim:
 *
 * > stumble → candidate-cause hypotheses → one or two cheap diagnostic probes →
 * > branch selection → contract-defined rejoin.
 *
 * and its next sentence, which is the one this file is really written against:
 *
 * > **Do not infer a cause confidently from one stumble.**
 *
 * ## How "do not infer a cause" is made structural
 *
 * A rule stated in a comment is a rule until somebody is in a hurry. Four
 * structural properties carry it instead:
 *
 *   1. **There is no cause field.** {@link CompiledJourney} carries
 *      `hypotheses` and `offered`. Nothing on it is named `cause`, `diagnosis`
 *      or `confidence`, so no caller can render one, and no later change can
 *      add one without changing the type every screen reads.
 *   2. **Narrowing to one is impossible.** Whenever two or more families are
 *      structurally available, at least two are offered. The ranking decides
 *      the *order*, never the survivors.
 *   3. **A first stumble cannot select a branch on its own.**
 *      {@link selectBranch} refuses with `probe_required` when the basis is a
 *      single stumble and more than one path is offered. The probes are not
 *      decoration between the hypothesis and the branch; they are the only
 *      thing that may narrow.
 *   4. **`recommended` is a lookup, not an inference.** It comes from the skill
 *      that stumbled — a reading contract recommends the reading route —
 *      exactly as `session/repair.ts` does it, and REQ-JRN-03's reversible
 *      default is a *choice* with a recommendation, so choosing the other path
 *      is not an error.
 *
 * ## What is not implemented, and why the Phase-0 seam is not edited
 *
 * `session/repair.ts` declares a `JourneyCompiler` interface whose signature is
 * `compile(stumble) => RepairBranchOption[]`. This module does not implement
 * it, and the mismatch is the point: that signature has no place to put the
 * diagnostic probes, and a compiler that returned branches straight from a
 * stumble would be doing precisely the confident inference REQ-JRN-01 forbids.
 * The Phase-0 seam text is now out of step with the tree; updating it is a
 * coordination request rather than an edit made from here, on the COORD-B8-1
 * precedent that file already records. {@link JOURNEY_COMPILER_SUPERSESSION}
 * says so as data.
 */

import type { RetrievalSkill } from '../contracts/retrieval-contract.ts';
import type { IsoInstant } from '../primitives.ts';
import type { NeighbourhoodGroups } from '../graph/neighbourhood.ts';
import {
  BRANCH_FAMILIES,
  BRANCH_FAMILY_LABELS,
  branchFamilyRank,
  type BranchAffordances,
  type BranchFamily,
  type JourneyStumble,
} from './families.ts';
import {
  highestTallied,
  selectProbes,
  tallyProbeAnswers,
  type DiagnosticProbe,
  type ProbeAnswer,
} from './probes.ts';

/** Why the Phase-0 interface is superseded rather than implemented. */
export const JOURNEY_COMPILER_SUPERSESSION = Object.freeze({
  supersedes: 'JOURNEY_COMPILER_SEAM in packages/domain/src/session/repair.ts',
  why: 'The Phase-0 seam types compile(stumble) => RepairBranchOption[]. That signature returns branches directly from a stumble, with nowhere to put REQ-JRN-01’s diagnostic probes — implementing it would be the confident single-stumble inference the requirement forbids. This module implements the full rule with a wider signature instead.',
  seamTextIsStale: true,
  handling:
    'Rewriting the seam record is a coordination request, on the COORD-B8-1 precedent recorded in that file, not an edit made from src/journey/.',
  anchors: Object.freeze(['REQ-JRN-01', 'REQ-JRN-02', 'REQ-JRN-03', 'DL-25']),
});

// ---------------------------------------------------------------------------
// Hypotheses
// ---------------------------------------------------------------------------

/**
 * A candidate cause, phrased as a hypothesis and carrying the observations that
 * raised it.
 *
 * `support` is a list of *facts from the ledger*, not reasons the model
 * believes something. The distinction is the belief-ledger rule of REQ-LM-06 —
 * every judgement cites its evidence — applied to routing: a learner reading
 * "you used no hint and answered in under a second" can check it; a learner
 * reading "we are 70% sure this is a reading problem" cannot.
 */
export interface CandidateCause {
  readonly family: BranchFamily;
  readonly hypothesis: string;
  readonly work: string;
  readonly support: readonly string[];
  /** Whether this route has anywhere to go for this target. */
  readonly admissible: boolean;
  /** Why it is not admissible; `null` when it is. */
  readonly unavailableBecause: string | null;
}

interface FamilyRule {
  readonly family: BranchFamily;
  readonly hypothesis: string;
  readonly work: string;
  /** Skills for which this route is the obvious first thing to look at. */
  readonly skills: readonly RetrievalSkill[];
  readonly isAvailable: (available: BranchAffordances) => boolean;
  readonly unavailableBecause: string;
}

/**
 * The six families as routing rules.
 *
 * Every `hypothesis` string is conditional — "may", "might" — because the
 * screen renders it before any probe has been answered, and copy that said
 * "you don't know the reading" would be the inference this file exists to
 * prevent.
 */
const FAMILY_RULES: readonly FamilyRule[] = Object.freeze([
  {
    family: 'form_reading_aural',
    hypothesis: 'The form may be recognisable while its reading is not coming back.',
    work: 'Read the components, then the compound, then the target in its sentence again.',
    skills: ['orthography_to_reading', 'audio_to_meaning'],
    isAvailable: (available) => available.hasComponents || available.hasReadingFamily,
    unavailableBecause:
      'this target has no components and no reading family in the graph, so there is nothing to read through',
  },
  {
    family: 'sense_meaning_contrast',
    hypothesis: 'The reading may be coming back while the sense is not settled.',
    work: 'Place the sense against its nearest neighbours, then meet the target in context again.',
    skills: ['form_to_meaning', 'audio_to_meaning', 'discrimination'],
    isAvailable: () => true,
    unavailableBecause: '',
  },
  {
    family: 'usage_production_register',
    hypothesis: 'The word may be understood while it is not yet available to use.',
    work: 'Work through its collocations, then produce one sentence of your own.',
    skills: ['meaning_to_production'],
    isAvailable: (available) => available.hasProductionContract,
    unavailableBecause: 'no production contract exists for this target yet',
  },
  {
    family: 'grammar_construction',
    hypothesis: 'The word may be known while the construction around it is not.',
    work: 'Take the pattern on its own, then return to the sentence that used it.',
    skills: [],
    isAvailable: (available) => available.hasGrammarConstruction,
    unavailableBecause: 'no grammar construction is attached to where this was met',
  },
  {
    family: 'kanji_structure_writing',
    hypothesis: 'The characters themselves may not yet be distinct from one another.',
    work: 'Separate the components and their roles, then look at the confusable neighbours.',
    skills: [],
    isAvailable: (available) => available.hasComponents,
    unavailableBecause: 'this target has no component structure in the graph',
  },
  {
    family: 'task_misunderstanding',
    hypothesis: 'The word may be fine and the question may have asked something else.',
    work: 'Look at what was being asked, and try the same contract once more.',
    skills: [],
    // Always available: it needs no content, only the question that was asked.
    // It is also the family most systems omit, which is why a mis-tap so often
    // becomes evidence of a gap that was never there.
    isAvailable: () => true,
    unavailableBecause: '',
  },
]);

/** Observations that raise a family, as sentences a learner can check. */
function supportFor(rule: FamilyRule, stumble: JourneyStumble): readonly string[] {
  const support: string[] = [];
  const { observed, available } = stumble;

  if (rule.skills.includes(stumble.skill)) {
    support.push(`the contract that missed was a ${stumble.skill.replaceAll('_', ' ')} contract`);
  }

  switch (rule.family) {
    case 'form_reading_aural': {
      if (stumble.cueModality === 'audio') support.push('the cue was audio');
      if (observed.revealedBeforeRecall) support.push('the answer was revealed before recall');
      break;
    }
    case 'sense_meaning_contrast': {
      if (available.hasContrastNeighbours) {
        support.push('this target has confusable neighbours in the graph');
      }
      if (observed.lapses > 0) {
        support.push(
          `this contract has lapsed ${observed.lapses} time${observed.lapses === 1 ? '' : 's'} before`,
        );
      }
      break;
    }
    case 'usage_production_register': {
      if (stumble.responseModality === 'free') support.push('the response was free production');
      break;
    }
    case 'grammar_construction': {
      if (available.hasGrammarConstruction) {
        support.push('a grammar construction is attached to where this was met');
      }
      break;
    }
    case 'kanji_structure_writing': {
      if (available.hasComponents) support.push('this target has component structure');
      if (available.writingActivated) support.push('writing is activated for you');
      break;
    }
    case 'task_misunderstanding': {
      if (observed.latencyMs !== null && observed.latencyMs < FAST_ANSWER_MS) {
        support.push(`the answer came in under ${FAST_ANSWER_MS} ms`);
      }
      if (observed.hintsUsed === 0 && !observed.revealedBeforeRecall) {
        support.push('no hint was taken and nothing was revealed');
      }
      break;
    }
  }

  return Object.freeze(support);
}

/**
 * Below this, a wrong answer arrived faster than the target could plausibly
 * have been read — which is a fact about the timing, and a reason to *ask*
 * whether the question was misread. It is not itself a finding.
 */
export const FAST_ANSWER_MS = 1500;

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/**
 * What the ledger supports so far. Never a confidence, always a count.
 *
 * `single_stumble` is not a weaker version of `repeated_stumble`; it is a
 * different regime, in which the compiler is not permitted to select anything
 * without a probe.
 */
export const JOURNEY_BASES = ['single_stumble', 'repeated_stumble'] as const;
export type JourneyBasis = (typeof JOURNEY_BASES)[number];

/** REQ-JRN-02: "Show at most two or three relevant paths." */
export const MAX_OFFERED_PATHS = 3;
export const MIN_OFFERED_PATHS = 2;

export interface BranchOption {
  readonly family: BranchFamily;
  readonly label: string;
  readonly hypothesis: string;
  readonly work: string;
  readonly support: readonly string[];
}

export interface CompiledJourney {
  readonly stumble: JourneyStumble;
  readonly basis: JourneyBasis;
  /** Every family considered, admissible or not, in ranked order. */
  readonly hypotheses: readonly CandidateCause[];
  /** At most three, at least two whenever two are available (REQ-JRN-02). */
  readonly offered: readonly BranchOption[];
  /** One or two, or none when nothing in the catalogue can separate the offer. */
  readonly probes: readonly DiagnosticProbe[];
  /** A default, from the skill that stumbled. Not a diagnosis (REQ-JRN-03). */
  readonly recommended: BranchFamily;
}

/**
 * The skill→family lookup behind `recommended`.
 *
 * A table, deliberately. Anything cleverer here would be a model of why the
 * learner missed, arrived at from one observation.
 */
const RECOMMENDED_BY_SKILL: Readonly<Record<RetrievalSkill, BranchFamily>> = Object.freeze({
  orthography_to_reading: 'form_reading_aural',
  form_to_meaning: 'sense_meaning_contrast',
  meaning_to_production: 'usage_production_register',
  audio_to_meaning: 'form_reading_aural',
  discrimination: 'sense_meaning_contrast',
});

function rankCauses(causes: readonly CandidateCause[]): readonly CandidateCause[] {
  return Object.freeze(
    [...causes].sort((left, right) => {
      if (left.admissible !== right.admissible) return left.admissible ? -1 : 1;
      const bySupport = right.support.length - left.support.length;
      if (bySupport !== 0) return bySupport;
      return branchFamilyRank(left.family) - branchFamilyRank(right.family);
    }),
  );
}

/**
 * Compile a stumble into hypotheses, probes, and at most three paths.
 *
 * Pure and total: no clock, no randomness, no throw. Two calls with equal input
 * return deeply equal output, which is what lets a screen recompute on every
 * render without the offered paths shuffling under the learner's finger.
 */
export function compileJourney(stumble: JourneyStumble): CompiledJourney {
  const causes = FAMILY_RULES.map<CandidateCause>((rule) => {
    const admissible = rule.isAvailable(stumble.available);
    return Object.freeze({
      family: rule.family,
      hypothesis: rule.hypothesis,
      work: rule.work,
      support: supportFor(rule, stumble),
      admissible,
      unavailableBecause: admissible ? null : rule.unavailableBecause,
    });
  });

  const ranked = rankCauses(causes);
  const admissible = ranked.filter((cause) => cause.admissible);

  // REQ-JRN-02's ceiling, and the floor that keeps a single stumble from
  // narrowing to one path. When only one family is structurally available the
  // floor cannot be met, and offering a route with nowhere to go would be
  // worse than offering one — so the honest answer is the one path plus the
  // reasons the others are unavailable, which `hypotheses` already carries.
  const offerCount = Math.min(
    MAX_OFFERED_PATHS,
    Math.max(admissible.length >= MIN_OFFERED_PATHS ? MIN_OFFERED_PATHS : 1, admissible.length),
  );

  const offered = Object.freeze(
    admissible.slice(0, offerCount).map<BranchOption>((cause) =>
      Object.freeze({
        family: cause.family,
        label: BRANCH_FAMILY_LABELS[cause.family],
        hypothesis: cause.hypothesis,
        work: cause.work,
        support: cause.support,
      }),
    ),
  );

  const offeredFamilies = offered.map((option) => option.family);
  const recommendedFromSkill = RECOMMENDED_BY_SKILL[stumble.skill];
  const recommended = offeredFamilies.includes(recommendedFromSkill)
    ? recommendedFromSkill
    : (offeredFamilies[0] ?? recommendedFromSkill);

  return Object.freeze({
    stumble,
    basis:
      stumble.observed.priorStumbleCount > 0 ? 'repeated_stumble' : ('single_stumble' as const),
    hypotheses: ranked,
    offered,
    probes: selectProbes(offeredFamilies),
    recommended,
  });
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export const SELECTION_REFUSAL_REASONS = [
  'probe_required',
  'no_path_offered',
  'answers_were_inconclusive',
] as const;

export type SelectionRefusalReason = (typeof SELECTION_REFUSAL_REASONS)[number];

export type BranchSelection =
  | {
      readonly selected: true;
      readonly family: BranchFamily;
      /** The observations and answers that put this path first. */
      readonly rationale: readonly string[];
      /** Everything still on offer. Choosing one of these is not an error. */
      readonly alternatives: readonly BranchFamily[];
    }
  | {
      readonly selected: false;
      readonly reason: SelectionRefusalReason;
      readonly detail: string;
      readonly alternatives: readonly BranchFamily[];
    };

/**
 * Turn probe answers into a selected path — or refuse.
 *
 * The refusal on `probe_required` is the load-bearing branch. On a first
 * stumble with more than one path available, this function will not pick one
 * from the observations alone, however suggestive they are; something the
 * learner said has to enter first. That is REQ-JRN-01's "do not infer a cause
 * confidently from one stumble", expressed as a function that returns nothing
 * useful when you try.
 *
 * A selection is still a *recommendation*: `alternatives` carries every other
 * offered path, and {@link enterBranch} accepts any of them.
 */
export function selectBranch(
  journey: CompiledJourney,
  answers: readonly ProbeAnswer[],
): BranchSelection {
  const offeredFamilies = journey.offered.map((option) => option.family);

  if (offeredFamilies.length === 0) {
    return {
      selected: false,
      reason: 'no_path_offered',
      detail:
        'no branch family has anywhere to go for this target; the hypotheses record why each one is unavailable',
      alternatives: Object.freeze([]),
    };
  }

  if (offeredFamilies.length === 1) {
    const only = offeredFamilies[0] as BranchFamily;
    return {
      selected: true,
      family: only,
      rationale: Object.freeze(['it is the only route available for this target']),
      alternatives: Object.freeze([]),
    };
  }

  const answered = answers.filter((answer) => answer.outcome !== 'unsure');
  if (journey.basis === 'single_stumble' && answered.length === 0) {
    return {
      selected: false,
      reason: 'probe_required',
      detail:
        'this is the first miss on this contract. One stumble does not identify a cause, so a diagnostic has to be answered before a path is chosen — or you can pick a path yourself.',
      alternatives: Object.freeze([...offeredFamilies]),
    };
  }

  const tally = tallyProbeAnswers(offeredFamilies, answers);
  const top = highestTallied(offeredFamilies, tally);

  if (top === null) {
    return {
      selected: false,
      reason: 'answers_were_inconclusive',
      detail:
        'the answers did not separate the paths on offer. The choice is yours, and the recommended path is only a default.',
      alternatives: Object.freeze([...offeredFamilies]),
    };
  }

  const rationale = answers
    .filter((answer) => answer.outcome !== 'unsure')
    .flatMap((answer) => {
      const probe = journey.probes.find((entry) => entry.id === answer.probeId);
      if (probe === undefined) return [];
      if (!probe.raises[answer.outcome].includes(top)) return [];
      return [`you answered “${answer.outcome}” to: ${probe.question}`];
    });

  return {
    selected: true,
    family: top,
    rationale: Object.freeze(rationale),
    alternatives: Object.freeze(offeredFamilies.filter((family) => family !== top)),
  };
}

// ---------------------------------------------------------------------------
// Affordances from the graph
// ---------------------------------------------------------------------------

/**
 * Derive what routes exist from a graph neighbourhood.
 *
 * This is the join between A2's two halves: the Atlas says what a branch could
 * be about, and the compiler refuses to offer a branch the Atlas cannot fill.
 * `hasProductionContract` and `writingActivated` are not graph facts, so they
 * are passed in — a projection that guessed them would be inventing the
 * learner's contract set.
 */
export function affordancesFromGroups(
  groups: NeighbourhoodGroups,
  extras: {
    readonly hasProductionContract: boolean;
    readonly hasAudio: boolean;
    readonly writingActivated: boolean;
  },
): BranchAffordances {
  return Object.freeze({
    hasComponents: groups.components.length > 0,
    hasContrastNeighbours: groups.contrasts.length > 0,
    hasReadingFamily: groups.readingFamily.length > 0,
    hasGrammarConstruction: groups.constructions.length > 0,
    hasProductionContract: extras.hasProductionContract,
    hasAudio: extras.hasAudio,
    writingActivated: extras.writingActivated,
  });
}

/** Every family this build knows how to route, for a legend. */
export const ROUTABLE_FAMILIES: readonly BranchFamily[] = BRANCH_FAMILIES;

/** The instant type re-stated so callers of this module import one namespace. */
export type JourneyInstant = IsoInstant;
