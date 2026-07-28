/**
 * Where a hand-entered encounter came from, in REQ-SRC-01 terms (Wave D).
 *
 * ## Why this moved out of one screen
 *
 * The constants lived in `capture-screen.tsx`, because for a while capture was
 * the only surface that could start a thread. That made a real hole in the
 * weave: from a word page reached through the guide's road, or through a map
 * node, or through the reading passage, the only thing the app could say was
 * *"Keep it from the capture screen to start a thread"* — a cross-surface trace
 * that stops and asks the learner to go back to the front door and type the word
 * they are already looking at.
 *
 * The master definition-of-done asks for the opposite property: *"one learner
 * state under every surface; a word met anywhere shows up everywhere it should"*.
 * So the source record is shared and the **locator says which surface it was**,
 * which is more honest than the old value, not less: `capture-screen` was
 * hard-coded and would have quietly claimed the front door for an encounter kept
 * from a word page.
 *
 * ## What it is not
 *
 * It is not evidence. Capture and promotion are learner acts recorded in the
 * log; nothing here reaches the evidence gate, activates a contract, or asserts
 * retrieval. `capture` followed by `promote → keep` is what the capture screen
 * has always done, and the rung that activates retrieval contracts is `learn`,
 * which is still only ever reached by a press the learner makes.
 */

/** The learner typed or chose it, so the source is the learner. */
export function manualSource(locator: string): {
  readonly sourceId: 'manual-entry';
  readonly kind: 'manual';
  readonly locator: string;
} {
  return { sourceId: 'manual-entry', kind: 'manual', locator };
}

/**
 * The licence of a hand-entered encounter.
 *
 * Recording it as anything else — or leaving it blank — would make the one piece
 * of genuinely user-owned content in the log indistinguishable from
 * unattributed data (T-15).
 */
export const MANUAL_PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;
