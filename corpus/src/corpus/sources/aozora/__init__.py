"""青空文庫 (Aozora Bunko) ingestion.

Three pieces (Wayfinder #41):

- ``index``: the extended index CSV is the API — never clone the 10+ GB repo.
  Strict usable filter: 作品著作権フラグ == 'なし' AND 文字遣い種別 == '新字新仮名'.
- ``text``: parser for raw Shift_JIS card files — header/footer trim, 注記
  stripping, ruby PRESERVED in the ``｜漢字《かんじ》`` convention, and
  ``furigana_coverage`` (fraction of kanji runs carrying ruby).
- ``clean_dataset``: bulk text via globis-university/aozorabunko-clean
  (CC BY 4.0). NOTE: that dataset strips ruby, so furigana_coverage must be
  computed from raw card files, not from clean text.
"""
