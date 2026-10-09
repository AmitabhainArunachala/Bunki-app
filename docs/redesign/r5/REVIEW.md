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

The corrected before record above is retained. After scores aggregate the same 19 states, the worst of both widths, both languages and all three selected worlds. They are judgments supported by the final stills, actual videos and checks; the 456 cells include non-applicable P cells. Check 25 remains for a person.

| Result | Before | After |
|---|---:|---:|
| P | 294 | 358 |
| ~ | 93 | 87 |
| F | 69 | 11 |

41 F and 23 partial cells became P; 17 F became partial; 11 F remain. No P was downgraded. The corrected Door language score is excluded from these improvements.

| # | Check | Door | Today | Today after | Close | Shelf | Reader | Learn | Words | Me | Settings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | One primary | P | P | P | P | P | P | P | P | P | P |
| 2 | EN purity | P | P | P | P | P | P | P | P | P | P |
| 3 | JA purity | P | P | P | P | P | P | P | P | P | P |
| 4 | Room identity | P | P | P | P | P | P | P | P | P | ~ |
| 5 | Tap depth | P | P | P | P | P | P | P | P | P | P |
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
| 7 | Hit size | P | P | P | P | P | P | P | P | P |
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

### Evidence for the after scores

| Checks | Final evidence and limits |
|---|---|
| 1, 12, 13 | Today has one Begin; current stops and the hook are neutral ink. Words has one shape opener and one saved-node signal. Shelf Tools owns its search field; the header field is hidden while Tools is open. Popup owns Save; the reader header Save is hidden until dismissal. First-depth entry has one visible Close; deeper Back and Close have different destinations. Settings owns its world/language controls; Review pace and Backup have distinct actual targets. D7 retains the quiet Learn/Today header doors; those redundancies remain partial. Sentence tutor/practice weights and secondary teaching hints remain partial. |
| 2, 3, 11, 15 | Actual 230-state EN/JA tour and core language checks. EN month labels are English; Japanese interface headings are excluded from the prose enhancer. Learn offers only ready practice/tests. Audio absence says there is no recording. Dictionary English meaning remains learning content in JA. |
| 4, 18 | cards-final-v3/world: 24 actual world/width/language profiles × 3 states, plus 24 independent stored-look preservation cases. Both decks default to the selected app world; explicit player preferences remain. 殻 Learn uses warm paper, not mint. Settings remains a weak generic frame. |
| 5, 7, 16 | Real card-to-own-word/other-word paths: kanji ≤1 tap, part ≤2, caller preserved. Home doors, inline tokens and selected sky words have physical 44px targets; tiny interface lookups are removed. Both fronts have zero answer, reading or interactive descendants before Reveal. Final missing-voice activation probe additionally checks the full 44px voice button after the note appears. |
| 6, 23 | SPEC documents three meaningful responses in every state. responses-final-v4 has 26 actual non-player clips in both modes; cards-final-v3 has four actual films and 36 semantic actions. Native arrival captures only the departing main; incoming controls are live during its 220/80ms fade. Fourteen early physical hits succeed before native finished. Unsupported-native route/state/focus remains synchronous with actual 220/80ms opacity intermediates. CSS AST: 20 shipped sheets, zero forbidden properties, 13 ambient loops with minimum 6s. `journey-final-v4` includes 12 video frames, including Follow, recenter, arrival and reveal intermediates. Its original blank card frame and first sheet are preserved; the corrected sheet uses an actual 230ms mid-fade video frame, not a staged still. The four player films remain actual v3 recordings: `cards-final-v4/source-comparison.json` proves player JS, CSS, engine and data byte-identical to that captured build. |
| 8 | Worst measured card UI text 5.2294:1; Focus passage 13.7079:1, replacing the failed 0.38-opacity text. Missing-voice notes additionally measure 8.8201:1 (texture minimum 8.0896:1), and the day-stage report links at least 11.9118:1, verified in `reading-contrast-final`. All ordinary accessibility contrast probes pass. Textures, gradients, pale edge fades and other subdued edge treatments prevent an all-world, every-edge claim; every room stays partial. |
| 9, 10, 17, 22 | `shots-final` has the same 36 fresh stills; `seeded-final-v4` has 132 seeded poses and 12 completed-session Me states: no horizontal overflow at 320/390. Full-page sentence cards use document flow, not an inner scroller. Original expanded-pane geometry assertions, quote/source invariants and 24 supplemental cases pass. Door relief and the city layer in Settings/deck frames remain partial. |
| 14 | Fixed recorded random seed, all visible numeric candidates retained; 49 actual samples across 19 states traced independently below. Four states have fewer than three; no third number is manufactured. Unsupported “~15 min” estimates were removed. Queue captions now say cards, because the real queue includes new as well as due cards. |
| 19, 20, 21 | Measurements and five per-room judgments below keep absent approved audio, untested iPhone speed and visual weaknesses visible. Passing software checks does not certify John’s felt bar. |
| 24 | Actual first-three daily shelf picks now rotate deterministically, stay stable within a day, remain real articles, and differ across the sampled three days. The full Today next-story title is visible and the session close opens a concrete next reading. |

