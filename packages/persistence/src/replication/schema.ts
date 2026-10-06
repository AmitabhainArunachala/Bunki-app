import type { SqliteDriver } from '../sqlite/driver.ts';
import { ReplicationStoreError } from './errors.ts';

export const REPLICATION_SCHEMA_VERSION = 1;
const scope = 'account_id TEXT NOT NULL, learner_id TEXT NOT NULL';
const profileKey = 'PRIMARY KEY (account_id, learner_id)';
const profileReference =
  'FOREIGN KEY (account_id, learner_id) REFERENCES kairo_replication_profiles(account_id, learner_id)';
const operationReference =
  'FOREIGN KEY (account_id, learner_id, op_id) REFERENCES kairo_replication_operations(account_id, learner_id, op_id)';

/** Separate version/table namespace: DomainEvent v1 and its migrations are untouched. */
export function initializeReplicationSchema(driver: SqliteDriver): void {
  driver.exec(`CREATE TABLE IF NOT EXISTS kairo_replication_schema (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL)`);
  const version = driver.all<{ version: number }>(
    'SELECT version FROM kairo_replication_schema WHERE singleton = 1',
  )[0]?.version;
  if (version !== undefined && version !== REPLICATION_SCHEMA_VERSION)
    throw new ReplicationStoreError('unsupported-schema');
  if (version !== undefined) return;
  driver.exec(`
    CREATE TABLE kairo_replication_profiles (
      ${scope}, revision INTEGER NOT NULL CHECK (revision >= 0),
      policy TEXT NOT NULL, policy_sha256 TEXT NOT NULL,
      view TEXT NOT NULL, view_sha256 TEXT NOT NULL, ${profileKey});
    CREATE TABLE kairo_replication_actors (
      ${scope}, device_id TEXT NOT NULL, incarnation_id TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence >= 0), last_op_id TEXT, last_op_sha256 TEXT,
      PRIMARY KEY (account_id, learner_id, device_id, incarnation_id), ${profileReference});
    CREATE TABLE kairo_replication_documents (
      ${scope}, collection TEXT NOT NULL, document_id TEXT NOT NULL,
      payload TEXT NOT NULL, sha256 TEXT NOT NULL,
      PRIMARY KEY (account_id, learner_id, collection, document_id), ${profileReference});
    CREATE TABLE kairo_replication_operations (
      ${scope}, op_id TEXT NOT NULL, sha256 TEXT NOT NULL,
      device_id TEXT NOT NULL, incarnation_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      payload TEXT NOT NULL, payload_sha256 TEXT NOT NULL,
      PRIMARY KEY (account_id, learner_id, op_id),
      UNIQUE (account_id, learner_id, device_id, incarnation_id, sequence), ${profileReference});
    CREATE TABLE kairo_replication_outbox (
      ${scope}, op_id TEXT NOT NULL, sha256 TEXT NOT NULL,
      acknowledged INTEGER NOT NULL CHECK (acknowledged IN (0, 1)),
      PRIMARY KEY (account_id, learner_id, op_id), ${operationReference});
    CREATE TABLE kairo_replication_inbox (
      ${scope}, channel_id TEXT NOT NULL, op_id TEXT NOT NULL, sha256 TEXT NOT NULL,
      PRIMARY KEY (account_id, learner_id, channel_id, op_id), ${operationReference});
    CREATE TABLE kairo_replication_checkpoints (
      ${scope}, channel_id TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY (account_id, learner_id, channel_id), ${profileReference});
    CREATE TABLE kairo_replication_receipts (
      ${scope}, kind TEXT NOT NULL, change_id TEXT NOT NULL, request_sha256 TEXT NOT NULL,
      revision INTEGER NOT NULL, operations TEXT NOT NULL, operations_sha256 TEXT NOT NULL,
      PRIMARY KEY (account_id, learner_id, kind, change_id), ${profileReference});
  `);
  driver.run('INSERT INTO kairo_replication_schema (singleton, version) VALUES (1, ?)', [
    REPLICATION_SCHEMA_VERSION,
  ]);
}
