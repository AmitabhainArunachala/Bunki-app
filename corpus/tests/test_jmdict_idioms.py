"""Unit tier: idiom misc-tag filter over a constructed jmdict-simplified fixture."""

import json
from pathlib import Path

from corpus.sources.jmdict import idioms

FIXTURE = Path(__file__).parent / "fixtures" / "jmdict" / "jmdict_fixture.json"


def _rows():
    words = json.loads(FIXTURE.read_text(encoding="utf-8"))["words"]
    return list(idioms.idiom_rows(words))


def test_only_idiom_tagged_entries_selected():
    ids = [r["jmdict_seq"] for r in _rows()]
    assert ids == ["1000050", "1000100", "1000200", "1000300"]
    assert "1000400" not in ids  # uk-only entry excluded


def test_rows_sorted_by_numeric_seq():
    ids = [int(r["jmdict_seq"]) for r in _rows()]
    assert ids == sorted(ids)


def test_multi_sense_entry_keeps_only_tagged_sense_glosses():
    row = {r["jmdict_seq"]: r for r in _rows()}["1000200"]
    assert row["misc_tags"] == ["id"]
    assert row["glosses"] == [["idiom sense of a multi-sense entry"]]
    assert all(
        "PLAIN-NOUN-GLOSS-MUST-NOT-SURVIVE" not in g for sense in row["glosses"] for g in sense
    )
    # pos comes from the tagged sense only
    assert row["pos"] == ["exp"]


def test_misc_tags_union_in_canonical_order():
    row = {r["jmdict_seq"]: r for r in _rows()}["1000300"]
    assert row["misc_tags"] == ["proverb", "quote"]  # canonical IDIOM_TAGS order
    assert row["glosses"] == [["a proverb sense"], ["a quotation sense"]]
    assert row["pos"] == ["exp", "n"]


def test_non_english_glosses_dropped():
    row = {r["jmdict_seq"]: r for r in _rows()}["1000100"]
    assert row["glosses"] == [["four-character idiom"]]
    assert "NICHT-ENGLISCH" not in json.dumps(row, ensure_ascii=False)


def test_mixed_misc_within_one_sense_still_selected():
    row = {r["jmdict_seq"]: r for r in _rows()}["1000050"]
    assert row["misc_tags"] == ["id"]
    assert row["kanji"] == []
    assert row["kana"] == ["かなのみかんようく"]


def test_row_shape():
    for row in _rows():
        assert list(row.keys()) == ["jmdict_seq", "kanji", "kana", "glosses", "misc_tags", "pos"]


def test_write_is_deterministic(tmp_path):
    words = json.loads(FIXTURE.read_text(encoding="utf-8"))["words"]
    a, b = tmp_path / "a.jsonl", tmp_path / "b.jsonl"
    idioms.write_jsonl(idioms.idiom_rows(words), a)
    idioms.write_jsonl(idioms.idiom_rows(words), b)
    assert a.read_bytes() == b.read_bytes()
