# 言葉の鉱脈 — Kotoba Mine

A sentence-first SRS deck built from one learner's own mined-word list: 323 words
exported from the _Japanese_ iOS dictionary app (`source/raw-export.txt`), each rebuilt
as a context-rich card and grouped into twelve themed **modules** (鉱脈, "veins").
Every module has its own original Japanese passage that uses all of its words, and
every card asks its word inside a sentence from that passage.

The same deck runs in three places:

| Where                    | File                                                                              | What you get                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bunki** (the corridor) | `prototypes/corridor/data/share_alike/decks/kotoba-mine.json` + 12 shelf articles | Shelf → **単語帳**. Each module opens its passage in the reader, enrolls its words in one press (ぜんぶ覚える) and reviews only that module (この鉱脈だけ復習). Cards are reviewed with Bunki's own FSRS-6, blanked inside the mined sentence. |
| **Anki**                 | `release/kotoba-mine.apkg`                                                        | One note type, two card templates, one subdeck per module, tags per module and register.                                                                                                                                                       |
| **Direct study, no app** | `release/study.html`                                                              | One self-contained page: open it in any browser. FSRS-6 scheduling, module toggles, reader with tappable mined words, word index, progress backup.                                                                                             |

A plain `release/kotoba-mine.tsv` (Anki text-import headers, HTML fields) is there for
any other SRS.

## Method

The design follows what the immersion-learning and Anki communities have converged
on since AJATT (Khatzumoto's _All Japanese All The Time_) and its successors (Matt vs
Japan's MIA/Refold, the sentence-mining workflow around Yomichan/Yomitan and Anki,
and FSRS from the open-spaced-repetition project):

1. **Words live in sentences.** A card's front is a real sentence with the target
   word marked, never the bare word. The sentence is chosen so everything around the
   word is easier than the word itself (i+1), so context does most of the teaching.
2. **Read first, then mine.** Every module starts with a passage of roughly 1,000–1,500
   characters (essay, feature, story or news) where all its words appear naturally.
   Read it in Bunki's reader, or in study.html under 読む, before starting its cards.
   The card's first sentence is copied verbatim from that passage, so each review
   recalls a scene, not a list.
3. **More than one context.** Every card also carries a second sentence in a different
   register or sense (spoken vs written, literal vs figurative), so the word isn't
   locked to one context. Words with genuinely split senses (一層, 下敷き, …) carry a
   third.
4. **Monolingual first, English as a safety net.** Each card has an original short
   Japanese definition (`def_ja`) written in words easier than the headword. This is
   the bridge from J→E to J→J dictionaries. The English gloss sits under it, and the
   sentence translation is folded away by default.
5. **Recognition before production.** The default card is recognition: read the
   sentence, understand the word. The production card (cloze plus Japanese
   definition → produce the word) is optional. In study.html it unlocks per word only
   after that word's recognition card has graduated.
6. **Interference is taught, not avoided.** Mined lists collect near-homophones and
   near-synonyms. Cards name the confusables the learner will actually mix up
   (帰納的/機能的, 新体制/身体性, 共学/驚愕, 検討/健闘, 争う/競う, 金利/利率/利息,
   生得的/先天的 …), each with a one-line distinction.
