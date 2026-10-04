#!/usr/bin/env python3
"""Pick the pilot slice of the N2/N1 collection from committed data only, so the
list in docs/srs/n2n1/pilot-slice.json can be rebuilt from a clean checkout.

The plan is docs/srs/n2n1/PLAN.md (section 4). Nothing here mines passages,
writes cards or touches the two shipped decks; it only decides which items the
pilot covers and records where each one came from and how its level was derived.

Inputs (read-only, all in git)
  prototypes/drift/data/wbig.json                      word list with unofficial N levels
  decks/kotoba-mine/source/entries.json                the learner's 323 words (same sense collection)
  prototypes/corridor/data/share_alike/dict-v2/*.json  JMdict subset: written forms, common flag, POS
  corpus/datasets/wikinews/archive.jsonl               694 CC BY articles: passage candidate counts
  prototypes/corridor/corridor.js                      the GRAMMAR array (read with a regex, never edited)
  prototypes/corridor/data/original/grammar-v11.json   more grammar points
  corpus/datasets/kanji/kanken.jsonl                   Kanken level per glyph (CC0)
  corpus/datasets/jmdict_idioms/idioms.jsonl           JMdict idiom layer

Rules (see PLAN.md 4.1 for the reasoning)
  vocabulary  wbig level 2, has kanji, not an affix (～), a JMdict-common entry whose written
              forms include the headword, and at least MIN_UNITS Wikinews passage units in
              which the headword occurs as a whole token run or lemma. Sorted by unit count,
              then headword; the first VOCAB_TARGET become `v` items. Headwords the learner
              already has in kotoba-mine are listed as `linked`, not counted, never duplicated.
  expression  the same pool when the JMdict entry is tagged `exp`, plus every entry of the
              JMdict idiom layer (慣用句, 四字熟語, ことわざ) that occurs in at least one Wikinews
              unit. The idiom layer has no level; the item says so.
  grammar     every N2 point in the corridor GRAMMAR array, plus grammar-v11 N2 points whose
              pattern is not already there.
  kanji       glyphs of the chosen vocabulary whose Kanken level is a secondary-school jōyō
              band (4級, 3級, 準2級, 2級) and that occur in at least MIN_HOSTS chosen headwords;
              each lists its host words.

Ids are stable: an existing pilot-slice.json is read first and every dedup key keeps the id
it already has; new keys take the next free number of their kind (the A25 discipline).

Run from the repo root:
  python3 decks/n2n1/tools/pilot_slice.py            write docs/srs/n2n1/pilot-slice.json
  python3 decks/n2n1/tools/pilot_slice.py --check    fail if the committed file differs
Then: npx prettier --write docs/srs/n2n1/pilot-slice.json
Needs: pip install fugashi unidic-lite==1.0.8
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = REPO / "docs" / "srs" / "n2n1" / "pilot-slice.json"

WBIG = REPO / "prototypes/drift/data/wbig.json"
ENTRIES = REPO / "decks/kotoba-mine/source/entries.json"
DICT_DIR = REPO / "prototypes/corridor/data/share_alike/dict-v2"
WIKINEWS = REPO / "corpus/datasets/wikinews/archive.jsonl"
CORRIDOR_JS = REPO / "prototypes/corridor/corridor.js"
GRAMMAR_V11 = REPO / "prototypes/corridor/data/original/grammar-v11.json"
KANKEN = REPO / "corpus/datasets/kanji/kanken.jsonl"
IDIOMS = REPO / "corpus/datasets/jmdict_idioms/idioms.jsonl"
INPUTS = [WBIG, ENTRIES, DICT_DIR / "index.json", WIKINEWS, CORRIDOR_JS, GRAMMAR_V11, KANKEN, IDIOMS]

LEVEL = 2
VOCAB_TARGET = 300
MIN_UNITS = 2
MIN_HOSTS = 1
MAX_RUN = 8  # tokens joined when looking for a headword or idiom as a surface run
UNIT_MIN, UNIT_MAX = 80, 450
KANJI_LEVELS = ("4級", "3級", "準2級", "2級")
KANJI = re.compile(r"[㐀-鿿々]")
SENTENCE_END = re.compile(r"(?<=[。！？])")
LEVEL_DERIVATION = (
    "open-anki-jlpt-decks level tag (chyyran/jlpt-anki-decks → tanos.co.uk lineage); "
    "an editorial estimate, not an official JLPT inventory"
)
GRAMMAR_DERIVATION = "author's own level label in the pattern file; no external source"
KANJI_DERIVATION = (
    "Kanken level from mimneko/kanji-data (CC0); 4級–2級 are the secondary-school jōyō bands, not a JLPT level"
)
IDIOM_DERIVATION = "JMdict idiom layer (id/yoji/proverb tags); no level source exists, attested in the CC BY Wikinews archive"


def rel(p: Path) -> str:
    return str(p.relative_to(REPO))


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


# ------------------------------------------------------------------ dictionary
def load_dict() -> tuple[dict[str, list[tuple[str, int]]], dict[str, set[str]]]:
    """written form → [(seq, commonFlag)], and seq → part-of-speech tags"""
    index = json.loads((DICT_DIR / "index.json").read_text("utf-8"))
    by_form: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for row in index["entries"]:
        seq, written, common = row[0], row[4], row[8]
        for form in written:
            by_form[form].append((seq, int(common)))
    pos: dict[str, set[str]] = {}
    for shard in sorted(DICT_DIR.glob("[0-9][0-9].json")):
        for seq, _kanji, _kana, senses in json.loads(shard.read_text("utf-8"))["entries"]:
            tags: set[str] = set()
            for sense in senses:
                tags.update(sense[0])
            pos[seq] = tags
    return by_form, pos


# ------------------------------------------------------------------ Wikinews units
def units_of(text: str) -> list[str]:
    """2–3 consecutive sentences inside one paragraph, UNIT_MIN–UNIT_MAX characters"""
    out = []
    for para in text.split("\n"):
        sents = [s for s in SENTENCE_END.split(para.strip()) if s.strip()]
        for n in (2, 3):
            for i in range(len(sents) - n + 1):
                u = "".join(sents[i : i + n])
                if UNIT_MIN <= len(u) <= UNIT_MAX:
                    out.append(u)
    return out


def count_units(headwords: list[str]) -> tuple[dict[str, int], dict[str, set[str]]]:
    """how many Wikinews units contain each headword as a whole token run or as a token's
    lemma (never as a bare substring: 率直 is not 率), and the ids of the articles they are in"""
    import fugashi  # a build dependency of the decks already

    tagger = fugashi.Tagger()
    wanted = set(headwords)
    hits: Counter[str] = Counter()
    refs: dict[str, set[str]] = defaultdict(set)
    seen: set[str] = set()
    with WIKINEWS.open("r", encoding="utf-8") as fh:
        for line in fh:
            art = json.loads(line)
            for unit in units_of(art["text"]):
                if unit in seen:
                    continue
                seen.add(unit)
                found: set[str] = set()
                toks = [(w.surface, w.feature.lemma or "", w.feature.orthBase or "") for w in tagger(unit)]
                for i, (surface, lemma, base) in enumerate(toks):
                    if lemma in wanted:
                        found.add(lemma)
                    if base in wanted:
                        found.add(base)
                    run = surface
                    if run in wanted:
                        found.add(run)
                    for j in range(i + 1, min(i + MAX_RUN, len(toks))):
                        run += toks[j][0]
                        if run in wanted:
                            found.add(run)
                for h in found:
                    hits[h] += 1
                    refs[h].add(art["id"])
    return hits, refs


# ------------------------------------------------------------------ grammar
JS_STR = r"(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")"  # a JS string in either quote
GRAMMAR_ROW = re.compile(rf"^\s*\{{ id: '([^']+)', p: '([^']+)', lv: '(N\d)', mEn: {JS_STR}, mJa: {JS_STR}")


def js_str(single: str | None, double: str | None) -> str:
    return (single if single is not None else double or "").replace("\\'", "'").replace('\\"', '"')


def norm_pattern(p: str) -> set[str]:
    return {re.sub(r"[〜～\s（）()]", "", v) for v in re.split(r"[／/]", p) if v.strip()}


def grammar_points() -> list[dict]:
    """N2 rows of the corridor GRAMMAR array (regex over the pinned file; it is not edited),
    then grammar-v11 N2 points whose pattern is not already covered"""
    lines = CORRIDOR_JS.read_text("utf-8").splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("const GRAMMAR = ["))
    out, covered = [], set()
    for n in range(start + 1, len(lines)):
        if lines[n].startswith("];"):
            break
        m = GRAMMAR_ROW.match(lines[n])
        if not m:
            continue
        gid, pattern, lv = m.group(1), m.group(2), m.group(3)
        m_en, m_ja = js_str(m.group(4), m.group(5)), js_str(m.group(6), m.group(7))
        if lv != f"N{LEVEL}":
            continue
        covered |= norm_pattern(pattern)
        out.append({"key": f"g|{gid}", "headword": pattern, "reading": "", "meaningEn": m_en, "meaningJa": m_ja,
                    "source": {"path": rel(CORRIDOR_JS), "line": n + 1, "id": gid}})
    v11 = json.loads(GRAMMAR_V11.read_text("utf-8"))
    for e in v11["entries"]:
        if e["lv"] != f"N{LEVEL}" or norm_pattern(e["p"]) & covered:
            continue
        covered |= norm_pattern(e["p"])
        out.append({"key": f"g|{e['id']}", "headword": e["p"], "reading": "", "meaningEn": e["mEn"], "meaningJa": e.get("mJa", ""),
                    "source": {"path": rel(GRAMMAR_V11), "id": e["id"]}})
    return out


# ------------------------------------------------------------------ kanji
def kanken_levels() -> dict[str, str]:
    """glyph → Kanken level of its 親字 row; a glyph with two 親字 rows (芸) keeps the easier"""
    order = ["10級", "9級", "8級", "7級", "6級", "5級", "4級", "3級", "準2級", "2級", "準1級", "1/準1級", "1級", "配当外"]
    levels: dict[str, str] = {}
    with KANKEN.open("r", encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            if r["form"] != "親字" or not r["glyph"]:
                continue
            g, lv = r["glyph"], r["kanken_level"]
            if g not in levels or order.index(lv) < order.index(levels[g]):
                levels[g] = lv
    return levels


# ------------------------------------------------------------------ ids
def id_assigner(previous: dict[str, str]):
    used: dict[str, int] = defaultdict(int)
    for iid in previous.values():
        kind, num = iid.split("-")[1], int(iid.split("-")[2])
        used[kind] = max(used[kind], num)

    def assign(kind: str, key: str) -> str:
        if key in previous:
            return previous[key]
        used[kind] += 1
        return f"nn-{kind}-{used[kind]:04d}"

    return assign


# ------------------------------------------------------------------ main
def build() -> dict:
    previous: dict[str, str] = {}
    if OUT.exists():
        for item in json.loads(OUT.read_text("utf-8")).get("items", []):
            previous[item["dedupKey"]] = item["id"]
    assign = id_assigner(previous)

    wbig = json.loads(WBIG.read_text("utf-8"))
    rows = [(i, w, r, g) for i, (w, r, g, lv) in enumerate(wbig) if lv == LEVEL]
    mine = json.loads(ENTRIES.read_text("utf-8"))
    mine_forms: dict[str, str] = {}
    for e in mine:
        for f in (e["term"], e.get("reading") or "", e["term"].removesuffix("する")):
            if f:
                mine_forms.setdefault(f, f"km-{e['n']:03d}")
    by_form, pos = load_dict()
    idioms: dict[str, dict] = {}  # written form → idiom row (first form wins)
    with IDIOMS.open("r", encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            for form in row["kanji"]:
                if KANJI.search(form) and 3 <= len(form) <= 12:
                    idioms.setdefault(form, row)

    pool = []
    dropped = Counter()
    for i, w, r, g in rows:
        if "～" in w:
            dropped["affix"] += 1
            continue
        if not KANJI.search(w):
            dropped["noKanji"] += 1
            continue
        head = w.removesuffix("する") if w.endswith("する") and len(w) > 3 else w
        entries = by_form.get(head, [])
        common = [seq for seq, c in entries if c]
        if not common:
            dropped["notJmdictCommon"] += 1
            continue
        seq = sorted(common)[0]
        is_exp = "exp" in pos.get(seq, set())
        pool.append({"row": i, "headword": w, "match": head, "reading": r, "gloss": g, "seq": seq, "exp": is_exp})

    hits, refs = count_units([p["match"] for p in pool] + list(idioms))
    for p in pool:
        p["units"] = hits.get(p["match"], 0)
        p["refs"] = sorted(refs.get(p["match"], set()))
    # most distinct articles first, so one long article cannot carry a word into the slice
    pool.sort(key=lambda p: (-len(p["refs"]), -p["units"], p["headword"]))

    items: list[dict] = []
    vocab, linked = [], []
    for p in pool:
        if p["units"] < MIN_UNITS:
            dropped["fewUnits"] += 1
            continue
        kind = "x" if p["exp"] else "v"
        km = mine_forms.get(p["headword"]) or mine_forms.get(p["match"])
        if km:
            linked.append((p, kind, km))
            continue
        if kind == "v" and len(vocab) >= VOCAB_TARGET:
            dropped["beyondTarget"] += 1
            continue
        if kind == "v":
            vocab.append(p)
        items.append(make_item(assign, p, kind, "new", km))
    for p, kind, km in linked:
        items.append(make_item(assign, p, kind, "linked", km))

    seen_seq: set[str] = set()
    for form in sorted(idioms, key=lambda f: (-len(refs.get(f, set())), -hits.get(f, 0), f)):
        row = idioms[form]
        if not hits.get(form) or row["jmdict_seq"] in seen_seq:
            continue
        seen_seq.add(row["jmdict_seq"])
        km = mine_forms.get(form)
        items.append({"id": assign("x", f"x|jmdict:{row['jmdict_seq']}"), "kind": "expression",
                      "status": "linked" if km else "new", "dedupKey": f"x|jmdict:{row['jmdict_seq']}",
                      "headword": form, "reading": row["kana"][0] if row["kana"] else "",
                      "glossUpstream": "; ".join(row["glosses"][0][:3]) if row["glosses"] else "",
                      "jmdictSeq": row["jmdict_seq"], "tags": row["misc_tags"],
                      "level": {"label": "unlevelled", "derivation": IDIOM_DERIVATION},
                      "source": {"path": rel(IDIOMS), "jmdictSeq": row["jmdict_seq"]},
                      "passageCandidates": candidates(hits[form], sorted(refs[form])),
                      **({"kotobaMine": km} if km else {})})

    for g in grammar_points():
        items.append({"id": assign("g", g["key"]), "kind": "grammar", "status": "new", "dedupKey": g["key"],
                      "headword": g["headword"], "reading": "", "meaningEn": g["meaningEn"], "meaningJa": g["meaningJa"],
                      "level": {"label": f"N{LEVEL}", "derivation": GRAMMAR_DERIVATION}, "source": g["source"]})

    levels = kanken_levels()
    hosts: dict[str, list[str]] = defaultdict(list)
    for p in vocab:
        for c in dict.fromkeys(KANJI.findall(p["headword"])):
            hosts[c].append(p["headword"])
    for c in sorted(hosts):
        lv = levels.get(c)
        if lv in KANJI_LEVELS and len(hosts[c]) >= MIN_HOSTS:
            items.append({"id": assign("k", f"k|{c}"), "kind": "kanji", "status": "new", "dedupKey": f"k|{c}",
                          "headword": c, "reading": "", "hostWords": hosts[c],
                          "level": {"label": lv, "derivation": KANJI_DERIVATION}, "source": {"path": rel(KANKEN), "glyph": c}})

    counts = Counter((it["kind"], it["status"]) for it in items)
    return {
        "format": "bunki-n2n1-pilot-slice",
        "version": 1,
        "generatedBy": rel(HERE / "pilot_slice.py"),
        "inputs": [{"path": rel(p), "sha256": sha256(p)} for p in INPUTS],
        "rules": {"level": LEVEL, "vocabTarget": VOCAB_TARGET, "minWikinewsUnits": MIN_UNITS, "unitChars": [UNIT_MIN, UNIT_MAX],
                  "kanjiLevels": list(KANJI_LEVELS), "minHostWords": MIN_HOSTS, "maxTokenRun": MAX_RUN,
                  "order": "distinct Wikinews articles, then units, then headword",
                  "match": "whole surface run of up to MAX_RUN UniDic tokens, or token lemma/orthBase; never a bare substring"},
        "counts": {f"{k}:{s}": n for (k, s), n in sorted(counts.items())},
        "dropped": dict(sorted(dropped.items())),
        "items": items,
    }


def candidates(units: int, articles: list[str]) -> dict:
    """an upper bound before ranking and review: units that contain the item, how many
    articles they come from, and the first three article ids as a trace"""
    return {"wikinewsArchiveUnits": units, "wikinewsArticles": len(articles), "sampleArticles": articles[:3]}


def make_item(assign, p: dict, kind: str, status: str, km: str | None) -> dict:
    name = {"v": "vocabulary", "x": "expression"}[kind]
    item = {"id": assign(kind, f"{kind}|{p['headword']}|{p['reading']}"), "kind": name, "status": status,
            "dedupKey": f"{kind}|{p['headword']}|{p['reading']}", "headword": p["headword"], "reading": p["reading"],
            "glossUpstream": p["gloss"], "jmdictSeq": p["seq"],
            "level": {"label": f"N{LEVEL}", "derivation": LEVEL_DERIVATION},
            "source": {"path": rel(WBIG), "row": p["row"]},
            "passageCandidates": candidates(p["units"], p["refs"])}
    if km:
        item["kotobaMine"] = km
    return item


def main() -> int:
    data = build()
    if "--check" in sys.argv:
        if not OUT.exists():
            print(f"✗ {rel(OUT)} missing")
            return 1
        current = json.loads(OUT.read_text("utf-8"))
        if current != data:
            print(f"✗ {rel(OUT)} differs from a fresh run")
            return 1
        print(f"· {rel(OUT)} matches ({len(data['items'])} items)")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"· wrote {rel(OUT)}: {data['counts']} dropped {data['dropped']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
