#!/usr/bin/env python3
"""Mechanical checks for N2/N1 passage cards (writer output, prompts/writer.md).

usage: python3 decks/n2n1/tools/check_cards.py CARDS.json [--json OUT.json]

Per card: the contract-v2 passage rules exactly as export_mcd.check_written applies them to the
kotoba-mcd deck (4–5 sentences, 180–300 characters, no whitespace, the target exactly once, as many
English sentences as Japanese), the target on token boundaries (not inside a longer word), and
the word fields (defJa, tipJa, sense, meaning). Exit 1 if any card fails.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.argv, ARGS = sys.argv[:1], sys.argv[1:]  # build.py reads its flags at import
sys.path.insert(0, str(REPO / "decks/kotoba-mine/tools"))
sys.path.insert(0, str(REPO / "prototypes/corridor/tools"))
import export_mcd as ex  # noqa: E402
import build_corridor as bc  # noqa: E402

DEF_MAX, MEANING_MAX = 32, 48
POS = {"noun", "verb", "i-adj", "na-adj", "adverb", "expression", "other"}
_TAGGER = None


def tagger():
    global _TAGGER
    if _TAGGER is None:
        import fugashi
        _TAGGER = fugashi.Tagger()
    return _TAGGER


def on_token_edges(ja: str, form: str) -> bool:
    """the target starts and ends on token boundaries (競う in 競って is fine; 導体 in 半導体 is not)"""
    at = ja.find(form)
    edges, pos = {0}, 0
    for t in bc.tokenise(ja, tagger()):
        pos += len(t["s"])
        edges.add(pos)
    return at in edges and (at + len(form) in edges or any(e > at + len(form) - 2 and e <= at + len(form) + 4 for e in edges))


def check(card: dict) -> list[str]:
    bad: list[str] = []
    term = card.get("term", "")
    p = card.get("passage") or {}
    rec = {"ja": p.get("ja", ""), "form": p.get("form", ""), "en": p.get("en", ""), "register": p.get("register")}
    try:
        ex.check_written(term, rec)
    except SystemExit as e:
        bad.append(str(e))
    if p.get("register") not in ex.REGISTERS:
        bad.append(f"register {p.get('register')!r} is not one of {''.join(ex.REGISTERS)}")
    if p.get("topic") not in (*ex.TOPICS, "other"):
        bad.append(f"topic {p.get('topic')!r} is not one of {', '.join(ex.TOPICS)}, other")
    if rec["form"] and rec["form"] in rec["ja"] and not on_token_edges(rec["ja"], rec["form"]):
        bad.append(f"the target {rec['form']} sits inside a longer word")
    d = card.get("defJa", "")
    if not ex.japanese_line(d, DEF_MAX) or term in d:
        bad.append(f"defJa must be one Japanese line of at most {DEF_MAX} characters without the term: {d!r}")
    if p.get("tipJa") and not ex.japanese_line(p["tipJa"], ex.TIP_MAX):
        bad.append(f"tipJa must be one Japanese line of at most {ex.TIP_MAX} characters: {p['tipJa']!r}")
    if p.get("sense") and not ex.japanese_line(p["sense"], ex.SENSE_MAX):
        bad.append(f"sense must be one Japanese line of at most {ex.SENSE_MAX} characters: {p['sense']!r}")
    m = card.get("meaning", "")
    if not (isinstance(m, str) and 0 < len(m) <= MEANING_MAX):
        bad.append(f"meaning must be 1–{MEANING_MAX} characters: {m!r}")
    if card.get("pos") not in POS:
        bad.append(f"pos {card.get('pos')!r} is not one of {sorted(POS)}")
    return bad


def main() -> int:
    src = Path(ARGS[0])
    data = json.loads(src.read_text("utf-8"))
    cards = data.get("cards") if isinstance(data, dict) else data
    report = []
    for c in cards or []:
        bad = check(c)
        report.append({"term": c.get("term"), "ok": not bad, "why": bad})
        print(f"{'  ok  ' if not bad else ' FAIL '} {c.get('term')}" + ("" if not bad else "  — " + " | ".join(bad)))
    if "--json" in ARGS:
        Path(ARGS[ARGS.index("--json") + 1]).write_text(json.dumps(report, ensure_ascii=False, indent=1), "utf-8")
    fails = sum(not r["ok"] for r in report)
    print(f"\n{len(report) - fails}/{len(report)} pass")
    return 1 if fails or not report else 0


if __name__ == "__main__":
    sys.exit(main())