7. **Fix the dictionary when it misleads.** Raw JMdict glosses lead with rare or
   archaic senses. Authors trimmed each gloss to the senses actually met, and corrected
   misleading ones in the card note. Examples: 返却 is not "repayment" (that's 返済),
   一層 "rather" is really いっそ, 動線計画 is architectural flow planning, 落脱 is
   bookish (natives say 脱落).
8. **Modern scheduling.** Both Bunki and study.html use FSRS-6 with Bunki's pinned
   weights at 90% target retention. In Anki, turn on FSRS in the deck options
   (Anki ≥ 23.10).

## Modules

| #   | Module           | Theme                                                                | Passage                                                     | Words | jReadability    |
| --- | ---------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ----- | --------------- |
| 01  | お金の時間       | Money over time: interest, repayment and the economy                 | 『足し算で増えるお金、掛け算で増えるお金 — 祖父の帳簿から』 | 32    | 2.78 (中級後半) |
| 02  | 覇権の盤面       | The hegemony board: the Cold War and chip trade friction             | 『半導体をめぐる覇権の盤面 ― 日米摩擦から何を読むか』       | 29    | 2.02 (上級前半) |
| 03  | 砂から回路へ     | From sand to circuits: how a chip is made                            | 『砂から回路へ — 半導体ができるまで』                       | 22    | 2.25 (上級前半) |
| 04  | 事件の夜         | The night of the incident: search, testimony, prosecution            | 『戻らなかったボート ― 三浦沖の捜索と、消えた証人』         | 31    | 2.78 (中級後半) |
| 05  | 議事堂の一日     | A day at the Diet: parliament, the imperial house, press conferences | 『議事堂の長い一日』                                        | 26    | 2.02 (上級前半) |
| 06  | 橋が落ちた日     | The day the bridge fell: auditing a public works project             | 『橋が落ちた日 — 浜里町歩道橋崩落、県議会が検証』           | 22    | 2.01 (上級前半) |
| 07  | 盤上の神童       | The prodigy at the board: the language of competition                | 『盤上の十七歳 — 朝霧湊、初のタイトル挑戦』                 | 38    | 2.77 (中級後半) |
| 08  | 脳と言葉の科学   | Brain and language science: acquisition, verification, the body      | 『大人の脳は第二言語をどう覚えるか』                        | 30    | 2.39 (上級前半) |
| 09  | 計算機と形式言語 | Computers and formal languages: STEM vocabulary                      | 『記号で世界を書く ― 引力から文法まで』                     | 11    | 2.50 (上級前半) |
| 10  | 台所と旅の宿     | Kitchen and inn: food, daily life, seasons                           | 『讃岐の秋、台所の音』                                      | 31    | 3.41 (中級後半) |
| 11  | 人の顔つき       | Faces and attitudes: temperament, slang, onomatopoeia                | 『銀髪の部長と、なんくるない夜』                            | 43    | 3.32 (中級後半) |
| 12  | 単漢字           | Single kanji: the feel of the character                              | 『一字の住まい — 漢字は熟語の中で暮らしている』             | 8     | 3.70 (中級前半) |

jReadability is measured on the exact passage text by the corridor's grading pipeline
(lower = harder). All people and places in the news-style passages are fictional.
Real institutions (国会, 気象庁, 警視庁) and historical facts (the 1986 US–Japan
semiconductor agreement, the Imperial House Law's male-line rule) are stated neutrally.

## Using it

**Bunki.** Open the shelf → 単語帳 → a module. Read the passage (読み物), then press
ぜんぶ覚える, or press 覚える on single words. Enrolled words review in the normal 復習
session, or only that module via この鉱脈だけ復習. Each module is also a named list
(`言葉の鉱脈 · <module>`) in the lists tray.

**Anki.** Import `release/kotoba-mine.apkg`. You get the subdecks `言葉の鉱脈 Kotoba
Mine::01 …` to `::12 …`. Suspend modules you aren't ready for, or study them one by
one. To turn on production cards, fill the `Production` field: in the Browser, select
the notes, then _Notes → Find and Replace_ on field `Production`, regex `^$` → `y`.
Tags: `km::<module>`, `km::register::<報道|学術|…>`, `km::kanji`,
`km::has-confusable`.

**study.html.** Open the file (or its published copy). Tick modules under 学ぶ, press
Space to reveal, then 1–4 to grade (u undoes). Progress stays in that browser. Use
設定 → 書き出す to copy a backup and 読み込む to restore it on another device.

## Layout and rebuild

```
source/raw-export.txt      the learner's export, verbatim
source/entries.json        parsed {n, term, reading, gloss}
source/modules.json        module order, titles, and which words (n) each holds
source/modules/<id>.json   authored passage + cards (the real source of truth)
source/AUTHORING_BRIEF.md  the authoring rules every module was written to
tools/check_module.py      validator for one or more modules
tools/build_deck.py        builds everything below
deck.json                  canonical full deck (generated)
release/                      apkg, tsv, study.html, build-report.json (generated)
```

```bash
pip install fugashi unidic-lite==1.0.8 jreadability==1.1.5 genanki   # once
python3 decks/kotoba-mine/tools/check_module.py m01-money            # validate
python3 decks/kotoba-mine/tools/build_deck.py                         # rebuild all
node prototypes/corridor/tools/build-standalone.mjs                   # refresh the single-file corridor
node prototypes/corridor/tools/verify-kotoba-mine.mjs                 # data + real-browser check
```

The build tokenises each passage with the corridor's own pipeline. It merges the span
each card is asked on into one token whose base form is the headword, so the review
cloze blanks exactly that word. The verifier proves all 323 anchors hold.

To add words later, append them to `entries.json`, add their `n` to a module (or a new
module) in `modules.json`, write their cards following `AUTHORING_BRIEF.md`, then
rebuild.

## Licences

Passages, sentences, Japanese definitions and notes are Bunki originals. English
glosses are edited from JMdict (© EDRDG, CC BY-SA 4.0), so the corridor copy of the
deck lives under `data/share_alike/`.
