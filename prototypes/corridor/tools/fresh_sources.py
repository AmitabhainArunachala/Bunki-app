"""Live adapters for fresh, legally reusable Japanese text — feed_fresh.py's sources.

Every adapter fetches NOW and returns dated items carrying the exact text that
will be minted, plus the rights evidence it relied on. Nothing is minted here;
feed_fresh.py routes every item through build_articles like the rest of the
shelf.

Sources and the terms each one was checked against (the check is repeated on
every run — a terms page that no longer names the licence stops that source):

  government pages under 公共データ利用規約（第1.0版）(PDL1.0), the Digital
  Agency's 2024-07-05 successor of 政府標準利用規約（第2.0版）. PDL1.0 section 1.7
  states compatibility with CC BY 4.0. Pool: proprietary_safe.
    kantei      首相官邸 — 総理の一日 / 長官 pages from the news RDF
                terms https://www.kantei.go.jp/jp/terms.html
    govonline   政府広報オンライン — TV/radio programme articles
                terms https://www.gov-online.go.jp/tos/
    mhlw        厚生労働省 — 報道発表 pages from the news RDF
                terms https://www.mhlw.go.jp/chosakuken/index.html
    mext        文部科学省 — 報道発表 pages from the news RDF
                terms https://www.mext.go.jp/b_menu/1351168.htm
    sports      スポーツ庁 — 報道発表 pages; its terms page defers to the
                文部科学省ウェブサイト利用規約 above
                terms https://www.mext.go.jp/sports/b_menu/about_link.htm
    env         環境省 — 報道発表 pages from the dated press list
                terms https://www.env.go.jp/mail.html

  Japanese Wikipedia (CC BY-SA 4.0, MediaWiki API, descriptive User-Agent).
  Pool: share_alike. Text is taken from the revision that was current 24 hours
  before the run (fresh vandalism is usually reverted inside that window) and
  refused if it carries a vandalism marker.
    jawiki-news  Portal:最近の出来事 — one digest per week of the portal's own
                 dated one-line summaries (事件・事故・訃報 lines left out —
                 feed-approval rubric T1)
    jawiki       the lead of articles those summaries link to, when that
                 article was revised inside the window

  Publisher full readers already in @bunki/feed (Global Voices 日本語 CC BY 3.0,
  国立天文台 ALMA CC BY 4.0) — driven through tools/fresh-publisher-read.mjs,
  which runs the unmodified shared reader; its link fallbacks are reported,
  never worked around. Pool: proprietary_safe.

NHK and newspapers are never fetched here: reachable is not licensable.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

JST = timezone(timedelta(hours=9))
REPO_URL = "https://github.com/AmitabhainArunachala/Bunki-app"
# Descriptive and honest; government hosts refuse urllib's default agent.
USER_AGENT = f"Mozilla/5.0 (compatible; BunkiFreshShelf/0.1; +{REPO_URL})"
WIKI_USER_AGENT = f"BunkiFreshShelf/0.1 ({REPO_URL}; Japanese reading-shelf refresh) python-urllib"
PDL_URL = "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0"
PDL_LICENCE = "PDL1.0 (CC BY 4.0 互換)"
CC_BY_SA_URL = "https://creativecommons.org/licenses/by-sa/4.0/deed.ja"
HERE = Path(__file__).resolve().parent


# ---------------------------------------------------------------- sources
@dataclass(frozen=True)
class Source:
    key: str
    name: str  # the shelf's `source` value
    label: str  # 出典 label shown on cards
    publisher: str  # as the terms page asks it to be credited
    pool: str
    licence: str
    licence_url: str
    terms_url: str
    terms_pattern: str  # must match the live terms page text


SOURCES: dict[str, Source] = {
    s.key: s
    for s in [
        Source("kantei", "kantei.go.jp", "首相官邸", "首相官邸ホームページ", "proprietary_safe", PDL_LICENCE, PDL_URL,
               "https://www.kantei.go.jp/jp/terms.html", r"公共データ利用規約（第1\.0版）"),
        Source("govonline", "gov-online.go.jp", "政府広報オンライン", "政府広報オンライン", "proprietary_safe", PDL_LICENCE, PDL_URL,
               "https://www.gov-online.go.jp/tos/", r"公共データ利用規約（第1\.0版）"),
        Source("mhlw", "mhlw.go.jp", "厚生労働省", "厚生労働省ホームページ", "proprietary_safe", PDL_LICENCE, PDL_URL,
               "https://www.mhlw.go.jp/chosakuken/index.html", r"公共データ利用規約（第1\.0版）"),
        Source("mext", "mext.go.jp", "文部科学省", "文部科学省ホームページ", "proprietary_safe", PDL_LICENCE, PDL_URL,
               "https://www.mext.go.jp/b_menu/1351168.htm", r"公共データ利用規約（第1\.0版）"),
        Source("sports", "mext.go.jp/sports", "スポーツ庁", "スポーツ庁ホームページ", "proprietary_safe", PDL_LICENCE, PDL_URL,
               "https://www.mext.go.jp/sports/b_menu/about_link.htm", r"文部科学省ウェブサイト利用規約」に従って"),
        Source("env", "env.go.jp", "環境省", "環境省ホームページ", "proprietary_safe", PDL_LICENCE, PDL_URL,
               "https://www.env.go.jp/mail.html", r"公共データ利用規約（第1\.0版）"),
        Source("jawiki-news", "ja.wikipedia", "ウィキペディア 最近の出来事", "ウィキペディア日本語版", "share_alike",
               "CC BY-SA 4.0", CC_BY_SA_URL, "https://ja.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=rightsinfo&format=json",
               r"Attribution-Share ?Alike 4\.0|by-sa/4\.0"),
        Source("jawiki", "ja.wikipedia", "ウィキペディア", "ウィキペディア日本語版", "share_alike",
               "CC BY-SA 4.0", CC_BY_SA_URL, "https://ja.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=rightsinfo&format=json",
               r"Attribution-Share ?Alike 4\.0|by-sa/4\.0"),
        Source("global-voices", "jp.globalvoices.org", "Global Voices 日本語", "Global Voices", "proprietary_safe",
               "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/",
               "https://jp.globalvoices.org/about/%E8%A8%98%E4%BA%8B%E3%81%AE%E8%BB%A2%E8%BC%89%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6/",
               r"クリエイティブ・コモンズ|Creative Commons|CC BY"),
        Source("alma-ja", "alma-telescope.jp", "国立天文台 アルマ望遠鏡", "国立天文台", "proprietary_safe",
               "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/", "https://alma-telescope.jp/policy/",
               r"クリエイティブ・コモンズ|CC BY"),
    ]
}


# ---------------------------------------------------------------- network
@dataclass
class Response:
    url: str
    status: int
    content_type: str
    body: bytes

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.body).hexdigest()

    def text(self) -> str:
        m = re.search(r"charset=([\w-]+)", self.content_type, re.I)
        enc = m.group(1) if m else None
        if not enc:
            head = self.body[:4000]
            m = re.search(rb"<\?xml[^>]*encoding=[\"']([\w-]+)", head) or re.search(
                rb"<meta[^>]+charset=[\"']?([\w-]+)", head, re.I
            )
            enc = m.group(1).decode("ascii") if m else "utf-8"
        return self.body.decode(enc, errors="replace")


_last_hit: dict[str, float] = {}


def http_get(url: str, *, agent: str = USER_AGENT, timeout: float = 25.0, retries: int = 2) -> Response:
    """One polite GET: a pause between requests to the same host, two retries
    on transient failures, and the final URL after redirects."""
    host = urllib.parse.urlsplit(url).hostname or ""
    wait = 0.6 - (time.monotonic() - _last_hit.get(host, 0.0))
    if wait > 0:
        time.sleep(wait)
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": agent, "Accept-Language": "ja"})
            with urllib.request.urlopen(request, timeout=timeout) as res:
                body = res.read()
                _last_hit[host] = time.monotonic()
                return Response(res.geturl(), res.status, res.headers.get("Content-Type", ""), body)
        except urllib.error.HTTPError as err:
            _last_hit[host] = time.monotonic()
            if err.code in (403, 404, 410):
                raise
            last_error = err
        except Exception as err:  # noqa: BLE001 — transient network failure
            last_error = err
        time.sleep(1.5 * (attempt + 1))
    raise last_error  # type: ignore[misc]


def verify_terms(source: Source) -> dict:
    """Open the source's terms page now and confirm it still names the licence.
    The returned evidence rides in every run log."""
    checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        agent = WIKI_USER_AGENT if source.key.startswith("jawiki") else USER_AGENT
        res = http_get(source.terms_url, agent=agent)
        text = plain_text(res.text())
        m = re.search(source.terms_pattern, text)
        return {
            "source": source.key,
            "termsUrl": source.terms_url,
            "licence": source.licence,
            "licenceUrl": source.licence_url,
            "checkedAt": checked_at,
            "termsSha256": res.sha256,
            "matched": text[max(0, m.start() - 60) : m.end() + 60].strip() if m else None,
            "ok": bool(m),
        }
    except Exception as err:  # noqa: BLE001
        return {"source": source.key, "termsUrl": source.terms_url, "checkedAt": checked_at, "ok": False,
                "error": f"{type(err).__name__}: {err}"}


# ---------------------------------------------------------------- tolerant HTML tree
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
BLOCK_OPENERS = {"p", "div", "ul", "ol", "table", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "dl", "blockquote"}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag: str, attrs=None, parent: "Node | None" = None):
        self.tag = tag
        self.attrs = {k: (v or "") for k, v in (attrs or [])}
        self.children: list = []
        self.parent = parent

    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())

    def iter(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.iter()

    def text(self) -> str:
        return "".join(c if isinstance(c, str) else c.text() for c in self.children)

    def find_all(self, tag: str | None = None, cls: str | None = None, id_: str | None = None) -> list["Node"]:
        return [
            n
            for n in self.iter()
            if (tag is None or n.tag == tag)
            and (cls is None or cls in n.classes())
            and (id_ is None or n.attrs.get("id") == id_)
        ]

    def find(self, tag: str | None = None, cls: str | None = None, id_: str | None = None) -> "Node | None":
        found = self.find_all(tag, cls, id_)
        return found[0] if found else None

    def remove(self) -> None:
        if self.parent is not None:
            self.parent.children = [c for c in self.parent.children if c is not self]


class _Builder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in BLOCK_OPENERS and self.stack[-1].tag == "p":
            self.stack.pop()
        if tag in ("li", "dt", "dd", "tr", "td", "th"):
            siblings = {"li": {"li"}, "dt": {"dt", "dd"}, "dd": {"dt", "dd"}, "tr": {"tr"}, "td": {"td", "th"}, "th": {"td", "th"}}[tag]
            barriers = {"td": {"tr", "table"}, "th": {"tr", "table"}}.get(tag, {"ul", "ol", "dl", "table", "tbody", "thead"})
            for i in range(len(self.stack) - 1, 0, -1):
                if self.stack[i].tag in siblings:
                    del self.stack[i:]
                    break
                if self.stack[i].tag in barriers:
                    break
        node = Node(tag, attrs, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag.lower(), attrs, self.stack[-1]))

    def handle_endtag(self, tag):
        tag = tag.lower()
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse_html(html: str) -> Node:
    builder = _Builder()
    builder.feed(html)
    builder.close()
    return builder.root


# ---------------------------------------------------------------- text shaping
SKIP_TAGS = {"script", "style", "noscript", "nav", "aside", "footer", "header", "form", "button", "figure",
             "figcaption", "img", "svg", "iframe", "video", "audio", "select", "template", "input", "label",
             "picture", "source", "object", "map"}
BLOCK_TAGS = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "dd", "dt", "section", "article", "blockquote",
              "ul", "ol", "dl", "table", "tbody", "thead", "main", "caption", "pre", "address"}
_CJK = r"[　-ヿ㐀-鿿豈-﫿＀-￯]"


def normalize(text: str) -> str:
    text = text.replace("\xa0", " ").replace("\u200b", "").replace("\ufeff", "")
    text = re.sub(r"[ \t\r\n\f\v]+", " ", text)
    # HTML source line breaks between Japanese characters are not spaces
    text = re.sub(rf"(?<={_CJK}) (?={_CJK})", "", text)
    return text.strip(" 　")


def block_lines(node: Node, skip: set[str] | frozenset[str] = frozenset(SKIP_TAGS)) -> list[str]:
    """Paragraph-shaped lines: every block element and <br> ends a line; a table
    row becomes one line of its cells in document order. Nothing is invented."""
    out: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        line = normalize("".join(buf))
        buf.clear()
        if line:
            out.append(line)

    def walk(n: Node) -> None:
        for child in n.children:
            if isinstance(child, str):
                buf.append(child)
                continue
            if (child.tag in skip or "hidden" in child.attrs or child.attrs.get("aria-hidden") == "true"
                    or re.search(r"display\s*:\s*none", child.attrs.get("style", ""))):
                continue
            if child.tag == "br":
                flush()
            elif child.tag == "tr":
                flush()
                cells = [normalize(" ".join(block_lines(c, skip))) for c in child.children if isinstance(c, Node) and c.tag in ("td", "th")]
                line = "　".join(c for c in cells if c)
                if line:
                    out.append(line)
            elif child.tag in BLOCK_TAGS:
                flush()
                walk(child)
                flush()
            else:
                walk(child)

    walk(node)
    flush()
    return out


def plain_text(html: str) -> str:
    root = parse_html(html)
    body = root.find("body") or root
    return "\n".join(block_lines(body))


BOILERPLATE = [
    re.compile(p)
    for p in (
        r"^PDFファイルを見るため", r"^Adobe", r"^このページを印刷", r"^ページの先頭", r"^シェアする$", r"^#",
        r"^URLをコピーしました", r"^ミニプレーヤー", r"^動画(が再生できない|ファイル)", r"^閉じる$", r"^（政府広報オンライン）$",
        r"^こちら$", r"^関連リンク$", r"^新着記事$", r"^To English$",
    )
]


def clean_lines(lines: list[str], stop: list[str] | tuple = ()) -> list[str]:
    kept: list[str] = []
    for line in lines:
        if any(line.startswith(marker) for marker in stop):
            break
        if any(p.search(line) for p in BOILERPLATE) or re.fullmatch(r"https?://\S+", line):
            continue
        kept.append(line)
    return kept


SENTENCE_END = "。！？!?」』）)】］]：:"
LIST_START = re.compile(r"^([（(【［\[＜<■●○◆◇・※＊*]|[0-9０-９一二三四五六七八九十]+[．.、）)　 ]|[ア-ン][．.、）)]|第)")


def rejoin_wrapped(lines: list[str]) -> list[str]:
    """Undo hard line wrapping (a <br> every ~40 characters inside one
    sentence): a long line that stops mid-sentence continues on the next
    line unless that line opens a new item. Only line breaks are removed."""
    out: list[str] = []
    for line in lines:
        if out and len(out[-1]) >= 30 and out[-1][-1] not in SENTENCE_END and not LIST_START.match(line):
            out[-1] += line
        else:
            out.append(line)
    return out


# an attachment link line: 「…（PDF:401KB）」「…［PDF形式：261KB］」「…[PDF 146KB]」「…［48KB］」
PDF_LINK_RE = re.compile(r"[（(［\[](?:PDF|ＰＤＦ)?(?:形式)?[:：]?\s*[\d.,]+\s*[KMG]?B[）)］\]]", re.I)
URL_LINE_RE = re.compile(r"^[（(]?https?://\S+[）)]?$")


def page_day(root: Node, title: str) -> date | None:
    """The page's own date line: the date written closest to its title."""
    body = root.find("body") or root
    # article headers (category · date · title) often sit in <header>
    text = "\n".join(block_lines(body, SKIP_TAGS - {"header"}))
    at = text.find(title) if title else -1
    if at < 0:
        return None
    window = text[max(0, at - 400) : at]
    before = list(re.finditer(r"(20\d\d)年\s*\d{1,2}月\s*\d{1,2}日|令和\s*(\d{1,2}|元)年\s*\d{1,2}月\s*\d{1,2}日", window))
    after = re.search(r"(20\d\d)年\s*\d{1,2}月\s*\d{1,2}日|令和\s*(\d{1,2}|元)年\s*\d{1,2}月\s*\d{1,2}日", text[at : at + len(title) + 300])
    candidates = []
    if before:
        candidates.append((len(window) - before[-1].end(), before[-1].group(0)))
    if after:
        candidates.append((after.start() - len(title), after.group(0)))
    if not candidates:
        return None
    return jp_date(min(candidates)[1])


