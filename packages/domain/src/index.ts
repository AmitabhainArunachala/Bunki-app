/**
 * `@bunki/domain` — the pure domain kernel.
 *
 * Owner: WP-02 (events/reducers/replay), then WP-06 (contracts/evidence/FSRS).
 * `src/session/` belongs to WP-08.
 *
 * This file must never acquire a platform import. Clock, ID generation, and
 * randomness are injected (REQ-ARCH-02); see `README.md` for the full boundary
 * rules, and `eslint.config.mjs` for the rule that enforces them.
 *
 * WP-01 scaffold: identity constants only, no domain logic.
 */

/** Stable package identifier, used by export `appVersions` from WP-03 onward. */
export const PACKAGE_NAME = '@bunki/domain';

/**
 * Event schema version carried by every event as `v` (controller §6.1).
 * Unknown versions fail closed (REQ-DM-04, T-04) — WP-02 implements that check.
 */
export const EVENT_SCHEMA_VERSION = 1;
