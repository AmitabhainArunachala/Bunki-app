# @bunki/app

**Owner WP:** WP-01 scaffolds it. Screens are **WP-05** (capture/word/kanji),
**WP-08** (session/canvas/repair), **WP-09** (evidence inspector, observability).
`e2e/` is **WP-10**'s surface.

**LICENSE: pending operator decision** (controller §4, OD-09).

## What this app is

The Expo shell, targeting web and native. It renders domain state and maps user
interactions to domain commands. That is all it does.

## Boundary rules (controller §5 — lint-enforced)

- **No scheduling, grading, or evidence logic here.** Those live in
  `@bunki/domain`. If a screen needs to decide something about learning, the
  decision belongs in the domain and the screen calls it.
- **Never import `@bunki/persistence`.** `apps/app` must not call
  `EventStorePort.append` directly. Every append flows through the domain
  command handler, which routes evidence-class events through the evidence gate.
  This is enforced by `no-restricted-imports` in `eslint.config.mjs`, and it is
  the rule that closes the gate-bypass hole — an exception request is an ADR,
  not a lint-disable comment.
- **Candidates are always labeled.** AI-generated content renders with a visible
  "AI candidate / generated" label (T-12) and is never presented as canonical.
- **Claim discipline (REQ-GATE-03).** No comprehension percentages, no global
  level, no "scientifically optimized", no reduced-burden claims — in UI copy,
  comments, or commit messages.

## Directory map (controller §5)

| Path           | Contents                                | Owner WP                             |
| -------------- | --------------------------------------- | ------------------------------------ |
| `app/`         | expo-router routes                      | shell WP-01; routes per screen owner |
| `src/screens/` | screen components + state machines      | WP-05 / WP-08 / WP-09                |
| `src/state/`   | wiring of domain commands (no logic)    | screen owner                         |
| `src/ui/`      | design tokens, primitives, ruby, states | WP-05                                |
| `src/data/`    | read-only views over `@bunki/seed`      | WP-05                                |
| `scripts/`     | evidence harness (Node, not bundled)    | WP-05                                |
| `e2e/`         | Playwright web E2E + axe scan           | WP-10                                |
| `test/`        | unit tests colocated with the app       | screen owner                         |

Shared-file rule (orchestration spec §4): when two builders share `apps/app`,
`app/_layout.tsx` and other shared files stay with the shell owner; the other
builder requests changes via the Conductor rather than editing them.

## Monorepo notes

`metro.config.js` is **not** the create-expo-app default. The template assumes a
single-package repo; the committed config adds `watchFolders` for the workspace
root and an explicit `nodeModulesPaths` so the hoisted root `node_modules` and
the sibling `packages/*` workspaces resolve. See ADR-001.

It also resolves `.svg` as **source text** rather than as an image asset
(WP-05). The kanji page animates writing order, which needs the individual
KanjiVG `<path>` elements — an asset URI cannot provide them. The transformer in
`svg-text-transformer.js` hands the file's text to the parser in
`src/data/kanjivg.ts`; nothing is copied out of `packages/seed`, which is the
only package share-alike data is admitted into (controller §4, DL-33).

## TypeScript programs

`tsconfig.json` compiles `app/` and `src/` with **no Node types**, so `process`,
`Buffer` and friends are type errors in anything that ships in the bundle.
`tsconfig.test.json` adds them for `test/` and `scripts/`, which genuinely read
the filesystem. `npm run typecheck` runs both. This mirrors the split in
`@bunki/domain`.

## Build proof

```bash
cd apps/app && npx expo export --platform web
```

This is the controller §17.5 build proof and must run from `apps/app`.

## Screenshot evidence

```bash
npm run evidence:screenshots        # from apps/app, after an export
```

Serves the export and drives headless Chromium over CDP to capture every screen
in every REQ-UI-09 state, into `docs/build-evidence/screenshots-wp05/`. See that
directory's README for what the images do and do not claim.

## Runtime honesty

Web results are **never** reported as native results. Native persistence,
capture-loss, and latency numbers come only from WP-11 device runs (P0-CAP-15).
