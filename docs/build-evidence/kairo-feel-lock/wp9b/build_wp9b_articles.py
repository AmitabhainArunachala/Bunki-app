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

ORIGINALS = HERE / "originals.jsonl"

LANE_LABEL = {"graded": "段階別読み物", "essay": "随筆"}

WP9B_SOURCE = {
    "name": "bunki-wp9b-reading-catalog",
    "licence": "Bunki original",
    "attribution": "Bunki original graded texts and essays (WP9b shelf expansion)",
    "url": "",
}


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
    return articles + extras


ba.collect_articles = collect_articles
ba.SOURCES = {
    **ba.SOURCES,
    "original": [*ba.SOURCES["original"], WP9B_SOURCE],
}


if __name__ == "__main__":
    raise SystemExit(ba.main())
