import pytest

from corpus.grading.tmr import tmr_signal


def test_tmr_exact_fractions_hand_computed():
    # content tokens of 美しい猫が古い家で眠る。 = [美しい, 猫, 古い, 家, 眠る]
    levels = {
        "toy:l1": {"猫", "家"},
        "toy:l2": {"美しい"},
        "toy:l3": {"古い", "眠る"},
    }
    sig = tmr_signal("美しい猫が古い家で眠る。", level_lists=levels)
    assert sig["n_tokens"] == 5
    assert sig["by_level"]["toy:l1"] == pytest.approx(3 / 5)
    assert sig["by_level"]["toy:l2"] == pytest.approx(2 / 5)  # cumulative
    assert sig["by_level"]["toy:l3"] == pytest.approx(0.0)
    assert sig["substrate"] == "caller:level-lists"


def test_tmr_simple_pair():
    # content tokens of 猫が走る。 = [猫, 走る]
    sig = tmr_signal("猫が走る。", level_lists={"toy:a": {"猫"}, "toy:b": {"走る"}})
    assert sig["by_level"]["toy:a"] == pytest.approx(1 / 2)
    assert sig["by_level"]["toy:b"] == pytest.approx(0.0)


def test_levels_are_cumulative_not_exclusive():
    # a word allowed at an easier level is never a miss at a harder one
    sig = tmr_signal("猫。", level_lists={"toy:a": {"猫"}, "toy:b": {"犬"}})
    assert sig["by_level"]["toy:a"] == pytest.approx(0.0)
    assert sig["by_level"]["toy:b"] == pytest.approx(0.0)


def test_empty_token_stream():
    sig = tmr_signal("。。。", level_lists={"toy:a": {"猫"}})
    assert sig["by_level"] == {}
    assert sig["n_tokens"] == 0
