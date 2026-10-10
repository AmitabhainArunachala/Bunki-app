# Round 5: strict review before any fixes

Baseline: `e34841f1109f113cf08c3b99d69d960a60f04522`, clean branch `claude/r5-strict-20261010`. Built with `scripts/build-corridor-site.mjs`, served as an immutable snapshot at localhost:57105. Artifact SHA-256: `d5a2b0b47280b8f8cc738b1a95c1176997a117826b4b3b68d7ed3c92a8bab182`.

The authority is John's original brief and bar, his fourteen tour answers, and VISION §10.2. The retained Learn/Today header doors are his D7 decision: their duplication is recorded, not permission to remove them. Four coloured grades, both nights, the universe opening, blood, shrinking fronts, the name and the absence of prices remain his decisions.

## Evidence and method

`R5` below is `/Users/dhyana/.dharma/bunki_review/2026-10-10/r5-strict`. Runtime evidence stays there, outside git. Chromium on this Mac, isolated mobile contexts, 390×844 and 320×844, EN (`bi`) and 日本語 (`ja`), day (`hokusai`), 藍 (`yoru`), 殻 (`kaku`). Stills use reduced motion where indicated; the journey uses motion on. The initial cards audit's folders called `shell` accidentally used an invalid theme key: those images are excluded; `cards-base-kaku` contains the corrected 殻 captures.

- **B**: `R5/shots-base/{day-en,night-en,day-ja}/{door,today,read,reader,popup,learn,deck-home,deck-front,deck-back,words,me,n1-deck}.png`, 36 standard fresh-state shots; `sheet-day-en.png` is the thumbnail identity test. The public `deck=kotoba` alias really opens `kotoba-mine`.
- **S**: `R5/seeded-base/<width>-<theme>-<language>/*.png`, with DOM/record snapshots in `manifest.json`. A synthetic five-word record is imported through the real backup importer, then all five cards are revealed and graded. Today before, Today after and the actual close are distinct states. No learner profile is used.
- **C**: `R5/cards-base/*-<width>-<theme>-<language>.png`, `R5/cards-base-kaku/*.png`, `observations.json`, `probes.json`, `tap-paths.json`, `own-word-sheet-{kotoba,n1}.png`. Both requested deck homes, fronts, backs; popup, sentence pane and full entry. Initial hit measurements were corrected to include existing pseudo-element touch areas: the 28px zoom and 32px dismiss glyphs already have 44px hit areas, and the entry sentence triangle has a 44px pseudo-element. They are not defects merely because their glyph is small.
- **A**: `R5/blocking-base`: accessibility (53/53), core language (83 visits, 10,105 inspected, zero reported leaks), relief and theme verifiers pass. `spot-report.json`, `axe-spots.json`, `front-spots.json` and `shots/<width>/<mode>/*.png` extend those checks. Axe reports zero text contrast violations in the nine Door/Learn/Read world states; gradients, opacity and edges still require judgment. Player Focus text at opacity 0.38 has a calculated ~2.3:1 contrast on day paper and fails check 8. Invisible universe level labels were excluded from a spurious contrast finding.
- **M**: `R5/seeded-base/journey-complete/` holds the complete recorded journey, 12-frame contact sheet and frame map; `speed.json` holds raw timings. Motion source audit includes `corridor.css`, `register.css`, `editorial.css`, the room styles and player styles. Follow, room arrival, article entry and reveal are judged from the recording, not inferred from the existence of keyframes.

P = demonstrated pass, ~ = partial or a material unproved part, F = demonstrated failure. For checks whose object is absent in a room (for example a front in Settings), P means no applicable object; it is not an independent test. Scores aggregate the worst toured width/language/world/state. Check 25 is left to a person. A passing automated suite does **not** turn all checks 7 or 8 into P: the extra probes found targets the existing suite does not census.

| # | Check | Door | Today | Today after | Close | Shelf | Reader | Learn | Words | Me | Settings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | One primary | P | P | P | P | P | P | P | P | P | P |
| 2 | EN purity | P | **F** | **F** | P | P | P | P | P | P | P |
| 3 | JA purity | P | P | P | P | P | P | P | P | P | P |
| 4 | Room identity | P | P | P | P | P | P | P | P | P | ~ |
| 5 | Tap depth | P | P | P | P | P | P | P | P | P | P |
| 6 | Motion | **F** | **F** | **F** | **F** | **F** | **F** | **F** | **F** | **F** | **F** |
| 7 | Hit size | P | P | P | P | **F** | P | **F** | P | P | P |
| 8 | Contrast | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 9 | Depth | ~ | P | P | P | P | P | P | P | P | P |
| 10 | Content first | P | P | P | P | P | P | P | P | P | P |
| 11 | No placeholders | P | P | P | P | P | P | **F** | P | P | P |
| 12 | No redundancy | P | **F** | **F** | **F** | **F** | **F** | **F** | **F** | ~ | **F** |
| 13 | One signal | ~ | **F** | **F** | ~ | ~ | P | ~ | **F** | ~ | ~ |
| 14 | Real annotation | P | P | P | P | P | P | **F** | P | P | P |
| 15 | Correct Japanese | P | P | P | P | P | P | P | P | P | P |
| 16 | Card fronts | P | P | P | P | P | P | P | P | P | P |
| 17 | Overflow | P | P | P | P | P | P | P | P | P | P |
| 18 | Day/night parity | P | P | P | P | P | P | ~ | P | P | P |
| 19 | Voice | P | P | P | P | **F** | **F** | P | P | P | P |
| 20 | Speed | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 21 | The bar | **F** | **F** | **F** | ~ | ~ | ~ | ~ | **F** | ~ | **F** |
| 22 | Three Japans | ~ | P | P | P | ~ | P | P | P | P | ~ |
| 23 | Alive | ~ | **F** | **F** | ~ | ~ | ~ | ~ | ~ | **F** | **F** |
| 24 | The pull | P | P | P | P | **F** | P | P | P | P | P |

| # | Check | Popup | Sentence | Entry | Kotoba home | Kotoba front | Kotoba back | N1 home | N1 front | N1 back |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | One primary | P | ~ | P | P | P | P | P | P | P |
| 2 | EN purity | P | P | P | P | P | P | P | P | P |
| 3 | JA purity | P | P | P | P | P | P | P | P | P |
| 4 | Room identity | P | P | P | ~ | P | P | P | P | P |
| 5 | Tap depth | P | P | P | P | P | **F** | P | P | **F** |
| 6 | Motion | ~ | ~ | ~ | **F** | **F** | **F** | **F** | **F** | **F** |
| 7 | Hit size | P | P | **F** | **F** | P | **F** | **F** | P | **F** |
| 8 | Contrast | ~ | ~ | ~ | ~ | ~ | **F** | ~ | ~ | **F** |
| 9 | Depth | P | P | P | P | P | P | P | P | P |
| 10 | Content first | P | P | P | P | P | P | P | P | P |
| 11 | No placeholders | P | P | P | P | P | P | P | P | P |
| 12 | No redundancy | **F** | **F** | **F** | P | P | P | P | P | P |
| 13 | One signal | P | ~ | P | P | P | P | P | P | P |
| 14 | Real annotation | P | P | P | P | P | P | P | P | P |
| 15 | Correct Japanese | P | P | P | P | P | P | P | P | P |
| 16 | Card fronts | P | P | P | P | P | P | P | P | P |
| 17 | Overflow | P | P | P | P | P | P | P | P | P |
| 18 | Day/night parity | P | P | P | **F** | **F** | **F** | ~ | ~ | ~ |
| 19 | Voice | **F** | **F** | **F** | P | **F** | **F** | P | **F** | **F** |
| 20 | Speed | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 21 | The bar | ~ | **F** | ~ | **F** | ~ | ~ | ~ | ~ | ~ |
| 22 | Three Japans | P | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 23 | Alive | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 24 | The pull | P | P | P | P | P | P | P | P | P |

Corrected baseline: **294 P, 93 partial, 69 F** across 456 room/check cells, including non-applicable P cells. The first review was committed before fixes at `a5de2582`. Two explicit corrections preserve that historical review: (1) Door/check 2 was already pure EN in the shipped baseline, so F became P; the mixed heading existed only in the unshipped donor (`R5/shelf-onejob/radicals.json`, `source.json`). This is not a product fix. (2) the first review missed Learn's unsupported “about 15 min” / “~15 min” annotations; baseline `corridor.js` at lines 23529, 23581 and 23835 has no record or queue-derived duration, so Learn/check 14 becomes F. Removing those estimates is a real fix, recorded in `e936e964`. The original and corrected scoring receipts are retained in R5; the two corrections happen to return the aggregate F total to 69. No single percentage substitutes for the blocking failures.

## Evidence for the scores

