/**
 * The dual-reading scrubber: one control, two times (Campaign E / B1).
 *
 * ## Why it is one control
 *
 * From the map design document, which calls this the design's best single idea:
 *
 * > - Pulled one way it is **your** history — the event-sourced replay of your
 * >   own memory state, already built, already honest.
 * > - Pulled the other way it is **the language's** history — the era layers.
 * >
 * > One control. Two times. They are the same gesture because they are the same
 * > question: *how did this get here?*
 *
 * The instruction that follows from it is the hard part: **make the duality
 * legible, not hidden in a mode.** A segmented "History / Eras" toggle above a
 * slider would satisfy the letter and lose the idea entirely — two modes with
 * one widget is not one gesture, it is two controls stacked.
 *
 * So the model here is a **single signed axis with a detent at zero**:
 *
 * ```
 *   your history            now            the language's history
 *   ◀───────────────────────┼───────────────────────▶
 *  -N …            -2  -1   0   +1   +2            … +3
 *   older replay frames         古道 → 街道 → 鉄道
 * ```
 *
 * One position, one number, and **both readings are true of it at once** — which
 * is what a surface can then show: at any position the control names what it is
 * doing *and* what the other direction would do, so the duality is visible
 * without moving the control.
 *
 * The two halves are asymmetric on purpose and the asymmetry is honest. The
 * negative side is **continuous and personal**: its frames come from the event
 * log, so its length is however much history the learner has, and a learner with
 * no history has none. The positive side is **discrete and shared**: there are
 * exactly three era layers and there will never be a fourth, so it has three
 * stops for everyone. Pretending both sides were the same kind of axis would
 * mean either inventing history the learner does not have or inventing eras the
 * language does not have.
 *
 * ## Zero is "now, and all layers"
 *
 * The detent is not a fourth mode. At zero the map shows the present state on
 * every era band at once, which is the map's resting condition and the thing a
 * learner opens it to see. Moving either way narrows: back in your time, or
 * forward through the language's strata.
 *
 * ## Scrubbing is exposure. Always.
 *
 * Nothing in this module writes. It computes a position, names it, and hands
 * back which instant and which bands to draw. The domain's own comment on the
 * projection it feeds: *"Exposure is never retrieval. Scrubbing a year of
 * history is a read of the log and produces no event, no grade, and no
 * scheduling change — there is nothing in this function that could."* The same
 * is true here, and `test/map-modules.test.ts` asserts this file imports no
 * command, minter or store.
 *
 * ## Frames are built once
 *
 * {@link historyFrames} produces the instants for the negative side from a
 * first-and-last pair. It is a pure list of strings; the expensive part — the
 * per-frame `RetrievabilityIndex` — is the domain's
 * `buildRetrievabilityIndexTimeline`, which builds the (component, skill)
 * bucketing **once** for the whole run. That is the defect lane A2 measured and
 * repaired, and the reason this module hands out instants rather than indexes:
 * a helper here that returned a fresh index per position would reintroduce it
 * one layer up.
 *
 * ## A frame index is not a day, and this control's whole job is to say when
 *
 * {@link historyFrames} caps at 480 frames and **widens the step** past the cap,
 * so a learner with 1,500 days of history gets 480 frames three days apart. The
 * axis position is a frame index, so `-479` on a 1,500-day log is 1,500 days
 * back, not 479. The label used to be formed from the position — every long
 * history read "479 days back" no matter how long it was — which is the one
 * mistake this control cannot afford, since naming the instant is its entire
 * function.
 *
 * So every day figure a learner reads comes from {@link daysBetween} over the
 * **actual instants**: {@link daysBackAt} for a step, {@link historySpanDays}
 * for the whole arm. The frame count survives only as `ScrubberRange.historyFrames`,
 * which is what it is called and is never printed as a duration.
 */

import { ERA_LAYERS, type EraLayer, type IsoInstant } from '@bunki/domain';

