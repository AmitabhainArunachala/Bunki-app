/**
 * `@bunki/ai` — the bounded AI candidate path.
 *
 * Owner: WP-07.
 *
 * Nothing in this package may construct an `EvidenceEvent` or touch canonical
 * or memory state (REQ-ARCH-04, T-09). A bypass is a controller §21.3 stop
 * condition, not a defect to triage.
 *
 * WP-01 scaffold: identity constants only, no provider code.
 */

export const PACKAGE_NAME = '@bunki/ai';

/** Default request timeout in milliseconds (controller §9). */
export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Label applied to fixture-served candidates when the provider is unreachable
 * or times out (T-10, T-11). A fallback is never presented as a live candidate.
 */
export const OFFLINE_FALLBACK_LABEL = 'offline-fallback';

/** Every candidate renders with this visible label (T-12). */
export const CANDIDATE_LABEL = 'AI candidate / generated';