| Check | Evidence and limitation |
|---|---|
| 1 | B/S/C screenshots: one principal review/reveal/Save door; sentence practice and tutor compete at equal weight; Settings and Words lack a clear principal task. |
| 2 | S Today table and saved-month strip show `2026年10月` in EN. The universe heading was rechecked and is pure EN in the shipped baseline; the donor is not shipped. Core language suite misses the saved-month state. C deck POS labels are correctly English. |
| 3 | JA screenshots and core language pass; dictionary English meanings are learning content, not interface labels. Acronyms in finder/deck labels remain a plain-language concern. |
| 4 | B thumbnail sheet distinguishes the universe, stage, technical web, magazine and yearbook; kotoba home reads as a different cyan app. |
| 5 | C real click trace: own target 財政/交渉 opens a sheet saying only “Already in this deck”; no kanji door. Another word requires full entry then kanji (two taps from the word sheet). Reader popup kanji/part doors and one-step return work. |
| 6 | M recording; CSS still animates background, colour, shadow, width and blur. Rain repeats in 1.1s, a lamp in 5.2s; reduced motion often suppresses motion rather than crossfading. Follow/article changes cut, reveal moves the viewport. |
| 7 | A/C geometry: JA Learn/shelf labels are turned into tiny lookup buttons (e.g. 学ぶ 26.23×14.94px, title 次 34.34×37.39px). Deck home Word list/Settings are 41.6px tall. Inline learning tokens are narrower than 44px even where their height is expanded. Existing zoom/dismiss/sentence pseudo-targets already meet 44px. |
| 8 | A/C Axe and measured ordinary surfaces pass; unresolved textured/gradient surfaces and UI edge contrast remain ~. Player Focus dims readable context to 0.38 opacity (~2.3:1 on day paper), a real F. |
| 9 | Relief verifier and day/night stills distinguish paper, mat and raised card. The door has much less relief than the other rooms. |
| 10 | B shelf image begins at y≈202, above the fold; reader tip/version/meta fill the title card but the story is available. No filter wall above the lead image. |
| 11 | Learn ships “mock tests in preparation” / 準備中 (corridor.js studyHallDoors/renderStudyHall). A real unavailable sync status and a real absence-of-audio status are not falsely described as future features. |
| 12 | Popup duplicates Save in the reader header; entry has Back and Close for the same return; shelf search duplicates header search; Words has repeated finder doors; Today All cards duplicates Begin; Settings language/world repeats header controls and two doors open Today. D7 header exceptions are still counted as partial, intentionally retained. |
| 13 | S Today: lit blue Begin, red hook, teal current stop; Words: selected search lens, current walk and saved node highlights. Four coloured grade meanings are required by D1 and are not four competing primary actions. |
| 14 | S record snapshots and C deck source traces below. Erratum: baseline Learn ships unsupported “about 15 min” / “~15 min” at corridor.js:23529, 23581, 23835; Learn is F. Empty rooms with fewer than three numbers are explicitly recorded; no numbers are manufactured. |
| 15 | Actual article/dictionary content has Japanese language tagging and correct target readings; native first-view review is still needed for the felt bar. |
| 16 | A/C front probes: zero ruby readings, answer details or interactive descendants before reveal in both requested decks. No storage/card identity changes are justified by this pass. |
| 17 | B/S/C/A: no horizontal overflow in the toured 320/390 states. Sentence pane has **vertical nested scrolling**, which is a separate failure. |
| 18 | Requested worlds have designed room treatments; 殻 Learn card reads mint. Kotoba defaults dark/cyan independent of global world; N1 uses its own AI look. |
| 19 | Leading Syria article has no narration. Both toured deck players offer no card audio. Saved-word review exposes a voice button only on its back; actual playback requires the approved clip. Exact roster/asset measurements follow after the pass. |
| 20 | M raw Mac speed samples; not an iPhone result. Final report will separate DOM update, next painted frame and settled motion. No device-speed claim from Mac data. |
| 21 | Five written questions below. No room yet earns five unqualified yes answers. |
| 22 | Reader/popup: paper, instrument type/rules and indigo wave mat are identifiable. Door/deck homes/yearbook/settings have a weaker city layer. |
| 23 | M: web recenter and press responses exist; three authored, sub-second, meaning-tied responses per room are not yet documented or demonstrated. |
| 24 | S real close has a concrete reading door; Today’s plan title truncates. Shelf's six daily picks rotate; its **first three** stay in chronological order, so the exact first-three rule is not yet met. |

## Defects, most visible first

1. **Cards — a different world.** Kotoba is cyan on black even by day, while N1 uses separate AI paper. Global day/night does not govern the complete flow. Breaks check 18 and John's T8/T9 call for distinction and crispness inside one app.
2. **Cards — the word-to-kanji path is blocked.** A card's own target has no dictionary/kanji route; other words take two taps from their word sheet. Breaks blocking check 5 and the recursive depth of THE BRIEF.
3. **Japanese shelf/Learn — interface text becomes tiny study controls.** The prose enhancer treats headings, dates and labels as study words. Breaks blocking check 7 and “clean and organized”. Deck home controls also miss 44px. Focus dims readable text below the contrast floor (check 8). Inline learned-token touch widths need an explicit remedy, not a verifier exception.
4. **Today/universe — mixed interface languages.** Automatic month names show Japanese in EN. The claimed universe label failure was retracted after checking the shipped artifact. Breaks blocking check 2 and “No silly contraditions like the English setting showing japanese buttons”.
5. **Learn — promised rooms that do not exist.** “In preparation” rows remain shipped. Breaks blocking check 11.
6. **Journey — cuts and a reveal jolt.** Follow, tab/room changes and article opens lack a held transition; reveal changes document scroll. Disallowed CSS properties and fast ambient loops remain. Breaks checks 6/23 and “connected and flowing”.
7. **Sentence study — a small window inside a phone window.** At 320, `#mini` is 330px high with 472px of content; Save/Practice are below an internal scrollbar. Breaks the known leftover and the bar's whole practice.
8. **Reader/popup — two Save paths.** The header plus and popup Save capture the same word. Full entry duplicates its return. Breaks checks 1/12 and T5's request for one clear Save path.
9. **Today/Words — competing signals and clipped reading doors.** Hook/current-stop/Begin compete; the next story is truncated. Words starts with a search/finder slab and clips lens labels. Breaks checks 12/13/24 and “Not confusing in the least”.
10. **Learn in 殻 — mint paper.** The stage card is mint rather than the designed paper material. Breaks check 18 and the explicit leftover.
11. **Labels/settings — builder language and wrong plurals.** Header bookmark says Lists although it opens Today; “yomi probe”, “your due cards”, “KKLD number”, “open SKIP wheel”, deck “MCD” and card-sheet “Memorize” remain. Player Settings prints “1 cards · 1 answers”. Breaks the R4 plain-words glossary.
12. **Voice — no recording for the principal article or either deck card.** Breaks check 19 and the read-while-listen study act. This must be measured and reported, not covered with a substitute voice.
13. **Shelf — the first three stories do not change each day.** A lower daily strip rotates, but the first frame stays the same. Breaks the exact check 24 rule.
14. **The bar — incomplete authored detail.** Motion responses are not specified room by room; the universe, deck home and Settings still have weaker complete frames. Breaks checks 21–23. Check 25 remains a human task.

## Five bar questions, written per room

| Room | Dōgen | Musashi | Bashō | Hakuin | Anime masters |
|---|---|---|---|---|---|
| Door | Yes: touching language is the act. | Partly: silent glyph controls need clarity. | Yes: the wandering words can leave one encounter. | Yes: a tap leads to real meaning. | No: pale ground lacks foreground/background weight. |
| Today | Yes: a real word and real queue are practice. | No: administrative controls and duplicate review paths dilute it. | Yes: stable sky with a new daily word. | Yes: due counts are honest. | No: three signals compete in the paused frame. |
| Today after | Yes: completed work remains real. | No: old controls still dominate below the close. | Yes: today's word remains a moment. | Yes: the record tells the truth. | No: the finished frame has no distinct held beat. |
| Session close | Yes: the surface clears to what was kept. | No: return paths still repeat the tab. | Yes: one next reading has substance. | Yes: five/zero is a real result. | Partly: clean frame, entrance lacks weight. |
| Shelf | Yes: the picture leads into real reading. | No: lookup field repeats the header. | Partly: first stories stay fixed, lower picks rotate. | Yes: sources and review states are honest. | Partly: the woodblock holds, the upper controls weaken it. |
| Reader | Yes: the story is the study. | Partly: metadata and the tip occupy much of the first frame. | Yes: a real Syrian field is memorable. | Yes: every lookup preserves its line. | Partly: lacquer and paper hold; entry motion lacks weight. |
| Popup | Yes: the word is practice itself. | No: header Save duplicates it. | Yes: stable bands leave the word clear. | Yes: meaning and parts land together. | Partly: waves and paper hold; entrance needs craft. |
| Sentence | No at 320: an internal viewport delays practice. | No: tutor and practice compete. | Yes: selected sentence stays exact. | Yes: recall and help are useful. | No: cut-off actions break the paused frame. |
| Full entry | Yes: examples and meaning make one study surface. | No: duplicated exit and narrow learning targets remain. | Yes: ancestry leaves a durable moment. | Yes: sourced meanings help. | Partly: coherent paper/indigo, too little authored motion. |
| Learn | Yes: the next card grounds the practice. | Partly: repeated deck doors and unbuilt test rows remain. | Yes: real learner state changes the stage. | Partly: separate ledgers are honest, but the fixed time estimate has no source. | Partly: proscenium holds, mint in 殻 breaks the paper. |
| Kotoba home | Partly: Begin is clear behind a theme wall. | No: twelve checkbox rows dominate. | Partly: stable structure with little surprise. | Yes: counts come from the deck. | No: cyan by day is a different app. |
| Kotoba front | Yes: recall stays whole. | Yes: answers are concealed. | Yes: a real sentence is the moment. | Yes: challenge is clear. | Partly: crisp target, wrong global world. |
| Kotoba back | Yes: meaning is useful immediately. | No: rule and gesture hints repeat instruction. | Yes: the sentence remains memorable. | Yes: four outcomes support honest grading. | Partly: no global continuity and a reveal jolt. |
| N1 home | Partly: Begin waits behind theme choices. | Partly: checkboxes consume the frame. | Partly: counts are real but the list is static. | Yes: 666 is the actual deck count. | Partly: paper/lacquer craft ignores the selected world. |
| N1 front | Yes: a rich passage asks for recall. | Partly: long fronts reach the font floor. | Yes: historical content has substance. | Yes: the target leaks no answer. | Partly: strong silhouette, tall frame. |
| N1 back | Yes: definition moves practice forward. | No: word-depth route and help clutter remain. | Yes: passage and definition connect. | Yes: four explicit grades help. | Partly: good materials, unstable reveal. |
| Words | Yes: language relationships are practice. | No: finder and search duplicate paths. | Yes: the recentered word stays in the walk. | Yes: stroke/family numbers are real. | No: upper slab and competing signals crowd the web. |
| Me | Yes: the record shows actual practice. | Partly: header/tab repetition is explicitly retained. | Yes: the yearbook is a stable frame. | Yes: no invented progress is claimed. | Partly: coherent book, little authored response. |
| Settings | Yes: choices control the actual app. | No: language/world and Today routes repeat. | No: generic settings leave little moment. | Yes: capabilities are stated honestly. | No: a weak frame without a city layer. |

