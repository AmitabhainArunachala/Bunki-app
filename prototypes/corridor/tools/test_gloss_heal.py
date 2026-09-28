"""Offline checks for tools/gloss_heal.py: a gloss wbig cut at 32 characters is
completed only from an entry read the way the word is read — dict.json's full gloss
when it is that word's and carries no other reading's sense, else JMdict's.

Run:  python -m pytest prototypes/corridor/tools/test_gloss_heal.py -q
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import gloss_heal  # noqa: E402


def sense(glosses, kanji=("*",), kana=("*",)):
    return [["v5k"], list(kanji), list(kana), [], [], [], [], [], [], [], [[g, None, None] for g in glosses]]


# shaped like the real dict-v2 detail rows (JMdict 1586270, 1586265, 1583260, 1273050)
ENTRIES = [
    ["1586270", [["開く", 1, []], ["空く", 1, []]], [["あく", 1, [], ["*"]]], [
        sense(["to open (e.g. doors)"]),
        sense(["to open (e.g. business, etc.)"]),
        sense(["to be empty"]),
        sense(["to be vacant", "to be available", "to be free"]),
    ]],
    ["1586265", [["空く", 1, []]], [["すく", 1, [], ["*"]]], [
        sense(["to become less crowded", "to thin out", "to get empty"]),
        sense(["to be hungry"]),
    ]],
    ["1583260", [["避ける", 1, []], ["除ける", 0, []]], [["さける", 1, [], ["避ける"]], ["よける", 1, [], ["*"]]], [
        sense(["to avoid (physical contact with)"], kana=["よける"]),
        sense(["to avoid (situation)", "to evade (question, subject)"], kana=["さける"]),
        sense(["to ward off", "to avert"]),
    ]],
    ["1273050", [["光沢", 1, []]], [["こうたく", 1, [], ["*"]]], [
        sense(["brilliance", "polish", "lustre", "luster"]),
    ]],
]

# dict.json carries one reading per headword (空く only as すく), and flattens every sense —
# 避ける's included よける's "to avoid (physical contact with)"
DICT = {
    "空く": {"r": "すく", "m": ["to become less crowded", "to thin out", "to get empty", "to be hungry"]},
    "避ける": {"r": "さける", "m": ["to avoid (situation)", "to avoid (physical contact with)", "to ward off"]},
    "光沢": {"r": "こうたく", "m": ["brilliance", "polish", "lustre", "luster", "glossy finish"]},
    "碑文": {"r": "ひぶん", "m": ["inscription", "epitaph", "epigraph on a stone monument"]},
    "上手": {"r": "じょうず", "m": ["skillful", "skilled", "proficient", "good (at)", "adept", "clever"]},
}


@pytest.fixture()
def share(tmp_path: Path) -> Path:
    (tmp_path / "dict-v2").mkdir()
    (tmp_path / "dict-v2" / "00.json").write_text(json.dumps({"entries": ENTRIES}, ensure_ascii=False), "utf-8")
    (tmp_path / "dict.json").write_text(json.dumps({"words": DICT}, ensure_ascii=False), "utf-8")
    return tmp_path


def cut(text: str) -> str:
    stub = text[: gloss_heal.GLOSS_CAP]
    assert len(stub) == gloss_heal.GLOSS_CAP
    return stub


def test_a_homograph_takes_the_meaning_of_its_own_reading(share: Path):
    words = {"空く": {"w": "空く", "r": "あく", "g": "to open, to become empty (vacant"}}
    assert gloss_heal.heal_words(words, share) == 1
    assert words["空く"]["g"] == "to open (e.g. doors); to open (e.g. business, etc.); to be empty"
    # the same written form read すく gets すく's meaning (dict.json's, whose reading is すく)
    words = {"空く": {"w": "空く", "r": "すく", "g": cut("to become less crowded, to thin out, to get empty")}}
    gloss_heal.heal_words(words, share)
    assert words["空く"]["g"] == "to become less crowded; to thin out; to get empty; to be hungry"


def test_a_sense_jmdict_gives_another_reading_is_left_out(share: Path):
    # dict.json's 避ける is read さける but carries よける's sense: JMdict's entry wins
    words = {"避ける": {"w": "避ける", "r": "さける", "g": cut("to avoid (situation), to evade (question, subject)")}}
    gloss_heal.heal_words(words, share)
    assert words["避ける"]["g"] == "to avoid (situation), to evade (question, subject); to ward off, to avert"
    # control: read よける, the よける-only sense is the first meaning
    words = {"避ける": {"w": "避ける", "r": "よける", "g": cut("to avoid (physical contact with); to ward off")}}
    gloss_heal.heal_words(words, share)
    assert words["避ける"]["g"] == "to avoid (physical contact with); to ward off, to avert"


def test_dict_json_completes_only_a_word_read_the_same_way(share: Path):
    # read the same way, dict.json's full gloss wins over JMdict's 3×3 cut: 光沢 keeps "glossy finish"
    words = {"光沢": {"w": "光沢", "r": "こうたく", "g": cut("luster, glossy finish (of photographs)")}}
    gloss_heal.heal_words(words, share)
    assert words["光沢"]["g"] == "brilliance; polish; lustre; luster; glossy finish"
    words = {
        "上手": {"w": "上手", "r": "じょうず", "g": cut("skillful, skilled, proficient, good (at)")},
        # dict.json's 碑文 is ひぶん; a 碑文 read otherwise keeps its cut gloss
        "碑文": {"w": "碑文", "r": "いしぶみ", "g": cut("inscription, epitaph, epigraph on a stone")},
    }
    stub = words["碑文"]["g"]
    assert gloss_heal.heal_words(words, share) == 1
    assert words["上手"]["g"] == "skillful; skilled; proficient; good (at); adept; clever"
    assert words["碑文"]["g"] == stub


def test_short_glosses_stay_and_a_second_heal_changes_nothing(share: Path):
    words = {
        "空く": {"w": "空く", "r": "あく", "g": "to open, to become empty (vacant"},
        "開く": {"w": "開く", "r": "あく", "g": "to open"},
        "光沢": {"w": "光沢", "r": "こうたく", "g": cut("luster, glossy finish (of photographs)")},
    }
    assert gloss_heal.heal_words(words, share) == 2
    assert words["開く"]["g"] == "to open"
    healed = json.dumps(words, ensure_ascii=False)
    assert gloss_heal.heal_words(words, share) == 0
    assert json.dumps(words, ensure_ascii=False) == healed
