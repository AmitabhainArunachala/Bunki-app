"""Unit tier for the 青空文庫 source: index CSV traps, strict filter, ruby
parser, and the committed fixtures/sample. No network, no downloads."""

from pathlib import Path

import pytest

from corpus.records import read_jsonl
from corpus.sources.aozora import clean_dataset
from corpus.sources.aozora.index import (
    collect_works,
    github_raw_url,
    is_usable,
    iter_rows,
    usable_works,
)
from corpus.sources.aozora.text import (
    furigana_coverage,
    parse,
    strip_chuki,
    strip_footer,
    strip_header,
)

FIXTURES = Path(__file__).parent / "fixtures" / "aozora"
NEL = "\x85"

HEADER = "作品ID,作品名,文字遣い種別,作品著作権フラグ,役割フラグ,姓,名"


def _csv(tmp_path, body, encoding="utf-8-sig"):
    p = tmp_path / "index.csv"
    p.write_text(body, encoding=encoding, newline="")
    return p


# --- index CSV traps -------------------------------------------------------


def test_bom_is_stripped_from_first_column(tmp_path):
    p = _csv(tmp_path, HEADER + "\r\n001,野ばら,新字新仮名,なし,著者,小川,未明\r\n")
    rows = list(iter_rows(p))
    assert list(rows[0].keys())[0] == "作品ID"
    assert rows[0]["作品ID"] == "001"


def test_nel_inside_field_does_not_split_record(tmp_path):
    quoted = f'001,"野{NEL}ばら",新字新仮名,なし,著者,小川,未明'
    bare = f"002,月夜{NEL}眼鏡,新字新仮名,なし,著者,小川,未明"
    p = _csv(tmp_path, HEADER + "\r\n" + quoted + "\r\n" + bare + "\r\n")
    rows = list(iter_rows(p))
    assert len(rows) == 2
    assert rows[0]["作品名"] == f"野{NEL}ばら"
    assert rows[1]["作品名"] == f"月夜{NEL}眼鏡"
    assert all(None not in r.values() for r in rows), "no spill into extra columns"


def test_crlf_and_quoted_newlines(tmp_path):
    p = _csv(tmp_path, HEADER + '\r\n001,"a\r\nb",新字新仮名,なし,著者,小川,未明\r\n')
    rows = list(iter_rows(p))
    assert len(rows) == 1
    assert rows[0]["作品名"] == "a\r\nb"


# --- strict usable filter --------------------------------------------------


@pytest.mark.parametrize(
    "kana,flag,expected",
    [
        ("新字新仮名", "なし", True),
        ("新字旧仮名", "なし", False),  # the 宮沢賢治 trap: must NOT pass
        ("旧字旧仮名", "なし", False),
        ("旧字新仮名", "なし", False),
        ("その他", "なし", False),
        ("新字新仮名", "あり", False),
    ],
)
def test_strict_filter(kana, flag, expected):
    assert is_usable({"文字遣い種別": kana, "作品著作権フラグ": flag}) is expected


def test_collect_works_dedupes_and_gathers_roles():
    rows = [
        dict(zip(HEADER.split(","), "010,翻訳もの,新字新仮名,なし,著者,森,鴎外".split(","))),
        dict(zip(HEADER.split(","), "010,翻訳もの,新字新仮名,なし,翻訳者,上田,敏".split(","))),
        dict(zip(HEADER.split(","), "011,旧仮名もの,新字旧仮名,なし,著者,森,鴎外".split(","))),
    ]
    works = collect_works(rows)
    assert len(works) == 2
    assert works["010"].authors == ("森鴎外",)
    assert works["010"].translators == ("上田敏",)
    usable = usable_works(works)
    assert set(usable) == {"010"}, "新字旧仮名 work must not survive the filter"


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _mock_download(monkeypatch, payload):
    import corpus.sources.aozora.index as index_module

    monkeypatch.setattr(
        index_module.urllib.request,
        "urlopen",
        lambda url, timeout=0: _FakeResponse(payload),
    )


def test_fetch_index_sha_mismatch_raises(tmp_path, monkeypatch):
    # Default path: pin + expected sha come from PROVENANCE.yml; a drifted
    # download must raise, and nothing may be extracted.
    from corpus.provenance import ProvenanceError
    from corpus.sources.aozora.index import CSV_NAME, fetch_index

    _mock_download(monkeypatch, b"drifted index bytes")
    with pytest.raises(ProvenanceError, match="sha256"):
        fetch_index(tmp_path)
    assert not (tmp_path / CSV_NAME).exists()