## Real-number source traces

The sampled numbers are checked against record/data snapshots, not plausible-looking labels. Seeded record/DOM evidence is in S; deck index/card source in C. Three samples are recorded where three exist; an empty state with fewer numbers is not filled with dummy values.

| Room/state | Samples and source |
|---|---|
| Door | No three visible numeric annotations in the closed fresh universe. Learned glyphs are not counts. |
| Today | Five waiting = `todayQueue().order.length` from the imported record; family count = `wwPartCap/wwPartMembers` from dictionary parts; local 10 Oct = `dayKey`/calendar date. |
| Today after | Zero waiting = queue after the five commits; five graded = record revlog; calendar date = same local clock. |
| Close | Five kept and zero Again = grades actually made; session time = elapsed committed review timestamps, not an estimate. |
| Shelf | 120 articles = folded collection tally; 1,939 characters = leading passage index `chars`; 28 Sep 2026 = passage source date. |
| Reader | N1 = passage level/grading metadata; 28 Sep = same source date; picture credit names the actual local illustration, not a measured number. There are fewer than three separate numbers without opening article details. |
| Popup/sentence | Selected states have fewer than three numeric annotations; the word, reading and sentence are traced to the actual token/dictionary record instead. |
| Entry | Sense 1 = dictionary sense index; N4 = dictionary JLPT row for 郊外; CC BY-SA 4.0 = JMdict attribution, not learner progress. |
| Learn | Zero/five saved due = Today queue; N2/N1/fields fifteen new each = each deck's `buildQueue` with its daily cap; six guided questions = bundled guided item count. |
| Kotoba home | 323 words = `deck.words.length`; 503 cards = sum of `word.cards.length`; fifteen new = `buildQueue` under its new-per-day cap. |
| N1 home | 666 words and 666 cards = source deck census; fifteen new = that deck's own queue/cap. |
| Both deck fronts/backs | 1/15 = session index/queue length; N1 = word level; grade intervals = `previewGrade` for that state, never handwritten labels. |
| Words/web | Five/9 strokes = `D.kanji[外/郊].st`; two kanji = spelling decomposition; N4 = dictionary word row. Follow's family and saved-family count use `wwPartCap` against `wwMine`. |
| Me | 267 days = local-day difference to expected 4 July 2027; Day 1 = practice window start; practised-day count = grouped genuine practice evidence, not saved words alone. |
| Settings | Ordinary room has no three numeric annotations. In player backup Settings, card count = stored ledger entries, answer count = log length, backup count = parsed archive census. |

This is the **before** record. Subsequent sections will retain it and give after scores, fixes, measurements and the complete verifier results. No check-25 or recent-iPhone claim is made by this review.

## Round 5, after

The strict review was committed first, in `a5de2582`, before implementation. Its before section is retained byte-for-byte. The final clean `2d3ed3d1` re-tour supersedes the v7 motion and card geometry observations where later independent probes found misses. V7 evidence remains historical, with exact unchanged-file continuity stated below. The corrected before record above is retained. After scores aggregate the same 19 states, the worst of both widths, both languages and all three selected worlds. They are judgments supported by the final stills, actual videos and checks; the 456 cells include non-applicable P cells. Check 25 remains for a person.

| Result | Before | After |
|---|---:|---:|
| P | 294 | 356 |
| ~ | 93 | 89 |
| F | 69 | 11 |

40 F and 23 partial cells became P; 18 F became partial; 11 F remain. One baseline P, Reader/check 5, is now partial because R5-13 exposes lost graded-word doors in some archive compounds. The corrected Door language score is excluded from these improvements. A fresh trusted-click audit changes the previously reported N1 back/check 7 P to partial: two expanded left corners of 側 invoke the preceding printed ロシア. Earlier after-score receipts (358/87/11) remain, and the final score is deliberately more conservative. The later Reader correction yields 356 P / 89 partial / 11 F rather than the prior 357/88/11.

| # | Check | Door | Today | Today after | Close | Shelf | Reader | Learn | Words | Me | Settings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | One primary | P | P | P | P | P | P | P | P | P | P |
| 2 | EN purity | P | P | P | P | P | P | P | P | P | P |
| 3 | JA purity | P | P | P | P | P | P | P | P | P | P |
| 4 | Room identity | P | P | P | P | P | P | P | P | P | ~ |
| 5 | Tap depth | P | P | P | P | P | ~ | P | P | P | P |
| 6 | Motion | P | P | P | P | P | P | P | P | P | P |
| 7 | Hit size | P | P | P | P | P | P | P | P | P | P |
| 8 | Contrast | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 9 | Depth | ~ | P | P | P | P | P | P | P | P | P |
| 10 | Content first | P | P | P | P | P | P | P | P | P | P |
| 11 | No placeholders | P | P | P | P | P | P | P | P | P | P |
| 12 | No redundancy | P | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 13 | One signal | ~ | P | P | ~ | ~ | P | ~ | P | ~ | ~ |
| 14 | Real annotation | P | P | P | P | P | P | P | P | P | P |
| 15 | Correct Japanese | P | P | P | P | P | P | P | P | P | P |
| 16 | Card fronts | P | P | P | P | P | P | P | P | P | P |
| 17 | Overflow | P | P | P | P | P | P | P | P | P | P |
| 18 | Day/night parity | P | P | P | P | P | P | P | P | P | P |
| 19 | Voice | P | P | P | P | F | F | P | P | P | P |
| 20 | Speed | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 21 | The bar | F | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | F |
| 22 | Three Japans | ~ | P | P | P | ~ | P | P | P | P | ~ |
| 23 | Alive | P | P | P | P | P | P | P | P | P | P |
| 24 | The pull | P | P | P | P | P | P | P | P | P | P |

| # | Check | Popup | Sentence | Entry | Kotoba home | Kotoba front | Kotoba back | N1 home | N1 front | N1 back |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | One primary | P | ~ | P | P | P | P | P | P | P |
| 2 | EN purity | P | P | P | P | P | P | P | P | P |
| 3 | JA purity | P | P | P | P | P | P | P | P | P |
| 4 | Room identity | P | P | P | P | P | P | P | P | P |
| 5 | Tap depth | P | P | P | P | P | P | P | P | P |
| 6 | Motion | P | P | P | P | P | P | P | P | P |
| 7 | Hit size | P | P | P | P | P | P | P | P | ~ |
| 8 | Contrast | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 9 | Depth | P | P | P | P | P | P | P | P | P |
| 10 | Content first | P | P | P | P | P | P | P | P | P |
| 11 | No placeholders | P | P | P | P | P | P | P | P | P |
| 12 | No redundancy | ~ | ~ | P | P | P | P | P | P | P |
| 13 | One signal | P | ~ | P | P | P | P | P | P | P |
| 14 | Real annotation | P | P | P | P | P | P | P | P | P |
| 15 | Correct Japanese | P | P | P | P | P | P | P | P | P |
| 16 | Card fronts | P | P | P | P | P | P | P | P | P |
| 17 | Overflow | P | P | P | P | P | P | P | P | P |
| 18 | Day/night parity | P | P | P | P | P | P | P | P | P |
| 19 | Voice | F | F | F | P | F | F | P | F | F |
| 20 | Speed | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 21 | The bar | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 22 | Three Japans | P | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 23 | Alive | P | P | P | P | P | P | P | P | P |
| 24 | The pull | P | P | P | P | P | P | P | P | P |

