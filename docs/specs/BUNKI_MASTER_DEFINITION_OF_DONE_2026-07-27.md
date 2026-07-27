---
title: "Bunki — Master Definition of Done (operator-authored)"
date: 2026-07-27
project: bunki
artifact_type: master_definition_of_done
version: v1.0
status: frozen_at_publication
provenance: "Definition: operator (verbatim intent, 2026-07-27). Decomposition and campaign route: agent, from the frozen v2 phasing."
relationship_to_phase0_dod: "Supersedes the LADDER TOP of BUNKI_PHASE0_DEFINITION_OF_DONE_2026-07-27.md: that document's rung-3 'Phase-0 COMPLETE' is demoted to Checkpoint C1 here. Its comes-up-short list, acceptance script, and honesty rules remain fully in force at every checkpoint."
authorities:
  v2_spec: docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
  phase0_controller: docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md
  orchestration: docs/specs/BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md
operator: John Shrader
---

# Master definition of done

## 0. The operator's definition (verbatim intent — this is DONE)

> **"One full clean system, polished and running, with everything we
> mentioned functioning — clean, integrated, recursively explorable, and
> ready to begin deep engagement with."**

Operator-confirmed scope of "everything we mentioned" (2026-07-27):
the full core system (licensed dictionary + kanji depth, capture/SRS,
finite sessions, AI text conversation, journeys, evidence inspector/export)
**plus all four extensions: Anki warm-start import, Firehose first
connectors, Observatory v1, and voice conversation** — running
**iPhone-native + web** (native for capture/review, web for long
text/import/admin).

## 1. DONE, decomposed into testable clauses

| Clause | Meaning | Final test |
|---|---|---|
| One full clean system | A single app; the old dictionary, Anki, and kanji apps are unnecessary for the daily loop | during the acceptance week (§3), zero forced fallbacks to legacy tools |
| Polished | v2 design language implemented (typography-first, ruby, ink+vermilion, ma; museum-card pages; REQ-UI-08) — no placeholder UI on any shipped surface | operator visual walkthrough; no screen the operator flags as "unfinished" |
| Running | iPhone dev/TestFlight build + web, daily-stable, offline core (REQ-ARCH-06) | 7 consecutive days of real use without data loss or blocking failure |
| Everything functioning | every capability row in §2 works end-to-end, not as demo stubs | per-capability acceptance in its campaign + re-verified at final audit |
| Clean and integrated | one learner state under every surface (REQ-CORE-01); a word met anywhere shows up everywhere it should | cross-surface trace test: one encounter followed through conversation → thread → kanji page → review → canvas → export |
| Recursively explorable | from any word: kanji → components → compounds → related/contrasting words → sentences → back; no dead-end screens | operator runs a 10-minute free exploration from one seed word and never hits a dead end or a context loss |
| Ready for deep engagement | the operator adopts it as the actual daily learning environment | §3 acceptance week completed and the operator declares `continue` |

## 2. Capability inventory bound to DONE

Core (campaigns C1–C2): closed learning loop (Phase-0, all 15
capabilities); full licensed JMdict/KANJIDIC2 local search with
provenance; KanjiVG stroke order; layered word/kanji/grammar pages at
dictionary scale; Keep/Learn/Master + pinned FSRS-6; finite sessions;
integration canvases; evidence inspector + lossless export; recursive
navigation between all entity pages; personal-relevance ordering (basic);
native iPhone capture/review + web admin surfaces.

Extensions (operator-included in DONE):

- **Anki warm-start** (C3): TSV first, then collection/history through the
  quarantine + mapping report (REQ-MIG-01); imported state is
  tier-labeled, never trusted truth.
- **AI conversation + journeys, full text** (C3): grounded conversation
  over live threads (T3 routing), declared micro-probes, generalized
  hypothesis→probe→branch→rejoin journeys (REQ-JRN-01/02), belief-ledger
  surfaces (REQ-LM-06).
- **Firehose first connectors** (C4): rights-aware Source Router modes
  only (REQ-SRC-04) — one open/licensed source, one compliant RSS
  connector, manual share; personal-utility blending (REQ-JRN-06); **no
  scraping, no caption ripping — the ingestion contract is part of done,
  not friction to remove**.
- **Observatory v1** (C4): global knowledge view with capability lenses /
  distinct marks (never one mastery brightness — REQ-UI-07), history
  replay from the event log, tap-through to threads.
- **Voice conversation** (C5): spoken exchange + listening probes under
  the same evidence rules (audio contracts are separate contracts;
  REQ-LM-02); text remains available everywhere.

Still outside DONE (unchanged unless the operator says otherwise):
ContentReadinessEstimate ranking, mnemonic-art pipeline, handwriting
recognition, full Kanken curriculum, sync/multi-device accounts, social/
marketplace/monetization, any efficacy marketing claim. (Each remains a
later, separately accepted expansion.)

## 3. Final acceptance — the deep-engagement week

DONE is declared by the operator, and only after:

1. **Setup:** operator's real Anki data imported; a real feed/source
   connected; app on the operator's iPhone.
2. **Seven consecutive days** of genuine daily use: capture from real
   life, daily sessions, at least three AI conversations (≥1 voice), at
   least one journey followed to rejoin, immersion items arriving via the
   connectors, Observatory visited at will.
3. **The cross-surface trace test** and **10-minute recursive exploration
   walk** (§1) pass in the operator's hands.
4. **Zero data loss; export replays** at week's end.
5. The Phase-0 comes-up-short list (12 items) re-audited against the full
   system by the final verification pass — plus its extensions: no
   connector that violates its policy manifest; no Observatory lens that
   collapses capabilities; no voice grade entering FSRS outside a declared
   audio contract; no imported Anki state presented as verified truth.
6. The operator voluntarily continues into week two. **Wanting to keep
   using it is the test** (H2 generalized). A `pivot/stop` verdict is a
   legitimate outcome and is recorded, not argued with.

## 4. Campaign route (how the fleet gets there without scope collapse)

The staged discipline survives — each campaign lands on a verified
foundation, each gets its own derived controller (same machinery:
spec → controller → Opus fleet → Codex cross-verify → Fable audit →
operator checkpoint), and no campaign starts before the prior checkpoint:

| Campaign | Content | Checkpoint (operator-declared) |
|---|---|---|
| **C1** | Phase-0 closed loop (existing controller + orchestration, unchanged) | Phase-0 acceptance script passes |
| **C2** | Dictionary scale-up, full kanji depth, native daily alpha, recursive navigation, polish pass 1 | operator starts daily use ("living in it") |
| **C3** | Anki warm-start, full text conversation, generalized journeys, contrast system, belief-ledger surfaces | one week of daily use with imported history |
| **C4** | Firehose first connectors + personal utility; Observatory v1 | immersion items flowing; Observatory voluntarily revisited in week 4 (H7) |
| **C5** | Voice conversation + listening probes; final polish pass | §3 deep-engagement week → **DONE** |

C2–C5 controllers are derived only after the preceding checkpoint, from
the frozen v2 (REQ-PH-03/04/05 already specify their scope) — never
speculatively, so each controller is grounded in the system as it actually
exists.

## 5. Standing honesty rules (inherited, non-negotiable at every rung)

All claim boundaries (REQ-GATE-03), the evidence hierarchy, the AI
no-write rule, provenance/licensing discipline, and the Phase-0
comes-up-short list apply at every campaign. "Polished and integrated"
never overrides "true": a beautiful surface that fakes its evidence is a
failure of this definition, not a fulfillment of it.
