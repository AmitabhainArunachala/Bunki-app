from corpus.grading.jread import BANDS, band_of, jread_signal


def test_band_edges_lower_is_harder():
    assert band_of(0.5) == ("上級後半", True)
    assert band_of(1.49) == ("上級後半", True)
    assert band_of(1.5) == ("上級前半", True)
    assert band_of(2.5) == ("中級後半", True)
    assert band_of(3.5) == ("中級前半", True)
    assert band_of(4.5) == ("初級後半", True)
    assert band_of(5.5) == ("初級前半", True)
    assert band_of(6.49) == ("初級前半", True)


def test_out_of_scale_clamps():
    assert band_of(0.49) == ("上級後半", False)
    assert band_of(-1.0) == ("上級後半", False)
    assert band_of(6.5) == ("初級前半", False)
    assert band_of(10.0) == ("初級前半", False)


def test_bands_cover_scale_contiguously():
    for (lo, hi, _ja, _en), (lo2, _hi2, _ja2, _en2) in zip(BANDS, BANDS[1:]):
        assert hi == lo2
        assert lo < hi


def test_signal_on_easy_sentence():
    # README example: おはようございます！今日は天気がいいですね。 → 6.438
    sig = jread_signal("おはようございます！今日は天気がいいですね。")
    assert 5.5 <= sig["score"] < 6.5
    assert sig["band"] == "初級前半"
    assert sig["in_scale"] is True
    assert sig["substrate"] == "jreadability-1.1.5/unidic-2.1.2"
