# Tour and review: the integrated redesign (HEAD `bc844f99`)

The tour used the built site `/root/.dharma/main/site` (`gitSha bc844f99`, clean, artifact `d85637d9…`). It was served by `prototypes/bunki-desktop/lib/static-host.cjs` and driven with playwright-core and Chromium 1243 at 390×844 @2x, with reduced motion for the stills.

**Learner fixture.** The fixture went in through the app's own importer (`restoreAppFixture` → `#import-file`). It holds 26 saved words: 8 are due, and 18 are scheduled over the coming days. It also holds 40 timed reviews.

**Modes.**
- **Night:** `localStorage['kairo-theme'] = 'yoru'`. Day is `hokusai`.
- **EN:** `?ui=bi`. **日本語:** `?ui=ja`.

**Files.**
- **Shots:** `after/<screen>-<day|night>-<en|ja>.png`. There are 14 screens × 4 modes, plus `after/learn-320-day-ja.png`.
- **Contact sheets:** `sheet-after-{day-en,night-en,day-ja,night-ja}.png`.
- **Before and after:** `beforeafter-{today,read,learn,words,me}.png`. The before shots are Sol's foundation from `build/skin/before-*`, day EN and night 日本語.
- **Motion:** `motion-frames.png` holds 12 frames, each captured about 90–150 ms after a tap with motion on. `journey.webm` is the journey itself, 2.0 MB, trimmed to start at Today.

**Screens.**
- `door` is the drift, the front door.
- `today` is the Today room. `session-close` is Today after eight cards were graded Good.
- `read` is the shelf. `reader` is the first article, and `popup` is the word popup on 郊外.
- `learn` is the Learn room, and `learn-decks` is the same room scrolled to its deck list.
- `deck-home`, `deck-front` and `deck-back` are the N1 deck, opened from Learn → N1.
- `words` is the Words tab. `web-follow` is the word web after Today → "Follow 日".
- `me` is the Me room.

## 1. Checks (VISION §10.2) per room

Key: **P** pass, **F** fail, **~** partial (passes with a visible blemish), **–** not judgeable from stills (verifier-owned or recording-only).

| # | Check | Door | Today | Close | Read | Reader + popup | Learn | Deck (N1) | Words / web | Me |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | One primary | P | P | **F** (primary is "back to lists", not the Next door) | P | ~ (filled Save + header "+" + sentence Save) | ~ ("Review 8 cards" slab + guided card) | P | P | P |
| 2 | EN purity | **F** (ことばに触れて) | P | **F** (良 seal, no English) | P | ~ (part readings おおざと/ぼく in the popup) | P | **F** (名詞 on the card back) | P | P |
| 3 | 日本語 purity | P | P | P | P | ~ ("BUNKI", "Kore") | P | P | ~ ("SKIP" lens and placeholder) | P |
| 4 | Room identity | P | ~ | ~ | ~ | P | P | **F** (a foreign app) | P | P |
| 5 | Tap depth | – | P (Follow → part, 1 tap) | – | – | P (kanji in the popup, part → web 1 tap) | – | – | P | – |
| 6 | Motion | – | **F** (Follow is a hard cut) | – | **F** (room change is a cut) | ~ (popup rises; the article open is a cut) | **F** (cut) | **F** (reveal jolts the page) | P (re-centre animates) | – |
| 10 | Content first | – | – | – | **F** (2 searches, 4 dropdowns, Tools, an unreviewed note above the picture) | ~ (tip box + version note above the text) | – | **F** (front: no reveal above the fold) | – | – |
| 11 | No placeholders | P | P | P | P | **F** ("no recording yet · Kore") | P | P | P | P |
| 12 | No redundancy | P | **F** | **F** | **F** | **F** | **F** | **F** | **F** | **F** |
| 13 | One signal | ~ | **F** (8 朱 due dots + 朱 eyebrow + 朱 日 + teal live dot) | ~ | ~ | P | ~ | **F** (gold, orange, green, red counters) | P | P |
| 14 | Real annotation | P | **F** (says "2 in your words", the web says 5) | P | P | P | P | P | **F** (same mismatch) | P |
| 15 | Correct Japanese | P | P | P | P | **F** (ジャラマナ split into ジャラ + マナ, "Not in the quick dictionary") | P | P | ~ (日 "Name: ひ") | P |
| 16 | Card fronts | – | – | – | – | – | – | P (reading hidden, no leak) | – | – |
| 17 | Overflow 320/390 | P | ~ (chrome wraps to 2 rows at 320) | – | P | P | **F** (日本語 320: +21px from `.focus-mode`; chrome 2 rows) | – | P | ~ (chrome 2 rows at 320) |
| 18 | Day/night parity | P | P (skyline lit) | P | P | P (rain on the plate) | P | ~ (the same navy both ways) | P | P |
| 19 | Voice | – | – | – | – | **F** (no audio for the lead story) | – | ~ | – | – |
| 21 | The bar | **F** | ~ | **F** | **F** | ~ | ~ | **F** | P | P |
| 22 | Three Japans | ~ | P (paper, mono numerals, skyline) | **F** (no city) | **F** (no city) | ~ | **F** | **F** (no paper) | ~ | ~ |
| 24 | The pull | – | P | P (Next door · Read) | – | – | – | – | – | – |

