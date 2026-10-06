# Browser replication storage

`@bunki/persistence/replication/indexeddb` exports the actual IndexedDB adapter,
the shared port types, local JSON type, and error class. This subpath does not
import the SQLite adapter or Node builtins. Its runtime label is `browser`.

```ts
import { IndexedDbReplicationStore } from '@bunki/persistence/replication/indexeddb';

const store = await IndexedDbReplicationStore.open({
  databaseName: 'kairo-transactional-records',
  policy,
  actor,
});
const current = await store.snapshot();
const receipt = await store.commitLocal({
  changeId,
  binding: current.policy.binding,
  expectedRevision: current.revision,
  occurredAt,
  mutations,
  operations,
});
```

Use a dedicated, stable database name selected by the application. This adapter
does not inspect, migrate, or dual-write existing Corridor/SQLite databases.
Account and learner scope are composite keys within that database. Separate
database names are separate stores, not replicas automatically synchronized by
this module.

## Atomic boundary

The method contract matches the SQLite adapter: full local document mutations,
typed operations, durable outbox, actor sequence/predecessor, profile revision,
derived view, and idempotency receipt commit together. A receive commits the
accepted journal, inbox, pending/quarantined/projected view, checkpoint, revision,
and receipt together. Explicit exact acknowledgements retain their outbox rows
and the journal. Receiving a local echo does not acknowledge its outbox entry.

Every mutation uses one readwrite transaction over the metadata and row stores.
Two independent tabs cannot both commit a stale revision: IDB serializes the
transactions, and each checks the latest stored revision and binding before
planning its writes. Readonly snapshots use one transaction over the same
stores, so a pending writer cannot produce a mixture of old local documents and
new sync evidence.

The transaction is created with `durability: 'strict'`. Unsupported transaction
options fail; there is no silent fallback to weaker durability. All reads are
queued immediately, and the shared synchronous planner, hashes, and writes run
within an IDB request success callback. No asynchronous hashing, network call,
or timer is awaited inside the transaction. **A successful request is not a
successful save.** Only the transaction's `complete` event resolves a receipt.
An abort rejects the call after rollback. Repeated cancellation error events do
not cause a second abort or close an otherwise healthy connection.

The adapter retains the same revision/idempotency/session/actor rules as the
SQLite port. A stable request ID resolves a lost acknowledgement after reopen
without allocating another operation. A different intent under that ID fails.
A distinct replacement session invalidates old handles and captured requests.
Account/learner reassignment is not a session change. Authentication and network
authorization remain the caller's responsibility; a binding's IDs alone are not
proof of authority.

## Open, upgrades, and close

The dedicated schema has a database version and a separate exact format marker.
The object stores, key paths, index, marker, scoped rows, canonical digests,
operation bytes, actor counter, and persisted derived view are checked. The
branded sync replica is reconstructed using `createReplica` and `planReceive`,
not deserialized as trusted authority. An unknown version, missing marker,
incompatible store structure, or corrupt bytes fails closed without resetting
existing data.

An external `versionchange` closes the connection and rejects later work through
that handle. Applications must reopen with a compatible adapter after an
upgrade. Open rejects a blocked request and has a bounded timeout (5 seconds by
default; `openTimeoutMs` accepts 1–60,000 ms). Any late successful open after
rejection is closed. Transactions have a 30-second abort timer; a failed abort
closes the connection rather than reporting success. Work must be retried only
with stable request IDs after reading the current state.

`close()` prevents new operations, closes the connection to new transactions,
and waits for already-issued transactions to settle. Normal teardown should
await it. A destroyed page may interrupt an open transaction; the caller must
not claim an acknowledgement it never received.

## Local retention and limits

Full local JSON documents are independent from the closed sync payload schema.
Original chat/article history, context references, and own keys such as
`__proto__` remain local without gaining replication eligibility. Values JSON
would silently change or discard are rejected. No history window is truncated.
The same bounded request sizes as the SQLite adapter apply: up to 256 local
document mutations and 100 operation intents, and up to 1,000 received
operations per batch. Local JSON is bounded to 1,000,000 nodes, depth 64, and 32
Mi UTF-16 code units. These are validation limits, not quota promises.

The current implementation loads all scoped rows and rebuilds the operation
journal to validate each snapshot or mutation. Transactions over a common row
store serialize mutations across profiles in the same database. This favors
consistency; incremental indexing, compaction, and high-volume performance are
future work. The browser fixture covers 1,005 operations through two batches and
reload, not arbitrary history size.

Browser storage can still be evicted or cleared by the user/browser. Strict IDB
durability does not establish power-loss, disk reliability, encryption,
authentication, protected backup activation, or server durability. The
application still needs persistence/backup UX, complete verified migration,
transport, and integration of all asynchronous mutation callsites. No full-app
sync claim follows from this adapter's tests.

## Real browser checks

From the repository root, with the pinned Playwright browsers installed:

```sh
KAIRO_EVIDENCE_DIR="$HOME/.dharma/test-runtime/replication-indexeddb" \
node node_modules/vitest/vitest.mjs run \
  packages/persistence/test/replication/indexeddb-browser.test.ts
```

The default runs Chromium and WebKit, with no missing-engine skips. An explicit
`KAIRO_IDB_BROWSERS=chromium` or `webkit` narrows development checks; that does not
claim the other engine passed. The fixture bundles the public browser subpath
and serves synthetic data on loopback. Each engine uses a fresh, isolated
persistent profile under the evidence directory and removes it after testing.
Unexpected page errors fail the suite. No operator browser or learner database
is used.

Tests abort after successful native IDB requests, induce an actual duplicate-key
request error, inject a quota exception after queuing a real write, interrupt
open transactions by closing their page, suppress a post-COMMIT acknowledgement
before closing its page, and restart the full browser with its synthetic
profile. Two additional Chromium cases issue the real `Browser.crash` command,
observe process disconnection, and reopen that profile before and after COMMIT.
WebKit's coverage is page interruption and browser restart, not an abrupt
browser-process crash. The quota exception is an injected browser write failure, not a claim
of physically exhausting a browser's storage quota. The crash cases establish
page/process lifecycle behavior, not electrical power-loss acceptance.
