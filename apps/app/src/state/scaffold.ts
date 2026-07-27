/**
 * WP-01 scaffold state.
 *
 * `src/state/` is where the app wires user interactions to domain commands.
 * It holds no scheduling, grading, or evidence logic (controller §5) — those
 * live in `@bunki/domain`, and appends reach the store only through the domain
 * command handler.
 */

/**
 * Rendered on the scaffold route. Worded to claim nothing about the product
 * (REQ-GATE-03): it describes the build state, not a capability.
 */
export const SCAFFOLD_NOTICE =
  'Phase-0 scaffold. No learning features are implemented yet — this route exists to prove the build and CI pipeline run.';
