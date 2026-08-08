"""Regenerate corpus/samples/aozora/{sample.jsonl,stats.json} from upstream.

Usage (from corpus/): ``uv run python -m corpus.sources.aozora.build_samples``

Everything is pinned: the index/raw files come from the aozorabunko GitHub
mirror commit and the clean dataset from the HF revision recorded in the two
PROVENANCE.yml files next to this module. furigana_coverage is computed from
a deterministic raw-file subset (fixtures + 小川未明 + seeded random others)
because the clean dataset strips ruby.
"""

from __future__ import annotations

import json
import random
import statistics
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yaml

from corpus.records import write_jsonl

from . import clean_dataset, text as aozora_text
from .index import (
    KANA_COL,
    Work,
    collect_works,
    fetch_index,
    github_raw_url,
    is_usable,
    iter_rows,
    usable_works,
)

_HERE = Path(__file__).resolve().parent
CORPUS_ROOT = _HERE.parents[3]
DATA_DIR = CORPUS_ROOT / "data" / "aozora"
SAMPLES_DIR = CORPUS_ROOT / "samples" / "aozora"

SAMPLE_WORK_IDS = ("051034", "000628", "046605")  # 野ばら, ごん狐, やまなし
ANCHOR_AUTHORS = ("小川未明", "江戸川乱歩", "宮沢賢治")
OGAWA = "小川未明"
SUBSET_OGAWA = 30
SUBSET_OTHERS = 90
SUBSET_SEED = 41  # Wayfinder ticket


def pins() -> tuple[str, str]:
    index_pin = yaml.safe_load((_HERE / "PROVENANCE.yml").read_text("utf-8"))[
        "upstream_pin"
    ]
    clean_pin = yaml.safe_load((_HERE / "clean" / "PROVENANCE.yml").read_text("utf-8"))[
        "upstream_pin"
    ]
    return index_pin, clean_pin


def pick_subset(usable: dict[str, Work]) -> list[Work]:
    """Deterministic raw-file subset: fixtures + 小川未明 + seeded others."""
    zippable = {
        wid: w for wid, w in usable.items() if w.text_url.endswith(".zip")
    }
    chosen: dict[str, Work] = {
        wid: zippable[wid] for wid in SAMPLE_WORK_IDS if wid in zippable
    }
    ogawa = sorted(
        (w for w in zippable.values() if OGAWA in w.authors),
        key=lambda w: w.work_id,
    )
    for w in ogawa[:SUBSET_OGAWA]:
        chosen.setdefault(w.work_id, w)
    others = sorted(
        wid
        for wid, w in zippable.items()
        if OGAWA not in w.authors and wid not in chosen
    )
    rng = random.Random(SUBSET_SEED)
    for wid in rng.sample(others, SUBSET_OTHERS):
        chosen[wid] = zippable[wid]
    return sorted(chosen.values(), key=lambda w: w.work_id)


def fetch_raw_subset(
    works: list[Work], pin: str, dest: Path, max_workers: int = 8
) -> dict[str, Path]:
    dest.mkdir(parents=True, exist_ok=True)

    def one(w: Work) -> tuple[str, Path]:
        path = dest / f"{w.work_id}.zip"
        if not path.exists():
            url = github_raw_url(w.text_url, pin)
            with urllib.request.urlopen(url, timeout=60) as resp:
                path.write_bytes(resp.read())
        return w.work_id, path

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        return dict(ex.map(one, works))


def coverage_map(zips: dict[str, Path]) -> dict[str, float]:
    return {
        wid: aozora_text.furigana_coverage(aozora_text.parse_zip(path))
        for wid, path in zips.items()
    }


def _quantiles(values: list[float]) -> dict[str, float]:
    q = statistics.quantiles(sorted(values), n=4)
    return {
        "min": round(min(values), 4),
        "p25": round(q[0], 4),
        "median": round(q[1], 4),
        "p75": round(q[2], 4),
        "max": round(max(values), 4),
        "mean": round(statistics.fmean(values), 4),
    }


def main() -> int:
    index_pin, clean_pin = pins()

    csv_path = fetch_index(DATA_DIR)
    rows = list(iter_rows(csv_path))
    works = collect_works(rows)
    usable = usable_works(works)

    anchors = {}
    for name in ANCHOR_AUTHORS:
        authored = [w for w in works.values() if name in w.authors]
        anchors[name] = {
            "total_works": len(authored),
            "usable_works": sum(1 for w in authored if w.usable),
            "kana_types": {
                k: sum(1 for w in authored if w.kana_type == k)
                for k in sorted({w.kana_type for w in authored})
            },
        }

    subset = pick_subset(usable)
    zips = fetch_raw_subset(subset, index_pin, DATA_DIR / "raw")
    coverage = coverage_map(zips)

    ogawa_cov = [
        coverage[w.work_id] for w in subset if OGAWA in w.authors
    ]
    all_cov = list(coverage.values())

    clean_path = clean_dataset.fetch_clean(DATA_DIR / "hf", revision=clean_pin)
    clean_rows = 0
    sample_records = {}
    clean_usable = 0
    for row in clean_dataset.iter_clean(clean_path):
        clean_rows += 1
        rec = clean_dataset.record_from_row(row, coverage)
        if rec is None:
            continue
        clean_usable += 1
        wid = row["meta"]["作品ID"]
        if wid in SAMPLE_WORK_IDS:
            sample_records[wid] = rec

    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    write_jsonl(
        [sample_records[wid] for wid in SAMPLE_WORK_IDS if wid in sample_records],
        SAMPLES_DIR / "sample.jsonl",
    )

    stats = {
        "generated": "by corpus.sources.aozora.build_samples",
        "index_pin": index_pin,
        "clean_revision": clean_pin,
        "index": {
            "csv_rows": len(rows),
            "unique_works": len(works),
            "usable_works_strict": len(usable),
            "usable_filter": "作品著作権フラグ == 'なし' and 文字遣い種別 == '新字新仮名'",
            "kana_type_rows": {
                k: sum(1 for r in rows if r[KANA_COL] == k)
                for k in sorted({r[KANA_COL] for r in rows})
            },
            "usable_rows": sum(1 for r in rows if is_usable(r)),
        },
        "anchors": anchors,
        "clean_dataset": {
            "rows": clean_rows,
            "usable_records": clean_usable,
        },
        "furigana_coverage_subset": {
            "size": len(coverage),
            "selection": (
                f"fixtures {list(SAMPLE_WORK_IDS)} + first {SUBSET_OGAWA} 小川未明 "
                f"by 作品ID + {SUBSET_OTHERS} others seeded random (seed {SUBSET_SEED})"
            ),
            "all": _quantiles(all_cov),
            "ogawa_mimei_mean": round(statistics.fmean(ogawa_cov), 4),
            "non_ogawa_mean": round(
                statistics.fmean(
                    [coverage[w.work_id] for w in subset if OGAWA not in w.authors]
                ),
                4,
            ),
        },
    }
    out = SAMPLES_DIR / "stats.json"
    out.write_text(
        json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{len(sample_records)} sample record(s), stats → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
