/**
 * Reading the ledger for the misses a branch could open on (Campaign E, lane B5).
 *
 * ## The one rule this file exists to keep
 *
 * **A stumble is not something the learner declares and not something this
 * surface decides.** It is a `ReviewGraded` the evidence gate admitted and
 * reveal-corrected to `again`. So every field of the {@link JourneyStumble} this
 * module builds is copied out of the log or out of the gate's own decision
 * record — none of it is computed here, defaulted here, or inferred here.
 *
 * That matters because the previous generation of this project shipped a
 * `latencyMs` of 0 that had never been measured. The corresponding field on
 * `StumbleObservations` is `number | null`, and `null` is what this module
 * produces for anything the ledger does not carry.
 *
 * ## Why the gate's decision and not the event alone
 *
 * The first version of this paragraph said `ReviewGraded.grade` is "what the
 * learner pressed" and `GateDecisionRecord.effectiveGrade` is "what counted".
 * That is the design the requirement describes and it is **not** what this
 * kernel does, and the test for it is what found out:
 * `evidence/mint.ts` computes `grade = revealedBeforeRecall ? 'again' :
 * input.grade` *at mint*, so the submitted grade never reaches the log at all.
 * A `good` on a revealed answer is stored as an `again` with
 * `revealedBeforeRecall: true`, and the two grades agree on every event this
 * app can produce. See {@link REVEAL_CORRECTION_HAPPENS_AT_MINT}.
 *
 * The gate's decision is still what is read here, for the half that is not
 * redundant: `admitted`. A review the gate refused opens nothing at all,
 * because refused evidence is not evidence of a gap — and that verdict exists
 * nowhere but the decision record.
 *
 * ## What the affordances are, and are not
 *
 * `BranchAffordances` says which routes have somewhere to go. The compiler
 * refuses to offer a route the data cannot fill, which is the whole reason a
 * branch is not decorative. Every flag below is answered from the bundled seed
 * or from the log, and the ones this build genuinely cannot answer are `false`
 * with the reason recorded in {@link AFFORDANCES_NOT_AVAILABLE_HERE} rather
 * than optimistically `true`.
 */

import type {
  BranchAffordances,
  ContractCreatedEvent,
  DerivedState,
  DomainEvent,
  Grade,
  JourneyObservation,
  JourneyStumble,
  ReviewGradedEvent,
  StumbleObservations,
} from '@bunki/domain';

import {
  constituentKanji,
  findLexemeById,
  findLexemeByHeadword,
  wordFamily,
} from '../../data/catalog.ts';
import type { SeedLexeme } from '../../data/catalog.ts';

/**
 * The affordances this build cannot answer in the affirmative, and why.
 *
 * Kept as data so the surface can say it out loud. A route that is unavailable
 * because the data is thin is a different thing from a route that is
 * unavailable because it does not apply to this word, and the learner is owed
 * the difference — {@link import('@bunki/domain').CandidateCause} already
 * carries `unavailableBecause` for the second kind.
 */
export const AFFORDANCES_NOT_AVAILABLE_HERE: readonly {
  readonly affordance: keyof BranchAffordances;
  readonly why: string;
}[] = Object.freeze([
  Object.freeze({
    affordance: 'hasGrammarConstruction' as const,
    why: 'This build carries no grammar-pattern taxonomy, so nothing can say which construction a word was met inside. The frozen spec §6 records that gap by name.',
  }),
  Object.freeze({
    affordance: 'hasAudio' as const,
    why: 'No audio ships with this build, so a listening route would open onto silence.',
  }),
  Object.freeze({
    affordance: 'writingActivated' as const,
    why: 'Handwriting is surfaced only once you activate it, and nothing in this build activates it yet.',
  }),
]);

/**
 * Why this build never asks a criterion for successes on different sittings.
 *
 * `RejoinCriterionOptions.requireSeparateSessions` exists in the domain and the
 * evaluator honours it by grouping observations on `sessionId`. Nothing in this
 * app can fill that field: the event envelope is `eventId`, `v`, `occurredAt`
 * and `idempotencyKey`, and no evidence-class event carries the sitting it
 * happened in. The domain's fallback for a `null` sitting is to treat each such
 * observation as its own — which would make "on two different days" satisfiable
 * by two answers in one minute.
 *
 * So the option is not offered, and this constant says so where a reader will
 * find it rather than in a capsule nobody opens.
 */