Checks 7, 8, 9, 20, 23 and 25 are verifier- or recording-owned. The verifier lanes report 7–9 as passing.

**Room identity (check 4).** In thumbnails, Learn, Words and Me read as distinct rooms. Today, Read and the review close share the same paper ground, the same vertical room spine and the same large serif heading. They are told apart by their content, not by their form.

**Before and after.** Compared with Sol's foundation, every tab room is a clear step up. Today's three coloured counter boxes and table are gone, and so is Learn's "the focus dojo" list. The day/night pairs in `beforeafter-*.png` show it plainly.

The two surfaces the redesign did not reach are the front door and the N1 deck player. They now look like the old app sitting inside the new one.

## 2. Remaining defects, most visible first

1. **The deck player is a different app (N1/N2/専門).** *Shots: `after/deck-home-*`, `deck-front-*`, `deck-back-*`.*
   - **What's wrong:**
     - Navy and saturated gold, with four rounded counter tiles in orange, green and red. This is exactly the "three coloured boxes" Today threw out.
     - A yellow pill "Begin — 15 cards" and checkbox theme rows. None of it belongs to the paper, ink and 朱 family.
     - It sits under the app chrome, with a 33px strip of paper between the chrome and the navy.
     - **Three exits on one screen:** `‹ Back`, the player's own `←` or `✕`, and the Learn tab.
   - **Fix:**
     - Restyle `.kp[data-look='ai']` in `decks/player/player.css` (around lines 357–361) onto the room tokens: `--kp-bg: var(--color-ground)`, `--kp-panel: var(--color-paper)`, `--kp-cyan: var(--color-accent)`.
     - Collapse `.kp-tiles` (line 67) to a single mono line, "0 due · 15 new · 0 known · 0 difficult". The players around line 278 should not use the 2×2 grid.
     - In corridor.js, hide `#back` whenever `S.view === 'deckplay'`, so the player's `←` is the only exit.
     - Remove the top padding or gap above the `.kp` host in the deckplay mount.

2. **Card front: nothing to do above the fold.** *Shot: `after/deck-front-*-*.png`.*
   - **What's wrong:** `#kp-reveal` sits at y≈1189 on an 844px screen. The front is a wall of N1 passage text with the target buried at line 9, so the learner has to scroll to find "Show answer."
   - **Fix:** make the reveal sticky, the same way `.kp-grades` is (`player.css:229`):
     ```css
     .kp .kp-reveal { position: sticky; bottom: calc(var(--nav-clearance) + 8px); z-index: 2; }
     ```
     Also scroll `.kp-target` to the centre when the card mounts.

