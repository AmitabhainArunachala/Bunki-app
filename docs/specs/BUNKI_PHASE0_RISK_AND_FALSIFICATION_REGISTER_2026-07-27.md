---
title: "Bunki — Phase-0 Risk and Falsification Register"
date: 2026-07-27
project: bunki
artifact_type: risk_and_falsification_register
version: v1.0
authority:
  v2_spec: docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
  controller: docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md
---

# Phase-0 risk and falsification register

Risks are Phase-0-scoped operational risks; hypotheses H1–H10 (v2 §15) are
the product-level falsification battery and are referenced, not duplicated.
Severity = impact if realized × plausibility, judged qualitatively.

## 1. Execution risks

| ID | Risk | Sev. | Mitigation (controller anchor) | Trigger/kill |
|---|---|---|---|---|
| RK-01 | Scope collapse: Phase 0 quietly absorbs deferred features (Codex §15.1) | High | §2 hard exclusions; WP "not done" lines; Review C repeated at WP-10 | any excluded feature in a PR → revert |
| RK-02 | Evidence-gate bypass (AI/UI writes memory state) | High | §5 boundary rules incl. no-direct-append; T-09; type-level Candidate split | §21.3.5 stop-mutation |
| RK-03 | Silent data loss / replay divergence | High | event sourcing, T-03/T-16, migration rollback | §21.3.4 stop-mutation |
| RK-04 | License contamination in seed/fixtures | High | WP-04 primary-source verification; §4 pending-license rule; share-alike confined to `packages/seed/` | §21.3.3 stop-mutation |
| RK-05 | Web demo results misreported as native capability | Med-High | provisional labels (§7); WP-11 EXTERNAL-GATE honesty; runtime-labeled measurements (§13) | REQ-GATE-03 violation → correct the record |
| RK-06 | Secret leakage into git/logs/fixtures | High | §15 scan + env-only keys; fixtures-only AI content (OD-08) | §21.3.6 stop-mutation + rotate |
| RK-07 | Expo web/monorepo toolchain friction burns the schedule | Med | WP-01 scaffold fallback path; provisional web adapter options (§7) | if Expo Web blocks T-17, record and fall back to react-native-web minimal harness — an ADR, not a scope change |
| RK-08 | `ts-fsrs` pinned version does not implement FSRS-6 semantics as assumed | Med | §14 primary-source check at admission; wrapper isolates the engine | replace engine behind the reducer interface; replay fixtures prove equivalence of derived-state handling |
| RK-09 | Executor lacks macOS/device → native claims tempted | Med | WP-11 documented external-gate closure path | never simulate; P0-CAP-15 |
| RK-10 | Operator unavailability stalls gates | Med | §22 ranking; only OD-09 blocks start; WAIT ≠ BLOCKED discipline | capsule records the precise smallest operator action |
| RK-11 | Fresh-executor misreads scope of authority; edits frozen docs | High | §0.3 prohibition; WP-00 integrity check | §21.3.1 stop |
| RK-12 | Over-collection binge dynamics reproduced in Phase 0 UI (S5 signature) | Low (Phase 0) | promotion rate-limiting seams (REQ-DM-09); single seeded thread scope | Phase-2 concern; monitor |

## 2. Product falsification battery (pointer)

H1–H10 with tests live in v2 §15 (REQ-HYP-01). Phase-0 executes only: H2
via WP-12 (operator gates REQ-GATE-01), H10 partially via WP-11
measurements. All other hypotheses remain open experiments for later phases
and must not be reported as validated by Phase-0 completion.

## 3. Claim-boundary enforcement

REQ-GATE-03 is enforced in Phase 0 by: T-12 (labeling), WP-12 "not done"
(no efficacy claims), §20 of the controller (copy/comment/report ban), and
WP-13 independent review checklist item "search the diff for forbidden
claims" (grep list: "scientifically optimized", "you will understand",
"mastery", "reduced review burden", "N2", "N3", "JLPT level").

## 4. QC record — the three adversarial reviews (handoff §15)

Performed 2026-07-27 by the authoring context against the complete frozen
inputs, before freeze. Findings were fixed before hashing; nothing was
averaged away; no irreducible disagreement survived for arbitration.

### Review A — convergence integrity: PASS with 2 findings, fixed

- Coverage walk: all of A1–A14, C1–C6, E1–E8, the five Claude v1
  corrections, Codex's Step-3 process additions, the 15 required ledger
  rows from the Round-1 response §4, and spine items 1–14 are present in
  v2 (proof: traceability matrix §1).
