import datetime as dt
import hashlib
import json
from pathlib import Path

import pytest

openpyxl = pytest.importorskip("openpyxl")

from corpus.records import read_jsonl, write_jsonl
from corpus.sources.snow import fetch as fetch_mod
from corpus.sources.snow.parse import (
    ParseError,
    compute_stats,
    flag_exact_duplicates,
    parse_all,
    parse_t15,
    parse_t23,
)

T15_HEADER = ["ID", "#日本語(原文)", "#やさしい日本語", "#英語(原文)"]
T23_MAIN_HEADER = ["ID", "#日本語(原文)", "#やさしい日本語", "#英語(原文)", "#固有名詞"]


def make_t15(path, rows, header=T15_HEADER):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(header)
    for r in rows:
        ws.append(r)
    wb.save(path)
    return path


def make_t23(path, main_rows, eval_rows, workers=("Ab", "Ac")):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "平易化コーパス"
    ws.append(T23_MAIN_HEADER)
    for r in main_rows:
        ws.append(r)
    ev = wb.create_sheet("評価用")
    ev.append(
        ["ID", "#日本語(原文)", *workers, "#英語(原文)", *[f"{w}_固有名詞" for w in workers]]
    )
    for r in eval_rows:
        ev.append(r)
    wb.save(path)
    return path


def test_t15_schema_ids_meta(tmp_path):
    p = make_t15(tmp_path / "t15.xlsx", [[1, "原文一。", "やさしい一。", "english one ."]])
    recs = list(parse_t15(p))
    assert len(recs) == 1
    r = recs[0]
    assert r.id == "snow-t15:1"
    assert r.source == "snow-t15"
    assert r.title == ""
    assert r.text == "原文一。"
    assert r.meta == {"corpus": "t15", "simplified": "やさしい一。", "english": "english one ."}


def test_t15_whitespace_strip_only(tmp_path):
    p = make_t15(
        tmp_path / "t15.xlsx",
        [[1, "今の彼女だ。\n", "やさしい。", " hello , people ! ''"]],
    )
    r = next(parse_t15(p))
    assert r.text == "今の彼女だ。"
    assert r.meta["english"] == "hello , people ! ''"
    # internal spacing / MT tokenisation preserved byte-for-byte
    assert " , " in r.meta["english"] and r.meta["english"].endswith("''")


def test_t15_header_drift_rejected(tmp_path):
    p = make_t15(tmp_path / "bad.xlsx", [], header=["ID", "日本語", "やさしい", "英語"])
    with pytest.raises(ParseError, match="header drift"):
        next(parse_t15(p))


def test_t15_empty_and_incomplete_rows(tmp_path):
    p = make_t15(
        tmp_path / "t15.xlsx",
        [
            [1, "原文。", "やさしい。", "eng ."],
            [None, None, None, None],
            [3, "", "やさしいのみ。", "eng only ."],
        ],
    )
    stats = {}
    recs = list(parse_t15(p, stats))
    assert [r.id for r in recs] == ["snow-t15:1"]
    assert stats["skipped_no_original"] == 1


def test_t23_main_proper_nouns_and_time_cell(tmp_path):
    p = make_t23(
        tmp_path / "t23.xlsx",
        [
            ["Ab_1", "都合の良い時に。", "具合の良い時に。", "At your convenience.", None],
            ["Af_2708", "接尾辞【-ion】の話。", "言葉【-ion】の話。", "Suffix -ion.", "【-ion】"],
            ["Al_2776", "正午に止めた。", "１２：００にやめた。", "We stopped at noon.", dt.time(12, 0)],
        ],
        [],
    )
    recs = [r for r in parse_t23(p)]
    assert [r.id for r in recs] == ["snow-t23:Ab_1", "snow-t23:Af_2708", "snow-t23:Al_2776"]
    assert all(r.source == "snow-t23" for r in recs)
    assert "proper_nouns" not in recs[0].meta
    assert recs[0].meta["sheet"] == "平易化コーパス"
    assert recs[1].meta["proper_nouns"] == "【-ion】"
    assert recs[2].meta["proper_nouns"] == "12:00:00"  # Excel time-typed cell, isoformat


def test_t23_eval_wide_expansion(tmp_path):
    p = make_t23(
        tmp_path / "t23.xlsx",
        [],
        [["eval_1", "署名してください。", "名前を書いて。", "名前を書く。", "Sign here.", "署名", None]],
        workers=("Ab", "Ac"),
    )
    recs = [r for r in parse_t23(p)]
    assert [r.id for r in recs] == ["snow-t23:eval_1:Ab", "snow-t23:eval_1:Ac"]
    ab, ac = recs
    assert ab.text == ac.text == "署名してください。"
    assert ab.meta["worker"] == "Ab" and ab.meta["simplified"] == "名前を書いて。"
    assert ac.meta["worker"] == "Ac" and ac.meta["simplified"] == "名前を書く。"
    assert ab.meta["english"] == ac.meta["english"] == "Sign here."
    assert ab.meta["sheet"] == ac.meta["sheet"] == "評価用"
    assert ab.meta["proper_nouns"] == "署名"
    assert "proper_nouns" not in ac.meta


