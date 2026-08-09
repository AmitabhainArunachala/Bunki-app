/**
 * The integration canvas — classifying what happened on it (WP-08; REQ-SCH-06,
 * REQ-UI-05, controller §10.5, T-08).
 *
 * ## The question this file answers
 *
 * A learner reads a passage. They tap a word to see what it means. They fill a
 * blank where the promoted target used to be. They give up and reveal it. One
 * visible experience, several observations — and REQ-UI-05 is explicit that
 * "only declared, genuinely attempted contracts update long-term memory".
 *
 * REQ-SCH-06 is the rule, and it is a *narrow* one. Immersion may replace a
 * standalone review **only** when the immersion experience contains a declared,
 * contract-conforming retrieval of the same memory. Everything else — smooth
 * reading, a tap, a glance — is exposure: tier D, recorded, surfaced, and never
 * scheduled on (T-08). Claude v1's "review-by-use counts as an implicit FSRS
 * review at high grade" was withdrawn in Round 1 and must not be resurrected;
 * this file is where it would have to reappear, so this file is where the door
 * is nailed shut.
 *
 * ## How the narrowness is enforced
 *
 * Two functions, and the split matters. {@link classifyCanvasInteraction} is a
 * pure judgement with no side effects and no minting — it can be unit-tested
 * exhaustively and read in one screen. {@link recordCanvasInteraction} then
 * mints *through the evidence gate's own factory* (`src/evidence/mint.ts`),
 * which stamps the tier rather than accepting one. So the classification decides
 * which of two families is minted, and the family decides the tier; the caller
 * can influence neither. A canvas that wanted to relabel a passage sighting as a
 * review would have to change this file, and changing this file is a visible
 * edit to the file whose entire subject is that it must not.
 *
 * ## The priming rule, made structural
 *
 * REQ-SCH-06: "confirmation probes are deferred so a just-seen form is not
 * 'retrieved' under priming." A canvas cannot honour that with a timer, so it
 * honours it with a precondition: a probe is only eligible when the target was
 * *hidden* at the moment of the attempt. You cannot declare a retrieval of a
 * form the passage is currently showing you. That is what a cloze is, and it is
 * why `targetWasHidden` is a required field rather than an option.
 */

import type { DomainContext } from '../context/index.ts';
import { activatesSkill } from '../contracts/promotion-activation.ts';
import type { RetrievalContract, RetrievalSkill } from '../contracts/retrieval-contract.ts';
import { mintExposureLogged, mintReviewGraded, type ReviewEffort } from '../evidence/index.ts';
import type { ExposureLoggedEvent, ReviewGradedEvent } from '../events/catalog.ts';
import type { PromotionState } from '../events/shared.ts';
import type { ComponentId, ContractId, ExperienceId, ThreadId } from '../primitives.ts';

// ---------------------------------------------------------------------------
// What a canvas can offer
// ---------------------------------------------------------------------------

/**
 * The one contract a canvas may probe, and the facts needed to decide whether a
 * given attempt conformed to it.
 *
 * A canvas offers *at most one* declared probe in Phase 0 — the promoted target
 * the passage was written around (controller §8: the hand-written passage
 * embeds the default canonical target). Offering several would need a selection
 * policy this phase does not have, and a canvas that quietly probed whatever it
 * found would be the "relabelled exposure → false mastery" risk DL-19 names.
 */
export interface CanvasProbeOffer {
  /** Exact validated contract; the v2 minter derives proof from this value. */
  readonly contract: RetrievalContract;
  readonly contractId: ContractId;
  readonly threadId: ThreadId;
  /** The KnowledgeComponent the contract TESTS (REQ-DM-05). */
  readonly targetComponentId: ComponentId;
  readonly skill: RetrievalSkill;
  /** The owning thread's promotion state at this moment (REQ-DM-09). */
  readonly promotion: PromotionState;
  readonly revealAllowed: boolean;
  readonly hintsAllowed: boolean;
  readonly maxHints: number;
}

