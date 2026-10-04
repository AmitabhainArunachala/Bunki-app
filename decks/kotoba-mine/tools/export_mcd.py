#!/usr/bin/env python3
"""source/mcd/*.json (chosen + written passages) → source/mcd.json, with each real
passage's source taken from the mined candidates."""
import glob
import json
import re
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent
SRC = DECK / "source"
ranked = json.loads((DECK / "mining" / "passages_ranked.json").read_text("utf-8"))
mined = json.loads((SRC / "mined.json").read_text("utf-8"))
entries = {str(e["n"]): e for e in json.loads((SRC / "entries.json").read_text("utf-8"))}
import sys  # noqa: E402

sys.path.insert(0, str(DECK / "tools"))
from rank import VARIANTS  # noqa: E402

out = {}
for f in sorted(glob.glob(str(SRC / "mcd" / "*.json"))):
    for n, rows in json.load(open(f, encoding="utf-8")).items():
        pool = {p["ja"]: p for p in ranked.get(n, {}).get("passages", [])}
        pool.update({s["ja"]: s for s in mined.get(n, [])})
        e = entries[n]
        keys = sorted([e["term"], *VARIANTS.get(e["term"], [])], key=len, reverse=True)
        res = []
        for r in rows:
            if r.get("original"):
                if r["form"] not in r["ja"]:
                    raise SystemExit(f"{n}: form {r['form']} not in {r['ja']}")
                res.append({"ja": r["ja"], "form": r["form"], "en": r["en"], "kind": "original",
                            "site": "書き下ろし（このデッキ用）", "url": "", "licence": "Bunki original", "title": ""})
                continue
            p = pool.get(r["ja"])
            if not p:
                raise SystemExit(f"{n}: not a candidate: {r['ja'][:40]}")
            form = p.get("form") or next((k for k in keys if k in r["ja"]), None)
            if not form:
                m = re.search(re.escape(e["term"][:-1]) + r"\w", r["ja"]) if len(e["term"]) > 1 else None
                form = m.group(0) if m else None
            if not form:
                raise SystemExit(f"{n}: word not found in {r['ja'][:40]}")
            res.append({"ja": r["ja"], "form": form, "en": r["en"], "kind": p.get("kind", "other"), "site": p.get("site", ""),
                        "url": p.get("url", ""), "licence": p.get("licence", ""), "title": p.get("title", "")})
        out[n] = res
(SRC / "mcd.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
orig = sum(1 for rows in out.values() for r in rows if r["kind"] == "original")
print(f"mcd.json: {len(out)} words · {sum(map(len, out.values()))} passages ({orig} written for the deck)")
