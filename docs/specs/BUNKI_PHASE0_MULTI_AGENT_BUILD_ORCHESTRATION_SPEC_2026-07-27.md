---
title: "Bunki — Phase-0 Multi-Agent Build Orchestration Spec (Opus-5 fleet / Codex-5.6 verify / Fable-5 final audit)"
date: 2026-07-27
project: bunki
artifact_type: multi_agent_orchestration_spec
version: v1.0
status: frozen_at_publication
operator: John Shrader
governing_authorities:
  controller:
    file: docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md
    sha256: 6bdac9103e47c5abcab4a633c0be2e446e686034f305901114a649cd3c430deb
  v2_spec:
    file: docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
    sha256: 5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55
supremacy_rule: "This document assigns WHO does WHAT and WHEN. The controller defines WHAT correct is. On any conflict, the controller wins and the conflict is reported — never silently resolved."
model_bindings:
  builder_tier: "Claude Opus 5 (claude-opus-5) — operator-designated"
  cross_verifier_tier: "Codex 5.6 — operator-run, different vendor by design (decorrelated errors)"
  final_auditor_tier: "Claude Fable 5 (claude-fable-5) — operator-designated"
---

# Bunki Phase-0 multi-agent build orchestration

## 0. Design principles

1. **The controller is law.** Every agent in every role verifies the
   controller hash before acting (launcher step 1) and obeys its operating
   contract: draft PRs only, never push main, never merge or self-approve,
   stop conditions §21.3 absolute. This spec adds coordination; it removes
   no constraint.
2. **Parallelism follows the DAG, not the headcount.** The controller's
   WP dependency graph and per-WP ownership boundaries (controller §5, §18)
   define the *maximum* safe concurrency. 10–20 agents are consumed across
   the build's lifetime in waves — never 20 simultaneous writers. Idle
   capacity becomes verification, never speculative building.
3. **Every writer is shadowed by a non-writer.** Each builder has an
   assigned verifier agent whose only output is a findings report against
   the WP's closure predicate. Verifiers never edit code; builders never
   grade their own work.
4. **Model tier grants no authority** (process analog of REQ-SCH-03):
   an Opus builder's claim, a Codex verdict, and a Fable audit all count
   only as far as their attached evidence (command outputs, test logs,
   exact SHAs). Verdicts are checklist-driven, never vibes.
5. **Cross-vendor decorrelation on purpose.** The build tier and the
   primary verification tier are different vendors, mirroring the
   convergence method that produced v2: independent eyes are the signal.
6. **Single-writer surfaces.** No two agents ever hold write authority
   over the same package/directory in the same wave. The domain package
   (`packages/domain`) has exactly one writer at any moment in the entire
   plan.
7. **Everything resumable.** Every agent writes capsule entries
   (controller §23) so any dead agent is replaceable by a fresh one with
   zero narrative loss.

## 1. Roles

| Role | Count | Model tier | Writes code? | Output |
|---|---|---|---|---|
| **Conductor** (CON) | 1 | Opus 5 | no (only `docs/build-evidence/`) | wave scheduling, capsule ownership, operator reports |
| **Builder** (B1–B8) | 8 | Opus 5 | yes — owned surface only | WP branch + draft PR + predicate-status table |
| **WP Verifier** (V1–V6) | up to 6 | Opus 5 | no | per-WP findings report (P0/P1/P2) |
| **Adversarial testers** (T1–T4) | up to 4 | Opus 5 | tests only (`e2e/`, `test/`) | controller §17.2 matrix implementation + reports |
| **Integrator** (INT) | 1 | Opus 5 | rebases/mechanical conflict fixes only | green integration branch for WP-10 |
| **Cross-model verification** (CDX) | 1 pass | Codex 5.6 | no | `CODEX_VERIFICATION_REPORT` (§6) |
| **Final auditor** (FAB) | 1 pass | Fable 5 | polish-only PR (§7) | `FINAL_AUDIT_REPORT` + closure receipt (WP-13) |

Staffing configurations:

- **Minimum (10 agents):** CON, B1–B8 sequentialized into 5 builder slots,
  V-roles merged into 2 rotating verifiers, INT doubles as T-lane, +CDX +FAB
  passes.
