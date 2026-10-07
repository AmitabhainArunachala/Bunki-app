#!/usr/bin/env python3
"""Check, judge and keep one batch of N2/N1 cards written by an agent.

usage: python3 decks/n2n1/tools/process_batch.py BATCH_ID            (after the agent wrote drafts/BATCH_ID-draft.json)
       python3 decks/n2n1/tools/process_batch.py BATCH_ID --rewrite  (after it wrote drafts/BATCH_ID-rewrite.json)

First run: check_cards.check on every card, then the judge (prompts/judge.md, a model of another
family than the writer) on the cards that pass; accepted cards go to source/cards/, failures and
their reasons to drafts/BATCH_ID-fix.json. Rewrite run: the same on the rewrites; what fails again
is dropped. Every verdict goes to source/journal/BATCH_ID.jsonl. Prints a one-line summary.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ARGS = sys.argv[1:]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import check_cards as cc  # noqa: E402
import run_batches as rb  # noqa: E402

SRC = HERE.parent / "source"
JUDGE = rb.JUDGE


def main() -> int:
    bid, rewrite = ARGS[0], "--rewrite" in ARGS
    writer = ARGS[ARGS.index("--writer") + 1] if "--writer" in ARGS else "claude-sonnet-5-5"
    batch = json.loads((SRC / "batches" / f"{bid}.json").read_text("utf-8"))
    meta = {i["term"]: i for i in batch["items"]}
    src = SRC / "drafts" / f"{bid}-{'rewrite' if rewrite else 'draft'}.json"
    data = json.loads(src.read_text("utf-8"))
    cards = [c for c in (data.get("cards") if isinstance(data, dict) else data) if isinstance(c, dict) and c.get("term") in meta]
    want = set(json.loads((SRC / "drafts" / f"{bid}-fix.json").read_text("utf-8"))) if rewrite else set(meta)
    cards = [c for c in cards if c["term"] in want]
    log = (SRC / "journal" / f"{bid}.jsonl")
    log.parent.mkdir(parents=True, exist_ok=True)
    mech = {c["term"]: cc.check(c) for c in cards}
    ok = [c for c in cards if not mech[c["term"]]]
    verdicts, info = rb.ask(JUDGE, rb.PROMPT_J, {"cards": ok}, "verdicts") if ok else ([], {"model": JUDGE})
    v = rb.merge_verdicts(verdicts)
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"step": "rewrite" if rewrite else "draft", "writer": writer, "mech": mech, **info, "verdicts": verdicts}, ensure_ascii=False) + "\n")
    kept, fix = [], {}
    for term in want:
        c = next((x for x in cards if x["term"] == term), None)
        if c is None:
            fix[term] = "not written"
            continue
        if mech[term]:
            fix[term] = " / ".join(mech[term])[:400]
            continue
        j = v.get(term)
        if j and j.get("editor") == "pass" and j.get("facts") == "pass":
            m = meta[term]
            c.update({"deck": m["deck"], "field": m.get("field"), "level": m.get("level"), "pass": 1,
                      "writer": writer, "judge": JUDGE})
            kept.append(c)
        else:
            fix[term] = " / ".join(x for x in ((j or {}).get("editorWhy"), (j or {}).get("factsWhy")) if x)[:400] or "no verdict"
    by_deck: dict[str, list] = {}
    for c in kept:
        by_deck.setdefault(c["deck"], []).append(c)
    for deck, cs in by_deck.items():
        out = SRC / "cards" / f"{deck}-p1-{bid}{'-r' if rewrite else ''}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"cards": cs}, ensure_ascii=False, indent=1), "utf-8")
    if not rewrite:
        (SRC / "drafts" / f"{bid}-fix.json").write_text(json.dumps(fix, ensure_ascii=False, indent=1), "utf-8")
    else:
        with log.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"step": "dropped", "dropped": fix}, ensure_ascii=False) + "\n")
    print(json.dumps({"batch": bid, "stage": "rewrite" if rewrite else "draft", "kept": len(kept), "failed": len(fix),
                      "fix": fix if not rewrite else {}, "dropped": list(fix) if rewrite else []}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
