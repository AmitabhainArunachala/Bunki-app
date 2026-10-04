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
    "裏：まず読み・品詞・ふりがな・日本語の説明。英語の意味、文の英訳、漢字の形と意味、出典はタップで開く。思い出せたら「思い出せた」、だめなら「もう一度」。",
    "よく使う語は文が2〜3つ。一つ目が定着すると（約2週間）、次の文が開く。",
]
# the two decks built from the same word list, side by side in 集中道場
DECKS = {
    "sentence": {"id": "kotoba-mine", "titleJa": "言葉の鉱脈・文", "titleEn": "Real sentences · read and recall",
                 "defaults": {"look": "dark", "mode": "read", "gloss": "tap"}, "method": SENTENCE_METHOD,
                 "anki": ("anki-sentence", "kotoba-mine-sentence-v3", "Kotoba Mine Sentence", "Read", "kotoba-mine-v3"),
                 "out": ("kotoba-mine.apkg", "kotoba-mine.tsv", "study.html")},
    "mcd": {"id": "kotoba-mcd", "titleJa": "言葉の鉱脈・MCD", "titleEn": "Massive-context cloze · passages",
            # 読んで思い出す by default (CARD_CONTRACT_V2 §2); 穴埋め, the MCD blank preset, is one switch
            # away in 設定 and brings the 字 cards back into the queue (STANDARD A37)
            "defaults": {"look": "ai", "mode": "read", "gloss": "tap"}, "unlockDays": 3,
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


# ------------------------------------------------------------------ the target sentence
# The back translates only the sentence that holds the target (CARD_CONTRACT_V2 §3.6). The
# player's zoom (mount.js sentenceEnds) splits a passage with the same rule.
JA_OPEN, JA_CLOSE, JA_END = "「『（(【〈《", "」』）)】〉》", "。！？!?"
EN_ABBR = {"mr", "mrs", "ms", "dr", "st", "no", "vs", "etc", "e.g", "i.e", "u.s", "jr", "sr", "prof", "inc", "co", "ltd", "mt", "approx"}


def sentence_ends(ja: str) -> list[int]:
    """where each sentence of a passage ends: after 。！？ outside brackets, with any closing
    marks that follow; the last sentence runs to the end of the passage"""
    out, depth, i, n = [], 0, 0, len(ja)
    while i < n:
        ch = ja[i]
        if ch in JA_OPEN:
            depth += 1
        elif ch in JA_CLOSE:
            depth = max(0, depth - 1)
        elif ch in JA_END and depth == 0:
            j = i + 1
            while j < n and (ja[j] in JA_END or ja[j] in JA_CLOSE):
                j += 1
            out.append(j)
            i = j
            continue
        i += 1
    if not out or out[-1] < n:
        if ja[out[-1] if out else 0:].strip():
            out.append(n)
        else:
            out[-1] = n
    return out


def en_sentences(en: str) -> list[str]:
    """an English translation cut into sentences (not after Mr., U.S., initials …)"""
    out, start = [], 0
    for m in re.finditer(r'[.!?]+["”’)\]]*\s+(?=["“‘(\[]?[A-Z0-9])', en):
        word = re.search(r'([\w.]+)[.!?]+["”’)\]]*\s+$', en[start:m.end()])
        if m.group(0)[0] == "." and word and (word.group(1).lower().rstrip(".") in EN_ABBR or re.fullmatch(r"[A-Z]", word.group(1))):
            continue
        out.append(en[start:m.end()].strip())
        start = m.end()
    if en[start:].strip():
        out.append(en[start:].strip())
    return out


def target_sentence_en(ja: str, en: str, at: int) -> str | None:
    """the English of the sentence holding the target (at = its offset in ja): the whole
    translation for a one-sentence passage; otherwise the matching English sentence when both
    sides have the same number of sentences, else None (the back then offers no 英訳)"""
    ends = sentence_ends(ja)
    if len(ends) == 1:
        return en
    parts = en_sentences(en)
    if len(parts) != len(ends):
        return None
    return parts[next(k for k, e in enumerate(ends) if at < e)]


# ------------------------------------------------------------------ 類語 (sem.json)
_SEM: dict | None = None


def sem_for(term: str) -> list[dict]:
    """dictionary cross-references for a word from the corridor's semantic table; the player
    shows them only once the card is in review state (R13)"""
    global _SEM
    if _SEM is None:
        path = CORRIDOR / "data" / "proprietary_safe" / "sem.json"
        _SEM = json.loads(path.read_text("utf-8")).get("edges", {}) if path.exists() else {}
    return [{"w": e["w"], "rel": e["rel"], **({"note": e["note"]} if e.get("note") else {})} for e in _SEM.get(term, [])]


_LEVELS: dict[tuple[str, str], set[int]] | None = None
# the deck's method names the list the level chip comes from (n2n1/PLAN.md §1.2, V8)
LEVEL_NOTE = ("N1〜N3 の札は、公開の JLPT 語彙リスト（open-anki-jlpt-decks 系、2010年以前の旧基準）による目安。"
              "JLPT は公式の語彙リストを出していない。リストに載っていない語には札がない。")


def level_for(term: str, reading: str) -> str | None:
    """the word's level from prototypes/drift/data/wbig.json, joined on headword and reading
    (the surface alone is ambiguous); only when the list gives that pair exactly one level"""
    global _LEVELS
    if _LEVELS is None:
        _LEVELS = {}
        for word, kana, _gloss, level in json.loads((REPO / "prototypes" / "drift" / "data" / "wbig.json").read_text("utf-8")):
            if isinstance(level, int):
                _LEVELS.setdefault((word, kana), set()).add(level)
    found = _LEVELS.get((term, reading), set())
    return f"N{next(iter(found))}" if len(found) == 1 else None


# 字 cards the build leaves out, reported at the end: [card id or key] and [(word, term, ids)]
KANJI_VISIBLE: list[str] = []
KANJI_UNALIGNED: list[tuple[str, str, list[str]]] = []


def mcd_cards(wid: str, c: dict, passages: list[dict], tagger, bc, ids: IdManifest) -> list[dict]:
    """per passage: one card asking the whole word (marked in 読んで思い出す, blanked in 穴埋め;
    no front hint, CARD_CONTRACT_V2 §2), then (first passage only) one card per kanji, blanked
    with its reading as the hint (the player queues these in the blank presets only).
    A 字 card is left out when its kanji can be read elsewhere in the passage, and no 字
    card is made when the kanji table cannot split the word's reading.
    Ids come from the manifest by key; lv is the card's position (display order only)."""
    cards, keys = [], []
    for pi, p in enumerate(passages, 1):
        ruby = _ordered_for({"ja": p["ja"], "form": p["form"]}, c, tagger, bc)
        if "".join(seg[0] for seg in ruby) != p["ja"]:
            raise SystemExit(f"{wid} passage {pi}: ruby does not spell the passage")
        src = source(p)
        ti = next(i for i, seg in enumerate(ruby) if len(seg) > 2)
        base = {"ja": p["ja"], "form": p["form"], "en": p["en"], "kind": p["kind"], "src": src, "passage": pi}
        en_target = target_sentence_en(p["ja"], p["en"], sum(len(seg[0]) for seg in ruby[:ti]))
        if en_target is not None:
            base["enTarget"] = en_target
        cards.append({**base, "type": "word", "ruby": ruby})
        keys.append(word_key(wid, p["ja"]))
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
    "このデッキは AJATT の MCD（Massive-Context Cloze Deletion）の文章でできています。ふだんは「読んで思い出す」で解きます。",
    "表：ニュース・ウィキペディア・文学から取った本物の文章と、このデッキのために書いた文章（2〜4文）。覚える言葉は色つき。読み・英語・ヒントは出ない。読んで、意味と読みを思い出してからタップ。",
    "設定 › 答え方 › 穴埋め にすると MCD の穴埋めになる。「語」カードは単語まるごとが穴（同じ言葉が二度出てくる文章では、両方とも空欄）。",
    "「字」カードは単語の漢字ひとつが穴。〔 〕の読みを手がかりに、その字を思い出す（最初の文章で）。穴埋めと4択のときだけ出てくる（読んで思い出すでは休み。記録は消えない）。",
    "ひとつの文章から何枚もカードができる（1枚に未知はひとつ）。慣れたら次の文章が開き、同じ言葉に別の文脈で出会う。",
    "裏：ふりがな付きの全文、読み、品詞、日本語の説明。英語の意味、その文の英訳、漢字の形と意味、ほかの文章、出典はタップで開く。",
    "判定は「もう一度／思い出せた」の二つで十分（FSRS-6）。迷ったら「もう一度」。",
]


# ------------------------------------------------------------------ tokens (the tap source)
# Per card, the passage as dictionary-sized tokens (CARD_CONTRACT_V2, learning-design §3):
# ruby[] stays the display source, tokens[] are what a host taps and looks up. The token
# surfaces spell the same string as the ruby surfaces, in order, so the player can align
# the two by character offset. One token is [surface, lemma, reading, kind, ref], trailing
# empty fields dropped:
#   lemma    UniDic's dictionary form (書字形基本形) when it differs from the surface, else ""
#   reading  hiragana, only when the surface has kanji, else ""
#   kind     語 (a word), 字 (a lone kanji the dictionary has no head for: 的, 性 …),
#            文法 (inside a grammar cue of data/original/grammar-v11.json), "" (other:
#            particles, endings, punctuation)
#   ref      what the host lexicon opens: a boot-core dictionary head (data/share_alike/
#            dict.json) for 語, the glyph for 字, the grammar id for 文法; "" when none
#            exists at build time (a deep-tier word the host may still resolve by lemma)
# The tokens ride beside deck.json when they would grow it by more than TOKENS_INLINE_BUDGET.
PASSAGE_TOKENS: dict[tuple[str, str], tuple[list[dict], list[tuple[int, int]]]] = {}
TOKENS_INLINE_BUDGET = 0.25
CONTENT_POS = {"名詞", "代名詞", "動詞", "形容詞", "形状詞", "副詞", "連体詞", "接続詞", "感動詞"}
AFFIX_POS = {"接頭辞", "接尾辞"}
_HEADS: set | None = None
_WORDS: dict | None = None
_CUES: list[tuple[str, str]] | None = None


def _dict_words() -> dict:
    global _WORDS
    if _WORDS is None:
        _WORDS = json.loads((CORRIDOR / "data" / "share_alike" / "dict.json").read_text("utf-8"))["words"]
    return _WORDS


def _dict_heads() -> set:
    global _HEADS
    if _HEADS is None:
        _HEADS = set(_dict_words())
    return _HEADS


def _grammar_cues() -> list[tuple[str, str]]:
    """(cue, grammar id), longest cue first"""
    global _CUES
    if _CUES is None:
        grammar_refs([])  # loads the table
        _CUES = sorted(((cue, g["id"]) for g in _GRAMMAR.values() for cue in g.get("cues", []) if cue),
                       key=lambda x: -len(x[0]))
    return _CUES


# a cue that starts on one of these is a nominal (上, こと, よう) only after a predicate: 峠の上で
# and ネット上では are places, 異例のことであった is a copula, このように is "like this"
PREDICATE_POS = {"動詞", "形容詞", "助動詞"}
NOMINAL_CUE_HEADS = ("上", "うえ", "こと", "よう")


def _grammar_spans(tokens: list[dict], targets: list[tuple[int, int]]) -> dict[int, str]:
    """token index → grammar id, for each run of whole tokens that spells a cue; a run that
    touches the card's target stays lexical (the target is the card's own word). A cue that
    starts on a nominal needs a predicate before it, and a cue ending in で is not one when
    ある follows (the copula である)."""
    starts, pos = [], 0
    for t in tokens:
        starts.append(pos)
        pos += len(t["s"])
    ends = {st + len(t["s"]): i for i, (t, st) in enumerate(zip(tokens, starts))}
    text = "".join(t["s"] for t in tokens)
    out: dict[int, str] = {}
    for i, st in enumerate(starts):
        if i in out:
            continue
        for cue, gid in _grammar_cues():
            if not text.startswith(cue, st) or (st + len(cue)) not in ends:
                continue
            last = ends[st + len(cue)]
            if any(a < st + len(cue) and st < b for a, b in targets) or any(k in out for k in range(i, last + 1)):
                continue
            if cue.startswith(NOMINAL_CUE_HEADS) and (i == 0 or tokens[i - 1].get("p") not in PREDICATE_POS):
                continue
            if cue.endswith("で") and last + 1 < len(tokens) and (tokens[last + 1].get("b") or tokens[last + 1]["s"]) == "ある":
                continue
            for k in range(i, last + 1):
                out[k] = gid
            break
    return out


MERGE_SPAN = 3  # UniDic short units joined back into one dictionary word: 図書+館, 飛行+機, 語呂+合わせ


def _merge_compounds(tokens: list[dict], targets: list[tuple[int, int]]) -> list[dict]:
    """join up to MERGE_SPAN adjacent content tokens when together they spell a boot-core head that
    reads as they read, the longest join first. A join never crosses a target boundary, so the
    card's own word keeps its edges."""
    heads, words = _dict_heads(), _dict_words()
    bounds = {x for ab in targets for x in ab}
    out, i, at = [], 0, 0
    while i < len(tokens):
        done = False
        for n in range(min(MERGE_SPAN, len(tokens) - i), 1, -1):
            run = tokens[i:i + n]
            s = "".join(t["s"] for t in run)
            if s not in heads or not KANJI.search(s) or any(t.get("p") not in CONTENT_POS | AFFIX_POS for t in run):
                continue
            if any(at < x < at + len(s) for x in bounds):
                continue
            r = "".join(kata_to_hira(t.get("r") or "") if KANJI.search(t["s"]) else kata_to_hira(t["s"]) for t in run)
            if kata_to_hira(words[s].get("r") or "") != r:
                continue
            out.append({"s": s, "b": s, "r": r, "p": run[-1].get("p", ""), "c": True})
            i, at, done = i + n, at + len(s), True
            break
        if not done:
            out.append(tokens[i])
            at += len(tokens[i]["s"])
            i += 1
    return out


def encode_tokens(ja: str, form: str) -> list[list[str]]:
    tokens, targets = PASSAGE_TOKENS[(ja, form)]
    heads = _dict_heads()
    _readings("一")  # loads the kanji table
    tokens = _merge_compounds(tokens, targets)
    grammar = _grammar_spans(tokens, targets)
    out = []
    for i, t in enumerate(tokens):
        s, lemma, pos = t["s"], t.get("b") or t["s"], t.get("p", "")
        reading = kata_to_hira(t.get("r") or "") if KANJI.search(s) else ""
        kind, ref = "", ""
        if i in grammar:
            kind, ref = "文法", grammar[i]
        elif pos in CONTENT_POS or pos in AFFIX_POS:
            ref = lemma if lemma in heads else s if s in heads else ""
            if ref or (t.get("c") and pos not in AFFIX_POS):
                kind = "語"
            elif len(s) == 1 and KANJI.match(s) and s in _KANJI_DB:
                kind, ref = "字", s
        row = [s, lemma if lemma != s else "", reading, kind, ref]
        while len(row) > 1 and row[-1] == "":
            row.pop()
        out.append(row)
    if "".join(r[0] for r in out) != ja:
        raise SystemExit(f"tokens do not spell 「{ja[:20]}…」")
    return out


def tokens_file(deck: dict) -> dict:
    """the deck's tokens: each distinct passage once, cards pointing at it by index"""
    passages: list[list] = []
    seen: dict[str, int] = {}
    cards: dict[str, int] = {}
    used: set[str] = set()
    for w in deck["words"]:
        for c in w["cards"]:
            toks = encode_tokens(c["ja"], c["form"])
            key = json.dumps(toks, ensure_ascii=False)
            if key not in seen:
                seen[key] = len(passages)
                passages.append(toks)
            cards[c["id"]] = seen[key]
            used.update(t[4] for t in toks if len(t) > 4 and t[3] == "文法")
    return {
        "format": "bunki-cloze-tokens",
        "version": 1,
        "deck": deck["id"],
        "fields": ["s", "b", "r", "k", "ref"],
        "grammar": {g: _GRAMMAR[g]["p"] for g in sorted(used)},
        "passages": passages,
        "cards": cards,
    }


def with_tokens(deck: dict, name: str) -> tuple[dict, dict | None, dict]:
    """(deck, side file or None, size report). Inline card.tokens when they grow deck.json by at
    most TOKENS_INLINE_BUDGET; otherwise deck.tokens names the side file and the cards stay as they are."""
    def dump(d: dict) -> int:
        return len(json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + 1

    side = tokens_file(deck)
    inline = {**deck, "words": [{**w, "cards": [{**c, "tokens": side["passages"][side["cards"][c["id"]]]} for c in w["cards"]]}
                                for w in deck["words"]]}
    before, grown = dump(deck), dump(inline)
    report = {"deck": before, "inline": grown, "growth": (grown - before) / before, "side": dump(side)}
    if report["growth"] <= TOKENS_INLINE_BUDGET:
        return inline, None, report
    return {**deck, "tokens": name}, side, report


# ------------------------------------------------------------------ deck
# a radical and its compressed form (手/扌, 攴/攵 …) count as one part
RADICAL_TWINS = {"手": "扌", "攴": "攵", "襾": "覀", "人": "亻", "水": "氵", "心": "忄", "火": "灬", "刀": "刂", "犬": "犭",
                 "示": "礻", "衣": "衤", "艸": "艹", "辵": "辶", "言": "訁", "食": "飠", "糸": "糹", "玉": "王", "老": "耂", "网": "罒"}


def kanji_anatomy(term: str, reading: str = "") -> list[dict]:
    """each kanji of the word: meaning, up to three parts, stroke count (for the visual back),
    and r, its reading inside this word when the kanji table can split the word's reading
    (財政/ざいせい: 財 ざい, 政 せい) — the kanji family's 読 marker joins on it"""
    _readings("一")  # loads the table
    split = {}
    for ch, r in (align(term, reading) or []) if reading else []:
        if KANJI.match(ch) and r:
            split.setdefault(ch, r)
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
            out.append({"c": ch, "m": (k.get("m") or "").lower(), "parts": parts, "st": k.get("st"), **({"r": split[ch]} if ch in split else {})})
    return out


# ------------------------------------------------------------------ see-also, grammar
_GRAMMAR: dict | None = None


def grammar_refs(ids: list) -> list[dict]:
    """grammar ids named by the source, labelled from data/original/grammar-v11.json; an id the
    table does not know is dropped, never guessed"""
    global _GRAMMAR
    if _GRAMMAR is None:
        path = CORRIDOR / "data" / "original" / "grammar-v11.json"
        _GRAMMAR = {e["id"]: e for e in json.loads(path.read_text("utf-8")).get("entries", [])} if path.exists() else {}
    return [{"id": g, "p": _GRAMMAR[g]["p"]} for g in dict.fromkeys(ids) if isinstance(g, str) and g in _GRAMMAR]


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
                "kanji": kanji_anatomy(c["term"], c["reading"]),
                "cards": cards,
            }
            if c.get("tip"):
                word["tip"] = c["tip"]
            if level := level_for(c["term"], c["reading"]):
                word["level"] = level
            if sem := sem_for(c["term"]):
                word["sem"] = sem
            # the back's 参照・文法 line shows only what the source names (none of the words does yet)
            if see := [t for t in c.get("seeAlso", []) if isinstance(t, str) and t and t != c["term"]]:
                word["seeAlso"] = see
            if grammar := grammar_refs(c.get("grammar", [])):
                word["grammar"] = grammar
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
        "method": [*spec.get("method", METHOD), LEVEL_NOTE],
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
    PASSAGE_TOKENS[(ja, form)] = (tokens, [(a, b) for a, b, _r, _m in marks])
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


# な-adjectives get their own key so the badge can say 形容動詞 (the player's POS map does the same);
# the colour stays the adjective's
POS_KEY = {"noun": "noun", "verb": "verb", "い-adjective": "adj", "な-adjective": "adjna", "adverb": "adv",
           "expression": "expr", "sound word": "sound", "kanji": "noun"}


def kanji_family(words: list[dict], wi: int) -> list[tuple[dict, list[dict], list[dict]]]:
    """the player's kanji family (mount.js familyOf) for Anki, which cannot read the learner's
    ledger: the words before this one in deck order stand for the learner's own words, since
    Anki introduces each word's first card in that order (note due = position). Per kanji of
    the word: words sharing the kanji (同), then words with another kanji read the same (読)."""
    w = words[wi]
    earlier = words[:wi]
    out = []
    for k in w.get("kanji", []):
        same = [x for x in earlier if any(j["c"] == k["c"] for j in x.get("kanji", []))]
        read = [x for x in earlier if x not in same and k.get("r")
                and any(j.get("r") == k["r"] and j["c"] != k["c"] for j in x.get("kanji", []))]
        if same or read:
            out.append((k, same, read))
    return out


FAMILY_READ_MAX = 8  # as mount.js: more than this many 読 words end in ほかN語


def kanji_family_html(words: list[dict], wi: int) -> str:
    rows = []
    for k, same, read in kanji_family(words, wi):
        items = [f'<span class="fam"><i>同</i>{html.escape(x["term"])}</span>' for x in same]
        items += [f'<span class="fam rd"><i>読</i>{html.escape(x["term"])}</span>' for x in read[:FAMILY_READ_MAX]]
        if len(read) > FAMILY_READ_MAX:
            items.append(f'<span class="more">ほか{len(read) - FAMILY_READ_MAX}語</span>')
        r = f'<small>{html.escape(k["r"])}</small>' if k.get("r") else ""
        rows.append(f'<li><b>{k["c"]}{r}</b>{"".join(items)}</li>')
    return f'<ul class="kfam">{"".join(rows)}</ul>' if rows else ""


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
                # a passage translates only its target sentence (none when it cannot be matched)
                "SentenceEN": html.escape(card.get("enTarget", "") if card.get("type") else card["en"]),
                "Tip": html.escape(w.get("tip", "")),
                "POS": POS_KEY.get(w["pos"], "noun"),
                "Kanji": "".join(
                    f'<div class="kj"><b>{k["c"]}</b><span>{html.escape(k["m"])}</span><small>{" ".join(k["parts"])}{" · " + str(k["st"]) + "画" if k.get("st") else ""}</small></div>'
                    for k in w.get("kanji", [])) + kanji_family_html(deck["words"], wi),
                "_group": w["group"],
                "_level": w.get("level", ""),
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
        note = Note(model=model, fields=[r[f] for f in FIELDS], tags=[deck["id"], f"card{r['Level']}", f"source::{r['Kind']}", f"topic::{r['_group']}", *([f"level::{r['_level']}"] if r["_level"] else [])], sort_field=r["Sort"], due=i)
        decks[r["_group"]].add_note(note)
    genanki.Package(list(decks.values())).write_to_file(str(out_dir / spec["out"][0]))


def build_tsv(deck: dict, spec: dict, out_dir: Path = RELEASE) -> None:
    lines = ["#separator:tab", "#html:true", f"#columns:{chr(9).join(FIELDS)}\tTags"]
    for r in note_rows(deck):
        lines.append("\t".join([*(r[f].replace("\t", " ") for f in FIELDS), f"{deck['id']} card{r['Level']} source::{r['Kind']}" + (f" level::{r['_level']}" if r["_level"] else "")]))
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
        tokens_path = path.with_name(f"tokens-{spec['id']}.json" if public and out_dir is None else "tokens.json")
        study_deck = deck
        deck, side, size = with_tokens(deck, tokens_path.name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(deck, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
        if side is not None:
            tokens_path.write_text(json.dumps(side, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
        elif tokens_path.exists():
            tokens_path.unlink()
        print(f"· tokens {spec['id']}: inline would grow deck.json {size['deck']:,} → {size['inline']:,} bytes "
              f"(+{size['growth']:.0%}, budget {TOKENS_INLINE_BUDGET:.0%}); "
              + (f"side file {tokens_path.name} {size['side']:,} bytes, loaded on demand" if side is not None else "inline"))
        n = sum(len(w["cards"]) for w in deck["words"])
        if out_dir is not None:
            print(f"· {deck['titleJa']}: {len(deck['words'])} words, {n} cards → {path}")
            continue
        build_tsv(deck, spec, release)
        build_anki(deck, spec, release)
        build_study(study_deck, release / spec["out"][2])  # the study page has no host lexicon: no tokens
        attribution = release / f"ATTRIBUTION-{spec['id']}.md"
        attribution.write_text(attribution_md(deck, PROFILE), "utf-8")
        outs = ", ".join([*spec["out"], attribution.name])
        print(f"· {deck['titleJa']}: {len(deck['words'])} words, {n} cards → {path.relative_to(REPO)}; "
              f"{release.relative_to(DECK_DIR)}/{{{outs}}}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
