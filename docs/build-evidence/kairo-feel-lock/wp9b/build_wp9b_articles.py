"""Compatibility entry point for the canonical corridor article builder.

WP9b originally wrapped and monkey-patched ``build_articles.py`` to append
its 14 originals. The canonical builder now owns every native shelf source,
including those 14 records and their asserted UniDic reading repairs. Keeping
this small delegator preserves the documented historical command without
maintaining a second pipeline.

Usage:
  python docs/build-evidence/kairo-feel-lock/wp9b/build_wp9b_articles.py
  python docs/build-evidence/kairo-feel-lock/wp9b/build_wp9b_articles.py --out DIR
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(REPO / "prototypes" / "corridor" / "tools"))

import build_articles  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(build_articles.main())
