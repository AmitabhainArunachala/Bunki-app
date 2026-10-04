#!/usr/bin/env python3
"""Build 言葉の鉱脈 from source/mined.json (real sentences) and source/v2/*.json
(meanings, definitions, notes, and a written sentence for words nothing was mined for).

Outputs
  prototypes/corridor/decks/kotoba-mine/deck.json   the 集中道場 player deck
  decks/kotoba-mine/release/kotoba-mine.apkg         Anki deck (one note per sentence)
  decks/kotoba-mine/release/kotoba-mine.tsv          plain text export
  decks/kotoba-mine/release/study.html               the player as one offline file

Every sentence is tokenised with the corridor's tokeniser (fugashi + UniDic,
plus the repo's reading-override lexicon) so each kanji word carries its
reading; the asked word is one segment whose reading comes from the card.

Run from the repo root:  python3 decks/kotoba-mine/tools/build.py
Needs: pip install fugashi unidic-lite==1.0.8 genanki
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DECK_DIR = HERE.parent
REPO = DECK_DIR.parents[1]
SRC = DECK_DIR / "source"
RELEASE = DECK_DIR / "release"  # not dist/: the repo ignores every dist/ directory
CORRIDOR = REPO / "prototypes" / "corridor"
PLAYER_DECK = CORRIDOR / "decks" / "kotoba-mine" / "deck.json"

sys.path.insert(0, str(HERE))
sys.path.insert(0, str(CORRIDOR / "tools"))
sys.path.insert(0, str(REPO))
import check_v2  # noqa: E402

DECK_ID = "kotoba-mine"
TITLE_JA = "言葉の鉱脈"
TITLE_EN = "My mined words"
GROUPS = {
    "m01-money": ("お金・経済", "Money and the economy"),
    "m02-hegemony": ("国際政治・貿易", "World politics and trade"),
    "m03-fab": ("技術・ものづくり", "Technology and making things"),
    "m04-incident": ("事件・ニュース", "Crime and the news"),
    "m05-politics": ("政治・皇室", "Politics and the imperial family"),
    "m06-works": ("建設・行政", "Construction and local government"),
    "m07-board": ("勝負・競争", "Games and competition"),
    "m08-mind": ("心と科学", "The mind and science"),
    "m09-math": ("数学・情報", "Maths and computing"),
    "m10-table": ("暮らし・食・旅", "Daily life, food and travel"),
    "m11-people": ("人・性格・会話", "People and conversation"),
    "m12-kanji": ("漢字", "Single kanji"),
}
KANJI = re.compile(r"[㐀-鿿々〆ヵヶ]")


def kata_to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def load() -> list[dict]:
    order = json.loads((SRC / "modules.json").read_text("utf-8"))
    bad = {m: e for m in order if (e := check_v2.check(m))}
    if bad:
        for m, errs in bad.items():
            print(f"✗ {m}: {errs[:3]}")
        raise SystemExit(f"{len(bad)} module(s) fail check_v2")
    mined_path = SRC / "mined.json"
    mined = json.loads(mined_path.read_text("utf-8")) if mined_path.exists() else {}
    mods = []
    for mid in order:
        doc = json.loads((SRC / "v2" / f"{mid}.json").read_text("utf-8"))
        by_n = {c["n"]: c for c in doc["cards"]}
        mods.append({"id": mid, "cards": [with_mined(by_n[n], mined.get(str(n))) for n in order[mid]["n"]]})
    return mods


def with_mined(card: dict, picks: list[dict] | None) -> dict:
    """real sentences when mining found any; otherwise the best written one, labelled as such"""
    if picks:
        sentences = [
            {"lv": i + 1, "ja": p["ja"], "form": p["form"], "en": p.get("en", ""), "kind": p["kind"],
             "src": {k: p[k] for k in ("site", "url", "licence") if p.get(k)}}
            for i, p in enumerate(picks)
        ]
    else:
        s0 = card["sentences"][0]
        sentences = [{**s0, "lv": 1, "kind": "original", "src": {"site": "書き下ろし（このデッキ用）"}}]
    return {**card, "sentences": sentences}


# ------------------------------------------------------------------ ruby
def _ordered(ja, tokens, a, b, ts, te, form, reading):
    segs: list[list] = []
    pos = 0
    placed = False
    for t in tokens:
        s, e = pos, pos + len(t["s"])
        pos = e
        if e <= ts:
            segs.extend(_token_segs(t))
        elif s >= te:
            segs.extend(_token_segs(t))
        elif not placed:
            if ja[ts:a]:
                segs.append([ja[ts:a], ""])
            segs.append([form, reading, 1])
            if ja[b:te]:
                segs.append([ja[b:te], ""])
            placed = True
    # merge neighbouring plain segments
    merged: list[list] = []
    for seg in segs:
        if merged and len(seg) == 2 and len(merged[-1]) == 2 and not seg[1] and not merged[-1][1]:
            merged[-1][0] += seg[0]
        else:
            merged.append(seg)
    return merged


def _token_segs(t: dict) -> list[list]:
    out = []
    for f in t["f"]:
        r = f.get("r", "")
        out.append([f["t"], r if r and KANJI.search(f["t"]) else ""])
    return out


def target_reading(card: dict, form: str) -> str | None:
    """the card's reading when the sentence uses the dictionary form itself"""
    if form == card["term"] and re.fullmatch(r"[ぁ-ゖー]+", card["reading"]):
        return card["reading"]
    return None


