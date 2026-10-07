#!/usr/bin/env python3
"""Find writing habits across the N2/N1 cards and mark the cards to rewrite.

usage: python3 decks/n2n1/tools/diversity_audit.py [--cap 0.006] [--out source/rewrite-queue.json]

Looks at every accepted card (source/cards/*.json) for repeated last-sentence endings, opening
words, N2/N1 grammar patterns (source/grammar-n2n1.txt), recurring phrases (10-character runs in
many cards) and frames (the same first clause in a register). A cluster may keep `cap` x cards
(at least 3); the rest, earliest kept, go to the rewrite queue with the reason. Prints the worst
clusters.
"""
from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

ARGS = sys.argv[1:]
SRC = Path(__file__).resolve().parent.parent / "source"
cap_share = float(ARGS[ARGS.index("--cap") + 1]) if "--cap" in ARGS else 0.006
out = Path(ARGS[ARGS.index("--out") + 1]) if "--out" in ARGS else SRC / "rewrite-queue.json"

cards = []
for f in sorted(SRC.glob("cards/*.json")):
    for c in json.loads(f.read_text("utf-8"))["cards"]:
        cards.append(c)
N = len(cards)
cap = max(3, round(N * cap_share))
sent = lambda ja: [s for s in re.split(r"(?<=[。！？])", ja) if s]
patterns = []
for line in (SRC / "grammar-n2n1.txt").read_text("utf-8").splitlines():
    if line.startswith("N"):
        p = line.split("\t")[1].replace("〜", "").split("／")[0].strip("（）()")
        core = re.sub(r"[（(].*?[）)]", "", p)
        if len(core) >= 3:
            patterns.append((line.split("\t")[1], core))

clusters: dict[str, list[int]] = collections.defaultdict(list)
for i, c in enumerate(cards):
    ja = c["passage"]["ja"]
    ss = sent(ja)
    last = ss[-1].rstrip("。！？") if ss else ""
    clusters["ending …" + last[-6:]].append(i)
    clusters["opening " + ja[:5] + "…"].append(i)
    first_clause = re.split(r"[、。]", ja)[0]
    clusters[f"frame [{c['passage']['register']}] " + first_clause[:8] + "…"].append(i)
    for label, core in patterns:
        if core in ja:
            clusters["grammar " + label].append(i)
grams = collections.Counter()
for c in cards:
    ja = c["passage"]["ja"]
    grams.update({ja[k:k + 10] for k in range(len(ja) - 9) if not re.search(r"[0-9０-９]", ja[k:k + 10])})
common = [g for g, n in grams.items() if n > cap]
for g in common:
    clusters["phrase 「" + g + "」"] = [i for i, c in enumerate(cards) if g in c["passage"]["ja"]]

# grammar is reported as coverage, not queued: connectors such as 一方で or とはいえ at a few percent
# are ordinary Japanese, and substring matches (ことに inside ことになる) overcount; a pattern only
# becomes a habit as a repeated ending, which the ending clusters already catch
used = {name[len("grammar "):] for name in clusters if name.startswith("grammar ")}
print(f"grammar coverage: {len(used)} of {len(patterns)} N2/N1 patterns used at least once")
queue: dict[str, dict] = {}
report = []
for name, idx in sorted(clusters.items(), key=lambda kv: -len(kv[1])):
    if len(idx) <= cap or name.startswith("grammar "):
        continue
    report.append((name, len(idx)))
    for i in idx[cap:]:
        c = cards[i]
        q = queue.setdefault(c["term"], {"term": c["term"], "deck": c.get("deck"), "why": []})
        q["why"].append(f"{name} appears in {len(idx)} cards (cap {cap})")
out.write_text(json.dumps(list(queue.values()), ensure_ascii=False, indent=1), "utf-8")
print(f"{N} cards; cap per habit {cap}; habits over the cap: {len(report)}; cards to rewrite: {len(queue)} ({100 * len(queue) // max(N, 1)}%)")
for name, n in report[:25]:
    print(f"  {n:4d}  {name}")
print(f"queue → {out}")
