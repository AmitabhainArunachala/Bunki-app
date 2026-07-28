/**
 * Motion tokens.
 *
 * ## Motion here has a job
 *
 * The campaign brief is explicit: motion serves comprehension — "strokes that
 * draw, a map that settles, a branch that lights" — and is not ambient
 * decoration. So there are exactly three motion *roles*, each named after what
 * it teaches, and a duration ladder sized to them:
 *
 *   - **draw** — a stroke being written in order. The duration is per stroke and
 *     is the one place a long animation is right: writing order is the content,
 *     and a 90 ms stroke teaches nothing.
 *   - **settle** — a surface arriving at rest. A layout that snaps hides the
 *     relationship between what was there and what is there now; a layout that
 *     drifts wastes the learner's time. 240 ms is the range where the eye tracks
 *     the movement without waiting for it.
 *   - **light** — a branch or a node coming up. Short and asymmetric: fast in,
 *     slower out, so the arrival is noticed and the departure is not.
 *
 * There is no `celebrate`. No token in this file is reachable from a correct
 * answer, and nothing here scales, bounces or overshoots — the easing curves
 * below have no coefficient above 1 for exactly that reason (a spring that
 * overshoots is confetti with better manners), which
 * `test/theme-motion.test.ts` asserts rather than trusting.
 *
 * ## Reduced motion is a duration of zero, not a branch
 *
 * `prefers-reduced-motion` is handled by `resolveDuration`, which returns 0 for
 * every role when reduction is on. Components therefore animate unconditionally
 * and a zero-length animation lands on its end state in one frame — so the
 * reduced path runs the same code as the full path and cannot rot separately.
 * The alternative, an `if (reduced) return <Static/>` in every component, is two
 * renderings of every surface and only one of them ever gets looked at.
 */

/** Durations in milliseconds, by role. */
export const DURATION = {
  /** No animation: state changes on the next frame. */
  instant: 0,
  /** A control acknowledging a press; a chip toggling. */
  quick: 120,
  /** A surface settling into place; a disclosure opening. */
  settle: 240,
  /** A branch or node lighting up, and the slower fade back down. */
  lightIn: 160,
  lightOut: 320,
  /** One stroke of a character being written. */
  drawStroke: 420,
  /** The pause between strokes, so the eye can register the lift. */
  drawGap: 90,
} as const;

export type DurationName = keyof typeof DURATION;

/**
 * Easing curves as cubic-bézier control points, `[x1, y1, x2, y2]`.
 *
 * Given as data rather than as functions so the tokens stay platform-neutral
 * and testable: `Easing.bezier(...EASING.settle)` on React Native, the same four
 * numbers in a CSS `cubic-bezier()` on the web.
 *
 * None of the `y` values leaves `[0, 1]`. That is the no-overshoot rule stated
 * as arithmetic: a curve that exceeds 1 goes past its target and comes back,
 * which is a bounce, which is the register this design does not use.
 */
export const EASING = {
  /** Default. Decelerating; things arrive rather than stop. */
  settle: [0.2, 0.0, 0.0, 1.0],
  /** Entering: fast start, so the arrival is noticed. */
  enter: [0.0, 0.0, 0.2, 1.0],
  /** Leaving: slow start, so the departure is not. */
  exit: [0.4, 0.0, 1.0, 1.0],
  /** A brush: even, unhurried, no acceleration story to tell. */
  ink: [0.35, 0.0, 0.35, 1.0],
} as const;

export type EasingName = keyof typeof EASING;

/**
 * The lowest opacity an unlit branch may be dimmed to.
 *
 * A token rather than a component constant because it is a promise about the
 * product: the frozen spec §3 keeps untaken branches on the map as *dimmed
 * rails, revisitable*. Below this floor a rail has been deleted rather than
 * dimmed, and a journey the learner did not take becomes a journey they cannot
 * find. `test/theme-tokens.test.ts` holds the floor.
 */
export const MIN_UNLIT_OPACITY = 0.38;

/**
 * The duration a component should actually use.
 *
 * One function, so "respect reduced motion" is a property of the token layer
 * instead of a thing every author has to remember. `reduced` comes from
 * `useReducedMotion()` in `src/ui/motion.tsx`, which reads the platform setting
 * (and, on the web, the `prefers-reduced-motion` media query) and updates when
 * it changes.
 */
export function resolveDuration(name: DurationName, reduced: boolean): number {
  return reduced ? 0 : DURATION[name];
}

/**
 * The total time a stroke-order animation will take, so a caller can size a
 * progress affordance without replaying the arithmetic.
 */
export function strokeSequenceDuration(strokeCount: number, reduced: boolean): number {
  if (reduced || strokeCount <= 0) return 0;
  return strokeCount * DURATION.drawStroke + Math.max(0, strokeCount - 1) * DURATION.drawGap;
}