# ------------------------------------------------------------------ deck
def build_deck(mods: list[dict]) -> dict:
    import build_corridor as bc
    from corpus.grading._mecab import get_tagger

    tagger = get_tagger()
    words = []
    for m in mods:
        for c in m["cards"]:
            wid = f"km-{c['n']:03d}"
            cards = []
            for s in c["sentences"]:
                ruby = _ordered_for(s, c, tagger, bc)
                if "".join(seg[0] for seg in ruby) != s["ja"]:
                    raise SystemExit(f"{wid} lv{s['lv']}: ruby does not spell the sentence")
                card = {"id": f"{wid}-{s['lv']}", "lv": s["lv"], "ja": s["ja"], "form": s["form"], "en": s["en"], "ruby": ruby, "kind": s["kind"]}
                if s.get("src"):
                    card["src"] = s["src"]
                cards.append(card)
            word = {
                "id": wid,
                "group": m["id"],
                "term": c["term"],
                "reading": c["reading"],
                "meaning": c["meaning"],
                "defJa": c["def_ja"],
                "pos": c["pos"],
                "cards": cards,
            }
            if c.get("tip"):
                word["tip"] = c["tip"]
            words.append(word)
    return {
        "format": "bunki-cloze-deck",
        "version": 1,
        "id": DECK_ID,
        "titleJa": TITLE_JA,
        "titleEn": TITLE_EN,
        "groups": [{"id": m["id"], "titleJa": GROUPS[m["id"]][0], "titleEn": GROUPS[m["id"]][1]} for m in mods],
        "words": words,
        "provenance": "Sentences are real Japanese mined from the web, Tatoeba (CC BY 2.0 FR), ja.wikinews and Aozora Bunko; each card names its source. Web sentences are short quotations kept for personal study. Definitions, notes and the few sentences marked 書き下ろし were written for this word list.",
    }


def _ordered_for(s: dict, c: dict, tagger, bc) -> list[list]:
    ja, form = s["ja"], s["form"]
    a = ja.index(form)
    b = a + len(form)
    tokens = bc.tokenise(ja, tagger)
    pos = 0
    spans = []
    for t in tokens:
        spans.append((pos, pos + len(t["s"]), t))
        pos += len(t["s"])
    touched = [x for x in spans if x[1] > a and x[0] < b]
    ts, te = touched[0][0], touched[-1][1]
    reading = target_reading(c, form)
    if reading is None:
        # tokens inside the form give its reading; a token that sticks out of
        # the form is cut by surface length (okurigana is kana, so it maps 1:1)
        parts = []
        for s0, e0, t in touched:
            lo, hi = max(s0, a), min(e0, b)
            r = kata_to_hira(t["r"] or t["s"])
            if (lo, hi) == (s0, e0):
                parts.append(r)
            elif not KANJI.search(t["s"]):
                parts.append(r[lo - s0 : hi - s0])
            else:
                # a kanji token cut by the form: keep its full reading when the form starts it
                parts.append(r if lo == s0 else ja[lo:hi])
        reading = "".join(parts)
    return _ordered(ja, tokens, a, b, ts, te, form, kata_to_hira(reading))


