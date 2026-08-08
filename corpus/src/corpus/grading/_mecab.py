"""Shared fugashi/unidic-lite tokenization for the grading signals.

Dictionary pin: **unidic-lite 1.0.8 = UniDic 2.1.2 lineage** (the dictionary
bundled with the wheel; no download at runtime). jreadability.net runs UniDic
2.2.0, so scores from this package diverge slightly from the website — a known
property of jreadability 1.1.5, documented in its README ("this package uses
UniDic 2.1.2 while theirs uses UniDic 2.2.0"). All three signals here share
one tagger so the pin is uniform.

unidic-lite exposes fugashi ``UnidicFeatures26``; the fields used are
``pos1``/``pos2`` (POS), ``orthBase`` (書字形基本形 — base form as written),
``lemma`` (語彙素 — may be a kanji form the text never used, e.g. 為る for
する) and ``lForm`` (語彙素読み, katakana).

Content-token filter (documented choice, not from any paper): keep pos1 in
{名詞, 代名詞, 動詞, 形容詞, 形状詞, 副詞, 連体詞, 接続詞, 感動詞}, drop
固有名詞 and 数詞 (never in vocabulary substrates; would inflate difficulty),
drop 助詞/助動詞/接頭辞/接尾辞/記号/補助記号/空白. 非自立可能 verbs (する,
いる…) are KEPT — they are real vocabulary items.
"""

from __future__ import annotations

from functools import lru_cache

CONTENT_POS1 = {
    "名詞",
    "代名詞",
    "動詞",
    "形容詞",
    "形状詞",
    "副詞",
    "連体詞",
    "接続詞",
    "感動詞",
}
EXCLUDED_POS2 = {"固有名詞", "数詞"}
PUNCT_POS1 = {"補助記号", "記号", "空白"}


@lru_cache(maxsize=1)
def get_tagger():
    from fugashi import Tagger

    return Tagger()


def is_content(token) -> bool:
    f = token.feature
    return f.pos1 in CONTENT_POS1 and f.pos2 not in EXCLUDED_POS2


def is_punct(token) -> bool:
    return token.feature.pos1 in PUNCT_POS1


def content_tokens(text: str, tagger=None) -> list:
    tagger = tagger or get_tagger()
    return [t for t in tagger(text) if is_content(t)]


def kata_to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def is_kana(s: str) -> bool:
    return bool(s) and all(
        "ぁ" <= c <= "ゖ" or "ァ" <= c <= "ヶ" or c in "ーゝゞヽヾ" for c in s
    )


def token_keys(token) -> tuple[str, str, str]:
    """(orthBase, lemma, kana-normalized reading-of-base) for vocab matching."""
    f = token.feature
    ob = f.orthBase or token.surface
    lm = f.lemma or ""
    kana = ""
    if is_kana(ob):
        kana = kata_to_hira(ob)
    elif is_kana(lm):
        kana = kata_to_hira(lm)
    return ob, lm, kana
