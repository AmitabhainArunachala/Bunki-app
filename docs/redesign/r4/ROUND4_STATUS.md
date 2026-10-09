# Round 4 status (2026-10-09 20:39 JST)

Round 4 is John's 14 answers from the side-by-side tour (`docs/redesign/vision/JOHN_10-08_TOUR_FEEDBACK.md`). It was built overnight on his Mac in four lanes. The run stopped at **02:04 JST on 10-09**, when the weekly usage limit ran out.

## What is in this head
Merged and tested: **skin, cards, today**. Each was built, checked by its own tests, reviewed by an independent reviewer, and had the review fixes applied. (Today's fix pass stopped while finishing; all its commits are in.)

**Not merged: read** (T3, T4, T5). Its reviewer found three problems in the lane's first pass:
1. Two record-protection assertions were dropped from `verify-vocabulary-chooser.mjs` (a weakened behavioural verifier, which the rules forbid).
2. The reader's version switch fell to 40px, under the 44px touch floor.
3. A `background-color` transition (motion is transform and opacity only).

The fix was half-written when the limit stopped the run. It is saved, **unbuilt and untested**, on `claude/r4-read-refine-wip-20261009`; the lane's first pass is on `claude/r4-read-20261009`. So in this head the shelf seal, the reader's own layers and the word popup are still the cloud's round-3 work under the new skin.

## Verification of this head
Chromium, 390×844, the built site's identity checked against the commit.

| Result | Verifiers |
|---|---|
| **Pass (24)** | verify-corridor (259 checks), verify-corridor-storage-integrity, verify-corridor-accessibility, lint-ui-language-core, verify-relief, verify-theme-consistency (11 worlds), verify-writing-room, verify-redesign-docks (24/24), verify-redesign-foundation (6 journeys), verify-kotoba-mine, verify-n2n1-decks, verify-personal-collections, verify-dojo-door, verify-guided-session, sw-shell, test-navigation-returns, verify-srs-today, verify-today-sky (81 checks), verify-experience, verify-drift-hunt, verify-design-reader-shelf, verify-reader-doors, verify-reader-lookup, verify-playback |
| **Fail, inherited (2)** | verify-corridor-doors (T13 only) and verify-pr77-ports (52/56). Both fail the same way on the base build. |

Not run on this head: the WebKit runs, the full 230-state language tour, and GitHub's full battery.

## Contract changes in this round (said here because the standing rule requires it)
- `docs/srs/CARD_CONTRACT_V2.md` §4: **four grade buttons** (his decision D1), and §9: the front's chip line.
- `docs/srs/STANDARD.md`: amendment **A53 → S27** (amends A29 and A05).
- Unchanged, and checked on this head: the ledger format, the `bunki-cloze:*` keys, `data/fsrs-pin.json`, `engine.js`, and every card id in all five decks (identical values in identical order). A two-button ledger still loads.

## His answers
| Answer | Status in this head |
|---|---|
| T1 Today and the universe | Done. Today's sky is a window onto the universe; tap the sky or "Explore all words" to rise into it; one Today door at its foot brings you back. |
| T2 deck home, sharper | Done. "Words you looked up", the old colours and four small tiles; the frame, page and raised paper are three materials; iOS-tight presses and type. |
| T3 the shelf seal | **Not merged** (read lane: 読 replaces 永). |
| T4 the reader | **Partly.** The app-wide three materials are in; the reader's own layers are in the unmerged read lane. |
| T5 the word popup | **Partly.** The top bar now says Save; the popup's redesign is in the unmerged read lane. |
| T8, T9 cards | Done. A sharper, deeper card, front and back. |
| D1 four grades, colour-coded | Done. Again · Hard · Good · Easy, each showing its real interval. |
| D2 both night looks | Done. 藍 and 殻 are both public worlds. |
| D3 回廊 KAIRO | Done. The last visible "Bunki" captions are changed. |
| D4 blood | Done, in guided practice on a wrong answer (not in quiet mode, not under reduced motion). |
| D5 N1 date and fields | Done. Me shows N1 · July 2027 with a daily countdown, and his three fields by his own names. |
| D6 price | Done (removed from the PR). |
| D7 header icons | Done. Kept, quieter; one due signal instead of two. |

## Open, for John
1. **The card front:** it now shrinks to fit its text. The fixed-size alternative is kept in `docs/redesign/r4/cards/options/front-b.css`.
2. **Blood:** likely a 13+ age rating. Should it stay on by default?
3. **Opening screen:** the app still opens on the universe, as you ruled on 08-10, with Today one tap away. Opening on Today instead is a small change.
4. **Your fields deck is thin on two fields:** 67 words each for fields 2 and 3, against 287 for learning psychology.
5. **Not tested on a real phone:** the iOS bounce, Safari's bar colour, the press feel.
6. **Small leftovers:** the header bookmark is still named "Lists"; Settings still prints "1 cards".

## What did not happen
- The read lane's fixes and its merge.
- The strict review of the merged build, and the fix round after it.
- A fresh full run of GitHub's battery.
