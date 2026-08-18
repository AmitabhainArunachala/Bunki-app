# RENKAN C2 — Rubric re-assessment against BUNKI_READING_EXCELLENCE_RUBRIC_AND_CLOSURE_SPEC_2026-08-15

**Date:** 2026-08-16
**Rubric:** `docs/operator/BUNKI_READING_EXCELLENCE_RUBRIC_AND_CLOSURE_SPEC_2026-08-15.md` (§5 scale + weights, §5.3 hard gates, §6 prior scorecard = 17/100)
**Coordinate:** branch `claude/renkan-one-push-2026-08-16`, head `25e227d` (evidence-only commit).
Product tree scored: `10c440c006bec111617c19279b81ea2e99fc7a67` (tree `115b3a0b…`) — the exact SHA of the C1 demonstration. The battery ran at `cf2f1d0` (16/16 GREEN, corridor 190/190, `battery-round3/SUMMARY.md`); `git diff cf2f1d0 10c440c` touches only docs/evidence and `tools/verify-corridor.mjs`, so the battery result transfers to the demonstrated tree; `10c440c → 25e227d` adds only the C1 evidence directory.
**Status:** Reading remains **not accepted**. This document re-scores; it does not close.

---

## 0. The evidence ceiling — read this first

Per §5.1 of the rubric: **code alone scores ≤1; screenshots or scripted-browser evidence scores ≤2; a score of 3 requires complete core behavior verified on a physical phone with persisted state.** Per §5.3 gate 10, without the complete physical-device journey the relevant dimensions cannot exceed 2.

**Nothing in the RENKAN campaign has physical-device evidence.** On-device runs are the operator's alone (decision sheet **OD-7**, standing). The strongest evidence in this campaign is the C1 demonstration: an exact-SHA, DOM-asserted, scripted headless-Chromium walk with mobile emulation — evidence level 2 by the scale's own wording ("partial happy path or screenshot evidence"). The rubric's wording nowhere permits emulated-browser evidence to reach 3.

**Therefore no dimension in this scorecard exceeds 2.** The maximum total attainable under this ceiling is **40/100** (every dimension at 2). That ceiling, not effort, is the first thing standing between this document and a higher number — and only OD-7 lifts it.

---

## 1. §5.3 hard-gate status

| Gate | Rubric wording | Status today |
| --- | --- | --- |
| 1 | "No reliable complete reader: Core reader = 0 and total cap = 30/100" | **LIFTED.** See the verbatim C1 claim below: the complete reader loop was executed end-to-end and DOM-asserted at exact SHA `10c440c…`, 85/86 assertions passing. Core reader is no longer 0 and the 30/100 cap no longer binds. |
| 2 | "No working article audio: total cap = 60/100" | **BINDS.** `rg "speechSynthesis\|new Audio\|<audio" prototypes/corridor/corridor.js` returns nothing; the C1 honesty block states "the corridor reader has NO audio implementation … no audio stage exists to walk." Total is capped at 60/100. Lift = working article audio per §7.6, gated on the TTS bake-off decision (**OD-6**). |
| 3 | "Freshness and discovery both below 2: total cap = 59/100" | **No longer engaged.** Freshness and discovery each score exactly 2 below. (The cap would be moot anyway under gate 2.) |
| 4 | "No original-source/license truth: public release is blocked" | Not blocking on truth grounds: 82/82 curated rows carry `licence` + `attribution` + `url`; the feed verifier's NC/ND and share-alike checks pass (27/27, `feed/verify-feed-report.json`). Repository licence itself remains **OD-1**. |
| 7 | "Private, unapproved … records do not count as public catalog breadth" | Applied. 42 of 82 shelf rows are pending operator word (30 `legacy` + 12 `mint` rows, all `decision: "pending"` in `docs/content/feed-review-queue.json`); approved public breadth is the ~40 previously-approved rows. |
| 10 | "Without the complete physical-device journey … the relevant dimensions cannot exceed 2" | **BINDS everywhere** (§0 above). |

