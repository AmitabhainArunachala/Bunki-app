/**
 * The migration runner (WP-03; controller §7, §16, §21.3(7)).
 *
 * Forward migrations, down-migrations, and one refusal:
 *
 * > destructive migration without verified rollback = stop condition (§21.3(7))
 *
 * The runner implements that as a *runtime refusal*, before any statement of the
 * migration executes. Three checks stand between a migration and the database,
 * and each exists because the alternative is unrecoverable:
 *
 *   1. **Sequence.** Ids ascend from 1 with no gaps or duplicates, so "schema
 *      version N" names exactly one schema. Two migrations sharing an id would
 *      make the version number a guess.
 *   2. **Rollback coverage.** Every migration ships a non-empty `down`. Not only
 *      destructive ones: controller §16 requires every WP to be revertable, and
 *      a schema change with no way back turns a revertable code change into a
 *      one-way data change.
 *   3. **Honest declaration.** `classifyStatements(up)` reads the SQL and must
 *      agree with the migration's own `destructive` flag. A `DROP TABLE`
 *      labelled `destructive: false` is the exact shape of the accident §21.3(7)
 *      is written to prevent, and a flag nobody checks would not prevent it.
 *
 * Every direction runs inside a transaction (SQLite has transactional DDL), so a
 * migration that throws leaves the schema untouched rather than half-applied.
 *
 * ## What "verified rollback" means here
 *
 * Not a boolean. A migration's rollback counts as verified when
 * `packages/persistence/test/migrations.test.ts` has driven it: for every
 * migration, up → down → up, asserting that the schema returns to exactly its
 * prior shape (compared as a canonical `sqlite_master` dump) and that the event
 * log still reads back identically. The runner's checks are the guard; the test
 * is the verification. Neither alone is enough — a guard nobody exercises rots,
 * and a test on an unguarded runner only proves the migrations that exist today.
 */

import {
  DestructiveMigrationWithoutRollbackError,
  MigrationFailedError,
  MigrationSequenceError,
} from '../errors.ts';
import { withTransaction, type SqliteDriver } from '../sqlite/driver.ts';
import { classifyStatements, type AppliedMigrationRecord, type Migration } from './types.ts';

/** Bookkeeping table. Created outside the migration sequence — it *is* the sequence. */
export const MIGRATIONS_TABLE = 'bunki_schema_migrations';

const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

export function ensureMigrationsTable(driver: SqliteDriver): void {
  driver.exec(CREATE_MIGRATIONS_TABLE);
}

/** Check 1: ids ascend from 1, gap-free, duplicate-free. */
export function assertMigrationSequence(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.id !== expected) {
      throw new MigrationSequenceError(
        `migration at position ${index} has id ${migration.id}, expected ${expected}`,
      );
    }
  });
}

/** Checks 2 and 3, for one migration. */
export function assertRollbackContract(migration: Migration): void {
  if (migration.down.length === 0) {
    throw new DestructiveMigrationWithoutRollbackError(
      migration.id,
      migration.name,
      'ships no down-migration',
    );
  }

  const verdict = classifyStatements(migration.up);
  if (verdict.destructive && !migration.destructive) {
    throw new DestructiveMigrationWithoutRollbackError(
      migration.id,
      migration.name,
      `declares destructive: false while its forward statements contain ${verdict.reasons.join(', ')}. The declaration is checked against the SQL precisely so a mislabelled migration cannot walk past this guard`,
    );
  }
}

export function assertMigrationSetValid(migrations: readonly Migration[]): void {
  assertMigrationSequence(migrations);
  migrations.forEach(assertRollbackContract);
}

export function appliedMigrations(driver: SqliteDriver): readonly AppliedMigrationRecord[] {
  ensureMigrationsTable(driver);
  return driver
    .all<{ id: number; name: string; applied_at: string }>(
      `SELECT id, name, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`,
    )
    .map((row) => ({ id: row.id, name: row.name, appliedAt: row.applied_at }));
}

/** The highest applied migration id, or 0 for an empty store. */
export function currentSchemaVersion(driver: SqliteDriver): number {
  const applied = appliedMigrations(driver);
  return applied.length === 0 ? 0 : (applied[applied.length - 1]?.id ?? 0);
}

function runStatements(
  driver: SqliteDriver,
  migration: Migration,
  direction: 'up' | 'down',
  statements: readonly string[],
): void {
  try {
    withTransaction(driver, () => {
      statements.forEach((statement) => driver.exec(statement));
      if (direction === 'up') {
        driver.run(`INSERT INTO ${MIGRATIONS_TABLE} (id, name, applied_at) VALUES (?, ?, ?)`, [
          migration.id,
          migration.name,
          nowMarker(),
        ]);
      } else {
        driver.run(`DELETE FROM ${MIGRATIONS_TABLE} WHERE id = ?`, [migration.id]);
      }
    });
  } catch (error) {
    throw new MigrationFailedError(migration.id, migration.name, direction, error);
  }
}

/**
 * The applied-at stamp.
 *
 * Deliberately *not* taken from the injected domain clock: this is schema
 * bookkeeping, it never enters an event, an export, or derived state, and
 * threading a clock through migrations would imply it does. It is a
 * monotonically-formatted marker for a human reading the table during an
 * incident, and nothing reads it programmatically.
 */
function nowMarker(): string {
  return new Date().toISOString();
}

export interface MigrateResult {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly number[];
  readonly rolledBack: readonly number[];
}

/**
 * Move the store to `target` (default: the latest migration).
 *
 * Migrating *down* is a first-class operation, not an emergency escape hatch:
 * the only way a down-migration can be trusted in an incident is if the ordinary
 * test run drives it, and the only way the ordinary test run can drive it is if
 * it is on the normal API.
 */
export function migrateTo(
  driver: SqliteDriver,
  migrations: readonly Migration[],
  target: number = migrations.length,
): MigrateResult {
  assertMigrationSetValid(migrations);
  ensureMigrationsTable(driver);

  if (target < 0 || target > migrations.length) {
    throw new MigrationSequenceError(
      `target schema version ${target} is outside the known range 0..${migrations.length}`,
    );
  }

  const from = currentSchemaVersion(driver);
  const applied: number[] = [];
  const rolledBack: number[] = [];

  if (target > from) {
    migrations
      .filter((migration) => migration.id > from && migration.id <= target)
      .forEach((migration) => {
        assertRollbackContract(migration);
        runStatements(driver, migration, 'up', migration.up);
        applied.push(migration.id);
      });
  } else if (target < from) {
    [...migrations]
      .reverse()
      .filter((migration) => migration.id > target && migration.id <= from)
      .forEach((migration) => {
        runStatements(driver, migration, 'down', migration.down);
        rolledBack.push(migration.id);
      });
  }

  return { from, to: currentSchemaVersion(driver), applied, rolledBack };
}

/**
 * A canonical rendering of the schema, for proving that up → down → up returns
 * the database to the same shape rather than to a similar one.
 *
 * `sqlite_master` holds the exact `CREATE` text of every table, index, and
 * trigger. Sorting by name makes the rendering independent of creation order,
 * so a rollback that recreates objects in a different sequence still compares
 * equal — while a rollback that forgets an index does not.
 */
export function schemaFingerprint(driver: SqliteDriver): string {
  return driver
    .all<{ type: string; name: string; sql: string | null }>(
      `SELECT type, name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type ASC, name ASC`,
    )
    .map((row) => `${row.type} ${row.name}\n${(row.sql ?? '').replace(/\s+/g, ' ').trim()}`)
    .join('\n---\n');
}
