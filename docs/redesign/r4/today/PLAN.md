# Round 4 · today lane · plan

Branch `claude/r4-today-20261009`, started at `345dba92`. Rooms: the door (the universe), Today, Me.
Owned: `rooms/today.css`, `rooms/me.css`, `drift-layer.js` / `drift-layer.css` (generated: changed only through
`tools/build-drift-layer.mjs`, whose `--check` the release gates run), and the Today, door and Me render code.

## His lines in this lane

### T1 · Today: a real home · "Close, needs work"

> how can we blend these togehter and use both nice? i do like it but also want to polish it more.  My main go to app for japanese is the Japnaese app by renzo, where the opening screen has words and kanji floating by. This was the inspiration for the drift window.  Which i do like, evne htough i think we could clean it up a lot.  It gives a whole explorable UNIVERSE of japanse words and the entire language that i think is a really beautiful feature and becuae it represents all possiblity i like it.  Also, i understand and see teh beneift of a clean Today and stable entry point.

**The blend: one sky, two depths.** The universe is the sky; Today is the day under it, with the same skyline at the
foot of both. Each place shows the other, and one touch crosses.

| Piece | Change | Proof |
|---|---|---|
| Today's sky | The hero's sky always holds real words, even on a new phone: his saved words first (due ones brightest), then words from today's reading, then the day's word's family, then graded words. The day's word stays the bright centre. | Shots `today` day/night/日本語; a probe counts sky words on a fresh profile (was 0). |
| One word opens that word | Tapping a sky word opens that word's entry, as now. | Probe: tap a star, the entry sheet names that word. |
| Tap the sky, the universe opens | Tapping open sky (not a word), or the labelled "Explore all words" control, opens the full universe. | Probe: tap open sky, `body[data-view=drift]` and `#drift-layer.active`. |
| A clear way back | The door's foot always carries one door to Today: the existing `#home-review` pill becomes "Today", with the due count when there is one. It is the same place whether you opened the app or came up from Today. | Probe: from the universe, the pill lands on Today; verify-srs-today's truthful-count checks on the pill stay green. |
| The universe, cleaned up | Through the extractor: quieter paper (no foxing, fewer fibres and specks), no muddy pigment pools or wave band, every off-screen word drawn as a fine point of light instead of a grey square, a whisper of the web, fainter giant hub glyphs, crisp word edges (no blur shadow), no illegibly small words, and a 藍 night that matches the app's night instead of a brown one. Gestures, physics and records are untouched. | Shots `door` day/night/日本語 against tonight's; `build-drift-layer --check`, verify-drift-hunt, verify-corridor step 0/0b, test-drift-practice-priorities. |
| The opening screen | Kept as the universe: his 08-10 ruling (pinned in verify-corridor step 0) and his 09-29 defence of the door, and Renzo's opening screen of floating words. Today is the stable entry one tap away, always in the same place. Opening on Today instead is a one-line change plus 27 verifier entry steps; it is named in the report as his call. | verify-corridor step 0 unchanged and green. |
| Polish Today | Crisper hierarchy and separation in the hero and the day's card; plain words in the empty states. | Shots; lint-ui-language-core. |

### D5 · Your N1 date and your four fields

> July 2027.    Learning Psychology (neurplasticity, learning about learning, human potential), Yoga and Buddhism and Jain and Hindu history rooted in Japanese history and tied in to moden neuroscience,   Semiconductors and AI and investiing and Hofstatder and recursion and computer science and tech

| Piece | Change | Proof |
|---|---|---|
| N1 · July 2027 | Me leads its horizons with N1 · July 2027 and an honest countdown to the July sitting, which the JLPT holds on the first Sunday of July: expected Sunday 4 July 2027, labelled "expected" until jlpt.jp confirms it. Counted from today's date on every open; past the date it says so instead of counting negative. | Shot `me`; probe at a fixed date. |
| His three fields, by his names | "Learning psychology" (neuroplasticity, learning about learning, human potential); "Yoga, Buddhism, Jain and Hindu history" (rooted in Japanese history, tied to modern neuroscience); "Semiconductors, AI and investing" (Hofstadter, recursion, computer science and tech). Each counts what he holds by recall from the fields deck's own group for it (`mind`, `india`, `ai`), and says "not begun" until he opens that deck. | Shot `me`; probe with a seeded fields-deck ledger. |
| Kanken and saved words | Kept, below the fields. | verify-redesign-foundation (Me and Settings routes). |

### Carried on (no answer on T10 Me, T12 the door)
The same contrast and crispness pass, no rethinking.

## Verifiers
Lane: verify-srs-today, verify-corridor, verify-corridor-doors (T13 inherited), test-navigation-returns,
verify-redesign-foundation, lint-ui-language-core, verify-experience.
Added because this lane changes the universe and two rooms' surfaces: `build-drift-layer --check`,
test-drift-practice-priorities, verify-drift-hunt, verify-corridor-accessibility, verify-theme-consistency.
Base on `345dba92` (site-base, artifact `23ccb8bc`), final on the lane head. No behavioural pin changes are planned.
