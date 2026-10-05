#!/usr/bin/env python3
"""Checks for source/gloss_ja.json and the way build.py ships it in tokens.json.
Run from anywhere: python3 decks/kotoba-mine/tools/test_gloss_ja.py

1. The table: {lemma: sense}, prettier-formatted, every sense one Japanese line of at most
   40 characters, no deck word among the keys (a deck word's sense is its own defJa), and the
   most frequent passage lemmas covered.
2. gloss_ja() refuses a malformed table (too long, two lines, empty, not Japanese).
3. tokens_file() on a small synthetic deck: the word's own defs entry is its defJa exactly as
   before; a lemma its passage or definition uses, and the table holds, gets a defs entry keyed
   by that lemma whose tokens spell the table's sense; a lemma nobody uses, or the table lacks,
   gets none; a table key that is a deck word fails the build; the standalone page's gloss map
   carries the word's defs only.
Needs fugashi + unidic-lite, like build.py.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.argv = sys.argv[:1]  # build.py reads its flags at import
sys.path.insert(0, str(HERE))
import build  # noqa: E402

FAILS: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'✓' if ok else '✗'} {name}{f' ({detail})' if detail and not ok else ''}")
    if not ok:
        FAILS.append(name)


def spelled(rows: list[list]) -> str:
    return "".join(r[0] for r in rows)


# 1. the shipped table
text = build.GLOSS_JA_PATH.read_text("utf-8")
table = build.gloss_ja()
check("gloss_ja.json is prettier-formatted JSON (2-space indent, trailing newline)",
      text == json.dumps(table, ensure_ascii=False, indent=2) + "\n")
check("the table holds over a thousand senses", len(table) > 1000, str(len(table)))
long = [k for k, v in table.items() if len(v) > build.GLOSS_JA_MAX]
check("every sense is at most 40 characters", not long, ", ".join(long[:5]))
terms = {c["term"] for m in build.load() for c in m["cards"]}
clash = sorted(set(table) & terms)
check("no key is a deck word", not clash, ", ".join(clash[:5]))
FREQUENT = ("する ある なる いる いう こと その ない 年 人 できる 日 よる よう ため 月 くる それ この もの "
            "多い 会社 新しい 続く 店 大きい 時間 高い 大きな 場合 呼ぶ 見える 声 市 結果 次 上 ほとんど 水")
missing = [k for k in FREQUENT.split() if k not in table]
check("the most frequent passage lemmas have a sense", not missing, ", ".join(missing))

# 2. malformed tables
for name, bad in (("a sense over 40 characters", {"語": "あ" * 41}), ("a two-line sense", {"語": "一行目。\n二行目。"}),
                  ("an empty sense", {"語": ""}), ("a sense with no Japanese", {"語": "word"}),
                  ("a list, not an object", ["語"])):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(bad, f, ensure_ascii=False)
    try:
        build.gloss_ja(Path(f.name))
        check(f"gloss_ja() refuses {name}", False, "accepted")
    except SystemExit:
        check(f"gloss_ja() refuses {name}", True)
    finally:
        Path(f.name).unlink()

# 3. tokens_file on a synthetic deck
JA = "工場では新しい機械が動き出した。"
DEF_JA = "人が考えを伝える言葉。"
deck = {"id": "test-deck", "words": [{"id": "t-001", "term": "機械", "defJa": DEF_JA,
                                      "cards": [{"id": "t-001-m01", "ja": JA, "form": "機械"}]}]}
small = {"工場": "物を作るところ。", "新しい": "できたばかりである。", "伝える": "知らせる。",
         "空": "地上の上に広がる空間。"}
build.encode_tokens = lambda ja, form: build.encode_text(ja)  # no card build ran, so no targets
side = build.tokens_file(deck, small)
defs = side["defs"]
check("the deck word's defs entry is its defJa tokens, as before",
      defs.get("t-001") == build.encode_text(DEF_JA) and spelled(defs["t-001"]) == DEF_JA)
check("lemmas the passage uses get the table's sense, keyed by lemma",
      spelled(defs.get("工場", [])) == small["工場"] and spelled(defs.get("新しい", [])) == small["新しい"])
check("a lemma only the word's definition uses gets the table's sense too",
      spelled(defs.get("伝える", [])) == small["伝える"])
check("a lemma nobody uses ships no sense", "空" not in defs)
check("a lemma the table lacks ships no sense (today's behaviour)", "動き出す" not in defs and "人" not in defs,
      ", ".join(k for k in ("動き出す", "人") if k in defs))
check("defs holds the word id and the used lemmas only", set(defs) == {"t-001", "工場", "新しい", "伝える"},
      ", ".join(sorted(defs)))
try:
    build.tokens_file(deck, {**small, "機械": "動力で仕事をする装置。"})
    check("a table key that is a deck word fails the build", False, "built")
except SystemExit:
    check("a table key that is a deck word fails the build", True)
gloss = build.gloss_map(deck, side)
check("the standalone page's gloss map carries the deck word's definition only", set(gloss["defs"]) <= {"t-001"},
      ", ".join(sorted(gloss["defs"])))
no_table = build.tokens_file(deck, {})
check("with an empty table, defs is exactly the deck words' definitions", set(no_table["defs"]) == {"t-001"})

if FAILS:
    raise SystemExit(f"{len(FAILS)} check(s) failed")
print("all gloss_ja checks pass")
