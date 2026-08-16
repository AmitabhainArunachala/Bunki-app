"""Parser for raw 青空文庫 card text files (Shift_JIS, 99.6% of files).

File shape:

- head: title/author lines, then usually a 記号説明 block delimited by two
  lines of hyphens («【テキスト中に現れる記号について】») — both trimmed.
- body: ruby as ``｜漢字《かんじ》`` or bare ``漢字《かんじ》`` (bare form
  applies to the whole preceding kanji run — that is why ｜ exists);
  注記 as ``［＃…］`` (dropped, surrounded text kept — 傍点 like
  ``しだ［＃「しだ」に傍点］`` keeps しだ); ``《《…》》`` is 傍点, never ruby.
- foot: from the ``底本：`` line to EOF — trimmed.

Ruby is PRESERVED in the output (the internal standard, Wayfinder #41).
``furigana_coverage`` = fraction of kanji runs carrying 《》 ruby — a better
difficulty signal than kanji ratio (#41).
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

_DASH_LINE_RE = re.compile(r"-{10,}\s*")
_FOOTER_RE = re.compile(r"^底本[：:]", re.M)
_CHUKI_RE = re.compile(r"［＃[^］]*］")
_BOUTEN_RE = re.compile(r"《《([^《》]*)》》")

_KANJI = r"[㐀-鿿豈-﫿々〆ヶ]"  # CJK + 々〆ヶ
_KANJI_RUN_RE = re.compile(_KANJI + "+")
_RUBY_RE = re.compile(r"｜([^｜《》\r\n]+)《[^《》]*》|(" + _KANJI + r"+)《[^《》]*》")

_HEADER_SCAN_LINES = 80


def decode(raw: bytes) -> str:
    """Shift_JIS decode (cp932 superset covers vendor extensions)."""
    return raw.decode("cp932")


def strip_header(text: str) -> str:
    lines = text.split("\n")
    dashes = [
        i
        for i, line in enumerate(lines[:_HEADER_SCAN_LINES])
        if _DASH_LINE_RE.fullmatch(line)
    ]
    if len(dashes) >= 2:
        lines = lines[dashes[1] + 1 :]
    else:
        # No 記号説明 block: the head is the leading non-empty title/author
        # lines up to the first blank line. A text with no blank line at all
        # is not header-shaped — leave it untouched.
        i = 0
        while i < len(lines) and lines[i].strip():
            i += 1
        if i < len(lines):
            lines = lines[i:]
    return "\n".join(lines)


def strip_footer(text: str) -> str:
    matches = list(_FOOTER_RE.finditer(text))
    if matches:
        text = text[: matches[-1].start()]
    return text


def strip_chuki(text: str) -> str:
    """Drop ［＃…］ annotations; the annotated body text stays."""
    return _CHUKI_RE.sub("", text)


def parse(raw: bytes | str) -> str:
    """Raw card file → body text: header/footer trimmed, 注記 stripped,
    newlines normalised to \\n, ruby kept in the 《》 convention."""
    text = decode(raw) if isinstance(raw, bytes) else raw
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = strip_header(text)
    text = strip_footer(text)
    text = strip_chuki(text)
    return text.strip("\n")


def parse_zip(path: str | Path) -> str:
    """Parse the first .txt member of an Aozora card zip."""
    with zipfile.ZipFile(path) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".txt")]
        if not names:
            raise ValueError(f"{path}: no .txt member")
        return parse(zf.read(names[0]))


def furigana_coverage(text: str) -> float:
    """Fraction of kanji runs carrying 《》 ruby, in [0, 1].

    傍点 ``《《…》》`` is unwrapped first so it is neither counted as ruby nor
    hides its text. A ｜ base counts every kanji run it contains as covered;
    a bare base is the single maximal kanji run before 《.
    """
    t = _BOUTEN_RE.sub(r"\1", text)
    covered = 0
    total = 0
    pos = 0
    for m in _RUBY_RE.finditer(t):
        total += len(_KANJI_RUN_RE.findall(t[pos : m.start()]))
        base_runs = len(_KANJI_RUN_RE.findall(m.group(1) or m.group(2)))
        covered += base_runs
        total += base_runs
        pos = m.end()
    total += len(_KANJI_RUN_RE.findall(t[pos:]))
    return covered / total if total else 0.0
