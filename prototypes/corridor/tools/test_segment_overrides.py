#!/usr/bin/env python3
"""Checks for the segment-override lexicon (docs/content/segment-overrides.json) through
build_corridor.tokenise(), the one tokeniser the shelf, the examples and the decks share.
Run from anywhere: python3 prototypes/corridor/tools/test_segment_overrides.py
Needs: pip install fugashi==1.5.2 unidic-lite==1.0.8

1. Each entry's mistake is fixed in a real sentence: the run is re-split, the base names the
   headword a tap should open, the text is spelled unchanged, and UniDic still makes the mistake
   without the lexicon (so the fixture proves something).
2. The guards hold: いまどの (今どの), a sentence-initial なんで (why) and 暇なんで keep UniDic's split.
3. A lexicon entry whose tokens do not spell what it matches is refused at load.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_corridor as bc  # noqa: E402
import fugashi  # noqa: E402

TAGGER = fugashi.Tagger()
FAILS: list[str] = []


def ok(name: str, cond: bool, detail: str = "") -> None:
    print(f"{'  ok  ' if cond else ' FAIL '} {name}{'  — ' + detail if detail and not cond else ''}")
    if not cond:
        FAILS.append(name)


def split(text: str) -> list[tuple[str, str]]:
    return [(t["s"], t["b"]) for t in bc.tokenise(text, TAGGER)]


def raw(text: str) -> list[tuple[str, str]]:
    real = bc.load_segment_overrides()
    bc._SEGMENT_OVERRIDES = []
    try:
        return split(text)
    finally:
        bc._SEGMENT_OVERRIDES = real


# 1. each mistake, fixed
FIXED = [
    ("えきのこうばんで聞いた", ("こうばん", "交番"), [("こう", "こう"), ("ばん", "ばん")]),
    ("まどのそとを見た", ("まど", "窓"), [("ま", "ま"), ("どの", "どの")]),
    ("ぶちょうに話した", ("ぶちょう", "部長"), [("ぶちょう", "ふちょう")]),
    ("戻ってくるのは相変わらずなんで、最後は", ("な", "だ"), [("なん", "なん"), ("で", "で")]),
]
for text, want, mistake in FIXED:
    got = split(text)
    before = raw(text)
    toks = bc.tokenise(text, TAGGER)
    ok(
        f"{text}: {want[0]} opens {want[1]}, the text is unchanged",
        want in got and "".join(s for s, _ in got) == text and any(t.get("rs") == "segment" for t in toks),
        json.dumps(got, ensure_ascii=False),
    )
    ok(
        f"{text}: without the lexicon UniDic still splits it {mistake}",
        all(m in before for m in mistake),
        json.dumps(before, ensure_ascii=False),
    )
copula = split("戻ってくるのは相変わらずなんで、最後は")
ok("相変わらずなんで: な + ん + で, no 何 left", ("ん", "ん") in copula and not any(s == "なん" for s, _ in copula), json.dumps(copula, ensure_ascii=False))

# 2. the guards
for text in ["いまどの駅？", "なんでそう思うの", "暇なんで、行きます"]:
    ok(f"{text}: UniDic's split is kept", split(text) == raw(text), json.dumps(split(text), ensure_ascii=False))

# 3. a bad entry is refused
real_path, real = bc.SEGMENT_OVERRIDES_PATH, bc._SEGMENT_OVERRIDES
bad = Path(tempfile.mkdtemp()) / "segment-overrides.json"
bad.write_text(json.dumps({"entries": [{"word": "x", "match": [{"s": "こう"}, {"s": "ばん"}], "tokens": [{"s": "こうば", "b": "x", "p": "名詞", "r": "こうば", "c": True}]}]}), "utf-8")
try:
    bc.SEGMENT_OVERRIDES_PATH, bc._SEGMENT_OVERRIDES = bad, None
    try:
        bc.load_segment_overrides()
        refused = False
    except SystemExit as e:
        refused = "must spell" in str(e)
    ok("an entry whose tokens do not spell its match is refused", refused)
finally:
    bad.unlink()
    bc.SEGMENT_OVERRIDES_PATH, bc._SEGMENT_OVERRIDES = real_path, real

print(f"\n{'all checks green' if not FAILS else f'{len(FAILS)} failing'}")
sys.exit(1 if FAILS else 0)