def test_fetch_index_verifies_and_extracts(tmp_path, monkeypatch):
    import hashlib
    import io as _io
    import zipfile

    from corpus.sources.aozora.index import CSV_NAME, fetch_index

    buf = _io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(CSV_NAME, "\ufeff作品ID\r\n001\r\n")
    payload = buf.getvalue()
    _mock_download(monkeypatch, payload)
    csv_path = fetch_index(
        tmp_path, expected_sha256=hashlib.sha256(payload).hexdigest()
    )
    assert csv_path == tmp_path / CSV_NAME
    assert "作品ID" in csv_path.read_text(encoding="utf-8-sig")


def test_pinned_index_url():
    from corpus.sources.aozora.index import pinned_index_url

    assert pinned_index_url("abc123") == (
        "https://github.com/aozorabunko/aozorabunko/raw/abc123/"
        "index_pages/list_person_all_extended_utf8.zip"
    )
    assert "master" not in pinned_index_url("abc123")


def test_github_raw_url_maps_onto_pin():
    url = github_raw_url(
        "https://www.aozora.gr.jp/cards/001475/files/51034_ruby_47929.zip", "abc123"
    )
    assert url == (
        "https://raw.githubusercontent.com/aozorabunko/aozorabunko/abc123/"
        "cards/001475/files/51034_ruby_47929.zip"
    )
    with pytest.raises(ValueError):
        github_raw_url("https://example.com/x.zip", "abc123")


# --- ruby / 注記 parsing ---------------------------------------------------


def _file(body: str) -> str:
    """Wrap a body snippet in a realistic Aozora file shape."""
    return f"題名\n著者名\n\n{body}\n\n底本：「何か」出版社\n1990年\n"


def test_bare_ruby_kept_and_fully_covered():
    assert parse(_file("獅子《しし》")) == "獅子《しし》"
    assert furigana_coverage("獅子《しし》") == 1.0


def test_pipe_ruby_base_boundary():
    # ｜ pins the base: 一番 stays a separate, uncovered kanji run.
    assert parse(_file("一番｜獅子《しし》")) == "一番｜獅子《しし》"
    assert furigana_coverage("一番｜獅子《しし》") == 0.5


def test_bare_ruby_applies_to_whole_preceding_kanji_run():
    # Without ｜ the base is the maximal kanji run — Aozora semantics.
    assert furigana_coverage("一番獅子《しし》") == 1.0


def test_bouten_chuki_dropped_text_kept():
    assert strip_chuki("しだ［＃「しだ」に傍点］の一ぱい") == "しだの一ぱい"
    assert parse(_file("しだ［＃「しだ」に傍点］の一ぱい")) == "しだの一ぱい"


def test_general_chuki_dropped():
    assert strip_chuki("［＃７字下げ］一［＃「一」は中見出し］") == "一"


def test_double_guillemet_bouten_is_not_ruby():
    text = "犬《いぬ》と猫が《《どきどき》》した"
    assert furigana_coverage(text) == 0.5  # 犬 covered, 猫 not
    assert parse(_file(text)) == text  # 傍点 marks stay in the text


def test_kana_only_text_coverage_zero():
    assert furigana_coverage("すもももももももものうち") == 0.0


def test_coverage_bounds():
    for text in ("", "漢字", "漢字《かんじ》", "あ漢《かん》字"):
        assert 0.0 <= furigana_coverage(text) <= 1.0


def test_shift_jis_decode():
    raw = _file("獅子《しし》の場合").encode("cp932")
    assert parse(raw) == "獅子《しし》の場合"


def test_header_without_symbol_block():
    text = "題名\n著者名\n\n　本文《ほんぶん》です。"
    assert parse(text) == "　本文《ほんぶん》です。"


def test_snippet_without_header_shape_is_untouched():
    assert strip_header("獅子《しし》の場合") == "獅子《しし》の場合"


def test_footer_trimmed():
    text = "題名\n著者名\n\n本文です。\n\n底本：「何か」出版社\n1990年\n入力：someone"
    assert parse(text) == "本文です。"


# --- real fixtures (committed, from the pinned aozorabunko commit) ---------

