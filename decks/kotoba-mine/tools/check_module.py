#!/usr/bin/env python3
"""Validate one authored module file: decks/kotoba-mine/source/modules/<id>.json.

Usage: python3 decks/kotoba-mine/tools/check_module.py m01-money [m02-...]
Exit 0 when every module passes; prints each problem otherwise.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "source"
REGISTERS = {"日常", "会話", "俗語", "書き言葉", "報道", "法律", "学術", "専門", "古風", "文語"}
CARD_KEYS = {"n", "term", "reading", "gloss", "pos", "register", "def_ja", "sentences",
             "collocations", "confusables", "note", "kanji"}


def check(mod_id: str) -> list[str]:
    errs: list[str] = []
    modules = json.loads((SRC / "modules.json").read_text())
    entries = {e["n"]: e for e in json.loads((SRC / "entries.json").read_text())}
    want = modules[mod_id]["n"]
    path = SRC / "modules" / f"{mod_id}.json"
    if not path.exists():
        return [f"{path} missing"]
    doc = json.loads(path.read_text())
    if doc.get("id") != mod_id:
        errs.append("id mismatch")
    p = doc.get("passage", {})
    text = p.get("text", "")
    if not p.get("title") or not text:
        errs.append("passage.title/text required")
    if "\n\n" not in text:
        errs.append("passage.text needs paragraphs separated by a blank line")
    cards = doc.get("cards", [])
    got = [c.get("n") for c in cards]
    if sorted(got) != sorted(want):
        errs.append(f"card n set differs: missing {sorted(set(want)-set(got))} extra {sorted(set(got)-set(want))}")
    for c in cards:
        tag = f"#{c.get('n')} {c.get('term')}"
        extra = set(c) - CARD_KEYS
        if extra:
            errs.append(f"{tag}: unknown keys {extra}")
        e = entries.get(c.get("n"))
        if e and c.get("term") != e["term"]:
            errs.append(f"{tag}: term must equal source term {e['term']!r}")
        for k in ("reading", "gloss", "pos", "register", "def_ja"):
            if not isinstance(c.get(k), str) or not c.get(k).strip():
                errs.append(f"{tag}: {k} required")
        for r in c.get("register", "").split("・"):
            if r and r not in REGISTERS:
                errs.append(f"{tag}: register {r!r} not in {sorted(REGISTERS)}")
        s = c.get("sentences", [])
        if len(s) < 2:
            errs.append(f"{tag}: needs >= 2 sentences")
        for i, x in enumerate(s):
            form = x.get("form")
            if not form or form not in x.get("ja", ""):
                errs.append(f"{tag}: sentence {i} form {form!r} not found in ja")
            if not x.get("en"):
                errs.append(f"{tag}: sentence {i} en required")
        if s and s[0].get("ja") and s[0]["ja"] not in text:
            errs.append(f"{tag}: sentences[0].ja must be copied verbatim from passage.text")
        if not isinstance(c.get("collocations"), list):
            errs.append(f"{tag}: collocations must be a list")
        for x in c.get("confusables", []):
            if not x.get("term") or not x.get("note"):
                errs.append(f"{tag}: confusable needs term+note")
    return errs


def main() -> int:
    bad = 0
    for mod in sys.argv[1:]:
        errs = check(mod)
        print(f"{mod}: {'OK' if not errs else str(len(errs)) + ' problem(s)'}")
        for e in errs:
            print("  -", e)
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
