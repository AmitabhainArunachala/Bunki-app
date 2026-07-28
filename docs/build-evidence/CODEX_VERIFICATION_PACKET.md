---
title: "Bunki — Codex 5.6 Cross-Model Verification Packet (Wave W7)"
date: 2026-07-28
project: bunki
artifact_type: verification_packet
prepared_by: Conductor (Claude Opus 5)
for: Codex 5.6, run by the operator outside this environment
authority: docs/specs/BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md §6
---

# Codex 5.6 verification packet

This is wave W7 of the Campaign-C1 orchestration: an independent, cross-vendor
verification of the merged Phase-0 build. It exists because the build tier and
the primary verification tier are deliberately different vendors — the same
decorrelation logic that produced the converged v2 specification.

**Codex does not fix, merge, or approve anything.** Its output is a report.

## 1. Subject under review

- Repository: `AmitabhainArunachala/Bunki-app`
- Branch: `main`
- Commit at packet time: `cbb7f29` (merge of PR #13)
  — **do not trust this SHA; re-fetch and record the actual head you reviewed.**
- Design authority: `docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md`
- Build contract: `docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md`
- Acceptance contract: `docs/specs/BUNKI_PHASE0_DEFINITION_OF_DONE_2026-07-27.md`

## 2. Environment bootstrap

```bash
git clone <repo> bunki && cd bunki && git fetch origin main && git checkout main
git rev-parse HEAD            # record this; it is the SHA your report is about
node --version                # expect >= 22
npm ci
```

Check set (controller §17.5) — run each separately, not behind `&&`, so one
failure cannot mask the rest:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run test:replay
npm run verify:export
npm run test:e2e
(cd apps/app && npx expo export --platform web)
```

Expected at `cbb7f29` (verify, do not assume): lint/format/typecheck clean;
1417 tests across 86 files; 47 replay; 14 export-verification; 38 E2E across
9 specs; web export produces 13 static routes.

## 3. Verification checklist — every item required

Return `CONFIRMED` / `REFUTED` / `NOT-VERIFIABLE(reason)` per item.

### 3.1 Integrity
1. Re-verify every hash in `docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`.
2. Confirm no file under `docs/specs/`, `docs/convergence/`, or
   `docs/handoffs/` was modified after its freeze (git log per file).

### 3.2 Test substance, not test count
3. For each of T-01..T-17 (mapped in `docs/build-evidence/TEST_PLAN.md`):
   does the test exist, does it pass, and **does its body actually assert
   what the controller says it asserts?** Paraphrase-audit the assertion
   bodies; a renamed trivial test is a REFUTED.
4. Specifically re-derive these five, which are the epistemic core:
   T-02 (no FSRS before promotion), T-05 (reading miss ≠ meaning erase),
   T-06 (reveal → `Again`), T-07 (lookup grades nothing),
   T-08 (exposure never reaches FSRS).

### 3.3 Boundary audit — attempt real bypasses
In a scratch branch you never push, try to:
5. construct an accepted `EvidenceEvent` outside `packages/domain/src/evidence`;
6. drive AI output from `packages/ai` into canonical state or the evidence gate;
7. push an `ExposureLogged` through to the FSRS reducer;
8. inject a foreign, JSON-shaped event through the new persistence seam
   (`persistMinted` / `MintedEventBatch` — added in the export-completeness
   wave; the build claims a five-guard falsification matrix protects it).
   Each must fail at compile time or runtime. Record each attempt verbatim.

### 3.4 Capability coverage
9. Walk `P0-CAP-01..15` (v2 §12.1) → implemented artifact → test evidence.
   **Flag any capability satisfied only by documentation.**

### 3.5 Data, licensing, claims
10. Compare `packages/seed/LICENSES.md` against the actual seed contents.
    Note: lexical entries are currently project-authored and disclosed as such
    (the egress policy blocked EDRDG/Tatoeba at build time). Confirm the
    disclosure renders in the UI and that no unlicensed third-party content
    ships.
11. Claim audit: grep the shipped bundle, UI copy, README and code comments
    for the forbidden-claim list (definition of done §2 / v2 REQ-GATE-03):
    "scientifically optimized", "you will understand", mastery/comprehension
    percentages, "reduced review burden", JLPT-level claims.

### 3.6 Replay and export
12. Export from a real session in the running app, replay it through
    `@bunki/domain`, and assert identical derived state. Confirm the export
    contains the promotion, graded review, canvas observation and session
    bounds — not just capture events.

### 3.7 Runtime honesty
13. Confirm no test, report or UI string claims native verification. Native
    (`T-16` native, §13 iPhone latency budgets) must be UNVERIFIED
    everywhere. The SQLite `ci-substitute` mechanism must be labelled as
    such in test names and reports.

### 3.8 The twelve-item list
14. Run definition-of-done §2 item by item against the build and return a
    verdict for each. The build's own current position is: **10 CLEAR,
    1 VIOLATED (item 11 — this very pass not yet run), 1 NOT-VERIFIABLE
    (item 10 — the operator's real second encounter).** Contradict it freely
    if you find otherwise; that is the point of an independent pass.

## 4. Report format

File as `docs/build-evidence/CODEX_VERIFICATION_REPORT.md` (a draft PR or
handed to the operator to commit). Must contain:

- the exact SHA reviewed and the toolchain versions used;
- verbatim results of every §17.5 command;
- the per-item verdict table from §3, with evidence for each;
- findings as P0 (predicate not met / boundary violated) / P1 (wrong
  behaviour or claim) / P2 (friction), each with a reproduction command;
- **an explicit statement of what you did NOT check**, and why.

Findings at P0/P1 reopen the owning work package; they do not block filing.

## 5. Prompt to give Codex

Paste everything between the lines.

---

You are performing an independent, cross-model verification of a codebase you
did not write. You are not its author, not its advocate, and your job is to
find what is wrong with it — including places where its own documentation
claims more than the code delivers.

Repository: `AmitabhainArunachala/Bunki-app`, branch `main`.

Read these first, from the repo, not from any summary:
1. `docs/build-evidence/CODEX_VERIFICATION_PACKET.md` — your checklist. Follow
   it item by item.
2. `docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md` —
   the build contract the code is supposed to satisfy.
3. `docs/specs/BUNKI_PHASE0_DEFINITION_OF_DONE_2026-07-27.md` — §2 is a
   twelve-item list of ways a build like this fails while looking finished.
   Treat it as an accusation to test, not a checklist to bless.

Context you should have: this build was produced by a fleet of Claude agents,
each builder shadowed by a separate verifier, over five waves. Those verifiers
already caught real defects — fabricated evidence values, a session that
recorded every completion as an abandonment, screens unreachable in the
shipped bundle, an inspector mislabelling real evidence as demonstration data.
That history is in `docs/build-evidence/`. **The fact that a same-vendor
verifier passed something is not evidence that it is correct** — you are here
because independent eyes catch what correlated ones miss.

Rules:
- Do not fix, merge, or approve anything. Your deliverable is a report.
- Verify by execution and observation, never by reading a claim. If the
  documentation says a guard exists, try to get past the guard.
- Where you cannot verify something (no device, no API key, no network),
  say `NOT-VERIFIABLE` with the reason. Never guess, and never soften a
  finding because the build seems thorough.
- Be specific: file, line, reproduction command, expected vs observed.

Produce `docs/build-evidence/CODEX_VERIFICATION_REPORT.md` in the format
§4 of the packet defines, and state plainly at the top whether, in your
independent judgement, this build has reached "engineering-done (web)" as the
definition of done describes it.

---
