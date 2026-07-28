/**
 * Types and constants both platform stores share (WP-10).
 *
 * Kept out of `./index.ts` so the two `platform-store` files can import them
 * without importing the barrel that imports them — a cycle that resolves fine
 * in a bundler and confuses everything else.
 */

import type { EventStore, EventStoreConfig, RuntimeLabel, SnapshotStore } from '@bunki/persistence';

/** The database file on a device, and the storage key in a browser. */
export const STORE_NAME = 'bunki-phase0';

export interface OpenAppEventStoreOptions extends EventStoreConfig {
  /** Web only. Defaults to `globalThis.localStorage`, or memory when denied. */
  readonly snapshotStore?: SnapshotStore | undefined;
  /** Overrides the storage key / database name. Tests isolate themselves with it. */
  readonly snapshotKey?: string | undefined;
}

export interface OpenedAppEventStore {
  readonly store: EventStore;
  readonly runtimeLabel: RuntimeLabel;
  /**
   * Whether the bytes will outlive the tab or process.
   *
   * `false` when the web adapter fell back to an in-memory snapshot store. The
   * about surface renders this rather than the label alone, because
   * "web-provisional" and "web-provisional, and this browser refused storage"
   * make different promises and only one of them survives a reload.
   */
  readonly snapshotAvailable: boolean;
}
