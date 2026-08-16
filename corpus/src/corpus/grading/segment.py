"""Japanese sentence splitter — deliberately simple, fully documented.

Rules (nothing more):

1. The text is first split on newlines; every newline is a hard boundary.
2. Within a line, a sentence ends after 。 ！ ？ ！？-style runs (ASCII ``!``
   and ``?`` included). Consecutive terminators stay with their sentence
   (「なに？！」 is one boundary, not two).
3. Closing quotes/brackets 」』）】｝〉》 immediately after a terminator are
   attached to the sentence they close.
4. Empty/whitespace-only pieces are dropped.

This is NOT a discourse-aware segmenter: it will split inside 「…。…」
quotations and does not merge lines broken mid-sentence (Aozora hard wraps).
Good enough for per-sentence drift measurement; revisit under #42 if not.
"""

from __future__ import annotations

import re

_TERMINATORS = "。！？!?"
_CLOSERS = "」』）】｝〉》"
_SENT_RE = re.compile(
    rf"[^{_TERMINATORS}]*[{_TERMINATORS}]+[{_CLOSERS}]*|[^{_TERMINATORS}]+"
)


def split_sentences(text: str) -> list[str]:
    out: list[str] = []
    for line in text.splitlines():
        for m in _SENT_RE.finditer(line):
            s = m.group().strip()
            if s:
                out.append(s)
    return out