### Defect disposition

| Original defect | Result |
|---|---|
| 1. Cards: a different world | Fixed: both requested deck flows use the selected app world by default; eight explicit stored player looks are preserved. |
| 2. Cards: blocked word-to-kanji path | Fixed: own and other words open their real entry with one-tap kanji and two-tap part access, then exact caller return. |
| 3. Tiny targets and dim Focus | Fixed: UI prose lookup is excluded; live learning tokens and home doors meet 44px; Focus meets measured text contrast. Audio-note activation no longer shrinks its button. Broader contrast remains partial. |
| 4. Mixed interface languages | Fixed: EN months are English. Universe label was already Radicals in the shipped baseline; the initial failure was corrected, not counted as a fix. |
| 5. Promised Learn rooms | Fixed: unavailable preparation rows are removed; real guided practice/tests start their existing consumers. |
| 6. Cuts and reveal jolt | Fixed: live arrival fades, held inert outgoing frames, fixed docks, unchanged reveal scroll, and opacity-only reduced responses; all authored animation obeys the property and duration rules. |
| 7. Nested sentence window | Fixed: expanded geometry reserves the actual card; genuinely tall cards use the page and restore the word and article position on Back. |
| 8. Duplicate Save and exits | Fixed: popup owns Save; first-depth entry has one Close. D7 header exceptions remain visible and keep general redundancy partial. |
| 9. Competing signals/clipped reading doors | Fixed: one Begin/saved-node signal, neutral hook/current stop/lens, one shape opener, and full next-reading title. The search/web first frame still has considerable chrome. |
| 10. Mint 殻 Learn paper | Fixed: warm stage paper in 殻. |
| 11. Builder labels/plurals | Fixed: Today bookmark, Reading check, Cards due, Kodansha number, Find by shape, Words visited, plain deck names and Save; singular card/answer forms. Verifier pins are individually logged. |
| 12. Missing voice | Unfixed: no approved Kore/Charon assets for the toured article/card content; no substitute or fabricated narration is shipped. Exact absence is visible and measured. |
| 13. Fixed first-three shelf stories | Fixed: three daily first stories rotate through actual recent non-glossary articles with stable same-day selection. |
| 14. Incomplete authored detail/bar | Partly fixed: all 19 states now have three recorded sub-second meaningful responses and a written specification. Door foreground depth, Settings identity/city and dense card-back guidance still need visual authorship. No room is awarded five unqualified yes answers. |

### Check 14: random annotation audit

`numbers-summary-v4.json` uses recorded seed `5f2f9bba320a90a0fc364e4bc8d85314` and Python `Random(int(seed,16))`, sampling without replacement. The census covers visible UI titles, headers, captions, counts and metadata, including word JLPT levels; paragraph corpus numerals are learning content. An earlier census omitted card levels, the N1 title level and a folded example count. The original v3 selection and prior v4 pool remain; the amended complete pool receives one complete same-seed redraw, with no selective resampling. The corrected result is **49 annotations across 19 states**, all independently traced. Only Door, Settings, Popup and Sentence contain fewer than three UI numbers. Both deck fronts contain three. Unsupported time estimates have been removed; their original receipt remains. Visible intervals below are minutes/days, separately proved from raw scheduler milliseconds.

