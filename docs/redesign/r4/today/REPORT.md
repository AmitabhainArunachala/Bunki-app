# Round 4 · today lane · report

Branch `claude/r4-today-20261009`, from `345dba92`. Rooms: the door (the universe), Today, Me.
Verified build: code head `66b61151` (clean tree), artifact `4af6421c`. Commits after it carry only this report, the
verifier log row and the shots.

## T1 · Today: a real home

> how can we blend these togehter and use both nice? i do like it but also want to polish it more.  My main go to app for japanese is the Japnaese app by renzo, where the opening screen has words and kanji floating by. This was the inspiration for the drift window.  Which i do like, evne htough i think we could clean it up a lot.  It gives a whole explorable UNIVERSE of japanse words and the entire language that i think is a really beautiful feature and becuae it represents all possiblity i like it.  Also, i understand and see teh beneift of a clean Today and stable entry point.

**The blend: one sky, two depths.** The universe is the sky and Today is the day under it. Both stand on the same paper
over the same skyline, each shows the other, and one touch crosses.

| What changed | Where you see it |
|---|---|
| **Today's sky is a window onto the universe, and it is never empty.** On a new phone it held nothing, because it only drew saved words. Now his due words lead (up to six), then his other words, the day's word's family (習得 → 練習 習う 予習), the words of today's reading and far graded words, dealt in turn so the sky reads as a field of near and far, not as his list. Two single kanji from the reading float among them, large and faint: "words and kanji floating by". Every star is a real entry, in Mincho at reading weight. The day's word is the one heavy glyph on the page. | `shots/day-en/today.png`, `shots/night-en/today.png`, `shots/day-ja/today.png`; with a learner's own words: `shots/extra/learner-today-day-en.png`, `learner-today-night-en.png` |
| **One word opens that word.** Tapping a star opens its own entry, and a floating kanji opens its kanji page. | verify-today-sky: "a sky word opens that word's entry" |
| **Tap the sky and the universe opens.** Open sky, or the sky's labelled caption "Explore all words ↗" (すべての言葉へ), rises into the full universe, which fades in rather than cutting. The caption sits just above the day's word, so it never meets the date line, even at 320px. A touch on the day's word, its hook or the title keeps its own meaning and never jumps to the universe. | verify-today-sky: "open sky opens the whole universe", "the labelled door rises … from the keyboard", "a touch on the day's word's hook stays on Today"; `shots/extra/tray-320-bi.png` |
| **A clear way back, and the stable entry point.** The door's foot always carries one door down: the existing `#home-review` pill is now always there and named for where it goes, **Today** (今日), or **Today · 8 due** when cards wait. It is the same place whether the app has just opened or you rose from Today's sky. It used to appear only with saved words and read "Review". | `shots/*/door.png`; with due cards: `shots/extra/learner-door-day-en.png`, `learner-door-night-en.png`; verify-srs-today reads `Today · 50 due` and still finds the true count |
| **The universe, cleaned up a lot.** All of it goes through the drift extractor as 16 exact-once patches plus one fenced CSS block, presentation only, so the gestures, physics, records and judgments are byte-for-byte the donor's. The paper is quieter: no age spots, a third of the fibres, a quarter of the specks, a lighter vignette. The pigment pools are a whisper, and the muddy wave band is one fine line. Every unseen word is a fine point of light instead of a grey square, so the whole language is still there. The word web and the giant hub kanji are faint, no word is drawn too small to read, and word edges are crisp (no 1px smudge). The night pool's red is now 藍. The universe also stands on the **host world's own ground**, so by day the door and Today share one cream paper and by night one 藍 sky; a world change re-applies it even between two night worlds. | `shots/*/door.png` next to tonight's `~/.dharma/bunki_review/2026-10-08/tour/shots/after/*/door.png`; a bloom: `shots/extra/bloom-day-en.png`, `bloom-night-en.png` |
| **The level rail says what it is.** The unexplained line at the universe's left now names its scale at rest (自 N1 … N5), in the interface language: 自 reads "auto" in English, and the line it shows while dragged speaks one language. | `shots/night-en/door.png`; verify-today-sky: "the universe's level rail speaks the interface language" |
| **Polish on Today.** The reading's title is named whole on balanced lines under a small label (it was cut to "南海 フェリー事業…"). "word walk" becomes "word to follow" (語をたどる), naming what the hero's own Follow door does. The empty state names the real button: "Nothing saved yet. Tap Save on any word, kanji or idiom, and it comes back here to review." The door's 日本語 invitation stands upright instead of a synthetic italic. | `shots/day-en/today.png`, `shots/day-ja/door.png` |