The C1 claim, verbatim (`docs/build-evidence/renkan/reader-demo/10c440c006bec111617c19279b81ea2e99fc7a67/README.md`):

> On SHA `10c440c006bec111617c19279b81ea2e99fc7a67` (local static serve of `prototypes/corridor`, headless mobile Chromium 390×844), the complete reader loop — shelf → article → dials → tap ladder → quick look → full entry → 覚える capture with sentence context → tray → declared-recall review → Good grade with revlog → device-Back walk → reload-resume — v:1 export — was executed end-to-end and DOM-asserted, 85/86 assertions passing; web-verified only, no audio, no physical device.

The one failed assertion is itself recorded honestly in the walk-log: stage 15, "a door from the review answer face to the FULL article exists" — FAIL, "the ▹ door opens the sentence on its own page with its source label, but no control walks on to the full article body" (§9.5 requires sentence **and** article; only the sentence half exists).

---

## 2. Re-scored scorecard (15 dimensions, evidence ≤2 throughout)

Weighted points = score ÷ 5 × weight.

| # | Dimension | Weight | Score /5 | Weighted |
| --- | --- | ---: | ---: | ---: |
| 1 | Catalog breadth and level coverage | 5 | 2 | 2.0 |
| 2 | Freshness and publishing cadence | 8 | 2 | 3.2 |
| 3 | Discovery, navigation, and search | 10 | 2 | 4.0 |
| 4 | Personalization and rotation | 7 | 0 | 0.0 |
| 5 | Card metadata and presentation | 5 | 2 | 2.0 |
| 6 | Core reader UX | 10 | 2 | 4.0 |
| 7 | Audio and listening | 10 | 0 | 0.0 |
| 8 | Linguistic assistance | 9 | 2 | 3.6 |
| 9 | Capture and canonical SRS | 8 | 2 | 3.2 |
| 10 | Adaptive AI | 6 | 1 | 1.2 |
| 11 | Comprehension and transfer | 5 | 0 | 0.0 |
| 12 | Sharing, continuity, and discussion | 3 | 1 | 0.6 |
| 13 | Editorial quality, provenance, and rights | 5 | 2 | 2.0 |
| 14 | Offline, performance, and accessibility | 5 | 1 | 1.0 |
| 15 | Durability and engagement | 4 | 2 | 1.6 |
| | **Raw total** | **100** | | **28.4 / 100** |

**28.4/100 = 2.84/10.** Caps in force: evidence ceiling 40/100 (OD-7), audio gate 60/100 (OD-6). The honest total sits below both, so no cap truncates the number — the score is what the evidence earns.

### Per-dimension justifications

**1. Catalog breadth and level coverage — 2/5 (2.0).**
82 curated rows (verifier-checked "82 = 70 + 12") plus 682 archive rows exist as data, and the regraded difficulty signals (R3-E `regrade-jlpt` across all 764 bodies, `cf2f1d0`) make the level claims truthful; the cold-open shelf with its sections was screenshotted and DOM-asserted at `10c440c` (C1 stage 1). But gate 7 strips the 42 pending rows (30 legacy + 12 検収前 mints, all `pending` in the queue), and the band counts in `feed/run-001.json` show real level deserts (初級前半 2, 上級後半 2 before minting). Approved breadth is materially unchanged since the 17/100 audit; the score stays 2, which is also the evidence ceiling.

**2. Freshness and publishing cadence — 2/5 (3.2).**
A real, deterministic feed loop now exists and ran end-to-end twice with committed receipts: `feed_ingest.py` (`a83b2b9`), two consecutive runs (`feed/run-001.json`, `run-002.json`), byte-identical determinism proof (`determinism-check.json`), 27/27 verifier checks, 12 minted 検収前 candidates with `addedAt: 2026-08-16` visible as data and marked 検収前 on the demonstrated shelf (C1 stage 1 assertion). The honest gaps: zero mints are operator-approved (OD-3), `addedAt` is not yet rendered on the card, there is no Fresh lane, no ongoing cadence has been established, and the live fetch degraded to committed archive stock (egress 403 recorded honestly in `run-001.json`) — so "fresh" today means newly-added-with-date, not newly published. That is a demonstrated partial happy path: 2, up from 0.