| State | Actual selected numbers and traced source |
|---|---|
| Door | **5** — Actual captured record:3SRS due +2never-reviewed saved words; actual todayQueue.order.length (fewer than three actual annotations) |
| Today | **2026** — Captured dateMs rendered through local Asia/Tokyo Date today-date; **70** — data/share_alike/kanji.json radicals[言].kanjiCount; todayHook/wwPartCap; **5** — Actual captured record3due+2fresh todayQueue.order.length |
| Close | **01** — Real clock max(1,round((rv.t1-rv.t0)/1000)) second component; **2026** — data/articles/index.json mext:b_menu-houdou-mext_01683.title; **5** — Actual five durable revlog rows from five real Easy grades in captured record |
| Today after | **4** — Actual saved-word unique kanji intersect kanji[].parts containing日; wwMine/wwPartMembers; **1** — Actual selected unread article object; renderTodayLine read-stop census; **5** — Actual captured learner record taken.length; renderChrome #tray badge |
| Me | **4** — ME_N1_SITTING year2027 month6 and firstSunday calculation gives2027-07-04; **2027** — ME_N1_SITTING expected target year2027; **10** — Actual earliest durable revlog timestamp rendered local Asia/Tokyo first-practice date |
| Settings | **5** — Actual captured learner record taken.length; renderChrome #tray badge (fewer than three actual annotations) |
| Words | **4** — data/share_alike/kanji.json kanji[日].st; **4** — Legend uses actual central kanji[日].st, same source as node; **7** — data/share_alike/words.json words[七日].g |
| Learn | **2** — decks/n2/deck.json actual id/title N2, level identifier; **6** — guided/sets/n2-living-thread-01.json actual questions.length; **15** — Independent frozen engine buildQueue(emptyState n2,capturedDate,newPerDay15,skipFor read).fresh.length |
| Shelf | **1** — data/articles/index.json global-voices:2026-09-28-65726.readingFacets.jlpt; **120** — Actual126 article entries minus6paired adaptations via shelfStories; **5** — Actual captured learner record taken.length; renderChrome #tray badge |
| Reader | **5** — Actual captured learner record taken.length; renderChrome #tray badge; **1** — data/articles/index.json global-voices:2026-09-28-65726.readingFacets.jlpt; **1** — Actual Original version uses same article readingFacets.jlpt |
| Popup | **5** — Actual captured learner record taken.length; renderChrome #tray badge (fewer than three actual annotations) |
| Sentence | **5** — Actual captured learner record taken.length; renderChrome #tray badge (fewer than three actual annotations) |
| Entry | **4** — data/share_alike/dict.json words[郊外].jlpt; **4.0** — data/share_alike/dict-v2/index.json source.licence; **1** — Canonical seq1282490 actual first visible sense; renderDictionaryDetails senseIndex+1 |
| kotoba-mine/home | **0** — engine.wordStatus(difficult).length; **15** — engine.buildQueue.fresh.length; **503** — decks/kotoba-mine/deck.json: sum(words[].cards.length) |
| kotoba-mine/front | **N1** — decks/kotoba-mine/deck.json: words[id=km-064].level=N1; render calls levelChip(word.level); **1** — ui.pos+1; first independently queued card; **15** — engine.buildQueue.queue.length |
| kotoba-mine/back | **6 min** — engine.preview pinned scheduler.repeat ledger.cards[km-064-1] at 2026-10-10T00:00:00.000Z gives 360000ms; player fmtWait renders 6 min; **8 days** — engine.preview pinned scheduler.repeat ledger.cards[km-064-1] at 2026-10-10T00:00:00.000Z gives 691200000ms; player fmtWait renders 8 day; **N1** — decks/kotoba-mine/deck.json: words[id=km-064].level=N1; render calls levelChip(word.level) |
| n1/home | **0** — engine.wordStatus(known).length; **N1** — decks/n1/deck.json: titleEn prefix N1; **0** — engine.buildQueue.due.length |
| n1/front | **1** — ui.pos+1; first independently queued card; **15** — engine.buildQueue.queue.length; **N1** — decks/n1/deck.json: words[id=nn-67f6fe4a2f].level=N1; render calls levelChip(word.level) |
| n1/back | **10 min** — engine.preview pinned scheduler.repeat ledger.cards[nn-67f6fe4a2f-ca1c2c4f] at 2026-10-10T00:00:00.000Z gives 600000ms; player fmtWait renders 10 min; **15** — engine.buildQueue.queue.length; **N1** — decks/n1/deck.json: words[id=nn-67f6fe4a2f].level=N1; render calls levelChip(word.level) |

The actual close clock is checked conservatively: raw Today-to-Close capture delta 1,568ms includes the recorded post-close capture wait; subtracting only 500ms gives a maximum possible session duration of 1,068ms, which rounds to the shown one second under the real minimum-one-second rule. No private clock timestamp is invented. Actual records, fixed browser Date where used, independent N2/player queues, scheduler previews, literal UI text and source hashes are retained in `numbers-final-v4/manifest.json` and `cards-final-v4/numbers/manifest-amended-census.json`.

### Five bar questions, after