def trim_paragraphs(paras: list[str], cap: int) -> tuple[list[str], dict | None]:
    """Keep whole paragraphs up to `cap` characters. A first paragraph that is
    itself longer is cut after its last full sentence under the cap. Returns
    the excerpt record the attribution names, or None when nothing was cut."""
    total = sum(len(p) for p in paras)
    if total <= cap:
        return paras, None
    kept: list[str] = []
    size = 0
    for para in paras:
        if size + len(para) > cap:
            if not kept:
                cut = para[:cap]
                end = cut.rfind("。")
                kept.append(cut[: end + 1] if end > 0 else cut)
            break
        kept.append(para)
        size += len(para)
    return kept, {"keptChars": sum(len(p) for p in kept), "sourceChars": total, "rule": "whole paragraphs from the top"}


# ---------------------------------------------------------------- item + gates
@dataclass
class Item:
    id: str
    source: str  # Source.key
    title: str
    paragraphs: list[str]
    url: str
    date: str  # YYYY-MM-DD, JST
    published_at: str
    fetched_at: str
    content_sha256: str = ""
    response_sha256: str = ""
    excerpt: dict | None = None
    attribution: str = ""
    credits: dict = field(default_factory=dict)

    @property
    def text(self) -> str:
        return "\n".join(self.paragraphs)

    def record(self) -> dict:
        s = SOURCES[self.source]
        return {
            "id": self.id,
            "source": s.name,
            "sourceKey": s.key,
            "title": self.title,
            "text": self.text,
            "url": self.url,
            "date": self.date,
            "publishedAt": self.published_at,
            "fetchedAt": self.fetched_at,
            "pool": s.pool,
            "licence": s.licence,
            "licenceUrl": s.licence_url,
            "termsUrl": s.terms_url,
            "attribution": self.attribution,
            "excerpt": self.excerpt,
            "credits": self.credits,
            "responseSha256": self.response_sha256,
            "contentSha256": hashlib.sha256(self.text.encode("utf-8")).hexdigest(),
        }


