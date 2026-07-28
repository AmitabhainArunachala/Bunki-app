/**
 * The native build's event store: `expo-sqlite` (WP-10; controller §7).
 *
 * Metro picks this file over `./platform-store.ts` on iOS and Android, so the
 * `expo-sqlite` import exists only in the native bundle and the web export never
 * has to shake it out.
 *
 * `openDatabaseSync` gives the synchronous handle `@bunki/persistence`'s driver
 * interface is written against; the adapter then applies WAL, foreign keys and
 * `secure_delete` and runs the migrations itself. Nothing about the schema is
 * decided here — this file's whole job is to hand over an open database.
 *
 * ## Closing half of a recorded WP-11 obligation
 *
 * `packages/persistence/src/sqlite/expo-driver.ts` declares the `expo-sqlite`
 * synchronous API itself rather than importing the package's typings, and its
 * header records the cost: "if a future `expo-sqlite` changes those signatures,
 * TypeScript here will not notice — the device run will", with *install the real
 * package and compile this binding against its typings* left as a WP-11
 * obligation. WP-10 installs `expo-sqlite@57.0.1` (MIT, verified on the registry
 * per controller §14) and `adaptExpoDatabase` below is that compilation: the two
 * declarations are now checked against each other at build time. What remains
 * for WP-11 is the part a compiler cannot do — running it on a device.
 *
 * **Producing the `native` label is not evidence of native behaviour.** Only
 * WP-11's device run may be reported as native verification (P0-CAP-15).
 */

import {
  SqliteEventStore,
  createExpoSqliteDriver,
  type ExpoSQLiteDatabaseLike,
  type SqlValue,
} from '@bunki/persistence';
import { openDatabaseSync, type SQLiteBindValue } from 'expo-sqlite';

import { STORE_NAME, type OpenAppEventStoreOptions, type OpenedAppEventStore } from './shared.ts';

/**
 * Where the two type vocabularies meet.
 *
 * `@bunki/persistence` describes the database it needs with `readonly` parameter
 * arrays — a driver has no business mutating the parameters it was handed — and
 * `expo-sqlite` types the same methods with mutable ones. The shapes agree at
 * runtime; only the variance differs, and copying each call's parameters into a
 * fresh array is what makes that agreement typed rather than asserted.
 *
 * A cast would have been one line and the wrong one: `readonly` is a real
 * guarantee this package makes to its callers, and casting it away here would
 * hand a live array to a native module.
 */
function adaptExpoDatabase(db: ReturnType<typeof openDatabaseSync>): ExpoSQLiteDatabaseLike {
  return {
    execSync: (source) => {
      db.execSync(source);
    },
    runSync: (source, params) => db.runSync(source, [...params] satisfies SQLiteBindValue[]),
    getAllSync: <TRow>(source: string, params: readonly SqlValue[]): TRow[] =>
      db.getAllSync<TRow>(source, [...params] satisfies SQLiteBindValue[]),
    closeSync: () => {
      db.closeSync();
    },
  };
}

export function openPlatformEventStore(options: OpenAppEventStoreOptions): OpenedAppEventStore {
  const driver = createExpoSqliteDriver(
    adaptExpoDatabase(openDatabaseSync(`${options.snapshotKey ?? STORE_NAME}.db`)),
  );
  return {
    store: SqliteEventStore.open(driver, {
      appVersions: options.appVersions,
      clock: options.clock,
    }),
    runtimeLabel: driver.label,
    snapshotAvailable: true,
  };
}
