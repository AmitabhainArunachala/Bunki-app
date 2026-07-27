/**
 * `@bunki/export` — complete, versioned, lossless JSON export.
 *
 * Owner: WP-03; WP-09 owns the UI hooks.
 *
 * Export is the user's exit door, and in this project it is also a correctness
 * instrument: if the data cannot leave losslessly and replay to the same state
 * it left, every evidence claim the rest of the system makes is unverifiable.
 * That is why `npm run verify:export` runs `src/verify.ts` against a real store
 * rather than checking a serialiser against itself.
 *
 * This package imports `@bunki/domain` and nothing else. It holds no store, no
 * filesystem, and no adapter, so the same code verifies the ci-substitute
 * adapter, the provisional web adapter, and (at WP-11) a device.
 */

export const PACKAGE_NAME = '@bunki/export';

export * from './envelope.ts';
export * from './verify.ts';
export * from './ui-hooks.ts';
