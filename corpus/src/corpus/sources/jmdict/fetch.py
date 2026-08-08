"""Pinned download of scriptin/jmdict-simplified release assets.

Discovery and fetching are deliberately separate. Builds always fetch
``PINNED_TAG`` with sha256 verification, so a new upstream release never
changes output until the pin, the hashes, the counts, and the committed
dataset are re-verified together. The EDRDG licence expects derived
distributions to be kept reasonably current — ``latest_release()`` exists so
re-pinning is one command, not archaeology.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

REPO = "scriptin/jmdict-simplified"

PINNED_TAG = "3.6.2+20260803141815"
JMDICT_ASSET = "jmdict-eng-3.6.2+20260803141815.json.zip"
KANJIDIC_ASSET = "kanjidic2-en-3.6.2+20260803141815.json.zip"
PINNED_SHA256 = {
    JMDICT_ASSET: "1806d2817215ebe7ded997c8dac4831a3335d83ed12f321ac869a97e745d3a5c",
    KANJIDIC_ASSET: "5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6",
}

DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "jmdict"


class FetchError(RuntimeError):
    pass


def latest_release() -> dict:
    """Ask the GitHub API for the newest release (re-pinning aid, not the build path)."""
    out = subprocess.run(
        ["gh", "api", f"repos/{REPO}/releases/latest"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    raw = json.loads(out)
    return {
        "tag": raw["tag_name"],
        "assets": {a["name"]: a["browser_download_url"] for a in raw["assets"]},
    }


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def asset_url(asset: str, tag: str = PINNED_TAG) -> str:
    q = urllib.parse.quote
    return f"https://github.com/{REPO}/releases/download/{q(tag, safe='')}/{q(asset, safe='')}"


def fetch(asset: str, dest_dir: Path = DATA_DIR) -> Path:
    if asset not in PINNED_SHA256:
        raise FetchError(f"{asset} is not a pinned asset; add it to PINNED_SHA256 deliberately")
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / asset
    if dest.exists() and sha256(dest) == PINNED_SHA256[asset]:
        return dest
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(asset_url(asset)) as resp, tmp.open("wb") as out:
        while chunk := resp.read(1 << 20):
            out.write(chunk)
    got = sha256(tmp)
    if got != PINNED_SHA256[asset]:
        tmp.unlink()
        raise FetchError(
            f"{asset}: sha256 mismatch — expected {PINNED_SHA256[asset]}, got {got}. "
            "Upstream changed under the pin; re-verify before trusting."
        )
    tmp.replace(dest)
    return dest


def load_json(asset: str, dest_dir: Path = DATA_DIR) -> dict:
    """Fetch (if needed) and parse the single JSON file inside a release zip."""
    path = fetch(asset, dest_dir)
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        if len(names) != 1:
            raise FetchError(f"{asset}: expected one member, found {names}")
        with z.open(names[0]) as f:
            return json.load(f)
