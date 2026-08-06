"""ja.wikinews dump → CorpusRecord JSONL (streaming, deterministic).

Streaming parse: ``bz2.open`` + ``xml.etree.ElementTree.iterparse``; wikitext
→ plain text via mwparserfromhell. Output order is dump order (page id
ascending), so two runs over the same dump are byte-identical.

Empirical notes from the pinned 2026-08-04 dump build (all counts measured
on this machine before this module was finalised):

- 4,613 ns0 pages, of which 495 are ``<redirect>`` pages → 4,118 candidates.
  Other namespaces (ns 4 ×9,008, ns 14 ×8,845, ns 108 ×7,568, ns 10 ×965, …)
  are project/category/comment/template space and are skipped wholesale.
- Publish-state templates on ns0: 公開中 ×4,088, 自動アーカイブ済 ×3,492,
  アーカイブ済 ×595. No 査読中/執筆中 draft states exist anywhere in ns0
  (the wiki is frozen), so records are NOT filtered by state.
- Exclusions applied here, all counted in the run stats:
  * by title: メインページ and オールターナティブメインページ — portals,
    not articles (2 pages).
  * empty after extraction: pages whose ns0 content is entirely
    template/table markup — the 6 weather portals (…の天気), sports
    ranking/bracket pages (…ランキング, …出場校, …組み合わせ, all built as
    ``<onlyinclude>{{template}}</onlyinclude>``), and kin. These fall out
    naturally because no prose survives conversion; expected ≈16 pages.
- Date: ``{{日付|2005年7月16日}}`` heads 4,080 of 4,118 candidates. A few
  articles instead open with a literal ``【2012年8月24日】`` line (e.g.
  広島電鉄、値上げを検討). Final fallback is the revision timestamp — which
  in this dump is the LAST-EDIT date (archive-bot edits run into 2026), not
  the publication date; ``meta.date_source`` says which of the three applied.
- Categories come in three syntaxes, all harvested: ``[[Category:…]]``
  (case-insensitive; ~100 pages use lowercase ``[[category:…]]``),
  ``[[カテゴリ:…]]`` (~73 pages), and ``{{Category-N|c1|…|cN|sortkey}}``
  templates (N=3..9; the last positional argument is a sort key, not a
  category).
- Sections dropped as citation/navigation rather than article prose
  (empirical heading census: 出典 ×2,483, 情報源 ×1,593, 外部リンク ×277,
  関連記事 ×230, 関連ニュース ×192, 関連項目 ×139, 注釈 ×134, 脚注 ×24, …):
  see ``_EXCLUDED_HEADINGS`` / ``_EXCLUDED_HEADING_SUFFIXES``. Content
  sections (反応, 各地の震度, 被害…) are kept, including their heading text.
- Inline ``{{UTC|+9}}`` (790 pages) renders as ``UTC+9``; every other
  template produces no text (state markers, topic navboxes like 台風記事,
  {{Wikipediapar}}, image-licence tags…). ``<ref>``/``<references>``, tables,
  galleries and HTML comments are stripped; internal links unwrap to their
  display text; interlanguage links ([[en:…]] …) vanish.

Usage:
    python -m corpus.sources.wikinews.extract DUMP OUT.jsonl \
        [--stats stats.json] [--sample sample.jsonl] [--sample-size 5]

DUMP may be .xml.bz2 or plain .xml (test fixtures).
"""

from __future__ import annotations

import argparse
import bz2
import json
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any, Iterator

import mwparserfromhell as mwph
from mwparserfromhell.nodes import (
    Argument,
    Comment,
    ExternalLink,
    Heading,
    HTMLEntity,
    Tag,
    Template,
    Text,
    Wikilink,
)

from corpus.records import CorpusRecord, write_jsonl

from .fetch import DUMP_LAST_MODIFIED

SOURCE_NAME = "ja-wikinews"
ARTICLE_URL_BASE = "https://ja.wikinews.org/wiki/"

# Portal pages living in ns0 that are not articles (verified: exactly these).
_EXCLUDED_TITLES = {"メインページ", "オールターナティブメインページ"}

