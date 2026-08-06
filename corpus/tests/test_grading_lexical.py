import pytest

from corpus.grading.lexical import lexical_signal


def test_toy_coverage_exact():
    # content tokens of 猫が魚を食べる。 = [猫, 魚, 食べる]
    sig = lexical_signal("猫が魚を食べる。", word_set={"猫", "食べる"})
    assert sig["n_content_tokens"] == 3
    assert sig["coverage"] == pytest.approx(2 / 3)
    assert sig["type_coverage"] == pytest.approx(2 / 3)
    assert sig["band_vector"]["known"] == pytest.approx(2 / 3)
    assert sig["band_vector"]["oov"] == pytest.approx(1 / 3)
    assert sig["substrate"] == "caller:word-set"


def test_orthbase_matches_kanji_lemma():
    # する has UniDic lemma 為る but orthBase する — word lists use する
    sig = lexical_signal("勉強する。", word_set={"する"})
    assert sig["n_content_tokens"] == 2  # 勉強, する
    assert sig["coverage"] == pytest.approx(1 / 2)


def test_katakana_headword_matches_via_kana_normalization():
    sig = lexical_signal("アルバイトです。", word_set={"あるばいと"})
    assert sig["coverage"] == pytest.approx(1.0)


def test_function_words_and_punct_excluded():
    sig = lexical_signal("これは、それです。", word_set={"これ", "それ"})
    # content tokens: これ, それ (は/です/、/。 excluded)
    assert sig["n_content_tokens"] == 2
    assert sig["coverage"] == pytest.approx(1.0)


def test_no_content_tokens():
    sig = lexical_signal("。、！", word_set={"猫"})
    assert sig["coverage"] is None
    assert sig["type_coverage"] is None
    assert sig["band_vector"] == {}
    assert sig["n_content_tokens"] == 0


def test_proper_nouns_excluded():
    # 東京 is 固有名詞 — excluded from the content stream entirely
    sig = lexical_signal("東京へ行く。", word_set={"行く"})
    assert sig["n_content_tokens"] == 1
    assert sig["coverage"] == pytest.approx(1.0)
