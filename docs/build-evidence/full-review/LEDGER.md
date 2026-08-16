# 仕上げ検分 — the full-instrument review ledger (2026-08-15)

Eight lanes walked: drift (galaxy), shelf-reader, dictionary, writing-room, srs-lists, articles, srs-audit, ai-audit. All evidence files referenced below live under `/tmp/claude-0/-home-user-Bunki-app/43eb8fae-6ad6-5ad8-8e60-67d214b0e95a/scratchpad/full-review/`.

## 1. Verdict

The instrument plays, but it is not yet tuned, and two strings are not connected to the soundboard at all. The corridor's surfaces are individually strong: the galaxy front door loads clean with zero console errors across five runs; the reader's tap ladder, furigana dials, and long-press dictionary work exactly as designed; the dictionary goes arbitrarily deep (word → kanji → radical → catalog → stroke room) and comes back; the FSRS review loop is a real, honest scheduler with learning steps, undo, revocation rows, and state that survives reload; and six live AI features run against a BYO key without ever touching the scheduler. But the review found 2 P0 defects, 22 P1s, 27 P2s, and 14 polish items — 65 total. The P0s are both SRS wiring breaks: the default entry surface (the drift) collects known/unknown judgments into a store nothing ever reads, and the dojo's kanji mode writes orphaned FSRS state while silently eating the daily new-card budget. Beyond those, the recurring themes are: chrome that steals or hides interactions (galaxy taps razing constellations, the `?entry=shelf` debug strip swallowing the reveal button, grade seals below the fold); capture that is one-way and buried (覚える is never top-right, never removable, and absent from most screens); 30 finished articles stranded on unmerged branches with no PR; zero English titles in any of 764 articles; and AI memory that is lossy by design against an operator directive that says "not a word is lost." Nothing here is unfixable; most fixes are localized and the reports name the exact lines.

## 2. Defects

### P0 (2)

| Surface | Finding | Evidence |
|---|---|---|
| Drift (default entry) | Flick known/unknown judgments persist only to the separate `bunki-drift-v1` store; corridor.js never reads it — days of grading never reach S.taken, obslog, or FSRS. Only manual 覚える via an entry sheet bridges. | srs-audit: drift-layer.js:672, 1704-1724; corridor.js STORE_KNOWN_KEYS 546-563 (no drift keys) |
| Dojo kanji mode | focusPool('kanji') grades never-taken kanji through the real grade handler: FSRS state + revlog rows are written for cards srsDueItems (S.taken-only) can never surface again, and each first grade consumes one of the 20 daily new-card slots. | srs-audit: corridor.js:6193-6204, 6017-6047, 5661-5673 |

### P1 (22)

