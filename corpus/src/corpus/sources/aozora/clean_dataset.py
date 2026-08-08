"""globis-university/aozorabunko-clean → CorpusRecord rows.

The dataset (CC BY 4.0) is PD-only, deduplicated, and carries the full
extended-index row as ``meta`` — so the strict usable filter re-applies here.
Verified 2026-08-07 against revision 42a9c9c: ruby is STRIPPED from its
``text`` (only 12/16,951 rows contain 《 at all, as quotation marks), so
``furigana_coverage`` cannot be computed from clean text; pass a mapping
computed from raw card files (``text.furigana_coverage``) instead — records
outside that mapping get ``furigana_coverage: null``.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping

from corpus.records import CorpusRecord

from .index import (
    AUTHOR_ROLE,
    CARD_URL_COL,
    COPYRIGHT_COL,
    FIRST_PUBLISHED_COL,
    KANA_COL,
    PD_FLAG,
    RELEASED_COL,
    ROLE_COL,
    SHINJI_SHINKANA,
    SUBTITLE_COL,
    TITLE_COL,
    WORK_ID_COL,
    _person,
)

DATASET_ID = "globis-university/aozorabunko-clean"
FILENAME = "aozorabunko-dedupe-clean.jsonl.gz"
SOURCE_NAME = "aozorabunko-clean"


def fetch_clean(dest_dir: str | Path, revision: str | None = None) -> Path:
    """Download the dataset file via huggingface_hub (cached in dest_dir)."""
    from huggingface_hub import hf_hub_download

    return Path(
        hf_hub_download(
            DATASET_ID,
            FILENAME,
            repo_type="dataset",
            revision=revision,
            local_dir=str(dest_dir),
        )
    )


def iter_clean(path: str | Path) -> Iterator[dict[str, Any]]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def record_from_row(
    row: Mapping[str, Any],
    furigana: Mapping[str, float] | None = None,
) -> CorpusRecord | None:
    """One clean row → CorpusRecord, or None if it fails the strict filter
    (or has no text). id = ``aozora:<作品ID>``."""
    meta = row["meta"]
    if meta.get(COPYRIGHT_COL) != PD_FLAG or meta.get(KANA_COL) != SHINJI_SHINKANA:
        return None
    text = row.get("text") or ""
    if not text.strip():
        return None
    work_id = meta[WORK_ID_COL]
    person = _person(meta)
    coverage = furigana.get(work_id) if furigana else None
    return CorpusRecord(
        id=f"aozora:{work_id}",
        source=SOURCE_NAME,
        title=meta.get(TITLE_COL, ""),
        text=text,
        meta={
            "author": person if meta.get(ROLE_COL) == AUTHOR_ROLE else None,
            "subtitle": meta.get(SUBTITLE_COL) or None,
            "文字遣い種別": meta.get(KANA_COL),
            "furigana_coverage": coverage,
            "first_published": meta.get(FIRST_PUBLISHED_COL) or None,
            "released": meta.get(RELEASED_COL) or None,
            "card_url": meta.get(CARD_URL_COL) or None,
        },
    )


def to_records(
    rows: Iterable[Mapping[str, Any]],
    furigana: Mapping[str, float] | None = None,
) -> Iterator[CorpusRecord]:
    for row in rows:
        rec = record_from_row(row, furigana)
        if rec is not None:
            yield rec


def main() -> int:
    """Full conversion: pinned clean dataset → data/out/aozora.jsonl."""
    from corpus.records import write_jsonl

    from .build_samples import DATA_DIR, coverage_map, fetch_raw_subset, pick_subset, pins
    from .index import collect_works, fetch_index, iter_rows, usable_works

    index_pin, clean_pin = pins()
    usable = usable_works(collect_works(iter_rows(fetch_index(DATA_DIR))))
    subset = pick_subset(usable)
    coverage = coverage_map(fetch_raw_subset(subset, index_pin, DATA_DIR / "raw"))
    path = fetch_clean(DATA_DIR / "hf", revision=clean_pin)
    out = DATA_DIR.parent / "out" / "aozora.jsonl"
    n = write_jsonl(to_records(iter_clean(path), coverage), out)
    print(f"{n} record(s) → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
