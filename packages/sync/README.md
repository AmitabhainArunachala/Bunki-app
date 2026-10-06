# @bunki/sync

Transport-independent contracts for a small, explicit part of personal KAIRO sync. The package validates and owns immutable operation data, detects duplicate/corrupt delivery, derives causal readiness, and preserves competing changes. It performs no I/O and changes neither DomainEvent v1 nor FSRS.

## API and transaction boundary

```ts
import {
  createReplica,
  createSyncOperation,
  operationReference,
  planReceive,
  SYNC_MERGE_POLICY,
} from '@bunki/sync';

const policy = {
  binding: { accountId: 'private-account', learnerId: 'operator', sessionId: 'login-3' },
  schemaEpoch: 1,
  deletionEpoch: 0,
  mergePolicy: SYNC_MERGE_POLICY,
} as const;

const replica = createReplica(policy);
const operation = createSyncOperation({
  format: 'kairo-sync-operation',
  v: 1,
  scope: { accountId: 'private-account', learnerId: 'operator' },
  actor: { deviceId: 'mac', incarnationId: 'installation-1', sequence: 1 },
  predecessor: null,
  dependencies: [],
  schemaEpoch: 1,
  deletionEpoch: 0,
  mergePolicy: SYNC_MERGE_POLICY,
  occurredAt: '2026-09-10T10:00:00.000Z',
  payload: {
    kind: 'note.version',
    noteId: 'note-1',
    versionId: 'version-1',
    generation: null,
    supersedes: [],
    segments: [{ kind: 'original', text: '猫を見た。' }],
  },
});
const plan = planReceive(replica, { binding: policy.binding, operations: [operation] });
const reference = operationReference(operation);
```

`parseSyncOperation`, `parseActorIdentity` and `parseSyncBinding` are runtime boundaries, not type assertions. They reject unsupported schemas, unknown fields, accessors, cyclic/non-JSON inputs, malformed Unicode and bounded-input violations. IDs remain opaque Unicode; existing Japanese dictionary IDs are preserved without normalization. `createSyncOperation` derives an operation ID from account/learner plus device/incarnation/sequence, and records a canonical SHA-256 payload digest. References include the full envelope digest. JSON object key order is insignificant; array order is retained. Digests identify bytes; they do not authenticate an author.

An adapter must allocate its actor sequence and commit the full local change, typed operation and durable outbox entry **in one transaction**. Sequence 1 has no predecessor; later sequences cite the exact previous operation for that actor incarnation. A reinstall or cloned device needs an explicitly new incarnation before emitting operations. The core neither allocates counters nor establishes actor ownership.

For receiving, reconstruct a replica from the trusted current durable operation journal and current policy, then call `planReceive` inside the adapter's transaction/revision boundary. Commit `insert`, inbox/dedup markers, transport checkpoint, pending/quarantined state and the resulting projection atomically. `newlyReady` includes earlier pending rows released by this arrival. A new deletion or conflict can also change previously displayed state; apply the complete new projection rather than only adding `newlyReady`. A thrown error commits nothing. A changed replica object does not prove a durable write.

Each delivery's binding is captured when its asynchronous request starts. A stale session or different account/profile is rejected before reading its operation payloads. The session ID is device-local and is absent from replicated envelopes. Current policy must come from the actual account/session authority, not an incoming backup. An outbox is independently durable until exact acknowledgements commit; `replica.pending` is a causal inbox status and cannot substitute for that outbox.

The receive batch limit is 1,000 operations; individual inputs are bounded. Rebuild larger current journals in batches. No operation-history pruning is performed. Serialized replica-shaped objects are not accepted as current replicas: rebuild through the parser from the current stored journal. The in-process handle check is an API guard, not cryptographic authentication.

## V1 vocabulary and merge rules

| Operation          | Preserved meaning                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `note.version`     | Original segments and explicitly attributed source quotes, immutable named versions, explicit supersession. Concurrent versions remain separate choices. Source quotes carry a source/content digest, UTF-16 position and declared device-sync basis.                                                    |
| `reading.resume`   | Explicit resume intent, session, source/version/digest and UTF-16 or audio position. Known intents are superseded only by explicit reference. A reread may move backwards. Diverging source versions/sessions remain choices.                                                                            |
| `exam.attempt`     | Immutable submitted/abandoned attempt, exact form/item versions, answers, independent elapsed duration and interruption count. Different attempts remain independent. Conflicting copies of one attempt remain variants needing attention. This is not an in-progress timer/checkpoint/handoff protocol. |
| `review.attempt`   | Raw response, reported grade, hint/reveal state, recorded admission, policy/parameter versions, exact domain-event references and base schedule revision. Neither these labels nor successful replication grant scheduling authority.                                                                    |
| `entity.tombstone` | Durable deletion/revocation of a named entity across its content generations. It hides content in the projection; it does not claim physical purge.                                                                                                                                                      |
| `entity.restore`   | An explicit current-epoch recovery generation acknowledging exact tombstones. Restoring alone does not make old content visible; a new content version must cite the restore generation.                                                                                                                 |

