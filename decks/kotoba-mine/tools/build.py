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
SENTENCE_METHOD = [
    "このデッキは「1文1語」の読みカードです（Tatsumoto の Targeted Sentence Card）。",
    "表：本物の日本語の文。覚える語は色つき。英語も読みも出ない。読んで、意味を思い出してからタップ。",
    "裏：ふりがな、意味、訳、出典。思い出せたら「覚えた」、だめなら「もう一度」。",
    "よく使う語は文が2〜3つ。一つ目が定着すると（約2週間）、次の文が開く。",
]
# the two decks built from the same word list, side by side in 集中道場
DECKS = {
    "sentence": {"id": "kotoba-mine", "titleJa": "言葉の鉱脈・文", "titleEn": "Real sentences · read and recall",
                 "defaults": {"look": "dark", "mode": "read", "hint": "en"}, "method": SENTENCE_METHOD,
                 "anki": ("anki-sentence", "kotoba-mine-sentence-v3", "Kotoba Mine Sentence", "Read", "kotoba-mine-v3"),
                 "out": ("kotoba-mine.apkg", "kotoba-mine.tsv", "study.html")},
    "mcd": {"id": "kotoba-mcd", "titleJa": "言葉の鉱脈・MCD", "titleEn": "Massive-context cloze · passages",
            "defaults": {"look": "ai", "mode": "self", "hint": "ja"}, "unlockDays": 3,
            "anki": ("anki", "kotoba-mine-mcd-v4", "Kotoba Mine MCD", "Cloze", "kotoba-mine-v4"),
            "out": ("kotoba-mcd.apkg", "kotoba-mcd.tsv", "study-mcd.html")},
}
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


# ------------------------------------------------------------------ MCD (massive-context cloze)
_KANJI_DB: dict | None = None
RENDAKU = {"か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご", "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
           "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど", "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ"}
SMALL = set("ゃゅょぁぃぅぇぉっー")
HANDAKU = {"は": "ぱ", "ひ": "ぴ", "ふ": "ぷ", "へ": "ぺ", "ほ": "ぽ"}


def _readings(ch: str) -> list[str]:
    global _KANJI_DB
    if _KANJI_DB is None:
        _KANJI_DB = json.loads((CORRIDOR / "data" / "share_alike" / "kanji.json").read_text("utf-8"))["kanji"]
    k = _KANJI_DB.get(ch, {})
    base = {kata_to_hira(r) for r in k.get("on", [])} | {r.split(".")[0].strip("-") for r in k.get("kun", [])}
    out = set()
    for r in base:
        if not r:
            continue
        out.add(r)
        if r[0] in RENDAKU:
            out.add(RENDAKU[r[0]] + r[1:])
        if r[0] in HANDAKU:
            out.add(HANDAKU[r[0]] + r[1:])
        if len(r) > 1 and r[-1] in "つくちき":
            out.add(r[:-1] + "っ")
    return sorted(out, key=len, reverse=True)


def align(form: str, reading: str, _deep: bool = True) -> list[tuple[str, str]] | None:
    """財政/ざいせい → [(財, ざい), (政, せい)]; 覆う/おおう → [(覆, おお), (う, '')]"""
    if not form:
        return [] if not reading else None
    ch = form[0]
    if not KANJI.match(ch):
        if reading.startswith(kata_to_hira(ch)):
            rest = align(form[1:], reading[1:], _deep)
            return None if rest is None else [(ch, "")] + rest
        return None
    if len(form) == 1:
        if not reading or reading[0] in SMALL:
            return None
        known = _readings(ch)
        if known and reading not in known:
            return None  # a known kanji must end on one of its readings
        if not known and not _deep:
            return None  # two unknown kanji in a row: the split would be a guess
        return [(ch, reading)]
    for r in _readings(ch):
        if reading.startswith(r) and len(r) < len(reading):
            rest = align(form[1:], reading[len(r):], _deep)
            if rest is not None:
                return [(ch, r)] + rest
    if not _deep or _readings(ch):
        return None  # only a kanji the table has no readings for may be guessed
    # a kanji the table does not know (or reads unusually): try every short split,
    # accepting it only when the rest of the word aligns by the table
    for k in range(1, min(4, len(reading) - 1) + 1):
        if reading[k] in SMALL:
            continue
        rest = align(form[1:], reading[k:], _deep=False)
        if rest is not None:
            return [(ch, reading[:k])] + rest
    return None