- **Full (20 agents):** 1 CON + 8 B + 6 V + 4 T + 1 INT = 20 Opus
  instances, plus the CDX and FAB passes (not Opus, counted separately).

## 2. Ground rules for every agent (paste into every agent prompt)

1. First action: verify controller + v2 hashes (launcher step 1); on
   mismatch STOP and report.
2. Read the controller completely before your first edit. Your role card
   (§4) narrows your scope; it never widens the controller's.
3. Branch naming: `agent/bunki-phase0-wpNN-<role>` (e.g.
   `agent/bunki-phase0-wp03-b3`). One WP per branch. Draft PRs only.
4. Write only inside your owned surfaces (your role card lists them).
   Needing to touch another surface = a coordination request to CON in
   your report, never a direct edit.
5. Every commit message: `WPNN(<role>): <what predicate this advances>`.
6. Update `docs/build-evidence/CAPSULE.md` (append-only section per agent)
   at every material checkpoint: exact SHA, predicate status, next safe
   command, blockers.
7. Report format (end of every work session): predicate table
   (met/unmet/evidence-path), commands run with verbatim pass/fail counts,
   surfaces touched, coordination requests, smallest next action.
8. Forbidden always: merging, approving, editing frozen docs
   (`docs/specs/`, `docs/convergence/`, `docs/handoffs/`), touching
   another agent's active surface, secrets in any artifact, claims banned
   by REQ-GATE-03.

## 3. Wave plan

Waves map 1:1 onto the controller DAG (§18). A wave opens when its listed
entry criteria hold on **merged main** (or, where the operator prefers
batched merges, on the integration branch INT maintains — recorded in the
capsule either way).

| Wave | WPs | Writers active | Verifiers active | Entry criteria | Exit criteria |
|---|---|---|---|---|---|
| W0 | WP-00 | CON | — | operator OD-09 confirmation | admission facts + dependency register in capsule |
| W1 | WP-01 | B1 (scaffold) | V1 | W0 exit | CI green on scaffold PR; scripts defined |
| W2 | WP-02 ∥ WP-04 | B2 (domain kernel), B3 (seed) | V2 (domain), V3 (seed/license) | W1 merged | T-03/T-04 green; seed provenance walk green |
| W3 | WP-03 ∥ WP-06 ∥ WP-05 | B4 (persistence+export), B5 (contracts/FSRS — sole domain writer), B6 (UI shell/capture/pages) | V4 (persistence), V2 (contracts), V5 (UI/a11y) | W2 merged | T-01/T-16-web; T-02/T-05/T-06/T-07/T-08; capture flow demo |
| W4 | WP-07 ∥ WP-08 ∥ WP-09 | B7 (AI adapter+candidate UI), B8 (session/canvas + domain/session as sole domain writer this wave), B6 continues (inspector screens — file-level split §4.B6/B8) | V6 (AI boundary), V5 (screens) | W3 merged | T-09..T-13; screens have all four states |
| W5 | WP-10 | INT + T1–T4 | V1–V6 rotate onto the matrix | W4 merged | T-17 E2E green in CI; §17.2 matrix green; web perf recorded |
| W6 | WP-11 | B4 (native) or EXTERNAL-GATE doc | V4 | W5 merged | device evidence or honest gate doc |
| W7 | Codex 5.6 verification | — (CDX read-only) | — | W5 exit (runs ∥ W6) | `CODEX_VERIFICATION_REPORT` filed; P0/P1 = back to owning builder wave |
| W8 | WP-12 | — (operator) | CON prepares trial script | W5 (+W6 if available) | operator verdict recorded verbatim |
| W9 | WP-13 + Fable 5 final | FAB (polish-only PR) | — | W7 findings resolved + W8 recorded | `FINAL_AUDIT_REPORT`, closure receipt, DONE per controller §21.1 |

Rules:

- A wave never opens early because agents are idle; idle agents join
  verification or the T-lane.
- P0/P1 findings from any verifier reopen the owning WP with the same
  builder (context continuity); a builder unavailable = fresh builder
  resumes from capsule.
- The operator merges between waves (or authorizes INT's batched
  integration branch flow — an explicit, recorded choice).

## 4. Role cards (prompt-ready)

Each card = paste §2 ground rules + the launcher (hash-verify step) + this
card. Placeholders in ⟨⟩.

