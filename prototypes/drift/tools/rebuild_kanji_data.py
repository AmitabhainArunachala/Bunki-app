# Rebuild the Drift kanji datasets (KINFO / KRAD / RADK) with authoritative
# coverage and readings, closing the L2/L3 red-team findings
# (docs/audits/DRIFT_V10_RED_TEAM_LEDGER_2026-08-06.md):
#
#   - KINFO for EVERY kanji in the lexicon (was 149 dead-ends): readings,
#     meaning, and stroke count.
#   - Stroke counts from KanjiVG (count of stroke <path>s) — the canonical
#     count — falling back to the KANJIDIC2-derived source only when a glyph
#     is not cached. Fixes 稽 16->15, 衷 10->9.
#   - Readings show the FULL on/kun sets (katakana on, kun with okurigana),
#     so no single archaic kun is presented as the reading. Plus curated
#     corrections for the named cases (旺 / 頑 / 頒).
#     NOTE (RENKAN E3, 2026-08-16): this header said FULL while the code
#     sliced [:3], and the shipped prototypes/corridor/data/share_alike/
#     kanji.json still carries those three-reading sets — the quiet room
#     therefore labels three readings 音読み/訓読み for characters that have
#     more (生 most visibly). The slices are gone from this builder, but
#     regenerating the data needs the KANJIDIC2-derived KANJI_SRC, which is
#     not in this repository. Operator decision sheet: OD-21.
#   - KRAD components from KanjiVG for every lexicon kanji, so
#     word -> kanji -> radical navigation completes.
#   - RADK component families preserved (they are "contains this component"
#     families, not classical Kangxi radicals — the card copy now says so).
#
# Sources: KanjiVG (kanjivg.tagaini.net, CC BY-SA) for strokes + components;
# davidluzgouveia/kanji-data kanji.json (KANJIDIC2-derived, CC BY-SA) for
# readings + meanings. An authoritative per-kanji *classical* Kangxi radical
# (RADICAL_OF) still needs KANJIDIC2 itself and stays deferred — see the spec.
import json, os, re
import xml.etree.ElementTree as ET
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
KVG = os.environ.get("KVG_CACHE", os.path.join(HERE, "kvg-cache"))
SRC = os.environ["KANJI_SRC"]  # path to kanji.json (KANJIDIC2-derived)

kj = json.load(open(SRC, encoding="utf-8"))
wbig = json.load(open(os.path.join(DATA, "wbig.json"), encoding="utf-8"))
radk_old = json.load(open(os.path.join(DATA, "radk.json"), encoding="utf-8"))

def is_kanji(ch):
    return "一" <= ch <= "鿿" or "㐀" <= ch <= "䶿"

def kata(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)

def clean_kun(k):
    # drop pure affix markers, keep the okurigana dot
    return k.strip("-").replace("!", "")

# curated corrections — the reading a learner should see, over the source's
# rare-first kun. Empty kun means the kanji is on-yomi in practice.
KUN_OVERRIDE = {
    "旺": "",          # オウ (旺盛); no common kun
    "頑": "かたく.な",   # 頑な; source dropped the okurigana
    "頒": "",          # ハン (頒布); 頒つ is archaic
}

NS = "{http://kanjivg.tagaini.net}"
SVGNS = "{http://www.w3.org/2000/svg}"

def svg_path(ch):
    for name in ("%05x.svg" % ord(ch), "%x.svg" % ord(ch)):
        p = os.path.join(KVG, name)
        if os.path.exists(p):
            return p
    return None

def kvg_strokes(ch):
    p = svg_path(ch)
    if not p:
        return None
    try:
        n = len(re.findall(r"<path ", open(p, encoding="utf-8").read()))
    except OSError:
        return None
    return n or None

def kvg_components(ch):
    p = svg_path(ch)
    if not p:
        return []
    try:
        root = ET.parse(p).getroot()
    except (ET.ParseError, OSError):
        return []
    top = None
    for g in root.iter(SVGNS + "g"):
        gid = g.get("id", "")
        if gid.startswith("kvg:0") and "-" not in gid[4:]:
            top = g
            break
    if top is None:
        return []
    shallow = []
    def walk(node, depth):
        for child in node:
            has = False
            for a in ("element", "original"):
                v = child.get(NS + a)
                if v and len(v) == 1 and is_kanji(v):
                    has = True
                    if v != ch and v not in shallow:
                        shallow.append(v)
            walk(child, depth + 1 if has else depth)
    walk(top, 1)
    return shallow[:8]

# the kanji we must cover: every kanji in the lexicon, plus every component
# any of them decomposes to, plus everything the old KINFO already had.
lex = set(ch for e in wbig for ch in e[0] if is_kanji(ch))
targets = set(lex) | set(radk_old.get("KINFO", {}))
for ch in list(lex):
    for comp in kvg_components(ch):
        targets.add(comp)

KINFO, KRAD = {}, {}
no_reading = []
for ch in sorted(targets):
    v = kj.get(ch)
    # complete sets, never arbitrarily truncated (constitution §6). The old
    # [:3] slices were a display convenience that reached the DATA, so the
    # quiet room labelled three readings 音読み/訓読み for characters that have
    # many more — 生 above all (E3 round-A, writing-room lens).
    on = "・".join(kata(r) for r in (v.get("readings_on") or [])) if v else ""
    if ch in KUN_OVERRIDE:
        kun = KUN_OVERRIDE[ch]
    elif v:
        kept = []
        for r in (v.get("readings_kun") or []):
            c = clean_kun(r)
            if c and c not in kept:  # affix-stripping can collapse -す.ぎる and す.ぎる
                kept.append(c)
        kun = "・".join(kept)
    else:
        kun = ""
    mean = ((v.get("meanings") or [""])[0] if v else "")[:36]
    st = kvg_strokes(ch) or (v.get("strokes") if v else None) or 0
    # KINFO is for kanji a learner meets as words. A pure structural component
    # with no reading and no lexicon appearance is served by RADK/RAD, not here.
    if not on and not kun and ch not in lex:
        continue
    KINFO[ch] = [on, kun, mean, st]
    if not on and not kun:
        no_reading.append(ch)
    comps = kvg_components(ch)
    if comps:
        KRAD[ch] = comps

radk_new = {"RADK": radk_old["RADK"], "KINFO": KINFO, "KRAD": KRAD}
out = os.path.join(DATA, "radk.json")
json.dump(radk_new, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

lex_missing_kinfo = [c for c in lex if c not in KINFO]
lex_missing_krad = [c for c in lex if c not in KRAD]
print("KINFO:", len(KINFO), "KRAD:", len(KRAD), "RADK families:", len(radk_new["RADK"]))
print("lexicon kanji:", len(lex),
      "| missing KINFO:", len(lex_missing_kinfo),
      "| missing KRAD:", len(lex_missing_krad))
print("KINFO entries with no reading at all:", len(no_reading),
      "".join(no_reading[:30]))
for c in ["旺", "頑", "頒", "稽", "衷", "分", "過", "酷"]:
    print(c, KINFO.get(c))
