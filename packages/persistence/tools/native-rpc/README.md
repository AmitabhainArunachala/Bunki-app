# Foreground native RPC client candidate

`NativeRpcSyncSession` implements the existing `AuthenticatedSyncSession` port.
It translates one coordinator push or pull into the frozen Swift journal RPC and
returns a validated response. `SyncCoordinator` remains the sole owner of durable
outbox acknowledgements and atomic receive/checkpoint commits. This module has no
store, credentials, native account calls, scheduler, reconnect or retry loop.

The reviewed client and runner are installed in this checkout. No barrel or
application integration is included. All fixtures use synthetic account authorization;
they do not authenticate a production user or establish a production IPC channel.

## Trusted host seam

Construct `new NativeRpcSyncSession({ port, authority, limits? })` with two separate
host capabilities:

- `NativeRpcBytePort` owns an exclusive fresh native connection. Its exact UUID,
  byte writes and close/data callbacks are trusted embedding code. `send` must
  serialize frames in invocation order and reject failed/partial writes. It must
  bound its own buffers, split incoming chunks to at most the agreed 64 KiB default,
  and report EOF, process exit, navigation change and pipe failure. The client
  retains no unbounded request or reply queue.
- `NativeRpcAuthority` supplies an out-of-band `NativeRpcOwnerCapture` and a
  synchronous `assertCurrent` callback. The capture includes the existing exact
  account/learner/session binding, channel, native lease, connection UUID, owner,
  process, navigation and epoch. The client clones these values and checks all of
  them against the current host capture and callback. Coordinator clones are
  supported; object identity alone cannot authorize a response.

The native authenticated CloudKit account must separately authorize the existing
opaque logical profile through trusted pairing. Today's local-account/local-learner
IDs and immutable operation identities must never be silently replaced with a
CloudKit user ID. Imported bindings, operation IDs, native reply IDs, cursors and
`describe` results cannot grant that pairing. This client does not call `describe`
or accept wire session creation. Pairing/provisioning and authenticated production
IPC are still host integration work.

Before exposing the capability, the host must admit all source-bearing content
under the application's source policy. A sync-schema-valid operation, provenance
field, source basis or hash is not permission to transmit a source quotation.
The client preserves canonical content and does not add source admission.

On logout, profile/account change, navigation/process replacement or native lease
loss, the host must synchronously call `session.invalidate()` and invalidate its
own authority closure. `close()` is also terminal. A matching native revocation
event closes this owner synchronously when admitted. Global native session-loss
errors close it; transient and per-record failures are kept distinct. No event or
reply can rebind this object. Fresh authorization and a fresh connection are
required to construct another instance.

Native revocation cannot retroactively remove bytes already delivered through an
OS pipe. The host's synchronous owner fence, the client's final continuation check,
and the coordinator's pre-commit checks are all required. This adapter cannot prove
that an Electron preload/main bridge or WKWebView caller belongs to the active
window, navigation or authenticated native process. The embedding must supply that
proof and must not expose host grant/control methods to an untrusted renderer.

## Wire and budget behavior

The protocol is unchanged: four-byte unsigned big-endian length, then one UTF-8
JSON body. IDs are positive canonical decimal strings starting at `1` on this
exclusive connection. The active record explicitly maps that ID to the separate
opaque coordinator request ID; it never interprets operation IDs as authority.
Only one push/pull and one cancellation control request may be outstanding.

The wrapper reader rejects malformed UTF-8/scalars, duplicate decoded keys, wrong
identity/method/lease/version/shape, unknown or stale replies, excess depth/nodes,
oversized advertised frames and excessive chunks before operation admission.
Base64 must be canonical, bounded and exactly reversible. Each pulled operation
passes a bounded duplicate-key-aware reader, the actual TypeScript sync parser,
exact canonical JSON comparison, exact scope matching and reference validation.
No Unicode normalization, UTF-8 repair or canonicalization repair is performed.

Defaults match Swift: 100 operations, 256 KiB per canonical envelope, 1 MiB per
canonical batch, 8 KiB per opaque cursor, 2 MiB per outer frame, 64 KiB per chunk
and four frames per chunk. The host must configure matching limits out of band.
Smaller supported limits are conservative refusals, never permission to truncate.