**3. Discovery, navigation, and search — 2/5 (4.0).**
The fixed flat list is gone: the shelf renders quiet provenance-named sections (ニュース / 青空文庫 / 段階別読み物 / 随筆 / glossary / classics — `shelfSection()`, landed `83b16c4`), and the C1 walk demonstrated stable Back everywhere: back-restores-shelf-scroll (stage 2), device-Back walking the app's own stack one level at a time via the generalized sentinel (stage 18, R3-B `e0018d7`), nav-search state surviving round-trips, archive scroll restored. The honest gap is large: the prominent search is still a **dictionary** search (`searchResults()` scores word/kanji entries only — verified in source at this SHA; rubric omission 7 stands), and there are no lanes, categories-as-taxonomy, series, related-content, or filters. Demonstrated-at-SHA navigation truth earns 2; the missing discovery surface is why 2 is also all it earns.

**4. Personalization and rotation — 0/5 (0.0).**
No learner-edge ranking, no exposure suppression, no rotation law, no `Surprise me` — `rg "For You|Surprise me"` still returns nothing in `corridor.js`. Nothing was built and nothing is claimed. 0, unchanged.

**5. Card metadata and presentation — 2/5 (2.0).**
Every one of the 82 curated rows now carries `titleEn` **as data** with `titleEnSource` provenance (`ca14e09`), all 682 archive rows carry `titleEn` (`c17bd76`), all rows carry licence/attribution/source/`rubySource`, the difficulty subtitle varies truthfully after the JLPT kana-matching fix (`d895a16`), the `None` date render is dead, and 検収前 truth labels appear on unapproved cards (C1 stage 1). Still absent, exactly as in the old audit: category/topic (0/82), audio (0), image (0), reading-time (0), and dates on only 19/82 (17 ISO). Genuinely richer inside the same score: 2.

**6. Core reader UX — 2/5 (4.0).**
This is the gate-1 lift. C1 demonstrated at exact SHA: full-body open with exact index-title match for an approved article (715 tokens, stage 2) and the flagship 検収前 reading with provenance carried into the reader (703 tokens, stage 3); all three dials proven on the DOM (図書→としょ in all-kana; 263 rt elements toggling つねに/触れて; 299 phrase groups in 文節); scroll restore ≤20 px after the entry sheet (1559px→1559px) and after reload (stage 19, same sentence); 320×568 with zero horizontal overflow. Not demonstrated: translation modes, related/next, error/offline/rights-blocked states, immersive mode — and the tap-ladder INFO finding (overlapping 44px hit regions on one-kanji tokens) is a real defect recorded in the log. Scripted-browser evidence caps this at 2; 2 is earned.

**7. Audio and listening — 0/5 (0.0).**
No implementation exists (source-verified; C1 honesty block explicit). The 澄/語/話 proposal (`proposals/TTS_VOICES_PROPOSAL.md`) is a document, not audio. 0, unchanged; this is what holds gate 2's 60-cap in place, and it moves only on OD-6.

**8. Linguistic assistance — 2/5 (3.6).**
The full assistance ladder was demonstrated at SHA: progressive tap ladder furigana→gloss→plain (stage 7), long-press quick look with reading/gloss/覚 seal (stage 8), full dictionary entry sheet (stage 9). Beneath the surface, R3-A made the readings **true**: the 31-entry reading-override lexicon applied at tokenization time, 303 readings re-minted across 25 bodies after the theonym scan (最高神/唯一神, classical 都=みやこ), `check_suspect_readings.py` committed with 0 open rows, native-readings verifier 44→50 with a DOM ruby probe (`d54c37c`). The numeric score matches the old 2, but the old 2 rested on historical screenshots of possibly-wrong furigana; this 2 rests on current-SHA demonstration of verified readings. No pitch accent, no sentence audio, and the two open reading decisions (OD-17 産巣日, OD-18 re-tokenization) are named honestly.