# Rubric T1 (docs/content/feed-approval-rubric.md): a learner's daily reading
# is not a police blotter. Checked on the title and the opening paragraph.
GRIM_RE = re.compile(r"殺害|殺人|刺殺|射殺|遺体|死体|逮捕|容疑者|訃報|死去|自殺|誘拐|強盗|放火|虐待")
VANDAL_RE = re.compile(r"クソ|糞|死ね|ちんこ|まんこ|うんこ|fuck|shit", re.I)


def pdl_attribution(s: Source, title: str, excerpt: dict | None) -> str:
    """PDL1.0 §1.1 credit, then the §1.1 processing statement: the text is shown
    with furigana and a dictionary, and (when cut) excerpted — by Bunki."""
    processed = "段落単位で抜粋し、" if excerpt else ""
    return (
        f"出典：「{title}」（{s.publisher}）、{s.licence.split(' ')[0]}（{s.licence_url}）"
        f"［利用規約 {s.terms_url}］。「{title}」（{s.publisher}）を加工して作成：{processed}ふりがなと辞書リンクを付けて掲載（Bunki）"
    )


def to_jst_date(value: datetime) -> str:
    return value.astimezone(JST).date().isoformat()


def parse_feed_dates(xml_text: str) -> list[dict]:
    """RSS 1.0 (RDF) / RSS 2.0 / Atom items → [{title, url, published}]"""
    xml_text = re.sub(r"^\s*<\?xml[^>]*\?>", "", xml_text)
    root = ElementTree.fromstring(xml_text)
    rows = []
    for el in root.iter():
        tag = el.tag.rsplit("}", 1)[-1]
        if tag not in ("item", "entry"):
            continue
        fields = {c.tag.rsplit("}", 1)[-1]: c for c in el}
        title = (fields.get("title").text or "").strip() if fields.get("title") is not None else ""
        link_el = fields.get("link")
        link = ""
        if link_el is not None:
            link = (link_el.text or link_el.attrib.get("href") or "").strip()
        raw = None
        for key in ("date", "pubDate", "published", "updated"):
            if fields.get(key) is not None and (fields[key].text or "").strip():
                raw = fields[key].text.strip()
                break
        published = None
        if raw:
            try:
                published = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                try:
                    published = parsedate_to_datetime(raw)
                except (TypeError, ValueError):
                    published = None
        if published is not None and published.tzinfo is None:
            published = published.replace(tzinfo=JST)
        rows.append({"title": title, "url": link, "published": published})
    return rows


