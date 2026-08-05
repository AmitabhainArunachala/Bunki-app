# Build Drift v4.2 radical datasets from KanjiVG component annotations
# (kvg:element / kvg:original) + kanji.json readings/meanings.
#   RADK  component -> joyo kanji containing it (stroke-order sorted)
#   KRAD  kanji -> its own components (immediate + one level down)
#   KINFO kanji -> [katakana reading, core meaning]
import json, os, re
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = set("言葉語方感覚直情報告予定決解理心配達成長所場現実際国境界世間時代交渉干騒音発記憶録登山道具貿易容内滞在摩擦変化学習環慣")

kj = json.load(open(os.path.join(HERE, "kanji.json"), encoding="utf-8"))
joyo = {c for c, v in kj.items() if v.get("grade") and v["grade"] <= 8} | POOL

def kata(s):
    return "".join(chr(ord(ch) + 0x60) if "ぁ" <= ch <= "ゖ" else ch for ch in s)

KINFO, strokes = {}, {}
for c in joyo:
    v = kj.get(c)
    if not v: continue
    on = v.get("readings_on") or []
    kun = v.get("readings_kun") or []
    reading = kata(on[0]) if on else (kun[0] if kun else "")
    mean = (v.get("meanings") or [""])[0]
    KINFO[c] = [reading, mean[:36]]
    strokes[c] = v.get("strokes") or 0

NS = "{http://kanjivg.tagaini.net}"
def parse_svg(ch):
    fn = os.path.join(HERE, "kvg-cache", f"{ord(ch):05x}.svg")
    if not os.path.exists(fn): return None, None
    try:
        root = ET.parse(fn).getroot()
    except ET.ParseError:
        return None, None
    top = None
    for g in root.iter("{http://www.w3.org/2000/svg}g"):
        if g.get("id", "").startswith("kvg:0") and "-" not in g.get("id", "")[4:]:
            top = g; break
    if top is None: return None, None
    def elems(node):
        out = []
        for a in ("element", "original"):
            val = node.get(NS + a)
            if val and len(val) == 1: out.append(val)
        return out
    all_comps, shallow = set(), []
    def walk(node, depth):
        for child in node:
            es = elems(child)
            for e in es:
                if e != ch:
                    all_comps.add(e)
                    if depth <= 2 and e not in shallow: shallow.append(e)
            walk(child, depth + 1 if es else depth)
    walk(top, 1)
    return all_comps, shallow

from collections import defaultdict
fam = defaultdict(set)
KRAD = {}
parsed = 0
for c in sorted(joyo):
    comps, shallow = parse_svg(c)
    if comps is None: continue
    parsed += 1
    for comp in comps: fam[comp].add(c)
    if shallow: KRAD[c] = "".join(shallow[:6])

RADK = {}
for comp, members in fam.items():
    mem = sorted(members, key=lambda k: (strokes.get(k, 99), k))
    if len(mem) >= 3:
        RADK[comp] = "".join(mem)

out = {"RADK": RADK, "KINFO": KINFO, "KRAD": KRAD}
js = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
open(os.path.join(HERE, "radk.json"), "w", encoding="utf-8").write(js)
print("parsed:", parsed, "radicals:", len(RADK), "kinfo:", len(KINFO), "krad:", len(KRAD), "KB:", len(js.encode()) // 1024)
for probe in "言尸氵口阝":
    m = RADK.get(probe, "")
    print(probe, len(m), m[:24])
