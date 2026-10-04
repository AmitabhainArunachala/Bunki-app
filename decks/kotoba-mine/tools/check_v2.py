#!/usr/bin/env python3
"""Validate v2 card files: decks/kotoba-mine/source/v2/<module>.json.

Usage: python3 decks/kotoba-mine/tools/check_v2.py m01-money [...]   (or: all)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "source"
LEN = {1: (6, 24), 2: (14, 38), 3: (24, 60)}
END_JA = ("。", "？", "！")
BAD_START = ("それ", "そこで", "そして", "しかし", "だが", "また、", "さらに", "なので", "だから", "これ", "彼", "彼女")
BAD_ANY = ("…", "‥", "\n", "「", "」")
KANA = re.compile(r"^[ぁ-ゖァ-ヺー・]+$")
CARD_KEYS = {"n", "term", "reading", "meaning", "def_ja", "pos", "sentences", "tip"}


def body_len(s: str) -> int:
    return len(re.sub(r"[。、！？「」（）・\s]", "", s))


def check(mod: str) -> list[str]:
    errs: list[str] = []
    modules = json.loads((SRC / "modules.json").read_text())
    entries = {e["n"]: e for e in json.loads((SRC / "entries.json").read_text())}
    p = SRC / "v2" / f"{mod}.json"
    if not p.exists():
        return [f"{p} missing"]
    doc = json.loads(p.read_text())
    cards = doc.get("cards", [])
    want = modules[mod]["n"]
    got = [c.get("n") for c in cards]
    if sorted(got) != sorted(want):
        errs.append(f"card set differs: missing {sorted(set(want) - set(got))} extra {sorted(set(got) - set(want))}")
    seen_ja: set[str] = set()
    for c in cards:
        tag = f"#{c.get('n')} {c.get('term')}"
        if set(c) - CARD_KEYS:
            errs.append(f"{tag}: unknown keys {set(c) - CARD_KEYS}")
        e = entries.get(c.get("n"))
        if e and c.get("term") != e["term"]:
            errs.append(f"{tag}: term must be {e['term']!r}")
        term = c.get("term", "")
        single_kanji = len(term) == 1 and re.match(r"[一-鿿]", term)
        r = c.get("reading", "")
        if not r or (not single_kanji and not KANA.match(r)):
            errs.append(f"{tag}: reading must be kana")
        m = c.get("meaning", "")
        if not m or len(m) > 48:
            errs.append(f"{tag}: meaning required, ≤48 chars ({len(m)})")
        d = c.get("def_ja", "")
        if not d or len(d) > 32 or (len(term) > 1 and term in d):
            errs.append(f"{tag}: def_ja required, ≤32 chars, without the headword")
        if c.get("tip") and len(c["tip"]) > 110:
            errs.append(f"{tag}: tip ≤110 chars")
        ss = c.get("sentences", [])
        if [s.get("lv") for s in ss] != [1, 2, 3]:
            errs.append(f"{tag}: need exactly 3 sentences with lv 1,2,3 in order")
        for s in ss:
            ja, form, en, lv = s.get("ja", ""), s.get("form", ""), s.get("en", ""), s.get("lv")
            where = f"{tag} lv{lv}"
            if not form or ja.count(form) != 1:
                errs.append(f"{where}: form {form!r} must occur exactly once in {ja!r}")
            if single_kanji:
                if term not in form or len(form) < 2:
                    errs.append(f"{where}: kanji card form must be a compound containing {term}")
            else:
                k = max(1, len(term) - 1)
                if form[:k] != term[:k]:
                    errs.append(f"{where}: form {form!r} does not look like an inflection of {term!r}")
            if not ja.endswith(END_JA):
                errs.append(f"{where}: must end with 。？！")
            if ja.startswith(BAD_START):
                errs.append(f"{where}: starts with a word that needs earlier context")
            if any(b in ja for b in BAD_ANY):
                errs.append(f"{where}: no quotes, ellipses or line breaks")
            lo, hi = LEN.get(lv, (0, 999))
            if not lo <= body_len(ja) <= hi:
                errs.append(f"{where}: length {body_len(ja)} outside {lo}-{hi}")
            if not en or not en.rstrip().endswith((".", "?", "!", '"')):
                errs.append(f"{where}: English line required, ending with punctuation")
            if ja in seen_ja:
                errs.append(f"{where}: duplicate sentence")
            seen_ja.add(ja)
    return errs


def main() -> int:
    mods = sys.argv[1:]
    if mods == ["all"]:
        mods = list(json.loads((SRC / "modules.json").read_text()))
    bad = 0
    for mod in mods:
        errs = check(mod)
        print(f"{mod}: {'OK' if not errs else f'{len(errs)} problem(s)'}")
        for e in errs[:40]:
            print("  -", e)
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
