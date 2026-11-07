#!/usr/bin/env python3
"""Derive the beginner manifest's frequency source from bytes already pinned in this repo.

The spec (S3-OI3) orders the first 500 words "by frequency" but names no list, and the shipped
dict-v2 index carries only JMdict's binary common flag (jmdict-simplified drops the nfNN bands).
This script therefore counts lemmas in the sentence bank the repo already ships and attributes:

  prototypes/corridor/data/proprietary_safe/examples/s-00.json .. s-22.json
    45,276 attested sentences; source code is the last cell of each row:
      0 = SNOW T15/T23 やさしい日本語 corpus (CC BY 4.0)      -> counted
      1 = Tanaka Corpus / Tatoeba via EDRDG examples.utf (CC BY 2.0 FR) -> counted
      2 = ja.wikinews (CC BY 2.5, news register)               -> excluded

Each row is [tokens, english, source]; each token is [surface, orthBase, reading, contentFlag,
pos1, furigana]. The bank keeps the orthographic base (いる), not the lemma (居る / 要る), so the
sentence text is rebuilt from the surfaces and re-tokenised with the same tokenizer lineage the
repo's grader uses (fugashi + unidic-lite) to recover lemma and lemma reading. Counts are then
aggregated per resolved JMdict ent_seq, so spelling variants of one entry (言う/いう, 良い/いい/よい)
count as one word.

Bias, stated plainly: the bank is a coverage-greedy SELECTION (build_examples.py: 4-6 sentences
per dictionary target), not the raw corpora, so counts are frequencies within the shipped bank.
That is what is pinned; the raw corpora are not in the repo.

Run from the repo root:
  python3 prototypes/corridor/data/beginner/manifest-draft/derive-frequency.py \
      [--jmdict-full path/to/jmdict-eng-3.6.2.json] [--out path]
The optional full JMdict (jmdict-simplified 3.6.2+20260803141815, sha256 of the zip pinned in
dict-v2/index.json source.jmdict.sha256) resolves lemmas absent from the shipped dict-v2 index;
such entries are flagged missing_at_base for L2.1.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
CORRIDOR = REPO / "prototypes/corridor"
BANK = CORRIDOR / "data/proprietary_safe/examples"
INDEX = CORRIDOR / "data/share_alike/dict-v2/index.json"
COUNTED_SOURCES = {0: "snow-t15-t23", 1: "tanaka-corpus"}
EXCLUDED_SOURCES = {2: "ja.wikinews"}

INCLUDE_POS1 = {"名詞", "代名詞", "動詞", "形容詞", "形状詞", "副詞", "連体詞", "接続詞", "感動詞"}
# UniDic lemmas whose only use is grammatical and whose rare-kanji lemma would otherwise land on an unrelated entry
EXCLUDE_LEMMAS = {"於く"}  # 〜において; the kana base おく would resolve to 奥
# UniDic gives the lemma's formal or alternate reading; the beginner form is the preferred one (review item)
READING_PREFERENCES = {"私": "わたし", "母": "はは", "体": "からだ", "最も": "もっとも", "女": "おんな", "土地": "とち"}
# UniDic lemmatises 感じる as 感ずる; the 〜じる entry is the modern form beginners learn
ZURU = re.compile(r"^(.+)ずる$")
JAPANESE = re.compile(r"^[ぁ-ゖァ-ヺー々〆ゝゞヽヾ一-鿿㐀-䶿]+$")

RULES = [
    "count a token when pos1 is one of 名詞, 代名詞, 動詞, 形容詞, 形状詞, 副詞, 連体詞, 接続詞, 感動詞",
    "exclude 固有名詞 (proper nouns) except 地名-国 (country names, e.g. 日本)",
    "exclude 助動詞語幹 (よう/そう/みたい stems), フィラー (hesitation あの/えーと)",
    "exclude any lemma containing characters outside hiragana, katakana, ー, 々 and CJK ideographs (digits, Latin, symbols)",
    "key = (UniDic lemma without its disambiguation suffix, lemma reading in hiragana); counts aggregate per resolved JMdict ent_seq",
    "resolve a key to the dict-v2 row whose written or kana forms contain the lemma or an observed base form; score: +4 primary reading equals the lemma reading, +2 any kana form equals it, +2 JMdict common, +1 head equals the lemma or the most frequent base form, +1 the lemma itself matched; ties -> lowest seq",
    "a lemma in READING_PREFERENCES (私 わたし, 母 はは, 体 からだ, 最も もっとも, 女 おんな, 土地 とち) is scored with the preferred reading instead of UniDic's formal or alternate reading; reading_conflict records both",
    "a lemma ending in ずる is read as the 〜じる form when the index has it (感ずる -> 感じる); lemma_normalized records the original",
    "the lemma 於く (〜において) is excluded; nothing else is merged or overridden by hand",
    "rank = position when sorted by aggregated token count descending, then ent_seq ascending",
    "a key with no dict-v2 row is resolved against the full pinned JMdict when given and flagged missing_at_base; a key found nowhere is listed under unresolved",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def hira(text: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text or "")


def is_kana(text: str) -> bool:
    return all("ぁ" <= c <= "ヾ" for c in text) and bool(text)


def lemma_core(lemma: str) -> str:
    # UniDic lemmas carry a disambiguation suffix after '-' (私-代名詞, パン-pao, トム-Thom)
    if "-" in lemma and lemma.split("-", 1)[0]:
        return lemma.split("-", 1)[0]
    return lemma


def load_bank() -> tuple[list[tuple[str, int]], list[dict], str]:
    sentences: list[tuple[str, int]] = []
    inputs: list[dict] = []
    combined = hashlib.sha256()
    shard_paths = sorted(BANK.glob("s-*.json"))
    for path in shard_paths:
        data = path.read_bytes()
        combined.update(data)
        inputs.append({"path": str(path.relative_to(REPO)), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
        for row in json.loads(data):
            tokens, _english, source = row[0], row[1], row[-1]
            sentences.append(("".join(t[0] for t in tokens), int(source)))
    return sentences, inputs, combined.hexdigest()


def tokenize(sentences: list[tuple[str, int]]):
    try:
        import fugashi  # type: ignore
        import importlib.metadata as md
    except ImportError as exc:  # pragma: no cover - environment
        sys.exit(f"fugashi + unidic-lite are required to re-tokenise the bank: {exc}")
    tagger = fugashi.Tagger()
    versions = {"fugashi": md.version("fugashi"), "unidic-lite": md.version("unidic-lite"), "python": sys.version.split()[0]}
    keys: dict[tuple[str, str], dict] = {}
    n_tokens = n_content = 0
    for text, source in sentences:
        if source not in COUNTED_SOURCES:
            continue
        seen_in_sentence: set[tuple[str, str]] = set()
        for w in tagger(text):
            n_tokens += 1
            f = w.feature
            if f.pos1 not in INCLUDE_POS1:
                continue
            if f.pos2 == "固有名詞" and not (f.pos3 == "地名" and f.pos4 == "国"):
                continue
            if f.pos2 in ("助動詞語幹", "フィラー"):
                continue
            lemma = lemma_core(f.lemma or "")
            reading = hira(f.lForm or "")
            if not lemma or not reading or not JAPANESE.match(lemma) or lemma in EXCLUDE_LEMMAS:
                continue
            n_content += 1
            note = {}
            if lemma in READING_PREFERENCES and READING_PREFERENCES[lemma] != reading:
                note["reading_conflict"] = {"tokenizer": reading, "manifest": READING_PREFERENCES[lemma]}
                reading = READING_PREFERENCES[lemma]
            m = ZURU.match(lemma)
            if m and reading.endswith("ずる"):
                note["lemma_normalized"] = {"tokenizer": lemma, "manifest": m.group(1) + "じる"}
                lemma, reading = m.group(1) + "じる", reading[:-2] + "じる"
            key = (lemma, reading)
            rec = keys.setdefault(key, {"lemma": lemma, "reading": reading, "tokens": 0, "sentences": 0, "orthBases": Counter(), "pos": Counter(), **note})
            rec["tokens"] += 1
            rec["orthBases"][f.orthBase or w.surface] += 1
            rec["pos"][f"{f.pos1}-{f.pos2}" if f.pos2 and f.pos2 != "*" else f.pos1] += 1
            if key not in seen_in_sentence:
                seen_in_sentence.add(key)
                rec["sentences"] += 1
    return keys, versions, n_tokens, n_content


class Index:
    """dict-v2 index rows: [seq, head, primaryReading, primaryGloss, writtenForms, kanaForms, englishGlosses,
    normalizedGlosses, commonFlag, readingSummaries, glossApplicability, readingWrittenScopes, senseTagRows]"""

    def __init__(self, path: Path):
        self.data = json.loads(path.read_bytes())
        self.rows = {r[0]: r for r in self.data["entries"]}
        self.by_form: dict[str, list[list]] = defaultdict(list)
        for r in self.data["entries"]:
            for form in set(r[4]) | set(r[5]):
                self.by_form[form].append(r)

    def candidates(self, forms: list[str]) -> list[tuple[list, str]]:
        out, seen = [], set()
        for form in forms:
            for r in self.by_form.get(form, []):
                if r[0] not in seen:
                    seen.add(r[0])
                    out.append((r, form))
        return out

    @staticmethod
    def uk(row: list) -> bool:
        return any("uk" in (tag_row[2] or []) for tag_row in row[12] or [])


def score(row: list, matched_form: str, lemma: str, reading: str, top_base: str) -> int:
    s = 0
    if hira(row[2]) == reading:
        s += 4
    elif any(hira(k) == reading for k in row[5]):
        s += 2
    if row[8] == 1:
        s += 2
    if row[1] == lemma or row[1] == top_base:
        s += 1
    if matched_form == lemma:
        s += 1
    return s


def resolve(index: Index, rec: dict) -> dict | None:
    lemma, reading = rec["lemma"], rec["reading"]
    bases = [b for b, _ in rec["orthBases"].most_common()]
    forms = [lemma] + [b for b in bases if b != lemma]
    cands = index.candidates(forms)
    if not cands:
        return None
    top_base = bases[0] if bases else lemma
    scored = sorted(((score(r, f, lemma, reading, top_base), -int(r[0]), r, f) for r, f in cands), key=lambda x: (x[0], x[1]), reverse=True)
    best_score, _, best, matched = scored[0]
    result = {"row": best, "matched_form": matched, "score": best_score, "candidates": [r[0] for _, _, r, _ in scored]}
    if best_score < 2 and len(scored) > 1:
        result["ambiguous_reading"] = True
    return result


def load_full_jmdict(path: Path | None):
    if not path:
        return None
    data = json.loads(path.read_bytes())
    by_form: dict[str, list[dict]] = defaultdict(list)
    for w in data["words"]:
        for k in w.get("kanji", []):
            by_form[k["text"]].append(w)
        for k in w.get("kana", []):
            by_form[k["text"]].append(w)
    return {"version": data.get("version"), "dictDate": data.get("dictDate"), "by_form": by_form, "n": len(data["words"])}


def resolve_full(full, rec: dict) -> dict | None:
    lemma, reading = rec["lemma"], rec["reading"]
    bases = [b for b, _ in rec["orthBases"].most_common()]
    cands: list[dict] = []
    seen = set()
    for form in [lemma] + [b for b in bases if b != lemma]:
        for w in full["by_form"].get(form, []):
            if w["id"] not in seen:
                seen.add(w["id"])
                cands.append(w)
    if not cands:
        return None

    def sc(w):
        kana = [k["text"] for k in w.get("kana", [])]
        s = 4 if kana and hira(kana[0]) == reading else (2 if any(hira(k) == reading for k in kana) else 0)
        if any(k.get("common") for k in w.get("kanji", []) + w.get("kana", [])):
            s += 2
        return (s, -int(w["id"]))

    w = sorted(cands, key=sc, reverse=True)[0]
    kanji = [k["text"] for k in w.get("kanji", [])]
    kana = [k["text"] for k in w.get("kana", [])]
    common_k = [k["text"] for k in w.get("kanji", []) if k.get("common")]
    common_r = [k["text"] for k in w.get("kana", []) if k.get("common")]
    head = (common_k or common_r or kanji or kana)[0]
    gloss = ""
    for sense in w.get("sense", []):
        if sense.get("gloss"):
            gloss = sense["gloss"][0]["text"]
            break
    return {"seq": w["id"], "head": head, "reading": hira(kana[0]) if kana else reading, "gloss": gloss, "common": bool(common_k or common_r), "candidates": [c["id"] for c in cands]}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jmdict-full", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=HERE / "frequency-source.json")
    ap.add_argument("--top", type=int, default=1000)
    args = ap.parse_args(argv)

    sentences, inputs, combined = load_bank()
    n_by_source = Counter(s for _, s in sentences)
    keys, versions, n_tokens, n_content = tokenize(sentences)
    index = Index(INDEX)
    full = load_full_jmdict(args.jmdict_full)

    per_seq: dict[str, dict] = {}
    unresolved: list[dict] = []
    for rec in keys.values():
        hit = resolve(index, rec)
        if hit:
            row = hit["row"]
            seq = row[0]
            entry = per_seq.setdefault(seq, {
                "seq": seq, "spelling": row[1], "reading": hira(row[2]), "gloss": row[3], "common": row[8] == 1,
                "usually_kana": Index.uk(row), "in_dict_v2": True, "missing_at_base": False, "tokens": 0, "sentences": 0, "keys": [],
            })
        elif full and (fhit := resolve_full(full, rec)):
            seq = fhit["seq"]
            entry = per_seq.setdefault(seq, {
                "seq": seq, "spelling": fhit["head"], "reading": fhit["reading"], "gloss": fhit["gloss"], "common": fhit["common"],
                "usually_kana": False, "in_dict_v2": False, "missing_at_base": True, "tokens": 0, "sentences": 0, "keys": [],
            })
            hit = {"candidates": fhit["candidates"], "matched_form": rec["lemma"], "score": None}
        else:
            unresolved.append({"lemma": rec["lemma"], "reading": rec["reading"], "tokens": rec["tokens"], "pos": rec["pos"].most_common(1)[0][0]})
            continue
        entry["tokens"] += rec["tokens"]
        entry["sentences"] += rec["sentences"]
        key_rec = {"lemma": rec["lemma"], "reading": rec["reading"], "tokens": rec["tokens"], "pos": rec["pos"].most_common(1)[0][0],
                   "orthBases": dict(rec["orthBases"].most_common()), "matched_form": hit["matched_form"], "candidates": hit["candidates"]}
        for flag in ("reading_conflict", "lemma_normalized"):
            if rec.get(flag):
                key_rec[flag] = rec[flag]
        if hit.get("ambiguous_reading"):
            key_rec["ambiguous_reading"] = True
        entry["keys"].append(key_rec)

    ranked = sorted(per_seq.values(), key=lambda e: (-e["tokens"], int(e["seq"])))
    for i, e in enumerate(ranked, 1):
        e["rank"] = i
        e["pos"] = Counter({k["pos"]: k["tokens"] for k in e["keys"]}).most_common(1)[0][0]
        e["keys"].sort(key=lambda k: -k["tokens"])
    top = ranked[: args.top]
    unresolved.sort(key=lambda u: -u["tokens"])

    out = {
        "id": "bunki-examples-bank-lemma-frequency-v1",
        "name": "Lemma frequency over the shipped examples bank (SNOW T15/T23 + Tanaka Corpus sentences)",
        "derived_at": "2026-11-07",
        "inputs": inputs,
        "combined_sha256": combined,
        "combined_rule": "sha256 over the bytes of s-00.json .. s-22.json concatenated in name order",
        "bank_manifest": str((BANK / "manifest.json").relative_to(REPO)),
        "counted_sources": {str(k): v for k, v in COUNTED_SOURCES.items()},
        "excluded_sources": {str(k): v for k, v in EXCLUDED_SOURCES.items()},
        "sentences_by_source": {str(k): n_by_source[k] for k in sorted(n_by_source)},
        "sentences_counted": sum(n for s, n in n_by_source.items() if s in COUNTED_SOURCES),
        "tokenizer": versions,
        "dictionary_index": {"path": str(INDEX.relative_to(REPO)), "sha256": sha256_file(INDEX), "pin": index.data["source"]["pin"], "entries": index.data["counts"]["selectedEntries"]},
        "full_jmdict": ({"path": str(args.jmdict_full), "version": full["version"], "dictDate": full["dictDate"], "entries": full["n"],
                         "zip_sha256_pin": index.data["source"]["jmdict"]["sha256"]} if full else None),
        "rules": RULES,
        "bias": "The bank is a coverage-greedy selection of sentences (build_examples.py, 4-6 per dictionary target), so counts are frequencies within the shipped bank, not in the raw corpora; the raw corpora are not in the repo.",
        "counts": {"tokens_seen": n_tokens, "content_tokens": n_content, "distinct_keys": len(keys), "resolved_entries": len(ranked),
                   "missing_at_base_in_top": sum(1 for e in top if e["missing_at_base"]), "unresolved_keys": len(unresolved)},
        "entries": top,
        "unresolved": unresolved[:300],
    }
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"sentences counted {out['sentences_counted']} of {len(sentences)}; content tokens {n_content}; keys {len(keys)}; resolved entries {len(ranked)}; "
          f"top {len(top)} (missing_at_base {out['counts']['missing_at_base_in_top']}); unresolved keys {len(unresolved)}")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
