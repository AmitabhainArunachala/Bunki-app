#!/usr/bin/env python3
"""Aozora Bunko (public domain) → mining/aozora/<n>.json

Reads a local checkout of aozorahack/aozorabunko_text (cards/*/files/*/*.txt,
Shift_JIS with 《ruby》 ｜ ［＃notes］ markup), strips the markup, splits
sentences, and keeps every sentence that contains a word or one of its spellings.
Usage: python3 tools/mine_aozora.py <path to aozorabunko_text>
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rank import VARIANTS  # noqa: E402

RUBY = re.compile(r"《[^》]*》|｜|［＃[^］]*］|〔[^〕]*〕")
OLD = re.compile(r"[ゐゑヰヱゝゞ〳〴〵云]")
SENT = re.compile(r"[^。！？\n]*[。！？]」?|「[^「」\n]{4,}」")


def body(raw: str) -> str:
    lines = raw.splitlines()
    dash = [i for i, l in enumerate(lines) if l.startswith("-----")]
    start = dash[1] + 1 if len(dash) >= 2 else 2
    end = next((i for i, l in enumerate(lines) if l.startswith("底本：")), len(lines))
    return RUBY.sub("", "\n".join(lines[start:end]))


def main() -> int:
    root = Path(sys.argv[1])
    entries = json.loads((DECK / "source" / "entries.json").read_text("utf-8"))
    keys = {e["n"]: [k for k in [e["term"], *VARIANTS.get(e["term"], [])] if len(k) >= 2] for e in entries}
    found: dict[int, list[dict]] = {n: [] for n in keys}
    files = sorted(root.glob("cards/*/files/*/*.txt"))
    for f in files:
        try:
            raw = f.read_bytes().decode("cp932", errors="strict")
        except UnicodeDecodeError:
            continue
        title = raw.splitlines()[0].strip() if raw else ""
        author = raw.splitlines()[1].strip() if raw.count("\n") > 1 else ""
        text = body(raw)
        if len(OLD.findall(text)) > 3:
            continue  # old spelling throughout
        for m in SENT.finditer(text):
            s = m.group(0).strip().lstrip("　")
            if not 10 <= len(s) <= 70:
                continue
            for n, ks in keys.items():
                if len(found[n]) < 60 and any(k in s for k in ks):
                    card = f.parts[-4]
                    found[n].append({"ja": s, "title": f"{title}（{author}）", "src": f"aozora:{card}",
                                     "site": f"青空文庫『{title}』{author}",
                                     "url": f"https://www.aozora.gr.jp/cards/{card}/"})
    out = DECK / "mining" / "aozora"
    out.mkdir(exist_ok=True)
    for n, cands in found.items():
        if cands:
            (out / f"{n}.json").write_text(json.dumps({"n": n, "candidates": cands}, ensure_ascii=False, indent=0), "utf-8")
    print(f"{len(files)} files · {sum(1 for c in found.values() if c)} words with Aozora sentences")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
