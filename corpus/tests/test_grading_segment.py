from corpus.grading.segment import split_sentences


def test_basic_terminators():
    assert split_sentences("春だ。夏か！秋？") == ["春だ。", "夏か！", "秋？"]


def test_newline_is_hard_boundary():
    assert split_sentences("一行目\n二行目。三文目") == ["一行目", "二行目。", "三文目"]


def test_terminator_runs_stay_together():
    assert split_sentences("なに？！そうか。") == ["なに？！", "そうか。"]


def test_closing_quote_attaches():
    assert split_sentences("「行くぞ。」と言った。") == ["「行くぞ。」", "と言った。"]


def test_ascii_terminators():
    assert split_sentences("Go!いいね?") == ["Go!", "いいね?"]


def test_no_terminator_leftover_kept():
    assert split_sentences("終わらない文") == ["終わらない文"]


def test_empty_and_whitespace():
    assert split_sentences("") == []
    assert split_sentences("  \n\n  ") == []
