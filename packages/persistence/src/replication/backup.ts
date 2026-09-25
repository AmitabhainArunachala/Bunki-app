import {
  createReplica,
  parseSyncBinding,
  parseAnySyncOperation as parseSyncOperation,
  planReceive,
  SyncValidationError,
  type ReplicaPolicy,
  type SyncOperation,
  type SyncReplica,
  type SyncScope,
} from '@bunki/sync';

import { ReplicationStoreError } from './errors.ts';
import { assertCounter, assertLocalKey, encodeLocalJson } from './json.ts';
import type { RestoreCommit } from './port.ts';

/** Operation history only: this is not a complete learner/document backup.
 * Header identity is checked against already-authorized current policy; it
 * never supplies session authority, device allocation, cursors or outbox acks.
 * A new device must already have the same learner scope and a fresh actor.
 * Callers still admit restored source quotations and portable document data.
 */
export interface OperationJournalBackup {
  readonly format: 'kairo-operation-journal';
  readonly v: 1;
  readonly scope: SyncScope;
  readonly schemaEpoch: ReplicaPolicy['schemaEpoch'];
  readonly deletionEpoch: number;
  readonly mergePolicy: ReplicaPolicy['mergePolicy'];
  readonly operations: readonly SyncOperation[];
  readonly sha256: string;
}

type Fields = Record<string, PropertyDescriptor>;
function fieldsOf(raw: unknown, keys: readonly string[]): Fields {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) ||
    Object.getOwnPropertySymbols(raw).length
  )
    throw new ReplicationStoreError('invalid-request');
  const fields = Object.getOwnPropertyDescriptors(raw);
  if (Object.keys(fields).sort().join('\0') !== [...keys].sort().join('\0'))
    throw new ReplicationStoreError('invalid-request');
  return fields;
}
function valueOf(fields: Fields, key: string): unknown {
  const field = fields[key];
  if (!field || !field.enumerable || !('value' in field))
    throw new ReplicationStoreError('invalid-request');
  return field.value;
}

function checkedHeader(raw: unknown, trustedPolicy: ReplicaPolicy) {
  const policy = createReplica(trustedPolicy).policy;
  const fields = fieldsOf(raw, [
    'format',
    'v',
    'scope',
    'schemaEpoch',
    'deletionEpoch',
    'mergePolicy',
    'operations',
    'sha256',
  ]);
  if (valueOf(fields, 'format') !== 'kairo-operation-journal' || valueOf(fields, 'v') !== 1)
    throw new ReplicationStoreError('unsupported-schema');
  const scope = fieldsOf(valueOf(fields, 'scope'), ['accountId', 'learnerId']);
  const binding = parseSyncBinding({
    accountId: valueOf(scope, 'accountId'),
    learnerId: valueOf(scope, 'learnerId'),
    sessionId: policy.binding.sessionId,
  });
  // Do not access the operations member or its payloads before current scope,
  // epoch and merge policy have all been admitted.
  if (
    binding.accountId !== policy.binding.accountId ||
    binding.learnerId !== policy.binding.learnerId
  )
    throw new SyncValidationError('ownership-mismatch');
  if (
    valueOf(fields, 'schemaEpoch') !== policy.schemaEpoch ||
    valueOf(fields, 'deletionEpoch') !== policy.deletionEpoch
  )
    throw new SyncValidationError('epoch-mismatch');
  if (valueOf(fields, 'mergePolicy') !== policy.mergePolicy)
    throw new SyncValidationError('policy-mismatch');
  return { fields, policy };
}

/** Validate without adopting backup authority. The whole input remains subject
 * to the local JSON budget; each immutable operation uses the closed sync schema.
 */
