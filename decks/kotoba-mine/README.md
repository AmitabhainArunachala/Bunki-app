# 言葉の鉱脈 — Kotoba Mine

A massive-context cloze (MCD) deck built from one learner's own list of 323 looked-up
words (`source/raw-export.txt`, exported from the _Japanese_ iOS dictionary app).

## Two decks, side by side

Both decks are built from the same 323 words and sit next to each other in 集中道場 › デッキ.
Each has its own progress and its own colour theme.

| Deck                | What it is                                                               | Theme     | Open with      | Offline file     | Anki               |
| ------------------- | ------------------------------------------------------------------------ | --------- | -------------- | ---------------- | ------------------ |
| **言葉の鉱脈・MCD** | massive-context cloze: passages, one gap per card (1,481 cards)          | 藍 (Ai)   | `?deck=mcd`    | `study-mcd.html` | `kotoba-mcd.apkg`  |
| **言葉の鉱脈・文**  | one real sentence per card, the word marked, read and recall (503 cards) | 墨 (Sumi) | `?deck=kotoba` | `study.html`     | `kotoba-mine.apkg` |

## The player: what a card looks like

The player follows [card contract v2](../../docs/srs/CARD_CONTRACT_V2.md) and the
amendments A26–A45 in [STANDARD.md](../../docs/srs/STANDARD.md). The standalone study pages
bundle the same player, and the Anki templates match it where Anki can.

- **Front:** the passage and nothing else to lean on: no readings, no English, no words to
  tap. Both decks open in 読んで思い出す: the word is marked and you recall its sense and
  reading. 穴埋め and 4択 are one switch away in 設定 › 答え方. No mode shows a hint; one
  shows only on a card you repaired with one (see **Leeches** below).
- **Back, tier one (no taps):** the word large, its reading and part of speech, a reading
  over every kanji in the passage, and the one Japanese definition. A Japanese usage note
  appears only when there is one.
- **Back, tier two (one tap each, in this order):** 英語 (the English gloss, muted), 英訳
  (the target sentence only; 未対応 where the English can't be matched sentence by
  sentence), 漢字の形と意味, 類語 (once the card is in review), the word's other passages
  (titles only), then 出典: the author, the site or 書き下ろし, and the licence.
- **English on tap:** 英語 is closed by default. 設定 › 英語の意味 › いつも開いておく keeps it
  open for that deck.
- **Zoom (MCD passages):** 全文／焦点 in the card header after the reveal. 焦点 folds the
  sentences before and after the target into two dimmed lines each; ⋯ opens a group in
  place. A new card opens in 全文 and a card you've seen opens in 焦点, unless you choose
  one; the choice is kept per deck.
- **Tap to define (back only):** after the reveal, every word of the passage and of the
  definition can be tapped. In Bunki a tap opens an entry sheet: the reading, the Japanese
  sense, English behind 英語, and 覚える to save the word to the reader's lists. A word that
  is already in this deck says 「このデッキにあります」. A word inside the sheet opens one
  more sheet, and that one says 「ここで止めよう」. A tap never grades or schedules anything;
  it is noted in the deck's record (`lookups`). The offline study pages let you tap the
  deck's own words for a small popover, without 覚える. Anki has no taps.
- **Settling:** after the reveal the page scrolls just enough to put the sentence, the word
  and its definition between the header and the grade bar.
- **Grading:** もう一度／思い出せた only, pinned to the bottom of the screen on a phone. Swipe
  left or right also works. The rule "if the answer taught you something, もう一度" shows
  once under the bar. The reveal and swipe hints show for a deck's first three sittings.
- **削除:** at the right of the top bar. One tap suspends the card (its record stays) and
  the toast's 元に戻す undoes it. 設定 › 保留中のカード brings suspended cards back. A card
  deleted before you ever graded it doesn't hold up its word: the word's next passage
  takes its place. There is no whole-deck reset: 設定 › バックアップ keeps コピー and 復元.
