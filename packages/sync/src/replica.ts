import { inputHashOf } from '@bunki/ai/hash';
import { z } from 'zod';

import {
  compare,
  countSchema,
  immutable,
  parse,
  SyncValidationError,
  type DeepReadonly,
} from './common.ts';
import {
  bindingSchema,
  operationReference,
  parseAnySyncOperation,
  referencesOf,
  SYNC_MERGE_POLICY,
  SYNC_SCHEMA_EPOCH,
  targetOf,
  type EntityTarget,
  type OperationRef,
  type SyncBinding,
  type SyncOperation,
} from './operations.ts';

const policySchema = z.strictObject({
  binding: bindingSchema,
  schemaEpoch: z.literal(SYNC_SCHEMA_EPOCH),
  deletionEpoch: countSchema,
  mergePolicy: z.literal(SYNC_MERGE_POLICY),
});
export type ReplicaPolicy = DeepReadonly<z.infer<typeof policySchema>>;

export interface PendingOperation {
  readonly operation: OperationRef;
  /** Direct missing or not-yet-ready references. Nothing is silently skipped. */
  readonly waitingFor: readonly OperationRef[];
}

export interface QuarantinedOperation {
  readonly operation: OperationRef;
  readonly reason: 'causal-reference-conflict' | 'causal-cycle' | 'quarantined-dependency';
}

export interface ContentIdentityConflict {
  readonly versionId: string;
  readonly operations: readonly OperationRef[];
}

export interface EntityProjection {
  readonly target: EntityTarget;
  /** Active content only. All historical bytes remain in the operation journal. */
  readonly versions: readonly OperationRef[];
  /** Explicit unsuperseded versions/intents, never timestamp or furthest-position winners. */
  readonly heads: readonly OperationRef[];
  readonly tombstones: readonly OperationRef[];
  readonly activeRestoreGenerations: readonly OperationRef[];
  /** Ambiguous application version labels do not invalidate causal deletion facts. */
  readonly identityConflicts: readonly ContentIdentityConflict[];
  readonly requiresChoice: boolean;
}

export interface ReviewReconciliation {
  readonly cardId: string;
  readonly scheduleRevisionId: string;
  readonly attempts: readonly OperationRef[];
  readonly reason:
    'attempt-identity-conflict' | 'concurrent-schedule-revision' | 'reused-schedule-revision';
}

export interface SyncProjection {
  readonly entities: readonly EntityProjection[];
  readonly suppressed: readonly OperationRef[];
  readonly reviewReconciliations: readonly ReviewReconciliation[];
  /** Replication does not mint evidence, approve admissions or compute FSRS intervals. */
  readonly scheduling: 'not-computed';
}

export interface SyncReplica {
  readonly policy: ReplicaPolicy;
  /** Causally sorted immutable journal, including explicitly pending arrivals. */
  readonly operations: readonly SyncOperation[];
  readonly ready: readonly OperationRef[];
  readonly pending: readonly PendingOperation[];
  readonly quarantined: readonly QuarantinedOperation[];
  readonly projection: SyncProjection;
}

export interface ReceiveDelivery {
  /** Captured when the asynchronous request starts; never replaced with current identity. */
  readonly binding: SyncBinding;
  readonly operations: readonly unknown[];
}

export interface ReceivePlan {
  readonly next: SyncReplica;
  /** These operation bytes and dedup markers belong in the same local transaction. */
  readonly insert: readonly SyncOperation[];
  readonly duplicates: readonly OperationRef[];
  /** Newly ready includes earlier pending operations released by this delivery. */
  readonly newlyReady: readonly OperationRef[];
  /** Replacing the projection can suppress formerly visible versions when a delete arrives. */
  readonly projectionChanged: boolean;
}

// A restored backup cannot masquerade as a current replica merely by copying its shape.
// Rebuild from the trusted current journal through createReplica + planReceive instead.
const replicas = new WeakSet<object>();
const keyOf = (target: EntityTarget): string => JSON.stringify([target.kind, target.id]);
const sameTarget = (a: EntityTarget, b: EntityTarget): boolean => keyOf(a) === keyOf(b);

function seal(replica: SyncReplica): SyncReplica {
  const result = immutable(replica);
  replicas.add(result);
  return result;
}

export function createReplica(rawPolicy: ReplicaPolicy): SyncReplica {
  const policy = immutable(parse(policySchema, rawPolicy));
  return seal({
    policy,
    operations: [],
    ready: [],
    pending: [],
    quarantined: [],
    projection: {
      entities: [],
      suppressed: [],
      reviewReconciliations: [],
      scheduling: 'not-computed',
    },
  });
}

