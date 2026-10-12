# Round 4 · skin lane report (the global look)

**Branch** `claude/r4-skin-20261009`, from `345dba92`. **Verified build** `5d8f319d` (clean tree, after the review and refine pass at the end of this report), artifact `be20a0b5befb…`; the first pass was `d68e3630` (artifact `894bd5c9da74…`), the build the reviewer checked; base build `345dba92`, artifact `23ccb8bc03d3…`. Built, served on 57101 and photographed at 390×844 @2x in day · EN, night · EN and day · 日本語. Nothing pushed, merged or deployed.

**What the skin owns and changed:** the R4 block at the end of `editorial.css` (token values and global component styles), the world picker in `corridor.css`, the shell in `corridor.js` (top line, the Line, header doors, theme picker, `PUBLIC_THEME_IDS`), `docs/redesign/r4/LABELS.md`.

**Outside my files, kept minimal (say so for the lead):** one string in the reader's picture credit (`readerPicture`, the read lane's function; D3); two English strings in `decks/player/mount.js` (the cards lane's file; D3); `rooms/learn.css` (one value in the first pass, removed in the refine pass) and the Learn room's labels in `corridor.js` (no lane owns Learn; T7 said carry on); D3 strings in `guided-session.mjs`, `reference-ui.js` and `maintenance/report-client.js` (unowned). The refine pass adds a few more, listed under **Outside the skin's own files** at the end.

**Shots:** `docs/redesign/r4/skin/shots/<mode>/<room>.png` for door, today, read, reader, popup, learn, deck-home, deck-front, deck-back, words, me and n1-deck, all retaken on `5d8f319d`; extra evidence in `shots/extra/`. The shots he saw tonight are `~/.dharma/bunki_review/2026-10-08/tour/shots/after/<mode>/<room>.png`.

## His lines in my scope

### T2 (English means English)
> this is nice, but things like \*Real Sentences read and recall.. is just very confusing, obtuse and way to generic to mean anyhting at all...   the english is clean though and more understanaalbe, I did like the color of the other side an dthe four windows but maybe not so big.  also, this new build could even be sharper and cleaner.  why do i feel that native ios expeirnce is alreayd way smoother and tighter and crisper than almost everythign we have?

- **"Real Sentences read and recall … way to generic":** those are the 323 words he looked up in his Japanese app. *Changed by the review:* Learn's list now uses the deck homes' own titles from the cards lane, **Words you looked up · sentences** and **Words you looked up · passages**, so a row and the room it opens say the same thing (the first pass's 単語帳 names are withdrawn). Shots: `shots/extra/learn-decks-day-en.png`, `learn-decks-day-ja.png`. His T2 screen, the deck home, still reads "Real sentences · read and recall" in this lane's build, because the title lives in `deck.json` (cards lane); it changes when the cards lane merges.
- **"sharper and cleaner … native ios … smoother and tighter and crisper":**
  - *The frame is its own material.* The top line and the Line are bright 胡粉 paper by day on one crisp hairline with a soft contact shadow, and the deep frame at night; never the page's beige. Shots: the top and bottom bars of every `shots/day-en/*.png` and `shots/night-en/*.png`.
  - *The phone's own bar matches.* `<meta name="theme-color">` was a fixed beige for every world and room, so Safari's bar (and a home-screen app's status bar) sat beige above the frame. It now follows the frame actually drawn: `#fcfbf8` by day, `#0c101e` in 夜, `#04090d` in 殻.
  - *Press lands at touch-down.* iOS Safari shows `:active` only where a touch listener exists; the shell adds one passive listener. Text and glyph controls dim to 55% at once and let go in 150 ms; paper doors and deck rows press down (scale 0.985); words in the text keep their own selection marks. Verified in Chromium with a held press (opacity 1 → 0.55 → 1), not yet on an iPhone.
  - *Motion:* an ease-out-quart standard curve; the full entry rises on the iOS sheet curve `cubic-bezier(.32,.72,0,1)` (same 280 ms and travel, so no layout pin moves). Reduced motion still turns it all off.
  - *Tight type:* eyebrows lose their wide tracking (0.14em → 0.07em) and gain weight; titles set at 1.12 leading; the Line's labels are a crisp 12px semibold; greyscale antialiasing on macOS and no text inflation when the phone turns. The foundation's type sizes stay, because one-line pins depend on them.
  - *Scrolling:* the page layer is composited once, so a scroll never repaints the paper.
- **"I did like the color of the other side an dthe four windows but maybe not so big":** the deck home is the cards lane's.

### The common thread, app-wide (T4, T5, T8, T9)
> the color theme all blends together too much and looks sloppy and slilghlty confusing.  the top header, the background of the picture, th etitle, the subtitle, the explanaiton (that is too verbose and.. confusing) and the artile itslef, and the bottom are all the exact same make me wanna puke beige that is overused....

> THe same thing, it all bledns together! It lacks modularity, it lacks contrast, texture, depth, separtion, user ease, emotional depth, sharp contrast, and stand out clarity.

> More sharp, more depth, more contrast, more distinction.

> same as above, needs more clarity, more crispness, more tightness.

- **Three materials instead of one beige.** FRAME (the top line, the Line, sheet bars and docks: `--color-bar`); PAGE (washi, cooler and less yellow: `#efece5` in the default world instead of `#f4eee1`); RAISED paper (`--color-surface` `#fffefb`, an ink edge where relief needs it, and a two-step contact + ambient shadow). In every world the header and the bottom are no longer the page's colour. The reader's own layers (picture, title, explainer, article) are the read lane's.
- **Texture, truer:** the page fibre is visible again but short and soft (formation, short fibre, sparse kōzo flecks, a fine tooth), never the old brushed streaks. Compare `shots/day-en/today.png` with tonight's.
- **Contrast:** the default ink is sumi `#14171d`; the quiet ramp moved up (ink-2 88%, label-2 82%, muted 78%, quiet 74%). Measured in all eleven worlds, on the page and on raised paper: body ink 11.5–17.8:1, the quietest text 5.2–8.6:1, the header's tool glyphs 4.0–7.1:1.
- **Learn** (T7 "carry on"): the working paper under the stage is the shared washi, not beige (`rooms/learn.css` no longer sets a page of its own, so each world's page applies). Shot: `shots/day-en/learn.png`.
- **One 朱 per screen:** the bar's active language is underlined in ink; the world seal is the bar's only 朱.

### D2 (The night look)
> Offer both

- `kaku` (殻, the electric phosphor night) is public again, beside `yoru` (金, the 藍 night). A saved `kaku` still loads; no saved id changed.
- The picker is two named rows, **Day** and **Night** (昼 · 夜), so both night looks sit side by side, and a line beneath names the world in words ("Gold on indigo", "Electric phosphor"; ベロ藍・浪 in 日本語). Shots: `shots/extra/picker-day-en.png`, `picker-night-en.png`, `picker-day-ja.png`; 殻 across rooms: `shots/extra/kaku-today.png`, `kaku-learn.png`, `kaku-reader.png`; every world's Today: `shots/extra/worlds-today.png`.
- `verify-theme-consistency` now sweeps 殻 too (strengthened); the accessibility verifier already measured it.

### D3 (The name)
> 回廊 KAIRO

- The visible "Bunki" captions I found in the first pass now say 回廊 KAIRO (the review found more in the personal collections player; they are fixed in the refine pass below) (as a mark; 回廊 carries `lang="ja"`) or KAIRO (in running English): the reader's picture credit (ILLUSTRATION · 回廊 KAIRO, `shots/day-en/reader.png`), the shelf's sort "New to Bunki" → "Newly added", the guided session's eyebrow (回廊 KAIRO / guided practice) and credit, the grammar-held reason, the report sheet, the reference library note, two deck-player notes and the exported list's header. The repository, storage keys and `bunki-*` ids are untouched.

### D7 (Retire the header's duplicate Learn / Lists icons)
> Keep them for now — figure out the smartest way to work with this

- **Kept:** `#chrome-dojo` and `#tray` keep their ids, places, 44px boxes and texts (`Lists N` for the verifiers and screen readers).
- **Quieter:** search · Learn · Lists are one tools group of 18px glyphs in a quieter ink than the preferences.
- **Smarter:** the bookmark is an outline with no number at 0 and a filled mark with its count once words are saved; the door of the room you are in is inked. *Changed by the review:* the first pass also put an ink dot ("Learn · 3 due") on the Learn cap; it is gone, because the Line's Today station already shows the same due cards, where they are reviewed. Shots: `shots/extra/shelf-saved-hokusai.png`, `shelf-saved-yoru.png`, `header-saved-hokusai.png`, `header-saved-yoru.png`; the empty state in every `shots/*/today.png`.
- In Japanese the bookmark's hidden word is リスト (it was 覚). On wide screens the crumb beside Back said "lists" in the Today room; it now says Today / 今日.

### Plain words
- `docs/redesign/r4/LABELS.md` (committed at 23:03, inside the first hour) lists every coined or obtuse label found on a walk of the base build in both languages, old → new in EN and JA, with file and owner, and marks the pinned ones. Applied in my files and in Learn: Up next, Review cards, Guided test practice, Timed practice, Start 20 minutes (Start a 20-minute session since the review), Your saved words, Your own texts, One word, one paragraph; the shell's Colour theme / 配色を選ぶ and リスト; D3. Left for their owners with the wording: the popup's Save → Add to a list, "Open the web" → "Kanji & related words", the sentence row (read); deck homes and grade buttons (cards); Today and Me (today).

## Verifiers, first pass (base `345dba92` → final `d68e3630`)

| Verifier | Lane | Base | Final | Note |
|---|---|---|---|---|
| `verify-relief` | skin | PASS · RELIEF CLEAN | PASS · RELIEF CLEAN |  |
| `verify-theme-consistency` | skin | PASS · THEME SWEEP CLEAN | PASS · THEME SWEEP CLEAN | final sweeps eleven worlds (adds 殻) |
| `verify-corridor-accessibility` | skin | PASS · 53/53 checks passed | PASS · 53/53 checks passed |  |
| `lint-ui-language-core` | skin | PASS · 83 visits, 0 issues | PASS · 83 visits, 0 issues |  |
| `verify-redesign-foundation` | skin | PASS · 6 language × width × engine journeys | PASS · 6 language × width × engine journeys |  |
| `verify-experience` | skin | PASS · 42 passed, 0 failed | PASS · 42 passed, 0 failed | E04 roster pin: eleven, day then night |
| `verify-corridor` | skin | PASS · 259/259 checks passed | PASS · 259/259 checks passed |  |
| `verify-writing-room` | neighbour | PASS · 51/51 checks passed | PASS · 51/51 checks passed | roster pin: eleven, day then night |
| `verify-dojo-door` | neighbour | PASS · DOJO DOOR CLEAN | PASS · DOJO DOOR CLEAN |  |
| `verify-personal-collections` | neighbour | PASS · 9 journeys passed | PASS · 9 journeys passed | theme row 10 → 11 |
| `verify-design-reader-shelf` | neighbour | PASS · 37/37 passed | PASS · 37/37 passed |  |
| `test-navigation-returns` | neighbour | PASS · 4 pass / 0 fail | PASS · 4 pass / 0 fail |  |
| `verify-n2n1-decks` | neighbour | PASS · status passed | PASS · status passed |  |
| `verify-kotoba-mine` | neighbour | FAIL · 1 check(s) failed | FAIL · 1 check(s) failed | inherited: check e) reduced motion, identical on base |
| `verify-corridor-doors` | neighbour | FAIL · T13 fails (inherited) | FAIL · T13 fails (inherited) | inherited T13; the same 51 checks pass on both |
| `verify-pr77-ports` | neighbour | FAIL · 52/56 checks passed | FAIL · 52/56 checks passed | inherited 4 failures; crumb checks widened to Today |
| `sw-shell` | neighbour | PASS · 8 passed (8) | PASS · 8 passed (8) |  |

No verifier went from pass to fail. The three that fail, fail identically on the base build: `verify-corridor-doors` T13 (documented in `cloud-baseline/FINAL.md`), `verify-kotoba-mine` check e) (reduced motion: the same JSON on both builds), and `verify-pr77-ports` four checks. One of those four, "the review room's × and … read at 4.5:1", measures 1.02:1 because its contrast walker stops at a pale ancestor background; on screen the × and … are light on the dark zen stage (`verify-theme-consistency` evidence `hokusai-3-review-front.png`). Logs: `~/.dharma/bunki_review/2026-10-09/r4/skin/verify/logs/<name>-{base,final}.log`, rows in `results.tsv`.

Base runs of the neighbours outside my lane list used a `git archive` export of `345dba92` (the base versions of the verifiers), so each pin I changed is compared with its own baseline. `verify-corridor-doors` base needed the commit sha passed in (an export has no git), and then failed exactly as documented (T13).

## Verifier changes (also logged in `docs/redesign/VERIFIER_CHANGES.md`)
- `verify-experience.mjs` E04 roster: the ten → the eleven in day/night order; `.nth(4)` / `.nth(5)` → `{ hasText: '金' }` / `{ hasText: '藍' }` (the same worlds; E18 still requires `yoru` after reload); two screenshot captions.
- `verify-writing-room.mjs` `PUBLIC_WORLDS`: the eleven in the new order; two check descriptions.
- `verify-theme-consistency.mjs` `WORLDS`: adds `kaku` (strengthened).
- `verify-personal-collections.mjs`: the personal player's theme row count 10 → 11.
- `verify-pr77-ports.mjs`: the tray crumb may also say 今日 / Today.

All are roster, selector or label pins. No storage, SRS, ledger, offline, deck-front concealment, 44px or contrast assertion changed.

## Still open, honestly
- **Most of what he named is still in the rooms.** The reader's single beige (T4), the popup (T5) and the deck card (T8, T9) belong to the read and cards lanes. My frame and tokens separate the shell from every room, but the reader's picture mat, title block and article paper are drawn by `rooms/read.css`.
- **The header still has seven controls** (back, seal, EN, 日本語, search, Learn, Lists; the reader adds +). Retiring Learn and Lists means editing about 60 verifiers that click them; D7 said keep them.
- *First-pass items superseded by the refine pass below:* the rubber-band, the device checks, the deck names, the remaining "Bunki" lines and the deck rooms' two-tone are all handled or restated in **Review and refine**.
- **Deck names:** the `n2`, `n1` and `senmon` titles in Learn are pinned by `verify-n2n1-decks` and belong with the cards lane's deck homes; "Your five fields" is wrong now that he named three.
- **"Bunki" still appears** in data and rare flows: licence metadata ("Bunki original" in original articles' facts, pinned by several verifiers), two error messages (one pinned by a unit test), the guided set's description, the bug-report prompt and the personal backup's file name (`…-bunki-backup.json`).
- **殻 in Learn:** the stage card mixes the surface with cream, so under 殻 it reads mint.
- **Inherited failures, unchanged:** `verify-corridor-doors` T13; `verify-kotoba-mine` check e) (reduced motion; fails identically on the base); `verify-pr77-ports` four checks (fail on the base too).

## Notes for the lead
- **The build refused the linked `node_modules`.** `scripts/build-reading-module.mjs` asserts "Build inputs must belong to this checkout", and a `node_modules` symlink into `redesign_20261008` resolves the `@bunki/*` workspace packages outside the worktree. I replaced the symlink with a hardlinked copy (`cp -al …/redesign_20261008/node_modules` plus each `packages/*/node_modules`); it stays git-ignored and the tree stays clean. The other lane worktrees were created with the same symlink.
- **Base runs for neighbours** used an export of `345dba92` at `scratchpad/skin/base-src`; `verify-corridor-doors` needs the commit sha passed in there (`KAIRO_EXPECT_GITSHA`), because an export has no git.
- **Merge order hints:** `corridor.js` changes are in the shell (`render()` top line, `PRIMARY_TABS` neighbourhood, `openWorldPicker`, `setKairoTheme`), the Learn renderers (`studyHallDoors`, the stage, `renderDojoDecks`, `renderFocusSitting`, `DOJO_DECKS`) and four single strings (shelf sort, reader credit, list export, grammar reason). The reader credit is the only line inside a read-lane function.

## Review and refine (9 October, 00:27 → 01:41 JST by the clock)

An independent reviewer checked the first pass (`d68e3630`) against his words, THE BAR and the rules. Verdict **fix**: ten fixes, no rule breaks. I applied nine of them in full and one in part (the splash colour, reason under 10). New build **`5d8f319d`**, artifact `be20a0b5befb…`, clean tree; served on 57101, photographed in day · EN, night · EN and day · 日本語, and stopped.

### The ten fixes, in the reviewer's order

**1. By day, a deck room takes the frame of its stage.** His words: T8 *"More sharp, more depth, more contrast, more distinction."*, T9 *"same as above, needs more clarity, more crispness, more tightness."*, T2 *"why do i feel that native ios expeirnce is alreayd way smoother and tighter and crisper"*.
- The first pass put a white top line and a white Line around every black deck (the skin's own `--color-bar`). Now, by day, when the deck on screen is dark (its default look, 抹茶, 黒板, 高コントラスト) or any deck is mid-study, the top line, the Line and the report glyph at its end become one dark frame (`#0b0e14`, on a light hairline) with their own light ink, a light 朱 seal and light marks. A light deck's home, such as N1's washi page, keeps the day frame.
- Safari's bar follows. The deck player changes screens without the shell redrawing, so the shell now re-reads the frame whenever the deck repaints. Measured in Chromium and in WebKit: `#0b0e14` on the kotoba deck; N1 home `#fcfbf8` → N1 study `#0b0e14`.
- **Where I differ from the suggestion:** it proposed every `deckplay` and `contextdeck` view. The context deck and the N1/N2 deck homes are light pages, so a blanket dark frame would make the same two-tone in reverse. The rule keys on what the deck actually draws (`:has()` on the deck's look and its study screen).
- For the lead: in this lane's build the N1 study screen's bottom dock is still the base player's washi, so the dark Line sits on washi there. The cards lane's `player.css` makes that dock the dark stage, which matches. The frame colour sits between the base dark stage (`#0a0e13`) and the cards lane's (`#06080c`); agree it with cards at integration.
- Shots: `shots/day-en/deck-home.png`, `deck-front.png`, `deck-back.png` (and day-ja, night-en), `shots/day-en/n1-deck.png`; `shots/extra/n1-home-day-en.png`, `n1-study-day-en.png` (and `-ja`).

**2. One due signal.** His words: D7 *"Keep them for now — figure out the smartest way to work with this"*; THE BRIEF: *"No silly contraditions… confusing navitation"*.
- The Learn cap's ink dot and its "Learn · N due" name are gone. What is due shows once, on the Line's Today station, where the cards are reviewed. Learn and Lists stay in the header as quiet doors.
- Shot: `shots/extra/shelf-saved-hokusai.png` (3 due on Today, nothing on Learn), `shelf-saved-yoru.png`.

**3. 回廊 KAIRO in the personal collections player.** His words: D3 *"回廊 KAIRO"*.
- The page reached from Learn's "Your own texts" opened with "← Bunki". Now: **← Learn / ← 学ぶ** (where the button goes); the title and kicker **Your own texts / 自分の文章**, as Learn's row says and as Me's door now says too; KAIRO in running English and 回廊 in Japanese in the import, install, storage, transfer and share lines; "Bunki palette" → **Colour theme / 配色**. `mount.mjs` now has no visible "Bunki" (the backup's file name keeps `bunki`).
- Found on the way: since D2 made 殻 public, its button in this player read the raw id "kaku". My bug. The player's theme buttons now use the shell picker's world names, 殻 included.
- Also: this page never runs the shell's render, so it had no `ui-bi` class and its English Line was drawn in Japanese type, and Safari's bar stayed the old beige. It now sets the class and colours the bar from its own page (`#efece5`). And the Line marked **Me** while "← Learn" led to Learn; it marks **Learn** now (one logged pin change, below).
- Shots: `shots/extra/personal-day-en.png`, `personal-day-ja.png`.

**4. The reader's capture button says Save.** His words: T5 *"Save and add to list are confusing???  shouldn:t they be one or the other?"*
- `#reader-take` said "memorize" / 覚える while the popup under it says Save. Its text, its screen-reader name and its panel's name now say **Save / 保存**: "Save 郊外", "郊外 is saved — press again to remove it", "Tap a word, then save it here" (「郊外」を保存 · 「郊外」は保存済み — もう一度押すと外す · 語をタップすると、ここで保存できる). The read lane's note had handed this shell button back to the skin.
- `verify-corridor`'s check (the name carries the touched word) still holds. `verify-reader-gloss` and `verify-record-reading-position` ran against base and refine (table below).

**5. The reader's top line holds one row.** His words: T2 *"tighter and crisper"*. The read lane saw it wrap at 320px, and the reviewer reproduced a 97px header.
- Measured 53px at 320, 360, 375, 390 and 414px, in English and 日本語, before and after selecting a word, with 3 saved words and with a simulated 128.
- How: the capture **+** is always drawn, dim until a word is touched, so its slot is never an unexplained gap; the saved count sits at the bookmark's shoulder, so the bookmark is always one 44px door; below 375px the Learn cap yields to the Learn tab one thumb away, as every other room already did at 360px. `verify-corridor` still finds seven reachable 44px doors, selected or not, and the header height does not move when a word is selected (`verify-redesign-foundation`).
- Shots: `shots/extra/reader-top-320-en-3.png`, `-128.png`, `-touched.png`, and the same for 375px and for 日本語.

**6. Each day world keeps its own paper.** The brief: *"Keep the soul… woodblock warmth"*.
- The first pass mixed only 34% of each world's ground into one neutral, so the six day worlds collapsed toward one look. Now the page is 72% of the world's own ground, raised paper is tinted 40% and the frame 30% from the world's own paper. 藍, the default world he uses, keeps its cool washi (`#efece5`) and white frame (`#fcfbf8`). Learn no longer flattens the page with its own mix.
- Computed from each build's page colours (texture excluded, so not the reviewer's pixel scale): the largest distance between two day worlds is 74.2 tonight, 43.5 in the first pass, 92.1 now; 柿's page is rgb(228, 195, 161) again. Quiet labels in all eleven worlds measure 5.2–11.3:1 (`verify-corridor-accessibility` 53/53).
- Shot: `shots/extra/worlds-today.png` (day row, then night row).

**7. Bounce, press and the phone's bar: what is measured and what is not.** His words: T2 *"native ios expeirnce is alreayd way smoother"*.
- `overscroll-behavior-y` is now `contain` on `html` and `body` in every room (bounce, no pull-to-refresh) and `none` on the door. Measured in Chromium and WebKit (computed values).
- A finding: the old `none` sat on `body` only, and both engines take the viewport's value from `html`, where it was `auto`. So "the bounce is off on his phone" was never established either.
- The press dims at once and lets go (opacity 1 → 0.55 → 1) under a held press in desktop WebKit and in Chromium.
- **Not tested on a phone:** the bounce itself, pull-to-refresh, the touch-down press (iOS needs the shell's touch listener for `:active`), Safari's bar taking the colour, and a home-screen app's status bar with `apple-mobile-web-app-status-bar-style: default`. This Mac has no Xcode or iOS simulator. I claim none of these on a device.

**8. Learn's renamed decks are in the shots, and his T2 screen is named plainly.** His words: T2 *"\*Real Sentences read and recall.. is just very confusing"*.
- Shots: `shots/extra/learn-decks-day-en.png`, `learn-decks-day-ja.png`.
- The cards lane titled the deck "Words you looked up · sentences" (and "· passages"). Learn's rows now use exactly those titles; the skin's `DOJO_DECKS` line is byte-for-byte the cards lane's, so a row and the room it opens say the same thing and the line merges without a conflict. My first-pass names (単語帳…) are withdrawn.
- His T2 screen, the deck home, **still reads "Real sentences · read and recall" in this lane's build**: the title lives in `deck.json`, which is the cards lane's, and it changes when that lane merges. Its Japanese title stays 言葉の鉱脈・文 on both branches; "MCD" in 言葉の鉱脈・MCD means nothing to a first-time user, so `LABELS.md` proposes 調べた言葉・例文 / 調べた言葉・長文, changed in `deck.json` and `DOJO_DECKS` together.

**9. The Line's Japanese labels at full weight.** His words: T4 *"have more contrast, depth, tesxture an clarity"*; T5 *"sharp contrast"*.
- 今日 読む 学ぶ 辞書 私 are back at 800 13px Shippori (the first pass had 700 12px). The frame's quiet ink rises from 62% to 68% in both languages (tab labels and tool glyphs). The personal page's English Line is now in the system face (fix 3).
- Shots: the bottom bar of every `shots/day-ja/*.png`.

**10. Small ones.**
- The crumb pin in `verify-pr77-ports` now names 今日 | Today only (tightened, logged).
- Timed practice: **Start a 20-minute session / 20分の練習を始める** (was "Start 20 minutes").
- The picker reads `ME_NIGHT_WORLDS`; my identical second list is gone.
- The static `theme-color` and the manifest's `theme_color` are the day frame `#fcfbf8`.
- **Disagree in part:** the manifest's `background_color` is `#efece5`, not `#fcfbf8`. It fills the splash screen that hands over to the page, and the page is `#efece5`; the frame colour would flash white, then washi.

### From the review's notes, beyond the ten
- **D2:** on the night picker 漆, 殻 and 浪 almost vanished into the navy. Every stone now carries a fine ring in the panel's own ink. Shots: `shots/extra/picker-night-en.png`, `picker-night-kaku.png`, `picker-day-en.png`.
- **My own find:** 文脈札 (the context cards room) was the old flat beige. Its stylesheet gives `html` a background, which stops `body`'s flat ground passing to the canvas, so `body` painted it over the page layer. `body` is transparent there now and the room shows the shared washi. Shot: `shots/extra/context-day-en.png`.
- **D7, "the bookmark is still named 'Lists', but it opens the room the crumb now calls 'Today'":** kept. The bookmark counts saved words, and they live in Today's lists below the day's plan; its text is pinned (`/^Lists N$/`) and about 60 verifiers press it. The smartest change within that was to stop it and the Learn cap repeating the Line.

### Verifiers (base `345dba92` · first pass `d68e3630` · refine `5d8f319d`)

| Verifier | Lane | Base | First pass | Refine |
|---|---|---|---|---|
| `verify-relief` | skin | PASS · RELIEF CLEAN | PASS · RELIEF CLEAN | PASS · RELIEF CLEAN |
| `verify-theme-consistency` | skin | PASS · THEME SWEEP CLEAN | PASS · THEME SWEEP CLEAN | PASS · THEME SWEEP CLEAN |
| `verify-corridor-accessibility` | skin | PASS · 53/53 checks passed | PASS · 53/53 checks passed | PASS · 53/53 checks passed |
| `lint-ui-language-core` | skin | PASS · 83 visits, 0 issues | PASS · 83 visits, 0 issues | PASS · 83 visits, 0 issues |
| `verify-redesign-foundation` | skin | PASS · 6 language × width × engine journeys | PASS · 6 language × width × engine journeys | PASS · 6 language × width × engine journeys |
| `verify-experience` | skin | PASS · 42 passed, 0 failed | PASS · 42 passed, 0 failed | PASS · 42 passed, 0 failed |
| `verify-corridor` | skin | PASS · 259/259 checks passed | PASS · 259/259 checks passed | PASS · 259/259 checks passed |
| `verify-writing-room` | neighbour | PASS · 51/51 checks passed | PASS · 51/51 checks passed | PASS · 51/51 checks passed |
| `verify-dojo-door` | neighbour | PASS · DOJO DOOR CLEAN | PASS · DOJO DOOR CLEAN | PASS · DOJO DOOR CLEAN |
| `verify-personal-collections` | neighbour | PASS · 9 journeys passed | PASS · 9 journeys passed | PASS · 9 journeys passed |
| `verify-pr77-ports` | neighbour | FAIL · 52/56 checks passed | FAIL · 52/56 checks passed | FAIL · 52/56 checks passed |
| `verify-reader-gloss` | neighbour | FAIL · 76/84 passed | not run | FAIL · 76/84 passed |
| `verify-record-reading-position` | neighbour | PASS · 8 journeys pass | not run | PASS · 8 journeys pass |
| `verify-kotoba-mine` | neighbour | FAIL · 1 check(s) failed | FAIL · 1 check(s) failed | FAIL · 1 check(s) failed |
| `verify-n2n1-decks` | neighbour | PASS · status passed | PASS · status passed | PASS · status passed |
| `verify-design-reader-shelf` | neighbour | PASS · 37/37 passed | PASS · 37/37 passed | PASS · 37/37 passed |
| `test-navigation-returns` | neighbour | PASS · 4 pass / 0 fail | PASS · 4 pass / 0 fail | PASS · 4 pass / 0 fail |
| `verify-corridor-doors` | neighbour | FAIL · T13 fails (inherited) | FAIL · T13 fails (inherited) | FAIL · T13 fails (inherited) |
| `sw-shell` | neighbour | PASS · 8 passed (8) | PASS · 8 passed (8) | PASS · 8 passed (8) |

No verifier went from pass to fail. The four that fail, fail the same way on the base build:
- `verify-pr77-ports`: the same four checks on all three builds (two shelf-note rows, the review room's × and … contrast walker that stops at a pale ancestor, the kanji-chip probe's timeout). Its two crumb checks pass, now tightened to Today.
- `verify-reader-gloss` (run this pass for fix 4): the same eight checks on base and refine, 76/84 on both: the いう and だれ homograph chooser rows, and the five mutation controls that need those rows. Those rows read the sheet's own buttons (`#sheet-take`, `#take`), not the top line's `#reader-take`.
- `verify-kotoba-mine` (fix 1 asked for it): check e), reduced motion, with an identical detail line on all three builds; 151 checks pass on base and refine.
- `verify-corridor-doors`: T13, documented in `docs/redesign/cloud-baseline/FINAL.md`, on all three.

Logs: `~/.dharma/bunki_review/2026-10-09/r4/skin/verify/logs/<name>-{base,final,refine}.log`; rows in `results.tsv`. Base runs of the neighbours use a `git archive` export of `345dba92`, so each pin I changed is compared with its own baseline.

### Verifier changes in this pass (also in `docs/redesign/VERIFIER_CHANGES.md`)
- `verify-pr77-ports.mjs`, both crumb checks: `/リスト|lists|今日|Today/` → `/今日|Today/` (tightened, so the old word fails again); descriptions updated.
- `tools/verify-redesign-foundation.mjs`, the private-deck route: the current tab is `#tab-learn`, not `#tab-me` (the Line's table moved `personaldeck` to Learn). The journey still enters from the Learn tab, still requires `ui` to survive the full-document route and `data-room="personal"`, still clicks Me and reaches `#me-settings`.

No storage, SRS, ledger, offline, zero-leak, 44px or contrast assertion changed.

### Outside the skin's own files (minimal; for the lead)
- `decks/personal/mount.mjs` (unowned): strings and the theme-name table only.
- `corridor.js`: one string in the Me render (`#me-personal`, today lane's function; their branch does not touch that line); two lines in `boot()`'s personal-page path (`ui-bi` and the bar); three lines in `renderDeckPlay` (the observer for Safari's bar); `readerTakeLabel` (the shell button's names; the read lane's branch does not touch it); `DOJO_DECKS` equals the cards lane's line.
- `index.html` (`theme-color`) and `manifest.webmanifest` (two colours).
- `tools/verify-redesign-foundation.mjs`: one pin, logged.

### Still open, honestly
- **Not on a device:** bounce, pull-to-refresh, the touch-down press, Safari's bar colour and the home-screen status bar (fix 7). They need his iPhone.
- **N1/N2 study by day, in this lane alone:** the dock under "Reveal answer" is washi under the dark Line until the cards lane's player merges (fix 1).
- **His T2 screen** reads "Real sentences · read and recall" here until the cards lane's `deck.json` merges; the Japanese deck titles (言葉の鉱脈・MCD) are the cards lane's call, with the proposal in `LABELS.md`.
- **"Your five fields"** is still wrong (he named three, D5); `verify-n2n1-decks` pins it, so it waits for the cards lane.
- **The reader's layers and the popup** (T4, T5: the picture fade, title, explainer and article in one warm beige; the popup a cream card on a cream page) are drawn by `rooms/read.css`, the read lane's.
- **The bookmark named Lists opens Today** (kept; reason above).
- **殻 in Learn:** the stage card mixes the surface with cream, so under 殻 it reads mint.
- **墨 and 板 read as warm paper:** that is their character now that each world keeps its own ground; 藍, his default, is the cool one.