- Resurrection sweep: no withdrawn position reappears — checked
  "listening ≈N2+ / formal ≈N3+" (withdrawn; REQ-EVID-02 forbids),
  "capture IS card creation" (corrected, DL-05), implicit review-by-use
  FSRS writes (withdrawn, REQ-SCH-06), "nobody has closed the loop"
  (softened, DL-16), computational i+1 percentage promises (bounded,
  REQ-CRE-01), single-brightness global map (forbidden, REQ-UI-07),
  Wiktionary/CHISE/Kanjium as selected sources (vetting queue, REQ-SRC-03),
  PWA-first platform position (superseded by C1, REQ-ARCH-01).
- **Finding A-1 (fixed):** C1's device acceptance test "five ordinary
  captures feel no slower than the current dictionary flow" was not
  carried into v2/controller → added to REQ-ARCH-06 and controller §13 +
  WP-12.
- **Finding A-2 (fixed):** handoff §6A.3's four-way classification
  (non-negotiable / reversible preference / experiment / open) was only
  implicit in the ledger columns → explicit mapping added to v2 §18
  preamble.

### Review B — architectural executability: PASS with 3 findings, fixed

- A fresh agent can identify packages (§5), commands (§17.5, §4, WP-01),
  dependencies + licenses + verification (§14), authority boundaries (§5,
  REQ-ARCH-02/04), tests (§17), and closure predicates (per WP).
- Web/native persistence differences are honest (provisional labels;
  WP-11 gate; runtime-labeled measurements).
- Replay/export reconstruction is enforced by T-03/T-14 plus
  `verify:export`.
- **Finding B-1 (fixed):** UI could bypass the evidence gate by calling
  `EventStorePort.append` directly → boundary rule added to controller §5
  (lint-enforced command-handler path).
- **Finding B-2 (fixed):** controller referenced npm script names that no
  WP explicitly created → WP-01 closure predicate now requires defining
  them, plus scaffold command guidance.
- **Finding B-3 (fixed):** several WPs lacked explicit "deliberately not
  done" lines → added to WP-03/04/05/06/07/08/09/10/12.

### Review C — scope, rights, and product truth: PASS, no findings

- No deferred capability (Firehose, sync, Observatory, voice, art, broad
  curriculum) is absorbed into Phase 0; the session recipe is explicitly a
  collapsed Phase-0 form; the repair branch is the single hard-coded one
  the handoff allows.
- No content path relies on scraping or a "private use" rights theory:
  seed = EDRDG/KanjiVG/Tatoeba subsets with verbatim attribution + the
  operator's own encounter; AI receives fixture content only (OD-08).
- No UI surface labels inference as fact, coverage as comprehension,
  exposure as retrieval, or any signal as global mastery (T-12, REQ-LM-03,
  REQ-GATE-03).

### Residual disagreements for operator arbitration

None. The remaining open items are the operator decisions (OD-01..09),
which are choices, not disagreements between the converged lanes.

## 5. QC record — independent fresh-context red-team pass (post-freeze, pre-merge)

Performed 2026-07-27 by a fresh-context agent that did not author any of
the documents, reading launcher → controller → v2 → handoff with the
handoff §6–15 as acceptance checklist, plus mechanical verification of all
ID citations (47 controller-cited + 105 matrix-cited IDs, all resolving)
and hash cross-references (all consistent).

**Verdict:** areas B (scope leaks) and C (truth/claim violations) clean;
area D clean except two documentation defects; area A yielded 5 P1 + 12 P2
findings — **all 17 fixed in the same pass, before merge**, with the hash
cascade re-frozen. Summary of the P1s and their fixes:

1. Launcher/controller assumed specs on `main` pre-merge → launch
   precondition added to both (stop cleanly if `docs/specs/` absent on
   main).
2. WP-12's real-encounter trial conflicted with the fixtures-only AI
   privacy rule → explicit trial AI-step rule added (operator consent
   extension or labeled fallback/skip).
3. Ownership annotations made WP-07/08 unclosable without collision →
   `src/session/` reassigned to WP-08 in §5/§6; T-12/T-13 E2E halves
   deferred to WP-10 in the closure predicates.
4. Deletion path had no event in the frozen schema → `ThreadTombstoned` +
   `ContentPurged` rows added to §6.1.
5. Native-adapter CI testing was unexecutable/dishonest as written →
   `ci-substitute` Node-SQLite mechanism specified, never countable as
   native verification; T-03's cross-adapter clause staged by WP.

P2 fixes: §18/§15 citation corrections and §18a renumber; §17.3/17.4
numbering note; WP-10 now requires full-set CI; build command runs from
`apps/app`; secret-scan command exit semantics inverted correctly; seed
inventory gains the hand-written integration passage; `userConfirmedEasy?`
added to `ReviewGraded`; matrix correction-4 anchor fixed; integrity-file
self-description corrected; WP defaults extended (cost-of-wrong/stop
conditions/gates); admission-wait added to §21.2 with accepted
confirmation channels in §22.1.
