/**
 * The evidence chain, as data (WP-09; REQ-UI-06, REQ-LM-06).
 *
 * Pure functions over `@bunki/domain`'s `DerivedState` and the raw log. No
 * React, no store, no clock — so the part of the inspector that is easy to get
 * subtly wrong (which event caused which change, what a tier means, what a
 * refusal means) is unit-testable without a renderer.
 *
 * ## What this module is allowed to do
 *
 * Join and phrase. Every fact it emits is read from the kernel's own output:
 * `observations` for what happened, `gateDecisions` for the kernel's verdict on
 * it, `contracts` for what was asked, `threads.promotionHistory` for the state
 * changes. It computes no verdict, derives no grade, and invents no
 * relationship. Where the log is silent, the row says the log is silent.
 *
 * ## REQ-LM-06's default surface, and the thing it must not become
 *
 * > default surface answers *why this appeared*, with evidence strength,
 * > uncertainty, and a correction affordance; expansion shows evidence events,
 * > source/probe, rubric/model version, supersession history; […] **never one
 * > mastery score**.
 *
 * "Evidence strength" is therefore a *description of the evidence*, not a
 * number derived from it. `summariseStrength` counts observations by tier and
 * by whether the gate admitted them, and says so in words. It has no numeric
 * output on purpose: any single figure here would be read as a mastery score,
 * which the requirement forbids in the same sentence that asks for strength —
 * and a percentage would additionally be a claim this build has measured
 * nothing to support (REQ-GATE-03).
 *
 * "Uncertainty" is likewise not a confidence interval. It is the list of things
 * the ledger does not settle: what the learner marked, what the log does not
 * record, and which observations have been retracted.
 */

import type {
  DerivedState,
  DomainEvent,
  EvidenceTier,
  GateDecisionRecord,
  ObservationRecord,
  ThreadState,
} from '@bunki/domain';

/**
 * What each tier is, in the learner's language.
 *
 * REQ-DM-06's four tiers, phrased as what produced the observation rather than
 * as a letter. The letters are shown too — an inspector that hid them would
 * make the export and the screen speak different languages.
 */
export const TIER_MEANINGS: Readonly<Record<EvidenceTier, string>> = {
  A: 'You were asked directly and answered under a stated contract.',
  B: 'You produced something because the app asked you to.',
  C: 'You produced something on your own, unprompted.',
  D: 'You met it in passing — reading, listening, seeing it go by.',
};

/** Which tiers can change review timing at all (REQ-DM-06, T-08). */
export const TIERS_THAT_COUNT: readonly EvidenceTier[] = ['A'];

/**
 * Each gate refusal, explained.
 *
 * A closed map keyed by the kernel's own `GateRejectionReason` list. The
 * missing-key fallback in `explainRefusal` is deliberate rather than a default
 * string: a reason this screen has never heard of must read as "this build does
 * not have wording for that", not as a confident sentence about a rule the
 * screen does not know.
 */
export const REFUSAL_EXPLANATIONS: Readonly<Record<string, string>> = {
  not_evidence_class: 'This is not an observation about your recall, so nothing was weighed.',
  not_a_graded_review: 'Only a directly attempted, graded retrieval changes review timing.',
  exposure_is_never_retrieval:
    'Meeting a word in passing is recorded, but it is not you retrieving it, so it never changes review timing.',
  lookup_is_friction_not_a_grade:
    'Looking something up is neither a success nor a failure. It is recorded as friction, not as a result.',
  production_is_not_tier_a:
    'Producing something is recorded, but Phase 0 changes review timing only from a directly asked, graded retrieval.',
  correction_is_not_an_observation:
    'A correction records that an earlier observation should not stand. It is not itself an observation.',
  contract_unknown: 'The contract this answer refers to is not in the log.',
  contract_invalid: 'The contract was recorded but is not scorable, so nothing could grade this.',
  component_never_captured:
    'Nothing in the log links what was asked to something you captured, so there is no thread to attribute it to.',
  component_ambiguous:
    'More than one of your threads could own what was asked, and guessing between them would attribute your work to the wrong one.',
  thread_not_promotion_active:
    'You kept this but did not take it up for study, so nothing here changes review timing. Capture is not a promise.',
  skill_not_activated_by_promotion:
    'This tests a direction you have not taken up on this thread yet.',
  thread_deleted: 'You deleted this thread; observations after that point change nothing.',
  easy_requires_user_confirmation:
    'An “easy” has to be confirmed by you. It was recorded, and it was not counted.',
  evidence_superseded: 'You corrected this observation, so it no longer counts for anything.',
};

