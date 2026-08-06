"""Ruby-preserving parser for 別冊「やさしい日本語 書き換え例」 (ISA/文化庁 2020).

The 別冊 is a numbered glossary (1..134) of administrative vocabulary, laid out
as a 3-column table (番号 / 語彙 / 意味) with furigana printed as separate
small-font glyphs above the base kanji. pdfplumber gives char-level boxes:
body text is 9.6pt, ruby is 4.8pt, sitting ~6.4pt above its base line. This
module reconstructs the ruby into the corpus-internal Aozora convention
``｜漢字《かんじ》`` (see corpus.records).

Reconstruction pipeline, per table cell:

1. split chars into ruby (size < RUBY_MAX_SIZE) and base;
2. cluster each set into visual lines by ``top``;
3. attach each ruby line to the base line just below it;
4. split a ruby line into runs at horizontal gaps;
5. map each run to the base chars it overlaps horizontally, trim
   non-rubyable edge chars (okurigana caught by ruby overhang);
6. emit the annotated line and verify that stripping the markup reproduces
   the raw base text exactly (any mutation is recorded as an artifact).

Everything suspicious is counted, never silently dropped: orphan ruby lines /
runs, ruby over non-kanji, kana inside an annotated span, overlapping spans.
The honest coverage numbers live in the stats dict returned by parse_pdf and
are committed as samples/yasashii/stats.json.

Layout facts this parser relies on (verified against the 2020-08 PDF, sha256
pinned in fetch.py): pages 3..17 carry one entry table each; row 0 is a
gojūon section marker, row 1 the column header, every other row one numbered
entry. Per-entry section membership is NOT printed in the document (markers
appear only at page tops while sections change mid-page), so meta carries no
section field — only entry_no, page, and the ruby-derived reading.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from corpus.records import CorpusRecord, write_jsonl

from .fetch import DATA_DIR, PINNED

SOURCE_NAME = "isa-yasashii-glossary"
EXPECTED_ENTRIES = 134  # highest 番号 printed in the 別冊

RUBY_MAX_SIZE = 6.0  # pt; ruby is 4.8, body 9.6, smallest non-ruby text 7.66
LINE_TOP_TOL = 3.0  # chars within this vertical distance share a line
RUBY_RUN_GAP = 4.0  # x-gap splitting one ruby line into separate readings
RUBY_BASE_MIN = 3.0  # ruby line sits 3..12pt above its base line's top
RUBY_BASE_MAX = 12.0
MIN_OVERLAP = 0.3  # pt of x-overlap for a base char to belong to a ruby run

_RUBYABLE = re.compile(r"[㐀-䶿一-鿿々〆ヵヶ]")
_MARKUP = re.compile(r"《[^《》]*》|｜")


def strip_ruby(text: str) -> str:
    """Remove ｜…《…》 markup, leaving the base text."""
    return _MARKUP.sub("", text)


@dataclass
class CellResult:
    text: str
    readings: list[str] = field(default_factory=list)  # ruby runs, reading order
    ruby_runs: int = 0
    artifacts: list[str] = field(default_factory=list)


@dataclass
class Entry:
    entry_no: int
    page: int
    headword: str  # plain 語彙, markup stripped
    headword_ruby: str  # 語彙 with ｜…《…》 markup
    text: str  # 意味 with ｜…《…》 markup
    reading: str  # concatenated headword ruby runs
    ruby_runs: int = 0
    artifacts: list[str] = field(default_factory=list)


def _cluster_lines(chars: list[dict]) -> list[list[dict]]:
    """Group chars into visual lines by ``top``; lines sorted top→bottom,
    chars left→right."""
    lines: list[list[dict]] = []
    for c in sorted(chars, key=lambda c: (c["top"], c["x0"])):
        if lines and abs(c["top"] - lines[-1][0]["top"]) <= LINE_TOP_TOL:
            lines[-1].append(c)
        else:
            lines.append([c])
    for line in lines:
        line.sort(key=lambda c: c["x0"])
    return lines


def _split_runs(ruby_line: list[dict]) -> list[list[dict]]:
    runs: list[list[dict]] = []
    for c in ruby_line:
        if runs and c["x0"] - runs[-1][-1]["x1"] <= RUBY_RUN_GAP:
            runs[-1].append(c)
        else:
            runs.append([c])
    return runs


def _base_span(base: list[dict], run: list[dict]) -> tuple[int, int] | None:
    """Index span [start, end] of base chars overlapped by the ruby run,
    trimmed to rubyable (kanji-like) edges. None if no overlap at all."""
    rx0, rx1 = run[0]["x0"], run[-1]["x1"]
    hit = [
        i
        for i, c in enumerate(base)
        if min(c["x1"], rx1) - max(c["x0"], rx0) > MIN_OVERLAP
    ]
    if not hit:
        return None
    start, end = hit[0], hit[-1]
    while start <= end and not _RUBYABLE.match(base[start]["text"]):
        start += 1
    while end >= start and not _RUBYABLE.match(base[end]["text"]):
        end -= 1
    if start > end:  # ruby over non-kanji text; keep the raw overlap
        return hit[0], hit[-1]
    return start, end


def _split_merged_span(
    base: list[dict], run: list[dict], start: int, end: int
) -> list[tuple[int, int, str]] | None:
    """A span like 働く人 with merged ruby はたらひと: split the base into
    kanji sub-runs and partition the ruby chars to the sub-run each sits
    above. None when the partition is not clean (caller flags an artifact)."""
    sub_runs: list[tuple[int, int]] = []
    i = start
    while i <= end:
        if _RUBYABLE.match(base[i]["text"]):
            j = i
            while j + 1 <= end and _RUBYABLE.match(base[j + 1]["text"]):
                j += 1
            sub_runs.append((i, j))
            i = j + 1
        else:
            i += 1
    if len(sub_runs) < 2:
        return None

    def centre(c: dict) -> float:
        return (c["x0"] + c["x1"]) / 2

    buckets: list[list[dict]] = [[] for _ in sub_runs]
    for c in run:
        dist = [
            abs(centre(c) - (base[s]["x0"] + base[e]["x1"]) / 2)
            for s, e in sub_runs
        ]
        buckets[dist.index(min(dist))].append(c)

    if any(not b for b in buckets):
        return None
    flat = [c for b in buckets for c in b]
    if [c["x0"] for c in flat] != sorted(c["x0"] for c in run):
        return None  # partition reordered the ruby — not clean
    return [
        (s, e, "".join(c["text"] for c in b))
        for (s, e), b in zip(sub_runs, buckets)
    ]


def _annotate_line(
    base: list[dict], ruby_line: list[dict], result: CellResult
) -> str:
    """One visual line: weave ruby runs into ｜base《ruby》 markup."""
    spans: list[tuple[int, int, str]] = []
    for run in _split_runs(ruby_line):
        reading = "".join(c["text"] for c in run)
        span = _base_span(base, run)
        if span is None:
            result.artifacts.append(f"orphan_ruby_run:{reading}")
            continue
        start, end = span
        chunk = "".join(c["text"] for c in base[start : end + 1])
        pieces: list[tuple[int, int, str]] | None = None
        if not _RUBYABLE.match(base[start]["text"]):
            result.artifacts.append(f"ruby_over_nonkanji:{chunk}:{reading}")
        elif any(not _RUBYABLE.match(c["text"]) for c in base[start : end + 1]):
            pieces = _split_merged_span(base, run, start, end)
            if pieces is None:
                result.artifacts.append(f"kana_inside_span:{chunk}:{reading}")
        if pieces is None:
            pieces = [(start, end, reading)]
        for start, end, reading in pieces:
            if spans and start <= spans[-1][1]:
                prev = spans.pop()
                result.artifacts.append(f"overlapping_spans:{prev[2]}+{reading}")
                spans.append((prev[0], max(prev[1], end), prev[2] + reading))
            else:
                spans.append((start, end, reading))
            result.ruby_runs += 1
            result.readings.append(reading)

    out: list[str] = []
    by_start = {s: (e, r) for s, e, r in spans}
    i = 0
    while i < len(base):
        if i in by_start:
            e, r = by_start[i]
            out.append("｜" + "".join(c["text"] for c in base[i : e + 1]) + f"《{r}》")
            i = e + 1
        else:
            out.append(base[i]["text"])
            i += 1
    return "".join(out)


def reconstruct_cell(chars: Iterable[dict]) -> CellResult:
    """Rebuild a table cell's text with inline ruby from raw char boxes."""
    chars = list(chars)
    ruby = [c for c in chars if c["size"] < RUBY_MAX_SIZE]
    base = [c for c in chars if c["size"] >= RUBY_MAX_SIZE]
    result = CellResult(text="")

    base_lines = _cluster_lines(base)
    ruby_lines = _cluster_lines(ruby)

    attached: dict[int, list[dict]] = {}
    for rl in ruby_lines:
        r_top = rl[0]["top"]
        candidates = [
            (bl[0]["top"] - r_top, i)
            for i, bl in enumerate(base_lines)
            if RUBY_BASE_MIN <= bl[0]["top"] - r_top <= RUBY_BASE_MAX
        ]
        if not candidates:
            reading = "".join(c["text"] for c in rl)
            result.artifacts.append(f"orphan_ruby_line:{reading}")
            continue
        attached.setdefault(min(candidates)[1], []).extend(rl)

    parts: list[str] = []
    for i, bl in enumerate(base_lines):
        rl = sorted(attached.get(i, []), key=lambda c: c["x0"])
        annotated = _annotate_line(bl, rl, result)
        raw = "".join(c["text"] for c in bl)
        if strip_ruby(annotated) != raw:
            result.artifacts.append(f"text_mutation:{raw}")
            annotated = raw
        parts.append(annotated)
    result.text = "".join(parts)
    return result


