# Bunki (分岐)

Phase-0 build of one closed learning loop: paste or select a provenance-labeled
seeded encounter → durable thread → bounded AI candidate explanation → explicit
promotion → one retrieval contract → one contextual reuse → scored probe →
finite session → inspect and export the evidence.

## Current integrated prototype — 2026-08-15

The active KAIRO/Corridor integration lives on
[`agent/bunki-integrated-prototype-2026-08-15`](https://github.com/AmitabhainArunachala/Bunki-app/tree/agent/bunki-integrated-prototype-2026-08-15),
based directly on the current PR #71 head. Start with the
[current product constitution](docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md);
it is the dated front door to the frozen product laws, current visual rulings,
ten public worlds, and the quiet writing-room contract.

- [Open the current integrated prototype](https://bunki-integrated-prototype.simandharswami1111.chatgpt.site)

Sites v5 is preserved without modification on
[`sites/v5-import`](https://github.com/AmitabhainArunachala/Bunki-app/tree/sites/v5-import)
at `a3de88251d7ea0acde086b190bdd8f3afda46b94`. It is a donor, not an alternate
authority. The exact port boundary and remote-agent handoff are recorded in
[`SITES_V5_CLAUDE_HANDOFF_2026-08-15.md`](docs/handoffs/SITES_V5_CLAUDE_HANDOFF_2026-08-15.md).

The older Sites v11 material below remains useful implementation history, but
it is not the current visual or interaction baseline.

**LICENSE: pending operator decision** (OD-09). The repository is private. Until
the operator chooses, no dependency or data may constrain that choice beyond the
share-alike seed data confined to `packages/seed/`.

## Run the complete web app

The current interactive product lives in `prototypes/bunki-sites-v11/`. It is the
same Bunki reader, dictionary, kanji drill-down, sentence mining, SRS, and coach
source used by the polished public checkpoint—not a screenshot or a reduced mock.

- [Open this PR branch in GitHub Codespaces](https://codespaces.new/AmitabhainArunachala/Bunki-app?quickstart=1&ref=claude/sites-v11-interaction-recovery)
- [Open the current public checkpoint](https://bunki-living-japanese.amitabha1982.chatgpt.site)
- [Review the source and verification PR](https://github.com/AmitabhainArunachala/Bunki-app/pull/20)

Codespaces installs the nested app, starts it, forwards port 5173, and opens the
preview. From a normal clone:

```bash
npm run bunki:web:dev
```

Every PR runs the production build, unit suite, and the real browser acceptance
suite in mobile Chromium, mobile WebKit, and desktop Chromium. After human merge,
GitHub Actions can deploy the full Vinext/Cloudflare Worker when the repository
contains `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets. GitHub Pages
is retained only as a client-only preview because it cannot run Bunki's article,
RSS, transcript, AI, or sync routes.

## Status

The repository now preserves two complementary build tracks: the runnable Bunki
web product under `prototypes/bunki-sites-v11/`, and the deterministic Phase-0
core under `apps/` and `packages/`. Product features are real and interactive;
claims about efficacy, retention, or review burden remain outside the evidence
currently collected (REQ-GATE-03).

## Governing documents

The build is driven by frozen specifications under `docs/specs/`. They are
hash-verified against `docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` and
**must never be edited**:

| Document                                                          | Role                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| `BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md`     | the controller — work packages, tests, stop conditions |
| `BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md`      | design authority                                       |
| `BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md` | who builds what, when                                  |

Architecture decisions live in `docs/adr/`; build evidence and the resumable
capsule live in `docs/build-evidence/`.

## Layout (controller §5)

npm workspaces monorepo, Node ≥ 22.

```
apps/app/              Expo app, web + native targets
packages/domain/       @bunki/domain — pure core (events, reducers, evidence gate, session)
packages/persistence/  @bunki/persistence — event store ports + adapters
packages/seed/         @bunki/seed — licensed seed dataset with per-field provenance
packages/ai/           @bunki/ai — bounded AI candidate path
packages/export/       @bunki/export — versioned lossless export
```

Each package README states its owning work package and its boundary rules.

## Boundaries that are enforced, not merely documented

See ADR-001. The short version, all lint-enforced in `eslint.config.mjs`:

- `@bunki/domain` imports no React, React Native, Expo, Node builtin, or sibling
  package — clock/ID/randomness are injected, which is what makes deterministic
  replay possible.
- `apps/app` reaches `@bunki/persistence` from exactly one directory,
  `apps/app/src/state/persistence/`; no screen, route, or test can obtain an
  `EventStorePort`, so every append still flows through the domain command
  handler and evidence-class events still pass the evidence gate (WP-10 narrowed
  WP-05's blanket ban rather than dropping it; `test/boundaries.test.ts` proves
  the seam is that one directory).
- Only `@bunki/domain` imports `ts-fsrs` — one scheduler, nothing else computes
  intervals.

## Commands

```bash
npm install

npm run lint          # eslint, incl. the boundary rules above
npm run format:check  # prettier
npm run typecheck     # tsc --noEmit in every workspace
npm run test          # vitest, all workspaces

npm run test:replay   # golden replay        — placeholder until WP-02
npm run verify:export # export→replay equality — placeholder until WP-03
npm run test:e2e      # Playwright web flow  — placeholder until WP-10

(cd apps/app && npx expo export --platform web)   # build proof
```

The three placeholder scripts print that they are unimplemented and exit 0. They
are defined now because the controller's check set names them; they are not
evidence of anything passing.

## Runtime honesty

Web results are never reported as native results. Native persistence, capture
loss, and latency numbers come only from on-device runs (WP-11) and are marked
UNVERIFIED until then.
