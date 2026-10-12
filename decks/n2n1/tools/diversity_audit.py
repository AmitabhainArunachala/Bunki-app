#!/usr/bin/env python3
"""Audit accepted passages for repeated wording and writing/reading advice frames.

usage: python3 decks/n2n1/tools/diversity_audit.py [--cap 0.006] [--out FILE]
       Add --new-since REF to also audit the words added since a baseline deck build.

Exact openings, endings, clauses and ten-character phrases retain the 0.6% cap
(at least 3 cards). The broader frame families have separate 2%, 2%, 2%, 1% and
6% caps. Counts are per card, including when a pattern occurs more than once.
Cards past a cap, earliest kept, go with the reason to the rewrite queue at --out
(default source/rewrite-queue.json, a tracked file). Exit 1 on any overage.
Grammar coverage is informational. --cards DIR supports isolated corpus checks.
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import re
import subprocess
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "source"
REPO = SRC.parents[2]
# Keep these definitions aligned with the lead's measure_frames.py acceptance check.
FRAME_HABITS = (
    ("meta frame", r"(と|だけ)書くと|言い換え(ると|れば|るより)|説明する(なら|とき|際|場合)|書け(ません|ない)|書きたい|(文章|記事|解説)(で|では)", 0.02),
    ("in a text/article", r"(文章|記事|報告|解説)(で|では|を読む)", 0.02),
    ("when reading", r"読む(とき|際)", 0.02),
    ("if you write", r"(と|だけ)書くと", 0.01),
    ("ending in ましょう", r"ましょう。", 0.06),
)


def load_cards(folder: Path) -> list[dict]:
    return [c for f in sorted(folder.glob("*.json"))
            for c in json.loads(f.read_text("utf-8"))["cards"]]


def baseline_words(ref: str) -> set[tuple[str, str, str]]:
    words = set()
    for deck in ("n2", "n1", "senmon"):
        raw = subprocess.check_output(
            ["git", "show", f"{ref}:prototypes/corridor/decks/{deck}/deck.json"], cwd=REPO)
        words.update((deck, w["term"], w["reading"]) for w in json.loads(raw)["words"])
    return words


def audit(cards: list[dict], cap_share: float, new_since: str | None = None) -> tuple[list, list]:
    n = len(cards)
    cap = max(3, round(n * cap_share))
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
        ss = [s for s in re.split(r"(?<=[。！？])", ja) if s]
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
        grams.update({ja[k:k + 10] for k in range(len(ja) - 9)
                      if not re.search(r"[0-9０-９]", ja[k:k + 10])})
    for g, count in grams.items():
        if count > cap:
            clusters["phrase 「" + g + "」"] = [i for i, c in enumerate(cards) if g in c["passage"]["ja"]]
    # Connectors such as 一方で are ordinary Japanese; report grammar as coverage.
    used = {name[len("grammar "):] for name in clusters if name.startswith("grammar ")}
    print(f"grammar coverage: {len(used)} of {len(patterns)} N2/N1 patterns used at least once")
    limits = {name: cap for name in clusters}
    scopes = [("whole deck", list(range(n)))]
    if new_since is not None:
        before = baseline_words(new_since)
        scopes.append((f"new since {new_since}", [i for i, c in enumerate(cards)
                       if (c.get("deck", "n1"), c["term"], c["reading"]) not in before]))
    for scope, indexes in scopes:
        for label, pattern, share in FRAME_HABITS:
            name = f"habit [{scope}] {label}"
            hits = [i for i in indexes if re.search(pattern, cards[i]["passage"]["ja"])]
            clusters[name] = hits
            limits[name] = math.floor(len(indexes) * share)
            print(f"  {name}: {len(hits)}/{len(indexes)} "
                  f"({100 * len(hits) / max(1, len(indexes)):.1f}%; cap {100 * share:g}%)")
    queue: dict[tuple, dict] = {}
    report = []
    for name, idx in sorted(clusters.items(), key=lambda kv: -len(kv[1])):
        limit = limits[name]
        if len(idx) <= limit or name.startswith("grammar "):
            continue
        report.append((name, len(idx)))
        for i in idx[limit:]:
            c = cards[i]
            key = (c.get("deck"), c["term"], c["reading"])
            q = queue.setdefault(key, {"term": c["term"], "deck": c.get("deck"), "why": []})
            q["why"].append(f"{name} appears in {len(idx)} cards (cap {limit})")
    print(f"{n} cards; cap per exact habit {cap}; habits over the cap: {len(report)}; "
          f"cards to rewrite: {len(queue)} ({100 * len(queue) // max(n, 1)}%)")
    for name, count in report[:25]:
        print(f"  {count:4d}  {name}")
    return list(queue.values()), report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cap", type=float, default=0.006)
    parser.add_argument("--out", type=Path, default=SRC / "rewrite-queue.json")
    parser.add_argument("--cards", type=Path, default=SRC / "cards")
    parser.add_argument("--new-since")
    args = parser.parse_args()
    if not 0 < args.cap <= 1:
        parser.error("--cap must be greater than zero and at most one")
    cards = load_cards(args.cards)
    if not cards:
        parser.error(f"no accepted cards found in {args.cards}")
    queue, report = audit(cards, args.cap, args.new_since)
    args.out.write_text(json.dumps(queue, ensure_ascii=False, indent=1), "utf-8")
    print(f"queue → {args.out}")
    return 1 if report else 0


if __name__ == "__main__":
    raise SystemExit(main())