### CON — Conductor
Owned surfaces: `docs/build-evidence/` only. Duties: run WP-00 admission
verbatim (controller §4, §19 WP-00); maintain wave state + agent roster in
`docs/build-evidence/ORCHESTRATION_LOG.md`; assemble per-wave entry/exit
evidence; compose operator reports at every wave boundary (controller §24
format); prepare the WP-12 trial packet; never write app code. Closure:
final capsule handed to FAB with every wave's evidence indexed.

### B⟨n⟩ — Builder for WP-⟨NN⟩
Owned surfaces: exactly the WP's surfaces from controller §19 (repeat them
in the prompt). Duties: implement to the WP closure predicate; run §17.5
checks before every report; open one draft PR; answer verifier findings
with fixes or written rebuttals (evidence required). Closure: predicate
table fully "met" + verifier report shows no open P0/P1.
File-level split where two builders share `apps/app` (W4): B6 owns
`src/screens/inspector*` + `src/screens/evidence*`; B8 owns
`src/screens/session*` + `src/screens/canvas*`; shared files
(`app/_layout` etc.) are B6's; B8 requests changes via CON.

### V⟨n⟩ — Verifier for WP-⟨NN⟩
Read-only on code. Duties: independently re-run the WP's tests from a
clean checkout of the builder's branch; walk the closure predicate line by
line; hunt the controller's negative assertions relevant to the WP (map:
traceability matrix §2); grep for REQ-GATE-03 forbidden claims; verify no
surface outside the WP was touched (`git diff --stat` against base).
Output: findings report `docs/build-evidence/VERIFY_WP⟨NN⟩.md` — P0
(predicate not actually met / boundary violated), P1 (wrong behavior or
claim), P2 (friction). "Green" requires commands re-run by the verifier,
not trust in the builder's logs.

### T1–T4 — Adversarial testers (W5)
Owned surfaces: `apps/app/e2e/`, `packages/*/test/` additive only.
Lanes: T1 property/fuzz on event interleavings + idempotency; T2 hostile
AI responses (oversized, mislabeled, schema-violating, injection text);
T3 offline/timeout/kill-restart storms; T4 accessibility + label audit
(candidate labeling, provenance display) + forbidden-claim grep. Each
lane's closure: its §17.2 slice implemented, green, and CI-wired.

### INT — Integrator
Duties: keep an integration branch current across merged WP PRs; only
mechanical conflict resolution (imports, lockfiles, formatting) — any
semantic conflict goes back to the owning builder via CON; run the full
§17.5 set on every integration; deliver the WP-10 branch. Never authors
features.

## 5. Communication and artifact protocol

- **Single source of coordination truth:**
  `docs/build-evidence/ORCHESTRATION_LOG.md` (CON-owned): wave state,
  roster, surface locks, open coordination requests, merge queue.
- **Surface locks:** before a wave opens, CON writes the lock table
  (surface → agent). An agent seeing its target surface unlocked-for-
  someone-else must stop and file a coordination request.
- **Findings flow:** verifier report → CON triages (P0/P1 reopen WP;
  P2 batched) → builder fixes → verifier re-verifies → CON marks wave
  exit item.
- **Operator touchpoints:** wave boundaries + any §21.3 stop + the two
  external passes (§6, §7). Everything else is autonomous.

## 6. Codex 5.6 verification pass (W7) — cross-model, operator-run

Because Codex runs outside this environment, CON prepares
`docs/build-evidence/CODEX_VERIFICATION_PACKET.md` containing exactly:

1. the frozen hashes (controller, v2, integrity file) and the exact merged
   SHA under review;
2. environment bootstrap: `npm ci` + the §17.5 command set, verbatim;
3. the verification checklist (below);
4. report format and filing path.

**Checklist (all required):**

- re-verify every hash in `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`;
- re-run the full §17.5 suite from clean checkout; record verbatim counts;
- independently execute the T-01..T-17 map — for each test: does it exist,
  does it pass, does it actually assert what the controller says it
  asserts (paraphrase-audit the assertion bodies);
- traceability walk: every P0-CAP-01..15 → implemented artifact → test
  evidence; flag any capability satisfied only by documentation;
