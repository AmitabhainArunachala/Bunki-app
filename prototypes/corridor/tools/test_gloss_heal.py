"""Offline checks for tools/gloss_heal.py: a gloss wbig cut at 32 characters is
completed only from an entry read the way the word is read — dict.json's full gloss
when it is that word's and carries no other reading's sense, else JMdict's.

Run:  python -m pytest prototypes/corridor/tools/test_gloss_heal.py -q
"""

from __future__ import annotations

import json
from copy import deepcopy
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


def test_reviewed_short_and_empty_glosses_use_the_exact_reading(share: Path):
    words = {
        "拍子": {"r": "ひょうし", "g": "", "fromText": True, "rd": True},
        "初耳": {"r": "はつみみ", "g": "something heard for the first…", "jlpt": "n1"},
        "金": {"r": "かね", "g": "gold, metal; money", "k": ["金"]},
    }
    before = deepcopy(words)
    assert gloss_heal.heal_words(words, share) == 3
    assert {key: row["g"] for key, row in words.items()} == {
        "拍子": "time; meter; rhythm",
        "初耳": "something heard for the first time",
        "金": "money; metal",
    }
    for key, row in words.items():
        assert {k: v for k, v in row.items() if k != "g"} == {
            k: v for k, v in before[key].items() if k != "g"
        }
    assert gloss_heal.heal_words(words, share) == 0


def test_reviewed_glosses_leave_other_readings_and_empty_words_untouched(share: Path):
    words = {"金": {"r": "きん", "g": "gold"}, "別語": {"r": "べつご", "g": ""},
             "拍子": {"r": "ひょうし以外", "g": "keep this"}}
    before = deepcopy(words)
    assert gloss_heal.heal_words(words, share) == 0
    assert gloss_heal.apply_reviewed_glosses(words) == 0
    assert words == before


def test_reviewed_final_pass_covers_words_added_after_the_dictionary_pass(share: Path):
    words = {"金": {"r": "かね", "g": "gold, metal; money"}}
    assert gloss_heal.heal_words(words, share) == 1
    # The generator adds shelf/semantic words after its full dictionary pass,
    # then derives any missing reading. Finalization must cover those late rows.
    words["拍子"] = {"r": "ひょうし", "g": "", "fromText": True}
    words["初耳"] = {"r": "はつみみ", "g": "something heard for the first…"}
    words["光沢"] = {"r": "こうたく", "g": cut("luster, glossy finish (of photographs)")}
    other = deepcopy(words["光沢"])
    assert gloss_heal.apply_reviewed_glosses(words) == 2
    assert words["拍子"]["g"] == "time; meter; rhythm"
    assert words["初耳"]["g"] == "something heard for the first time"
    assert words["光沢"] == other, "final pass must not broaden dictionary healing"
    assert gloss_heal.apply_reviewed_glosses(words) == 0