def jp_date(text: str) -> date | None:
    m = re.search(r"(20\d\d)年\s*(\d{1,2})月\s*(\d{1,2})日", text)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.search(r"令和\s*(\d{1,2}|元)年\s*(\d{1,2})月\s*(\d{1,2})日", text)
    if m:
        year = 2018 + (1 if m.group(1) == "元" else int(m.group(1)))
        return date(year, int(m.group(2)), int(m.group(3)))
    return None


# ---------------------------------------------------------------- government adapters
class GovAdapter:
    key = ""
    feed_url = ""
    url_allow: re.Pattern | None = None
    title_skip = re.compile(r"$^")
    stop: tuple = ()
    cap = 1600

    def __init__(self) -> None:
        self.source = SOURCES[self.key]
        self.skipped: list[dict] = []

    def skip(self, url: str, reason: str) -> None:
        self.skipped.append({"url": url, "reason": reason})

    def discover(self, since: date, until: date) -> list[dict]:
        res = http_get(self.feed_url)
        stubs = []
        seen = set()
        for row in parse_feed_dates(res.text()):
            url, title, published = row["url"], row["title"], row["published"]
            if not url or url in seen:
                continue
            seen.add(url)
            if published is None:
                self.skip(url, "no publication date")
                continue
            day = published.astimezone(JST).date()
            if not since <= day <= until:
                continue
            if self.url_allow and not self.url_allow.search(url):
                self.skip(url, "not an article page this adapter reads")
                continue
            if self.title_skip.search(title):
                self.skip(url, "notice/meeting/recruitment/statistics page — not a reading")
                continue
            stubs.append({"url": url, "title": title, "published": published})
        return stubs

    def item_id(self, url: str) -> str:
        path = urllib.parse.urlsplit(url).path.strip("/")
        path = re.sub(r"\.(html?|php)$", "", path)
        return f"{self.key}:{path.replace('/', '-')}"

    def container(self, root: Node) -> Node | None:
        raise NotImplementedError

    def page_title(self, root: Node, fallback: str) -> str:
        h1 = root.find("h1")
        title = normalize(h1.text()) if h1 else ""
        return title or fallback

    def trim_header(self, lines: list[str]) -> list[str]:
        return lines

    def page_date(self, root: Node, title: str) -> date | None:
        return page_day(root, title)

    def extract(self, stub: dict) -> Item | None:
        url = stub["url"]
        try:
            res = http_get(url)
        except Exception as err:  # noqa: BLE001
            self.skip(url, f"fetch failed: {type(err).__name__}")
            return None
        if "html" not in res.content_type:
            self.skip(url, f"not HTML ({res.content_type})")
            return None
        return self.extract_from(res, parse_html(res.text()), stub)

    def extract_from(self, res: Response, root: Node, stub: dict) -> Item | None:
        url = stub["url"]
        box = self.container(root)
        if box is None:
            self.skip(url, "article container not found (template changed?)")
            return None
        title = self.page_title(root, stub["title"])
        day = self.page_date(root, title)
        lines = [line for line in clean_lines(block_lines(box), self.stop) if line != title]
        lines = rejoin_wrapped(self.trim_header(lines))
        if not lines:
            self.skip(url, "no body text")
            return None
        if sum(1 for line in lines if PDF_LINK_RE.search(line)) >= max(2, len(lines) * 0.25):
            self.skip(url, "an index of document links, not a release text")
            return None
        # attachment links and bare URLs are navigation, not text to read
        lines = [line for line in lines if not PDF_LINK_RE.search(line) and not URL_LINE_RE.match(line)]
        paras, excerpt = trim_paragraphs(lines, self.cap)
        published = stub["published"]
        listed = published.astimezone(JST).date()
        # a page date later than its listing is a date the text mentions
        # (a start date, a deadline), not the day it was published
        if day is None or day > listed:
            day = listed
        return Item(
            id=self.item_id(url), source=self.key, title=title, paragraphs=paras, url=url,
            date=day.isoformat(), published_at=published.astimezone(JST).isoformat(),
            fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"), response_sha256=res.sha256,
            excerpt=excerpt, attribution=pdl_attribution(self.source, title, excerpt),
        )


