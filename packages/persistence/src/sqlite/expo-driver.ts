/**
 * The **native-authority** SQLite driver binding: `expo-sqlite` (WP-03,
 * controller §7; executed and claimed only by WP-11).
 *
 * ## Why this file declares the `expo-sqlite` surface instead of importing it
 *
 * It takes an already-opened database *structurally* — an object with
 * `execSync`, `runSync`, `getAllSync`, `closeSync` — rather than importing
 * `expo-sqlite` and calling `openDatabaseSync` itself. Three reasons, in order
 * of weight:
 *
 *   1. **Honesty about what CI proves.** If this package depended on
 *      `expo-sqlite`, a green CI run would involve the real package's typings
 *      and it would be tempting to read that as partial native verification. It
 *      is not. Native verification is a device claim (P0-CAP-15) and nothing in
 *      this repository's CI can produce it.
 *   2. **Who owns the runtime.** Opening a database is app wiring — a file path,
 *      a lifecycle, a platform. That belongs to the app (WP-05) and to the
 *      device checkpoint (WP-11), not to a package that must also run in Node.
 *   3. **No native module in the Node test path.** Importing `expo-sqlite` here
 *      would drag a native module into every `npm run test`, for no gain: the
 *      adapter under test is `../adapter.ts`, which is driver-agnostic by design.
 *
 * The cost is stated plainly because it is real: `ExpoSQLiteDatabaseLike` below
 * is **this repository's declaration of `expo-sqlite@57.0.1`'s synchronous API**
 * (verified from the npm registry at admission, licence MIT), not the package's
 * own typings. If a future `expo-sqlite` changes those signatures, TypeScript
 * here will not notice — the device run will. That is exactly the gap WP-11
 * exists to close, and it is recorded in the capsule as a WP-11 obligation:
 * *install the real package and compile this binding against its typings on the
 * device build*.
 *
 * `test/expo-binding.test.ts` drives the whole contract suite through this
 * binding using a database object that implements the declared shape over the
 * ci-substitute driver. That proves the *binding* is correct against the shape.
 * It proves nothing about `expo-sqlite`, and its test names say so.
 */

import type { SqliteDriver, SqliteRunResult, SqlValue } from './driver.ts';

/**
 * The subset of `expo-sqlite`'s `SQLiteDatabase` this adapter uses, declared
 * from `expo-sqlite@57.0.1`'s documented synchronous API.
 *
 * Only four methods. A narrow declaration is the point: every method here is one
 * more signature that can drift from upstream unnoticed, so the adapter is
 * written to need as few as possible.
 */
export interface ExpoSQLiteDatabaseLike {
  /** `execSync(source)` — one or more statements, no bound parameters. */
  execSync(source: string): void;
  /** `runSync(source, params)` — returns `{ lastInsertRowId, changes }`. */
  runSync(source: string, params: readonly SqlValue[]): { readonly changes: number };
  /** `getAllSync<T>(source, params)` — materialises every row. */
  getAllSync<TRow>(source: string, params: readonly SqlValue[]): TRow[];
  closeSync(): void;
}

class ExpoSqliteDriver implements SqliteDriver {
  readonly label = 'native';
  readonly driverName = 'expo-sqlite (device)';

  readonly #db: ExpoSQLiteDatabaseLike;

  constructor(db: ExpoSQLiteDatabaseLike) {
    this.#db = db;
  }

  exec(sql: string): void {
    this.#db.execSync(sql);
  }

  run(sql: string, params: readonly SqlValue[] = []): SqliteRunResult {
    return { changes: this.#db.runSync(sql, params).changes };
  }

  all<TRow>(sql: string, params: readonly SqlValue[] = []): TRow[] {
    return this.#db.getAllSync<TRow>(sql, params);
  }

  close(): void {
    this.#db.closeSync();
  }
}

/**
 * Wrap an open `expo-sqlite` database as a driver.
 *
 * Usage on a device (WP-05 wiring / WP-11 checkpoint):
 *
 * ```ts
 * import * as SQLite from 'expo-sqlite';
 * const driver = createExpoSqliteDriver(SQLite.openDatabaseSync('bunki.db'));
 * const store = SqliteEventStore.open(driver, { clock, appVersions });
 * ```
 *
 * The returned driver is labelled `native`. Producing that label is not the
 * same as earning it: only evidence from an actual device run may be reported
 * as native verification.
 */
export function createExpoSqliteDriver(db: ExpoSQLiteDatabaseLike): SqliteDriver {
  return new ExpoSqliteDriver(db);
}
