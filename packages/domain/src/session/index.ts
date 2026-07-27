/**
 * The session orchestrator (WP-08; controller §6.4, REQ-SCH-04/05/06,
 * REQ-JRN-01/02, P0-CAP-11).
 *
 * Four files, one per question:
 *
 *   - `plan.ts`     — given a budget, what is a finite sitting made of?
 *   - `runtime.ts`  — how far into it are we, and how does it end?
 *   - `canvas.ts`   — was that a declared probe, or was it exposure?
 *   - `repair.ts`   — one stumble, two hypotheses, and an evidence-defined rejoin.
 *
 * plus `commands.ts`, the handler a screen submits to, so that `apps/app` holds
 * no scheduling, grading or evidence logic (controller §5).
 *
 * Nothing here computes an interval. The item scheduler is
 * `src/reducers/memory-state.ts` and there is exactly one of it (REQ-SCH-01);
 * the orchestrator is separate from it by requirement (REQ-SCH-04) and in the
 * import graph — no file in this directory imports `ts-fsrs`. `commands.ts`
 * reaches scheduling only through `replay`, which is the single code path that
 * puts an observation to the evidence gate and folds an *admitted* grade into
 * memory state. There is no second one, and none could be added here without
 * importing the scheduler this directory does not import.
 */

export * from './plan.ts';
export * from './runtime.ts';
export * from './canvas.ts';
export * from './repair.ts';
export * from './commands.ts';
