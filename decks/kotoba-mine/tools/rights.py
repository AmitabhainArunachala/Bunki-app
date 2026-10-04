#!/usr/bin/env python3
"""The licence of record for every source record, and which build profile may ship it.

source/rights.json holds what has actually been read:
  aozora                 site string (exactly as shipped) → licence, author, translator,
                         workUrl, and the trailer file and notice the licence was read from
  excludeDomainsPublic   hosts of private people's posts (social sites, personal blogs)
  privateOnlyLicences    licence prefixes that may go into the private study build only

relabel(record)          the record with its licence, author, translator and url set from
                         rights.json; an Aozora work whose trailer nobody has read, or any
                         record without a licence, is "unverified", never "public domain"
allowed(record, profile) whether the record may go into the `private` or `public` build
exclusion(record)        why the public build leaves a record out ("" when it does not)

The Aozora helpers (aozora_header, aozora_licence, aozora_work) are used by
mine_aozora.py and mine_passages.py and tested by test_rights.py.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

RIGHTS = Path(__file__).resolve().parent.parent / "source" / "rights.json"
UNVERIFIED = "unverified"
UNVERIFIED_AOZORA = "unverified (Aozora; licence of record not yet read)"
UNVERIFIED_WEB = "unverified (web page; terms not read)"
ORIGINAL = "Bunki original"
PROFILES = ("private", "public")


@lru_cache(maxsize=None)
def rules() -> dict:
    return json.loads(RIGHTS.read_text("utf-8"))


def is_aozora(record: dict) -> bool:
    return (record.get("site") or "").startswith("青空文庫") or "Aozora" in (record.get("licence") or "") \
        or "aozora.gr.jp" in (record.get("url") or "")


def relabel(record: dict) -> dict:
    """a copy of the record with licence, author, translator and url as rights.json has them"""
    out = dict(record)
    if out.get("kind") == "original":
        return out
    licence = out.get("licence") or ""
    entry = rules()["aozora"].get(out.get("site", "")) if is_aozora(out) else None
    if entry:
        out["licence"] = entry["licence"]
        for field in ("author", "translator"):
            if entry.get(field):
                out[field] = entry[field]
        if entry.get("workUrl"):
            out["url"] = entry["workUrl"]
    elif is_aozora(out) and (not licence or licence.startswith("public domain")):
        out["licence"] = UNVERIFIED_AOZORA  # a site-wide label is not the work's licence
    elif not licence or licence == ORIGINAL:
        out["licence"] = UNVERIFIED  # a mined record cannot be "written for the deck"
    return out


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def private_host(url: str) -> bool:
    """the URL is a post on a social site or personal blog (excludeDomainsPublic)"""
    host = _host(url)
    for d in rules()["excludeDomainsPublic"]:
        if ("." in d and (host == d or host.endswith("." + d))) or ("." not in d and d in host):
            return True
    return False


def exclusion(record: dict) -> str:
    """why the public build leaves this record out; "" when it may ship"""
    if record.get("kind") == "original":
        return ""
    licence = record.get("licence") or UNVERIFIED
    url = record.get("url") or ""
    if url and private_host(url):
        return "social domain"
    if any(licence.startswith(p) for p in rules()["privateOnlyLicences"]):
        if "livedoor" in licence:
            return "livedoor ND"
        if licence.startswith("unverified") and is_aozora(record):
            return "unverified Aozora"
        if is_aozora(record):
            return "restricted Aozora"
        if "personal study" in licence:
            return "web quotation"
        return "unverified" if licence.startswith("unverified") else "other private-only licence"
    if not url and licence.startswith("CC"):
        return "no URL"
    if is_aozora(record) and not record.get("author"):
        return "no author"
    return ""


def allowed(record: dict, profile: str) -> bool:
    if profile not in PROFILES:
        raise ValueError(f"unknown profile {profile!r}; expected one of {PROFILES}")
    return profile == "private" or record.get("kind") == "original" or not exclusion(record)


# ------------------------------------------------------------------ Aozora text files
TRAILER = re.compile(r"^(?:翻訳の)?底本：")
TRANSLATOR = re.compile(r"^(.+?)\s*(改訳|訳|やく)$")
LATIN = re.compile(r"^[\x20-\x7e‘-”]+$")
CC_URL = re.compile(r"creativecommons\.org/licenses/([a-z-]+)/(\d\.\d)(?:/(jp))?", re.I)
CC_JA = re.compile(r"表示((?:\s*[-‐－・]\s*(?:非営利|改変禁止|継承))*)\s*(\d\.\d)\s*(日本|国際)?")
CC_PARTS = {"非営利": "NC", "改変禁止": "ND", "継承": "SA"}


def aozora_header(raw: str) -> dict:
    """title, subtitle, original title, author and translator from the lines above the
    first ----- rule. Translator lines end in 訳 / 改訳 / やく; the author is the last
    line before them; a line in Latin letters between title and author is the original title."""
    lines = []
    for line in raw.splitlines():
        if line.startswith("-----"):
            break
        if line.strip():
            lines.append(line.strip())
    out = {"title": lines[0] if lines else "", "subtitle": "", "originalTitle": "", "author": "", "translator": ""}
    rest = lines[1:]
    translators = []  # (name, 訳 or 改訳), in header order
    while rest and (m := TRANSLATOR.match(rest[-1])):
        translators.insert(0, (m.group(1).strip(), "改訳" if m.group(2) == "改訳" else "訳"))
        rest.pop()
    if rest:
        author = rest.pop()
        out["author"] = re.split(r"[　 ]+(?=[A-Za-z])", author, maxsplit=1)[0].strip()
    for line in rest:
        key = "originalTitle" if LATIN.match(line) else "subtitle"
        if not out[key]:
            out[key] = line
    if len(translators) == 1 and translators[0][1] == "訳":
        out["translator"] = translators[0][0]
    elif translators:
        out["translator"] = "、".join(f"{name}（{role}）" for name, role in translators)
    return out


def aozora_licence(raw: str) -> tuple[str, str]:
    """(licence, the notice it was read from) from the trailer after 底本： / 翻訳の底本：;
    ("", "") when the trailer states none"""
    lines = raw.splitlines()
    start = next((i for i, line in enumerate(lines) if TRAILER.match(line)), None)
    if start is None:
        return "", ""
    for line in lines[start:]:
        if "ライセンス" not in line and "クリエイティブ・コモンズ" not in line:
            continue
        if m := CC_URL.search(line):
            kind, version, jp = m.group(1).lower(), m.group(2), m.group(3)
            return f"CC {kind.upper()} {version}{' JP' if jp else ''}", line.strip()
        if m := CC_JA.search(line):
            parts = [CC_PARTS[p] for p in re.findall("|".join(CC_PARTS), m.group(1))]
            return f"CC {'-'.join(['BY', *parts])} {m.group(2)}{' JP' if m.group(3) == '日本' else ''}", line.strip()
    return "", ""


def aozora_work(raw: str, path: Path) -> dict:
    """the source fields of one Aozora text file at cards/<author>/files/<work>_…/<file>.txt"""
    head = aozora_header(raw)
    licence, notice = aozora_licence(raw)
    author_dir, work = path.parts[-4], path.parts[-2].split("_")[0]
    site = f"青空文庫『{head['title']}』{head['author']}"
    return {
        "kind": "literature",
        "title": head["title"],
        "subtitle": head["subtitle"],
        "originalTitle": head["originalTitle"],
        "author": head["author"],
        "translator": head["translator"],
        "workId": work,
        "site": site,
        "url": f"https://www.aozora.gr.jp/cards/{author_dir}/card{work}.html",
        "licence": licence or UNVERIFIED_AOZORA,
        "licenceNotice": notice,
    }