| Check | Before P / ~ / F | After P / ~ / F |
|---|---:|---:|
| 1. One primary | 18 / 1 / 0 | 18 / 1 / 0 |
| 2. EN purity | 17 / 0 / 2 | 19 / 0 / 0 |
| 3. JA purity | 19 / 0 / 0 | 19 / 0 / 0 |
| 4. Room identity | 17 / 2 / 0 | 18 / 1 / 0 |
| 5. Tap depth | 17 / 0 / 2 | 18 / 1 / 0 |
| 6. Motion | 0 / 3 / 16 | 19 / 0 / 0 |
| 7. Hit size | 12 / 0 / 7 | 18 / 1 / 0 |
| 8. Contrast | 0 / 17 / 2 | 0 / 19 / 0 |
| 9. Depth | 18 / 1 / 0 | 18 / 1 / 0 |
| 10. Content first | 19 / 0 / 0 | 19 / 0 / 0 |
| 11. No placeholders | 18 / 0 / 1 | 19 / 0 / 0 |
| 12. No redundancy | 7 / 1 / 11 | 8 / 11 / 0 |
| 13. One signal | 9 / 7 / 3 | 12 / 7 / 0 |
| 14. Real annotation | 18 / 0 / 1 | 19 / 0 / 0 |
| 15. Correct Japanese | 19 / 0 / 0 | 19 / 0 / 0 |
| 16. Card fronts | 19 / 0 / 0 | 19 / 0 / 0 |
| 17. Overflow | 19 / 0 / 0 | 19 / 0 / 0 |
| 18. Day/night parity | 12 / 4 / 3 | 19 / 0 / 0 |
| 19. Voice | 10 / 0 / 9 | 10 / 0 / 9 |
| 20. Speed | 0 / 19 / 0 | 0 / 19 / 0 |
| 21. The bar | 0 / 12 / 7 | 0 / 17 / 2 |
| 22. Three Japans | 8 / 11 / 0 | 8 / 11 / 0 |
| 23. Alive | 0 / 15 / 4 | 19 / 0 / 0 |
| 24. The pull | 18 / 0 / 1 | 19 / 0 / 0 |

### Evidence for the after scores

| Checks | Final evidence and limits |
|---|---|
| 1, 12, 13 | Today has one Begin; current stops and the hook are neutral ink. Words has one shape opener and one saved-node signal. Shelf Tools owns its search field; the header field is hidden while Tools is open. Popup owns Save; the reader header Save is hidden until dismissal. First-depth entry has one visible Close; deeper Back and Close have different destinations. Settings owns its world/language controls; Review pace and Backup have distinct actual targets. D7 retains the quiet Learn/Today header doors; those redundancies remain partial. Sentence tutor/practice weights and secondary teaching hints remain partial. |
| 2, 3, 11, 15 | Actual 230-state EN/JA tour and core language checks. EN month labels are English; Japanese interface headings are excluded from the prose enhancer. Learn offers only ready practice/tests. Audio absence says there is no recording. Dictionary English meaning remains learning content in JA. |
| 4, 18 | cards-final-v12/world: 24 actual world/width/language profiles × 3 states, plus 24 independent stored-look preservation cases. Both decks default to the selected app world; explicit player preferences remain. Paper deliberately uses its dark lacquer study carrier with a paper card: actual default htmlTheme=hokusai/look=world, carrier #141a28/card #fbf8f1; Yoru carrier is approximately #090c16/card #f2ecdf. This is the authored stage mapping, not a hidden stored look (`world-carrier-diagnostic.json`). 殻 Learn uses warm paper, not mint. Settings remains a weak generic frame. |
| 5, 7, 16 | Reader archive joining remains partial under R5-13; this is a separate scope from tested curated lookups. Real card-to-own-word/other-word paths: kanji ≤1 tap, part ≤2, caller preserved. Home doors and selected sky words have physical 44px targets; tiny interface lookups are removed. Revealed token prose now has leading 2.5 to keep next-line ruby away from prior targets; fronts retain 2.05. Dense N1 lateral corners remain partial: 50 trusted points per language at 320, all 10 centres correct, 48/50 callbacks correct. Two corners overlap the preceding printed word; original nearest-word arbitration is retained. Both fronts have zero answer, reading or interactive descendants before Reveal. Final missing-voice activation probe additionally checks the full 44px voice button after the note appears. Plain Undo has a full physical 44px target above Reveal, including removal-to-next-card poses; every actual corner/centre restores the prior card and ledger. |
| 6, 23 | SPEC documents three meaningful responses in every state. `responses-final-v12` has 26 fresh non-player clips in both modes; `cards-final-v12/responses` has four actual films and 36 actions, maximum first RAF 128ms and settled response 457.5ms. 20/36 first RAFs and 59 sampled player frames still have loading font sets; these prove response, not settled typography or compositor paint. The fresh twelve-case late-room observer has zero main/child/post-clear resets, errors absent, final main and visible children opacity 1, and exact minimum post-clear observation 1195.0999999940395ms; the original >=1000ms assertion is unchanged. The historical fourteen early physical hits and native-absent synchronous route/state/focus proofs remain bounded earlier observations. Fresh CSS AST: 20 shipped sheets, zero forbidden properties, 13 ambient loops with minimum 6s. `journey-final-v12/contact-sheet.png` contains twelve actual video frames: its card at 10.058s is populated; Follow, recenter, Reveal and article arrival show intermediate frames. Root visually checked it. The earlier blank-frame sheet remains preserved. |
| 8 | Worst measured card UI text 5.2294:1; Focus passage 13.7079:1, replacing the failed 0.38-opacity text. Earlier unchanged missing-voice/footer styles measure 8.8201:1 (nearby raster minimum 8.1420:1), and report links at least 11.9118:1 (nearby raster minimum 12.6528:1), verified in `reading-contrast-final-v7/{runtime,contrast}.json`. The historical v7 full 60-card sweep has 600/600 footer hits after settled visibility; two cases needed actual minimal page scroll, with before/after coordinates retained. The earlier v6 supplemental pose placed the footer partly below the 844px viewport; its failed receipt is preserved and its cause is unproved. The subsequent v6 repeat needed zero scrolls; neither that result nor this fresh v7 sweep changes source or behavioral assertions. All ordinary accessibility contrast probes pass. Textures, gradients, pale edge fades and other subdued edge treatments prevent an all-world, every-edge claim; every room stays partial. |
| 9, 10, 17, 22 | `shots-final/v12` has the same 36 fresh stills; `seeded-final-v12` has 132 seeded poses and 24 completed-session Me states: no horizontal overflow at 320/390. Full-page sentence cards use document flow, not an inner scroller. Original expanded-pane geometry assertions, quote/source invariants and 24 supplemental cases pass. Door relief and the city layer in Settings/deck frames remain partial. |
| 14 | Fixed recorded random seed, all visible numeric candidates retained; 50 actual UI samples across 19 states traced independently below. Four states have fewer than three; no third number is manufactured. Unsupported “~15 min” estimates were removed. Queue captions now say cards, because the real queue includes new as well as due cards. |
| 19, 20, 21 | Measurements and five per-room judgments below keep absent approved audio, untested iPhone speed and visual weaknesses visible. Passing software checks does not certify John’s felt bar. |
| 24 | Actual first-three daily shelf picks now rotate deterministically, stay stable within a day, remain real articles, and differ across the sampled three days. The full Today next-story title is visible and the session close opens a concrete next reading. |

### Defect disposition

| Original defect | Result |
|---|---|
| 1. Cards: a different world | Fixed: both requested deck flows use the selected app world by default; eight explicit stored player looks are preserved. |
| 2. Cards: blocked word-to-kanji path | Fixed: own and other words open their real entry with one-tap kanji and two-tap part access, then exact caller return. |
| 3. Tiny targets and dim Focus | Partly fixed: UI prose lookup is excluded, home doors and vertical learning targets meet 44px, ruby no longer steals the prior line, and Focus meets measured text contrast. Audio-note activation retains 44px. Two N1 lateral corners still select adjacent printed ink; broad edge contrast remains partial. |
| 4. Mixed interface languages | Fixed: EN months are English. Universe label was already Radicals in the shipped baseline; the initial failure was corrected, not counted as a fix. |
| 5. Promised Learn rooms | Fixed: unavailable preparation rows are removed; real guided practice/tests start their existing consumers. |
| 6. Cuts and reveal jolt | Fixed: live arrival fades, held inert outgoing frames, fixed docks, unchanged reveal scroll, and opacity-only reduced responses; the measured room/card responses obey the property and duration rules; the October 11 static audit additionally found forbidden JavaScript-created Drift transitions outside that measured scope. |
| 7. Nested sentence window | Fixed: expanded geometry reserves the actual card; genuinely tall cards use the page and restore the word and article position on Back. |
| 8. Duplicate Save and exits | Fixed: popup owns Save; first-depth entry has one Close. D7 header exceptions remain visible and keep general redundancy partial. |
| 9. Competing signals/clipped reading doors | Fixed: one Begin/saved-node signal, neutral hook/current stop/lens, one shape opener, and full next-reading title. The search/web first frame still has considerable chrome. |
| 10. Mint 殻 Learn paper | Fixed: warm stage paper in 殻. |
| 11. Builder labels/plurals | Fixed: Today bookmark, Reading check, Cards due, Kodansha number, Find by shape, Words visited, plain deck names and Save; singular card/answer forms. Verifier pins are individually logged. |
| 12. Missing voice | Unfixed: no approved Kore/Charon assets for the toured article/card content; no substitute or fabricated narration is shipped. Exact absence is visible and measured. |
| 13. Fixed first-three shelf stories | Fixed: three daily first stories rotate through actual recent non-glossary articles with stable same-day selection. |
| 14. Incomplete authored detail/bar | Partly fixed: all 19 states now have three recorded sub-second meaningful responses and a written specification. Door foreground depth, Settings identity/city and dense card-back guidance still need visual authorship. No room is awarded five unqualified yes answers. Archive word-door joining and closing Tools with a live query remain explicit product decisions. |