export function explainRefusal(reason: string | null): string {
  if (reason === null) return '';
  return (
    REFUSAL_EXPLANATIONS[reason] ??
    `This build has no explanation for the reason “${reason}”. It is shown unexplained rather than described from a guess.`
  );
}

/** One row of the raw chain: an event, and what the kernel made of it. */
export interface ChainRow {
  readonly eventId: string;
  readonly type: string;
  readonly at: string;
  /** `null` for families that carry none — a lookup, a correction, a capture. */
  readonly tier: EvidenceTier | null;
  readonly contractId: string | null;
  /** The kernel's verdict, when it reached the gate at all. */
  readonly decision: GateDecisionRecord | null;
  readonly superseded: boolean;
  readonly supersededByEventId: string | null;
  /** Set on an `EvidenceSuperseded` row: the observation it corrects. */
  readonly supersedesEventId: string | null;
  /** The learner's own words on a correction. */
  readonly correctionNote: string | null;
  readonly correctionReason: string | null;
  /**
   * Was the answer revealed before recall? Read from the **event**, not from
   * `GateDecisionRecord.forcedByReveal`, and the difference is load-bearing.
   *
   * `forcedByReveal` is `revealedBeforeRecall && grade !== 'again'` — a test
   * the gate applies to whatever grade reaches it. `mintReviewGraded` has
   * already rewritten a revealed answer's grade to `again` before that point
   * (T-06), so for every event this product mints, `forcedByReveal` is
   * structurally `false`. It is `true` only for an observation that arrived
   * *un-corrected* from somewhere else — an import, a fixture — and the gate
   * had to apply the rule itself.
   *
   * An inspector that keyed its "the answer was revealed first" line off
   * `forcedByReveal` would therefore never show it, and the learner would read
   * a forced `again` as one they chose. The event's own flag is the durable
   * record, exactly as `mint.ts` says: *"`revealedBeforeRecall: true` **is** the
   * record that the grade was forced."*
   *
   * `null` for families that carry no such field.
   */
  readonly revealedBeforeRecall: boolean | null;
}

/** A state change and the event that caused it (REQ-UI-06's first clause). */
export interface StateChangeRow {
  readonly at: string;
  readonly from: string;
  readonly to: string;
  readonly causeEventId: string;
  readonly origin: string;
}

/** Versions the chain carries, wherever the log records one. */
export interface VersionRow {
  readonly label: string;
  readonly value: string;
  readonly fromEventId: string;
}

export interface StrengthSummary {
  /** Counted, never scored. */
  readonly admittedCount: number;
  readonly recordedCount: number;
  readonly correctedCount: number;
  readonly byTier: Readonly<Record<EvidenceTier, number>>;
  /** One sentence, safe to render. Never a number out of ten. */
  readonly sentence: string;
}

export interface EvidenceChain {
  readonly threadId: string;
  readonly displayText: string;
  readonly promotion: string;
  readonly stateChanges: readonly StateChangeRow[];
  readonly rows: readonly ChainRow[];
  readonly versions: readonly VersionRow[];
  readonly strength: StrengthSummary;
  /** Why this thread is in front of you, in one sentence (REQ-LM-06 default). */
  readonly whyThis: string;
  /** What the ledger does not settle. */
  readonly uncertainties: readonly string[];
  /** Observations a correction can still be applied to. */
  readonly correctable: readonly CorrectableObservation[];
}