def _cell_chars(page_chars: list[dict], bbox: tuple[float, float, float, float]) -> list[dict]:
    x0, top, x1, bottom = bbox
    return [
        c
        for c in page_chars
        if x0 <= (c["x0"] + c["x1"]) / 2 <= x1 and top <= (c["top"] + c["bottom"]) / 2 <= bottom
    ]


def parse_number_cell(chars: list[dict]) -> int | None:
    """番号 cell → entry number; None for header / section-marker rows."""
    text = "".join(c["text"] for c in sorted(chars, key=lambda c: (c["top"], c["x0"])))
    m = re.fullmatch(r"\s*(\d+)\s*", text)
    return int(m.group(1)) if m else None


def parse_pdf(pdf_path: Path) -> tuple[list[Entry], dict[str, Any]]:
    import pdfplumber

    entries: list[Entry] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_chars = page.chars
            for table in page.find_tables():
                for row in table.rows:
                    cells = row.cells
                    if len(cells) != 3 or any(c is None for c in cells):
                        continue
                    no = parse_number_cell(_cell_chars(page_chars, cells[0]))
                    if no is None:
                        continue
                    head = reconstruct_cell(_cell_chars(page_chars, cells[1]))
                    body = reconstruct_cell(_cell_chars(page_chars, cells[2]))
                    entries.append(
                        Entry(
                            entry_no=no,
                            page=page.page_number,
                            headword=strip_ruby(head.text),
                            headword_ruby=head.text,
                            text=body.text,
                            reading="".join(head.readings),
                            ruby_runs=head.ruby_runs + body.ruby_runs,
                            artifacts=head.artifacts + body.artifacts,
                        )
                    )
    entries.sort(key=lambda e: e.entry_no)
    return entries, _stats(entries)


