/**
 * `@bunki/domain` — the pure domain kernel.
 *
 * Owner: WP-02 (events/reducers/replay), then WP-06 (contracts/evidence/FSRS).
 * `src/session/` belongs to WP-08.
 *
 * This file must never acquire a platform import. Clock, ID generation, and
 * randomness are injected (REQ-ARCH-02) through `DomainContext`; see
 * `README.md` for the full boundary rules, and `eslint.config.mjs` for the
 * rules that enforce them.
 *
 * What WP-02 delivers: the v1 event catalog (types + zod schemas, fail-closed
 * on unknown versions), pure reducers for thread and promotion state, the
 * injection seam, and deterministic replay with a golden-fixture harness.
 *
 * What it deliberately does not: FSRS, the evidence gate, session planning.
 * Those are recorded as data in `PHASE0_SEAMS` (`src/reducers/seams.ts`) rather
 * than left as silent gaps.
 */

/** Stable package identifier, used by export `appVersions` from WP-03 onward. */
export const PACKAGE_NAME = '@bunki/domain';

export * from './primitives.ts';
export * from './errors.ts';
export * from './context/index.ts';
export * from './events/index.ts';
export * from './reducers/index.ts';
export * from './replay/index.ts';