## Post-gate corrections and evidence

The first NoMistakes run (`01M4HBMTSE2ACT5ZDBRDDGKXPP`) failed when its configured 30-minute repair timeout fired while its agent was still producing output. Root did not cancel it. Structured branch_sync released the unchanged submitted branch as user_owned; no pipeline commits existed and no sync/reset was needed. Its managed checkout was automatically removed. An independently preserved immutable build retained the exact production source bytes; `gate-repair-custody/manifest.json` records recovery and original/before/after hashes. Production and independent export/fixture repairs were then committed normally.

The review exposed these misses, now repaired: standalone exports omitted motion.css; three stale Kodansha/assessment/voice label pins; Words lost its open disclosure and Back focus; Review pace re-folded on redraw; Reader Retry passed through the default room; retiring reader/stroke controls hid before their fades; Today did not name its count as saved words. The brief already authorized genuine fades and honest labels. Historical clean 8ab33afb receipts verify 14 early live-control hits, four navigation cases, four contextual-card cases, two calendar cases, one guided internal Back and two asynchronous entry-continuity contexts. These are separate observed scopes, not a combined claim of 22 focus cases.

Bundled fonts were a missed hard rule: OS faces rendered most reading, chrome and data. The corrected local pool adds 270 licensed unicode-ranged sources to the original 181 decorative files. Noto Sans JP, Noto Serif JP, Noto Serif Latin and Roboto Mono retain existing roles/sizes/weights; metadata, OFL licenses and source hashes are committed. This intermediate build loads font subsets lazily; the terminal audit found that unused chunks are unavailable offline, and the October 11 repair addresses that missed hard rule. Unsupported controls now use bundled glyphs or the existing pause SVG. The donor extractor reproduces all three generated outputs. Both standalone modes embed all 451 font sources byte-for-byte and motion.css. No remote runtime font is needed.

Fresh font-final-v7 tour: 52 states, 82,041 platform glyph records, zero native records/overflow/errors. A strict physical probe also found inherited playerQuit and saved-review sentence-door corner gaps; transparent square/stacking repairs preserve printed bounds and pass 40/40 points plus eight real destinations. The full Kotoba verifier found two ruby readings covering prior-line 44px extensions after the font change; its failed v5 receipt is retained. The v7 green REACH result used an ancestor-clipping exclusion and its Focus assertions had been relaxed to opacity <1; those were mistakes. The gate restored the original viewport-centre REACH sampler and both finite <=0.8 Focus limits (the baseline was <0.5, so this was not a restoration of its attenuation), retaining contrast floors. The restored checks exposed nine actual tap misses in a long Full window and a hidden definition; the full unchanged sampler passes after the c14 production seating repair. The ruby-centre owner/lookup evidence remains a separate scope. A separate dense N1 horizontal overlap still invokes adjacent ink at two corners and is scored partial, rather than hidden. These findings are acknowledged rather than hidden by fixture changes.

Unresolved: NoMistakes R5-08 is an informational concern about cloning offscreen player content on phones; no measured phone exit latency is available. R5-11 is a product choice: closing Shelf Tools while a query is active hides its only editor without clearing the query. The exact finding was relayed and remains pending John’s answer (clear and return to stories, or keep lookup and Tools open). No answer or --yes consent was inferred. Approved narration is absent, recent-iPhone speed and an unprompted person/check25 are unmeasured, and the stated bar/edge/material weaknesses remain partial.

The navigation unit fixture missed the newly extracted actual synchronous helper. It now loads that actual dependency with its real transition function; all four original exact-caller/epoch/session/collection assertions pass. The failed v5 receipt and explicit verifier ledger entry remain.

A complete v6 reader/shelf run initially failed G1 phone (48/49): the fixed 250ms sample preceded the asynchronous non-core dictionary popup, while the failure screenshot already showed the correct word. A passive repeat measured actual insertion at 221.8ms with the correct trusted target and no geometry change. The original delay was not instrumented, so concurrency delay remains an inference, not an exact measured cause. The full unchanged rerun and every original assertion are reported below; no delay or behavioral check was weakened.

The isolated v6 speed trace exposed another missed motion defect: index and full-sense arrivals each replaced the whole entry and restarted both sheet and backdrop fades. Five contexts and a separate actual video prove the resets; the earlier v6 assertion of continuous entry arrival was too broad. `8ab33afb` preserves the original CSS animation start across same-entry data redraws, including node-object replacement, while real Open/Kanji/Back/dismissal/reopen start new visits. The helper is UI-only; no CSS, tests, record, pointer-gesture, focus, scroll or epoch handling changed. Clean `sheet-arrival-final-v7` records three actual asynchronous entry nodes with **zero opacity drops** in both normal and reduced modes; the original v6 failed traces remain. That v7 observation repairs the entry/scrim reset only. It did not observe late room arrivals after native transition cleanup; the c14 section below supersedes that broader implication.

### Late room and card repairs

The second NoMistakes run, `01M4HJSMK4CQWTZTN659XM9XTW`, found a late blank room: after native view-transition completion, the still-live room entrance restarted at opacity zero. An unchanged independent observer reproduced 7 failures in 12 original cases (four main resets and twenty child resets); the old 260ms Today frame is blank except chrome. Gate commit `2208ed7b` retires the room entrance when ownership changes and prevents delayed child replay; Me retains one concurrent book entrance. Its four files were custody-captured before the managed checkout disappeared. The re-review then ended failed with **API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)**. Root used only the offered `axi sync --recover`; custody returned, preserving that commit. No reset, rebase, stash, push, daemon change or --yes was used.

The restored original REACH sampler was not weakened to obtain green. Its nine failures came from actual word centres above an internally scrolled Full window that were still below the viewport's 80px exclusion. `c14dc20c` seats the actual window against the reading inset and uses the visible marked context for lower-fold clearance; the full context stays above the controls. Five diagnostic fixtures have 63 sampled words, zero offset misses and zero cut samples. The exact public REACH pose reproduces the old failure and passes after the repair. The lower edge mask remains a readability limitation and is still scored partial contrast.

A second real race was independent of those offsets: tokens arriving after Reveal dropped the window and moved the word/definition below the grade bar (1371/1411px against a 640px bar). `a5aa8c1a` preserves the reading window and scroll when actual token markup arrives. The unchanged held-response regression now passes on clean `2d3ed3d1`: 59 tokens, same card/text/ledger; term/definition remain 433.59/473.28px above the 639.95px bar, and the marked word remains in the window. This proves the public late-loading behavior, not a source-text test. Before/after failures and natural-flow/cut-context failed alternatives remain intact in R5.

`source-continuity-v7-v11.json` identifies exactly four changed artifact files: corridor.js, decks/player/mount.js, register.css and the generated sw.js. All 21,188 other files and compiled modules are identical. Earlier font-byte, narration coverage and UI material measurements apply to those identical bytes; the previously omitted Undo glyph is a separate actual miss described below; earlier room/card timing observations do not become fresh c14 evidence by that comparison. A subsequent `source-continuity-v11-v12.json` records only player mount, player CSS and generated sw.js changing for the Undo repair; all 21,189 other files and compiled modules remain identical. Fresh v12 captures and suite receipts are listed below. The invariant audit `identity-scope-final-v12.json` preserves the FSRS pin, engine, four deck bodies except display titles, 22 storage/record constants, two cloze templates and N2/N1 source.

The fresh response font records exposed one omitted control: U+21B6 in Undo used native Apple SD Gothic Neo after fonts had loaded, in 13 prior v7 samples and 17 c14 samples. Bundled Noto Serif declared the range but did not actually supply that glyph. Plain `ひとつ戻す` / `Undo last answer` eliminates the decorative arrow in both real consumers, retaining ID, callback and visible words. Live trusted EN/JA grade/remove Undo actions restore the exact prior card and ledger with zero native glyphs. Its 41.59375px height also missed the 44px floor. A min44 diagnostic then found the removal toast moved Undo beneath the independently sticky Reveal button: all five points were obstructed at 390; three hit Reveal and two hit tabs at 320. Actual minimal scroll (52/73px) restored all40 trusted points, but the live docked repair passes all40 trusted centre/corner actions at scrollY0 across EN/JA ×320/390 ×grade/remove, with exact card/ledger restoration, zero native glyphs and zero overflow. Undo is 44px tall and has 16px clear space before Reveal. The candidate and then clean production proofs use no text/CSS overrides. `undo-production-clean-v12/summary.json` verifies 40/40 owned trusted actions and exact card/ledger restorations on clean `2d3ed3d1`, with height 44px, minimum width 94.890625px, gap 16px, scrollY0, and no native glyphs/overflow. The full restored Kotoba suite passes in 109s. All failed and natural-scroll receipts remain historical; no claim that a CSS minimum alone proved actual ownership is made.