All semantic references participate in causal readiness, including predecessor, supersession and restore references. Missing predecessors stay pending. A pending row can be corrupt before its referenced bytes arrive; when the genuine referenced operation arrives, the corrupt dependent is quarantined, along with dependents of that corrupt row. It cannot block unrelated valid arrivals indefinitely. Cyclic references are quarantined. The entire journal is retained, and quarantine/pending statuses are explicit.

One operation ID with different envelope bytes is rejected, including changes to timestamps or dependencies. A conflicting application-level note version name is separately recorded in `identityConflicts`: both versions remain, and the conflict does not invalidate causal deletion history. This distinction prevents a duplicate version name from making a tombstone's ancestor disappear. Duplicate identical note versions remain one content choice and can be explicitly superseded as that version.

Raw timestamps are retained facts, never causal ordering. Deterministic ordering uses causal references with binary ID ordering only to stabilize unrelated output. Review attempts sharing a schedule revision retain every observation and emit `reviewReconciliations`; both concurrent attempts and sequential reuse of an unchanged revision need an explicit later scheduling decision. The policy is deliberately conservative even when a recorded admission is rejected: this package does not establish which records have valid grading authority. Its projection always says `scheduling: 'not-computed'`. No event, interval, mastery or review debt is manufactured.

Tombstones dominate stale/concurrent content writes. A restore must acknowledge every currently known tombstone for its target. A later or concurrent additional tombstone defeats that restore until an explicit further recovery acknowledges it. Concurrent valid restored generations remain separate choices and can be resolved by an explicit version citing both heads. An ordinary edit cannot undo a deletion, even when it has seen that deletion.

## Limits and integration obligations

- This is a bounded foundation, not production sync delivery. There is no CloudKit adapter, account authentication, signing, encryption, push scheduling, key storage or native-device verification here.
- The current exact schema/deletion epoch and merge policy must already be known before ingesting remote data or a backup. Unknown old/future epochs are rejected, preserving current state for explicit reconciliation. Ordinary entity deletion does not bump the global epoch, so unrelated offline work remains mergeable. Global checkpoint compaction, epoch advancement, retirement and migration need separate versioned protocols. A fresh device cannot infer current tombstones from an old backup alone.
- Backups merge into the current journal and tombstone state. Replacing current policy/history with an old backup is not a supported restore path. Tests include a stale third-device copy merged with current tombstones, not a claim that a disconnected fresh device can discover remote deletion.
- Tombstones preserve historical bytes here. Actual local/remote purge, retention and backup deletion are separate storage operations; this package does not certify erasure.
- Source anchors and declared sync bases are preserved, but this package cannot verify the existence/length of remote source bodies or the applicability of a publisher permission. The caller must admit the content using the reading/source policy before creating an outbox operation. Provider keys, cookies, arbitrary record blobs and article/media bodies have no envelope fields.
- Full retained DomainEvent history, conversations, lists/follows, in-progress examinations, generation jobs/budgets, article bodies/approval and source-asset transfers are not yet operation families. Do not cram them into note segments or silently migrate legacy records to simulate support. Extending the closed vocabulary requires deliberate schemas and behavior fixtures.
- Scheduling conflict policy needs approved fixtures and integration with the existing domain evidence gate. A validated `SyncOperation` proves shape and byte identity, not authority to append a grade. Replaying a recorded `admission: 'accepted'` as a new successful retrieval would violate this boundary.
- The planner re-derives state from the complete current journal. A 1,005-operation restart fixture exercises retention; it is not a device performance or large-account capacity claim. Measure target-device latency/memory before choosing projection caching or checkpoints.

Run `npm run test --workspace @bunki/sync`, `npm run typecheck --workspace @bunki/sync`, and `npm run lint --workspace @bunki/sync`. The tests exercise real returned state, adversarial deliveries, permutations, conflicts, unchanged input state on rejection, deliberate rereading and remove-wins recovery. They do not use source-text/AST assertions or a fake cloud success as evidence.