**The opening screen stays the universe.** His 08-10 ruling put the galaxy first (verify-corridor step 0 pins it), he
defended it on 09-29 ("the opening page is not the problem. that is cool and intuitive and perfeclty fine"), and Renzo's
opening screen is the floating words. "A clean Today and stable entry point" is answered by the Today door that is
always at the universe's foot, and by Today being the first tab everywhere else. **If he wants the app to open on Today
instead, that is his call.** It is a one-line change (`S.variants.entry`, or the home-screen link `?room=tray`), plus
updating the entry step in the 27 verifier files that walk in through the galaxy, so I did not make it on a guess.

## D5 · Your N1 date and your four fields

> July 2027.    Learning Psychology (neurplasticity, learning about learning, human potential), Yoga and Buddhism and Jain and Hindu history rooted in Japanese history and tied in to moden neuroscience,   Semiconductors and AI and investiing and Hofstatder and recursion and computer science and tech

| What changed | Where you see it |
|---|---|
| **N1 · July 2027, with an honest countdown.** Me's horizons open on an N1 plate: the date he named, then the days to the test, recounted from today's date on every open (268 on the morning of 9 Oct). The JLPT is held on the first Sunday of July, so the code derives Sunday 4 July 2027 and labels it **expected** until jlpt.jp announces it ([practicejlpt.com](https://practicejlpt.com/guide/jlpt-test-dates/), [conjugaizen.com](https://conjugaizen.com/blog/jlpt/jlpt-2027-exam-dates/)). On the day it says "The test is today", and afterwards that it has passed, never a negative number. N1 vocabulary held by recall sits under it, counted as before. | `shots/*/me.png`; verify-today-sky: "the countdown is the honest days to the July test" (checked against an independent computation) |
| **His three fields, by his own names.** The one "Your fields" row becomes three: **Learning psychology** (neuroplasticity, learning about learning, human potential), **Yoga, Buddhism, Jain and Hindu history** (rooted in Japanese history, tied to modern neuroscience), and **Semiconductors, AI and investing** (Hofstadter, recursion, computer science and tech), in both languages. Each counts only what he holds by recall from the fields deck's own group for it (`mind` 287 words, `india` 67, `ai` 67), says "not begun" until he opens that deck, and says "counting" rather than guessing while the deck's words load. | `shots/*/me.png`; with a seeded ledger: `shots/extra/me-seeded-day-en.png` (seeded 14 mind, 5 india, 9 ai and 4 history cards → 14/287, 5/67, 9/67; the history cards correctly count toward none of his fields) |
| Kanken kanji and the words he saved follow, under "Your words". Japanese field names break only at their 中黒, never inside a word. | `shots/day-ja/me.png` |

## Refinement passes

1. **The sky's voice.** The family words were bold 藍 headings crowding the title, and the far words stacked into a
   column at the right edge. All stars moved to Mincho at reading weight, and the day's word now owns its full width on a phone.
2. **Words and kanji, plain words.** The kinds are dealt in turn, two floating kanji were added, "word walk" became
   "word to follow", the test date fits on one line, and the 日本語 hint stands upright.
3. **Against the phone and his real data.** At 320px the link met the date, so it became the sky's caption. His due words
   now shine by ink, not weight. The reading row names the story whole. Touches on the hook no longer fall through to
   the sky (caught by the new verifier's negative control). With hundreds of saved words, his own list no longer
   crowds out the universe. The level rail keeps the EN/JA law.

## Verifiers

Base: start commit `345dba92`, `site-base` (artifact `23ccb8bc`). Final: `66b61151`, `site` (artifact `4af6421c`).
Chromium only, one at a time, while three other lanes ran verifiers on the same Mac. The first seven rows are the lane's
list; the rest were added because this lane changes the universe, the door's chrome and two rooms' surfaces.

| Verifier | Base `345dba92` | Final `66b61151` |
|---|---|---|
| `verify-srs-today` | PASS · 32/32, 2/2 mutants caught | PASS · 32/32, 2/2 mutants caught |
| `verify-corridor` | PASS · 259/259 | PASS · 259/259 |
| `verify-corridor-doors` | **FAIL** 1 of 52: T13 a set that fails to load says so beside its door | **FAIL** 1 of 52: T13 a set that fails to load says so beside its door |
| `test-navigation-returns` | PASS · 4 pass, 0 fail | PASS · 4 pass, 0 fail |
| `verify-redesign-foundation` | PASS · 6 journeys | PASS · 6 journeys |
| `lint-ui-language-core` | PASS · 0 issues, 83 visits | PASS · 0 issues, 83 visits |
| `verify-experience` | PASS · 42 passed, 0 failed | PASS · 42 passed, 0 failed |
| `verify-today-sky` (added) | **FAIL** 1 of 3: chromium bi · a fresh Today's sky holds real words | PASS · 32/32 |
| `drift-layer-check` (added) | PASS · 47 exact-once patches | PASS · 63 exact-once patches |
| `test-drift-practice-priorities` (added) | PASS · 2 pass, 0 fail | PASS · 2 pass, 0 fail |
| `verify-drift-hunt` (added) | PASS · all hunt regressions green | PASS · all hunt regressions green |
| `verify-corridor-accessibility` (added) | PASS · 53/53 | PASS · 53/53 |
| `verify-theme-consistency` (added) | PASS · every room wears its world | PASS · every room wears its world |
| `verify-pr77-ports` (added) | **FAIL** 4 of 56: d9f0b984 · a row marked 未確認 for human review says so, and not with another source's story; d9f0b984 · a row held for its rights names that reason, not the Wikinews archive freeze; f7cd297c · the review room's × and … read at 4.5:1 in every world; kdx-chip-state · the probe ran to its end | **FAIL** 4 of 56: d9f0b984 · a row marked 未確認 for human review says so, and not with another source's story; d9f0b984 · a row held for its rights names that reason, not the Wikinews archive freeze; f7cd297c · the review room's × and … read at 4.5:1 in every world; kdx-chip-state · the probe ran to its end |

- **No regressions.** The two failing verifiers fail identically on the base: every check's outcome matches
  (verify-corridor-doors 52 of 52, verify-pr77-ports 56 of 56).
- **verify-pr77-ports, the review room's × and …:** this is inherited, and I measured it. At rest both controls are
  light cream (233, 226, 207) on the dark stage (17, 25, 39), about 14:1. The probe samples them the instant they
  appear, during the room's 180 ms entrance fade (`html[data-room-entering]`, shell CSS), so they come out near opacity
  0.01. That is a timing issue in the verifier, not a visibility defect. The other three pr77 failures are in the shelf
  and the kanji finder, outside this lane.
- **verify-today-sky** fails on the base at its first check, because a fresh Today's sky held no words. That is the
  feature this lane adds.

**Verifier changes:** none to any existing assertion, selector or label. One verifier added,
`tools/verify-today-sky.mjs` (32 behavioural checks, EN and 日本語). Its negative control fails against the build
before the fix, as it should. Logged in `docs/redesign/VERIFIER_CHANGES.md`.

## Outside my files, kept minimal

- `buildGingaChrome` (shell): only the `#home-review` block, which now shows always and reads Today. Its id, class,
  click target and the count as its first number are unchanged, so verify-srs-today's truthful-count checks and
  verify-pr77-ports' crumb-origin probe hold. **For the skin lane's LABELS.md:** `Review · N due` → `Today · N due`,
  `Review` → `Today`, `word walk` → `word to follow`, `Four horizons` → `Your horizons`, the new label `Explore all words`,
  and the empty state's "Memorize button" → "Save".
- `drift-layer.css` / `drift-layer.js` are generated, so every change to them went through `tools/build-drift-layer.mjs`.
  Its `--check` (a release gate) passes: 63 patches, all asserted exact-once.
- `rooms/today.css` overrides one shell rule for the door: the 日本語 hint stands upright.

## Still open, honestly

- **The opening screen** is still the universe, as above. Today-first is his call, and a small change.
- **The universe's own word card** (the third tap's card) and its radical explainer were not restyled. Some of their
  text is still the donor's mixed Japanese and English, for example "部首 — radicals".
- **The fields deck is thin on two of his fields:** 67 words each for field 2 and field 3, against 287 for learning
  psychology. Field 2's Jain and Hindu history rooted in Japanese history, and its neuroscience, are barely in the deck
  yet. That is a content gap for the cards lane, not a counting problem.
- **The horizons are constants in code** (his date and fields), not a setting he can edit in the app.
- **Today's sky works by touch only** (aria-hidden, as before). Keyboards get the labelled "Explore all words" door and
  the saved-word rows below.
- **The universe takes the host world's ground**, so in 岩 iwa it is ochre. I looked at hokusai by day and yoru by
  night; I did not photograph all ten worlds, and verify-theme-consistency does not walk the door.
- **verify-corridor-doors T13** fails on the base too: inherited, not touched here.
- **Process note:** the lead's message spawned a duplicate copy of this lane, which ran from about 22:51 to 22:58. It wrote
  site-base, shots-base and four valid base results. Later, something re-ran two verifiers into the same
  `results.tsv`, so the base rows for verify-corridor-doors and verify-theme-consistency appear twice there (both copies
  agree). The table above is built from the logs, not from that file.