| Surface | Finding | Evidence |
|---|---|---|
| Galaxy chrome | Taps on the torii, world seal, nav scrim, and corner bubbles leak through to the drift's open-water handler and raze the learner's constellation (bloom 1+8 → 0+0 after a torii tap). Chrome exemption list omits every fused ginga element. | drift: probe3.mjs; 55-bloom-after-navclose.png; drift-layer.js ~2303 |
| Galaxy dive | No visible way out of a dive: the '水にふれると戻る' hint is display:none under body.ginga, the nav back arrow is disabled (checks corridor stack, not drift depth). Escape currently works only via defect #1's tap leak. | drift: walk-drift3.mjs; 53-in-dive.png, 54-nav-in-dive.png; corridor.css 306-311, corridor.js:10439 |
| Galaxy nav search | Results panel collapses to the 71px input width — readings render one kana per line, glosses truncate to a letter. | drift: 51-search.png; corridor.css .nav-search-results ~556 |
| Shelf corpus | Wikinews 世界自然遺産 article text corrupted: country names (wiki-links) stripped, leaving dangling の particles; likely lost を in 知床半島 clause. Only file affected of 26 scanned. | shelf-reader: 10-reader-bottom.png; data/articles/wikinews-1403.json |
| Dictionary homographs | Homograph rows REPLACE the stack top instead of pushing; ← 戻る after switching 年とし→年ねん closes the whole sheet back to the reader — the entry you were reading is gone. | dictionary: run3 log; 04-homograph-dest.png; corridor.js ~7591-7599 |
| Dictionary sheets | Back from any deeper page rerenders the parent at scrollTop 0 — reading position in a ~2,700px entry is lost every time. | dictionary: run5 log (632→0); 38-back-to-word-entry.png |
| Writing room | Awake field ignores the operator's corner anatomy: worlds, readings, and numbers all in one bottom-center stack; nothing top-right, nothing bottom-left. | writing-room: walk-out.log AWAKE dump; 02-awake.png; corridor.js:8372-8421 |
| Writing room | No speed control in the quiet room, yet a hidden legacy S.strokeSlow preference still silently applies to every rewrite with no way to see or undo it. | writing-room: walk-out.log speedControl:null; corridor.js 8591 vs 9252 |
| SRS capture | 覚える is never top-right: absent from shelf/reader/mini/grammar/particle/stroke screens, and on word/kanji sheets it sits ~2,000px deep at the bottom of the flow. Minimum capture path is 4 steps ending 2.5 screens below the fold. | srs-lists: srs-lists-run.log affordance census; 03-mini.png, 04-word-sheet.png |
| SRS review | Grade hanko row lands below the fold on cards with context/examples (row top 1137 in an 844px viewport) — a first-timer sees the answer and no way to grade, with no scroll cue. | srs-lists: probe-gradefold.mjs; 16 vs 17 screenshots |
| SRS capture | Capture is a one-way door: no un-memorize (takeButton hard-returns when taken), no list delete or rename anywhere. A mis-tap pollutes the deck forever short of hand-editing exported JSON. | srs-lists: corridor.js:5426, 3226-3274, 5502-5538 |
| Whole app | `?entry=shelf` — the documented navigation link — summons the operator debug strip on every surface because `entry` is a variant key; the fixed strip swallows taps on the in-flow reveal button (60s Playwright intercept timeout). Filed independently by three lanes. | srs-lists/dictionary/shelf-reader: corridor.js:1383-1391; corridor.css:1490; 34-variants-bar.png |
| Articles | 30 finished Bunki originals (10 N3 + 10 N2 + 10 N1) stranded on two unmerged codex branches with NO pull request — shelf stays at 40 instead of 70. | articles: git log HEAD..origin/codex/native-readings-20260812; 0 PR search hits |
| Articles | Even the donor branch's standalone single-file build lacks the 30 (grep for new ids = 0; commit concedes 'standalone regeneration pending transport'). | articles: git show …:corridor-standalone.html |
| SRS engine | Revlog is built 'for the FSRS optimizer' but nothing anywhere reads it — no optimizer, no analytics, no replay. Parameters stay population defaults forever. | srs-audit: corridor.js:5627/6133 writes, zero reads |
| App planner | Session time budget is hardcoded at 12 minutes; the 'time the learner chose' has no UI anywhere. | srs-audit: session-screen.tsx:83-84; session.tsx:44 |
| App evidence | Lookup-friction channel (T-07) fires only on the scripted golden route; real lookups record nothing, so the friction ledger is empty for every real learner. | srs-audit: grep recordLookupFriction — golden-source only |
| App contracts | Two divergent contract-creation lineages: validated activateLearn reachable only from the golden route; ordinary sessions use the 'compatibility' mint with different contract-id shapes. | srs-audit: session-loop.ts:506-524 vs golden-source.ts:219-220 |
| Corridor scheduler | Corridor enables FSRS fuzz against the domain determinism pin, and the opt-out flag S.stats.fuzzOff has no UI and no writer anywhere. | srs-audit: corridor.js:1529-1535; fsrs-pin.ts:90 |
| AI memory | 'Not a word is lost' is violated on every AI surface: chat capped at 24 turns (turn 25 destroys turn 1), and word-tutor / examples / coach / quiz persist nothing at all. | ai-audit: corridor.js:652, 505, 7078-7158 |
| AI memory | No graph memory exists in the repo: flat {role,text} pairs, no IDs/timestamps/model metadata, no edges to the vocab/kanji/grammar each exchange demonstrably touched at call time. Learner model = one scalar (modal JLPT tag). | ai-audit: corridor.js:503, 7031-7042 |
| AI transport | Deployed AI calls have no timeout or abort — a stalled request leaves a dead 考え中… state until the browser socket dies. The engineered 10s-abort runtime in @bunki/ai serves zero deployed traffic. | ai-audit: corridor.js:7043-7068 vs packages/ai/src/runtime.ts:77 |

