/**
 * `@bunki/persistence` — event store ports and adapters.
 *
 * Owner: WP-03. WP-11 executes the native runtime checks.
 *
 * `apps/app` must never import this package: appends flow through the domain
 * command handler so evidence-class events pass the evidence gate (controller
 * §5). That restriction is lint-enforced in `eslint.config.mjs`.
 *
 * WP-01 scaffold: identity constants only, no adapter code.
 */

export const PACKAGE_NAME = '@bunki/persistence';

/**
 * Runtimes this package can be asked to persist on. The label matters as much
 * as the code: only WP-11 device runs may claim `native` verification, and the
 * `web` adapter is provisional (REQ-ARCH-05, P0-CAP-15).
 */
export const RUNTIME_LABELS = ['native', 'ci-substitute', 'web-provisional'] as const;

export type RuntimeLabel = (typeof RUNTIME_LABELS)[number];
