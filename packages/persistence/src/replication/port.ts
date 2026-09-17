import type {
  ActorIdentity,
  OperationRef,
  ReceiveDelivery,
  RecordOperation,
  ReplicaPolicy,
  SyncBinding,
  SyncOperation,
  SyncReplica,
} from '@bunki/sync';

import type { LocalJson } from './json.ts';
import type { OperationJournalBackup } from './backup.ts';

export interface LocalDocument {
  readonly collection: string;
  readonly id: string;
  readonly value: LocalJson;
}

export type LocalMutation =
  | ({ readonly kind: 'put' } & LocalDocument)
  | { readonly kind: 'delete'; readonly collection: string; readonly id: string };

export interface LocalOperationIntent {
  readonly payload: RecordOperation;
  readonly dependencies: readonly OperationRef[];
}

export interface LocalCommit {
  /** Caller keeps this stable across an uncertain acknowledgement/retry. */
  readonly changeId: string;
  readonly binding: SyncBinding;
  readonly expectedRevision: number;
  readonly occurredAt: string;
  /** Full local document bytes; never inferred to be eligible for transmission. */
  readonly mutations: readonly LocalMutation[];
  /** Only the sync core's closed schema can enter the operation journal/outbox. */
  readonly operations: readonly LocalOperationIntent[];
}

export interface ReceiveCommit {
  readonly deliveryId: string;
  readonly expectedRevision: number;
  readonly delivery: ReceiveDelivery;
  readonly checkpoint: {
    readonly channelId: string;
    readonly expected: string | null;
    readonly next: string;
  };
}

/** Explicit caller-admitted restore, distinct from untrusted network delivery.
 * The journal merges with current tombstones; documents are local mutations,
 * never inferred to authorize transmission. No policy, actor, session, cursor
 * or acknowledged-outbox state is imported from the backup.
 */
export interface RestoreCommit {
  /** Stable across an uncertain acknowledgement; exact retries do not reapply documents. */
  readonly restoreId: string;
  readonly binding: SyncBinding;
  readonly expectedRevision: number;
  readonly mutations: readonly LocalMutation[];
  readonly backup: OperationJournalBackup;
}

export interface OutboxAcknowledgement {
  readonly acknowledgementId: string;
  readonly binding: SyncBinding;
  readonly expectedRevision: number;
  readonly operations: readonly OperationRef[];
}

export interface DurableCommitReceipt {
  readonly changeId: string;
  readonly committedRevision: number;
  readonly operations: readonly OperationRef[];
  readonly outcome: 'committed' | 'duplicate';
  readonly runtimeLabel: 'native' | 'ci-substitute' | 'browser';
}

export interface ReplicationSnapshot {
  readonly policy: ReplicaPolicy;
  readonly revision: number;
  readonly actor: ActorIdentity & {
    readonly sequence: number;
    readonly predecessor: OperationRef | null;
  };
  readonly documents: readonly LocalDocument[];
  readonly replica: SyncReplica;
  /** Durable locally emitted operations awaiting explicit acknowledgement. */
  readonly outbox: readonly SyncOperation[];
  readonly acknowledgedOutbox: readonly OperationRef[];
  readonly inbox: readonly { readonly channelId: string; readonly operation: OperationRef }[];
  readonly checkpoints: readonly { readonly channelId: string; readonly value: string }[];
  readonly runtimeLabel: 'native' | 'ci-substitute' | 'browser';
}

export interface ReplicationStore {
  snapshot(): Promise<ReplicationSnapshot>;
  commitLocal(request: LocalCommit): Promise<DurableCommitReceipt>;
  commitReceive(request: ReceiveCommit): Promise<DurableCommitReceipt>;
  /** Atomically merges operation history, documents and retransmission outbox. */
  commitRestore(request: RestoreCommit): Promise<DurableCommitReceipt>;
  acknowledgeOutbox(request: OutboxAcknowledgement): Promise<DurableCommitReceipt>;
  /** Invalidates all handles/requests bound to the old session, including this handle. */
  replaceSession(expectedRevision: number, nextBinding: SyncBinding): Promise<number>;
  close(): Promise<void>;
}