/**
 * One correctable observation, described in words.
 *
 * The default surface offers a correction affordance (REQ-LM-06), and an
 * affordance labelled `event-6vsej-0005` is the raw chain leaking into the
 * summary the disclosure exists to keep it out of. The `label` is what the
 * learner reads; the `eventId` is what the command names and what the
 * accessibility label carries, so the exact record stays recoverable without
 * being the headline.
 */
export interface CorrectableObservation {
  readonly eventId: string;
  /** Human-readable: what it was, when, and whether it counted. */
  readonly label: string;
  readonly at: string;
  readonly counted: boolean;
}

const EMPTY_BY_TIER: Readonly<Record<EvidenceTier, number>> = { A: 0, B: 0, C: 0, D: 0 };

function decisionFor(state: DerivedState, eventId: string): GateDecisionRecord | null {
  return state.gateDecisions.find((decision) => decision.eventId === eventId) ?? null;
}

/**
 * The contracts, observations and corrections that belong to one thread.
 *
 * The join is the kernel's, not this module's: an observation names a contract,
 * a contract names a component, and the component id is derived from the
 * capture. Rather than re-deriving that chain here (which would be a second
 * implementation of `component-identity.ts`), the contract ids owned by the
 * thread are read off the gate decisions the kernel already attributed, plus
 * any contract whose target component id is the canonical id of this thread's
 * capture — which the caller supplies, because it holds the capture event.
 */
export interface BuildChainArgs {
  readonly state: DerivedState;
  readonly log: readonly DomainEvent[];
  readonly thread: ThreadState;
  readonly displayText: string;
  /** Canonical component id of this thread's capture, from `@bunki/domain`. */
  readonly componentId: string;
  /** The learner's uncertainty mark, or `null`. App-local (see `store.ts`). */
  readonly uncertaintyMark: string | null;
  /** The sentence describing what the event log actually holds about that mark. */
  readonly uncertaintyLogNote: string;
}

export function buildEvidenceChain(args: BuildChainArgs): EvidenceChain {
  const { state, log, thread, componentId } = args;

  const contractIds = new Set(
    state.contracts
      .filter((contract) => contract.targetComponentId === componentId)
      .map((contract) => contract.contractId),
  );

  const byEventId = new Map(log.map((event) => [event.eventId, event]));

  const belongsToThread = (observation: ObservationRecord): boolean => {
    if (observation.contractId !== null) return contractIds.has(observation.contractId);
    const event = byEventId.get(observation.eventId);
    if (event === undefined) return false;
    if (event.type === 'ExposureLogged') return event.componentIds.includes(componentId);
    if (event.type === 'EvidenceSuperseded') {
      const target = state.observations.find((other) => other.eventId === event.supersededEventId);
      return target !== undefined && belongsToThread(target);
    }
    return false;
  };

  const rows: ChainRow[] = state.observations.filter(belongsToThread).map((observation) => {
    const event = byEventId.get(observation.eventId);
    const isCorrection = event?.type === 'EvidenceSuperseded';
    return {
      eventId: observation.eventId,
      type: observation.type,
      at: observation.at,
      tier: observation.tier,
      contractId: observation.contractId,
      decision: decisionFor(state, observation.eventId),
      superseded: observation.superseded,
      supersededByEventId: observation.supersededByEventId,
      supersedesEventId: isCorrection ? event.supersededEventId : null,
      correctionNote: isCorrection ? event.correction.note : null,
      correctionReason: isCorrection ? event.reason : null,
      revealedBeforeRecall: event?.type === 'ReviewGraded' ? event.revealedBeforeRecall : null,
    };
  });

  const stateChanges: StateChangeRow[] = thread.promotionHistory.map((entry) => ({
    at: entry.at,
    from: entry.from,
    to: entry.to,
    causeEventId: entry.eventId,
    origin: entry.origin,
  }));

  const versions: VersionRow[] = [];
  state.contracts
    .filter((contract) => contractIds.has(contract.contractId))
    .forEach((contract) => {
      const event = byEventId.get(contract.createdByEventId);
      if (event?.type !== 'ContractCreated') return;
      versions.push({
        label: 'Prompt family version',
        value: event.promptFamilyVersion,
        fromEventId: event.eventId,
      });
      versions.push({
        label: 'Contract version',
        value: String(event.contractVersion),
        fromEventId: event.eventId,
      });
      if (event.rubricId !== undefined && event.rubricVersion !== undefined) {
        versions.push({
          label: 'Rubric',
          value: `${event.rubricId} @ ${event.rubricVersion}`,
          fromEventId: event.eventId,
        });
      }
    });
  log.forEach((event) => {
    if (event.type !== 'CandidateAttached') return;
    if (!thread.candidateIds.includes(event.candidateId)) return;
    versions.push({
      label: 'AI model',
      value: `${event.envelope.model} · prompt ${event.envelope.promptFamilyId} @ ${event.envelope.promptVersion}`,
      fromEventId: event.eventId,
    });
  });
  versions.push({
    label: 'Event schema version',
    value: `v${String(state.schemaVersion)}`,
    fromEventId: '—',
  });

  const strength = summariseStrength(rows);

  return {
    threadId: thread.threadId,
    displayText: args.displayText,
    promotion: thread.promotion,
    stateChanges,
    rows,
    versions,
    strength,
    whyThis: whyThisAppeared(thread, rows, args.displayText),
    uncertainties: collectUncertainties(args, rows),
    correctable: rows
      .filter((row) => row.tier !== null && !row.superseded && row.type !== 'EvidenceSuperseded')
      .map(describeCorrectable),
  };
}

