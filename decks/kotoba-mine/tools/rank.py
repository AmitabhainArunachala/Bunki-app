#!/usr/bin/env python3
"""Rank mined sentences for every word (GDEX-style: hard filters, then a
product of soft penalties), following reports/Japanese sentence mining deck
design.md §(a)–(c).

Candidate pools (all real, written by people):
  mining/web/<n>.json            live web via Firecrawl (news, blogs, Q&A, …)
  mining/tatoeba_pairs.json.bz2  Tatoeba (CC BY 2.0 FR), with English
  mining/local_candidates.json   corpora already in the repo (Tanaka/SNOW bank,
                                 ja.wikinews archive, Aozora samples)
  mining/aozora/<n>.json         Aozora Bunko (public domain), if mined

Output: mining/ranked.json  {n: {"tier", "want", "picked": [...], "alts": [...]}}
"""
from __future__ import annotations

import bz2
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
DECK = HERE.parent
REPO = DECK.parents[1]
MINING = DECK / "mining"
SRC = DECK / "source"

# spellings a corpus may use for the same word (searched as well as the headword)
VARIANTS = {
    "凄まじい": ["すさまじい"], "攪拌": ["撹拌", "かくはん"], "栞": ["しおり"], "しおり": ["栞"],
    "軈": ["やがて", "軈て"], "素泊り": ["素泊まり"], "かなめ": ["要"], "たくらむ": ["企む"],
    "ひらめく": ["閃く"], "ぞっと": [], "がち": ["ガチ"], "なぞかけ": ["謎掛け", "謎かけ"],
    "背く": ["そむく"], "侮る": ["あなどる"], "覆う": ["おおう"], "耐える": ["堪える"],
    "揺さぶる": ["ゆさぶる"], "持て余す": ["もてあます"], "危ぶむ": ["あやぶむ"],
    "濁る": ["にごる"], "交わす": ["かわす"], "争う": ["あらそう"], "競う": ["きそう"],
    "まな板": ["俎板", "まないた"], "かつお節": ["鰹節"], "床の間": ["床のま"],
    "途切れ途切れ": ["とぎれとぎれ"], "殴り書き": ["なぐり書き"], "せせら笑い": ["せせら笑う"],
    "威張り散らす": ["いばり散らす"], "ごとく": ["如く"], "あて先変更": ["宛先変更"],
    "自ずと": ["おのずと"], "万が一": ["万一"], "下敷き": ["下じき"], "一層": ["いっそう"],
    "たぐいまれ": ["類まれ", "類稀"], "さりげない": ["さり気ない", "さりげなく"],
    "つべこべ": [], "なんくるない": ["なんくるないさ"], "牛耳る": ["牛耳って"],
}
CONNECTIVE_START = ("しかし", "だから", "それで", "一方", "また、", "さらに", "そして", "でも", "ですが", "だが", "ただ、", "それに", "そのため", "このため", "つまり", "なので", "ところが")
DEMONSTRATIVE_START = ("これ", "それ", "あれ", "この", "その", "あの", "こう", "そう", "ああ", "彼", "彼女", "こちら", "そちら")
OLD_KANA = re.compile(r"[ゐゑヰヱゝゞ〳〴〵云]")
BAD_CHARS = re.compile(r"(https?://|www\.|[ｦ-ﾟ]|[\U0001F300-\U0001FAFF]|[★☆◆◇■□●○※♪→←↑↓#＃@＠|｜《》［］])")
FREQ: dict = {}
KANJI = re.compile(r"[㐀-鿿々]")


def load_tables():
    kanji = json.loads((REPO / "prototypes/corridor/data/share_alike/kanji.json").read_text("utf-8"))["kanji"]
    # 漢検 2級 and easier ≈ the Jōyō set; 準1級/1級 or absent = outside it
    joyo = {c for c, v in kanji.items() if v.get("kk") and v["kk"] not in ("準1級", "1級")}
    wbig = json.loads((REPO / "prototypes/drift/data/wbig.json").read_text("utf-8"))
    jlpt: dict[str, int] = {}
    for word, reading, _g, level in wbig:
        if isinstance(level, int):
            jlpt[word] = max(level, jlpt.get(word, 0))
            if reading:
                jlpt.setdefault(reading, level)
    try:
        from wordfreq import get_frequency_dict

        freq = get_frequency_dict("ja")
    except Exception:
        freq = {}
    return joyo, jlpt, freq


def zipf(word: str, freq: dict, tagger) -> float:
    if word in freq:
        return math.log10(freq[word]) + 9
    parts = [t.surface for t in tagger(word)]
    fs = [freq.get(p, 0) for p in parts]
    # a multi-token word is at most as common as its rarest part, minus a margin
    return (math.log10(min(fs)) + 9 - 0.5 * (len(parts) - 1)) if fs and all(fs) else 0.0


