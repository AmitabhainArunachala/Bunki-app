# Authoring brief — 言葉の鉱脈 (Kotoba Mine) deck modules

You are writing one or more **modules** of a context-first Japanese SRS deck built from a
learner's personal mined-word list (exported from the "Japanese" iOS dictionary app, so the
English glosses are JMdict-derived). The learner is advanced-intermediate (reads N2–N1 text,
mines words from news, shogi coverage, science, finance). The method is AJATT / MIA /
Refold-style sentence mining: **every word is learned inside a real-feeling sentence, read
Japanese-first, with a monolingual definition beside the English one**.

## Inputs (read these first)

- `decks/kotoba-mine/source/entries.json` — `{n, term, reading, gloss}` for all 323 words.
- `decks/kotoba-mine/source/modules.json` — module id → title (ja/en) → list of `n`.
- Validator: `python3 decks/kotoba-mine/tools/check_module.py <module-id>` — must print OK.

## Output — one file per module: `decks/kotoba-mine/source/modules/<module-id>.json`

```json
{
  "id": "m01-money",
  "passage": {
    "title": "<Japanese title>",
    "title_en": "<English title>",
    "level": "N1",
    "text": "<paragraph 1>\n\n<paragraph 2>\n\n..."
  },
  "cards": [
    {
      "n": 109,
      "term": "金利", // EXACTLY the source term
      "reading": "きんり", // hiragana; katakana for on'yomi only on kanji cards
      "gloss": "interest rate", // concise English: the 1–3 senses that matter, ≤ 70 chars
      "pos": "noun", // e.g. "noun", "noun · suru verb", "na-adj", "i-adj",
      //  "godan verb (tr.)", "ichidan verb (intr.)", "adverb",
      //  "expression", "yojijukugo", "kanji", "onomatopoeia"
      "register": "報道", // one or more joined with ・ from:
      //  日常 会話 俗語 書き言葉 報道 法律 学術 専門 古風 文語
      "def_ja": "お金を貸し借りするときの、元金に対する利息の割合。",
      // ORIGINAL monolingual definition, ≤ 45 chars, words
      // easier than the headword; never copy a dictionary
      "sentences": [
        {
          "ja": "<sentence copied VERBATIM from passage.text>",
          "form": "金利",
          "en": "<natural English>"
        },
        { "ja": "<a second, different context/register>", "form": "金利", "en": "..." }
      ],
      "collocations": ["金利が上がる", "低金利", "金利を引き下げる"],
      "confusables": [
        {
          "term": "利率",
          "note": "利率 is the stated rate on a specific product; 金利 is the general/market rate."
        }
      ],
      "note": "Short English usage note: nuance, register, what natives actually say. Optional but valued."
    }
  ]
}
```

(Comments above are explanatory — the real file is plain JSON.)

## Rules (quality bar is high — this replaces a human-made premium deck)

1. **Passage first.** Write ONE original, coherent Japanese passage per module (essay,
   feature article, story or dialogue — whatever suits the theme; 900–2000 characters,
   4–10 paragraphs) that uses **every** word of the module naturally at least once. It must
   read like something a native would publish, not a vocabulary dump. Fictional people and
   places only for anything news-like (no real living people; real institutions such as
   気象庁 or 国会 are fine; historical facts must be correct). This passage becomes a
   readable article in the Bunki app, and cards are reviewed against it.
2. **sentences[0]** is a full sentence copied verbatim from the passage (from the start of the
   sentence through 。/！/？ or closing 」). **sentences[1]** is a _new_ sentence in a
   different context or register (spoken vs written, literal vs figurative sense) so the
   word isn't locked to one context. Add a third only for words with clearly distinct
   senses (e.g. 下敷き desk pad vs model; 一層 "even more" vs "single layer").
   `form` is the exact surface substring of the target in that sentence (conjugated form,
   e.g. 見分けられる → form "見分けられ" is fine; it just must be a literal substring).
3. Sentences: natural, 15–60 characters, modern standard Japanese unless the word itself is
   archaic/regional (then say so in `note`). The context must make the meaning _guessable_
   (i+1): the rest of the sentence should be easier than the target word.
4. `def_ja`: your own wording, plain Japanese, ≤ 45 chars, no English, should not contain
   the headword itself.
5. `gloss`: trim JMdict noise; lead with the sense the learner will actually meet. If the
   source gloss is wrong or misleading, fix it and explain in `note`
   (e.g. 動線計画 is "circulation/flow planning" in architecture; 創開 is very rare —
   say so; 自転軸 is "axis of rotation"; 係助 is short for 係助詞).
6. `confusables`: homophones and near-synonyms the learner will genuinely mix up — especially
   ones in THIS list (帰納的/機能的, 新体制/身体性, 共学/驚愕, 検討/健闘, 争う/競う,
   金利/利率/利息, 生得的/先天的, 迅速/速やか, ビンビン/ギンギン, 栞/しおり, 礎/要石/かなめ,
   検証/検討, 耐える/堪える, 診る/見る/看る, 自ずと/自然と, なお/なおかつ ...). Empty list if none.
7. `collocations`: 2–4 high-frequency chunks natives actually use. Empty list only for
   proper nouns.
8. Vulgar/sensitive words: give the real meaning plainly and flag it in `note`
   (ビンビン has a sexual sense; 死刑囚 etc. stay matter-of-fact).
9. **Single-kanji cards** (only in m12-kanji, plus treat 礎 in m02 as the word いしずえ):
   `reading` lists readings like "ケイ ／ かんが(える)"; add
   `"kanji": {"on": ["ケイ"], "kun": ["かんが.える"], "meaning": "think; consider",
"compounds": [{"w": "滑稽", "r": "こっけい", "en": "comical"}, ...3–5 common ones]}`;
   sentences use a common compound containing the kanji (form = that compound).
   Note: 稽 as a standalone kun reading かんがえる is archaic — say so.
10. Accuracy over flourish. If you are not sure a usage is natural, choose a plainer sentence.
    Do not invent pitch accent or etymology you are unsure of.
11. Run the validator until it prints OK. Then reply with ONLY: the module id(s), card
    count, passage character count, and any source-gloss corrections you made (one line each).
    Do not modify any file other than your module file(s).
