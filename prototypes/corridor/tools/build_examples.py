"""SNOW T15/T23 → the example-sentence bank (用例の蔵).

Operator's law (2026-08-11): every vocab word carries example sentences —
at least four wherever the corpus can honestly supply them. The shelf's own
sentences come first at runtime; this bank fills the rest from the SNOW
simplified-Japanese corpora (Nagaoka University of Technology, 山本研究室;
CC BY 4.0), 134,300 原文 ↔ やさしい日本語 ↔ English triples, pinned by
sha256 in corpus.sources.snow.fetch.

Selection is coverage-greedy and deterministic: sentences ordered by
(token count, char count, id) are kept whenever any contained target word
still holds fewer than TARGET_PER_WORD examples; a kept sentence credits
every target word in it up to CAP_PER_WORD. Targets are the core
dictionary's written forms (share_alike/dict.json). The 原文 column is the
example (natural register); the English translation rides along.

Output — data/proprietary_safe/examples/ :
  manifest.json          source record, counts, sharding, coverage stats
  ex-XX.json  (16)       word → [sentence ids], sharded by fnv1a32(word)&15
  s-NN.json              sentence shards, SENTS_PER_SHARD contiguous ids:
                         each row [tokens, en]; tokens are positional
                         [s, b, r, c, p, f] mirroring the corridor token
                         (f = furigana pairs, [text, reading?] each)

Usage:
  PYTHONPATH=corpus/src:<unidic path> python3 prototypes/corridor/tools/build_examples.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_corridor as bc  # noqa: E402

REPO = bc.REPO
CORRIDOR = bc.CORRIDOR

TARGET_PER_WORD = 4
CAP_PER_WORD = 6
MAX_CHARS = 90
SENTS_PER_SHARD = 2000
INDEX_SHARDS = 16

# per-sentence source codes (row[2]); the manifest names each in full
SOURCES = [
    {
        "name": "snow-t15-t23",
        "licence": "CC BY 4.0",
        "attribution": "SNOW T15・T23 やさしい日本語コーパス（長岡技術科学大学 山本研究室）",
        "url": "https://www.jnlp.org/GengoHouse/snow/t15",
        "labelJa": "用例",
        "labelEn": "examples corpus",
    },
    {
        "name": "tanaka-corpus",
        "licence": "CC BY 2.0 FR",
        "attribution": "Tanaka Corpus / Tatoeba Project（EDRDG examples.utf）",
        "url": "https://www.edrdg.org/wiki/index.php/Tanaka_Corpus",
        "labelJa": "用例",
        "labelEn": "examples corpus",
    },
    {
        "name": "ja.wikinews",
        "licence": "CC BY 2.5",
        "attribution": "ja.wikinews contributors, CC BY 2.5",
        "url": "https://ja.wikinews.org/",
        "labelJa": "ウィキニュース",
        "labelEn": "wikinews",
    },
]


def fnv1a32(s: str) -> int:
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def compact_token(t: dict) -> list:
    f = [[seg["t"], seg["r"]] if "r" in seg else [seg["t"]] for seg in t.get("f", [])]
    return [t["s"], t["b"], t.get("r", ""), 1 if t.get("c") else 0, t.get("p", ""), f]


def main() -> int:
    from corpus.grading._mecab import get_tagger
    from corpus.sources.snow import parse as snow_parse

    tagger = get_tagger()

    dict_words = json.loads((CORRIDOR / "data/share_alike/dict.json").read_text("utf-8"))["words"]

    # the FULL capturable universe: every written and kana form in the deep
    # 70k tier (operator's law, 2026-08-11 — a card must never open onto
    # zero examples just because its word lives past the core). A sentence
    # lemma matching any form of a JMdict entry credits every form of that
    # entry, so 引越す finds the 引っ越す sentences. Kana-form matching is
    # entry-restricted to kana-only words; kana KEYS may merge homophones —
    # usage evidence, disambiguated by the entry itself.
    match_map: dict[str, set[str]] = {}
    n_entries = 0
    for i in range(16):
        shard = json.loads(
            (CORRIDOR / f"data/share_alike/dict-v2/{i:02x}.json").read_text("utf-8")
        )
        for e in shard["entries"]:
            n_entries += 1
            kforms = [f[0] for f in e[1]]
            kanas = [k[0] for k in e[2]]
            if kforms:
                credit = set(kforms) | set(kanas)
                for kf in kforms:
                    match_map.setdefault(kf, set()).update(credit)
            else:
                for kn in kanas:
                    match_map.setdefault(kn, set()).update(kanas)
    for w in dict_words:
        match_map.setdefault(w, {w}).add(w)
    targets = set(match_map.keys())
    print(f"· {len(targets)} matchable forms across {n_entries} deep entries + core")

    import gzip
    import re as _re

    seen_text: set[str] = set()
    raw: list[tuple[int, str, str, str]] = []  # (srcCode, id, text, en)

    snow_dir = REPO / "corpus/data/snow"
    n = 0
    for rec in list(snow_parse.parse_t15(snow_dir / "T15-2020.1.7.xlsx")) + list(
        snow_parse.parse_t23(snow_dir / "T23-2020.1.7.xlsx")
    ):
        raw.append((0, rec.id, rec.text.strip(), rec.meta.get("english", "")))
        n += 1
    print(f"· {n} SNOW sentences in")

    n = 0
    with gzip.open(REPO / "corpus/data/tanaka/examples.utf.gz", "rt", encoding="utf-8") as f:
        for line in f:
            if not line.startswith("A: "):
                continue
            body = line[3:].rstrip("\n")
            if "\t" not in body:
                continue
            ja, rest = body.split("\t", 1)
            en = _re.sub(r"#ID=\S+\s*$", "", rest).strip()
            m = _re.search(r"#ID=(\S+)", rest)
            raw.append((1, f"tanaka:{m.group(1) if m else n}", ja.strip(), en))
            n += 1
    print(f"· {n} Tanaka sentences in")

    # the minted wikinews archive: tokens already exist — reuse, not retokenise
    archive_dir = CORRIDOR / "data/articles/archive"
    pre_tokenised: dict[str, list[dict]] = {}
    minted_ids: set[str] = set()
    n = 0
    for path in sorted(archive_dir.glob("*.json")):
        body = json.loads(path.read_text("utf-8"))
        minted_ids.add(body["id"])
        sentence: list[dict] = []
        s_ix = 0
        for t in body["tokens"]:
            sentence.append(t)
            if t["s"] in "。！？":
                text = "".join(x["s"] for x in sentence)
                if 12 <= len(text) <= MAX_CHARS:
                    sid = f"{body['id']}#{s_ix}"
                    raw.append((2, sid, text, ""))
                    pre_tokenised[sid] = sentence
                    n += 1
                sentence = []
                s_ix += 1
    print(f"· {n} wikinews archive sentences in")

    # the rest of the frozen extraction — articles the shelf does not mint
    # still donate their sentences (same licence, same attribution)
    full_extract = REPO / "corpus/data/wikinews/articles.jsonl"
    n = 0
    if full_extract.exists():
        with full_extract.open(encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                if rec["id"] in minted_ids:
                    continue
                for s_ix, sent in enumerate(
                    s for s in _re.split(r"(?<=[。！？])", rec["text"]) if s.strip()
                ):
                    sent = sent.strip()
                    if 12 <= len(sent) <= MAX_CHARS:
                        raw.append((2, f"{rec['id']}#x{s_ix}", sent, ""))
                        n += 1
    print(f"· {n} sentences from the unminted extraction")

    candidates = []  # (srcPriority, n_tokens, n_chars, id, en, tokens, content, src)
    for src, rid, text, en in raw:
        if not text or len(text) > MAX_CHARS or text in seen_text:
            continue
        seen_text.add(text)
        tokens = pre_tokenised.get(rid) or bc.tokenise(text, tagger)
        content: set[str] = set()
        for t in tokens:
            if t["c"] and t["b"] in targets:
                content.update(match_map[t["b"]])
        if not content:
            continue
        # SNOW/Tanaka first (short, translated, example-shaped); newsprint
        # fills what only it can
        candidates.append((0 if src < 2 else 1, len(tokens), len(text), rid, en, tokens, sorted(content), src))
    candidates.sort(key=lambda x: (x[0], x[1], x[2], x[3]))
    print(f"· {len(candidates)} deduplicated candidates with target words")

    count: dict[str, int] = {}
    kept = []
    for _prio, _ntok, _nch, rid, en, tokens, content, src in candidates:
        if any(count.get(w, 0) < TARGET_PER_WORD for w in content):
            kept.append((rid, en, tokens, content, src))
            for w in content:
                if count.get(w, 0) < CAP_PER_WORD:
                    count[w] = count.get(w, 0) + 1
    print(f"· {len(kept)} sentences kept by the coverage greedy")

    out = CORRIDOR / "data/proprietary_safe/examples"
    out.mkdir(parents=True, exist_ok=True)

    index: dict[str, list[int]] = {}
    per_word: dict[str, int] = {}
    sent_rows = []
    for sid, (rid, en, tokens, content, src) in enumerate(kept):
        sent_rows.append([[compact_token(t) for t in tokens], en, src])
        for w in set(content):
            if per_word.get(w, 0) >= CAP_PER_WORD:
                continue
            index.setdefault(w, []).append(sid)
            per_word[w] = per_word.get(w, 0) + 1

    n_shards = 0
    for start in range(0, len(sent_rows), SENTS_PER_SHARD):
        shard = sent_rows[start : start + SENTS_PER_SHARD]
        (out / f"s-{start // SENTS_PER_SHARD:02d}.json").write_text(
            json.dumps(shard, ensure_ascii=False, separators=(",", ":")), "utf-8"
        )
        n_shards += 1

    ix_shards: list[dict] = [dict() for _ in range(INDEX_SHARDS)]
    for w, sids in index.items():
        ix_shards[fnv1a32(w) & (INDEX_SHARDS - 1)][w] = sids
    for i, shard in enumerate(ix_shards):
        (out / f"ex-{i:02d}.json").write_text(
            json.dumps(shard, ensure_ascii=False, separators=(",", ":")), "utf-8"
        )

    core = set(dict_words.keys())
    full = sum(1 for w in core if per_word.get(w, 0) >= TARGET_PER_WORD)
    some = sum(1 for w in core if 0 < per_word.get(w, 0) < TARGET_PER_WORD)
    none = len(core) - full - some
    coverage = {
        "targets": len(core),
        "with_4_plus": full,
        "with_1_to_3": some,
        "with_0": none,
        "indexed_forms": len(index),
        "matchable_forms": len(targets),
        "sentences": len(sent_rows),
        "note": "core-dictionary denominators; the index also carries deep-tier and variant forms — shelf sentences add runtime coverage on top; absence stays honest",
    }
    manifest = {
        "v": 1,
        "sources": SOURCES,
        "sharding": {"id": "fnv1a32-utf8-mask15", "indexShards": INDEX_SHARDS, "sentsPerShard": SENTS_PER_SHARD, "sentenceShards": n_shards},
        "coverage": coverage,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")
    size = sum(f.stat().st_size for f in out.glob("*.json"))
    print(f"· bank: {len(sent_rows)} sentences, {n_shards} sentence shards, {INDEX_SHARDS} index shards, {size / 1e6:.1f} MB")
    print(f"· coverage: {full} words with ≥{TARGET_PER_WORD}, {some} with 1–3, {none} with none (of {len(targets)} targets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
