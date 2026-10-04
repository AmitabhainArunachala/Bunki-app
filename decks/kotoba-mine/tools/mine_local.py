#!/usr/bin/env python3
"""Gather candidate example sentences for every word from the corpora already
in the repo (no ranking, no selection — that happens after the research).

Sources (all carried by the corridor with their licences):
  · example bank  prototypes/corridor/data/proprietary_safe/examples/s-*.json
                  Tanaka/Tatoeba (CC BY 2.0 FR), SNOW T15/T23 (CC BY 4.0) — with English
  · shelf + archive articles  prototypes/corridor/data/articles/**  (ja.wikinews CC BY 2.5,
                  Aozora PD, Bunki originals, …) — Japanese only
Output: decks/kotoba-mine/mining/local_candidates.json  {n: [{ja, en, src, licence}]}
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
DATA = REPO / "prototypes/corridor/data"
OUT = REPO / "decks/kotoba-mine/mining/local_candidates.json"
SRC = REPO / "decks/kotoba-mine/source/entries.json"


def forms(term: str) -> list[str]:
    """surface strings to look for: the term and, for inflecting words, its stem"""
    out = {term}
    if re.search(r"[うくぐすつぬぶむる]$", term) and len(term) > 1:
        out.add(term[:-1])  # verb stem (見分け / 背 …) — filtered again below
    if term.endswith("い") and len(term) > 2:
        out.add(term[:-1])
    return sorted(out, key=len, reverse=True)


def sentences_from_tokens(tokens: list) -> list[str]:
    buf, out = "", []
    for t in tokens:
        s = t["s"] if isinstance(t, dict) else t[0]
        buf += s
        if s in ("。", "！", "？"):
            out.append(buf.strip())
            buf = ""
    if buf.strip():
        out.append(buf.strip())
    return out


def main() -> None:
    entries = json.loads(SRC.read_text("utf-8"))
    bank_src = json.loads((DATA / "proprietary_safe/examples/manifest.json").read_text("utf-8"))["sources"]
    pool: list[tuple[str, str, str, str]] = []  # ja, en, src, licence
    for f in sorted((DATA / "proprietary_safe/examples").glob("s-*.json")):
        for tokens, en, si in json.loads(f.read_text("utf-8")):
            src = bank_src[si] if si < len(bank_src) else {"name": "?", "licence": "?"}
            pool.append(("".join(t[0] for t in tokens), en or "", src["name"], src["licence"]))
    idx = json.loads((DATA / "articles/index.json").read_text("utf-8"))
    files = [(a["file"], a.get("source", ""), a.get("licence", "")) for a in idx["articles"]]
    arch = json.loads((DATA / "articles/archive-index.json").read_text("utf-8"))
    files += [(a["file"], a.get("source", "ja.wikinews"), a.get("licence", "CC BY 2.5")) for a in arch["articles"]]
    for file, src, lic in files:
        p = DATA / "articles" / file
        if not p.exists():
            continue
        body = json.loads(p.read_text("utf-8"))
        for s in sentences_from_tokens(body.get("tokens", [])):
            if 6 <= len(s) <= 90:
                pool.append((s, "", f"{src}:{body.get('id', file)}", lic))
    seen = set()
    uniq = []
    for row in pool:
        if row[0] not in seen:
            seen.add(row[0])
            uniq.append(row)
    out = {}
    for e in entries:
        hits = []
        for ja, en, src, lic in uniq:
            for f in forms(e["term"]):
                if f in ja and (f == e["term"] or len(f) >= 2):
                    hits.append({"ja": ja, "en": en, "src": src, "licence": lic})
                    break
        out[e["n"]] = hits
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    counts = [len(v) for v in out.values()]
    print(f"pool {len(uniq)} sentences · words with ≥1: {sum(c > 0 for c in counts)}/{len(counts)} · ≥3: {sum(c >= 3 for c in counts)} · ≥10: {sum(c >= 10 for c in counts)}")
    zero = [e["term"] for e in entries if not out[e["n"]]]
    print("no candidate:", len(zero), "e.g.", zero[:30])


if __name__ == "__main__":
    main()
