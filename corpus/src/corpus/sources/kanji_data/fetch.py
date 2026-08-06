"""Pinned-commit fetch for mimneko/kanji-data (CC0-1.0).

Downloads the two source CSVs from raw.githubusercontent.com at the pinned
commit ``PIN`` and verifies their sha256 against the recorded digests. The
fetch is idempotent: a file that already exists with the right digest is not
re-downloaded. A digest mismatch is always a hard error — the pin is the
provenance claim.
"""

from __future__ import annotations

import hashlib
import sys
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "mimneko/kanji-data"
PIN = "0be3577f7939ec85d2b4e373a7a94262e7449e13"

# local filename -> (upstream path inside the repo, sha256 at PIN)
FILES: dict[str, tuple[str, str]] = {
    "kanken_kanji.csv": (
        "漢検漢字辞典漢字.csv",
        "e3a3bade7bb738f6e25d2ff14ea4118ed3b18d9cd32f49dd6a90f5eb6d8ef84f",
    ),
    "kanken_radicals.csv": (
        "部首一覧.csv",
        "ed762122791f294bba17ac9de4298599bef317dec0756de6852d7047f26ec9dc",
    ),
}


class FetchError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def raw_url(upstream_path: str, pin: str = PIN) -> str:
    quoted = urllib.parse.quote(upstream_path)
    return f"https://raw.githubusercontent.com/{REPO}/{pin}/{quoted}"


def fetch(dest_dir: str | Path) -> dict[str, Path]:
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: dict[str, Path] = {}
    for local_name, (upstream_path, want_sha) in FILES.items():
        dest = dest_dir / local_name
        if dest.exists() and sha256_file(dest) == want_sha:
            out[local_name] = dest
            continue
        with urllib.request.urlopen(raw_url(upstream_path)) as resp:
            data = resp.read()
        got_sha = hashlib.sha256(data).hexdigest()
        if got_sha != want_sha:
            raise FetchError(
                f"{upstream_path} at {PIN}: sha256 mismatch — "
                f"expected {want_sha}, got {got_sha}"
            )
        dest.write_bytes(data)
        out[local_name] = dest
    return out


def default_data_dir() -> Path:
    # .../corpus/src/corpus/sources/kanji_data/fetch.py -> .../corpus
    return Path(__file__).resolve().parents[4] / "data" / "kanji_data"


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    dest = Path(args[0]) if args else default_data_dir()
    for name, path in fetch(dest).items():
        print(f"{name}: {path} sha256={sha256_file(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
