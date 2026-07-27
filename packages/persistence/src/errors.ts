/**
 * Typed persistence errors (WP-03).
 *
 * The rule this file follows is the one `@bunki/domain/src/errors.ts` set: every
 * rejection path throws a named, coded object, never a bare `Error` and never a
 * silent `null`. A store that quietly declines to write is indistinguishable
 * from a store that wrote — and "unexplained data loss" is a controller §21.3
 * stop condition, not a bug report.
 *
 * Idempotency conflicts are deliberately **not** given a persistence-local
 * error class. They throw `@bunki/domain`'s `IdempotencyConflictError`, because
 * the semantics have to be identical on both sides of the port: replay refuses
 * to choose between two histories under one key (WP-02), and so does the store.
 * Two error types would be two chances for those semantics to drift apart.
 */

export const PERSISTENCE_ERROR_CODES = [
  'STORE_CLOSED',
  'MIGRATION_FAILED',
  'DESTRUCTIVE_MIGRATION_WITHOUT_ROLLBACK',
  'MIGRATION_SEQUENCE',
  'SCHEMA_VERSION_UNSUPPORTED',
  'PURGE_WITHOUT_TOMBSTONE',
  'STORE_CORRUPT',
  'DRIVER_UNAVAILABLE',
] as const;

export type PersistenceErrorCode = (typeof PERSISTENCE_ERROR_CODES)[number];

/** Base class for everything this package throws on its own behalf. */
export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;

  constructor(code: PersistenceErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isPersistenceError(value: unknown): value is PersistenceError {
  return value instanceof PersistenceError;
}

/** A method was called after `close()`. */
export class StoreClosedError extends PersistenceError {
  constructor(operation: string) {
    super('STORE_CLOSED', `Cannot ${operation}: this event store is closed.`);
  }
}

/** A forward or down migration threw; the transaction was rolled back. */
export class MigrationFailedError extends PersistenceError {
  readonly migrationId: number;
  readonly direction: 'up' | 'down';
  /**
   * The error the migration actually threw. Declared with `override` so it
   * lands on `Error.cause` rather than shadowing it — a caller that already
   * unwraps `cause` finds the driver's own error where it expects to.
   */
  override readonly cause: unknown;

  constructor(migrationId: number, name: string, direction: 'up' | 'down', cause: unknown) {
    super(
      'MIGRATION_FAILED',
      `Migration ${migrationId} (${name}) failed going ${direction}: ${cause instanceof Error ? cause.message : String(cause)}. The transaction was rolled back; the schema is unchanged.`,
    );
    this.migrationId = migrationId;
    this.direction = direction;
    this.cause = cause;
  }
}

/**
 * Controller §21.3(7), as a runtime refusal rather than a review convention.
 *
 * A migration that drops or rewrites data and cannot be undone is a one-way
 * door: if it is wrong, the evidence it destroyed is not recoverable and no
 * later replay can tell you what used to be there. The runner therefore refuses
 * to *run* such a migration rather than warning about it.
 */
export class DestructiveMigrationWithoutRollbackError extends PersistenceError {
  readonly migrationId: number;

  constructor(migrationId: number, name: string, detail: string) {
    super(
      'DESTRUCTIVE_MIGRATION_WITHOUT_ROLLBACK',
      `Migration ${migrationId} (${name}) is declared destructive but ${detail}. A destructive migration without verified rollback is a controller §21.3 stop condition, so this runner refuses to apply it.`,
    );
    this.migrationId = migrationId;
  }
}

/** The registered migration list is not a strictly ascending, gap-free sequence from 1. */
export class MigrationSequenceError extends PersistenceError {
  constructor(detail: string) {
    super(
      'MIGRATION_SEQUENCE',
      `Migration list is not a valid sequence — ${detail}. Ids must ascend from 1 with no gaps and no duplicates, or "schema version N" stops naming one schema.`,
    );
  }
}

/** The store on disk is at a schema version this build does not implement. */
export class SchemaVersionUnsupportedError extends PersistenceError {
  readonly observedVersion: number;
  readonly supportedVersion: number;

  constructor(observedVersion: number, supportedVersion: number) {
    super(
      'SCHEMA_VERSION_UNSUPPORTED',
      `Store is at schema version ${observedVersion}; this build implements ${supportedVersion}. Opening it would mean guessing at columns this build cannot see — the same fail-closed rule REQ-DM-04 applies to event versions, one layer down. Roll the store back with the down-migrations, or use a build that implements ${observedVersion}.`,
    );
    this.observedVersion = observedVersion;
    this.supportedVersion = supportedVersion;
  }
}

/**
 * A `ContentPurged` arrived for content whose thread was never tombstoned.
 *
 * The domain reducers reject this too (`thread.tombstone-before-purge`). The
 * store rejects it independently because it is the component that would
 * actually destroy the bytes, and a physical purge is not undoable by replay.
 */
export class PurgeWithoutTombstoneError extends PersistenceError {
  readonly purgeEventId: string;
  readonly tombstoneEventId: string;

  constructor(purgeEventId: string, tombstoneEventId: string, detail: string) {
    super(
      'PURGE_WITHOUT_TOMBSTONE',
      `ContentPurged ${purgeEventId} cites tombstone ${tombstoneEventId} but ${detail}. The purge was not performed and nothing was written.`,
    );
    this.purgeEventId = purgeEventId;
    this.tombstoneEventId = tombstoneEventId;
  }
}

/** Stored bytes could not be read back as the thing they claim to be. */
export class StoreCorruptError extends PersistenceError {
  readonly detail: string;

  constructor(detail: string) {
    super(
      'STORE_CORRUPT',
      `Event store contents failed validation on read — ${detail}. Reporting this loudly is deliberate: a store that silently drops rows it cannot parse produces derived state nobody can reproduce (controller §21.3(4)).`,
    );
    this.detail = detail;
  }
}

/**
 * The chosen SQLite driver is not present on this runtime.
 *
 * Thrown by the ci-substitute driver when `node:sqlite` is missing, which is the
 * honest outcome: the substitute suite did not run, so nothing may be reported
 * as having passed on it.
 */
export class DriverUnavailableError extends PersistenceError {
  readonly driver: string;

  constructor(driver: string, detail: string) {
    super('DRIVER_UNAVAILABLE', `SQLite driver ${driver} is unavailable — ${detail}`);
    this.driver = driver;
  }
}
