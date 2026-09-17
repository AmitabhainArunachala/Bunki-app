# Foreground CloudKit operation journal

This Swift package implements an explicit foreground transport for the existing
TypeScript sync journal. Its production backend compiles against CloudKit and uses
`CKContainer(identifier:).privateCloudDatabase`. It has no app integration, timers,
subscriptions, background engine, provisioning, credentials, or merge/scheduler
implementation. The tests make no CloudKit account or network calls.

## Native API and authority

`ForegroundJournalTransport` is an actor with four public operations:

- `openSession(for:)` checks CloudKit account availability, obtains the container's
  user record identity, and calls an injected `ScopeAuthorizer` for that exact
  CloudKit identity and application account/learner scope.
- `push(_:session:)` offers a bounded immutable operation batch and returns exact
  accepted references plus fixed per-record failure codes.
- `pull(checkpoint:limit:session:)` fetches one bounded page and returns envelopes,
  an opaque next checkpoint, and `hasMore`.
- `invalidateSession()` invalidates existing leases. An observed `CKAccountChanged`
  notification invalidates the same lock-protected epoch synchronously.

The CloudKit account fingerprint comes from CloudKit's user record ID and container,
never a local installation, actor, operation, or learner ID. That account check
establishes access to the private CloudKit database; it does **not** establish
authorization for an arbitrary application learner profile. The production host
must inject that separate authorization and revoke it when the profile binding
changes. There is no public synthetic-account/backend constructor. Unit fixtures
use the internal backend seam through `@testable`.

Account and learner IDs retain their original UTF-8 bytes. `JournalScope` implements
byte equality and matching hashing explicitly: Swift's default canonical Unicode
equivalence must not collapse distinct opaque TypeScript IDs such as composed and
decomposed accented characters. Envelope scope admission, authorization sets and
cursor scope checks use that same exact identity.

The actor rechecks the lease, actual account, and profile authorization around
network awaits. Replaced sessions, account changes, cancellation, and late successful
responses cannot return an acknowledgement or new cursor. Work on one instance is
serialized with an explicit `busy` rejection. Swift cancellation is cooperative:
an already submitted CloudKit write may succeed remotely, and an SDK call may take
time to settle. Its late result is rejected; a later valid session can retry and
prove an exact duplicate. Cancellation does not undo remote writes.

## Immutable records and encrypted fields

The host supplies the exact UTF-8 bytes of `canonicalJson(parseSyncOperation(op))`
from `@bunki/domain/canonical-json`, together with `operationReference(op)`. This is
the domain's sorted, two-space JSON; the compact persistence serializer produces a
different digest. Swift verifies the raw SHA-256, format/version, operation ID and
scope. TypeScript retains full schema, identity, causal, payload, retention and merge
admission; the native boundary does not invent a second merge policy.

Each operation occupies `op-<opId>` in record type `KairoJournalOperationV1` in the
scope's custom private zone. A zone name is `kairo-v1-` followed by the final 64
characters of the session's `channelID`. The zone must be provisioned separately;
this package never creates or recreates one.

New `CKRecord` objects have no fetched change tag and are saved with
`.ifServerRecordUnchanged`, `atomically: false`, and an empty delete list. A
`serverRecordChanged` result is accepted only if the existing envelope and reference
are byte-for-byte identical. When CloudKit omits that existing record, at most one
read per offered operation proves the duplicate. Conflicting server records are
never changed or resubmitted. Unknown results reject the response, missing results
remain unacknowledged, and partial success acknowledges only exact successful rows.
See Apple's [modifyRecords API](<https://developer.apple.com/documentation/cloudkit/ckdatabase/modifyrecords(saving:deleting:savepolicy:atomically:)>).

