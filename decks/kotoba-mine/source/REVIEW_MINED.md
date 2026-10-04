# Choosing the final sentences (review pass)

The ranker (`tools/rank.py`) proposes, for each word, real sentences from the web,
Tatoeba, ja.wikinews and Aozora Bunko: `mining/ranked.json` → `picked` (its choice)
and `alts` (the next best). A reader now makes the final choice and translates.

For each word you are given: `term`, the learner's gloss (`source/entries.json`), the
deck's meaning and Japanese definition (`source/v2/*.json`, field `meaning` / `def_ja`),
`want` (how many sentences the word earns: 3 common, 2 mid, 1 rare/literary/single-use), and
the candidates with their source.

## Keep a sentence only if all of these hold

1. **It makes sense on its own.** A reader with no page around it understands who/what
   it is about. Reject sentences that lean on what came before (その件, この方法, 彼は… with
   no clue who), headline fragments, list items, captions.
2. **The word is used in the sense the learner looked up** (the gloss/meaning).
3. **Modern, standard, correct Japanese.** No classical grammar or old spellings; no typos;
   no machine-translated feel. Casual speech is fine for slang words.
4. **It is not about the word itself** (「〜とは」「〜という言葉」「〜の意味」), not a title of a
   song/product/game, not an ad slogan.
5. **Nothing a learner should not drill**: no graphic violence or sex, no slurs, no real
   private person's name. Public figures, companies and places are fine.
6. **Short enough to read at a glance**: ideally 15–45 characters, 60 at most.

## Choosing

- Take `want` sentences when that many pass; fewer is fine. Never pad with weak ones.
- Best first: the clearest, most typical use goes first (it is the one learned first).
- Later sentences should show a **different partner word or situation**
  (金利が上がる → 住宅ローンの金利), and come from a different kind of source when possible.
- You may choose any sentence from `picked` or `alts` — copy `ja` exactly.

## Translating

One natural English sentence per chosen line: faithful, plain, no notes. Keep names.

## Only when nothing passes

Write **one** sentence yourself: natural, standalone, 15–40 characters, using the word's
most common partner in an everyday or news situation. Mark it `"original": true` and give
`form` (the word exactly as it appears in your sentence). Never write one for a word that
has a usable real sentence.

## Output

`source/review/<range>.json`:

```json
{
  "109": [{ "ja": "<copied exactly>", "en": "…" }],
  "57": [{ "ja": "…", "form": "…", "en": "…", "original": true }]
}
```

Every word in your range gets an entry. Then run `python3 tools/export_mined.py` to make
sure every `ja` is found (it stops on a sentence that is not a candidate).
