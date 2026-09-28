"""Offline checks for the fresh-shelf adapters (tools/fresh_sources.py) and the
refresh command's gate and mint (tools/feed_fresh.py). No network: every page
is an inline fixture shaped like the real one it stands for.

Run:  python -m pytest prototypes/corridor/tools/test_fresh_sources.py -q
      (the interpreter needs the corpus grading stack for the mint test)
"""

from __future__ import annotations

import sys
from datetime import date, datetime
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import fresh_sources as fs  # noqa: E402


def lines_of(html: str) -> list[str]:
    return fs.block_lines(fs.parse_html(html))


def test_block_lines_keeps_paragraphs_and_drops_page_furniture():
    html = """<body><header><nav>メニュー 検索</nav></header>
      <main><h1>見出し</h1><p>一文目です。<br>二行目です。</p>
      <script>var x = 1;</script><span style="display:none">隠し文字</span>
      <ul><li>項目ア</li><li>項目イ</li></ul>
      <table><tr><th></th><th>開始日</th></tr><tr><td>インドネシア</td><td>令和８年11月２日</td></tr></table>
      </main><footer>フッター</footer></body>"""
    out = lines_of(html)
    assert out == ["見出し", "一文目です。", "二行目です。", "項目ア", "項目イ", "開始日", "インドネシア　令和８年11月２日"]
    # negative control: the same markup with the furniture unwrapped DOES leak it
    leaked = lines_of("<body><div>メニュー 検索</div><p>本文。</p></body>")
    assert "メニュー検索" in leaked


def test_normalize_joins_source_line_breaks_between_japanese_only():
    assert fs.normalize("日本の\n  ニュース") == "日本のニュース"
    assert fs.normalize("Solenopsis\n aurea") == "Solenopsis aurea"
    assert fs.normalize("﻿北緯11度​") == "北緯11度"


def test_clean_lines_stops_at_contacts_and_drops_bare_urls():
    lines = ["本文です。", "https://www.env.go.jp/x.html", "To English", "連絡先", "環境省 03-0000"]
    assert fs.clean_lines(lines, ("連絡先",)) == ["本文です。"]


def test_rejoin_wrapped_undoes_hard_wrapping_but_not_list_items():
    wrapped = [
        "地域社会における精神保健及び精神障害者の福祉に関する理解を深め、精神障害者の早期治",
        "療並びにその社会復帰及び自立と社会参加の促進をします。",
        "２　期間",
        "令和８年９月28日（月）から10月４日（日）まで",
    ]
    assert fs.rejoin_wrapped(wrapped) == [
        "地域社会における精神保健及び精神障害者の福祉に関する理解を深め、精神障害者の早期治療並びにその社会復帰及び自立と社会参加の促進をします。",
        "２　期間",
        "令和８年９月28日（月）から10月４日（日）まで",
    ]
    # negative control: a long unfinished line followed by a new list item stays apart
    items = ["主な違反事項は次のとおりであり、事業場に対して改善を指導している状況", "（１）使用する機械等の安全基準"]
    assert fs.rejoin_wrapped(items) == items


def test_trim_paragraphs_cuts_on_paragraph_boundaries_and_says_so():
    paras = ["あ" * 500, "い" * 500, "う" * 500]
    kept, excerpt = fs.trim_paragraphs(paras, 1200)
    assert kept == paras[:2]
    assert excerpt == {"keptChars": 1000, "sourceChars": 1500, "rule": "whole paragraphs from the top"}
    assert fs.trim_paragraphs(paras[:1], 1200) == (paras[:1], None)
    # a first paragraph longer than the cap is cut after its last full sentence
    long_first = ["一文目です。" * 100]
    kept, excerpt = fs.trim_paragraphs(long_first, 50)
    assert kept[0].endswith("。") and len(kept[0]) <= 50 and excerpt["keptChars"] == len(kept[0])


def test_attachment_and_link_index_detection():
    assert fs.PDF_LINK_RE.search("病院の耐震改修状況調査の結果［PDF形式：261KB］")
    assert fs.PDF_LINK_RE.search("▶厚生労働省で行う事項（別紙１）［48KB］")
    assert fs.PDF_LINK_RE.search("啓発用チラシ(PDF:5.3MB)")
    assert not fs.PDF_LINK_RE.search("病院の耐震化率は、82.1％（6,596病院／8,030病院）")
    assert fs.URL_LINE_RE.match("（https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000179322.html）")