def mcd_cards(wid: str, c: dict, passages: list[dict], tagger, bc) -> list[dict]:
    """per passage: one card blanking the whole word (hint: its Japanese definition),
    then (first passage only) one card per kanji, blanked with its reading as the hint."""
    cards = []
    for pi, p in enumerate(passages, 1):
        ruby = _ordered_for({"ja": p["ja"], "form": p["form"]}, c, tagger, bc)
        if "".join(seg[0] for seg in ruby) != p["ja"]:
            raise SystemExit(f"{wid} passage {pi}: ruby does not spell the passage")
        src = {k: p[k] for k in ("site", "url", "licence") if p.get(k)}
        base = {"ja": p["ja"], "form": p["form"], "en": p["en"], "kind": p["kind"], "src": src, "passage": pi}
        cards.append({**base, "type": "word", "ruby": ruby})
        ti = next(i for i, seg in enumerate(ruby) if len(seg) > 2)
        parts = align(p["form"], ruby[ti][1])
        kanji_parts = [i for i, (t, _) in enumerate(parts or []) if KANJI.match(t)]
        if pi > 1 or (len(kanji_parts) < 2 and not (parts and kanji_parts and len(parts) > 1)):
            continue  # 字 cards come from the first passage only; a lone kanji is the word card
        for k in kanji_parts:
            segs = [[t, r, 1 if i == k else 2] for i, (t, r) in enumerate(parts)]
            cards.append({**base, "type": "kanji", "hint": parts[k][1], "ruby": ruby[:ti] + segs + ruby[ti + 1:]})
    for i, card in enumerate(cards, 1):
        card["lv"] = i
        card["id"] = f"{wid}-m{i:02d}"
    return cards


METHOD = [
    "このデッキは AJATT の MCD（Massive-Context Cloze Deletion）方式です。",
    "表：ニュース・ウィキペディア・文学から取った本物の文章と、このデッキのために書いた文章（2〜4文）。穴はひとつだけ。",
    "「語」カード：単語まるごとが穴。下の日本語の説明と文脈から思い出す。",
    "「字」カード：単語の漢字ひとつが穴。〔 〕の読みを手がかりに、その字を思い出す（最初の文章で）。",
    "ひとつの文章から何枚もカードができる（1枚に未知はひとつ）。慣れたら次の文章が開き、同じ言葉に別の文脈で出会う。",
    "裏：ふりがな付きの全文、読み、意味。英訳はタップで。出典つき。",
    "判定は「もう一度／覚えた」の二択で十分（FSRS-6）。迷ったら「もう一度」。",
]


# ------------------------------------------------------------------ deck
# a radical and its compressed form (手/扌, 攴/攵 …) count as one part
RADICAL_TWINS = {"手": "扌", "攴": "攵", "襾": "覀", "人": "亻", "水": "氵", "心": "忄", "火": "灬", "刀": "刂", "犬": "犭",
                 "示": "礻", "衣": "衤", "艸": "艹", "辵": "辶", "言": "訁", "食": "飠", "糸": "糹", "玉": "王", "老": "耂", "网": "罒"}


def kanji_anatomy(term: str) -> list[dict]:
    """each kanji of the word: meaning, up to three parts, stroke count (for the visual back)"""
    _readings("一")  # loads the table
    out = []
    for ch in dict.fromkeys(ch for ch in term if KANJI.match(ch) and ch not in "々〆ヵヶ"):
        k = _KANJI_DB.get(ch)
        if k:
            # the table lists parts flattened (貝, then 貝's own 目 and 八): keep only top-level ones
            kept: list[str] = []
            for x in k.get("parts", []):
                twin = RADICAL_TWINS.get(x) or next((k for k, v in RADICAL_TWINS.items() if v == x), None)
                if x != ch and twin not in kept and not any(x in _KANJI_DB.get(y, {}).get("parts", []) for y in kept):
                    kept.append(x)
            parts = kept[:3]
            out.append({"c": ch, "m": (k.get("m") or "").lower(), "parts": parts, "st": k.get("st")})
    return out


