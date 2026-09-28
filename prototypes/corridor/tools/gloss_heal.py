"""Complete the glosses wbig cut at its 32-character cap.

wbig caps every gloss at 32 characters and the cut lands mid-word — "bright (in reference to
personal", "five days; fifth day of the mont" — 482 of them, taught as if they were the whole
meaning (E3 round-D, data-licence lens). Only an entry read the way the word is read may
complete it: 空く is あく (to open, to be empty) or すく (to thin out, to be hungry), and the
written form alone cannot tell which. dict.json's full gloss (PR #77 f7cd297c's source) is used
when its reading is the word's reading and it carries no sense JMdict gives only to another
reading or written form (避ける's よける-only "to avoid (physical contact with)"). Otherwise the
full JMdict dict-v2 entry read this way completes it, without such senses. Both sources sit in
the same share_alike pool as words.json, so nothing crosses a pool boundary, and a word neither
source carries keeps what it had.

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


def v2_glosses(share_alike: Path) -> dict[str, list[tuple[set[str], str, frozenset[str]]]]:
    """written form -> [(kana readings, joined glosses, foreign glosses)] from the full JMdict
    shards. A reading or sense JMdict restricts to another form is left out of the joined text
    and its glosses are listed as foreign: 避ける read さける does not get よける's "to avoid
    (physical contact with)"."""
    out: dict[str, list[tuple[set[str], str, frozenset[str]]]] = {}
    for shard in sorted((share_alike / "dict-v2").glob("[0-9a-f][0-9a-f].json")):
        for entry in json.loads(shard.read_text("utf-8")).get("entries", []):
            _seq, kanji_forms, kana_forms, senses = entry[0], entry[1], entry[2], entry[3]
            written = [k[0] for k in kanji_forms or [] if k]
            for form in written or [k[0] for k in kana_forms if k]:
                texts: dict[tuple[str, frozenset[str]], set[str]] = {}
                for kana in kana_forms:
                    if not kana or (written and not applies(kana[3] if len(kana) > 3 else None, form)):
                        continue
                    reading = kana[0]
                    fitting = [s for s in senses if (not written or applies(s[1], form)) and applies(s[2], reading)]
                    parts = []
                    for sense in fitting[:MAX_SENSES]:
                        text = ", ".join(sense_glosses(sense)[:MAX_GLOSSES])
                        if text:
                            parts.append(text)
                    own = {g for sense in fitting for g in sense_glosses(sense)}
                    foreign = frozenset(g for sense in senses if sense not in fitting for g in sense_glosses(sense)) - own
                    if parts:
                        texts.setdefault(("; ".join(parts), foreign), set()).add(reading)
                for (joined, foreign), readings in texts.items():
                    out.setdefault(form, []).append((readings, joined, foreign))
    return out


def sense_glosses(sense) -> list[str]:
    glosses = sense[10] if len(sense) > 10 and isinstance(sense[10], list) else []
    return [g[0] for g in glosses if g and g[0]]


def complete(word: str, reading: str, gloss: str, full: dict[str, tuple[str, str]],
             v2: dict[str, list[tuple[set[str], str, frozenset[str]]]]) -> str:
    if len(gloss) < GLOSS_CAP:
        return gloss
    matched = [(text, foreign) for readings, text, foreign in v2.get(word, []) if reading in readings]
    # dict.json's full gloss for the same word, unless it carries another reading's sense
    # (a gloss already equal to it stays: a second heal changes nothing)
    full_reading, better = full.get(word, ("", ""))
    if full_reading == reading and (better == gloss or len(better) > len(gloss)):
        if not any(set(better.split("; ")) & foreign for _, foreign in matched):
            return better
    # a capped gloss is cut, whatever its length says — the full entry replaces it even when
    # its wording is shorter ("5th day of the month" for "fifth day of the mont")
    return matched[0][0] if matched else gloss


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
