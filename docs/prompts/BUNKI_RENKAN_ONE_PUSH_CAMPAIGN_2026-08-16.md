# 連環 RENKAN — the one-push campaign: a graph of loops verifying loops

**Date:** 2026-08-16 · **Author:** Claude (operator-directed) · **Status:** ratified by the operator when a session is pointed at this file.

The operator's instruction, verbatim in intent: _finish the whole app in one long
workflow push, using a graph of loops to verify loops; catch every piece of
dysfunction; max 16 subagents at a time; get the app humming end to end with as
much integrity, robustness and quality as possible; finish the entire Wayfinder
goal in one push._

連環 — linked rings. No loop trusts itself; every ring is closed by another ring.

---

## §0 Authority, base, and laws

- **Base**: `main` after PR #71 (the 八彩 corridor is the product). If PR #73
  (the codex-strand harvest) is merged, branch from `main`; if it is still open,
  branch from `origin/claude/boonkey-app-status-w2yy35` — it contains main plus
  the harvest and the campaign must not redo that work.
- **Campaign integration branch**: `claude/renkan-one-push-2026-08-16`. It is the
  ONE branch. Subagent work happens in worktrees/donor branches and lands here
  by cherry-pick or merge from the exact live head. Open a draft PR to `main`
  immediately and keep it draft: **nothing merges to `main` without the
  operator's explicit word.**
- **Ground-truth reading list** (read before the first build loop, in this order):
  1. `docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md`
  2. `docs/operator/BUNKI_READING_EXCELLENCE_RUBRIC_AND_CLOSURE_SPEC_2026-08-15.md`
  3. `docs/prompts/BUNKI_READING_EXCELLENCE_LONG_RUNNING_GOAL_2026-08-15.md`
  4. `docs/build-evidence/full-review/LEDGER.md` (the 65 findings)
  5. `docs/briefs/KAIRO_GOSAI_REBUILD_SPEC_2026-08-13.md` and `docs/design/HASSAI_STANDARD_2026-08-13.md`
  6. `docs/briefs/KAIRO_FULL_INSTRUMENT_DIRECTIVE_2026-08-15.md`
  7. `docs/handoffs/PR70_RECONCILIATION_2026-08-15.md` (the preserved learner-state migration backlog)
  8. GitHub issues #32 (Wayfinder map) and every open `wayfinder:*` ticket
  9. `README.md`, `docs/adr/`, and the frozen `docs/specs/` (hash-verified, never edited)