/** Build an offer from a validated contract and its thread's promotion state. */
export function canvasProbeOffer(
  contract: RetrievalContract,
  args: { readonly threadId: ThreadId; readonly promotion: PromotionState },
): CanvasProbeOffer {
  return {
    contract,
    contractId: contract.contractId,
    threadId: args.threadId,
    targetComponentId: contract.targetComponentId,
    skill: contract.skill,
    promotion: args.promotion,
    revealAllowed: contract.revealPolicy.revealAllowed,
    hintsAllowed: contract.hintPolicy.hintsAllowed,
    maxHints: contract.hintPolicy.maxHints,
  };
}

// ---------------------------------------------------------------------------
// What the learner did
// ---------------------------------------------------------------------------

/**
 * The interaction kinds a Phase-0 canvas produces.
 *
 * Only the first two can *ever* be a probe, and even then only under the
 * conditions below. `tap` and `read` have no probe path at all — not a path that
 * is checked and fails, a path that does not exist.
 */
export const CANVAS_INTERACTION_KINDS = ['cloze_attempt', 'reveal', 'tap', 'read'] as const;
export type CanvasInteractionKind = (typeof CANVAS_INTERACTION_KINDS)[number];

/** Kinds that can reach the probe branch at all. */
const RETRIEVAL_KINDS: readonly CanvasInteractionKind[] = Object.freeze([
  'cloze_attempt',
  'reveal',
]);

/**
 * What the learner produced on a cloze.
 *
 * `revealedBeforeRecall` is not optional and is not inferred. It is the field
 * T-06 turns on, and a canvas that could omit it would be a canvas that could
 * forget to mention that the answer was on screen.
 */
export interface CanvasProbeAttempt {
  readonly response: string;
  readonly effort: ReviewEffort;
  readonly latencyMs: number;
  readonly hintsUsed: number;
  readonly revealedBeforeRecall: boolean;
  /** REQ-DM-07: `easy` is never inferred. Absent means it was not confirmed. */
  readonly userConfirmedEasy?: true | undefined;
}

export interface CanvasInteraction {
  /** The canvas itself — the seed passage id. Rides on every exposure. */
  readonly experienceId: ExperienceId;
  readonly kind: CanvasInteractionKind;
  /**
   * Everything this interaction touched, in canvas order. Never empty: an
   * interaction that touched nothing is not an interaction.
   */
  readonly componentIds: readonly ComponentId[];
  /** The contract the learner declared the attempt under, if they declared one. */
  readonly declaredContractId?: ContractId | null | undefined;
  /**
   * Was the target hidden at the moment of the attempt? See the priming rule in
   * this file's header. Required, so a caller has to answer it.
   */
  readonly targetWasHidden: boolean;
  readonly attempt?: CanvasProbeAttempt | undefined;
}

// ---------------------------------------------------------------------------
// The judgement
// ---------------------------------------------------------------------------

/**
 * Every way an interaction fails to be a declared probe.
 *
 * A closed list with one entry per reason, for the same purpose as the evidence
 * gate's: the inspector renders "this did not count, and here is which rule said
 * so" (REQ-UI-06), and a new demotion path cannot appear without a name.
 */
export const CANVAS_EXPOSURE_REASONS = [
  'not_a_retrieval_attempt',
  'no_declared_contract',
  'canvas_offers_no_probe',
  'declared_contract_is_not_the_offered_one',
  'contract_does_not_test_a_touched_component',
  'promotion_does_not_activate_this_contract',
  'target_was_already_visible',
  'reveal_not_permitted_by_this_contract',
  'hints_exceeded_the_contract_budget',
  'no_attempt_recorded',
] as const;

export type CanvasExposureReason = (typeof CANVAS_EXPOSURE_REASONS)[number];