| Room | Dōgen | Musashi | Bashō | Hakuin | Anime masters |
|---|---|---|---|---|---|
| Door | Yes: the touched word is the practice. | Partly: silent glyph controls still need learned familiarity. | Yes: a stable sky leaves one word encounter. | Yes: a real meaning answers the tap. | No: the pale day ground still lacks foreground weight. |
| Today | Yes: actual words and an actual queue are the work. | Partly: one Begin is clear; D7 retains the extra header doors. | Yes: the daily word changes inside a stable frame. | Yes: new and due cards are named honestly. | Partly: calmer signals and held arrival; the lower frame remains busy. |
| Today after | Yes: completed study remains real. | Partly: quiet retained doors still repeat the route. | Yes: the day and its word stay recognizable after study. | Yes: the completed ledger determines the visible state. | Partly: a held arrival, but no strong new silhouette for completion. |
| Close | Yes: kept words settle on a cleared surface. | Partly: the one body exit is clear; retained chrome still repeats Today. | Yes: the next concrete article leaves a useful moment. | Yes: kept/Again/time are actual outcomes. | Partly: earned words settle; article and result hierarchy could be sharper. |
| Shelf | Yes: a picture leads straight into real reading. | Partly: Tools now owns search; retained chrome still repeats Learn. | Yes: the actual first three stories change daily and stay stable today. | Yes: count, source and review state are true. | Partly: strong illustration and paper; upper instruments remain dense. |
| Reader | Yes: the actual story is the study. | Partly: metadata, version choices and the hint occupy the first frame. | Yes: one real field in Syria can stay with the reader. | Yes: lookup and Save preserve the original line. | Partly: paper and image hold, but no approved listening completes the act. |
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

The three rooms furthest from the bar are **Door** (worked foreground/background relief and a less pale day picture), **Settings** (a distinctive purposeful frame, a memorable moment and a city layer), and **N1 back** (less repeat guidance, clearer long-context hierarchy and less pale edge fade). Approved article/card audio remains a content gap across nine states, beyond these three visual rooms.

### Check 19: approved voice coverage

The leading toured article is `global-voices:2026-09-28-65726`, *Solidarity fields in Syria: Reviving local seed production*. It has no approved narration and no Listen control; the actual page says **No recording for this article**. The popup, selected sentence and full entry do not have an approved recording either. The Kotoba and N1 player flows contain no card-audio implementation: both requested fronts/backs are silent. Consequently check 19 remains F in nine states: Shelf, Reader, Popup, Sentence, Entry, and both requested deck fronts/backs.

The saved-word review's five actual reading buttons (世界, 時間, 音楽, 技術, 日) each produce **No Kore recording**, with zero native playback and zero device TTS. The final layout keeps the reading together, the status on its own line, and the voice target 44px after activation. This truthful absence is not a passing voice check.

`audio-final-v4/approved-coverage.json` records **8,407 word entries, 77 passage entries in the sentence manifest, and 1,400 sentence cues: zero approved Kore/Charon entries/cues**. The manifest voices are Ami, Metan, Zundamon and Takehiro; cues are Ami. Seventy-seven is a passage census, not a clip count. `audio/article-narration.json` is absent. Actual native media events, screens and a real recording are retained in `audio-final-v4`. The playback verifier's explicitly synthetic approved fixture demonstrates behavior only, not shipping coverage. No substitute narration was added.

### Check 20: measured speed on this Mac

Five fresh Chromium contexts at 390×844, service worker blocked, measured after all task-owned heavy checks and recordings finished. Hardware: M5 Max, Mac17,6, 128GiB, macOS 26.5.1. OS/local-server caches may be warm; unrelated system activity is uncontrolled. This is browser-context cold start, not a reboot/network-cold or iPhone result. Actual visible dictionary-sense and answer text witnesses are retained, separately from the opening frame. `speed-final-v4/{summary,speed}.json` carries the exact build identity and raw timings.

| Measurement | Median ms | Range ms |
|---|---:|---:|
| Cold navigation → observed body ready | 332.0 | 326.9–332.6 |
| Lookup click → two RAF paint opportunities | 32.5 | 30.8–34.9 |
| Lookup click → locator-observed full-senses upper bound | 234.8 | 222.5–250.7 |
| Lookup click → all finite page animations settled | 832.1 | 814.9–833.1 |
| N1 Reveal click → two RAF paint opportunities | 32.9 | 31.8–42.9 |
| N1 Reveal click → locator-observed answer upper bound | 35.8 | 35.2–50.7 |
| N1 Reveal click → all finite page animations settled | 250.0 | 248.5–250.6 |

