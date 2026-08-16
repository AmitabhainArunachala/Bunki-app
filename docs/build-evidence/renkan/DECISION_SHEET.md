# 連環 RENKAN — the operator decision sheet

**This is how the campaign ends** (§5). Everything below is pre-chewed to a
one-word answer. Nothing here can be decided by an agent: each row is either
your taste, your money, your rights, or your device.

Reply with the row number and the word. Where a proposal exists, it opens with
what I recommend and why.

## The eight the campaign spec named

| #     | One-word question                                                                                          | Options (recommendation first)      | Where to look                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| OD-1  | The repository licence (OD-09; blocks distribution, still open since July)                                  | **DEFER** · CHOOSE-NOW              | ADR-001 records share-alike data confined to `packages/seed/`                     |
| OD-2  | The 30 recovered 検収前 originals — approve/reject each                                                     | **REVIEW** · APPROVE-ALL · DEFER    | `docs/content/feed-review-queue.json`, the 30 `legacy` rows (editable from a phone) |
| OD-3  | The feed's standing approval flow (12 fresh mints + 2 cull proposals pending)                               | **ADOPT** · TRIM · DEFER            | same file, `mint`/`cull` rows; apply with `tools/feed_apply_review.py`             |
| OD-4a | Wayfinder #35 — name the atom and the graph                                                                 | **THREAD** · ATOM · DEFER           | `proposals/WAYFINDER_35_ATOM_AND_GRAPH_PROPOSAL.md`                               |
| OD-4b | Wayfinder #38/#40 — which card formats ship, what a human may override                                      | **ADOPT** · TRIM · DEFER            | `proposals/WAYFINDER_38_40_CARDS_AND_OVERRIDE_PROPOSAL.md`                        |
| OD-5  | #49 rename BUNKI → KAIRO (one reviewable change, fired on your word)                                        | **FIRE** · FIRE+REPO · HOLD         | `proposals/RENAME_49_BUNKI_TO_KAIRO_PLAN.md` (the corridor is already KAIRO inside) |
| OD-6  | TTS voices — 澄 / 語 / 話, licensed assets, real money                                                      | **SAMPLES** · NARROW · DEFER        | `proposals/TTS_VOICES_PROPOSAL.md` (costs marked as estimates)                    |
| OD-7  | Physical-device evidence — on-device runs are yours; everything else ships marked web-verified              | **STANDING**                        | every claim in this campaign is labelled web-verified                             |
| OD-8  | Merge this branch to `main`                                                                                 | **MERGE** · HOLD                    | PR #74 (draft; 44 landed commits, battery green)                                  |

## Typed here by the campaign (a §1 terminal that cannot honestly self-close)

| #     | One-word question                                                                                                                       | Options                        | Why it is yours                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| OD-9  | Ratify **ADR-004** — one learner state by contract parity (closes T2 the way §1 permits)                                                  | **RATIFY** · AMEND · REJECT    | An ADR narrowing a constitutional law is an operator ruling, not an agent's                          |
| OD-10 | Drift grading now **blocks** when the learner store is quarantined read-only (one state or none — feel-check it)                          | **KEEP** · SOFTEN              | A felt-behaviour ruling                                                                              |
| OD-11 | `LEECH_LAPSES` stays a constant (6) — make it a ペース setting? (Anki's default is 8)                                                     | **KEEP** · EXPOSE              | Scheduler policy taste                                                                               |
| OD-12 | Legacy `stats.fuzzOff` byte: the validator still admits it so old records aren't quarantined                                              | **KEEP** · SCRUB               | A scrub rewrites stored learner bytes                                                                |
| OD-13 | Bulk-start for imported legacy sets (today: one 始める per row, by the no-debt law)                                                       | **KEEP** · ADD-BULK            | A bulk door recreates the avalanche the law exists to prevent                                        |
| OD-14 | Review-session bound range 5–100 (step 5, default 20) — confirm                                                                          | **CONFIRM** · ADJUST           | Your sitting, your numbers                                                                           |
| OD-15 | Feed editorial policy: freshest-first surfaced a child's death twice in one tranche and informal-register sports quotes                   | **RULE** · DEFER               | Editorial judgment about what a learner meets                                                        |
| OD-16 | `wikinews:1483` — a dropped name leaves broken grammar: cull it, or repair from the historical record the way 1403 was repaired?          | **REPAIR** · CULL              | Content judgment                                                                                     |
| OD-17 | 産巣日 names minted 〜むすびのかみ (UniDic); the editorial anchor prefers classical ムスヒ                                                | **KEEP** · CLASSICAL           | One lexicon entry + re-mint either way; a Japanese-editorial call                                    |
| OD-18 | Full re-tokenization of the first-40 articles (fresh UniDic differs from the ca07-era readings in ~12 bodies)                             | **DEFER** · REMINT             | Ripples grading signals and historical receipts                                                      |
| OD-19 | **T5**: the double-dry gate ran round A — 27 findings, 11 fixed and gated the same night, battery still 16/16. Round B (the second consecutive dry round the rule requires) has not run | **RUN-IT** · ACCEPT · DEFER | The rule is two dry rounds; one worked round is not two. Round B is one command |
| ~~OD-20~~ | **CLOSED** — R4-A was independently verified once the limit lifted: all four gates reproduced in a clean worktree, the two changed test expectations interrogated (one proved genuinely stronger; the other's dedup hazard forced empirically), verdict CONFIRMED. Its two documentation findings are fixed | — | nothing left for you here |
| OD-21 | Kanji readings ship truncated to three (the builder sliced `[:3]` while its header claimed FULL sets), so the quiet room labels three readings 音読み/訓読み for characters with more — 生 above all. The slicing is fixed; regenerating needs the KANJIDIC2-derived `KANJI_SRC`, which is not in this repo | **REGENERATE** · ACCEPT | E3 round-A, writing-room lens; `prototypes/drift/tools/rebuild_kanji_data.py` |
| OD-22 | The furigana-truth gate certifies the 82 curated bodies; the 682-article archive was minted before the reading lexicon and is not covered | **SWEEP** · ACCEPT | E3 round-A, reader lens |

## What I would answer, if the answers were mine

RATIFY (OD-9) and MERGE (OD-8) — the branch is green and nothing in it can
merge itself. REVIEW the 30 (OD-2) before anything else: they are the only
content on the shelf still wearing 検収前, and lifting that is the single
highest-value hour you can spend. Then SAMPLES (OD-6), because audio is the
one gate that keeps the reading score under 60 no matter how good the rest
gets — and RUN-IT (OD-19) whenever the limit resets, because a campaign that
ends with its own closing gate unrun should say so out loud, which is what
this row is.
