"""The shelf's browsing facets arrive through the index writers themselves.

Run:  python -m pytest prototypes/corridor/tools/test_reading_facets.py -q
"""

from __future__ import annotations

import json
from copy import deepcopy
import shutil
import subprocess
import sys
import types
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from test_fresh_sources import restage_shelf  # noqa: E402
import build_articles as ba  # noqa: E402

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


@pytest.fixture(scope="module")
def curated_jlpt_records():
    rows = json.loads((ARTICLES / "index.json").read_text("utf-8"))["articles"]
    return [(row, json.loads((ARTICLES / row["file"]).read_text("utf-8"))) for row in rows]


def assert_curated_jlpt_parity(records):
    """Compare both stored copies to the canonical matcher, not just each other."""
    assert len(records) == 156
    assert len({row["id"] for row, _body in records}) == 156
    maps = ba.load_jlpt_lexicon()
    for row, body in records:
        assert row["id"] == body["id"]
        expected = ba.jlpt_signal(body["tokens"], *maps)
        body_signal = body["grading"]["signals"]["jlpt_lexicon"]
        index_signal = row["grading"]["signals"]["jlpt_lexicon"]
        assert body_signal == expected, f'{row["id"]}: body signal differs from canonical tokens'
        assert index_signal == expected, f'{row["id"]}: index signal differs from canonical tokens'
        assert body_signal == index_signal, f'{row["id"]}: body/index signals differ'


def test_all_156_curated_jlpt_signals_match_canonical_tokens(curated_jlpt_records):
    assert_curated_jlpt_parity(curated_jlpt_records)


@pytest.mark.parametrize("mutation", ["both-old", "body-old", "index-old", "both-band-only"])
def test_curated_jlpt_parity_rejects_stale_and_partial_signals(curated_jlpt_records, mutation):
    records = deepcopy(curated_jlpt_records)
    row, body = next(pair for pair in records if pair[0]["id"] == "aozora:049966-2")
    # The two equally stale copies at 51fa13d8 passed body/index equality.
    old = {
        "coverage": 0.6818923327895595,
        "band_vector": {"n5": 0.2642740619902121, "n4": 0.1533442088091354,
                        "n3": 0.20880913539967375, "n2": 0.024469820554649267,
                        "n1": 0.03099510603588907, "oov": 0.3181076672104405},
        "substrate": "open-anki-jlpt-decks/wbig-6687", "n_content_tokens": 613,
    }
    if mutation == "both-band-only":
        # Coverage, count, substrate and body/index equality remain correct.
        for record in (row, body):
            record["grading"]["signals"]["jlpt_lexicon"]["band_vector"] = deepcopy(old["band_vector"])
    else:
        for record in ((row, body) if mutation == "both-old" else (body,) if mutation == "body-old" else (row,)):
            record["grading"]["signals"]["jlpt_lexicon"] = deepcopy(old)
    if mutation.startswith("both-"):
        assert row["grading"]["signals"]["jlpt_lexicon"] == body["grading"]["signals"]["jlpt_lexicon"]
    side = "index" if mutation == "index-old" else "body"
    with pytest.raises(AssertionError, match=f"aozora:049966-2: {side} signal differs"):
        assert_curated_jlpt_parity(records)


def fixture_jlpt_maps(tmp_path, monkeypatch, entries):
    lexicon = tmp_path / "prototypes/drift/data/wbig.json"
    lexicon.parent.mkdir(parents=True)
    lexicon.write_text(json.dumps(entries, ensure_ascii=False), "utf-8")
    monkeypatch.setattr(ba, "REPO", tmp_path)
    return ba.load_jlpt_lexicon()


def test_jlpt_exact_orthography_precedes_easier_reading(tmp_path, monkeypatch):
    maps = fixture_jlpt_maps(tmp_path, monkeypatch, [["いる", "いる", "fixture", 2], ["居る", "いる", "fixture", 5]])
    signal = ba.jlpt_signal([{"b": "いる", "r": "いる", "c": True}], *maps)
    assert signal["band_vector"]["n2"] == 1
    assert signal["band_vector"]["n5"] == 0


def test_jlpt_kana_base_can_use_normalized_reading_fallback(tmp_path, monkeypatch):
    maps = fixture_jlpt_maps(tmp_path, monkeypatch, [["沢山", "たくさん", "fixture", 5]])
    signal = ba.jlpt_signal([{"b": base, "c": True} for base in ("たくさん", "タクサン")], *maps)
    assert signal["coverage"] == 1
    assert signal["band_vector"]["n5"] == 1
    assert signal["n_content_tokens"] == 2


def test_jlpt_kanji_homophone_cannot_use_token_reading(tmp_path, monkeypatch):
    maps = fixture_jlpt_maps(tmp_path, monkeypatch, [["箸", "はし", "fixture", 5]])
    signal = ba.jlpt_signal([{"b": "橋", "r": "はし", "c": True}], *maps)
    assert signal["coverage"] == 0
    assert signal["band_vector"]["oov"] == 1


@pytest.mark.parametrize("reverse", [False, True])
def test_jlpt_duplicates_keep_highest_n_in_both_maps(tmp_path, monkeypatch, reverse):
    entries = [["猫", "ネコ", "fixture", level] for level in (2, 5, 3)]
    entries += [["かたち", "かたち", "fixture", 2], ["形", "カタチ", "fixture", 5]]
    ortho, kana = fixture_jlpt_maps(tmp_path, monkeypatch, list(reversed(entries)) if reverse else entries)
    assert ortho["猫"] == kana["ねこ"] == 5
    assert ortho["かたち"] == 2
    assert kana["かたち"] == 5
    signal = ba.jlpt_signal([{"b": base, "c": True} for base in ("猫", "ねこ")], ortho, kana)
    assert signal["band_vector"]["n5"] == 1
