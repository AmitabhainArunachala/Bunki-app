/**
 * What a loaded stage says about itself (lane L1).
 *
 * Every line here is derived from the generated log's own tally, not written
 * beside it. That is the same rule the map's accumulation card follows and it
 * exists for the same reason: a description written by hand goes stale the
 * first time a script is re-tuned, and a switcher whose card claimed "a few
 * hundred contracts" over a stage that had eleven would be exactly the kind of
 * unchecked sentence this project keeps finding in verification rounds.
 *
 * Nothing here is a claim about a person. The numbers describe a log.
 */

import type { ScriptedLearnerSummary } from '@bunki/domain';

/** One fact about a stage, as a surface prints it. */
export interface DemoFact {
  readonly label: string;
  readonly value: string;
}

const plural = (count: number, one: string, many: string): string =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

/**
 * The headline facts, in the order that tells the story.
 *
 * Encounters first, because that is what the learner did; contracts second,
 * because that is what they chose to study; the ledger third, because that is
 * what the system concluded. A count of refusals is included on purpose — a
 * demonstration that showed only the reviews that counted would be showing a
 * ledger that cannot answer "why did that one not count", which is the question
 * REQ-UI-06 exists for.
 */
export function demoFacts(summary: ScriptedLearnerSummary): readonly DemoFact[] {
  const facts: DemoFact[] = [
    { label: 'met', value: plural(summary.threadCount, 'word', 'words') },
    { label: 'studying', value: plural(summary.contractCount, 'contract', 'contracts') },
    { label: 'answered', value: plural(summary.admittedReviewCount, 'probe', 'probes') },
  ];
  if (summary.lapseCount > 0) {
    facts.push({ label: 'forgotten', value: plural(summary.lapseCount, 'time', 'times') });
  }
  if (summary.refusedReviewCount > 0) {
    facts.push({
      label: 'not counted',
      value: plural(summary.refusedReviewCount, 'answer', 'answers'),
    });
  }
  if (summary.metOnceCount > 0) {
    facts.push({
      label: 'met once, never studied',
      value: plural(summary.metOnceCount, 'word', 'words'),
    });
  }
  return facts;
}

/**
 * The sittings, by how they ended.
 *
 * Named rather than summed. This project has already shipped a build in which
 * every session was recorded `abandoned` 16 times out of 16, and the way that
 * survived review was that nothing ever printed the breakdown.
 */
export function demoSittings(summary: ScriptedLearnerSummary): string {
  const parts: string[] = [];
  const { completed, budget_exhausted: exhausted, abandoned } = summary.sessionCounts;
  if (completed > 0) parts.push(`${String(completed)} finished`);
  if (exhausted > 0) parts.push(`${String(exhausted)} out of time`);
  if (abandoned > 0) parts.push(`${String(abandoned)} left`);
  return parts.length === 0 ? 'no sittings' : parts.join(' · ');
}

/**
 * The capability spread, named per lens.
 *
 * Contracts per scheduled skill, in the learner-facing words — never averaged,
 * never totalled into one figure. REQ-UI-07 forbids collapsing the five into
 * one mastery light, and a switcher card that printed "78% studied" would be
 * that collapse wearing a percentage.
 *
 * `writing` is listed with a zero rather than omitted. Phase 0 has no
 * handwriting contract skill at all, so the honest reading is "not measured",
 * and leaving the row out would let a reader infer the lens does not exist.
 */
export function demoLensSpread(summary: ScriptedLearnerSummary): readonly DemoFact[] {
  const bySkill = summary.contractsBySkill;
  return [
    { label: 'reading', value: String(bySkill.orthography_to_reading ?? 0) },
    { label: 'meaning', value: String(bySkill.form_to_meaning ?? 0) },
    { label: 'listening', value: String(bySkill.audio_to_meaning ?? 0) },
    { label: 'production', value: String(bySkill.meaning_to_production ?? 0) },
    { label: 'writing', value: '0' },
  ];
}

/**
 * How long the log took to build, on this device, in this session.
 *
 * A measurement, taken here, reported here. Not a benchmark and not a promise
 * about any other device — which is exactly the distinction the open-items
 * register records the rest of this build failing to make.
 */
export function demoBuildNote(generateMs: number, replayMs: number): string {
  const total = Math.round(generateMs + replayMs);
  return `Generated and folded into state in ${String(total)} ms on this device (${String(Math.round(generateMs))} ms to write the events, ${String(Math.round(replayMs))} ms to replay them).`;
}
