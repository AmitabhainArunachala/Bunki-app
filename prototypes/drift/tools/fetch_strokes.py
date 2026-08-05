# Fetch KanjiVG stroke-order SVGs for the Drift pool's kanji + radicals,
# extract stroke paths (document order = stroke order) and number anchors,
# emit a compact JSON for embedding.
import json, os, re, subprocess, sys

KANJI = "言葉語方感覚直情報告予定決解理心配達成長所場現実際国境界世間時代交渉干騒音発記憶録登山道具貿易容内滞在摩擦変化学習環慣"
COMPS = "口艹木五見十目忄青土又牛宀疋氵角刀王里酉己⻌羊戸斤日阝祭囗玉立田門寺亻歩馬虫癶金豆首貝谷麻手扌匕子羽白亠父戈夂"
chars = sorted(set(KANJI + COMPS))

OUT = {}
CACHE = os.path.join(os.path.dirname(__file__), "kvg-cache")
os.makedirs(CACHE, exist_ok=True)

path_re = re.compile(r'<path[^>]*\bd="([^"]+)"')
num_re = re.compile(r'<text transform="matrix\([^)]*\s([\d.]+)\s([\d.]+)\)"[^>]*>(\d+)</text>')

fail = []
for ch in chars:
    code = f"{ord(ch):05x}"
    fn = os.path.join(CACHE, code + ".svg")
    if not os.path.exists(fn):
        url = f"https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{code}.svg"
        r = subprocess.run(["curl", "-sS", "-f", "-o", fn, url], capture_output=True)
        if r.returncode != 0:
            fail.append(ch)
            continue
    svg = open(fn, encoding="utf-8").read()
    paths = path_re.findall(svg)
    nums = [[float(x), float(y)] for x, y, n in sorted(num_re.findall(svg), key=lambda t: int(t[2]))]
    if not paths:
        fail.append(ch)
        continue
    OUT[ch] = {"p": paths, "n": nums}

js = json.dumps(OUT, ensure_ascii=False, separators=(",", ":"))
open(os.path.join(os.path.dirname(__file__), "strokes.json"), "w", encoding="utf-8").write(js)
print("ok:", len(OUT), "fail:", "".join(fail) or "-", "bytes:", len(js.encode("utf-8")))