export const SEPARATE_SITTINGS_NOT_AVAILABLE =
  'A rejoin condition can ask for successes on different days. This build does not offer that, because no event in its log records which sitting it happened in — so “different days” could not be checked, only assumed.';

/**
 * Where the reveal correction actually happens in this kernel, measured.
 *
 * Recorded as data because a surface that assumed otherwise would be reading a
 * field that cannot carry what it looks like it carries — and because the
 * assumption is the one the requirement's own wording invites.
 *
 * `mintReviewGraded` applies T-06 before the event exists. Two consequences
 * follow, and `test/journey-surface.test.ts` pins both against a real sitting:
 *
 *   1. `ReviewGraded.grade` and `GateDecisionRecord.effectiveGrade` are equal
 *      on every event this app can mint. The submitted grade is not retained
 *      anywhere; what survives is `revealedBeforeRecall: true` beside an
 *      `again`.
 *   2. `GateDecisionRecord.forcedByReveal` is computed as
 *      `revealedBeforeRecall && grade !== 'again'` and is therefore **always
 *      false** on such an event. It is not read by anything in this lane.
 *
 * This is an observation about `packages/domain`, which this lane does not own.
 * It is written down rather than worked around, and rather than left as a
 * comment somewhere claiming the behaviour the requirement describes.
 */
export const REVEAL_CORRECTION_HAPPENS_AT_MINT = Object.freeze({
  where: 'packages/domain/src/evidence/mint.ts, mintReviewGraded',
  what: "grade = revealedBeforeRecall ? 'again' : input.grade, applied before the event is parsed",
  consequence:
    'ReviewGraded.grade already carries the correction, so GateDecisionRecord.effectiveGrade never differs from it and forcedByReveal is never true on an app-minted event.',
  lane: 'observed by Campaign E lane B5; the gate is WP-06’s',
});

/** A `ReviewGraded` and the gate's verdict on it, joined. */
export interface GradedWithVerdict {
  readonly event: ReviewGradedEvent;
  /**
   * The gate's verdict. The one field of the decision record that is not
   * recoverable from the event itself, and the reason this join exists.
   */
  readonly admitted: boolean;
  /**
   * The grade the gate counted. Equal to `event.grade` on anything this app
   * minted — see {@link REVEAL_CORRECTION_HAPPENS_AT_MINT} — and read from the
   * decision record anyway, because the decision record is the authority on
   * what counted and an imported log need not have come from this minter.
   */
  readonly effectiveGrade: Grade | null;
  /**
   * The gate's `forcedByReveal`, carried verbatim. **Always false on an event
   * this app minted**, for the reason above. Kept so the join is a faithful
   * view of the decision record rather than a filtered one, and deliberately
   * not used to decide anything.
   */
  readonly forcedByReveal: boolean;
}

/**
 * Join every graded review in the log to the gate's decision on it.
 *
 * Log order is preserved, because an evidence ledger's order is part of its
 * meaning. A review with no decision record is dropped rather than assumed
 * admitted: the gate records one for every evidence-class observation, so an
 * absent decision means the log and the replay disagree, and guessing which is
 * right is exactly the sort of quiet repair that hides a real defect.
 */
export function gradedReviews(
  log: readonly DomainEvent[],
  state: DerivedState,
): readonly GradedWithVerdict[] {
  const decisions = new Map(state.gateDecisions.map((decision) => [decision.eventId, decision]));
  const out: GradedWithVerdict[] = [];

  for (const event of log) {
    if (event.type !== 'ReviewGraded') continue;
    const decision = decisions.get(event.eventId);
    if (decision === undefined) continue;
    out.push({
      event,
      admitted: decision.admitted,
      effectiveGrade: decision.effectiveGrade,
      forcedByReveal: decision.forcedByReveal,
    });
  }

  return Object.freeze(out);
}

/** Was this review, as the gate counted it, a miss? */
export function isMiss(review: GradedWithVerdict): boolean {
  return review.admitted && review.effectiveGrade === 'again';
}

