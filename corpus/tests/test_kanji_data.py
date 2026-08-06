"""Verifier for the mimneko/kanji-data ingestion (Wayfinder #45).

Unit tier: converter behaviour on small committed BOM'd fixtures.
Realdata tier (``-m realdata``): pinned fetch, exact whole-file counts, and
regeneration determinism of the committed JSONL.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pytest

from corpus.sources.kanji_data import convert, fetch

FIXTURES = Path(__file__).parent / "fixtures"
CORPUS_ROOT = Path(__file__).resolve().parents[1]
DATASETS = CORPUS_ROOT / "datasets" / "kanji"

DROPPED = "漢検漢字辞典掲載ページ"

EXPECTED_LEVEL_COUNTS = {
    "10級": 80,
    "9級": 160,
    "8級": 200,
    "7級": 202,
    "6級": 193,
    "5級": 191,
    "4級": 313,
    "3級": 284,
    "準2級": 328,
    "2級": 185,
    "準1級": 858,
    "1/準1級": 644,
    "1級": 2675,
    "配当外": 474,
}

EXPECTED_FORM_COUNTS = {"親字": 5637, "旧字": 644, "旧字でない異体字": 501, "元字": 5}


# ---------------------------------------------------------------- unit tier


def _fixture_rows() -> list[dict]:
    return list(convert.convert_kanji(FIXTURES / "kanji_data_sample.csv"))


def test_fixture_is_bommed() -> None:
    raw = (FIXTURES / "kanji_data_sample.csv").read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf")


def test_dropped_column_absent_from_output() -> None:
    rows = _fixture_rows()
    for row in rows:
        line = json.dumps(row, ensure_ascii=False)
        assert DROPPED not in line
        assert "掲載ページ" not in line
    # page numbers are not smuggled in under any key
    keys = set().union(*(r.keys() for r in rows))
    assert keys == {
        "entry_id",
        "species_id",
        "glyph",
        "glyph_image_url",
        "form",
        "kanken_level",
        "kanken_rank",
        "kanjipedia_url",
        "notes",
    }


def test_literal_level_preserved_exactly() -> None:
    by_id = {r["entry_id"]: r for r in _fixture_rows()}
    assert by_id["CE-900002"]["kanken_level"] == "1/準1級"  # slash, not nakaguro
    assert by_id["CE-900003"]["kanken_level"] == "配当外"
    assert by_id["CE-900001"]["kanken_level"] == "10級"


def test_rank_mapping_is_a_total_order() -> None:
    assert set(convert.KANKEN_RANK) == set(EXPECTED_LEVEL_COUNTS)
    assert sorted(convert.KANKEN_RANK.values()) == list(range(1, 15))
    order = [
        "10級", "9級", "8級", "7級", "6級", "5級", "4級", "3級",
        "準2級", "2級", "準1級", "1/準1級", "1級", "配当外",
    ]
    assert [convert.KANKEN_RANK[k] for k in order] == list(range(1, 15))


def test_no_glyph_rows_kept() -> None:
    by_id = {r["entry_id"]: r for r in _fixture_rows()}
    assert by_id["CE-900003"]["glyph"] == ""
    assert by_id["CE-900003"]["notes"]["editorial_note"] == "漢字ペディア非掲載"
    assert by_id["CE-900004"]["glyph"] == ""
    assert by_id["CE-900004"]["glyph_image_url"].endswith("900004.png")


def test_unknown_level_is_an_error(tmp_path: Path) -> None:
    bad = tmp_path / "bad.csv"
    src = (FIXTURES / "kanji_data_sample.csv").read_text(encoding="utf-8-sig")
    bad.write_text(src.replace("10級", "11級"), encoding="utf-8-sig")
    with pytest.raises(convert.ConvertError, match="11級"):
        list(convert.convert_kanji(bad))


def test_wrong_header_is_an_error(tmp_path: Path) -> None:
    bad = tmp_path / "bad.csv"
    src = (FIXTURES / "kanji_data_sample.csv").read_text(encoding="utf-8-sig")
    bad.write_text(src.replace("字項ID", "字項id"), encoding="utf-8-sig")
    with pytest.raises(convert.ConvertError, match="unexpected header"):
        list(convert.convert_kanji(bad))


def test_radicals_fixture_converts() -> None:
    rows = list(convert.convert_radicals(FIXTURES / "radicals_sample.csv"))
    assert rows == [
        {"radical": "⼀", "name": "いち", "strokes": 1, "codepoint": "U+2F00"},
        {"radical": "⼡", "name": "ふゆがしら", "strokes": 3, "codepoint": "U+2F21"},
        {"radical": "⺍", "name": "つかんむり", "strokes": 3, "codepoint": "U+2E8D"},
    ]
    for row in rows:
        assert "掲載順" not in json.dumps(row, ensure_ascii=False)


# ------------------------------------------------------------ realdata tier


@pytest.fixture(scope="module")
def real_csvs() -> dict[str, Path]:
    return fetch.fetch(fetch.default_data_dir())


@pytest.fixture(scope="module")
def real_rows(real_csvs: dict[str, Path]) -> list[dict]:
    return list(convert.convert_kanji(real_csvs["kanken_kanji.csv"]))


@pytest.mark.realdata
def test_row_count_exact(real_rows: list[dict]) -> None:
    assert len(real_rows) == 6787


@pytest.mark.realdata
def test_level_counts_exact(real_rows: list[dict]) -> None:
    assert Counter(r["kanken_level"] for r in real_rows) == EXPECTED_LEVEL_COUNTS


@pytest.mark.realdata
def test_form_counts_exact(real_rows: list[dict]) -> None:
    assert Counter(r["form"] for r in real_rows) == EXPECTED_FORM_COUNTS


@pytest.mark.realdata
def test_no_glyph_counts(real_rows: list[dict]) -> None:
    assert sum(1 for r in real_rows if r["glyph"] == "") == 537
    assert sum(1 for r in real_rows if not r["glyph"] and not r["glyph_image_url"]) == 139


@pytest.mark.realdata
def test_id_uniqueness(real_rows: list[dict]) -> None:
    entry_ids = [r["entry_id"] for r in real_rows]
    assert len(set(entry_ids)) == 6787
    assert len({r["species_id"] for r in real_rows}) == 5637
    assert all(e.startswith("CE-") for e in entry_ids)
    assert all(r["species_id"].startswith("CT-") for r in real_rows)


@pytest.mark.realdata
def test_dropped_string_absent_from_committed_outputs() -> None:
    for name in ("kanken.jsonl", "kanken_radicals.jsonl"):
        for line in (DATASETS / name).read_text(encoding="utf-8").splitlines():
            assert DROPPED not in line, name


@pytest.mark.realdata
def test_committed_jsonl_regeneration_determinism(
    real_csvs: dict[str, Path], tmp_path: Path
) -> None:
    convert.write_jsonl(
        convert.convert_kanji(real_csvs["kanken_kanji.csv"]), tmp_path / "kanken.jsonl"
    )
    convert.write_jsonl(
        convert.convert_radicals(real_csvs["kanken_radicals.csv"]),
        tmp_path / "kanken_radicals.jsonl",
    )
    for name in ("kanken.jsonl", "kanken_radicals.jsonl"):
        assert (tmp_path / name).read_bytes() == (DATASETS / name).read_bytes(), name


@pytest.mark.realdata
def test_radicals_count_and_kangxi_divergence(real_csvs: dict[str, Path]) -> None:
    rows = list(convert.convert_radicals(real_csvs["kanken_radicals.csv"]))
    assert len(rows) == 214
    cps = [r["codepoint"] for r in rows]
    assert len(set(cps)) == 214
    assert "U+2F21" in cps  # ⼡ present…
    assert "U+2F22" not in cps  # …⼢ merged into it (not Kangxi 1:1)
    assert "U+2E8D" in cps  # ⺍ つかんむり added
