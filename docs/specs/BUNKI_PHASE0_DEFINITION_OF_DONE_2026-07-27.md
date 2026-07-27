---
title: "Bunki — Phase-0 Definition of Done (binding acceptance ladder)"
date: 2026-07-27
project: bunki
artifact_type: definition_of_done
version: v1.0
status: frozen_at_publication
operator: John Shrader
consistency_rule: "Additive to the controller: this document does not weaken or replace controller §21.1; it defines the operator-facing acceptance ladder above it. On conflict, report — never silently resolve."
authorities:
  controller: docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md
  v2_spec: docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
  orchestration: docs/specs/BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md
---

# Phase-0 Definition of Done

## 0. The one-sentence done

> **Phase 0 is done when John captures a real Japanese encounter on a real
> device in under two seconds, promotes it, retrieves it under a strict
> contract, reuses it in context, kills the app, and finds every event
> intact, inspectable, and exportable — and then voluntarily puts a second
> encounter through the loop.**

Everything below exists to make that sentence un-fakeable.

## 1. The done ladder (who can declare what)

Four rungs. Each rung requires all rungs below it. **"Phase-0 COMPLETE"
means rung 3.** No agent may use the word "complete" for anything less;
lower rungs are named checkpoints, not completions.

| Rung | Name | Declared by | Evidence required |
|---|---|---|---|
| 1 | **ENGINEERING-DONE (web)** | the agent fleet (controller §21.1) | every WP-00..WP-10 + WP-13 closure predicate green on freshly fetched merged main; T-01..T-17 green in CI; export→replay verified; Codex 5.6 report filed with zero unresolved P0/P1; Fable 5 closure receipt with exact SHAs |
| 2 | **DEVICE-DONE (native)** | the fleet only with device evidence; otherwise **only John** after running the WP-11 checkpoint | native SQLite on an actual iPhone dev build: T-16-native, zero lost captures in the 100-trial kill test, §13 latency measurements from the device (not simulator, not web) |
| 3 | **PHASE-0 COMPLETE (operator acceptance)** | **John, and no one else** | the §3 acceptance script passes in his hands, and his WP-12 verdict is recorded as `continue` — REQ-GATE-01 items 1–7 including "voluntarily wants a second encounter" |
| 4 | (out of Phase-0 scope) scientific / market validation | experiments / users, later phases | H1–H10 batteries; never claimable from Phase 0 |

**The external-gate honesty clause:** the controller rightly lets the fleet
close WP-11 as a documented external gate when it lacks a device. That
closes the *fleet's* obligations — it does **not** advance the ladder.
If WP-11 is external-gated, the project stands at rung 1 and the status
line must read: `ENGINEERING-DONE (web); DEVICE-DONE pending operator
checkpoint`. Anything phrased as "done" without that qualifier is a
REQ-GATE-03 violation.

## 2. Comes-up-short list (each is an explicit FAILURE of done, not a nuance)

The build has come up short if **any** of these is true at the claimed
rung, regardless of how green the dashboards are:

1. **Tests pass but the app doesn't.** CI is green yet `expo start --web`
   (rung 1) or the dev build (rung 2) cannot run the §3 script by hand.
2. **Web passed off as native.** Any rung-2 claim citing web, simulator,
   or `ci-substitute` measurements.
3. **The AI exchange is a puppet.** The "bounded AI candidate" only ever
   ran against the scripted fallback and no live-call evidence exists
   (acceptable only if OD-08 was never granted — then the status must say
   `live-AI path unexercised: awaiting OD-08`, and rung 3 requires John to
   accept that explicitly).
4. **Export exists but doesn't replay.** `verify:export` green on a toy
   fixture but the *operator's actual session data* fails round-trip.
5. **The session "ends" but the queue regrows silently** — T-13 passing
   while the UI still manufactures unbounded work.
6. **Evidence theater.** The inspector shows events but a grade, a
   promotion, or an AI acceptance exists with no user action behind it —
   or a reveal-then-correct got graded better than `Again`.
7. **Provenance rot.** Any seed field, capture, or export missing its
   source/license record (T-15 scope-narrowed to fixtures only).
8. **Latency by assertion.** Any §13 number reported without a recorded
   measurement on the runtime it claims.
9. **Predicate erosion.** Any WP closed by weakening a test, skipping an
   assertion, or reclassifying an exclusion (controller §18a ban).
10. **Second-encounter dodge.** Rung 3 claimed from the seeded fixture
    alone — the *real second encounter* (T-18) is the point, not a bonus.
11. **Verification skipped.** Rung 1 claimed without the Codex 5.6 report
    (or its explicitly recorded operator waiver) or without the Fable 5
    closure receipt.
12. **Frozen-doc drift.** Any spec/handoff/convergence file edited to make
    reality match the claim.

The Codex W7 checklist and the Fable W9 audit must each test this list
item by item and record a per-item verdict in their reports.

## 3. The operator acceptance script (rung 3, ~10 minutes, no developer help)

John runs this alone, from the launcher's README instructions. Any step
failing = not done; no partial credit.

1. **Capture:** enter/paste a real encounter you actually met this week
   (not 分岐). Saved acknowledgment feels immediate; the thread shows your
   source and an uncertainty mark you chose.
2. **AI step:** request the explanation. Either a live candidate arrives
   visibly labeled *AI candidate*, or (no OD-08 consent) a labeled
   fallback/skip — never an unlabeled answer, never a hang, and capture
   already survived regardless.
3. **Promote:** move it Captured → Learn. Confirm the review queue was
   empty of it *before* promotion (capture created no debt).
4. **Review:** complete a session containing it. Deliberately peek once —
   confirm the reveal forces `Again`. Miss the reading on purpose once —
   confirm meaning state is untouched in the inspector.
5. **Reuse:** meet it in the integration canvas; confirm the canvas
   interaction logged as exposure or declared probe (inspector shows
   which), not as a free FSRS write.
6. **End:** the session reaches its explicit end screen. No new items
   appeared mid-session.
7. **Kill:** force-quit the app; reopen. Everything is still there.
8. **Export:** export JSON; run the provided one-command replay check; it
   reports state equality.
9. **Inspect:** in the evidence inspector, trace tonight's whole story —
   every state change shows its cause, tier, and version.
10. **The real question:** capture a *second* real encounter because you
    want to. If you don't want to, Phase 0 has failed its product gate
    (REQ-GATE-01.7) — record `pivot` or `stop`, and that verdict is data,
    not an inconvenience.

## 4. Wiring into the machine (so this can't be ignored)

- The fleet Conductor copies §2 and §3 verbatim into
  `docs/build-evidence/DONE_LADDER.md` at WP-00 and reports the current
  rung in every wave digest.
- WP-12's trial script IS §3 (plus the controller's trial AI-step rule).
- The Codex packet (orchestration §6) and Fable audit (orchestration §7)
  each append a §2 item-by-item verdict table to their reports.
- The final closure receipt states the achieved rung in its first line,
  in the exact vocabulary of §1 — no synonyms.

## 5. What done is deliberately NOT (so nobody moves the goalposts inward or outward)

Not a daily-driver MVP (no full dictionary, no Anki import, no
conversation beyond the bounded exchange — that's REQ-PH-03, next phase).
Not proof the product works (H1 stays untested; rung 3 measures *desire
to continue*, nothing more). Not a public app, a brand, or a store
submission. Conversely, nothing in this narrower scope excuses missing
rung 3: small and real, not large and fake.