The coordinator's `maxBytes` measures its compact JSON representation. Native
canonical JSON is pretty printed, and RPC adds base64 and metadata. Both the
coordinator response budget and the native frame/envelope/batch budgets apply.
A compact request or response that fits `maxBytes` can still fail the native wire
budget. The client refuses the whole offer/page, preserves pending state, and does
not silently reduce an offered prefix or skip an oversized operation.

Successful push acknowledgements must be a unique exact subset of offered refs;
the native `failures` rows must account for every other offered operation, with
fixed known codes and no overlap. Unknown refs, wrong digests, duplicate IDs or
incomplete partitions produce no response to the coordinator. Pull preserves the
exact prior/next opaque cursor and all operations; the caller commits them together.
Invalid/expired cursors, resets, deletions and partial native pull failure remain
failures with the caller checkpoint untouched.

Abort rejects the caller immediately and sends at most one cancel control frame.
The connection remains busy until both target/control replies drain or the host
closes it. Cancellation is not remote rollback: a saved write can remain pending
locally. No uncertain write is retried by the adapter. A later explicit foreground
coordinator cycle may resend the same immutable operation refs for native exact-byte
deduplication. There is no autonomous timeout; the foreground owner supplies its
deadline through `AbortSignal` and may close an unresponsive connection.

## Verification and limitations

The focused suite covers 61 unit cases and seven actual Swift OS-pipe cases.
The native suite is named `native-rpc-session.interop.ts` and explicitly included
by this runner. Ordinary root Vitest collects the 61 portable `.test.ts` cases;
the native suite never succeeds by skipping when its fixture host is absent.
It compiles all nine unchanged native source files with the real SDK, plus
`FixtureHost.swift` in the same module to access the internal synthetic backend.
That fixture uses an explicit synthetic native authorizer. Separate inherited
file descriptors `3` and `4` carry its small test-only grant/control messages;
stdin/stdout carry only the real frozen journal RPC. These fixture descriptors
are not a production authority protocol.

Two real file-backed `node:sqlite` stores participate in the partial-ack/exact-pull
case. SQLite is explicitly the `ci-substitute` driver, not proof of iOS native
storage. Tests preserve the coordinator's revision, outbox and checkpoint after
cancelled, revoked, account-lost, closed and already-in-transit late replies, and
exercise an explicit deduplicated retry. The real native cursor codec's rejection
retains the prior caller checkpoint. The browser bundle check demonstrates that
the adapter runtime has no Node import requirement; it does not wire a browser,
Electron, WKWebView or native lifecycle to an authenticated store.

The runner requires Node 22+ with working `node:sqlite`, the repository's installed
dependencies, Swift 6.3+ and the macOS 26+ SDK. Missing tools fail explicitly; there
is no success by skip. Use a new output directory whose parent already exists,
under `~/.dharma` locally or under `RUNNER_TEMP` when `CI` is set. It refuses an
existing output directory. Compiler, Vite, test database and bundle scratch remain
there. Logs contain local compiler/test output for synthetic fixtures only; client
errors expose fixed codes and no native/provider message text.

Run the installed client checks from the repository:

```sh
KAIRO_RPC_EVIDENCE_DIR=/absolute/path/under/.dharma/fresh-check \
node packages/persistence/tools/native-rpc/verify.mjs
```

The installed suite passed all 61 portable cases and seven real Swift pipe cases
in the eighth candidate. The desktop's separately tested
`lib/native-rpc-byte-port.cjs` now implements the byte-port seam for an already
spawned, exclusively owned helper. It is not yet connected to an application
window or a production helper. Its focused checks and separate Swift interop
experiment do not establish authenticated production IPC.

No live CloudKit/account calls, credentials, signing, entitlements, provisioning,
purchases, source rights grants, schedule changes, application wiring or automatic
sync occur in these checks. Authenticated profile pairing, transport embedding,
source admission, current owner/store freshness and complete application operation
coverage remain production integration obligations.