function assertBinding(expected: SyncBinding, raw: SyncBinding): void {
  const actual = parse(bindingSchema, raw);
  if (actual.accountId !== expected.accountId || actual.learnerId !== expected.learnerId) {
    throw new SyncValidationError('ownership-mismatch');
  }
  if (actual.sessionId !== expected.sessionId) throw new SyncValidationError('stale-session');
}

function assertScope(policy: ReplicaPolicy, operation: SyncOperation): void {
  if (
    operation.scope.accountId !== policy.binding.accountId ||
    operation.scope.learnerId !== policy.binding.learnerId
  )
    throw new SyncValidationError('ownership-mismatch');
  if (
    operation.schemaEpoch !== policy.schemaEpoch ||
    operation.deletionEpoch !== policy.deletionEpoch
  ) {
    throw new SyncValidationError('epoch-mismatch');
  }
  if (operation.mergePolicy !== policy.mergePolicy)
    throw new SyncValidationError('policy-mismatch');
}

function validateLinks(operation: SyncOperation, byId: ReadonlyMap<string, SyncOperation>): void {
  const payload = operation.payload;
  const target = targetOf(payload);
  if (operation.predecessor) {
    const predecessor = byId.get(operation.predecessor.opId);
    if (
      predecessor &&
      (predecessor.actor.deviceId !== operation.actor.deviceId ||
        predecessor.actor.incarnationId !== operation.actor.incarnationId ||
        predecessor.actor.sequence !== operation.actor.sequence - 1)
    )
      throw new SyncValidationError('causal-reference-conflict', ['predecessor']);
  }
  if ('generation' in payload && payload.generation) {
    const generation = byId.get(payload.generation.opId);
    if (
      generation &&
      (generation.payload.kind !== 'entity.restore' ||
        !sameTarget(target, targetOf(generation.payload)))
    )
      throw new SyncValidationError('causal-reference-conflict', ['generation']);
  }
  if ('supersedes' in payload && payload.supersedes) {
    for (const ref of payload.supersedes) {
      const older = byId.get(ref.opId);
      if (
        older &&
        (older.payload.kind !== payload.kind || !sameTarget(target, targetOf(older.payload)))
      )
        throw new SyncValidationError('causal-reference-conflict', ['supersedes']);
    }
  }
  if (payload.kind === 'entity.restore') {
    for (const ref of payload.tombstones) {
      const deletion = byId.get(ref.opId);
      if (
        deletion &&
        (deletion.payload.kind !== 'entity.tombstone' ||
          !sameTarget(target, targetOf(deletion.payload)))
      )
        throw new SyncValidationError('causal-reference-conflict', ['tombstones']);
    }
  }
}

interface CausalGraph {
  readonly ordered: readonly SyncOperation[];
  readonly readyIds: ReadonlySet<string>;
  readonly pending: readonly PendingOperation[];
  readonly quarantined: readonly QuarantinedOperation[];
  readonly precedes: (earlier: string, later: string) => boolean;
}

