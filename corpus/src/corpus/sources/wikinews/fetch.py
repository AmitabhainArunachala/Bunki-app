"""Mirror the ja.wikinews pages-articles dump, pinned by sha256.

ja.wikinews has been read-only since 2026-05-04 and the project has closed
(final article: ウィキニュース、21年の歴史に幕を閉じる). This corpus mirrors
one specific dump build: Last-Modified 2026-08-04, md5
a433b304bc964775cea5ea12b32b2c1c. If Wikimedia regenerates the "latest" file
the hash changes and this fetch REFUSES — re-inspect the new build and bump
the pin deliberately, never silently.

Usage:
    python -m corpus.sources.wikinews.fetch [dest_dir]
(dest_dir defaults to corpus/data/wikinews/ — gitignored, never committed.)
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

DUMP_URL = (
    "https://dumps.wikimedia.org/jawikinews/latest/"
    "jawikinews-latest-pages-articles.xml.bz2"
)
DUMP_FILENAME = "jawikinews-latest-pages-articles.xml.bz2"
DUMP_SHA256 = "974a67026f3bb0862af662dfde1b3bd701aab860b587dcd05769fbdcbf51d565"
DUMP_LAST_MODIFIED = "2026-08-04"

_DEFAULT_DEST = Path(__file__).resolve().parents[4] / "data" / "wikinews"


class FetchError(RuntimeError):
    pass


def sha256_file(path: str | Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def fetch(
    dest_dir: str | Path = _DEFAULT_DEST,
    url: str = DUMP_URL,
    expected_sha256: str = DUMP_SHA256,
) -> Path:
    """Download the dump into dest_dir, verifying sha256. Refuses on mismatch.

    Idempotent: an existing file with the pinned hash is kept as-is.
    """
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / DUMP_FILENAME

    if dest.exists():
        got = sha256_file(dest)
        if got == expected_sha256:
            return dest
        raise FetchError(
            f"{dest}: existing file sha256 {got} != pinned {expected_sha256} — "
            "refusing to overwrite; inspect and remove it yourself"
        )

    part = dest.with_suffix(dest.suffix + ".part")
    h = hashlib.sha256()
    try:
        with urllib.request.urlopen(url) as resp, part.open("wb") as out:
            while block := resp.read(1 << 20):
                h.update(block)
                out.write(block)
        got = h.hexdigest()
        if got != expected_sha256:
            raise FetchError(
                f"{url}: downloaded sha256 {got} != pinned {expected_sha256} — "
                "upstream 'latest' has changed; re-inspect before bumping the pin"
            )
        part.rename(dest)
    finally:
        part.unlink(missing_ok=True)
    return dest


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    dest_dir = Path(args[0]) if args else _DEFAULT_DEST
    path = fetch(dest_dir)
    print(f"{path} sha256={DUMP_SHA256} (verified)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
