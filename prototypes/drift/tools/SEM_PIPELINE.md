# The semantic tier (SEM) — authoring and the full-lexicon pipeline

`sem.json` is the LLM-authored typed-relation layer the constellation lock
consumes first (design doc §8.11). Each headword maps to an ordered list of
`[related_word, type, note]`:

| type  | meaning                          | rendered as        |
| ----- | -------------------------------- | ------------------ |
| `syn` | synonym / near-synonym           | pigment 1 edge     |
| `fam` | kanji-family / morphological kin | pigment 2 edge     |
| `col` | collocation / common compound    | accent edge        |
| `thm` | thematic association             | gold edge          |
| `reg` | register variant (formal/casual) | pigment 2 edge     |
| `ant` | antonym                          | pigment 2 edge     |

A related word that is **not** in the lexicon renders as a gold "ghost"
satellite — the semantic web visibly exceeding the dictionary.

## State of coverage

This is a **curated core**, not the whole lexicon. Run the validator for the
live count and coverage:

```bash
python3 prototypes/drift/tools/validate_sem.py
```

It checks the schema, rejects self-relations and duplicates, flags unknown
types, and prints `in-lexicon / 6,687` so a partial pass is never mistaken for
a complete one. The current core (`sem_expand.py`) covers the highest-value
learner vocabulary — the words a learner navigates first, where relational
richness matters most.

## Extending by hand

Add entries to the `NEW` dict in `sem_expand.py` (accurate Japanese relations,
8–12 per word), then:

```bash
git checkout prototypes/drift/data/sem.json   # start from the committed base
python3 prototypes/drift/tools/sem_expand.py  # merge NEW over it
python3 prototypes/drift/tools/validate_sem.py
```

## The full-lexicon pass (deferred — needs an LLM API key)

The real pipeline (§8.11) is one batch LLM pass over all 6,687 words. It is not
run here because this environment has no model API key, and fabricating 6,687 ×
~10 relations by hand would be lower quality than a real pass. The contract for
that pass:

- **Input:** each `[word, reading, gloss, level]` from `wbig.json`, plus its
  kanji's `KINFO`/`KRAD` for the `fam` relations.
- **Prompt (per word):** "Give 8–12 relations for «word» (reading, gloss) as
  `[related_word, type, note]`, type ∈ {syn, fam, col, thm, reg, ant}, ordered
  most-relevant first. Prefer real collocations and same-kanji kin. A relation
  may point outside the JLPT lexicon (it renders as a ghost). Notes ≤ 8 words."
- **Level awareness:** bias relations toward the learner's level ±1 (i+1), the
  way the pilot does — a gradient, not a wall.
- **Validate every batch** with `validate_sem.py` before merging; it is the
  gate that keeps a large machine pass honest.
- **Embedding layout (future):** the same pass can emit an embedding per word;
  a UMAP/t-SNE projection of those becomes the galaxy layout (§8.11), replacing
  the phyllotaxis hub placement with real semantic geography.

Sources that would raise quality without a bespoke pass: CEFR-Annotated WordNet
(arXiv:2510.18466) for proficiency-graded links, JMdict senses for `syn`,
Tatoeba for `col` example sentences.
