/**
 * `src/guide/` — the 案内人 (Campaign E / B6; map document §4).
 *
 * Four things are decided about the guide and they are the four things this
 * directory builds. Its character is deliberately undecided by the operator, so
 * nothing here names it, gives it a voice, or draws it.
 *
 *   - `position.ts`   — §4.1: it has a position on the road, ahead of the
 *                       learner, and at the fork when there is one.
 *   - `assessment.ts` — §4.2: assessment is a conversation, not a level quiz.
 *   - `records.ts`    — §4.2: a long-term route and a short-term plan, both
 *                       carrying provenance and a time, both editable, both
 *                       revised by supersession rather than by mutation.
 *   - `propose.ts`    — estimate → route → plan, over candidates the caller
 *                       supplies. The kernel holds no vocabulary of its own.
 *   - `boundary.ts`   — §4.3: the hard boundary, and the mechanisms that hold
 *                       it. Read this one first.
 *
 * **Nothing in this directory mints an event, grades an answer, writes a memory
 * state, or computes an interval.** It imports no minter, no gate, no reducer
 * and no scheduler; `packages/domain/test/guide/boundary.test.ts` walks the
 * import graph in both directions and fails if that stops being true.
 */

export * from './boundary.ts';
export * from './records.ts';
export * from './assessment.ts';
export * from './propose.ts';
export * from './position.ts';