- boundary audit: attempt (in a scratch branch, never pushed) three
  written bypasses — AI output into canonical state, UI direct
  `EventStorePort.append`, exposure event reaching FSRS — confirm
  compile-time/runtime rejection;
- license audit: `packages/seed/LICENSES.md` vs actual seed contents;
- claim audit: REQ-GATE-03 grep list over app strings, comments, README,
  PR bodies;
- replay audit: export → replay → state equality on two runtimes;
- verdict per item: `CONFIRMED / REFUTED / NOT-VERIFIABLE(reason)`.

**Output:** `docs/build-evidence/CODEX_VERIFICATION_REPORT.md` — findings
P0/P1/P2 with repro commands, plus the per-item verdict table, plus an
explicit statement of what was NOT checked. Codex files it via a draft PR
(or hands it to the operator to commit). Codex does not fix, merge, or
approve. P0/P1 findings reopen the owning WPs (wave rule §3).

## 7. Fable 5 final audit and polish (W9)

A fresh Fable 5 session receives: launcher, controller, this spec, the
capsule, all verifier reports, the Codex report, and the operator's WP-12
verdict. It performs WP-13 plus polish:

1. re-run §17.5 on freshly fetched merged main (trust nothing);
2. resolve-or-confirm every open Codex/verifier finding disposition;
3. audit the audit: sample ≥5 CONFIRMED verdicts and re-derive them;
4. polish PR — strictly non-semantic: naming, comments-that-state-
   constraints, README accuracy, label wording, dead-flag removal; any
   change that could alter behavior is out of scope and becomes a filed
   finding instead;
5. re-run the full suite after polish (a polish PR that changes any test
   outcome is rejected by definition);
6. write `docs/build-evidence/FINAL_AUDIT_REPORT.md` and the WP-13
   closure receipt with exact SHAs;
7. declare **engineering completion only** (REQ-GATE-02) — on-device,
   operator, scientific, and market strata stay explicitly open.

## 8. Failure and recovery

- **Agent death/timeout:** fresh same-role agent resumes from capsule +
  role card; no restart-from-zero.
- **Two-agent collision (both touched a surface):** CON freezes the
  surface, later-writer rebases away its out-of-scope hunks, verifier
  confirms, lock table corrected.
- **Persistent red on a predicate (>2 fix rounds):** escalate to operator
  with the precise failing predicate and options — never weaken the test
  (controller §19a).
- **Stop-mutation trigger by any agent:** propagates fleet-wide — CON
  broadcasts halt in the orchestration log; only the operator restarts.
- **Codex pass unavailable:** W9 may not begin on schedule; the operator
  may explicitly waive W7 in writing (recorded in the capsule) — the FAB
  pass then absorbs the §6 checklist, and the waiver is stated in the
  closure receipt (single-vendor verification is a weaker guarantee and
  must be labeled as such).

## 9. Cost and cadence governance

- Builders report at most every ⟨2h⟩ of work or at predicate closure,
  whichever is sooner; CON aggregates — the operator gets one digest per
  wave, not twenty streams.
- Hard cap per wave: if a wave exceeds ⟨operator-set⟩ token/cost budget
  without exit criteria movement, CON pauses the wave and reports —
  matching the controller's rule that time/token expiry is neither
  completion nor blocker, but is always report-worthy.
- The AI-provider budget for the app's own WP-07 live calls is OD-08's
  cap and is separate from agent-fleet budgets.

## 10. Launch checklist (operator)

1. Merge PR #2 (specs) — human merge.
2. Answer OD-09 in one sentence (build-target confirmation + license or
   "decide later").
3. Choose staffing config (§1: minimum-10 or full-20) and per-wave budget.
4. Start the Conductor with: launcher + this spec. Everything else
   cascades from W0.
5. When W7 arrives: run Codex 5.6 with the packet CON prepared.
6. When W8 arrives: run the trial, give the verdict.
7. Merge the final PRs when W9's receipt satisfies you.

## 11. What this spec deliberately does not do

It does not modify the controller, v2, or any frozen artifact; does not
grant any agent merge/approve authority; does not promise 20-way write
parallelism the DAG cannot support; does not let verification tiers edit
builder code; does not reclassify any Phase-0 exclusion; and does not
claim the fleet makes the product hypothesis (H1/H2) any truer — it only
makes the engineering completion faster and better-checked.
