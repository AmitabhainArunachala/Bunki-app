#!/usr/bin/env python3
"""Bounded, resumable private authoring queue. No publication, process control, or paid fallback."""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--resume-from")
    parser.add_argument("--passes", type=int, default=3)
    args = parser.parse_args()
    root = Path(args.out).expanduser().resolve()
    if not root.is_relative_to((Path.home() / ".dharma").resolve()) or not 1 <= args.passes <= 3:
        raise ValueError("bounded-private-queue-required")
    if root.exists() and any(root.iterdir()):
        raise ValueError("queue-output-exists-use-new-queue-revision-with-resume-from")
    root.mkdir(parents=True, exist_ok=True)
    scripts = Path(__file__).resolve().parent
    previous = args.resume_from
    receipt = {"schema": "kairo-private-authoring-queue/1", "startedAt": datetime.now(timezone.utc).isoformat(), "jobs": str(Path(args.jobs).resolve()), "provider": "ollama", "model": "glm-5.2:cloud", "maxConcurrentCalls": 1, "maxPasses": args.passes, "publication": "never", "runs": []}
    def save():
        (root / "queue.json").write_text(json.dumps(receipt, indent=2) + "\n")
    save()
    for index in range(1, args.passes + 1):
        output = root / f"pass-{index}"
        if output.exists():
            raise ValueError("queue-output-exists-use-new-queue-revision-with-resume-from")
        cmd = [sys.executable, str(scripts / "author-batches.py"), "--jobs", args.jobs, "--out", str(output), "--registry-model", "glm-5.2", "--provider", "ollama", "--route-model", "glm-5.2:cloud", "--family", "glm", "--max-tokens", "12000", "--timeout", "180", "--continue-on-failure"]
        if previous:
            cmd.extend(["--resume-from", previous, "--repair-from", previous])
        receipt["activeRun"] = str(output)
        save()
        result = subprocess.run(cmd, check=False)
        receipt["runs"].append({"path": str(output), "exitCode": result.returncode})
        collect = subprocess.run(["node", str(scripts / "collect-authoring-packets.mjs"), args.jobs, str(output), str(root / "packets")], check=False)
        receipt["runs"][-1]["collectorExitCode"] = collect.returncode
        save()
        if result.returncode == 2:
            receipt["status"] = "provider-limit-no-fallback"
            save()
            return 2
        if result.returncode not in [0, 1] or collect.returncode != 0:
            receipt["status"] = "runner-error-needs-investigation"
            save()
            return 1
        if result.returncode == 0:
            receipt["status"] = "authored-not-reviewed"
            receipt["finishedAt"] = datetime.now(timezone.utc).isoformat()
            save()
            return 0
        previous = str(output)
    receipt["status"] = "bounded-retries-exhausted-incomplete-candidates-retained"
    receipt["finishedAt"] = datetime.now(timezone.utc).isoformat()
    save()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
