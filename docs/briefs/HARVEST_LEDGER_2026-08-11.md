# Harvest ledger — unifying the trunk (2026-08-11)

The operator ruled: **PR #69 (the Claude line) is the trunk** — its feel is the
product. Everything of value in the other open branches was inventoried and
either harvested into this branch, consciously left, or deferred with a reason.
This file is the triple-check record: nothing valuable is lost silently.

Trunk base: `claude/kairo-bunki-brief-j11dm2` @ cfb73c6 (PR #69's tip).
This branch: `claude/app-vision-next-steps-wei73a`.

Ancestry verified: PR #62, #65, #68 and `main` are fully contained in the
trunk. Only two branches carried anything outside it: PR #67
(`codex/kairo-full-build-20260808`) and PR #70
(`agent/kairo-one-prototype-2026-08-10`). The `corpus/*` branches (PR #60) are
a strict subset of what is already on the trunk — nothing to harvest.

## TAKEN into this branch

| What                                                                                                                                                                                                                    | From                                          | Where it landed                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **69,996-entry JMdict tier** — pinned (3.6.2+20260803141815), licensed CC BY-SA, sha256-verified, sharded 16 ways                                                                                                       | PR #70                                        | `prototypes/corridor/data/share_alike/dict-v2/` (~31 MB, lazy)                                                                                                               |
| **Off-main-thread dictionary search worker**                                                                                                                                                                            | PR #70                                        | `prototypes/corridor/dictionary-worker.js`; woven under the trunk's own search — core results unchanged and instant, the deep tier answers behind them                       |
| **Complete JMdict senses on the word sheet** — numbered senses, usage tags, spelling/reading restrictions, language sources, homograph choices, and JMdict's own cross-references/antonyms as tappable rows             | PR #70                                        | `renderDictionaryDetails` and friends in `corridor.js`, restyled in the trunk's visual language; JMdict relations stay visually distinct from the hand-written 類語 clusters |
| **Deep words are first-class learner items** — 覚える on a deep word stores a compact snapshot (`S.deepWords`) + ent_seq provenance, so FSRS review answers offline on any device without the index                     | new, this run                                 | `takeButton` / `lookup()` fallback                                                                                                                                           |
| **Learner-store protection** — unreadable envelope → read-only quarantine (original bytes never overwritten), unknown/future keys preserved across saves, future-version guard, save-failure reported in one quiet line | PR #70 (concept), re-implemented trunk-native | `loadStore`/`saveStore` in `corridor.js`; banner + nudge in the 覚える tray                                                                                                  |
| **Backup nudge** — after 20+ items with no export in 14 days, one quiet line in the tray points at 書き出す; export stamps `stats.lastExportTs`                                                                         | new, this run                                 | `renderTray` / `renderPortRow`                                                                                                                                               |
| **Drift signed-shift bug fix** — `>>` on an unsigned hash pinned ~half the corpus's world placement into a top band (y clamped to 90); now `>>>` at all six shift sites                                                 | PR #70 (found), all-6-sites fix ours          | `drift-artifact.html` `buildWorld`                                                                                                                                           |
| **Drift judgment write-confirmation** — a flick commits to storage first; if the device cannot keep it, the word stays in the water and one hint says so                                                                | PR #70                                        | `grade()` in `drift-artifact.html`                                                                                                                                           |
| **Drift storage quarantine** — same envelope protection as the corridor store                                                                                                                                           | PR #70                                        | `drift-artifact.html` store block                                                                                                                                            |
| **Storage-integrity verify suite** (9 CDP checks: atomicity, byte-preservation, quota rollback, touchability)                                                                                                           | PR #70                                        | `prototypes/drift/tools/verify-storage-integrity.mjs` — 9/9 green                                                                                                            |
| **Safari resize/VisualViewport fix** — rAF-coalesced canvas sizing + camera compensation so words don't jump when the address bar settles                                                                               | PR #70                                        | `drift-artifact.html` `sizeCanvases`/`scheduleCanvasSize`                                                                                                                    |
| **Orbit breathing on the animated clock** — orbits now respect stillness (was raw rAF timestamp)                                                                                                                        | PR #70                                        | `drift-artifact.html`                                                                                                                                                        |
| **Deterministic paper texture** — seeded PRNG keyed on glass+theme, so a resize never re-rolls the washi under the eye; trunk's texture density kept                                                                    | PR #70 (mechanism only)                       | `renderPaper`                                                                                                                                                                |
| **Core-dict reading-scoped glosses** — the flattened-sense defect fixed: 半月/はんつき now leads with "half a month" (not the はんげつ half-moon), 避ける likewise; frozen 2-correction list asserted by the builder    | PR #70                                        | `build_dictionary.mjs` + regenerated `dict.json` (diff = exactly those 2 entries)                                                                                            |
| **`build_corridor.py --sem-only`** — regenerate the SEM tier without the fugashi toolchain                                                                                                                              | PR #70                                        | tool; also fixed a latent corrupted edge (`海water` → 海水) the stale generated copy carried                                                                                 |
| **質問→回答 edge retype** — a reply is not a synonym of a question; now `thm`                                                                                                                                           | PR #70                                        | `sem.json` (drift source + seed list + regenerated corridor copy)                                                                                                            |
| **verify-v11 ghost-guard fix** — no spurious red when geometry manufactured no ghosts                                                                                                                                   | PR #70                                        | `prototypes/drift/tools/verify-v11.mjs`                                                                                                                                      |
| **Deploy hardening** — `node --check` on corridor.js + worker before assembly; `dictionary-worker.js` added to the Pages copy list (it would have 404'd); dict-v2 smoke + integrity gate (pin, shard counts)            | PR #70 (idea), ours                           | `.github/workflows/pages-app.yml`                                                                                                                                            |
| **Standalone carries the dictionary** — dict-v2 embedded as inert JSON nodes, parsed only when asked; duplicated body template deduplicated                                                                             | PR #70                                        | `build-standalone.mjs`; standalone is now 38.9 MB                                                                                                                            |
| **PR #67's campaign handoff doc** — historical record incl. its P0 authority-bug analysis                                                                                                                               | PR #67                                        | `docs/build-evidence/kairo-campaign/CLOUD_HANDOFF_2026-08-09.md`                                                                                                             |

## LEFT, deliberately (operator ruled: no codex design tweaks)

- **Codex's drift rebuild** — motion grammar, non-overlapping bloom layout,
  family classes, shell radii, hint timing. The trunk's drift is the felt one.
- **The word-relations _room_** and codex's shelf/thesaurus redesign — trunk's
  paper-spread 類語辞典 is a deliberate different design. The _data_ (JMdict
  xrefs/antonyms) was taken via the word sheet instead.
- **Codex's index.html title/description** — trunk keeps its own.
- **`verify-corridor.mjs` +1638 additions** — they assert codex's review
  contract model, which the trunk doesn't have.
- **Bloom-geometry probes** in codex's verify-drift-consistency — they encode
  codex's clamped layout; the trunk deliberately glides the camera instead.

## DEFERRED, with reasons (nothing lost — it all stays on the branches)

- **Codex lessons-v1** (one article-anchored lesson + 544-line verifier). The
  schema (typed evidence, explicit disposition, no implicit writes) is the
  valuable part; take it up when deciding whether article-anchored lessons
  join the trunk's generated JLPT/漢検 lanes.
- **Drift timer-churn removal** (two uncancelled `setInterval`s → event-driven
  refresh). Real battery/perf value, but it needs a careful audit of every
  path that leans on the 650 ms poll; the feel is currently approved, so this
  gets its own pass.
- **`aimWord` anti-flake helper** for verify-drift-consistency — good harness
  work; port when that suite next gets attention.
- **ts-fsrs `State` export + codex review-semantics ideas** (reload-surviving
  sessions, finite no-refill plans, no-debt legacy lists) — revisit when the
  review room is next worked on.
- **PR #67's P0 critique** ("a grade can be recorded with no response
  evidence") — applies to `packages/domain`, not the corridor SPA; read before
  hardening any FSRS surface. The doc is preserved in-repo (see above).

## Known-stale, pre-existing (not this run's doing; verified by baseline runs)

- `verify-journey.mjs`: 9 stations fail on the committed trunk too — it still
  targets `#enter-shelf-door`, removed by the 銀河 redesign. Needs a rewrite to
  walk through the galaxy chrome.
- `verify-v11.mjs`: 17/21 on the committed trunk and on this branch alike
  (same four checks; ghost-presence/chrome-keepout tuning from an earlier
  round).

## Verification of this branch (all run at 390×844)

- corridor walk **91/91** · accessibility **20/20** · drift consistency
  (fast) **45/45** · storage integrity **9/9** (new) · unit tests
  **1645/1645** · lint, typecheck, `format:check` clean
- Deep-tier walk by hand: search 安堵 (deep-only) → full senses + 安ど alt +
  credit line; 一間 shows both いっけん/ひとま homographs; 覚える on a deep
  word → review answers after reload with the index closed; corrupted store →
  read-only banner, original bytes untouched; future keys survive saves.
- Drift before/after screenshots: the visible field at the front door is
  unchanged by the `>>>` fix; the recovered half of the corpus spreads through
  the wider world instead of stacking in a hidden band.
