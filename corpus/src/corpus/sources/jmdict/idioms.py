"""JMdict idiom layer: entries whose senses carry yoji / proverb / id / quote.

One JSONL row per JMdict entry that has at least one idiom-tagged sense.
Glosses and part-of-speech come only from the tagged senses — an entry whose
first sense is an ordinary noun and whose second sense is the idiom
contributes only the idiom sense's glosses. ``misc_tags`` is the set of the
four idiom tags present anywhere in the entry, in canonical tag order.

Output is deterministic (sorted by numeric JMdict sequence, compact JSON) so
the committed dataset can be byte-compared against a fresh regeneration.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Iterator

from corpus.sources.jmdict import fetch

IDIOM_TAGS = ("yoji", "proverb", "id", "quote")

DATASET_PATH = Path(__file__).resolve().parents[4] / "datasets" / "jmdict_idioms" / "idioms.jsonl"


def _row(word: dict[str, Any]) -> dict[str, Any] | None:
    tagged = [s for s in word["sense"] if set(s.get("misc") or ()) & set(IDIOM_TAGS)]
    if not tagged:
        return None
    present = {t for s in word["sense"] for t in (s.get("misc") or ()) if t in IDIOM_TAGS}
    return {
        "jmdict_seq": word["id"],
        "kanji": [k["text"] for k in word.get("kanji") or ()],
        "kana": [k["text"] for k in word.get("kana") or ()],
        "glosses": [
            [g["text"] for g in s.get("gloss") or () if g.get("lang") == "eng"] for s in tagged
        ],
        "misc_tags": [t for t in IDIOM_TAGS if t in present],
        "pos": sorted({p for s in tagged for p in s.get("partOfSpeech") or ()}),
    }


def idiom_rows(words: Iterable[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    rows = (r for w in words if (r := _row(w)) is not None)
    yield from sorted(rows, key=lambda r: int(r["jmdict_seq"]))


def write_jsonl(rows: Iterable[dict[str, Any]], out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
    return n


def build(out_path: Path = DATASET_PATH, data_dir: Path = fetch.DATA_DIR) -> int:
    data = fetch.load_json(fetch.JMDICT_ASSET, data_dir)
    return write_jsonl(idiom_rows(data["words"]), out_path)


if __name__ == "__main__":
    print(f"{build()} idiom entries → {DATASET_PATH}")
