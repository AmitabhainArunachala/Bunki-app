# Bunki — the done ladder, as the operator wrote it

**This file is a copy, not a source.** Sections 2 and 3 below are reproduced
**verbatim** from the frozen acceptance layer:

- `docs/specs/BUNKI_PHASE0_DEFINITION_OF_DONE_2026-07-27.md`
- SHA-256 `92e575e14e5cd61556794e681c9804a0e156873ec60c9ae94eb936682c75155e`
  (verify: `sha256sum docs/specs/BUNKI_PHASE0_DEFINITION_OF_DONE_2026-07-27.md`)

That document is frozen. If this copy and it ever disagree, **it is right and
this file is wrong** — fix this file, and never the spec. Editing a frozen
document to make reality match a claim is definition-of-done §2 item 12,
"frozen-doc drift", and it is one of the controller's stop conditions.

Definition-of-done §4 asks the fleet to copy §2 and §3 here at WP-00 and to
report the current rung in every wave digest. That copy was not made at WP-00;
it is made here, at the WP-10 closeout, which is late. Recorded as late rather
than backdated.

---

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

---

## Where this build stands (WP-10 closeout, branch `agent/bunki-phase0-closed-loop-wp10-closeout`)

### The rung, in the ladder's own words

> **No rung is achieved. The project is below rung 1.**

The ladder's §1 defines four rungs and says each requires all rungs below it.
The lowest, rung 1, is **ENGINEERING-DONE (web)**. It is *not* achieved, so
there is no rung to name and the honest statement is the one above. In
particular this build is **not** "ENGINEERING-DONE (web)", and the phrase
"Phase-0 COMPLETE" — which §1 reserves for rung 3 — is not available to any
agent here under any qualifier.

What rung 1 requires, and what is actually true today:

| Rung-1 evidence required (§1)                                | State today                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| every WP-00..WP-10 + WP-13 closure predicate green            | **not met** — WP-10 closes here; WP-11, WP-12 and WP-13 have not been executed at all                                            |
| ...on freshly fetched **merged main**                          | **not met** — this is an unmerged agent branch; nothing here has been merged, and no agent may merge it                          |
| T-01..T-17 green in CI                                        | green **locally** on this branch (1374 unit/integration/replay + 38 E2E). CI has not run this branch; "green in CI" is unproven  |
| export→replay verified                                        | met locally (`verify:export`, and T-17 walks export→replay through the UI)                                                       |
| Codex 5.6 report with zero unresolved P0/P1                   | **not met** — no Codex 5.6 report exists                                                                                          |
| Fable 5 closure receipt with exact SHAs                       | **not met** — no Fable 5 receipt exists                                                                                           |

### The two rungs above, stated so they cannot be misread

- **Rung 2, DEVICE-DONE (native): UNVERIFIED.** No iPhone, no dev build, no
  device measurement, no 100-trial kill test. WP-11 has not been executed and
  has not even been closed as a documented external gate — there is no
  `docs/build-evidence/WP11_NATIVE_CHECKPOINT.md`. Every measurement in this
  repository is web. The §13 native budgets (capture-to-durable median ≤2 s /
  p95 ≤4 s, zero lost captures in 100 trials) have **never been measured**.
- **Rung 3, PHASE-0 COMPLETE (operator acceptance): UNRUN.** The §3 script
  above has not been run by John, or by anyone. WP-12 has not started. There is
  no `continue` / `pivot` / `stop` verdict, and only John can produce one.

### Against the §2 comes-up-short list

This is a **builder's self-report**, not the independent verdict §2 requires:
that list says the Codex W7 checklist and the Fable W9 audit must each test it
item by item, and neither has run. Recorded so the next reader starts from
something checkable rather than from nothing.

| #   | Item                        | Self-reported state                                                                                                                                                                |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tests pass but the app doesn't | Guarded, not disproven. The whole E2E suite drives the real `expo export` output by clicking; no spec seeds a store. The §3 script has still never been run by hand.               |
| 2   | Web passed off as native    | Not committed. Every number is labelled web (see `PERF_WEB.md`); no rung-2 claim is made anywhere.                                                                                  |
| 3   | The AI exchange is a puppet | **True, and disclosed.** Only the scripted fallback has ever run; the web bundle holds no key by construction. OD-08 is ungranted, so the required status is `live-AI path unexercised: awaiting OD-08`. |
| 4   | Export exists but doesn't replay | Not committed. `verify:export` is green and T-17 walks export→replay. But it has only ever run on fixture and test-driven data — **never on the operator's own session data**, because there is none. |
| 5   | Session ends but queue regrows | Guarded. T-13 holds at unit and E2E level, and the W5 closeout made `completed` actually reachable rather than merely defined.                                                     |
| 6   | Evidence theater            | Guarded. The WP-10 repair removed a bootstrap that manufactured a capture and a promotion with no gesture behind them; `session-canvas.test.ts` asserts a bootstrap appends nothing. |
| 7   | Provenance rot              | Guarded for fixtures (T-15, scope-narrowed). No operator-captured data exists to rot.                                                                                              |
| 8   | Latency by assertion        | Not committed. The two web numbers are measured by a committed, re-runnable script and labelled with their runtime; the native budgets are reported as unmeasured, not as met.      |
| 9   | Predicate erosion           | Not committed **in this wave**, and worth stating precisely: two `test.fail()` annotations were deleted here, both because the defect they named was fixed and the test now passes as written. No assertion was weakened to make anything green. One assertion was *strengthened* (T3-2 now pins a bounded property, and 0 stale screens rather than 1). |
| 10  | Second-encounter dodge      | Cannot be assessed. T-18 belongs to WP-12, which has not started.                                                                                                                   |
| 11  | Verification skipped        | **Currently true**, which is exactly why no rung is claimed: neither the Codex 5.6 report nor the Fable 5 receipt exists.                                                            |
| 12  | Frozen-doc drift            | Not committed. No file under `docs/specs/`, `docs/convergence/`, `docs/handoffs/` or `docs/adr/` was modified; all nine spec hashes verify against the integrity record.             |

### Open findings carried out of this wave

The four W5 P1 findings are closed. Three P2s remain open and are pinned as
annotated expectations in `apps/app/e2e/adv-known-defects.spec.ts`, so each one
turns CI red the moment it is fixed and the annotation has to go:

- **T4-2** — no `SessionClosed` event reaches the durable log; the sitting lives
  in the session workspace beside it (COORD-B8-2, needs a kernel provenance
  marker before the store can accept events it did not mint).
- **T4-1b** — the pre-hydration exported bytes still ship an empty `<title>`;
  every route is correctly titled once the app hydrates.
- **T3-3** — abandoning an in-flight AI request still attaches a scripted
  candidate to the log during unload.
