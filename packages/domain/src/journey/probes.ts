/**
 * The cheap diagnostic probes (Campaign E / A2; REQ-JRN-01, REQ-DM-07).
 *
 * REQ-JRN-01's middle clause: *"one or two cheap diagnostic probes"*. Both
 * adjectives are constraints.
 *
 * **Cheap.** A probe the learner has to work through is a branch, not a probe;
 * by the time they have done it the diagnosis has cost more than being wrong
 * would have. Every probe here is one question answerable in a second, from
 * memory the learner already has in the room.
 *
 * **Diagnostic.** A probe has to *distinguish*. A question whose answers all
 * point the same way is a survey. So every probe declares which families each
 * answer raises, and {@link selectProbes} refuses one that cannot separate the
 * families actually on offer.
 *
 * ## A probe answer is not evidence
 *
 * This is the same rule `session/repair.ts` states for the Phase-0 diagnostic,
 * and it holds for the general case for the same reason: the answer is not a
 * constrained retrieval against a contract, so it is not a graded observation
 * (T-07, REQ-DM-07). It routes; it never reaches the scheduler. `producesEvidence`
 * is the literal `false` rather than a comment, so a caller cannot pass a probe
 * answer somewhere that expects evidence without a type error.
 */

import { BRANCH_FAMILIES, branchFamilyRank, type BranchFamily } from './families.ts';

export const PROBE_OUTCOMES = ['yes', 'no', 'unsure'] as const;
export type ProbeOutcome = (typeof PROBE_OUTCOMES)[number];

export const DIAGNOSTIC_PROBE_IDS = [
  'say_it_aloud',
  'rough_meaning',
  'something_else_came_first',
  'use_it_yourself',
  'was_the_pattern_clear',
  'was_the_task_what_you_thought',
] as const;

export type DiagnosticProbeId = (typeof DIAGNOSTIC_PROBE_IDS)[number];

export interface DiagnosticProbe {
  readonly id: DiagnosticProbeId;
  /** Asked in the learner's language, phrased so "no" is not a failure. */
  readonly question: string;
  /**
   * Which families each answer raises. `unsure` raises nothing on purpose:
   * an "I don't know" that moved the diagnosis would be inventing information.
   */
  readonly raises: Readonly<Record<ProbeOutcome, readonly BranchFamily[]>>;
  /** A probe answer is a routing signal and never an observation. */
  readonly producesEvidence: false;
}

function probe(
  id: DiagnosticProbeId,
  question: string,
  yes: readonly BranchFamily[],
  no: readonly BranchFamily[],
): DiagnosticProbe {
  return Object.freeze({
    id,
    question,
    raises: Object.freeze({
      yes: Object.freeze([...yes]),
      no: Object.freeze([...no]),
      unsure: Object.freeze([]),
    }),
    producesEvidence: false as const,
  });
}

/**
 * The catalogue, in fixed order.
 *
 * Order is the tie-break in {@link selectProbes}, so the same offered families
 * always draw the same probes. Each question is written so that both answers
 * are informative and neither is an admission — "could you say it aloud?"
 * answered *no* raises the form route, and answered *yes* rules it out, and
 * neither answer is a verdict about the learner.
 */
export const DIAGNOSTIC_PROBES: readonly DiagnosticProbe[] = Object.freeze([
  probe(
    'say_it_aloud',
    'Could you say it aloud, even without being sure what it meant?',
    ['sense_meaning_contrast', 'usage_production_register'],
    ['form_reading_aural', 'kanji_structure_writing'],
  ),
  probe(
    'rough_meaning',
    'Could you give a rough meaning, even without the reading?',
    ['form_reading_aural'],
    ['sense_meaning_contrast'],
  ),
  probe(
    'something_else_came_first',
    'Did a different word come to mind first?',
    ['sense_meaning_contrast'],
    [],
  ),
  probe(
    'use_it_yourself',
    'Could you use it in a sentence of your own?',
    [],
    ['usage_production_register'],
  ),
  probe(
    'was_the_pattern_clear',
    'Was the grammar around it clear, separately from the word?',
    [],
    ['grammar_construction'],
  ),
  probe(
    'was_the_task_what_you_thought',
    'Was the question asking what you thought it was asking?',
    [],
    ['task_misunderstanding'],
  ),
]);

const PROBE_BY_ID: ReadonlyMap<DiagnosticProbeId, DiagnosticProbe> = new Map(
  DIAGNOSTIC_PROBES.map((entry) => [entry.id, entry] as const),
);

