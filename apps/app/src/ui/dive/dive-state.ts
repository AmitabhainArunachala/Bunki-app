/**
 * Where you are in the dive, and how you got there (lane B2).
 *
 * ## Zooming is nothing but changing which node is the centre
 *
 * That is the whole design of the fractal dive and it is the whole content of
 * this file. There is one gesture — `zoom` — and it works identically at every
 * one of the six levels, because the level is a property of the node it lands on
 * rather than a mode the surface is in. There is no `enterKanjiMode`, no
 * `expandComponents`, no vocabulary that appears at depth 4 and not at depth 1.
 *
 * ## The two things six levels of zoom with no chrome would get wrong
 *
 * The design document names them as risks, and both are answered here rather
 * than in a component:
 *
 *   - **Where am I.** {@link DiveState.path} is the whole answer: the origin, the
 *     stops in order, and the centre last. It is data, so the chrome renders it
 *     rather than reconstructing it, and a test can assert it is never empty.
 *   - **Take me back out.** {@link surfaced} is one action, always available, and
 *     it returns to the node the dive began at — not one step back, all the way
 *     out. `back` is the smaller gesture beside it.
 *
 * ## Revisiting a node winds the path back rather than growing it
 *
 * 森 → 木 → 森 → 木 is a real thing a finger does in ten seconds, and a path that
 * recorded every step of it would be an unbounded breadcrumb of four nodes. So
 * zooming to a node already on the path *returns* to it. The consequence worth
 * stating: the path is always a set of distinct nodes, so its length is bounded
 * by the graph rather than by how long somebody has been playing.
 *
 * ## Nothing here writes anything, and the types are what say so
 *
 * {@link DiveAction} has three members and every one of them is navigation. There
 * is no action that grades, submits, marks, or records, and {@link diveReducer}
 * returns a {@link DiveState} and nothing else — no command, no effect, no
 * callback. Flight is exposure; exposure is never retrieval.
 * `test/dive-boundary.test.ts` proves this against the module graph rather than
 * trusting this paragraph, because a paragraph is what the honesty rules call
 * the most-caught defect class here.
 */

import type { ScaleLevel, ScaleNodeId } from '@bunki/domain';

/** One stop on the way down. Enough to render the chrome without a lookup. */
export interface DiveStop {
  readonly id: ScaleNodeId;
  readonly level: ScaleLevel;
  /** 森, 森林, "3/4" — what the breadcrumb shows. */
  readonly label: string;
}

export interface DiveState {
  /**
   * Where the dive began.
   *
   * Always `path[0]`, kept as its own field because "the way back out" is the
   * one affordance that must never be a computation somebody can get wrong.
   */
  readonly origin: DiveStop;
  /** Origin first, centre last. Never empty, and never contains a repeat. */
  readonly path: readonly DiveStop[];
}

/**
 * Every gesture the dive has.
 *
 * Three, and all three are navigation. Adding a fourth that graded anything
 * would be the Wave C3 work, and it would have to go through the evidence gate
 * rather than through this union — which is exactly why this union is small
 * enough to read.
 */
export type DiveAction =
  /** Make this node the centre. The one gesture, at every level. */
  | { readonly kind: 'zoom'; readonly to: DiveStop }
  /** One step back up the path. A no-op at the origin. */
  | { readonly kind: 'back' }
  /** All the way out, in one gesture. A no-op at the origin. */
  | { readonly kind: 'surface' };

export function beginDive(origin: DiveStop): DiveState {
  return { origin, path: [origin] };
}

/**
 * The next state. Total, pure, and with no output but the state.
 *
 * An unknown action kind cannot occur — the union is closed — but the default
 * returns the state unchanged rather than throwing, because a dive that crashed
 * on a stray gesture would lose the learner's position over nothing.
 */
export function diveReducer(state: DiveState, action: DiveAction): DiveState {
  switch (action.kind) {
    case 'zoom': {
      const existing = state.path.findIndex((stop) => stop.id === action.to.id);
      if (existing >= 0) {
        // Already visited: wind back to it rather than growing the path.
        return existing === state.path.length - 1
          ? state
          : { origin: state.origin, path: state.path.slice(0, existing + 1) };
      }
      return { origin: state.origin, path: [...state.path, action.to] };
    }
    case 'back': {
      if (state.path.length <= 1) return state;
      return { origin: state.origin, path: state.path.slice(0, -1) };
    }
    case 'surface': {
      if (state.path.length <= 1) return state;
      return { origin: state.origin, path: [state.origin] };
    }
  }
}

/** The node in the middle. Total: the path is never empty. */
export function centreOf(state: DiveState): DiveStop {
  return state.path[state.path.length - 1] ?? state.origin;
}

/** How many zooms from the origin. `0` at the surface. */
export function depthOf(state: DiveState): number {
  return state.path.length - 1;
}

/** Whether either way back is available, so a control can be absent rather than dead. */
export function canSurface(state: DiveState): boolean {
  return state.path.length > 1;
}

/**
 * The direction a move went, for the flight to know which way to fly.
 *
 * Read off the two nodes' levels rather than off the action: `back` from a
 * component to a kanji is a zoom *out* and `back` from a word to a kanji is a
 * zoom *in*, and the animation should follow the scale rather than the history.
 * `null` means the levels are the same, which is a lateral move and gets no
 * flight at all.
 */
export type FlightDirection = 'in' | 'out' | null;

export function flightDirection(
  from: ScaleLevel | null,
  to: ScaleLevel | null,
  depthOfLevel: Readonly<Record<ScaleLevel, number>>,
): FlightDirection {
  if (from === null || to === null || from === to) return null;
  return depthOfLevel[to] < depthOfLevel[from] ? 'in' : 'out';
}
