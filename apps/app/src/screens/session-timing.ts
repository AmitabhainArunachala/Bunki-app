/**
 * Measuring how long an answer took (WP-08 repair round; REQ-SCH-06,
 * REQ-SCH-05).
 *
 * ## Why this file exists
 *
 * The three WP-08 screens shipped `latencyMs: 0` as a literal on every graded
 * attempt. REQ-SCH-06 makes logged latency a *precondition* for an embedded
 * micro-probe to update long-term memory — cue direction, modality, accepted
 * answer, hints/reveals, latency and grading must all be logged — and a constant
 * zero is not a logged latency. It is a measurement that was never taken,
 * written into an append-only ledger that the inspector renders and the export
 * ships. REQ-SCH-05 licenses never *reading* latency as a mastery signal; it
 * licenses nothing about writing a number nobody measured.
 *
 * ## Where the instants come from
 *
 * Both ends come from the injected `DomainContext.clock`, reached through
 * `SessionLoop.now()` — never `Date.now`. That is REQ-ARCH-02 at the app seam:
 * a test and the screenshot harness pin time by passing a fixed context, so a
 * measured latency stays reproducible instead of becoming the one field that
 * makes every run differ.
 *
 * ## What a zero means now
 *
 * With a pinned clock, `now()` returns the same instant twice and the honest
 * measurement is `0` — no time passed, because the fixture's time did not move.
 * That is a real reading of a real clock, not a placeholder. A clock that ran
 * backwards also reads `0`, clamped and documented below; a clock that returned
 * something unparseable is deliberately *not* rescued into a zero.
 */

import { useState } from 'react';

import type { IsoInstant } from '@bunki/domain';

/**
 * Milliseconds between two instants, as the event schema requires them.
 *
 * `latencyMs` is `z.number().int().min(0)`, so the result is rounded and floored
 * at zero. The floor is a monotonicity guard, not a fallback: two readings of a
 * wall clock can arrive out of order across a resync, and a negative duration is
 * not a thing that can be true of an attempt.
 *
 * An unparseable instant produces `NaN` and is left to propagate. That is
 * deliberate — turning a broken clock into `0` would rebuild the exact defect
 * this file exists to remove, and the fail-closed event parser is the right
 * place for a malformed instant to surface, loudly, at the boundary.
 */
export function elapsedMs(from: IsoInstant, to: IsoInstant): number {
  // `Math.max` propagates NaN rather than swallowing it, which is why the clamp
  // and the malformed-instant case can be one expression: a real duration is
  // floored at zero, an unparseable one stays NaN and fails at the parser.
  return Math.max(0, Math.round(Date.parse(to) - Date.parse(from)));
}

/**
 * The instant the thing currently on screen became answerable.
 *
 * `presentationKey` names the presentation — a step id, a repair attempt
 * ordinal. When it changes, a new prompt is in front of the learner and the mark
 * is re-taken from the injected clock; while it is unchanged the mark is stable,
 * so re-rendering for an unrelated reason does not restart the measurement.
 *
 * The re-mark happens during render rather than in an effect, which is React's
 * documented way to derive state from a changed input: React re-runs this
 * component with the new mark before committing anything, so the handler that
 * eventually reads it always closes over the current presentation. An effect
 * would take the mark one commit *after* the prompt appeared and would quietly
 * shorten every measurement by a frame.
 */
export function usePresentedAt(now: () => IsoInstant, presentationKey: string): IsoInstant {
  const [mark, setMark] = useState<{ key: string; at: IsoInstant }>(() => ({
    key: presentationKey,
    at: now(),
  }));

  if (mark.key !== presentationKey) {
    const remarked = { key: presentationKey, at: now() };
    setMark(remarked);
    return remarked.at;
  }

  return mark.at;
}