export function probeById(id: DiagnosticProbeId): DiagnosticProbe | null {
  return PROBE_BY_ID.get(id) ?? null;
}

/** REQ-JRN-01's ceiling, as a number the compiler cannot exceed. */
export const MAX_DIAGNOSTIC_PROBES = 2;

/** How many families a probe can separate within a given offered set. */
function discriminationOver(
  candidate: DiagnosticProbe,
  offered: ReadonlySet<BranchFamily>,
): number {
  const touched = new Set<BranchFamily>();
  PROBE_OUTCOMES.forEach((outcome) => {
    candidate.raises[outcome].forEach((family) => {
      if (offered.has(family)) touched.add(family);
    });
  });
  // A probe that touches every offered family separates none of them: whichever
  // way it is answered, the ranking moves together.
  return touched.size === offered.size ? 0 : touched.size;
}

/**
 * Pick at most two probes that actually separate the offered families.
 *
 * Greedy over the fixed catalogue: take the most discriminating probe, then the
 * one that best separates what the first left tied. Greedy rather than optimal
 * because the sets are tiny, the catalogue is fixed, and a deterministic simple
 * rule is worth more here than an optimal opaque one — a learner who sees a
 * different pair of questions on two identical stumbles has been told that the
 * questions do not mean anything.
 *
 * Returns an empty list when nothing in the catalogue can separate the offered
 * families. That is a real outcome, not a failure: it means the branch choice
 * has to be the learner's, and the compiler says so instead of asking a
 * question whose answer it would ignore.
 */
export function selectProbes(offered: readonly BranchFamily[]): readonly DiagnosticProbe[] {
  const remaining = new Set(offered);
  const chosen: DiagnosticProbe[] = [];

  while (chosen.length < MAX_DIAGNOSTIC_PROBES && remaining.size > 1) {
    let best: DiagnosticProbe | null = null;
    let bestSeparation = 0;

    for (const candidate of DIAGNOSTIC_PROBES) {
      if (chosen.some((entry) => entry.id === candidate.id)) continue;
      const separation = discriminationOver(candidate, remaining);
      if (separation > bestSeparation) {
        best = candidate;
        bestSeparation = separation;
      }
    }

    if (best === null) break;
    chosen.push(best);

    // What this probe could distinguish is now covered; what it says nothing
    // about is what the next probe should aim at.
    const covered = new Set<BranchFamily>();
    PROBE_OUTCOMES.forEach((outcome) => {
      best?.raises[outcome].forEach((family) => covered.add(family));
    });
    covered.forEach((family) => remaining.delete(family));
  }

  return Object.freeze(chosen);
}

export interface ProbeAnswer {
  readonly probeId: DiagnosticProbeId;
  readonly outcome: ProbeOutcome;
}

/**
 * Tally the answers into a per-family score.
 *
 * Only families in `offered` can be raised — an answer cannot conjure a route
 * that was never on the table — and an unknown probe id is ignored rather than
 * throwing, because a stale answer from a screen that has moved on should not
 * take the journey down.
 */
export function tallyProbeAnswers(
  offered: readonly BranchFamily[],
  answers: readonly ProbeAnswer[],
): Readonly<Record<BranchFamily, number>> {
  const tally: Record<BranchFamily, number> = {
    form_reading_aural: 0,
    sense_meaning_contrast: 0,
    usage_production_register: 0,
    grammar_construction: 0,
    kanji_structure_writing: 0,
    task_misunderstanding: 0,
  };
  const offerable = new Set(offered);

  answers.forEach((answer) => {
    const found = probeById(answer.probeId);
    if (found === null) return;
    found.raises[answer.outcome].forEach((family) => {
      if (offerable.has(family)) tally[family] += 1;
    });
  });

  return Object.freeze(tally);
}

/** The offered family with the highest tally; ties broken by fixed rank. */
export function highestTallied(
  offered: readonly BranchFamily[],
  tally: Readonly<Record<BranchFamily, number>>,
): BranchFamily | null {
  const ranked = [...offered].sort((left, right) => {
    const byTally = (tally[right] ?? 0) - (tally[left] ?? 0);
    if (byTally !== 0) return byTally;
    return branchFamilyRank(left) - branchFamilyRank(right);
  });
  const top = ranked[0];
  if (top === undefined) return null;
  return (tally[top] ?? 0) > 0 ? top : null;
}

/** Every family, for callers that need the full list without importing two modules. */
export const ALL_BRANCH_FAMILIES = BRANCH_FAMILIES;