/** Human-readable form of each reason, for the canvas and the inspector. */
export const CANVAS_EXPOSURE_EXPLANATIONS: Readonly<Record<CanvasExposureReason, string>> =
  Object.freeze({
    not_a_retrieval_attempt:
      'Reading or tapping is exposure — the form appeared, nobody retrieved anything (REQ-SCH-06).',
    no_declared_contract:
      'Nothing was declared, so there is no rule this could have been scored against (REQ-SCH-06).',
    canvas_offers_no_probe: 'This canvas offers no declared probe, so nothing here can be one.',
    declared_contract_is_not_the_offered_one:
      'The declared contract is not the one this canvas offers; a probe counts for its exact contract or not at all.',
    contract_does_not_test_a_touched_component:
      'The declared contract tests a component this interaction did not touch.',
    promotion_does_not_activate_this_contract:
      'The thread’s promotion state does not activate this contract, so it schedules nothing (REQ-DM-09).',
    target_was_already_visible:
      'The form was on screen, so this would be recognition under priming rather than retrieval (REQ-SCH-06).',
    reveal_not_permitted_by_this_contract:
      'This contract does not permit revealing, so the attempt did not conform to it.',
    hints_exceeded_the_contract_budget:
      'More hints were taken than the contract allows, so the attempt did not conform to it.',
    no_attempt_recorded:
      'No grade, latency or hint record arrived, and REQ-SCH-06 requires all of them for an embedded probe to count.',
  });

export type CanvasClassification =
  | {
      readonly kind: 'declared_probe';
      readonly contractId: ContractId;
      readonly threadId: ThreadId;
      /** Always `'embedded'` here — that is what makes it *this* kind of probe. */
      readonly probeContext: 'embedded';
    }
  | {
      readonly kind: 'exposure';
      readonly reason: CanvasExposureReason;
      readonly detail: string;
    };

const exposure = (
  reason: CanvasExposureReason,
): Extract<CanvasClassification, { kind: 'exposure' }> => ({
  kind: 'exposure',
  reason,
  detail: CANVAS_EXPOSURE_EXPLANATIONS[reason],
});

/**
 * Decide whether one canvas interaction is a declared probe or exposure.
 *
 * Pure. Every branch returns a named reason rather than a bare `false`, and the
 * conditions are checked in the order a reader would ask them: was this even a
 * retrieval, did it name a contract, is that the contract on offer, does the
 * contract test what was touched, is the thread promoted for it, was the form
 * hidden, and did the attempt stay inside the contract's own hint and reveal
 * policy.
 *
 * The last two are the ones worth defending. A contract that forbids revealing,
 * revealed anyway, has not been conformed to — and REQ-SCH-06's whole clause is
 * "contract-conforming". Demoting to exposure loses a signal, which is the
 * conservative direction: an over-counted review corrupts a schedule, an
 * under-counted one only delays it.
 */
export function classifyCanvasInteraction(
  interaction: CanvasInteraction,
  offer: CanvasProbeOffer | null,
): CanvasClassification {
  if (!RETRIEVAL_KINDS.includes(interaction.kind)) return exposure('not_a_retrieval_attempt');

  const declaredContractId = interaction.declaredContractId ?? null;
  if (declaredContractId === null) return exposure('no_declared_contract');
  if (offer === null) return exposure('canvas_offers_no_probe');
  if (declaredContractId !== offer.contractId) {
    return exposure('declared_contract_is_not_the_offered_one');
  }
  if (!interaction.componentIds.includes(offer.targetComponentId)) {
    return exposure('contract_does_not_test_a_touched_component');
  }
  if (!activatesSkill(offer.promotion, offer.skill)) {
    return exposure('promotion_does_not_activate_this_contract');
  }
  if (!interaction.targetWasHidden) return exposure('target_was_already_visible');

  const attempt = resolveAttempt(interaction);
  if (attempt === null) return exposure('no_attempt_recorded');
  if (attempt.revealedBeforeRecall && !offer.revealAllowed) {
    return exposure('reveal_not_permitted_by_this_contract');
  }
  if (attempt.hintsUsed > (offer.hintsAllowed ? offer.maxHints : 0)) {
    return exposure('hints_exceeded_the_contract_budget');
  }

  return {
    kind: 'declared_probe',
    contractId: offer.contractId,
    threadId: offer.threadId,
    probeContext: 'embedded',
  };
}