/**
 * Name an observation the way a learner would recognise it.
 *
 * Deliberately says whether it counted: "that easy was wrong" and "that review
 * shouldn't have counted" are the two corrections anyone actually wants to
 * make, and a list that hid which rows counted would make the learner open the
 * chain to find out — defeating the disclosure.
 */
export function describeCorrectable(row: ChainRow): CorrectableObservation {
  const counted = row.decision?.admitted === true;
  const what =
    row.type === 'ReviewGraded'
      ? `the answer you gave${row.revealedBeforeRecall === true ? ' after seeing the answer' : ''}`
      : row.type === 'ExposureLogged'
        ? 'meeting it in passing'
        : row.type === 'ProductionObserved'
          ? 'something you produced'
          : `a ${row.type} record`;

  return {
    eventId: row.eventId,
    label: `${what} at ${row.at.slice(11, 16)} — ${counted ? 'counted' : 'not counted'}`,
    at: row.at,
    counted,
  };
}

/**
 * Evidence strength, in words.
 *
 * The counts are the evidence; the sentence is a reading of them that stops at
 * what the ledger supports. Note what it never says: how well the learner knows
 * anything. It says how much was observed, of what kind, and how much of it the
 * kernel let count.
 */
export function summariseStrength(rows: readonly ChainRow[]): StrengthSummary {
  const byTier: Record<EvidenceTier, number> = { ...EMPTY_BY_TIER };
  let admittedCount = 0;
  let recordedCount = 0;
  let correctedCount = 0;

  rows.forEach((row) => {
    if (row.type === 'EvidenceSuperseded') {
      correctedCount += 1;
      return;
    }
    recordedCount += 1;
    if (row.tier !== null) byTier[row.tier] += 1;
    if (row.decision?.admitted === true) admittedCount += 1;
  });

  if (recordedCount === 0) {
    return {
      admittedCount,
      recordedCount,
      correctedCount,
      byTier,
      sentence:
        'No observations yet. Capturing and keeping something records that you met it — it does not record that you recalled it.',
    };
  }

  const tierParts = (Object.keys(byTier) as EvidenceTier[])
    .filter((tier) => byTier[tier] > 0)
    .map((tier) => `${String(byTier[tier])} at tier ${tier}`);

  const countedClause =
    admittedCount === 0
      ? 'None of them changed review timing.'
      : `${String(admittedCount)} of them changed review timing; the rest were recorded and did not.`;

  const correctedClause =
    correctedCount === 0
      ? ''
      : ` ${String(correctedCount)} ${correctedCount === 1 ? 'has' : 'have'} since been corrected by you, and the correction is appended rather than replacing anything.`;

  return {
    admittedCount,
    recordedCount,
    correctedCount,
    byTier,
    sentence: `${String(recordedCount)} observation${recordedCount === 1 ? '' : 's'} recorded (${tierParts.join(', ')}). ${countedClause}${correctedClause}`,
  };
}

