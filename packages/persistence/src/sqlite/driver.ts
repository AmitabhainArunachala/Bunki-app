/**
 * The SQLite driver seam (WP-03; controller §7 CI substitution).
 *
 * There is **one** SQLite adapter in this package — one set of tables, one set
 * of statements, one set of invariants — and it talks to SQLite through this
 * four-method interface. Two bindings implement it:
 *
 *   - `expo-driver.ts` — `expo-sqlite` on a device. Native authority.
 *   - `node-driver.ts` — `node:sqlite`, used because CI has no native runtime.
 *
 * That is the whole CI-substitution mechanism, and its value depends entirely on
 * one property: the substitute must run **the same adapter code and the same
 * SQL**, not a parallel implementation that happens to behave similarly. If the
 * Node path had its own statements, a green ci-substitute run would be evidence
 * about the Node path and nothing else — and it is already, deliberately, not
 * evidence about the device (that is WP-11's claim and only WP-11's).
 *
 * The interface is therefore kept at the intersection of what both runtimes
 * offer, and kept synchronous, because both are: `expo-sqlite`'s `*Sync` family
 * and `node:sqlite`'s `DatabaseSync`. Asynchrony is added at the port boundary
 * (`src/port.ts`), where it belongs for a future IndexedDB adapter, not here
 * where it would only be pretence.
 */

/** Values SQLite can bind. `null` is a value; `undefined` is a missing argument. */
export type SqlValue = string | number | null;

export interface SqliteRunResult {
  readonly changes: number;
}

export interface SqliteDriver {
  /**
   * Which binding this is, for test names and reports. `ci-substitute` here is
   * what puts `ci-substitute` in the label of every test that runs on it.
   */
  readonly label: 'native' | 'ci-substitute';
  /** A human-readable identifier for the driver, recorded in evidence. */
  readonly driverName: string;

  /** Execute one or more statements with no bound parameters (DDL, PRAGMA). */
  exec(sql: string): void;

  /** Execute one parameterised statement that returns no rows. */
  run(sql: string, params?: readonly SqlValue[]): SqliteRunResult;

  /** Execute one parameterised query and materialise its rows. */
  all<TRow>(sql: string, params?: readonly SqlValue[]): TRow[];

  close(): void;
}

/**
 * Run `body` inside a transaction, rolling back on any throw.
 *
 * Every write path in the adapter goes through this. A batch that fails halfway
 * — a conflicting idempotency key on the third event, a purge citing a tombstone
 * that is not there — must leave the store exactly as it was, because a
 * partially applied batch produces derived state that no event log explains.
 *
 * `ROLLBACK` is itself wrapped: if the rollback fails the original error is
 * still what propagates, since that is the error that explains what happened.
 */
export function withTransaction<T>(driver: SqliteDriver, body: () => T): T {
  driver.exec('BEGIN IMMEDIATE');
  try {
    const result = body();
    driver.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      driver.exec('ROLLBACK');
    } catch {
      // Swallowed on purpose: the caller needs the failure that caused the
      // rollback, not the failure of the cleanup that followed it.
    }
    throw error;
  }
}
