# Handoff — Bunki / 回廊 (KAIRO) Next Integration Campaign (2026-08-17)

> **Provenance.** Refined and fact-checked against the live repository on
> 2026-08-17: `main` at `e335ab7aad68caf43747bb9bde4c04c06b1b81b3` (after PR #73)
> and the RENKAN branch `claude/renkan-one-push-2026-08-16` (PR #74) at
> `40012e58c899426d931875cfa01f6cc4bb257566`. Every SHA, path, number, and status
> below was verified read-only. Corrections applied vs the source draft: the
> reading score is stated as **17/100 baseline → 28.4/100** (not a "17–28" range);
> the product laws are the Constitution's **"Stable product laws"** (§4); the
> rubric delivery sequence is **§8**; the authority order is the Constitution's
> **§2 verbatim** (not an invented tiering); `BUNKI_OPERATOR_PRODUCT_LOCK_2026-07-29.md`
> exists; ADR-003 is **Accepted**, ADR-004 is **Proposed**; T-06 is an ADR-002
> kernel law; the feed queue holds 31 legacy rows (30 recovered originals + 1 later
> addition). This handoff is a document, not a policy source — the authority order
> in §1 governs.

You are taking over the **Bunki (分岐) / KAIRO (回廊)** Japanese-learning system as
lead integration agent. Mission: integrate everything already built, close remaining
integrity and product gaps, and advance the app to the next coherent level per the
frozen specs, the Master Definition of Done, the current Product Constitution, the
Reading Excellence Rubric, the Wayfinder methodology, and the concrete work already in
the repo — especially the **RENKAN campaign** (branch `claude/renkan-one-push-2026-08-16`,
PR #74). This campaign lives in the repository, not in any one context window. Keep it
resumable.

## 0. Verify state first (day-one command)

```
git -C <repo> fetch origin
git -C <repo> rev-parse origin/main                        # expect e335ab7aad68caf43747bb9bde4c04c06b1b81b3 (after PR #73)
git -C <repo> fetch origin pull/74/head && git rev-parse FETCH_HEAD    # expect 40012e58c899426d931875cfa01f6cc4bb257566
git -C <repo> rev-list --left-right --count origin/main...FETCH_HEAD   # expect "0  65" (pr74 is a strict superset of main)
```

If the SHAs differ, re-orient from the newest ratified directive before acting.

## 1. Authority order (obey the Constitution §2 verbatim — do not invent your own)

From `docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md` §2:

1. The operator's latest direct words and feel verdicts.
2. `docs/operator/BUNKI_OPERATOR_PRODUCT_LOCK_2026-07-29.md` **together with**
   `docs/specs/BUNKI_MASTER_DEFINITION_OF_DONE_2026-07-27.md`.
3. `docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` and its frozen
   integrity record (`docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`).
   **Never edit frozen specs.**
4. **Ratified KAIRO craft standards and dated redirects, later redirects controlling the
   part they amend.** This is where the current living law sits, newest last:
   `BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md` (its §4 "Stable product laws" bind) ·
   `docs/operator/BUNKI_READING_EXCELLENCE_RUBRIC_AND_CLOSURE_SPEC_2026-08-15.md` ·
   `docs/briefs/KAIRO_FULL_INSTRUMENT_DIRECTIVE_2026-08-15.md` (a gate) ·
   `docs/prompts/BUNKI_RENKAN_ONE_PUSH_CAMPAIGN_2026-08-16.md` (**newest**; ratified when a
   session is pointed at it).
5. The latest truthful handoff + current repository evidence (RENKAN `RUN_STATE.md`,
   `DECISION_SHEET.md`).
6. Older briefs, mockups, branches, and automated suites — history and regression tools only.

An automated check that contradicts a newer operator decision is updated; never the reverse.

## 2. Core product laws (Constitution §4 "Stable product laws" — must stay intact)

1. **Capture creates no review debt.** Saving an encounter does not schedule it; only
   explicit promotion (Keep / Learn / Master) activates retrieval.
2. **AI proposes; the learner confirms; FSRS schedules.** AI never silently writes mastery,
   stability, difficulty, or intervals.
3. **Exposure is not mastery.** Views, taps, lookups, passive re-encounters = exposure
   evidence only.
4. **Memory is modality-specific.** Reading / listening / recognition / production / writing
   evidence never collapse into one false level.
5. **Doors are recursive and context-preserving.** word → kanji → components → compounds →
   related senses → sentences → origin, without losing context.
6. **Provenance travels with the material.** Authentic / user-supplied / generated / inferred
   remain distinguishable.
7. **One learner state serves the whole app.** Presentation layers invent no independent
   knowledge stores. (Contract-parity path = ADR-004, still **Proposed** — see OD-9.)
8. **Calm Nihonga / living-ink / washi is functional, not decorative.** Real DOM text stays
   readable and accessible.

## 3. Current engineering reality (as of 2026-08-17)

- **Repo:** `AmitabhainArunachala/Bunki-app`. **Main HEAD:** `e335ab7` (after PR #73 harvest).
- **Most-advanced line:** PR #74, branch `claude/renkan-one-push-2026-08-16`, head `40012e5`,
  **still draft**, `mergeable_state: clean`, a **strict superset of main** (65 commits / 980
  files ahead, 0 behind). A "graph of loops verifying loops" campaign.
- **Closed on RENKAN** (verified against `docs/build-evidence/renkan/` +
  `docs/build-evidence/full-review/LEDGER.md`):
  - Two P0s: (a) Drift flick judgments now reach the single learner state, ack-gated with
    rollback; (b) Dojo drills stamp practice and no longer create orphaned FSRS cards or burn
    the 20/day new-card budget.
  - Capture sovereign: 覚える top-right on eligible surfaces, un-memorize everywhere, list
    management.
  - Scheduler policy **ADR-003** ("Corridor scheduler policy: fuzz off, monotonic review
    clock", **Accepted**): fuzz off, monotonic clock clamp, overdueness ordering, bounded
    sittings (5–100, default 20), no-debt legacy migration, learner ペース control.
  - Furigana truth: provenance-carrying override lexicon (31 entries) + **303** deterministic
    re-mints across 25 bodies (`furigana-truth/suspect-readings.json`).
  - Device Back walks in-app history instead of exiting.
  - Declared-recall gate **T-06** (an ADR-002 kernel law) wired into the corridor +
    transactional sweep (unchecked learner-root writes **19 → 5**).
  - FSRS optimizer loop closed end-to-end (`optimizer-roundtrip/`, `tools/fsrs-optimize.mjs`).
  - Feed pipeline: two automated ingest runs + operator review queue
    (`docs/content/feed-review-queue.json`). **Honest caveat:** live egress was 403-blocked, so
    runs were degraded over the committed archive — disclosed in-file.
  - Reading rubric 30-cap **lifted** by an exact-SHA end-to-end reader demo (tree `10c440c…`,
    85/86 DOM assertions); honest re-score **28.4/100** (up from the **17/100** rubric-spec
    baseline; still capped at 60/100 until working article audio).
  - Final verification battery **16/16 green** (`renkan/battery-final/SUMMARY.md`).
- **Open on RENKAN** (`docs/build-evidence/renkan/DECISION_SHEET.md` — 20 rows — and
  `RUN_STATE.md`):
  - **OD-19 / T5:** double-dry HUNT round B unrun (round A: 27 findings, 11 fixed same night,
    battery still 16/16). Two consecutive dry rounds are required to close.
  - **OD-2:** the 30 recovered 検収前 originals await approve/reject (queue now lists **31**
    `legacy` rows total, all `decision:pending`).
  - Pending operator decisions: **OD-9** ratify/amend ADR-004 (one learner state) · **OD-1**
    licence · **OD-6** TTS voices · **OD-5** #49 rename BUNKI→KAIRO (plan-only, **not
    executed**: FIRE / FIRE+REPO / HOLD; provisional ruling "the app is KAIRO 回廊") · **OD-4a**
    #35 name atom/graph · **OD-4b** #38+#40 card formats & override.
  - Residual HUNT findings (P2): tutor mid-question duplicate send; closing a word sheet
    mid-tutor archives an unreadable reply; radical-picker density; plus **OD-21** (kanji
    readings truncated `[:3]`) and **OD-22** (682-article archive furigana uncovered).
- Dozens of other agent/Claude/Codex branches (#67/#68/#70 KAIRO experiments, #60/#61, the
  obsolete #31) are **donors only** — cherry-pick or re-implement with verification; never
  wholesale-merge.

## 4. What "next level" means

Master DoD §4 staged route: **C1** Phase-0 closed loop (largely achieved) · **C2** dictionary
scale-up, full kanji depth, native daily alpha, recursive navigation, contrast system, polish ·
**C3** Anki warm-start, full-text conversation, generalized journeys, belief-ledger surfaces ·
**C4** Firehose first connectors (rights-aware Source Router, REQ-SRC-04) + personal utility +
Observatory v1 · **C5** voice conversation + listening probes + final polish → deep-engagement
week → **DONE**.

Reading product: **17/100 baseline → 28.4/100** after the reader demo, hard-capped at 60/100
until working article audio (rubric §5.3). The **R0–R6 delivery sequence (rubric §8)** is
binding for reading work: R0 evidence reset · R1 attach the reader · R2 replace the flat list ·
R3 attach audio · R4 close the learning loop · R5 adaptive intelligence · R6 editorial scale +
dogfood.

Wayfinder = the living decision surface (GitHub issue #32 map + `wayfinder:*` tickets). When a
campaign reaches an operator-only decision, produce a one-word decision sheet exactly as RENKAN
did (`docs/build-evidence/renkan/DECISION_SHEET.md`). Do not invent policy.

## 5. Immediate mission

1. **Orient.** Read in order: Constitution → Product Lock → Master DoD → V2 spec
   (§§1–5, 10, 12, 17) → Reading Rubric (§§5–8) → RENKAN `RUN_STATE.md`, `DECISION_SHEET.md`,
   `battery-final/SUMMARY.md` → `full-review/LEDGER.md`. Write a short orientation summary +
   proposed first wave.
2. **Integration posture.** Recommended: treat the **RENKAN head as the new baseline** (it is a
   clean strict-superset of main) and continue from it; recommend the operator merge PR #74, but
   **do not merge without explicit operator word**.
3. **Close integrity debt before expanding surface:** finish (or explicitly defer, with
   rationale) the double-dry HUNT round B; make one-learner-state real (ratify or amend ADR-004
   via OD-9); every new capability ships with a verifier that can convict its absence.
4. **Advance the highest-leverage surface** (choose + justify): attach a fully reliable reader +
   close the reading loop (R0–R4) · make capture + one-state SRS the default across every
   surface · land the 30 recovered articles (検収前 visible until operator review) · begin the
   rights-aware Source Router · unify the two scheduler lineages onto the single domain kernel.
5. **Process (inherited from RENKAN):** one clearly-named dated integration branch · multi-agent
   loops BUILD → independent VERIFY → HUNT → META (a builder never grades its own work; ≤16
   subagents at a time) · every capability lands with its convicting verifier · full battery
   stays green (or is expanded honestly) · fresh `RUN_STATE.md` + decision sheet whenever
   operator judgment is needed · never weaken a verifier to go green · never claim completion
   from article counts / source existence / unit tests alone · web results are never reported as
   native; physical-device evidence is the operator's.
6. **Honesty:** score reading against the 100-point rubric with 2026-08-15/16 strictness · tag
   every claim with its evidence level (source-only / screenshot / phone-verified) · if
   something is broken, say so and put it on the decision sheet or next queue.

## 6. Deliverables

Campaign plan (waves with terminal conditions) · integration of the best existing work without
regression · updated verification battery + evidence receipts · decision sheet(s) for
operator-only calls · updated README/constitution pointers if the baseline moves · a final
status the operator can act on in one sitting (merge / hold / next command).

## 7. Terminal condition

Do not stop at a round boundary while any major integrity gap or product law is neither CLOSED
nor on a decision sheet. End only with a coherent next-level prototype that demonstrably
advances the Master DoD and the Reading Rubric, or when you must present a decision sheet to
the operator.
