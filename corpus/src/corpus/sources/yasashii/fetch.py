"""Pinned download of the ISA/文化庁 やさしい日本語 documents.

Upstream page: https://www.moj.go.jp/isa/support/portal/plainjapanese_guideline.html
(在留支援のためのやさしい日本語ガイドライン, 2020-08, 出入国在留管理庁・文化庁).

The ISA site fronts through CloudFront and rejects the default urllib UA, so a
browser-like UA header is sent. Downloads are sha256-pinned; a hash mismatch is
an error, never a silent accept (the upstream URL is a CMS content id, not a
versioned path — if the pin breaks, a human re-verifies the licence page).
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "yasashii"

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# filename -> (url, sha256) — pinned 2026-08-07
PINNED = {
    "bessatsu_kakikaerei.pdf": (
        "https://www.moj.go.jp/isa/content/930006077.pdf",
        "c196267844463a0966f8db7e4619f1777dc6b7e178d0976bfff69dfb6ef9bbb9",
    ),
    "guideline_honpen.pdf": (
        "https://www.moj.go.jp/isa/content/930006072.pdf",
        "94dfc82b88eed1e13191aa376c2f09ce3d58f4c15aac24941b0057f0e8ec8106",
    ),
}


class FetchError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(data_dir: Path = DATA_DIR) -> list[Path]:
    data_dir.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    for name, (url, digest) in PINNED.items():
        dest = data_dir / name
        if dest.exists() and _sha256(dest) == digest:
            out.append(dest)
            continue
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        got = hashlib.sha256(data).hexdigest()
        if got != digest:
            raise FetchError(
                f"{name}: sha256 mismatch — expected {digest}, got {got}. "
                "Upstream may have republished; re-verify the licence page "
                "before updating the pin."
            )
        dest.write_bytes(data)
        out.append(dest)
    return out


def main() -> int:
    for path in fetch():
        print(f"{_sha256(path)}  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