/* ------------------------------------------------------------------ *
 * The axis
 * ------------------------------------------------------------------ */

/** Which time a position is reading. Both are always *available*; one is active. */
export const SCRUBBER_READINGS = ['your-history', 'now', 'language-eras'] as const;
export type ScrubberReading = (typeof SCRUBBER_READINGS)[number];

/**
 * What the control is at one position.
 *
 * `otherDirection` is the field that makes the duality legible: a surface
 * renders it beside the active reading, so the learner can see what the
 * unexplored half of the control does without having to move it and find out.
 */
export interface ScrubberPosition {
  /** Negative: your history. Zero: now. Positive: the language's eras. */
  readonly value: number;
  readonly reading: ScrubberReading;
  /** The instant to project at. Always the present on the positive side. */
  readonly at: IsoInstant;
  /**
   * Which era bands to draw. All of them at zero and on the history side —
   * your history happened on every layer at once — and exactly one when walking
   * the language's strata.
   */
  readonly bands: readonly EraLayer[];
  /** What this position is, in one line. */
  readonly label: string;
  /** What the *other* direction offers from here, in one line. */
  readonly otherDirection: string;
}

export interface ScrubberRange {
  /** How many history frames exist. `0` for a learner with no log. */
  readonly historyFrames: number;
  /** Always `ERA_LAYERS.length`. Three, and there will not be a fourth. */
  readonly eraStops: number;
  readonly min: number;
  readonly max: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between two instants, never negative.
 *
 * Rounded rather than floored: frames past the 480 cap are a non-integer number
 * of days apart, and flooring would print a 1,500-day history as 1,499. Rounding
 * is the honest reading of "how many days back is this frame".
 */
export function daysBetween(from: IsoInstant, to: IsoInstant): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

/**
 * How many days back the frame at `value` actually is.
 *
 * Reads the frame's own instant, so it is correct whether or not the step
 * widened past the cap. Zero and the positive side are the present, which is
 * zero days back.
 */
export function daysBackAt(value: number, frames: readonly IsoInstant[], now: IsoInstant): number {
  if (value >= 0 || frames.length === 0) return 0;
  const index = Math.max(0, frames.length - 1 + Math.trunc(value));
  const at = frames[index];
  return at === undefined ? 0 : daysBetween(at, now);
}

/** How long the learner's recorded history is, in days rather than in frames. */
export function historySpanDays(frames: readonly IsoInstant[], now: IsoInstant): number {
  const oldest = frames[0];
  return oldest === undefined ? 0 : daysBetween(oldest, now);
}

export function scrubberRange(historyFrameCount: number): ScrubberRange {
  const frames = Math.max(0, Math.trunc(historyFrameCount));
  return {
    historyFrames: frames,
    eraStops: ERA_LAYERS.length,
    // The last history frame *is* the present, so it is position zero rather
    // than position -1; a range of `-(frames - 1)` avoids an off-by-one that
    // would put "now" one step from the end of its own axis.
    //
    // One frame is handled with zero rather than by arithmetic, because
    // `-(1 - 1)` is `-0`: it compares false against `< 0` (so the control was
    // right not to draw an arm) but `Object.is(-0, 0)` is false, so the sharp
    // edge could only ever surface in a test or a serialisation. There is no
    // history arm for one frame; the honest spelling of that is `0`.
    min: frames <= 1 ? 0 : -(frames - 1),
    max: ERA_LAYERS.length,
  };
}

/**
 * Resolve a position on the axis.
 *
 * `frames` is oldest-first and its **last entry is the present**, which is what
 * makes position 0 mean "now" on both sides of the detent. A caller with no
 * history passes an empty list and gets the present instant it supplies, so the
 * map still renders — a learner who has never reviewed anything sees a map,
 * not an error.
 */
export function resolveScrubber(
  value: number,
  frames: readonly IsoInstant[],
  now: IsoInstant,
): ScrubberPosition {
  const range = scrubberRange(frames.length);
  const clamped = Math.min(range.max, Math.max(range.min, Math.trunc(value)));

  /*
    Whether there is a history *arm* at all, which is not the same question as
    whether there are frames.

    `scrubberRange(1).min` is 0 — one frame is the present and nothing else — so
    a single-frame log renders no negative step, and `scrubber.tsx` is right not
    to draw one. The copy used to key off `historyFrames === 0` instead, so every
    fresh install, and every learner on their first day *including immediately
    after doing real work*, read "Pull left through 1 days of your own history"
    beside a control with nothing to its left. One control, one predicate.
  */
  const hasHistoryArm = range.min < 0;
  const spanDays = historySpanDays(frames, now);
  const spanPhrase = `${String(spanDays)} day${spanDays === 1 ? '' : 's'}`;

  if (clamped > 0) {
    const layer = ERA_LAYERS[clamped - 1] ?? ERA_LAYERS[0];
    return {
      value: clamped,
      reading: 'language-eras',
      at: now,
      bands: layer === undefined ? [...ERA_LAYERS] : [layer],
      label: `The language’s history — layer ${String(clamped)} of ${String(ERA_LAYERS.length)}`,
      otherDirection: hasHistoryArm
        ? `Pull the other way for your own history — ${spanPhrase} of it.`
        : 'Pull the other way for your own history. There is no earlier day recorded yet.',
    };
  }

  if (clamped === 0) {
    return {
      value: 0,
      reading: 'now',
      at: now,
      bands: [...ERA_LAYERS],
      label: 'Now — every layer, as your memory stands today',
      otherDirection: hasHistoryArm
        ? `Pull left through ${spanPhrase} of your own history; pull right to walk the language’s three eras.`
        : 'Pull right to walk the language’s three eras. There is no earlier day recorded yet, so there is nothing to the left.',
    };
  }

  // Negative: step back from the end of the frame list, which is the present.
  const index = frames.length - 1 + clamped;
  const at = frames[Math.max(0, index)] ?? now;
  // Days off the frame's own instant, never off the position: past the 480-frame
  // cap the step widens and the two stop being the same number.
  const back = daysBackAt(clamped, frames, now);
  return {
    value: clamped,
    reading: 'your-history',
    at,
    bands: [...ERA_LAYERS],
    label: `Your history — ${String(back)} day${back === 1 ? '' : 's'} back`,
    otherDirection: 'Pull the other way to walk the language’s three eras instead.',
  };
}

/* ------------------------------------------------------------------ *
 * Frames
 * ------------------------------------------------------------------ */

/**
 * Daily instants from `from` to `to` inclusive, oldest first.
 *
 * Daily because that is the resolution the log supports meaningfully and the
 * resolution Kanji Garden's wallpaper scrubber proved emotionally (frozen v1
 * §10.3, "~14 months of history on a time scrubber"). Capped so a log with a
 * stray far-future instant cannot ask for a million frames — the cap is
 * returned as fewer frames, never as a throw, because the map must still draw.
 */
export function historyFrames(
  from: IsoInstant,
  to: IsoInstant,
  maxFrames = 480,
): readonly IsoInstant[] {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [to];

  const span = Math.floor((end - start) / DAY_MS);
  const count = Math.min(span + 1, Math.max(1, maxFrames));
  // When the span is longer than the cap the step widens, so the scrubber still
  // reaches both ends of the learner's history rather than stopping partway.
  const step = span <= 0 ? DAY_MS : (end - start) / Math.max(1, count - 1) || DAY_MS;

  const out: IsoInstant[] = [];
  for (let index = 0; index < count; index += 1) {
    out.push(new Date(start + step * index).toISOString());
  }
  // The present is what position zero means, so it is the last entry exactly.
  out[out.length - 1] = to;
  return out;
}
