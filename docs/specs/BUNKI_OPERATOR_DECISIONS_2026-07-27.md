---
title: "Bunki — Open Operator Decisions"
date: 2026-07-27
project: bunki
artifact_type: operator_decision_register
version: v1.0
operator: John Shrader
---

# Open operator decisions

Merged from handoff §14 (nine questions) and the Codex Round-1 response §5
(six questions — each maps into an OD below; none was dropped). Every entry
records the reversible Phase-0 default so no open decision blocks the build
where a default exists. Answer by editing this file in a PR, commenting on
the build PR, or telling any session — the executor records answers
verbatim in the evidence capsule and decision ledger.

**Blocking classes:** `admission` (blocks build start), `execution` (blocks
one WP), `native` (blocks device verification), `later` (Phase 2+ only).

## OD-01 — Working name (later)
Does **Bunki / 分岐** feel right even as a working name?
*Default:* keep as codename; no user-facing branding in Phase 0. Before any
public identity: tone/pronunciation/recall testing plus App Store, domain,
and trademark screening (DL-30). Parked alternates from Claude v1: Kodama
木霊, Ayumi 歩み.

## OD-02 — Canonical Phase-0 fixture encounter (execution, defaulted)
Which real Japanese encounter should be the canonical Phase-0 fixture?
*Default:* seeded encounter for **分岐** (railway "branch point" sense) with
labeled provenance, since seed data must include 分/岐 anyway. Swappable in
one commit when you name a real encounter (a recent lookup you actually
cared about is ideal — e.g., something from your NHK/talk-video diet).

## OD-03 — Observatory "interactive" meaning (later)
For the later global visualization: is "interactive" primarily
tap-for-detail, relationship exploration, history scrubbing, choosing what
to study, customizing the art — or a mixture? *Default:* none needed;
Phase 0 only preserves Observatory-compatible events (REQ-UI-07).

## OD-04 — Readiness menu intent (later)
Should the future readiness menu discover content, prepare chosen content,
or both? May high interest override low readiness? *Default:* none needed
in Phase 0 (REQ-CRE-01 is deferred).

## OD-05 — Branch interaction style (later; defaulted for the single Phase-0 branch)
Guided autopilot or explicit two-path choice at a stumble? *Default:*
two-path choice with a recommended default (REQ-JRN-03).

## OD-06 — Semantics of "I know this" (later; defaulted)
Should it write evidence, change priority, trigger promotion, or only
label? *Default:* records a user-assertion evidence event + priority
change; never a direct FSRS write (REQ-SCH-03).

## OD-07 — Correction style (later; defaulted)
Immediate explicit, recast, delayed digest, or flow-mode-only
interventions? *Default:* delayed digest in study mode, immediate on
request (REQ-AI-05); revisit when conversation ships beyond the bounded
Phase-0 exchange.

## OD-08 — AI privacy boundary, budget, latency (execution: live-AI path only)
What cloud-content boundary, monthly AI budget, and acceptable
conversational latency? *Phase-0 defaults:* only seeded fixture content
goes to the provider; hard budget cap via environment configuration; T2
timeout → offline fallback (controller §9). The live-call evidence in
WP-07 stays open until you supply a key + budget; the scripted fallback
lets the WP close without it.

## OD-09 — Repository, visibility, license, deployment (admission)
Is `AmitabhainArunachala/Bunki-app` (private) the authorized build target?
Which license? Any deployment account? *Status:* repo exists and carries
the frozen specs; **build-target confirmation is the one true admission
gate** (controller §22.1). License is deliberately undecided — until
chosen, the executor may add code but nothing whose license would constrain
your choice beyond what v2 already accepts (controller §4). No deployment
account is needed in Phase 0.

---

### Answer-tracking table

| ID | Class | Default in force | Operator answer | Date |
|---|---|---|---|---|
| OD-01 | later | codename retained | — | — |
| OD-02 | execution | 分岐 fixture | — | — |
| OD-03 | later | n/a Phase 0 | — | — |
| OD-04 | later | n/a Phase 0 | — | — |
| OD-05 | later | two-path choice | — | — |
| OD-06 | later | evidence + priority | — | — |
| OD-07 | later | delayed digest | — | — |
| OD-08 | execution (live AI) | fixtures-only, capped, fallback | — | — |
| OD-09 | **admission** | awaiting confirmation | — | — |
