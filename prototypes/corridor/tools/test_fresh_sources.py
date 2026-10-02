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


def test_rejoin_wrapped_keeps_links_list_items_and_table_rows_apart():
    # shaped like スポーツ庁 1420919_00007: a <br>-separated run of link titles
    # (with an empty zero-width link beside two of them), then a table
    links = """<body><p><a href="/4">&#8203;</a><a href="/6">令和7年度生涯スポーツ功労者及び生涯スポーツ優良団体表彰被表彰者を決定しました<img alt="別ウィンドウ"></a><br>
      <a href="/4">令和6年度生涯スポーツ功労者及び生涯スポーツ優良団体表彰被表彰者を決定しました</a><a href="/2">&#8203;</a><br>
      <a href="/3">令和5年度生涯スポーツ功労者及び生涯スポーツ優良団体表彰被表彰者を決定しました</a></p>
      <table><tr><td>過去の総表彰数と表彰した団体の数を示す表の行です</td><td>6,437名</td></tr>
      <tr><td>審査及び推薦基準</td><td>十年以上スポーツの普及に尽力した者であること。</td></tr></table>
      <ul><li>都道府県の教育委員会から推薦された候補者の一覧です</li><li>公益財団法人日本スポーツ協会</li></ul></body>"""
    assert fs.rejoin_wrapped(lines_of(links)) == [
        "令和7年度生涯スポーツ功労者及び生涯スポーツ優良団体表彰被表彰者を決定しました",
        "令和6年度生涯スポーツ功労者及び生涯スポーツ優良団体表彰被表彰者を決定しました",
        "令和5年度生涯スポーツ功労者及び生涯スポーツ優良団体表彰被表彰者を決定しました",
        "過去の総表彰数と表彰した団体の数を示す表の行です　6,437名",
        "審査及び推薦基準　十年以上スポーツの普及に尽力した者であること。",
        "都道府県の教育委員会から推薦された候補者の一覧です",
        "公益財団法人日本スポーツ協会",
    ]
    # controls: hard wrapping inside one paragraph, one list item or one link still rejoins,
    # and so does running text that merely contains a link
    wrapped = """<body><p>地域社会における精神保健及び精神障害者の福祉に関する理解を深め、精神障害者の早期治<br>療を促進します。</p>
      <ul><li>地域社会における精神保健及び精神障害者の福祉に関する理解を深め、精神障害者の早期治<br>療を促進します。</li></ul>
      <p>詳しくは<a href="/x">地域社会における精神保健及び精神障害者の福祉に関する案内</a>をご覧のうえ<br>お申し込みください。</p></body>"""
    assert fs.rejoin_wrapped(lines_of(wrapped)) == [
        "地域社会における精神保健及び精神障害者の福祉に関する理解を深め、精神障害者の早期治療を促進します。",
        "地域社会における精神保健及び精神障害者の福祉に関する理解を深め、精神障害者の早期治療を促進します。",
        "詳しくは地域社会における精神保健及び精神障害者の福祉に関する案内をご覧のうえお申し込みください。",
    ]


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


@pytest.mark.parametrize("adapter, html", [
    (fs.MhlwAdapter, """<body><div class="l-contentMain">
      <div class="m-boxInfo"><p class="m-boxInfo__date">令和8年9月22日（火）</p><p>照会先</p></div>
      <p class="m-txtM">報道関係者　各位</p><div><h1 class="m-hdgLv1__hdg">ページの題</h1></div>
      <div class="m-grid"><p>厚生労働省は、運用を開始します。</p></div></div></body>"""),
    (fs.MextAdapter, """<body><div id="contentsMain"><h1>ページの題</h1><p class="right">令和8年9月22日</p>
      <p>文部科学省は、運用を開始します。</p></div></body>"""),
])
def test_release_title_and_date_are_the_pages_own_not_the_feeds(adapter, html):
    # extract_from, not page_date: container() cuts the h1 and the date stamp
    # out of the tree, so they have to be read before it runs
    stub = {"url": "https://www.example.go.jp/newpage_99999.html", "title": "フィードの題",
            "published": datetime(2026, 9, 24, 14, tzinfo=fs.JST)}
    item = adapter().extract_from(fs.Response(stub["url"], 200, "text/html", html.encode()), fs.parse_html(html), stub)
    assert (item.title, item.date) == ("ページの題", "2026-09-22")
    assert len(item.paragraphs) == 1 and item.paragraphs[0].endswith("運用を開始します。")
    assert "「ページの題」" in item.attribution and "フィードの題" not in item.attribution
    # control: a page with neither keeps the feed's title and listing date
    bare = html.replace("<h1", "<h2").replace("</h1>", "</h2>").replace("9月22日", "")
    item = adapter().extract_from(fs.Response(stub["url"], 200, "text/html", bare.encode()), fs.parse_html(bare), stub)
    assert (item.title, item.date) == ("フィードの題", "2026-09-24")


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