def build_deck(mods: list[dict], kind: str = "mcd") -> dict:
    spec = DECKS[kind]
    import build_corridor as bc
    from corpus.grading._mecab import get_tagger

    tagger = get_tagger()
    mcd_path = SRC / "mcd.json"
    mcd = json.loads(mcd_path.read_text("utf-8")) if mcd_path.exists() and kind == "mcd" else {}
    preview = "--preview" in sys.argv
    words = []
    for m in mods:
        for c in m["cards"]:
            wid = f"km-{c['n']:03d}"
            if preview and str(c["n"]) not in mcd:
                continue
            cards = []
            if str(c["n"]) in mcd:
                cards = mcd_cards(wid, c, mcd[str(c["n"])], tagger, bc)
            for s in [] if cards else c["sentences"]:
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
                "kanji": kanji_anatomy(c["term"]),
                "cards": cards,
            }
            if c.get("tip"):
                word["tip"] = c["tip"]
            words.append(word)
    return {
        "format": "bunki-cloze-deck",
        "version": 1,
        "id": spec["id"],
        "titleJa": spec["titleJa"],
        "titleEn": spec["titleEn"],
        "defaults": spec["defaults"],
        "groups": [{"id": m["id"], "titleJa": GROUPS[m["id"]][0], "titleEn": GROUPS[m["id"]][1]} for m in mods
                   if any(w["group"] == m["id"] for w in words)],
        **({"unlockDays": spec["unlockDays"]} if "unlockDays" in spec else {}),
        "method": spec.get("method", METHOD),
        "words": words,
        "provenance": "Sentences are real Japanese mined from the web, Tatoeba (CC BY 2.0 FR), ja.wikinews and Aozora Bunko; each card names its source. Web sentences are short quotations kept for personal study. Definitions, notes and the few sentences marked 書き下ろし were written for this word list.",
    }


def _cover(ja: str, tokens: list[dict]) -> list[dict]:
    """put back any characters the tokeniser skipped (spaces, odd symbols) as plain tokens"""
    out, pos = [], 0
    for t in tokens:
        i = ja.find(t["s"], pos)
        if i < 0:
            continue
        if i > pos:
            out.append({"s": ja[pos:i], "r": "", "f": [{"t": ja[pos:i]}]})
        out.append(t)
        pos = i + len(t["s"])
    if pos < len(ja):
        out.append({"s": ja[pos:], "r": "", "f": [{"t": ja[pos:]}]})
    return out


def _ordered_for(s: dict, c: dict, tagger, bc) -> list[list]:
    ja, form = s["ja"], s["form"]
    a = ja.index(form)
    b = a + len(form)
    tokens = _cover(ja, bc.tokenise(ja, tagger))
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
                # a kanji token cut by the form (稽 in 滑稽): split the token's reading per kanji
                split = align(t["s"], r)
                if split:
                    parts.append("".join(pr for pi, (_, pr) in enumerate(split) if s0 + pi >= lo and s0 + pi < hi))
                else:
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
    """the passage with its one gap (a 字 card's gap shows the kanji's reading)"""
    out = []
    for seg in card["ruby"]:
        if len(seg) > 2 and seg[2] == 1:
            out.append(f'<span class="blank">{"〔" + html.escape(card["hint"]) + "〕" if card.get("hint") else "［　　］"}</span>')
        elif len(seg) > 2:
            out.append(f"<b>{html.escape(seg[0])}</b>")
        else:
            out.append(html.escape(seg[0]))
    return "".join(out)


FIELDS = ["Key", "Sort", "Topic", "Level", "Type", "Hint", "Kind", "Word", "Reading", "Meaning", "DefJA", "SentenceFront", "SentenceBlank", "SentenceFurigana", "SentenceEN", "Tip", "Source", "SourceURL", "POS", "Kanji"]


POS_KEY = {"noun": "noun", "verb": "verb", "い-adjective": "adj", "な-adjective": "adj", "adverb": "adv",
           "expression": "expr", "sound word": "sound", "kanji": "noun"}