**9. Capture and canonical SRS — 2/5 (3.2).**
C1 stages 11–17 demonstrated the loop the old audit could not: top-right 覚える capturing the word **with its sentence** (`ctx {p,i,scope}`, three scopes proven to commit), tray count, declared-recall review (思い出した/まだ gating the reveal, まだ forcing Again — T-06, `abedb40`), one 12-field revlog row per grade with monotonic instants, FSRS state + day stats persisted, and the `v:1` export envelope key-asserted. Landed substrate: monotonic clamp + fuzz-off ADR-003 (`98c0eab`), un-memorize with append-only revlog (`78bfaad`), validated learner FSRS params with the full optimizer round-trip on a real-shaped export (`269dfb5`, `optimizer-roundtrip/`), P0-4 sweep 19→5 residual callers. Honest gaps: the review answer face reaches the sentence but not the article (the walk's one FAIL), and "one learner state" is parity-by-contract awaiting ADR-004 ratification (OD-9), not literal unification. 1→2.

**10. Adaptive AI — 1/5 (1.2).**
What landed is AI **honesty infrastructure**, not adaptive AI: 10s abort, provider/model seam, append-only IndexedDB archive across all six surfaces, render-from-durable-transcript, `verify-corridor-ai.mjs` 19/19 (`bdddc28`). That is real, verifier-backed substrate and worth 1 (source/verifier evidence). But the dimension is defined by edge detection, cited explanations, and practice synthesis — none of which exist, so this cannot honestly reach 2. 0→1.

**11. Comprehension and transfer — 0/5 (0.0).**
No per-article questions, explanations, or evidence spans exist for any reading (rubric omission 17 untouched). Declared-recall grading is SRS honesty, not comprehension assessment. 0, unchanged.

**12. Sharing, continuity, and discussion — 1/5 (0.6).**
The continuity half moved: exact resume after reload (≤20 px, same sentence), device-Back discipline, and a manual `v:1` export door were demonstrated at SHA. The sharing and discussion halves are wholly absent — no deep links, no share sheet, no sentence-anchored threads (§7.10 untouched). A 1 for demonstrated continuity inside a mostly-absent dimension; 0→1.

**13. Editorial quality, provenance, and rights — 2/5 (2.0).**
Provenance truth is now strong and machine-checked: licence/attribution/url on 82/82, NC/ND-never-enters and share-alike-confined verified (27/27), `titleEnSource` on every row, 検収前 labels carried into the reader itself (C1 stage 3), one unified operator decision file (44 rows), cull proposals with named reasons (OD-16), and the campaign surfaced its own editorial problems instead of hiding them (OD-15 sensitive-news adjacency, OD-17/18 reading decisions). The gap that pins the score: **zero human approvals** — 検収前 everywhere is honest labeling of an unapproved corpus (OD-2/OD-3). 2, unchanged in number, better in substance.

**14. Offline, performance, and accessibility — 1/5 (1.0).**
Accessibility genuinely progressed with evidence: corridor-a11y gate green at `cf2f1d0`, nested-button repair, hidden layers untabbable (`e0018d7`), 44px hit-region fixes (`e8b0ccd`), 320×568 no-overflow screenshots, zero console errors and zero failed requests across the whole C1 walk. But the dimension leads with **offline**, which does not exist in any form (no downloads, no cache-health surface, no offline states walked), and the hunt's full-render 100–200 ms long-task finding remains open. A11y alone would be 2; the aggregate honestly stays 1.

**15. Durability and engagement — 2/5 (1.6).**
Demonstrated at SHA: the reading position survives reload (900 ms-debounced bookmark, shelf shows 途中, restore ≤20 px and same sentence — stage 19), the graded card's FSRS state, revlog, and day stats persist and were re-read from the store (stage 16), the export envelope carries all learner-state keys, and the storage-integrity gate guards regressions. Cross-device and reinstall/restore behavior (§5.3 gate 6's authenticated-user clause) remain undemonstrated, and continuity lanes (Continue/history) don't exist. 1→2.