### P2 (27)

- **Galaxy → tutor crumb/back** — 先生 from the drift claims 'bookshelf › tutor' and back lands on the bookshelf the user never visited (dojo gets it right). *drift: walk-drift3.mjs; corridor.js:10549, ~1813*
- **Galaxy bloom ring** — satellite ring ignores the 390px viewport; edge satellites clipped to slivers or fully offscreen (救済 at x=-37). *drift: 02-after-tap1.png, 21-sat-promoted.png*
- **Galaxy nav search input** — placeholder truncated to 'searc' at 71px. *drift: 08-nav-open.png*
- **Reader long-press** — release click can land on the 全項目 button that spawns under the finger, skipping the mini entirely. *shelf-reader: debug-lp2.mjs*
- **Reader token-actions pill** — pops over the next line of prose after every ordinary tap; duplicates the long-press mini. Also fires simultaneously WITH the mini on long-press (two 全項目 buttons at once). *shelf-reader 13-mini.png; dictionary 02-mini.png*
- **すべて仮名 dial** — converts katakana loanwords/proper nouns to hiragana (みなみあふりか…), misteaching standard orthography. *shelf-reader: 07-all-kana.png*
- **Tray back** — back from the 覚 lists tray abandons the article mid-read and lands on the shelf. *shelf-reader: walk-out.txt; corridor.js ~10600*
- **Nested buttons** — details-toggle `<button>` inside shelf-item `<button>`: invalid HTML, unreachable for AT/keyboard. *shelf-reader: corridor.js:2368-2410*
- **Entry footer** — internal scheduler slug 'bunki-fsrs6-r090-defaults-v1' and dev label 'blanked' render in every word/kanji entry. *dictionary: 05-sheet-bottom.png; corridor.js:6681*
- **Sheet discoverability** — 用例 eyebrow never says hold opens the dictionary; 覚える ✓ is silently un-undoable from the entry. *dictionary: run3/run4 logs; corridor.js:5425*
- **World-stone labels** — 8px names in the writing room, 神奈川沖浪裏 ellipsizes; decoration, not text, on a real phone. *writing-room: 02-awake.png; corridor.css:3613*
- **List rows** — named-list rows render an empty grey kind pill (kind/kindEn stripped at store time). *srs-lists: 08-tray-lists.png; corridor.js:5518/3255*
- **List creation** — only possible from inside an entry sheet, via a native window.prompt with silent no-op on dupe/empty; the lists surface itself has no create affordance. *srs-lists: corridor.js:5524-5535*
- **Grammar/particle capture** — no 覚える exists for grammar or particle entries; grammar patterns can never enter the SRS. *srs-lists: corridor.js:5195-5218, 5355-5360*
- **Article schema** — 0 of 764 articles carry an English title; there is no titleEn key on any branch — a schema gap, not per-file omissions. *articles: JSONL fields census*
- **Branch divergence** — raw and re-land article branches have diverged; integrate from 307a4dd (non-raw) only. *articles: merge-base check*
- **New/leech knobs** — NEW_PER_DAY=20 and LEECH_LAPSES=6 are constants with no settings surface. *srs-audit: corridor.js:5648, 5655*
- **App uncertainty + capture surfaces** — uncertainty dimension non-durable (WP05-D2); kanji/drift screens in apps/app have zero store.execute — encounter surfaces from which nothing enters the loop. *srs-audit: store.ts:104-165*
- **Obslog** — richly written 'diagnosis backbone' consumed only by probe dedup; no routing or difficulty signal reads it. *srs-audit: corridor.js:6419-6421*
- **Due-queue order** — corridor due queue is capture-ordered, not overdueness-ordered; the domain planner's sort is never used. *srs-audit: corridor.js:5661-5673 vs plan.ts:259*
- **Two FSRS systems** — corridor's vendored engine bypasses the entire domain kernel (gate, T-06, determinism); migration of a corridor learner record is unwritten. *srs-audit: PR70_RECONCILIATION_2026-08-15.md*
- **Two AI stacks** — @bunki/ai's envelopes/ceilings/labels/telemetry serve zero deployed traffic; the deployed corridor bypasses every proven invariant. *ai-audit: pages-app.yml:52-63*
- **Provider lock-in** — deployed AI hardcodes api.anthropic.com + model 'claude-opus-5', no override; conflicts with 'no matter the model provider'. *ai-audit: corridor.js:7044, 7053*
- **apps/app AI path** — fallback-only (4 fixture words), live-call gate never exercised (OPEN in README). *ai-audit: packages/ai/README.md:100-105*
- **Tray messaging** *(shelf-reader also filed the variants strip here — deduped into the P1 above)*
- **Glossary cross-refs** — see polish; promoted items only where filed as P2 by the lane.
- *(Count note: the `?entry=shelf` strip was filed by 3 lanes at P2/P2/P1; it is carried once, as P1, above.)*