/**
 * "Why did this appear?" — REQ-LM-06's first default answer.
 *
 * Grounded in the promotion rung and the ledger, because those are the only two
 * things that actually decide it in Phase 0. A recommendation engine that could
 * give a richer answer does not exist here, and writing the sentence a richer
 * one would produce is how an explanation becomes a story.
 */
export function whyThisAppeared(
  thread: ThreadState,
  rows: readonly ChainRow[],
  displayText: string,
): string {
  const admitted = rows.filter((row) => row.decision?.admitted === true).length;
  switch (thread.promotion) {
    case 'captured':
      return `You captured ${displayText} and have not kept it yet. It is here because you met it, and for no other reason — nothing has been asked of you about it.`;
    case 'keep':
      return `You kept ${displayText}. Keeping resurfaces it when it happens to be useful; it does not put it on any review timing, and nothing here is asked of you on a fixed rhythm.`;
    case 'learn':
      return admitted === 0
        ? `You took ${displayText} up for study, so recognition contracts on it are active. Nothing you have answered has counted yet.`
        : `You took ${displayText} up for study, and ${String(admitted)} answered retrieval${admitted === 1 ? '' : 's'} on it ${admitted === 1 ? 'has' : 'have'} counted. That is the whole reason it is in front of you.`;
    case 'master':
      return `You took ${displayText} up at the level that also activates production and discrimination. Everything asked about it comes from a contract you activated by doing that.`;
    default:
      return `${displayText} is on a promotion rung this build has no wording for; it is shown unexplained rather than described from a guess.`;
  }
}

/**
 * What the ledger does not settle (REQ-LM-06's "uncertainty").
 *
 * Every entry is an absence the log can prove, not a probability. The last one
 * is the honest limit of the whole surface: Phase 0 has no calibration data, so
 * there is no basis for a confidence number and none is offered.
 */
export function collectUncertainties(
  args: BuildChainArgs,
  rows: readonly ChainRow[],
): readonly string[] {
  const out: string[] = [];

  if (args.uncertaintyMark !== null) {
    out.push(`You marked “${args.uncertaintyMark}” as the part you were unsure of.`);
  } else {
    out.push('You have not marked anything about this as uncertain.');
  }
  out.push(args.uncertaintyLogNote);

  const refused = rows.filter(
    (row) => row.decision !== null && !row.decision.admitted && row.type !== 'EvidenceSuperseded',
  );
  if (refused.length > 0) {
    out.push(
      `${String(refused.length)} observation${refused.length === 1 ? '' : 's'} ${refused.length === 1 ? 'was' : 'were'} recorded but not counted. The reason for each is in the chain below.`,
    );
  }

  const corrected = rows.filter((row) => row.superseded).length;
  if (corrected > 0) {
    out.push(
      `${String(corrected)} observation${corrected === 1 ? '' : 's'} ${corrected === 1 ? 'has' : 'have'} been corrected. The original is still in the log — corrections append, they never rewrite.`,
    );
  }

  out.push(
    'How reliable any of this is as a picture of what you know has not been measured. This build records what happened; it does not estimate what you can do, and it will not show you a single number for it.',
  );

  return out;
}