- **Leeches:** after 5 lapses the back offers, in order, 別の文に替える (the word's next
  passage replaces this one), ヒントを付ける (a hint on this card's front), 保留 (suspend) or
  このまま続ける. Nothing changes unless you choose.
- **Kanji family:** 漢字の形と意味 shows each kanji with its parts, then your own words from
  this deck that share the kanji (同) or one of its readings (読). Only words you've already
  met count, and each opens in 語の一覧.

### Colour and shape

- **Themes:** 設定 › 色 offers 墨, 藍, 抹茶, 黒板, 和紙, 桜, 白 and 高 (high contrast). Each deck
  remembers its own. Every theme keeps the same colour meanings and passes the contrast
  table in `prototypes/corridor/tools/contrast-kotoba.mjs`.
- **Colour = part of speech:** the asked word and its reading share one hue: blue/accent for
  nouns, orange for verbs, gold for adjectives, violet for adverbs, green for expressions,
  and pink for sound words. English is never coloured.
- **Edge = item kind:** the card edge and first chip say 語, 字 or 文法.
- **Level chip:** a plain N1/N2/N3 chip, only when a public JLPT-style word list gives the
  word one level. It is an estimate (目安), not an exam result.
- **Quiet card:** textures (和紙 fibres, 黒板 chalk) paint the page, never the card. The tips
  panel and topic hues are gone; the method text lives in 設定 › このデッキのしくみ.
- **Motion:** the reveal fades the readings and answer in by 180 ms; a grade slides the card
  out its way. With reduced motion on, nothing moves.

## The method

This follows Khatzumoto's AJATT **MCD (Massive-Context Cloze Deletion)** method: "instead
of having 1 card with 9 unknowns, you have 9 cards with 1 unknown each."

- **Front:** a passage of 2–5 connected sentences with **one target** (one gap in 穴埋め). Readings stay
  hidden, and there's no English.
  - **語 card:** by default (読んで思い出す) the word is marked and you recall what it means
    and how it is read. In 穴埋め the whole word is blanked, with no hint, and you recall
    it from its context; if the word appears twice in the passage, both are blanked.
  - **字 card** (穴埋め and 4択 only; 読んで思い出す leaves them out, records kept): one
    kanji of the word is blanked, with its reading in the gap (〔ざい〕政難…). Recall the character in context. These come from the word's first
    passage, one card per kanji. There is no 字 card when that kanji also appears
    elsewhere in the passage, or when the kanji table has no reading for it.
- **Back:** the whole passage with furigana, the word with its reading, and the Japanese
  definition. Everything else is one tap deep (see **The player** above).
- **Many passages per word.** Each word has 2–4 passages in different situations: news,
  daily life, work, stories. Twenty words also have the contract-v2 pilot passages
  (`source/mcd/pilot-2026-10-04.json`, STANDARD A46): 4–5 sentences, 180–300 characters, each
  written to a register (講 報 論 話 学 語) and a topic, with its own Japanese usage note
  (`tipJa`, shown in tier one) and the grammar points it exercises; they come after the
  word's earlier passages, so no existing card moves. When one card is settled (3 days' stability), the next opens,
  so the word keeps coming back in new surroundings.
- **Passages:**
  - **Real:** mined from livedoor news, Japanese Wikinews, Wikipedia, Aozora Bunko, the web
    and Tatoeba.
  - **Written for the deck:** natural, dense passages labelled 書き下ろし, built around the
    word's typical partners (財政が悪化する, 金利を引き上げる).
  - Today the split is 454 real and 489 written, across 943 passages and 1,481 cards.
- **Grading:** もう一度／思い出せた (Again/Good) is all FSRS needs. Swipe left or right.
- **On screen:** 設定 explains all this under **このデッキのしくみ**.

## Where to study

