"""A full shelf rebuild keeps what only the committed index knows.

Run:  python -m pytest prototypes/corridor/tools/test_build_articles.py -q
"""

from __future__ import annotations

import json
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_articles as ba  # noqa: E402

PICTURE = {"src": "articles/pictures/wikinews-1.webp", "alt": "A harbour at dawn.", "w": 1200, "h": 800}


def rebuild(out, monkeypatch, previous_rows=None):
    if previous_rows is not None:
        (out / "index.json").write_text(json.dumps({"sources": {}, "articles": previous_rows}), "utf-8")
    articles = [
        {"id": "wikinews:1", "title": "新しい見出し", "text": "港に船が着いた。", "source": "ja.wikinews"},
        {"id": "wikinews:2", "title": "二つ目", "text": "雨が降った。", "source": "ja.wikinews"},
    ]
    for a in articles:
        a["file"] = ba.slugify(a["id"]) + ".json"
    grading = {"signals": {"jreadability": {"score": 1.0, "band": "中級"},
                           "jlpt_lexicon": {"coverage": 0.5, "band_vector": {"n5": 1}}}}
    monkeypatch.setitem(sys.modules, "corpus.grading._mecab", types.SimpleNamespace(get_tagger=lambda: None))
    monkeypatch.setattr(ba, "load_jlpt_lexicon", lambda: ({}, {}))
    monkeypatch.setattr(ba, "collect_articles", lambda: articles)
    monkeypatch.setattr(ba, "tokenise_paragraphs", lambda text, _tagger, ruby_markup=None: ([{"s": text, "b": text, "c": True}], []))
    monkeypatch.setattr(ba, "grade_article", lambda *_args: grading)
    monkeypatch.setattr(sys, "argv", ["build_articles.py", "--out", str(out)])
    assert ba.main() == 0
    return {row["id"]: row for row in json.loads((out / "index.json").read_text("utf-8"))["articles"]}


def test_a_rebuild_keeps_the_authored_title_and_the_drawn_picture(tmp_path, monkeypatch):
    rows = rebuild(tmp_path, monkeypatch, [
        {"id": "wikinews:1", "file": "wikinews-1.json", "title": "古い見出し",
         "titleEn": "A ship reaches the harbour", "titleEnSource": "translation, cross-checked",
         "picture": PICTURE, "accent": "#2F4A5C"},
        {"id": "wikinews:2", "file": "wikinews-2.json", "title": "二つ目"},
    ])
    first = rows["wikinews:1"]
    assert (first["titleEn"], first["titleEnSource"], first["picture"], first["accent"]) == (
        "A ship reaches the harbour", "translation, cross-checked", PICTURE, "#2F4A5C")
    # only the curated fields come forward; what the source carries is rebuilt
    assert first["title"] == "新しい見出し"
    assert not set(ba.CURATED_ROW_FIELDS) & set(rows["wikinews:2"])


def test_a_first_build_has_nothing_to_carry(tmp_path, monkeypatch):
    rows = rebuild(tmp_path, monkeypatch)
    assert sorted(rows) == ["wikinews:1", "wikinews:2"]
    assert not any(set(ba.CURATED_ROW_FIELDS) & set(row) for row in rows.values())