def digest_bullet(day, page, revid, timestamp):
    return {"date": day, "text": f"{day.day}日の要約文。", "targets": [], "page": page, "revid": revid,
            "timestamp": timestamp, "excluded": False}


def test_a_weekly_digest_credits_every_month_page_it_draws_from():
    sep, oct_ = "Portal:最近の出来事/2026年9月", "Portal:最近の出来事/2026年10月"
    adapter = fs.WikiNewsDigestAdapter(now=datetime(2026, 10, 6, tzinfo=fs.timezone.utc))
    week = [digest_bullet(date(2026, 9, d), sep, 111200000, "2026-10-04T10:00:00Z") for d in (28, 29, 30)]
    week += [digest_bullet(date(2026, 10, d), oct_, 111200500, "2026-10-05T09:00:00Z") for d in (1, 2)]
    item = adapter.extract({"monday": date(2026, 9, 28), "sunday": date(2026, 10, 4), "bullets": week})
    for page, revid in ((sep, 111200000), (oct_, 111200500)):
        assert f"「{page}」（版 {revid}、" in item.attribution
        assert f"title={fs.urllib.parse.quote(page)}&action=history" in item.attribution
    assert item.credits["revisions"] == [{"page": oct_, "revid": 111200500}, {"page": sep, "revid": 111200000}]
    assert item.url.endswith("oldid=111200500") and item.credits["revid"] == 111200500
    # control: a week inside one month keeps the one-page credit, word for word as shipped
    one = adapter.extract({"monday": date(2026, 9, 21), "sunday": date(2026, 9, 27),
                           "bullets": [digest_bullet(date(2026, 9, d), sep, 111174909, "2026-09-27T03:02:37Z") for d in (21, 23, 25)]})
    assert one.attribution == (
        "出典：ウィキペディア日本語版「Portal:最近の出来事/2026年9月」（版 111174909、2026-09-27）の執筆者、"
        "CC BY-SA 4.0（https://creativecommons.org/licenses/by-sa/4.0/deed.ja）。履歴 https://ja.wikipedia.org/w/index.php?"
        "title=Portal%3A%E6%9C%80%E8%BF%91%E3%81%AE%E5%87%BA%E6%9D%A5%E4%BA%8B/2026%E5%B9%B49%E6%9C%88&action=history ／ "
        "日付節の要約文を週ごとにまとめ、事件・事故・訃報の項目を除き、ふりがなと辞書リンクを付けて掲載（Bunki）。"
        "この頁の本文は CC BY-SA 4.0 で再利用できる。"
    )
    assert one.credits == {"page": sep, "revid": 111174909}


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


