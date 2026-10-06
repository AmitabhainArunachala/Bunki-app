#!/usr/bin/env python3
"""source/mcd/*.json (chosen + written passages) → source/mcd.json, with each real
passage's source taken from the mined candidates.

Undated files (s1–s6, preview.json) are read first, in name order, then dated batches
(<name>-YYYY-MM-DD.json, such as pilot-2026-10-04.json) by date; a word's passages are
gathered across files in that order (a later batch never replaces a word's passages). Then
each word's contract-v2 passages (those with a `register`) are put first, in that order, and
its earlier passages follow in theirs (the learner's call, 2026-10-05: a word is met first in a
contract-v2 passage). Card ids do not move: build.py takes them from source/ids.json by passage
text, and keeps the 字 cards on the word's origin passage, its first passage without a
register (passage 1 before the reorder), so no 字 card is made from a v2 passage.

Written passages (original: true) are checked here (REVIEW_MCD.md):
  - no whitespace; `form` occurs in `ja`;
  - at most WRITTEN_MAX characters and SENTENCES_MAX sentences (the v1 passages, 2–4
    sentences of 46–116 characters, stay valid);
  - a passage with a `register` is a contract-v2 passage (CARD_CONTRACT_V2 §2, §7): 4–5
    sentences, V2_MIN–WRITTEN_MAX characters, `form` exactly once, and an English
    translation with as many sentences as the Japanese (so the back can show the target
    sentence's 英訳).
Optional fields, carried into mcd.json and from there onto the deck's cards; empty values
are dropped, so old records need none of them:
  register  one of the six codes of CARD_CONTRACT_V2 §6 (講 報 論 話 学 語)
  topic     one of TOPICS (§6's four topics, plus 言語 for Japanese about Japanese)
  tipJa     one Japanese line, the passage's usage note (tier one, §3 item 4)
  grammar   grammar-v11.json ids the passage exercises (§7 check 3); an unknown id fails
  sense     the sense the passage uses (§3 item 3, §5): one Japanese dictionary-style line of at
            most SENSE_MAX characters, no Latin letters"""
import glob
import json
import re
from pathlib import Path

import sys

DECK = Path(__file__).resolve().parent.parent
SRC = DECK / "source"

sys.path.insert(0, str(DECK / "tools"))
from rank import VARIANTS  # noqa: E402
from build import _merge_compounds, en_sentences, sentence_ends  # noqa: E402
from rights import UNVERIFIED  # noqa: E402

REGISTERS = ("講", "報", "論", "話", "学", "語")
TOPICS = ("mind", "india", "ai", "history", "language")
OPTIONAL = ("register", "topic", "tipJa", "grammar", "sense")
WRITTEN_MAX = 300  # characters (CARD_CONTRACT_V2 §2: roughly 180–300)
SENTENCES_MAX = 5
V2_MIN = 180
V2_SENTENCES = (4, 5)
TIP_MAX = 80
SENSE_MAX = 40  # the sense line on the back (CARD_CONTRACT_V2 §3 item 3), the same ceiling as gloss_ja.json
GRAMMAR = {e["id"] for e in json.loads((DECK.parents[1] / "prototypes" / "corridor" / "data" / "original" / "grammar-v11.json")
                                       .read_text("utf-8"))["entries"]}


def japanese_line(text, limit: int) -> bool:
    """one trimmed line of at most `limit` characters, with Japanese in it and no Latin letters"""
    return (isinstance(text, str) and text.strip() == text and "\n" not in text and len(text) <= limit
            and not re.search(r"[A-Za-z]", text) and bool(re.search(r"[ぁ-んァ-ヶ一-鿿]", text)))


def optional(n: str, r: dict) -> dict:
    """the record's optional fields, checked; empty ones are left out"""
    got = {k: r[k] for k in OPTIONAL if r.get(k) not in (None, "", [])}
    where = f"{n}: {r['ja'][:24]}…"
    if "register" in got and got["register"] not in REGISTERS:
        raise SystemExit(f"{where} register {got['register']!r} is not one of {' '.join(REGISTERS)}")
    if "topic" in got and got["topic"] not in TOPICS:
        raise SystemExit(f"{where} topic {got['topic']!r} is not one of {', '.join(TOPICS)}")
    tip = got.get("tipJa")
    if tip is not None and not japanese_line(tip, TIP_MAX):
        raise SystemExit(f"{where} tipJa must be one Japanese line of at most {TIP_MAX} characters, no Latin letters")
    if "grammar" in got:
        g = got["grammar"]
        unknown = [x for x in g if x not in GRAMMAR] if isinstance(g, list) else [g]
        if unknown:
            raise SystemExit(f"{where} grammar ids not in grammar-v11.json: {', '.join(map(str, unknown))}")
        got["grammar"] = list(dict.fromkeys(g))
    sense = got.get("sense")
    if sense is not None and not japanese_line(sense, SENSE_MAX):
        raise SystemExit(f"{where} sense must be one Japanese dictionary-style line of at most {SENSE_MAX} characters, "
                         "no Latin letters")
    return got


