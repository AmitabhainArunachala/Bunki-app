"""Unit tier: SKIP stripping + jlpt renaming over a constructed kanjidic fixture."""

import json
from pathlib import Path

from corpus.sources.jmdict import kanjidic

FIXTURE = Path(__file__).parent / "fixtures" / "jmdict" / "kanjidic_fixture.json"


def _chars():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["characters"]


def test_skip_codes_do_not_survive():
    for char in _chars():
        skip_values = [q["value"] for q in char["queryCodes"] if q["type"] == "skip"]
        assert skip_values  # the fixture must actually exercise the hazard
        out = kanjidic.strip_character(char)
        dumped = json.dumps(out, ensure_ascii=False)
        assert "queryCodes" not in out
        assert "skip" not in dumped
        for v in skip_values:
            assert v not in dumped


def test_output_is_whitelist_only():
    for char in _chars():
        out = kanjidic.strip_character(char)
        assert tuple(out.keys()) == kanjidic.OUTPUT_KEYS


def test_jlpt_renamed_to_pre2010_editorial():
    out = kanjidic.strip_character(_chars()[0])
    assert out["jlpt_pre2010_editorial"] == 1
    assert "jlpt" not in out
    assert "jlptLevel" not in out


def test_field_mapping():
    out = kanjidic.strip_character(_chars()[0])
    assert out["literal"] == "亜"
    assert out["on_readings"] == ["ア"]
    assert out["kun_readings"] == ["つ.ぐ"]
    assert out["nanori"] == ["や", "つぎ", "つぐ"]
    assert out["meanings"] == ["Asia", "rank next"]  # English only
    assert out["grade"] == 8
    assert out["stroke_count"] == 7
    assert out["frequency"] == 1509


def test_nulls_preserved_for_sparse_kanji():
    out = kanjidic.strip_character(_chars()[1])
    assert out["grade"] is None
    assert out["frequency"] is None
    assert out["jlpt_pre2010_editorial"] is None
    assert out["stroke_count"] == 10


def test_pipeline_writes_output_and_sample(tmp_path):
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    out = tmp_path / "kanjidic_stripped.jsonl"
    n = kanjidic.write_jsonl(kanjidic.stripped_rows(data["characters"]), out)
    assert n == 2
    lines = out.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    for line in lines:
        row = json.loads(line)
        assert tuple(row.keys()) == kanjidic.OUTPUT_KEYS
        assert "skip" not in line
