"""WP9b shelf expansion — 14 Bunki-original graded texts and essays.

This is NOT a second pipeline. It imports
``prototypes/corridor/tools/build_articles.py`` and appends entries to its
``collect_articles()``; every article — the existing 26 and the 14 added here —
is then tokenised, graded, and serialised by that module's unchanged code:

  tokeniser   build_corridor.tokenise (fugashi + unidic-lite 1.0.8 / UniDic
              2.1.2 lineage), furigana via build_corridor.furigana_pairs
  grading     corpus.grading — jreadability 1.1.5 on the exact text shown,
              plus the JLPT-lexicon signal over content tokens against
              prototypes/drift/data/wbig.json. The NINJAL pair stays recorded
              as unavailable with its reason (mmsrv.ninjal.ac.jp is blocked by
              this environment's egress policy), exactly as for the other 26.
  schema      identical record + index-row shape; nothing is hand-written.

Re-running it reproduces the existing 26 files byte-for-byte (verified).

WHY THE TEXTS LIVE HERE, not in corpus/samples/: corpus/samples holds
snapshots of *ingested upstream corpora*, each governed by a source
PROVENANCE.yml. These 14 texts have no upstream — they are original Bunki
content authored for this work package, and they carry ``pool: original`` /
``licence: Bunki original`` provenance that says exactly that. They are
committed here so the build is reproducible from the repository alone.

The mirror lanes (ja.wikinews, 青空文庫) could NOT be grown in this
environment: the egress policy answers 403 to CONNECT for ja.wikinews.org,
www.aozora.gr.jp and dumps.wikimedia.org, and corpus/samples already carries
every record it has (5 wikinews, 3 aozora, 10 yasashii — all 26 on the shelf).
No mirror article is ever written from memory: if the text is authored here,
it is original-lane with original provenance.

Usage:
  python docs/build-evidence/kairo-feel-lock/wp9b/build_wp9b_articles.py
  python docs/build-evidence/kairo-feel-lock/wp9b/build_wp9b_articles.py --out DIR
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(REPO / "prototypes" / "corridor" / "tools"))

import build_articles as ba  # noqa: E402
import build_corridor as bc  # noqa: E402  (furigana_pairs, for reading overrides)

ORIGINALS = HERE / "originals.jsonl"

LANE_LABEL = {"graded": "段階別読み物", "essay": "随筆"}

WP9B_SOURCE = {
    "name": "bunki-wp9b-reading-catalog",
    "licence": "Bunki original",
    "attribution": "Bunki original graded texts and essays (WP9b shelf expansion)",
    "url": "",
}


# --------------------------------------------------------------------------
# Reading overrides — UniDic homograph repair, keyed and asserted
# --------------------------------------------------------------------------
# build_articles.py has no override mechanism, so this is the minimal general
# hook. It is NOT a global find-and-replace: every entry names the article, the
# token surface, the reading it EXPECTS to be replacing, an optional
# neighbouring-token anchor, and the exact number of tokens it must match. Any
# drift — a reading that is no longer wrong, a count that changed, a context
# that vanished — raises SystemExit instead of silently doing nothing or
# silently doing too much. Only `r` (reading) and `f` (furigana pairs) are
# touched; `s`, `b`, `p` and `c` are left alone, so jreadability (computed on
# the text) and the JLPT-lexicon signal (computed on base forms) are provably
# unaffected.
#
# `next` / `prev` match the adjacent token's surface; a list means "any of".
READING_OVERRIDES = [
    # --- reported by the WP9b verifier ---
    {"article": "bunki-essay-n2-handwriting", "surface": "数", "was": "すう", "reading": "かず",
     "next": "は", "count": 1,
     "why": "「数はわざと少なくした」 — the bare noun 数 is かず; すう is the bound compound form"},
    {"article": "bunki-essay-n1-memory", "surface": "縁", "was": "えん", "reading": "ふち",
     "next": "に", "count": 1,
     "why": "「忘却の縁にある項目」 — 縁 as 'edge/rim' is ふち; えん is 'connection/fate'"},
    # --- found by this author's own full-shelf reading audit ---
    {"article": "bunki-graded-n5-station", "surface": "七", "was": "なな", "reading": "しち",
     "next": "時", "count": 1,
     "why": "七時 is しちじ; UniDic supplies the bare-numeral なな, teaching ななじ in an N5 clock text"},
    {"article": "bunki-graded-n5-neighbour", "surface": "一日", "was": "ついたち", "reading": "いちにち",
     "count": 1,
     "why": "「私の一日を明るくします」 — 'a day', いちにち; ついたち is the 1st of the month"},
    {"article": "bunki-graded-n4-market", "surface": "市場", "was": "しじょう", "reading": "いちば",
     "count": 2,
     "why": "a physical morning market with fishmongers is いちば; しじょう is the abstract/financial sense"},
    {"article": "bunki-graded-n4-market", "surface": "十", "was": "じゅう", "reading": "じゅっ",
     "next": "個", "count": 1,
     "why": "十個 is じゅっこ; the bare じゅう renders じゅうこ"},
    {"article": "bunki-essay-n2-translation", "surface": "四", "was": "よん", "reading": "よっ",
     "next": "つ", "count": 1,
     "why": "四つ is よっつ; the bare numeral よん renders よんつ"},
    {"article": "bunki-essay-n1-memory", "surface": "何", "was": "なん", "reading": "なに",
     "next": ["が", "を"], "count": 4,
     "why": "何が/何を are なにが・なにを. Deliberately anchored: 何度 in this same article is "
            "なんど and must NOT be touched — the reason this hook is context-keyed"},
    # 日本語 → にほんご. にっぽん is a real reading of 日本, but the compound 日本語 is
    # にほんご essentially without exception, and it is the single most
    # learner-critical word on the shelf.
    *[
        {"article": a, "surface": "日本", "was": "にっぽん", "reading": "にほん", "next": "語", "count": 1,
         "why": "日本語 is にほんご"}
        for a in (
            "bunki-graded-n5-kitchen",
            "bunki-graded-n5-neighbour",
            "bunki-graded-n4-letter",
            "bunki-graded-n3-radio",
            "bunki-essay-n2-translation",
        )
    ],
]


def _neighbour_matches(tokens, i, offset, want) -> bool:
    if want is None:
        return True
    j = i + offset
    if not (0 <= j < len(tokens)):
        return False
    surface = tokens[j]["s"]
    return surface in want if isinstance(want, list) else surface == want


def apply_reading_overrides(article_id: str, tokens: list[dict]) -> int:
    """Repair named homograph readings. Loud on any drift, silent otherwise."""
    applied = 0
    for rule in READING_OVERRIDES:
        if rule["article"] != article_id:
            continue
        hits = [
            i
            for i, t in enumerate(tokens)
            if t["s"] == rule["surface"]
            and _neighbour_matches(tokens, i, 1, rule.get("next"))
            and _neighbour_matches(tokens, i, -1, rule.get("prev"))
        ]
        if len(hits) != rule["count"]:
            raise SystemExit(
                f"reading override drift in {article_id}: {rule['surface']!r} "
                f"(next={rule.get('next')!r}) matched {len(hits)} tokens, expected "
                f"{rule['count']} — the text or the tokeniser changed; re-audit, "
                "do not adjust the count blindly"
            )
        for i in hits:
            got = tokens[i]["r"]
            if got != rule["was"]:
                raise SystemExit(
                    f"reading override stale in {article_id}: {rule['surface']!r} "
                    f"now reads {got!r}, override expected to replace {rule['was']!r} "
                    "— the tokeniser's answer changed; re-audit before touching it"
                )
            tokens[i]["r"] = rule["reading"]
            tokens[i]["f"] = bc.furigana_pairs(rule["surface"], rule["reading"])
            applied += 1
    return applied


_base_tokenise_paragraphs = ba.tokenise_paragraphs
_TEXT_TO_ID: dict[str, str] = {}
_OVERRIDES_APPLIED = 0


def tokenise_paragraphs(text: str, tagger, ruby_markup: str | None = None):
    """The pipeline's tokeniser, plus the override pass for WP9b texts only.

    The lookup is keyed by the article text, and `_TEXT_TO_ID` only ever holds
    the 14 WP9b texts — so the 26 pre-existing articles cannot be reached by
    this hook even in principle, which is what keeps their bytes stable.
    """
    global _OVERRIDES_APPLIED
    tokens, para_starts = _base_tokenise_paragraphs(text, tagger, ruby_markup=ruby_markup)
    article_id = _TEXT_TO_ID.get(text)
    if article_id:
        _OVERRIDES_APPLIED += apply_reading_overrides(article_id, tokens)
    return tokens, para_starts



def wp9b_entries() -> list[dict]:
    """The 14 authored texts, carried with honest original-lane provenance."""
    rows = [
        json.loads(line)
        for line in ORIGINALS.read_text("utf-8").splitlines()
        if line.strip()
    ]
    out: list[dict] = []
    for rec in rows:
        lane = rec["lane"]
        if lane not in LANE_LABEL:
            raise SystemExit(f"{rec['id']}: unknown lane {lane!r}")
        out.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "text": rec["text"].replace("\r\n", "\n").strip(),
                "source": "bunki-wp9b-reading-catalog",
                "sourceLabel": LANE_LABEL[lane] + " · Bunki",
                "pool": "original",
                "licence": "Bunki original",
                "attribution": "Bunki original text",
                "url": "",
                "date": "",
                "rubySource": "tokenizer",
                # author-stated target band — an authoring intent, NOT a
                # measurement. The measured signals sit in `grading`, computed
                # independently on this exact text and never averaged with it.
                "authorLevel": rec["level"],
                "lane": lane,
            }
        )
    return out


_base_collect = ba.collect_articles


def collect_articles() -> list[dict]:
    articles = _base_collect()
    seen = {a["file"] for a in articles}
    extras = wp9b_entries()
    for a in extras:
        a["file"] = ba.slugify(a["id"]) + ".json"
        if a["file"] in seen:
            raise SystemExit(f"article file collision: {a['file']}")
        seen.add(a["file"])
        _TEXT_TO_ID[a["text"]] = a["id"]
    return articles + extras


ba.collect_articles = collect_articles
ba.tokenise_paragraphs = tokenise_paragraphs
ba.SOURCES = {
    **ba.SOURCES,
    "original": [*ba.SOURCES["original"], WP9B_SOURCE],
}


def main() -> int:
    rc = ba.main()
    expected = sum(r["count"] for r in READING_OVERRIDES)
    if _OVERRIDES_APPLIED != expected:
        raise SystemExit(
            f"reading overrides: applied {_OVERRIDES_APPLIED}, declared {expected} "
            "— an article carrying overrides was not built"
        )
    print(f"· reading overrides applied: {_OVERRIDES_APPLIED}/{expected}")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
