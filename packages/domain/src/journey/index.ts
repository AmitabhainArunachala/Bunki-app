/**
 * `src/journey/` — the journey compiler (Campaign E / A2; REQ-JRN-01/02/03).
 *
 * REQ-JRN-01's rule, one file per clause:
 *
 *   - `families.ts`      — the stumble, and the six branch families.
 *   - `compiler.ts`      — stumble → candidate-cause hypotheses → offered paths.
 *   - `probes.ts`        — one or two cheap diagnostics that actually separate.
 *   - `rejoin.ts`        — the contract-defined evidence criterion.
 *   - `opportunities.ts` — untaken paths, decaying and capped, never a backlog.
 *   - `state.ts`         — the four phases and the transitions between them.
 *
 * Nothing here mints an event, grades an answer, or writes memory state. A
 * journey routes attention; the evidence gate remains the sole factory for
 * evidence and the pinned FSRS reducer the sole scheduler. A probe answer is
 * routing, not retrieval, and produces nothing the scheduler ever sees.
 *
 * Phase 0's hard-coded repair branch in `src/session/repair.ts` is left exactly
 * as it was. See {@link import('./compiler.ts').JOURNEY_COMPILER_SUPERSESSION}
 * for why the seam declared there is superseded rather than implemented.
 */

export * from './families.ts';
export * from './probes.ts';
export * from './compiler.ts';
export * from './rejoin.ts';
export * from './opportunities.ts';
export * from './state.ts';
