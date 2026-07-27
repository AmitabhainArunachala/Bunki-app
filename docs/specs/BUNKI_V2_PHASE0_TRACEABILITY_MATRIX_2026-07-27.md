---
title: "Bunki — v2 ↔ Phase-0 Traceability Matrix"
date: 2026-07-27
project: bunki
artifact_type: traceability_matrix
version: v1.0
authority:
  v2_spec: docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
  controller: docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md
---

# Traceability matrix

Four mappings: (1) resolved convergence items → v2 anchors (completeness
proof for Review A); (2) Phase-0 capabilities → requirements → work packages
→ tests; (3) work packages → requirement authority; (4) handoff mandatory
assertions → controller tests. Hashes for all cited files:
`BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`.

## 1. Convergence items → v2 anchors

Every Round-1 item and Codex disposition lands in v2. "Disposition" is
Codex's final Round-1-response verdict.

| Item | Disposition | v2 anchors |
|---|---|---|
| A1 RetrievalContract | concede | REQ-DM-05, REQ-SPINE-03, DL-03 |
| A2 Evidence tiers A–D; lookup = friction | concede | REQ-DM-06, REQ-DM-07, DL-04 |
| A3 Capture ≠ promise; Keep/Learn/Master | concede | REQ-DM-09, REQ-CORE-02, DL-05 |
| A4 Finite session orchestrator | concede | REQ-SCH-04, DL-12 |
| A5 Grading semantics | concede | REQ-DM-07, DL-08 |
| A6 Event sourcing discipline | concede | REQ-DM-04, DL-09 |
| A7 Field-level ProvenanceRecord | concede | REQ-SRC-01, DL-10 |
| A8 Migration quarantine + report | concede | REQ-MIG-01, DL-11 |
| A9 Overnight slice inside Phase 0 | concede | REQ-PH-01, DL-40 |
| A10 Honest competitive framing | concede | REQ-CORE-04, DL-16 |
| A11 Variation after foothold | concede | REQ-JRN-04(2), DL-14 |
| A12 Sparse instantiation | concede | REQ-LM-01, DL-15 |
| A13 Desired-retention posture | concede | REQ-SCH-02, DL-13 |
| A14 Correction-style menu open | concede | REQ-AI-05, OD-07 |
| C1 Platform sequencing | synthesis | REQ-ARCH-01, DL-17 |
| C2 Firehose → Source Router | synthesis | REQ-SRC-04, DL-18 |
| C3 Review-by-use boundary | synthesis | REQ-SCH-06, DL-19 |
| C4 Neighborhood default + Observatory | synthesis | REQ-UI-07, DL-20 |
| C5 Etymology/pitch vetting queue | synthesis | REQ-SRC-03, DL-21 |
| C6 TS domain / Python sidecar | synthesis | REQ-ARCH-02/03/04, DL-22 |
| E1 ContentReadinessEstimate | synthesis | REQ-CRE-01, DL-23, H3 |
| E2 Personal utility | synthesis | REQ-JRN-06, DL-24, H8 |
| E3 Journey compiler | synthesis | REQ-JRN-01/02/03, DL-25, H5 |
| E4 Belief-ledger UX | concede | REQ-LM-06, DL-26 |
| E5 Contrast gate | synthesis | REQ-JRN-04/05, DL-27, H6 |
| E6 Merged U/R/S evidence + narrow learner statement | synthesis | §2, REQ-EVID-01/02, DL-28 |
| E7 AI routing tiers | synthesis | REQ-AI-02, DL-29 |
| E8 Working name | concede | DL-30, OD-01 |
| Claude correction 1 (capture ≠ card creation) | accepted | REQ-DM-09, DL-05, DL-38 |
| Claude correction 2 (review-by-use withdrawn) | accepted | REQ-SCH-06, DL-19, DL-38 |
| Claude correction 3 (closed-loop = market hypothesis) | accepted | DL-16, DL-38 |
| Claude correction 4 (renzo export claim corrected) | accepted | DL-16 evidence note, DL-38 |
| Claude correction 5 (FSRS → FSRS-6 pinned/replayable) | accepted | REQ-SCH-01, DL-38 |
| Codex Step-3 additions (freeze integrity, conflict classes, reversibility+test, constraint order) | accepted in Round 1 §0 | §18 ledger format; §20 freeze statement |
| Withdrawn learner-level claims (≈N2+/≈N3+) | withdrawn | REQ-EVID-02 (must not resurrect) |
| Converged spine 1–14 (handoff §3) | convergent | REQ-SPINE-01..14 (1:1, same order) |

## 2. Phase-0 capabilities → requirements → work packages → tests

