import json

import pytest

from corpus.grading.grade import (
    REFERENCE_PATH,
    _disagreement,
    grade,
    grade_segments,
    load_reference,
    main,
    ordinal,
)
from corpus.grading.jread import BANDS
from corpus.grading.ninjal import SUBSTRATE

TOY_WORDS = {"猫", "魚", "食べる", "走る", "美しい"}
TOY_LEVELS = {"toy:easy": {"猫", "魚"}, "toy:hard": {"食べる", "走る", "美しい"}}


def toy_grade(text="猫が魚を食べる。"):
    return grade(text, word_set=TOY_WORDS, level_lists=TOY_LEVELS)


def _walk_strings(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield str(k)
            yield from _walk_strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _walk_strings(v)
    elif isinstance(obj, str):
        yield obj


def test_output_shape():
    out = toy_grade()
    assert set(out) == {"signals", "disagreement"}
    assert set(out["signals"]) == {"jreadability", "lexical_coverage", "tmr"}
    assert "score" in out["signals"]["jreadability"]
    assert "band" in out["signals"]["jreadability"]
    assert "coverage" in out["signals"]["lexical_coverage"]
    assert "band_vector" in out["signals"]["lexical_coverage"]
    assert "by_level" in out["signals"]["tmr"]
    assert "substrate" in out["signals"]["tmr"]
    assert isinstance(out["disagreement"]["flag"], bool)


def test_no_composite_verdict_exists():
    out = toy_grade()
    banned = {"overall", "composite", "verdict", "difficulty", "level", "average"}
    assert not (set(out) & banned)
    assert not (set(out["signals"]) & banned)


def test_jlpt_appears_nowhere():
    """The law: level labels name their substrate, never JLPT."""
    out = toy_grade()
    for s in _walk_strings(out):
        assert "jlpt" not in s.lower(), s
    assert "jlpt" not in SUBSTRATE.lower()
    for _lo, _hi, ja, en in BANDS:
        assert "jlpt" not in ja.lower() and "jlpt" not in en.lower()
    ref = load_reference()
    if ref is not None:
        for s in _walk_strings(ref):
            assert "jlpt" not in s.lower(), s


def test_determinism_identical_output():
    a, b = toy_grade(), toy_grade()
    assert a == b
    assert json.dumps(a, ensure_ascii=False, sort_keys=False) == json.dumps(
        b, ensure_ascii=False, sort_keys=False
    )


def test_empty_text_rejected():
    with pytest.raises(ValueError):
        grade("")
    with pytest.raises(ValueError):
        grade("   \n ")


def test_ordinal_bins():
    assert ordinal(0.05, [0.3, 0.6], higher_is_harder=True) == 0
    assert ordinal(0.4, [0.3, 0.6], higher_is_harder=True) == 1
    assert ordinal(0.9, [0.3, 0.6], higher_is_harder=True) == 2
    assert ordinal(0.05, [0.3, 0.6], higher_is_harder=False) == 2
    assert ordinal(0.4, [0.3, 0.6], higher_is_harder=False) == 1
    assert ordinal(0.9, [0.3, 0.6], higher_is_harder=False) == 0
    # boundary rule: a value exactly at an edge bins toward the easy side
    assert ordinal(0.3, [0.3, 0.6], higher_is_harder=True) == 0
    assert ordinal(0.0, [0.0, 0.2], higher_is_harder=True) == 0
    assert ordinal(1.0, [1.0, 1.0], higher_is_harder=False) == 0
    assert ordinal(0.99, [1.0, 1.0], higher_is_harder=False) == 2


SYNTH_REF = {
    "id": "synthetic-test-ref",
    "signals": {
        "jreadability": {"edges": [3.0, 5.0], "higher_is_harder": False},
        "lexical_coverage": {"edges": [0.8, 0.9], "higher_is_harder": False},
        "tmr": {"edges": [0.1, 0.3], "higher_is_harder": True, "level": "toy:l1"},
    },
}


def synth_signals(band, cov, tmr):
    return {
        "jreadability": {"score": 0.0, "band": band},
        "lexical_coverage": {"coverage": cov},
        "tmr": {"by_level": {"toy:l1": tmr}},
    }


def test_disagreement_fires_on_split_signals():
    # easy by jreadability's own scale, hard by both lexical signals — the proxy trap
    d = _disagreement(synth_signals("初級前半", 0.5, 0.5), SYNTH_REF, False)
    assert d["flag"] is True
    assert d["detail"]["ordinals"] == {
        "jreadability": 0,
        "lexical_coverage": 2,
        "tmr": 2,
    }
    assert d["detail"]["max_gap"] == 2


def test_jread_band_ordinal_collapse():
    from corpus.grading.grade import JREAD_BAND_ORDINAL

    assert JREAD_BAND_ORDINAL == {
        "上級後半": 2,
        "上級前半": 2,
        "中級後半": 1,
        "中級前半": 1,
        "初級後半": 0,
        "初級前半": 0,
    }


def test_disagreement_silent_when_signals_agree():
    d = _disagreement(synth_signals("上級後半", 0.5, 0.5), SYNTH_REF, False)
    assert d["flag"] is False
    assert d["detail"]["max_gap"] == 0


def test_disagreement_one_step_fires():
    # 中級 (mid) vs hard lexical signals: one full ordinal step is enough
    d = _disagreement(synth_signals("中級後半", 0.5, 0.5), SYNTH_REF, False)
    assert d["flag"] is True
    assert d["detail"]["max_gap"] == 1


def test_disagreement_never_averages():
    d = _disagreement(synth_signals("初級前半", 0.5, 0.5), SYNTH_REF, False)
    assert set(d) == {"flag", "detail"}
    assert "score" not in d["detail"] and "mean" not in d["detail"]


def test_disagreement_without_reference():
    d = _disagreement(synth_signals("初級前半", 0.5, 0.5), None, False)
    assert d["flag"] is False
    assert d["detail"]["reason"] == "no reference distribution"


def test_disagreement_partial_signals():
    sig = {
        "jreadability": {"score": 6.0, "band": "初級前半"},
        "lexical_coverage": {"coverage": None},
        "tmr": {"by_level": {}},
    }
    d = _disagreement(sig, SYNTH_REF, False)
    assert d["flag"] is False
    assert d["detail"]["reason"] == "fewer than two signals available"


def test_custom_substrate_marks_mismatch():
    d = _disagreement(synth_signals("初級前半", 0.5, 0.5), SYNTH_REF, True)
    assert d["detail"]["substrate_mismatch"] is True


def test_snow_pin_mismatch_raises(tmp_path):
    from corpus.grading.reference import SNOW_SHA256, verify_snow_file

    bad = tmp_path / "T15.xlsx"
    bad.write_bytes(b"not the real corpus")
    with pytest.raises(RuntimeError, match="sha256"):
        verify_snow_file(bad)
    # the pin and the committed reference must agree on the artifact
    assert load_reference()["source"]["file_sha256"] == SNOW_SHA256


def test_committed_reference_shape():
    assert REFERENCE_PATH.exists(), "reference_snow_t15.json must ship with the package"
    ref = load_reference()
    assert set(ref["signals"]) == {"jreadability", "lexical_coverage", "tmr"}
    for spec in ref["signals"].values():
        assert len(spec["edges"]) == 2
        assert spec["edges"][0] <= spec["edges"][1]
        assert isinstance(spec["higher_is_harder"], bool)
    assert ref["signals"]["tmr"]["level"].startswith(SUBSTRATE)


def test_grade_segments():
    out = grade_segments("猫が走る。犬も走る。", word_set=TOY_WORDS, level_lists=TOY_LEVELS)
    assert [s["index"] for s in out] == [0, 1]
    assert out[0]["text"] == "猫が走る。"
    assert set(out[0]["grade"]) == {"signals", "disagreement"}


def test_cli_usage_error():
    assert main([]) == 2