---

## 3. Delta table — old 17/100 (rubric §6) vs. today

| Dimension | Old /5 | Old wtd | New /5 | New wtd | Δ wtd | What actually changed |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Catalog breadth | 2 | 2.0 | 2 | 2.0 | 0.0 | +12 pending mints, level truth regraded; approved breadth unchanged (gate 7) |
| Freshness | 0 | 0.0 | 2 | 3.2 | **+3.2** | Deterministic feed loop, 2 committed runs, verifier, queue; approvals pending (OD-3) |
| Discovery/search | 1 | 2.0 | 2 | 4.0 | **+2.0** | Shelf sections, Back/resume/sentinel demonstrated; search still dictionary-only |
| Personalization/rotation | 0 | 0.0 | 0 | 0.0 | 0.0 | Nothing built; nothing claimed |
| Metadata/presentation | 2 | 2.0 | 2 | 2.0 | 0.0 | titleEn as data 82+682, truthful difficulty, 検収前 labels; still no category/audio/image/duration |
| Core reader | 1 | 2.0 | 2 | 4.0 | **+2.0** | End-to-end demonstration at exact SHA; gate-1 cap lifted |
| Audio/listening | 0 | 0.0 | 0 | 0.0 | 0.0 | Still no implementation (OD-6) |
| Linguistic assistance | 2 | 3.6 | 2 | 3.6 | 0.0 | Same number, transformed evidence: readings verified true (R3-A), ladder demonstrated at SHA |
| Capture/canonical SRS | 1 | 1.6 | 2 | 3.2 | **+1.6** | Full capture→review→revlog→export loop demonstrated; T-06, optimizer round-trip |
| Adaptive AI | 0 | 0.0 | 1 | 1.2 | +1.2 | AI runtime honesty (abort/persistence/seam, 19/19); no edge loop yet |
| Comprehension/transfer | 0 | 0.0 | 0 | 0.0 | 0.0 | No question system |
| Sharing/continuity | 0 | 0.0 | 1 | 0.6 | +0.6 | Resume + export demonstrated; sharing/discussion absent |
| Editorial/provenance | 2 | 2.0 | 2 | 2.0 | 0.0 | Machine-checked licence truth, one decision file; zero approvals (OD-2/3) |
| Offline/perf/a11y | 1 | 1.0 | 1 | 1.0 | 0.0 | A11y verified green; offline still nonexistent, long-task finding open |
| Durability/engagement | 1 | 0.8 | 2 | 1.6 | +0.8 | Reload-resume + persisted SRS state demonstrated; no cross-device proof |
| **Total** | | **17.0** | | **28.4** | **+11.4** | |

Biggest movers: **Freshness +3.2**, **Discovery +2.0** and **Core reader +2.0** (the latter also lifting the 30/100 hard cap — structurally the largest change in the assessment), then **Capture/SRS +1.6**.

---

## 4. Refreshed omissions ledger (the 27 items of rubric §2)

**Closed (with landing):**

- **#21** archive bilingual — 682 archive + 82 curated rows all carry `titleEn` (`c17bd76`, `ca14e09`); verified against the data files this session.
- **#26** benchmark before grading — the rubric doc's own §4 completed the Todaii/Satori/wider research; caveat: R0's matched-viewport live captures of competitors were never taken.
- **#27** over-weighting "70" — closed as practice: this campaign reports 検収前 marks, pending-approval counts, and gate-7-stripped breadth; no count is used as a completion proxy anywhere in the RENKAN evidence.

**Partially closed (substantial landing, honest remainder):**