The envelope `Data` and its digest `String` are stored only in `CKRecord.encryptedValues`.
The decoder rejects plaintext substitutes for those fields. Apple supports these
field types in [encryptedValues](https://developer.apple.com/documentation/cloudkit/ckrecord/encryptedvalues).
The offline codec tests prove field placement and byte fidelity. Locally, the SDK
still exposes decrypted values; these tests do not prove live service encryption,
end-to-end encryption, an account's Advanced Data Protection state, or provisioning.

## Checkpoints, failures, and bounds

Pull uses `recordZoneChanges`, with secure archived `CKServerChangeToken` bytes in
an opaque wrapper bound to account fingerprint, app scope and channel. The wrapper
checksum detects accidental alteration; it is not an authentication credential.
Swift does not persist any checkpoint. The TypeScript host must validate and admit
the entire page, then commit its operations and checkpoint in one `commitReceive`
transaction. A caller must not persist a cursor merely because this method returned.

An expired token, missing/deleted zone, physical record deletion, failed per-record
fetch, invalid scope, malformed record, or oversized page rejects the whole pull.
No advanced checkpoint is returned. The caller retains its previous durable
checkpoint and chooses an explicit recovery path. This transport does not retry
from a nil token, reinterpret a physical deletion as a semantic tombstone, skip
failed rows, or recreate a reset journal. The owner must preserve the immutable
journal's history and provide recovery for retention/administrative history loss.

Defaults are 100 operations, 256 KiB per envelope, 1 MiB aggregate envelope bytes,
and an 8 KiB encoded checkpoint. Maximum configurable operation count is 100 and
aggregate bytes 8 MiB. Count, per-envelope and batch limits reject without truncation.
Use compatible or smaller coordinator limits. The byte limit covers admitted
envelopes; CloudKit may allocate a downloaded record before the SDK returns it.
This adapter cannot prove a pre-download wire byte cap with the convenience API,
so it alone does not satisfy the coordinator's stronger pre-decoding transport cap.
An oversized valid page can be retried with a smaller foreground count; it cannot
be silently sliced while advancing its cursor.

Only `JournalError` codes cross this API. Provider error text, user info and record
payloads are not included in errors or logs; the package has no logging side effects.

## Remaining integration

The future native host must map a live Swift lease to the TypeScript
`AuthenticatedSyncSession` capability, retain the current durable store binding,
echo the exact request ID/binding/channel and previous checkpoint, propagate
`AbortSignal` to the Swift task, and synchronously invalidate the JS epoch on native
logout/account/profile changes. It must canonicalize push bytes, independently
admit received envelopes, enforce complete wire/IPC budgets, and return only offered
acknowledgement references. A native lease is not a durable local store session ID.
The bounded RPC library below is implemented. A production executable, Electron/WK handler and authenticated TypeScript capability mapping are not implemented here.

Source admission must precede push and restore: a claimed source basis or hash
does not establish permission to transmit quoted source text. The current host
backup path refuses novel source-quote notes and only preserves an exact quote
already admitted in that local store. Keep that boundary when connecting this
transport. Pair the authenticated CloudKit account and learner profile explicitly;
an imported backup binding cannot create or replace that authorization. Carry the
exact JavaScript canonical bytes through IPC, and invalidate both the native lease
and JS capability immediately on foreground account/profile changes.

Eligible local operation coverage and atomic application projection remain host
integration requirements. This RPC package creates no operations and does not
materialize learner documents; assess the current typed RecordHost commands and
source admission at their actual integration revision. The operation vocabulary
does not cover every learner root. See the
[coordinator contract](../persistence/src/replication/COORDINATOR.md).

Real container/schema setup, entitlements, signing, live account/pairing and
service-failure acceptance, and Mac/iPhone end-to-end tests remain required.
First-pair custom-zone creation is implemented with account and revocation
checks; it has only offline SDK-value fixtures. No live service or device sync
was exercised. SwiftPM declares macOS 14 and iOS 17; this environment
has the macOS SDK and Command Line Tools, but no full Xcode/iPhone build runner.

## Bounded RPC library

`JournalRPCSessionGate` attaches a `JournalSession` to a native-created connection
UUID. Its `attach` and synchronous `revoke` methods are trusted native lifecycle
APIs, absent from the wire vocabulary. The transport's injected `ScopeAuthorizer`
still owns profile authorization, and the transport still validates its actual
account/session around every push/pull. A gate cannot make a stale or foreign
transport session succeed. `describe` performs no account call and describes only
an already attached host lease; it is routing metadata, not fresh authentication.

The installed record's random `local-account:` and `local-learner:` logical IDs
must retain their exact bytes. Existing note operations are immutable and must
never be silently rescoped to a CloudKit user ID. A separate trusted pairing record
may authorize that logical profile for an authenticated CloudKit account.
`NativeCloudSyncBootstrap` now implements that pairing with real SDK account
checks, explicit native confirmation and a device-local Keychain record. Its
public initializer refuses missing signing/container entitlements before any
CloudKit or Keychain calls. Existing pairings cannot silently move to another
account. Neither an imported binding nor an RPC field creates the pairing.

The `kairo-cloud-sync-host` executable accepts bounded bootstrap configuration
on inherited FD3 and returns a connection-bound control result on FD4. Its
stdin/stdout remain the framed journal protocol. The native alert is required;
there is no environment or wire-level confirmation bypass. Account changes,
control-channel loss and owner revocation invalidate the captured connection.
`NativeSyncProfile.exportCandidate()` transfers logical learner IDs only; the
receiving device must independently confirm its account and pairing. Signed
Keychain behavior, the real native confirmation UI and live CloudKit still need
device acceptance. The desktop host and iOS host integrations retain those limits.

Create one `JournalRPCAdapter(transport:sessions:connectionID:limits:)` and gate per
host connection. Call `submit(_:from:)` in message arrival order. Actor admission
returns before backend work settles, allowing a subsequent cancellation request.
One consumer awaits `nextOutput()` for replies/events. The host calls synchronous
`connectionLost(_:)` on disconnect, process loss or a lost ownership channel.

Every UTF-8 JSON request is exactly:

```json
{ "format": "kairo-journal-rpc", "v": 1, "id": "1", "method": "describe", "params": {} }
```

IDs are canonical positive decimal ASCII strings up to JavaScript's safe integer
limit, strictly increasing within the connection. A retry uses a new RPC ID; it
retains the same coordinator request capture and immutable operation bytes. The
adapter needs no unbounded completed-ID cache. Unknown fields, duplicate keys
(including escaped duplicates), invalid UTF-8/scalar JSON, malformed IDs, unknown
methods and reused/out-of-order IDs close and revoke the protocol connection.
Unadmitted requests have no safely correlated reply.

| Method     | Exact parameters                                                  | Result                                                                                                                                 |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `describe` | `{}`                                                              | Attached lease ID, exact logical scope and native channel; otherwise `session-required`.                                               |
| `push`     | `{leaseId,envelopes:[{reference:{opId,sha256},canonicalBase64}]}` | Exact accepted refs and fixed per-record failures.                                                                                     |
| `pull`     | `{leaseId,checkpoint:null                                         | string,limit:integer}`                                                                                                                 | Exact previous checkpoint, untouched envelopes, next opaque checkpoint and `hasMore`. |
| `cancel`   | `{targetId}`                                                      | Whether that connection's active request was marked cancelled; this does not claim the SDK write was undone or the target has settled. |

A reply contains `format`, `v`, `type:"reply"`, exact `id`, `method`, `leaseId`
(nullable for requests without an admitted lease), `ok`, and exactly `result` or
`error:{code}`. Session invalidation emits `type:"event"`,
`event:"session-invalidated"`, the exact revoked `leaseId`, and a fixed reason code.
No wire method selects a container, account, scope, authorizer, URL, file or
credential. Lease IDs only look up a host-attached capability on the same native
connection; they are not remote authentication.

The gate observes `CKAccountChanged` synchronously and accepts explicit native
logout/profile/lifecycle revocations. Lock-held work excludes I/O and actor waits.
Revocation cancels only work captured under the revoked lease. Queued successes
are checked again at consumption and become fixed stale-session failures. An old
lease event must not silently install or revoke a different current JS profile.
Native `staleSession`, `accountUnavailable` and `unauthorizedScope` failures revoke
only the gate capture that produced the failure, even without an account notification.
A delayed failure cannot revoke a newer attachment. Transient transport failures
retain the lease for explicit foreground retry. Session replacement must revoke JS/native owners first, settle/invalidate prior
transport work, then open/attach the new authorized session. A submitted remote
write may still succeed; lost/cancelled replies leave exact-byte retries possible.

`JournalRPCFrameDecoder` and `JournalRPCStdioServer.run(input:output:adapter:connectionID:)`
provide a four-byte unsigned big-endian length prefix followed by exactly one JSON
body. The pump shares the adapter's limits. It handles fragmented/coalesced frames
and admits control requests while backend work is held. Stdio uses nonblocking
syscalls, bounded chunks and short cancellable waits only while foreground pipe
I/O is pending; it creates no sync timer or background schedule. Output is
serialized. Revocation is terminal for a stdio connection even when a fixed
error/event is queued behind a full pipe; a fresh connection/gate is required.
Stale captured success also stops the connection after a partial frame was written. Broken pipes map to fixed errors through a per-descriptor
SIGPIPE setting. The pump restores descriptor flags and leaves closing the
host-owned handles/process to its embedding owner. EOF revokes the channel.

Limits default to a 2-MiB full JSON frame, a 64-KiB input/output chunk, four queued
output frames, four decoded frames per chunk, 100 operations, 256 KiB per envelope,
1 MiB aggregate envelope bytes and an 8-KiB cursor. The outer JSON wrapper is capped
at eight nesting levels and 2048 nodes before recursive Foundation decoding.
Operation counts, canonical base64 sizes and aggregate decoded sizes are checked
before body decoding; the whole pull reply is sized before creating base64 strings.
No page is sliced, and no checkpoint is returned on an over-budget response.
Swift never re-encodes operation JSON. TypeScript still must parse, canonicalize,
verify the reference and admit exact received bytes before atomic store receive.

`nextOutput()` cannot retract bytes already handed to a WK callback or OS pipe.
The future JS owner must bind each pending RPC ID to its captured store binding,
coordinator request ID/channel/epoch, native lease, connection and AbortSignal;
reject late/mismatched replies, and synchronously invalidate on locally observed
navigation, ownership, logout, process or binding changes. Emit the existing
coordinator acknowledgement/page shape from those captured values, not authority
fields supplied by a reply. The coordinator alone commits outbox acknowledgements
or operations plus checkpoint. These tests do not create that production mapping
or prove any new local durable acknowledgement transaction.

Future Electron main code must verify its bundled helper and current app main
frame, use dedicated pipes without a shell, and expose only fixed foreground
operations in the isolated preload. A future WK handler must validate its current
WebView, main frame/origin and navigation generation before using this `Data`
adapter; no general script execution or interpolated payload code is supplied.
WebKit and CloudKit may allocate a message/record before the handler's admission
cap: these IPC bounds do not establish a pre-platform or pre-network allocation cap.

The 12 RPC test groups exercise real OS pipes, held-backend cancellation, full-pipe
revocation, EOF/truncation/broken output, exact partial/duplicate acknowledgements,
stale leases, malformed wrapper/base64/Unicode, scope retention, cursor refusal,
byte/queue bounds and redacted provider failures. Backend account calls in those
fixtures are synthetic in-process methods, never actual CloudKit account calls.

## Verification

From the repository root, with workspace Node dependencies already installed:

```sh
KAIRO_EVIDENCE_DIR="$HOME/.dharma/bunki/apple-sync/check" \
  node packages/apple-sync/tools/verify.mjs
```

The runner checks seven transport fixtures and ten positive/eight negative RPC fixtures against the actual TypeScript canonical serializer
and operation parser, builds the real SDK library in release mode, and executes 31
Swift Testing groups (38 invocations including parameterized cases). XML group names
and per-group Swift pass summaries must agree; invocation counts are derived from
those summaries. Six receipt-admission tests reject incomplete, duplicate, failed,
skipped or partially executed test reports. It records
source hashes, SDK/compiler identity, exact test names, logs and the test XML outside
the checkout. The output directory must be fresh. CI requires an explicit absolute
directory below `RUNNER_TEMP` with `CI` set, for example:

```sh
KAIRO_EVIDENCE_DIR="$RUNNER_TEMP/apple-sync-check" \
  node packages/apple-sync/tools/verify.mjs
```

The package declares Swift tools 6.0, macOS 14 and iOS 17. Verification requires a
macOS host, Swift 6 or newer, a compatible macOS SDK with CloudKit, and the installed
Swift Testing framework/macro plugin. The tested toolchain is Swift 6.3 with macOS 26
SDK on arm64; older declared versions and an iPhone target were not exercised.
Missing tools/SDK or a failed Testing compile probe produces a nonzero exit with a
fixed failure code and available logs; unsupported environments never pass by skip.
On this Command Line Tools installation, it supplies the installed Testing framework
and `lib_TestingInterop` runtime paths that SwiftPM otherwise misses.

Fixtures cover exact/conflicting duplicate bytes, actual CKRecord encrypted field
round trips, actual SDK partial-save result admission, missing/unexpected results,
scope/identity rejection, unavailable and unauthenticated account states, account
and learner IDs with distinct canonically equivalent UTF-8 encodings,
switch/revocation fences, late success after invalidation, cancellation, cursor
tampering/wrong scope, failed fetches, reset/expiry/deletion retention, and bounds.
Opaque synthetic token data exercises the wrapper and caller checkpoint contract.
Malformed archive data exercises the actual secure token decoder. CloudKit tokens
cannot be manufactured through a public initializer; positive real token archival
is SDK compile evidence until an authorized live token fixture is available.
