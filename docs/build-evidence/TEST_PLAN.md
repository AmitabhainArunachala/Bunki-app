# Acceptance test plan — T-01..T-17

- **Owner:** WP-01 (this plan). Each test is implemented by its owning WP below.
- **Authority:** controller §17.1 (test map), §17.2 (adversarial additions), §17.5 (check set)
- **Status at WP-01:** none of T-01..T-17 are implemented yet. This document is the
  contract that says who owes which test, so that no assertion is silently dropped
  between work packages.

> A test counts as owned only when it *asserts what the controller says it
> asserts*. Paraphrasing an assertion into something easier to pass is the
> failure mode this plan exists to prevent (orchestration spec §6: verifiers
> paraphrase-audit assertion bodies).

## Map

| ID   | Assertion (controller §17.1)                                            | Level                    | Owning WP                                    | Where it will live                                   |
| ---- | ----------------------------------------------------------------------- | ------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| T-01 | Saving an encounter is immediate and durable (survives reload)          | integration              | **WP-03**                                    | `packages/persistence/test/`                         |
| T-02 | Capture does not activate FSRS until explicit promotion                 | unit                     | **WP-06**                                    | `packages/domain/test/`                              |
| T-03 | Replaying the same events produces identical derived state              | replay                   | **WP-02**, extended by WP-03 / WP-10 / WP-11 | `packages/domain/test/` + `test/fixtures/golden-*.json` |
| T-04 | Unknown event versions fail closed                                      | unit                     | **WP-02**                                    | `packages/domain/test/`                              |
| T-05 | A missed reading does not erase known meaning                           | unit                     | **WP-06**                                    | `packages/domain/test/`                              |
| T-06 | Reveal-before-recall grades `Again`                                     | unit                     | **WP-06**                                    | `packages/domain/test/`                              |
| T-07 | Lookup grades neither `Again` nor success                               | unit                     | **WP-06**                                    | `packages/domain/test/`                              |
| T-08 | Passive/contextual exposure never updates FSRS                          | unit                     | **WP-06**                                    | `packages/domain/test/`                              |
| T-09 | AI output cannot mutate canonical fields or memory state                | unit + type-level        | **WP-07**                                    | `packages/ai/test/` + type-level assertions          |
| T-10 | Capture/lookup/review/export work with AI unavailable                   | integration              | **WP-07**                                    | `packages/ai/test/`                                  |
| T-11 | A timed-out AI call neither loses nor blocks capture                    | integration              | **WP-07**                                    | `packages/ai/test/`                                  |
| T-12 | Candidate/generated content is visually and structurally labeled        | E2E                      | **WP-07** (structural/unit half) + **WP-10** (E2E half) | `packages/ai/test/` + `apps/app/e2e/`     |
| T-13 | Session reaches a finite completion state; queue cannot silently grow   | unit + E2E               | **WP-08** (unit half) + **WP-10** (E2E half) | `packages/domain/test/` + `apps/app/e2e/`            |
| T-14 | Exported JSON is complete, versioned, and replays to identical state    | integration              | **WP-03** (skeleton) + **WP-09** (full)      | `packages/export/test/`                              |
| T-15 | Source/license/provenance metadata survives capture and export          | integration              | **WP-04** (provenance walk feeds it) + **WP-09** (full) | `packages/seed/test/` + `packages/export/test/` |
| T-16 | Persistence survives restart/background on every claimed runtime        | integration (per runtime) | **WP-03** (web + ci-substitute) + **WP-11** (native) | `packages/persistence/test/` + device evidence |
| T-17 | The exact closed loop passes one automated E2E flow (web)               | E2E                      | **WP-10**                                    | `apps/app/e2e/`                                      |

**T-18** — the operator puts a second *real* encounter through the loop without
developer intervention — is **WP-12's operator gate, not an automated test**
(controller §17.1). It is recorded in `docs/build-evidence/OPERATOR_TRIAL.md`
with the operator's verdict verbatim. No agent may mark it passed.

## Split-test bookkeeping

