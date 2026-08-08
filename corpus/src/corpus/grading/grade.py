"""Three-signal grader: signals stored separately, disagreement surfaced.

``grade(text)`` returns::

    {"signals": {"jreadability":     {"score": float, "band": str, ...},
                 "lexical_coverage": {"coverage": float, "band_vector": {...},
                                      "substrate": str, ...},
                 "tmr":              {"by_level": {...}, "substrate": str, ...}},
     "disagreement": {"flag": bool, "detail": {...}}}

There is deliberately NO composite score and NO overall verdict: Wayfinder
#42 has not ratified a combination rule, so none exists here. The signals are
never averaged. Transparency note: with the shared content-token stream,
TMR at the full 6,103 level equals ``1 - lexical coverage`` by construction;
the disagreement mapping therefore reads TMR at the *core* level, which is
not derivable from coverage.

Disagreement mapping (implementation choice, awaiting #42 ratification —
simple and fully documented):

- Each signal maps to a coarse difficulty ordinal 0=easy / 1=mid / 2=hard.
- jreadability maps from its OWN published band scale (it has one — the
  levelled-corpora calibration): 上級* → 2, 中級* → 1, 初級* → 0.
  Binning it against SNOW terciles instead would mark nearly any non-trivial
  text "hard" relative to SNOW's very easy sentences and mask exactly the
  disagreement this block exists to surface (measured on 羅生門).
- lexical coverage (LOWER = harder) and TMR at the core level (HIGHER =
  harder) have no published scale, so they bin by terciles against a
  committed reference distribution (``reference_snow_t15.json``:
  per-sentence values over a fixed-seed sample of SNOW T15 original
  sentences; see reference.py). Known saturation: >2/3 of SNOW original
  sentences have coverage 1.0, so the coverage tercile edges are [1.0, 1.0]
  and its ordinal is effectively binary vs this reference — flagged as an
  open question for #42.
- ``flag`` is True when any two ordinals differ by >= 1 full step
  (``max_gap`` in the detail). The per-signal ordinals and the mapping id are
  always in the detail — the flag surfaces disagreement, it never resolves it.

CLI: ``python -m corpus.grading.grade in.jsonl out.jsonl`` reads CorpusRecord
JSONL and writes the same records with ``meta.grading`` filled.
"""

from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

from corpus.grading._mecab import get_tagger
from corpus.grading.jread import jread_signal
from corpus.grading.lexical import lexical_signal
from corpus.grading.segment import split_sentences
from corpus.grading.tmr import tmr_signal

REFERENCE_PATH = Path(__file__).resolve().parent / "reference_snow_t15.json"

# jreadability's own six bands collapsed to coarse difficulty ordinals.
JREAD_BAND_ORDINAL = {
    "上級後半": 2,
    "上級前半": 2,
    "中級後半": 1,
    "中級前半": 1,
    "初級後半": 0,
    "初級前半": 0,
}


def load_reference(path: str | Path = REFERENCE_PATH) -> dict | None:
    path = Path(path)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def ordinal(value: float, edges: list[float], *, higher_is_harder: bool) -> int:
    """Tercile difficulty ordinal: 0=easy, 1=mid, 2=hard.

    Boundary rule (deterministic, matters for saturated/discrete reference
    distributions, e.g. TMR edges [0.0, 0.2] where a third of reference
    sentences sit exactly at 0.0): a value exactly equal to an edge always
    bins toward the EASY side.
    """
    if higher_is_harder:
        return sum(value > e for e in edges)
    return len(edges) - sum(value >= e for e in edges)


def _disagreement(signals: dict, reference: dict | None, custom_substrate: bool) -> dict:
    if reference is None:
        return {"flag": False, "detail": {"reason": "no reference distribution"}}

    ref = reference["signals"]
    ordinals: dict[str, int] = {}

    band = signals["jreadability"].get("band")
    if band in JREAD_BAND_ORDINAL:
        ordinals["jreadability"] = JREAD_BAND_ORDINAL[band]

    cov = signals["lexical_coverage"]["coverage"]
    if cov is not None:
        spec = ref["lexical_coverage"]
        ordinals["lexical_coverage"] = ordinal(
            cov, spec["edges"], higher_is_harder=spec["higher_is_harder"]
        )

    tmr_level = ref["tmr"].get("level")
    by_level = signals["tmr"]["by_level"]
    if tmr_level not in by_level and by_level:
        tmr_level = next(iter(by_level))
    if tmr_level in by_level:
        spec = ref["tmr"]
        ordinals["tmr"] = ordinal(
            by_level[tmr_level], spec["edges"], higher_is_harder=spec["higher_is_harder"]
        )

    detail: dict = {
        "ordinals": ordinals,
        "mapping": (
            "0=easy,1=mid,2=hard; jreadability from its own band scale "
            f"(上級=2/中級=1/初級=0); lexical/tmr tercile bins vs reference {reference['id']}"
        ),
        "tmr_level": tmr_level,
    }
    if custom_substrate:
        detail["substrate_mismatch"] = True  # edges were built for the defaults
    if len(ordinals) < 2:
        detail["reason"] = "fewer than two signals available"
        return {"flag": False, "detail": detail}
    detail["max_gap"] = max(ordinals.values()) - min(ordinals.values())
    return {"flag": detail["max_gap"] >= 1, "detail": detail}


def grade(text: str, *, word_set=None, level_lists=None, tagger=None) -> dict:
    """Grade one text. ``word_set``/``level_lists`` swap the substrates
    (a learner's known-word set / custom TMR levels) — accepted here, never
    built here (the known-word model belongs to other tickets)."""
    if not text or not text.strip():
        raise ValueError("grade() requires non-empty text")
    tagger = tagger or get_tagger()
    signals = {
        "jreadability": jread_signal(text, tagger),
        "lexical_coverage": lexical_signal(text, word_set=word_set, tagger=tagger),
        "tmr": tmr_signal(text, level_lists=level_lists, tagger=tagger),
    }
    custom = word_set is not None or level_lists is not None
    return {
        "signals": signals,
        "disagreement": _disagreement(signals, load_reference(), custom),
    }


def grade_segments(text: str, *, word_set=None, level_lists=None, tagger=None) -> list[dict]:
    """Per-sentence grading for drift measurement (re-measure continuously —
    difficulty drifts across a text; arXiv:2505.08351)."""
    tagger = tagger or get_tagger()
    out = []
    for i, sentence in enumerate(split_sentences(text)):
        out.append(
            {
                "index": i,
                "text": sentence,
                "grade": grade(
                    sentence, word_set=word_set, level_lists=level_lists, tagger=tagger
                ),
            }
        )
    return out


def main(argv: list[str] | None = None) -> int:
    from corpus.records import read_jsonl, write_jsonl

    args = argv if argv is not None else sys.argv[1:]
    if len(args) != 2:
        print("usage: python -m corpus.grading.grade in.jsonl out.jsonl", file=sys.stderr)
        return 2
    tagger = get_tagger()

    def graded():
        for rec in read_jsonl(args[0]):
            meta = dict(rec.meta)
            meta["grading"] = grade(rec.text, tagger=tagger)
            yield dataclasses.replace(rec, meta=meta)

    n = write_jsonl(graded(), args[1])
    print(f"{n} record(s) graded → {args[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
