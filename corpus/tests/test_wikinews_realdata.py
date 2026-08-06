"""Realdata tier: full extraction over the pinned ja.wikinews dump.

Excluded in CI (`-m "not realdata"`). Locally requires the dump at
corpus/data/wikinews/ — obtain via `python -m corpus.sources.wikinews.fetch`.
"""

import hashlib
from pathlib import Path

import pytest

from corpus.records import read_jsonl
from corpus.sources.wikinews.extract import (
    _RESIDUAL_MARKERS,
    _RESIDUAL_MARKERS_NARROW,
    ExtractStats,
    extract_records,
)
from corpus.sources.wikinews.fetch import DUMP_FILENAME, DUMP_SHA256, sha256_file

pytestmark = pytest.mark.realdata

DUMP = Path(__file__).resolve().parents[1] / "data" / "wikinews" / DUMP_FILENAME

if not DUMP.exists():
    pytest.skip(
        f"real dump not present at {DUMP} — run python -m corpus.sources.wikinews.fetch",
        allow_module_level=True,
    )


@pytest.fixture(scope="module")
def full_run(tmp_path_factory):
    from corpus.records import write_jsonl

    outs, stats_list = [], []
    for i in range(2):  # two independent runs → determinism check
        stats = ExtractStats()
        out = tmp_path_factory.mktemp("wikinews") / f"run{i}.jsonl"
        write_jsonl(extract_records(DUMP, stats), out)
        outs.append(out)
        stats_list.append(stats)
    return outs, stats_list


def test_dump_matches_pin():
    assert sha256_file(DUMP) == DUMP_SHA256


def test_at_least_4000_records(full_run):
    (out, _), (stats, _) = full_run
    records = list(read_jsonl(out))
    print(f"\ntotal records: {len(records)}")
    print(f"ns0 pages: {stats.pages_ns0}, redirects: {stats.redirects_skipped}")
    print(f"excluded_by_title: {stats.excluded_by_title}")
    print(f"excluded_empty ({len(stats.excluded_empty)}): {stats.excluded_empty}")
    print(f"date sources: {stats.date_source_counts}")
    print(f"date range: {stats.date_min} .. {stats.date_max}")
    print(f"distinct categories: {stats.distinct_categories}")
    assert len(records) >= 4000
    assert stats.records == len(records)


def test_no_empty_texts_and_unique_ids(full_run):
    (out, _), _ = full_run
    seen = set()
    empties = 0
    for rec in read_jsonl(out):
        if not rec.text.strip():
            empties += 1
        assert rec.id not in seen
        seen.add(rec.id)
    print(f"\nempty texts: {empties} of {len(seen)}")
    assert empties == 0


def test_residual_markup_rate_below_1_percent(full_run):
    (out, _), (stats, _) = full_run
    n = 0
    offenders_wide, offenders_narrow = [], []
    for rec in read_jsonl(out):
        n += 1
        if any(m in rec.text for m in _RESIDUAL_MARKERS):
            offenders_wide.append(rec.id)
        if any(m in rec.text for m in _RESIDUAL_MARKERS_NARROW):
            offenders_narrow.append(rec.id)
    rate = len(offenders_wide) / n
    print(
        f"\nresidual-markup records (wide net {_RESIDUAL_MARKERS}): "
        f"{len(offenders_wide)} of {n} ({rate:.4%})"
    )
    print(
        f"residual-markup records (narrow net {_RESIDUAL_MARKERS_NARROW}): "
        f"{len(offenders_narrow)} of {n} ({len(offenders_narrow) / n:.4%})"
    )
    print(f"offender ids (first 20): {offenders_wide[:20]}")
    assert len(offenders_wide) == stats.residual_markup_records
    assert len(offenders_narrow) == stats.residual_markup_records_narrow
    assert rate < 0.01


def test_determinism_two_runs_byte_identical(full_run):
    (out_a, out_b), _ = full_run
    sha_a = hashlib.sha256(out_a.read_bytes()).hexdigest()
    sha_b = hashlib.sha256(out_b.read_bytes()).hexdigest()
    print(f"\nrun A sha256: {sha_a}\nrun B sha256: {sha_b}")
    assert sha_a == sha_b