class KanteiAdapter(GovAdapter):
    key = "kantei"
    feed_url = "https://www.kantei.go.jp/index-jnews.rdf"
    # the RDF carries ~10 days; the two list pages carry the rest of the window
    list_pages = ("https://www.kantei.go.jp/jp/105/actions/index.html", "https://www.kantei.go.jp/jp/105/discourse/index.html")
    url_allow = re.compile(r"/jp/(105/(actions|discourse)/|pages/\d{8})")
    # 閣議・会見 transcripts are long politics; ミサイル指示 pages are one line;
    # condolences are rubric T1 territory; letters and 祝辞 are protocol
    title_skip = re.compile(r"閣議|会見|次官連絡会議|指示|ミサイル|基本方針を掲載|祝辞|弔意|崩御|逝去|談話|書簡")
    stop = ("関連リンク", "新着記事", "総理の一日一覧に戻る")

    def discover(self, since, until):
        stubs = super().discover(since, until)
        seen = {stub["url"] for stub in stubs} | {s["url"] for s in self.skipped}
        for page in self.list_pages:
            html = http_get(page).text()
            for href, inner in re.findall(r'<a[^>]+href="(/jp/105/(?:actions|discourse)/[^"]+\.html)"[^>]*>(.*?)</a>', html, re.S):
                url = urllib.parse.urljoin(page, href)
                if url in seen:
                    continue
                seen.add(url)
                text = normalize(re.sub(r"<[^>]+>", "", inner))
                day = jp_date(text)
                if day is None or not since <= day <= until:
                    continue
                title = re.split(r"令和\d+年\d+月\d+日", text)[0] or text
                if self.title_skip.search(text):
                    self.skip(url, "notice/meeting/recruitment/statistics page — not a reading")
                    continue
                stubs.append({"url": url, "title": title, "published": datetime(day.year, day.month, day.day, 12, tzinfo=JST)})
        return stubs

    def container(self, root):
        return root.find("div", cls="article-content")

    def page_title(self, root, fallback):
        title = root.find("title")
        head = normalize(title.text()).split("|")[0].strip() if title else ""
        return head or fallback


class MhlwAdapter(GovAdapter):
    key = "mhlw"
    feed_url = "https://www.mhlw.go.jp/stf/news.rdf"
    url_allow = re.compile(r"mhlw\.go\.jp/stf/(houdou/)?newpage_\d+\.html$")
    title_skip = re.compile(
        r"開催|会議|分科会|部会|検討会|懇談会|ワーキング|募集|採用|名簿|ご協力|報告システム|統計|速報|算定基準|作業グループ|作業班|資料|委員会|説明会|記者会見|取り消し|許可|意見|内示"
    )
    stop = ("PDFファイルを見るため",)

    def container(self, root):
        main = root.find("div", cls="l-contentMain")
        if main is None:
            return None
        # the release header (date, 照会先 contacts, 報道関係者各位) and the
        # PDF-reader note are page furniture, not the release text
        for cls in ("m-boxInfo", "m-txtM", "m-boxReader"):
            for n in main.find_all(cls=cls):
                n.remove()
        for n in main.find_all("h1"):
            n.remove()
        return main

    def page_date(self, root, title):
        stamp = root.find("p", cls="m-boxInfo__date")
        return jp_date(normalize(stamp.text())) if stamp else page_day(root, title)


class MextAdapter(GovAdapter):
    key = "mext"
    feed_url = "https://www.mext.go.jp/b_menu/news/index.rdf"
    url_allow = re.compile(r"mext\.go\.jp/(b_menu/houdou/|a_menu/)")
    # meeting notices and papers are skipped; an event the ministry holds
    # (a fair, a festival) is a reading
    title_skip = re.compile(
        r"(会議|分科会|部会|検討会|懇談会|委員会|審議会|説明会|協議会|研究会).*(開催|資料)|開催案内|配付資料|配布資料|採用|公募|記者会見|募集|審査"
    )
    stop = ("お問合せ先", "お問い合わせ先", "詳細ホームページ", "（※外部のウェブサイトリンク）")

    def container(self, root):
        main = root.find("div", id_="contentsMain")
        if main is None:
            return None
        for n in main.find_all("h1") + [p for p in main.find_all("p", cls="right")]:
            n.remove()
        return main

    def page_date(self, root, title):
        stamp = root.find("p", cls="right")
        return jp_date(normalize(stamp.text())) if stamp else page_day(root, title)


class SportsAdapter(MextAdapter):
    key = "sports"
    press_list = "https://www.mext.go.jp/sports/b_menu/houdou/index.htm"

    def discover(self, since, until):
        html = http_get(self.press_list).text()
        stubs, seen = [], set()
        for href, inner in re.findall(r'<a[^>]+href="(/sports/b_menu/houdou/(?:jsa_\d+\.html|\d+/\d+/[\d_]+\.htm))"[^>]*>(.*?)</a>', html, re.S):
            url = urllib.parse.urljoin(self.press_list, href)
            if url in seen:
                continue
            seen.add(url)
            title = normalize(re.sub(r"<[^>]+>", "", inner))
            if self.title_skip.search(title):
                self.skip(url, "notice/meeting/recruitment page — not a reading")
                continue
            stubs.append({"url": url, "title": title, "published": None})
        return stubs

    def extract(self, stub):
        url = stub["url"]
        try:
            res = http_get(url)
        except Exception as err:  # noqa: BLE001
            self.skip(url, f"fetch failed: {type(err).__name__}")
            return None
        root = parse_html(res.text())
        day = page_day(root, self.page_title(root, stub["title"]))
        if day is None:
            self.skip(url, "no article date on the page")
            return None
        return self.extract_from(res, root, dict(stub, published=datetime(day.year, day.month, day.day, 12, tzinfo=JST)))