def test_page_day_takes_the_date_written_beside_the_title_not_a_date_in_the_body():
    html = """<body><header><p>テレビ番組</p><p>2026年9月10日</p><h1>生活道路の法定速度</h1></header>
      <main><p>2026年9月1日から、こうした生活道路では法定速度が引き下げられました。</p></main></body>"""
    assert fs.page_day(fs.parse_html(html), "生活道路の法定速度") == date(2026, 9, 10)
    assert fs.jp_date("令和８年９月２５日") == date(2026, 9, 25)
    assert fs.jp_date("令和元年5月1日") == date(2019, 5, 1)


def test_mhlw_container_drops_the_release_header_and_reader_note():
    html = """<body><div class="l-contentMain">
      <div class="m-boxInfo"><p class="m-boxInfo__date">令和8年9月25日（金）</p><p>照会先</p><address>内線2373</address></div>
      <p class="m-txtM">報道関係者　各位</p><div><h1 class="m-hdgLv1__hdg">題</h1></div>
      <div class="m-grid"><p>厚生労働省は、運用を開始します。</p></div>
      <div class="m-boxReader"><p>PDFファイルを見るためには、Adobe Readerが必要です。</p></div></div></body>"""
    adapter = fs.MhlwAdapter()
    root = fs.parse_html(html)
    assert adapter.page_date(root, "題") == date(2026, 9, 25)
    assert fs.block_lines(adapter.container(root)) == ["厚生労働省は、運用を開始します。"]


def test_env_header_trim():
    lines = ["この記事を印刷", "2026年09月25日", "自然環境", "＜兵庫県・神戸市同時発表＞", "本文です。"]
    assert fs.EnvAdapter().trim_header(lines) == ["＜兵庫県・神戸市同時発表＞", "本文です。"]


def test_wikitext_bullets_become_plain_text_with_their_link_targets():
    text, targets = fs.wikitext_plain(
        "（スポーツ）（水泳）[[2026年アジア競技大会]]の男子200ｍ[[平泳ぎ]]で、[[大崎信]]が"
        "世界新記録となる2分4秒83で[[金メダル]]に。 -[https://www.jiji.com/jc/article?k=1 時事]"
    )
    assert text == "（スポーツ）（水泳）2026年アジア競技大会の男子200ｍ平泳ぎで、大崎信が世界新記録となる2分4秒83で金メダルに。"
    assert targets[0] == "2026年アジア競技大会"
    text, _ = fs.wikitext_plain("[[2026年の台風#台風25号（ドゥージェン）|台風25号]]による大雨{{仮リンク|某川|en|River}}<ref>x</ref>")
    assert text == "台風25号による大雨某川"


def test_event_targets_are_instances_not_topics_or_calendar_pages():
    ok = [t for t in ["2026年アジア競技大会", "地震", "9月27日", "第2次高市内閣 (改造)", "ロシア"]
          if fs.EVENT_TARGET.search(t) and not fs.CALENDAR_TARGET.match(t)]
    assert ok == ["2026年アジア競技大会", "第2次高市内閣 (改造)"]


def test_rubric_t1_and_vandalism_markers():
    assert fs.GRIM_RE.search("民家で52歳女性が殺害され")
    assert not fs.GRIM_RE.search("台風25号による大雨の影響で土砂災害が相次ぎ発生")
    assert fs.VANDAL_RE.search("第20回クソみたいなアジア競技大会")


def test_pdl_attribution_names_source_licence_terms_and_processing():
    s = fs.SOURCES["kantei"]
    text = fs.pdl_attribution(s, "日本スタートアップ大賞２０２６表彰式", {"keptChars": 1})
    for part in ("出典：「日本スタートアップ大賞２０２６表彰式」（首相官邸ホームページ）", fs.PDL_URL,
                 "https://www.kantei.go.jp/jp/terms.html", "を加工して作成", "段落単位で抜粋し"):
        assert part in text
    assert "段落単位で抜粋し" not in fs.pdl_attribution(s, "題", None)


def test_every_source_declares_a_pool_its_licence_allows():
    for s in fs.SOURCES.values():
        assert s.terms_url.startswith("https://") and s.licence_url.startswith("https://")
        assert (s.pool == "share_alike") == s.licence.startswith("CC BY-SA"), s.key


# ------------------------------------------------------------------ feed_fresh
def fake_item(**overrides) -> "fs.Item":
    fields = dict(
        id="env:press-press_99999", source="env", title="神戸港で新しいアリを確認",
        paragraphs=["環境省は、神戸港で確認されたアリについて専門家による同定の結果を公表しました。" * 8],
        url="https://www.env.go.jp/press/press_99999.html", date="2026-09-25",
        published_at="2026-09-25T12:00:00+09:00", fetched_at="2026-09-28T02:00:00+00:00",
    )
    fields.update(overrides)
    item = fs.Item(**fields)
    item.attribution = fs.pdl_attribution(fs.SOURCES[item.source], item.title, None)
    return item


