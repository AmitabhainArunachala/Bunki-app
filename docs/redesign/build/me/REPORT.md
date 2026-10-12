# Me room: lane report (written by the lead from the lane's hand-back; the lane's Write call was blocked)

Branch `claude/redesign-lane-me`, code commit `3151c39c`, screenshots `fb51f21a`, merged.

## Before → after
**Me is now A's "Book of your year"**, with grafts from C and D. Every number comes from the learner's own record.

- **The book:** a sewn spine and page edges, and "since <first real activity> · day N · M days practised".
- **Lead figure:** characters read unaided, which is characters in finished articles minus the words tapped for help. It appears only once an article has been finished.
- **Four horizons:** gold hairlines with mono numbers, each labelled with how it's measured:
  - N1 words and fields words held by recall, read (never written) from each deck's own `bunki-cloze:<id>` ledger;
  - Kanken kanji held and met;
  - your saved words held.
- **"Came home · mended in gold":** words that lapsed and were later recalled, from the review log, each with a gold crack seam and a glint.
- **Seal calendar:** 習 marks a card day and 読 a reading-only day. Today is the screen's one live mark, and ‹ › turns the month.
- **"A line you wrote by hand":** shown only when a written sentence exists.
- **Back of the book:** English/日本語, Day/Night, and the settings door. Settings and statistics are restyled to match; kagami's markup is untouched.

## Code and pins
- **Code changed:** only `renderMe`/`renderSettings` and new `me*` helpers next to them, plus `rooms/me.css`.
- **Unchanged:** the door ids, the settings → back → Me route, and storage (nothing new is stored).
- **Verifiers:** none edited.

## Verifiers (clean build, Chromium)
| Verifier | Result |
|---|---|
| storage-integrity, redesign-foundation, relief, theme-consistency, lint-ui-language --core-only, design-reader-shelf | PASS |
| corridor-accessibility | PASS on rerun (run 1 hit a reader timing error outside Me) |
| verify-kagami | 30/30 checks pass (its WebKit half can't launch here) |
| verify-dojo-door | `ERR_ABORTED` on the first load in this container; the base build fails the same way |
| verify-experience | 40/42, the same two world-picker failures as the base build |
| verify-corridor | 258/259 on run 3 (dial-persist); runs 1–2 hit the known container flakes |

## Honest limits
- **Screenshots:** they use a fixture learner record; the empty state is shown honestly.
- **Deck totals:** N1 and fields totals appear after a one-time fetch of that deck's `deck.json`, and only for decks the learner has opened.
- **Mended deck words:** these rely on a "recalled on a later day" rule, because the deck log stores no card state.
