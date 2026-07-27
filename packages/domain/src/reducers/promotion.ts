/**
 * The promotion state machine (WP-02; REQ-DM-09, DL-05).
 *
 * `captured → keep | learn | master`, and back down again. Four states, one
 * event, no hidden transitions.
 *
 * Three decisions worth stating, because each rejects something a lenient
 * reducer would have accepted:
 *
 * **The event declares its own `from`, and it must match.** A
 * `ThreadPromotionChanged{from: 'captured'}` applied to a thread already in
 * `learn` is not a promotion the log can honour — it was authored against a
 * state that no longer exists, so applying it would silently overwrite a
 * decision the learner made in between. Rejecting turns a lost-update race into
 * a visible error.
 *
 * **`from === to` is rejected.** An event that changes nothing is not a
 * harmless no-op here; it is a claim about a change that did not happen, and it
 * would appear in the inspector as a promotion the learner never made.
 *
 * **Demotion is legal.** REQ-DM-09 rate-limits promotion and says nominations
 * never promote irreversibly. A ladder that only went up would make a mistaken
 * promotion permanent, which is the review-debt treadmill DL-05 exists to
 * avoid.
 *
 * What is *not* here: whether a state activates scheduling. "Learn activates
 * FSRS contracts" is the evidence gate's and scheduler's business (WP-06, T-02)
 * and deciding it here would put a second scheduler policy in the tree.
 */

import { PromotionTransitionError } from '../errors.ts';
import { PROMOTION_STATES, type PromotionState } from '../events/shared.ts';
import type { ThreadPromotionChangedEvent } from '../events/catalog.ts';

/** Every thread begins here (REQ-DM-09: "every capture creates a thread in Captured"). */
export const INITIAL_PROMOTION_STATE: PromotionState = 'captured';

/**
 * Legal targets per state: every other state. Written out rather than derived
 * from "anything but self" so that narrowing it later (say, forbidding
 * `captured → master` in one step) is a visible edit to a table, not a change
 * of logic buried in a predicate.
 */
export const LEGAL_PROMOTION_TRANSITIONS: Readonly<
  Record<PromotionState, readonly PromotionState[]>
> = {
  captured: ['keep', 'learn', 'master'],
  keep: ['captured', 'learn', 'master'],
  learn: ['captured', 'keep', 'master'],
  master: ['captured', 'keep', 'learn'],
};

export function isLegalPromotionTransition(from: PromotionState, to: PromotionState): boolean {
  return LEGAL_PROMOTION_TRANSITIONS[from].includes(to);
}

/**
 * Apply one promotion event to one thread's promotion state.
 *
 * Pure and total: for any (state, event) pair it either returns the next state
 * or throws `PromotionTransitionError`. It never returns the input unchanged as
 * a way of ignoring an event.
 */
export function promotionReducer(
  state: PromotionState,
  event: ThreadPromotionChangedEvent,
): PromotionState {
  if (event.from !== state) {
    throw new PromotionTransitionError({
      threadId: event.threadId,
      declaredFrom: event.from,
      actualFrom: state,
      to: event.to,
      eventId: event.eventId,
      reason: `the event was authored against promotion state ${event.from}`,
    });
  }

  if (event.from === event.to) {
    throw new PromotionTransitionError({
      threadId: event.threadId,
      declaredFrom: event.from,
      actualFrom: state,
      to: event.to,
      eventId: event.eventId,
      reason: 'a promotion event must change the state',
    });
  }

  if (!isLegalPromotionTransition(event.from, event.to)) {
    throw new PromotionTransitionError({
      threadId: event.threadId,
      declaredFrom: event.from,
      actualFrom: state,
      to: event.to,
      eventId: event.eventId,
      reason: `${event.from} -> ${event.to} is not in the promotion ladder (${PROMOTION_STATES.join(' | ')})`,
    });
  }

  return event.to;
}
