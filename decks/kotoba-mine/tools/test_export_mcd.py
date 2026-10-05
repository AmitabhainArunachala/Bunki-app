#!/usr/bin/env python3
"""Checks for the passage rules of tools/export_mcd.py and the passage fields build.py carries.
Run from anywhere: python3 decks/kotoba-mine/tools/test_export_mcd.py

1. A v1 written passage (2–4 sentences, under 180 characters, no register) stays valid; a written
   passage over 300 characters or 5 sentences does not.
2. A contract-v2 passage (it has a register) must have 4–5 sentences of 180–300 characters, the
   target once, and as many English sentences as Japanese ones.
3. The optional fields: register one of the six codes, topic one of the topics, tipJa one
   Japanese line without Latin letters, grammar ids known to grammar-v11.json, sense one Japanese
   dictionary-style line of at most 40 characters; empty values are dropped, so an old record gets
   none of them.
4. Dated batches (pilot-2026-10-04.json) are read after the undated files; then each word's
   contract-v2 passages (a register) are put first, each group in the order read (v2_first).
5. build.passage_fields() carries register, topic, tipJa, sense and grammar (labelled) onto a
   card, and fails on a grammar id it does not know.
6. The committed contract-v2 batches (the pilot and the 31 full-run batches) pass every rule,
   every one of their passages is in mcd.json, and in mcd.json every word's passages start with
   its v2 passages, in batch order, before its earlier ones.
7. Check 4 (one target), mechanised: other_terms() tokenises a passage as build.py does and finds
   another deck word by surface (性能), by dictionary form (競っ → 競う), across tokens (生得+的),
   never inside a longer word (半導体 is not 導体) and never in the target; a v2 passage that uses
   one is refused unless `allow` names it with an `allowReason`, and an allow nothing uses is refused.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.argv = sys.argv[:1]  # build.py reads its flags at import
sys.path.insert(0, str(HERE))
import build  # noqa: E402
import export_mcd as ex  # noqa: E402

FAILS: list[str] = []


def ok(name: str, cond: bool, detail: str = "") -> None:
    print(f"{'✓' if cond else '✗'} {name}{'' if cond else '  — ' + detail}")
    if not cond:
        FAILS.append(name)


def refused(fn, *args) -> str:
    """the SystemExit message fn raises, or '' when it accepts"""
    try:
        fn(*args)
    except SystemExit as e:
        return str(e)
    return ""


V1 = {"ja": "人口が減り、税収も年々落ち込んでいる。市の財政はすでに限界に近い。", "form": "財政",
      "en": "The population is shrinking. The city's finances are near breaking point.", "original": True}
S = "この文は長さを稼ぐためだけに書かれた、ごく普通の説明の一文であり、ここに書かれている内容そのものには特に大きな意味はない。"  # one sentence
E = "This sentence is here for length. "
V2 = {"ja": "市の財政が苦しい。" + S * 5, "form": "財政", "en": "The city's finances are tight. " + (E * 5).strip(),
      "original": True, "register": "報", "topic": "history", "tipJa": "「財政が苦しい」の形でよく使う。", "grammar": ["n3-dewa-naku"]}


def main() -> int:
    # 1. v1 stays valid; the hard ceiling
    ok("a v1 written passage (2 sentences, 30-odd characters, no register) is accepted", refused(ex.check_written, "64", V1) == "")
    ok("a v1 record gets no optional fields", ex.optional("64", V1) == {})
    long = {**V1, "ja": "財政。" + "あ" * 300}
    ok("a written passage over 300 characters is refused", "300" in refused(ex.check_written, "64", long))
    six = {**V1, "ja": "財政の話。" + "短い文。" * 5}
    ok("a written passage of 6 sentences is refused", "sentences" in refused(ex.check_written, "64", six))

    # 2. contract v2
    v2 = {**V2, "ja": "市の財政が苦しい。" + S * 3, "en": "The city's finances are tight. " + (E * 3).strip()}
    ok("a contract-v2 passage of 4 sentences, 180–300 characters, target once, matching English is accepted",
       len(v2["ja"]) >= 180 and refused(ex.check_written, "64", v2) == "", f"{len(v2['ja'])} {refused(ex.check_written, '64', v2)}")
    short = {**V2, "ja": "市の財政が苦しい。" + S * 2, "en": "The city's finances are tight. " + (E * 2).strip()}
    ok("a contract-v2 passage of 3 sentences is refused", "contract-v2" in refused(ex.check_written, "64", short))
    twice = {**v2, "ja": v2["ja"].replace("ごく普通", "財政の", 1)}
    ok("a contract-v2 passage with the target twice is refused", "appears 2 times" in refused(ex.check_written, "64", twice))
    en = {**v2, "en": v2["en"] + " One more."}
    ok("a contract-v2 passage whose English has a different sentence count is refused", "English" in refused(ex.check_written, "64", en))
    six_v2 = {**V2, "ja": "市の財政が苦しい。" + S * 5}
    ok("a contract-v2 passage of 6 sentences is refused", refused(ex.check_written, "64", six_v2) != "")

    # 3. optional fields
    got = ex.optional("64", {**V2, "sense": ""})
    ok("register, topic, tipJa and grammar are carried; an empty sense is dropped",
       got == {"register": "報", "topic": "history", "tipJa": V2["tipJa"], "grammar": ["n3-dewa-naku"]}, json.dumps(got, ensure_ascii=False))
    ok("an unknown register is refused", "register" in refused(ex.optional, "64", {**V2, "register": "講義"}))
    ok("an unknown topic is refused", "topic" in refused(ex.optional, "64", {**V2, "topic": "surf"}))
    ok("a tipJa with Latin letters is refused", "tipJa" in refused(ex.optional, "64", {**V2, "tipJa": "use with AI"}))
    ok("a two-line tipJa is refused", "tipJa" in refused(ex.optional, "64", {**V2, "tipJa": "一行目。\n二行目。"}))
    ok("a grammar id not in grammar-v11.json is refused", "grammar" in refused(ex.optional, "64", {**V2, "grammar": ["n2-no-such-point"]}))
    ok("a Japanese sense of at most 40 characters is carried",
       ex.optional("64", {**V2, "sense": "国や自治体のお金のやりくり。"}).get("sense") == "国や自治体のお金のやりくり。")
    ok("an English sense is refused", "sense" in refused(ex.optional, "64", {**V2, "sense": "public finance"}))
    ok("a sense over 40 characters is refused", "sense" in refused(ex.optional, "64", {**V2, "sense": "あ" * 41}))

    # 4. batch order
    names = sorted(["s2.json", "pilot-2026-10-04.json", "preview.json", "s1.json", "late-2026-11-01.json"], key=ex.batch_order)
    ok("undated files come first in name order, then dated batches by date",
       names == ["preview.json", "s1.json", "s2.json", "pilot-2026-10-04.json", "late-2026-11-01.json"], " ".join(names))
    rows = [{"ja": "a"}, {"ja": "b", "register": "講"}, {"ja": "c"}, {"ja": "d", "register": "報"}]
    ok("v2_first puts a word's contract-v2 passages first, each group in the order read",
       [r["ja"] for r in ex.v2_first(rows)] == ["b", "d", "a", "c"], " ".join(r["ja"] for r in ex.v2_first(rows)))

    # 5. build.py carries the fields onto cards
    record = ex.written_record("64", {**v2, "sense": "国や自治体のお金のやりくり。"})
    fields = build.passage_fields("km-064", 4, record)
    ok("build.passage_fields carries register, topic, tipJa, sense and labelled grammar",
       fields == {"register": "報", "topic": "history", "tipJa": V2["tipJa"], "sense": "国や自治体のお金のやりくり。",
                  "grammar": [{"id": "n3-dewa-naku", "p": build._GRAMMAR["n3-dewa-naku"]["p"]}]}, json.dumps(fields, ensure_ascii=False))
    ok("build.passage_fields gives an old passage nothing", build.passage_fields("km-064", 1, {"ja": V1["ja"], "form": "財政"}) == {})
    ok("build.passage_fields fails on an unknown grammar id",
       "grammar" in refused(build.passage_fields, "km-064", 4, {**record, "grammar": ["n2-no-such-point"]}))

    # 6. the committed contract-v2 batches: the pilot, then the full run (v2-2026-10-05-b01…b31)
    mcd = json.loads((ex.SRC / "mcd.json").read_text("utf-8"))
    batches = sorted((f for f in (ex.SRC / "mcd").glob("*.json") if f.name.startswith(("pilot-", "v2-"))), key=lambda f: ex.batch_order(str(f)))
    want: dict[str, list[str]] = {}
    bad = []
    for f in batches:
        for n, rows in json.loads(f.read_text("utf-8")).items():
            for r in rows:
                msg = refused(ex.written_record, n, r)
                if msg or not r.get("register"):
                    bad.append(msg or f"{n}: no register")
                want.setdefault(n, []).append(r["ja"])
    pilot = json.loads((ex.SRC / "mcd" / "pilot-2026-10-04.json").read_text("utf-8"))
    total = sum(map(len, want.values()))
    ok(f"the v2 batches ({len(batches)} files, {total} passages, {len(want)} words) pass every rule; the pilot is 54 passages for 20 words",
       not bad and len(batches) == 32 and sum(map(len, pilot.values())) == 54 and len(pilot) == 20, " | ".join(bad[:3]))
    order = [n for n, rows in mcd.items() if [r["ja"] for r in rows[:len(want.get(n, []))]] != want.get(n, [])
             or any(r.get("register") for r in rows[len(want.get(n, [])):])]
    ok(f"in mcd.json every word ({len(mcd)}) starts with its v2 passages, in batch order, then its earlier ones (none of which has a register)",
       not order and set(want) == set(mcd) and all(mcd[n][0].get("register") for n in mcd), " ".join(order[:5]))

    # 7. check 4, mechanised
    ja = "各国は工場誘致を競っている。新しい半導体は性能が高く、生得的な差ではない。"
    hits = ex.other_terms("64", ja, "工場")
    ok("other_terms finds 性能 by surface, 競っ by its dictionary form 競う and 生得的 across tokens",
       hits == {"競う": "競っ", "性能": "性能", "生得的": "生得的"}, json.dumps(hits, ensure_ascii=False))
    ok("other_terms does not read 導体 (a deck word) inside 半導体", "導体" not in hits)
    ok("other_terms skips the target itself", "競う" not in ex.other_terms("212", ja, "競っ"))
    clash = {**v2, "ja": v2["ja"].replace("ごく普通の", "性能の", 1)}
    ok("a contract-v2 passage that uses another deck word is refused", "性能" in refused(ex.written_record, "64", clash))
    allowed = {**clash, "allow": ["性能"], "allowReason": "性能 is already in review"}
    ok("the same passage with allow and an allowReason is accepted", refused(ex.written_record, "64", allowed) == "",
       refused(ex.written_record, "64", allowed))
    ok("allow without an allowReason is refused", "allowReason" in refused(ex.written_record, "64", {**clash, "allow": ["性能"]}))
    ok("an allow the passage does not use is refused", "does not use" in refused(ex.written_record, "64", {**v2, "allow": ["性能"], "allowReason": "x"}))

    print("all export_mcd checks pass" if not FAILS else f"{len(FAILS)} check(s) failed")
    return 1 if FAILS else 0


if __name__ == "__main__":
    raise SystemExit(main())