/**
 * The attempt an interaction records.
 *
 * A `reveal` with no attempt attached is still a complete observation: the
 * learner asked for the answer without producing one. It is given the only
 * grade that can honestly describe that — `again`, with
 * `revealedBeforeRecall: true` — rather than being dropped. Dropping it would
 * mean the one interaction that most clearly shows a memory is not there is the
 * one the ledger has nothing about.
 */
function resolveAttempt(interaction: CanvasInteraction): CanvasProbeAttempt | null {
  return interaction.attempt ?? null;
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

export interface CanvasRecordOptions {
  readonly idempotencyKey: string;
}

export type CanvasRecord =
  | {
      readonly classification: Extract<CanvasClassification, { kind: 'declared_probe' }>;
      readonly event: ReviewGradedEvent;
    }
  | {
      readonly classification: Extract<CanvasClassification, { kind: 'exposure' }>;
      readonly event: ExposureLoggedEvent;
    };

/**
 * Classify an interaction and mint the one event it produced.
 *
 * Both branches go through `src/evidence/mint.ts`, which is the sole factory for
 * evidence-class events (REQ-ARCH-04). Two consequences follow for free and are
 * the reason it is done this way:
 *
 *   - the **tier is stamped, not passed** — `mintReviewGraded` is tier A and
 *     `mintExposureLogged` is tier D, and this file cannot say otherwise;
 *   - **reveal-before-recall is corrected at the source** — a probe minted with
 *     `revealedBeforeRecall: true` comes back carrying `grade: "again"` whatever
 *     the learner pressed (T-06), and `admitToScheduler` applies the same rule
 *     again on the way to FSRS.
 *
 * Whether the minted probe then *reaches* the scheduler is not decided here. It
 * is the gate's call at replay, against the whole log — which is the only place
 * that can see supersessions, tombstones and promotion history.
 */
export function recordCanvasInteraction(
  context: DomainContext,
  interaction: CanvasInteraction,
  offer: CanvasProbeOffer | null,
  options: CanvasRecordOptions,
): CanvasRecord {
  const classification = classifyCanvasInteraction(interaction, offer);

  if (classification.kind === 'exposure') {
    return {
      classification,
      event: mintExposureLogged(
        context,
        {
          componentIds: [...interaction.componentIds],
          experienceId: interaction.experienceId,
        },
        { idempotencyKey: options.idempotencyKey },
      ),
    };
  }

  // `resolveAttempt` cannot return null on this branch — the classifier already
  // rejected that case by name — but the fallback is spelled out rather than
  // asserted, because a cast here would be a cast on the path that mints tier-A
  // evidence.
  const attempt = resolveAttempt(interaction);
  if (attempt === null || offer === null) {
    const refusal = exposure('no_attempt_recorded');
    return {
      classification: refusal,
      event: mintExposureLogged(
        context,
        {
          componentIds: [...interaction.componentIds],
          experienceId: interaction.experienceId,
        },
        { idempotencyKey: options.idempotencyKey },
      ),
    };
  }

  const confirmation =
    attempt.userConfirmedEasy === true ? { userConfirmedEasy: true as const } : {};

  return {
    classification,
    event: mintReviewGraded(
      context,
      {
        contract: offer.contract,
        response: attempt.response,
        effort: attempt.effort,
        latencyMs: attempt.latencyMs,
        hintsUsed: attempt.hintsUsed,
        revealedBeforeRecall: attempt.revealedBeforeRecall,
        probeContext: 'embedded',
        ...confirmation,
      },
      { idempotencyKey: options.idempotencyKey },
    ),
  };
}

/**
 * The promise REQ-SCH-06 puts in front of the learner, verbatim.
 *
 * Rendered on the canvas. The requirement also states what may *not* be said:
 * the claim that embedded probes reduce standalone review burden is an untested
 * experiment (H4) and may not appear in product copy until it passes
 * (REQ-GATE-03). There is deliberately no second string here for it.
 */
export const CANVAS_IMMERSION_PROMISE =
  'Your immersion contributes encounters and can contain real reviews; the system verifies which is which.';