3. **Two navigation systems.** *Shots: every tab room, e.g. `after/today-day-en.png` and `after/learn-day-en.png`.*
   - **What's wrong:** John's "confusing navigation". The top chrome repeats the tab bar:
     - `#chrome-dojo` (the cap icon) leads to the same place as `#tab-learn`.
     - `#tray` ("bookmark 26", Lists) leads to the same place as `#tab-today`.
     - `#chrome-search` duplicates `#tab-words`.

     `‹ Back` shows on the root of Today, Learn, Words and Me but not on Read. Its target is invisible, and it costs a second chrome row at 320px (`after/learn-320-day-ja.png`).
   - **Fix:** in `render()` near `corridor.js:30819`, extend `atHome` to `!S.stack.length && PRIMARY_TABS.some((t) => t.view === S.view)`, then *hide* `#back` rather than disabling it. When `body.has-primary-tabs` is set, also hide `#chrome-dojo` and `#tray`. Keep both in the DOM for the pinned verifiers, using `visually-hidden` or a `[hidden]` variant that the verifiers accept. The header then keeps only the seal, EN/日本語 and search.

4. **The front door is the old app, and it speaks Japanese in EN.** *Shots: `after/door-day-en.png`, `door-night-en.png`.*
   - **What's wrong:**
     - A pale, washed-out blue-grey field of low-contrast words.
     - A Japanese hint pill, "ことばに触れて", in EN mode.
     - A lower-case green "review · 8 due" pill.
     - A stray torii button and a bug glyph overlapping the sky.

     It is the first frame of the app and fails the bar. Nothing from the new world appears: no paper, no 朱, no skyline.
   - **Fix:**
     - `drift-layer.*` is frozen, so after the drift mounts, set `#drift-layer #hint` from corridor.js with `tx('ことばに触れて', 'Touch a word')`. Alternatively, hide it under `html:not([lang|=ja])`.
     - Restyle `#home-review` (corner bubble) as the room's single primary: Shippori label, `var(--color-accent)` ink, and "Review · 8 due".
     - Give the door one 朱 element and the night skyline used on Today.

5. **Today and the word web disagree about the same part.** *Shots: `after/today-*.png` and `web-follow-*.png`.*
   - **What's wrong:** Today says "日 … 265 kanji carry it · **2** in your words". One tap later the web says "265 kanji share this part · **5** already in your words". The hook is the room's signature, and its number is wrong to the eye.
   - **Fix:** in `todayHook()` (`corridor.js:10968`), compute `mine` with the web's rule. Use `wwPartCap(part, { kanji: mineKanji }).mine`, built from `wwPartMembers`, instead of filtering `D.radicals[part].kanji`. Use `family` from the same `wwPartCap(...).count`.

6. **The Read shelf opens on a filter wall.** *Shots: `after/read-*.png`.*
   - **What's wrong:** above the first picture (y=334) there are:
     - two search fields: `#search` "Look up a word" and `#shelf-reading-search` "Search";
     - an ⓘ next to each;
     - four dropdowns: Latest, Topic, Level, Grade;
     - a `Tools` pill;
     - "Unreviewed · 54 of 120 not yet checked by a person ⓘ".

     This is the "clutter like the old dojo page" John named. It fails check 10, and check 12 because search appears three times counting the header.
   - **Fix:**
     - In `rooms/read.css`, fold the four dropdowns and `#shelf-reading-search` into the `#shelf-tools-toggle` sheet, so they are closed by default.
     - Move the "unreviewed" line onto each card's meta, which already says UNREVIEWED in the reader.
     - On `html[data-room='shelf']`, hide `#search`, because the header search already exists. If `#search` is pinned, keep it collapsed to the icon.

