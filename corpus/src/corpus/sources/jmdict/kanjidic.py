"""SKIP-stripped KANJIDIC2 per-kanji metadata.

KANJIDIC2 itself is CC BY-SA 4.0 (EDRDG), but the SKIP codes embedded in its
``queryCodes`` (type ``skip``) are Jack Halpern's SKIP system under
CC BY-NC-SA 4.0 — NC content may not enter this corpus at all (Wayfinder #41).
The pipeline therefore WHITELISTS output fields rather than deleting known-bad
ones: nothing that is not named below can survive, and tests assert no skip
code does.

The upstream ``jlptLevel`` is the pre-2010 4-level JLPT scale, an editorial
leftover — it is renamed ``jlpt_pre2010_editorial`` so it can never be
mistaken for an official current JLPT level (the 5-level N-scale has no
official kanji lists at all).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Iterator

from corpus.sources.jmdict import fetch

OUT_PATH = fetch.DATA_DIR / "kanjidic_stripped.jsonl"
SAMPLE_PATH = Path(__file__).resolve().parents[4] / "samples" / "jmdict" / "kanjidic_sample.jsonl"
SAMPLE_SIZE = 100

OUTPUT_KEYS = (
    "literal",
    "on_readings",
    "kun_readings",
    "nanori",
    "meanings",
    "grade",
    "stroke_count",
    "frequency",
    "jlpt_pre2010_editorial",
)


def strip_character(char: dict[str, Any]) -> dict[str, Any]:
    misc = char.get("misc") or {}
    rm = char.get("readingMeaning") or {}
    on: list[str] = []
    kun: list[str] = []
    meanings: list[str] = []
    for group in rm.get("groups") or ():
        for r in group.get("readings") or ():
            if r.get("type") == "ja_on":
                on.append(r["value"])
            elif r.get("type") == "ja_kun":
                kun.append(r["value"])
        for m in group.get("meanings") or ():
            if m.get("lang") == "en":
                meanings.append(m["value"])
    stroke_counts = misc.get("strokeCounts") or []
    return {
        "literal": char["literal"],
        "on_readings": on,
        "kun_readings": kun,
        "nanori": list(rm.get("nanori") or ()),
        "meanings": meanings,
        "grade": misc.get("grade"),
        "stroke_count": stroke_counts[0] if stroke_counts else None,
        "frequency": misc.get("frequency"),
        "jlpt_pre2010_editorial": misc.get("jlptLevel"),
    }


def stripped_rows(characters: Iterable[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    for char in characters:
        yield strip_character(char)


def write_jsonl(rows: Iterable[dict[str, Any]], out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
    return n


def build(
    out_path: Path = OUT_PATH,
    sample_path: Path | None = SAMPLE_PATH,
    data_dir: Path = fetch.DATA_DIR,
) -> int:
    data = fetch.load_json(fetch.KANJIDIC_ASSET, data_dir)
    n = write_jsonl(stripped_rows(data["characters"]), out_path)
    if sample_path is not None:
        with out_path.open("r", encoding="utf-8") as f:
            head = [next(f) for _ in range(min(SAMPLE_SIZE, n))]
        sample_path.parent.mkdir(parents=True, exist_ok=True)
        sample_path.write_text("".join(head), encoding="utf-8")
    return n


if __name__ == "__main__":
    print(f"{build()} kanji → {OUT_PATH} (sample of {SAMPLE_SIZE} → {SAMPLE_PATH})")
