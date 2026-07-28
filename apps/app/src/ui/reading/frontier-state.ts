/**
 * What puts a word on *this* learner's frontier (Campaign E, lane B4).
 *
 * Pure, and deliberately structural rather than importing the store: nothing in
 * `src/ui` may reach the write path (`test/design-vocabulary.test.ts` walks this
 * directory for it), and a mark rule that can be evaluated on a plain object is
 * a rule a test can enumerate.
 *
 * ## The rule this file exists to keep
 *
 * Frozen §8 and §10.4: reading surfaces render clean, and only Trace-unknown or
 * fragile words carry a mark — "personal frontier, never global-level rainbow
 * underlining". Todaii underlines nearly every content word by JLPT level; the
 * operator's verdict is that when everything is highlighted nothing is. So the
 * question a mark answers is never "how hard is this word" and always "what does
 * *this* build hold about *this* learner and this word".
 *
 * ## What the answer is made of, and what it is not
 *
 * The three inputs below are the whole of it, and each one is something the app
 * genuinely knows:
 *
 *   - **no thread at all** — the learner has never captured this word, so the
 *     log holds nothing about it. That is the honest reading of "no evidence
 *     yet", and it is the `frontier` mark.
 *   - **a thread whose capture carried an uncertainty mark** — the learner
 *     themselves said they were not sure of it. That is the `fragile` mark.
 *     `markRecordedInLog` is checked as well as `uncertainty`, because a
 *     reloaded thread keeps the *fact* of the mark and loses the dimension
 *     (WP05-D2), and a word the learner flagged should not stop being flagged
 *     because the page was refreshed.
 *   - **a thread with no uncertainty mark** — met, and not flagged. No mark.
 *
 * **What is deliberately absent is a decay estimate.** A projection that said
 * "you are losing this" would be the honest source for `fragile`, and this build
 * has no such projection to read — the memory model lives in `@bunki/domain`
 * behind the evidence gate and nothing in the app may compute a second opinion
 * about it (controller §5). So `fragile` here means the learner's own
 * uncertainty mark and nothing else, the screen says so in as many words, and
 * the gap is recorded rather than papered over with a plausible-looking guess.
 */

import { type FrontierMarkKind } from '../frontier-marks.ts';

/** Everything the mark rule is allowed to look at, for one word. */
export interface LearnerKnowledge {
  /** A capture exists for this word in this learner's log. */
  readonly captured: boolean;
  /** The learner flagged it uncertain — on the capture, or afterwards. */
  readonly flaggedUncertain: boolean;
}

/**
 * What each mark is derived from, in one line, in the learner's own words.
 *
 * Rendered as the surface's legend and as the basis line inside the lookup, so
 * the sentence a learner reads about a mark is the same sentence the rule is
 * written in. A legend written separately from the rule is the artefact that
 * goes stale first.
 *
 * Phrased as a clause rather than a sentence, and with no noun of its own, so
 * the same string reads correctly in both places: "a hairline in the accent —
 * nothing in your log mentions it yet" under the passage, and "線路 — nothing in
 * your log mentions it yet" inside the lookup. A sentence written for one of
 * those reads as a mistake in the other.
 */
export const FRONTIER_MARK_BASIS: Readonly<Record<FrontierMarkKind, string>> = {
  none: 'kept, and not flagged, so it renders clean',
  frontier: 'nothing in your log mentions it yet',
  fragile: 'you kept it and marked it uncertain',
};

/** The mark this learner's own record puts on this word. */
export function markFor(knowledge: LearnerKnowledge): FrontierMarkKind {
  if (!knowledge.captured) return 'frontier';
  return knowledge.flaggedUncertain ? 'fragile' : 'none';
}