# Citation / navigation sections — dropped with their whole subtree.
_EXCLUDED_HEADINGS = {
    "出典",
    "情報源",
    "外部リンク",
    "関連項目",
    "注釈",
    "脚注",
    "参考資料",
    "参考文献",
    "資料",
    "外部資料",
    "外部サイト",
    "ギャラリー",
    "当選番号一覧",
}
_EXCLUDED_HEADING_SUFFIXES = ("関連記事", "関連ニュース", "関連リンク", "関連資料")

_DROP_LINK_PREFIXES = {
    "category",
    "カテゴリ",
    "file",
    "image",
    "media",
    "ファイル",
    "画像",
    "メディア",
}
_UNWRAP_LINK_PREFIXES = {
    "w",
    "wikipedia",
    "wikt",
    "wiktionary",
    "commons",
    "b",
    "q",
    "s",
    "n",
    "m",
    "v",
    "d",
    "voy",
    "meta",
}
_LANG_RE = re.compile(r"^[a-z]{2,3}(-[a-z]{2,10})?$")

_DROP_TAGS = {
    "ref",
    "references",
    "gallery",
    "timeline",
    "imagemap",
    "score",
    "pre",
    "syntaxhighlight",
    "source",
    "math",
}

_DATE_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日")
_INLINE_DATE_RE = re.compile(r"【\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日")
_CATEGORY_TMPL_RE = re.compile(r"^category-(\d+)$", re.IGNORECASE)
_MAGIC_WORD_RE = re.compile(r"__[A-Z]+__")
# A paragraph line must contain at least one CJK char, kana, or alphanumeric.
_HAS_CONTENT_RE = re.compile(r"[0-9A-Za-zぁ-ゖァ-ヶ一-鿿々〆ヵヶ]")
_RESIDUAL_MARKERS = ("{{", "[[", "<ref")


# ---------------------------------------------------------------- dump reader


@dataclass(frozen=True)
class RawPage:
    ns: str
    page_id: str
    title: str
    is_redirect: bool
    text: str
    revision_timestamp: str


def _open_dump(path: str | Path) -> IO[bytes]:
    path = Path(path)
    if path.suffix == ".bz2":
        return bz2.open(path, "rb")
    return path.open("rb")


def iter_pages(dump_path: str | Path) -> Iterator[RawPage]:
    """Stream every <page> of a MediaWiki export dump in file order."""
    with _open_dump(dump_path) as f:
        for _, elem in ET.iterparse(f, events=("end",)):
            if not elem.tag.endswith("}page"):
                continue
            ns_uri = elem.tag[: elem.tag.index("}") + 1]
            rev = elem.find(f"{ns_uri}revision")
            yield RawPage(
                ns=elem.findtext(f"{ns_uri}ns") or "",
                page_id=elem.findtext(f"{ns_uri}id") or "",
                title=elem.findtext(f"{ns_uri}title") or "",
                is_redirect=elem.find(f"{ns_uri}redirect") is not None,
                text=(rev.findtext(f"{ns_uri}text") if rev is not None else None) or "",
                revision_timestamp=(
                    rev.findtext(f"{ns_uri}timestamp") if rev is not None else None
                )
                or "",
            )
            elem.clear()


# ------------------------------------------------------- wikitext → plaintext


def _excluded_heading(title: str) -> bool:
    t = title.replace("　", " ").strip()
    return t in _EXCLUDED_HEADINGS or t.endswith(_EXCLUDED_HEADING_SUFFIXES)


def _render_wikilink(node: Wikilink) -> str:
    title = str(node.title).strip()
    if ":" in title:
        prefix = title.split(":", 1)[0].strip().lower()
        if prefix in _DROP_LINK_PREFIXES or _LANG_RE.match(prefix):
            return ""
    if node.text is not None:
        return _render(node.text.nodes)
    t = title
    while ":" in t and t.split(":", 1)[0].strip().lower() in _UNWRAP_LINK_PREFIXES:
        t = t.split(":", 1)[1]
    return t


def _render_template(node: Template) -> str:
    name = str(node.name).strip()
    if name.upper() == "UTC" and node.params:
        return f"UTC{str(node.params[0].value).strip()}"
    return ""


def _render_tag(node: Tag) -> str:
    tag = str(node.tag).strip().lower()
    if node.wiki_markup == "{|" or tag == "table":
        return ""
    if tag in _DROP_TAGS:
        return ""
    if tag == "br":
        return "\n"
    if node.contents is None:
        return ""
    return _render(node.contents.nodes)


