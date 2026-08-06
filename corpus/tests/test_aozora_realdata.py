"""Realdata tier: runs against the actual index CSV, raw card files, and the
full aozorabunko-clean dataset. Downloads (and caches) into corpus/data/ —
network required on first run; excluded in CI (-m "not realdata")."""

import json
import statistics
from pathlib import Path

import pytest

from corpus.sources.aozora import clean_dataset
from corpus.sources.aozora.build_samples import (
    DATA_DIR,
    OGAWA,
    SAMPLE_WORK_IDS,
    coverage_map,
    fetch_raw_subset,
    pick_subset,
    pins,
)
from corpus.sources.aozora.index import (
    collect_works,
    fetch_index,
    iter_rows,
    usable_works,
)

pytestmark = pytest.mark.realdata

SAMPLES = Path(__file__).parents[1] / "samples" / "aozora"


@pytest.fixture(scope="module")
def works():
    return collect_works(iter_rows(fetch_index(DATA_DIR)))


@pytest.fixture(scope="module")
def usable(works):
    return usable_works(works)


def test_usable_count_in_expected_band(usable):
    n = len(usable)
    print(f"\nusable works (PD & 新字新仮名, unique 作品ID): {n}")
    assert 10_300 <= n <= 10_700


def _by_author(works, name):
    return [w for w in works.values() if name in w.authors]


def test_anchor_ogawa_mimei(works):
    authored = _by_author(works, OGAWA)
    passing = [w for w in authored if w.usable]
    print(f"\n小川未明: {len(authored)} works, {len(passing)} usable")
    assert len(authored) == len(passing), "小川未明 is 100% 新字新仮名"
    assert 600 <= len(authored) <= 640  # 619 at pin 109139b


def test_anchor_edogawa_ranpo(works):
    authored = _by_author(works, "江戸川乱歩")
    passing = [w for w in authored if w.usable]
    print(f"\n江戸川乱歩: {len(authored)} works, {len(passing)} usable")
    assert 105 <= len(passing) <= 115  # 110/111 at pin 109139b


def test_anchor_miyazawa_kenji_trap(works):
    authored = _by_author(works, "宮沢賢治")
    passing = [w for w in authored if w.usable]
    print(f"\n宮沢賢治: {len(authored)} works, {len(passing)} usable")
    assert 270 <= len(authored) <= 290  # 278 at pin 109139b
    assert 80 <= len(passing) <= 95  # 88 — most 宮沢賢治 is 新字旧仮名
    assert len(passing) < len(authored) / 2


@pytest.fixture(scope="module")
def coverage(usable):
    index_pin, _ = pins()
    subset = pick_subset(usable)
    zips = fetch_raw_subset(subset, index_pin, DATA_DIR / "raw")
    return subset, coverage_map(zips)


def test_furigana_coverage_subset(usable, coverage):
    subset, cov = coverage
    assert len(cov) == len(subset)
    assert all(0.0 <= c <= 1.0 for c in cov.values())
    ogawa = [cov[w.work_id] for w in subset if OGAWA in w.authors]
    overall_mean = statistics.fmean(cov.values())
    ogawa_mean = statistics.fmean(ogawa)
    print(
        f"\ncoverage subset n={len(cov)}: overall mean {overall_mean:.4f}, "
        f"小川未明 mean {ogawa_mean:.4f} (n={len(ogawa)})"
    )
    assert ogawa_mean > overall_mean


def test_clean_dataset_full_conversion(coverage):
    _, cov = coverage
    _, clean_pin = pins()
    path = clean_dataset.fetch_clean(DATA_DIR / "hf", revision=clean_pin)
    ids = set()
    n_rows = 0
    n_records = 0
    coverage_seen = 0
    for row in clean_dataset.iter_clean(path):
        n_rows += 1
        rec = clean_dataset.record_from_row(row, cov)
        if rec is None:
            continue
        n_records += 1
        assert rec.id not in ids, f"duplicate id {rec.id}"
        ids.add(rec.id)
        c = rec.meta["furigana_coverage"]
        if c is not None:
            coverage_seen += 1
            assert 0.0 <= c <= 1.0
    print(
        f"\nclean dataset: {n_rows} rows → {n_records} usable records "
        f"({coverage_seen} with furigana_coverage from the raw subset)"
    )
    assert 10_100 <= n_records <= 10_400  # 10,246 at revision 42a9c9c
    assert coverage_seen >= 100


def test_committed_stats_match_recount(works, usable):
    stats = json.loads((SAMPLES / "stats.json").read_text("utf-8"))
    assert stats["index"]["unique_works"] == len(works)
    assert stats["index"]["usable_works_strict"] == len(usable)
    for name in ("小川未明", "江戸川乱歩", "宮沢賢治"):
        authored = _by_author(works, name)
        assert stats["anchors"][name]["total_works"] == len(authored)
        assert stats["anchors"][name]["usable_works"] == sum(
            1 for w in authored if w.usable
        )


def test_committed_sample_ids_exist_upstream(usable):
    for wid in SAMPLE_WORK_IDS:
        assert wid in usable
