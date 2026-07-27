# Orchestration log (Conductor-owned; orchestration spec §5)

## Wave state
| Wave | Status | Notes |
|---|---|---|
| W0 (WP-00) | CLOSED | PR #4 (draft, human merge pending) |
| W1 (WP-01) | CLOSED — V1 verdict PASS | PR #5; round 1 FAIL (2 P1, 9 P2) -> repair -> round 2 PASS; evidence docs/build-evidence/VERIFY_WP01.md |
| W2 (WP-02 ∥ WP-04) | OPENING | B2 domain kernel, B3 seed data; V2/V3 shadows; branches stack on agent/bunki-phase0-integration |
| W3+ | pending | opens on W2 exit |

## Merge cadence (operator-authorized continuous build)
Integration-branch flow: agent/bunki-phase0-integration accumulates verified WP branches; draft PRs to main per WP for batched human merges (#4 WP-00, #5 WP-01 open).

## Surface locks — W2
| Surface | Owner |
|---|---|
| packages/domain/ | B2 (WP-02) |
| packages/seed/ | B3 (WP-04) |
| docs/build-evidence/ | CON |
| everything else | LOCKED (no writer) |

## Carried P2 batch (from V1 rounds; sweep owner WP-10 unless noted)
1. Boundary lint rule ignores non-literal import specifiers (documented residual)
2. eslint.config.mjs header comment over-claims rule coverage (fix opportunistically)
3. domain-purity lint scoped to .ts only, not .tsx
4. react/react-dom 19.2.3 vs register 19.2.8 (recorded deviation, ADR-001)
5. Eight transitive-peer deps added beyond WP-00 register (recorded; re-verify licenses at WP-10)
6. TEST_PLAN split-test wording ("four" vs actual list)
7. CI omits the web-export build step (WP-10 extends CI to full §17.5)
8. apps/app/.gitignore bare `example` entry
9. Root README rewrite exceeded strict WP-01 surface list (accepted; note for reviewers)
10. Scaffold-path record location wording in predicate 2b
11. Root-level TS (vitest.config.ts) not typechecked by per-workspace tsc

## Coordination requests
(none)
