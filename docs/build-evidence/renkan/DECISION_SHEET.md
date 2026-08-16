# 連環 RENKAN — operator decision sheet (living draft)

**Status:** DRAFT — grows during the campaign; final version presented at §5 close.
Each item will be pre-chewed to a one-word answer before the campaign ends.

| #     | Decision                                            | State    | Proposal doc                                                     |
| ----- | --------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| OD-1  | OD-09 repository licence (blocks distribution)      | pending  | —                                                                |
| OD-2  | The 30 recovered articles: approve/reject each      | ready    | `docs/content/feed-review-queue.json` (30 `legacy` rows, from a phone) |
| OD-3  | Feed review queue: standing approval flow           | ready    | same file: 12 `mint` + 2 `cull` rows; apply via `tools/feed_apply_review.py` |
| OD-4a | Wayfinder #35: name the atom and the graph          | ready    | `proposals/WAYFINDER_35_ATOM_AND_GRAPH_PROPOSAL.md`              |
| OD-4b | Wayfinder #38/#40: card formats, override policy    | ready    | `proposals/WAYFINDER_38_40_CARDS_AND_OVERRIDE_PROPOSAL.md`       |
| OD-5  | #49 rename BUNKI → KAIRO (prepared, fired on word)  | ready    | `proposals/RENAME_49_BUNKI_TO_KAIRO_PLAN.md`                     |
| OD-6  | TTS voices (licensed assets, cost; 澄/語/話 styles) | ready    | `proposals/TTS_VOICES_PROPOSAL.md`                               |
| OD-7  | Physical-device evidence (on-device runs are yours) | standing | —                                                                |
| OD-8  | Merge campaign branch to `main`                     | pending  | PR #74                                                           |

Additional items typed here by the campaign when a §1 terminal honestly cannot
close without operator word are appended below with named rationale.

## Appended during campaign

| #     | Decision                                                       | State   | Proposal doc                         |
| ----- | -------------------------------------------------------------- | ------- | ------------------------------------ |
| OD-9  | Ratify ADR-004 (one learner state by contract parity — T2)     | pending | `docs/adr/ADR-004-one-learner-state.md` |
| OD-10 | Drift in-water grading now blocks when the store is quarantined read-only (constitution-consistent; feel-check the behavior) | pending | RUN_STATE round 1, A1a concern |
| OD-11 | LEECH_LAPSES stays a constant (6). Make it a ペース setting? (Anki default 8) | pending | R2-A decision note |
| OD-12 | Legacy `stats.fuzzOff` boolean: validator still admits it so old records aren't quarantined; scrub-on-save migration only on your word | pending | ADR-003 + R2-A note |
| OD-13 | Bulk-start door for imported legacy sets (one 始める per row today; a bulk door recreates the avalanche the no-debt law prevents) | pending | R2-A note |
| OD-14 | Review-session bound range: 5–100 in steps of 5, default 20 — confirm or adjust | pending | R2-A note |
| OD-15 | Feed editorial policy: freshest-first surfaced sensitive-news adjacency (a child's death ×2 in one tranche) and informal-register sports quotes — set the editorial bar for auto-selection | pending | R2-D note |
| OD-16 | wikinews:1483 (dropped name leaves broken grammar): cull, or repair-from-source like 1403? | pending | queue cull row |
| OD-17 | 産巣日 names: minted 〜むすびのかみ (UniDic); the editorial anchor (神名データベース) prefers classical ムスヒ — one lexicon entry + re-mint on your word (検収前 editorial pass) | pending | R3-A note |
| OD-18 | Full re-tokenization of the first-40 articles (fresh UniDic differs from ca07-era readings in ~12 bodies, e.g. 七 しち→なな); ripples grading signals + historical receipts | pending | R3-A note |