class GovOnlineAdapter(GovAdapter):
    key = "govonline"
    listings = ("https://www.gov-online.go.jp/media/tv_programs/", "https://www.gov-online.go.jp/media/radio_programs/")
    stop = ("ゲスト", "見逃し配信", "ストリーミング", "放送日", "関連リンク", "コンテンツの利用・著作権等について", "このコンテンツは役に立ちましたか")
    cap = 1600

    def discover(self, since, until):
        stubs, seen = [], set()
        for listing in self.listings:
            html = http_get(listing).text()
            for href in re.findall(r'href="(/article/\d{6}/(?:tv|radio)-\d+\.html)"', html):
                url = urllib.parse.urljoin(listing, href)
                if url in seen:
                    continue
                seen.add(url)
                # the listing path carries the month; pages outside the window's
                # months are not fetched at all
                month = re.search(r"/article/(\d{4})(\d{2})/", href)
                first = date(int(month.group(1)), int(month.group(2)), 1)
                if first > until or (first.replace(day=28) + timedelta(days=4)).replace(day=1) <= since:
                    continue
                stubs.append({"url": url, "title": "", "published": None})
        return stubs

    def container(self, root):
        return root.find("div", cls="c-editorContent")

    def page_title(self, root, fallback):
        title = root.find("title")
        head = normalize(title.text()).split("|")[0].strip() if title else ""
        return head or fallback

    def extract(self, stub):
        url = stub["url"]
        try:
            res = http_get(url)
        except Exception as err:  # noqa: BLE001
            self.skip(url, f"fetch failed: {type(err).__name__}")
            return None
        root = parse_html(res.text())
        day = page_day(root, self.page_title(root, ""))
        if day is None:
            self.skip(url, "no article date on the page")
            return None
        stub = dict(stub, published=datetime(day.year, day.month, day.day, tzinfo=JST))
        return self.extract_from(res, root, stub)




class EnvAdapter(GovAdapter):
    key = "env"
    press_list = "https://www.env.go.jp/press/"
    # calls for applications, seminars and meeting notices are not readings;
    # a public event the ministry holds (a tour, a national convention) is
    title_skip = re.compile(r"募集|公募|説明会|セミナー|会合|パブリックコメント|意見の募集|採択|省令|告示|検討会|委員会|審議会|フォーラム|対策本部|協議会")
    stop = ("連絡先", "PDF形式のファイルをご覧いただく")

    def discover(self, since, until):
        html = http_get(self.press_list).text()
        stubs = []
        for chunk in re.split(r'p-press-release-list__heading">', html)[1:]:
            day = jp_date(chunk[:40])
            if day is None or not since <= day <= until:
                continue
            body = chunk.split("p-press-release-list__heading", 1)[0]
            for href, title in re.findall(r'<a href="(/press/press_\d+\.html)"[^>]*>(.*?)</a>', body, re.S):
                title = normalize(re.sub(r"<[^>]+>", "", title))
                url = urllib.parse.urljoin(self.press_list, href)
                if self.title_skip.search(title):
                    self.skip(url, "notice/meeting/recruitment page — not a reading")
                    continue
                stubs.append({"url": url, "title": title, "published": datetime(day.year, day.month, day.day, tzinfo=JST)})
        return stubs

    def container(self, root):
        return root.find("div", cls="p-press-release-material")

    def trim_header(self, lines):
        # この記事を印刷 · the date · the topic tag precede the release text
        while lines and (lines[0] == "この記事を印刷" or jp_date(lines[0]) and len(lines[0]) < 16 or len(lines[0]) <= 6):
            lines = lines[1:]
        return lines


# ---------------------------------------------------------------- Wikipedia
WIKI_API = "https://ja.wikipedia.org/w/api.php"


def wiki_api(**params) -> dict:
    params = {"format": "json", "formatversion": "2", **params}
    res = http_get(WIKI_API + "?" + urllib.parse.urlencode(params), agent=WIKI_USER_AGENT)
    data = json.loads(res.body)
    if "error" in data:
        raise RuntimeError(f"MediaWiki API: {data['error'].get('code')}")
    return data


def stable_revision(title: str, as_of: datetime) -> dict | None:
    """The revision that was current at `as_of` (latest revision at or before it)."""
    data = wiki_api(action="query", prop="revisions", titles=title, rvlimit=1, rvdir="older",
                    rvstart=as_of.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    rvprop="ids|timestamp", redirects=1)
    page = data["query"]["pages"][0]
    if page.get("missing") or not page.get("revisions"):
        return None
    rev = page["revisions"][0]
    return {"pageid": page["pageid"], "title": page["title"], "revid": rev["revid"], "timestamp": rev["timestamp"]}


def wiki_attribution(title: str, revid: int, timestamp: str, excerpt_note: str) -> str:
    return (
        f"出典：ウィキペディア日本語版「{title}」（版 {revid}、{timestamp[:10]}）の執筆者、"
        f"CC BY-SA 4.0（{CC_BY_SA_URL}）。履歴 https://ja.wikipedia.org/w/index.php?title="
        f"{urllib.parse.quote(title)}&action=history ／ {excerpt_note}ふりがなと辞書リンクを付けて掲載（Bunki）。"
        "この頁の本文は CC BY-SA 4.0 で再利用できる。"
    )


_LINK_RE = re.compile(r"\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]")


def wikitext_plain(text: str) -> tuple[str, list[str]]:
    """One portal bullet → plain text + the link targets it names."""
    targets = [m.group(1).strip() for m in _LINK_RE.finditer(text)]
    text = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    text = re.sub(r"\s*-\s*\[https?://[^\]]+\]\s*$", "", text)  # the trailing news-source link
    text = re.sub(r"\[https?://[^\s\]]+\s+([^\]]+)\]", r"\1", text)
    text = re.sub(r"\{\{仮リンク\|([^|}]+)\|[^}]*\}\}", r"\1", text)
    text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = _LINK_RE.sub(lambda m: (m.group(2) or m.group(1)).strip(), text)
    text = text.replace("'''", "").replace("''", "")
    text = re.sub(r"<[^>]+>", "", text)
    return normalize(text), targets


