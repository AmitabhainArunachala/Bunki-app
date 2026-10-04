#!/usr/bin/env python3
"""mining/ranked.json → source/mined.json, the sentences the deck is built from.

Keeps the ranker's picks per word with their source. The final choice comes
from source/review/*.json, written by a reader who checked every candidate:
{"<n>": [{"ja": "<sentence from the word's picks or alternates>", "en": "<English>"},
         {"ja": "…", "form": "…", "en": "…", "original": true}]}   ← written for the deck
A word without a review entry keeps the ranker's picks.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent
SRC = DECK / "source"
sys.path.insert(0, str(DECK / "tools"))
from rights import UNVERIFIED, UNVERIFIED_AOZORA, UNVERIFIED_WEB  # noqa: E402

SITE = {"tatoeba": "Tatoeba", "example-bank": "例文集（Tanaka/SNOW）", "news": "ja.wikinews.org", "literature": "青空文庫"}
LICENCE = {"tatoeba": "CC BY 2.0 FR", "news": "CC BY 2.5 (Wikinews)", "literature": UNVERIFIED_AOZORA, "example-bank": "CC BY"}


def entry(p: dict) -> dict:
    kind = p["kind"] if p["kind"] != "web" else "other"
    url = p.get("url") or ""
    if not url and p.get("src", "").startswith("tatoeba:"):
        url = f"https://tatoeba.org/ja/sentences/show/{p['src'].split(':', 1)[1]}"
    return {
        "ja": p["ja"],
        "form": p["form"],
        "en": p.get("en", ""),
        "kind": kind,
        "site": p.get("site") or SITE.get(kind, ""),
        "url": url,
        "licence": p.get("licence") or LICENCE.get(kind, UNVERIFIED),
        **{k: p[k] for k in ("author", "translator") if p.get(k)},
    }


def main() -> int:
    ranked = json.loads((DECK / "mining" / "ranked.json").read_text("utf-8"))
    review: dict = {}
    for f in sorted((SRC / "review").glob("*.json")):
        review.update(json.loads(f.read_text("utf-8")))
    out = {}
    for n, v in ranked.items():
        pool = {p["ja"]: p for p in v["picked"] + v["alts"]}
        # a reviewer may also take a line straight from the word's web results
        web = DECK / "mining" / "web" / f"{n}.json"
        if web.exists():
            for c in json.loads(web.read_text("utf-8"))["candidates"]:
                pool.setdefault(c["ja"], {**c, "licence": c.get("licence") or UNVERIFIED_WEB})
        rows = []
        if n in review:
            for r in review[n]:
                if r.get("original"):
                    rows.append({"ja": r["ja"], "form": r["form"], "en": r["en"], "kind": "original",
                                 "site": "書き下ろし（このデッキ用）", "url": "", "licence": "Bunki original"})
                elif r["ja"] in pool:
                    rows.append(entry({**pool[r["ja"]], "en": r.get("en") or pool[r["ja"]].get("en", "")}))
                else:
                    raise SystemExit(f"review {n}: not a candidate: {r['ja']}")
        else:
            rows = [entry(p) for p in v["picked"]]
        if rows:
            out[n] = rows
    (SRC / "mined.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    missing = sum(1 for rows in out.values() for r in rows if not r["en"])
    print(f"mined.json: {len(out)} words, {sum(map(len, out.values()))} sentences, {missing} without English")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
