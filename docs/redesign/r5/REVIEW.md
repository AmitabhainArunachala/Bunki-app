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

Final tested source: `4b73e2ab8408b5dc0f36345e436e7768f823e0d7`; clean=True; source/assets `37b8fea2f9464c668bdc69d5b03c3db3c018a2fed1a6a98bdbade46a7d285dc7`; artifact `ac9e731bfb21fe8afadb8af1f570d035949c46a639cd4fc39e4e05e368424635`. Every final verifier lane uses this immutable build. Documentation delivery is separately tied to these actual bytes. The original strict review remains byte-for-byte above; earlier reviews and all failed attempts remain in R5 and git history.

**The requested pass bar is not met.** All 33 required checks returned: 32 pass; `verify-kotoba-mine` fails its unchanged clipped-context reach assertion and two original Focus contrast assertions. Neither failure is an inherited exception. The six supplemental and three focused checks pass. This is completed verification with an unresolved product bar, not a shipping or human-acceptance claim.

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
| 7 | Hit size | P | P | P | P | P | ~ | P | P | ~ |
| 8 | Contrast | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | F |
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
| 21 | The bar | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | F |
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
| 7. Hit size | 12 / 0 / 7 | 17 / 2 / 0 |
| 8. Contrast | 0 / 18 / 1 | 0 / 18 / 1 |
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
| 21. The bar | 0 / 12 / 7 | 0 / 16 / 3 |
| 22. Three Japans | 8 / 11 / 0 | 8 / 11 / 0 |
| 23. Alive | 0 / 15 / 4 | 19 / 0 / 0 |
| 24. The pull | 18 / 0 / 1 | 19 / 0 / 0 |

Across 456 cells: **294 P / 94 ~ / 68 F → 355 P / 88 ~ / 13 F**. Thirty-nine F and twenty-three partial cells became P; seventeen F became partial. One prior P became partial (archive graded-word joining); one partial became F (N1 back precision). Check 25 remains a person’s task. Non-applicable P cells are disclosed in the method above, and an automated pass does not promote an unmeasured visual edge.

### Evidence for the final scores

