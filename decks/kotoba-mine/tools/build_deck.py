#!/usr/bin/env python3
"""Build 言葉の鉱脈 (Kotoba Mine) from its authored modules.

One source, four outputs:

  decks/kotoba-mine/deck.json
      the canonical deck: every module, its passage, every card in full.
  prototypes/corridor/data/articles/kotoba-mine-<module>.json  (+ index rows)
      each module's passage as an original-lane Bunki article, tokenised and
      graded by the corridor's own pipeline (build_articles.tokenise_paragraphs
      + grade_article). The span each card is asked on is merged into ONE
      token whose base form is the card's headword, so the corridor's cloze
      (renderSentenceTokens targetId === token.b) blanks exactly that word.
  prototypes/corridor/data/share_alike/decks/kotoba-mine.json
      the compact deck the corridor's 単語帳 room reads (cards + token index).
  decks/kotoba-mine/release/
      kotoba-mine.apkg  — Anki package (one note type, two card templates,
                          one subdeck per module); needs `pip install genanki`
      kotoba-mine.tsv   — plain tab-separated export for any other SRS
      study.html        — the standalone study app with the deck embedded

Run from the repo root:  python3 decks/kotoba-mine/tools/build_deck.py
Flags: --no-corridor (skip the tokeniser/grading step), --no-anki.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DECK = HERE.parent
REPO = DECK.parents[1]
SRC = DECK / "source"
DIST = DECK / "release"  # not dist/: the repo ignores every dist/ directory
CORRIDOR = REPO / "prototypes" / "corridor"
ARTICLES = CORRIDOR / "data" / "articles"
CORRIDOR_DECK = CORRIDOR / "data" / "share_alike" / "decks" / "kotoba-mine.json"

sys.path.insert(0, str(HERE))
import check_module  # noqa: E402

DECK_ID = "kotoba-mine"
TITLE = {"ja": "言葉の鉱脈", "en": "Kotoba Mine — a context-first mined-word deck"}
ARTICLE_PREFIX = "kotoba-mine-"
SOURCE_ROW = {
    "name": "bunki-kotoba-mine",
    "licence": "Bunki original",
    "attribution": "Bunki original passages written around a learner's mined-word list",
    "url": "",
}
LICENCE = {
    "passages_sentences_definitions": "Bunki original",
    "english_glosses": "edited from JMdict (EDRDG), CC BY-SA 4.0 — https://www.edrdg.org/edrdg/licence.html",
}


# --------------------------------------------------------------------------
# Load + validate
# --------------------------------------------------------------------------
def load_modules() -> list[dict]:
    order = json.loads((SRC / "modules.json").read_text("utf-8"))
    problems = []
    mods = []
    for i, (mid, meta) in enumerate(order.items(), start=1):
        errs = check_module.check(mid)
        if errs:
            problems.append((mid, errs))
            continue
        doc = json.loads((SRC / "modules" / f"{mid}.json").read_text("utf-8"))
        by_n = {c["n"]: c for c in doc["cards"]}
        mods.append(
            {
                "id": mid,
                "order": i,
                # deterministic, so a --no-corridor build still links each
                # module to the shelf article the full build writes
                "article": ARTICLE_PREFIX + mid,
                "title": {"ja": meta["ja"], "en": meta["en"]},
                "passage": doc["passage"],
                # the module's word order is the learner's own mining order
                "cards": [by_n[n] for n in meta["n"]],
            }
        )
    if problems:
        for mid, errs in problems:
            print(f"✗ {mid}")
            for e in errs[:12]:
                print("   -", e)
        raise SystemExit(f"{len(problems)} module(s) failed validation")
    return mods


def card_key(card: dict) -> str:
    return f"km-{card['n']:03d}"


# --------------------------------------------------------------------------
# Corridor articles — tokenise, merge each card's span, grade
# --------------------------------------------------------------------------
def merge_targets(tokens: list[dict], para_starts: list[int], text: str, cards: list[dict], bc):
    """Merge each card's sentences[0] span into one token. Returns
    (tokens, para_starts, {n: token_index}, [unplaced notes])."""
    for pi, start in enumerate([0, *para_starts]):
        end = para_starts[pi] if pi < len(para_starts) else len(tokens)
        for t in tokens[start:end]:
            t["_para"] = pi
    joined = "".join(t["s"] for t in tokens)
    flat = "".join(p.strip() for p in re.split(r"\n+", text) if p.strip())
    if joined != flat:
        raise SystemExit("token surfaces do not reproduce the passage text")
    offsets = []
    pos = 0
    for t in tokens:
        offsets.append(pos)
        pos += len(t["s"])

    spans = []  # (first_tok, last_tok, card)
    unplaced = []
    claimed: set[int] = set()
    # longer forms first, so 磁気共鳴断層撮影 claims its tokens before 磁気共鳴
    for card in sorted(cards, key=lambda c: -len(c["sentences"][0]["form"])):
        s0 = card["sentences"][0]
        placed = False
        sent_at = -1
        while True:
            sent_at = flat.find(s0["ja"], sent_at + 1)
            if sent_at < 0:
                break
            form_at = s0["ja"].find(s0["form"])
            while form_at >= 0:
                a = sent_at + form_at
                b = a + len(s0["form"])
                first = max(i for i, o in enumerate(offsets) if o <= a)
                last = max(i for i, o in enumerate(offsets) if o < b)
                rng = set(range(first, last + 1))
                if not rng & claimed:
                    claimed |= rng
                    spans.append((first, last, card))
                    placed = True
                    break
                form_at = s0["ja"].find(s0["form"], form_at + 1)
            if placed:
                break
        if not placed:
            # another card already owns the span (e.g. 下敷き inside 下敷きになる):
            # fall back to any free occurrence of the headword in the passage
            at = flat.find(card["term"])
            while at >= 0 and not placed:
                first = max(i for i, o in enumerate(offsets) if o <= at)
                last = max(i for i, o in enumerate(offsets) if o < at + len(card["term"]))
                rng = set(range(first, last + 1))
                if not rng & claimed:
                    claimed |= rng
                    spans.append((first, last, card))
                    placed = True
                at = flat.find(card["term"], at + 1)
        if not placed:
            unplaced.append(f"#{card['n']} {card['term']}")

    by_first = {f: (l, c) for f, l, c in spans}
    out: list[dict] = []
    index: dict[int, int] = {}
    i = 0
    while i < len(tokens):
        if i in by_first:
            last, card = by_first[i]
            group = tokens[i : last + 1]
            surface = "".join(t["s"] for t in group)
            reading = card["reading"]
            if surface == card["term"] and re.fullmatch(r"[ぁ-ゖー]+", reading or ""):
                furi = bc.furigana_pairs(surface, reading)
                r = reading
            else:
                furi = [f for t in group for f in t["f"]]
                r = "".join(t["r"] for t in group)
            merged = {"s": surface, "b": card["term"], "p": group[0]["p"], "r": r, "f": furi, "c": True,
                      "_para": group[0]["_para"]}
            index[card["n"]] = len(out)
            out.append(merged)
            i = last + 1
        else:
            out.append(tokens[i])
            i += 1
    new_paras = [k for k in range(1, len(out)) if out[k]["_para"] != out[k - 1]["_para"]]
    for t in out:
        t.pop("_para", None)
    return out, new_paras, index, unplaced


def build_corridor(mods: list[dict]) -> dict:
    sys.path.insert(0, str(CORRIDOR / "tools"))
    sys.path.insert(0, str(REPO))
    import build_articles as ba  # noqa: E402
    import build_corridor as bc  # noqa: E402
    from corpus.grading._mecab import get_tagger  # noqa: E402

    tagger = get_tagger()
    jlpt_maps = ba.load_jlpt_lexicon()
    index_path = ARTICLES / "index.json"
    index = json.loads(index_path.read_text("utf-8"))
    rows = [r for r in index["articles"] if not r["id"].startswith(ARTICLE_PREFIX)]
    report = {}
    for m in mods:
        p = m["passage"]
        aid = ARTICLE_PREFIX + m["id"]
        text = p["text"].replace("\r\n", "\n").strip()
        tokens, paras = ba.tokenise_paragraphs(text, tagger)
        grading = ba.grade_article(text, tokens, tagger, jlpt_maps)
        tokens, paras, tok_index, unplaced = merge_targets(tokens, paras, text, m["cards"], bc)
        # the JLPT-lexicon signal is a count over the tokens actually shipped,
        # so it is recomputed on the merged tokens (jreadability reads the
        # text, which the merge never changes)
        grading["signals"]["jlpt_lexicon"] = ba.jlpt_signal(tokens, *jlpt_maps)
        m["article"] = aid
        m["tokenIndex"] = tok_index
        record = {
            "id": aid,
            "title": p["title"],
            "text": text,
            "source": SOURCE_ROW["name"],
            "sourceLabel": "単語帳の読み物 · 言葉の鉱脈",
            "pool": "original",
            "licence": "Bunki original",
            "attribution": "Bunki original text",
            "url": "",
            "date": "",
            "rubySource": "tokenizer",
            "authorLevel": p.get("level", "N1"),
            "lane": "deck",
            "file": aid + ".json",
        }
        body = dict(record, tokens=tokens, paras=paras, grading=grading, truncated=False)
        (ARTICLES / record["file"]).write_text(
            json.dumps(body, ensure_ascii=False, separators=(",", ":")), "utf-8"
        )
        seeds: list[str] = []
        for t in tokens:
            if t["c"] and len(t["s"]) > 1 and t["b"] not in seeds:
                seeds.append(t["b"])
            if len(seeds) >= 6:
                break
        row = {k: v for k, v in record.items() if k != "text"}
        row["titleEn"] = p.get("title_en") or m["title"]["en"]
        row["titleEnSource"] = "shelf-map-2026"
        row["chars"] = len(text)
        row["snippet"] = text.replace("\n", " ")[:64]
        row["grading"] = grading
        row["seeds"] = seeds
        row["truncated"] = False
        rows.append(row)
        jr = grading["signals"]["jreadability"]
        report[m["id"]] = {"chars": len(text), "jread": round(jr["score"], 2), "band": jr["band"],
                           "placed": len(tok_index), "unplaced": unplaced}
        print(f"  {aid:<34} {len(text):>5}字  jread={jr['score']:.2f} ({jr['band']})  "
              f"cloze-anchored {len(tok_index)}/{len(m['cards'])}"
              + (f"  unplaced: {', '.join(unplaced)}" if unplaced else ""))
    index["articles"] = rows
    names = [s["name"] for s in index["sources"].setdefault("original", [])]
    if SOURCE_ROW["name"] not in names:
        index["sources"]["original"].append(SOURCE_ROW)
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", "utf-8")
    return report


# --------------------------------------------------------------------------
# Canonical + corridor deck files
# --------------------------------------------------------------------------
def canonical(mods: list[dict]) -> dict:
    return {
        "schemaVersion": 1,
        "deckId": DECK_ID,
        "title": TITLE,
        "licence": LICENCE,
        "method": "docs: decks/kotoba-mine/README.md",
        "modules": [
            {
                "id": m["id"],
                "order": m["order"],
                "title": m["title"],
                "article": m.get("article"),
                "passage": m["passage"],
                "cards": [dict(key=card_key(c), **c) for c in m["cards"]],
            }
            for m in mods
        ],
    }


def corridor_deck(mods: list[dict]) -> dict:
    out = []
    for m in mods:
        cards = []
        for c in m["cards"]:
            row = {
                "n": c["n"],
                "w": c["term"],
                "r": c["reading"],
                "g": c["gloss"],
                "d": c["def_ja"],
                "pos": c["pos"],
                "reg": c["register"],
                "s": [[s["ja"], s["form"], s["en"]] for s in c["sentences"]],
            }
            if c.get("collocations"):
                row["col"] = c["collocations"]
            if c.get("confusables"):
                row["cf"] = [[x["term"], x["note"]] for x in c["confusables"]]
            if c.get("note"):
                row["note"] = c["note"]
            if c.get("kanji"):
                row["kanji"] = c["kanji"]
            i = m.get("tokenIndex", {}).get(c["n"])
            if i is not None:
                row["i"] = i
            cards.append(row)
        out.append({"id": m["id"], "title": m["title"], "article": m.get("article"),
                    "passageTitle": m["passage"]["title"], "cards": cards})
    return {"schemaVersion": 1, "deckId": DECK_ID, "title": TITLE, "licence": LICENCE,
            "law": "a deck is a door, not a schedule — nothing is enrolled until the learner chooses it",
            "modules": out}


# --------------------------------------------------------------------------
# Anki + TSV
# --------------------------------------------------------------------------
def mark(sentence: str, form: str, cls: str = "t") -> str:
    i = sentence.find(form)
    esc = html.escape
    return esc(sentence[:i]) + f'<b class="{cls}">' + esc(form) + "</b>" + esc(sentence[i + len(form):])


def blank(sentence: str, form: str, also: str | None = None) -> str:
    # every occurrence is masked: a second 座標 later in the sentence would
    # otherwise hand the production card its own answer. A kanji card also
    # masks the bare character (`also`) wherever another compound shows it.
    parts = sentence.split(form)
    if also:
        parts = [p.replace(also, "\0") for p in parts]
    out = '<span class="blank">［　　］</span>'.join(html.escape(p) for p in parts)
    return out.replace("\0", '<span class="blank">［］</span>')


# card key → (recognition front HTML, cloze front HTML): the passage paragraph, filled by main()
CONTEXT: dict[str, tuple[str, str]] = {}


def note_fields(m: dict, c: dict) -> dict:
    s = c["sentences"]
    ctx = CONTEXT.get(card_key(c))
    extra = "".join(
        f'<div class="ex"><div class="ja">{mark(x["ja"], x["form"])}</div><div class="en">{html.escape(x["en"])}</div></div>'
        for x in s[1:]
    )
    conf = "".join(
        f'<li><b>{html.escape(x["term"])}</b> — {html.escape(x["note"])}</li>' for x in c.get("confusables", [])
    )
    kanji = ""
    if c.get("kanji"):
        k = c["kanji"]
        comp = "、".join(f'{html.escape(x["w"])}（{html.escape(x["r"])}）{html.escape(x["en"])}' for x in k.get("compounds", []))
        kanji = (f'音 {html.escape("・".join(k.get("on", [])))}　訓 {html.escape("・".join(k.get("kun", [])))}'
                 f'<br>{html.escape(k.get("meaning", ""))}<br>{comp}')
    return {
        "Key": card_key(c),
        "Term": html.escape(c["term"]),
        "Reading": html.escape(c["reading"]),
        "Sentence": ctx[0] if ctx else mark(s[0]["ja"], s[0]["form"]),
        "SentenceCloze": ctx[1] if ctx else blank(s[0]["ja"], s[0]["form"], c["term"] if c.get("kanji") else None),
        "SentenceEN": html.escape(s[0]["en"]),
        "MoreSentences": extra,
        "DefJA": html.escape(c["def_ja"]),
        "Gloss": html.escape(c["gloss"]),
        "POS": html.escape(c["pos"]),
        "Register": html.escape(c["register"]),
        "Collocations": "　".join(html.escape(x) for x in c.get("collocations", [])),
        "Confusables": f"<ul>{conf}</ul>" if conf else "",
        "Note": html.escape(c.get("note", "")),
        "Kanji": kanji,
        "Module": html.escape(m["title"]["ja"]),
        "Passage": html.escape(m["passage"]["title"]),
        "Production": "",
    }


FIELDS = ["Key", "Term", "Reading", "Sentence", "SentenceCloze", "SentenceEN", "MoreSentences", "DefJA",
          "Gloss", "POS", "Register", "Collocations", "Confusables", "Note", "Kanji", "Module", "Passage",
          "Production"]


def tags(m: dict, c: dict) -> list[str]:
    t = [DECK_ID, f"km::{m['id']}"]
    t += [f"km::register::{r}" for r in c["register"].split("・") if r]
    if c.get("kanji"):
        t.append("km::kanji")
    if c.get("confusables"):
        t.append("km::has-confusable")
    return t


def subdeck(m: dict) -> str:
    return f"{TITLE['ja']} Kotoba Mine::{m['order']:02d} {m['title']['ja'].split(' — ')[0]}"


def build_tsv(mods: list[dict]) -> Path:
    lines = [
        "#separator:tab",
        "#html:true",
        "#notetype:Kotoba Mine (sentence)",
        f"#columns:{chr(9).join(FIELDS)}\tDeck\tTags",
        f"#deck column:{len(FIELDS) + 1}",
        f"#tags column:{len(FIELDS) + 2}",
    ]
    for m in mods:
        for c in m["cards"]:
            f = note_fields(m, c)
            row = [f[k].replace("\t", " ").replace("\n", "<br>") for k in FIELDS]
            row += [subdeck(m), " ".join(tags(m, c))]
            lines.append("\t".join(row))
    out = DIST / "kotoba-mine.tsv"
    out.write_text("\n".join(lines) + "\n", "utf-8")
    return out


def stable_id(s: str) -> int:
    return int(hashlib.sha1(s.encode()).hexdigest()[:12], 16) % (1 << 31) + (1 << 30)


def build_apkg(mods: list[dict]) -> Path | None:
    try:
        import genanki
    except ImportError:
        print("  · genanki not installed — skipping .apkg (pip install genanki)")
        return None
    tmpl = (HERE / "anki").resolve()
    model = genanki.Model(
        stable_id("kotoba-mine-model-v1"),
        "Kotoba Mine (sentence)",
        fields=[{"name": f} for f in FIELDS],
        templates=[
            {"name": "認識 Recognition",
             "qfmt": (tmpl / "recognition-front.html").read_text("utf-8"),
             "afmt": (tmpl / "back.html").read_text("utf-8")},
            {"name": "産出 Production",
             "qfmt": (tmpl / "production-front.html").read_text("utf-8"),
             "afmt": (tmpl / "back.html").read_text("utf-8")},
        ],
        css=(tmpl / "style.css").read_text("utf-8"),
        sort_field_index=0,
    )

    class Note(genanki.Note):
        @property
        def guid(self):
            return genanki.guid_for(self.fields[0], DECK_ID)

    decks = []
    for m in mods:
        d = genanki.Deck(stable_id(f"kotoba-mine-deck-{m['id']}"), subdeck(m))
        d.description = (f"{html.escape(m['title']['en'])}<br>Read the module passage first: "
                         f"『{html.escape(m['passage']['title'])}』 (in Bunki's shelf, or study.html → 読む).")
        for c in m["cards"]:
            f = note_fields(m, c)
            d.add_note(Note(model=model, fields=[f[k] for k in FIELDS], tags=tags(m, c), sort_field=f["Key"]))
        decks.append(d)
    out = DIST / "kotoba-mine.apkg"
    genanki.Package(decks).write_to_file(str(out))
    return out


# --------------------------------------------------------------------------
# Standalone study page
# --------------------------------------------------------------------------
CONTEXT_MIN = 100  # a card front is at least a short paragraph of the passage
PUNCT_POS = {"補助記号", "記号", "空白"}


def _tok(t: dict) -> list:
    """Compact token for the study page: [surface] for punctuation, else
    [surface, ruby, base] — ruby 0 when no part carries a reading, else
    [[text, reading], …] (reading '' on okurigana); base '' when it is the surface."""
    if t["p"] in PUNCT_POS:
        return [t["s"]]
    f = t.get("f") or [{"t": t["s"]}]
    if t["s"] == "私" and f[0].get("r") == "わたくし":
        f = [{"t": "私", "r": "わたし"}]  # UniDic reads the bare 私 formally; prose means わたし
    ruby = [[x["t"], x.get("r") or ""] for x in f] if any(x.get("r") for x in f) else 0
    return [t["s"], ruby, "" if t["b"] == t["s"] else t["b"]]


def _merge_span(tokens: list[dict], a: int, b: int, card: dict, bc) -> tuple[list[dict], int]:
    """Merge the tokens covering characters [a, b) into one token whose base is the
    headword (the cloze blanks exactly that token). Returns (tokens, merged index)."""
    offsets, pos = [], 0
    for t in tokens:
        offsets.append(pos)
        pos += len(t["s"])
    first = max(i for i, o in enumerate(offsets) if o <= a)
    last = max(i for i, o in enumerate(offsets) if o < b)
    group = tokens[first : last + 1]
    surface = "".join(t["s"] for t in group)
    reading = card["reading"]
    if surface == card["term"] and re.fullmatch(r"[ぁ-ゖー]+", reading or ""):
        furi = bc.furigana_pairs(surface, reading)
    else:
        furi = [f for t in group for f in t["f"]]
    merged = {"s": surface, "b": card["term"], "p": group[0]["p"], "f": furi, "c": True}
    return tokens[:first] + [merged] + tokens[last + 1 :], first


def study_payload(deck: dict, mods: list[dict]) -> dict:
    """The deck plus what the study page renders: every passage paragraph as
    tokens with furigana, each card's anchor in it and its front window (the
    paragraph around the mined sentence, widened to CONTEXT_MIN characters),
    and every other example sentence tokenised with its target merged."""
    sys.path.insert(0, str(CORRIDOR / "tools"))
    sys.path.insert(0, str(REPO))
    import build_corridor as bc  # noqa: E402
    from corpus.grading._mecab import get_tagger  # noqa: E402

    tagger = get_tagger()
    if not all(m.get("tokenIndex") for m in mods):
        # --no-corridor: take each card's anchor from the committed corridor deck
        shipped = json.loads(CORRIDOR_DECK.read_text("utf-8"))
        by_id = {m["id"]: {c["n"]: c["i"] for c in m["cards"] if "i" in c} for m in shipped["modules"]}
        for m in mods:
            m["tokenIndex"] = by_id.get(m["id"], {})
    out = json.loads(json.dumps(deck))
    for om, m in zip(out["modules"], mods):
        art = json.loads((ARTICLES / f"{ARTICLE_PREFIX}{m['id']}.json").read_text("utf-8"))
        toks, starts = art["tokens"], [0, *art["paras"], len(art["tokens"])]
        paras = [toks[starts[i] : starts[i + 1]] for i in range(len(starts) - 1)]
        plen = [sum(len(t["s"]) for t in p) for p in paras]
        om["paras"] = [[_tok(t) for t in p] for p in paras]
        for oc, c in zip(om["cards"], m["cards"]):
            gi = m["tokenIndex"][c["n"]]
            pi = max(i for i in range(len(paras)) if starts[i] <= gi)
            if toks[gi]["b"] != c["term"]:
                raise SystemExit(f"#{c['n']} {c['term']}: anchor token is {toks[gi]['s']}")
            a = b = pi
            while sum(plen[a : b + 1]) < CONTEXT_MIN and (a > 0 or b < len(paras) - 1):
                if b < len(paras) - 1:
                    b += 1
                else:
                    a -= 1
            oc["at"] = [pi, gi - starts[pi]]
            oc["ctx"] = [a, b]
            for os_, s in zip(oc["sentences"][1:], c["sentences"][1:]):
                stoks = bc.tokenise(s["ja"], tagger)
                at = s["ja"].find(s["form"])
                if at < 0:
                    raise SystemExit(f"#{c['n']}: form {s['form']} not in {s['ja']}")
                stoks, ti = _merge_span(stoks, at, at + len(s["form"]), c, bc)
                os_["toks"] = [_tok(t) for t in stoks]
                os_["at"] = ti
        om["passage"].pop("text", None)
    return out


KANJI_RE = re.compile(r"[\u3400-\u9fff々]")
ENDS_RE = re.compile(r"[。！？!?]")


def _stem(tok: list) -> str:
    """the written stem of a compact token: up to its last kanji with a reading (ending excluded)"""
    if len(tok) < 2 or not isinstance(tok[1], list):
        return tok[0]
    last = max((i for i, (_, r) in enumerate(tok[1]) if r), default=-1)
    return "".join(t for t, _ in tok[1][: last + 1])


def _sentence_span(para: list, ti: int) -> tuple[int, int]:
    a, b = 0, len(para) - 1
    for i in range(ti - 1, -1, -1):
        if ENDS_RE.search(para[i][0]):
            a = i + 1
            break
    for i in range(ti, len(para)):
        if ENDS_RE.search(para[i][0]):
            b = i + (1 if i + 1 < len(para) and para[i + 1][0][:1] in "」』）" else 0)
            break
    return a, b


def context_html(mp: dict, c: dict, cloze: bool) -> str:
    """A card front for Anki, by the study page's own rules (study.html maskOf / contextEl):
    the passage paragraph around the mined sentence, that sentence in full ink and its
    neighbours dimmed; recognition bolds the word, the cloze hides every spelling of it."""
    pi0, ti0 = c["at"]
    anchor = mp["paras"][pi0][ti0]
    out = []
    for pi in range(c["ctx"][0], c["ctx"][1] + 1):
        para = mp["paras"][pi]
        text = "".join(t[0] for t in para)
        mk = [False] * len(text)
        if cloze:
            off = 0
            for ti, tok in enumerate(para):
                size = len(tok[0])
                if len(tok) > 1 and c["pos"] != "kanji" and ((pi, ti) == (pi0, ti0) or c["term"] in (tok[0], tok[2])):
                    k = min(size, len(_stem(tok)) or size)
                    mk[off : off + k] = [True] * k
                off += size
            needles = [c["term"]] if KANJI_RE.search(c["term"]) else []
            if c["pos"] != "kanji":
                st0 = _stem(anchor)
                if len(st0) >= 2 and KANJI_RE.search(st0):
                    needles.append(st0)
            for nd in needles:
                i = text.find(nd)
                while i >= 0:
                    mk[i : i + len(nd)] = [True] * len(nd)
                    i = text.find(nd, i + len(nd))
        sa, sb = _sentence_span(para, ti0) if pi == pi0 else (len(para), -1)
        runs: list[tuple[bool, str]] = []
        off, in_blank = 0, False
        for ti, tok in enumerate(para):
            dim = not (sa <= ti <= sb)
            if cloze:
                piece = ""
                for i, ch in enumerate(tok[0]):
                    if mk[off + i]:
                        if not in_blank:
                            piece += '<span class="blank">［？］</span>'
                            in_blank = True
                    else:
                        piece += html.escape(ch)
                        in_blank = False
            else:
                piece = f'<b class="t">{html.escape(tok[0])}</b>' if (pi, ti) == (pi0, ti0) else html.escape(tok[0])
            off += len(tok[0])
            if runs and runs[-1][0] == dim:
                runs[-1] = (dim, runs[-1][1] + piece)
            else:
                runs.append((dim, piece))
        out.append('<div class="p">' + "".join(f'<span class="dim">{t}</span>' if d else t for d, t in runs) + "</div>")
    return "".join(out)


def check_fronts(payload: dict) -> list[str]:
    """No front may hand over its answer: a cloze never shows the headword (or a ≥2-character
    written stem of it, or a kana headword of ≥3), and recognition always bolds exactly one word."""
    leaks = []
    for mp in payload["modules"]:
        for c in mp["cards"]:
            mark_html, cloze_html = CONTEXT[c["key"]]
            seen = re.sub(r"<[^>]+>", "", cloze_html)
            st0 = c["term"] if c["pos"] == "kanji" else _stem(mp["paras"][c["at"][0]][c["at"][1]])
            if KANJI_RE.search(c["term"]) and c["term"] in seen:
                leaks.append(f"{c['key']} {c['term']}")
            elif (len(st0) >= 2 or c["pos"] == "kanji") and KANJI_RE.search(st0) and st0 in seen:
                leaks.append(f"{c['key']} stem {st0}")
            elif not KANJI_RE.search(c["term"]) and len(c["term"]) >= 3 and c["term"] in seen:
                leaks.append(f"{c['key']} kana {c['term']}")
            elif "blank" not in cloze_html or mark_html.count('<b class="t">') != 1:
                leaks.append(f"{c['key']} shape")
    return leaks


def build_study(data: dict) -> Path:
    page = (HERE / "study" / "study.html").read_text("utf-8")
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    body = re.sub(r"/\*__DECK__\*/ ?null", lambda _: payload, page, count=1)
    # a full document so the file opens straight from disk in any browser
    head = (
        '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    )
    doc = head + body + "\n</html>\n"
    out = DIST / "study.html"
    out.write_text(doc, "utf-8")
    # the same bytes, published beside Bunki (pages-app.yml copies the corridor's
    # decks/kotoba-mine/) so the cards and 単語帳 share one origin and one ledger
    bunki = CORRIDOR / "decks" / "kotoba-mine" / "index.html"
    bunki.parent.mkdir(parents=True, exist_ok=True)
    bunki.write_text(doc, "utf-8")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-corridor", action="store_true")
    ap.add_argument("--no-anki", action="store_true")
    args = ap.parse_args()
    mods = load_modules()
    n = sum(len(m["cards"]) for m in mods)
    print(f"· {len(mods)} modules, {n} cards validated")
    report = {}
    if not args.no_corridor:
        print("· corridor articles")
        report = build_corridor(mods)
        CORRIDOR_DECK.parent.mkdir(parents=True, exist_ok=True)
        CORRIDOR_DECK.write_text(json.dumps(corridor_deck(mods), ensure_ascii=False, separators=(",", ":")), "utf-8")
        print(f"  {CORRIDOR_DECK.relative_to(REPO)}")
    deck = canonical(mods)
    (DECK / "deck.json").write_text(json.dumps(deck, ensure_ascii=False, indent=1) + "\n", "utf-8")
    DIST.mkdir(exist_ok=True)
    study = study_payload(deck, mods)
    for mp in study["modules"]:
        for c in mp["cards"]:
            CONTEXT[c["key"]] = (context_html(mp, c, False), context_html(mp, c, True))
    leaks = check_fronts(study)
    if leaks:
        raise SystemExit(f"{len(leaks)} card front(s) give the answer away: {', '.join(leaks[:8])}")
    print(f"· {len(CONTEXT)} paragraph fronts, no answer shown on any cloze")
    print(f"· {build_tsv(mods).relative_to(REPO)}")
    if not args.no_anki:
        p = build_apkg(mods)
        if p:
            print(f"· {p.relative_to(REPO)}")
    print(f"· {build_study(study).relative_to(REPO)}")
    if report:
        (DIST / "build-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", "utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
