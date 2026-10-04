#!/usr/bin/env python3
"""Massive-context passages: for every word, real 2–4 sentence stretches of native
text around an occurrence (MCD fronts). Reads full texts, not single lines:
  livedoor news articles (CC BY-ND 2.1 JP, verbatim with credit)   news
  Japanese Wikinews articles, real rows only (CC BY 2.5)           news
  Wikipedia paragraphs: JaQuAD / JSQuAD / WAC (CC BY-SA)           wiki
  Aozora Bunko prose (licence per work, read from its trailer)     literature
Output: mining/passages/<n>.json  {"n", "candidates": [{ja, at, src…}]}
Usage: python3 tools/mine_passages.py <webcorp dir> <aozora dir>
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
from mine_aozora import OLD, body  # noqa: E402
from mine_corpora import LD_CAT  # noqa: E402
from rank import VARIANTS  # noqa: E402
from rights import aozora_work  # noqa: E402

SENT = re.compile(r"[^。！？]*[。！？]」?")
PER_WORD = 40


def paragraphs(w: str, aozora: str):
    for f in sorted(glob.glob(w + "/livedoor_ldcc/text/*/*-[0-9]*.txt")):
        lines = open(f, encoding="utf-8").read().splitlines()
        cat = Path(f).parent.name
        meta = {"kind": "news", "site": f"livedoor ニュース／{LD_CAT.get(cat, cat)}", "url": lines[0].strip(),
                "licence": "CC BY-ND 2.1 JP (livedoor)", "title": lines[2].strip() if len(lines) > 2 else ""}
        for p in lines[3:]:
            if not p.startswith(("【関連", "■", "http", "・")):
                yield p, meta
    for r in csv.DictReader(open(w + "/Japanese-Fakenews-Dataset/fakenews.csv", encoding="utf-8")):
        if r.get("isfake") == "0":
            for p in r["context"].split("\n"):
                yield p, {"kind": "news", "site": "ja.wikinews.org", "url": "", "licence": "CC BY 2.5 (Wikinews)", "title": r.get("title", "")}
    wiki = {"kind": "wiki", "site": "ja.wikipedia.org", "url": "", "licence": "CC BY-SA (Wikipedia)"}
    for f in glob.glob(w + "/JGLUE/datasets/jsquad-v1.3/*.json") + glob.glob(w + "/JaQuAD/data/*/*.json"):
        for a in json.load(open(f, encoding="utf-8"))["data"]:
            for p in a["paragraphs"]:
                yield p["context"].split("[SEP]", 1)[-1].strip(), {**wiki, "title": a.get("title", "")}
    for f in glob.glob(w + "/WikipediaAnnotatedCorpus/org/**/*.org", recursive=True):
        lines = [l.strip() for l in open(f, encoding="utf-8") if not l.startswith("#") and l.strip() and KANJI_OR_END.search(l)]
        yield "".join(lines), wiki
    for f in sorted(Path(aozora).glob("cards/*/files/*/*.txt")):
        try:
            raw = f.read_bytes().decode("cp932")
        except UnicodeDecodeError:
            continue
        text = body(raw)
        if len(OLD.findall(text)) > 3:
            continue
        meta = aozora_work(raw, f)  # licence from the trailer; title, author, translator, work URL from the header
        for p in text.split("\n"):
            yield p.strip().lstrip("　"), meta


KANJI_OR_END = re.compile(r"[。！？]")


def windows(sents: list[str], i: int):
    """2–4 sentence stretches containing sentence i, 60–220 characters"""
    for lo in range(max(0, i - 2), i + 1):
        for hi in range(i + 1, min(len(sents), lo + 4) + 1):
            if hi - lo < 2:
                continue
            text = "".join(sents[lo:hi])
            if 60 <= len(text) <= 220:
                yield lo, hi, text


def main() -> int:
    w, aozora = sys.argv[1], sys.argv[2]
    entries = json.loads((DECK / "source" / "entries.json").read_text("utf-8"))
    keys = {e["n"]: [k for k in [e["term"], *VARIANTS.get(e["term"], [])] if len(k) >= 2] for e in entries}
    found: dict[int, list[dict]] = {n: [] for n in keys}
    seen = set()
    for para, meta in paragraphs(w, aozora):
        if len(para) < 40:
            continue
        sents = [s.strip() for s in SENT.findall(para) if s.strip()]
        if len(sents) < 2:
            continue
        for i, s in enumerate(sents):
            for n, ks in keys.items():
                if len(found[n]) >= PER_WORD or not any(k in s for k in ks):
                    continue
                for lo, hi, text in windows(sents, i):
                    if text in seen:
                        continue
                    seen.add(text)
                    found[n].append({"ja": text, "target_sentence": s, **meta})
                    break
    out = DECK / "mining" / "passages"
    out.mkdir(exist_ok=True)
    for n, c in found.items():
        if c:
            (out / f"{n}.json").write_text(json.dumps({"n": n, "candidates": c}, ensure_ascii=False, indent=0), "utf-8")
    print(f"{sum(1 for c in found.values() if c)} words with passages · {sum(map(len, found.values()))} passages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