- **Complete re-tour:** `shots-final/v15` repeats the 36 fresh states; `seeded-final-v15` holds 132 seeded states and 24 completed-session Me states. Widths320/390, EN/JA and all three accepted worlds are retained across11 seeded state types. `supplemental-tour-v15` adds84 documentary views (font readiness awaited; six subsequent Shelf/JA observations still report loading) of Door, Shelf, Reader, Popup, Sentence, Entry and Learn across all12 axis tuples; the final world lane adds72 card home/front/back views across24 deck profiles. Six separate private card states support the numeric traces. The actual new journey, twelve selected video frames and timestamp map are `journey-final-v15/`. The root checks the contact sheet and a bounded representative Door/Settings/N1-back confirmation; no image substitution or new detector pass is used.
- **Blocking languages and placeholders:** core and full EN/JA tours run unchanged on final source. Core83 visits/10,237 chrome inspections and full230 visits/11,978 inspections each report zero issues. Operating chrome and real learning content are tagged separately; learned Japanese words and anatomy glyphs keep their language. Painted Door words alone enter Tab order. Native54 keyboard assertions/15 journeys and15 level assertions pass; Chrome CDP exposes an empty valueText even for the separate minimal valid slider control, so DOM value wording is not claimed as a spoken AT result. Ready Learn routes replace preparation promises. Maintenance’s closed entry labels localize on mount/rebuild; the opened operational report dialog still has English text outside the19-state tour.
- **Tap depth and physical targets:** own/other card words reach kanji in one tap and components in two; available anatomy plates now use native44px semantic buttons and the existing host routes. Selected Door words, deck-home doors and Undo have44px targets. 32 grouped interaction/persistence assertions across MCD and N1 at320/390 in the initial Full/EN scope, presentation56 assertions and Undo80 points/two held folds pass. The original REACH assertion still samples three wholly clipped prior words at83.406–118.406px while the window begins at123px, yielding six misses. It remains FAIL. The actual visible first row’s upper/lower point ownership and click are separately observed in MCD/N1; they do not certify Mine. Mine retains partial/check7: the initial-card scope shows wrapped token envelopes whose centre can lie outside a painted fragment; no full native fragment sweep is claimed. Backward native Tab/Enter reaches earlier context through natural scrolling. Each lookup adds its legitimate tuple row; all nonlookup ledger fields and AppRecord stay unchanged. Dense N1 lateral corners remain partial: the earlier50-point sweep gets48/50 callbacks, with all centres correct; two corners choose adjacent printed ink.
- **Contrast:** original Focus opacity0.38 remains below the measured4.5:1 floor: day MCD world passage2.30893/ruby2.00017; Yoru passage2.27063/ruby1.95876. Separate actual N1 Focus at320/390 measures paper2.30893/Yoru2.27063 with effective opacity0.38, away the clipped edge; no eligible N1 ruby was sampled. At0.49, even black text can reach only3.79836/3.72107 on these carriers. Raising the original bound requires John’s pending product decision; no behavioral threshold is weakened. N1 back remains F/check8. Mine has no Full/Focus control: its503 protected cards all lack type, and actual baseline/final320/390 first-card consumers show no mode control and ordinary sentence opacity1. Mine/check8 is partial for unmeasured edges. This third explicit baseline erratum corrects an MCD Focus failure falsely attributed to Mine: baseline becomes294P/94~/68F, with no product improvement counted. The original Before section stays byte-identical. Textures, fades and gradient edges keep the other17 rooms partial; settled ordinary UI measurements do not census every edge.
- **One job and world continuity:** Today has one Begin, neutral hook/current stop and the complete next-story title. Popup owns Save; first-depth entry has one Close. Shelf Tools owns its search field. Words has one shape opener and one saved-node signal. Quiet header doors remain under D7 and preserve partial redundancy. Both requested deck flows default to the selected app world while explicit player preferences survive. 殻 Learn has warm paper. Settings visibly names its live localized world and correctly says Me › Settings, but its authored room identity remains weak.
- **Meaningful motion:** `responses-final-v15` retains actual actions/effects and26 new clips in normal/reduced modes, with three qualifying semantic responses per root state/mode. Actual player consumers retain short response and pinned docks; reduced grade/fallback effects are opacity-only, with80ms retirement and120ms removal. The normal original950ms Drift grade remains outside the19-state three-response tour. Ambient effects are excluded. The twelve-frame actual journey shows Follow, recenter, reveal and article intermediates. `SPEC.md` identifies response/evidence scopes; RAF observations prove response opportunities, not human-readable compositor paint.
- **Reading correctness and persistence:** transient same-card/deck/face state retains folds, context, window size, inner seat and page anchor through connected async language rebuilds, world reflow and recursive depth returns. Full/Focus refits only when actual controls/target/definition clip. The exact repeated Portsmouth-person 小村 receives the renderer-localこむら projection and honest missing-entry frame ([National Diet Library portrait](https://www.ndl.go.jp/portrait/datas/83)); frozen passage/tokens and unrelatedしょうそん remain unchanged. No fabricated meaning or Save identity is added.
- **Bundled fonts and actual exports:**451 registered faces include actual licensed source bytes and Roboto Mono weight axes. Canvas text waits for its exact bundled face; failed-face retries do not cache unready labels. A successful stamped SW install verifies/caches all451 fonts (21,103,588bytes), then serves them offline. Both real Kotoba exports regenerate via the existing study-only workflow;100 protected/export files, complete embedded deck/gloss/pin contracts and902 decoded font payloads are checked. Four actual normal/reduced file consumers pass secrecy, popovers, fonts, open-fold grading and durable reload, with12 injected-answer negatives; full/fragment global standalone consumers pass too. Font/cache failure isolation is a separate scope: with all451 font requests permanently503 and an empty cache, six DOM glyphs use native fallback after4.3s. That retained negative does not meet font-only acceptance; zero unready canvas draws are a narrower success.
- **Real annotation and pull:** unsupported fifteen-minute estimates are removed; queue captions name cards because actual queues include new/due cards. The numeric seed, all candidates, original exclusions and exact sampled-source traces below are retained. Fresh raw117 root candidates become91 eligible UI values after26 explicit corpus exclusions; full mixed draw53 and typed UI draw50 remain, with no favorable resampling. Door, Settings, Popup and Sentence each have fewer than three eligible values; every available value remains and no third is invented. Actual first-three story choices rotate across dates, remain stable within a date and open real articles. Completed study keeps a concrete next-reading door. Archive joined words remain a documented partial tap-depth limit under R5-13.

### Original defects, one line each

| Defect | Disposition |
|---|---|
|1. Cards in a different world|Fixed: selected app materials govern both flows by default; explicit preferences survive.|
|2. Blocked card word→kanji path|Fixed: real entry/kanji/component routes and exact presentation on return.|
|3. Tiny targets and dim Focus|Partial: interface targets, visible-row reach, anatomy and Undo repaired; original clipped-context REACH, Focus contrast and two dense N1 corners remain.|
|4. Mixed interface languages|Fixed: EN month/operating labels; the retracted shipped Door label was already correct and counts as no fix.|
|5. Promised Learn rooms|Fixed: ready existing practice/tests replace preparation rows.|
|6. Cuts/reveal jolt|Fixed in observed journey/response scopes: live arrival, inert departing frames, pinned docks, held departing frame and strict reduced opacity; no all-possible-response claim.|
|7. Nested sentence window|Fixed: whole phone-page flow and exact source/word return.|
|8. Duplicate Save/exits|Fixed body ownership; D7 header exceptions keep general redundancy partial.|
|9. Competing signals/clipped next reading|Fixed: one Begin/saved-node signal and complete story title; dense search chrome remains.|
|10. Mint 殻 Learn|Fixed: warm stage paper.|
|11. Labels/plurals|Fixed plain labels, Today bookmark naming, singular counts and actual queue captions; operational report-dialog language remains scoped separately.|
|12. Missing approved voice|Unfixed: no approved narration/card recordings exist; no substitute voice is invented.|
|13. Static first-three stories|Fixed deterministic daily rotation, stable within the day.|
|14. Authored detail/bar|Partial: three meaningful responses per toured state observed; Door, Settings and N1 back still fall short of the authored bar; check25 is human.|

Extra repairs: bundled font provenance/canvas/SW handling; real export parity; long-front and safe-area Undo; held reduced-motion outgoing folds; strict Drift grade/fallback motion; actual Door keyboard/level semantics; exact same-card reading state; guarded contextual ruby; native anatomy doors; localized maintenance entry; current-world Settings and corrected breadcrumb.

### Check 14: random numbers traced to their source

Fixed random seed `5f2f9bba320a90a0fc364e4bc8d85314`; raw visible candidates and corpus exclusions remain. Rooms with fewer than three numbers are reported honestly. The table below names each selected actual value and independent source; it does not manufacture a third value or resample for a favorable result.

| State | Index / raw index | Value / visible annotation | Independent source |
| --- | --- | --- | --- |
| Door | 0 / 0 | 5 · Today · 5 cards | Actual captured record at captured Date: 3 due + 2 started fresh; unchanged todayQueue.order |
| Today | 2 / 2 | 2026 · Sunday · 11 Oct 2026 | Captured dateMs rendered local Asia/Tokyo by today-date |
| Today | 3 / 3 | 70 · 70 kanji contain it | data/share_alike/kanji.json radicals[言].kanjiCount; unchanged todayHook/wwPartCap |
| Today | 4 / 4 | 5 · 5 | Actual captured 3 due + 2 fresh; unchanged todayQueue.order.length |
| Close | 5 / 5 | 01 · 0:01 | max(1,round((rv.t1-rv.t0)/1000)) second component; normalized source clock nodes match |
| Close | 7 / 7 | 2026 · 第36回全国産業教育フェア佐賀大会（さんフェア SAGA2026）を開催します！ | data/articles/index.json articles[id=mext:b_menu-houdou-mext_01683].title |
| Close | 1 / 1 | 5 · Session done — 5 reviews | Actual five durable revlog rows from five real Easy grades in captured record |
| Today after | 4 / 4 | 4 · 265 kanji contain it · 4 in your words | Actual captured saved-word kanji intersect data/share_alike/kanji.json kanji[].parts containing日; unchanged wwMine/wwPartMembers |
| Today after | 6 / 6 | 1 · 1 | Normalized renderTodayLine: actual stop-read DOM is conditional on a real selected article and emits exactly1 |
| Today after | 0 / 0 | 5 · 5 | Actual captured learner record taken.length; renderChrome tray badge |
| Me | 8 / 8 | 4 · Test expected Sun 4 Jul 2027 | ME_N1_SITTING configured2027/July; unchanged meN1Sitting first-Sunday calculation |
| Me | 9 / 9 | 2027 · Test expected Sun 4 Jul 2027 | ME_N1_SITTING configured2027/July; unchanged meN1Sitting first-Sunday calculation |
| Me | 1 / 1 | 11 · 11 Oct 2026 | Actual earliest durable revlog timestamp rendered local Asia/Tokyo by meDays/meDate |
| Settings | 0 / 0 | 5 · 5 | Actual captured learner record taken.length; renderChrome tray badge |
| Words | 1 / 1 | 4 · 4 | data/share_alike/kanji.json kanji[日].st; actual node/legend owner日 |
| Words | 6 / 6 | 4 · 4 | data/share_alike/kanji.json kanji[日].st; actual node/legend owner日 |
| Words | 2 / 2 | 7 · 7th day of the month | data/share_alike/words.json words[七日].g; unchanged wwShort caption |
| Learn | 3 / 3 | 2 · new N2 cards | decks/n2/deck.json actual titleEn N2 level identifier |
| Learn | 14 / 14 | 6 · N2 written · 6 questions · every question explained | guided/sets/n2-living-thread-01.json questions.length |
| Learn | 5 / 5 | 15 · 15 | Fresh independent frozen engine buildQueue(emptyState n2,captured Learn Date,newPerDay15,skipFor read).fresh.length |
| Shelf | 8 / 10 | 2026 · 27 Sep 2026 | data/articles/index.json articles[id=jawiki:5294446].date |
| Shelf | 3 / 3 | 120 · 120 articles | data/articles/index.json:126 entries minus6 adaptations whose originals stand beside them; unchanged shelfStories |
| Shelf | 0 / 0 | 5 · 5 | Actual captured learner record taken.length; renderChrome tray badge |
| Reader | 0 / 0 | 5 · 5 | Actual captured learner record taken.length; renderChrome tray badge |
| Reader | 2 / 2 | 27 · 27 Sep | data/articles/index.json articles[id=jawiki:5294446].date |
| Reader | 1 / 1 | 2 · 2 | data/articles/index.json articles[id=jawiki:5294446].title; actual Reader heading |
| Popup | 1 / 7 | 8 · kettle lid radical (no. 8) | data/share_alike/kanji.json kanji[亠].rad and .m; actual mini-kanji-part-meaning metadata caption |
| Popup | 0 / 0 | 5 · 5 | Actual captured learner record taken.length; renderChrome tray badge |
| Sentence | 0 / 0 | 5 · 5 | Actual captured learner record taken.length; renderChrome tray badge |
| Entry | 0 / 0 | 2 · 2 readings or entries share this form | data/share_alike/dict-v2/index.json canonical rows whose writtenForms contain市 and readingWrittenScopes permit市; dictionaryHomographChoices dedup tuple |
| Entry | 2 / 2 | 4.0 · CC BY-SA 4.0 | data/share_alike/dict-v2/index.json source.licence |
| Entry | 1 / 1 | 1 · 1 | data/share_alike/dict-v2/07.json canonical seq1308080 first visible sense; unchanged renderDictionaryDetails senseIndex0+1 |
| kotoba-mine/home | 1 / card | 503 · deck cards | decks/kotoba-mine/deck.json: sum(words[].cards.length) |
| kotoba-mine/home | 5 / card | 0 · difficult | engine.wordStatus(difficult).length |
| kotoba-mine/home | 4 / card | 0 · known | engine.wordStatus(known).length |
| kotoba-mine/front | 0 / card | 1 · position | ui.pos+1; first independently queued card |
| kotoba-mine/front | 1 / card | 15 · sitting total | engine.buildQueue.queue.length |
| kotoba-mine/front | 2 / card | 1 · card JLPT level | decks/kotoba-mine/deck.json: words[id=km-064].level=N1; render calls levelChip(word.level) |
| kotoba-mine/back | 4 / card | 10 · good interval | engine.preview pinned scheduler.repeat ledger.cards[km-064-1] at 2026-10-10T00:00:00.000Z gives 600000ms; player fmtWait renders 10 min |
| kotoba-mine/back | 7 / card | 2 · other sentences | player otherPassages: words[id=km-064].cards filtered id!==km-064-1; exact IDs km-064-2,km-064-3 |
| kotoba-mine/back | 2 / card | 1 · again interval | engine.preview pinned scheduler.repeat ledger.cards[km-064-1] at 2026-10-10T00:00:00.000Z gives 60000ms; player fmtWait renders 1 min |
| n1/home | 0 / card | 666 · deck words | decks/n1/deck.json: words.length |
| n1/home | 4 / card | 0 · known | engine.wordStatus(known).length |
| n1/home | 6 / card | 15 · Begin total | engine.buildQueue.queue.length |
| n1/front | 1 / card | 15 · sitting total | engine.buildQueue.queue.length |
| n1/front | 2 / card | 1 · card JLPT level | decks/n1/deck.json: words[id=nn-67f6fe4a2f].level=N1; render calls levelChip(word.level) |
| n1/front | 0 / card | 1 · position | ui.pos+1; first independently queued card |
| n1/back | 4 / card | 1 · card JLPT level | decks/n1/deck.json: words[id=nn-67f6fe4a2f].level=N1; render calls levelChip(word.level) |
| n1/back | 2 / card | 10 · good interval | engine.preview pinned scheduler.repeat ledger.cards[nn-67f6fe4a2f-ca1c2c4f] at 2026-10-10T00:00:00.000Z gives 600000ms; player fmtWait renders 10 min |
| n1/back | 0 / card | 1 · again interval | engine.preview pinned scheduler.repeat ledger.cards[nn-67f6fe4a2f-ca1c2c4f] at 2026-10-10T00:00:00.000Z gives 60000ms; player fmtWait renders 1 min |


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
| N1 back | Yes: definition moves the same practice forward. | Partly: repeat guidance and folds remain dense. | Yes: passage, definition and recursive word doors connect. | No: dense lateral touch corners and low-contrast Focus context weaken precision despite correct scheduler intervals. | Partly: the held front covers reveal seating; long context and pale edges remain weak. |
| Words | Yes: following a relationship is language practice. | Partly: one shape opener and one signal; the search/lens slab still takes space. | Yes: following a node re-centres the actual word and keeps the walk. | Yes: stroke/family/record numbers are actual. | Partly: the graph is clearer; the upper frame is still crowded. |
| Me | Yes: the book shows real study rather than invented rewards. | Partly: retained header/tab repetition remains. | Yes: a stable yearbook records changing actual practice. | Yes: expected test date is labeled expected and evidence is real. | Partly: calendar and earned rows now respond, but the book still needs richer depth. |
| Settings | Yes: every choice changes the actual app. | Partly: duplicate choices are removed; retained navigation still repeats. | No: generic preferences leave little memorable moment. | Yes: capability and absence labels are honest. | No: a weak paused picture with little identifiable city layer. |

The three rooms furthest from the bar are **Door** (worked foreground/background relief and a less pale day picture), **Settings** (a distinctive purposeful frame, a memorable moment and a city layer), and **N1 back** (less repeat guidance, clearer long-context hierarchy, less pale edge fade and more room for dense-prose touch corners). Approved article/card audio remains a content gap across nine states, beyond these three visual rooms.



### Check 19: actual approved voice coverage

The fresh actual article/audio receipt is `audio-final-v15/audio.json`; the native tour witnesses are retained rather than substituted. The toured cabinet article has no approved narration and no Listen control; it truthfully says “No recording for this article”. Popup, sentence, full entry and both requested deck fronts/backs also lack approved audio. Check19 therefore remains F in nine states: Shelf, Reader, Popup, Sentence, Entry and the four card faces. Five actual saved-word reading buttons (世界、時間、音楽、技術、日) show No Kore recording, with zero observed native playback and device TTS. Missing voice is not voice coverage.

The fresh coverage census retains8,407 word entries,77 sentence-manifest passage keys,1,400 cues across67 cue passages and zero approved Kore/Charon entries or cues. Seventy-seven is a passage census, not a clip count; article narration manifest is absent. The synthetic approved fixture proves player behavior, not shipping coverage. No replacement narration was added.

### Check 20: measured on this Mac

Five fresh Chromium mobile/touch contexts at390×844, service workers blocked, after all task-owned heavy jobs and solo Design49 are closed. Apple M5 Max/Mac17,6/128GiB, macOS26.5.1(25F80), Chrome for Testing153.0.8010.12; metadata confirmed after timing. Local/OS caches may be warm and unrelated system activity is uncontrolled. “Cold” means a fresh browser context, not a reboot or network-cold device. Dispatch starts at the actual in-browser HTMLElement.click path, excluding pointer/automation dispatch latency. Separate native interaction proofs use trusted physical clicks. Unchanged runner SHA58382897fe1b82886f973c34842fc31de48d0d988999cb7a7ff58987a36f549c. `speed-final-v15/{diagnostic,summary}.json` retains events, targets, exact fonts and continuous node/opacity traces.

| Measurement | Median ms | Range ms |
|---|---:|---:|
|Cold→body-ready DOM|306.7|304.1–307.5|
|Cold→body-ready polling upper bound|313.0|310.5–313.7|
|Core gloss→DOM insertion|31.0|22.8–35.8|
|Core gloss→first positive-opacity RAF|57.6|50.8–65.5|
|Core gloss→following positive RAF|71.1|66.6–87.6|
|Core gloss→opacity≥0.99 RAF|Not observed|0/5 cases|
|Full senses→DOM insertion|227.4|203.0–236.8|
|Full senses→first positive-opacity RAF|231.3|203.1–237.0|
|Full senses→following positive RAF|245.9|215.0–248.9|
|Full senses→opacity≥0.99 RAF|249.8|245.9–263.6|
|Reveal answer→DOM insertion|31.0|29.7–34.5|
|Reveal answer→first positive-opacity RAF|48.9|47.8–51.7|
|Reveal answer→following positive RAF|65.1|64.4–66.6|
|Reveal answer→opacity≥0.99 RAF|198.7|198.4–199.9|
|Lookup whole-page finite-animation polling upper bound|914.5|882.4–914.9|
|Reveal whole-page finite-animation polling upper bound|248.7|248.0–249.2|

**DOM insertion, positive alpha, subsequent RAF, opacity≥0.99, font readiness and compositor painting are separate observations.** RAF is a paint opportunity; opacity≥0.99 is an operational threshold, not a human-reading threshold. Body-ready is not a fully painted screen. Font-set status and ready events can change with new glyph batches; the raw trace discloses status at each milestone and does not identify the face actually painted in every frame. Full-sense insertion exceeds the100ms lookup target on this Mac; initial core is earlier. A recent-iPhone measurement has not been performed, so check20 remains partial in every state. Whole-page finite settling includes underlying Today motion and is not dictionary readiness. Historical v12 timing is retained and not reused as v15 data. Core never reaches0.99 before full senses replace it in these five cases; this is explicitly unobserved, not a zero or reused latency. Full first-alpha range0.974968–0.989509 continues the arrival. Combined meaning has zero sampled missing frames/opacity drops after first positive presence; maximum sampled RAF gap23.4ms, so sub-frame interruptions cannot be excluded. All five contexts have no observed page errors. Core/answer insertion fontsets are loading in all five; first-positive core is loading in2/5, answer in3/5; full insertion is loaded5/5. These distinctions remain in raw events.

### Final verifier table

All planned42 checks returned: 41 PASS / 1 FAIL, with 0 identity mismatches. Logs and complete attempts are `verify/final-v15-rollup.json` and the six named v15 lanes. Focused setup’s first relative SITE rejection is preserved; its unchanged corrected absolute-site run is listed. No failing assertion is weakened or ignored. Both formerly inherited corridor-doors and PR77 suites pass without exceptions. NoMistakes is a separate gate.

| Check | Result | Seconds |
|---|---|---:|
|verify-corridor|PASS|245|
|verify-corridor-storage-integrity|PASS|1|
|verify-corridor-accessibility|PASS|29|
|lint-ui-language-core|PASS|100|
|verify-relief|PASS|5|
|verify-theme-consistency|PASS|61|
|verify-writing-room|PASS|31|
|verify-kotoba-mine|FAIL|80|
|verify-n2n1-decks|PASS|24|
|verify-personal-collections|PASS|7|
|verify-dojo-door|PASS|65|
|verify-guided-session|PASS|101|
|sw-shell|PASS|1|
|test-navigation-returns|PASS|0|
|verify-srs-today|PASS|162|
|verify-experience|PASS|123|
|verify-drift-hunt|PASS|174|
|verify-design-reader-shelf|PASS|119|
|verify-reader-doors|PASS|76|
|verify-reader-lookup|PASS|19|
|verify-playback|PASS|35|
|verify-annotation-lookup|PASS|19|
|verify-vocabulary-chooser|PASS|24|
|verify-shelf-search|PASS|23|
|verify-sentence-drafts|PASS|234|
|verify-bundled-listening|PASS|52|
|verify-listening-failures|PASS|6|
|verify-corridor-doors|PASS|43|
|verify-pr77-ports|PASS|144|
|redesign-foundation|PASS|19|
|redesign-docks|PASS|32|
|today-sky|PASS|65|
|language-full|PASS|290|
|reader-gloss|PASS|200|
|japanese-lookup-unit|PASS|1|
|search-lenses|PASS|10|
|changed-runtime-lint|PASS|2|
|verify-player-dock|PASS|39|
|verify-player-presentation|PASS|16|
|skip-ui (focused)|PASS|16.29|
|assessment-dojo-label (focused)|PASS|3.20|
|approved-voice (focused)|PASS|0.13|

The Kotoba verifier’s MCD fixture REACH selects12 words, including three wholly clipped prior words and six failing±21px points; its two Focus assertions retain the original0.38 opacity and fail contrast. Export parity passes. Final Design49 runs alone with the original G1/G6 geometry and250ms assertions, after other browser jobs close. The exact first run and any justified failure investigation remain, without hidden retry substitution.

### Delivery boundaries and shipping gate

Small described commits preserve the strict-review-first sequence (`a5de2582`) and the gate’s prior repair commit (`2208ed7b`). Main changes are corridor room/player/Drift/font/SW styles and runtime, existing export builders/two actual Kotoba pages, and the scoped verifiers/docs; full changed-file inventory is `R5/changed-files-final-v15.txt`. No node_modules edit, push, PR, merge, history rewrite or worktree removal was performed.

`identity-scope-final-v15.json` compares protected actual contracts against e34841f1: FSRS pin, player engine, N2/N1 source, four complete deck bodies except permitted display titles,22 storage/record declarations/envelope and two cloze-key templates remain equal. Card/Anki IDs, frozen tokens and storage keys are preserved. Source/AST equality is used for these explicit protected contracts, not as proof of UI behavior. All behavior assertions above execute their real consumers.

Pending product decisions remain R5-11 (Shelf Tools closing/query results), R5-13 (graded-word doors inside joined archive names), and the incompatible Focus fade/contrast requirements. No reply or approval is inferred. Physical iPhone speed/safe-area behavior, full-dialog localization, first-human-visible font paint under permanent missing assets, approved audio and John’s craft reaction remain outside successful proof.

Three earlier required NoMistakes attempts ended failed: configured repair timeout; API ENOTFOUND after a preserved mechanical room repair; configured30-minute review timeout with no structured findings or completed test/lint. No gate pass is claimed. A fresh local-only run follows this completed battery, with full original intent and rebase/push/PR/CI skipped under the brief. Its exact terminal result or formally parked user decision is reported separately at delivery. No gate outcome grants mutation/shipping authority.