def note_rows(deck: dict) -> list[dict]:
    rows = []
    groups = {g["id"]: g for g in deck["groups"]}
    for wi, w in enumerate(deck["words"]):
        for card in w["cards"]:
            rows.append({
                "Key": card["id"],
                # every word's best sentence first (in mining order), then second sentences …:
                # a word comes back in a new sentence weeks later, never twice at once
                "Sort": f"{card['lv']:02d}-{wi:04d}",
                "Topic": groups[w["group"]]["titleJa"],
                "Level": str(card["lv"]),
                "Word": html.escape(w["term"]),
                "Reading": html.escape(w["reading"]),
                "Meaning": html.escape(w["meaning"]),
                "DefJA": html.escape(w["defJa"]),
                "Type": "字" if card.get("type") == "kanji" else "語",
                "Hint": "" if card.get("type") == "kanji" else html.escape(w["defJa"]),
                "Kind": card["kind"],
                "SentenceFront": front_html(card),
                "SentenceBlank": blank_html(card),
                "Source": html.escape(card.get("src", {}).get("site") or KIND_JA.get(card["kind"], "")),
                "SourceURL": html.escape(card.get("src", {}).get("url", "")),
                "SentenceFurigana": anki_furigana(card["ruby"]),
                "SentenceEN": html.escape(card["en"]),
                "Tip": html.escape(w.get("tip", "")),
                "POS": POS_KEY.get(w["pos"], "noun"),
                "Kanji": "".join(
                    f'<div class="kj"><b>{k["c"]}</b><span>{html.escape(k["m"])}</span><small>{" ".join(k["parts"])}{" · " + str(k["st"]) + "画" if k.get("st") else ""}</small></div>'
                    for k in w.get("kanji", [])),
                "_group": w["group"],
            })
    rows.sort(key=lambda r: r["Sort"])
    return rows


def stable_id(s: str) -> int:
    return int(hashlib.sha1(s.encode()).hexdigest()[:12], 16) % (1 << 31) + (1 << 30)


def build_anki(deck: dict, spec: dict) -> None:
    import genanki

    tdir_name, model_key, model_name, card_name, deck_key = spec["anki"]
    tdir = HERE / tdir_name
    model = genanki.Model(
        stable_id(model_key),
        model_name,
        fields=[{"name": f} for f in FIELDS],
        templates=[{
            "name": card_name,
            "qfmt": (tdir / "front.html").read_text("utf-8"),
            "afmt": (tdir / "back.html").read_text("utf-8"),
        }],
        css=(tdir / "style.css").read_text("utf-8"),
        sort_field_index=1,
    )

    class Note(genanki.Note):
        @property
        def guid(self):
            return genanki.guid_for(self.fields[0], deck["id"])

    root = f"{deck['titleJa']} Kotoba Mine"
    decks = {}
    for g in deck["groups"]:
        d = genanki.Deck(stable_id(f"{deck_key}-{g['id']}"), f"{root}::{g['titleJa']}")
        d.description = html.escape(g["titleEn"])
        decks[g["id"]] = d
    for i, r in enumerate(note_rows(deck)):
        note = Note(model=model, fields=[r[f] for f in FIELDS], tags=[deck["id"], f"card{r['Level']}", f"source::{r['Kind']}", f"topic::{r['_group']}"], sort_field=r["Sort"], due=i)
        decks[r["_group"]].add_note(note)
    genanki.Package(list(decks.values())).write_to_file(str(RELEASE / spec["out"][0]))


def build_tsv(deck: dict, spec: dict) -> None:
    lines = ["#separator:tab", "#html:true", f"#columns:{chr(9).join(FIELDS)}\tTags"]
    for r in note_rows(deck):
        lines.append("\t".join([*(r[f].replace("\t", " ") for f in FIELDS), f"{deck['id']} card{r['Level']} source::{r['Kind']}"]))
    (RELEASE / spec["out"][1]).write_text("\n".join(lines) + "\n", "utf-8")


# ------------------------------------------------------------------ study.html
def build_study(deck: dict, out: Path | None = None) -> None:
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
    (out or RELEASE / "study.html").write_text(page, "utf-8")


def main() -> int:
    mods = load()
    if "--preview" in sys.argv:
        deck = build_deck(mods, "mcd")
        out = Path(sys.argv[sys.argv.index("--preview") + 1])
        build_study(deck, out)
        print(f"· preview: {len(deck['words'])} words, {sum(len(w['cards']) for w in deck['words'])} cards → {out}")
        return 0
    RELEASE.mkdir(exist_ok=True)
    for kind, spec in DECKS.items():
        deck = build_deck(mods, kind)
        path = CORRIDOR / "decks" / spec["id"] / "deck.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(deck, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
        build_tsv(deck, spec)
        build_anki(deck, spec)
        build_study(deck, RELEASE / spec["out"][2])
        n = sum(len(w["cards"]) for w in deck["words"])
        print(f"· {deck['titleJa']}: {len(deck['words'])} words, {n} cards → {path.relative_to(REPO)}; release/{', '.join(spec['out'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
