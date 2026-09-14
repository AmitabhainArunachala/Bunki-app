#!/usr/bin/env python3
"""Build ONLY Corridor's isolated, attributed CC BY-SA SKIP sidecar.

The original SKIP-stripped corpus and its allowlist are intentionally untouched.
No external dependencies. With no --archive, downloads via authenticated gh.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess
import zipfile

CORRIDOR = Path(__file__).resolve().parents[1]
REPO = CORRIDOR.parents[1]
PIN = runpy.run_path(str(REPO / "corpus/src/corpus/sources/jmdict/fetch.py"))
MISCLASS = ("posn", "stroke_count", "stroke_and_posn", "stroke_diff")
PERMISSION = "https://www.kanji.org/dictionaries/skip_permission.htm"
LICENCE = "https://creativecommons.org/licenses/by-sa/4.0/"
RULES = "http://www.edrdg.org/wwwjdic/SKIP.html"
EDRDG = "https://www.edrdg.org/edrdg/licence.html"
LEGACY = "http://www.edrdg.org/wiki/KANJIDIC_Project.html"
# Fail closed on any new anomaly rather than silently correct source records.
KNOWN_ISSUES = {
    ("㡀", "4-2-5", None),
    ("口", "3-3-0", "posn"),
    ("門", "3-8-0", "posn"),
    ("囗", "3-3-0", "posn"),
}


def issue_reason(code: str) -> str | None:
    if not re.fullmatch(r"[1-4]-[1-9][0-9]*-[1-9][0-9]*", code):
        return "Source code has a nonpositive stroke field or invalid SKIP syntax."
    pattern, _, third = map(int, code.split("-"))
    if pattern == 4 and third > 4:
        return "Source solid subtype exceeds 4; retained verbatim, excluded from strict lookup."
    return None


def read_archive(path: Path) -> dict:
    expected = PIN["PINNED_SHA256"][PIN["KANJIDIC_ASSET"]]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise ValueError(f"SHA-256 mismatch: expected {expected}, got {digest}")
    with zipfile.ZipFile(path) as archive:
        members = archive.namelist()
        if len(members) != 1 or not members[0].endswith(".json"):
            raise ValueError(f"Expected exactly one JSON member, found {members}")
        with archive.open(members[0]) as stream:
            return json.load(stream)


def unique(values: list) -> list:
    return list(dict.fromkeys(values))


def build(source: dict) -> dict:
    entries = []
    issue_keys = set()
    seen = set()
    for char in source["characters"]:
        codes = [q for q in char.get("queryCodes", []) if q["type"] == "skip"]
        if not codes:
            continue
        literal = char["literal"]
        if literal in seen:
            raise ValueError(f"Duplicate source literal: {literal}")
        seen.add(literal)
        canonical, alternatives, issues, normalizations = [], [], [], []
        for code in codes:
            original, misclass = code["value"], code.get("skipMisclassification")
            value = "-".join(str(int(part)) for part in original.split("-"))
            if original != value:
                normalizations.append({"from": original, "to": value, "misclass": misclass})
            if misclass is not None and misclass not in MISCLASS:
                raise ValueError(f"Unrecognized SKIP misclassification: {misclass}")
            if misclass is None:
                canonical.append(value)
            else:
                alternatives.append({"code": value, "misclass": misclass})
            reason = issue_reason(value)
            if reason:
                issue_keys.add((literal, value, misclass))
                issues.append({"code": value, "misclass": misclass, "reason": reason})
        if not canonical:
            raise ValueError(f"No canonical code for {literal}")
        rm = char.get("readingMeaning") or {}
        on, kun, meanings = [], [], []
        for group in rm.get("groups") or []:
            for reading in group.get("readings") or []:
                if reading["type"] == "ja_on":
                    on.append(reading["value"])
                elif reading["type"] == "ja_kun":
                    kun.append(reading["value"])
            meanings.extend(m["value"] for m in group.get("meanings", []) if m["lang"] == "en")
        radicals = [r["value"] for r in char.get("radicals", []) if r["type"] == "classical"]
        if len(radicals) > 1 or any(not 1 <= r <= 214 for r in radicals):
            raise ValueError(f"Ambiguous or invalid classical radical for {literal}")
        misc = char.get("misc") or {}
        entry = {
            "literal": literal,
            "canonical": canonical,
            "alternatives": alternatives,
            "readings": {"on": unique(on), "kun": unique(kun), "nanori": unique(rm.get("nanori") or [])},
            "meanings": unique(meanings),
            "radical": radicals[0] if radicals else None,
            "strokeCounts": misc.get("strokeCounts") or [],
            "frequency": misc.get("frequency"),
        }
        if issues:
            entry["sourceIssues"] = issues
        if normalizations:
            entry["sourceNormalizations"] = normalizations
        entries.append(entry)
    if issue_keys != KNOWN_ISSUES:
        raise ValueError(f"Source anomalies changed; review before repinning: {issue_keys}")
    # Unicode scalar order avoids locale-dependent builds and rankings.
    entries.sort(key=lambda entry: entry["literal"])
    categories = Counter(a["misclass"] for e in entries for a in e["alternatives"])
    patterns = Counter(c.split("-")[0] for e in entries for c in e["canonical"])
    counts = {
        "sourceCharacters": len(source["characters"]),
        "entries": len(entries),
        "canonicalCodes": sum(len(e["canonical"]) for e in entries),
        "alternateCodes": sum(categories.values()),
        "alternateCategories": {k: categories[k] for k in MISCLASS},
        "canonicalPatterns": {str(k): patterns[str(k)] for k in range(1, 5)},
        "sourceIssues": len(issue_keys),
        "normalizedSourceCodes": sum(len(e.get("sourceNormalizations", [])) for e in entries),
        "searchableCanonicalEntries": sum(any(not issue_reason(c) for c in e["canonical"]) for e in entries),
        "searchableAlternateCodes": sum(not issue_reason(a["code"]) for e in entries for a in e["alternatives"]),
        "entriesWithRadical": sum(e["radical"] is not None for e in entries),
        "entriesWithoutJapaneseReadings": sum(not e["readings"]["on"] and not e["readings"]["kun"] for e in entries),
        "entriesWithoutEnglishMeanings": sum(not e["meanings"] for e in entries),
    }
    if (counts["entries"], counts["canonicalCodes"], counts["alternateCodes"]) != (10384, 10384, 942):
        raise ValueError(f"Pinned coverage changed; review before repinning: {counts}")
    return {
        "schemaVersion": 1,
        "pool": "share_alike",
        "licence": "CC BY-SA 4.0",
        "licenceUrl": LICENCE,
        "sources": [
            {
                "name": "SKIP — System of Kanji Indexing by Patterns",
                "author": "Jack Halpern",
                "url": "https://www.kanji.org/",
                "licence": "CC BY-SA 4.0",
                "licenceUrl": LICENCE,
                "permissionUrl": PERMISSION,
                "permissionEffectiveDate": "2014-12-12",
                "permissionVerifiedDate": "2026-09-14",
                "attribution": "The SKIP (System of Kanji Indexing by Patterns) system for ordering kanji was developed by Jack Halpern (Kanji Dictionary Publishing Society at https://www.kanji.org/), and is used with his permission.",
            },
            {
                "name": "KANJIDIC2 SKIP codes, Japanese readings, English meanings and classical radicals",
                "url": "https://www.edrdg.org/",
                "licence": "CC BY-SA 4.0",
                "licenceUrl": EDRDG,
                "attribution": "This file uses the KANJIDIC2 dictionary file, the property of the Electronic Dictionary Research and Development Group, in conformance with the Group's licence.",
            },
            {
                "name": "jmdict-simplified JSON conversion",
                "url": "https://github.com/scriptin/jmdict-simplified",
                "attribution": "JSON conversion by the jmdict-simplified project (scriptin/jmdict-simplified).",
                "release": PIN["PINNED_TAG"],
                "asset": PIN["KANJIDIC_ASSET"],
                "assetUrl": PIN["asset_url"](PIN["KANJIDIC_ASSET"]),
                "sha256": PIN["PINNED_SHA256"][PIN["KANJIDIC_ASSET"]],
            },
        ],
        "provenance": {
            "dictionaryDate": source["dictDate"],
            "databaseVersion": source["databaseVersion"],
            "rulesUrl": RULES,
            "changes": "Bunki extracts all SKIP codes and their original misclassification categories, Japanese readings, English meanings, classical radical and stroke metadata; deduplicates fallback text, sorts literals, normalizes numeric leading zeros with original spelling recorded, and flags four source-rule anomalies without correcting them. No codes are inferred.",
            "licensingConflict": {
                "url": LEGACY,
                "notice": "The legacy EDRDG KANJIDIC project page says SKIP is CC Attribution-Noncommercial-Share Alike 4.0. This conflicts with the rights holder's explicit CC BY-SA 4.0 announcement effective December 12, 2014, which expressly permits commercial use. This isolated sidecar follows the rights holder's permission; the older SKIP-stripped corpus is unchanged.",
                "controllingPermissionUrl": PERMISSION,
            },
        },
        "counts": counts,
        "entries": entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Use an already downloaded, hash-verified pinned ZIP.")
    parser.add_argument("--cache-dir", type=Path, default=Path.home() / ".cache/bunki-skip")
    parser.add_argument("--output", type=Path, default=CORRIDOR / "data/share_alike/skip.json")
    parser.add_argument("--check", action="store_true", help="Compare reproducible bytes without writing.")
    args = parser.parse_args()
    archive = args.archive or args.cache_dir / PIN["KANJIDIC_ASSET"]
    if not archive.exists():
        if args.archive:
            parser.error(f"Archive not found: {archive}")
        args.cache_dir.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            "gh", "release", "download", PIN["PINNED_TAG"], "--repo", PIN["REPO"],
            "--pattern", PIN["KANJIDIC_ASSET"], "--dir", str(args.cache_dir),
        ], check=True)
    doc = build(read_archive(archive))
    encoded = (json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if args.check:
        if not args.output.exists() or args.output.read_bytes() != encoded:
            raise SystemExit("FAIL: sidecar differs from the pinned reproducible build")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(encoded)
    print(json.dumps({"output": str(args.output), "bytes": len(encoded),
                      "sha256": hashlib.sha256(encoded).hexdigest(),
                      "check": args.check, "counts": doc["counts"]}, indent=2))


if __name__ == "__main__":
    main()