- **Inherited laws, non-negotiable**:
  - No proxy metrics. An article count is not a reading experience; a passing
    check is not a learner outcome. Claims bind to exact SHAs and runnable
    evidence or they are marked UNVERIFIED.
  - Never weaken, skip, or quarantine a verifier to get green. A verifier change
    is itself a build product and gets its own verify loop.
  - Two licence pools stay separated (Wayfinder #41). NC/ND never enters.
    Share-alike stays confined. Every content item carries provenance.
  - Unapproved content is visibly 検収前. Nothing self-approves. 0/N approved
    stays 0/N until the operator says otherwise.
  - Evidence directories are append-only. Web results are never reported as
    native results. `browserAndDevice: NOT_RUN` stays honest until run.
  - Frozen specs under `docs/specs/` are never edited.
- **Concurrency**: at most **16 subagents at any moment** (the Workflow runtime
  clamps to min(16, CPUs−2); saturate what the box gives, never exceed 16).
- **Resumability**: after every round, write
  `docs/build-evidence/renkan/RUN_STATE.md` + `manifest.json` (exact SHAs, round
  ledger, next command) and push. Any fresh session must be able to resume from
  the repo alone. Sessions die; the campaign must not.

## §1 Terminal condition — what "the app hums" means

The campaign is DONE when every row below is either CLOSED with bound evidence
or typed onto the **operator decision sheet** (§5). No third state.

| #   | Terminal          | Closed means                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Every gate green  | The full battery of §4 passes on the campaign head, re-run fresh, reports committed.                                                                                                                                                                                                                                                                                   |
| T2  | One learner state | The corridor's SRS/obslog/deck state flows through `@bunki/domain` (or a ratified ADR narrows the unification with tests + rollback fixtures). No second learner store anywhere. The PR70 migration backlog is drained or ADR-deferred.                                                                                                                                |
| T3  | Reading Crown     | The rubric's 30-cap is lifted the only way it can be: an exact-SHA end-to-end reader demonstration. Binding score re-assessed against the rubric with the omissions ledger honest. Target ≥70/100 with zero dishonest line items.                                                                                                                                      |
| T4  | The feed          | The article pipeline of L5 runs end to end: ≥3 licensed sources, grader-scored, provenance-pooled, EN titles as schema data, freshness/rotation, a curation loop with authority to cull weak articles, and a review queue for the operator. A "constant feed" is demonstrated by two consecutive automated ingest runs producing shelf-ready, gate-passing candidates. |
| T5  | Ledger zero       | All 65 full-review findings closed or operator-deferred with named rationale. The dysfunction HUNT loops (§2) have run to dry twice at the end of the campaign — zero fresh confirmed findings in two consecutive full-fleet rounds.                                                                                                                                   |
| T6  | AI stack honest   | Every deployed AI surface routes through `@bunki/ai` (timeout/abort), persists losslessly ("not a word is lost"), and the memory design follows the constitution: AI proposes, learner confirms, FSRS schedules. No third parallel stack.                                                                                                                              |
| T7  | SRS complete      | Revlog has a reader: the FSRS optimizer donor (`codex/fsrs-optimizer-20260812`) harvested or re-implemented; parameters updatable from real review history; session time budget is the learner's, not a hardcoded 12; capture reversible everywhere.                                                                                                                   |
| T8  | Truth pass        | README, PR body, and in-app copy state exactly what is real. Campaign integration manifest (schema v2, authored fresh and legitimately this time) passes `verify:integration-manifest` on the campaign branch.                                                                                                                                                         |

## §2 The loop graph — how the push runs

Five loop types. Every loop's exit is another loop's entry; no loop grades its
own homework.

- **BUILD loop** — implements one work package in a worktree; exits only into a
  VERIFY loop. Never lands its own work: the integration lander (one agent,
  serialized) cherry-picks from the exact donor head after verification.
- **VERIFY loop** — adversarial, independent, different lens from the builder
  (correctness / regression / a11y / data-integrity / honesty-of-copy). Gets the
  diff and the claim, tries to refute it. 2-of-3 skeptic majority kills or
  confirms contested claims.
- **HUNT loop** — dysfunction discovery. Eight standing lenses: SRS wiring,
  dead ends & navigation, data/licence integrity, a11y, reader experience,
  writing room, AI surfaces, performance/console. Runs loop-until-dry: a lens
  retires only after 2 consecutive empty rounds; every finding is
  adversarially verified before it becomes work.
- **CURATE loop** — content only (L5): ingest → grade → provenance → EN title →
  review-queue. Has cull authority: any article below the quality bar is rotated
  out once the feed can replace it (this includes legacy scraped items —
  e.g. `wikinews:1403` — the moment better stock exists).
- **META loop (the ring that closes the rings)** — once per round: audits the
  loop graph itself. Which verifier is stale? Which lens found nothing because
  it looked at nothing? Which claim in RUN_STATE is not bound to a SHA? Did any
  gate get weaker? Its findings reshape the next round. The META loop is the
  answer to "who verifies the verify loops" — and the operator's decision sheet
  is the answer to who verifies the META loop.

**Round shape** (repeat until §1 is exhausted):

1. Controller reads RUN_STATE, picks the round's lanes by dependency and debt.
2. Fan out BUILD + HUNT loops (≤16 live agents; pipeline, don't barrier).
3. Every build verified; every finding verified; lander integrates serially;
   battery runs on the integrated head.
4. META loop audits; RUN_STATE + manifest written; PR thread note posted;
   push.

## §3 Lanes — the work, with anchors

Dependency order; lanes within a wave run concurrently.

**Wave A — foundation debts**

- **A1 · One learner state (T2).** The deepest debt: the shipped corridor keeps
  its own store while `@bunki/domain` holds the tested kernel. Map: PR70
  reconciliation backlog. Staged: schema migration + event bridge + replay
  equality + rollback fixtures. This lane gets the strongest verify coverage in
  the campaign (determinism pin, storage-integrity ledger, golden replay).
- **A2 · AI runtime unification (T6).** Route corridor AI through `@bunki/ai`:
  10s abort, no dead 考え中, lossless persistence per surface, 24-turn cap
  removed in favor of a durable transcript store. Memory-graph design doc for
  Wayfinder #35/#38 → operator decision sheet.
- **A3 · SRS completion (T7).** Optimizer donor harvest; revlog reader;
  session-budget UI; fuzz decision surfaced (pin vs fuzz is an ADR, not a
  silent flag).

**Wave B — the feed (T4)** — runs parallel to Wave A from day one

- **B1 · Corpus spine landing.** The seven verified dataset branches + grader
  (`corpus/00`–`corpus/07`, open PR #60) are the pipeline's engine — land them
  on the campaign branch (stacked-merge repair as PR #60 describes).
- **B2 · Ingest adapters.** Wikinews (CC BY, live feed), Aozora (PD), yasashii
  nihongo (government), Bunki-generated originals (Wayfinder #42's engine,
  provenance-flagged 検収前). Each adapter: fetch → clean (LINK-SAFE: never
  strip a link's text — the 1403 lesson) → tokenize → grade → pool → EN title →
  emit shelf candidate. Note network egress limits: adapters must degrade to
  operator-runnable scripts with committed outputs when a domain is blocked.
- **B3 · Schema: bilingual titles + review state as data.** `titleEn` and
  `review` become index/article schema consumed by the corridor; the hardcoded
  `TITLES_EN` map migrates into data and dies.
- **B4 · Curation + rotation.** Freshness, level balance (the Wayfinder map's
  N5→Kanken spine), cull authority, operator review queue (a single committed
  JSON the operator can approve rows in from a phone).

**Wave C — Reading Crown closure (T3)** — after A1 lands, on the feed of B

- **C1 · The exact-SHA end-to-end reader demo** the rubric demands: one SHA,
  one deployed URL, one scripted-and-screenshotted walk from shelf → article →
  lookup → capture → review → return, every step bound to the learner state of
  A1.
- **C2 · Rubric re-assessment**, omissions ledger honest, score recomputed.
  TTS/voice-styles research lands as a proposal on the decision sheet (voices
  are licensed assets — operator gate).

**Wave D — full-surface excellence (T5)**

- **D1 · Ledger burn-down.** Every remaining P1/P2/polish from
  `full-review/LEDGER.md`, plus everything the HUNT loops confirm.
- **D2 · Navigation & composition** (Wayfinder #37, #46, #47): the app's
  surfaces compose as one instrument; dead ends zero.

**Wave E — truth and closure (T1, T8)**

- **E1 · Fresh full battery + screenshot matrix** on the final head.
- **E2 · Truth pass**: README, PR body, in-app copy, campaign manifest v2,
  final RUN_STATE with typed terminal states.
- **E3 · Final double-dry HUNT**: all eight lenses, twice, zero confirmed
  findings — or the campaign is not done.

## §4 The battery (every integrated head; fresh full run for E1)

`format:check` · `lint` · `typecheck` · `vitest` (all workspaces) ·
`verify-corridor.mjs` (116+) · `verify-corridor-accessibility.mjs` ·
`verify:writing-room` · `verify-corridor-storage-integrity.mjs` ·
`verify:drift:fast` · `verify-native-readings.mjs` (grows with the shelf) ·
`test:e2e` (mobile Chromium + **mobile WebKit** where the runner allows) ·
`verify:replay` + `verify:export` once A1 makes them real ·
`verify:integration-manifest` (green after E2's v2 manifest) ·
corpus `pytest` gates. New capabilities get new verifiers in the same style —
verifiers are product.

## §5 The operator decision sheet — what one push honestly cannot close

The campaign ENDS by presenting this sheet, pre-chewed to one-word answers:

1. **OD-09 licence** for the repository (still pending; blocks distribution).
2. **The 30 recovered articles**: approve/reject each (検収前 lifts only here).
3. **Feed review queue**: standing approval flow for new articles.
4. **Wayfinder #35** (name the atom/graph) and **#38/#40** (card formats,
   scheduler override policy) — proposals will be drafted; rulings are yours.
5. **#49 rename BUNKI → KAIRO**: prepared as a single reviewable change, fired
   on your word.
6. **TTS voices** (licensed assets, cost) — proposal with samples plan.
7. **Physical-device evidence**: on-device runs remain yours; everything else
   ships marked web-verified.
8. **Merge to `main`.**

## §6 Kickoff (for the fresh session)

```
Read docs/prompts/BUNKI_RENKAN_ONE_PUSH_CAMPAIGN_2026-08-16.md and execute it
as the standing goal. Use multi-agent workflows (graph of loops per the spec),
max 16 concurrent subagents. Work on claude/renkan-one-push-2026-08-16 per §0.
Persist RUN_STATE every round. Do not stop at a round boundary while any §1 row
is neither CLOSED nor on the decision sheet; end only at §5 or on my
interruption.
```

The push is long. Sessions and rate limits will interrupt it. That is why §0
demands resumability: the campaign lives in the repo, not in any one context
window.