### Polish (14)

- Galaxy front door has no first-touch cue at all (hint deliberately hidden; consider a one-time show). *drift: 01-front-door.png*
- Glossary entries show dead '(No.39)'-style cross-references. *shelf-reader: 22-article-c-top.png*
- Shelf ordering splits categories into disconnected runs, no section headers. *shelf-reader: walk-out.txt*
- Ten one-sentence glossary defs billed as part of '40 real texts'. *shelf-reader*
- Stale 4-stage gesture comment vs shipped 3-stage default; lowercase English 'sentence' crumb. *dictionary: corridor.js:6903; 22-sentence-page.png*
- Living-ink sheet's feathered edge reads as a pale disc (verify on real GPU — SwiftShader caveat). *writing-room: 01/06 screenshots*
- Sleeping room back button carries an English sub-caption — a touch wordier than 'a faint 戻る'. *writing-room*
- Tray shows disabled 'nothing due yet' directly above 'today 2'. *srs-lists: 15-after-reload-tray.png*
- Rest/wake ⏸ is a ~36px target on a row whose whole surface navigates. *srs-lists: 08-tray-lists.png*
- Article integration also needs the provenance sidecars (JSONL + editorial.json + verify tools + evidence dir), not just the 30 bodies. *articles*
- Drift placement is a hand-set dial; the promised SRS-driven placement is a stub hint string. *srs-audit: drift-layer.js:1964*
- Dojo 'due' refill regrades the same pool within one block, mutating long-term schedules while claiming it doesn't. *srs-audit: corridor.js:6206, 6154*
- Tutor context window is 8 turns; a mid-quiz refresh discards the quiz. *ai-audit: corridor.js:3711, 505*
- BYO key in localStorage, browser-direct with the dangerous-direct header — accepted tradeoff, keep visible. *ai-audit: corridor.js:7022, 7050*

## 3. SRS wiring map and its gaps