function causalGraph(operations: readonly SyncOperation[]): CausalGraph {
  const byId = new Map(operations.map((operation) => [operation.opId, operation]));
  const digests = new Map(
    operations.map((operation) => [operation.opId, operationReference(operation).sha256]),
  );
  const refs = new Map(operations.map((operation) => [operation.opId, referencesOf(operation)]));
  const children = new Map<string, string[]>();
  const remaining = new Map<string, number>();
  const quarantine = new Map<string, QuarantinedOperation['reason']>();
  for (const operation of operations) {
    let present = 0;
    for (const ref of refs.get(operation.opId) ?? []) {
      const digest = digests.get(ref.opId);
      if (digest !== undefined && digest !== ref.sha256) {
        quarantine.set(operation.opId, 'causal-reference-conflict');
      }
      if (digest !== undefined) {
        present += 1;
        const dependents = children.get(ref.opId) ?? [];
        dependents.push(operation.opId);
        children.set(ref.opId, dependents);
      }
    }
    remaining.set(operation.opId, present);
    try {
      validateLinks(operation, byId);
    } catch (error) {
      if (!(error instanceof SyncValidationError)) throw error;
      quarantine.set(operation.opId, 'causal-reference-conflict');
    }
  }
  let queue = operations
    .filter((operation) => remaining.get(operation.opId) === 0)
    .map((operation) => operation.opId)
    .sort(compare);
  const ordered: SyncOperation[] = [];
  const readyIds = new Set<string>();
  const pending: PendingOperation[] = [];
  while (queue.length) {
    const opId = queue.shift();
    if (!opId) break;
    const operation = byId.get(opId);
    if (!operation) throw new SyncValidationError('invalid-replica');
    ordered.push(operation);
    const waitingFor: OperationRef[] = [];
    for (const ref of refs.get(opId) ?? []) {
      if (!readyIds.has(ref.opId)) waitingFor.push(ref);
      if (quarantine.has(ref.opId) && !quarantine.has(opId)) {
        quarantine.set(opId, 'quarantined-dependency');
      }
    }
    if (!quarantine.has(opId)) {
      if (waitingFor.length) pending.push({ operation: operationReference(operation), waitingFor });
      else readyIds.add(opId);
    }
    for (const child of children.get(opId) ?? []) {
      const count = (remaining.get(child) ?? 0) - 1;
      remaining.set(child, count);
      if (count === 0) queue.push(child);
    }
    queue = queue.sort(compare);
  }
  if (ordered.length !== operations.length) {
    const processed = new Set(ordered.map((operation) => operation.opId));
    for (const operation of [...operations].sort((a, b) => compare(a.opId, b.opId))) {
      if (processed.has(operation.opId)) continue;
      quarantine.set(operation.opId, 'causal-cycle');
      ordered.push(operation);
    }
  }
  const quarantined = [...quarantine.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([opId, reason]) => {
      const operation = byId.get(opId);
      if (!operation) throw new SyncValidationError('invalid-replica');
      return { operation: operationReference(operation), reason };
    });
  // Compute only the causal comparisons that review conflicts actually need;
  // retaining the full transitive closure makes a long device journal quadratic.
  const causalComparisons = new Map<string, boolean>();
  const precedes = (earlier: string, later: string): boolean => {
    const key = `${earlier}:${later}`;
    const cached = causalComparisons.get(key);
    if (cached !== undefined) return cached;
    const visited = new Set<string>();
    const work = [...(refs.get(later) ?? [])].map((ref) => ref.opId);
    while (work.length) {
      const candidate = work.pop();
      if (!candidate || visited.has(candidate)) continue;
      if (candidate === earlier) {
        causalComparisons.set(key, true);
        return true;
      }
      visited.add(candidate);
      work.push(...(refs.get(candidate) ?? []).map((ref) => ref.opId));
    }
    causalComparisons.set(key, false);
    return false;
  };
  return { ordered, readyIds, pending, quarantined, precedes };
}

