"""Raw ingestion record shared by every corpus source.

A ``CorpusRecord`` is one text as ingested, with the provenance name of the
asset it came from. It is deliberately NOT the app's atom/graph model — that
model is Wayfinder #35 and is undecided. Nothing here may grow node or edge
semantics; shaping into atoms happens after #35 is ratified.

Ruby stays in the Aozora convention ``｜漢字《かんじ》`` (Wayfinder #41: the
internal standard across sources). ``《《…》》`` is 傍点 (emphasis), never ruby.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator


class RecordError(ValueError):
    pass


@dataclass(frozen=True)
class CorpusRecord:
    id: str
    source: str
    title: str
    text: str
    meta: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.id:
            raise RecordError("record id must be non-empty")
        if not self.source:
            raise RecordError(f"{self.id}: source must be non-empty")
        if not self.text:
            raise RecordError(f"{self.id}: text must be non-empty")
        try:
            json.dumps(self.meta, ensure_ascii=False)
        except (TypeError, ValueError) as e:
            raise RecordError(f"{self.id}: meta is not JSON-serialisable: {e}") from None


def write_jsonl(records: Iterable[CorpusRecord], path: str | Path) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    n = 0
    with path.open("w", encoding="utf-8") as f:
        for rec in records:
            if rec.id in seen:
                raise RecordError(f"duplicate record id in one file: {rec.id}")
            seen.add(rec.id)
            f.write(json.dumps(asdict(rec), ensure_ascii=False) + "\n")
            n += 1
    return n


def read_jsonl(path: str | Path) -> Iterator[CorpusRecord]:
    with Path(path).open("r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as e:
                raise RecordError(f"{path}:{i}: invalid JSON: {e}") from None
            yield CorpusRecord(**raw)
