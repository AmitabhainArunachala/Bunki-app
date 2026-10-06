# Transactional replication storage

The optional [`SyncCoordinator`](./COORDINATOR.md) sends bounded typed outbox
batches and receives atomic operation/checkpoint pages through an injected
authenticated session capability. It does not supply live authentication or
materialize received projections into the app's learner documents.

`@bunki/persistence/replication` supplies a SQLite storage port for `@bunki/sync`.
It is a separate subpath with no main-barrel import. Its tables and version
marker use the `kairo_replication_` namespace; DomainEvent v1 and the existing
event-store migrations remain unchanged.

The adapter accepts the existing `SqliteDriver`, so the same SQL can run through
the Expo or Node bindings. Tests use actual file-backed `node:sqlite` and carry
the `ci-substitute` label. Native runtime and browser IndexedDB adapters remain
integration work.

## Durable boundaries

Every operation, including a consistent snapshot, runs inside a synchronous
`BEGIN IMMEDIATE` transaction. WAL and `synchronous = FULL` are requested from
SQLite. The public methods return promises so callers can use an asynchronous
storage boundary without putting an `await` inside a SQLite transaction.

| Method              | Atomic effects                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commitLocal`       | Full local document mutations, validated typed operations, durable outbox entries, actor/incarnation sequence and predecessor, derived sync view, profile revision, idempotency receipt |
| `commitReceive`     | Accepted operation bytes, per-channel inbox/dedup rows, pending/quarantined/visible sync view, transport checkpoint, profile revision, idempotency receipt                              |
| `acknowledgeOutbox` | Explicit acknowledgement of exact existing operation references, revision and receipt; acknowledged rows and original operations remain retained                                        |
| `replaceSession`    | New session binding, corresponding view and profile revision; old handles and captured requests fail subsequent binding checks                                                          |
| `snapshot`          | One consistent view of full local documents, journal, actor counter, outbox, inbox, checkpoints and sync projection                                                                     |

The store calls `createSyncOperation` and `planReceive` from the actual sync
package. It owns no alternate merge, tombstone, review-admission or scheduling
rules. On reopen it validates stored operation bytes and reconstructs the
branded replica with `createReplica` and `planReceive` in batches of at most
1,000. The persisted derived view is checked against that reconstruction.
Pending and quarantined arrivals remain in the journal. Concurrent facts and
explicit tombstones retain the core's dispositions.

## Local data and transmission

`mutations` hold full local JSON independently from the narrower typed operation
schema. Original archive text, source context, unreferenced turns and complete
article histories can remain local without manufacturing a sync payload. Own
keys such as `__proto__` and `constructor` survive, and array order is preserved.
The codec rejects accessors, cycles, sparse arrays, undefined, non-finite
numbers and other values JSON would silently discard or change.

The durable `outbox` is the source for sending operations. The merge planner's
`pending` field describes causal readiness and cannot replace that outbox.
Receiving an echo of a local operation does not acknowledge it. Only exact,
explicit `acknowledgeOutbox` references change its delivery state. Incoming
operations cannot write full local documents or contain fields outside the sync
schema. This module provides no cloud upload function.

Operation scopes and current sessions are checked inside the transaction. These
are application integrity checks; authentication and transport authorization
must supply the binding before this port is used. Account/learner IDs themselves
are not proof of authority. Transport responses must carry the binding captured
when the request started. The checkpoint is an opaque, channel-scoped cursor
with an expected-value check, not a source of merge authority.

## Revision, actor and retry behavior

Each new mutation checks the caller's `expectedRevision`; a stale writer cannot
replace a sibling's newer snapshot. Stable request IDs support an uncertain
acknowledgement: retrying identical intent returns the original committed
receipt without allocating another operation or sequence. Different intent
under the same ID fails. The receipt's revision describes that original commit,
so callers should take a new snapshot before forming another change.

The store allocates sequences inside the same transaction as the operation. An
unseen incoming operation cannot claim any locally reserved device/incarnation;
an already durable identical operation is a valid duplicate. A new local actor
cannot adopt identity from a received journal. Reinstalls, restored databases
and cloned devices require an explicitly fresh incarnation before emitting
operations; this port cannot detect an arbitrary filesystem copy of an already
owned live database.

Any failed COMMIT acknowledgement requires a close/reopen. If SQLite actually
committed before the acknowledgement failed, the durable receipt resolves the
retry. If rollback itself fails, the connection also requires reopen. No failed
call is reported as an acknowledged successful write.

```ts
const store = SqliteReplicationStore.open(driver, { policy, actor });
const base = await store.snapshot();
const receipt = await store.commitLocal({
  changeId,
  binding: base.policy.binding,
  expectedRevision: base.revision,
  occurredAt,
  mutations,
  operations,
});
```

## Capacity and integration limits

Local JSON/request validation currently bounds a tree to 1,000,000 nodes, depth
64, and 32 Mi UTF-16 code units in its encoded representation. A local commit
accepts at most 256 document mutations and 100 operation intents. A receive batch
accepts at most 1,000 operations, also subject to the sync core's payload limits.
Oversized inputs are rejected before mutation; no history window is truncated.

Snapshots and planning rebuild the complete current operation journal. This is
a correctness-first adapter with no large-history performance guarantee. The
1,005-operation reopen case is covered by real SQLite tests; higher-volume
indexing, compaction, streaming export and verified cache migrations need
separate designs. Unknown schema versions or inconsistent stored digests/views
fail closed.

There is no live learner migration, dual write, generation activation/import,
complete backup protocol, encryption/key management, network client or hard
erasure/retention protocol in this package. Existing synchronous Corridor
callers and browser/native host consumers still need integration. DomainEvent
admission continues through the existing domain command path.

Run the focused tests from the repository root:

```sh
node node_modules/vitest/vitest.mjs run packages/persistence/test/replication
```

Tests exercise real SQLite rollback after each write boundary, independent
connections with stale revisions, genuine `SQLITE_FULL`, and actual child
process `SIGKILL` before and after COMMIT. The Node child fixture uses
`--experimental-transform-types` on Node 22.14. Test databases live under
`KAIRO_EVIDENCE_DIR` or `~/.dharma/test-runtime/replication` and are removed after
each synthetic case. Process-crash evidence does not claim power-loss or device
backgrounding acceptance.
