# Building each word's MCD passages

Writing rules, contract v2 (`docs/srs/CARD_CONTRACT_V2.md` §2, §5–§7; STANDARD A46). A card
is one passage with one target, graded on that target alone. Each word gets **three or four
passages** that differ in register and, where the word has more than one sense, in sense. New
passages go in a dated batch file, `source/mcd/<name>-YYYY-MM-DD.json`; `tools/export_mcd.py`
reads it after the undated files, so its passages follow the word's existing ones and no
existing card id moves.

The passages written before 2026-10-04 (`s1.json`–`s6.json`, `preview.json`: 2–4 sentences,
70–180 characters) stay valid as they are. Do not edit them: a passage's text is part of its
card id, so an edit retires the card and its review history.

Your sheet gives, per word: `term`, `reading`, the learner's `gloss`, the deck's `meaning`
and `def_ja`, mined `passages` (real text, ranked), and the word's existing passages.

## 1. Choose real passages (mined)

A real passage is preferred when one of the right register exists. Take one from `passages`
when it passes all of these:

- reads on its own: no unexplained 同記事/この件/彼, no dangling quote, no list or caption;
- uses the word in a sense in the gloss; the passage constrains it (check 5 below);
- modern standard Japanese, no typos; no graphic violence, no private person's name;
- copy `ja` **exactly**.

## 2. Write passages (original)

Write the rest yourself. Each written passage:

- **4–5 sentences, 180–300 characters**, one coherent stretch of text in **one register**;
- the target appears **exactly once**, in the sense the passage is about, with its most typical
  partners (財政が悪化する, 金利を引き上げる, 覇権を握る); the other sentences make its sense
  predictable;
- no other word from the learner's list (any word of this deck) appears, unless it is already
  in review;
- vocabulary and grammar at about N2: the rest of the passage should not read as N4–N3, and it
  should not stack several N1 words around the target either;
- no whitespace anywhere in `ja`;
- natural, idiomatic Japanese a native editor would accept: no translationese, no textbook
  stiffness, no 〜について説明します framing; register markers consistent within the passage
  (no です・ます mixed into a である essay; no 書き言葉 in casual talk);
- facts checkable or absent: dates, names, numbers and attributions are right or left out; real
  people only in the public record, never quoted at length; no partisan framing.

### Registers (contract §6)

| Code | Register                     | Sounds like                                             | Per word       |
| ---- | ---------------------------- | ------------------------------------------------------- | -------------- |
| 講   | lecture / book summary       | 中田敦彦, アバタロー, サラタメ, 本要約チャンネル, PIVOT | always one     |
| 報   | news / analysis              | NHK, ReHacQ, 楽待; である, no first person              | usually one    |
| 論   | essay / philosophy           | Floating Stories, 高野山の法話; である, reflective      | one if it fits |
| 話   | spoken, informal             | ひろゆき, ゆる言語学ラジオ; 〜じゃないですか, 〜って    | one if it fits |
| 学   | learning science / exam talk | 星友啓, PIVOT 勉強法, DaiGo                             | optional       |
| 語   | craft of speaking / writing  | 山口拓朗, 元局アナ流話し方スクール                      | optional       |

### Topics

Rotate through the learner's four: `mind` (mind and learning), `india` (Indian and Buddhist
philosophy), `ai` (AI with semiconductors), `history` (world history). `language` (Japanese about
Japanese: 語源, 言語学) is allowed for a word whose kanji or etymology is interesting.

## 3. The five checks (contract §7)

Every written passage passes five independent checks, each by a judge other than the writer,
before it is added. A failure means a rewrite, not a patch:

1. **Naturalness**: no translationese, unnatural collocation (要所を牛耳る), wrong register
   marker, or 書き言葉/話し言葉 mixing.
2. **Facts**: every checkable claim verified, or removed.
3. **Level**: grammar and vocabulary audited against the N3/N2/N1 inventories in
   `docs/srs/n2n1/`. Each `grammar` id must be one of
   `prototypes/corridor/data/original/grammar-v11.json` and must actually occur in a form its
   cues match (咲かせることにもなります does not match ことになる).
4. **One target**: the target once; no other deck word.
5. **Context does work**: shown the passage with the target blanked, a reader names its sense.
   A blank that 短絡的に or すぐ fills just as well fails.

## 4. Order and translate

Give every passage one faithful, natural English translation **with the same number of
sentences as the Japanese**, so the back can show the target sentence's 英訳 (contract §3 item 6;
`export_mcd.py` refuses a mismatch). Inside a batch, order a word's passages 講 first.

## Output

`source/mcd/<name>-YYYY-MM-DD.json`, keyed by the word's entry number:

```json
{
  "240": [
    {
      "ja": "<your passage>",
      "form": "習得",
      "en": "…",
      "original": true,
      "register": "講",
      "topic": "history",
      "tipJa": "「技術・言語を習得する」のように、時間をかけて身につける技能に使う。",
      "grammar": ["n3-koto-ni-naru", "n3-dewa-naku"],
      "sense": ""
    }
  ]
}
```

- `form`: the target exactly as written in the passage (背き, 追い上げられ, 牛耳っちゃう).
- `register`, `topic`: as above.
- `tipJa`: the usage note, one Japanese line of at most 80 characters with no Latin letters. It
  is shown in tier one of the back (contract §3 item 4), so it says what this passage shows
  about the word: its partners, its register, the sense.
- `grammar`: the grammar-v11 ids the passage exercises (may be empty).
- `sense`: which sense the passage uses, for words with more than one (光が一瞬光る for
  ひらめく as lightning); empty otherwise.

A real (mined) passage takes the same optional fields and no `original`.

Then, from the repo root:

```bash
npx prettier --write decks/kotoba-mine/source/mcd/<file>.json
python3 decks/kotoba-mine/tools/export_mcd.py          # checks the rules above; writes source/mcd.json
npx prettier --write decks/kotoba-mine/source/mcd.json
python3 decks/kotoba-mine/tools/build.py               # once, not frozen: mints ids for the new passages
```

`export_mcd.py` stops on a real passage that is not a candidate, a written passage with a
space, a `form` not in its `ja`, a written passage over 300 characters or 5 sentences, a v2
passage (one with a `register`) outside 4–5 sentences and 180–300 characters, a target that does
not appear exactly once, an English translation with a different sentence count, or an optional
field that breaks its rule. Then check the furigana of every new passage and add the fixes to
`source/readings.json` (scoped to the new card ids), add the passages' lemmas to
`source/gloss_ja.json`, and run the gates (`docs/srs/HANDOFF_2026-10-04.md`, "Passage pilot
landed").
