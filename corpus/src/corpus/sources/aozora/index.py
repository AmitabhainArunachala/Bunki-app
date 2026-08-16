"""青空文庫 extended index: fetch, NEL-safe parse, strict usable filter.

The index CSV (list_person_all_extended_utf8.csv) is the API to Aozora Bunko —
the full repo is 10+ GB and is never cloned. Known traps, all handled here:

- UTF-8 with BOM → open with ``utf-8-sig``.
- Fields may contain NEL (U+0085) and embedded CR/LF inside quotes. Records
  are split ONLY by the csv module over a ``newline=""`` stream; nothing in
  this module calls ``str.splitlines()``, which would split on NEL.
- One CSV row per (work, person): a translated work appears once per 役割.
  ``collect_works`` dedupes to one ``Work`` per 作品ID.

The usable filter is STRICT equality: 作品著作権フラグ == 'なし' AND
文字遣い種別 == '新字新仮名'. Never ``!= '旧字旧仮名'`` — that would admit
新字旧仮名 (e.g. most 宮沢賢治, including editions of 銀河鉄道の夜).
"""

from __future__ import annotations

import csv
import hashlib
import io
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

import yaml

from corpus.provenance import ProvenanceError

INDEX_ZIP = "list_person_all_extended_utf8.zip"
CSV_NAME = "list_person_all_extended_utf8.csv"

WORK_ID_COL = "作品ID"
TITLE_COL = "作品名"
SUBTITLE_COL = "副題"
KANA_COL = "文字遣い種別"
COPYRIGHT_COL = "作品著作権フラグ"
FIRST_PUBLISHED_COL = "初出"
RELEASED_COL = "公開日"
CARD_URL_COL = "図書カードURL"
TEXT_URL_COL = "テキストファイルURL"
ROLE_COL = "役割フラグ"
FAMILY_NAME_COL = "姓"
GIVEN_NAME_COL = "名"

SHINJI_SHINKANA = "新字新仮名"
PD_FLAG = "なし"
AUTHOR_ROLE = "著者"
TRANSLATOR_ROLE = "翻訳者"

AOZORA_HOST_PREFIX = "https://www.aozora.gr.jp/"


def _provenance() -> dict:
    path = Path(__file__).resolve().parent / "PROVENANCE.yml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def pinned_index_url(pin: str) -> str:
    return (
        f"https://github.com/aozorabunko/aozorabunko/raw/{pin}/index_pages/{INDEX_ZIP}"
    )


def fetch_index(
    dest_dir: str | Path,
    url: str | None = None,
    expected_sha256: str | None = None,
    timeout: int = 120,
) -> Path:
    """Download and extract the index CSV; returns the CSV path (cached).

    By default the zip is fetched at the ``upstream_pin`` commit recorded in
    PROVENANCE.yml (never a moving branch) and its sha256 is verified against
    the recorded ``artifact_sha256`` — a drifted or corrupted download raises
    ``ProvenanceError`` instead of silently entering the pipeline.
    """
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    csv_path = dest_dir / CSV_NAME
    if csv_path.exists():
        return csv_path
    if url is None or expected_sha256 is None:
        prov = _provenance()
        if url is None:
            url = pinned_index_url(prov["upstream_pin"])
        if expected_sha256 is None:
            expected_sha256 = prov["artifact_sha256"][INDEX_ZIP]
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        payload = resp.read()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != expected_sha256:
        raise ProvenanceError(
            f"{url}: downloaded sha256 {digest} does not match the recorded "
            f"artifact_sha256 {expected_sha256} — index drifted from the pin"
        )
    (dest_dir / INDEX_ZIP).write_bytes(payload)
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        csv_path.write_bytes(zf.read(CSV_NAME))
    return csv_path


def iter_rows(csv_path: str | Path) -> Iterator[dict[str, str]]:
    """Yield index rows. BOM-safe (utf-8-sig) and NEL-safe: the file is opened
    with ``newline=""`` so the csv module alone decides record boundaries —
    U+0085 inside a field stays inside the field."""
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def is_usable(row: dict[str, str]) -> bool:
    """Strict: public-domain flag AND exactly 新字新仮名."""
    return row.get(COPYRIGHT_COL) == PD_FLAG and row.get(KANA_COL) == SHINJI_SHINKANA


@dataclass(frozen=True)
class Work:
    work_id: str
    title: str
    subtitle: str
    kana_type: str
    copyright_flag: str
    card_url: str
    text_url: str
    first_published: str
    released: str
    authors: tuple[str, ...]
    translators: tuple[str, ...]

    @property
    def usable(self) -> bool:
        return self.copyright_flag == PD_FLAG and self.kana_type == SHINJI_SHINKANA


def _person(row: dict[str, str]) -> str:
    return (row.get(FAMILY_NAME_COL) or "") + (row.get(GIVEN_NAME_COL) or "")


def collect_works(rows: Iterable[dict[str, str]]) -> dict[str, Work]:
    """Group (work, person) rows into one Work per 作品ID, in index order."""
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        grouped.setdefault(row[WORK_ID_COL], []).append(row)
    works: dict[str, Work] = {}
    for work_id, group in grouped.items():
        head = group[0]
        works[work_id] = Work(
            work_id=work_id,
            title=head.get(TITLE_COL, ""),
            subtitle=head.get(SUBTITLE_COL, ""),
            kana_type=head.get(KANA_COL, ""),
            copyright_flag=head.get(COPYRIGHT_COL, ""),
            card_url=head.get(CARD_URL_COL, ""),
            text_url=head.get(TEXT_URL_COL, ""),
            first_published=head.get(FIRST_PUBLISHED_COL, ""),
            released=head.get(RELEASED_COL, ""),
            authors=tuple(_person(r) for r in group if r.get(ROLE_COL) == AUTHOR_ROLE),
            translators=tuple(
                _person(r) for r in group if r.get(ROLE_COL) == TRANSLATOR_ROLE
            ),
        )
    return works


def usable_works(works: dict[str, Work]) -> dict[str, Work]:
    return {wid: w for wid, w in works.items() if w.usable}


def github_raw_url(aozora_url: str, pin: str) -> str:
    """Map a www.aozora.gr.jp file URL onto the pinned GitHub mirror commit."""
    if not aozora_url.startswith(AOZORA_HOST_PREFIX):
        raise ValueError(f"not an aozora.gr.jp URL: {aozora_url!r}")
    tail = aozora_url[len(AOZORA_HOST_PREFIX):]
    return f"https://raw.githubusercontent.com/aozorabunko/aozorabunko/{pin}/{tail}"