def test_a_per_row_title_source_wins_over_the_file_default(tmp_path, monkeypatch):
    import json
    import types

    ff, paths, body, old, _changed = restage_shelf(tmp_path, monkeypatch)
    paths["TITLES_PATH"].write_text(json.dumps({
        "titleEnSource": "test", "titles": {old["id"]: "New ants at Kobe"},
        "sources": {old["id"]: "publisher: https://example.org/new-ants-at-kobe"}}), "utf-8")
    monkeypatch.setitem(sys.modules, "corpus.grading._mecab", types.SimpleNamespace(get_tagger=lambda: None))
    seen = []

    def fake_mint(row, title_en, title_source, _topic, as_of, _tagger, _maps):
        seen.append(title_source)
        shared = {"id": row["id"], "addedAt": as_of, "date": row["date"], "titleEn": title_en, "titleEnSource": title_source}
        grading = {"signals": {"jreadability": {"band": "中級"}}}
        return (dict(shared, text=row["text"]), dict(shared, file=body.name, chars=len(row["text"]), grading=grading),
                dict(shared, kind="fresh", decision="pending"))

    monkeypatch.setattr(ff, "mint", fake_mint)
    assert ff.main() == 0
    assert seen == ["publisher: https://example.org/new-ants-at-kobe"]
    shelf = json.loads(paths["INDEX_PATH"].read_text("utf-8"))["articles"]
    assert [r["titleEnSource"] for r in shelf] == ["publisher: https://example.org/new-ants-at-kobe"]


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


def restage_shelf(tmp_path, monkeypatch):
    """One pending fresh reading on a scratch shelf, and a refetch whose text changed."""
    import json

    import feed_fresh as ff
    import feed_ingest

    old = dict(fake_item().record(), stagedAt="2026-09-25T03:00:00+00:00")
    paths = {
        "DATASET": tmp_path / "items.jsonl",
        "INDEX_PATH": tmp_path / "articles" / "index.json",
        "QUEUE_PATH": tmp_path / "queue.json",
        "ARTICLES": tmp_path / "articles",
        "TITLES_PATH": tmp_path / "titles.json",
        "EVIDENCE_DIR": tmp_path / "runs",
        "ADAPTATIONS_PATH": tmp_path / "no-adaptations.json",
        "REPO": tmp_path,
    }
    for name, path in paths.items():
        monkeypatch.setattr(ff, name, path)
    monkeypatch.setattr(feed_ingest, "QUEUE_PATH", paths["QUEUE_PATH"])
    paths["ARTICLES"].mkdir()
    body = paths["ARTICLES"] / "env-press-press_99999.json"
    body.write_text('{"id":"env:press-press_99999","text":"old"}', "utf-8")
    paths["DATASET"].write_text(json.dumps(old, ensure_ascii=False) + "\n", "utf-8")
    paths["INDEX_PATH"].write_text(json.dumps({"sources": {}, "articles": [
        {"id": old["id"], "file": body.name, "addedAt": "2026-09-26"}]}, indent=1) + "\n", "utf-8")
    paths["QUEUE_PATH"].write_text(json.dumps([{"id": old["id"], "kind": "fresh", "decision": "pending",
                                                  "addedAt": "2026-09-26", "titleEn": "New ants at Kobe"}], indent=2) + "\n", "utf-8")
    paths["TITLES_PATH"].write_text(json.dumps({"titleEnSource": "test", "titles": {old["id"]: "New ants at Kobe"}}), "utf-8")
    changed = fake_item(paragraphs=["環境省は、神戸港で確認されたアリの同定結果を改めて公表しました。" * 8]).record()
    report = {"terms": [], "skipped": [], "sources": {"env": {"discovered": 1, "extracted": 1, "passed": 1, "error": None}}}
    monkeypatch.setattr(ff, "fetch", lambda since, until, only, known: ([dict(changed)], report))
    monkeypatch.setattr(ff.ba, "load_jlpt_lexicon", lambda: {})
    monkeypatch.setattr(sys, "argv", ["feed_fresh.py", "--restage", "--since", "2026-09-14"])
    return ff, paths, body, old, changed


