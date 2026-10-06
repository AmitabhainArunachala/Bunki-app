export type ReplicationStoreErrorCode =
  | 'invalid-request'
  | 'closed'
  | 'reopen-required'
  | 'stale-revision'
  | 'checkpoint-conflict'
  | 'change-identity-conflict'
  | 'local-actor-conflict'
  | 'sequence-exhausted'
  | 'corrupt-store'
  | 'unsupported-schema'
  | 'policy-mismatch';

/** Codes only: document contents, credentials and account identifiers are not diagnostics. */
export class ReplicationStoreError extends Error {
  constructor(readonly code: ReplicationStoreErrorCode) {
    super(`Replication store: ${code}`);
    this.name = 'ReplicationStoreError';
  }
}
