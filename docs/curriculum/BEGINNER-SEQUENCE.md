# Beginner sequence — the on-ramp from zero to the first guided readings

**Status:** draft manifest, version 1, drafted 2026-11-07, `frozen: false`, no freeze date, no hash (MF2 sets both). Manifest:
`prototypes/corridor/data/beginner/manifest-draft/units.json`, mirrored in the fenced block of `MANIFEST.md` in the same directory.
Spec: S3-R6 (content for every band), S3-R15 and S13.8 (manifests freeze before content fans out), S3-DD3 and S3-AC9 (kana and at
least 500 words, each with audio and a situation; the manifest shows which of the next 500 exist), S3-OI3 (Claude sequences). S3-R3
stands: the spiral and the pacing of culture against language are proposals; this sequence is the order the first build follows, not
a fixed pedagogy.

## The sequence in prose

1. **Kana and sound (5 units).** The 46 basic hiragana with the five vowels first, because every later item is written in them;
   then the voiced marks, the combinations きゃ・しゅ・ちょ, the small っ and long vowels, taught as sound before sign; then katakana
   twice over the same way, ending with the loanword sounds (ファ・ティ・ヴ) that only katakana carries; then a unit that puts the
   script into real words — numbers 1 to 10 and 100/1,000/10,000, はい・いいえ, and contrast pairs (雨／飴, 橋／箸, 病院／美容院,
   ビル／ビール) so that length and pitch are heard from day one. Every sign and word has an audio slot.
2. **Survival phrases (6 units, 66 phrases).** Greetings and politeness, introducing yourself, the station and directions, the
   convenience store and shopping, eating out, help and health. Each phrase is given in Japanese, kana, Hepburn romaji and English,
   with the key words linked to their dictionary entries, a register note where it matters, an audio slot (never a clip id) and a
   pending native read. Phrases come before words because a true beginner needs working sentences in week one.
3. **Situation words (45 units, 500 distinct JMdict entries).** The first 500 words of the frequency source below, in five
   bands of 100 by rank, each band regrouped by theme (people; being, doing and having; pointing, asking and amounts; time and
   place; thinking, saying and feeling; describing; actions and movement; home, town, travel and nature; daily life and body; work,
   society and media). Inside a band one theme is one unit; a theme with fewer than five words in a band joins its nearest
   neighbour, and the unit names every situation it holds (greetings-grade labels such as food-and-drink, money-and-shopping,
   transport-and-travel stay on the words). Every word
   carries its JMdict entry id (G9 identity), its rank, its usual written form, the JMdict gloss, a beginner sense note where the
   first gloss misleads, its situation and an audio slot.
4. **Guided reading (4 units).** The four N5 and four N4 graded articles that already ship in the corridor, two per unit, pinned by
   sha256, each with comprehension, listening (narration slot) and a retelling task stored as transfer evidence, never as a grade
   (S3-R16). The sixteen library N5 stories are the next pool.

The phases are strictly ordered in the manifest (the judge test enforces it). Interleaving readings earlier than the last word unit is a
version-2 question (S3-R3).

## Unit order (read from units.json)

