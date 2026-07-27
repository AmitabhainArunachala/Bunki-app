/**
 * `@bunki/persistence` — the durable event log (WP-03).
 *
 * `apps/app` must never import this package: appends flow through the domain
 * command handler so evidence-class events pass the evidence gate (controller
 * §5). That restriction is lint-enforced in `eslint.config.mjs` and proved by
 * `test/boundaries.test.ts`.
 *
 * ## What is deliberately not exported here
 *
 * `src/sqlite/node-driver.ts` — the ci-substitute driver — is reachable only
 * through the `@bunki/persistence/ci-substitute` subpath, never from this
 * barrel. It statically imports `node:sqlite`, and a barrel that pulled a Node
 * builtin into every consumer would put it in the React Native bundle, where it
 * does not exist. Keeping it behind a subpath means the substitute is something
 * a test reaches for on purpose rather than something the device build has to
 * shake out.
 *
 * The `expo-sqlite` binding (`src/sqlite/expo-driver.ts`) *is* exported here,
 * because it imports nothing: it takes an already-opened database structurally.
 * See that file for why, and for what that costs.
 */

export const PACKAGE_NAME = '@bunki/persistence';

export * from './port.ts';
export * from './errors.ts';
export * from './hash.ts';
export * from './indexing.ts';
export * from './purge.ts';
export * from './append-plan.ts';
export * from './migrations/types.ts';
export * from './migrations/runner.ts';
export * from './migrations/schema.ts';
export * from './sqlite/driver.ts';
export * from './sqlite/adapter.ts';
export * from './sqlite/expo-driver.ts';
export * from './web/adapter.ts';
export * from './contract/suite.ts';
export * from './contract/fixtures.ts';