R5-13 remains a product decision: joining a place/company name to a following graded katakana noun can remove that noun's lookup, Save and learning mark. The native review counted 359 affected runs among 400 joined archive runs; the curated shelf has 15 joined runs, mostly names. John must choose whether graded words stay separate or current joining is kept. R5-11 also remains pending: clear the active lookup when closing Shelf Tools, or keep Tools open. Both findings were relayed in full and no answer was inferred. R5-15 is informational: a single desktop deck-list exit measured holdScreen at 39.7ms versus 8.1ms baseline over 12,781 cloned nodes; the review's phone multiplier is an unmeasured inference. This is separate from lookup and Reveal timing.

### Check 14: random annotation audit

`numbers-summary-v12.json` uses recorded seed `5f2f9bba320a90a0fc364e4bc8d85314` and Python `Random(int(seed,16))`, sampling without replacement. The typed census covers UI titles, headers, captions, counts and metadata, including word JLPT levels; paragraph corpus numerals are learning content. A new daily article after midnight introduces corpus numerals into the unchanged raw probe. The complete raw pool and 53 mixed-scope selections remain preserved. Before the separate complete typed draw, all 117 raw root candidates are classified: 91 UI candidates and 26 paragraph exclusions (two Shelf lede, six Reader, six Popup, twelve Sentence). Each exclusion retains actual DOM/source. Popup's “kettle lid radical (no. 8)” is eligible metadata, independently traced to kanji[亠].rad=8 and its meaning. This classification follows the earlier UI-caption policy; it is not a selective sample retry.

The same seed draws once from the full typed pool, yielding **50 UI annotations across 19 states**, all independently traced. Door, Settings, Popup and Sentence have fewer than three; Popup has two rather than the historical one. No third number is invented. The original v3/v4/v7 pools and selections remain. The initial unchanged copy of the old literal-equality proof failed on Today text when Saturday 10 October became Sunday 11 October; its script/log remain intact. The fresh proof derives actual dates, article and caption values from their real consumers, with no production/verifier edits or resampling. Visible intervals below are minutes/days, separately proved from raw scheduler milliseconds.

| State | Actual selected numbers and traced source |
|---|---|
| Door | **5** — Actual captured record at captured Date: 3 due + 2 started fresh; unchanged todayQueue.order |
| Today | **2026** — Captured dateMs rendered local Asia/Tokyo by today-date; **70** — data/share_alike/kanji.json radicals[言].kanjiCount; unchanged todayHook/wwPartCap; **5** — Actual captured 3 due + 2 fresh; unchanged todayQueue.order.length |
| Close | **01** — max(1,round((rv.t1-rv.t0)/1000)) second component; normalized source clock nodes match; **2026** — data/articles/index.json articles[id=mext:b_menu-houdou-mext_01683].title; **5** — Actual five durable revlog rows from five real Easy grades in captured record |
| Today after | **4** — Actual captured saved-word kanji intersect data/share_alike/kanji.json kanji[].parts containing日; unchanged wwMine/wwPartMembers; **1** — Normalized renderTodayLine: actual stop-read DOM is conditional on a real selected article and emits exactly1; **5** — Actual captured learner record taken.length; renderChrome tray badge |
| Me | **4** — ME_N1_SITTING configured2027/July; unchanged meN1Sitting first-Sunday calculation; **2027** — ME_N1_SITTING configured2027/July; unchanged meN1Sitting first-Sunday calculation; **11** — Actual earliest durable revlog timestamp rendered local Asia/Tokyo by meDays/meDate |
| Settings | **5** — Actual captured learner record taken.length; renderChrome tray badge |
| Words | **4** — data/share_alike/kanji.json kanji[日].st; actual node/legend owner日; **4** — data/share_alike/kanji.json kanji[日].st; actual node/legend owner日; **7** — data/share_alike/words.json words[七日].g; unchanged wwShort caption |
| Learn | **2** — decks/n2/deck.json actual titleEn N2 level identifier; **6** — guided/sets/n2-living-thread-01.json questions.length; **15** — Fresh independent frozen engine buildQueue(emptyState n2,captured Learn Date,newPerDay15,skipFor read).fresh.length |
| Shelf | **2026** — data/articles/index.json articles[id=jawiki:5294446].date; **120** — data/articles/index.json:126 entries minus6 adaptations whose originals stand beside them; unchanged shelfStories; **5** — Actual captured learner record taken.length; renderChrome tray badge |
| Reader | **5** — Actual captured learner record taken.length; renderChrome tray badge; **27** — data/articles/index.json articles[id=jawiki:5294446].date; **2** — data/articles/index.json articles[id=jawiki:5294446].title; actual Reader heading |
| Popup | **8** — data/share_alike/kanji.json kanji[亠].rad and .m; actual mini-kanji-part-meaning metadata caption; **5** — Actual captured learner record taken.length; renderChrome tray badge |
| Sentence | **5** — Actual captured learner record taken.length; renderChrome tray badge |
| Entry | **2** — data/share_alike/dict-v2/index.json canonical rows whose writtenForms contain市 and readingWrittenScopes permit市; dictionaryHomographChoices dedup tuple; **4.0** — data/share_alike/dict-v2/index.json source.licence; **1** — data/share_alike/dict-v2/07.json canonical seq1308080 first visible sense; unchanged renderDictionaryDetails senseIndex0+1 |
| kotoba-mine/home | **503** — decks/kotoba-mine/deck.json: sum(words[].cards.length); **0** — engine.wordStatus(difficult).length; **0** — engine.wordStatus(known).length |
| kotoba-mine/front | **1** — ui.pos+1; first independently queued card; **15** — engine.buildQueue.queue.length; **N1** — decks/kotoba-mine/deck.json: words[id=km-064].level=N1; render calls levelChip(word.level) |
| kotoba-mine/back | **10** — engine.preview pinned scheduler.repeat ledger.cards[km-064-1] at 2026-10-10T00:00:00.000Z gives 600000ms; player fmtWait renders 10 min; **2** — player otherPassages: words[id=km-064].cards filtered id!==km-064-1; exact IDs km-064-2,km-064-3; **1** — engine.preview pinned scheduler.repeat ledger.cards[km-064-1] at 2026-10-10T00:00:00.000Z gives 60000ms; player fmtWait renders 1 min |
| n1/home | **666** — decks/n1/deck.json: words.length; **0** — engine.wordStatus(known).length; **15** — engine.buildQueue.queue.length |
| n1/front | **15** — engine.buildQueue.queue.length; **N1** — decks/n1/deck.json: words[id=nn-67f6fe4a2f].level=N1; render calls levelChip(word.level); **1** — ui.pos+1; first independently queued card |
| n1/back | **10** — engine.preview pinned scheduler.repeat ledger.cards[nn-67f6fe4a2f-ca1c2c4f] at 2026-10-10T00:00:00.000Z gives 600000ms; player fmtWait renders 10 min; **1** — engine.preview pinned scheduler.repeat ledger.cards[nn-67f6fe4a2f-ca1c2c4f] at 2026-10-10T00:00:00.000Z gives 60000ms; player fmtWait renders 1 min; **6** — engine.preview pinned scheduler.repeat ledger.cards[nn-67f6fe4a2f-ca1c2c4f] at 2026-10-10T00:00:00.000Z gives 360000ms; player fmtWait renders 6 min |

The fresh actual Close clock is independently bounded by passive trusted events and DOM arrival: lower 688ms (last grade − first front), upper 747ms (Close DOM − Start click), yielding displayed 0:01 under the minimum-one-second rule. The raw Today-to-Close capture delta is 1,412ms; no private rv timestamp is invented. Twenty numeric AST nodes and ten data/engine/deck hashes match the preserved earlier proof; whole corridor.js and player mount are explicitly not byte-identical. The eligible typed pools and one same-seed draw are independently refreshed on v12. Actual records, captured browser dates, independent N2/player queues, scheduler previews, literal UI text, corpus classifications and source hashes are retained in `numbers-final-v12` and `cards-final-v12/numbers`. The full50-row source table including raw/typed indices is `numbers-final-v12/ui-proof-table.md`; all19states/50selectedUIvalues pass independent derivation with errors absent. The mixed53 proof also passes in its explicitly separate scope. Six-card census retains no uncatalogued UI values; learning prose numerals remain explicitly excluded.

### Five bar questions, after

