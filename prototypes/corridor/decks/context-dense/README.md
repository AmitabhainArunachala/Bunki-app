# 文脈札 / Context-dense deck

One portable SRS deck: 323 original paragraphs, one cloze each. The style is the AJATT / MCD line — the paragraph does the asking, and a single blank holds the word.

Each card is at least three sentences and stays inside one dense paragraph (at most five sentences). The back shows the written form, readings, a short original Japanese gloss, a short original English gloss, and the paragraph with the target marked. Schedule state is not inside the card text.

## Inside Bunki

On the bookshelf, open **文脈札**. The first button, 今日の札, starts a sitting. Saying まだ before the answer is shown records Again. Saying 思い出せた, then finding you were wrong, is also Again. Looking through 札の一覧 does not grade anything.

This deck keeps its own ledger (`localStorage` key `bunki-srs-deck:bunki-context-dense-2026`). It does not write the corridor’s word queue, revlog, or FSRS state. New cards are capped at 20 a day. The scheduler is the same FSRS-6 pin as the corridor, with fuzz off.

## Standalone

Serve this folder and open `standalone.html`. The same ledger is used when the page shares an origin with the corridor.

```bash
python3 -m http.server 8765 --directory prototypes/corridor
# http://127.0.0.1:8765/decks/context-dense/standalone.html
```

## Use somewhere else

| File | What it is |
| --- | --- |
| `deck.json` | The deck. Format `bunki-srs-deck`, version 1. No schedule. |
| `basic.tsv` | Anki Basic import: `id`, `front` (blanked paragraph), `back`. |
| `engine.js` | Cloze, validation, queue, and FSRS grading. No DOM. |
| `*-state.json` | Exported from 台帳を書き出す. Format `bunki-srs-deck-state`. |

Anki’s own scheduler can take `basic.tsv`. Another program can import `deck.json` and, if it wants the same memory state, `bunki-srs-deck-state`.

Card text is original. It is not a quotation from a dictionary or a news article. English lines are short glosses written for this deck.

Check the deck:

```bash
node --test prototypes/corridor/decks/context-dense/engine.test.js
```
