"""Complete the glosses wbig cut at its 32-character cap.

wbig caps every gloss at 32 characters and the cut lands mid-word — "bright (in reference to
personal", "five days; fifth day of the mont" — 482 of them, taught as if they were the whole
meaning (E3 round-D, data-licence lens). They are completed from the full JMdict dict-v2
shards, matched on written form AND reading: 空く is あく (to open, to be empty) or すく (to thin
out, to be hungry), and the written form alone cannot tell which. dict.json (PR #77 f7cd297c's
source) fills in only where no JMdict entry read this way carries the word, and only when its
own reading agrees. Both sources sit in the same share_alike pool as words.json, so nothing
crosses a pool boundary, and a word neither source carries keeps what it had.

Pure standard library, so it runs without the tokenizer:

  python gloss_heal.py            # heal data/share_alike/words.json in place
"""

from __future__ import annotations

import json
from pathlib import Path

GLOSS_CAP = 32
MAX_SENSES = 3
MAX_GLOSSES = 3


def dict_glosses(share_alike: Path) -> dict[str, tuple[str, str]]:
    """headword -> (its dict.json reading, its senses joined), the PR #77 source."""
    try:
        deep = json.loads((share_alike / "dict.json").read_text("utf-8")).get("words", {})
    except FileNotFoundError:
        return {}
    full: dict[str, tuple[str, str]] = {}
    for head, rec in deep.items():
        senses = rec.get("m") or []
        if isinstance(senses, list) and senses:
            full[head] = (rec.get("r", ""), "; ".join(str(x) for x in senses if x))
    return full


def applies(scope, value: str) -> bool:
    """JMdict's appliesToKanji / appliesToKana: "*" (or nothing) means every form."""
    return not scope or "*" in scope or value in scope


def v2_glosses(share_alike: Path) -> dict[str, list[tuple[set[str], str]]]:
    """written form -> [(kana readings, joined glosses)] from the full JMdict shards. A reading
    or sense JMdict restricts to another form is left out: 避ける read さける does not get
    よける's "to avoid (physical contact with)"."""
    out: dict[str, list[tuple[set[str], str]]] = {}
    for shard in sorted((share_alike / "dict-v2").glob("[0-9a-f][0-9a-f].json")):
        for entry in json.loads(shard.read_text("utf-8")).get("entries", []):
            _seq, kanji_forms, kana_forms, senses = entry[0], entry[1], entry[2], entry[3]
            written = [k[0] for k in kanji_forms or [] if k]
            for form in written or [k[0] for k in kana_forms if k]:
                texts: dict[str, set[str]] = {}
                for kana in kana_forms:
                    if not kana or (written and not applies(kana[3] if len(kana) > 3 else None, form)):
                        continue
                    reading = kana[0]
                    fitting = [s for s in senses if (not written or applies(s[1], form)) and applies(s[2], reading)]
                    parts = []
                    for sense in fitting[:MAX_SENSES]:
                        glosses = sense[10] if len(sense) > 10 and isinstance(sense[10], list) else []
                        text = ", ".join(g[0] for g in glosses[:MAX_GLOSSES] if g and g[0])
                        if text:
                            parts.append(text)
                    if parts:
                        texts.setdefault("; ".join(parts), set()).add(reading)
                for joined, readings in texts.items():
                    out.setdefault(form, []).append((readings, joined))
    return out


def complete(word: str, reading: str, gloss: str, full: dict[str, tuple[str, str]], v2: dict[str, list[tuple[set[str], str]]]) -> str:
    if len(gloss) < GLOSS_CAP:
        return gloss
    # a capped gloss is cut, whatever its length says — the full entry replaces it even when
    # its wording is shorter ("5th day of the month" for "fifth day of the mont")
    for readings, text in v2.get(word, []):
        if reading in readings:
            return text
    # no JMdict entry is read this way: dict.json, but only for the same word
    full_reading, better = full.get(word, ("", ""))
    if full_reading == reading and len(better) > len(gloss):
        return better
    return gloss


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
