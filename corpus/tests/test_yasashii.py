"""Verifier for corpus.sources.yasashii.

Unit tier: ruby reconstruction over synthetic char-layout fixtures (dicts with
the same keys pdfplumber emits), covering base+ruby pairing, consecutive kanji
runs, okurigana trim, merged-run splitting (the real 働く人 geometry from
page 5), non-ruby small text rejection, orphan ruby, multi-line joining and
number-cell segmentation.

Realdata tier: full parse of the pinned 別冊 PDF — entry count vs the
document's own numbering (1..134), ruby coverage, artifact rate, anchor
entries verified against the PDF rendering by eye during review, and the
committed sample regenerating byte-identically.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from corpus.sources.yasashii.parse import (
    CellResult,
    parse_number_cell,
    reconstruct_cell,
    strip_ruby,
)

CORPUS = Path(__file__).resolve().parents[1]
PDF = CORPUS / "data" / "yasashii" / "bessatsu_kakikaerei.pdf"
SAMPLES = CORPUS / "samples" / "yasashii"

BODY = 9.6
RUBY = 4.8


def ch(text: str, x0: float, x1: float, top: float, size: float = BODY) -> dict:
    return {"text": text, "size": size, "x0": x0, "x1": x1, "top": top, "bottom": top + size}


def kanji_line(s: str, x0: float = 0.0, top: float = 20.0, w: float = 9.6) -> list[dict]:
    return [ch(c, x0 + i * w, x0 + (i + 1) * w, top) for i, c in enumerate(s)]


def ruby_over(s: str, x0: float, x1: float, base_top: float = 20.0) -> list[dict]:
    w = (x1 - x0) / len(s)
    return [
        ch(c, x0 + i * w, x0 + (i + 1) * w, base_top - 6.4, size=RUBY)
        for i, c in enumerate(s)
    ]


# ---------- unit tier: ruby reconstruction ----------


def test_single_kanji_pairing():
    base = kanji_line("子どもを")
    r = reconstruct_cell(base + ruby_over("こ", 1.0, 8.0))
    assert r.text == "｜子《こ》どもを"
    assert r.ruby_runs == 1 and not r.artifacts


def test_consecutive_kanji_run_one_reading():
    base = kanji_line("育児休業")
    r = reconstruct_cell(base + ruby_over("いくじきゅうぎょう", 0.5, 38.0))
    assert r.text == "｜育児休業《いくじきゅうぎょう》"
    assert r.readings == ["いくじきゅうぎょう"]


def test_two_words_two_runs():
    base = kanji_line("家を貸す人。")
    chars = base + ruby_over("いえ", 0.0, 9.0) + ruby_over("か", 20.0, 27.0) + ruby_over("ひと", 39.0, 47.5)
    r = reconstruct_cell(chars)
    assert r.text == "｜家《いえ》を｜貸《か》す｜人《ひと》。"
    assert r.ruby_runs == 3 and not r.artifacts


def test_okurigana_trimmed_from_overhanging_ruby():
    base = kanji_line("を育てる", x0=0.0)  # 育 at x 9.6..19.2
    r = reconstruct_cell(base + ruby_over("そだ", 10.0, 21.0))  # overhangs て
    assert r.text == "を｜育《そだ》てる"
    assert not r.artifacts


def test_merged_run_splits_across_kana():
    # real geometry from page 5, entry 26: 働く人 with はたら/ひと gap 3.9pt
    base = [
        ch("働", 430.2, 439.8, 693.5),
        ch("く", 439.8, 444.6, 693.5),
        ch("人", 444.6, 454.2, 693.5),
    ]
    rb = [
        ch("は", 430.2, 434.3, 687.0, RUBY),
        ch("た", 434.3, 438.0, 687.0, RUBY),
        ch("ら", 438.0, 441.3, 687.0, RUBY),
        ch("ひ", 445.2, 449.1, 687.0, RUBY),
        ch("と", 450.6, 453.6, 687.0, RUBY),
    ]
    r = reconstruct_cell(base + rb)
    assert r.text == "｜働《はたら》く｜人《ひと》"
    assert r.readings == ["はたら", "ひと"]
    assert not r.artifacts


def test_small_latin_is_not_ruby():
    # 7.66pt URL text on page 3 is body text, not furigana
    chars = [ch(c, i * 5.0, (i + 1) * 5.0, 99.1, size=7.66) for i, c in enumerate("http")]
    r = reconstruct_cell(chars)
    assert r.text == "http"
    assert r.ruby_runs == 0 and not r.artifacts


def test_orphan_ruby_line_counted_not_attached():
    # ruby with no base line within 3..12pt below it
    r = reconstruct_cell(kanji_line("金", top=100.0) + ruby_over("かね", 0.0, 8.0, base_top=50.0))
    assert r.text == "金"
    assert r.artifacts == ["orphan_ruby_line:かね"]


def test_multiline_cell_joins_and_attaches_per_line():
    l1 = kanji_line("お金", top=20.0)
    l2 = kanji_line("です。", top=46.0)
    chars = l1 + l2 + ruby_over("かね", 9.7, 18.5, base_top=20.0)
    r = reconstruct_cell(chars)
    assert r.text == "お｜金《かね》です。"


def test_strip_ruby_inverts_markup():
    base = kanji_line("子どもを育てる")
    chars = base + ruby_over("こ", 1.0, 8.0) + ruby_over("そだ", 39.0, 47.0)
    r = reconstruct_cell(chars)
    assert strip_ruby(r.text) == "子どもを育てる"


def test_cellresult_no_silent_mutation():
    # any reconstruction must reproduce the raw base text after stripping
    base = kanji_line("在留期限を過ぎても日本にいること。")
    chars = base + ruby_over("ざいりゅうきげん", 0.0, 37.0) + ruby_over("す", 48.5, 55.0)
    r = reconstruct_cell(chars)
    assert strip_ruby(r.text) == "在留期限を過ぎても日本にいること。"


# ---------- unit tier: entry segmentation ----------


@pytest.mark.parametrize(
    "text,expected",
    [("1", 1), ("134", 134), ("番号", None), ("あ", None), ("", None)],
)
def test_number_cell_segmentation(text, expected):
    chars = [ch(c, i * 6.0, (i + 1) * 6.0, 265.0) for i, c in enumerate(text)]
    assert parse_number_cell(chars) == expected


# ---------- realdata tier ----------


requires_pdf = pytest.mark.skipif(not PDF.exists(), reason="run corpus.sources.yasashii.fetch first")


@pytest.mark.realdata
@requires_pdf
def test_full_parse_counts_and_coverage():
    pytest.importorskip("pdfplumber")
    from corpus.sources.yasashii.parse import parse_pdf

    entries, stats = parse_pdf(PDF)
    # the document numbers its entries 1..134; measured 2026-08-07:
    # 134/134 extracted, 100.0% with ruby, 0 artifact entries, 1149 ruby runs
    assert stats["entries_extracted"] == 134
    assert stats["missing_entry_numbers"] == []
    assert stats["duplicate_entry_numbers"] == []
    assert stats["pct_entries_with_ruby"] >= 99.0
    assert stats["pct_entries_with_artifacts"] <= 1.5
    print("\nstats:", json.dumps(stats, ensure_ascii=False))


@pytest.mark.realdata
@requires_pdf
def test_anchor_entries_match_pdf_rendering():
    pytest.importorskip("pdfplumber")
    from corpus.sources.yasashii.parse import parse_pdf

    entries, _ = parse_pdf(PDF)
    by_no = {e.entry_no: e for e in entries}
    assert by_no[1].headword_ruby == "｜育児休業《いくじきゅうぎょう》"
    assert by_no[1].text == "｜子《こ》どもを｜育《そだ》てるために、とることができる｜休《やす》み。"
    assert by_no[8].headword == "オーバーステイ"  # katakana headword, no ruby
    assert "｜働《はたら》く｜人《ひと》" in by_no[26].text  # merged-run split
    assert by_no[131].headword == "（賃貸契約の）連帯保証人"  # 2-line headword
    assert by_no[134].text.startswith("65｜歳以上《さいいじょう》の｜人《ひと》")


@pytest.mark.realdata
@requires_pdf
def test_committed_sample_regenerates_byte_identical(tmp_path):
    pytest.importorskip("pdfplumber")
    from corpus.sources.yasashii.parse import main

    assert main(["--out-dir", str(tmp_path)]) == 0
    for name in ("sample.jsonl", "stats.json"):
        regenerated = (tmp_path / name).read_bytes()
        committed = (SAMPLES / name).read_bytes()
        assert regenerated == committed, f"{name} drifted from committed sample"