| # | Phase | Unit id | Title | Items | Prerequisites |
|---|---|---|---|---|---|
| 1 | Kana and sound | `unit:beginner:kana:01-hiragana-basic` | Hiragana: the 46 basic signs and the five vowels | 46 | — |
| 2 | Kana and sound | `unit:beginner:kana:02-hiragana-marks-and-combinations` | Hiragana: voiced marks, combinations, small っ and long vowels | 59 | `unit:beginner:kana:01-hiragana-basic` |
| 3 | Kana and sound | `unit:beginner:kana:03-katakana-basic` | Katakana: the 46 basic signs | 46 | `unit:beginner:kana:02-hiragana-marks-and-combinations` |
| 4 | Kana and sound | `unit:beginner:kana:04-katakana-marks-and-loanword-sounds` | Katakana: marks, combinations, ー and loanword sounds | 77 | `unit:beginner:kana:03-katakana-basic` |
| 5 | Kana and sound | `unit:beginner:kana:05-sound-and-script-in-first-words` | Sound and script in your first words: numbers, yes and no, length and pitch | 37 | `unit:beginner:kana:02-hiragana-marks-and-combinations`, `unit:beginner:kana:04-katakana-marks-and-loanword-sounds` |
| 6 | Survival phrases | `unit:beginner:phrases:01-greetings` | Greetings and politeness | 12 | `unit:beginner:kana:05-sound-and-script-in-first-words` |
| 7 | Survival phrases | `unit:beginner:phrases:02-introductions` | Meeting people and introducing yourself | 10 | `unit:beginner:phrases:01-greetings` |
| 8 | Survival phrases | `unit:beginner:phrases:03-train-and-directions` | Station, train and directions | 10 | `unit:beginner:phrases:02-introductions` |
| 9 | Survival phrases | `unit:beginner:phrases:04-convenience-store-and-shopping` | Convenience store and shopping | 10 | `unit:beginner:phrases:03-train-and-directions` |
| 10 | Survival phrases | `unit:beginner:phrases:05-restaurant` | Eating out | 12 | `unit:beginner:phrases:04-convenience-store-and-shopping` |
| 11 | Survival phrases | `unit:beginner:phrases:06-help-and-health` | Help, health and trouble | 12 | `unit:beginner:phrases:05-restaurant` |
| 12 | Situation words | `unit:beginner:words:b1-01-people` | People: pronouns, family and meeting (band 1) | 12 | `unit:beginner:kana:05-sound-and-script-in-first-words`, `unit:beginner:phrases:01-greetings` |
| 13 | Situation words | `unit:beginner:words:b1-02-being-doing-and-having` | Being, doing, having and giving (band 1) | 21 | `unit:beginner:words:b1-01-people` |
| 14 | Situation words | `unit:beginner:words:b1-03-pointing-asking-and-amounts` | Pointing, asking, how much and how often (band 1) | 17 | `unit:beginner:words:b1-02-being-doing-and-having` |
| 15 | Situation words | `unit:beginner:words:b1-04-time-and-place` | Time, days, positions and directions (band 1) | 8 | `unit:beginner:words:b1-03-pointing-asking-and-amounts` |
| 16 | Situation words | `unit:beginner:words:b1-05-mind-and-words` | Thinking, saying and feeling (band 1) | 9 | `unit:beginner:words:b1-04-time-and-place` |
| 17 | Situation words | `unit:beginner:words:b1-06-describing` | Describing things (band 1) | 5 | `unit:beginner:words:b1-05-mind-and-words` |
| 18 | Situation words | `unit:beginner:words:b1-07-actions-and-movement` | Actions and movement (band 1) | 13 | `unit:beginner:words:b1-06-describing` |
| 19 | Situation words | `unit:beginner:words:b1-08-daily-life-and-body` | Daily life: food, money, body and leisure (band 1) | 9 | `unit:beginner:words:b1-07-actions-and-movement` |
| 20 | Situation words | `unit:beginner:words:b1-09-work-society-and-media` | Work, school, society and media (band 1) | 6 | `unit:beginner:words:b1-08-daily-life-and-body` |
| 21 | Situation words | `unit:beginner:words:b2-01-actions-and-movement` | Actions and movement (band 2) | 5 | `unit:beginner:words:b1-09-work-society-and-media` |
| 22 | Situation words | `unit:beginner:words:b2-02-time-and-place` | Time, days, positions and directions (band 2) | 8 | `unit:beginner:words:b2-01-actions-and-movement` |
| 23 | Situation words | `unit:beginner:words:b2-03-town-travel-and-nature` | Home, town, travel, nature and the world (band 2) | 13 | `unit:beginner:words:b2-02-time-and-place` |
| 24 | Situation words | `unit:beginner:words:b2-04-describing` | Describing things (band 2) | 7 | `unit:beginner:words:b2-03-town-travel-and-nature` |
| 25 | Situation words | `unit:beginner:words:b2-05-mind-and-words` | Thinking, saying and feeling (band 2) | 7 | `unit:beginner:words:b2-04-describing` |
| 26 | Situation words | `unit:beginner:words:b2-06-pointing-asking-and-amounts` | Pointing, asking, how much and how often (band 2) | 20 | `unit:beginner:words:b2-05-mind-and-words` |
| 27 | Situation words | `unit:beginner:words:b2-07-people` | People: pronouns, family and meeting (band 2) | 7 | `unit:beginner:words:b2-06-pointing-asking-and-amounts` |
| 28 | Situation words | `unit:beginner:words:b2-08-daily-life-and-body` | Daily life: food, money, body and leisure (band 2) | 6 | `unit:beginner:words:b2-07-people` |
| 29 | Situation words | `unit:beginner:words:b2-09-work-society-and-media` | Work, school, society and media (band 2) | 17 | `unit:beginner:words:b2-08-daily-life-and-body` |
| 30 | Situation words | `unit:beginner:words:b2-10-being-doing-and-having` | Being, doing, having and giving (band 2) | 10 | `unit:beginner:words:b2-09-work-society-and-media` |
| 31 | Situation words | `unit:beginner:words:b3-01-daily-life-and-body` | Daily life: food, money, body and leisure (band 3) | 15 | `unit:beginner:words:b2-10-being-doing-and-having` |
| 32 | Situation words | `unit:beginner:words:b3-02-describing` | Describing things (band 3) | 9 | `unit:beginner:words:b3-01-daily-life-and-body` |
| 33 | Situation words | `unit:beginner:words:b3-03-being-doing-and-having` | Being, doing, having and giving (band 3) | 12 | `unit:beginner:words:b3-02-describing` |
| 34 | Situation words | `unit:beginner:words:b3-04-work-society-and-media` | Work, school, society and media (band 3) | 15 | `unit:beginner:words:b3-03-being-doing-and-having` |
| 35 | Situation words | `unit:beginner:words:b3-05-actions-and-movement` | Actions and movement (band 3) | 10 | `unit:beginner:words:b3-04-work-society-and-media` |
| 36 | Situation words | `unit:beginner:words:b3-06-town-travel-and-nature` | Home, town, travel, nature and the world (band 3) | 12 | `unit:beginner:words:b3-05-actions-and-movement` |
| 37 | Situation words | `unit:beginner:words:b3-07-mind-and-words` | Thinking, saying and feeling (band 3) | 15 | `unit:beginner:words:b3-06-town-travel-and-nature` |
| 38 | Situation words | `unit:beginner:words:b3-08-pointing-asking-and-amounts` | Pointing, asking, how much and how often (band 3) | 12 | `unit:beginner:words:b3-07-mind-and-words` |
| 39 | Situation words | `unit:beginner:words:b4-01-daily-life-and-body` | Daily life: food, money, body and leisure (band 4) | 15 | `unit:beginner:words:b3-08-pointing-asking-and-amounts` |
| 40 | Situation words | `unit:beginner:words:b4-02-actions-and-movement` | Actions and movement (band 4) | 8 | `unit:beginner:words:b4-01-daily-life-and-body` |
| 41 | Situation words | `unit:beginner:words:b4-03-pointing-asking-and-amounts` | Pointing, asking, how much and how often (band 4) | 16 | `unit:beginner:words:b4-02-actions-and-movement` |
| 42 | Situation words | `unit:beginner:words:b4-04-describing` | Describing things (band 4) | 8 | `unit:beginner:words:b4-03-pointing-asking-and-amounts` |
| 43 | Situation words | `unit:beginner:words:b4-05-people` | People: pronouns, family and meeting (band 4) | 13 | `unit:beginner:words:b4-04-describing` |
| 44 | Situation words | `unit:beginner:words:b4-06-town-travel-and-nature` | Home, town, travel, nature and the world (band 4) | 13 | `unit:beginner:words:b4-05-people` |
| 45 | Situation words | `unit:beginner:words:b4-07-work-society-and-media` | Work, school, society and media (band 4) | 17 | `unit:beginner:words:b4-06-town-travel-and-nature` |
| 46 | Situation words | `unit:beginner:words:b4-08-being-doing-and-having` | Being, doing, having and giving (band 4) | 10 | `unit:beginner:words:b4-07-work-society-and-media` |
| 47 | Situation words | `unit:beginner:words:b5-01-work-society-and-media` | Work, school, society and media (band 5) | 11 | `unit:beginner:words:b4-08-being-doing-and-having` |
| 48 | Situation words | `unit:beginner:words:b5-02-mind-and-words` | Thinking, saying and feeling (band 5) | 14 | `unit:beginner:words:b5-01-work-society-and-media` |
| 49 | Situation words | `unit:beginner:words:b5-03-actions-and-movement` | Actions and movement (band 5) | 9 | `unit:beginner:words:b5-02-mind-and-words` |
| 50 | Situation words | `unit:beginner:words:b5-04-daily-life-and-body` | Daily life: food, money, body and leisure (band 5) | 12 | `unit:beginner:words:b5-03-actions-and-movement` |
| 51 | Situation words | `unit:beginner:words:b5-05-pointing-asking-and-amounts` | Pointing, asking, how much and how often (band 5) | 7 | `unit:beginner:words:b5-04-daily-life-and-body` |
| 52 | Situation words | `unit:beginner:words:b5-06-town-travel-and-nature` | Home, town, travel, nature and the world (band 5) | 11 | `unit:beginner:words:b5-05-pointing-asking-and-amounts` |
| 53 | Situation words | `unit:beginner:words:b5-07-describing` | Describing things (band 5) | 13 | `unit:beginner:words:b5-06-town-travel-and-nature` |
| 54 | Situation words | `unit:beginner:words:b5-08-people` | People: pronouns, family and meeting (band 5) | 9 | `unit:beginner:words:b5-07-describing` |
| 55 | Situation words | `unit:beginner:words:b5-09-time-and-place` | Time, days, positions and directions (band 5) | 7 | `unit:beginner:words:b5-08-people` |
| 56 | Situation words | `unit:beginner:words:b5-10-being-doing-and-having` | Being, doing, having and giving (band 5) | 7 | `unit:beginner:words:b5-09-time-and-place` |
| 57 | Guided reading | `unit:beginner:reading:01-first-mornings` | First mornings: two N5 readings | 2 | `unit:beginner:words:b5-10-being-doing-and-having` |
| 58 | Guided reading | `unit:beginner:reading:02-station-and-neighbour` | The station and the neighbour: two N5 readings | 2 | `unit:beginner:reading:01-first-mornings` |
| 59 | Guided reading | `unit:beginner:reading:03-market-and-bicycle` | The market and the bicycle: two N4 readings | 2 | `unit:beginner:reading:02-station-and-neighbour` |
| 60 | Guided reading | `unit:beginner:reading:04-bookshop-and-letter` | The bookshop and the letter: two N4 readings | 2 | `unit:beginner:reading:03-market-and-bicycle` |