The Mac opening-frame responses meet 100ms, and observed startup meets 1.5s. The content observations above include Playwright locator polling and protocol overhead; they are upper bounds, not exact insertion or painting times. The lookup witness is the full dictionary senses, not its initial core gloss. A separate single passive diagnostic on this same pre-font build records core gloss insertion at 20.1ms, full-sense insertion at 228.1ms and a first full-sense geometry RAF at 228.6ms. That one sample is not the five-context median, and a geometry RAF precedes paint. The actual full-entry path includes first dictionary initialization; the diagnostic retains its event and resource timings. The lookup's global settling figure includes finite animations elsewhere on the page. **Check 20 remains partial in every state** because the required recent iPhone has not been measured. A fresh five-context passive observation on the repaired build will replace these old-build observations at final delivery; fast opening-frame numbers alone do not prove the lookup target.

### Files and invariant boundaries

Production changes are in `prototypes/corridor/corridor.js`, its room/material/motion sheets, `decks/player/mount.js`/`player.css`, deck display titles and their existing build scripts. The new motion sheet is included in index, service worker and the runtime asset census. Shelf and sheet verifier helpers follow the actual visible owner of an action. Individual label/layout pins are recorded in `docs/redesign/VERIFIER_CHANGES.md`; data, source-return, durable capture, scheduling, focus, hit size, and negative controls are retained.

The pinned FSRS data and player engine are byte-identical to the baseline; N2/N1 source has no changes. All four shipped deck JSON bodies are identical except display titles: card IDs, Anki IDs, passages and scheduling content are unchanged. Storage/record markers and bunki-cloze keys remain; real storage-integrity and source-return verifiers pass. The final invariant receipt is `identity-scope-final.json`.


### Final verification

All **29 required suites, three direct checks and the full language tour pass (33/33)** on clean source head `04b156026676f34b52bbd1aabf7cbc389751ffdf`, artifact `efb7a2b2c0b1f272a4e001a447e89f96fbeb764b2ceccb538f7c0900333c3b40`, source/assets `770224b290d1765039949c96c5426c73e3421753bf3e4576490ec02f52381313`. All four supplemental checks pass. Individual TSVs and full logs are in `R5/verify/{root-v4,blocking-v4,cards-v4,seeded-v4,direct-v4}`. Later report-only commits do not change the checked build; final source continuity is recorded separately.

| Verifier | Result | Seconds |
|---|---|---:|
| verify-corridor | P | 247 |
| verify-corridor-storage-integrity | P | 1 |
| lint-ui-language-core | P | 100 |
| sw-shell | P | 1 |
| test-navigation-returns | P | 0 |
| verify-srs-today | P | 168 |
| verify-personal-collections | P | 7 |
| verify-corridor-doors | P | 45 |
| verify-pr77-ports | P | 141 |
| verify-corridor-accessibility | P | 35 |
| verify-relief | P | 5 |
| verify-theme-consistency | P | 64 |
| verify-writing-room | P | 34 |
| verify-guided-session | P | 103 |
| verify-dojo-door | P | 72 |
| verify-drift-hunt | P | 174 |
| verify-kotoba-mine | P | 86 |
| verify-n2n1-decks | P | 26 |
| verify-reader-doors | P | 80 |
| verify-reader-lookup | P | 18 |
| verify-annotation-lookup | P | 18 |
| verify-vocabulary-chooser | P | 22 |
| verify-experience | P | 130 |
| verify-design-reader-shelf | P | 122 |
| verify-playback | P | 31 |
| verify-shelf-search | P | 20 |
| verify-sentence-drafts | P | 242 |
| verify-bundled-listening | P | 53 |
| verify-listening-failures | P | 6 |
| redesign-foundation | P | 16 |
| redesign-docks | P | 42 |
| today-sky | P | 67 |
| language-full | P | 292 |
| reader-gloss | P | 204 |
| japanese-lookup-unit | P | 1 |
| search-lenses | P | 9 |
| changed-runtime-lint | P | 2 |

Core: 259/259; accessibility: 53/53; guided: 211/211; writing: 51/51; experience: 42/42; reader/shelf design: 49/49 with original G6 geometry intact; reader doors: 93/93 with negative controls; reader gloss: 84/84; docks: 24 Chromium/WebKit cases; Today sky: 81/81; full language: 230 visits, 11,743 inspections, zero issues. The formerly inherited corridor-doors and PR77 suites now pass **68/68 and 56/56**. Their stale fault-route and EN label pins are logged with positive interception and unchanged behavioral/negative assertions; this does not count as a product improvement.

The required `$no-mistakes` validation gate is invoked after these checks, using the full user intent and skipping rebase/push/PR/CI to respect the local-only delivery. Its exact terminal result is retained under R5 and reported at delivery; it is not authority for any forbidden shipping action.
