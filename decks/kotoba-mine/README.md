# 言葉の鉱脈 — Kotoba Mine

A massive-context cloze (MCD) deck built from one learner's own list of 323 looked-up
words (`source/raw-export.txt`, exported from the _Japanese_ iOS dictionary app).

## The method

This follows Khatzumoto's AJATT **MCD (Massive-Context Cloze Deletion)** method: "instead
of having 1 card with 9 unknowns, you have 9 cards with 1 unknown each."

- **Front:** a real passage of 2–4 connected sentences with **one gap**. Readings stay
  hidden, and there's no English.
  - **語 card:** the whole word is blanked, with a short Japanese definition under the
    passage as the hint. Recall the word from its context.
  - **字 card:** one kanji of the word is blanked, with its reading in the gap
    (〔ざい〕政難…). Recall the character in context. These come from the word's first
    passage, one card per kanji.
- **Back:** the whole passage with furigana, the word with its reading, and the Japanese
  definition. The English meaning and translation sit behind a tap. The source is shown.
- **Many passages per word.** Each word has 2–4 passages in different situations: news,
  daily life, work, stories. When one card is settled (3 days' stability), the next opens,
  so the word keeps coming back in new surroundings.
- **Passages:**
  - **Real:** mined from livedoor news, Japanese Wikinews, Wikipedia, Aozora Bunko, the web
    and Tatoeba.
  - **Written for the deck:** natural, dense passages labelled 書き下ろし, built around the
    word's typical partners (財政が悪化する, 金利を引き上げる).
  - Today the split is 454 real and 489 written, across 943 passages and 1,597 cards.
- **Grading:** Again/Good (もう一度／覚えた) is all FSRS needs. Swipe left or right.
- **On screen:** the deck home explains all this under **このデッキのしくみ**.

## Where to study

| Where                    | How                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Bunki**                | 銀河 → **集中道場** → デッキ → **言葉の鉱脈**. Or open `…/Bunki-app/?deck=kotoba` to land on it directly (a good home-screen shortcut). |
| **Anki**                 | Import `release/kotoba-mine.apkg`.                                                                                                      |
| **Any browser, offline** | Open `release/study.html`.                                                                                                              |

Scheduling is FSRS-6 with Bunki's pinned weights (90% target retention). The deck keeps
its own record (`bunki-cloze:kotoba-mine` in the browser) and never writes the
corridor's word queue. Settings: new sentences per day, answer mode, hint language,
readings on tap, dark or light screen, backup/restore.

## Anki

- **Note type:** `Kotoba Mine MCD`, one note per gap, one card (`Cloze`).
- **Front:** the passage with its gap (`SentenceBlank`), plus `Hint` (the Japanese
  definition) on 語 cards. **Back:** `{{furigana:SentenceFurigana}}`, the word, the
  definition, and English behind a fold.
- **Fields:** `Key`, `Sort`, `Topic`, `Level`, `Type` (語/字), `Hint`, `Kind`, `Word`,
  `Reading`, `Meaning`, `DefJA`, `SentenceFront`, `SentenceBlank`, `SentenceFurigana`,
  `SentenceEN`, `Tip`, `Source`, `SourceURL`.
- **Order:** every word's first card comes first, then every word's second card, and so on,
  so one word's cards are spread out.
- **Subdecks and tags:** one subdeck per topic. The card edge colour shows the source kind.
- **Settings:** turn on FSRS, and grade with Again/Good.

## How the passages were made

**Passages (MCD).**

- `tools/mine_passages.py` takes 2–4 sentence stretches around each word from full texts:
  livedoor and Wikinews articles, Wikipedia paragraphs and Aozora prose (9,252 candidates).
- `tools/rank_passages.py` ranks them with the filters below, applied to the whole passage.
- Writers then:
  - chose up to 2 real passages per word, checked so that they make sense on their own and
    that the gap has one answer;
  - wrote 1–2 natural passages per word to the rules in `source/REVIEW_MCD.md`;
  - put the clearest passage first, and translated every passage.
- The writers' choices are in `source/mcd/*.json`; `tools/export_mcd.py` merges them into
  `source/mcd.json`, which `tools/build.py` turns into cards.

**Single sentences** (fallback, and the earlier sentence deck):

1. **Mining.** Candidate sentences for every word (and its other spellings) from:
   - the live web via Firecrawl search and scrape (`mining/web/`, about 2,200 lines);
   - open corpora mirrored on GitHub: livedoor news, Japanese Wikinews, Wikipedia text
     (KFTT, JaQuAD, JSQuAD, WAC), UD Japanese GSD web text, WRIME posts (`tools/mine_corpora.py`);
   - Tatoeba with its English, the Tanaka/SNOW example bank and the ja.wikinews archive
     already in the repo (`tools/mine_local.py`);
   - Aozora Bunko, public-domain literature (`tools/mine_aozora.py`).
2. **Ranking** (`tools/rank.py`, after GDEX "good dictionary examples"): hard filters
   drop fragments, headlines, lines that lean on an earlier sentence (opening with
   しかし, だから, が、…), classical grammar and old spellings, list bullets, captions,
   and anything over 70 characters. The rest are scored: best at 14–40 characters,
   few other hard words (one new word per sentence), common kanji, few proper nouns,
   a typical partner word. Picks are spread across sources and situations.
3. **Reading** (`source/REVIEW_MINED.md`): a reader checked every word's candidates,
   kept only sentences that make sense on their own in the sense the learner looked up,
   and translated them. The choices are in `source/review/*.json`.
4. `tools/export_mined.py` writes `source/mined.json`; `tools/build.py` builds everything.

The mining data itself (`mining/`) is not committed; the scripts rebuild it.

## Sources and licences

Every card carries its source. Tatoeba (CC BY 2.0 FR), Wikipedia and Wikinews
(CC BY-SA / CC BY 2.5), UD GSD (CC BY-SA 4.0) and Aozora Bunko (public domain) are
openly licensed. livedoor news (CC BY-ND 2.1 JP) is quoted verbatim with credit.
WRIME (CC BY-NC-ND 4.0) and sentences from web pages are short quotations kept for
personal study, each with a link back to its page. Definitions, meanings, usage
notes and the 書き下ろし sentences were written for this word list.

## Files

```
source/raw-export.txt     the learner's export, verbatim
source/entries.json       parsed {n, term, reading, gloss}
source/modules.json       the 12 topics and which words each holds
source/v2/<topic>.json    meaning, Japanese definition, usage note (and the
                          written fallback sentence) for every word
source/review/*.json      the reader's final choice and translation per word
source/mined.json         the sentences the deck is built from
tools/                    miners, rank.py, review_input.py, export_mined.py, build.py
release/                  kotoba-mine.apkg · kotoba-mine.tsv · study.html
```

The player lives in `prototypes/corridor/decks/player/` (`engine.js`, `mount.js`,
`player.css`); the built deck is `prototypes/corridor/decks/kotoba-mine/deck.json`.

```bash
pip install fugashi unidic-lite==1.0.8 genanki wordfreq    # once
python3 decks/kotoba-mine/tools/rank.py           # after mining
python3 decks/kotoba-mine/tools/export_mined.py
python3 decks/kotoba-mine/tools/build.py
node prototypes/corridor/tools/verify-kotoba-mine.mjs   # data + real-browser check
```
