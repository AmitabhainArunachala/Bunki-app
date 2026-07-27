/**
 * Which promotion states activate which contracts (WP-06; REQ-DM-09, DL-05).
 *
 * REQ-DM-09 is a four-rung ladder and only two rungs schedule anything:
 *
 *   - **captured** — every capture lands here. No contracts, no scheduling.
 *     This is T-02 in one line: capture is not card creation (DL-05).
 *   - **keep** — "retain and resurface opportunistically; **no mandatory
 *     SRS**". The default save action. Still no scheduling.
 *   - **learn** — "activate selected recognition/reading/sense contracts".
 *   - **master** — "add production/discrimination contracts with a higher
 *     workload budget".
 *
 * The skill lists below are that sentence, made checkable. `learn` activates
 * the three recognition/reading/sense directions; `master` adds the two
 * production/discrimination ones on top. A `meaning_to_production` contract on
 * a thread the learner only promoted to `learn` is therefore not schedulable —
 * which is the point of the rung existing at all. Reading the rule off a table
 * rather than a predicate means changing it later is a visible edit to data.
 *
 * Nothing here consults FSRS. Activation says a contract *may* be scheduled;
 * whether a particular observation reaches the scheduler is the gate's call.
 */

import { PROMOTION_STATES, type PromotionState } from '../events/shared.ts';
import type { RetrievalSkill } from './retrieval-contract.ts';

/** Recognition, reading, and sense directions — REQ-DM-09.2. */
const LEARN_SKILLS = [
  'form_to_meaning',
  'orthography_to_reading',
  'audio_to_meaning',
] as const satisfies readonly RetrievalSkill[];

/** Production and discrimination — REQ-DM-09.3, added on top of `learn`. */
const MASTER_ONLY_SKILLS = [
  'meaning_to_production',
  'discrimination',
] as const satisfies readonly RetrievalSkill[];

export const SKILLS_ACTIVATED_BY_PROMOTION: Readonly<
  Record<PromotionState, readonly RetrievalSkill[]>
> = Object.freeze({
  captured: Object.freeze([]),
  keep: Object.freeze([]),
  learn: Object.freeze([...LEARN_SKILLS]),
  master: Object.freeze([...LEARN_SKILLS, ...MASTER_ONLY_SKILLS]),
});

/** The rungs on which any contract at all may be scheduled. */
export const PROMOTION_ACTIVE_STATES: readonly PromotionState[] = Object.freeze(
  PROMOTION_STATES.filter((state) => SKILLS_ACTIVATED_BY_PROMOTION[state].length > 0),
);

export function isPromotionActive(state: PromotionState): boolean {
  return SKILLS_ACTIVATED_BY_PROMOTION[state].length > 0;
}

/** Does this promotion state activate contracts testing this skill? */
export function activatesSkill(state: PromotionState, skill: RetrievalSkill): boolean {
  return SKILLS_ACTIVATED_BY_PROMOTION[state].includes(skill);
}

// ---------------------------------------------------------------------------
// Rate limiting — recorded as a seam, not implemented (controller §2, §18 WP-06)
// ---------------------------------------------------------------------------

/**
 * The shape a rate limiter will have when one exists.
 *
 * REQ-DM-09 says promotion is "explicit **and rate-limited**", with priority a
 * blended personal-utility signal (REQ-JRN-06) capped by FSRS-projected
 * workload × real time budget. None of that is Phase 0: REQ-JRN-06's utility
 * model, the intake/nomination queue, and workload projection are all outside
 * the closed loop (controller §2), and DL-36's enforcement needs workload
 * simulation that has not been run.
 *
 * What Phase 0 owes the requirement is that promotion cannot happen *by
 * accident* — and that is already structural: `ThreadPromotionChanged.origin`
 * has only `user` and `nomination_accepted`, both of which mean a human acted,
 * and there is deliberately no `automatic` member (WP-02, `events/shared.ts`).
 * The missing piece is throughput limiting, and inventing a cap here would mean
 * shipping an unmeasured workload policy as if it were a decision.
 *
 * So the interface is declared and left unimplemented, in the same style as
 * `PHASE0_SEAMS`: a later WP fills it, and until then the absence is visible.
 */
export interface PromotionRateLimitPolicy {
  /**
   * @param request  the promotion the learner is asking for
   * @param workload the caller's projected review workload, in whatever unit
   *                 the workload model settles on — deliberately not fixed here
   * @returns whether the promotion may proceed now, and why not if not
   */
  evaluate(request: PromotionRequest, workload: ProjectedWorkload): RateLimitDecision;
}

export interface PromotionRequest {
  readonly threadId: string;
  readonly from: PromotionState;
  readonly to: PromotionState;
}

export interface ProjectedWorkload {
  readonly dueContractCount: number;
  readonly timeBudgetMin: number;
}

export type RateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly retryAfter: string | null };

export interface Phase0RateLimitSeam {
  readonly capability: string;
  readonly owner: string;
  readonly whatPhase0Guarantees: string;
  readonly whatIsMissing: string;
  readonly anchors: readonly string[];
}

/** The seam, as data, so a verifier can read it instead of inferring it. */
export const PROMOTION_RATE_LIMIT_SEAM: Phase0RateLimitSeam = Object.freeze({
  capability: 'Promotion rate limiting (intake/nomination queue and workload cap)',
  owner: 'post-Phase-0 (REQ-JRN-06 utility model + DL-36 workload simulation)',
  whatPhase0Guarantees:
    'Promotion is explicit: it happens only through ThreadPromotionChanged, whose origin is user or nomination_accepted — both human acts. Repeated encounters and lookup friction are recorded as nomination signals and can never promote on their own (REQ-DM-09).',
  whatIsMissing:
    'Throughput limiting: priority blended from personal utility (REQ-JRN-06) and capped by FSRS-projected workload x real time budget (DL-36). Implementing a cap now would ship an unmeasured workload policy as a decision; the interface PromotionRateLimitPolicy is declared so the seam is typed rather than merely absent.',
  anchors: ['REQ-DM-09', 'DL-05', 'DL-36', 'REQ-JRN-06', 'controller §2'],
});
