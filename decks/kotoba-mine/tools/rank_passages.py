#!/usr/bin/env python3
"""Rank mined passages (MCD fronts) per word → mining/passages_ranked.json

Same filters as single sentences (no fragments, classical grammar, old spelling,
list residue), applied to the whole passage, plus: the first sentence must open
the passage cleanly, and the passage should be dense with ordinary words so the
one blank is the only real unknown (1T)."""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rank  # noqa: E402

DECK = HERE.parent


def score(c, keys, tagger, joyo, jlpt):
    ja = re.sub(r"\s+(?=[^\x00-\x7f])|(?<=[^\x00-\x7f])\s+", "", c["ja"].strip())
    if rank.BAD_CHARS.search(ja) or rank.OLD_KANA.search(ja) or "…" in ja or "..." in ja:
        return None
    if ja.count("「") != ja.count("」") or ja.count("（") != ja.count("）") or "(" in ja:
        return None
    if ja[0] in "・-–—*※（[［【〈<>＞" or ja.startswith(rank.CONNECTIVE_START):
        return None
    tokens = list(tagger(ja))
    if tokens[0].feature.pos1 in ("助詞", "接続詞", "助動詞"):
        return None
    if any(str(getattr(t.feature, "cType", "") or "").startswith("文語") for t in tokens):
        return None
    span = rank.match_span(tokens, ja, keys)
    if not span:
        return None
    if sum(ja.count(k) for k in keys[:1]) > 2:
        return None
    s = 1.0
    if ja.startswith(rank.DEMONSTRATIVE_START):
        s *= 0.75
    n = len(ja)
    s *= 1.0 if 80 <= n <= 170 else 0.8
    a, b, _ = span
    pos = unknown = proper = 0
    for t in tokens:
        lo, hi = pos, pos + len(t.surface)
        pos = hi
        if lo >= a and hi <= b:
            continue
        if getattr(t.feature, "pos2", "") == "固有名詞":
            proper += 1
            continue
        if t.feature.pos1 in ("名詞", "動詞", "形容詞", "副詞") and rank.KANJI.search(t.surface) and getattr(t.feature, "pos2", "") != "数詞":
            lemma = t.feature.orthBase or t.surface
            if lemma not in jlpt and t.surface not in jlpt and rank.FREQ.get(lemma, rank.FREQ.get(t.surface, 0)) < 2e-6:
                unknown += 1
    rare = sum(1 for ch in ja[:a] + ja[b:] if rank.KANJI.match(ch) and ch not in joyo)
    s *= 0.88 ** max(0, unknown - 2)
    s *= 0.75 ** rare
    s *= 0.93 ** min(proper, 6)
    s *= {"news": 1.0, "wiki": 0.9, "literature": 0.85}.get(c["kind"], 0.9)
    return s, {"ja": ja, "form": span[2], "at": a, "unknown": unknown, "rare_kanji": rare, "proper": proper}


def main() -> int:
    import fugashi

    tagger = fugashi.Tagger()
    joyo, jlpt, freq = rank.load_tables()
    rank.FREQ.update(freq)
    entries = json.loads((DECK / "source" / "entries.json").read_text("utf-8"))
    out = {}
    for e in entries:
        f = DECK / "mining" / "passages" / f"{e['n']}.json"
        if not f.exists():
            continue
        keys = [e["term"], *rank.VARIANTS.get(e["term"], [])]
        scored = []
        for c in json.loads(f.read_text("utf-8"))["candidates"]:
            r = score(c, keys, tagger, joyo, jlpt)
            if r:
                s, info = r
                scored.append({**info, "score": round(s, 3), "kind": c["kind"], "site": c["site"], "url": c.get("url", ""),
                               "licence": c["licence"], "title": c.get("title", ""),
                               **{k: c[k] for k in ("author", "translator", "workId") if c.get(k)}})
        scored.sort(key=lambda x: -x["score"])
        # spread across sources: no more than 3 from one site in the shortlist
        per = Counter()
        short = []
        for x in scored:
            if per[x["site"]] < 3:
                short.append(x)
                per[x["site"]] += 1
            if len(short) >= 10:
                break
        out[str(e["n"])] = {"term": e["term"], "passages": short}
    (DECK / "mining" / "passages_ranked.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), "utf-8")
    print(f"{sum(1 for v in out.values() if v['passages'])} words with ranked passages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
