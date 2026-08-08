"""Signal 3 — Token Miss Rate (TMR), reimplemented from arXiv:2506.04072.

Source: Jin, Dugan & Callison-Burch, "Toward Beginner-Friendly LLMs for
Language Learning: Controlling Difficulty in Conversation" (Findings of EACL
2026; arXiv:2506.04072). TMR is defined in **Section 3.2, "Evaluation
Metrics"**:

    TMR = cnt_above / total_tokens

where cnt_above is the number of tokens above a user's level and total_tokens
the total number of tokens in an utterance (per-utterance metric; the paper
averages across utterances). The paper tokenizes with **Sudachi, split mode C
(coarse)**, lemmatizes to dictionary form, and matches lemmas by exact string
search against per-JLPT-level vocabulary lists built from the jlpt-anki-decks
dataset (tanos.co.uk-derived). A token is a miss when it is not in the lists
at or below the target level.

Deviations in this reimplementation (each deliberate, each documented):

1. **Tokenizer**: fugashi/unidic-lite (UniDic 2.1.2 lineage) instead of
   Sudachi mode C — one dictionary pin for all three signals. UniDic short
   units are finer than Sudachi C, so absolute TMR values are not comparable
   across the two tokenizers.
2. **Level lists**: the paper's tanos/pre-2010 JLPT lists are NOT shipped
   (contaminated lineage, forbidden by #41/#42). ``level_lists`` is a
   parameter; the default is OUR substrate derived from the NINJAL 国語研
   教育基本語彙 bands (see ninjal/): easy → hard
       ninjal-kyoiku-kihon-goi:core  (◎, ~2k core)
       ninjal-kyoiku-kihon-goi:full  (6,103 full list)
   These are explicitly ours, labeled by substrate id, never "JLPT".
3. **Token stream**: punctuation/symbols/whitespace are excluded, and — with
   the NINJAL default — function words (助詞/助動詞/接頭辞/接尾辞) are also
   excluded, because the substrate is content vocabulary (the paper's tanos
   lists contain particles; NINJAL 国語研 does not — verified on the data).
   Caller-supplied ``level_lists`` use the same content-token stream so
   numbers stay comparable across substrates.
4. **Matching**: instead of single exact lemma match, a token matches on
   orthBase / lemma / kana-normalized base (see ninjal.Vocabulary.contains) —
   necessary because UniDic lemmas are kanji-canonical (為る for する) while
   word lists record headwords.

Levels are treated cumulatively (allowed set at level L = union of L and all
easier levels), matching the paper's "above a user's level" reading.
"""

from __future__ import annotations

from corpus.grading._mecab import content_tokens, get_tagger
from corpus.grading.ninjal import SUBSTRATE, Vocabulary, load_kokugoken


def default_level_lists() -> dict[str, Vocabulary]:
    sub = load_kokugoken()
    return {sub.core.substrate: sub.core, sub.full.substrate: sub.full}


def _as_vocab(name: str, wl) -> Vocabulary:
    if isinstance(wl, Vocabulary):
        return wl
    return Vocabulary.from_words(name, wl)


def tmr_signal(text: str, *, level_lists=None, tagger=None) -> dict:
    """TMR per level. ``level_lists``: ordered easy→hard {level_id: words}."""
    tagger = tagger or get_tagger()
    if level_lists is None:
        levels = default_level_lists()
        substrate = SUBSTRATE
    else:
        levels = {name: _as_vocab(name, wl) for name, wl in level_lists.items()}
        substrate = "caller:level-lists"

    toks = content_tokens(text, tagger)
    if not toks:
        return {"by_level": {}, "substrate": substrate, "n_tokens": 0}

    by_level: dict[str, float] = {}
    allowed: list[Vocabulary] = []
    for name, vocab in levels.items():
        allowed.append(vocab)
        cnt_above = sum(1 for t in toks if not any(v.contains(t) for v in allowed))
        by_level[name] = cnt_above / len(toks)
    return {"by_level": by_level, "substrate": substrate, "n_tokens": len(toks)}