# ------------------------------------------------------------------ anki
def anki_furigana(ruby: list[list]) -> str:
    out = []
    for seg in ruby:
        text, reading = seg[0], seg[1]
        target = len(seg) > 2
        piece = f" {html.escape(text)}[{reading}]" if reading and KANJI.search(text) else html.escape(text)
        out.append(f"<b>{piece}</b>" if target else piece)
    return "".join(out).strip()


def front_html(card: dict) -> str:
    """the sentence as written, target in bold, no readings (reading it is the test)"""
    return "".join(f"<b>{html.escape(seg[0])}</b>" if len(seg) > 2 else html.escape(seg[0]) for seg in card["ruby"])


KIND_JA = {"news": "ニュース", "blog": "ブログ", "qa": "Q&A", "company": "企業サイト", "gov": "公的機関", "literature": "文学",
           "tatoeba": "Tatoeba", "wiki": "Wikipedia", "social": "SNS", "example-bank": "例文集", "other": "ウェブ", "original": "書き下ろし"}


def blank_html(card: dict) -> str:
    return "".join(
        '<span class="blank">［　　］</span>' if len(seg) > 2 else html.escape(seg[0]) for seg in card["ruby"]
    )


FIELDS = ["Key", "Sort", "Topic", "Level", "Kind", "Word", "Reading", "Meaning", "DefJA", "SentenceFront", "SentenceBlank", "SentenceFurigana", "SentenceEN", "Tip", "Source", "SourceURL"]


def note_rows(deck: dict) -> list[dict]:
    rows = []
    groups = {g["id"]: g for g in deck["groups"]}
    for wi, w in enumerate(deck["words"]):
        for card in w["cards"]:
            rows.append({
                "Key": card["id"],
                # every word's best sentence first (in mining order), then second sentences …:
                # a word comes back in a new sentence weeks later, never twice at once
                "Sort": f"{card['lv']}-{wi:04d}",
                "Topic": groups[w["group"]]["titleJa"],
                "Level": str(card["lv"]),
                "Word": html.escape(w["term"]),
                "Reading": html.escape(w["reading"]),
                "Meaning": html.escape(w["meaning"]),
                "DefJA": html.escape(w["defJa"]),
                "Kind": card["kind"],
                "SentenceFront": front_html(card),
                "SentenceBlank": blank_html(card),
                "Source": html.escape(card.get("src", {}).get("site") or KIND_JA.get(card["kind"], "")),
                "SourceURL": html.escape(card.get("src", {}).get("url", "")),
                "SentenceFurigana": anki_furigana(card["ruby"]),
                "SentenceEN": html.escape(card["en"]),
                "Tip": html.escape(w.get("tip", "")),
                "_group": w["group"],
            })
    rows.sort(key=lambda r: r["Sort"])
    return rows


def stable_id(s: str) -> int:
    return int(hashlib.sha1(s.encode()).hexdigest()[:12], 16) % (1 << 31) + (1 << 30)


