# Today: lane report

The lead wrote this from the lane's hand-back, because the lane's Write call was blocked.

Branch `claude/redesign-lane-today`, from Skin `f52e12dd` to `3ac25b0a`, merged. Code changed only in the Today functions of `corridor.js` and in `rooms/today.css`. No verifier was edited. After the merge, the lead pointed "Follow P →" at `window.openWordWeb(part)`, falling back to the part's sheet.

## Before → after
### First screen
**Before:** "Memorizing N items", three coloured counter boxes, "review now — N due", and a deck table.

**After:**
- **Heading:** the date eyebrow and **Today** in Shippori 800.
- **Sky:** up to 40 of the learner's saved words, drifting at three depths (transform and opacity only; off under reduced motion). Words due now are bright, with a 朱 dot. Tapping one opens its sheet. The sky is `aria-hidden`.
- **The day's word:** large, with its reading.
- **Hook:** built only from `D.kanji[c].parts` and `D.radicals`. It names the part both kanji share (the heaviest one, so 隹 wins over 亻), how many kanji contain it, and how many of those are already in the learner's words. For a one-kanji word it reads "Inside X hides P".

### Gate 1: the day's word is never due today
It comes from the saved words that are not in `todayQueue().order` and not due before midnight. Failing that, it is a fresh `D.words` word. The pick is deterministic for each date.

### Today's line
- **Stops:** three, on a hairline track: N cards, 1 article, 1 word walk.
- **Live element:** the "now" dot is the screen's one `--color-live`.
- **Train of cards:** learn/new in 朱, review in 藍.
- **The one primary:** `#review-start`, "Begin · N cards" / "はじめる · N 枚".
- **Next door:** "Then 『title』 · N of your words".

### Gate 3: minutes only when they are honest
The time shown is the median gap between grades in `S.revlog`, counting gaps of 1.5–120 s. It appears only once there are 10 or more samples.

### Decks fold
The deck counts, table, forecast and trace keep every pinned id and sit in a fold, with mono numbers on hairlines. The fold is open by default, because the pinned controls must be visible.

### Night
An inline SVG skyline with gold-lit windows and a few 朱 lamps under the word.

### Session close
- **Heading:** "The surface is clear." / 机の上は、空になった。, with "Session done — N reviews" still inside the h1.
- **One next door:** to Read.
- **Tomorrow:** the first word returning tomorrow, half-masked over a horizon.

### Empty learner
A fresh word of the day with a real hook, two stops, and a door to today's reading.

## Pins kept
- `#review-start`: its classes, disabled state, `startReview()`, and its count as the first integer.
- `const due = today.order;`
- `#deck-counts`, `.deck-row[data-deck]`, `#deck-table`, `#deck-browse`/`#deck-stats`, the `.srs-*` lines, `#srs-prefs-toggle`, `[data-preset]`, `#aiq-*`, `#import-file`.
- Done: a single h1 and one `.close-doors`.

## Verifiers (Chromium, clean builds)
- **Pass:**
  - verify-corridor 259/259, storage-integrity, relief, accessibility, theme-consistency, lint --core-only (on `189fdae2`).
  - verify-srs-today 32/32 with both mutants caught, learning-record, bundled-practice, guided-session, journey (on `0c96bfc1`).
- **Found and fixed:** the hero's -36px margin overflowed the page by 18px under a sheet.
- **Not this lane's:** pr77-ports and experience fail the same way on the Skin base. The source-learning check (1440px, 44px controls in the sheet) was not reproduced on the base.

## Honest limits
- "Word walk" is a label only.
- The deck fold is open by default.
- Deck-player dues are not on the line.
- The read count can under-count, because it matches lemma forms.
