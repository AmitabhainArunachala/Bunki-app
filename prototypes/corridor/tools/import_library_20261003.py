"""Offline, inactive library candidate. Never writes the shipped catalogue.

An explicit --ids file chooses a computational sample, NOT John's selection.
--check recomputes and compares every candidate byte without writing. Activation
is outside this source key even if a caller supplies a purported decision.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ARTICLES = HERE.parent / "data/articles"
MANIFEST = REPO / "docs/content/library-20261003.jsonl"
SELECTION = REPO / "docs/content/library-20261003-selection.json"
OUTPUT = Path.home() / ".dharma/bunki/LEAD/reviews/20261029-library-candidate-01.noindex/generated"
PARENT = "7a25bf8d49114ff2b843d7af4d5a23fe1f5d2a73"
SOURCE_MANIFEST_SHA = "ebed044dd27c630901e583ec086fde53cae131cfb2dd60f03da8bb0c62eaaeda"
RULE_SHA = "791181fa256bf02a490834d28e75d637a5ffa4e99c2634d15178787bda216957"
KEY = Path.home() / ".dharma/bunki/LEAD/reviews/20261029-four-keys.noindex/W2-LIBRARY-CANDIDATE-KEY.json"
KEY_SHA = "08d5656e59f4ea248dbc97fad4021590672adf5942b39cfd32fb00454cdc3d13"
SOURCES = {"aozora": "proprietary_safe", "globalvoices-ja": "proprietary_safe",
           "ja.wikipedia": "share_alike", "bunki-original": "original"}


def insist(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def read_pin(ref):
    path = Path(ref["path"])
    insist(path.is_absolute() and path.resolve() == path and not path.is_symlink(), "unsafe input pin")
    data = path.read_bytes()
    insist(digest(data) == ref["sha256"], "stale input: " + str(path))
    return data


def safe_relative(value):
    path = Path(value)
    insist(isinstance(value, str) and not path.is_absolute() and all(p not in ("", ".", "..") for p in value.split("/")), "unsafe relative path")
    return path


def utf16_length(text):
    return len(text.encode("utf-16-le")) // 2


def slug(article_id):
    value = re.sub(r"[^a-zA-Z0-9_-]", "-", article_id)
    insist(value.strip("-"), "empty article slug")
    return value + ".json"


def validate_manifest(rows, original, rule):
    insist(len(rows) == len(original) == 110, "expected exactly 110 source rows")
    insist(len({r["id"] for r in rows}) == 110, "duplicate candidate id")
    insist(len({slug(r["id"]) for r in rows}) == 110, "candidate filename collision")
    reviewed = {r["candidateId"]: r for r in rule["rows"]}
    for order, (row, candidate) in enumerate(zip(rows, original)):
        insist(row["schema"] == 1 and row["sourceOrder"] == order and row["id"] == candidate["id"] and row["candidate"] == candidate,
               "source identity/order/metadata changed")
        src, admitted = row["sourceText"], row["admittedText"]
        safe_relative(src["path"])
        insist(src["path"] == candidate["textFile"], "source text path changed")
        insist(digest(src["text"].encode()) == src["sha256"], "source text hash mismatch")
        insist(admitted == {"sha256": src["sha256"], "text": src["text"], "editMap": []}, "held edits/rewrite must not be applied")
        level = row["level"]
        insist(level["originalLabel"] == candidate["level"], "original level lost")
        reviewed_row = reviewed.get(row["id"])
        expected = reviewed_row["reviewedAuthorLevel"] if reviewed_row else candidate["level"]
        insist(level["authorLevel"] == expected, "ear rule differs")
        if reviewed_row:
            insist(reviewed_row["recordedTextSha256"] == src["sha256"] and level["earReview"] == reviewed_row and
                   level["reviewedAuthorLevel"] == expected,
                   "review not bound to source text")
        else:
            insist(level["earReview"] is None and level["reviewedAuthorLevel"] is None, "invented two-ear review")
        insist(row["admission"]["status"] == "pending" and row["admission"]["humanApproval"] is None and
               row["admission"]["contentReviews"] == [] and row["admission"]["titleReceipts"] == [], "unkeyed admission")
    return rows


def validate_selection(selection, key):
    insist(selection["schema"] == 1 and selection["kind"] == "bunki-library-selection" and
           selection["key"] == {"id": key["id"], "sha256": KEY_SHA}, "selection authority mismatch")
    insist(selection["inputPins"] == key["inputPins"] and selection["proposedWeakExclusions"] == key["selection"]["proposedWeakExclusions"], "input or exclusion scope differs")
    visibility = selection["visibility"]
    insist(visibility["schema"] == 1 and visibility["kind"] == "bunki-library-visibility" and
           visibility["id"] == "library-20261003-apply-cuts" and visibility["active"] is False, "visibility scope differs")
    for field, original in [("hideIds", "currentCutsToHide"), ("alreadyAbsentIds", "alreadyAbsentCuts"),
                            ("keepIds", "keeps"), ("laterIds", "later40Preserved")]:
        insist(visibility[field] == key["selection"][original], "visibility disposition changed: " + field)
    insist(selection["outputRoot"] == str(OUTPUT) and selection["missingInputs"] == key["missingInputs"], "output or held-input scope changed")


def load_inputs():
    selection = json.loads(SELECTION.read_text())
    key = json.loads(read_pin({"path": str(KEY), "sha256": KEY_SHA}))
    validate_selection(selection, key)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    insist(head == PARENT == selection["parent"]["head"], "stale source parent")
    tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=REPO, text=True).strip()
    insist(tree == selection["parent"]["tree"], "source parent tree mismatch")
    read_pin(selection["parent"]["shelf40Acceptance"])
    inputs = {Path(ref["path"]).name: read_pin(ref) for ref in selection["inputPins"]}
    insist(selection["earRule"]["sha256"] == RULE_SHA, "unkeyed ear-rule revision")
    rule = json.loads(read_pin(selection["earRule"]))
    extra = json.loads(read_pin(selection["additionalEarRule"]))
    insist(extra["authority"]["sha256"] == "1e7982aa395e23318e8ff95368b10a954f5cae14ea56644d1f8ed5a85882fd3c", "unkeyed extra ear authority")
    read_pin(extra["authority"])
    rule["rows"] += extra["rows"]
    insist(len(rule["rows"]) == 110 and len({r["candidateId"] for r in rule["rows"]}) == 110, "ear coverage differs")
    raw = MANIFEST.read_bytes()
    insist(digest(raw) == SOURCE_MANIFEST_SHA, "unkeyed source manifest change")
    rows = [json.loads(line) for line in raw.decode().splitlines()]
    original = json.loads(inputs["candidates.json"])
    # The historical file is a flat array; never silently accept a new wrapper.
    insist(isinstance(original, list), "candidate input shape changed")
    validate_manifest(rows, original, rule)
    source_root = Path(next(ref["path"] for ref in selection["inputPins"] if Path(ref["path"]).name == "candidates.json")).parent
    for row in rows:
        path = source_root / safe_relative(row["sourceText"]["path"])
        insist(path.resolve().is_relative_to(source_root) and not path.is_symlink(), "source path escaped")
        insist(digest(path.read_bytes()) == row["sourceText"]["sha256"], "upstream text changed")
    insist(selection["visibility"]["active"] is False and selection["activationDecision"] is None,
           "activation is not authorized by candidate source key")
    insist(selection["candidateSelection"] == {"status": "unapproved", "optionId": None, "ids": []}, "John selection remains pending")
    return rows, selection


def baseline():
    index_raw = (ARTICLES / "index.json").read_bytes()
    archive_raw = (ARTICLES / "archive-index.json").read_bytes()
    index, archive = json.loads(index_raw), json.loads(archive_raw)
    snapshots = {}
    for row in index["articles"] + archive["articles"]:
        rel = safe_relative(row["file"])
        path = ARTICLES / rel
        insist(path.resolve().is_relative_to(ARTICLES) and not path.is_symlink(), "old body path escaped")
        snapshots[str(rel)] = {"bytes": path.stat().st_size, "sha256": digest(path.read_bytes())}
    return index, archive, {"index": digest(index_raw), "archive": digest(archive_raw), "bodies": snapshots}


def selected_rows(rows, ids, index, archive):
    insist(isinstance(ids, list) and bool(ids) and all(isinstance(i, str) for i in ids) and len(ids) == len(set(ids)), "explicit unique computational sample required")
    known = {r["id"] for r in rows}
    insist(set(ids) <= known, "unknown selected id")
    old = index["articles"] + archive["articles"]
    insist(not set(ids) & {r["id"] for r in old}, "existing id collision")
    files = {str(safe_relative(r["file"])) for r in old}
    insist(not {slug(i) for i in ids} & files, "existing filename collision")
    return [r for r in rows if r["id"] in ids]


def offline_engine():
    # Import helpers without calling their main collector, downloader or writer.
    import build_articles as ba
    from corpus.grading._mecab import get_tagger
    from corpus.grading.jread import jread_signal
    from reading_facets import facets, KANKEN
    tagger, maps = get_tagger(), ba.load_jlpt_lexicon()
    levels = json.loads(KANKEN.read_text())["levels"]

    def compute(text, title, title_en, source):
        tokens, paras = ba.tokenise_paragraphs(text, tagger)
        grading = {"signals": {"jreadability": jread_signal(text, tagger=tagger), "jlpt_lexicon": ba.jlpt_signal(tokens, *maps)},
                   "disagreement": {"flag": False, "detail": {"reason": "fewer than two ordinal-capable signals in this candidate"}},
                   "unavailable": {"lexical_coverage": "Pinned NINJAL substrate not admitted to this offline candidate; no download attempted",
                                   "tmr": "Pinned NINJAL substrate not admitted to this offline candidate; no download attempted"}}
        hints = facets({"text": text, "title": title, "titleEn": title_en, "source": source, "tokens": tokens, "grading": grading}, levels)
        return tokens, paras, grading, hints
    return compute


def assemble(row, compute):
    c, text = row["candidate"], row["admittedText"]["text"]
    insist(c["source"] in SOURCES, "unrecognized source family")
    source = "aozorabunko-clean" if c["source"] == "aozora" else c["source"]
    tokens, paras, grading, hints = compute(text, c["title"], c["titleEn"], source)
    metrics = {"charsUnit": "unicode-codepoint", "utf16Length": utf16_length(text), "readingAnchorUnit": "utf16", "tokenPositionUnit": "token-index"}
    metadata = {k: c[k] for k in ["id", "title", "titleEn", "author", "source", "url", "licence", "attribution", "date", "part"] if k in c}
    metadata.update({"source": source, "sourceLabel": c["attribution"], "rubySource": "tokenizer",
                     "pool": SOURCES[c["source"]], "file": slug(c["id"]), "authorLevel": row["level"]["authorLevel"],
                     "originalAuthorLevel": row["level"]["originalLabel"], "authorLevelProvenance": row["level"],
                     "chars": len(text), "textMetrics": metrics, "libraryCandidate": {"schema": 1, "sourceTextSha256": row["sourceText"]["sha256"],
                     "admittedTextSha256": row["admittedText"]["sha256"], "admission": "pending", "installable": False},
                     "grading": grading, "readingFacets": hints, "truncated": False})
    seeds = list(dict.fromkeys(t["b"] for t in tokens if t.get("c") and len(t["s"]) > 1))[:6]
    body = {**metadata, "text": text, "tokens": tokens, "paras": paras, "provenance": c,
            "admission": row["admission"], "editMap": row["admittedText"]["editMap"]}
    return {**metadata, "snippet": text.replace("\n", " ")[:64], "seeds": seeds}, body


def output_path(out):
    out = Path(out)
    insist(out.is_absolute() and out.resolve() == out and out != OUTPUT and out.is_relative_to(OUTPUT), "output must be a fresh named directory beneath the keyed generated root")
    insist(not any(p.is_symlink() for p in [out, *out.parents]), "symlink output rejected")
    return out


def generate(out, ids, *, check=False, activate=False, compute=None):
    insist(not activate, "activation held: John decision, title/content acceptance and a separate output key required")
    out = output_path(out)
    rows, selection = load_inputs()
    index, archive, before = baseline()
    selected = selected_rows(rows, ids, index, archive)
    compute = compute or offline_engine()
    files, proposed = {}, []
    for row in selected:
        item, body = assemble(row, compute)
        files["candidate-bodies/" + item["file"]] = encoded(body)
        proposed.append(item)
    # The inactive installation projection is byte-identical to the accepted shelf.
    # Proposed rows are separate, explicitly unadmitted, never a bootable index.
    files["inactive-index.json"] = (ARTICLES / "index.json").read_bytes()
    files["candidate-index.json"] = encoded({"schema": 1, "kind": "bunki-unadmitted-library-candidate", "installable": False,
        "parent": selection["parent"], "sampleIds": [r["id"] for r in selected], "johnSelection": None,
        "proposedVisibility": selection["visibility"], "existingRows": index["articles"], "candidateRows": proposed,
        "missingInputs": selection["missingInputs"]})
    files["report.json"] = encoded({"schema": 1, "status": "INACTIVE_UNADMITTED_CANDIDATE", "activation": False,
        "sourceRows": len(rows), "sampleRows": len(selected), "currentRows": len(index["articles"]), "archiveRows": len(archive["articles"]),
        "missingInputs": selection["missingInputs"], "sourceManifestSha256": digest(MANIFEST.read_bytes()),
        "selectionSha256": digest(SELECTION.read_bytes()), "baseline": before})
    manifest = {"schema": 1, "parent": selection["parent"], "files": [{"relativePath": name, "bytes": len(data), "sha256": digest(data)} for name, data in sorted(files.items())]}
    files["MANIFEST.json"] = encoded(manifest)
    insist(baseline()[2] == before, "baseline changed during computation")
    if check:
        insist(out.is_dir(), "check output absent")
        actual = {str(p.relative_to(out)) for p in out.rglob("*") if p.is_file() or p.is_symlink()}
        insist(actual == set(files), "output path set differs")
        for rel, data in files.items():
            p = out / rel
            insist(not p.is_symlink() and p.read_bytes() == data, "candidate byte mismatch: " + rel)
    else:
        insist(not out.exists(), "output already exists; use --check, never overwrite")
        out.mkdir(parents=True)
        for rel, data in files.items():
            path = out / rel
            path.parent.mkdir(exist_ok=True)
            with path.open("xb") as handle:
                handle.write(data)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--ids", required=True, type=Path, help="JSON array: computational sample only, not selection approval")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    result = generate(args.out, json.loads(args.ids.read_text()), check=args.check, activate=args.activate)
    print(json.dumps({"status": "CHECKED" if args.check else "GENERATED_INACTIVE", "files": len(result["files"]), "out": str(args.out)}))