**Production app (apps/app + packages/domain)** — event-sourced and gate-mediated: capture → Keep → explicit promote-to-learn (the only promoter) → session start with frozen plan → grades minted through the evidence gate → sealed batches → durable log → replay → admitToScheduler → FSRS-6 memory state. The kernel discipline is genuinely good: single ts-fsrs import (lint-enforced), pinned parameters with drift detection, fuzz off, 8-dp determinism rounding, reveal-forces-again (T-06), closed rejection-reason list, pure bounded planner.

**Corridor prototype** — direct-mutation, own vendored engine, localStorage `kairo-corridor-v1`: 覚える / lane batch / lesson mint / probe miss all → S.taken; srsDueItems (due + 20/day new) → zen review with learning steps, undo + revocation rows, leech surfacing, per-list review, context cloze, forecast + 7-day trace, export/import, quarantine-on-unreadable.

**The six disconnects (the headline finding):**
1. **Drift swipes → `bunki-drift-v1` → dead end.** The default entry surface's grades reach nothing (P0).
2. **Dojo kanji drills → orphaned S.srs writes** for never-taken items, unreachable forever, consuming the daily new cap (P0).
3. **Revlog → no consumer.** Built 'for the optimizer'; no optimizer, analytics, or replay exists.
4. **Obslog → probe dedup only.** The promised routing/diagnosis layer is absent.
5. **apps/app gaps:** planner budget has no UI; activateLearn and recordLookupFriction reachable only from the golden route; uncertainty marks non-durable; kanji/drift screens can't capture.
6. **Two schedulers sharing parameters but not semantics:** corridor fuzz-on vs kernel fuzz-off pin; no gate on corridor grades; learner-record migration explicitly unwritten (PR70 handoff).

## 4. Article census

**On HEAD (`prototypes/corridor/data/articles/`):** 40 shelf bodies + 694 archive bodies = 734 committed. By kind: 8 bunki-essay, 11 bunki-graded, 3 aozora, 5 top-level wikinews, 10 yasashii glossary, 3 real-*; archive/ = 694 wikinews. Wiring is complete and honest: index.json (40) fetched at boot → D.passages; bodies lazy-loaded per file; archive-index.json (694) lazily merged in the 新聞アーカイブ view; nothing hardcoded.

**The missing ~30:** exactly 30 Bunki originals (10 graded N3 + 10 essay N2 + 10 essay N1, the zoka-sanjin set) exist ONLY on `origin/codex/native-readings-raw-20260812` (75f943a) and `origin/codex/native-readings-20260812` (307a4dd re-land). Neither is an ancestor of HEAD; **no PR exists for either**. The branches carry full mint quality: text, tokens, paras, grading signals, a 70-entry index.json, provenance sidecars (`docs/content/bunki-originals-zoka-sanjin.jsonl` + `.editorial.json`), verify tools, and evidence. Integration = copy 30 bodies + merge index 40→70 + **regenerate the standalone bundle (not done even on the donor branch)** + bring sidecars/tools + open a PR. Source from 307a4dd; the raw branch has diverged.

**Title-field reality:** the schema has exactly one title field, Japanese only. **0 of 764 articles** (40 + 694 + 30) have an English title on any branch; no titleEn/en key exists anywhere. English in the UI comes solely from the chrome gloss layer. Bilingual titles are a schema + pipeline change, not a data fix. (One lane noted the shelf DOES show English titles today — via a hardcoded TITLES_EN map in the UI for the 40 shelf cards, not from article data; the archive and the 30 new articles have no such coverage.)

## 5. AI capability map

**Live (deployed corridor, BYO key):** six features, all through one 25-line `aiConverse` fetch — word-sheet tutor, graded example generator, tutor chat, 5-question JSON quiz from the learner's own list, post-review coach, custom leveled reading room with ruby + dictionary doors. All defensively parsed, all degrading to one quiet bilingual line, and none EVER writes S.srs — the constitutional law holds everywhere. Without a key the features are simply absent: **no fallback content ships anywhere learners can reach.**

