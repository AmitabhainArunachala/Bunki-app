/**
 * The journey's own history (Campaign E, lane B5).
 *
 * Three questions, in the order a learner asks them:
 *
 *   1. **What opened this?** One miss, named — the event, the contract, the
 *      instant, and the grade the gate counted.
 *   2. **What has been tried?** The probe answers given, the road taken, and
 *      every answer since, with the gate's verdict on each.
 *   3. **What is left?** The condition that is still open, and the roads that
 *      are still open.
 *
 * ## Why entries are typed rather than pre-formatted strings
 *
 * A history of sentences is a history nothing can assert against. Each entry
 * carries its kind and its facts, and the component turns those into copy — so
 * `test/journey-surface.test.ts` can check that a `left` entry never appears
 * before the `entered` it follows, and that no entry claims an instant the
 * ledger does not hold.
 *
 * ## What is deliberately absent
 *
 * No duration, no count of visits, no "days active", no streak of any shape.
 * The round-2 research is explicit that a counter of activity is a streak under
 * another name, and the one number this history does carry — how many answers
 * were offered to the condition — is a property of the *evidence*, not of the
 * learner's diligence.
 */

import type { BranchFamily, IsoInstant, JourneyState } from '@bunki/domain';
import { BRANCH_FAMILY_LABELS } from '@bunki/domain';

import type { OpenCondition } from './open-conditions.ts';

export const JOURNEY_EVENT_KINDS = [
  'opened',
  'probe_answered',
  'entered',
  'answer_offered',
  'rejoined',
  'left',
] as const;

export type JourneyEventKind = (typeof JOURNEY_EVENT_KINDS)[number];

export interface JourneyHistoryEntry {
  readonly kind: JourneyEventKind;
  /** When it happened, when the ledger records an instant. `null` otherwise. */
  readonly at: IsoInstant | null;
  /** The headline. One clause, no adjectives. */
  readonly what: string;
  /** The fact behind it — an event id, a contract, a clause that was missed. */
  readonly detail: string;
  /** The route family this entry is about, when it is about one. */
  readonly family: BranchFamily | null;
}

/**
 * The whole history of one journey, oldest first.
 *
 * Oldest first because this is a road: the point of showing it is that the
 * learner can see where they set out from. The open condition's own list of
 * considered answers is newest-first, because that one is a working list rather
 * than a record.
 */
export function journeyHistory(
  state: JourneyState,
  condition: OpenCondition,
): readonly JourneyHistoryEntry[] {
  const entries: JourneyHistoryEntry[] = [];
  const { stumble } = state.compiled;

  entries.push({
    kind: 'opened',
    at: stumble.at,
    what: 'A retrieval did not come back.',
    // The gate's word, and the event that carries it. Both are checkable in the
    // evidence inspector, which is why they are named rather than summarised.
    detail: `The evidence gate counted ${stumble.effectiveGrade} on ${stumble.contractId}, in ${stumble.eventId}. This branch is a consequence of that one fact.`,
    family: null,
  });

  state.answers.forEach((answer) => {
    const probe = state.compiled.probes.find((entry) => entry.id === answer.probeId);
    entries.push({
      kind: 'probe_answered',
      at: null,
      what: `You answered “${answer.outcome}”.`,
      detail:
        probe === undefined
          ? `To a question this journey no longer offers (${answer.probeId}). It routes nothing.`
          : `To: ${probe.question} A routing answer, never a graded one — nothing about it reaches the ledger.`,
      family: null,
    });
  });

  if (state.chosen !== null && state.enteredAt !== null) {
    entries.push({
      kind: 'entered',
      at: state.enteredAt,
      what: `You took the ${BRANCH_FAMILY_LABELS[state.chosen]} road.`,
      detail: `The roads you did not take stay on the fork, dimmed. ${String(state.untaken.length)} of them.`,
      family: state.chosen,
    });
  }

  /*
    The answers offered to the condition, oldest first here.

    `condition.considered` is newest-first for the working panel, so it is
    reversed rather than re-derived — one source, two orders, and no second
    filter that could disagree about which answers were considered at all.
  */
  [...condition.considered].reverse().forEach((verdict) => {
    entries.push({
      kind: 'answer_offered',
      at: verdict.at,
      what: verdict.qualifies
        ? 'An answer met every clause of the condition.'
        : 'An answer was offered and did not meet every clause.',
      detail: verdict.qualifies
        ? `${verdict.eventId} satisfied all five clauses.`
        : `${verdict.eventId} is still open on: ${verdict.openClauses.join(', ')}.`,
      family: null,
    });
  });

  if (state.phase === 'rejoined' && state.rejoinedAt !== null) {
    entries.push({
      kind: 'rejoined',
      at: state.rejoinedAt,
      what: 'The main line, rejoined.',
      detail: `Closed by ${state.rejoinedByEventIds.join(', ')}. The condition was met; nothing was tapped to end it.`,
      family: state.chosen,
    });
  }

  if (state.phase === 'left') {
    entries.push({
      kind: 'left',
      at: null,
      what: 'You stepped off this road.',
      // Deliberately not "abandoned". The domain has no such phase, for the
      // reason its own header gives: a learner who closes a branch has told you
      // nothing about their memory.
      detail:
        'The miss is still in the ledger and nothing was added anywhere. The road stays on the fork if you want it later.',
      family: state.chosen,
    });
  }

  return Object.freeze(entries);
}

/**
 * The one-line account of where this journey stands.
 *
 * Phase words, never progress words. "In a branch" is a position; "42% repaired"
 * would be a scalar over one contract's evidence, which is the shape REQ-LM-03
 * forbids even when it is about one thing.
 */
export const PHASE_LINES: Readonly<Record<JourneyState['phase'], string>> = Object.freeze({
  diagnosing: 'At the fork. Nothing has been chosen, and nothing has to be.',
  in_branch: 'On a road. It ends when the condition below is met.',
  rejoined: 'Back on the main line.',
  left: 'Off this road. The fork is still there.',
});