/** Was this review, as the gate counted it, an unaided success? */
export function isUnaidedSuccess(review: GradedWithVerdict): boolean {
  if (!review.admitted) return false;
  if (review.effectiveGrade !== 'good' && review.effectiveGrade !== 'easy') return false;
  if (review.event.hintsUsed > 0) return false;
  return !review.event.revealedBeforeRecall;
}

/**
 * Every graded review in the ledger, in the shape the rejoin criterion reads.
 *
 * The join is one-to-one with {@link gradedReviews}: the criterion's inputs are
 * the gate's verdict (`admitted`, `effectiveGrade`) and the event's own record
 * of how the answer was reached (`hintsUsed`, `revealedBeforeRecall`). Nothing
 * is computed.
 *
 * `sessionId` is `null` for every observation, and that is not a placeholder —
 * see {@link SEPARATE_SITTINGS_NOT_AVAILABLE}. An observation the gate refused
 * keeps `effectiveGrade` as the grade the learner pressed, because the surface
 * has to be able to say "this was a good, and it was refused, and here is which
 * clause it failed"; the criterion still rejects it on `admitted`.
 */
export function journeyObservationsFrom(
  log: readonly DomainEvent[],
  state: DerivedState,
): readonly JourneyObservation[] {
  return Object.freeze(
    gradedReviews(log, state).map<JourneyObservation>((review) =>
      Object.freeze({
        eventId: review.event.eventId,
        contractId: review.event.contractId,
        effectiveGrade: review.effectiveGrade ?? review.event.grade,
        admitted: review.admitted,
        hintsUsed: review.event.hintsUsed,
        revealedBeforeRecall: review.event.revealedBeforeRecall,
        sessionId: null,
        at: review.event.occurredAt,
      }),
    ),
  );
}

/**
 * The observations behind one miss, counted over the reviews that came before it.
 *
 * "Before" is by position in the log rather than by timestamp: the log is the
 * order things were applied, and two events minted on the same injected clock
 * tick have equal timestamps and a real order. Counting by timestamp would make
 * the tally depend on a tie-break nobody chose.
 */
export function observationsFor(
  reviews: readonly GradedWithVerdict[],
  index: number,
): StumbleObservations {
  const miss = reviews[index];
  if (miss === undefined) {
    throw new Error(`no review at index ${String(index)}`);
  }

  const earlier = reviews
    .slice(0, index)
    .filter((review) => review.event.contractId === miss.event.contractId);

  return Object.freeze({
    hintsUsed: miss.event.hintsUsed,
    revealedBeforeRecall: miss.event.revealedBeforeRecall,
    // The event carries a measured latency. It is passed through untouched and
    // is never defaulted — see this file's header.
    latencyMs: miss.event.latencyMs,
    admittedReviewCount: earlier.filter((review) => review.admitted).length,
    // A lapse is a miss the gate counted, on this contract, before this one.
    // Identical to `priorStumbleCount` in this build, and kept as two fields
    // because the domain interface distinguishes them and collapsing them here
    // would be this module deciding they are the same thing everywhere.
    lapses: earlier.filter(isMiss).length,
    priorStumbleCount: earlier.filter(isMiss).length,
  });
}

/**
 * What routes exist for a word, from the bundled seed.
 *
 * Every `true` below is a fact about data that is present:
 *
 *   - **components** — the headword is written with kanji the seed holds a
 *     record for, so "separate the components" has something to separate.
 *   - **reading family** — at least one of those kanji carries a reading in the
 *     seed, so "read the components, then the compound" has readings to read.
 *   - **contrast neighbours** — other seed words are written with one of the
 *     same characters, so "place it against its nearest neighbours" has
 *     neighbours. Shared characters, not inferred synonymy: an invented edge is
 *     the same defect class as a guessed era.
 *
 * The three that are always `false` are listed in
 * {@link AFFORDANCES_NOT_AVAILABLE_HERE} with the reason.
 */
