# 言葉の鉱脈 — Kotoba Mine

A sentence deck built from one learner's own list of 323 looked-up words
(`source/raw-export.txt`, exported from the _Japanese_ iOS dictionary app).

Every card is **a real Japanese sentence** that uses one of the words, mined from how
people actually write: news, blogs, Q&A sites, company and government pages,
Wikipedia, literature, and example-sentence corpora. Each card names where its
sentence came from. Only 11 of 503 sentences were written for the deck, for words
nothing usable could be found for; those are labelled **書き下ろし**.

## The card

- **Front:** the sentence, with the word in colour. No blank, no English, no readings.
  Read it, recall what the word means, then tap. Kanji are underlined: tap one to
  see its reading.
- **Back:** readings over every kanji, the word with its reading, a short Japanese
  definition, the meaning, the translation, an occasional usage note, and the source.
- **Grading:** swipe right for 覚えた (Good) or left for もう一度 (Again).
  難しい and 簡単 are there as buttons if you want them.

How many sentences a word gets depends on how useful it is: common words have up to
three (each in a different situation and from a different kind of source), rarer and
literary words have one. A word's next sentence only appears once the first one is
solid (about two weeks of stability), so the same word comes back later in new
surroundings. If a sentence keeps failing (3 lapses), the next one opens early: a
fresh context often fixes a word that will not stick.

Other ways to study, in settings: **穴埋め** (the word blanked, with an English or
Japanese hint) and **4択** (pick the word from four).

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

- **Note type:** `Kotoba Mine Sentence`, one note per sentence, one card (`Read`).
- **Fields:** `Key`, `Sort`, `Topic`, `Level`, `Kind`, `Word`, `Reading`, `Meaning`, `DefJA`,
  `SentenceFront` (word in bold), `SentenceBlank` (for a cloze template of your own),
  `SentenceFurigana` (`漢字[かんじ]` syntax), `SentenceEN`, `Tip`, `Source`, `SourceURL`.
- **Order:** every word's first sentence comes first (in mining order), then second
  sentences, then third, so a word's sentences arrive weeks apart.
- **Subdecks and tags:** one subdeck per topic; tags `sentence1`–`sentence3`,
  `source::<kind>`, `topic::<id>`. The card edge is coloured by source kind.
- **Settings:** turn on FSRS in the deck options, and grade with Again/Good.

## How the sentences were chosen

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
