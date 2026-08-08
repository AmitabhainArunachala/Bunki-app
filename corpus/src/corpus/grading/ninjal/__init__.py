"""NINJAL 日本語教育基本語彙データベース loader — the coverage/TMR substrate.

Source (CC BY 4.0, see PROVENANCE.yml in this directory):
https://mmsrv.ninjal.ac.jp/brfvep/rokusyutaisyo.csv — the 日本語教育基本語彙
データベース from the CD-ROM of 国立国語研究所報告127『教育基本語彙の基本的
研究―増補改訂版―』(2009), published as CSV (cp932, 11,827 rows).

Columns: 通し番号, 見出し (kana headword), 表記 (orthographies), 品詞, 語種,
語彙配当 (1=小学校低学年 / 2=小学校高学年 / 3=中学校 — a 阪本/田中/池原/児言研
-derived allocation for NATIVE schoolchildren; empty for 2,042 rows), then six
mark columns (○/◎) for six vocabularies: 国語研, 初級500語, 七種対照, 工藤,
木幡, 玉村.

The substrate used here is the **国語研教育基本語彙** column — NINJAL『日本語
教育のための基本語彙調査』(1984), the only one of the lists built for L2
learners of Japanese. Databased size: **6,103 words** (kaisetsu.pdf: 語数は，
6,103語である); ◎ marks the more-basic core (2,071 rows here; the 1984 report
counts 2,030 — kaisetsu.pdf notes DB counts differ from report counts), ○ the
remaining 4,032.

Bands (the DB's own, nothing invented):
    core     = ◎ rows (2,071)   → level id "ninjal-kyoiku-kihon-goi:core"
    extended = ○ rows (4,032)   → level id "ninjal-kyoiku-kihon-goi:full"
                                   (full = core ∪ extended, 6,103)

The substrate id is ``ninjal-kyoiku-kihon-goi``. It is NOT JLPT and is never
labeled as such.

Important property, verified on the data: the 国語研 6,103 list is CONTENT
vocabulary — particles and auxiliaries (は を に です ます だ…) exist as DB
rows but carry no 国語研 mark. Signals matching against this substrate must
therefore exclude function words from their token stream (see tmr.py).

表記 annotation conventions handled by ``_hyoki_variants``:
  ・ separates variants; × marks 表外字 and △ 表外音訓 (stripped); 〈〉 wraps
  熟字訓 and 《》 special-reading orthographies (brackets stripped, content
  kept); 〔蘭〕-style tags + Latin text are loanword etymologies, not
  orthographies (variant dropped — the katakana 見出し covers the word);
  （…） glosses dropped; ？ is an unrepresentable-glyph placeholder (variant
  dropped).

Matching (see ``Vocabulary.contains``): a token is in the vocabulary if its
orthBase or lemma equals a recorded orthography or headword, or — when the
token is written in kana — its kana-normalized base form equals a
kana-normalized 見出し. Orthography variants not recorded by the DB are
misses; reading-only matches for kanji-written tokens are NOT attempted
(homophone false positives). Both limitations are documented in the PR.

The CSV is downloaded to ``corpus/data/ninjal/`` (gitignored) on first use
and verified against the sha256 pin below (recorded 2026-08-07, matching
PROVENANCE.yml).
"""

from __future__ import annotations

import csv
import hashlib
import os
import re
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from corpus.grading._mecab import is_kana, kata_to_hira, token_keys

SUBSTRATE = "ninjal-kyoiku-kihon-goi"
UPSTREAM_URL = "https://mmsrv.ninjal.ac.jp/brfvep/rokusyutaisyo.csv"
SHA256 = "80f190abebfe5fdfc52aec06a6c9c842eb4b1ff25b6687f135547a81902607af"
FILENAME = "rokusyutaisyo.csv"

_ETYM_TAG = re.compile(r"〔[^〕]*〕")
_PAREN = re.compile(r"（[^）]*）|\([^)]*\)")
_STRIP = re.compile(r"[×△〈〉《》←´～\s]")


def data_dir() -> Path:
    env = os.environ.get("CORPUS_DATA_DIR")
    if env:
        return Path(env) / "ninjal"
    return Path(__file__).resolve().parents[4] / "data" / "ninjal"


def ensure_downloaded(path: Path | None = None) -> Path:
    path = path or data_dir() / FILENAME
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(UPSTREAM_URL, tmp)
        tmp.rename(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SHA256:
        raise RuntimeError(
            f"{path}: sha256 {digest} != pinned {SHA256} — upstream changed "
            "or download corrupted; re-verify provenance before use"
        )
    return path


def _hyoki_variants(hyoki: str) -> list[str]:
    out = []
    for v in hyoki.split("・"):
        v = _ETYM_TAG.sub("", v)
        v = _PAREN.sub("", v)
        if re.search(r"[A-Za-z]", v):
            continue
        v = _STRIP.sub("", v)
        if not v or "？" in v:
            continue
        out.append(v)
    return out


@dataclass(frozen=True)
class Vocabulary:
    """One matchable word list with a named substrate id."""

    substrate: str
    ortho: frozenset[str]
    kana: frozenset[str]

    @classmethod
    def from_words(cls, substrate: str, words) -> "Vocabulary":
        words = set(words)
        return cls(
            substrate=substrate,
            ortho=frozenset(words),
            kana=frozenset(kata_to_hira(w) for w in words if is_kana(w)),
        )

    def contains(self, token) -> bool:
        ob, lm, kana = token_keys(token)
        if ob in self.ortho or (lm and lm in self.ortho):
            return True
        return bool(kana) and kana in self.kana

    def __len__(self) -> int:
        return len(self.ortho)


def _rows(path: Path) -> list[dict]:
    with path.open(encoding="cp932", newline="") as f:
        return list(csv.DictReader(f))


def _build(rows: list[dict], mark_filter) -> tuple[set[str], set[str]]:
    ortho: set[str] = set()
    kana: set[str] = set()
    for r in rows:
        if not mark_filter(r.get("国語研") or ""):
            continue
        midashi = (r.get("見出し") or "").strip()
        if midashi:
            ortho.add(midashi)
            if is_kana(midashi):
                kana.add(kata_to_hira(midashi))
        for v in _hyoki_variants(r.get("表記") or ""):
            ortho.add(v)
            if is_kana(v):
                kana.add(kata_to_hira(v))
    return ortho, kana


@dataclass(frozen=True)
class KokugokenSubstrate:
    core: Vocabulary  # ◎ rows
    full: Vocabulary  # ◎ ∪ ○ rows
    n_core_rows: int
    n_full_rows: int


@lru_cache(maxsize=1)
def load_kokugoken() -> KokugokenSubstrate:
    rows = _rows(ensure_downloaded())
    marks = [(r.get("国語研") or "").strip() for r in rows]
    n_core = sum(1 for m in marks if m == "◎")
    n_full = sum(1 for m in marks if m in ("◎", "○"))
    core_o, core_k = _build(rows, lambda m: m.strip() == "◎")
    full_o, full_k = _build(rows, lambda m: m.strip() in ("◎", "○"))
    return KokugokenSubstrate(
        core=Vocabulary(f"{SUBSTRATE}:core", frozenset(core_o), frozenset(core_k)),
        full=Vocabulary(f"{SUBSTRATE}:full", frozenset(full_o), frozenset(full_k)),
        n_core_rows=n_core,
        n_full_rows=n_full,
    )
