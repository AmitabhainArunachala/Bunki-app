# ADR-001 — Repository layout and enforced boundaries

- **Status:** Accepted (WP-01)
- **Date:** 2026-07-27
- **Authority:** controller §5 (`docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md`, sha256 `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47`)
- **Supersedes:** nothing

## Context

Bunki's Phase-0 claim is not "the app works". It is narrower and harder: that the
evidence the app records about learning is _trustworthy_. Every capability in the
controller ultimately rests on three properties — replay determinism, a single
scheduler, and a single gate through which evidence-class events must pass.

Those three properties are all destroyed the same way: by a convenient import.
A domain module that reads `Date.now()` directly breaks replay. A screen that
calls `EventStorePort.append` directly bypasses the evidence gate. A second FSRS
call site quietly forks the scheduler. None of these look like defects at review
time; each looks like a shortcut that saves ten minutes.

So the question this ADR answers is not "how should we organise files" but
"which invariants do we refuse to leave to reviewer vigilance".

## Decision

### 1. An npm-workspaces monorepo with exactly the controller §5 layout

```
package.json                 workspaces root (WP-01)
tsconfig.base.json           strict TS config (WP-01)
.github/workflows/ci.yml     CI pipeline (WP-01; WP-10 may extend)
apps/app/                    Expo app, web + native targets
  app/                       expo-router routes
  src/screens/               screen components + state machines
  src/state/                 app-side wiring of domain commands (no logic)
  e2e/                       Playwright web E2E (WP-10)
packages/domain/             @bunki/domain — PURE core
  src/events/ src/reducers/ src/contracts/ src/evidence/ src/session/ src/replay/ test/
packages/persistence/        @bunki/persistence
  src/port.ts src/sqlite/ src/web/ src/migrations/
packages/seed/               @bunki/seed (data/, LICENSES.md)
packages/ai/                 @bunki/ai (src/envelope.ts, src/provider/, src/fallback/)
packages/export/             @bunki/export
docs/build-evidence/         capsules, test logs, screenshots
docs/adr/                    architecture decision records
```

Ownership is per work package. Touching a surface outside the active WP's
ownership is a collision violation, not a merge conflict to resolve casually.
Each package README names its owner WP.

### 2. Three boundaries are lint-enforced, not documented

Implemented in `eslint.config.mjs` with the core `no-restricted-imports` rule.

**B1 — `@bunki/domain` is pure.** `packages/domain/src/**` may not import React,
React DOM, React Native (or any `react-native-*`), Expo (or any `expo-*` /
`@expo/*`), any Node builtin (bare or `node:`-prefixed), or any sibling
`@bunki/*` package. Clock, ID generation, and randomness are injected
(REQ-ARCH-02).

_Why:_ replay determinism (T-03) is only meaningful if the kernel cannot read
ambient state. A single `Date.now()` in a reducer makes every replay assertion a
coincidence. Purity also means the entire epistemic core is testable without a
device, a database, or a network.

Domain _tests_ keep the same platform and sibling-package restrictions but may
use Node builtins, because loading golden fixtures from disk is legitimate test
IO and does not affect the kernel's determinism.

**B2 — `apps/app` cannot reach the persistence write path.** `apps/app/**` may
not import `@bunki/persistence` or any of its subpaths.

_Why:_ this is the gate-bypass hole. Controller §5 requires every append to flow
through the domain command handler so evidence-class events are routed through
the evidence gate (REQ-ARCH-04). A screen holding an `EventStorePort` can append
a `ReviewGraded` that never met the gate's preconditions, and nothing downstream
could tell. Blocking the whole package rather than just `append` is the
conservative reading: it costs a re-export when the UI genuinely needs a type,
and it removes the class of mistake entirely.

**B3 — only `@bunki/domain` imports `ts-fsrs`.** Everywhere else the import is a
lint error.

_Why:_ REQ-SCH-01 permits exactly one scheduler implementation. A second call
site is not a duplicate — it is a divergent scheduler that will disagree with the
first under some interval, and the disagreement will surface as unexplained
review timing rather than as an obvious bug.

An inline `eslint-disable` on any of the three is an ADR-level decision. If one
of these rules is genuinely wrong, amend this ADR; do not silence it locally.

### 3. Strict TypeScript everywhere, from one base

`tsconfig.base.json` sets `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`,
`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`,
`isolatedModules`. Every workspace extends it; `apps/app` extends
`expo/tsconfig.base` first so the strict settings win on conflict.

`exactOptionalPropertyTypes` matters more than it looks: the §6.1 event schema
distinguishes absent optional fields (`userConfirmedEasy?`) from present-and-
undefined, and that distinction carries evidence meaning.

### 4. Toolchain versions are pinned exactly

No `^`, no `~`, anywhere (controller §14). Version drift in a scheduler or a
schema validator is a correctness event, not a maintenance event.

## Consequences

**Accepted costs.**

- The UI cannot hold persistence types directly; when it needs one, the domain
  re-exports it. This is friction by design.
- `packages/domain` cannot use Node's `crypto.randomUUID`; ID generation is an
  injected port. Slightly more wiring, and the reason replay works.
- Strict flags like `noUncheckedIndexedAccess` will make array access noisier in
  reducers. Worth it where the arrays are event logs.

**Deviation recorded: TypeScript 6.0.3, not 7.0.2.**

The WP-00 capsule recorded `typescript 7.0.2` from the npm registry at admission.
That pin is not installable with the rest of the verified register: the current
stable `typescript-eslint` (8.65.0) declares `peer typescript ">=4.8.4 <6.1.0"`,
and Expo SDK 57's own template pins `typescript ~6.0.3`. Installing 7.0.2 fails
`npm install` with `ERESOLVE`.

Resolved by pinning `typescript@6.0.3` — the highest version supported by both
the linter and the Expo SDK. This is a recoverable toolchain conflict with a safe
alternative (controller §3.6), not a §21.3 stop condition: no license changed, no
integrity check failed. Recorded here and in the capsule so it is not mistaken
for drift. Revisit when `typescript-eslint` ships TS 7 support.

**Not decided here.** The repository license remains a pending operator decision
(OD-09); every package README says so. Until it is made, no dependency or data
may constrain it beyond the share-alike seed data confined to `packages/seed/`
(REQ-SRC-02, DL-33).
