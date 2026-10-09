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
| 14 | Real annotation | P | P | P | P | P | P | P | P | P | P |
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

Corrected baseline: 295 P, 93 partial, 68 F across 456 room/check cells, including non-applicable P cells. The first review commit recorded 69 F. A subsequent shipped-source comparison and runtime display probe proved its Door/check-2 failure was mistaken: both baseline and candidate display **Radicals** in EN, with the Japanese heading hidden. The mixed heading is only in the unshipped donor. Evidence: `R5/shelf-onejob/radicals.json` and `source.json`. This correction is not counted as a fixed failure. No single percentage is a substitute for the blocking failures.

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
| 14 | S record snapshots and C deck source traces below. Empty rooms with fewer than three numbers are explicitly recorded; no numbers are manufactured to satisfy the sample count. |
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
| Learn | Yes: the next card grounds the practice. | Partly: repeated deck doors and unbuilt test rows remain. | Yes: real learner state changes the stage. | Yes: saved/deck ledgers are not added together. | Partly: proscenium holds, mint in 殻 breaks the paper. |
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