def _render_node(node: Any) -> str:
    if isinstance(node, Text):
        return node.value
    if isinstance(node, (Comment, Argument)):
        return ""
    if isinstance(node, HTMLEntity):
        return node.normalize()
    if isinstance(node, Wikilink):
        return _render_wikilink(node)
    if isinstance(node, ExternalLink):
        return _render(node.title.nodes) if node.title is not None else ""
    if isinstance(node, Template):
        return _render_template(node)
    if isinstance(node, Tag):
        return _render_tag(node)
    if isinstance(node, Heading):  # heading nested inside a tag — rare
        return _render(node.title.nodes)
    return ""


def _render(nodes: Any) -> str:
    return "".join(_render_node(n) for n in nodes)


def _render_document(code: mwph.wikicode.Wikicode) -> str:
    """Render top-level nodes, dropping excluded sections wholesale."""
    out: list[str] = []
    skip_level: int | None = None
    for node in code.nodes:
        if isinstance(node, Heading):
            if skip_level is not None and node.level <= skip_level:
                skip_level = None
            if skip_level is None:
                title = _render(node.title.nodes).strip()
                if _excluded_heading(title):
                    skip_level = node.level
                else:
                    out.append(f"\n\n{title}\n\n")
            continue
        if skip_level is None:
            out.append(_render_node(node))
    return "".join(out)


def _paragraphs(rendered: str) -> list[str]:
    text = _MAGIC_WORD_RE.sub("", rendered)
    paragraphs: list[str] = []
    current: list[str] = []
    for raw_line in text.split("\n"):
        line = raw_line.strip().lstrip("*#:;").strip()
        if line and _HAS_CONTENT_RE.search(line):
            current.append(line)
        elif current:
            paragraphs.append("\n".join(current))
            current = []
    if current:
        paragraphs.append("\n".join(current))
    return paragraphs


def wikitext_to_paragraphs(wikitext: str) -> list[str]:
    """Convert article wikitext to plain-text paragraphs (may be empty)."""
    return _paragraphs(_render_document(mwph.parse(wikitext)))


# ------------------------------------------------------------------- metadata


def extract_date(
    code: mwph.wikicode.Wikicode, raw_text: str, revision_timestamp: str
) -> tuple[str, str]:
    """ISO date + which convention supplied it: 日付 | inline | revision."""
    for tmpl in code.filter_templates(recursive=True):
        if str(tmpl.name).strip() == "日付":
            if m := _DATE_RE.search(str(tmpl)):
                y, mo, d = (int(g) for g in m.groups())
                return f"{y:04d}-{mo:02d}-{d:02d}", "日付"
    if m := _INLINE_DATE_RE.search(raw_text[:2000]):
        y, mo, d = (int(g) for g in m.groups())
        return f"{y:04d}-{mo:02d}-{d:02d}", "inline"
    return revision_timestamp[:10], "revision"


def extract_categories(code: mwph.wikicode.Wikicode) -> list[str]:
    cats: list[str] = []

    def add(name: str) -> None:
        name = name.strip()
        if name and name not in cats:
            cats.append(name)

    for link in code.filter_wikilinks(recursive=True):
        title = str(link.title).strip()
        if ":" not in title:
            continue
        prefix, _, rest = title.partition(":")
        if prefix.strip().lower() in ("category", "カテゴリ"):
            add(rest.partition("|")[0])
    for tmpl in code.filter_templates(recursive=True):
        if m := _CATEGORY_TMPL_RE.match(str(tmpl.name).strip()):
            n = int(m.group(1))
            positional = [p for p in tmpl.params if not p.showkey]
            for p in positional[:n]:
                add(str(p.value))
    return cats


def article_url(title: str) -> str:
    return ARTICLE_URL_BASE + urllib.parse.quote(title.replace(" ", "_"), safe="")


# ------------------------------------------------------------------ extractor


