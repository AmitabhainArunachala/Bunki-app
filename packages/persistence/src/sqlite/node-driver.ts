/**
 * The **ci-substitute** SQLite driver (WP-03; controller §7).
 *
 * > CI has no native runtime, so the port contract-test suite runs the same
 * > adapter SQL/code against a Node SQLite driver, explicitly labeled
 * > `ci-substitute` in test names and reports; a ci-substitute pass never counts
 * > as native verification (that is WP-11's, and only WP-11's, claim).
 *
 * Every test that runs on this driver carries `ci-substitute` in its name. That
 * is not decoration and not a convention someone may tidy away: it is the only
 * thing standing between "the adapter's SQL and transactions are correct" — what
 * this driver can show — and "persistence works on the device", which it cannot
 * show at all. `runtimeLabel` carries the same word into `AppendResult`
 * consumers and reports so the label survives the trip from test name to
 * evidence capsule.
 *
 * ## Driver choice, verified rather than assumed (controller §14)
 *
 * Chosen: **`node:sqlite`**, the SQLite binding built into Node itself
 * (`DatabaseSync`). Verified present and working on the pinned toolchain, Node
 * **v22.22.2** — the version this repository's `engines` field and CI's
 * `actions/setup-node@v4` (`node-version: '22'`) both select. It landed in Node
 * 22.5.0; on 22.22.2 it is importable with no flag and emits an
 * `ExperimentalWarning`, which is why `NODE_SQLITE_STATUS` below records the
 * stability caveat instead of hiding it.
 *
 * Licence: no new dependency is added, so nothing new constrains the operator's
 * pending licence decision (OD-09, controller §4). The binding ships with the
 * Node runtime, under Node's own MIT licence.
 *
 * Rejected: **`better-sqlite3`**, verified from the npm registry at
 * `13.0.1`, licence `MIT` (`npm view better-sqlite3 version license`,
 * 2026-07-27). Compatible, and it would have been an acceptable choice — it was
 * not taken because it is a native addon requiring `node-gyp` compilation in
 * every CI run, and because adding a dependency to satisfy a *substitute* for a
 * runtime we are explicitly not claiming to have verified is cost without
 * evidence. Recorded here so the alternative is a documented decision rather
 * than an unexamined default.
 */

import { DatabaseSync } from 'node:sqlite';

import { DriverUnavailableError } from '../errors.ts';
import type { SqliteDriver, SqliteRunResult, SqlValue } from './driver.ts';

/**
 * The stability of the substitute, stated where a reader of the evidence will
 * see it. `node:sqlite` is marked experimental in Node 22; an API change would
 * break the substitute suite loudly, which is the acceptable failure — a
 * substitute that silently changed behaviour would not be.
 */
export const NODE_SQLITE_STATUS = {
  module: 'node:sqlite',
  verifiedOnNodeVersion: 'v22.22.2',
  availableSince: 'Node 22.5.0',
  stability: 'experimental in Node 22 (emits ExperimentalWarning); pinned by the CI Node major',
  license: 'ships with Node.js (MIT); no npm dependency added',
} as const;

/** The pinned identity of the substitute, for test names and reports. */
export const CI_SUBSTITUTE_LABEL = 'ci-substitute';

export interface NodeSqliteDriverOptions {
  /** File path, or `:memory:`. A file path is what T-01 needs to reopen. */
  readonly location: string;
}

class NodeSqliteDriver implements SqliteDriver {
  readonly label = CI_SUBSTITUTE_LABEL;
  readonly driverName = `node:sqlite (${NODE_SQLITE_STATUS.verifiedOnNodeVersion})`;

  readonly #db: DatabaseSync;

  constructor(location: string) {
    this.#db = new DatabaseSync(location);
  }

  exec(sql: string): void {
    this.#db.exec(sql);
  }

  run(sql: string, params: readonly SqlValue[] = []): SqliteRunResult {
    const result = this.#db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  all<TRow>(sql: string, params: readonly SqlValue[] = []): TRow[] {
    return this.#db.prepare(sql).all(...params) as TRow[];
  }

  close(): void {
    this.#db.close();
  }
}

/**
 * Open a ci-substitute driver.
 *
 * Throws `DriverUnavailableError` rather than degrading if the runtime cannot
 * provide SQLite. A substitute that quietly fell back to something else would
 * produce a green suite that tested a different store — which is the one
 * outcome worse than a red one.
 */
export function openNodeSqliteDriver(options: NodeSqliteDriverOptions): SqliteDriver {
  if (typeof DatabaseSync !== 'function') {
    throw new DriverUnavailableError(
      'node:sqlite',
      `this runtime exposes no DatabaseSync constructor. ${NODE_SQLITE_STATUS.module} is available from ${NODE_SQLITE_STATUS.availableSince}; the ci-substitute suite cannot run here and nothing may be reported as having passed on it.`,
    );
  }
  return new NodeSqliteDriver(options.location);
}