| Capability | v2 requirements | WPs | Tests |
|---|---|---|---|
| P0-CAP-01 Expo Web demo, native-ready | REQ-ARCH-01 | WP-01, WP-05, WP-10 | T-17, build proof |
| P0-CAP-02 Pure TS domain, versioned events, replay | REQ-ARCH-02, REQ-DM-04 | WP-02 | T-03, T-04 |
| P0-CAP-03 Port/adapter persistence; native authority; provisional web | REQ-ARCH-05 | WP-03 (native exec: WP-11) | T-01, T-16 |
| P0-CAP-04 Licensed seed dataset | REQ-SRC-02, DL-33 | WP-04 | T-15 |
| P0-CAP-05 Immediate capture + promotion | REQ-UI-01, REQ-DM-09 | WP-05, WP-06 | T-01, T-02 |
| P0-CAP-06 Word + kanji pages | REQ-UI-02, REQ-UI-03 | WP-05 | E2E coverage in T-17 |
| P0-CAP-07 Contract + pinned FSRS-6 + grading | REQ-DM-05/07, REQ-SCH-01 | WP-06 | T-02, T-05, T-06, T-07, T-08 |
| P0-CAP-08 Meaning ≠ reading evidence | REQ-DM-08 | WP-06 | T-05 |
| P0-CAP-09 Integration canvas | REQ-UI-05, REQ-SCH-06 | WP-08 | T-08, T-13, T-17 |
| P0-CAP-10 Bounded AI exchange, labeled | REQ-AI-02/03, REQ-ARCH-04 | WP-07 | T-09, T-10, T-11, T-12 |
| P0-CAP-11 Finite session | REQ-SCH-04 | WP-08 | T-13 |
| P0-CAP-12 Evidence inspector + export | REQ-UI-06, REQ-ARCH-08 | WP-09 | T-14, T-15 |
| P0-CAP-13 Offline/non-AI fallback | REQ-ARCH-06 | WP-03, WP-07 | T-10, T-11 |
| P0-CAP-14 Automated test suite | controller §17 | WP-10 (plan: WP-01) | T-01..T-17 |
| P0-CAP-15 Native checkpoint honesty | REQ-ARCH-01, REQ-GATE-02 | WP-11 | T-16 (native) + §13 measurements, or EXTERNAL-GATE doc |

Coverage check: each of P0-CAP-01..15 has ≥1 WP and ≥1 test or explicit
gate; no WP exists without a capability/requirement authority (see §3).

## 3. Work packages → requirement authority

| WP | Primary authority | Secondary |
|---|---|---|
| WP-00 | controller §0/§4; DL-39 | v2 §20 |
| WP-01 | REQ-ARCH-02 (boundaries), P0-CAP-01 | controller §5 |
| WP-02 | P0-CAP-02, REQ-DM-01..04 | REQ-SPINE-02 |
| WP-03 | P0-CAP-03/12/13, REQ-ARCH-05/08 | REQ-DM-04.3 |
| WP-04 | P0-CAP-04, REQ-SRC-01/02, DL-33 | REQ-SPINE-12 |
| WP-05 | P0-CAP-01/05/06, REQ-UI-01/02/03/08/09 | REQ-ARCH-06 |
| WP-06 | P0-CAP-07/08, REQ-DM-05..09, REQ-SCH-01/02/03 | REQ-SPINE-05/06 |
| WP-07 | P0-CAP-10/13, REQ-AI-02/03, REQ-ARCH-04 | REQ-SCH-03 |
| WP-08 | P0-CAP-09/11, REQ-SCH-04/06, REQ-UI-05, REQ-JRN-02 (Phase-0 scope) | H4 boundary |
| WP-09 | P0-CAP-12, REQ-UI-06, REQ-LM-06, REQ-ARCH-07/08 | REQ-DM-04.2 |
| WP-10 | P0-CAP-14, REQ-GATE-01 (automatable parts) | controller §17.2 |
| WP-11 | P0-CAP-15, REQ-ARCH-01 native gate, H10 | REQ-GATE-02 |
| WP-12 | REQ-GATE-01.7 (T-18), REQ-GATE-02 operator stratum | H2 |
| WP-13 | v2 §20 freeze/receipt discipline; REQ-GATE-02 | controller §21.1 |

## 4. Handoff mandatory assertions → controller tests

Handoff §11 list, in order → T-01 (immediate/durable save), T-02 (no FSRS
before promotion), T-03 (replay determinism), T-04 (unknown versions fail
closed), T-05 (reading miss ≠ meaning erase), T-06 (reveal → Again), T-07
(lookup ≠ grade), T-08 (exposure ≠ FSRS), T-09 (AI cannot mutate), T-10
(non-AI operation), T-11 (AI timeout harmless), T-12 (candidate labeling),
T-13 (finite session), T-14 (export replays), T-15 (provenance survives),
T-16 (restart durability per claimed runtime), T-17 (E2E closed loop),
T-18/WP-12 (operator's second real encounter). Latency-target distinctions
(local ack / warm lookup / AI enrichment / end-to-end capture) → controller
§13, labeled provisional (H10).
