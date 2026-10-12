#!/usr/bin/env python3
"""Write, check, judge and keep N2/N1 passage cards, batch by batch, in priority order.

usage: python3 decks/n2n1/tools/run_batches.py --pass 1 --batches N [--lanes 4] [--size 10] [--skip-done]

For each batch of `size` targets (source/targets.json, highest priority first, not yet carded):
write with the writer model, run check_cards.check, judge with a model of another family,
rewrite each failed card once with the reason, re-check and re-judge it, and keep only cards
that passed both. Every attempt and verdict goes to source/journal/<batch>.jsonl; accepted cards
go to source/cards/<deck>-p<pass>-<batch>.json. `lanes` batches run at once.
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ARGS = sys.argv[1:]  # read before check_cards, which resets sys.argv for build.py
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import check_cards as cc  # noqa: E402

ROOT = HERE.parent
SRC = ROOT / "source"
WRITER, JUDGE = "glm-5.3:cloud", "deepseek-v4-pro:cloud"
PROMPT_W = (ROOT / "prompts/writer.md").read_text("utf-8")
PROMPT_J = (ROOT / "prompts/judge.md").read_text("utf-8")
REGISTER = {1: "講", 2: "報", 3: "論"}
ROTATE = ["history", "mind", "ai", "india", "language"]


def arg(name: str, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


def ask(model: str, prompt: str, payload: dict, key: str) -> tuple[list | None, dict]:
    user = prompt + "\n\nINPUT (JSON):\n" + json.dumps(payload, ensure_ascii=False)
    body = json.dumps({"model": model, "stream": False, "format": "json", "options": {"temperature": 0.6},
                       "messages": [{"role": "user", "content": user}]}).encode()
    t0, err = time.time(), None
    for _ in range(3):
        try:
            req = urllib.request.Request("http://127.0.0.1:11434/api/chat", body, {"content-type": "application/json"})
            resp = json.load(urllib.request.urlopen(req, timeout=900))
            text = resp["message"]["content"].strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]
            data = json.loads(text)
            items = data.get(key) if isinstance(data, dict) else data
            return items, {"model": model, "secs": round(time.time() - t0), "out": resp.get("eval_count")}
        except Exception as e:  # noqa: BLE001
            err = str(e)[:200]
            time.sleep(10)
    return None, {"model": model, "secs": round(time.time() - t0), "error": err}


def merge_verdicts(verdicts) -> dict[str, dict]:
    """the judge sometimes returns one object per lane (editor, facts) for the same card: merge them"""
    out: dict[str, dict] = {}
    for x in verdicts or []:
        if isinstance(x, dict) and x.get("term"):
            out.setdefault(x["term"].strip(), {}).update({k: v for k, v in x.items() if v not in (None, "")})
    return out


def item_for(t: dict, pass_no: int) -> dict:
    topic = t.get("field") or ROTATE[int(hashlib.sha1(t["term"].encode()).hexdigest(), 16) % len(ROTATE)]
    return {"term": t["term"], "reading": t["reading"], "gloss": t["gloss"], "level": t["level"],
            "register": REGISTER.get(pass_no, "講"), "preferTopic": topic}


def run_batch(bid: str, targets: list[dict], pass_no: int) -> dict:
    journal = SRC / "journal" / f"{bid}.jsonl"
    journal.parent.mkdir(parents=True, exist_ok=True)
    log = journal.open("a", encoding="utf-8")
    items = [item_for(t, pass_no) for t in targets]
    meta = {t["term"]: t for t in targets}
    kept, dropped, t0 = [], [], time.time()

    def judge(cards: list[dict]) -> dict[str, dict]:
        verdicts, info = ask(JUDGE, PROMPT_J, {"cards": cards}, "verdicts")
        log.write(json.dumps({"step": "judge", **info, "verdicts": verdicts}, ensure_ascii=False) + "\n")
        return merge_verdicts(verdicts)

    cards, info = ask(WRITER, PROMPT_W, {"items": items}, "cards")
    log.write(json.dumps({"step": "write", **info, "cards": cards}, ensure_ascii=False) + "\n")
    cards = [c for c in (cards or []) if isinstance(c, dict) and c.get("term") in meta]
    retry = {i["term"]: i for i in items if i["term"] not in {c["term"] for c in cards}}
    mech = {c["term"]: cc.check(c) for c in cards}
    ok_mech = [c for c in cards if not mech[c["term"]]]
    verdict = judge(ok_mech) if ok_mech else {}
    for c in cards:
        v = verdict.get(c["term"])
        why = mech[c["term"]] or ([] if v and v.get("editor") == "pass" and v.get("facts") == "pass"
                                   else [x for x in ((v or {}).get("editorWhy"), (v or {}).get("factsWhy")) if x] or ["no verdict"])
        if not why:
            kept.append(c)
        else:
            retry[c["term"]] = dict(item_for(meta[c["term"]], pass_no), fixThis=" / ".join(why)[:400])
    if retry:
        payload = {"items": list(retry.values()), "note": "REWRITE: each item failed a check; write a fresh card that fixes `fixThis` and still meets every rule."}
        cards2, info2 = ask(WRITER, PROMPT_W, payload, "cards")
        log.write(json.dumps({"step": "rewrite", **info2, "cards": cards2}, ensure_ascii=False) + "\n")
        cards2 = [c for c in (cards2 or []) if isinstance(c, dict) and c.get("term") in retry]
        mech2 = {c["term"]: cc.check(c) for c in cards2}
        ok2 = [c for c in cards2 if not mech2[c["term"]]]
        verdict2 = judge(ok2) if ok2 else {}
        for term in retry:
            c = next((x for x in cards2 if x["term"] == term), None)
            v = verdict2.get(term) if c else None
            if c and not mech2[term] and v and v.get("editor") == "pass" and v.get("facts") == "pass":
                kept.append(c)
            else:
                dropped.append({"term": term, "why": (mech2.get(term) if c else ["not returned"]) or [(v or {}).get("editorWhy"), (v or {}).get("factsWhy")]})
    for c in kept:
        t = meta[c["term"]]
        c.update({"deck": t["deck"], "field": t.get("field"), "level": t.get("level"), "pass": pass_no,
                  "writer": WRITER, "judge": JUDGE})
    by_deck: dict[str, list] = {}
    for c in kept:
        by_deck.setdefault(c["deck"], []).append(c)
    for deck, cs in by_deck.items():
        out = SRC / "cards" / f"{deck}-p{pass_no}-{bid}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"cards": cs}, ensure_ascii=False, indent=1), "utf-8")
    summary = {"step": "done", "batch": bid, "targets": len(targets), "kept": len(kept), "dropped": dropped,
               "secs": round(time.time() - t0)}
    log.write(json.dumps(summary, ensure_ascii=False) + "\n")
    log.close()
    print(f"· {bid}: kept {len(kept)}/{len(targets)} in {summary['secs']} s" + (f"; dropped {[d['term'] for d in dropped]}" if dropped else ""), flush=True)
    return summary


def main() -> int:
    pass_no = int(arg("--pass", 1))
    n = int(arg("--batches", 1))
    lanes = int(arg("--lanes", 4))
    size = int(arg("--size", 10))
    targets = [t for t in json.loads((SRC / "targets.json").read_text("utf-8")) if not t.get("linked")]
    done: set[str] = set()
    for f in (SRC / "cards").glob(f"*-p{pass_no}-*.json"):
        done |= {c["term"] for c in json.loads(f.read_text("utf-8"))["cards"]}
    for f in (SRC / "cards-sample").glob("*.json"):
        done |= {c["term"] for c in json.loads(f.read_text("utf-8"))["cards"]}
    todo = [t for t in targets if t["term"] not in done]
    batches = [todo[i * size:(i + 1) * size] for i in range(n) if todo[i * size:(i + 1) * size]]
    stamp = time.strftime("%Y%m%d-%H%M%S")
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=lanes) as pool:
        results = list(pool.map(lambda ib: run_batch(f"{stamp}-b{ib[0]:03d}", ib[1], pass_no), enumerate(batches, 1)))
    kept = sum(r["kept"] for r in results)
    secs = round(time.time() - t0)
    print(f"\n{kept}/{sum(r['targets'] for r in results)} cards kept in {secs} s with {lanes} lanes"
          f" → {round(secs / max(kept, 1) * 100 / 60, 1)} min per 100 kept cards; {len(todo) - kept} targets left in pass {pass_no}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