Four tests are deliberately split across work packages. Both halves must be green
before the test counts as met; a half-green test is reported as unmet.

| Test | First half                                       | Second half                                          |
| ---- | ------------------------------------------------ | ---------------------------------------------------- |
| T-03 | WP-02: pure in-memory reference replay           | WP-03 adds web + ci-substitute adapters; WP-11 adds true native; WP-10 extends to E2E-produced logs |
| T-12 | WP-07: structural/unit — envelope is labeled     | WP-10: E2E — the label is *visible* in the rendered UI |
| T-13 | WP-08: unit — planner produces a finite plan     | WP-10: E2E — the queue cannot grow during a live session |
| T-16 | WP-03: web + ci-substitute restart simulation    | WP-11: native device restart/background              |

## Runtime-claim rules (P0-CAP-15, controller §7)

These are correctness rules for the *reporting*, not just the code:

- A **ci-substitute** pass (adapter SQL run against a Node SQLite driver because
  CI has no native runtime) is labeled `ci-substitute` in the test name and in
  every report. It **never** counts as native verification.
- **Web** persistence results are never reported as native persistence.
- **T-16 native** is WP-11's claim and only WP-11's. If macOS/Xcode/device access
  is unavailable, WP-11 closes as `EXTERNAL-GATE: documented` and native
  verification is marked **UNVERIFIED** — not simulated, not inferred.
- Performance numbers (controller §13) carry the runtime they were measured on.
  Web measurements are demonstration data only.

## Adversarial matrix (controller §17.2) — WP-10, lanes T1–T4

| Lane | Scope                                                                              |
| ---- | ---------------------------------------------------------------------------------- |
| T1   | property/fuzz: random event interleavings preserve gate invariants; double-tap/concurrent capture produces exactly one thread (idempotency); clock skew does not corrupt scheduling |
| T2   | hostile AI responses: oversized, mislabeled, schema-violating, prompt-injection text — rejected and never rendered unlabeled |
| T3   | offline/timeout/kill-restart storms                                                |
| T4   | accessibility + label audit (candidate labeling, provenance display) + REQ-GATE-03 forbidden-claim grep |

## Check set (controller §17.5) and current script status

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test            # unit + integration + replay, all workspaces
npm run test:e2e        # Playwright web flow incl. axe scan
(cd apps/app && npx expo export --platform web)   # build proof (must run from apps/app)
```

| Script                 | Status at WP-01                     | Real implementation owed by |
| ---------------------- | ----------------------------------- | --------------------------- |
| `lint`                 | **implemented** — eslint incl. §5 boundary rules | —              |
| `format:check`         | **implemented** — prettier          | —                           |
| `typecheck`            | **implemented** — `tsc --noEmit` per workspace   | —              |
| `test`                 | **implemented** — vitest; one trivial test per workspace | assertions per owning WP |
| `test:replay`          | placeholder, exits 0 with notice    | **WP-02**                   |
| `verify:export`        | placeholder, exits 0 with notice    | **WP-03**                   |
| `test:e2e`             | placeholder, exits 0 with notice    | **WP-10**                   |
| `expo export --platform web` | **implemented** — exports 3 static routes | —                  |

The three placeholders print `not yet implemented` and exit 0. They exit 0
because WP-01 is explicitly told not to implement them and a red CI for
un-owed work is a false signal — **not** because anything passed. Each prints a
banner saying so. When a WP takes ownership it replaces the placeholder; leaving
one in place past its owning WP is a closure-predicate failure for that WP.

`@playwright/test@1.62.0` is in the WP-00 verified dependency register but is
deliberately **not installed** at WP-01, since `test:e2e` is a placeholder and
`apps/app/e2e/` is WP-10's surface. WP-10 adds it at that exact pinned version.

## CI

`.github/workflows/ci.yml` runs `lint`, `format:check`, `typecheck`, and `test`
on every PR (Node 22). Controller §18 WP-10 extends CI to the **full** §17.5 set
once the real suites exist; until then CI deliberately does not run the three
placeholder scripts, because a green placeholder in CI is exactly the kind of
false assurance this plan is written to avoid.
