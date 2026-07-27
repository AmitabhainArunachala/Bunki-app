/**
 * `@bunki/export` — complete, versioned, lossless JSON export.
 *
 * Owner: WP-03; WP-09 owns the UI hooks.
 *
 * WP-01 scaffold: identity constants only, no export logic.
 */

export const PACKAGE_NAME = '@bunki/export';

/**
 * Emitted as `exportVersion` on every export payload (controller §11).
 * Unknown export versions fail closed, mirroring REQ-DM-04.
 */
export const EXPORT_VERSION = 1;
