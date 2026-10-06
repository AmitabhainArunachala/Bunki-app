#!/usr/bin/env python3
"""Per-word sheets for the MCD pass: mining/mcd_<name>.json
Usage: python3 tools/mcd_sheet.py <parts>   (splits all words into <parts> sheets)"""
import glob
import json
import sys
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent
ranked = json.loads((DECK / "mining" / "passages_ranked.json").read_text("utf-8"))
mined = json.loads((DECK / "source" / "mined.json").read_text("utf-8"))
entries = json.loads((DECK / "source" / "entries.json").read_text("utf-8"))
cards = {c["n"]: c for f in glob.glob(str(DECK / "source" / "v2" / "*.json")) for c in json.load(open(f, encoding="utf-8"))["cards"]}
parts = int(sys.argv[1])
done = set()
for f in glob.glob(str(DECK / "source" / "mcd" / "*.json")):
    done |= set(json.load(open(f, encoding="utf-8")))
todo = [e for e in entries if str(e["n"]) not in done]
for i in range(parts):
    sheet = []
    for e in todo[i::parts]:
        n, c = e["n"], cards[e["n"]]
        sheet.append({
            "n": n, "term": e["term"], "reading": e["reading"], "gloss": e["gloss"], "meaning": c["meaning"], "def_ja": c["def_ja"],
            "passages": [{"ja": p["ja"], "site": p["site"], "kind": p["kind"]} for p in ranked.get(str(n), {}).get("passages", [])[:8]],
            "sentences": [{"ja": s["ja"], "site": s["site"], "en": s["en"]} for s in mined.get(str(n), [])],
        })
    (DECK / "mining" / f"mcd_s{i + 1}.json").write_text(json.dumps(sheet, ensure_ascii=False, indent=1), "utf-8")
    print(f"mining/mcd_s{i + 1}.json: {len(sheet)} words")