function project(graph: CausalGraph): SyncProjection {
  const groups = new Map<string, SyncOperation[]>();
  for (const operation of graph.ordered) {
    if (!graph.readyIds.has(operation.opId)) continue;
    const key = keyOf(targetOf(operation.payload));
    const group = groups.get(key) ?? [];
    group.push(operation);
    groups.set(key, group);
  }
  const entities: EntityProjection[] = [];
  const suppressed: OperationRef[] = [];
  const reviews: SyncOperation[] = [];
  for (const key of [...groups.keys()].sort(compare)) {
    const group = groups.get(key) ?? [];
    const first = group[0];
    if (!first) continue;
    const deletes = group.filter((operation) => operation.payload.kind === 'entity.tombstone');
    const restores = group.filter((operation) => {
      if (operation.payload.kind !== 'entity.restore') return false;
      // A later or concurrent deletion removes this restore generation too.
      // Explicit acknowledgement is required, not merely a timestamp after deletion.
      const acknowledged = new Set(operation.payload.tombstones.map((ref) => ref.opId));
      return deletes.every((deletion) => acknowledged.has(deletion.opId));
    });
    const activeGenerations = new Set(restores.map((operation) => operation.opId));
    const active: SyncOperation[] = [];
    for (const operation of group) {
      const payload = operation.payload;
      if (!('generation' in payload)) continue;
      const visible =
        payload.generation === null
          ? deletes.length === 0
          : activeGenerations.has(payload.generation.opId);
      if (visible) active.push(operation);
      else suppressed.push(operationReference(operation));
    }
    const noteVersions = new Map<string, SyncOperation[]>();
    for (const operation of group) {
      if (operation.payload.kind !== 'note.version') continue;
      const versions = noteVersions.get(operation.payload.versionId) ?? [];
      versions.push(operation);
      noteVersions.set(operation.payload.versionId, versions);
    }
    const identityConflicts = [...noteVersions.entries()]
      .sort(([a], [b]) => compare(a, b))
      .filter(
        ([, versions]) => new Set(versions.map((operation) => operation.payloadSha256)).size > 1,
      )
      .map(([versionId, versions]) => ({
        versionId,
        operations: versions.map(operationReference),
      }));
    const superseded = new Set<string>();
    for (const operation of active) {
      if ('supersedes' in operation.payload && operation.payload.supersedes) {
        for (const ref of operation.payload.supersedes) superseded.add(ref.opId);
      }
      if (operation.payload.kind === 'review.attempt') reviews.push(operation);
    }
    const supersededPayloads = new Set(
      active
        .filter((operation) => superseded.has(operation.opId))
        .map((operation) => operation.payloadSha256),
    );
    const heads = active.filter((operation) => !supersededPayloads.has(operation.payloadSha256));
    // Equal copied attempt payloads do not become two different exam/review variants.
    const distinctHeads = new Set(heads.map((operation) => operation.payloadSha256));
    entities.push({
      target: targetOf(first.payload),
      versions: active.map(operationReference),
      heads: heads.map(operationReference),
      tombstones: deletes.map(operationReference),
      activeRestoreGenerations: restores.map(operationReference),
      identityConflicts,
      requiresChoice: distinctHeads.size > 1,
    });
  }
  const reviewGroups = new Map<string, SyncOperation[]>();
  for (const operation of reviews) {
    if (operation.payload.kind !== 'review.attempt') continue;
    const key = JSON.stringify([operation.payload.cardId, operation.payload.scheduleRevisionId]);
    const group = reviewGroups.get(key) ?? [];
    group.push(operation);
    reviewGroups.set(key, group);
  }
  const reviewReconciliations: ReviewReconciliation[] = [];
  for (const key of [...reviewGroups.keys()].sort(compare)) {
    const group = reviewGroups.get(key) ?? [];
    const first = group[0];
    if (!first || first.payload.kind !== 'review.attempt') continue;
    const variants = new Map<string, Set<string>>();
    for (const operation of group) {
      if (operation.payload.kind !== 'review.attempt') continue;
      const hashes = variants.get(operation.payload.attemptId) ?? new Set<string>();
      hashes.add(operation.payloadSha256);
      variants.set(operation.payload.attemptId, hashes);
    }
    const identityConflict = [...variants.values()].some((hashes) => hashes.size > 1);
    if (!identityConflict && variants.size < 2) continue;
    const concurrent = group.some((a) =>
      group.some(
        (b) =>
          a.opId !== b.opId && !graph.precedes(a.opId, b.opId) && !graph.precedes(b.opId, a.opId),
      ),
    );
    reviewReconciliations.push({
      cardId: first.payload.cardId,
      scheduleRevisionId: first.payload.scheduleRevisionId,
      attempts: group.map(operationReference),
      reason: identityConflict
        ? 'attempt-identity-conflict'
        : concurrent
          ? 'concurrent-schedule-revision'
          : 'reused-schedule-revision',
    });
  }
  return {
    entities,
    suppressed: suppressed.sort((a, b) => compare(a.opId, b.opId)),
    reviewReconciliations,
    scheduling: 'not-computed',
  };
}

/**
 * Pure transaction plan. Failure leaves the supplied replica untouched. A caller
 * must atomically persist insert + deduplication + pending state + projections;
 * this function does not supply a database, account authentication or durability.
 */
export function planReceive(replica: SyncReplica, delivery: ReceiveDelivery): ReceivePlan {
  if (!replicas.has(replica)) throw new SyncValidationError('invalid-replica');
  assertBinding(replica.policy.binding, delivery.binding);
  if (!Array.isArray(delivery.operations) || delivery.operations.length > 1000) {
    throw new SyncValidationError('invalid-input', ['delivery.operations']);
  }
  const byId = new Map(replica.operations.map((operation) => [operation.opId, operation]));
  const insert: SyncOperation[] = [];
  const duplicates: OperationRef[] = [];
  for (const raw of delivery.operations) {
    const operation = parseAnySyncOperation(raw);
    assertScope(replica.policy, operation);
    const prior = byId.get(operation.opId);
    if (prior) {
      if (operationReference(prior).sha256 !== operationReference(operation).sha256)
        throw new SyncValidationError('identity-conflict');
      duplicates.push(operationReference(prior));
    } else {
      byId.set(operation.opId, operation);
      insert.push(operation);
    }
  }
  const graph = causalGraph([...byId.values()]);
  const projection = project(graph);
  const ready = graph.ordered
    .filter((operation) => graph.readyIds.has(operation.opId))
    .map(operationReference);
  const previousReady = new Set(replica.ready.map((ref) => ref.opId));
  const next = seal({
    policy: replica.policy,
    operations: graph.ordered,
    ready,
    pending: graph.pending,
    quarantined: graph.quarantined,
    projection,
  });
  return immutable({
    next,
    insert: insert.sort((a, b) => compare(a.opId, b.opId)),
    duplicates: duplicates.sort((a, b) => compare(a.opId, b.opId)),
    newlyReady: ready.filter((ref) => !previousReady.has(ref.opId)),
    projectionChanged: inputHashOf(replica.projection) !== inputHashOf(projection),
  });
}