def test_gate_windows_dedupes_and_applies_t1():
    import feed_fresh as ff

    since, until = date(2026, 9, 14), date(2026, 9, 28)
    assert ff.gate(fake_item(), since, until, set()) is None
    assert "outside the window" in ff.gate(fake_item(date="2026-09-10"), since, until, set())
    assert "already staged" in ff.gate(fake_item(), since, until, {"env:press-press_99999"})
    assert "under 300 chars" in ff.gate(fake_item(paragraphs=["短い本文です。"]), since, until, set())
    assert "T1" in ff.gate(fake_item(title="男性が殺害された事件"), since, until, set())


def test_mint_writes_the_shelf_grammar_through_build_articles():
    pytest.importorskip("fugashi")
    import build_articles as ba
    import feed_fresh as ff
    from corpus.grading._mecab import get_tagger

    row = fake_item().record()
    record, index_row, queue_row = ff.mint(row, "New ants at Kobe", "test-author", "science", "2026-09-28",
                                           get_tagger(), ba.load_jlpt_lexicon())
    assert record["tokens"] and record["grading"]["signals"]["jlpt_lexicon"]["substrate"]
    assert "jreadability" in record["grading"]["signals"]
    assert record["review"] == "human-review-pending" and record["sourceLabel"].endswith("検収前")
    assert record["pool"] == "proprietary_safe" and record["date"] == "2026-09-25"
    assert index_row["snippet"] == record["text"].replace("\n", " ")[:64] and "tokens" not in index_row
    assert queue_row["kind"] == "fresh" and queue_row["decision"] == "pending" and queue_row["titleEn"] == "New ants at Kobe"
    assert "".join(t["s"] for t in record["tokens"]) == record["text"].replace("\n", "")


def test_default_since_ignores_mint_only_runs(tmp_path, monkeypatch):
    import json

    import feed_fresh as ff

    monkeypatch.setattr(ff, "EVIDENCE_DIR", tmp_path)
    (tmp_path / "run-001.json").write_text(json.dumps({"window": {"until": "2026-09-20"}}), "utf-8")
    (tmp_path / "run-002.json").write_text(json.dumps({"window": None}), "utf-8")
    assert ff.default_since() == date(2026, 9, 20)
    for path in tmp_path.glob("run-*.json"):
        path.unlink()
    assert ff.default_since() == datetime.now(fs.JST).date() - ff.timedelta(days=ff.DEFAULT_DAYS)


def test_global_voices_byline_and_preface_move_to_the_attribution():
    adapter = fs.PublisherReaderAdapter("global-voices")
    row = {
        "authors": ["lahlah"], "translators": ["Moegi Tanaka"], "title": "シリアの「連帯の畑」",
        "text": "レイダ・ゼイダン\n\nこの記事は2026年4月7日、Lahlah誌にアラビア語で最初に公開された。コンテンツ共有合意に基づき再公開する。"
                "\n\n当記事はスポットライト・シリーズの一環である。\n\nダマスカス郊外の小さな区画では、在来の種子がよみがえりつつある。\n\n続きの段落。",
        "publishedAt": "2026-09-28T02:16:26.000Z", "url": "https://jp.globalvoices.org/2026/09/28/65726/",
        "fetchedAt": "2026-09-28T02:30:00Z", "responseSha256": "0" * 64, "attribution": "Global Voices 日本語 — 原文: lahlah",
    }
    item = adapter.extract(row)
    assert item.paragraphs[0].startswith("ダマスカス郊外")
    assert "レイダ・ゼイダン" in item.attribution and "最初に公開された" in item.attribution
    assert item.excerpt["movedToAttribution"][0] == "レイダ・ゼイダン"
    # negative control: an article that opens on its own sentence keeps it
    plain = adapter.extract(dict(row, text="ダマスカス郊外の小さな区画では、在来の種子がよみがえりつつある。\n\n続きの段落。"))
    assert plain.paragraphs[0].startswith("ダマスカス郊外") and "movedToAttribution" not in (plain.excerpt or {})


def test_spaced_name_tables_drop_and_subtitles_stay_whole():
    assert fs.spaced_table_line("漆　原　　　肇　　日本労働組合総連合会　総合政策推進局　労働法制局　局長阿　部　博　司")
    assert not fs.spaced_table_line("インドネシア　令和８年11月２日予定　令和９年１月４日予定")
    subtitle = "～厚生労働大臣表彰最優秀賞・株式会社エヴァーブルー（静岡県浜松市）はじめ入賞企業を10月９日（金）に表彰～"
    assert fs.rejoin_wrapped([subtitle, "厚生労働省では、このほど決定しました。"]) == [subtitle, "厚生労働省では、このほど決定しました。"]