export function parseOperationJournalBackup(
  raw: unknown,
  trustedPolicy: ReplicaPolicy,
): OperationJournalBackup {
  const { fields } = checkedHeader(raw, trustedPolicy);
  valueOf(fields, 'operations');
  const backup = encodeLocalJson(raw).value as unknown as OperationJournalBackup;
  if (!Array.isArray(backup.operations) || typeof backup.sha256 !== 'string')
    throw new ReplicationStoreError('invalid-request');
  const { sha256, ...body } = backup;
  if (encodeLocalJson(body).sha256 !== sha256) throw new ReplicationStoreError('invalid-request');
  for (const operation of backup.operations) parseSyncOperation(operation);
  return backup;
}

/** Exports every operation, including pending/quarantined facts. The replica
 * must be a current in-process handle rebuilt from a trusted durable journal.
 */
export function exportOperationJournal(replica: SyncReplica): OperationJournalBackup {
  planReceive(replica, { binding: replica.policy.binding, operations: [] });
  const { accountId, learnerId } = replica.policy.binding;
  const body = {
    format: 'kairo-operation-journal' as const,
    v: 1 as const,
    scope: { accountId, learnerId },
    schemaEpoch: replica.policy.schemaEpoch,
    deletionEpoch: replica.policy.deletionEpoch,
    mergePolicy: replica.policy.mergePolicy,
    operations: replica.operations,
  };
  return encodeLocalJson({ ...body, sha256: encodeLocalJson(body).sha256 })
    .value as unknown as OperationJournalBackup;
}

/** @internal Called within the adapter's transaction after reading its current
 * trusted policy. No incoming operation or document getter runs before binding
 * and backup header validation; copied data is immutable before any write.
 */
export function prepareRestoreRequest(raw: RestoreCommit, policy: ReplicaPolicy): RestoreCommit {
  const fields = fieldsOf(raw, ['restoreId', 'binding', 'expectedRevision', 'mutations', 'backup']);
  const binding = parseSyncBinding(encodeLocalJson(valueOf(fields, 'binding')).value);
  planReceive(createReplica(policy), { binding, operations: [] });
  const backup = parseOperationJournalBackup(valueOf(fields, 'backup'), policy);
  const request = encodeLocalJson({
    restoreId: valueOf(fields, 'restoreId'),
    binding,
    expectedRevision: valueOf(fields, 'expectedRevision'),
    mutations: valueOf(fields, 'mutations'),
    backup,
  }).value as unknown as RestoreCommit;
  assertLocalKey(request.restoreId);
  assertCounter(request.expectedRevision);
  if (
    !Array.isArray(request.mutations) ||
    request.mutations.length > 256 ||
    request.mutations.length + backup.operations.length === 0
  )
    throw new ReplicationStoreError('invalid-request');
  const seen = new Set<string>();
  for (const mutation of request.mutations) {
    if (
      !mutation ||
      typeof mutation !== 'object' ||
      Array.isArray(mutation) ||
      (mutation.kind !== 'put' && mutation.kind !== 'delete')
    )
      throw new ReplicationStoreError('invalid-request');
    fieldsOf(
      mutation,
      mutation.kind === 'put'
        ? ['kind', 'collection', 'id', 'value']
        : ['kind', 'collection', 'id'],
    );
    assertLocalKey(mutation.collection);
    assertLocalKey(mutation.id);
    const key = JSON.stringify([mutation.collection, mutation.id]);
    if (seen.has(key)) throw new ReplicationStoreError('invalid-request');
    seen.add(key);
  }
  return request;
}

/** @internal Planner chunking never commits a partial restore. Both adapters
 * keep this entire plan and all following writes within one durable transaction.
 */
export function planJournalRestore(replica: SyncReplica, backup: OperationJournalBackup) {
  let next = replica;
  const insert: SyncOperation[] = [];
  for (let start = 0; start < backup.operations.length; start += 1000) {
    const plan = planReceive(next, {
      binding: replica.policy.binding,
      operations: backup.operations.slice(start, start + 1000),
    });
    next = plan.next;
    insert.push(...plan.insert);
  }
  return { next, insert };
}
