# Brief v2 — rewrite the example sentences (言葉の鉱脈)

The learner rejected the first version: sentences were "out of context, abstract, too
abbreviated, not standalone". This rewrite fixes that. The deck is a **cloze SRS deck**
(Massive-Context-Cloze style): each sentence becomes its own card with the target word
blanked, and the three sentences of a word unlock one after another (Lv1 → Lv2 → Lv3).

## Inputs

- `decks/kotoba-mine/source/entries.json` — the 323 words (n, term, reading, gloss).
- `decks/kotoba-mine/source/modules.json` — which words belong to your module.
- `decks/kotoba-mine/source/modules/<module>.json` — the OLD cards. Reuse their `def_ja`,
  `gloss`, `pos` and `note` as raw material ONLY. **Do not reuse old sentences** unless
  one already meets every rule below unchanged.

## Output: `decks/kotoba-mine/source/v2/<module>.json`

```json
{
  "id": "m01-money",
  "cards": [
    {
      "n": 109,
      "term": "金利",
      "reading": "きんり",
      "meaning": "interest rate",
      "def_ja": "お金を借りるときにかかる割合。",
      "pos": "noun",
      "sentences": [
        {
          "lv": 1,
          "ja": "銀行の金利が上がった。",
          "form": "金利",
          "en": "The bank's interest rate went up."
        },
        {
          "lv": 2,
          "ja": "金利が低いうちに家を買いたい。",
          "form": "金利",
          "en": "I want to buy a house while interest rates are low."
        },
        {
          "lv": 3,
          "ja": "住宅ローンを組む前に、三つの銀行の金利を比べてみた。",
          "form": "金利",
          "en": "Before taking out a mortgage, I compared the interest rates at three banks."
        }
      ],
      "tip": "金利 is the rate itself; the money you actually pay is 利息."
    }
  ]
}
```

Keep the cards in the module's word order. Validate with
`python3 decks/kotoba-mine/tools/check_v2.py <module>` until it prints OK.

## Rules for every sentence (the important part)

1. **Standalone.** A reader who sees only this one sentence understands the whole
   situation: who, what, where. No reference to anything outside it. Never start with
   それ/そこで/そして/しかし/また/これ/彼/彼女. No story fragments, no poetry, no
   abstract philosophising, no 体言止め fragments. Complete grammar, ending in 。 (or ？/！).
2. **Real Japanese.** Something a native speaker would actually say or write: in a
   conversation, a news item, a textbook, a sign, an email. Use the word's most common
   collocations (金利が上がる, 捜索が続く, 会見を開く …). If you would not see it in
   real life, rewrite it.
3. **The context points at the word.** With the word blanked, the rest of the sentence
   should make the meaning guessable, ideally with only ONE word fitting the blank.
   Avoid blanks where many words fit (「＿＿が大事だ。」).
4. **Iterative progression.**
   - **Lv1** (6–24 chars): the simplest everyday use, short and clear. The rest of the
     sentence should be N4–N3 level (basic words, plain form or です/ます).
   - **Lv2** (14–38 chars): a typical real situation, a bit more context, N3–N2 grammar.
   - **Lv3** (24–60 chars): a fuller natural sentence with one clause joined
     (〜ので, 〜けど, 〜たら, 〜ために, relative clause …), N2–N1 level, still crystal clear.
     Each level should show the word from a slightly different angle (another collocation,
     another situation, or the second meaning if the word has one).
5. **The target appears exactly once.** `form` is the exact text of the target as it
   appears in that sentence (inflected verbs/adjectives are fine: 見分けられる → form
   "見分けられ" or "見分けられる"; it must be a literal substring).
6. **No quotation marks 「」, no ellipses, no line breaks.**
7. **English (`en`)**: one natural, plain English sentence. No flourish, no
   explanation in brackets.
8. Rare, literary or archaic words (軈, 費え, 創開, 係助, 放逸, 巧む …): still write three
   real sentences in the register where the word is actually met (formal writing, old
   novels, news, grammar books). Say "rare" or "formal" in `tip`.
9. Single-kanji cards (稽, 淵, 風, 率, 余, 割, 犯, 纏): `reading` like "ケイ" (main
   on-reading) or "ふう／かぜ"; each sentence uses a DIFFERENT common compound containing
   the kanji, and `form` is that compound (e.g. 滑稽, 稽古).
10. Proper nouns / set terms (神奈川県, 気象庁, 自民党, 讃岐うどん) are fine in plain
    factual sentences. No real living people's names.

## Rules for the other fields (no jargon, no AI wording)

- `meaning`: 1–6 English words, the sense the sentences use (≤48 chars). No slashes lists.
- `def_ja`: a short plain Japanese definition (≤32 chars) in easy words, without the
  headword itself.
- `pos`: one of noun, verb, い-adjective, な-adjective, adverb, expression, phrase,
  kanji, sound word.
- `tip` (optional, ≤110 chars): one plain English sentence a teacher would say, e.g. a
  confusion to avoid or a register warning. Never write "nuance", "evokes", "delve",
  "rich", "tapestry", "vibrant", or marketing words. Omit it if there's nothing useful.

Work only in your own files. Use a private scratch folder named after your module(s)
(e.g. /tmp/claude-0/-home-user-Bunki-app/1f9ab262-1298-5ad0-8c76-728a22b4a735/scratchpad/v2-<module>/)
— other agents share the scratchpad. Do not touch git. When done reply with the module
id(s), card count, and nothing else.