def test_flag_exact_duplicates_keeps_and_flags(tmp_path):
    p = make_t15(
        tmp_path / "t15.xlsx",
        [
            [1, "同じ文。", "同じやさしい。", "same ."],
            [2, "同じ文。", "同じやさしい。", "same ."],
            [3, "違う文。", "同じやさしい。", "same ."],
        ],
    )
    recs = flag_exact_duplicates(parse_t15(p))
    assert len(recs) == 3  # nothing dropped
    assert "exact_duplicate_of" not in recs[0].meta
    assert recs[1].meta["exact_duplicate_of"] == "snow-t15:1"
    assert "exact_duplicate_of" not in recs[2].meta
    stats = compute_stats(recs)
    assert stats["per_corpus"]["t15"]["exact_duplicates_flagged"] == 1


def test_fetch_pin_verification(tmp_path, monkeypatch):
    f = tmp_path / fetch_mod.FILENAMES["t15"]
    f.write_bytes(b"snow bytes")
    digest = hashlib.sha256(b"snow bytes").hexdigest()
    monkeypatch.setitem(fetch_mod.SHA256, "t15", digest)
    assert fetch_mod.fetch(tmp_path, "t15") == f  # existing pinned copy, no network
    monkeypatch.setitem(fetch_mod.SHA256, "t15", "0" * 64)
    with pytest.raises(fetch_mod.FetchError, match="does not match pin"):
        fetch_mod.fetch(tmp_path, "t15")
    with pytest.raises(fetch_mod.FetchError, match="unknown corpus"):
        fetch_mod.fetch(tmp_path, "t99")


# --- realdata tier ---------------------------------------------------------

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "snow"
SAMPLES_DIR = Path(__file__).resolve().parents[1] / "samples" / "snow"


@pytest.fixture(scope="module")
def real():
    fetch_mod.fetch_all(DATA_DIR)  # idempotent; verifies sha256 pins
    stats: dict = {}
    records = parse_all(DATA_DIR, stats)
    return records, stats


@pytest.mark.realdata
def test_real_counts(real):
    records, parse_stats = real
    stats = compute_stats(records)
    total = stats["total"]
    per = {k: v["rows"] for k, v in stats["per_corpus"].items()}
    print(f"\nreal counts: total={total} per_corpus={per}")
    assert total >= 80_000
    assert abs(total - 85_000) <= 8_500  # within ±10% of 85k
    assert per["t15"] == 50_000
    assert per["t23"] == 35_000  # 34,300 main + 100×7 eval
    assert parse_stats.get("skipped_no_original", 0) == 0


@pytest.mark.realdata
def test_real_triple_integrity(real):
    records, _ = real
    stats = compute_stats(records)
    for corpus, c in stats["per_corpus"].items():
        rate = c["complete_triple_rate"]
        print(f"\n{corpus}: complete {c['complete_triples']}/{c['rows']} = {rate}")
        assert rate >= 0.99


@pytest.mark.realdata
def test_real_unique_ids(real):
    records, _ = real
    ids = [r.id for r in records]
    assert len(ids) == len(set(ids))


@pytest.mark.realdata
def test_real_duplicates_reported(real):
    records, _ = real
    stats = compute_stats(records)
    flagged = {k: v["exact_duplicates_flagged"] for k, v in stats["per_corpus"].items()}
    print(f"\nexact-duplicate triples flagged: {flagged}")
    # duplicates are kept and flagged, never dropped
    assert sum(flagged.values()) == sum(1 for r in records if "exact_duplicate_of" in r.meta)


@pytest.mark.realdata
def test_real_determinism(real, tmp_path):
    records, _ = real
    a, b = tmp_path / "a.jsonl", tmp_path / "b.jsonl"
    write_jsonl(records, a)
    write_jsonl(parse_all(DATA_DIR), b)
    ha = hashlib.sha256(a.read_bytes()).hexdigest()
    hb = hashlib.sha256(b.read_bytes()).hexdigest()
    print(f"\nparse sha256: {ha}")
    assert ha == hb


@pytest.mark.realdata
def test_committed_samples_match_full_parse(real):
    records, parse_stats = real
    by_id = {r.id: r for r in records}
    sample = list(read_jsonl(SAMPLES_DIR / "sample.jsonl"))
    assert len(sample) == 10
    assert {s.meta["corpus"] for s in sample} == {"t15", "t23"}
    for s in sample:
        assert s == by_id[s.id]
    committed = json.loads((SAMPLES_DIR / "stats.json").read_text(encoding="utf-8"))
    live = compute_stats(records) | {
        "skipped_no_original": parse_stats.get("skipped_no_original", 0)
    }
    assert committed == live
