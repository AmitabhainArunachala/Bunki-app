# Round 4 status (2026-10-10 04:24 JST)

Round 4 is John's 14 answers from the side-by-side tour (`docs/redesign/vision/JOHN_10-08_TOUR_FEEDBACK.md`). **All four lanes are now merged in this head, together with 621 new cards for his two thin fields.**

## What is in this head
- **Skin, cards, today:** built overnight on 10-08/09, each reviewed independently and fixed; merged and verified on 10-09.
- **Read** (T3, T4, T5): the first pass removed two record-protection assertions, dropped a control under the 44px floor, and animated a colour. Codex Sol finished it on 10-10:
  - both assertions are back on the real failure path, with deliberately broken controls proven to fail;
  - the version switch is 44px;
  - only transform and opacity animate;
  - all eleven review fixes are done.
- **Fields cards** (his answer on 10-09: "Yes, write more"): Codex Astra wrote 621 judged passage cards.
  - Field 2 (yoga, Buddhism, Jain and Hindu history through Japan, and the neuroscience tie) went from 67 words to 394.
  - Field 3 (semiconductors, AI, investing, Hofstadter and recursion) went from 67 to 361.
  - The fields deck is now 1,597 words, and is renamed 専門・あなたの分野 / "Your fields · master's level".
  - A first pass overused one framing (89 cards were about how to write or explain the idea; 99 ended in ましょう). 202 cards were rewritten; the habit is now under 1%, and the diversity audit enforces the cap.

## Verification of this head
Run on the merge commit `2ad1a509` (Chromium, 390×844, the built site's identity checked against that commit). The commits after it add only documents.

| Result | Verifiers |
|---|---|
| **Pass (30)** | verify-corridor (259 checks), verify-corridor-storage-integrity, verify-corridor-accessibility, lint-ui-language-core, verify-relief, verify-theme-consistency, verify-writing-room, verify-redesign-docks, verify-redesign-foundation, verify-kotoba-mine, verify-n2n1-decks, verify-personal-collections, verify-dojo-door, verify-guided-session, sw-shell, test-navigation-returns, verify-srs-today, verify-today-sky, verify-experience, verify-drift-hunt, verify-design-reader-shelf, verify-reader-doors, verify-reader-lookup, verify-playback, verify-annotation-lookup, verify-vocabulary-chooser, verify-shelf-search, verify-sentence-drafts, verify-bundled-listening, verify-listening-failures |
| **Fail, inherited (2)** | verify-corridor-doors (T13 only) and verify-pr77-ports (52/56, the same four checks). Both fail the same way on the build before round 4. |

- **Cards:** every card that existed before is still present with identical content, in all five decks (n2 358, n1 666, fields 976 of 1,597, kotoba 503 and 2,435).
- **Untouched:** `data/fsrs-pin.json`, `engine.js` and the storage markers.
- **Verifier change, timing only:** `verify-dojo-door` now waits for the shelf's card and survives an aborted navigation (logged in `VERIFIER_CHANGES.md`).
- **Not run on this head:** the full WebKit runs (Sol ran the reader-shelf suite in WebKit; it passed), the 230-state language tour, and GitHub's full battery.

## Contract changes in this round (said here because the standing rule requires it)
- `docs/srs/CARD_CONTRACT_V2.md` §4: **four grade buttons** (his decision D1), and §9: the front's chip line.
- `docs/srs/STANDARD.md`: amendment **A53 → S27** (amends A29 and A05).
- Unchanged: the ledger format, the `bunki-cloze:*` keys, `data/fsrs-pin.json`, `engine.js`, and every existing card id.

## His answers
| Answer | Status in this head |
|---|---|
| T1 Today and the universe | Done. Today's sky is a window onto the universe; one Today door brings you back. |
| T2 deck home, sharper | Done. "Words you looked up", the old colours and four small tiles; three materials instead of one beige. |
| T3 the shelf seal | Done. 読 replaces 永. |
| T4 the reader | Done. A lacquer mat for the picture, a raised title card, a recessed version switch, a one-line tip, textured article paper. |
| T5 the word popup | Done. A distinct card: Save, then Add to a list; "Related words"; one "Study this sentence" door. |
| T8, T9 cards | Done. A sharper, deeper card, front and back. |
| D1 four grades, colour-coded | Done. Each shows its real interval. |
| D2 both night looks | Done. 藍 and 殻. |
| D3 回廊 KAIRO | Done. |
| D4 blood | Done; on by default (his answer, 10-09). |
| D5 N1 date and fields | Done. N1 · July 2027 countdown; three fields by his names. |
| D6 price | Done (removed). |
| D7 header icons | Done. Kept, quieter. |
| Card front | Shrinks to fit (his answer, 10-09). |
| Opening screen | The universe (his answer, 10-09). |

## Still open
1. **A strict review of the whole merged build** against the vision's 25 screenshot checks, and the fix round after it.
2. **Not tested on a real iPhone:** the iOS bounce, Safari's bar colour, the press feel.
3. **Not built yet:** a first-day welcome, share frames, more motion craft, sound.
4. **Small leftovers:** the header bookmark is still named "Lists"; Settings still prints "1 cards"; tall sentence cards on a phone scroll inside the popup.
5. **GitHub's full battery** has not been run on this head.
