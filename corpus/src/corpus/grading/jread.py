"""Signal 1 — jreadability (Lee & Hasebe readability formula).

Package: jreadability 1.1.5 (MIT, PyPI), an unofficial implementation of
Lee Jae-ho & Hasebe Yoichiro, "Readability measurement of Japanese texts
based on levelled corpora" / Hasebe & Lee 2015 (CASTEL/J),
https://jreadability.net/file/hasebe-lee-2015-castelj.pdf.

Model (verbatim from the package README):

    readability = {mean number of words per sentence} * -0.056
                + {percentage of kango} * -0.126
                + {percentage of wago} * -0.042
                + {percentage of verbs} * -0.145
                + {percentage of particles} * -0.044
                + 11.724

**LOWER = HARDER.** Band table, verbatim from the jreadability 1.1.5 README
(half-open ranges):

    | Level              |           | Readability score range |
    | Upper-advanced     | 上級後半  | [0.5, 1.5)              |
    | Lower-advanced     | 上級前半  | [1.5, 2.5)              |
    | Upper-intermediate | 中級後半  | [2.5, 3.5)              |
    | Lower-intermediate | 中級前半  | [3.5, 4.5)              |
    | Upper-elementary   | 初級後半  | [4.5, 5.5)              |
    | Lower-elementary   | 初級前半  | [5.5, 6.5)              |

Scores can fall outside [0.5, 6.5) (the formula is unbounded); such scores
are clamped to the nearest band with ``in_scale: false``.

Dictionary pin: unidic-lite (UniDic 2.1.2 lineage) — see ``_mecab``. Scores
differ slightly from jreadability.net (UniDic 2.2.0).

Known blind spot (why signals 2–3 exist): the formula has NO lexical
difficulty term — it is sentence-length + goshu + POS ratios only. Aizawa
(2019) shows it rates 羅生門 easy. Never use this signal alone.
"""

from __future__ import annotations

from corpus.grading._mecab import get_tagger

# (lower_inclusive, upper_exclusive, japanese_label, english_label)
BANDS: tuple[tuple[float, float, str, str], ...] = (
    (0.5, 1.5, "上級後半", "upper-advanced"),
    (1.5, 2.5, "上級前半", "lower-advanced"),
    (2.5, 3.5, "中級後半", "upper-intermediate"),
    (3.5, 4.5, "中級前半", "lower-intermediate"),
    (4.5, 5.5, "初級後半", "upper-elementary"),
    (5.5, 6.5, "初級前半", "lower-elementary"),
)


def band_of(score: float) -> tuple[str, bool]:
    """Map a jreadability score to (band label, in_scale)."""
    if score < BANDS[0][0]:
        return BANDS[0][2], False
    if score >= BANDS[-1][1]:
        return BANDS[-1][2], False
    for lo, hi, ja, _en in BANDS:
        if lo <= score < hi:
            return ja, True
    raise AssertionError("unreachable")


def jread_signal(text: str, tagger=None) -> dict:
    from jreadability import compute_readability

    score = compute_readability(text, tagger or get_tagger())
    band, in_scale = band_of(score)
    return {
        "score": score,
        "band": band,
        "in_scale": in_scale,
        "substrate": "jreadability-1.1.5/unidic-2.1.2",
    }