def check_written(n: str, r: dict) -> None:
    ja, form = r["ja"], r["form"]
    where = f"{n}: {ja[:24]}…"
    if re.search(r"\s", ja):
        raise SystemExit(f"{n}: a written passage has a space in it: {ja[:40]}")
    if form not in ja:
        raise SystemExit(f"{n}: form {form} not in {ja}")
    k = len(sentence_ends(ja))
    if len(ja) > WRITTEN_MAX or k > SENTENCES_MAX:
        raise SystemExit(f"{where} {len(ja)} characters, {k} sentences: a written passage has at most "
                         f"{WRITTEN_MAX} characters and {SENTENCES_MAX} sentences")
    if r.get("register"):
        if not (V2_MIN <= len(ja) <= WRITTEN_MAX and k in V2_SENTENCES):
            raise SystemExit(f"{where} {len(ja)} characters, {k} sentences: a contract-v2 passage has "
                             f"{V2_SENTENCES[0]}–{V2_SENTENCES[-1]} sentences and {V2_MIN}–{WRITTEN_MAX} characters")
        if ja.count(form) != 1:
            raise SystemExit(f"{where} the target {form} appears {ja.count(form)} times; it must appear once")
        e = len(en_sentences(r["en"]))
        if e != k:
            raise SystemExit(f"{where} the English has {e} sentences, the Japanese {k}: they must match")


TERM_SPAN = 6  # tokens a deck term may span: 下敷き+に+なる, 磁気+共鳴+断層+撮影
_TAGGER = None
_TERMS: dict[str, tuple[str, set[str]]] | None = None


def deck_terms() -> dict[str, tuple[str, set[str]]]:
    """entry number → (the deck term, its spellings with rank.VARIANTS): all 323 words of the list"""
    global _TERMS
    if _TERMS is None:
        _TERMS = {str(e["n"]): (e["term"], {e["term"], *VARIANTS.get(e["term"], [])})
                  for e in json.loads((SRC / "entries.json").read_text("utf-8"))}
    return _TERMS


def other_terms(n: str, ja: str, form: str) -> dict[str, str]:
    """the other deck words a passage uses (CARD_CONTRACT_V2 §7 check 4), as {term: surface}.
    The passage is tokenised as build.py tokenises it (the corridor's fugashi + UniDic, then
    build._merge_compounds, so 半導体 is one word and not 半 + the deck word 導体); a run of up
    to TERM_SPAN tokens outside the target matches a term when its surface spells the term (kana
    words, uninflected words, compounds such as 生得+的) or its surface up to the last token plus
    that token's dictionary form does (inflected words: 競っ → 競う, ひらめい → ひらめく)."""
    global _TAGGER
    import build_corridor as bc

    if _TAGGER is None:
        from corpus.grading._mecab import get_tagger

        _TAGGER = get_tagger()
    a = ja.index(form)
    b = a + len(form)
    tokens = _merge_compounds(bc.tokenise(ja, _TAGGER), [(a, b)])
    spans, pos = [], 0
    for t in tokens:
        i = ja.find(t["s"], pos)
        spans.append((i, i + len(t["s"])))
        pos = i + len(t["s"])
    own = deck_terms()[n][1]
    by_spelling = {k: term for m, (term, ks) in deck_terms().items() if m != n for k in ks if k not in own}
    hits: dict[str, str] = {}
    for i in range(len(tokens)):
        for j in range(i, min(i + TERM_SPAN, len(tokens))):
            if spans[j][1] > a and spans[i][0] < b:
                break  # the run reaches the target
            surface = "".join(t["s"] for t in tokens[i:j + 1])
            lemma = "".join(t["s"] for t in tokens[i:j]) + (tokens[j].get("b") or tokens[j]["s"])
            for k in (surface, lemma):
                if k in by_spelling:
                    hits.setdefault(by_spelling[k], surface)
    return hits


