"""The shelf's browsing facets arrive through the index writers themselves.

Run:  python -m pytest prototypes/corridor/tools/test_reading_facets.py -q
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from test_fresh_sources import restage_shelf  # noqa: E402

ARTICLES = HERE.parent / "data/articles"


def test_regrade_writes_the_committed_facets_without_a_manual_step(tmp_path):
    index = json.loads((ARTICLES / "index.json").read_text("utf-8"))
    rows = [row for row in index["articles"] if row.get("rubySource") == "tokenizer"][:2]
    assert len(rows) == 2
    expected = {row["id"]: row["readingFacets"] for row in rows}
    for row in rows:
        shutil.copy(ARTICLES / row["file"], tmp_path / row["file"])
    stripped = [{k: v for k, v in row.items() if k != "readingFacets"} for row in rows]
    (tmp_path / "index.json").write_text(json.dumps(dict(index, articles=stripped), ensure_ascii=False), "utf-8")

    subprocess.run([sys.executable, str(HERE / "build_articles.py"), "--regrade-jlpt", "--out", str(tmp_path)], check=True)

    written = json.loads((tmp_path / "index.json").read_text("utf-8"))["articles"]
    assert {row["id"]: row["readingFacets"] for row in written} == expected
    assert all(row["readingFacets"]["method"].endswith("source-and-text-topics/1") for row in written)


def test_a_freshly_minted_reading_reaches_the_shelf_with_facets(tmp_path, monkeypatch):
    ff, paths, body, _old, _changed = restage_shelf(tmp_path, monkeypatch)
    monkeypatch.setitem(sys.modules, "corpus.grading._mecab", types.SimpleNamespace(get_tagger=lambda: None))
    grading = {"signals": {"jreadability": {"band": "中級"},
                           "jlpt_lexicon": {"band_vector": {"n5": 40, "n4": 30, "n3": 25, "n2": 5, "n1": 0}}}}

    def fake_mint(row, title_en, _title_source, _topic, as_of, _tagger, _maps):
        shared = {"id": row["id"], "addedAt": as_of, "date": row["date"], "titleEn": title_en}
        record = dict(shared, text=row["text"], grading=grading,
                      tokens=[{"s": "環境省", "b": "環境省", "c": True}, {"s": "は", "b": "は", "c": False}])
        return (record, dict(shared, file=body.name, chars=len(row["text"]), grading=grading),
                dict(shared, kind="fresh", decision="pending"))

    monkeypatch.setattr(ff, "mint", fake_mint)
    assert ff.main() == 0
    [row] = json.loads(paths["INDEX_PATH"].read_text("utf-8"))["articles"]
    assert row["readingFacets"]["jlpt"] == "N3"
    assert "environment" in row["readingFacets"]["topics"]
    assert row["readingFacets"]["forms"] == ["環境省"]


def test_every_shelf_row_carries_the_facets_its_filters_read():
    index = json.loads((ARTICLES / "index.json").read_text("utf-8"))
    bare = [row["id"] for row in index["articles"] if "source-and-text-topics" not in row.get("readingFacets", {}).get("method", "")]
    assert bare == []
