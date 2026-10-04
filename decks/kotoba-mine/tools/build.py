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
source/readings.json then corrects the readings the tokeniser gets wrong in
these passages (人 in 日本人, 一日 as a whole day …); a rule that matches
nothing fails the build.

Card IDs (and so Anki GUIDs, which are derived from them) come from the committed
manifest source/ids.json, keyed by word, passage text and card kind, never from a
card's position. `lv` is display order only. A card key the manifest has not seen
gets the next free number for its word and is appended; an id whose key is no
longer produced moves to "reserved" and is never handed out again.

Run from the repo root:  python3 decks/kotoba-mine/tools/build.py
Needs: pip install fugashi unidic-lite==1.0.8 genanki

Flags
  --frozen        never write ids.json; fail, naming the key, if a card has no id
  --out <dir>     write only <dir>/<deck id>/deck.json for both decks (no apkg/tsv/html)
  --mcd <path>    read the MCD passages from <path> instead of source/mcd.json
  --ids <path>    read (and update) this manifest instead of source/ids.json
  --preview <f>   write a study page of the MCD deck to <f>; ids.json is not written
  --profile private|public
                  private (default): the learner's own study build, today's paths
                  (prototypes/corridor/decks/<id>/deck.json, release/*). public: the
                  build that may be shared; cards whose source tools/rights.py does not
                  allow are left out after ids are assigned (ids never move), and words
                  left with no card are dropped. Writes release/public/deck-<id>.json,
                  apkg, tsv and study page; never writes ids.json.

Both profiles set every source label from source/rights.json (tools/rights.py relabel)
and write ATTRIBUTION-<deck id>.md beside their outputs: every source not written for
the deck, grouped by site, with licence, author/translator, URLs and passage count.
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


def _arg(flag: str) -> str | None:
    """the value after `flag` on the command line, if the flag is there"""
    if flag not in sys.argv:
        return None
    i = sys.argv.index(flag)
    if i + 1 >= len(sys.argv):
        raise SystemExit(f"{flag} needs a value")
    return sys.argv[i + 1]


FROZEN = "--frozen" in sys.argv
MCD_PATH = Path(_arg("--mcd") or SRC / "mcd.json")
IDS_PATH = Path(_arg("--ids") or SRC / "ids.json")
PROFILE = _arg("--profile") or "private"

sys.path.insert(0, str(HERE))
sys.path.insert(0, str(CORRIDOR / "tools"))
sys.path.insert(0, str(REPO))
import check_v2  # noqa: E402
import rights  # noqa: E402

if PROFILE not in rights.PROFILES:
    raise SystemExit(f"--profile must be one of {', '.join(rights.PROFILES)}, not {PROFILE!r}")

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


SRC_KEYS = ("site", "url", "licence", "author", "translator")


def source(record: dict) -> dict:
    """a card's src: the record's site, url and licence with rights.json applied"""
    r = rights.relabel(record)
    return {k: r[k] for k in SRC_KEYS if r.get(k)}


def with_mined(card: dict, picks: list[dict] | None) -> dict:
    """real sentences when mining found any; otherwise the best written one, labelled as such"""
    if picks:
        sentences = [
            {"lv": i + 1, "ja": p["ja"], "form": p["form"], "en": p.get("en", ""), "kind": p["kind"],
             "src": source(p)}
            for i, p in enumerate(picks)
        ]
    else:
        s0 = card["sentences"][0]
        sentences = [{**s0, "lv": 1, "kind": "original", "src": {"site": "書き下ろし（このデッキ用）"}}]
    return {**card, "sentences": sentences}


# ------------------------------------------------------------------ card identity
def passage_hash(ja: str) -> str:
    return hashlib.sha1(ja.encode("utf-8")).hexdigest()[:12]


def word_key(wid: str, ja: str) -> str:
    """an MCD 語 card: the whole word blanked in this passage"""
    return f"{wid}|word|{passage_hash(ja)}"


def kanji_key(wid: str, ja: str, k: int) -> str:
    """an MCD 字 card: kanji k (its index in the word's aligned parts) blanked in this passage"""
    return f"{wid}|kanji|{passage_hash(ja)}|{k}"


def sentence_key(wid: str, ja: str) -> str:
    """a 文 card: this sentence with the word marked"""
    return f"{wid}|sentence|{passage_hash(ja)}"


def card_key(wid: str, card: dict) -> str:
    """the key of a card as it appears in a built deck.json (used by freeze_ids.py)"""
    if card.get("type") == "word":
        return word_key(wid, card["ja"])
    if card.get("type") == "kanji":
        parts = [seg for seg in card["ruby"] if len(seg) > 2]
        return kanji_key(wid, card["ja"], next(i for i, seg in enumerate(parts) if seg[2] == 1))
    return sentence_key(wid, card["ja"])


class IdManifest:
    """source/ids.json: {deck id: {card key: card id}, "reserved": {deck id: [{key, id}]}}"""

    def __init__(self, path: Path, frozen: bool):
        self.path, self.frozen = path, frozen
        if not path.exists():
            raise SystemExit(f"{path} is missing: card ids come from it (see tools/freeze_ids.py)")
        self.data = json.loads(path.read_text("utf-8"))
        self.emitted: dict[str, set[str]] = {}
        self.changed = False

    def assign(self, deck: str, key: str, wid: str, sentence: bool) -> str:
        ids = self.data.setdefault(deck, {})
        seen = self.emitted.setdefault(deck, set())
        if key in seen:
            raise SystemExit(f"two cards share the key {key!r} in {deck}: a passage is listed twice")
        seen.add(key)
        if key in ids:
            return ids[key]
        if self.frozen:
            raise SystemExit(f"--frozen: {self.path.name} has no id for card key {key!r} ({deck}); "
                             "build without --frozen to assign one")
        pattern = re.compile(rf"{re.escape(wid)}-(\d+)$" if sentence else rf"{re.escape(wid)}-m(\d+)$")
        used = [*ids.values(), *(r["id"] for r in self.data.setdefault("reserved", {}).get(deck, []))]
        n = max((int(m.group(1)) for i in used if (m := pattern.match(i))), default=0) + 1
        ids[key] = f"{wid}-{n}" if sentence else f"{wid}-m{n:02d}"
        self.changed = True
        print(f"· new card id {ids[key]} for {key} ({deck})")
        return ids[key]

    def known(self, deck: str) -> dict[str, str]:
        """key → id for every id the deck has handed out, active or reserved"""
        reserved = {r["key"]: r["id"] for r in self.data.get("reserved", {}).get(deck, [])}
        return {**reserved, **self.data.get(deck, {})}

    def retire_unseen(self, deck: str) -> None:
        """ids whose key this build no longer produces are reserved, never reused"""
        ids = self.data.get(deck, {})
        gone = [k for k in ids if k not in self.emitted.get(deck, set())]
        for key in gone:
            if self.frozen:
                print(f"! --frozen: {ids[key]} ({key}) is no longer built; a build without --frozen reserves it")
                continue
            self.data.setdefault("reserved", {}).setdefault(deck, []).append({"key": key, "id": ids.pop(key)})
            self.changed = True
            print(f"· card id retired: {key} ({deck})")

    def save(self) -> None:
        if self.changed and not self.frozen:
            self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=2) + "\n", "utf-8")


# ------------------------------------------------------------------ ruby
def _ordered(ja, tokens, marks):
    """the tokens as ruby segments, each mark (a, b, reading, marker) cut out of its
    token(s) as one segment [ja[a:b], reading, marker]; marks are in order, never overlapping"""
    spans, pos = [], 0
    for t in tokens:
        spans.append((pos, pos + len(t["s"])))
        pos += len(t["s"])
    # the run of whole tokens each mark touches; marks whose runs share a token form one cluster
    clusters: list[list] = []  # [run start, run end, [marks]]
    for m in marks:
        touched = [x for x in spans if x[1] > m[0] and x[0] < m[1]]
        ts, te = touched[0][0], touched[-1][1]
        if clusters and ts < clusters[-1][1]:
            clusters[-1][1] = max(clusters[-1][1], te)
            clusters[-1][2].append(m)
        else:
            clusters.append([ts, te, [m]])
    segs: list[list] = []
    ci = 0
    for t, (s, e) in zip(tokens, spans):
        if ci < len(clusters) and s >= clusters[ci][0]:
            cs, ce, inside = clusters[ci]
            if e < ce:
                continue  # emitted with the cluster's last token
            at = cs
            for a, b, reading, marker in inside:
                segs.extend(_piece_segs(ja, at, a, tokens, spans))
                segs.append([ja[a:b], reading, marker])
                at = b
            segs.extend(_piece_segs(ja, at, ce, tokens, spans))
            ci += 1
            continue
        segs.extend(_token_segs(t))
    # merge neighbouring plain segments
    merged: list[list] = []
    for seg in segs:
        if merged and len(seg) == 2 and len(merged[-1]) == 2 and not seg[1] and not merged[-1][1]:
            merged[-1][0] += seg[0]
        else:
            merged.append(seg)
    return merged


def _piece_segs(ja, lo, hi, tokens, spans) -> list[list]:
    """ja[lo:hi], text left beside a mark inside its tokens: a whole token keeps its
    readings, a cut kanji token keeps the readings the kanji table aligns, else none"""
    out: list[list] = []
    for t, (s, e) in zip(tokens, spans):
        a, b = max(s, lo), min(e, hi)
        if a >= b:
            continue
        if (a, b) == (s, e):
            out.extend(_token_segs(t))
            continue
        split = align(t["s"], kata_to_hira(t["r"] or t["s"])) if KANJI.search(ja[a:b]) else None
        if split:
            out.extend([ch, r if KANJI.match(ch) else ""] for ch, r in split[a - s : b - s])
        else:
            out.append([ja[a:b], ""])
    return out


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


def align(form: str, reading: str, _whole: bool = True) -> list[tuple[str, str]] | None:
    """財政/ざいせい → [(財, ざい), (政, せい)]; 覆う/おおう → [(覆, おお), (う, '')].
    Every kanji must take one of the readings the kanji table gives it; a kanji the
    table does not know is aligned only when it is the whole form."""
    if not form:
        return [] if not reading else None
    ch = form[0]
    if not KANJI.match(ch):
        if reading.startswith(kata_to_hira(ch)):
            rest = align(form[1:], reading[1:], False)
            return None if rest is None else [(ch, "")] + rest
        return None
    if len(form) == 1:
        if not reading or reading[0] in SMALL:
            return None
        known = _readings(ch)
        if known and reading not in known:
            return None  # a known kanji must end on one of its readings
        if not known and not _whole:
            return None  # an unknown kanji would take whatever reading is left: a guess
        return [(ch, reading)]
    for r in _readings(ch):
        if reading.startswith(r) and len(r) < len(reading):
            rest = align(form[1:], reading[len(r):], False)
            if rest is not None:
                return [(ch, r)] + rest
    return None  # a reading the table cannot split is never guessed (讃岐 is not 讃=さぬ)


# 字 cards the build leaves out, reported at the end: [card id or key] and [(word, term, ids)]
KANJI_VISIBLE: list[str] = []
KANJI_UNALIGNED: list[tuple[str, str, list[str]]] = []


def mcd_cards(wid: str, c: dict, passages: list[dict], tagger, bc, ids: IdManifest) -> list[dict]:
    """per passage: one card blanking the whole word (hint: its Japanese definition),
    then (first passage only) one card per kanji, blanked with its reading as the hint.
    A 字 card is left out when its kanji can be read elsewhere in the passage, and no 字
    card is made when the kanji table cannot split the word's reading.
    Ids come from the manifest by key; lv is the card's position (display order only)."""
    cards, keys = [], []
    for pi, p in enumerate(passages, 1):
        ruby = _ordered_for({"ja": p["ja"], "form": p["form"]}, c, tagger, bc)
        if "".join(seg[0] for seg in ruby) != p["ja"]:
            raise SystemExit(f"{wid} passage {pi}: ruby does not spell the passage")
        src = source(p)
        base = {"ja": p["ja"], "form": p["form"], "en": p["en"], "kind": p["kind"], "src": src, "passage": pi}
        cards.append({**base, "type": "word", "ruby": ruby})
        keys.append(word_key(wid, p["ja"]))
        ti = next(i for i, seg in enumerate(ruby) if len(seg) > 2)
        parts = align(p["form"], ruby[ti][1])
        if pi == 1 and parts is None:
            known = ids.known("kotoba-mcd")
            lost = [v for k, v in known.items() if k.startswith(f"{wid}|kanji|{passage_hash(p['ja'])}|")]
            if lost:
                KANJI_UNALIGNED.append((wid, c["term"], sorted(lost)))
        kanji_parts = [i for i, (t, _) in enumerate(parts or []) if KANJI.match(t)]
        if pi > 1 or (len(kanji_parts) < 2 and not (parts and kanji_parts and len(parts) > 1)):
            continue  # 字 cards come from the first passage only; a lone kanji is the word card
        start = sum(len(seg[0]) for seg in ruby[:ti])
        for k in kanji_parts:
            at = start + k
            if p["ja"][at] in p["ja"][:at] + p["ja"][at + 1:]:
                key = kanji_key(wid, p["ja"], k)
                KANJI_VISIBLE.append(ids.known("kotoba-mcd").get(key, key))
                continue  # the blanked kanji is printed elsewhere in the passage: the card answers itself
            segs = [[t, r, 1 if i == k else 2] for i, (t, r) in enumerate(parts)]
            cards.append({**base, "type": "kanji", "hint": parts[k][1], "ruby": ruby[:ti] + segs + ruby[ti + 1:]})
            keys.append(kanji_key(wid, p["ja"], k))
    for i, (card, key) in enumerate(zip(cards, keys), 1):
        card["lv"] = i
        card["id"] = ids.assign("kotoba-mcd", key, wid, sentence=False)
    return cards


METHOD = [
    "このデッキは AJATT の MCD（Massive-Context Cloze Deletion）方式です。",
    "表：ニュース・ウィキペディア・文学から取った本物の文章と、このデッキのために書いた文章（2〜4文）。穴はひとつの言葉だけ（同じ言葉が二度出てくる文章では、両方とも空欄）。",
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


def build_deck(mods: list[dict], ids: IdManifest, kind: str = "mcd") -> dict:
    spec = DECKS[kind]
    import build_corridor as bc
    from corpus.grading._mecab import get_tagger

    tagger = get_tagger()
    mcd = json.loads(MCD_PATH.read_text("utf-8")) if MCD_PATH.exists() and kind == "mcd" else {}
    preview = "--preview" in sys.argv
    words = []
    for m in mods:
        for c in m["cards"]:
            wid = f"km-{c['n']:03d}"
            if preview and str(c["n"]) not in mcd:
                continue
            cards = []
            if str(c["n"]) in mcd:
                cards = mcd_cards(wid, c, mcd[str(c["n"])], tagger, bc, ids)
            for s in [] if cards else c["sentences"]:
                ruby = _ordered_for(s, c, tagger, bc)
                if "".join(seg[0] for seg in ruby) != s["ja"]:
                    raise SystemExit(f"{wid} lv{s['lv']}: ruby does not spell the sentence")
                card_id = ids.assign(spec["id"], sentence_key(wid, s["ja"]), wid, sentence=True)
                card = {"id": card_id, "lv": s["lv"], "ja": s["ja"], "form": s["form"], "en": s["en"], "ruby": ruby, "kind": s["kind"]}
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


def hint_warnings(decks: list[dict]) -> list[str]:
    """words whose definition or meaning names the answer: the term, a form a card blanks,
    or the whole reading. A warning, not a gate: how much the hint may give is the learner's call."""
    forms: dict[str, set[str]] = {}
    words: dict[str, dict] = {}
    for deck in decks:
        for w in deck["words"]:
            words.setdefault(w["id"], w)
            forms.setdefault(w["id"], set()).update(card["form"] for card in w["cards"])
    out = []
    for wid, w in words.items():
        reading = kata_to_hira(w["reading"])
        for field in ("defJa", "meaning"):
            text = w[field]
            hits = sorted({x for x in (w["term"], *forms[wid]) if x and x in text})
            if reading and reading in kata_to_hira(text):
                hits.append(reading)
            if hits:
                out.append(f"{wid} {w['term']} {field}: {'、'.join(hits)} in 「{text}」")
    return out


# ------------------------------------------------------------------ deck reading rules (F17)
_RULES: list[dict] | None = None
RULE_HITS: dict[int, int] = {}  # rule index → matches it was applied to
RULE_LOG: list[str] = []  # matches a rule could not apply


def reading_rules() -> list[dict]:
    """source/readings.json, each rule compiled; `cards` become the passage hashes they are built from"""
    global _RULES
    if _RULES is None:
        ids = json.loads(IDS_PATH.read_text("utf-8"))
        by_id: dict[str, str] = {}
        for deck in (spec["id"] for spec in DECKS.values()):
            for key, cid in ids.get(deck, {}).items():
                by_id[cid] = key
            for r in ids.get("reserved", {}).get(deck, []):
                by_id[r["id"]] = r["key"]
        _RULES = []
        for i, rule in enumerate(json.loads((SRC / "readings.json").read_text("utf-8"))["rules"]):
            unknown = [cid for cid in rule.get("cards", []) if cid not in by_id]
            if unknown:
                raise SystemExit(f"readings.json rule {i} ({rule['surface']}): no card {', '.join(unknown)} in {IDS_PATH.name}")
            if not re.fullmatch(r"[ぁ-ゖー]+", rule["reading"]):
                raise SystemExit(f"readings.json rule {i} ({rule['surface']}): the reading must be hiragana")
            _RULES.append({**rule, "i": i,
                           "after_re": re.compile(f"(?:{rule.get('after') or ''})$"),
                           "before_re": re.compile(rule.get("before") or ""),
                           "hashes": {by_id[cid].split("|")[2] for cid in rule.get("cards", [])},
                           "split": align(rule["surface"], rule["reading"])})
    return _RULES


def apply_reading_rules(ja: str, tokens: list[dict], bc) -> list[dict]:
    """set the readings source/readings.json gives, on the tokens they cover. A token wider
    than the rule's surface keeps its own reading outside it (split with align()); when
    either reading cannot be split, the match is left as the tokeniser read it and logged."""
    spans, pos = [], 0
    for t in tokens:
        i = ja.find(t["s"], pos)
        spans.append((i, i + len(t["s"])) if i >= 0 else None)
        if i >= 0:
            pos = i + len(t["s"])
    h = passage_hash(ja)
    for rule in reading_rules():
        if rule["hashes"] and h not in rule["hashes"]:
            continue
        surface, split = rule["surface"], rule["split"]
        for a in _occurrences(ja, surface):
            b = a + len(surface)
            if not rule["after_re"].search(ja[:a]) or not rule["before_re"].match(ja[b:]):
                continue
            touched = [(t, s, e) for t, x in zip(tokens, spans) if x and x[1] > a and x[0] < b for s, e in [x]]
            new: list[tuple[dict, str]] = []
            for t, s, e in touched:
                if (s, e) == (a, b):
                    new.append((t, rule["reading"]))
                    continue
                own = align(t["s"], kata_to_hira(t["r"] or t["s"])) if (s < a or e > b) else None
                if split is None or ((s < a or e > b) and own is None):
                    RULE_LOG.append(f"{surface}→{rule['reading']} in 「{ja[max(0, a - 6):b + 4]}」: token {t['s']}({t['r']}) cannot be split; left as read")
                    new = []
                    break
                r = "".join(split[k - a][1] or kata_to_hira(split[k - a][0]) if a <= k < b else own[k - s][1] or kata_to_hira(own[k - s][0])
                            for k in range(s, e))
                new.append((t, r))
            for t, r in new:
                if t["r"] != r:
                    t["r"], t["f"], t["rs"] = r, bc.furigana_pairs(t["s"], r), "deck-readings"
            if new:
                RULE_HITS[rule["i"]] = RULE_HITS.get(rule["i"], 0) + 1
    return tokens


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


def _occurrences(ja: str, form: str) -> list[int]:
    """where each non-overlapping occurrence of form starts in ja"""
    out, at = [], ja.find(form)
    while at >= 0:
        out.append(at)
        at = ja.find(form, at + len(form))
    return out


def _ordered_for(s: dict, c: dict, tagger, bc) -> list[list]:
    """the sentence as ruby segments. The first occurrence of the form is the target
    (marker 1); every further one is marker 3, so no card shows its own answer."""
    ja, form = s["ja"], s["form"]
    tokens = _cover(ja, apply_reading_rules(ja, bc.tokenise(ja, tagger), bc))
    marks = []
    for n, a in enumerate(_occurrences(ja, form)):
        b = a + len(form)
        marks.append((a, b, _form_reading(ja, tokens, a, b, c, form), 1 if n == 0 else 3))
    if not marks:
        raise ValueError(f"{form!r} is not in {ja!r}")
    return _ordered(ja, tokens, marks)


def _form_reading(ja: str, tokens: list[dict], a: int, b: int, c: dict, form: str) -> str:
    """the reading of ja[a:b] (the form), in hiragana"""
    reading = target_reading(c, form)
    if reading is None:
        pos = 0
        spans = []
        for t in tokens:
            spans.append((pos, pos + len(t["s"]), t))
            pos += len(t["s"])
        touched = [x for x in spans if x[1] > a and x[0] < b]
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
    return kata_to_hira(reading)


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
    """the passage with its gap (a 字 card's gap shows the kanji's reading); a repeat of
    the word (marker 3) is blanked too, without a hint, so the front never shows the answer"""
    out = []
    for seg in card["ruby"]:
        if len(seg) > 2 and seg[2] == 1:
            out.append(f'<span class="blank">{"〔" + html.escape(card["hint"]) + "〕" if card.get("hint") else "［　　］"}</span>')
        elif len(seg) > 2 and seg[2] == 3:
            out.append('<span class="blank">［　　］</span>')
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


def build_anki(deck: dict, spec: dict, out_dir: Path = RELEASE) -> None:
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
    genanki.Package(list(decks.values())).write_to_file(str(out_dir / spec["out"][0]))


def build_tsv(deck: dict, spec: dict, out_dir: Path = RELEASE) -> None:
    lines = ["#separator:tab", "#html:true", f"#columns:{chr(9).join(FIELDS)}\tTags"]
    for r in note_rows(deck):
        lines.append("\t".join([*(r[f].replace("\t", " ") for f in FIELDS), f"{deck['id']} card{r['Level']} source::{r['Kind']}"]))
    (out_dir / spec["out"][1]).write_text("\n".join(lines) + "\n", "utf-8")


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


# ------------------------------------------------------------------ profiles and attribution
PUBLIC_REASONS = ("livedoor ND", "web quotation", "social domain", "restricted Aozora", "unverified Aozora", "no URL")
PUBLIC_PROVENANCE = ("Passages are written for this deck (書き下ろし) or quoted from sources whose licence allows sharing: "
                     "Tatoeba (CC BY 2.0 FR) and Aozora Bunko works under Creative Commons licences that allow changes. "
                     "Each card names its source; ATTRIBUTION-<deck id>.md lists every source with its licence, author and link. "
                     "Definitions, notes and the 書き下ろし passages were written for this word list.")


def public_deck(deck: dict) -> tuple[dict, dict]:
    """the deck without the cards rights.allowed() keeps out of the public profile; ids are
    the ones the full build assigned. Returns (deck, report)."""
    reasons: dict[str, dict[str, set | int]] = {}
    words, dropped = [], []
    for w in deck["words"]:
        kept = []
        for card in w["cards"]:
            record = {**card.get("src", {}), "kind": card["kind"]}
            if rights.allowed(record, "public"):
                kept.append(card)
                continue
            r = reasons.setdefault(rights.exclusion(record), {"cards": 0, "passages": set()})
            r["cards"] += 1
            r["passages"].add((w["id"], card["ja"]))
        if kept:
            words.append({**w, "cards": kept})
        else:
            dropped.append(w["id"])
    groups = [g for g in deck["groups"] if any(w["group"] == g["id"] for w in words)]
    out = {**deck, "groups": groups, "words": words, "provenance": PUBLIC_PROVENANCE}
    report = {"reasons": {k: (v["cards"], len(v["passages"])) for k, v in reasons.items()}, "dropped": dropped,
              "cards": (sum(len(w["cards"]) for w in words), sum(len(w["cards"]) for w in deck["words"]))}
    return out, report


def attribution_md(deck: dict, profile: str) -> str:
    """every source not written for the deck, grouped by site: licence, author/translator,
    URLs (or "no URL recorded") and how many passages come from it"""
    sites: dict[str, dict[tuple, dict]] = {}
    written = set()
    for w in deck["words"]:
        for card in w["cards"]:
            if card["kind"] == "original":
                written.add((w["id"], card["ja"]))
                continue
            src = card.get("src", {})
            site = src.get("site") or KIND_JA.get(card["kind"], card["kind"])
            combo = (src.get("licence", rights.UNVERIFIED), src.get("author", ""), src.get("translator", ""))
            g = sites.setdefault(site, {}).setdefault(combo, {"passages": set(), "urls": set(), "bare": set()})
            g["passages"].add((w["id"], card["ja"]))
            if src.get("url"):
                g["urls"].add(src["url"])
            else:
                g["bare"].add((w["id"], card["ja"]))
    total = sum(len(g["passages"]) for combos in sites.values() for g in combos.values())
    use = ("the learner's own study (private build; some sources below may not be shared)" if profile == "private"
           else "sharing (public build; sources that may not be shared are left out)")
    lines = [f"# Sources: {deck['titleJa']} ({deck['id']})", "",
             f"Built for {use}. {total} passages come from the {len(sites)} sources below; "
             f"{len(written)} passages were written for this deck (書き下ろし) and are not listed.", ""]
    order = sorted(sites, key=lambda s: (-sum(len(g["passages"]) for g in sites[s].values()), s))
    for site in order:
        lines += [f"## {site}", ""]
        for (licence, author, translator), g in sorted(sites[site].items()):
            lines.append(f"- Licence: {licence}")
            lines.append(f"  - Author: {author or 'not recorded'}")
            if translator:
                lines.append(f"  - Translator: {translator}")
            lines.append(f"  - Passages: {len(g['passages'])}")
            if not g["urls"]:
                lines.append("  - URL: no URL recorded")
            else:
                lines += [f"  - URL: <{u}>" for u in sorted(g["urls"])]
                if g["bare"]:
                    lines.append(f"  - URL: no URL recorded for {len(g['bare'])} passages")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    mods = load()
    if "--preview" in sys.argv:
        ids = IdManifest(IDS_PATH, frozen=False)  # new passages get ids in memory; save() is never called
        deck = build_deck(mods, ids, "mcd")
        out = Path(_arg("--preview"))
        build_study(deck, out)
        print(f"· preview: {len(deck['words'])} words, {sum(len(w['cards']) for w in deck['words'])} cards → {out}")
        return 0
    public = PROFILE == "public"
    ids = IdManifest(IDS_PATH, FROZEN or public)  # the public build never assigns or writes ids
    out_dir = Path(_arg("--out")) if "--out" in sys.argv else None
    decks = {kind: build_deck(mods, ids, kind) for kind in DECKS}
    rules = reading_rules()
    print(f"· reading rules (source/readings.json): {sum(RULE_HITS.values())} matches set by {len(RULE_HITS)}/{len(rules)} rules")
    for line in RULE_LOG:
        print(f"! {line}")
    idle = [f"{r['i']} ({r['surface']}→{r['reading']})" for r in rules if r["i"] not in RULE_HITS]
    if idle:
        raise SystemExit(f"readings.json: rule {', '.join(idle)} matched nothing; fix or remove it")
    print(f"· 字 cards withheld (kanji visible elsewhere): {len(KANJI_VISIBLE)}")
    lost = sum(len(x[2]) for x in KANJI_UNALIGNED)
    print(f"· 字 cards withheld (no table reading for each kanji): {lost}")
    for wid, term, gone in KANJI_UNALIGNED:
        print(f"    {wid} {term}: {', '.join(gone)}")
    warnings = hint_warnings(list(decks.values()))
    print(f"! hints that name the answer (warning only): {len(warnings)}")
    for line in warnings:
        print(f"    {line}")
    for spec in DECKS.values():
        ids.retire_unseen(spec["id"])
    ids.save()  # before any deck is written, so no shipped id is missing from the manifest
    release = RELEASE / "public" if public else RELEASE
    if out_dir is None:
        release.mkdir(parents=True, exist_ok=True)
    print(f"· profile: {PROFILE}")
    for kind, spec in DECKS.items():
        deck = decks[kind]
        if public:
            deck, report = public_deck(deck)
            kept, total = report["cards"]
            print(f"· public {deck['titleJa']}: {kept} of {total} cards kept; left out by reason (cards / passages):")
            for reason in [*PUBLIC_REASONS, *sorted(set(report["reasons"]) - set(PUBLIC_REASONS))]:
                cards, passages = report["reasons"].get(reason, (0, 0))
                print(f"    {reason}: {cards} / {passages}")
            print(f"    words dropped (no card left): {len(report['dropped'])}"
                  + (f" ({', '.join(report['dropped'])})" if report["dropped"] else ""))
        if out_dir is not None:
            path = out_dir / spec["id"] / "deck.json"
        elif public:
            path = release / f"deck-{spec['id']}.json"
        else:
            path = CORRIDOR / "decks" / spec["id"] / "deck.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(deck, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
        n = sum(len(w["cards"]) for w in deck["words"])
        if out_dir is not None:
            print(f"· {deck['titleJa']}: {len(deck['words'])} words, {n} cards → {path}")
            continue
        build_tsv(deck, spec, release)
        build_anki(deck, spec, release)
        build_study(deck, release / spec["out"][2])
        attribution = release / f"ATTRIBUTION-{spec['id']}.md"
        attribution.write_text(attribution_md(deck, PROFILE), "utf-8")
        outs = ", ".join([*spec["out"], attribution.name])
        print(f"· {deck['titleJa']}: {len(deck['words'])} words, {n} cards → {path.relative_to(REPO)}; "
              f"{release.relative_to(DECK_DIR)}/{{{outs}}}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
