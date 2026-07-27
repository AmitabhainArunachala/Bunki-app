/**
 * The app's one door to `@bunki/persistence` (WP-10).
 *
 * ## Why exactly one directory may import the package
 *
 * Controller §5: "`apps/app` never calls `EventStorePort.append` directly: every
 * append flows through the domain command handler, which routes evidence-class
 * events through the evidence gate." WP-05 implemented that as a blanket lint
 * ban, which was right while the app had no durable store to reach. WP-10 has to
 * give the app a durable store, and the honest way to keep the property is to
 * narrow the ban rather than drop it: `eslint.config.mjs` now permits the import
 * inside **this directory alone**, and everything else in `apps/app` — every
 * screen, every route, every test — reaches persistence through what is
 * re-exported here.
 *
 * That keeps the gate closed for the reason the rule exists. A screen still
 * cannot obtain an `EventStorePort`, so it still cannot append; the only code
 * that appends is `../durable-store.ts`, and the only events it appends are the
 * ones `../memory-store.ts` has already minted through `@bunki/domain`'s
 * factories and its evidence gate. `test/boundaries.test.ts` asserts the
 * narrowing held, in both directions.
 *
 * ## Which adapter runs where
 *
 * The choice is made by module resolution, not by a `Platform.OS` branch:
 * `./platform-store.ts` is the web build and `./platform-store.native.ts` is the
 * native one. Two things follow, and both are why it is done this way. The web
 * bundle contains no `expo-sqlite`, and `src/state/` imports no `react-native`
 * at all — which keeps the whole state layer loadable by the plain Node test
 * runner, and it is a unit suite that broke on the `Platform` version of this
 * file that made the point.
 *
 * **Producing the `native` label is not the same as earning it.** Only WP-11
 * device evidence may be reported as native verification (P0-CAP-15).
 */

import {
  PROVISIONAL_WEB_ADAPTER_NOTICE,
  RUNTIME_LABEL_DISCLOSURE,
  type EventStore,
  type RuntimeLabel,
  type SnapshotStore,
} from '@bunki/persistence';

import { openPlatformEventStore } from './platform-store.ts';
import { STORE_NAME, type OpenAppEventStoreOptions, type OpenedAppEventStore } from './shared.ts';

export { PROVISIONAL_WEB_ADAPTER_NOTICE, RUNTIME_LABEL_DISCLOSURE, STORE_NAME };
export type {
  EventStore,
  OpenAppEventStoreOptions,
  OpenedAppEventStore,
  RuntimeLabel,
  SnapshotStore,
};

/**
 * Open the event store this platform should use.
 *
 * Synchronous, so the caller can decide what to show before the first render
 * rather than after it. The port's *methods* are async (REQ-ARCH-05 keeps
 * IndexedDB on the table and IndexedDB has no synchronous API); opening is not.
 */
export function openAppEventStore(options: OpenAppEventStoreOptions): OpenedAppEventStore {
  return openPlatformEventStore(options);
}
