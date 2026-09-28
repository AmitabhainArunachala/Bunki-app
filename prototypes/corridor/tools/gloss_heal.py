"""Complete the glosses wbig cut at its 32-character cap.

wbig caps every gloss at 32 characters and the cut lands mid-word — "bright (in reference to
personal", "five days; fifth day of the mont" — 482 of them, taught as if they were the whole
meaning (E3 round-D, data-licence lens; PR #77 f7cd297c healed 379 from dict.json). The rest
are completed from the full JMdict dict-v2 shards, matched on written form and reading
(2026-09-28). Both sources sit in the same share_alike pool as words.json, so nothing crosses
a pool boundary, and a word neither source carries keeps what it had.

Pure standard library, so it runs without the tokenizer:

  python gloss_heal.py            # heal data/share_alike/words.json in place
"""

from __future__ import annotations

import json
from pathlib import Path

GLOSS_CAP = 32
MAX_SENSES = 3
MAX_GLOSSES = 3


def dict_glosses(share_alike: Path) -> dict[str, str]:
    """headword -> its dict.json senses joined, the PR #77 source."""
    try:
        deep = json.loads((share_alike / "dict.json").read_text("utf-8")).get("words", {})
    except FileNotFoundError:
        return {}
    full: dict[str, str] = {}
    for head, rec in deep.items():
        senses = rec.get("m") or []
        if isinstance(senses, list) and senses:
            full[head] = "; ".join(str(x) for x in senses if x)
    return full


def v2_glosses(share_alike: Path) -> dict[str, list[tuple[set[str], str]]]:
    """written form -> [(kana readings, joined glosses)] from the full JMdict shards."""
    out: dict[str, list[tuple[set[str], str]]] = {}
    for shard in sorted((share_alike / "dict-v2").glob("[0-9a-f][0-9a-f].json")):
        for entry in json.loads(shard.read_text("utf-8")).get("entries", []):
            _seq, kanji_forms, kana_forms, senses = entry[0], entry[1], entry[2], entry[3]
            readings = {k[0] for k in kana_forms if k}
            parts = []
            for sense in senses[:MAX_SENSES]:
                glosses = sense[10] if len(sense) > 10 and isinstance(sense[10], list) else []
                text = ", ".join(g[0] for g in glosses[:MAX_GLOSSES] if g and g[0])
                if text:
                    parts.append(text)
            if not parts:
                continue
            joined = "; ".join(parts)
            for form in kanji_forms or []:
                out.setdefault(form[0], []).append((readings, joined))
            if not kanji_forms:
                for reading in readings:
                    out.setdefault(reading, []).append((readings, joined))
    return out


def complete(word: str, reading: str, gloss: str, full: dict[str, str], v2: dict[str, list[tuple[set[str], str]]]) -> str:
    if len(gloss) < GLOSS_CAP:
        return gloss
    better = full.get(word, "")
    if len(better) > len(gloss):
        return better
    # a capped gloss is cut, whatever its length says — the full entry replaces it even when
    # its wording is shorter ("5th day of the month" for "fifth day of the mont")
    candidates = v2.get(word, [])
    matched = [text for readings, text in candidates if reading in readings] or [text for _, text in candidates[:1]]
    return matched[0] if matched else gloss


def heal_words(words: dict[str, dict], share_alike: Path) -> int:
    full = dict_glosses(share_alike)
    v2 = v2_glosses(share_alike)
    healed = 0
    for word, rec in words.items():
        gloss = rec.get("g", "")
        new = complete(word, rec.get("r", ""), gloss, full, v2)
        if new != gloss:
            rec["g"] = new
            healed += 1
    return healed


if __name__ == "__main__":
    share = Path(__file__).resolve().parent.parent / "data" / "share_alike"
    path = share / "words.json"
    data = json.loads(path.read_text("utf-8"))
    n = heal_words(data["words"], share)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
    left = [w for w, r in data["words"].items() if len(r.get("g", "")) == GLOSS_CAP]
    print(f"glosses completed: {n}; still exactly at the cap: {len(left)}")