export function affordancesForLexeme(
  lexeme: SeedLexeme | null,
  options: { readonly hasProductionContract: boolean },
): BranchAffordances {
  if (lexeme === null) {
    return Object.freeze({
      hasComponents: false,
      hasContrastNeighbours: false,
      hasReadingFamily: false,
      hasGrammarConstruction: false,
      hasProductionContract: options.hasProductionContract,
      hasAudio: false,
      writingActivated: false,
    });
  }

  const kanji = constituentKanji(lexeme);

  return Object.freeze({
    hasComponents: kanji.length > 0,
    hasContrastNeighbours: wordFamily(lexeme).length > 0,
    hasReadingFamily: kanji.some(
      (entry) => entry.onReadings.length > 0 || entry.kunReadings.length > 0,
    ),
    hasGrammarConstruction: false,
    hasProductionContract: options.hasProductionContract,
    hasAudio: false,
    writingActivated: false,
  });
}

/**
 * The seed entry a thread is about, by the same two-step the session uses.
 *
 * The app-local `lexemeId` first, the exact headword second. Nothing fuzzier:
 * a near match would attach a branch to a different word than the one that was
 * missed, and the whole surface would then be repairing something else.
 */
export function lexemeForDisplayText(
  displayText: string,
  lexemeId: string | null,
): SeedLexeme | null {
  if (lexemeId !== null) {
    const byId = findLexemeById(lexemeId);
    if (byId !== null) return byId;
  }
  return findLexemeByHeadword(displayText);
}

export interface StumbleSource {
  readonly log: readonly DomainEvent[];
  readonly state: DerivedState;
  /**
   * How to find the word a contract is about. Supplied by the screen, which is
   * the only layer that knows how the app links a contract to a seed entry.
   * Returning `null` is a correct answer and produces a stumble with no routes
   * that need a word, rather than a guess.
   */
  readonly lexemeForContract: (contractId: string) => SeedLexeme | null;
  /** Which thread a contract belongs to; `null` when the ledger does not say. */
  readonly threadForContract: (contractId: string) => string | null;
}

/**
 * Every miss in the ledger that a branch could open on, newest first.
 *
 * Newest first because a learner arriving here wants the thing that just
 * happened. Nothing is filtered by age, and nothing expires: a miss the learner
 * never looked at is still a miss, and quietly dropping it would be the surface
 * deciding on their behalf that it no longer matters.
 */
export function stumblesFrom(source: StumbleSource): readonly JourneyStumble[] {
  const reviews = gradedReviews(source.log, source.state);
  const contracts = new Map(source.state.contracts.map((record) => [record.contractId, record]));

  /*
    The `ContractCreated` events themselves, not the replayed registry.

    `ContractRecord` records the contract's identity, its skill and how it is
    scored, and it does not carry the cue and response modalities — those live
    only on the event. A stumble needs them (the compiler raises the form route
    when the cue was audio, and the production route when the response was
    free), so they are read from the event that established the contract. The
    alternative was to hard-code `'text'` because that is what the seeded
    contracts happen to use, which would be a fact about today's fixture typed
    into a projection as if it were a fact about the contract.
  */
  const created = new Map<string, ContractCreatedEvent>();
  for (const event of source.log) {
    if (event.type !== 'ContractCreated') continue;
    if (!created.has(event.contractId)) created.set(event.contractId, event);
  }

  const out: JourneyStumble[] = [];

  reviews.forEach((review, index) => {
    if (!isMiss(review)) return;

    const contract = contracts.get(review.event.contractId);
    const establishing = created.get(review.event.contractId);
    if (contract === undefined || establishing === undefined) return;

    const threadId = source.threadForContract(review.event.contractId);
    if (threadId === null) return;

    const lexeme = source.lexemeForContract(review.event.contractId);
    const hasProductionContract = [...contracts.values()].some(
      (record) =>
        record.targetComponentId === contract.targetComponentId &&
        record.skill === 'meaning_to_production',
    );

    out.push(
      Object.freeze({
        contractId: review.event.contractId,
        threadId,
        skill: establishing.skill,
        cueModality: establishing.cueModality,
        responseModality: establishing.responseModality,
        eventId: review.event.eventId,
        at: review.event.occurredAt,
        // The gate's grade, not the learner's. `isMiss` has already established
        // this is `again`.
        effectiveGrade: 'again',
        observed: observationsFor(reviews, index),
        available: affordancesForLexeme(lexeme, { hasProductionContract }),
      }),
    );
  });

  return Object.freeze([...out].reverse());
}
