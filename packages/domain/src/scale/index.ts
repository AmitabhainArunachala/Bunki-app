/**
 * `src/scale/` — scale as a navigable axis (Campaign E, Wave C / lane B2).
 *
 * Four files, one per question:
 *
 *   - `levels.ts`   — what the six levels are, and the law that makes them one
 *                     gesture: inward is constituents, outward is participations.
 *   - `ladder.ts`   — what a scale node is and where each level's data comes
 *                     from, including the two levels the Atlas has no vocabulary
 *                     for and the one that is empty in every shipped build.
 *   - `dive.ts`     — one bounded view, with its own measured cost.
 *   - `mismatch.ts` — a lit surface with a dark interior, per capability.
 *
 * Everything here is a **projection over `src/graph/`**, not a second index. It
 * mints no event, admits no evidence and writes no memory state; the evidence
 * gate (`src/evidence/`) remains the sole factory and the pinned FSRS reducer
 * remains the sole scheduler. Navigating the ladder is exposure, and exposure is
 * never retrieval — which is kept true by this directory having no way to
 * express a write rather than by a comment claiming it.
 */

export * from './levels.ts';
export * from './ladder.ts';
export * from './dive.ts';
export * from './mismatch.ts';
