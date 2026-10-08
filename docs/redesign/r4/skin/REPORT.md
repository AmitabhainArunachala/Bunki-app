# Round 4 · skin lane report (the global look)

**Branch** `claude/r4-skin-20261009`, from `345dba92`. **Verified build** `d68e3630` (clean tree), artifact `894bd5c9da74…`; base build `345dba92`, artifact `23ccb8bc03d3…`. Built, served on 57101 and photographed at 390×844 @2x in day · EN, night · EN and day · 日本語. Nothing pushed, merged or deployed.

**What the skin owns and changed:** the R4 block at the end of `editorial.css` (token values and global component styles), the world picker in `corridor.css`, the shell in `corridor.js` (top line, the Line, header doors, theme picker, `PUBLIC_THEME_IDS`), `docs/redesign/r4/LABELS.md`.

**Outside my files, kept minimal (say so for the lead):** one string in the reader's picture credit (`readerPicture`, the read lane's function; D3); two English strings in `decks/player/mount.js` (the cards lane's file; D3); one value in `rooms/learn.css` and the Learn room's labels in `corridor.js` (no lane owns Learn; T7 said carry on); D3 strings in `guided-session.mjs`, `reference-ui.js` and `maintenance/report-client.js` (unowned).

**Shots:** `docs/redesign/r4/skin/shots/<mode>/<room>.png` for door, today, read, reader, popup, learn, deck-home, deck-front, deck-back, words and me; extra evidence in `shots/extra/`. The shots he saw tonight are `~/.dharma/bunki_review/2026-10-08/tour/shots/after/<mode>/<room>.png`.

## His lines in my scope

### T2 (English means English)
> this is nice, but things like \*Real Sentences read and recall.. is just very confusing, obtuse and way to generic to mean anyhting at all...   the english is clean though and more understanaalbe, I did like the color of the other side an dthe four windows but maybe not so big.  also, this new build could even be sharper and cleaner.  why do i feel that native ios expeirnce is alreayd way smoother and tighter and crisper than almost everythign we have?

- **"Real Sentences read and recall … way to generic":** that deck is his own 323-word list from his Japanese app, drilled one real sentence at a time. Learn's list now names the two 言葉の鉱脈 decks for what they are: **Your word list · one real sentence each** (単語帳・実例文で一語ずつ) and **Your word list · fill the gap in a passage** (単語帳・長文の穴埋め). The deck home's own title is the cards lane's; `LABELS.md` gives them the same words. Shot: `shots/day-en/learn.png` (the Decks section is below the fold).
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
- **Learn** (T7 "carry on"): the working paper under the stage is the shared washi, not beige (`rooms/learn.css`, one value). Shot: `shots/day-en/learn.png`.
- **One 朱 per screen:** the bar's active language is underlined in ink; the world seal is the bar's only 朱.

### D2 (The night look)
> Offer both

- `kaku` (殻, the electric phosphor night) is public again, beside `yoru` (金, the 藍 night). A saved `kaku` still loads; no saved id changed.
- The picker is two named rows, **Day** and **Night** (昼 · 夜), so both night looks sit side by side, and a line beneath names the world in words ("Gold on indigo", "Electric phosphor"; ベロ藍・浪 in 日本語). Shots: `shots/extra/picker-day-en.png`, `picker-night-en.png`, `picker-day-ja.png`; 殻 across rooms: `shots/extra/kaku-today.png`, `kaku-learn.png`, `kaku-reader.png`; every world's Today: `shots/extra/worlds-today.png`.
- `verify-theme-consistency` now sweeps 殻 too (strengthened); the accessibility verifier already measured it.

### D3 (The name)
> 回廊 KAIRO

- The last visible "Bunki" captions now say 回廊 KAIRO (as a mark; 回廊 carries `lang="ja"`) or KAIRO (in running English): the reader's picture credit (ILLUSTRATION · 回廊 KAIRO, `shots/day-en/reader.png`), the shelf's sort "New to Bunki" → "Newly added", the guided session's eyebrow (回廊 KAIRO / guided practice) and credit, the grammar-held reason, the report sheet, the reference library note, two deck-player notes and the exported list's header. The repository, storage keys and `bunki-*` ids are untouched.

### D7 (Retire the header's duplicate Learn / Lists icons)
> Keep them for now — figure out the smartest way to work with this

- **Kept:** `#chrome-dojo` and `#tray` keep their ids, places, 44px boxes and texts (`Lists N` for the verifiers and screen readers).
- **Quieter:** search · Learn · Lists are one tools group of 18px glyphs in a quieter ink than the preferences.
- **Smarter; each says what the bar can't:** the Learn cap carries an ink dot when cards are due (only away from Today and Learn, which already show the count), and its name says how many ("Learn · 3 due"); the bookmark is an outline with no number at 0 and a filled mark with its count once words are saved; the door of the room you are in is inked. Shots: `shots/extra/header-saved-hokusai.png`, `header-saved-yoru.png`; the empty state in every `shots/*/today.png`.
- In Japanese the bookmark's hidden word is リスト (it was 覚). On wide screens the crumb beside Back said "lists" in the Today room; it now says Today / 今日.

### Plain words
- `docs/redesign/r4/LABELS.md` (committed at 23:03, inside the first hour) lists every coined or obtuse label found on a walk of the base build in both languages, old → new in EN and JA, with file and owner, and marks the pinned ones. Applied in my files and in Learn: Up next, Review cards, Guided test practice, Timed practice, Start 20 minutes, Your saved words, Your own texts, One word, one paragraph; the shell's Colour theme / 配色を選ぶ and リスト; D3. Left for their owners with the wording: the popup's Save → Add to a list, "Open the web" → "Kanji & related words", the sentence row (read); deck homes and grade buttons (cards); Today and Me (today).

## Verifiers (base `345dba92` → final `d68e3630`)

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
- **iOS rubber-band is off.** `body { overscroll-behavior-y: none }` (since the first prototype) stops native bounce, one real reason iOS feels smoother. `contain` would likely restore the bounce without pull-to-refresh, but I could not test it on a phone tonight, so I left it.
- **Not tested on a device:** the touch-down press and the theme-color sync were verified in Chromium only.
- **Deck names:** the `n2`, `n1` and `senmon` titles in Learn are pinned by `verify-n2n1-decks` and belong with the cards lane's deck homes; "Your five fields" is wrong now that he named three. The 単語帳 names are my proposal; he has not seen them.
- **"Bunki" still appears** in data and rare flows: licence metadata ("Bunki original" in original articles' facts, pinned by several verifiers), the personal collections' backup label and two error messages (one pinned by a unit test), the guided set's description and the bug-report prompt.
- **Deck rooms by day:** a dark deck sits inside the white day frame, a hard two-tone. The cards lane can give `deckplay` the night frame through `--color-bar`.
- **殻 in Learn:** the stage card mixes the surface with cream, so under 殻 it reads mint.
- **Inherited failures, unchanged:** `verify-corridor-doors` T13; `verify-kotoba-mine` check e) (reduced motion; fails identically on the base); `verify-pr77-ports` four checks (fail on the base too).
