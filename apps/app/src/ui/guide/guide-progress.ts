/**
 * Where the learner actually is, from the event log (Campaign E / B6).
 *
 * The guide does not ask the learner where they are and the learner does not
 * tell it. A station is **reached** when a thread exists for its word and
 * **passed** when the learner explicitly took that thread up for study — both
 * facts the log already holds, both put there by a person doing something.
 *
 * The whole module is one pure function over an `AppSnapshot`, so the position
 * on screen and the position in a test come from the same code, and neither can
 * be a number somebody typed.
 *
 * ## Matching
 *
 * A thread is matched to a station by `lexemeId` when the capture resolved to
 * one, and by its normalised display text otherwise. The second is what makes a
 * capture typed straight into the search box count: the store already
 * normalises `targetKey` for exactly this kind of re-encounter matching, so
 * this reuses that key rather than inventing a second notion of "the same word".
 */

import type { RouteWaypointCandidate, WaypointProgress } from '@bunki/domain';

import { findLexemeByHeadword } from '../../data/catalog.ts';
import type { AppSnapshot, ThreadView } from '../../state/store.ts';

/** The promotion states that mean the learner took a word up for study. */
const TAKEN_UP = new Set(['learn', 'master']);

const fold = (text: string): string => text.trim().normalize('NFKC');

function matches(thread: ThreadView, candidate: RouteWaypointCandidate): boolean {
  const lexeme = findLexemeByHeadword(candidate.targetForm);
  if (lexeme !== null && thread.lexemeId === lexeme.id) return true;
  return fold(thread.targetKey) === fold(candidate.targetForm);
}

/**
 * One progress entry per station, always, in the road's own order.
 *
 * A station with no thread is `{ reached: false, passed: false }` rather than
 * absent, so the road's length never depends on what the learner has done.
 */
export function progressFromSnapshot(
  snapshot: AppSnapshot,
  candidates: readonly RouteWaypointCandidate[],
): readonly WaypointProgress[] {
  return candidates.map((candidate) => {
    const threads = snapshot.threads.filter((thread) => matches(thread, candidate));
    return {
      waypointId: candidate.id,
      reached: threads.length > 0,
      passed: threads.some((thread) => TAKEN_UP.has(thread.state.promotion)),
    };
  });
}

/** Station ids the learner has taken up, for the short-term plan to skip. */
export function takenUpWaypointIds(progress: readonly WaypointProgress[]): readonly string[] {
  return progress.filter((entry) => entry.passed).map((entry) => entry.waypointId);
}

/**
 * How the two states are worded on screen.
 *
 * Kept beside the predicate that produces them so the sentence cannot drift
 * from the rule. "Met" and "taken up" are the learner's own two acts; neither
 * is a claim about recall, and neither is produced by the guide.
 */
export function progressWord(entry: WaypointProgress | undefined): string {
  if (entry === undefined || !entry.reached) return 'not met yet';
  return entry.passed ? 'taken up for study' : 'met, not taken up';
}
