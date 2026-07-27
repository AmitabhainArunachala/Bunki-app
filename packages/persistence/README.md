# @bunki/persistence

**Owner WP:** WP-03 (ports, sqlite adapter, provisional web adapter, migrations,
idempotency, deletion path). WP-11 executes the native runtime checks.

**LICENSE: pending operator decision** (controller §4, OD-09).

## What this package is

The durable event store behind `EventStorePort` and `QueryPort`. Append-only
event table plus derived-state cache tables that are always rebuildable by
replay — the cache is an optimisation, never a source of truth.

## Boundary rules (controller §5, §7 — lint-enforced)

- **`apps/app` never calls `EventStorePort.append` directly.** Every append flows
  through the domain command handler, which routes evidence-class events through
  the evidence gate. This is enforced by an ESLint `no-restricted-imports` rule
  that forbids `@bunki/persistence` (and its subpaths) anywhere under `apps/app`.
  That rule is what closes the evidence-gate-bypass hole; do not add exceptions
  to it without an ADR.
- **Never import `@bunki/domain` internals.** Depend on its public surface only.
- **Idempotency is a contract, not a nicety.** Re-appending the same
  `idempotencyKey` is a no-op.
- **Migrations ship verified rollback.** Every forward migration has a
  down-migration exercised in tests. A destructive migration without verified
  rollback is a controller §21.3 stop condition.

## Runtime honesty (REQ-ARCH-05, P0-CAP-15)

| Adapter       | Path                                   | Claim status                                                                   |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| expo-sqlite   | `src/sqlite/`                          | **native authority** — only WP-11 device runs may claim native verification    |
| CI substitute | `src/sqlite/` via a Node SQLite driver | labeled `ci-substitute` in test names; **never** counts as native verification |
| Web           | `src/web/`                             | **provisional** — labeled provisional in code, in the about screen, and here   |

Web persistence results are never reported as native persistence.

## Directory map

| Path              | Contents                                  |
| ----------------- | ----------------------------------------- |
| `src/port.ts`     | `EventStorePort` + `QueryPort` interfaces |
| `src/sqlite/`     | expo-sqlite adapter (native authority)    |
| `src/web/`        | provisional web adapter (labeled)         |
| `src/migrations/` | forward + verified rollback migrations    |

## Status

WP-01 skeleton only.
