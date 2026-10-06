#!/usr/bin/env python3
"""Write one compact review sheet per word list: mining/review_<name>.json
Usage: python3 tools/review_input.py <name> <n> [<n> …]"""
import glob
import json
import sys
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent
ranked = json.loads((DECK / "mining" / "ranked.json").read_text("utf-8"))
entries = {e["n"]: e for e in json.loads((DECK / "source" / "entries.json").read_text("utf-8"))}
cards = {c["n"]: c for f in glob.glob(str(DECK / "source" / "v2" / "*.json")) for c in json.load(open(f, encoding="utf-8"))["cards"]}
name, ns = sys.argv[1], [int(x) for x in sys.argv[2:]]
sheet = []
for n in ns:
    v, e, c = ranked[str(n)], entries[n], cards[n]
    sheet.append({
        "n": n, "term": e["term"], "reading": e["reading"], "gloss": e["gloss"], "meaning": c["meaning"], "def_ja": c["def_ja"],
        "want": v["want"],
        "candidates": [{"ja": x["ja"], "kind": x["kind"], "site": x.get("site", ""), "en": x.get("en", ""), "picked": x in v["picked"]}
                       for x in v["picked"] + v["alts"]],
    })
(DECK / "mining" / f"review_{name}.json").write_text(json.dumps(sheet, ensure_ascii=False, indent=1), "utf-8")
print(f"mining/review_{name}.json: {len(sheet)} words, {sum(len(s['candidates']) for s in sheet)} candidates")
