#!/usr/bin/env python3
"""Build the N2/N1 decks (n2, n1, senmon) from accepted passage cards.

usage: python3 decks/n2n1/tools/build_n2n1.py [--only DECK] [--cards DIR]

Input: decks/n2n1/source/cards/*.json, each {"cards": [...]} of writer cards (prompts/writer.md)
that passed tools/check_cards.py and the judge, each carrying the target's `deck` and `field`
(from source/targets.json). Output: prototypes/corridor/decks/<deck>/deck.json + tokens.json in
the bunki-cloze-deck format the player already plays.

The leaf tools are kotoba-mine's own: furigana and the target marker (_ordered_for), the
target sentence's English (target_sentence_en), kanji anatomy, level labels and the tokens
side file (tokens_file). Ids are content-keyed, so a rebuild never renumbers a card: a word is
nn-<sha1(term|reading)[:10]>, a card is <word id>-<sha1(ja)[:8]>. An editorial
replacement may carry the original `cardId` to preserve its review identity.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.argv, ARGS = sys.argv[:1], sys.argv[1:]  # build.py reads its flags at import
sys.path.insert(0, str(REPO / "decks/kotoba-mine/tools"))
sys.path.insert(0, str(REPO / "prototypes/corridor/tools"))
import build as km  # noqa: E402
import build_corridor as bc  # noqa: E402

SRC = REPO / "decks/n2n1/source"
OUT = REPO / "prototypes/corridor/decks"
TOPICS = {
    "mind": ("心と学び", "The mind and learning"),
    "india": ("インド・仏教", "Indian and Buddhist philosophy"),
    "ai": ("AI・半導体", "AI and semiconductors"),
    "history": ("世界史", "World history"),
    "language": ("日本語", "Japanese about Japanese"),
    "other": ("教養", "Wider interests"),
}
DECKS = {
    "n2": ("N2の語・短い文章で", "N2 words · in short passages", "ai"),
    "n1": ("N1の語・短い文章で", "N1 words · in short passages", "ai"),
    "senmon": ("専門・あなたの分野", "Your fields · master's level", "washi"),
    "n2n1-sample": ("N2・N1 見本（20枚）", "N2/N1 sample · 20 cards", "ai"),
}
POS = {"noun": "noun", "verb": "verb", "i-adj": "い-adjective", "na-adj": "な-adjective",
       "adverb": "adverb", "expression": "expression", "other": "expression"}
METHOD = [
    "N2・N1 相当の語を、一枚に一つ、4〜5文の文章の中で覚えるデッキです。ふだんは「読んで思い出す」で解きます。",
    "表：このデッキのために書いた文章。覚える言葉は色つき。読み・英語は出ない。読んで、意味と読みを思い出してからタップ。",
    "裏：ふりがな付きの全文、読み、品詞、日本語の説明と使い方。英語の意味とその文の英訳はタップで開く。",
    "文章はすべて書き下ろし。自然さ・事実・レベルを、書き手とは別のモデルが一枚ずつ確かめています。級は公開リストによる目安です。",
]
PROVENANCE = ("Every passage was written for this deck (書き下ろし) and checked card by card by a judge from a "
              "different model family for naturalness, facts and level. Levels are estimates from public "
              "JLPT-style lists (open-anki-jlpt-decks / tanos lineage), shown as 目安.")


def sha(s: str, n: int) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:n]


def load_cards(folder: Path) -> list[dict]:
    out: list[dict] = []
    for f in sorted(folder.glob("*.json")):
        data = json.loads(f.read_text("utf-8"))
        out.extend(data["cards"] if isinstance(data, dict) else data)
    return out


def build(deck_id: str, cards: list[dict], tagger, table: dict[str, str]) -> dict:
    title_ja, title_en, look = DECKS[deck_id]
    words: dict[str, dict] = {}
    card_ids: set[str] = set()
    for c in cards:
        wid = "nn-" + sha(f"{c['term']}|{c['reading']}", 10)
        p = c["passage"]
        cid = c.get("cardId", f"{wid}-{sha(p['ja'], 8)}")
        if not isinstance(cid, str) or not re.fullmatch(re.escape(wid) + r"-[0-9a-f]{8}", cid):
            raise SystemExit(f"{c['term']}: cardId must belong to the unchanged word identity")
        if cid in card_ids:
            raise SystemExit(f"{c['term']}: duplicate card ID {cid}")
        card_ids.add(cid)
        w = words.get(wid)
        if w is None:
            level = c.get("level") if c.get("level") in ("N1", "N2") else km.level_for(c["term"], c["reading"])
            w = words[wid] = {"id": wid, "group": p["topic"], "term": c["term"], "reading": c["reading"],
                              "meaning": c["meaning"], "defJa": c["defJa"], "pos": POS.get(c.get("pos"), "expression"),
                              "kanji": km.kanji_anatomy(c["term"], c["reading"]), "cards": []}
            if level:
                w["level"] = level
        ruby = km._ordered_for({"ja": p["ja"], "form": p["form"]}, w, tagger, bc)
        if "".join(seg[0] for seg in ruby) != p["ja"]:
            raise SystemExit(f"{c['term']}: ruby does not spell the passage")
        ti = next(i for i, seg in enumerate(ruby) if len(seg) > 2)
        card = {"id": cid, "lv": len(w["cards"]) + 1, "type": "word", "ja": p["ja"],
                "form": p["form"], "en": p["en"], "kind": "original",
                "src": {"site": "書き下ろし（このデッキ用）", "licence": "Bunki original"},
                "passage": len(w["cards"]) + 1, "register": p["register"], "topic": p["topic"], "ruby": ruby}
        for k in ("tipJa", "sense"):
            if p.get(k):
                card[k] = p[k]
        en_target = km.target_sentence_en(p["ja"], p["en"], sum(len(seg[0]) for seg in ruby[:ti]))
        if en_target is not None:
            card["enTarget"] = en_target
        w["cards"].append(card)
    used = {w["group"] for w in words.values()}
    deck = {"format": "bunki-cloze-deck", "version": 1, "id": deck_id, "titleJa": title_ja, "titleEn": title_en,
            "defaults": {"look": look, "mode": "read", "gloss": "tap", **({"newPerDay": 20} if deck_id == "n2n1-sample" else {})},
            "groups": [{"id": g, "titleJa": TOPICS[g][0], "titleEn": TOPICS[g][1]} for g in TOPICS if g in used],
            "method": METHOD, "words": list(words.values()), "provenance": PROVENANCE}
    terms = {w["term"] for w in deck["words"]}
    side = km.tokens_file(deck, {k: v for k, v in table.items() if k not in terms})
    deck["tokens"] = "tokens.json"
    return deck, side


def main() -> int:
    only = ARGS[ARGS.index("--only") + 1] if "--only" in ARGS else None
    folder = Path(ARGS[ARGS.index("--cards") + 1]) if "--cards" in ARGS else SRC / "cards"
    import fugashi
    tagger = fugashi.Tagger()
    table = km.gloss_ja()
    by_deck: dict[str, list[dict]] = {}
    for c in load_cards(folder):
        by_deck.setdefault(c.get("deck", "n1"), []).append(c)
    for deck_id, cards in sorted(by_deck.items()):
        if only and deck_id != only:
            continue
        deck, side = build(deck_id, cards, tagger, table)
        out = OUT / deck_id
        out.mkdir(parents=True, exist_ok=True)
        (out / "deck.json").write_text(json.dumps(deck, ensure_ascii=False, separators=(",", ":")), "utf-8")
        (out / "tokens.json").write_text(json.dumps(side, ensure_ascii=False, separators=(",", ":")), "utf-8")
        n = sum(len(w["cards"]) for w in deck["words"])
        print(f"· {deck_id}: {len(deck['words'])} words, {n} cards → {out.relative_to(REPO)}/deck.json "
              f"({(out / 'deck.json').stat().st_size // 1024} KB) + tokens.json ({(out / 'tokens.json').stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