| Room | Dōgen | Musashi | Bashō | Hakuin | Anime masters |
|---|---|---|---|---|---|
| Door | Yes: the touched word is the practice. | Partly: silent glyph controls still need learned familiarity. | Yes: a stable sky leaves one word encounter. | Yes: a real meaning answers the tap. | No: the pale day ground still lacks foreground weight. |
| Today | Yes: actual words and an actual queue are the work. | Partly: one Begin is clear; D7 retains the extra header doors. | Yes: the daily word changes inside a stable frame. | Yes: new and due cards are named honestly. | Partly: calmer signals and held arrival; the lower frame remains busy. |
| Today after | Yes: completed study remains real. | Partly: quiet retained doors still repeat the route. | Yes: the day and its word stay recognizable after study. | Yes: the completed ledger determines the visible state. | Partly: a held arrival, but no strong new silhouette for completion. |
| Close | Yes: kept words settle on a cleared surface. | Partly: the one body exit is clear; retained chrome still repeats Today. | Yes: the next concrete article leaves a useful moment. | Yes: kept/Again/time are actual outcomes. | Partly: earned words settle; article and result hierarchy could be sharper. |
| Shelf | Yes: a picture leads straight into real reading. | Partly: Tools now owns search; retained chrome still repeats Learn. | Yes: the actual first three stories change daily and stay stable today. | Yes: count, source and review state are true. | Partly: strong illustration and paper; upper instruments remain dense. |
| Reader | Yes: the actual story is the study. | Partly: metadata, version choices and the hint occupy the first frame. | Yes: the cabinet story and its city illustration leave a specific reading moment. | Partly: tested lookups preserve the line, but joined archive compounds can lose a graded word door under R5-13. | Partly: paper and image hold, but no approved listening completes the act. |
| Popup | Yes: touched word, meaning and parts form immediate practice. | Partly: Save has one owner; the retained background chrome remains. | Yes: the source word stays beside its exact sentence. | Yes: real meaning and honest misses help. | Partly: coherent bands and a real entrance; a busy article remains behind it. |
| Sentence | Yes: the whole sentence now uses the phone page. | Partly: tutor and practice still have equal visual weight. | Yes: the exact quote is retained, not recomposed. | Yes: recall, source and help are honest. | Partly: actions are reachable, but the long stack needs a stronger paused frame. |
| Entry | Yes: sourced meaning, examples and ancestry are one study surface. | Yes: one first-depth exit and reachable recursive targets have a purpose. | Yes: one exact entry remains recognizable through kanji and back. | Yes: ambiguity and absence are named rather than guessed. | Partly: good paper and indigo; long detail still needs a stronger hierarchy. |
| Learn | Yes: Begin opens real practice immediately. | Partly: preparation rows are gone; retained doors still repeat Learn. | Yes: actual learner/deck state changes what is next. | Yes: queue counts come from their own ledgers. | Partly: warm stage paper now holds in both nights; the later doors still crowd. |
| Kotoba home | Yes: the actual queue is one obvious Begin. | Yes: topics have their place in Settings, not above the first action. | Partly: honest counts and real words; the empty ground offers little lasting surprise. | Yes: 323/503 and new counts are actual data. | Partly: one coherent selected world, but the broad background remains underworked. |
| Kotoba front | Yes: recall remains whole, with no answer leaks. | Yes: Reveal has one purpose and the front stays inert. | Yes: an actual sentence gives the recall a moment. | Yes: the target and challenge are exact. | Partly: crisp carrier and smooth reveal, but the ground has little depth. |
| Kotoba back | Yes: meaning can be used immediately. | Partly: keyboard/gesture guidance and several folds still crowd the answer. | Yes: the sentence and target stay connected. | Yes: four real grade outcomes land clearly. | Partly: stable docks and selected materials; helper typography still weakens the picture. |
| N1 home | Yes: Begin is above the fold in the selected world. | Yes: list and preferences are secondary, topic choices live in Settings. | Partly: real counts sit in a stable but static frame. | Yes: 666 words/cards is the source census. | Partly: coherent paper/lacquer, with a sparse background. |
| N1 front | Yes: the passage itself asks for recall. | Partly: long fronts still reach the chosen shrinking-font floor. | Yes: historical content has substance. | Yes: no answer or reading appears before Reveal. | Partly: strong carrier, but a tall passage leaves little breathing space. |
| N1 back | Yes: definition moves the same practice forward. | Partly: repeat guidance and folds remain dense. | Yes: passage, definition and recursive word doors connect. | Yes: grade intervals come from the actual pinned scheduler. | Partly: reveal holds scroll, but long context and its fading edges remain weak. |
| Words | Yes: following a relationship is language practice. | Partly: one shape opener and one signal; the search/lens slab still takes space. | Yes: following a node re-centres the actual word and keeps the walk. | Yes: stroke/family/record numbers are actual. | Partly: the graph is clearer; the upper frame is still crowded. |
| Me | Yes: the book shows real study rather than invented rewards. | Partly: retained header/tab repetition remains. | Yes: a stable yearbook records changing actual practice. | Yes: expected test date is labeled expected and evidence is real. | Partly: calendar and earned rows now respond, but the book still needs richer depth. |
| Settings | Yes: every choice changes the actual app. | Partly: duplicate choices are removed; retained navigation still repeats. | No: generic preferences leave little memorable moment. | Yes: capability and absence labels are honest. | No: a weak paused picture with little identifiable city layer. |

The three rooms furthest from the bar are **Door** (worked foreground/background relief and a less pale day picture), **Settings** (a distinctive purposeful frame, a memorable moment and a city layer), and **N1 back** (less repeat guidance, clearer long-context hierarchy, less pale edge fade and more room for dense-prose touch corners). Approved article/card audio remains a content gap across nine states, beyond these three visual rooms.

### Check 19: approved voice coverage

The fresh v12 journey and audio tour use `jawiki:5294446`, *The Reshuffled Second Takaichi Cabinet* (第2次高市内閣 (改造)), after the daily shelf rotates across midnight in Tokyo. It has no approved narration and no Listen control; the actual page says **No recording for this article**. The earlier v7 Syrian article `global-voices:2026-09-28-65726` also has no approved narration; that earlier observation remains historical. The popup, selected sentence and full entry do not have an approved recording either. The Kotoba and N1 player flows contain no card-audio implementation: both requested fronts/backs are silent. Consequently check 19 remains F in nine states: Shelf, Reader, Popup, Sentence, Entry, and both requested deck fronts/backs.

The saved-word review's five actual reading buttons (世界, 時間, 音楽, 技術, 日) each produce **No Kore recording**, with zero native playback and zero device TTS. The final layout keeps the reading together, the status on its own line, and the voice target 44px after activation. This truthful absence is not a passing voice check.

The historical `audio-final-v7/approved-coverage.json` records **8,407 word entries, 77 passage entries in the sentence manifest, and 1,400 sentence cues: zero approved Kore/Charon entries/cues**. The manifest voices are Ami, Metan, Zundamon and Takehiro; cues are Ami. Seventy-seven is a passage census, not a clip count. The manifest/audio bytes remain identical across the recorded v7→v11→v12 build continuity, so this coverage remains unchanged; it is not relabeled a fresh v12 census. `audio/article-narration.json` is absent. The fresh actual native media events, screens and recording are in `audio-final-v12/audio.json` and its associated assets. The playback verifier's explicitly synthetic approved fixture demonstrates behavior only, not shipping coverage. No substitute narration was added.

### Check 20: measured speed on this Mac

Five fresh Chromium contexts at 390×844, service workers blocked, measured only after all task-owned heavy checks and recordings finished (the remaining worker work was lightweight runtime-only numeric proof). Hardware: M5 Max, Mac17,6, 128GiB, macOS 26.5.1 (25F80); Chrome for Testing 153.0.8010.12, metadata read after timing. OS/local-server caches may be warm and unrelated system activity is uncontrolled. This is browser-context cold start, not reboot/network-cold or a recent-iPhone result. Timing begins at in-browser `HTMLElement.click()` dispatch on the actual visible Today word or player Reveal consumer, excluding physical pointer and automation dispatch latency. Separate continuity films use trusted physical clicks. The unchanged runner SHA is `58382897fe1b82886f973c34842fc31de48d0d988999cb7a7ff58987a36f549c`. `speed-final-v12/{diagnostic,summary-compact}.json` retains exact identity, witnesses, events, per-node RAF/opacity and font observations.

| Measurement | Median ms | Range ms |
|---|---:|---:|
| Cold navigation → body-ready DOM insertion | 462.4 | 444.4–467.9 |
| Cold navigation → locator-observed body-ready upper bound | 474.8 | 466.4–477.4 |
| Lookup dispatch → core-gloss DOM insertion | 28.2 | 26.3–29.1 |
| Lookup dispatch → core first positive-opacity RAF | 57.3 | 54.6–58.4 |
| Lookup dispatch → following positive core RAF | 78.1 | 68.0–81.4 |
| Lookup dispatch → core opacity ≥0.99 RAF | 248.3 | 247.9–249.6 |
| Lookup dispatch → full-sense DOM insertion | 317.9 | 293.5–321.3 |
| Lookup dispatch → full first positive-opacity RAF | 318.1 | 293.7–321.4 |
| Lookup dispatch → full opacity ≥0.99 RAF | 318.1 | 293.7–321.4 |
| Lookup dispatch → locator-observed full-sense upper bound | 371.8 | 355.8–376.4 |
| Reveal dispatch → answer DOM insertion | 33.9 | 32.9–36.6 |
| Reveal dispatch → answer first positive-opacity RAF | 65.7 | 65.5–65.9 |
| Reveal dispatch → following positive answer RAF | 82.5 | 81.1–82.7 |
| Reveal dispatch → answer opacity ≥0.99 RAF | 215.6 | 214.6–215.9 |