EXCLUDED_TAGS = ("（事件）", "（事故）", "（訃報）")


class WikiNewsDigestAdapter:
    """Portal:最近の出来事 → one reading per week of the portal's own summaries."""

    key = "jawiki-news"

    def __init__(self, now: datetime | None = None) -> None:
        self.source = SOURCES[self.key]
        self.now = now or datetime.now(timezone.utc)
        self.skipped: list[dict] = []
        self.bullets: list[dict] = []  # shared with the topic adapter

    def month_pages(self, since: date, until: date) -> list[str]:
        pages, d = [], since.replace(day=1)
        while d <= until:
            pages.append(f"Portal:最近の出来事/{d.year}年{d.month}月")
            d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
        return pages

    def load_bullets(self, since: date, until: date) -> list[dict]:
        as_of = self.now - timedelta(hours=24)
        bullets = []
        for page in self.month_pages(since, until):
            rev = stable_revision(page, as_of)
            if rev is None:
                self.skipped.append({"url": page, "reason": "no revision 24 h before the run"})
                continue
            data = wiki_api(action="query", prop="revisions", revids=rev["revid"], rvprop="content", rvslots="main")
            wikitext = data["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
            wikitext = re.sub(r"<!--.*?-->", "", wikitext, flags=re.S)
            day = None
            for line in wikitext.splitlines():
                m = re.match(r"^===\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*===", line)
                if m:
                    day = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                    continue
                if day is None or not line.startswith("*") or line.startswith("**"):
                    continue
                if not since <= day <= until:
                    continue
                text, targets = wikitext_plain(line.lstrip("* ").strip())
                bullets.append({"date": day, "text": text, "targets": targets, "page": page, "revid": rev["revid"],
                                "timestamp": rev["timestamp"],
                                "excluded": any(tag in text for tag in EXCLUDED_TAGS) or bool(GRIM_RE.search(text))})
        self.bullets = bullets
        return bullets

    MIN_CHARS = 320

    def discover(self, since, until):
        bullets = self.bullets or self.load_bullets(since, until)
        weeks: dict[date, list[dict]] = {}
        for b in bullets:
            if b["excluded"]:
                continue
            monday = b["date"] - timedelta(days=b["date"].weekday())
            weeks.setdefault(monday, []).append(b)
        # a week too thin to read on its own joins the week before it
        spans: list[dict] = []
        for monday, rows in sorted(weeks.items()):
            spans.append({"monday": monday, "sunday": monday + timedelta(days=6), "bullets": list(rows)})
        merged: list[dict] = []
        for span in spans:
            size = sum(len(b["text"]) + 8 for b in span["bullets"])
            if merged and size < self.MIN_CHARS:
                merged[-1]["sunday"] = span["sunday"]
                merged[-1]["bullets"].extend(span["bullets"])
            else:
                merged.append(span)
        return merged

    def extract(self, stub):
        rows = sorted(stub["bullets"], key=lambda b: b["date"], reverse=True)
        if len(rows) < 3:
            self.skipped.append({"url": f"week of {stub['monday']}", "reason": f"only {len(rows)} summaries — too thin for a reading"})
            return None
        monday = stub["monday"]
        sunday = stub.get("sunday") or monday + timedelta(days=6)
        paras = [f"{b['date'].month}月{b['date'].day}日　{b['text']}" for b in rows]
        if VANDAL_RE.search("\n".join(paras)):
            self.skipped.append({"url": f"week of {monday}", "reason": "vandalism marker in the stable revision"})
            return None
        latest = rows[0]
        page = latest["page"]
        title = f"{monday.month}月{monday.day}日〜{sunday.month}月{sunday.day}日のできごと"
        note = "日付節の要約文を週ごとにまとめ、事件・事故・訃報の項目を除き、"
        return Item(
            id=f"jawiki-news:{monday.isoformat()}",
            source=self.key,
            title=title,
            paragraphs=paras,
            url=f"https://ja.wikipedia.org/w/index.php?oldid={latest['revid']}",
            date=max(b["date"] for b in rows).isoformat(),
            published_at=latest["timestamp"],
            fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            excerpt={"rule": "portal summaries for the week, 事件・事故・訃報 lines left out", "summaries": len(rows)},
            attribution=wiki_attribution(page, latest["revid"], latest["timestamp"], note),
            credits={"page": page, "revid": latest["revid"]},
        )


# link targets that name a topic rather than a place/person/institution
# an event article names its instance (a year, an ordinal, a number);
# bare topics (地震) and calendar pages (9月27日) are not this week's news
EVENT_TARGET = re.compile(r"\d")
CALENDAR_TARGET = re.compile(r"^(\d+月\d+日|\d+年|\d+年代)$")


class WikiTopicAdapter:
    """The lead of the article a week's summary points at, if revised in the window."""

    key = "jawiki"
    cap = 1400

    def __init__(self, digest: WikiNewsDigestAdapter, now: datetime | None = None, limit: int = 12) -> None:
        self.source = SOURCES[self.key]
        self.digest = digest
        self.now = now or datetime.now(timezone.utc)
        self.limit = limit
        self.skipped: list[dict] = []

    def discover(self, since, until):
        bullets = self.digest.bullets or self.digest.load_bullets(since, until)
        stubs, seen = [], set()
        for b in sorted(bullets, key=lambda b: b["date"], reverse=True):
            if b["excluded"]:
                continue
            # only event articles: a country's or a party's general article is
            # background, not this week's news
            targets = [t for t in b["targets"] if EVENT_TARGET.search(t) and not CALENDAR_TARGET.match(t.partition("#")[0])]
            for target in targets[:1]:
                page, _, anchor = target.partition("#")
                key = (page, anchor)
                if key in seen or page.startswith(("Category:", "ファイル:", "File:")):
                    continue
                seen.add(key)
                stubs.append({"page": page, "anchor": anchor, "bullet": b})
            if len(stubs) >= self.limit:
                break
        return stubs

    def extract(self, stub):
        since_ok = stub["bullet"]["date"] - timedelta(days=14)
        rev = stable_revision(stub["page"], self.now - timedelta(hours=24))
        label = stub["page"] + (f"#{stub['anchor']}" if stub["anchor"] else "")
        if rev is None:
            self.skipped.append({"url": label, "reason": "no revision 24 h before the run"})
            return None
        rev_day = datetime.fromisoformat(rev["timestamp"].replace("Z", "+00:00")).astimezone(JST).date()
        if rev_day < since_ok:
            self.skipped.append({"url": label, "reason": f"article not revised since {rev_day} — not fresh"})
            return None
        section = 0
        heading = ""
        if stub["anchor"]:
            sections = wiki_api(action="parse", oldid=rev["revid"], prop="sections")["parse"]["sections"]
            match = next((s for s in sections if s.get("anchor") == stub["anchor"].replace(" ", "_") or s.get("line") == stub["anchor"]), None)
            if match is None:
                self.skipped.append({"url": label, "reason": "section anchor not found in the stable revision"})
                return None
            section = int(match["index"])
            heading = re.sub(r"<[^>]+>", "", match["line"])
        html = wiki_api(action="parse", oldid=rev["revid"], prop="text", section=section, disabletoc=1,
                        disableeditsection=1)["parse"]["text"]
        root = parse_html(html)
        for bad in (root.find_all("sup") + root.find_all("table") + root.find_all("style")
                    + root.find_all(cls="hatnote") + root.find_all(cls="mw-empty-elt") + root.find_all(cls="noprint")
                    + root.find_all(cls="reference") + root.find_all(cls="mw-editsection") + root.find_all(cls="thumb")
                    + root.find_all(cls="infobox") + root.find_all(cls="navbox") + root.find_all(cls="ambox")
                    + root.find_all(cls="geo-nondefault") + root.find_all(cls="geo-multi-punct") + root.find_all(cls="autonumber")
                    + [n for n in root.iter() if re.search(r"display\s*:\s*none", n.attrs.get("style", ""))]):
            bad.remove()
        paras = [normalize(p.text()) for p in root.find_all("p")]
        paras = [p for p in paras if len(p) > 20]
        if section == 0 and sum(len(p) for p in paras) < 350:
            # a short lead continues into the article's first section
            more = parse_html(wiki_api(action="parse", oldid=rev["revid"], prop="text", section=1, disabletoc=1,
                                       disableeditsection=1)["parse"]["text"])
            for bad in more.find_all("sup") + more.find_all("table") + more.find_all("style"):
                bad.remove()
            paras += [p for p in (normalize(n.text()) for n in more.find_all("p")) if len(p) > 20]
        if not paras:
            self.skipped.append({"url": label, "reason": "no prose paragraphs in the lead"})
            return None
        text = "\n".join(paras)
        if VANDAL_RE.search(text):
            self.skipped.append({"url": label, "reason": "vandalism marker in the stable revision"})
            return None
        if GRIM_RE.search(paras[0]):
            self.skipped.append({"url": label, "reason": "rubric T1 — opening paragraph is a grim incident"})
            return None
        paras, excerpt = trim_paragraphs(paras, self.cap)
        title = rev["title"] + (f"（{heading}）" if heading else "")
        note = ("記事の該当節から段落単位で抜粋し、" if heading else "記事の冒頭部分から段落単位で抜粋し、")
        return Item(
            id=f"jawiki:{rev['pageid']}" + (f"-s{section}" if section else ""),
            source=self.key,
            title=title,
            paragraphs=paras,
            url=f"https://ja.wikipedia.org/w/index.php?oldid={rev['revid']}",
            date=rev_day.isoformat(),
            published_at=rev["timestamp"],
            fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            excerpt=excerpt or {"rule": "lead section" if not heading else f"section {heading}"},
            attribution=wiki_attribution(rev["title"], rev["revid"], rev["timestamp"], note),
            credits={"page": rev["title"], "revid": rev["revid"], "section": heading or None},
        )


# ---------------------------------------------------------------- @bunki/feed full readers
class PublisherReaderAdapter:
    """Global Voices / ALMA through the shared reader (tools/fresh-publisher-read.mjs)."""

    cap = 2000

    def __init__(self, key: str) -> None:
        self.key = key
        self.source = SOURCES[key]
        self.skipped: list[dict] = []
        self.report: dict = {}

    def discover(self, since, until):
        proc = subprocess.run(
            ["node", str(HERE / "fresh-publisher-read.mjs"), "--source", self.key, "--since", since.isoformat()],
            capture_output=True, text=True, timeout=240,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"fresh-publisher-read exited {proc.returncode}: {proc.stderr.strip()[-300:]}")
        try:
            self.report = json.loads(proc.stderr.strip().splitlines()[-1])
        except (ValueError, IndexError):
            self.report = {"raw": proc.stderr.strip()[-300:]}
        for fallback in self.report.get("fallbacks", []):
            self.skipped.append({"url": fallback.get("url"), "reason": f"shared reader link fallback: {fallback.get('reason')}"})
        return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]

    def extract(self, row):
        published = datetime.fromisoformat(row["publishedAt"].replace("Z", "+00:00"))
        paras = [p.strip() for p in re.split(r"\n{2,}", row["text"]) if p.strip()]
        paras, excerpt = trim_paragraphs(paras, self.cap)
        attribution = row["attribution"] + (" Excerpted at paragraph boundaries by Bunki." if excerpt else "")
        attribution += " ふりがなと辞書リンクを付けて掲載（Bunki）。"
        slug = urllib.parse.urlsplit(row["url"]).path.strip("/").replace("/", "-")
        return Item(
            id=f"{self.key}:{slug}", source=self.key, title=row["title"], paragraphs=paras, url=row["url"],
            date=to_jst_date(published), published_at=published.astimezone(JST).isoformat(),
            fetched_at=row["fetchedAt"], response_sha256=row["responseSha256"], excerpt=excerpt,
            attribution=attribution,
            credits={"authors": row.get("authors"), "translators": row.get("translators"), "readerVersion": row.get("readerVersion")},
        )


def adapters(now: datetime | None = None) -> list:
    digest = WikiNewsDigestAdapter(now)
    return [KanteiAdapter(), GovOnlineAdapter(), MhlwAdapter(), MextAdapter(), SportsAdapter(), EnvAdapter(), digest, WikiTopicAdapter(digest, now),
            PublisherReaderAdapter("global-voices"), PublisherReaderAdapter("alma-ja")]
