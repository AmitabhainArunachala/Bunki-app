from pathlib import Path

import pytest

from corpus.grading._mecab import get_tagger
from corpus.grading.ninjal import (
    SHA256,
    Vocabulary,
    _build,
    _hyoki_variants,
    _rows,
    ensure_downloaded,
)

FIXTURE = Path(__file__).parent / "fixtures" / "ninjal_fixture.csv"


def test_hyoki_variant_cleaning():
    assert _hyoki_variants("×挨×拶") == ["挨拶"]
    assert _hyoki_variants("愛△敬・愛×嬌") == ["愛敬", "愛嬌"]
    assert _hyoki_variants("《明日》") == ["明日"]
    assert _hyoki_variants("〈明日〉") == ["明日"]
    assert _hyoki_variants("腕《時計》") == ["腕時計"]
    # loanword etymologies are not orthographies
    assert _hyoki_variants("←apartment house") == []
    assert _hyoki_variants("〔蘭〕alkali") == []
    assert _hyoki_variants("〔蘭〕inkt・〔英〕ink") == []
    # unrepresentable-glyph variants are dropped, real ones kept
    assert _hyoki_variants("×焚く・炊く・×？く") == ["焚く", "炊く"]
    assert _hyoki_variants("club（同好者の集まり）") == []
    assert _hyoki_variants("") == []


def test_fixture_parses_cp932_and_builds_bands():
    rows = _rows(FIXTURE)
    assert len(rows) == 10
    core_o, core_k = _build(rows, lambda m: m.strip() == "◎")
    full_o, full_k = _build(rows, lambda m: m.strip() in ("◎", "○"))
    assert {"挨拶", "明日", "アパート", "する"} <= core_o
    assert "愛嬌" not in core_o
    assert {"愛敬", "愛嬌", "焚く", "炊く", "腕時計", "アルカリ"} <= full_o
    # unmarked rows never enter the substrate
    assert "ぼんやり" not in full_o
    # katakana headwords are kana-normalized for reading matches
    assert "あぱーと" in core_k
    assert "あるかり" in full_k


def test_vocabulary_contains_with_real_tokens():
    rows = _rows(FIXTURE)
    full_o, full_k = _build(rows, lambda m: m.strip() in ("◎", "○"))
    vocab = Vocabulary("test:fixture", frozenset(full_o), frozenset(full_k))
    tagger = get_tagger()

    def toks(text):
        return [t for t in tagger(text)]

    aisatsu = [t for t in toks("挨拶する。") if t.surface == "挨拶"][0]
    assert vocab.contains(aisatsu)
    # する: lemma is 為る, orthBase する — must match via orthBase
    suru = [t for t in toks("挨拶する。") if t.feature.orthBase == "する"][0]
    assert vocab.contains(suru)
    # kana-written form matches through kana normalization
    apaato = toks("アパート")[0]
    assert vocab.contains(apaato)
    inu = [t for t in toks("犬が走る。") if t.surface == "犬"][0]
    assert not vocab.contains(inu)


def test_sha256_mismatch_raises(tmp_path):
    bad = tmp_path / "rokusyutaisyo.csv"
    bad.write_bytes(b"not the real file")
    with pytest.raises(RuntimeError, match="sha256"):
        ensure_downloaded(bad)
    assert len(SHA256) == 64
