"""Realdata tier: pinned download → counts, SKIP audit, byte-identical dataset.

Expected counts come from Wayfinder #41/#45 (verified against release
3.6.1-era data); assertions allow ±5% drift because upstream JMdict moves.
Exact numbers are printed for the PR body — run with ``-s``.
"""

import json

import pytest

from corpus.sources.jmdict import fetch, idioms, kanjidic

pytestmark = pytest.mark.realdata

EXPECTED_TAG_COUNTS = {"yoji": 1841, "proverb": 940, "id": 1402, "quote": 25}
EXPECTED_UNION = 4180
MAX_OVERLAP = 30  # #45 estimated ~6 overlapping entries; assert same order of magnitude


def _within_5pct(actual: int, expected: int) -> bool:
    return abs(actual - expected) <= 0.05 * expected


@pytest.fixture(scope="module")
def jmdict_words():
    return fetch.load_json(fetch.JMDICT_ASSET)["words"]


@pytest.fixture(scope="module")
def kanjidic_data():
    return fetch.load_json(fetch.KANJIDIC_ASSET)


def test_per_tag_counts_within_5pct(jmdict_words):
    per_tag: dict[str, set[str]] = {t: set() for t in idioms.IDIOM_TAGS}
    for w in jmdict_words:
        for s in w["sense"]:
            for t in idioms.IDIOM_TAGS:
                if t in (s.get("misc") or ()):
                    per_tag[t].add(w["id"])
    union = set().union(*per_tag.values())
    overlap = {i for i in union if sum(i in per_tag[t] for t in idioms.IDIOM_TAGS) > 1}

    exact = {t: len(per_tag[t]) for t in idioms.IDIOM_TAGS}
    print(f"\nEXACT per-tag entry counts: {exact}")
    print(f"EXACT union: {len(union)}  EXACT overlap (entries with >1 idiom tag): {len(overlap)}")
    print(f"overlap ids: {sorted(overlap, key=int)}")

    for t, expected in EXPECTED_TAG_COUNTS.items():
        assert _within_5pct(exact[t], expected), f"{t}: {exact[t]} vs expected {expected} ±5%"
    assert _within_5pct(len(union), EXPECTED_UNION)
    assert len(overlap) <= MAX_OVERLAP


def test_dataset_rows_match_union(jmdict_words):
    rows = list(idioms.idiom_rows(jmdict_words))
    assert _within_5pct(len(rows), EXPECTED_UNION)
    assert len({r["jmdict_seq"] for r in rows}) == len(rows)
    assert all(r["misc_tags"] for r in rows)
    assert all(r["kanji"] or r["kana"] for r in rows)


def test_committed_idioms_byte_identical_to_regeneration(tmp_path):
    regen = tmp_path / "idioms.jsonl"
    n = idioms.build(out_path=regen)
    print(f"\nregenerated {n} idiom rows")
    assert idioms.DATASET_PATH.exists(), "committed dataset missing — run idioms.build()"
    assert regen.read_bytes() == idioms.DATASET_PATH.read_bytes()


def test_kanjidic_full_output_has_zero_skip_codes(kanjidic_data, tmp_path):
    out = tmp_path / "kanjidic_stripped.jsonl"
    n = kanjidic.build(out_path=out, sample_path=None)
    chars = kanjidic_data["characters"]
    assert n == len(chars)

    source_skip = {
        c["literal"]: [q["value"] for q in c.get("queryCodes") or () if q.get("type") == "skip"]
        for c in chars
    }
    n_source_skip = sum(len(v) for v in source_skip.values())
    print(f"\nkanji written: {n}; skip codes in SOURCE: {n_source_skip}")
    assert n_source_skip > 10000  # the hazard is real in the source

    survivors = 0
    with out.open("r", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            assert tuple(row.keys()) == kanjidic.OUTPUT_KEYS
            assert "jlpt" not in row and "jlptLevel" not in row
            for v in source_skip[row["literal"]]:
                if v in line:
                    survivors += 1
    print(f"skip codes surviving in OUTPUT: {survivors}")
    assert survivors == 0


def test_committed_kanjidic_sample_matches_regeneration(tmp_path):
    out = tmp_path / "kanjidic_stripped.jsonl"
    sample = tmp_path / "kanjidic_sample.jsonl"
    kanjidic.build(out_path=out, sample_path=sample)
    assert kanjidic.SAMPLE_PATH.exists(), "committed sample missing — run kanjidic.build()"
    assert sample.read_bytes() == kanjidic.SAMPLE_PATH.read_bytes()
    assert len(sample.read_text(encoding="utf-8").splitlines()) == kanjidic.SAMPLE_SIZE
