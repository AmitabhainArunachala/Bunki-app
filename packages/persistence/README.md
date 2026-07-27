# @bunki/persistence

**Owner WP:** WP-03 (ports, sqlite adapter, provisional web adapter, migrations,
idempotency, deletion path). WP-11 executes the native runtime checks.

**LICENSE: pending operator decision** (controller §4, OD-09).

## What this package is

The durable event store behind `EventStorePort` and `QueryPort`. The event log is
the only authority; derived state is always re-derived by replaying it through
`@bunki/domain`. There is a derived-state cache table, and it is deliberately
never an answer to `snapshot()` — see "The cache never answers" below.

## Runtime honesty (REQ-ARCH-05, P0-CAP-15)

| Adapter       | Path                                          | Claim status                                                                        |
| ------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| expo-sqlite   | `src/sqlite/` + `src/sqlite/expo-driver.ts`   | **native authority** — only WP-11 device runs may claim native verification         |
| CI substitute | `src/sqlite/` via `src/sqlite/node-driver.ts` | labeled `ci-substitute` in every test name; **never** counts as native verification |
| Web           | `src/web/`                                    | **provisional** — labeled provisional in code, in the about screen, and here        |

Web persistence results are never reported as native persistence.

**There is one SQLite adapter.** `src/sqlite/adapter.ts` holds all the SQL and all
the logic; the driver seam (`src/sqlite/driver.ts`) decides only _who executes
it_ — `expo-sqlite` on a device, `node:sqlite` in CI. That is the whole
CI-substitution mechanism, and it is also why a green CI run proves less than it
appears to: it is evidence about the SQL, the transactions, and the invariants,
and evidence about nothing on iOS.

### The ci-substitute driver, recorded (controller §14)

- **Chosen:** `node:sqlite` (`DatabaseSync`), built into Node. Verified working
  on the pinned toolchain, Node **v22.22.2**, which is the major CI selects.
  Available from Node 22.5.0; experimental in Node 22 (emits an
  `ExperimentalWarning`). **No npm dependency added**, so nothing new constrains
  the operator's pending licence decision; it ships under Node's own MIT licence.
- **Rejected:** `better-sqlite3`, verified from the npm registry at **13.0.1**,
  licence **MIT** (`npm view better-sqlite3 version license`, 2026-07-27).
  Compatible and acceptable; not taken because it is a native addon needing
  `node-gyp` in every CI run, and adding a dependency to support a _substitute_
  for a runtime we explicitly do not claim to have verified is cost without
  evidence.

### What CI cannot check about the expo binding

`src/sqlite/expo-driver.ts` declares the four-method subset of
`expo-sqlite@57.0.1`'s synchronous API (registry-verified, MIT) rather than
importing the package — see that file's header for the three reasons. The cost is
real and stated: if upstream changes those signatures, TypeScript here will not
notice. **WP-11 obligation:** install the real package on the device build and
compile the binding against its own typings.

## Boundary rules (controller §5, §7 — lint-enforced)

- **`apps/app` never calls `EventStorePort.append` directly.** Every append flows
  through the domain command handler, which routes evidence-class events through
  the evidence gate. Enforced by an ESLint rule forbidding `@bunki/persistence`
  (and its subpaths, and any relative path that resolves into it) anywhere under
  `apps/app`. That rule is what closes the evidence-gate-bypass hole; do not add
  exceptions to it without an ADR.
- **Never import `@bunki/domain` internals.** Depend on its public surface only.
- **`node:sqlite` stays behind the `@bunki/persistence/ci-substitute` subpath**
  and out of the package barrel, so a Node builtin never reaches the React Native
  bundle.

## Contracts this package keeps

### One contract suite, both adapters

`src/contract/suite.ts` is the port contract-test suite, and it lives in `src/`
rather than `test/` for three reasons: both adapters are held to _identical_
assertions instead of two files that drifted; it carries no test-framework
dependency, so WP-11 can run the same list on a device and compare like with
like; and a future adapter is admitted by passing it, not by looking equivalent.
`test/contract.*.test.ts` are thin Vitest wrappers that put the runtime label and
the controller anchors into every emitted test name.

