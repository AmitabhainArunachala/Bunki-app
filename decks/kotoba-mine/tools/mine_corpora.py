#!/usr/bin/env python3
"""Open Japanese corpora mirrored on GitHub → mining/corpora/<n>.json

Sources (see research_notes/…/github_web_corpora.md for re-clone commands):
  livedoor news corpus (CC BY-ND 2.1 JP: quote verbatim with credit)   news
  Japanese Wikinews via Japanese-Fakenews-Dataset, real rows only (CC BY 2.5)   news
  KFTT / JaQuAD / JSQuAD / Wikipedia Annotated Corpus (Wikipedia, CC BY-SA)   wiki
  UD_Japanese-GSD (web: blogs, reviews, Wikipedia; CC BY-SA 4.0)   other
  WRIME (SNS posts; CC BY-NC-ND 4.0, personal study only)   social
KWDLC is left out: its pages were never licensed.
Usage: python3 tools/mine_corpora.py <webcorp dir>
"""
from __future__ import annotations

import csv
import glob
import json
import re
import sys
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rank import VARIANTS  # noqa: E402

PER_SOURCE = 25
split = lambda t: [x.strip() for x in re.split(r"(?<=[。！？])|\n", t) if x.strip()]  # noqa: E731
LD_CAT = {"dokujo-tsushin": "独女通信", "it-life-hack": "ITライフハック", "kaden-channel": "家電チャンネル",
          "livedoor-homme": "livedoor HOMME", "movie-enter": "MOVIE ENTER", "peachy": "Peachy",
          "smax": "エスマックス", "sports-watch": "Sports Watch", "topic-news": "トピックニュース"}


def sources(w: str):
    for f in sorted(glob.glob(w + "/livedoor_ldcc/text/*/*-[0-9]*.txt")):
        lines = open(f, encoding="utf-8").read().splitlines()
        cat = Path(f).parent.name
        meta = {"kind": "news", "site": f"livedoor ニュース／{LD_CAT.get(cat, cat)}", "url": lines[0].strip(),
                "licence": "CC BY-ND 2.1 JP (livedoor)", "title": lines[2].strip() if len(lines) > 2 else ""}
        for s in split("\n".join(l for l in lines[3:] if not l.startswith(("【関連", "■", "http")))):
            yield "livedoor", s, meta
    for r in csv.DictReader(open(w + "/Japanese-Fakenews-Dataset/fakenews.csv", encoding="utf-8")):
        if r.get("isfake") == "0":
            for s in split(r["context"]):
                yield "wikinews", s, {"kind": "news", "site": "ja.wikinews.org", "url": "", "licence": "CC BY 2.5 (Wikinews)"}
    wiki = {"kind": "wiki", "site": "ja.wikipedia.org", "url": "", "licence": "CC BY-SA (Wikipedia)"}
    for f in glob.glob(w + "/JGLUE/datasets/jsquad-v1.3/*.json") + glob.glob(w + "/JaQuAD/data/*/*.json"):
        for a in json.load(open(f, encoding="utf-8"))["data"]:
            for p in a["paragraphs"]:
                for s in split(p["context"].split("[SEP]", 1)[-1]):
                    yield "wikipedia", s, {**wiki, "title": a.get("title", "")}
    for f in glob.glob(w + "/WikipediaAnnotatedCorpus/org/**/*.org", recursive=True):
        for l in open(f, encoding="utf-8"):
            if not l.startswith("#") and l.strip():
                yield "wikipedia", l.strip(), wiki
    for f in glob.glob(w + "/kftt/datasets/public/kftt-data-1.0/data/orig/*.ja"):
        for l in open(f, encoding="utf-8"):
            if "（" not in l:
                yield "kftt", l.strip(), {**wiki, "site": "ja.wikipedia.org（KFTT）"}
    for f in glob.glob(w + "/UD_Japanese-GSD/*.conllu"):
        for l in open(f, encoding="utf-8"):
            if l.startswith("# text ="):
                yield "gsd", l[9:].strip(), {"kind": "other", "site": "ウェブ（UD Japanese GSD）", "url": "", "licence": "CC BY-SA 4.0"}
    for f in glob.glob(w + "/wrime/*.tsv"):
        for r in csv.DictReader(open(f, encoding="utf-8-sig"), delimiter="\t"):
            yield "wrime", r["Sentence"].replace("\\n", " ").strip(), {"kind": "social", "site": "SNS投稿（WRIME）", "url": "", "licence": "CC BY-NC-ND 4.0"}


def main() -> int:
    w = sys.argv[1]
    entries = json.loads((DECK / "source" / "entries.json").read_text("utf-8"))
    keys = {e["n"]: [k for k in [e["term"], *VARIANTS.get(e["term"], [])] if len(k) >= 2] for e in entries}
    found: dict[int, list[dict]] = {n: [] for n in keys}
    per: dict[tuple, int] = {}
    seen = set()
    total = 0
    for name, s, meta in sources(w):
        total += 1
        if not 10 <= len(s) <= 70 or s in seen:
            continue
        for n, ks in keys.items():
            if any(k in s for k in ks) and per.get((n, name), 0) < PER_SOURCE:
                per[(n, name)] = per.get((n, name), 0) + 1
                seen.add(s)
                found[n].append({"ja": s, **meta})
    out = DECK / "mining" / "corpora"
    out.mkdir(exist_ok=True)
    for n, c in found.items():
        if c:
            (out / f"{n}.json").write_text(json.dumps({"n": n, "candidates": c}, ensure_ascii=False, indent=0), "utf-8")
    print(f"{total} sentences read · {sum(1 for c in found.values() if c)} words with corpus sentences · {sum(map(len, found.values()))} candidates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
