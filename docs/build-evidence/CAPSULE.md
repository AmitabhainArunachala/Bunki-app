# Bunki build evidence capsule (resumable; controller §23)

## Current state
- Wave: W0 (WP-00 admission) — CLOSED this commit; W1 next
- origin/main: 852f5be18a40e66dbb89ad9a877649c349ceee0a (specs landed via PR #3; integrity self-check of all 14 files: OK, run 2026-07-27 against main's exact tree)
- Active branch: agent/bunki-phase0-closed-loop-wp00
- Design authority verified: v2 spec sha256 5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55; controller de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47 (launcher expected-hash match)

## Operator authorizations (verbatim, 2026-07-27, session chat)
- OD-09: "Yes decide later and for now launch the full build" → build target AmitabhainArunachala/Bunki-app CONFIRMED; license: DECIDE LATER (rule: no dependency/data may constrain the future choice beyond v2-accepted share-alike seed data confined to packages/seed/)
- Staffing: "And staff at 20!! Design, reviewers, verifies, code detail all of it" → FULL-20 configuration (orchestration spec §1)
- Merge cadence: operator ordered continuous full build; Conductor adopts the orchestration spec §3 integration-branch flow (INT maintains agent/bunki-phase0-integration; draft PRs to main at wave boundaries for human merge). Operator may veto and switch to per-wave merges at any time.
- Deviation recorded: Conductor duties are executed by the operator's own session agent (Fable 5) rather than a separate Opus instance — implied by the operator issuing the launch order directly to this session. Builders/verifiers/testers are Opus per binding.

## WP-00 closure predicate status (controller §18)
- [x] v2 + integrity hashes verified (all 14 files OK on main tree)
- [x] Live origin/main recorded: 852f5be, tree = README + docs/{convergence,handoffs,specs}
- [x] Toolchain: node v22.22.2, npm 10.9.7, git 2.43.0 (linux)
- [x] Dependency register verified from npm registry 2026-07-27: expo 57.0.8 MIT; expo-router 57.0.8 MIT; react 19.2.8 MIT; react-native 0.86.0 MIT; react-native-web 0.21.2 MIT; expo-sqlite 57.0.1 MIT; ts-fsrs 5.4.1 MIT; zod 4.4.3 MIT; typescript 7.0.2 Apache-2.0; vitest 4.1.10 MIT; @playwright/test 1.62.0 Apache-2.0; eslint 10.8.0 MIT; prettier 3.9.6 MIT. All compatible with license-decide-later rule.
- [x] Operator admission items surfaced and ANSWERED (see authorizations above)
- [x] Capsule exists (this file)
- Carry-over check assigned to WP-06 builder: confirm ts-fsrs@5.4.1 implements FSRS-6 semantics from its primary-source docs/changelog before pinning (controller §14).

## Next safe command
- Open W1: builder B1 executes WP-01 (scaffold, ADR-001/002, TEST_PLAN, CI) on agent/bunki-phase0-closed-loop-wp01; verifier V1 re-verifies from clean checkout.

## Open PRs / blockers
- None. WP-11 (native device) and W7 (Codex 5.6 pass) remain external gates; W8 operator trial pending build.