### Idempotency is `@bunki/domain`'s rule, not a second one

Same key + byte-identical content → no-op. Same key + different content →
`IdempotencyConflictError`. Same `eventId` + different content →
`DuplicateEventIdError`. The error classes are imported from `@bunki/domain`
rather than redefined, because a store whose idempotency semantics could drift
from replay's would produce two histories and no failing test.

`append` also takes a batch-level key (controller §7). The batch key makes a
double-tapped save one write; the per-event keys make one event appear once
however many batches contain it.

### No log that fails to replay is ever written

Every append replays `(stored log ++ new events)` through `@bunki/domain` before
committing, and lets replay's typed errors out. The store does not reimplement
"does this thread exist" or "was this candidate attached" — it asks the component
that owns those answers. Cost: one linear replay per append. That is a §21.4
kill-criteria decision for WP-10 with measurements attached, not a quiet removal.

### The cache never answers

`snapshot()` always replays. `bunki_derived_state_cache` is written after an
append and read only by `QueryPort.derivedStateCacheMeta()`. A cache that could
answer `snapshot()` would be a second source of truth, and the first time two
sources of truth disagree, the disagreement is silent.

### Migrations ship verified rollback

Every forward migration has a down-migration, and `test/migrations.test.ts`
drives each one up → down → up, comparing a canonical `sqlite_master`
fingerprint. The runner refuses a destructive migration that ships no rollback,
**and** refuses one whose `destructive` flag disagrees with what its SQL actually
does — a `DROP TABLE` labelled `destructive: false` is precisely the accident
controller §21.3(7) exists to prevent. No destructive migration ships in Phase 0;
the guard is exercised with fixture migrations that really are destructive.

### Deletion removes bytes, not rows

`ThreadTombstoned` then `ContentPurged` (ADR-002). The tombstone survives
forever; the purge empties the learner's content — `text` replaced by a constant
placeholder, `span` and `sourceRef.locator` dropped — while every id, timestamp
and the full `provenance` record stay, because licence obligations outlive the
material they attach to (REQ-SRC-01, T-15).

Three things make it a real deletion rather than a flag:

1. `PRAGMA secure_delete = ON`, so SQLite zeroes freed cells instead of leaving
   them legible on the page;
2. `PRAGMA wal_checkpoint(TRUNCATE)` + `VACUUM` after a purging batch, so no
   pre-update page image survives in the `-wal` file or the freelist;
3. the batch-idempotency table stores a **digest** (`src/hash.ts`), not the
   canonical event text, and purging drops the batch rows that referenced purged
   events. The first version of that table held a verbatim copy of every event
   ever appended — the contract suite's raw-storage assertion is what found it,
   which is why that assertion reads bytes rather than asking the port.

Re-appending purged content is a **no-op, never a resurrection**.

## Directory map

| Path                 | Contents                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `src/port.ts`        | `EventStorePort` + `QueryPort` interfaces, runtime labels        |
| `src/append-plan.ts` | what an append means — shared by both adapters                   |
| `src/indexing.ts`    | stream indexing, incl. indirect thread references                |
| `src/purge.ts`       | redaction, purge authorisation, purge planning                   |
| `src/hash.ts`        | SHA-256 with no platform API (see the deletion note above)       |
| `src/contract/`      | the shared port contract-test suite + its fixtures               |
| `src/sqlite/`        | one adapter, two drivers (expo-sqlite / node:sqlite)             |
| `src/web/`           | provisional web adapter (labeled)                                |
| `src/migrations/`    | forward + verified rollback, and the destructive-migration guard |

## Status

WP-03 delivered: ports, contract suite, both adapters, migrations, idempotency,
tombstone-then-purge. T-01 and T-16 are green as `ci-substitute` and
`web-provisional`. **T-16 native is UNVERIFIED** and belongs to WP-11.