def check_one_target(n: str, r: dict) -> None:
    """§7 check 4: a contract-v2 written passage uses no other deck word, unless it lists the word
    in `allow` and says why in `allowReason` (the word is already in review, or nothing else fits)"""
    where = f"{n}: {r['ja'][:24]}…"
    allow = r.get("allow", [])
    reason = r.get("allowReason", "")
    if not isinstance(allow, list) or (allow and not (isinstance(reason, str) and reason.strip())):
        raise SystemExit(f"{where} allow must be a list of deck terms with an allowReason")
    hits = other_terms(n, r["ja"], r["form"])
    if bad := [f"{t}（{s}）" for t, s in hits.items() if t not in allow]:
        raise SystemExit(f"{where} uses other deck words: {'、'.join(bad)}; swap them, or list them in allow with an allowReason")
    if stale := [t for t in allow if t not in hits]:
        raise SystemExit(f"{where} allow lists {'、'.join(map(str, stale))}, which the passage does not use")


def v2_first(rows: list[dict]) -> list[dict]:
    """a word's passages with the contract-v2 ones (a `register`) first, each group in the order read"""
    return [r for r in rows if r.get("register")] + [r for r in rows if not r.get("register")]


def batch_order(path: str) -> tuple[str, str]:
    """undated files first, then dated batches by date"""
    m = re.search(r"\d{4}-\d{2}-\d{2}", Path(path).name)
    return (m.group(0) if m else "", Path(path).name)


def written_record(n: str, r: dict) -> dict:
    """a written passage as mcd.json holds it, after its checks"""
    extra = optional(n, r)
    check_written(n, r)
    if r.get("register"):
        check_one_target(n, r)
    return {"ja": r["ja"], "form": r["form"], "en": r["en"], "kind": "original",
            "site": "書き下ろし（このデッキ用）", "url": "", "licence": "Bunki original", "title": "", **extra}


def main() -> int:
    ranked = json.loads((DECK / "mining" / "passages_ranked.json").read_text("utf-8"))
    mined = json.loads((SRC / "mined.json").read_text("utf-8"))
    entries = {str(e["n"]): e for e in json.loads((SRC / "entries.json").read_text("utf-8"))}
    out: dict[str, list[dict]] = {}
    for f in sorted(glob.glob(str(SRC / "mcd" / "*.json")), key=batch_order):
        for n, rows in json.load(open(f, encoding="utf-8")).items():
            pool = {p["ja"]: p for p in ranked.get(n, {}).get("passages", [])}
            pool.update({s["ja"]: s for s in mined.get(n, [])})
            e = entries[n]
            keys = sorted([e["term"], *VARIANTS.get(e["term"], [])], key=len, reverse=True)
            res = out.setdefault(n, [])
            for r in rows:
                if any(x["ja"] == r["ja"] for x in res):
                    raise SystemExit(f"{n}: the same passage twice: {r['ja'][:40]}")
                if r.get("original"):
                    res.append(written_record(n, r))
                    continue
                extra = optional(n, r)
                p = pool.get(r["ja"])
                if not p:
                    raise SystemExit(f"{n}: not a candidate: {r['ja'][:40]}")
                form = p.get("form") or next((k for k in keys if k in r["ja"]), None)
                if not form:
                    m = re.search(re.escape(e["term"][:-1]) + r"\w", r["ja"]) if len(e["term"]) > 1 else None
                    form = m.group(0) if m else None
                if not form:
                    raise SystemExit(f"{n}: word not found in {r['ja'][:40]}")
                res.append({"ja": r["ja"], "form": form, "en": r["en"], "kind": p.get("kind", "other"), "site": p.get("site", ""),
                            "url": p.get("url", ""), "licence": p.get("licence") or UNVERIFIED, "title": p.get("title", ""),
                            **{k: p[k] for k in ("author", "translator") if p.get(k)}, **extra})
    for n, rows in out.items():
        out[n] = v2_first(rows)
    (SRC / "mcd.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    orig = sum(1 for rows in out.values() for r in rows if r["kind"] == "original")
    v2 = sum(1 for rows in out.values() for r in rows if r.get("register"))
    print(f"mcd.json: {len(out)} words · {sum(map(len, out.values()))} passages ({orig} written for the deck, {v2} to contract v2)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
