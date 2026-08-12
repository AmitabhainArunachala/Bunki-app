"""Phase 1 batch command — rights-clean text in, corridor article JSON out.

The gate the KAIRO build brief names first: every article on the shelf flows
through THIS command. Input is a committed, provenance-carrying text; output
is one JSON file per article (tokens + furigana + level signals + the base
forms the reader's dictionary links resolve against) plus a light shelf
index the corridor boots from. Articles load lazily per file — the shelf
scales by adding data, not app code.

Sources (all in-repo, nothing fetched):

  corpus/samples/wikinews/sample.jsonl     ja.wikinews (CC BY 4.0)     full text
  corpus/samples/aozora/sample.jsonl       青空文庫 clean (PD)          full text
  corpus/samples/yasashii/sample.jsonl     ISA glossary (source ruby)   full text
  prototypes/bunki-sites-v11/app/lib/reading-catalog.ts
                                           8 parked v11 texts: 5 Bunki
                                           originals (pool: original) and
                                           3 public-domain classics
  docs/build-evidence/kairo-feel-lock/wp9b/originals.jsonl
                                           14 Bunki originals
  docs/content/bunki-originals-zoka-sanjin.jsonl
                                           30 Bunki originals; inspiration
                                           and factual evidence live only in
                                           the non-runtime editorial sidecar

Level signals (stored separately, never averaged — the #42 law):

  jreadability      computed live on the exact text shown (formula only).
  jlpt_lexicon      computed live on the exact text shown: content-token
                    coverage + band vector against the 6,687-word JLPT-tagged
                    lexicon already shipped by the corridor
                    (prototypes/drift/data/wbig.json — open-anki-jlpt-decks
                    lineage; glosses JMdict CC BY-SA). Substrate is named in
                    the signal; it is NOT official JLPT and is never
                    presented as such.
  lexical_coverage  the NINJAL 国語研教育基本語彙 pair from corpus.grading —
  + tmr             intentionally recorded as unavailable in the default
                    clean build. The pinned CSV is not committed, and ambient
                    gitignored caches must never change generated receipts.
                    The UI shows the absence instead of a stale or
                    machine-dependent number. Signals shown are always true
                    of the text displayed.

Usage:
  python build_articles.py            # build the full shelf
  python build_articles.py --out DIR  # elsewhere (tests)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_corridor as bc  # noqa: E402  (tokeniser + furigana + sample loaders)

REPO = bc.REPO
CORRIDOR = bc.CORRIDOR

JLPT_SUBSTRATE = "open-anki-jlpt-decks/wbig-6687"
NINJAL_UNAVAILABLE_REASON_LEGACY = (
    "ninjal-kyoiku-kihon-goi substrate not present and not fetchable from the "
    "build environment (egress policy); run the build where "
    "mmsrv.ninjal.ac.jp is reachable to fill this pair in"
)
NINJAL_UNAVAILABLE_REASON = (
    "ninjal-kyoiku-kihon-goi substrate is not committed; the reproducible "
    "default build does not download or consult gitignored local grading data"
)

WP9B_ORIGINALS = REPO / "docs/build-evidence/kairo-feel-lock/wp9b/originals.jsonl"
VIDEO_INSPIRED_ORIGINALS = REPO / "docs/content/bunki-originals-zoka-sanjin.jsonl"

LANE_LABEL = {"graded": "段階別読み物", "essay": "随筆"}


# --------------------------------------------------------------------------
# Reading overrides — asserted repairs for UniDic homographs
# --------------------------------------------------------------------------
# These are the existing WP9b repairs, moved into the canonical builder so a
# clean checkout has one reproducible path for the whole shelf. Every rule is
# article- and context-specific and fails loudly if either text or tokenisation
# drifts. Only reading/ruby fields change; text, base form, POS and grading do
# not.
READING_OVERRIDES = [
    {
        "article": "bunki-essay-n2-handwriting",
        "surface": "数",
        "was": "すう",
        "reading": "かず",
        "next": "は",
        "count": 1,
    },
    {
        "article": "bunki-essay-n1-memory",
        "surface": "縁",
        "was": "えん",
        "reading": "ふち",
        "next": "に",
        "count": 1,
    },
    {
        "article": "bunki-graded-n5-station",
        "surface": "七",
        "was": "なな",
        "reading": "しち",
        "next": "時",
        "count": 1,
    },
    {
        "article": "bunki-graded-n5-neighbour",
        "surface": "一日",
        "was": "ついたち",
        "reading": "いちにち",
        "count": 1,
    },
    {
        "article": "bunki-graded-n4-market",
        "surface": "市場",
        "was": "しじょう",
        "reading": "いちば",
        "count": 2,
    },
    {
        "article": "bunki-graded-n4-market",
        "surface": "十",
        "was": "じゅう",
        "reading": "じゅっ",
        "next": "個",
        "count": 1,
    },
    {
        "article": "bunki-essay-n2-translation",
        "surface": "四",
        "was": "よん",
        "reading": "よっ",
        "next": "つ",
        "count": 1,
    },
    {
        "article": "bunki-essay-n1-memory",
        "surface": "何",
        "was": "なん",
        "reading": "なに",
        "next": ["が", "を"],
        "count": 4,
    },
    *[
        {
            "article": article_id,
            "surface": "日本",
            "was": "にっぽん",
            "reading": "にほん",
            "next": "語",
            "count": 1,
        }
        for article_id in (
            "bunki-graded-n5-kitchen",
            "bunki-graded-n5-neighbour",
            "bunki-graded-n4-letter",
            "bunki-graded-n3-radio",
            "bunki-essay-n2-translation",
        )
    ],
]


def _neighbour_matches(tokens: list[dict], index: int, offset: int, wanted) -> bool:
    if wanted is None:
        return True
    neighbour = index + offset
    if not 0 <= neighbour < len(tokens):
        return False
    surface = tokens[neighbour]["s"]
    return surface in wanted if isinstance(wanted, list) else surface == wanted


def apply_reading_overrides(article_id: str, tokens: list[dict]) -> int:
    applied = 0
    for rule in READING_OVERRIDES:
        if rule["article"] != article_id:
            continue
        hits = [
            index
            for index, token in enumerate(tokens)
            if token["s"] == rule["surface"]
            and _neighbour_matches(tokens, index, 1, rule.get("next"))
            and _neighbour_matches(tokens, index, -1, rule.get("prev"))
        ]
        if len(hits) != rule["count"]:
            raise SystemExit(
                f"reading override drift in {article_id}: {rule['surface']!r} "
                f"matched {len(hits)}, expected {rule['count']}"
            )
        for index in hits:
            got = tokens[index]["r"]
            if got != rule["was"]:
                raise SystemExit(
                    f"reading override stale in {article_id}: {rule['surface']!r} "
                    f"reads {got!r}, expected {rule['was']!r}"
                )
            tokens[index]["r"] = rule["reading"]
            tokens[index]["f"] = bc.furigana_pairs(rule["surface"], rule["reading"])
            applied += 1
    return applied


# --------------------------------------------------------------------------
# The v11 catalog — extracted from the TS source of truth, never copied
# --------------------------------------------------------------------------
TEXT_CONST_RE = re.compile(r"^const (\w+) = `([\s\S]*?)`;$", re.M)
ENTRY_RE = re.compile(r"\{\s*id: \"([\s\S]*?)\n  \},", re.M)


def v11_catalog() -> list[dict]:
    src = (REPO / "prototypes/bunki-sites-v11/app/lib/reading-catalog.ts").read_text("utf-8")
    texts = {name: body for name, body in TEXT_CONST_RE.findall(src)}

    body_start = src.index("READING_CATALOG: readonly ReadingCatalogItem[] = [")
    body_end = src.index("] as const;", body_start)
    body = src[body_start:body_end]

    entries: list[dict] = []
    for block in re.findall(r"\{([\s\S]*?)\n  \}", body):
        fields = dict(re.findall(r"(\w+): \"([^\"]*)\",", block))
        m = re.search(r"text: (\w+),", block)
        if not m or m.group(1) not in texts:
            raise SystemExit(f"v11 catalog entry without a resolvable text: {block[:80]}")
        fields["text"] = texts[m.group(1)].strip()
        fields["real"] = "real: true" in block
        fields["generated"] = "generated: true" in block
        entries.append(fields)
    if len(entries) != 8:
        raise SystemExit(f"expected the 8 parked v11 texts, found {len(entries)}")
    return entries


# --------------------------------------------------------------------------
# The JLPT lexical signal — live, in-repo substrate, computed on shown text
# --------------------------------------------------------------------------
def load_jlpt_lexicon() -> tuple[dict, dict]:
    wbig = json.loads((REPO / "prototypes/drift/data/wbig.json").read_text("utf-8"))
    ortho: dict[str, int] = {}
    kana: dict[str, int] = {}
    for word, reading, _gloss, level in wbig:
        if not isinstance(level, int):
            continue
        # duplicate listings keep the easiest (highest-N) tag — deterministic
        if level > ortho.get(word, 0):
            ortho[word] = level
        if bc.is_kana(word):
            k = bc.kata_to_hira(word)
            if level > kana.get(k, 0):
                kana[k] = level
    return ortho, kana


def jlpt_signal(tokens: list[dict], ortho: dict, kana: dict) -> dict:
    """Coverage + band vector over content tokens, base-form matching only
    (reading-only matches for kanji-written tokens are NOT attempted — the
    same homophone conservatism as the NINJAL matcher)."""
    content = [t for t in tokens if t["c"]]
    if not content:
        return {
            "coverage": None,
            "band_vector": {},
            "substrate": JLPT_SUBSTRATE,
            "n_content_tokens": 0,
        }
    bands = {"n5": 0, "n4": 0, "n3": 0, "n2": 0, "n1": 0, "oov": 0}
    for t in content:
        base = t["b"]
        level = ortho.get(base)
        if level is None and bc.is_kana(base):
            level = kana.get(bc.kata_to_hira(base))
        bands[f"n{level}" if level else "oov"] += 1
    n = len(content)
    vector = {k: v / n for k, v in bands.items()}
    return {
        "coverage": 1.0 - vector["oov"],
        "band_vector": vector,
        "substrate": JLPT_SUBSTRATE,
        "n_content_tokens": n,
    }


# --------------------------------------------------------------------------
# Grading — everything computable here, absence recorded with its reason
# --------------------------------------------------------------------------
def grade_article(
    text: str,
    tokens: list[dict],
    tagger,
    jlpt_maps,
    *,
    legacy_unavailable_receipt: bool = False,
) -> dict:
    from corpus.grading.jread import jread_signal

    # Reproducibility boundary: the NINJAL CSV is intentionally not committed
    # and corpus.grading would otherwise download it into a gitignored cache.
    # This default build never consults that ambient cache or the network. It
    # reproduces the committed unavailable receipt byte-for-byte for the first
    # 40 articles and applies the same honest absence to additions.
    unavailable_reason = (
        NINJAL_UNAVAILABLE_REASON_LEGACY
        if legacy_unavailable_receipt
        else NINJAL_UNAVAILABLE_REASON
    )
    grading = {
        "signals": {"jreadability": jread_signal(text, tagger=tagger)},
        "disagreement": {
            "flag": False,
            "detail": {
                "reason": "fewer than two ordinal-capable signals in this build",
            },
        },
        "unavailable": {
            "lexical_coverage": unavailable_reason,
            "tmr": unavailable_reason,
            "error": "URLError" if legacy_unavailable_receipt else "UnavailableByBuildPolicy",
        },
    }
    grading["signals"]["jlpt_lexicon"] = jlpt_signal(tokens, *jlpt_maps)
    return grading


# --------------------------------------------------------------------------
# Article assembly
# --------------------------------------------------------------------------
def slugify(article_id: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]", "-", article_id)
    if not slug or slug.strip("-") == "":
        raise SystemExit(f"unusable article id: {article_id!r}")
    return slug


def tokenise_paragraphs(text: str, tagger, ruby_markup: str | None = None) -> tuple[list[dict], list[int]]:
    """Tokenise paragraph by paragraph; return (tokens, paragraph starts)."""
    tokens: list[dict] = []
    para_starts: list[int] = []
    source = ruby_markup if ruby_markup is not None else text
    paragraphs = [p for p in re.split(r"\n+", source) if p.strip()]
    for para in paragraphs:
        if tokens:
            para_starts.append(len(tokens))
        if ruby_markup is not None:
            tokens.extend(bc.tokenise_ruby_markup(para.strip(), tagger))
        else:
            tokens.extend(bc.tokenise(para.strip(), tagger))
    return tokens, para_starts


def native_original_entries(path: Path, *, source: str, expected: int) -> list[dict]:
    """Load the exact five-field Bunki-original source shape."""
    rows = bc.read_jsonl(path)
    if len(rows) != expected:
        raise SystemExit(f"{path}: expected {expected} source records, found {len(rows)}")
    out: list[dict] = []
    for rec in rows:
        if set(rec) != {"id", "level", "lane", "title", "text"}:
            raise SystemExit(f"{path}:{rec.get('id', '?')}: source shape must have exactly five native fields")
        lane = rec["lane"]
        if lane not in LANE_LABEL:
            raise SystemExit(f"{rec['id']}: unknown lane {lane!r}")
        expected_prefix = "bunki-graded-n3-" if lane == "graded" else f"bunki-essay-{rec['level'].lower()}-"
        if source == "bunki-original-reading-catalog" and not rec["id"].startswith(expected_prefix):
            raise SystemExit(f"{rec['id']}: native id does not match {expected_prefix!r}")
        out.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "text": rec["text"].replace("\r\n", "\n").strip(),
                "source": source,
                "sourceLabel": LANE_LABEL[lane] + " · Bunki",
                "pool": "original",
                "licence": "Bunki original",
                "attribution": "Bunki original text",
                "url": "",
                "date": "",
                "rubySource": "tokenizer",
                # Authored intent only. Measured signals live separately in
                # `grading`; the UI never calls this official certification.
                "authorLevel": rec["level"],
                "lane": lane,
            }
        )
    return out


def collect_articles() -> list[dict]:
    """Every shelf article, full text, provenance carried on the record."""
    articles: list[dict] = []

    for rec in bc.read_jsonl(REPO / "corpus/samples/wikinews/sample.jsonl"):
        articles.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "text": rec["text"].replace("\r\n", "\n").strip(),
                "source": "ja.wikinews",
                "sourceLabel": "ウィキニュース",
                "pool": "proprietary_safe",
                "licence": "CC BY 4.0",
                "attribution": "ja.wikinews contributors, CC BY 4.0",
                "url": rec.get("meta", {}).get("url", ""),
                "date": rec.get("meta", {}).get("date", ""),
                "rubySource": "tokenizer",
            }
        )

    for rec in bc.read_jsonl(REPO / "corpus/samples/aozora/sample.jsonl"):
        meta = rec.get("meta", {})
        articles.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "text": rec["text"].replace("\r\n", "\n").strip(),
                "source": "aozorabunko-clean",
                "sourceLabel": f"青空文庫 · {meta.get('author', '')}",
                "pool": "proprietary_safe",
                "licence": "PD (著作権フラグ なし) · 新字新仮名",
                "attribution": f"青空文庫 {meta.get('author', '')}「{rec['title']}」",
                "url": meta.get("card_url", ""),
                "date": str(meta.get("first_published", "")),
                "rubySource": "tokenizer",
            }
        )

    for rec in bc.read_jsonl(REPO / "corpus/samples/yasashii/sample.jsonl"):
        meta = rec.get("meta", {})
        articles.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "text": bc.strip_ruby(rec["text"]),
                "rubyMarkup": rec["text"],
                "headwordRuby": meta.get("headword_ruby", ""),
                "source": "isa-yasashii-glossary",
                "sourceLabel": "やさしい日本語 用語集",
                "pool": "proprietary_safe",
                "licence": "ISA やさしい日本語 glossary",
                "attribution": "出入国在留管理庁「やさしい日本語」用語集",
                "url": "",
                "date": "",
                "rubySource": "markup",
            }
        )

    lane_label = {
        "graded": "段階別読み物",
        "essay": "随筆",
        "primary": "一次資料",
        "literature": "古典",
        "historical": "歴史",
    }
    for entry in v11_catalog():
        original = entry["generated"]
        articles.append(
            {
                "id": entry["id"],
                "title": entry["title"],
                "text": entry["text"],
                "source": "bunki-v11-reading-catalog",
                "sourceLabel": lane_label.get(entry["lane"], "読み物") + (" · Bunki" if original else f" · {entry['sourceName']}"),
                "pool": "original" if original else "proprietary_safe",
                "licence": "Bunki original" if original else "PD + Bunki原作の解説",
                "attribution": (
                    "Bunki original text"
                    if original
                    else f"{entry['sourceName']} (public domain); framing text Bunki original"
                ),
                "url": entry.get("url", ""),
                "date": "",
                "rubySource": "tokenizer",
                "authorLevel": entry.get("level", ""),
                "lane": entry.get("lane", ""),
            }
        )

    articles.extend(
        native_original_entries(
            WP9B_ORIGINALS,
            source="bunki-wp9b-reading-catalog",
            expected=14,
        )
    )
    articles.extend(
        native_original_entries(
            VIDEO_INSPIRED_ORIGINALS,
            source="bunki-original-reading-catalog",
            expected=30,
        )
    )

    seen: set[str] = set()
    for a in articles:
        a["file"] = slugify(a["id"]) + ".json"
        if a["file"] in seen:
            raise SystemExit(f"article file collision: {a['file']}")
        seen.add(a["file"])
    return articles


SOURCES = {
    "proprietary_safe": [
        {"name": "ja.wikinews", "licence": "CC BY 4.0", "attribution": "ja.wikinews contributors, CC BY 4.0", "url": "https://ja.wikinews.org/"},
        {"name": "aozorabunko-clean", "licence": "PD (著作権フラグ なし)", "attribution": "青空文庫", "url": "https://www.aozora.gr.jp/"},
        {"name": "isa-yasashii-glossary", "licence": "出入国在留管理庁 やさしい日本語 用語集", "attribution": "出入国在留管理庁", "url": ""},
        {"name": "ninjal-kyoiku-kihon-goi", "licence": "CC BY 4.0", "attribution": "国立国語研究所『教育基本語彙の基本的研究―増補改訂版―』(2009)", "url": "https://mmsrv.ninjal.ac.jp/brfvep/"},
        {"name": "bunki-v11-historical", "licence": "PD", "attribution": "五箇条の御誓文 · 方丈記 · 徒然草（原文はパブリックドメイン、解説はBunkiオリジナル）", "url": ""},
    ],
    "share_alike": [
        {"name": "open-anki-jlpt-decks (via drift wbig)", "licence": "CC BY-SA 4.0 (JMdict lineage glosses)", "attribution": "JLPT level tags: open-anki-jlpt-decks; glosses: JMdict/EDICT (EDRDG)", "url": "https://www.edrdg.org/"},
    ],
    "original": [
        {"name": "bunki-v11-reading-catalog", "licence": "Bunki original", "attribution": "Bunki original graded texts and essays", "url": ""},
        {"name": "bunki-wp9b-reading-catalog", "licence": "Bunki original", "attribution": "Bunki original graded texts and essays (WP9b shelf expansion)", "url": ""},
        {"name": "bunki-original-reading-catalog", "licence": "Bunki original", "attribution": "Bunki original text", "url": ""},
    ],
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(CORRIDOR / "data" / "articles"))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    from corpus.grading._mecab import get_tagger

    tagger = get_tagger()
    jlpt_maps = load_jlpt_lexicon()

    articles = collect_articles()
    print(f"· {len(articles)} articles through the pipeline")

    ninjal_live = 0
    reading_overrides_applied = 0
    index_rows: list[dict] = []
    for a in articles:
        markup = a.pop("rubyMarkup", None)
        tokens, para_starts = tokenise_paragraphs(a["text"], tagger, ruby_markup=markup)
        reading_overrides_applied += apply_reading_overrides(a["id"], tokens)
        # The first 40 records are an immutable compatibility surface. Their
        # historical unavailable receipt (including its original error label)
        # stays byte-identical; additions use the accurate deterministic-build
        # policy receipt above.
        grading = grade_article(
            a["text"],
            tokens,
            tagger,
            jlpt_maps,
            legacy_unavailable_receipt=len(index_rows) < 40,
        )
        if "lexical_coverage" in grading["signals"]:
            ninjal_live += 1

        seeds: list[str] = []
        for t in tokens:
            if t["c"] and len(t["s"]) > 1 and t["b"] not in seeds:
                seeds.append(t["b"])
            if len(seeds) >= 6:
                break

        record = dict(a)
        record["tokens"] = tokens
        record["paras"] = para_starts
        record["grading"] = grading
        record["truncated"] = False
        (out / a["file"]).write_text(
            json.dumps(record, ensure_ascii=False, separators=(",", ":")), "utf-8"
        )

        row = {k: v for k, v in a.items() if k != "text"}
        row["chars"] = len(a["text"])
        row["snippet"] = a["text"].replace("\n", " ")[:64]
        row["grading"] = grading
        row["seeds"] = seeds
        row["truncated"] = False
        index_rows.append(row)

        jr = grading["signals"]["jreadability"]
        jl = grading["signals"]["jlpt_lexicon"]
        print(
            f"    {a['id']:>28}  {len(a['text']):>5}字  jread={jr['score']:.2f} ({jr['band']})  "
            f"jlpt-cov={jl['coverage'] * 100 if jl['coverage'] is not None else 0:.1f}%  "
            f"ninjal={'live' if 'lexical_coverage' in grading['signals'] else 'unavailable'}"
        )

    index = {
        "law": "three signals, never averaged; disagreement surfaced, never resolved; every signal true of the text displayed",
        "ninjalLive": ninjal_live,
        "sources": SOURCES,
        "articles": index_rows,
    }
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), "utf-8")
    print(f"· index: {len(index_rows)} articles, ninjal live on {ninjal_live}")
    expected_overrides = sum(rule["count"] for rule in READING_OVERRIDES)
    if reading_overrides_applied != expected_overrides:
        raise SystemExit(
            f"reading overrides: applied {reading_overrides_applied}, declared {expected_overrides}"
        )
    print(f"· reading overrides applied: {reading_overrides_applied}/{expected_overrides}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
