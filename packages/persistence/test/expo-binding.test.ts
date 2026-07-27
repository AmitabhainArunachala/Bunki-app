/**
 * The `expo-sqlite` binding, checked against the shape it declares (WP-03).
 *
 * **This file makes no native claim and cannot.** It runs in Node, against a
 * recording fake. What it proves is narrow and worth stating exactly: that
 * `createExpoSqliteDriver` maps each of the four driver methods onto the
 * `expo-sqlite` synchronous method this repository says it maps onto, with the
 * arguments unchanged.
 *
 * What it does not prove — and what nothing in CI can — is that
 * `ExpoSQLiteDatabaseLike` still matches the real `expo-sqlite@57.0.1` typings,
 * because this package deliberately does not depend on that module (see
 * `src/sqlite/expo-driver.ts` for why). Closing that gap is a **WP-11
 * obligation**: install the real package on the device build and compile the
 * binding against its own types. Until that happens, native verification is
 * UNVERIFIED (P0-CAP-15).
 *
 * The tests are deliberately *not* the port contract suite. Running the suite
 * through this binding would mint a store whose `runtimeLabel` is `native` while
 * executing in CI, and a report containing passing `[native]` test names is
 * exactly the false assurance controller §7 forbids.
 */

import { describe, expect, it } from 'vitest';

import {
  createExpoSqliteDriver,
  type ExpoSQLiteDatabaseLike,
  type SqlValue,
} from '../src/index.ts';

interface Call {
  readonly method: string;
  readonly sql?: string;
  readonly params?: readonly SqlValue[];
}

function createRecordingDatabase(rows: readonly unknown[] = []): {
  readonly db: ExpoSQLiteDatabaseLike;
  readonly calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    db: {
      execSync(source) {
        calls.push({ method: 'execSync', sql: source });
      },
      runSync(source, params) {
        calls.push({ method: 'runSync', sql: source, params });
        return { changes: 7 };
      },
      getAllSync<TRow>(source: string, params: readonly SqlValue[]): TRow[] {
        calls.push({ method: 'getAllSync', sql: source, params });
        return rows as TRow[];
      },
      closeSync() {
        calls.push({ method: 'closeSync' });
      },
    },
  };
}

describe('expo-sqlite binding (shape only — NOT native verification)', () => {
  it('maps exec/run/all/close onto the declared expo-sqlite sync methods', () => {
    const recording = createRecordingDatabase([{ a: 1 }]);
    const driver = createExpoSqliteDriver(recording.db);

    driver.exec('PRAGMA journal_mode = WAL');
    const runResult = driver.run('INSERT INTO t VALUES (?)', ['x']);
    const rows = driver.all<{ a: number }>('SELECT a FROM t WHERE b = ?', [2]);
    driver.close();

    expect(recording.calls).toEqual([
      { method: 'execSync', sql: 'PRAGMA journal_mode = WAL' },
      { method: 'runSync', sql: 'INSERT INTO t VALUES (?)', params: ['x'] },
      { method: 'getAllSync', sql: 'SELECT a FROM t WHERE b = ?', params: [2] },
      { method: 'closeSync' },
    ]);
    expect(runResult.changes).toBe(7);
    expect(rows).toEqual([{ a: 1 }]);
  });

  it('defaults missing parameters to an empty list rather than passing undefined', () => {
    const recording = createRecordingDatabase();
    const driver = createExpoSqliteDriver(recording.db);

    driver.run('DELETE FROM t');
    driver.all('SELECT 1');

    expect(recording.calls.map((call) => call.params)).toEqual([[], []]);
  });

  it('labels itself native, which is a statement about the runtime it is for, not a result', () => {
    const driver = createExpoSqliteDriver(createRecordingDatabase().db);

    expect(driver.label).toBe('native');
    // Producing the label is not earning it. Only device evidence from WP-11 may
    // be reported as native verification; this assertion exists so that anyone
    // reading the label in code finds the caveat attached to it.
    expect(driver.driverName).toContain('expo-sqlite');
  });
});
