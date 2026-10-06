# Building each word's MCD passages

Every word gets **2–4 passages** (a passage = 2–4 connected sentences, 70–180 characters).
Each passage becomes cloze cards: the word blanked with a Japanese-definition hint, and
(for the first passage only) each of its kanji blanked with the reading as hint.

Your sheet gives, per word: `term`, `reading`, the learner's `gloss`, the deck's `meaning`
and `def_ja`, mined `passages` (real text, ranked), and `sentences` (single real sentences
already approved for this word).

## 1. Choose real passages (mined)

Take up to **2** from `passages` that pass all of these:

- reads on its own: no unexplained 同記事/この件/彼, no dangling quote, no list or caption;
- uses the word in a sense in the gloss; the blank has one natural answer in that context;
- modern standard Japanese, no typos; no graphic violence, no private person's name;
- the context actually helps: a reader can infer the word from what surrounds it.
  Copy `ja` **exactly**. If no passage passes, you may use one of `sentences` instead.

## 2. Write passages (original)

Write **1–2** passages yourself (2 when fewer than 2 real passages passed):

- 2–4 sentences, 70–160 characters, one coherent little scene, article excerpt or explanation;
- natural, idiomatic, the kind of Japanese a good newspaper, essay, blog or novel would print;
  no textbook stiffness, no translated feel, no 〜について説明します framing;
- the word appears **once**, in the gloss sense, with its most typical partners
  (財政が悪化する, 金利を引き上げる, 顔を両手で覆う); the other sentences make it guessable;
- the other vocabulary should be easier than the word (one hard thing per card);
- standalone: introduce who/what (市の財政, 中央銀行, 祖母); no 「彼」 without a name or role;
- slang/casual words in casual speech, literary words in literary prose, technical words in
  a plain explanation;
- vary situations across a word's passages (news / daily life / work / story).
  Mark it `"original": true` and give `form` = the word exactly as written in your passage.

## 3. Order and translate

Put the clearest, most typical passage **first** (it is learned first and gets the 字 cards);
this is often your written one. Give every passage one faithful, natural English translation.

## Output

`source/mcd/<range>.json`:

```json
{
  "64": [
    { "ja": "<real passage copied exactly>", "en": "…" },
    { "ja": "<your passage>", "form": "財政", "en": "…", "original": true }
  ]
}
```

Every word in the sheet gets an entry. Then run
`npx prettier --write source/mcd/<range>.json && python3 tools/export_mcd.py` (stops on a real
passage that is not a candidate, or an original whose `form` is not in its `ja`).
