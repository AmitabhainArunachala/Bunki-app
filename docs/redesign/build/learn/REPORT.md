# Learn room: lane report (written by the lead from the lane's hand-back; the lane's Write call was blocked)

Branch `claude/redesign-lane-learn`, final commit `e2e832c3`, merged into `claude/redesign-20261008`.

## Before → after
- **Before:** 集中道場, a stack of identical cards: 復習, JLPT 模試, 案内つきの稽古, レッスン, 文の練習, 読み探査… John: "No cluseters like the dojo page having everythign strewn togther."
- **After, the stage:** a lacquer band holding one lit washi card. It is not a numbered section.
  - The card shows the first card in today's queue. If it was saved with a sentence, the sentence appears with the word blanked. Nothing on it is tappable or leaks the answer.
  - The big due count is the same number the Line shows. The N2/N1/専門 split comes from `deckSummaries` and is labelled separately.
  - There is one primary action, "Review N cards". It is still `[data-study-door=review]`.
  - With nothing due, the deck with the most due (or new) cards leads instead.
- **Numbered sections in the pinned order:**
  1. 01 Guided.
  2. 02 Decks: each row shows words, due, new and a hairline of words begun. N2 358 / N1 666 / 専門 976.
  3. 03 Focus sitting.
  4. 04 Tests: the JLPT door, plus Short 20 / Medium 60 / Full 158 min, each with its real readiness ("in preparation").
  5. 05 More practice: a plain index.
- **Signature:** the card lifts and four registration marks snap in, using transform/opacity only. This is off under reduced motion.

## Pins kept
- The order guided/decks/focus.
- 6 doors in `#study-hall`.
- Every `data-study-door` and `data-deck`, in the same deck order and with the same titles.
- The mock door texts.
- The focus controls.
- No verifier edited.

## Verifiers (Chromium, clean build, load ≈ 20)
| Verifier | Result |
|---|---|
| verify-study-hall, verify-redesign-foundation | PASS (each had one flaky run from boot timing) |
| verify-relief, storage-integrity, theme-consistency, corridor-accessibility, lint-ui-language --core-only | PASS |
| verify-guided-session, guided-lookup, kotoba-mine, n2n1-decks | PASS |
| verify-corridor-doors | Only the inherited T13 failure and the hidden `#chrome-dojo` timeout, as at baseline |
| verify-pr77-ports | 53/56. The Skin baseline fails the same 3, which are outside Learn. |
| verify-dojo-door | Aborts with `page.goto ERR_ABORTED` in this container. The Skin baseline aborts the same way. To be confirmed in CI. |

## Honest limits
- The lit card only shows the learner's own saved cards. A deck card would need a front-safe export from the player.
- "Words begun" is inferred from card-id prefixes in each deck's ledger.
- The guided line "6 questions · ~15 min" is the existing fixed text, not computed.
- The screenshots use a five-word fixture loaded through the app's own backup import.
