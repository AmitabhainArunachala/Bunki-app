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

import type { UncertaintyAnnotation } from '../store.ts';
import {
  parseStoredAnnotation,
  STORE_NAME,
  type OpenAppEventStoreOptions,
  type OpenedAppEventStore,
  type UncertaintyAnnotationStore,
} from './shared.ts';

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

/**
 * The uncertainty-dimension side-store on device (R4-A, P2-18): one two-column
 * table in its **own** database file, beside the event store's.
 *
 * Its own file rather than a table in `SqliteEventStore`'s database, because
 * that adapter owns its schema through its migration runner and a foreign table
 * appearing in its file would be this seam editing another module's contract
 * from outside. Rows are validated by the same `parseStoredAnnotation` the web
 * store uses, so a corrupt payload is dropped identically on both platforms.
 *
 * **Producing this on the native code path is not evidence of native
 * behaviour** — the same WP-11 device-run rule the event store states applies
 * here unchanged (P0-CAP-15).
 */
function createNativeAnnotationStore(databaseName: string): UncertaintyAnnotationStore {
  const db = openDatabaseSync(databaseName);
  db.execSync(
    'CREATE TABLE IF NOT EXISTS uncertainty_annotations (thread_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL)',
  );
  return {
    read: () => {
      const entries = new Map<string, UncertaintyAnnotation>();
      const rows = db.getAllSync<{ thread_id: string; payload: string }>(
        'SELECT thread_id, payload FROM uncertainty_annotations',
        [],
      );
      for (const row of rows) {
        try {
          const annotation = parseStoredAnnotation(JSON.parse(row.payload));
          if (annotation !== null) entries.set(row.thread_id, annotation);
        } catch {
          // A row that does not parse is dropped, never guessed at — the same
          // fail-closed rule as the web store.
        }
      }
      return entries;
    },
    write: (threadId, annotation) => {
      if (annotation === null) {
        db.runSync('DELETE FROM uncertainty_annotations WHERE thread_id = ?', [threadId]);
        return;
      }
      db.runSync(
        'INSERT OR REPLACE INTO uncertainty_annotations (thread_id, payload) VALUES (?, ?)',
        [threadId, JSON.stringify(annotation)],
      );
    },
  };
}

export function openPlatformEventStore(options: OpenAppEventStoreOptions): OpenedAppEventStore {
  const baseName = options.snapshotKey ?? STORE_NAME;
  const driver = createExpoSqliteDriver(adaptExpoDatabase(openDatabaseSync(`${baseName}.db`)));
  return {
    store: SqliteEventStore.open(driver, {
      appVersions: options.appVersions,
      clock: options.clock,
    }),
    runtimeLabel: driver.label,
    snapshotAvailable: true,
    annotations: createNativeAnnotationStore(`${baseName}-annotations.db`),
  };
}