def _stats(entries: list[Entry]) -> dict[str, Any]:
    numbers = [e.entry_no for e in entries]
    missing = sorted(set(range(1, EXPECTED_ENTRIES + 1)) - set(numbers))
    dupes = sorted({n for n in numbers if numbers.count(n) > 1})
    with_ruby = sum(1 for e in entries if e.ruby_runs > 0)
    with_artifacts = sum(1 for e in entries if e.artifacts)
    kinds: dict[str, int] = {}
    for e in entries:
        for a in e.artifacts:
            kind = a.split(":", 1)[0]
            kinds[kind] = kinds.get(kind, 0) + 1
    n = len(entries)
    return {
        "expected_entries": EXPECTED_ENTRIES,
        "entries_extracted": n,
        "missing_entry_numbers": missing,
        "duplicate_entry_numbers": dupes,
        "entries_with_ruby": with_ruby,
        "pct_entries_with_ruby": round(100.0 * with_ruby / n, 2) if n else 0.0,
        "entries_with_artifacts": with_artifacts,
        "pct_entries_with_artifacts": round(100.0 * with_artifacts / n, 2) if n else 0.0,
        "artifact_kinds": dict(sorted(kinds.items())),
        "total_ruby_runs": sum(e.ruby_runs for e in entries),
    }


def to_records(entries: Iterable[Entry]) -> list[CorpusRecord]:
    return [
        CorpusRecord(
            id=f"yasashii:{e.entry_no}",
            source=SOURCE_NAME,
            title=e.headword,
            text=e.text,
            meta={
                "entry_no": e.entry_no,
                "page": e.page,
                "reading": e.reading,
                "headword_ruby": e.headword_ruby,
            },
        )
        for e in entries
    ]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pdf", type=Path, default=DATA_DIR / "bessatsu_kakikaerei.pdf")
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parents[4] / "samples" / "yasashii",
    )
    ap.add_argument("--sample-size", type=int, default=10)
    ap.add_argument("--entry", type=int, help="print one entry and exit")
    ap.add_argument("--full", type=Path, help="also write the full JSONL here")
    args = ap.parse_args(argv)

    entries, stats = parse_pdf(args.pdf)

    if args.entry is not None:
        for e in entries:
            if e.entry_no == args.entry:
                print(json.dumps(e.__dict__, ensure_ascii=False, indent=2))
                return 0
        print(f"entry {args.entry} not found", file=sys.stderr)
        return 1

    records = to_records(entries)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_jsonl(records[: args.sample_size], args.out_dir / "sample.jsonl")
    stats["pdf_sha256"] = PINNED["bessatsu_kakikaerei.pdf"][1]
    (args.out_dir / "stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if args.full:
        write_jsonl(records, args.full)
    print(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