7. **The reader looks triple-spaced, with chrome above the text.** *Shots: `after/reader-*.png`.*
   - **What's wrong:**
     - At 19px with line-height 40.85px, plus reserved ruby, consecutive lines sit about 53px apart. That is roughly 2.8× the font size, so the article reads like a ruled exercise book.
     - Above the first line sit a version explainer ("The simplified version retells…"), a tip box (`tapLadderHint()`, `corridor.js:8877`), an UNREVIEWED pill and a slider icon.
     - A permanent bar at the bottom reads "no recording yet · Kore -------" (`voicePendingNote()`, `corridor.js:9461`).
   - **Fix:**
     - When furigana is off, drop the reserved ruby height: `#reader:not(.fg-always) rt { line-height: 0 }`, or lower `.reader` line-height to about 1.9.
     - Show the tip only on the first article ever. Mark it as seen in the record, or under a `localStorage` key.
     - When there is no audio, render nothing instead of `voicePendingNote`.
     - Remove the version explainer line. The tab labels "Original · N1 / Simplified · N3" already say it.

8. **The session close puts the primary on the wrong door, and an EN seal.** *Shots: `after/session-close-*.png`.*
   - **What's wrong:**
     - The one filled button is "back to lists" / "リストへ" (`corridor.js:21812`). "Lists" is the old name for Today, and this is the dead-end action. The real next door, "Next door · Read", is a quiet card above it.
     - "良 8" is a bare kanji seal with no English in EN (`seals` at `corridor.js:21716`).
     - "Next to come back" shows 電話 sliced in half (`.review-tomorrow-w`, `rooms/today.css:579`), which reads as a broken render.
     - "Report a problem · My reports" text links duplicate the tab-bar bug glyph.
     - 40% of the screen is empty.
   - **Fix:**
     - Make the Next-door card the primary. Demote `out` to a text link, "Back to Today" / "今日へ".
     - In EN, render the seal as `el('span','g-seal', tx('良','Good'))`, or add the English label beside it.
     - Mask the word with a gradient only, at no more than 35% of its height, so the glyphs stay legible.
     - Hide the report links when `body.has-primary-tabs` is set.

9. **Reveal jolts the page.** *Shot: `motion-frames.png`, frame 07.*
   - **What's wrong:** at about 110 ms after `#kp-reveal`, the document scrolls under the chrome. The chrome leaves the frame and the tab bar floats up, with a paper band showing beneath it. The back then settles with the card's top cut off under the chrome (`after/deck-back-*.png`).
   - **Fix:** in `decks/player/mount.js` around line 1872 (`replaceWith(gradeBar(id))`), scroll the answer into view with `scrollIntoView({block:'nearest'})` inside the card's own scroller. Do not scroll the window, and add `scroll-margin-top: var(--chrome-h)` to the answer block.

10. **Room-to-room motion is a cut.** *Shot: `motion-frames.png`, frames 02, 05, 09 and 10.*
    - **What's wrong:** 120 ms after Follow, Learn, Read or opening an article, the frame is already the settled destination. Follow-日 doesn't carry the 日 from Today into the web's centre, so the signature moment has no motion at all. Only the web's re-centre (frame 04) and the popup rise animate. This fails "motion has weight, held frames, cuts that carry meaning".
    - **Fix:** add a View Transition on the part glyph. Give `.dw-go .japanese-lookup-word` and `.ww-centre` the same `view-transition-name: hook-part` and wrap `window.openWordWeb` in `document.startViewTransition`. Add a 180 ms opacity/translate entrance keyed on `html[data-room-entering]`, which is already stamped.

11. **The Today sky shouts.** *Shots: `after/today-*.png`.*
    - **What's wrong:** 20 star words, each due one with a 朱 dot (8 dots), plus the 朱 "TODAY'S WORD" eyebrow, the 朱 日, a teal "now" dot and a 朱 tab badge "8". That breaks check 13. The sky also crowds the word of the day: 確認, 権利 and 推進 butt against 時間 at the same weight as the hero.
    - **Fix:**
      - In `rooms/today.css`, `.today-star.due::after`: drop the dots, or tint them with `--color-ink-faint`.
      - Make the eyebrow ink-muted.
      - Keep a 120px clear radius around `.dw-word`, filtered at star layout in the Today sky builder.

