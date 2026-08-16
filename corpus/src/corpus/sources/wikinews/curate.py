"""Curate the archive tranche the shelf actually ships.

The full extraction (4,094 records from the pinned 2026-08-04 dump) is too
heavy to mint wholesale — tokenised bodies run ~55 bytes per source char,
so the whole archive would cost >100 MB of committed JSON. This command
picks a large, deterministic, year-balanced tranche instead:

  * every eligible article from 2016 onward (the recent decade reads
    closest to today's newsprint register, and it is the thin end of the
    archive — taking all of it costs little), and
  * an every-k-th spread per year 2005–2015 (quota below), ordered by page
    id, preferring the 350–1500 char reading sweet spot.

Eligibility: ≥ ``MIN_CHARS`` chars of extracted prose; not one of the ids
already minted on the curated shelf. Two runs over the same extraction are
byte-identical (no randomness anywhere).

Usage:
    python -m corpus.sources.wikinews.curate \
        [--full corpus/data/wikinews/articles.jsonl] \
        [--out corpus/datasets/wikinews/archive.jsonl]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[4].parent

MIN_CHARS = 300
RECENT_FROM = 2016
QUOTA_PER_EARLY_YEAR = 30
SWEET_LO, SWEET_HI = 350, 1500

# already minted on the curated shelf — the archive must not double them
SHELF_IDS = {
    "wikinews:1403",
    "wikinews:6460",
    "wikinews:12024",
    "wikinews:20090",
    "wikinews:45227",
}


def year_of(rec: dict) -> int:
    date = rec.get("meta", {}).get("date") or ""
    return int(date[:4]) if date[:4].isdigit() else 0


def page_id(rec: dict) -> int:
    tail = rec["id"].rsplit(":", 1)[-1]
    return int(tail) if tail.isdigit() else 0


def curate(full_path: Path, out_path: Path) -> dict:
    rows = [json.loads(line) for line in full_path.open(encoding="utf-8")]
    eligible = [
        r
        for r in rows
        if len(r["text"]) >= MIN_CHARS and r["id"] not in SHELF_IDS and year_of(r) > 0
    ]

    picked: list[dict] = []
    by_year: dict[int, list[dict]] = {}
    for r in eligible:
        by_year.setdefault(year_of(r), []).append(r)

    stats: dict[str, int] = {}
    for year in sorted(by_year):
        pool = sorted(by_year[year], key=page_id)
        if year >= RECENT_FROM:
            chosen = pool
        else:
            sweet = [r for r in pool if SWEET_LO <= len(r["text"]) <= SWEET_HI]
            base = sweet if len(sweet) >= QUOTA_PER_EARLY_YEAR else pool
            if len(base) <= QUOTA_PER_EARLY_YEAR:
                chosen = base
            else:
                step = len(base) / QUOTA_PER_EARLY_YEAR
                chosen = [base[int(i * step)] for i in range(QUOTA_PER_EARLY_YEAR)]
        picked.extend(chosen)
        stats[str(year)] = len(chosen)

    picked.sort(key=page_id)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for r in picked:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return {"picked": len(picked), "eligible": len(eligible), "by_year": stats}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--full", default=str(REPO / "corpus/data/wikinews/articles.jsonl"))
    ap.add_argument("--out", default=str(REPO / "corpus/datasets/wikinews/archive.jsonl"))
    args = ap.parse_args(argv)
    stats = curate(Path(args.full), Path(args.out))
    print(json.dumps(stats, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