FIXTURE_OPENINGS = {
    "nobara.txt": "　大《おお》きな国《くに》と、",
    "gongitsune.txt": "一\n\n　これは、私《わたし》が",
    "yamanashi.txt": "　小さな谷川の底を写した二枚の青い幻燈《げんとう》です。",
}


@pytest.mark.parametrize("name", sorted(FIXTURE_OPENINGS))
def test_fixture_parse(name):
    body = parse((FIXTURES / name).read_bytes())
    assert body.startswith(FIXTURE_OPENINGS[name]), "header trimmed to the body"
    assert "底本" not in body, "footer trimmed"
    assert "【テキスト中に現れる記号について】" not in body
    assert "----" not in body
    assert "［＃" not in body, "注記 stripped"
    assert "《" in body, "ruby preserved"
    cov = furigana_coverage(body)
    assert 0.0 < cov <= 1.0


def test_fixture_bouten_text_survives():
    body = parse((FIXTURES / "gongitsune.txt").read_bytes())
    assert "に傍点" not in body
    assert "しだの一ぱいしげった森" in body, "傍点-annotated text kept"


def test_fixture_ogawa_mimei_has_dense_ruby():
    nobara = furigana_coverage(parse((FIXTURES / "nobara.txt").read_bytes()))
    gon = furigana_coverage(parse((FIXTURES / "gongitsune.txt").read_bytes()))
    assert nobara > 0.9, "小川未明 children's prose is near-fully rubied"
    assert gon < 0.5
    assert nobara > gon


def test_fixture_header_footer_helpers():
    text = (FIXTURES / "nobara.txt").read_bytes().decode("cp932")
    text = text.replace("\r\n", "\n")
    assert "野ばら" in text.split("\n")[0]
    stripped = strip_header(text)
    assert "【テキスト中に現れる記号について】" not in stripped
    assert "底本：" in stripped
    assert "底本" not in strip_footer(stripped)


# --- clean-dataset row conversion -----------------------------------------


def _clean_row(**over):
    meta = {
        "作品ID": "051034",
        "作品名": "野ばら",
        "副題": "",
        "文字遣い種別": "新字新仮名",
        "作品著作権フラグ": "なし",
        "初出": "",
        "公開日": "2011-01-27",
        "図書カードURL": "https://www.aozora.gr.jp/cards/001475/card51034.html",
        "役割フラグ": "著者",
        "姓": "小川",
        "名": "未明",
    }
    meta.update(over.pop("meta", {}))
    row = {"text": "大きな国と…", "meta": meta}
    row.update(over)
    return row


def test_record_from_row_usable():
    rec = clean_dataset.record_from_row(_clean_row(), {"051034": 0.99})
    assert rec is not None
    assert rec.id == "aozora:051034"
    assert rec.source == "aozorabunko-clean"
    assert rec.title == "野ばら"
    assert rec.meta["author"] == "小川未明"
    assert rec.meta["文字遣い種別"] == "新字新仮名"
    assert rec.meta["furigana_coverage"] == 0.99
    assert rec.meta["first_published"] is None


def test_record_from_row_without_coverage_map():
    rec = clean_dataset.record_from_row(_clean_row())
    assert rec is not None and rec.meta["furigana_coverage"] is None


@pytest.mark.parametrize(
    "meta",
    [
        {"文字遣い種別": "新字旧仮名"},  # must NOT pass, even though PD
        {"文字遣い種別": "旧字旧仮名"},
        {"作品著作権フラグ": "あり"},
    ],
)
def test_record_from_row_rejects_non_usable(meta):
    assert clean_dataset.record_from_row(_clean_row(meta=meta)) is None


def test_record_from_row_rejects_empty_text():
    assert clean_dataset.record_from_row(_clean_row(text="  ")) is None


# --- committed sample ------------------------------------------------------


def test_committed_sample_is_valid():
    samples = Path(__file__).parents[1] / "samples" / "aozora"
    records = list(read_jsonl(samples / "sample.jsonl"))
    assert len(records) == 3
    assert len({r.id for r in records}) == 3
    assert all(r.source == "aozorabunko-clean" for r in records)
    assert any(r.meta["author"] == "小川未明" for r in records)
    for r in records:
        cov = r.meta["furigana_coverage"]
        assert cov is not None and 0.0 <= cov <= 1.0
        assert r.meta["文字遣い種別"] == "新字新仮名"
