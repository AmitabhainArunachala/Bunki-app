#!/usr/bin/env python3
"""Build data/share_alike/kkld.json — Kodansha Kanji Learner's Dictionary entry numbers
per kanji, from KANJIDIC2 (EDRDG, CC BY-SA 4.0).

  halpern_kkld_2ed  → the 2013 "Revised and Expanded" edition (2,904 kanji carry it)
  halpern_kkld      → the 1999 first edition (2,230 kanji)

The 2022 "Revised and Expanded: 2nd Edition" has no public mapping; if it renumbered,
that is unverified — the app labels every number by edition for that reason.

Usage: python3 prototypes/corridor/tools/build-kkld-data.py /path/to/kanjidic2.xml
Writes: prototypes/corridor/data/share_alike/kkld.json (deterministic, sorted)
"""
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data" / "share_alike" / "kkld.json"


def main(src: str) -> None:
    xml = Path(src)
    sha = hashlib.sha256(xml.read_bytes()).hexdigest()
    root = ET.parse(xml).getroot()
    header = root.find("header")
    version = (header.findtext("database_version") or "").strip() if header is not None else ""
    created = (header.findtext("date_of_creation") or "").strip() if header is not None else ""
    entries = {}
    by_2013 = {}
    by_1999 = {}
    for ch in root.iter("character"):
        lit = ch.findtext("literal")
        refs = {r.get("dr_type"): r.text.strip() for r in ch.iter("dic_ref") if r.text}
        n2 = refs.get("halpern_kkld_2ed")
        n1 = refs.get("halpern_kkld")
        if not (n2 or n1):
            continue
        rec = {}
        if n2 and n2.isdigit():
            rec["ed2013"] = int(n2)
            by_2013.setdefault(str(int(n2)), []).append(lit)
        if n1 and n1.isdigit():
            rec["ed1999"] = int(n1)
            by_1999.setdefault(str(int(n1)), []).append(lit)
        if rec:
            entries[lit] = rec
    data = {
        "schemaVersion": 1,
        "pool": "share_alike",
        "licence": "CC BY-SA 4.0 — KANJIDIC2 is the property of the Electronic Dictionary Research and Development Group (EDRDG) and is used in conformance with the Group's licence",
        "licenceUrl": "https://www.edrdg.org/edrdg/licence.html",
        "sources": [{
            "name": "KANJIDIC2",
            "url": "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
            "database_version": version,
            "date_of_creation": created,
            "sha256": sha,
            "fields": ["halpern_kkld_2ed", "halpern_kkld"],
        }],
        "editions": {
            "ed2013": "Kodansha Kanji Learner's Dictionary, Revised and Expanded (2013), ed. Jack Halpern — KANJIDIC2 field halpern_kkld_2ed",
            "ed1999": "Kodansha Kanji Learner's Dictionary (1999), ed. Jack Halpern — KANJIDIC2 field halpern_kkld",
            "ed2022": "Revised and Expanded: 2nd Edition (2022) — no public mapping; numbering relative to 2013 unverified",
        },
        "counts": {"kanji": len(entries), "ed2013": len(by_2013), "ed1999": len(by_1999)},
        "entries": dict(sorted(entries.items())),
        "byNumber2013": {k: v for k, v in sorted(by_2013.items(), key=lambda kv: int(kv[0]))},
        "byNumber1999": {k: v for k, v in sorted(by_1999.items(), key=lambda kv: int(kv[0]))},
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT} kanji={len(entries)} ed2013={len(by_2013)} ed1999={len(by_1999)} kanjidic2={version} {created}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