def load_pools(entries):
    pools: dict[int, list[dict]] = {e["n"]: [] for e in entries}
    # web
    for f in sorted((MINING / "web").glob("*.json")):
        doc = json.loads(f.read_text("utf-8"))
        for c in doc.get("candidates", []):
            pools.setdefault(doc["n"], []).append({**c, "src": c.get("site") or "web", "kind": c.get("kind", "web"), "licence": "web quotation (personal study)"})
    # local corpora
    local = MINING / "local_candidates.json"
    if local.exists():
        for n, rows in json.loads(local.read_text("utf-8")).items():
            for r in rows:
                kind = "news" if "wikinews" in r["src"] else ("literature" if "aozora" in r["src"] else "example-bank")
                pools[int(n)].append({**r, "kind": kind})
    # aozora
    for f in sorted((MINING / "aozora").glob("*.json")) if (MINING / "aozora").exists() else []:
        doc = json.loads(f.read_text("utf-8"))
        for c in doc.get("candidates", []):
            pools.setdefault(doc["n"], []).append({**c, "kind": "literature", "licence": "public domain (Aozora Bunko)"})
    # tatoeba
    tb = MINING / "tatoeba_pairs.json.bz2"
    if tb.exists():
        data = json.load(bz2.open(tb))
        by_ja: dict[str, dict] = {}
        for p in data["pairs"]:
            by_ja.setdefault(p["ja"], p)
        keys = {e["n"]: [e["term"], *VARIANTS.get(e["term"], [])] for e in entries}
        for ja, p in by_ja.items():
            for n, ks in keys.items():
                if any(k and k in ja for k in ks):
                    pools[n].append({"ja": ja, "en": p["en"], "src": f"tatoeba:{p['ja_id']}", "kind": "tatoeba", "licence": "CC BY 2.0 FR (Tatoeba)"})
    return pools


def match_span(tokens, ja: str, keys: list[str]):
    """(start, end, surface) of a key that sits on token boundaries, inflection allowed"""
    starts = set()
    ends = set()
    pos = 0
    for t in tokens:
        starts.add(pos)
        pos += len(t.surface)
        ends.add(pos)
    for k in sorted(keys, key=len, reverse=True):
        stem = k[:-1] if re.search(r"[うくぐすつぬぶむるい]$", k) and len(k) > 1 else k
        for key in (k, stem):
            i = ja.find(key)
            while i >= 0:
                if i in starts:
                    # extend to the end of the token the key ends in (okurigana / inflection)
                    j = i + len(key)
                    end = min((e for e in ends if e >= j), default=len(ja))
                    if key == k or end - j <= 4:
                        return i, end, ja[i:end]
                i = ja.find(key, i + 1)
    return None


def score(c: dict, e: dict, keys, tagger, joyo, jlpt) -> tuple[float, dict] | None:
    # spaces next to Japanese text are page-layout residue, not part of the sentence
    ja = re.sub(r"\s+(?=[^\x00-\x7f])|(?<=[^\x00-\x7f])\s+", "", c["ja"].strip())
    if not ja.endswith(("。", "！", "？", "」")):
        ja_end = ja + "。" if c.get("kind") in ("web", "news", "blog", "company", "gov", "qa", "other") and len(ja) > 8 else ja
        if not ja_end.endswith("。"):
            return None
        ja = ja_end
    n_chars = len(ja)
    if n_chars < 8 or n_chars > 70:
        return None
    if BAD_CHARS.search(ja) or OLD_KANA.search(ja) or "…" in ja or "..." in ja:
        return None
    if ja.count("「") != ja.count("」") or ja.count("（") != ja.count("）"):
        return None
    if ja.startswith(CONNECTIVE_START):
        return None
    tokens = list(tagger(ja))
    if tokens and tokens[0].feature.pos1 in ("助詞", "接続詞", "助動詞"):
        return None  # 「が、…」「だから…」 continues an earlier sentence
    span = match_span(tokens, ja, keys)
    if not span:
        return None
    leads_with_pointer = ja.startswith(DEMONSTRATIVE_START) and not ja[span[0]:].startswith(DEMONSTRATIVE_START)
    if any(str(getattr(t.feature, "cType", "") or "").startswith("文語") for t in tokens):
        return None  # classical grammar (けり・なり・ごとし…)
    if not any(t.feature.pos1 in ("動詞", "形容詞", "助動詞") for t in tokens):
        return None  # no predicate: a headline fragment
    s = 1.0
    why = {}
    # length: best 14–40 characters
    if n_chars < 14:
        s *= 0.75
    elif n_chars > 40:
        s *= max(0.35, 1 - (n_chars - 40) / 40)
    # unknown non-target content words (beyond the JLPT word list), 1T rule
    a, b, _ = span
    pos = 0
    unknown = 0
    proper = 0
    for t in tokens:
        lo, hi = pos, pos + len(t.surface)
        pos = hi
        if lo >= a and hi <= b:
            continue
        p1, p2 = t.feature.pos1, getattr(t.feature, "pos2", "")
        if p2 == "固有名詞":
            proper += 1
            continue
        if p1 in ("名詞", "動詞", "形容詞", "副詞") and KANJI.search(t.surface) and getattr(t.feature, "pos2", "") != "数詞":
            lemma = t.feature.orthBase or t.surface
            # unknown = neither on the JLPT list nor common in real text (Zipf < 3.3)
            if lemma not in jlpt and t.surface not in jlpt and FREQ.get(lemma, FREQ.get(t.surface, 0)) < 2e-6:
                unknown += 1
    s *= 0.8 ** max(0, unknown - 1)
    s *= 0.9 ** min(proper, 3)
    if leads_with_pointer:
        s *= 0.7  # 「その作家は…」 leans on an earlier sentence
    rare_kanji = sum(1 for ch in ja[:a] + ja[b:] if KANJI.match(ch) and ch not in joyo)
    s *= 0.6 ** rare_kanji
    # source prior: real native writing > Tanaka-era Tatoeba (error-prone) ; archaic literature flagged
    kind = c.get("kind", "")
    s *= {"tatoeba": 0.85, "literature": 0.8}.get(kind, 1.0)
    if kind == "tatoeba" and not c.get("en"):
        s *= 0.9
    # the word should be in the sentence's own predicate area, not a list or title
    if "、" not in ja and n_chars > 45:
        s *= 0.85
    why.update(unknown=unknown, proper=proper, rare_kanji=rare_kanji, chars=n_chars)
    frame = ""
    nxt = ja[b:b + 2]
    prv = ja[max(0, a - 2):a]
    frame = f"{prv}_{nxt}"
    return s, {"ja": ja, "form": span[2], "frame": frame, **why}


