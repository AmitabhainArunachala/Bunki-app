#!/usr/bin/env python3
"""Checks for tools/rights.py and the decks it labels (review findings F12–F14, N07, N11;
standard amendments A11–A13). Run from anywhere: python3 decks/kotoba-mine/tools/test_rights.py

1. A synthetic Aozora text file: the header parses to title / original title / author /
   translator, the trailer's licence is read, the work-card URL is built from the path.
2. allowed(): an x.com record and a CC BY-ND record are kept out of `public` and kept in
   `private`; a CC record without a URL is kept out of `public`; written passages always pass.
3. relabel(): an Aozora work whose trailer nobody has read is "unverified", never
   "public domain"; a mapped work takes its licence, author, translator and work URL.
4. The shipped data: every Aozora site string in source/ is in rights.json; neither
   shipped deck.json says "public domain"; the public build (release/public/), when
   present, holds no record public may not ship.
No third-party packages are needed.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DECK_DIR = HERE.parent
REPO = DECK_DIR.parents[1]
sys.path.insert(0, str(HERE))
import rights  # noqa: E402

FAILS: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'✓' if ok else '✗'} {name}{f' ({detail})' if detail and not ok else ''}")
    if not ok:
        FAILS.append(name)


SYNTHETIC = "\n".join([
    "瀕死の探偵",
    "THE ADVENTURE OF THE DYING DETECTIVE",
    "アーサー・コナン・ドイル　Arthur Conan Doyle",
    "東健而訳",
    "大久保ゆう改訳",
    "",
    "-------------------------------------------------------",
    "【テキスト中に現れる記号について】",
    "-------------------------------------------------------",
    "　ハドソン夫人は《ふじん》、下宿のおかみである。",
    "",
    "翻訳の底本：Arthur Conan Doyle (1913) \"The Adventure of The Dying Detective\"",
    "　　　上記の翻訳底本は、著作権が失効しています。",
    "※この翻訳は「クリエイティブ・コモンズ 表示 2.1 日本 ライセンス」（http://creativecommons.org/licenses/by/2.1/jp/）によって公開されています。",
    "上記のライセンスに従って、訳者に断りなく自由に利用・複製・再配布することができます。",
])
SYNTHETIC_ND = "\n".join([
    "赤い婚礼",
    "RED BRIDAL",
    "小泉八雲　Lafcadio Hearn",
    "林田清明訳",
    "-------------------------------------------------------",
    "本文。",
    "底本：「仏の畑の落穂　他」",
    "●利用許諾条項（ライセンス）",
    "この作品は、クリエイティブ・コモンズ（http://creativecommons.org/licenses/by-nd/2.1/jp/）の下でライセンスされています。",
])
SYNTHETIC_NCND = "七月の水玉\n片岡義男\n\n-----\n本文。\n底本：「七月の水玉」\nこの作品は、クリエイティブ・コモンズ「表示-非営利-改変禁止 2.1 日本」でライセンスされています。\n"
SYNTHETIC_NONE = "春の潮\n伊藤左千夫\n\n-----\n本文。\n底本：「野菊の墓」\n入力：某\n"


def test_aozora_parsing() -> None:
    w = rights.aozora_work(SYNTHETIC, Path("cards/000009/files/50718_ruby_36995/50718_ruby_36995.txt"))
    check("header: title", w["title"] == "瀕死の探偵", w["title"])
    check("header: original title", w["originalTitle"] == "THE ADVENTURE OF THE DYING DETECTIVE", w["originalTitle"])
    check("header: author (Japanese name, not the subtitle line)", w["author"] == "アーサー・コナン・ドイル", w["author"])
    check("header: translator and reviser", w["translator"] == "東健而（訳）、大久保ゆう（改訳）", w["translator"])
    check("trailer after 翻訳の底本： is read: CC BY 2.1 JP", w["licence"] == "CC BY 2.1 JP", w["licence"])
    check("the notice is kept verbatim", w["licenceNotice"].startswith("※この翻訳は「クリエイティブ・コモンズ 表示 2.1 日本"), w["licenceNotice"])
    check("work-card URL from the file's work number",
          w["url"] == "https://www.aozora.gr.jp/cards/000009/card50718.html" and w["workId"] == "50718", w["url"])
    check("site names the author", w["site"] == "青空文庫『瀕死の探偵』アーサー・コナン・ドイル", w["site"])
    nd = rights.aozora_work(SYNTHETIC_ND, Path("cards/000258/files/58129_ruby_60565/58129_ruby_60565.txt"))
    check("ND trailer (licence URL only): CC BY-ND 2.1 JP", nd["licence"] == "CC BY-ND 2.1 JP", nd["licence"])
    check("single translator", nd["translator"] == "林田清明" and nd["author"] == "小泉八雲", f"{nd['author']} / {nd['translator']}")
    ncnd = rights.aozora_work(SYNTHETIC_NCND, Path("cards/001506/files/54825_txt_46746/54825_txt_46746.txt"))
    check("NC-ND trailer (Japanese name only): CC BY-NC-ND 2.1 JP", ncnd["licence"] == "CC BY-NC-ND 2.1 JP", ncnd["licence"])
    check("no translator line → no translator", ncnd["translator"] == "" and ncnd["author"] == "片岡義男", ncnd["author"])
    none = rights.aozora_work(SYNTHETIC_NONE, Path("cards/000058/files/1_ruby_1/1_ruby_1.txt"))
    check("a trailer with no licence leaves the work unverified", none["licence"] == rights.UNVERIFIED_AOZORA, none["licence"])
    from mine_aozora import body  # noqa: E402  (imports rank.py, stdlib only)

    check("the miner's body stops before the trailer", "ライセンス" not in body(SYNTHETIC) and "下宿" in body(SYNTHETIC))


def test_allowed() -> None:
    web = next(p for p in rights.rules()["privateOnlyLicences"] if p.startswith("web"))  # the label shipped web quotes carry
    x = {"kind": "social", "site": "x.com", "url": "https://x.com/someone/status/1", "licence": web}
    nd = {"kind": "news", "site": "livedoor ニュース", "url": "http://news.livedoor.com/article/detail/1/", "licence": "CC BY-ND 2.1 JP (livedoor)"}
    bare = {"kind": "wiki", "site": "ja.wikipedia.org", "url": "", "licence": "CC BY-SA (Wikipedia)"}
    ok = {"kind": "tatoeba", "site": "Tatoeba", "url": "https://tatoeba.org/ja/sentences/show/1", "licence": "CC BY 2.0 FR (Tatoeba)"}
    sub = {"kind": "qa", "url": "https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1", "licence": "CC BY 4.0"}
    written = {"kind": "original", "site": "書き下ろし（このデッキ用）", "url": "", "licence": "Bunki original"}
    check("public rejects an x.com record", not rights.allowed(x, "public"))
    check("public rejects a CC BY-ND record", not rights.allowed(nd, "public"))
    check("private keeps the x.com record", rights.allowed(x, "private"))
    check("private keeps the CC BY-ND record", rights.allowed(nd, "private"))
    check("public rejects a CC record with no URL", not rights.allowed(bare, "public"))
    check("public rejects a chiebukuro post whatever its licence", not rights.allowed(sub, "public"))
    check("public keeps a CC BY record with its URL", rights.allowed(ok, "public"))
    check("written passages pass both profiles", rights.allowed(written, "public") and rights.allowed(written, "private"))
    check("exclusion reasons", [rights.exclusion(r) for r in (x, nd, bare)] == ["social domain", "livedoor ND", "no URL"],
          str([rights.exclusion(r) for r in (x, nd, bare)]))


def test_relabel() -> None:
    old = {"kind": "literature", "site": "青空文庫『春の潮』伊藤左千夫", "url": "https://www.aozora.gr.jp/cards/000058/",
           "licence": "public domain (Aozora Bunko)"}
    r = rights.relabel(old)
    check("an unread Aozora work is unverified", r["licence"] == rights.UNVERIFIED_AOZORA, r["licence"])
    unknown = rights.relabel({**old, "site": "青空文庫『どこにもない本』誰か"})
    check("an Aozora work missing from rights.json is unverified", unknown["licence"] == rights.UNVERIFIED_AOZORA)
    pc = rights.relabel({**old, "site": "青空文庫『パソコン創世記』富田倫生", "url": "https://www.aozora.gr.jp/cards/000055/"})
    check("a read work takes its licence, author and work URL",
          (pc["licence"], pc.get("author"), pc["url"]) == ("CC BY 2.1 JP", "富田倫生", "https://www.aozora.gr.jp/cards/000055/card365.html"), str(pc))
    hearn = rights.relabel({**old, "site": "青空文庫『赤い婚礼』RED BRIDAL"})
    check("赤い婚礼 is CC BY-ND with author and translator",
          (hearn["licence"], hearn.get("author"), hearn.get("translator")) == ("CC BY-ND 2.1 JP", "ラフカディオ・ハーン（小泉八雲）", "林田清明"), str(hearn))
    mined = rights.relabel({"kind": "example-bank", "site": "例文集（Tanaka/SNOW）", "url": "", "licence": "Bunki original"})
    check("a mined record cannot carry the written-for-the-deck licence", mined["licence"] == rights.UNVERIFIED, mined["licence"])


def test_shipped() -> None:
    src = DECK_DIR / "source"
    sites = {r["site"] for f in ("mcd.json", "mined.json") for rows in json.loads((src / f).read_text("utf-8")).values()
             for r in rows if r["site"].startswith("青空文庫")}
    missing = sorted(sites - set(rights.rules()["aozora"]))
    check("every Aozora site string in source/ has a rights.json entry", not missing, ", ".join(missing[:3]))
    pd = [rights.rules()["aozora"][s]["licence"] for s in rights.rules()["aozora"] if "public domain" in rights.rules()["aozora"][s]["licence"]]
    check("rights.json never says public domain", not pd)
    for deck_id in ("kotoba-mcd", "kotoba-mine"):
        text = (REPO / "prototypes" / "corridor" / "decks" / deck_id / "deck.json").read_text("utf-8")
        check(f"{deck_id}/deck.json has no 'public domain' label", "public domain" not in text)
        public = DECK_DIR / "release" / "public" / f"deck-{deck_id}.json"
        if not public.exists():
            print(f"- release/public/deck-{deck_id}.json not built; skipped (build.py --profile public)")
            continue
        deck = json.loads(public.read_text("utf-8"))
        bad = [c["id"] for w in deck["words"] for c in w["cards"] if not rights.allowed({**c.get("src", {}), "kind": c["kind"]}, "public")]
        check(f"public {deck_id}: no excluded domain, private-only licence or CC record without URL", not bad, ", ".join(bad[:5]))
        check(f"public {deck_id}: ATTRIBUTION file beside it", (public.parent / f"ATTRIBUTION-{deck_id}.md").exists())


if __name__ == "__main__":
    test_aozora_parsing()
    test_allowed()
    test_relabel()
    test_shipped()
    print(f"{len(FAILS)} failed" if FAILS else "all rights checks pass")
    raise SystemExit(1 if FAILS else 0)
