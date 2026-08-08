"""mimneko/kanji-data — Kanken kanji fact table (CC0-1.0).

Upstream: https://github.com/mimneko/kanji-data, pinned to one commit
(see ``fetch.PIN``). Two CSVs are ingested:

- ``漢検漢字辞典漢字.csv`` (6,787 rows, one per 字項) →
  ``datasets/kanji/kanken.jsonl``
- ``部首一覧.csv`` (214 部首 per the 漢検漢字辞典 classification) →
  ``datasets/kanji/kanken_radicals.jsonl``

Legal boundary (Wayfinder #45): the ``漢検漢字辞典掲載ページ`` column (dictionary
page numbers) is DROPPED entirely — page placement is the closest thing in this
dataset to copied arrangement (編集著作物 exposure). It must not appear in any
output. 「漢検」 is a registered trademark of 日本漢字能力検定協会; the facts here
are CC0 but the product must not brand itself with the trademark.

The upstream README's per-level table is stale (±1 in three places) — the CSV
is the source of truth; every count asserted in tests was verified against the
pinned CSV, not the README.
"""