def build_anki(deck: dict) -> None:
    import genanki

    tdir = HERE / "anki"
    model = genanki.Model(
        stable_id("kotoba-mine-sentence-v3"),
        "Kotoba Mine Sentence",
        fields=[{"name": f} for f in FIELDS],
        templates=[{
            "name": "Read",
            "qfmt": (tdir / "front.html").read_text("utf-8"),
            "afmt": (tdir / "back.html").read_text("utf-8"),
        }],
        css=(tdir / "style.css").read_text("utf-8"),
        sort_field_index=1,
    )

    class Note(genanki.Note):
        @property
        def guid(self):
            return genanki.guid_for(self.fields[0], DECK_ID)

    root = f"{TITLE_JA} Kotoba Mine"
    decks = {}
    for g in deck["groups"]:
        d = genanki.Deck(stable_id(f"kotoba-mine-v3-{g['id']}"), f"{root}::{g['titleJa']}")
        d.description = html.escape(g["titleEn"])
        decks[g["id"]] = d
    for i, r in enumerate(note_rows(deck)):
        note = Note(model=model, fields=[r[f] for f in FIELDS], tags=[DECK_ID, f"sentence{r['Level']}", f"source::{r['Kind']}", f"topic::{r['_group']}"], sort_field=r["Sort"], due=i)
        decks[r["_group"]].add_note(note)
    genanki.Package(list(decks.values())).write_to_file(str(RELEASE / "kotoba-mine.apkg"))


def build_tsv(deck: dict) -> None:
    lines = ["#separator:tab", "#html:true", f"#columns:{chr(9).join(FIELDS)}\tTags"]
    for r in note_rows(deck):
        lines.append("\t".join([*(r[f].replace("\t", " ") for f in FIELDS), f"{DECK_ID} sentence{r['Level']} source::{r['Kind']}"]))
    (RELEASE / "kotoba-mine.tsv").write_text("\n".join(lines) + "\n", "utf-8")


# ------------------------------------------------------------------ study.html
def build_study(deck: dict) -> None:
    """One offline file: the player's three modules inlined as plain code
    (no runtime eval, so it also runs under a strict content policy)."""
    player = CORRIDOR / "decks" / "player"
    tsfsrs = re.sub(r"//# sourceMappingURL=.*$", "", (CORRIDOR / "vendor" / "ts-fsrs.mjs").read_text("utf-8"), flags=re.M)
    m = re.search(r"export\s*\{([^}]*)\};?\s*$", tsfsrs)
    names = []
    for part in m.group(1).split(","):
        part = part.strip()
        if part:
            src, _, alias = part.partition(" as ")
            names.append(f"{(alias or src).strip()}: {src.strip()}")
    fsrs_js = "window.__TSFSRS__ = (() => {\n" + tsfsrs[: m.start()] + "\nreturn {" + ", ".join(names) + "};\n})();"
    engine = (player / "engine.js").read_text("utf-8")
    engine_names = re.findall(r"^export (?:async )?(?:function|const|let) (\w+)", engine, flags=re.M)
    engine_js = "const __KP_ENGINE__ = (() => {\n" + re.sub(r"^export ", "", engine, flags=re.M) + "\nreturn { " + ", ".join(engine_names) + " };\n})();"
    mount = (player / "mount.js").read_text("utf-8")
    mount = re.sub(r"import\s*\{([^}]*)\}\s*from\s*'\./engine\.js';", r"const {\1} = __KP_ENGINE__;", mount)
    mount = re.sub(r"^export ", "", mount, flags=re.M).replace("import.meta.url", "location.href")
    code = "\n".join([fsrs_js, engine_js, mount])
    page = (HERE / "study-shell.html").read_text("utf-8")
    deck_json = json.dumps(deck, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    pin = (CORRIDOR / "data" / "fsrs-pin.json").read_text("utf-8").strip()
    css = (player / "player.css").read_text("utf-8")
    page = page.replace("__CSS__", css).replace("__PIN__", pin).replace("__DECK__", deck_json)
    page = page.replace("__CODE__", code.replace("</script", "<\\/script"))
    (RELEASE / "study.html").write_text(page, "utf-8")


def main() -> int:
    mods = load()
    deck = build_deck(mods)
    PLAYER_DECK.parent.mkdir(parents=True, exist_ok=True)
    PLAYER_DECK.write_text(json.dumps(deck, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
    RELEASE.mkdir(exist_ok=True)
    build_tsv(deck)
    build_anki(deck)
    build_study(deck)
    n = sum(len(w["cards"]) for w in deck["words"])
    print(f"· {len(deck['words'])} words, {n} sentence cards → {PLAYER_DECK.relative_to(REPO)}")
    print(f"· {RELEASE.relative_to(REPO)}/kotoba-mine.apkg, .tsv, study.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
