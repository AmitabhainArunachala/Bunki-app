"""Reproducible browsing hints for the curated shelf; never learner ratings.

Every writer of data/articles/index.json that mints or regrades shelf rows
(build_articles.py, feed_fresh.py, feed_ingest.py) attaches these, so the
shelf's topic/JLPT/grade filters see a new reading without a manual step.
"""

import json
import re
from collections import Counter
from pathlib import Path

KANKEN = Path(__file__).resolve().parents[1] / "data/proprietary_safe/kanken.json"


def facets(article, levels):
    vector = article.get("grading", {}).get("signals", {}).get("jlpt_lexicon", {}).get("band_vector", {})
    total = sum(vector.get(key, 0) for key in ["n5", "n4", "n3", "n2", "n1"])
    cumulative = 0
    level = None
    for key in ["n5", "n4", "n3", "n2", "n1"]:
        cumulative += vector.get(key, 0)
        if total and cumulative / total >= 0.85:
            level = key.upper()
            break
    counts = Counter(levels[c]["kr"] for c in article.get("text", "") if c in levels)
    total_kanji = sum(counts.values())
    covered = 0
    grade = None
    for rank, count in sorted(counts.items()):
        covered += count
        if total_kanji and covered / total_kanji >= 0.90:
            grade = str(rank) if rank <= 6 else "secondary"
            break
    text = article.get("title", "") + " " + article.get("titleEn", "") + " " + article.get("text", "")[:800]
    topics = set([article["topic"]]) if article.get("topic") else set()
    for topic, pattern in {
        "technology": r"人工知能|ロボット|スタートアップ|デジタル|半導体|インターネット|\b(?:AI|robot|startup)\b",
        "science": r"科学|研究|宇宙|衛星|science|research",
        "politics": r"選挙|政権|首相|大統領|議会|election",
        "environment": r"環境|気候|森林|種子|自然保護|climate|seeds",
        "culture": r"芸術|美術|文学|音楽|文化|\b(?:art|culture)\b",
        "sports": r"野球|選手|大会|五輪|サッカー|sports",
        "economy": r"経済|企業|市場|財政|金融|economy",
    }.items():
        if re.search(pattern, text, re.I):
            topics.add(topic)
    if article.get("source") == "aozorabunko-clean" or str(article.get("sourceLabel", "")).startswith(("随筆", "古典")):
        topics.add("literature")
    if article.get("lane") == "news" or "wikinews" in article.get("source", ""):
        topics.add("news")
    forms = sorted({token["b"] for token in article.get("tokens", []) if token.get("c") and token.get("b")})
    return {
        "topics": sorted(topics),
        "jlpt": level,
        "schoolGrade": grade,
        "forms": forms,
        "method": "bundled-vocabulary-85-percent;known-kanji-90-percent;source-and-text-topics/1",
    }


def attach_reading_facets(index: dict, articles_dir: Path) -> None:
    """Recompute readingFacets on every shelf row from its body on disk."""
    levels = json.loads(KANKEN.read_text("utf-8"))["levels"]
    for row in index["articles"]:
        article = json.loads((articles_dir / row["file"]).read_text("utf-8"))
        row["readingFacets"] = facets({**row, **article}, levels)