**Fixture (undeployed):** @bunki/ai + apps/app candidate slice — strict zod envelopes with ceilings, 10s abort runtime, fail-closed consent, labeled fallbacks for exactly 4 fixture words, content-free telemetry, compile-time evidence boundary. Well-tested, serving zero production traffic; its live-call gate has never been exercised (OPEN in README pending an operator key + budget cap).

**Missing:** durable conversation memory (5 of 6 surfaces persist nothing; chat capped at 24 turns); any graph structure (no per-turn ids/timestamps/model metadata, no edges to entities the callers already know at call time); model-agnosticism in the deployed path (hardcoded provider + model id); timeout/abort in the deployed path; the always-on multi-dimensional learner model (today: one scalar, modal JLPT tag); cross-conversation matching. The ai-audit notes name the shortest path: intercept at the aiConverse/aiAsk choke point, append-only obslog-style archive (IndexedDB), edges at write time, provider port with abort, then generate cards/plans from the graph through the existing accept → S.taken → FSRS mint path.

## 6. What the operator asked for vs what exists today

| Directive point | Status | Reality |
|---|---|---|
| Artistic wake symbol (writing room) | **MET** | Sleeping room shows only a faint 戻る and a faint ⋯ (exactly 44×44, opacity 0.36); ⋯ wakes the field, Esc sleeps it, focus management correct. |
| Worlds top-right | **NOT MET** | All ten world stones sit in a 4-column grid at the bottom-center stack; the top-right seal is display:none in minimal mode. Placement drift, not breakage. |
| Numbers bottom-right | **NOT MET** | 筆順の番号 is a full-width 350×44 bottom-center pill. The toggle itself works perfectly (per-stroke markers, live status, clean off). |
| Speed bottom-left | **MISSING** | No speed control exists in the minimal room at all — and a hidden legacy slow preference still silently applies (P1). |
| Readings underneath | **PARTIAL** | 音読み/訓読み render correctly 2-up, with right values — but inside the wrong anatomy (mid-stack, not per spec). |
| 覚える on every screen | **NOT MET** | Census: shelf NO · reader NO · mini NO · word/kanji/radical/idiom sheets YES-but-bottom (~2,000px deep) · grammar/particle/sentence/catalog/stroke NO. Never top-right anywhere; capture also irreversible (P1s). |
| SRS fully wired | **NOT MET** | The loop that exists is honest and survives reload, but: drift judgments dead-end (P0), dojo kanji orphans (P0), revlog/obslog unconsumed, capture-ordered queue, fuzz vs pin divergence, two unreconciled schedulers. |
| Copious articles, JP+EN titles | **PARTIAL / NOT MET** | 40 shelf + 694 archive live and fully wired; the 30 new originals stranded on unmerged branches with no PR (P1). EN titles: 0 of 764 in data — schema gap; only a hardcoded UI map covers the 40 shelf cards. |
| Audio voices | **MISSING** | No lane found any audio, TTS, or voice feature on any surface, in any branch walked. Nothing exists to review. |
| Mock tests | **MISSING** | Nothing exists. The drift's own stub hint ('実物では、AI評価・SRS・模試から現在地を推定') names mock exams as a future input; the closest existing features are the tutor's 5-question quiz and the dojo yomi probe, neither a mock test. |
| AI memory (graph, not-a-word-lost, model-agnostic) | **NOT MET** | Chat alone persists, capped at 24 turns; other five surfaces discard everything; no graph, no edges, no per-turn metadata; provider + model hardcoded. The persistence discipline (quarantine, unknown-key preservation, append-only revlog/obslog precedent) is good bones to build on. |

---

*Compiled from 8 lane reports; 122 screenshots and full walk logs under `full-review/` (drift/, shelf-reader/, dictionary/, writing-room/, srs-lists/); scripts walk-*.mjs and probe-*.mjs alongside. SwiftShader canvas caveats were respected in every lane — overlay pixel judgments were verified via DOM state, and the one paper-tone nit is flagged for real-GPU verification before filing.*