def main() -> int:
    import fugashi

    tagger = fugashi.Tagger()
    joyo, jlpt, freq = load_tables()
    FREQ.update(freq)
    entries = json.loads((SRC / "entries.json").read_text("utf-8"))
    pools = load_pools(entries)
    out = {}
    for e in entries:
        n, term = e["n"], e["term"]
        single = len(term) == 1 and KANJI.match(term)
        keys = [term, *VARIANTS.get(term, [])]
        if e.get("reading") and re.fullmatch(r"[ぁ-ゖー]+", e["reading"] or "") and len(e["reading"]) >= 3 and not single:
            keys.append(e["reading"])
        z = zipf(term, freq, tagger)
        scored = []
        seen = set()
        for c in pools.get(n, []):
            r = score(c, e, keys, tagger, joyo, jlpt) if not single else None
            if single:
                # a kanji card: real compounds that contain the kanji
                ja = c["ja"]
                if term not in ja:
                    continue
                r = score(c, e, [m.group(0) for m in re.finditer(rf"[㐀-鿿々]*{term}[㐀-鿿々]*", ja) if len(m.group(0)) >= 2][:1] or [term], tagger, joyo, jlpt)
            if not r:
                continue
            s, info = r
            if info["ja"] in seen:
                continue
            seen.add(info["ja"])
            scored.append({**info, "score": round(s, 3), "en": c.get("en", ""), "src": c.get("src", ""), "site": c.get("site", ""), "url": c.get("url", ""), "kind": c.get("kind", ""), "licence": c.get("licence", "")})
        # typicality: reward sentences whose frame (neighbouring characters) is common among candidates
        frames = Counter(x["frame"] for x in scored)
        for x in scored:
            x["score"] = round(x["score"] * (1 + 0.15 * min(3, frames[x["frame"]] - 1)), 3)
        scored.sort(key=lambda x: -x["score"])
        # how many sentences this word earns (report §c): by frequency band
        if single:
            want, tier = 2, "kanji"
        elif z >= 4.2:
            want, tier = 3, "use"
        elif z >= 3.4:
            want, tier = 2, "use"
        elif z >= 2.8:
            want, tier = 1, "recognise"
        else:
            want, tier = 1, "rare"
        # pick: best first, then later picks must differ in frame and, if possible, source kind
        picked = []
        for x in scored:
            if len(picked) >= want:
                break
            if x["score"] < 0.35:
                break
            if any(x["frame"] == p["frame"] or x["form"] == p["form"] and single for p in picked):
                continue
            if picked and all(p["kind"] == x["kind"] for p in picked) and any(y["kind"] != x["kind"] for y in scored if y not in picked and y["score"] >= 0.35):
                continue
            picked.append(x)
        alts = [x for x in scored if x not in picked][:12]
        out[n] = {"term": term, "zipf": round(z, 2), "tier": tier, "want": want, "pool": len(pools.get(n, [])), "passed": len(scored), "picked": picked, "alts": alts}
    (MINING / "ranked.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    short = [v["term"] for v in out.values() if len(v["picked"]) < 1]
    under = sum(1 for v in out.values() if len(v["picked"]) < v["want"])
    print(f"words {len(out)} · cards {sum(len(v['picked']) for v in out.values())} · wanted {sum(v['want'] for v in out.values())} · under-filled {under} · none {len(short)}")
    print("none:", short[:60])
    return 0


if __name__ == "__main__":
    sys.exit(main())
