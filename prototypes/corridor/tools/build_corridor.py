"""Build the 回廊 KAIRO corridor prototype's data bundle from REAL repo assets.

Nothing here is mocked. Every field traces to a committed corpus asset or to a
pinned upstream fetched under its recorded sha256:

  passages   corpus/samples/wikinews  (ja.wikinews, CC BY 4.0)
             corpus/samples/aozora    (青空文庫 clean, PD, 新字新仮名 only)
             corpus/samples/yasashii  (ISA やさしい日本語 glossary, ruby preserved)
  grading    corpus.grading.grade — the real three-signal grader from PR #58,
             with the NINJAL 国語研教育基本語彙 substrate (CC BY 4.0) fetched
             from its pinned URL and verified against its recorded sha256.
  kanji      apps/app/src/data/generated/drift-kanji.json (KINFO/KRAD)
             corpus/datasets/kanji/kanken.jsonl (漢検級, CC0)
  radicals   prototypes/drift/data/radk.json (RADK families)
             corpus/datasets/kanji/kanken_radicals.jsonl (names, CC0)
  words      prototypes/drift/data/wbig.json (6,687 words)
             prototypes/drift/data/sem.json (82 words, semantic edges + notes)
  idioms     corpus/datasets/jmdict_idioms/idioms.jsonl (JMdict, CC BY-SA)

LICENCE POOLS (corpus/src/corpus/provenance.py, Wayfinder #41/#51). The two
pools are written to SEPARATE bundle files and never merged into one record
set. The prototype loads both and marks every ShareAlike node in the UI; the
combined deployed artifact is therefore itself ShareAlike. That boundary is
made visible rather than crossed silently — see the note filed on #41.

Usage:  python build_corridor.py [--out DIR]
Requires fugashi + unidic-lite + jreadability (see requirements note in the log).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORRIDOR = HERE.parent
REPO = CORRIDOR.parent.parent

sys.path.insert(0, str(REPO / "corpus" / "src"))

KATA_TO_HIRA_OFFSET = ord("ぁ") - ord("ァ")
KANA_RE = re.compile(r"^[ぁ-ゖァ-ヺー々〆〤ｦ-ﾟ]+$")
KANJI_RE = re.compile(r"[一-鿌㐀-䶵豈-﫿]")


def kata_to_hira(s: str) -> str:
    return "".join(
        chr(ord(c) + KATA_TO_HIRA_OFFSET) if "ァ" <= c <= "ヶ" else c for c in s
    )


def has_kanji(s: str) -> bool:
    return bool(KANJI_RE.search(s))


def is_kana(s: str) -> bool:
    return bool(s) and bool(KANA_RE.match(s))


# --------------------------------------------------------------------------
# Furigana alignment
# --------------------------------------------------------------------------
def furigana_pairs(surface: str, reading: str) -> list[dict]:
    """Split ``surface`` into [{t: text, r: ruby|None}] against its kana reading.

    Kana runs in the surface are anchored literally; each kanji run absorbs the
    reading between its anchors. Returns a single unruby'd pair when the
    alignment does not hold (never guesses).
    """
    if not reading or not has_kanji(surface):
        return [{"t": surface}]

    runs: list[tuple[str, bool]] = []  # (text, is_kanji_run)
    for ch in surface:
        kanji = not is_kana(ch)
        if runs and runs[-1][1] == kanji:
            runs[-1] = (runs[-1][0] + ch, kanji)
        else:
            runs.append((ch, kanji))

    pattern = "".join(
        "(.+?)" if kanji else re.escape(kata_to_hira(text)) for text, kanji in runs
    )
    m = re.fullmatch(pattern, kata_to_hira(reading))
    if not m:
        return [{"t": surface, "r": kata_to_hira(reading)}]

    out: list[dict] = []
    gi = 1
    for text, kanji in runs:
        if kanji:
            out.append({"t": text, "r": m.group(gi)})
            gi += 1
        else:
            out.append({"t": text})
    return out


# --------------------------------------------------------------------------
# Source loading
# --------------------------------------------------------------------------
def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]


RUBY_RE = re.compile(r"｜([^《]+)《([^》]+)》")


def strip_ruby(text: str) -> str:
    return RUBY_RE.sub(lambda m: m.group(1), text)


def ruby_pairs_from_markup(text: str) -> list[dict]:
    """Aozora-style ｜漢字《かな》 markup → furigana pair list (SOURCE ruby)."""
    out: list[dict] = []
    pos = 0
    for m in RUBY_RE.finditer(text):
        if m.start() > pos:
            out.append({"t": text[pos : m.start()]})
        out.append({"t": m.group(1), "r": m.group(2)})
        pos = m.end()
    if pos < len(text):
        out.append({"t": text[pos:]})
    return out


SENT_END = re.compile(r"(?<=[。！？])")


def excerpt(text: str, limit: int) -> tuple[str, bool]:
    """First whole sentences up to ``limit`` characters. Never mid-sentence."""
    text = text.strip()
    if len(text) <= limit:
        return text, False
    out = ""
    for chunk in SENT_END.split(text):
        if not chunk:
            continue
        if out and len(out) + len(chunk) > limit:
            break
        out += chunk
    return (out.strip() or text[:limit]), True


# --------------------------------------------------------------------------
# Shelf assembly
# --------------------------------------------------------------------------
EXCERPT_LIMIT = 520


def build_shelf() -> list[dict]:
    shelf: list[dict] = []

    wikinews = read_jsonl(REPO / "corpus/samples/wikinews/sample.jsonl")
    for rec in wikinews:
        body, truncated = excerpt(rec["text"].replace("\n\n", "\n"), EXCERPT_LIMIT)
        shelf.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "text": body,
                "truncated": truncated,
                "source": "ja.wikinews",
                "sourceLabel": "ウィキニュース",
                "pool": "proprietary_safe",
                "licence": "CC BY 4.0",
                "attribution": "ja.wikinews contributors, CC BY 4.0",
                "url": rec.get("meta", {}).get("url", ""),
                "date": rec.get("meta", {}).get("date", ""),
                "rubySource": "tokenizer",
            }
        )

    aozora = read_jsonl(REPO / "corpus/samples/aozora/sample.jsonl")
    for rec in aozora:
        body, truncated = excerpt(rec["text"].replace("\n", ""), EXCERPT_LIMIT)
        meta = rec.get("meta", {})
        shelf.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "text": body,
                "truncated": truncated,
                "source": "aozorabunko-clean",
                "sourceLabel": f"青空文庫 · {meta.get('author', '')}",
                "pool": "proprietary_safe",
                "licence": "PD (著作権フラグ なし) · 新字新仮名",
                "attribution": f"青空文庫 {meta.get('author', '')}「{rec['title']}」",
                "url": meta.get("card_url", ""),
                "date": str(meta.get("first_published", "")),
                "rubySource": "tokenizer",
            }
        )

    yasashii = read_jsonl(REPO / "corpus/samples/yasashii/sample.jsonl")
    for rec in yasashii[:3]:
        meta = rec.get("meta", {})
        shelf.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "text": strip_ruby(rec["text"]),
                "rubyMarkup": rec["text"],
                "headwordRuby": meta.get("headword_ruby", ""),
                "truncated": False,
                "source": "isa-yasashii-glossary",
                "sourceLabel": "やさしい日本語 用語集",
                "pool": "proprietary_safe",
                "licence": "ISA やさしい日本語 glossary",
                "attribution": "出入国在留管理庁「やさしい日本語」用語集",
                "url": "",
                "date": "",
                "rubySource": "markup",
            }
        )

    return shelf


# --------------------------------------------------------------------------
# Tokenisation + grading
# --------------------------------------------------------------------------
def tokenise(text: str, tagger) -> list[dict]:
    from corpus.grading._mecab import is_content, is_punct

    tokens: list[dict] = []
    for tok in tagger(text):
        feat = tok.feature
        reading = kata_to_hira(feat.kana or "") if feat.kana else ""
        base = feat.orthBase or tok.surface
        tokens.append(
            {
                "s": tok.surface,
                "b": base,
                "p": feat.pos1,
                "r": reading,
                "f": furigana_pairs(tok.surface, reading),
                "c": bool(is_content(tok)) and not is_punct(tok),
            }
        )
    return tokens


def ruby_spans(markup: str) -> tuple[str, list[tuple[int, int, str]]]:
    """(plain text, [(start, end, ruby)]) in plain-text character coordinates."""
    plain_parts: list[str] = []
    spans: list[tuple[int, int, str]] = []
    pos = 0
    length = 0
    for m in RUBY_RE.finditer(markup):
        lead = markup[pos : m.start()]
        plain_parts.append(lead)
        length += len(lead)
        body = m.group(1)
        spans.append((length, length + len(body), m.group(2)))
        plain_parts.append(body)
        length += len(body)
        pos = m.end()
    plain_parts.append(markup[pos:])
    return "".join(plain_parts), spans


def tokenise_ruby_markup(markup: str, tagger) -> list[dict]:
    """Token stream for a passage carrying SOURCE ruby. Ruby spans are mapped
    onto tokens by character position, so a span covering part of a token
    (｜子《こ》ども → token 子ども) still yields real source furigana."""
    plain, spans = ruby_spans(markup)
    tokens = tokenise(plain, tagger)
    offset = 0
    for tok in tokens:
        start, end = offset, offset + len(tok["s"])
        offset = end
        inside = [s for s in spans if s[0] >= start and s[1] <= end]
        if not inside:
            continue
        pairs: list[dict] = []
        cursor = start
        for s_start, s_end, ruby in sorted(inside):
            if s_start > cursor:
                pairs.append({"t": plain[cursor:s_start]})
            pairs.append({"t": plain[s_start:s_end], "r": ruby})
            cursor = s_end
        if cursor < end:
            pairs.append({"t": plain[cursor:end]})
        tok["f"] = pairs
        tok["rs"] = "markup"
    return tokens


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(CORRIDOR / "data"))
    args = ap.parse_args()
    out = Path(args.out)
    (out).mkdir(parents=True, exist_ok=True)

    from corpus.grading._mecab import get_tagger
    from corpus.grading.grade import grade

    tagger = get_tagger()

    print("· assembling shelf")
    shelf = build_shelf()

    print(f"· tokenising + grading {len(shelf)} passages with the real grader")
    for passage in shelf:
        if passage.get("rubyMarkup"):
            passage["tokens"] = tokenise_ruby_markup(passage["rubyMarkup"], tagger)
        else:
            passage["tokens"] = tokenise(passage["text"], tagger)
        passage["grading"] = grade(passage["text"], tagger=tagger)
        passage.pop("rubyMarkup", None)
        print(
            f"    {passage['id']:>16}  {len(passage['text']):>4}字  "
            f"jread={passage['grading']['signals']['jreadability']['score']:.2f} "
            f"({passage['grading']['signals']['jreadability']['band']})  "
            f"disagree={passage['grading']['disagreement']['flag']}"
        )

    # ---------------- graph layers ----------------
    print("· building the graph layers")
    kinfo_raw = json.loads((REPO / "apps/app/src/data/generated/drift-kanji.json").read_text("utf-8"))
    KINFO, KRAD = kinfo_raw["KINFO"], kinfo_raw["KRAD"]
    radk = json.loads((REPO / "prototypes/drift/data/radk.json").read_text("utf-8"))
    RADK = radk["RADK"]
    wbig = json.loads((REPO / "prototypes/drift/data/wbig.json").read_text("utf-8"))
    sem = json.loads((REPO / "prototypes/drift/data/sem.json").read_text("utf-8"))

    kanken_level: dict[str, str] = {}
    kanken_rank: dict[str, int] = {}
    for rec in read_jsonl(REPO / "corpus/datasets/kanji/kanken.jsonl"):
        glyph = rec.get("glyph")
        if glyph and glyph not in kanken_level:
            kanken_level[glyph] = rec.get("kanken_level", "")
            kanken_rank[glyph] = rec.get("kanken_rank", 0)

    radical_names: dict[str, dict] = {}
    for rec in read_jsonl(REPO / "corpus/datasets/kanji/kanken_radicals.jsonl"):
        glyph = rec["radical"]
        plain = unicodedata.normalize("NFKC", glyph)
        entry = {"name": rec.get("name", ""), "strokes": rec.get("strokes"), "codepoint": rec.get("codepoint", "")}
        radical_names[glyph] = entry
        radical_names.setdefault(plain, entry)

    # words: the full wbig lexicon, so word->kanji->word never dead-ends
    words: dict[str, dict] = {}
    for entry in wbig:
        word, reading, gloss, level = entry[0], entry[1], entry[2], entry[3]
        words.setdefault(
            word,
            {
                "w": word,
                "r": reading,
                "g": gloss,
                "jlpt": level,
                "k": sorted({c for c in word if c in KINFO}),
            },
        )

    # every word that appears as a content token in the shelf, even if wbig
    # does not carry it — the reader must never open an empty panel
    shelf_words: dict[str, dict] = {}
    for passage in shelf:
        for tok in passage["tokens"]:
            if not tok["c"]:
                continue
            base = tok["b"]
            if base in words or base in shelf_words:
                continue
            shelf_words[base] = {
                "w": base,
                "r": tok["r"],
                "g": "",
                "jlpt": None,
                "k": sorted({c for c in base if c in KINFO}),
                "fromText": True,
            }
    words.update(shelf_words)

    # semantic edges — ours, with the discrimination notes intact
    sem_out: dict[str, list] = {}
    for head, edges in sem.items():
        sem_out[head] = [
            {"w": target, "rel": rel, "note": note} for target, rel, note in edges
        ]
        if head not in words:
            words[head] = {"w": head, "r": "", "g": "", "jlpt": None,
                           "k": sorted({c for c in head if c in KINFO}), "fromSem": True}
        for target, _rel, _note in edges:
            if target not in words:
                words[target] = {"w": target, "r": "", "g": "", "jlpt": None,
                                 "k": sorted({c for c in target if c in KINFO}), "fromSem": True}

    # Readings for words the 6,687-word lexicon does not carry (sem-tier heads
    # and targets, text-only words): read them off the SAME pinned tokenizer
    # that graded the shelf. Derived, never invented — and marked as derived.
    derived_readings = 0
    for word in words.values():
        if word.get("r"):
            continue
        reading = "".join(kata_to_hira(t.feature.kana or "") for t in tagger(word["w"]))
        if reading and reading != word["w"]:
            word["r"] = reading
            word["rd"] = True
            derived_readings += 1
    print(f"    readings derived from UniDic for {derived_readings} words")

    # kanji -> words containing it is derived in the browser from words.json's
    # `k` arrays (same data, ~400 KB smaller over the wire); the cap the UI
    # applies is declared in the manifest, not hidden.
    KANJI_WORD_CAP = 60

    kanji: dict[str, dict] = {}
    for ch, info in KINFO.items():
        on, kun, meaning, strokes = info
        kanji[ch] = {
            "c": ch,
            "on": [r for r in on.split("・") if r],
            "kun": [r for r in kun.split("・") if r],
            "m": meaning,
            "st": strokes,
            "kk": kanken_level.get(ch, ""),
            "kr": kanken_rank.get(ch, 0),
            "parts": KRAD.get(ch, []),
        }

    radicals: dict[str, dict] = {}
    for part, family in RADK.items():
        meta = radical_names.get(part) or radical_names.get(unicodedata.normalize("NFKC", part)) or {}
        members = [c for c in family if c in kanji]
        radicals[part] = {
            "c": part,
            "name": meta.get("name", ""),
            "st": meta.get("strokes"),
            "kanji": members[:80],
            "kanjiCount": len(members),
            "isKanji": part in kanji,
        }
    # components referenced by KRAD that RADK has no family for still need a page
    for parts in KRAD.values():
        for part in parts:
            if part not in radicals:
                meta = radical_names.get(part) or radical_names.get(unicodedata.normalize("NFKC", part)) or {}
                members = [c for c, k in kanji.items() if part in k["parts"]]
                radicals[part] = {
                    "c": part,
                    "name": meta.get("name", ""),
                    "st": meta.get("strokes"),
                    "kanji": members[:80],
                    "kanjiCount": len(members),
                    "isKanji": part in kanji,
                }

    # ---------------- ShareAlike pool: idioms ----------------
    print("· indexing idioms (ShareAlike pool, kept separate)")
    idioms_all = read_jsonl(REPO / "corpus/datasets/jmdict_idioms/idioms.jsonl")
    shelf_kanji = {c for p in shelf for c in p["text"] if c in kanji}
    sem_kanji = {c for head in sem_out for c in head if c in kanji}
    focus = shelf_kanji | sem_kanji

    idioms: list[dict] = []
    for rec in idioms_all:
        forms = rec.get("kanji") or []
        if not forms:
            continue
        head = forms[0]
        chars = {c for c in head if c in kanji}
        if not chars or not (chars & focus):
            continue
        glosses = [g for group in rec.get("glosses", []) for g in group]
        idioms.append(
            {
                "w": head,
                "r": (rec.get("kana") or [""])[0],
                "g": glosses[:3],
                "yoji": len(head) == 4 and all(c in kanji for c in head),
                "k": sorted(chars),
                "seq": rec.get("jmdict_seq", ""),
            }
        )
    idioms.sort(key=lambda i: (not i["yoji"], i["w"]))
    IDIOM_CAP = 900
    idioms_kept = idioms[:IDIOM_CAP]
    kanji_idioms: dict[str, list[str]] = defaultdict(list)
    for idiom in idioms_kept:
        for ch in idiom["k"]:
            kanji_idioms[ch].append(idiom["w"])

    # ---------------- write ----------------
    print("· writing bundles")
    pools = {
        "proprietary_safe": {
            "passages.json": {
                "pool": "proprietary_safe",
                "sources": [
                    {"name": "ja.wikinews", "licence": "CC BY 4.0",
                     "attribution": "ja.wikinews contributors, CC BY 4.0",
                     "url": "https://ja.wikinews.org/"},
                    {"name": "aozorabunko-clean", "licence": "PD (著作権フラグ なし)",
                     "attribution": "青空文庫", "url": "https://www.aozora.gr.jp/"},
                    {"name": "isa-yasashii-glossary", "licence": "出入国在留管理庁 やさしい日本語 用語集",
                     "attribution": "出入国在留管理庁", "url": ""},
                    {"name": "ninjal-kyoiku-kihon-goi", "licence": "CC BY 4.0",
                     "attribution": "「日本語教育基本語彙データベース」国立国語研究所 (CC BY 4.0) を加工して利用。",
                     "url": "https://mmsrv.ninjal.ac.jp/brfvep/"},
                ],
                "passages": shelf,
            },
            "kanken.json": {
                "pool": "proprietary_safe",
                "sources": [
                    {"name": "kanken kanji fact table", "licence": "CC0",
                     "attribution": "日本漢字能力検定 配当漢字 (CC0 fact table)", "url": ""},
                ],
                "levels": {ch: {"kk": k["kk"], "kr": k["kr"]} for ch, k in kanji.items() if k["kk"]},
            },
            "sem.json": {
                "pool": "proprietary_safe",
                "sources": [{"name": "bunki sem tier", "licence": "project-owned",
                             "attribution": "回廊 semantic tier (this project)", "url": ""}],
                "edges": sem_out,
            },
        },
        "share_alike": {
            "kanji.json": {
                "pool": "share_alike",
                "sources": [
                    {"name": "KANJIDIC2-derived readings/meanings", "licence": "CC BY-SA 4.0",
                     "attribution": "Electronic Dictionary Research and Development Group, KANJIDIC2 (CC BY-SA)",
                     "url": "https://www.edrdg.org/"},
                    {"name": "KanjiVG components/strokes", "licence": "CC BY-SA 3.0",
                     "attribution": "KanjiVG, Ulrich Apel (CC BY-SA 3.0)",
                     "url": "https://kanjivg.tagaini.net/"},
                ],
                "kanji": kanji,
                "radicals": radicals,
            },
            "words.json": {
                "pool": "share_alike",
                "sources": [
                    {"name": "wbig glosses", "licence": "CC BY-SA 4.0 (JMdict lineage)",
                     "attribution": "JMdict/EDICT, Electronic Dictionary Research and Development Group (CC BY-SA)",
                     "url": "https://www.edrdg.org/"},
                ],
                "words": words,
            },
            "idioms.json": {
                "pool": "share_alike",
                "sources": [
                    {"name": "JMdict idiom layer", "licence": "CC BY-SA 4.0",
                     "attribution": "JMdict, Electronic Dictionary Research and Development Group (CC BY-SA)",
                     "url": "https://www.edrdg.org/"},
                ],
                "idioms": idioms_kept,
                "byKanji": kanji_idioms,
                "totalCandidates": len(idioms),
                "cap": IDIOM_CAP,
            },
        },
    }

    manifest = {
        "built": "deterministic — no clock, no rng",
        "grader": {
            "package": "corpus.grading (PR #58)",
            "tokenizer": "fugashi + unidic-lite (UniDic 2.1.2 lineage)",
            "substrate": "ninjal-kyoiku-kihon-goi (6,103 words; CC BY 4.0)",
            "substrateSha256": "80f190abebfe5fdfc52aec06a6c9c842eb4b1ff25b6687f135547a81902607af",
            "law": "three signals, never averaged; disagreement surfaced, never resolved",
        },
        "counts": {
            "passages": len(shelf),
            "words": len(words),
            "kanji": len(kanji),
            "radicals": len(radicals),
            "idioms": len(idioms_kept),
            "semHeads": len(sem_out),
        },
        "caps": {
            "excerptChars": EXCERPT_LIMIT,
            "kanjiWordCap": KANJI_WORD_CAP,
            "radicalKanjiCap": 80,
            "idiomCap": IDIOM_CAP,
            "idiomCandidates": len(idioms),
            "idiomTotalInSource": len(idioms_all),
        },
        "pools": {pool: sorted(files) for pool, files in pools.items()},
    }

    for pool, files in pools.items():
        pool_dir = out / pool
        pool_dir.mkdir(parents=True, exist_ok=True)
        for name, payload in files.items():
            path = pool_dir / name
            path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf-8")
            print(f"    {path.relative_to(CORRIDOR)}  {path.stat().st_size / 1024:.0f} KB")

    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(manifest["counts"], ensure_ascii=False))

    # coverage report — what the shelf actually resolves
    unresolved = Counter()
    for passage in shelf:
        for tok in passage["tokens"]:
            if tok["c"] and not words.get(tok["b"], {}).get("g"):
                unresolved[tok["b"]] += 1
    print(f"· shelf content tokens with no gloss: {sum(unresolved.values())} "
          f"({len(unresolved)} distinct) — panel still opens, gloss field marked absent")
    (out / "coverage.json").write_text(
        json.dumps({"noGloss": unresolved.most_common(), "distinct": len(unresolved)},
                   ensure_ascii=False, indent=1), "utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
