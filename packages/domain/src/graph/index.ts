/**
 * `src/graph/` — the read side of the Atlas and the Trace (Campaign E / A2).
 *
 * Four files, one per question:
 *
 *   - `model.ts`          — what a node and a typed edge are.
 *   - `build.ts`          — index a source once so queries stay interactive.
 *   - `neighbourhood.ts`  — what is near this node, bounded and deterministic.
 *   - `lenses.ts`         — the five capability lenses REQ-UI-07 names.
 *   - `retrievability.ts` — what the map may draw, with nothing collapsed.
 *   - `era.ts`            — which era layer a node sits on, and when we do not know.
 *
 * Everything here is a **projection**. Nothing in this directory mints an
 * event, admits evidence, or writes memory state; the evidence gate
 * (`src/evidence/`) remains the sole factory and the pinned FSRS reducer
 * (`src/reducers/memory-state.ts`) remains the sole scheduler. The map reads
 * and submits commands; it never becomes a second way into the ledger.
 */

export * from './model.ts';
export * from './build.ts';
export * from './neighbourhood.ts';
export * from './lenses.ts';
export * from './retrievability.ts';
export * from './era.ts';
