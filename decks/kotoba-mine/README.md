# 言葉の鉱脈 — Kotoba Mine

A cloze SRS deck built from one learner's own list of 323 looked-up words
(`source/raw-export.txt`, exported from the _Japanese_ iOS dictionary app).

Every word has **three example sentences**. Each sentence is one card with the word
blanked out:

| Level | Length      | What it is                                        |
| ----- | ----------- | ------------------------------------------------- |
| 1     | 6–24 chars  | the simplest everyday use, easy surrounding words |
| 2     | 14–38 chars | a typical real situation, a little more context   |
| 3     | 24–60 chars | a full natural sentence with one joined clause    |

A word's level-2 sentence only appears after its level-1 card has settled into
review (stability of 2+ days), and level 3 after level 2. So the same word keeps
coming back in a new sentence, days apart, never twice in one sitting. This is the
Massive-Context-Cloze idea from AJATT: one blank per card, real context, several
sentences per word.

Every sentence stands on its own: no story, no missing context. It uses the word's
common partners (金利が上がる, 会見を開く …) so the blank points to one answer.
Readings for every kanji appear when you reveal the answer.

## Where to study

| Where                    | How                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Bunki**                | 銀河 → **集中道場** → デッキ → **言葉の鉱脈**. Or open `…/Bunki-app/?deck=kotoba` to land on it directly (a good home-screen shortcut). |
| **Anki**                 | Import `release/kotoba-mine.apkg`.                                                                                                      |
| **Any browser, offline** | Open `release/study.html`.                                                                                                              |

The Bunki player and `study.html` are the same app:

- **Answering:** tap to reveal, then swipe right (覚えた) or left (もう一度), or use the
  buttons. Keyboard: Space reveals, 1–4 grades, U undoes.
- **4択 mode:** pick the word from four choices in one tap.
- **Topic switches:** turn on or off each of the 12 topics (お金・経済, 事件・ニュース, 漢字 …).
- **Word list:** shows each word's progress, three dots for its three sentences.
- **Settings:** new sentences per day, hint in English or Japanese, readings on
  tap, dark or light screen, and backup/restore.

Scheduling is FSRS-6 with Bunki's pinned weights (90% target retention). The deck keeps
its own record (`bunki-cloze:kotoba-mine` in the browser) and never writes the
corridor's word queue.

## Anki

- **Note type:** `Kotoba Mine Cloze`, one note per sentence (969 notes).
- **Fields:** `Key`, `Sort`, `Topic`, `Level`, `Word`, `Reading`, `Meaning`,
  `DefJA`, `SentenceBlank`, `SentenceFurigana`, `SentenceEN`, `Tip`.
- **Card faces:**
  - Front: the sentence with the blank, plus a one-line English hint.
  - Back: `{{furigana:SentenceFurigana}}` (standard `漢字[かんじ]` syntax) with the word
    highlighted, then the reading, a short Japanese definition, the meaning, the
    translation and an optional tip.
- **Order:** new cards come in `Sort` order: every level-1 sentence first, in the
  learner's own mining order, then level 2, then level 3. Because of this order,
  siblings arrive days apart.
- **Subdecks and tags:** one subdeck per topic. Tags: `level1`–`level3` and
  `topic::<id>`.
- **Settings:** turn on FSRS in the deck options. Start at 10–15 new cards a day.

## Files

```
source/raw-export.txt     the learner's export, verbatim
source/entries.json       parsed {n, term, reading, gloss}
source/modules.json       the 12 topics and which words each holds
source/v2/<topic>.json    the cards: meaning, Japanese definition, 3 sentences, tip
source/BRIEF_V2.md        the rules every sentence was written to
source/REVIEW_V2.md       the second-pass editing rules
tools/check_v2.py         validator (lengths, one blank, standalone openings …)
tools/build.py            builds the deck, the Anki package, the TSV and study.html
release/                  kotoba-mine.apkg · kotoba-mine.tsv · study.html
```

The player itself lives in `prototypes/corridor/decks/player/`
(`engine.js`, `mount.js`, `player.css`). The built deck is
`prototypes/corridor/decks/kotoba-mine/deck.json`.

```bash
pip install fugashi unidic-lite==1.0.8 genanki      # once
python3 decks/kotoba-mine/tools/check_v2.py all      # validate the cards
python3 decks/kotoba-mine/tools/build.py             # rebuild everything
node prototypes/corridor/tools/verify-kotoba-mine.mjs   # data + real-browser check
```

To add words, append them to `entries.json`, add their numbers to a topic in
`modules.json`, write their cards in `source/v2/` following `BRIEF_V2.md`, then
rebuild.

Sentences, definitions and tips are Bunki originals written for this word list.
