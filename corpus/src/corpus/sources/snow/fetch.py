"""Download the SNOW T15/T23 xlsx releases, pinned by sha256.

Distribution chain, verified empirically 2026-08-07:

- Lab pages (Nagaoka University of Technology, Yamamoto lab / 言語商会):
  https://www.jnlp.org/GengoHouse/snow/t15 and .../snow/t23
- Each page's download link is a CGI on jnlp.org:
  https://www.jnlp.org/cgi-priv/download.cgi?id=SNOW/T15 (and =SNOW/T23),
  which answers HTTP 200 with a meta-refresh redirect to the actual bytes on
  the lab's pCloud public folder (URLs in ``DOWNLOAD_URLS`` below).
- The HuggingFace mirror ``SNOW-NLP/snow_simplified_japanese_corpus``
  (rev 045daaa598ea073e43fca3baf1d3445aa85c5b91) hosts NO data bytes — it is a
  legacy loader script whose ``_URLs`` dict points at the SAME two pCloud URLs.

So the pCloud URLs are the single physical distribution point for both routes;
we fetch them directly and pin the bytes. Release: 2020-01-07 ("2020/1/7 対応の
おかしかった下記の行…について修正しました" — 13 T15 rows realigned).

``fetch()`` is idempotent: an existing file that matches its pin is kept, a
mismatching file is an error (never silently overwritten).
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

PAGE_URLS = {
    "t15": "https://www.jnlp.org/GengoHouse/snow/t15",
    "t23": "https://www.jnlp.org/GengoHouse/snow/t23",
}

CGI_URLS = {
    "t15": "https://www.jnlp.org/cgi-priv/download.cgi?id=SNOW/T15",
    "t23": "https://www.jnlp.org/cgi-priv/download.cgi?id=SNOW/T23",
}

DOWNLOAD_URLS = {
    "t15": "https://filedn.com/lit4DCIlHwxfS1gj9zcYuDJ/SNOW/T15-2020.1.7.xlsx",
    "t23": "https://filedn.com/lit4DCIlHwxfS1gj9zcYuDJ/SNOW/T23-2020.1.7.xlsx",
}

FILENAMES = {
    "t15": "T15-2020.1.7.xlsx",
    "t23": "T23-2020.1.7.xlsx",
}

SHA256 = {
    "t15": "46f6e788e744876b08ca432c585e2942ac6a8a35c8c9ab6687ed7e371a0bc0ac",
    "t23": "71a8923f024c26c28543663b46aab4e9b6af7c2e8f99a8644190942d8f63c7ca",
}


class FetchError(RuntimeError):
    pass


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def fetch(dest_dir: str | Path, corpus: str) -> Path:
    if corpus not in DOWNLOAD_URLS:
        raise FetchError(f"unknown corpus {corpus!r}; expected one of {sorted(DOWNLOAD_URLS)}")
    dest = Path(dest_dir) / FILENAMES[corpus]
    if dest.exists():
        digest = sha256_file(dest)
        if digest != SHA256[corpus]:
            raise FetchError(
                f"{dest}: sha256 {digest} does not match pin {SHA256[corpus]} — "
                "delete the file to re-download, or update the pin deliberately"
            )
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(DOWNLOAD_URLS[corpus]) as resp, tmp.open("wb") as out:
        while chunk := resp.read(1 << 20):
            out.write(chunk)
    digest = sha256_file(tmp)
    if digest != SHA256[corpus]:
        tmp.unlink()
        raise FetchError(
            f"{DOWNLOAD_URLS[corpus]}: downloaded sha256 {digest} does not match "
            f"pin {SHA256[corpus]} — upstream changed; re-verify before updating the pin"
        )
    tmp.rename(dest)
    return dest


def fetch_all(dest_dir: str | Path) -> dict[str, Path]:
    return {c: fetch(dest_dir, c) for c in sorted(DOWNLOAD_URLS)}


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    dest = Path(args[0]) if args else Path("data/snow")
    for corpus, path in fetch_all(dest).items():
        print(f"{corpus}: {path} sha256={sha256_file(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