12. **EN shows Japanese on the card back.** *Shots: `after/deck-back-*-en.png`.*
    - **What's wrong:** the part-of-speech chip reads "名詞" in EN.
    - **Fix:** in `decks/player/mount.js:1012`, change `const pos = (POS[word.pos] || ['', ''])[1]` to pick `[0]`, the English name, when the UI is EN. Map `noun→'noun'` and so on rather than the CSS key.

13. **The popup sits off-centre and offers three ways to save.** *Shots: `after/popup-*.png`.*
    - **What's wrong:**
      - `#mini` is 322px wide at left 8, leaving a 60px gutter on the right, and covers the article title.
      - It offers a filled **Save** and "This sentence: Save" inside the popup, plus the reader chrome's "+", which appears only once a word is selected.
    - **Fix:**
      - In `rooms/read.css:438`, set `html[data-room='reader'] body #mini { left: 16px; right: 16px; max-width: none; }` on phones.
      - Rename the sentence action "Save sentence".
      - Hide the chrome "+" while `#mini` is open.

14. **A tokenizer error in the lead story.** *Shot: `after/popup-day-en.png` from the first tour, now replaced by 郊外.*
    - **What's wrong:** the place name ジャラマナ is split into ジャラ + マナ. Tapping ジャラ gives "Not in the quick dictionary … So it can't be saved here." with a dashed, disabled Save. That is the first word a new user is likely to tap.
    - **Fix:** in the article build, merge katakana runs of 3 or more characters into one `plain` token when no dictionary entry covers the split. Alternatively, mark proper nouns `data-japanese-lookup=off`.

15. **Learn overflows at 320 in 日本語.** *Shot: `after/learn-320-day-ja.png`.*
    - **What's wrong:**
      - `.focus-mode` "読み探査 まだ取っていない熟語を測る" ends at x=341 on a 320px screen, causing 21px of horizontal scroll.
      - The header wraps to two rows and cuts off the 学ぶ spine, so the room label is half hidden.
    - **Fix:** in `rooms/learn.css`, set `.focus-mode { min-width: 0 } .focus-mode-sub { overflow-wrap: anywhere }`. Defect 3's chrome fix removes the second header row.

16. **Words stacks a search panel above the web.** *Shots: `after/words-*.png`.*
    - **What's wrong:**
      - The 11-lens strip is cut mid-word at the right edge ("radica", "手書").
      - "Find by shape · open SKIP wheel" sits as a grey slab.
      - The placeholder is clipped: "SKIP 1-3-(".

      The web, the room's signature, starts at y=344.
    - **Fix:**
      - In `rooms/words.css` around lines 295–302, fade the strip's right edge with a mask, so the cut reads as scrollable.
      - Move `#search-skip-opener` into the "shape code" lens.
      - Shorten the placeholder to "kanji · kana · English".

17. **The tab bar ghosts the content.** *Shots: every tab room, e.g. `after/today-day-en.png` and `learn-decks-day-en.png`.*
    - **What's wrong:** `.primary-tabs` is 94% opaque with `backdrop-filter: blur(18px)`. Large numerals and text show through as grey ghosts under the labels ("0 8", "My contexts").
    - **Fix:** in `editorial.css:3308`, make `.primary-tabs` an opaque `var(--color-paper)` and add a hairline top border.

18. **Word-web details.** *Shots: `after/web-follow-*.png`.*
    - **What's wrong:**
      - The legend reads "● KANJI  n STROKES", a literal "n" (`corridor.js:17577`).
      - The 日 part's NAME is "ひ", its kun reading, where 日 as a radical is にち/ひへん.
      - "IN YOUR WORDS 5" repeats the 5 in the sentence directly above.
    - **Fix:**
      - Render the legend as a superscript numeral sample, e.g. `12` with "strokes".
      - Use `D.radicals[p].name` only; skip the kun fallback for parts.
      - Drop the duplicate mark in `wwModel` (around line 17430).