Prerequisites always point at earlier units; the first unit has none.

## Frequency source

The spec names no frequency list. The shipped dict-v2 index carries only JMdict's binary *common* flag (jmdict-simplified drops the
`nfNN` bands), and the licensed lists the research named are either not redistributable (BCCWJ, CC BY-NC-ND) or unlicensed (jpdb). The
draft therefore derives its rank from bytes already pinned in this repo:

- **Source:** `Lemma frequency over the shipped examples bank (SNOW T15/T23 + Tanaka Corpus sentences)` — id `bunki-examples-bank-lemma-frequency-v1`.
- **Inputs:** `prototypes/corridor/data/proprietary_safe/examples/s-00.json … s-22.json` (23 shards, 23 files), combined sha256
  `4ec3124d5bc848182698b4c27f329d21a872a14ba6462972440b445576ad8610` (sha256 over the bytes of s-00.json .. s-22.json concatenated in name order).
- **Counted:** source codes 0 (SNOW T15/T23, CC BY 4.0) and 1 (Tanaka Corpus, CC BY 2.0 FR): 35016 sentences. Excluded: code 2
  (ja.wikinews, news register), 10260 sentences.
- **Tokenizer:** fugashi 1.5.2 + unidic-lite 1.0.8 (the repo grader's lineage), re-tokenising the sentences rebuilt from the
  bank's own surfaces to recover lemma and lemma reading. Content tokens: 170098; distinct keys: 17286; resolved
  JMdict entries: 16887.
- **Resolution:** each (lemma, reading) key is resolved to a dict-v2 row (index sha256 `d20bb1fa3f968bd2f5e4e84c2ed0221fbd0d2d655f17dbc23713152995619b84`, pin
  `3.6.2+20260803141815`); counts aggregate per entry, so 言う／いう and 良い／いい／よい count once. Keys the shipped index lacks
  are named against the pinned full JMdict (zip sha256 `1806d2817215ebe7ded997c8dac4831a3335d83ed12f321ac869a97e745d3a5c`) and flagged **missing at base** for L2.1.
- **Rules:** 
  - count a token when pos1 is one of 名詞, 代名詞, 動詞, 形容詞, 形状詞, 副詞, 連体詞, 接続詞, 感動詞
  - exclude 固有名詞 (proper nouns) except 地名-国 (country names, e.g. 日本)
  - exclude 助動詞語幹 (よう/そう/みたい stems), フィラー (hesitation あの/えーと)
  - exclude any lemma containing characters outside hiragana, katakana, ー, 々 and CJK ideographs (digits, Latin, symbols)
  - key = (UniDic lemma without its disambiguation suffix, lemma reading in hiragana); counts aggregate per resolved JMdict ent_seq
  - resolve a key to the dict-v2 row whose written or kana forms contain the lemma or an observed base form; score: +4 primary reading equals the lemma reading, +2 any kana form equals it, +2 JMdict common, +1 head equals the lemma or the most frequent base form, +1 the lemma itself matched; ties -> lowest seq
  - a lemma in READING_PREFERENCES (私 わたし, 母 はは, 体 からだ, 最も もっとも, 女 おんな, 土地 とち) is scored with the preferred reading instead of UniDic's formal or alternate reading; reading_conflict records both
  - a lemma ending in ずる is read as the 〜じる form when the index has it (感ずる -> 感じる); lemma_normalized records the original
  - the lemma 於く (〜において) is excluded; nothing else is merged or overridden by hand
  - rank = position when sorted by aggregated token count descending, then ent_seq ascending
  - a key with no dict-v2 row is resolved against the full pinned JMdict when given and flagged missing_at_base; a key found nowhere is listed under unresolved
- **Bias, stated:** The bank is a coverage-greedy selection of sentences (build_examples.py, 4-6 per dictionary target), so counts are frequencies within the shipped bank, not in the raw corpora; the raw corpora are not in the repo.
- **Derived list:** `frequency-source.json` (sha256 `d3997e786aec599c879acb550b730b0a591c870d04078087a30dca8fcfe025c6`), produced by `derive-frequency.py` in the same directory.
- **Review item:** The spec names no frequency list (contract unknown 1). This source is pinned, rights-cleared and in the repo, but it is a coverage-greedy bank, not a balanced corpus; the reviewer decides whether it stands or a licensed list replaces it in version 2.

### Words skipped as artifacts

Short-unit tokenization splits compounds (飛行機 → 飛行＋機) and JMdict sometimes splits one lexeme by reading. These entries are skipped
when the 500 slots are filled; the ranks they held stay visible here and in `word_selection.excluded_as_artifacts`.

| Rank | Entry | Reason |
|---|---|---|
| 99 | 語|ご | short-unit split of 日本語・フランス語 (〜語); 英語 and 日本語 are whole words elsewhere |
| 132 | 何|なん | JMdict splits 何 by reading; the lexeme is rank-23 何 (なに／なん) |
| 141 | 機|き | short-unit split of 飛行機 (飛行＋機) |
| 168 | 会|かい | suffix split of 〜会 (パーティー会, 音楽会); not a beginner standalone word |
| 186 | 一|ひと | short-unit split of 一つ・一人 (一＋つ); 一 (いち) is rank 35, 一つ is taught in the numbers unit |
| 238 | 飛行|ひこう | short-unit split of 飛行機 (飛行＋機) |
| 289 | 部|ぶ | suffix split of 〜部 (野球部, 一部); 全部 and 部分 are whole words elsewhere |
| 325 | 数|すう | prefix split of 数日・数人 (数＋日); 数 (かず) stands as the word |
| 332 | テン|てん | katakana rendering of the digit 10 in a few sentences; numbers are taught as 十 |
| 348 | 法|ほう | suffix split of 〜法 (方法, 文法); 法律 and 方法 are whole words elsewhere |
| 421 | 社|しゃ | suffix split of 〜社 (新聞社, 会社); 会社 is a whole word |
| 432 | 市|し | suffix split of 〜市 (city names); not a beginner standalone word |
| 448 | 地|ち | short-unit split of 土地・地図・地下 (〜地) |
| 472 | 幾|いく | short-unit split of 幾つ・幾ら (幾＋つ); いくら is rank 300 and いくつ is taught in the numbers unit |
| 907 | 自転|じてん | short-unit split of 自転車 (自転＋車); also missing at base |
| — | ５０|ごじゅう | digit token; numbers are taught as kanji numerals |
| 794 | 日|にち | date counter 〜日 mis-sensed as the abbreviation for Sunday; 日 (ひ) is rank 79 and dates are taught in time-and-days |
| 981 | 日間|にっかん | counter split of 三日間 (〜日間) |
| 933 | 感|かん | suffix split of 〜感 (責任感, 安心感); 感じる is the word |
| 834 | 懸命|けんめい | short-unit split of 一生懸命 (一生＋懸命) |
| 985 | ジム|じむ | the Tanaka Corpus name Jim tokenized as the common noun gym |
| 793 | 他|た | JMdict splits 他 by reading; the lexeme is 他 (ほか) |

### Missing at base (for L2.1)

| Rank | Word | ent_seq | Where |
|---|---|---|---|
| 441 | 御座る (ござる) | 1270350 | first_500 |
| 598 | お陰 (おかげ) | 1001640 | words_next_500 |

## Tolerance band and grouping rule

Tolerance band: the 500 slots are cut into five bands of 100 slots in rank order; every word in a later band has a higher frequency rank than every word in an earlier band, and inside a band the words are regrouped by theme, so a word may appear at most 125 ranks earlier than the highest rank already listed (observed maximum in this draft: 102).

Grouping rule: each word carries one situation id from the taxonomy of 27 situations; situations roll up into 10 themes; inside a band the words of one theme form one unit; a theme with fewer than 5 words in a band joins its first listed neighbour theme present in that band (the unit names every situation it includes and each word keeps its own situation id); units inside a band are ordered by their mean rank, and words inside a unit are ordered by rank.

| Band | Slots | Ranks | Units (words) |
|---|---|---|---|
| 1 | 1–100 | 2–101 | People: pronouns, family and meeting (12); Being, doing, having and giving (21); Pointing, asking, how much and how often (17); Time, days, positions and directions (8); Thinking, saying and feeling (9); Describing things (5); Actions and movement (13); Daily life: food, money, body and leisure (9); Work, school, society and media (6) |
| 2 | 101–200 | 110–205 | Actions and movement (5); Time, days, positions and directions (8); Home, town, travel, nature and the world (13); Describing things (7); Thinking, saying and feeling (7); Pointing, asking, how much and how often (20); People: pronouns, family and meeting (7); Daily life: food, money, body and leisure (6); Work, school, society and media (17); Being, doing, having and giving (10) |
| 3 | 201–300 | 208–307 | Daily life: food, money, body and leisure (15); Describing things (9); Being, doing, having and giving (12); Work, school, society and media (15); Actions and movement (10); Home, town, travel, nature and the world (12); Thinking, saying and feeling (15); Pointing, asking, how much and how often (12) |
| 4 | 301–400 | 308–410 | Daily life: food, money, body and leisure (15); Actions and movement (8); Pointing, asking, how much and how often (16); Describing things (8); People: pronouns, family and meeting (13); Home, town, travel, nature and the world (13); Work, school, society and media (17); Being, doing, having and giving (10) |
| 5 | 401–500 | 413–514 | Work, school, society and media (11); Thinking, saying and feeling (14); Actions and movement (9); Daily life: food, money, body and leisure (12); Pointing, asking, how much and how often (7); Home, town, travel, nature and the world (11); Describing things (13); People: pronouns, family and meeting (9); Time, days, positions and directions (7); Being, doing, having and giving (7) |

### Themes (the level units are cut on inside a band)

| Theme id | Label | Japanese | Situations |
|---|---|---|---|
| `being-doing-and-having` | Being, doing, having and giving | ある・する・もらう・こと | `being-and-doing`, `giving-and-receiving`, `talking-about-things` |
| `actions-and-movement` | Actions and movement | とる・つかう・いく・くる | `everyday-actions`, `going-coming-and-moving` |
| `pointing-asking-and-amounts` | Pointing, asking, how much and how often | これ・どこ・とても・たくさん | `pointing-and-asking`, `degree-and-frequency`, `counting-and-amounts` |
| `people` | People: pronouns, family and meeting | ひと・わたし・かぞく | `people-and-meeting`, `family-and-friends` |
| `mind-and-words` | Thinking, saying and feeling | おもう・いう・すき | `thinking-and-saying`, `feelings-and-mind` |
| `time-and-place` | Time, days, positions and directions | いま・きょう・なか・まえ | `time-and-days`, `positions-and-directions` |
| `town-travel-and-nature` | Home, town, travel, nature and the world | いえ・まち・えき・やま・にほん | `home-and-town`, `transport-and-travel`, `nature-and-weather`, `countries-and-world` |
| `daily-life-and-body` | Daily life: food, money, body and leisure | たべる・おかね・からだ・あそぶ | `food-and-drink`, `money-and-shopping`, `daily-life`, `body-and-health`, `sports-and-leisure` |
| `describing` | Describing things | おおきい・あたらしい・いい | `describing-things` |
| `work-society-and-media` | Work, school, society and media | しごと・がっこう・しゃかい・ほん | `work-and-school`, `society-and-news`, `learning-and-media` |

### Situation taxonomy (the label every word carries; words in the first 500)

| Situation id | Label | Japanese | Words |
|---|---|---|---|
| `being-and-doing` | Being, doing and becoming | ある・いる・する・なる | 23 |
| `pointing-and-asking` | Pointing and asking | これ・それ・どこ・いつ | 20 |
| `people-and-meeting` | People and meeting people | ひと・わたし・あなた | 28 |
| `family-and-friends` | Family and friends | かぞくと ともだち | 13 |
| `talking-about-things` | Talking about things | こと・もの・ため | 25 |
| `thinking-and-saying` | Thinking, saying, seeing and hearing | おもう・いう・みる・きく | 29 |
| `giving-and-receiving` | Giving and receiving | あげる・もらう・くれる | 12 |
| `everyday-actions` | Everyday actions | とる・もつ・つかう | 27 |
| `going-coming-and-moving` | Going, coming and moving | いく・くる・あるく | 18 |
| `time-and-days` | Time and days | いま・きょう・あした | 22 |
| `degree-and-frequency` | How much and how often | とても・すぐ・もう | 26 |
| `counting-and-amounts` | Counting and amounts | かず・たくさん・ぜんぶ | 19 |
| `describing-things` | Describing things | おおきい・あたらしい・いい | 42 |
| `feelings-and-mind` | Feelings and the mind | すき・こころ・きもち | 16 |
| `positions-and-directions` | Positions and directions | なか・まえ・うえ・ちかく | 8 |
| `home-and-town` | Home and town | いえ・まち・みせ | 12 |
| `transport-and-travel` | Transport and travel | えき・でんしゃ・バス | 11 |
| `nature-and-weather` | Nature, weather and animals | あめ・やま・いぬ | 25 |
| `food-and-drink` | Food and drink | たべる・のむ・みず | 6 |
| `money-and-shopping` | Money and shopping | おかね・かう・みせ | 9 |
| `daily-life` | Daily life | せいかつ・ねる・おきる | 14 |
| `body-and-health` | Body and health | からだ・あたま・びょうき | 15 |
| `learning-and-media` | Learning, reading and media | ほん・よむ・かく | 18 |
| `work-and-school` | Work and school | しごと・がっこう・かいしゃ | 22 |
| `society-and-news` | Society and the news | しゃかい・せいふ・けいさつ | 26 |
| `countries-and-world` | Countries and the world | にほん・くに・せかい | 5 |
| `sports-and-leisure` | Sports and leisure | スポーツ・しあい・あそぶ | 9 |

Theme and situation labels are review items: every label and Japanese title carries a native-read obligation in its unit.

## The next 500

`words_next_500` lists positions 501–1000 by the same rule. Every row is marked **planned**: at base no beginner lesson, card or audio
clip exists for any word (S3(b)). The `materials` columns record what raw material exists today — a dict-v2 entry and attested example
sentences in the bank — so L3B.1 can show which of the 1,000 exist and which are still owed (S3-DD3).

## Audio

Every item carries an audio **slot** (`slot:audio:<unit>:<item>`) with a role from the S5-R22 registry and `clip: null`. No clip id
appears anywhere in the draft: the voice lock admits only Kore and John rejected Kore on 2026-11-03.

## Review before freeze

- frequency source: shipped examples bank (SNOW + Tanaka) rather than a balanced corpus; see frequency_source.review_item
- artifact exclusions (word_selection.excluded_as_artifacts): 22 entries skipped as short-unit splits or corpus artifacts
- reading preferences applied in the derivation: 私 わたし (UniDic わたくし), 最も もっとも (UniDic いとも); lemma normalisation 感ずる→感じる, 信ずる→信じる, 演ずる→演じる
- UniDic lemma choice for kana-written つく (就く 192 tokens vs 付く 139 vs 着く 45): review whether 就く belongs in the first 500
- honorific auxiliaries listed as words (下さる, なさる, 頂く, 致す, 御座る, 居る おる): keep as words or fold into the phrase units
- 彼・彼女 at ranks 2 and 7 reflect the translated-sentence register of SNOW and Tanaka (he/she); the reviewer may cap pronoun weight in version 2
- JMdict first glosses are kept verbatim (CC BY-SA); gloss_note gives the beginner sense where the first gloss misleads — native read required
- words_next_500 are all marked planned: no beginner lesson, card or audio exists at base (S3(b): no on-ramp); materials columns show what raw material exists
- guided readings reuse the four N5 and four N4 graded articles shipped at base; the 16 library N5 stories are the next pool (next_readings_pool)

Japanese truth rule: A family other than the drafting family (Anthropic) checks Japanese truth; every judged item also goes to a native reviewer under X4/L2B.2/L3B.5 before MF2 freezes it. The drafting family never grades its own Japanese.
