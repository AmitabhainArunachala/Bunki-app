import pytest

from corpus.records import CorpusRecord, RecordError, read_jsonl, write_jsonl


def rec(i="wikinews:1", text="本文です。", **kw):
    return CorpusRecord(id=i, source="ja-wikinews", title="題", text=text, **kw)


def test_roundtrip(tmp_path):
    records = [
        rec("wikinews:1", meta={"date": "2026-05-01", "categories": ["政治"]}),
        rec("wikinews:2", text="｜漢字《かんじ》を含む。"),
    ]
    path = tmp_path / "out.jsonl"
    assert write_jsonl(records, path) == 2
    back = list(read_jsonl(path))
    assert back == records
    assert back[1].text == "｜漢字《かんじ》を含む。"


def test_utf8_not_escaped(tmp_path):
    path = tmp_path / "out.jsonl"
    write_jsonl([rec()], path)
    raw = path.read_text(encoding="utf-8")
    assert "本文です。" in raw and "\\u" not in raw


def test_empty_id_rejected():
    with pytest.raises(RecordError):
        rec("")


def test_empty_text_rejected():
    with pytest.raises(RecordError):
        rec(text="")


def test_unserialisable_meta_rejected():
    with pytest.raises(RecordError, match="JSON"):
        rec(meta={"bad": object()})


def test_duplicate_ids_rejected(tmp_path):
    with pytest.raises(RecordError, match="duplicate"):
        write_jsonl([rec("x:1"), rec("x:1")], tmp_path / "out.jsonl")


def test_nan_meta_rejected():
    with pytest.raises(RecordError, match="JSON"):
        rec(meta={"score": float("nan")})


def test_bom_and_crlf_jsonl_tolerated(tmp_path):
    p = tmp_path / "bom.jsonl"
    line = '{"id": "a:1", "source": "s", "title": "", "text": "本文", "meta": {}}'
    p.write_bytes(b"\xef\xbb\xbf" + line.encode("utf-8") + b"\r\n")
    [record] = list(read_jsonl(p))
    assert record.id == "a:1" and record.text == "本文"


def test_unexpected_key_wrapped_as_record_error(tmp_path):
    p = tmp_path / "bad.jsonl"
    p.write_text(
        '{"id": "a", "source": "s", "title": "", "text": "t", "meta": {}, "sneaky": 1}\n'
    )
    with pytest.raises(RecordError, match=":1: bad record shape"):
        list(read_jsonl(p))


def test_invalid_jsonl_line_reported_with_lineno(tmp_path):
    p = tmp_path / "bad.jsonl"
    p.write_text('{"id": "a", "source": "s", "title": "", "text": "t", "meta": {}}\nnot json\n')
    it = read_jsonl(p)
    next(it)
    with pytest.raises(RecordError, match=":2:"):
        next(it)