- **#2** fresh screenshot itinerary at exact SHA — C1 delivered a 20-stage, 21-screenshot, DOM-asserted itinerary bound to `10c440c` at 390×844 + 320×568. Remainder: it binds a **local** serve, not a deployed URL↔SHA receipt, and §9.8's error/offline/VoiceOver/large-viewport items are unwalked.
- **#3** every card opens its body — two representative cards proven end-to-end (approved + flagship 検収前); native-readings browser verification probes ruby rendering; "every card" not proven.
- **#4** Back/resume/reload — Back, reload, and resume demonstrated (stages 2, 18, 19); error, offline, and cross-device behavior remain unproven.
- **#5** reading home — the fixed list became provenance-named sections with a 途中 marker; the §7.1 lane architecture does not exist.
- **#6** categories/series/journeys — sections only; no taxonomy, series, or journeys.
- **#8** freshness pipeline — the pipeline exists and ran twice with receipts; visible cadence and approved output do not yet exist (OD-3, OD-15).
- **#15** capture → canonical log/FSRS — demonstrated end-to-end web-only; obslog bridges landed (`db46914`, `f757944`); parity awaits ADR-004 ratification (**OD-9**).
- **#16** provenance in saved items — article/sentence/span/scope preserved (`ctx {p,i,scope}` asserted); no audio timestamp (no audio exists) and sense-selection preservation not asserted.
- **#22** catalog metadata — titleEn/licence/attribution/rubySource complete; category/topic/audio/image/duration still absent; `addedAt` on 12 rows, dates on 19/82.
- **#25** restore after reinstall — the manual `v:1` export/import envelope exists and was asserted; promised cloud/backup restoration remains unverified.

**Open (unchanged):**

- **#7** article search — the shelf search is still a dictionary search (source-verified at this SHA).
- **#9** exposure-aware rotation / Surprise me.
- **#10** Continue/Fresh/For-your-edge/Saved/History lanes.
- **#13** playback features (moot until audio exists).
- **#17** comprehension questions with evidence spans.
- **#18** AI follow-up synthesis from the learner graph.
- **#19** explainable recommendation engine.
- **#23** sharing, related readings, discussion, tutor thread.
- **#24** offline downloads and cache health.

**Operator-gated (decision sheet, `docs/build-evidence/renkan/DECISION_SHEET.md`):**

- **#1** physical-iPhone audit → **OD-7** (standing; on-device runs are the operator's).
- **#11, #12, #14** article audio, three voices, native bake-off → **OD-6** (proposal ready: `proposals/TTS_VOICES_PROPOSAL.md`).
- **#20** editorial review of the 30 drafts → **OD-2** (30 `legacy` rows ready in `docs/content/feed-review-queue.json`); the standing approval flow for new mints → **OD-3** (12 `mint` + 2 `cull` rows, applied via `tools/feed_apply_review.py`). Related editorial calls: **OD-15** (auto-selection bar), **OD-16** (wikinews:1483 cull-or-repair), **OD-17/OD-18** (reading canon).

---

## 5. Terminal statement

**The score that stands is 28.4/100 (2.84/10), up from 17/100.** Every point of it is web-verified at exact SHA `10c440c006bec111617c19279b81ea2e99fc7a67` or machine-checked in the committed data; none of it is physical-device verified, and none of it claims to be.

The caps that still govern it:

1. **Evidence ceiling 40/100** — no dimension may exceed 2 without the physical-device journey (§5.1 + §5.3 gate 10). **Lift: OD-7** — the operator runs the discover→open→read→inspect→capture→review→resume journey on a physical iPhone at a pinned SHA. This is the only path to any score above 40.
2. **Audio gate 60/100** (§5.3 gate 2) — the reader has no audio at all. **Lift: OD-6** — the operator's word on the TTS voices proposal, then the §7.6 implementation and the native-listener bake-off. Until then, no total above 60 is reachable regardless of device evidence.
3. **Approval truth** (gates 7/8 pressure on catalog, freshness, and editorial) — 42 of 82 shelf rows and all 12 fresh mints are 検収前, pending. **Lift: OD-2/OD-3** — the operator's approve/reject word on the 44-row queue, applied through `feed_apply_review.py`. This converts labeled candidates into countable breadth and a truthful fresh cadence.

Reading remains unaccepted, exactly as the closure rule (§10) demands: the loop has now been *demonstrated*, once, in an emulated browser, with no audio and no approvals. The next honest point on this scorecard comes from an operator decision, not from more code.