| Where                    | How                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Bunki**                | 銀河 → **集中道場** → デッキ → **言葉の鉱脈**. Or open `…/Bunki-app/?deck=kotoba` to land on it directly (a good home-screen shortcut). |
| **Anki**                 | Import `release/kotoba-mine.apkg`.                                                                                                      |
| **Any browser, offline** | Open `release/study.html`.                                                                                                              |

Scheduling is FSRS-6 with Bunki's pinned weights (90% target retention). The deck keeps
its own record (`bunki-cloze:kotoba-mine` in the browser) and never writes the
corridor's word queue. Settings: new cards per day, answer mode, English on tap or always
open, colour theme, suspended cards, backup/restore.
復元 checks a pasted backup before it replaces anything, shows both counts, and keeps
the old record as `bunki-cloze:<deck>:before-restore`.

## Anki

- **Note type:** `Kotoba Mine MCD`, one note per gap, one card (`Cloze`).
- **Front:** the passage with its gap (`SentenceBlank`) and no hint line (A37). Anki
  cannot drop a mode's cards; to leave the 字 cards out, suspend them with `Type:字`. **Back:** `{{furigana:SentenceFurigana}}`, the word, the
  definition, and English behind a fold.
- **Fields:** `Key`, `Sort`, `Topic`, `Level`, `Type` (語/字), `Hint`, `Kind`, `Word`,
  `Reading`, `Meaning`, `DefJA`, `SentenceFront`, `SentenceBlank`, `SentenceFurigana`,
  `SentenceEN`, `Tip`, `Source`, `SourceURL`.
- **Order:** every word's first card comes first, then every word's second card, and so on,
  so one word's cards are spread out.
- **Subdecks and tags:** one subdeck per topic. The card edge and first chip show the item
  kind (語/字), and a `level::Nx` tag shows the level chip.
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
  `source/mcd.json` (undated files first, then dated batches such as
  `pilot-2026-10-04.json`, each adding passages after a word's existing ones), checking the
  written-passage rules of `source/REVIEW_MCD.md` and the optional fields `register`, `topic`,
  `tipJa`, `grammar`, `sense`; `tools/build.py` turns it into cards and carries those fields
  onto them.

**Single sentences** (fallback, and the earlier sentence deck):

1. **Mining.** Candidate sentences for every word (and its other spellings) from:
   - the live web via Firecrawl search and scrape (`mining/web/`, about 2,200 lines);
   - open corpora mirrored on GitHub: livedoor news, Japanese Wikinews, Wikipedia text
     (KFTT, JaQuAD, JSQuAD, WAC), UD Japanese GSD web text, WRIME posts (`tools/mine_corpora.py`);
   - Tatoeba with its English, the Tanaka/SNOW example bank and the ja.wikinews archive
     already in the repo (`tools/mine_local.py`);
   - Aozora Bunko literature (`tools/mine_aozora.py`). Aozora is not all public domain:
     the miner reads each work's licence from the end of its text file.
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

Every card names its source. `source/rights.json` is the licence of record for each
source, and `tools/rights.py` applies it to every card when the deck is built:

- **Aozora Bunko** works are licensed one by one. A licence is recorded only after
  someone has read it at the end of the work's text file. Read so far:
  - CC BY 2.1 JP: 富田倫生 (『パソコン創世記』, 『本の未来』, 『「天に積む宝」のふやし方、へらし方』),
    the Sherlock Holmes stories translated or revised by 大久保ゆう, and 『偉大な医師たち』 (tr. 水上茂樹).
  - CC BY 4.0: 『アリスはふしぎの国で』 (tr. 大久保ゆう).
  - No changes allowed (CC BY-ND / CC BY-NC-ND): 小泉八雲 『赤い婚礼』 and 『九州の学生とともに』,
    片岡義男 『七月の水玉』 and 『東京青年』, 鶴岡雄二 『45回転の夏』.
  - Every other Aozora work is labelled "unverified" until its licence has been read.
    Nothing is labelled "public domain".
- **Openly licensed:** Tatoeba (CC BY 2.0 FR), Wikipedia and Wikinews (CC BY-SA / CC BY 2.5)
  and UD GSD (CC BY-SA 4.0).
- **No changes allowed:** livedoor news (CC BY-ND 2.1 JP) and WRIME posts (CC BY-NC-ND 4.0).
- **Web pages:** sentences quoted from web pages are kept for personal study, each with a
  link back to its page.
- **Written for this list:** definitions, meanings, usage notes and the 書き下ろし passages.

## Private and public builds

`tools/build.py` has two profiles. Both give every card the same id, so progress carries
over between them.

| Profile                 | What it is for                                                               | What it leaves out                                                                                                                                                                                                                                                                                                                         | Writes                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `private` (the default) | the learner's own study (private copying, Japanese copyright law Article 30) | nothing                                                                                                                                                                                                                                                                                                                                    | `prototypes/corridor/decks/<id>/deck.json` and `release/` (apkg, tsv, study page, `ATTRIBUTION-<id>.md`), as before |
| `public`                | anything shared: GitHub Pages, a shared `.apkg`, the study page              | livedoor news and other no-changes or non-commercial licences, web-page quotations, posts by private people (x.com, Instagram, Threads, Facebook, note, Ameba, Hatena, Chiebukuro), Aozora works that do not allow changes or whose licence is unread, and CC sources with no link to the exact page. A word left with no card is dropped. | `release/public/` (`deck-<id>.json`, apkg, tsv, study page, `ATTRIBUTION-<id>.md`); never `ids.json`                |

Each `ATTRIBUTION-<id>.md` lists every source that is not written for the deck, grouped by
site, with its licence, author and translator, links (or "no URL recorded") and how many
passages come from it. The public build prints how many cards each rule left out and which
words were dropped.

The app and GitHub Pages still serve the **private** build. Switching Pages to the public
build is the learner's decision (question 1 in
`docs/srs/review-2026-10-04/REFINEMENT.md`); this step does not change `pages-app.yml`.