@dataclass
class ExtractStats:
    pages_total: int = 0
    pages_ns0: int = 0
    redirects_skipped: int = 0
    other_ns_skipped: int = 0
    excluded_by_title: list[str] = field(default_factory=list)
    excluded_empty: list[str] = field(default_factory=list)
    date_source_counts: dict[str, int] = field(default_factory=dict)
    records: int = 0
    date_min: str = ""
    date_max: str = ""
    distinct_categories: int = 0
    residual_markup_records: int = 0
    residual_markup_ids: list[str] = field(default_factory=list)
    _categories: set[str] = field(default_factory=set, repr=False)

    def as_json(self) -> dict[str, Any]:
        return {
            "source": SOURCE_NAME,
            "dump_last_modified": DUMP_LAST_MODIFIED,
            "pages_total": self.pages_total,
            "pages_ns0": self.pages_ns0,
            "redirects_skipped": self.redirects_skipped,
            "other_ns_skipped": self.other_ns_skipped,
            "excluded_by_title": self.excluded_by_title,
            "excluded_empty": self.excluded_empty,
            "date_source_counts": dict(sorted(self.date_source_counts.items())),
            "records": self.records,
            "date_range": [self.date_min, self.date_max],
            "distinct_categories": self.distinct_categories,
            "residual_markup_records": self.residual_markup_records,
            "residual_markup_ids": self.residual_markup_ids,
        }


def extract_records(
    dump_path: str | Path, stats: ExtractStats | None = None
) -> Iterator[CorpusRecord]:
    stats = stats if stats is not None else ExtractStats()
    for page in iter_pages(dump_path):
        stats.pages_total += 1
        if page.ns != "0":
            stats.other_ns_skipped += 1
            continue
        stats.pages_ns0 += 1
        if page.is_redirect:
            stats.redirects_skipped += 1
            continue
        if page.title in _EXCLUDED_TITLES:
            stats.excluded_by_title.append(page.title)
            continue

        code = mwph.parse(page.text)
        paragraphs = _paragraphs(_render_document(code))
        if not paragraphs:
            stats.excluded_empty.append(page.title)
            continue

        date, date_source = extract_date(code, page.text, page.revision_timestamp)
        categories = extract_categories(code)
        text = "\n\n".join(paragraphs)

        record = CorpusRecord(
            id=f"wikinews:{page.page_id}",
            source=SOURCE_NAME,
            title=page.title,
            text=text,
            meta={
                "date": date,
                "date_source": date_source,
                "categories": categories,
                "url": article_url(page.title),
                "dump_last_modified": DUMP_LAST_MODIFIED,
            },
        )

        stats.records += 1
        stats.date_source_counts[date_source] = (
            stats.date_source_counts.get(date_source, 0) + 1
        )
        if date:
            stats.date_min = min(stats.date_min or date, date)
            stats.date_max = max(stats.date_max or date, date)
        stats._categories.update(categories)
        stats.distinct_categories = len(stats._categories)
        if any(marker in text for marker in _RESIDUAL_MARKERS):
            stats.residual_markup_records += 1
            if len(stats.residual_markup_ids) < 50:
                stats.residual_markup_ids.append(record.id)

        yield record


def _sample_indices(n: int, k: int) -> list[int]:
    if n <= k:
        return list(range(n))
    return sorted({round(i * (n - 1) / (k - 1)) for i in range(k)})


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("dump", help="pages-articles dump (.xml.bz2 or .xml)")
    ap.add_argument("out", help="output JSONL path")
    ap.add_argument("--stats", help="write run stats JSON here")
    ap.add_argument("--sample", help="write a small JSONL sample here")
    ap.add_argument("--sample-size", type=int, default=5)
    args = ap.parse_args(argv)

    stats = ExtractStats()
    records = list(extract_records(args.dump, stats))
    n = write_jsonl(records, args.out)
    print(
        f"{n} records → {args.out} "
        f"(empty-skipped={len(stats.excluded_empty)}, "
        f"residual-markup={stats.residual_markup_records})"
    )
    if args.stats:
        Path(args.stats).parent.mkdir(parents=True, exist_ok=True)
        Path(args.stats).write_text(
            json.dumps(stats.as_json(), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"stats → {args.stats}")
    if args.sample:
        sample = [records[i] for i in _sample_indices(len(records), args.sample_size)]
        write_jsonl(sample, args.sample)
        print(f"{len(sample)} sample records → {args.sample}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