The fresh Sunday witness is 洒落る → “to dress stylishly”; full senses and the N1 交渉 answer are separate actual text witnesses. The earlier v7 witness was 打撃; these are different daily inputs, so the changed medians alone do not prove a performance regression or improvement. Initial core gloss DOM insertion meets the 100ms target on this Mac; full senses at 317.9ms exceed it. First positive alpha and a following RAF are paint opportunities, not proof of compositor painting or human readability. The body-ready marker is a startup milestone, not a fully painted screen. **Check 20 stays partial in every state** because the recent-iPhone measurement remains unperformed.

All five continuous traces have zero sampled missing-meaning frames or opacity drops after initial positive presence. Core opacity reaches 0.99 in all five; the full node starts at 0.998811–1 and continues the original arrival. Maximum sampled RAF interval is 28.3ms, so sub-frame changes cannot be excluded. The historical v7 independent normal/reduced sheet/scrim films preserve an actual CSS animation start across asynchronous replacements; the original v6 two-reset failures remain intact. The v12 timing is a new bounded observation, not a claim of continuous human-readable paint.

Fonts are loading at body ready and core/answer insertion in all five cases. They remain loading at every first positive core RAF; they are loaded at full-sense insertion and at the first positive answer RAF. The separately body-ready-registered `fonts.ready` milestone is 484.2ms [480.1–493.1] after navigation, 23.0ms [21.8–36.9] after body-ready insertion. Later glyph use starts new batches: lookup completion medians 59.4ms and 103.2ms; answer 56.7ms. No font wait changes the timed action, and set readiness does not identify the face painted in a specific frame. Actual settled glyph ownership is proved separately in the stated font/response scopes.

Locator polling yields upper bounds, including median 55.3ms full-sense overhang [34.5–79.7]; it is not exact insertion or product latency. The initial dictionary index is 17,599,909 bytes: internal worker read median 87.0ms and parse 92.7ms, worker-ready receipt 292.9ms after dispatch, then full-sense DOM 24.5ms later. These observations support initial dictionary loading as a large part of the full-data delay. Whole-page finite settling is 998.8ms [982.2–1000.2] for lookup (including underlying Today motion) and 265.8ms [265.0–266.3] for Reveal; those values do not measure dictionary readiness. All five contexts have no observed page errors or font errors. Historical v4/v6/v7 timing remains unchanged.

### Files and invariant boundaries

Production changes are in `prototypes/corridor/corridor.js`, its room/material/motion sheets, `decks/player/mount.js`/`player.css`, deck display titles and their existing build scripts. The new motion sheet is included in index, service worker and the runtime asset census. Shelf and sheet verifier helpers follow the actual visible owner of an action. Individual label/layout pins are recorded in `docs/redesign/VERIFIER_CHANGES.md`; data, source-return, durable capture, scheduling, focus, hit size, and negative controls are retained.

The pinned FSRS data and player engine are byte-identical to the baseline; N2/N1 source has no changes. All four shipped deck JSON bodies are identical except display titles: card IDs, Anki IDs, passages and scheduling content are unchanged. Storage/record markers and bunki-cloze keys remain; real storage-integrity and source-return verifiers pass. The final invariant receipt is `identity-scope-final-v12.json`; the font/target label repair changes no protected data or record contract.


### Final verification

All **29 required suites, three direct checks and the full language tour pass (33/33)** on clean source head `2d3ed3d10fb06bab934fca1e1cfedd723940fe43`, artifact `c9bf8817b4f74c6c109f20048b2acb60311ab347e58435d8406c03b91743747e`, source/assets `4d0609348043656cd46317f44d3b99c87e852a6c21c300c0a3ddd36fb6691cdd`. All four supplemental checks and three focused recovery checks pass (40 distinct checks). The report-only delivery commit is tied to these checked bytes by `source-continuity-delivery-v12.json`; tests and application source do not change. Logs/TSVs are in `R5/verify/{root-v12,blocking-v12,cards-v12,seeded-v12,design-v12,direct-v12}`; `final-v12-rollup.json` retains every attempt and identity, with prior failures preserved separately. No inherited exception is needed. The initial runtime collection accidentally globbed two dirty candidate folders; its preserved snapshot and collection-scope note show why they are outside the six canonical lanes. No test or result was changed.

| Verifier | Result | Seconds |
|---|---|---:|
| verify-corridor | P | 295 |
| verify-corridor-storage-integrity | P | 1 |
| verify-corridor-accessibility | P | 43 |
| lint-ui-language-core | P | 103 |
| verify-relief | P | 7 |
| verify-theme-consistency | P | 81 |
| verify-writing-room | P | 48 |
| verify-kotoba-mine | P | 109 |
| verify-n2n1-decks | P | 36 |
| verify-personal-collections | P | 8 |
| verify-dojo-door | P | 60 |
| verify-guided-session | P | 104 |
| sw-shell | P | 1 |
| test-navigation-returns | P | 0 |
| verify-srs-today | P | 259 |
| verify-experience | P | 162 |
| verify-drift-hunt | P | 182 |
| verify-design-reader-shelf | P | 133 |
| verify-reader-doors | P | 106 |
| verify-reader-lookup | P | 39 |
| verify-playback | P | 41 |
| verify-annotation-lookup | P | 24 |
| verify-vocabulary-chooser | P | 35 |
| verify-shelf-search | P | 23 |
| verify-sentence-drafts | P | 317 |
| verify-bundled-listening | P | 66 |
| verify-listening-failures | P | 6 |
| verify-corridor-doors | P | 54 |
| verify-pr77-ports | P | 161 |
| redesign-foundation | P | 34 |
| redesign-docks | P | 54 |
| today-sky | P | 79 |
| language-full | P | 309 |
| reader-gloss | P | 238 |
| japanese-lookup-unit | P | 1 |
| search-lenses | P | 10 |
| changed-runtime-lint | P | 3 |
| skip-ui (recovery check) | P | 17.64 |
| assessment-dojo-label (recovery check) | P | 4.16 |
| approved-voice (recovery check) | P | 0.24 |

Core: 259/259; accessibility: 53/53; guided: 211/211; writing: 51/51; experience: 42/42; reader/shelf design: fresh unchanged full solo run 49/49 with original G6 geometry intact; reader doors: 93/93 with negative controls; reader gloss: 84/84; docks: 24 Chromium/WebKit cases; Today sky: 81/81; full language: 230 visits, 11,743 inspections, zero issues. The formerly inherited corridor-doors and PR77 suites pass **68/68 and 56/56**. Their stale fault-route and EN label pins are logged with positive interception and unchanged behavioral/negative assertions; this does not count as a product improvement. The navigation unit check retains four exact assertions; recovery checks cover SKIP 58/58, public written-assessment/catalog labels, and approved voice 11/11.

The initial v6 reader/shelf run was **48/49**, failing G1 phone because its fixed 250ms sample saw no third-word popup. The failure screenshot already contains the correct ジャラマナ popup. A passive unchanged actor repeat measured actual insertion at 221.8ms, the correct trusted word target, worker readiness at 214.2ms and no geometry drift/errors. The original latency was not observed; concurrency and first dictionary initialization are a supported inference. The complete unchanged rerun is **49/49**. No assertion, fixed wait or production source was changed to obtain it; both runs and the diagnostic remain. This is a timing limitation of that fixture and lookup path, not a claim of zero historical failures.

The first required `$no-mistakes` run ended **failed** at its configured repair timeout; the second ended **failed** during re-review with API ENOTFOUND after committing the room repair and restoring strict verifier pins. Both histories and custody recovery are described above. A fresh required run follows these completed checks with the full original intent, skipping rebase/push/PR/CI for local-only delivery. Its exact result is retained in R5 and reported at delivery; this document does not claim the gate passed. **R5-11 and R5-13 remain pending John's product decisions** about Shelf Tools and graded words within joined archive names. No approve/fix/skip or unattended consent is inferred. This branch is not pushed.


### October 11 terminal audit follow-up

The fresh required run `01M4K6Z3DS734DHK7GXFBF3K2K` ended **failed** at its configured 30-minute review timeout, with its agent still producing output. No structured findings, gate approval, fix commits or completed test/lint phases were returned. Structured branch_sync reports user_owned/equal at `c2c8f031`; no sync or recovery is needed. Its terminal full log is `no-mistakes-review-final-v12-terminal-full.log`. No gate pass is claimed.

The static audits expose limits in the v12 evidence: actual tracked Kotoba standalone pages still embed the old player; the reduced-motion player verifier accepts settled short non-opacity effects; offline uncached font chunks fall back to OS fonts; two UI glyphs and canvas fonts were outside the settled font tour; JavaScript creates colour/stroke motion outside the clean CSS audit; and long-front/nonzero-safe-area Undo plus an open reduced-motion outgoing fold were outside the earlier physical poses. Repairs and new runtime evidence follow. V12 green receipts remain historical observations of their exact source and tested scope, not proof that these additional cases pass. The after-score table must be reassessed before final delivery.
