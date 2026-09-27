#!/usr/bin/env python3
"""Record a narrow host authoring patch without replacing the original model output."""
import argparse
import copy
import hashlib
import importlib.util
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-run", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--job", required=True)
    args = parser.parse_args()
    source, output = Path(args.source_run).resolve(), Path(args.out).resolve()
    private = (Path.home() / ".dharma").resolve()
    assert source.is_relative_to(private) and output.is_relative_to(private)
    assert args.job.replace("-", "").isalnum() and not output.exists()
    directory = source / args.job
    original = {name: (directory / name).read_bytes() for name in ["request.json", "response.json", "runtime.json"]}
    request, response, runtime = [json.loads(original[name]) for name in ["request.json", "response.json", "runtime.json"]]
    assert runtime["status"] == "blocked" and runtime["identityVerified"] is True
    assert runtime["failurePhase"] == "output-validation" and runtime["reason"] == "missing-listening-stimulus"
    assert runtime["requestSha256"] == sha(original["request.json"])
    assert request["job"]["task"] == "listening-integrated"
    patched = copy.deepcopy(response)
    edits = []
    for index, item in enumerate(patched["batch"]["items"]):
        if item["spokenQuestion"] is None and item["printedOptions"] is True:
            assert item["prompt"].strip() and "か" in item["prompt"]
            item["spokenQuestion"] = item["prompt"]
            edits.append({"itemIndex": index, "localId": item["localId"], "field": "spokenQuestion", "before": None, "after": item["prompt"]})
    assert edits, "No permitted host authoring patch"
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("author_batches", Path(__file__).with_name("author-batches.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.validate_batch(patched["batch"], request["job"])
    patch = {"schema": "kairo-host-authoring-patch/1", "at": datetime.now(timezone.utc).isoformat(), "authorFamily": "openai", "authorAgent": "Codex", "sourceProviderFamily": runtime["familyId"], "reason": "Copy each already-authored printed integrated question into its required spoken-question slot. Answers, choices, rationale and dialogue are unchanged.", "sourceHashes": {name: sha(data) for name, data in original.items()}, "edits": edits, "review": "not-established", "providerRetry": False}
    shutil.copytree(source, output)
    target = output / args.job
    archive = target / "unpatched-provider-output"
    archive.mkdir()
    for name, data in original.items():
        (archive / name).write_bytes(data)
    write(target / "host-patch.json", patch)
    write(target / "response.json", patched)
    receipt = {**runtime, "status": "completed", "providerOutputStatus": "blocked", "validation": "host-authored-mechanical-patch", "authorFamilies": [runtime["familyId"], "openai"], "hostPatchSha256": sha((target / "host-patch.json").read_bytes()), "sourceRuntimeSha256": sha(original["runtime.json"]), "responseSha256": sha((target / "response.json").read_bytes()), "finishedAt": patch["at"]}
    write(target / "runtime.json", receipt)
    print(json.dumps({"status": "authored-not-reviewed", "job": args.job, "out": str(output), "edits": len(edits), "providerCalls": 0}))


if __name__ == "__main__":
    main()