```bash
python3 decks/kotoba-mine/tools/build.py --frozen                    # private (default)
python3 decks/kotoba-mine/tools/build.py --frozen --profile public   # public
python3 decks/kotoba-mine/tools/test_rights.py                       # licence checks
python3 decks/kotoba-mine/tools/test_gloss_ja.py                     # Japanese sense table
python3 decks/kotoba-mine/tools/test_export_mcd.py                   # passage rules and fields
```

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
source/rights.json        the licence of record for every source (see above)
source/ids.json           every card's id, keyed by word, passage text and card kind;
                          ids of cards no longer built stay reserved and are never reused
source/readings.json      reading fixes applied after tokenising (人 → じん, 一日 → いちにち…)
source/gloss_ja.json      {lemma: one-line Japanese sense} for words that are not the deck's
                          own; build.py ships the ones the passages use in tokens.json defs
                          beside the word ids (a deck word keeps its defJa)
release/                  kotoba-mine.apkg · kotoba-mine.tsv · study.html ·
                          ATTRIBUTION-<id>.md (private build)
release/public/           the public build and its ATTRIBUTION files
                          (tokens-<id>.json and deck-<id>.json beside them)
```

The player lives in `prototypes/corridor/decks/player/` (`engine.js`, `mount.js`,
`player.css`, and `host.js`, the corridor's lexicon adapter); the built deck is
`prototypes/corridor/decks/kotoba-mine/deck.json`, with its tap tokens in `tokens.json`
beside it (the same for `kotoba-mcd/`).

```bash
pip install fugashi unidic-lite==1.0.8 genanki wordfreq    # once
python3 decks/kotoba-mine/tools/rank.py           # after mining
python3 decks/kotoba-mine/tools/export_mined.py
python3 decks/kotoba-mine/tools/build.py
node prototypes/corridor/tools/verify-kotoba-mine.mjs   # data + real-browser check
```
