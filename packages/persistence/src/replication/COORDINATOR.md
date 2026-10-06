# Bounded replication coordinator

`SyncCoordinator` moves the existing typed operation outbox through an injected
`AuthenticatedSyncSession` and commits incoming pages through `ReplicationStore`.
It does not import a network library, handle credentials, authenticate a user,
change operation schemas, or compute a scheduler. SQLite and IndexedDB entry
points export the same coordinator.

```ts
const coordinator = new SyncCoordinator({
  store, // owned ReplicationStore, or compatible facade
  session: authenticatedSession, // supplied by the actual authenticated owner
  pushLimit: 100,
  pullLimit: 100,
  maxBytes: 1024 * 1024,
  revisionRetries: 2,
});
const cycle = await coordinator.syncOnce({ signal });
// cycle.hasMore describes bounded outstanding delivery work, not convergence.
```

## Session and transport contract

The application must inject a capability from its authenticated session owner.
`capture()` returns the immutable account/learner/session binding, channel and
revocation epoch for one cycle. `assertCurrent(capture)` synchronously checks
that this capability is still authorized. It must reject logout, revocation,
account/profile changes and replaced session epochs. Its implementation owns the
transport credential; the captured identifiers contain no credential. This
structural TypeScript interface is not cryptographic authentication. There is no
helper that establishes remote authority from local installation or operation IDs.

The captured binding must match the store's durable policy. The coordinator checks
capability liveness before work, after each asynchronous boundary, and before
local commits. Each response must echo the exact request ID, binding and channel.
Old responses are never rebound to a newer login. The authenticated transport must
also authorize the account/learner on the remote side, enforce `maxBytes` before
response decoding, and propagate `AbortSignal`. Decoded responses are independently
bounded, copied and validated by the coordinator. Transport errors expose a fixed
code, not provider diagnostics that might contain private data.

Push requests contain only validated outbox operations. Full local documents,
archives, credentials and installation records are never inferred to be eligible
for upload. The peer must deduplicate exact operation references and reject
conflicting bytes for an existing identity. An acknowledgement contains a unique
subset of exactly the offered `{opId, sha256}` references. Unknown references,
changed digests, duplicate references or mismatched responses acknowledge nothing.
Omitted references remain in the durable outbox; receiving an echo cannot clear it.

Each call offers at most one count/byte-bounded prefix, then pulls at most one
bounded page. An operation too large to fit alone remains pending and produces
`batch-too-large`; it is not skipped or truncated. Defaults are 100 operations in
each direction and 1 MiB per wire message. Limits are configurable up to 1,000
operations and 8 MiB. Requests are immutable. Push IDs derive from the captured
session and exact offered references; unchanged retries retain their identity.
Pull IDs correlate requests and responses, but must not permanently memoize an
empty response: another request at the same checkpoint may observe later arrivals.

A pull page echoes its expected checkpoint and supplies an opaque next checkpoint.
A nonempty or `hasMore` page must advance it. A no-change empty page writes nothing.
Opaque cursors have no merge or authentication authority. A changed local checkpoint
while a page is in flight rejects that page instead of rewinding or rebasing it.
`commitReceive` atomically journals operations, inbox/dedup markers, the core's
pending/quarantined/projection state, checkpoint and receipt. The coordinator uses
that one transaction and introduces no second merge or last-write-wins policy.

## Retry, cancellation and partial progress

The coordinator has no timer, background loop, autonomous reconnect or backoff.
The owner decides when to call it again and supplies a deadline through cancellation.
Concurrent calls on the same coordinator reject with `busy`; use one coordinator
per owned store/session. Local revisions are refreshed after network work. Only a
proven `stale-revision` rejection is retried, at most `revisionRetries` times, with
fresh session and checkpoint checks. Network requests are not resent inside a cycle.

If a remote acceptance reply is lost, the outbox remains pending and the next call
resends the same operation identities. If the batch changed because new local work
arrived, per-operation deduplication still prevents duplicate remote facts. If a
local COMMIT acknowledgement is uncertain, the coordinator propagates the store
failure. Its owner must close/reopen that store, inspect durable state, and create
or resume a coordinator with the current capability. Persisted outbox status and
checkpoints determine what remains; no lost acknowledgement is treated as success.

`cancel()` or an external `AbortSignal` ends an outstanding transport wait, including
a transport that ignores the signal. Late results cannot clear an outbox or advance
a checkpoint. Cancellation cannot undo a storage transaction already submitted; the
coordinator waits for its settlement and then reports cancellation. A rejected or
cancelled cycle may therefore have acknowledged an earlier push or durably committed
a submitted page. Inspect a fresh snapshot (or reopen after an uncertain commit).
The result of a successful call describes bounded work, pending outbox rows and
causal prerequisites; it is never an assertion that another device is up to date.

## Remaining work for actual Mac/iPhone sync

This module alone does not make the running app synchronize. Corridor's named note
commands and eligible submitted/abandoned practice commands now atomically pair
their local change with a typed operation. `RecordApp` independently admits those
specific commands; general document writes still emit no operation. Further command
admission must retain full local bytes and exclude private or unlicensed content
from transmission.
The current operation vocabulary covers only explicit note versions, reading resume
intents, submitted/abandoned exams, review attempts, tombstones and restores. Capture,
card scheduling/preferences, complete conversation and article histories, and other
learner roots do not automatically become covered by that vocabulary.

Current receive commits the sync journal/projection/checkpoint, not mutations of the
app's `learner-record` or `learner-archive` documents. `RecordHost` publishes admitted
note views from the committed projection. Received exam heads, conflicts and
tombstones are stored, but the practice-history UI still reads the local assessment
library. Received exam payloads lack the full attempt, retained questions and
editorial facts needed to reconstruct complete question review or scores. Additional
views and materialization must preserve concurrent choices, tombstones, local-only
data and the current account/session boundary. Record-specific behavior belongs
outside the transport loop. Review reconciliation still
requires the domain admission/scheduling path; replication never computes FSRS or
selects a timestamp winner. Distinct backup restoration remains outside this module.

The desktop native helper/bootstrap and iOS foreground bridge are implemented;
signed-device configuration and live same-account CloudKit acceptance remain
unverified. Complete operation coverage, app materialization, conflict presentation,
remote retention/deletion and real Mac/iPhone end-to-end acceptance remain required.
The deterministic relay in tests is synthetic
and provides no evidence of live authentication, network service availability,
iPhone background execution, or native device persistence.

## Verification

```sh
node node_modules/vitest/vitest.mjs run packages/persistence/test/replication/coordinator.test.ts
npx tsc --noEmit -p packages/persistence/tsconfig.json
```

Tests use two actual file-backed `node:sqlite` stores and the existing SQL adapter,
with the explicit `ci-substitute` label. They cover convergence without loss of
concurrent choices, outbox privacy and exact acknowledgement subsets, count/byte
bounds, offline and lost acknowledgements, causal reorder/duplicates, native receive
rollback boundaries, local COMMIT uncertainty and reopen, bounded revision retries,
late/cancelled transport, durable session replacement and stale checkpoints. Test
SQLite files live outside the checkout and are removed after each synthetic case.
