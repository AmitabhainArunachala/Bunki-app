"""Signal 2 — lexical coverage vs the NINJAL 国語研教育基本語彙 substrate.

This is the lexical-difficulty term that jreadability lacks (its formula is
sentence-length + goshu + POS ratios only; Aizawa 2019's 羅生門 case).

Definitions (documented implementation choices, awaiting #42 ratification):

- Token stream: content tokens only (see ``_mecab.CONTENT_POS1``; proper
  nouns and numerals excluded). Function words are excluded because the
  substrate is content vocabulary (particles/auxiliaries carry no 国語研 mark
  in the DB — verified on the data).
- ``coverage``: fraction of content TOKENS whose word is in the full 6,103
  substrate (token-level, frequency-weighted).
- ``type_coverage``: same, over unique content-word base forms (orthBase
  strings) — vocabulary breadth rather than running-text share.
- ``band_vector``: token-mass distribution over the DB's own bands —
  ``core`` (◎, ~2k), ``extended`` (○, rest of 6,103), ``oov`` (outside).
  Sums to 1.0 (over content tokens).

``word_set`` support: a caller may pass a learner's known-word set (plain
strings); coverage is then computed against that set with substrate
``caller:word-set`` and a two-band vector {known, oov}. The known-word model
itself belongs to other tickets — accepted here, never built here.
"""

from __future__ import annotations

from collections import Counter

from corpus.grading._mecab import content_tokens, get_tagger
from corpus.grading.ninjal import SUBSTRATE, Vocabulary, load_kokugoken


def lexical_signal(text: str, *, word_set=None, tagger=None) -> dict:
    tagger = tagger or get_tagger()
    toks = content_tokens(text, tagger)
    if not toks:
        return {
            "coverage": None,
            "type_coverage": None,
            "band_vector": {},
            "substrate": SUBSTRATE if word_set is None else "caller:word-set",
            "n_content_tokens": 0,
        }

    if word_set is not None:
        vocab = Vocabulary.from_words("caller:word-set", word_set)
        n_in = sum(1 for t in toks if vocab.contains(t))
        types = {}
        for t in toks:
            key = t.feature.orthBase or t.surface
            types.setdefault(key, vocab.contains(t))
        return {
            "coverage": n_in / len(toks),
            "type_coverage": sum(types.values()) / len(types),
            "band_vector": {
                "known": n_in / len(toks),
                "oov": (len(toks) - n_in) / len(toks),
            },
            "substrate": "caller:word-set",
            "n_content_tokens": len(toks),
        }

    sub = load_kokugoken()
    bands = Counter()
    types: dict[str, str] = {}
    for t in toks:
        if sub.core.contains(t):
            b = "core"
        elif sub.full.contains(t):
            b = "extended"
        else:
            b = "oov"
        bands[b] += 1
        key = t.feature.orthBase or t.surface
        types.setdefault(key, b)
    n = len(toks)
    n_types_in = sum(1 for b in types.values() if b != "oov")
    return {
        "coverage": (bands["core"] + bands["extended"]) / n,
        "type_coverage": n_types_in / len(types),
        "band_vector": {
            "core": bands["core"] / n,
            "extended": bands["extended"] / n,
            "oov": bands["oov"] / n,
        },
        "substrate": SUBSTRATE,
        "n_content_tokens": n,
    }
