"""Unit tier for corpus.sources.wikinews — committed fixture, no downloads."""

from pathlib import Path

import pytest

from corpus.sources.wikinews.extract import (
    ExtractStats,
    article_url,
    extract_records,
    wikitext_to_paragraphs,
)

FIXTURE = Path(__file__).parent / "fixtures" / "wikinews_mini.xml"


@pytest.fixture(scope="module")
def run():
    stats = ExtractStats()
    records = list(extract_records(FIXTURE, stats))
    return records, stats


def by_id(records, rid):
    return next(r for r in records if r.id == rid)


# ------------------------------------------------------------- dump filtering


def test_only_ns0_non_redirect_articles_survive(run):
    records, stats = run
    assert [r.id for r in records] == ["wikinews:100", "wikinews:101", "wikinews:102"]
    assert stats.pages_total == 7
    assert stats.other_ns_skipped == 1
    assert stats.redirects_skipped == 1


def test_portal_excluded_by_title(run):
    _, stats = run
    assert stats.excluded_by_title == ["メインページ"]


def test_template_only_page_excluded_as_empty(run):
    _, stats = run
    assert stats.excluded_empty == ["セ・リーグ打率ランキング"]


# ------------------------------------------------------------------ dates


def test_date_from_hizuke_template(run):
    records, _ = run
    rec = by_id(records, "wikinews:100")
    assert rec.meta["date"] == "2005-07-16"
    assert rec.meta["date_source"] == "日付"


def test_date_from_inline_brackets(run):
    records, _ = run
    rec = by_id(records, "wikinews:101")
    assert rec.meta["date"] == "2012-08-24"
    assert rec.meta["date_source"] == "inline"


def test_date_fallback_to_revision_timestamp(run):
    records, _ = run
    rec = by_id(records, "wikinews:102")
    assert rec.meta["date"] == "2019-11-02"
    assert rec.meta["date_source"] == "revision"


# ------------------------------------------------------------------ metadata


def test_categories_all_three_syntaxes_no_sortkeys(run):
    records, _ = run
    rec = by_id(records, "wikinews:100")
    assert rec.meta["categories"] == [
        "ひと", "文化", "宮城県", "日本", "東北", "訃報", "短歌",
    ]


def test_meta_url_and_dump_stamp(run):
    records, _ = run
    rec = by_id(records, "wikinews:100")
    assert rec.meta["url"] == article_url("訃報 テスト氏")
    assert rec.meta["url"].startswith("https://ja.wikinews.org/wiki/%E8%A8%83")
    assert "_" in rec.meta["url"] and "%20" not in rec.meta["url"]
    assert rec.meta["dump_last_modified"] == "2026-08-04"
    assert rec.source == "ja-wikinews"


# ----------------------------------------------------------- text conversion


def test_body_prose_survives_with_links_unwrapped(run):
    records, _ = run
    text = by_id(records, "wikinews:100").text
    assert "東北大学の名誉教授で歌人の扇畑さんが16日UTC+9、死去した。" in text
    assert "追悼の声が寄せられた。" in text
    assert "反応" in text  # kept content heading


def test_source_and_related_sections_dropped(run):
    records, _ = run
    text = by_id(records, "wikinews:100").text
    assert "出典" not in text
    assert "毎日新聞の記事名" not in text
    assert "別の記事" not in text


def test_no_residual_markup_in_fixture_records(run):
    records, stats = run
    for rec in records:
        assert "{{" not in rec.text and "[[" not in rec.text and "<ref" not in rec.text
    assert stats.residual_markup_records == 0


def test_ref_table_comment_state_templates_stripped(run):
    records, _ = run
    text = by_id(records, "wikinews:100").text
    assert "表のセル読めない" not in text  # table stripped
    assert "記事の本文をここに書いてください" not in text  # comment stripped
    assert "公開中" not in text and "アーカイブ" not in text  # state templates
    assert "Obituary" not in text  # interlanguage link


# ------------------------------------------- wikitext_to_paragraphs directly


def test_internal_link_display_text():
    assert wikitext_to_paragraphs("[[w:広島電鉄|広電]]が値上げ。") == ["広電が値上げ。"]


def test_bare_interwiki_link_unwraps_prefix():
    assert wikitext_to_paragraphs("[[w:歌人]]である。") == ["歌人である。"]


def test_plain_internal_link_keeps_title():
    assert wikitext_to_paragraphs("[[運賃]]の話。") == ["運賃の話。"]


def test_external_link_label_kept_bare_url_dropped():
    assert wikitext_to_paragraphs("[http://e.com ラベル]と[http://e.com]。") == ["ラベルと。"]


def test_ref_stripped_inline():
    assert wikitext_to_paragraphs('本文<ref name="x">出典テキスト</ref>です。') == ["本文です。"]


def test_named_ref_selfclosing_stripped():
    assert wikitext_to_paragraphs('本文<ref name="x" />です。') == ["本文です。"]


def test_table_stripped():
    assert wikitext_to_paragraphs("前\n{| class='t'\n|セル\n|}\n後") == ["前", "後"]


def test_unknown_templates_stripped_utc_rendered():
    assert wikitext_to_paragraphs("{{台風記事}}8日{{UTC|+9}}に上陸。") == ["8日UTC+9に上陸。"]


def test_list_markers_and_magic_words_removed():
    assert wikitext_to_paragraphs("__NOTOC__\n*項目一\n*項目二") == ["項目一\n項目二"]


def test_paragraph_split_on_blank_lines():
    assert wikitext_to_paragraphs("第一段落。\n\n第二段落。") == ["第一段落。", "第二段落。"]


def test_related_suffix_heading_dropped():
    wt = "本文。\n== 最近の台風関連記事 ==\n*[[台風の記事]]\n== 被害 ==\n浸水した。"
    assert wikitext_to_paragraphs(wt) == ["本文。", "被害", "浸水した。"]
