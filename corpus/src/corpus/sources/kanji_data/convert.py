"""Convert mimneko/kanji-data CSVs to the committed JSONL fact tables.

``漢検漢字辞典漢字.csv`` (UTF-8 with BOM, 11 columns) → ``kanken.jsonl``: one
JSON object per 字項 row, in CSV order. The ``漢検漢字辞典掲載ページ`` column is
dropped entirely and must never appear in output (arrangement exposure — see
package docstring). Rows with an empty 漢字テキスト (glyph not encodable in
Unicode) are KEPT: ids, form, level and notes still carry information.

``kanken_rank`` is an ORDINAL FOR SORTING ONLY — a total order over the 14
literal 漢検級 values so consumers can sort without parsing Japanese level
strings. It is NOT a claim about where ``1/準1級`` (a 旧字 whose 親字 splits
across 1級/準1級) sits pedagogically, nor that adjacent ranks are equidistant.
The literal string in ``kanken_level`` is always the source of truth.

``部首一覧.csv`` (5 columns) → ``kanken_radicals.jsonl``: the 214 部首 of the
漢検漢字辞典 classification. This does NOT match the Kangxi 214 radicals 1:1
despite the equal count: Kangxi ⼡ U+2F21 and ⼢ U+2F22 are merged (only U+2F21
appears) and ⺍ U+2E8D (つかんむり) is added. The upstream 漢検漢字辞典掲載順
(listing-order) column is dropped for the same arrangement-exposure reason as
the page column; file order is preserved.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any, Iterator


class ConvertError(ValueError):
    pass


DROPPED_COLUMN = "漢検漢字辞典掲載ページ"

KANJI_HEADER = (
    "漢検漢字辞典掲載ページ",
    "字種ID",
    "字項ID",
    "漢字テキスト",
    "漢字画像",
    "字体",
    "漢検級",
    "漢字ペディア",
    "新字体統合における例外",
    "漢字ペディアでの表示の例外",
    "編集に関する注記",
)

RADICAL_HEADER = ("漢検漢字辞典掲載順", "画数", "部首", "名称", "Unicode符号位置")

# Ordinal for sorting only — see module docstring.
KANKEN_RANK: dict[str, int] = {
    "10級": 1,
    "9級": 2,
    "8級": 3,
    "7級": 4,
    "6級": 5,
    "5級": 6,
    "4級": 7,
    "3級": 8,
    "準2級": 9,
    "2級": 10,
    "準1級": 11,
    "1/準1級": 12,  # slash literal from upstream, not nakaguro
    "1級": 13,
    "配当外": 14,
}


def _read_csv(path: str | Path, expected_header: tuple[str, ...]) -> Iterator[dict[str, str]]:
    with Path(path).open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = tuple(next(reader))
        if header != expected_header:
            raise ConvertError(
                f"{path}: unexpected header {header!r} — expected {expected_header!r}"
            )
        for i, row in enumerate(reader, 2):
            if len(row) != len(expected_header):
                raise ConvertError(f"{path}:{i}: {len(row)} fields, expected {len(expected_header)}")
            yield dict(zip(expected_header, row))


def convert_kanji(csv_path: str | Path) -> Iterator[dict[str, Any]]:
    for row in _read_csv(csv_path, KANJI_HEADER):
        level = row["漢検級"]
        if level not in KANKEN_RANK:
            raise ConvertError(f"{csv_path}: unknown 漢検級 {level!r} in row {row['字項ID']!r}")
        yield {
            "entry_id": row["字項ID"],
            "species_id": row["字種ID"],
            "glyph": row["漢字テキスト"],
            "glyph_image_url": row["漢字画像"],
            "form": row["字体"],
            "kanken_level": level,
            "kanken_rank": KANKEN_RANK[level],
            "kanjipedia_url": row["漢字ペディア"],
            "notes": {
                "shinjitai_integration_exception": row["新字体統合における例外"],
                "kanjipedia_display_exception": row["漢字ペディアでの表示の例外"],
                "editorial_note": row["編集に関する注記"],
            },
        }


def convert_radicals(csv_path: str | Path) -> Iterator[dict[str, Any]]:
    for row in _read_csv(csv_path, RADICAL_HEADER):
        yield {
            "radical": row["部首"],
            "name": row["名称"],
            "strokes": int(row["画数"]),
            "codepoint": row["Unicode符号位置"],
        }


def write_jsonl(rows: Iterator[dict[str, Any]], path: str | Path) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


def corpus_root() -> Path:
    # .../corpus/src/corpus/sources/kanji_data/convert.py -> .../corpus
    return Path(__file__).resolve().parents[4]


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    root = corpus_root()
    data_dir = Path(args[0]) if args else root / "data" / "kanji_data"
    out_dir = Path(args[1]) if len(args) > 1 else root / "datasets" / "kanji"
    n_kanji = write_jsonl(convert_kanji(data_dir / "kanken_kanji.csv"), out_dir / "kanken.jsonl")
    n_rad = write_jsonl(
        convert_radicals(data_dir / "kanken_radicals.csv"), out_dir / "kanken_radicals.jsonl"
    )
    print(f"kanken.jsonl: {n_kanji} rows; kanken_radicals.jsonl: {n_rad} rows -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
