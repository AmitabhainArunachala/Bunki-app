#!/usr/bin/env python3
"""One-off: write source/ids.json from the two shipped decks, so card ids stop
depending on array position (review finding F26, standard amendment A25).

It was run once, when the manifest was created, and ids.json was committed.
Do not run it again to "refresh" the manifest: from then on build.py owns
ids.json (it appends new keys and moves dropped ones to "reserved"), and a
fresh freeze would forget every reserved id.

If ids.json already exists this script writes nothing. It only checks that
every card in the shipped decks has the id the manifest gives its key, and
exits non-zero if one does not.

Run from the repo root:  python3 decks/kotoba-mine/tools/freeze_ids.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build import CORRIDOR, SRC, card_key  # noqa: E402

DECKS = ("kotoba-mcd", "kotoba-mine")
IDS = SRC / "ids.json"


def shipped() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for deck_id in DECKS:
        deck = json.loads((CORRIDOR / "decks" / deck_id / "deck.json").read_text("utf-8"))
        keys: dict[str, str] = {}
        for w in deck["words"]:
            for card in w["cards"]:
                key = card_key(w["id"], card)
                if key in keys:
                    raise SystemExit(f"{deck_id}: {card['id']} and {keys[key]} share the key {key}")
                keys[key] = card["id"]
        if len(set(keys.values())) != len(keys):
            raise SystemExit(f"{deck_id}: a card id is used twice")
        out[deck_id] = keys
    return out


def main() -> int:
    current = shipped()
    if IDS.exists():
        manifest = json.loads(IDS.read_text("utf-8"))
        bad = [(d, k, i) for d, keys in current.items() for k, i in keys.items() if manifest.get(d, {}).get(k) != i]
        for d, k, i in bad[:10]:
            print(f"✗ {d}: {i} ({k}) does not match ids.json")
        print(f"· {IDS.relative_to(SRC.parent)} already exists; not rewritten"
              f" ({sum(map(len, current.values()))} shipped cards checked, {len(bad)} mismatched)")
        return 1 if bad else 0
    manifest = {**current, "reserved": {d: [] for d in DECKS}}
    IDS.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"· wrote {IDS} ({', '.join(f'{d}: {len(k)}' for d, k in current.items())})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
