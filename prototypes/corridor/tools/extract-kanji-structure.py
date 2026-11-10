#!/usr/bin/env python3
"""Offline, deterministic KanjiVG group projection; never downloads or rewrites strokes.

--source-dir holds six verbatim upstream SVGs, pinned in source-manifest.json.
--check rederives the complete projection and compares existing JSON; no writes.
The runtime model checks exact path parity again. XML source attributes are
retained as evidence, never interpreted as semantic or phonetic role assertions.
"""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

COMMIT = "61e39cfc29724132a6f8823b166296932985a0ff"
REPOSITORY = "https://github.com/KanjiVG/kanjivg"
GLYPHS = "森品晶織識職"
SVG = "{http://www.w3.org/2000/svg}"
KVG = "{http://kanjivg.tagaini.net}"


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def project_xml(literal, raw, runtime_paths):
    # ElementTree does not retrieve the external SVG DTD. Reject custom entities.
    require(b"<!ENTITY" not in raw, f"{literal}: custom entities forbidden")
    root = ET.fromstring(raw)
    hexa = f"{ord(literal):05x}"
    require(root.tag == SVG + "svg" and root.get("viewBox") == "0 0 109 109",
            f"{literal}: SVG/viewBox differs")
    wrappers = [e for e in root.iter(SVG + "g") if e.get("id") == f"kvg:StrokePaths_{hexa}"]
    require(len(wrappers) == 1, f"{literal}: stroke wrapper missing/duplicated")
    paths, groups = [], []
    all_source_paths = list(root.iter(SVG + "path"))
    require(list(wrappers[0].iter(SVG + "path")) == all_source_paths,
            f"{literal}: unexpected paths outside stroke wrapper")
    require(root.get("transform") is None and
            all(e.get("transform") is None for e in wrappers[0].iter()),
            f"{literal}: transformed geometry unsupported")

    def visit(element, path, parent):
        attrs = dict(sorted(element.attrib.items()))
        group = {
            "path": path, "parentPath": parent,
            "element": attrs.get(KVG + "element"),
            "attributes": attrs, "childPaths": [],
            "directStrokeIndices": [], "strokeIndices": [],
        }
        groups.append(group)
        for child_index, child in enumerate(element):
            if child.tag == SVG + "g":
                child_path = f"{path}/{child_index}"
                group["childPaths"].append(child_path)
                group["strokeIndices"].extend(visit(child, child_path, path))
            elif child.tag == SVG + "path":
                index = len(paths)
                require(child.get("id") == f"kvg:{hexa}-s{index + 1}",
                        f"{literal}: source stroke IDs/order differ at {index}")
                require(isinstance(child.get("d"), str) and child.get("d"),
                        f"{literal}: empty path at {index}")
                paths.append(child.get("d"))
                group["directStrokeIndices"].append(index)
                group["strokeIndices"].append(index)
            else:
                raise ValueError(f"{literal}: unsupported geometry child {child.tag}")
        return group["strokeIndices"]

    visit(wrappers[0], "$", None)
    require(len(paths) == len(runtime_paths),
            f"{literal}: stroke count differs: source {len(paths)}, runtime {len(runtime_paths)}")
    for index, (source, runtime) in enumerate(zip(paths, runtime_paths)):
        require(source == runtime, f"{literal}: stroke {index} differs from runtime")
    return {
        "source": {
            "path": f"kanji/{hexa}.svg",
            "url": f"https://raw.githubusercontent.com/KanjiVG/kanjivg/{COMMIT}/kanji/{hexa}.svg",
            "sha256": digest(raw), "bytes": len(raw),
        },
        "viewBox": root.get("viewBox"), "paths": paths, "groups": groups,
    }


def derive(source_dir, strokes_path):
    manifest = json.loads((source_dir / "source-manifest.json").read_text())
    require(manifest["commit"] == COMMIT and manifest["repository"] == REPOSITORY,
            "source manifest revision differs")
    files = manifest["files"]
    require(len(files) == len(GLYPHS) and {row["literal"] for row in files} == set(GLYPHS),
            "source manifest must contain exactly six representative glyphs")
    strokes = json.loads(strokes_path.read_text())["strokes"]
    characters = {}
    for literal in GLYPHS:
        row = next(row for row in files if row["literal"] == literal)
        filename = f"{ord(literal):05x}.svg"
        require(row["file"] == filename, f"{literal}: source filename differs")
        raw = (source_dir / filename).read_bytes()
        require(row["sha256"] == digest(raw) and row["bytes"] == len(raw),
                f"{literal}: source bytes/hash differ")
        record = project_xml(literal, raw, strokes[literal])
        require(row["url"] == record["source"]["url"], f"{literal}: source URL differs")
        require(b"Attribution-Share Alike 3.0 Licence" in raw and
                b"Copyright (C)" in raw, f"{literal}: source attribution absent")
        characters[literal] = record
    return {
        "schemaVersion": 1,
        "source": {
            "name": "KanjiVG", "repository": REPOSITORY, "commit": COMMIT,
            "license": "CC BY-SA 3.0", "attribution": "KanjiVG — Ulrich Apel",
            "modificationStatus": "derived group hierarchy; stroke paths unchanged",
        },
        "characters": characters,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--strokes", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = derive(args.source_dir, args.strokes)
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        require(args.output.read_text() == text, "generated grouping differs")
    else:
        args.output.write_text(text)
    print(json.dumps({
        "mode": "check" if args.check else "write", "characters": len(result["characters"]),
        "sha256": digest(text.encode()), "sourceCommit": COMMIT,
    }))


if __name__ == "__main__":
    main()