@pytest.mark.parametrize("failure", ["mint throws", "tokenizer missing"])
def test_restage_writes_nothing_when_the_mint_fails(tmp_path, monkeypatch, failure):
    import types

    ff, paths, body, _old, _changed = restage_shelf(tmp_path, monkeypatch)
    if failure == "tokenizer missing":
        monkeypatch.setitem(sys.modules, "corpus.grading._mecab", None)
    else:
        monkeypatch.setitem(sys.modules, "corpus.grading._mecab", types.SimpleNamespace(get_tagger=lambda: None))

        def broken_mint(*_args, **_kwargs):
            raise RuntimeError("the tagger died mid-run")

        monkeypatch.setattr(ff, "mint", broken_mint)
    before = {name: paths[name].read_bytes() for name in ("DATASET", "INDEX_PATH", "QUEUE_PATH")}
    with pytest.raises((RuntimeError, ImportError)):
        ff.main()
    assert {name: paths[name].read_bytes() for name in before} == before
    assert body.read_text("utf-8") == '{"id":"env:press-press_99999","text":"old"}'
    assert not paths["EVIDENCE_DIR"].exists()


def test_restage_replaces_the_reading_once_the_mint_succeeds(tmp_path, monkeypatch):
    import json
    import types

    ff, paths, body, old, changed = restage_shelf(tmp_path, monkeypatch)
    monkeypatch.setitem(sys.modules, "corpus.grading._mecab", types.SimpleNamespace(get_tagger=lambda: None))

    def fake_mint(row, title_en, _title_source, _topic, as_of, _tagger, _maps):
        shared = {"id": row["id"], "addedAt": as_of, "date": row["date"], "titleEn": title_en}
        grading = {"signals": {"jreadability": {"band": "中級"}}}
        return (dict(shared, text=row["text"]), dict(shared, file=body.name, chars=len(row["text"]), grading=grading),
                dict(shared, kind="fresh", decision="pending"))

    monkeypatch.setattr(ff, "mint", fake_mint)
    assert ff.main() == 0
    rows = [json.loads(line) for line in paths["DATASET"].read_text("utf-8").splitlines()]
    assert len(rows) == 1 and rows[0]["text"] == changed["text"]
    assert rows[0]["previousContentSha256"] == old["contentSha256"] and rows[0]["stagedAt"] == old["stagedAt"]
    assert "_addedAt" not in rows[0]
    shelf = json.loads(paths["INDEX_PATH"].read_text("utf-8"))["articles"]
    queue = json.loads(paths["QUEUE_PATH"].read_text("utf-8"))
    assert [(r["id"], r["addedAt"]) for r in shelf] == [(old["id"], "2026-09-26")]
    assert [(r["id"], r["addedAt"]) for r in queue] == [(old["id"], "2026-09-26")]
    assert json.loads(body.read_text("utf-8"))["text"] == changed["text"]


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


def test_adaptations_keep_their_source_licence_and_say_they_are_rewrites():
    import feed_fresh as ff

    dataset = [
        fake_item().record(),
        dict(fake_item(id="jawiki:1", source="jawiki", title="記事").record()),
    ]
    rows = {row["id"]: row for row in ff.adaptation_rows(dataset)}
    # only adaptations whose source is staged are offered; with a stand-in
    # dataset none of the committed sources match, so build one that does
    authored = __import__("json").loads(ff.ADAPTATIONS_PATH.read_text("utf-8"))["adaptations"]
    assert rows == {} or all(r["id"].startswith(ff.ADAPTATION_PREFIX) for r in rows.values())
    staged = []
    for ad in authored:
        key = ad["basedOn"].split(":", 1)[0]
        item = fake_item(id=ad["basedOn"], source=key if key in fs.SOURCES else "env")
        staged.append(item.record())
    rows = {row["id"]: row for row in ff.adaptation_rows(staged)}
    assert len(rows) == len(authored)
    for ad in authored:
        row = rows[ff.ADAPTATION_PREFIX + ad["basedOn"]]
        src = next(r for r in staged if r["id"] == ad["basedOn"])
        assert row["text"] == ad["text"].strip() and row["url"] == src["url"] and row["date"] == src["date"]
        assert row["pool"] == src["pool"] and row["licence"] == src["licence"]
        assert row["attribution"].startswith("Bunkiによる書き換え") and "原文ではありません" in row["attribution"]
        assert (src["pool"] == "share_alike") == ("CC BY-SA 4.0 で提供します" in row["attribution"])
