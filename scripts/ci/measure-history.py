#!/usr/bin/env python3
"""Summarize downloaded battery receipts without changing GitHub state."""

import argparse
import datetime
import hashlib
import json
import pathlib
import statistics


def seconds(start, finish):
    return round(
        (
            datetime.datetime.fromisoformat(finish.replace("Z", "+00:00"))
            - datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
        ).total_seconds(),
        3,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipts", nargs="+", type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    args = parser.parse_args()
    sources, measurements, expected = [], {}, None
    for path in args.receipts:
        raw = path.read_bytes()
        receipt = json.loads(raw)
        names = [gate["name"] for gate in receipt["gates"]]
        if len(names) != len(set(names)):
            raise ValueError(f"Duplicate gates in {path}")
        if expected is None:
            expected = set(names)
        if set(names) != expected:
            raise ValueError(f"Gate inventory differs in {path}")
        if any(not gate.get("completedAt") for gate in receipt["gates"]):
            raise ValueError(f"Incomplete battery in {path}")
        run_id = int(path.stem.rsplit("-", 1)[-1])
        metadata = {}
        for inventory in ["runs-page-1.json", "history-1.json", "history-2.json"]:
            candidate = path.parent / inventory
            if candidate.exists():
                for run in json.loads(candidate.read_text()).get("workflow_runs", []):
                    if run["id"] == run_id:
                        metadata = run
        jobs_path = path.parent / f"jobs-{run_id}.json"
        jobs = json.loads(jobs_path.read_text())["jobs"] if jobs_path.exists() else []
        job = next((job for job in jobs if "complete required battery" in job["name"]), {})
        artifacts_path = path.parent / f"artifacts-{run_id}.json"
        artifacts = json.loads(artifacts_path.read_text())["artifacts"] if artifacts_path.exists() else []
        diagnostics = [artifact for artifact in artifacts if artifact["name"] == "kairo-release-diagnostics"]
        artifact = max(diagnostics, key=lambda item: item["created_at"], default={})
        sources.append(
            {
                "runId": run_id,
                "url": f"https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/{run_id}",
                "runAttempt": metadata.get("run_attempt"),
                "headSha": metadata.get("head_sha"),
                "jobId": job.get("id"),
                "diagnosticsArtifactId": artifact.get("id"),
                "receiptSha256": hashlib.sha256(raw).hexdigest(),
                "source": receipt["source"],
                "status": receipt["status"],
                "startedAt": receipt["startedAt"],
                "completedAt": receipt["completedAt"],
                "batterySeconds": seconds(receipt["startedAt"], receipt["completedAt"]),
                "gateCount": len(names),
            }
        )
        for gate in receipt["gates"]:
            measurements.setdefault(gate["name"], []).append(
                {
                    "runId": run_id,
                    "seconds": seconds(gate["startedAt"], gate["completedAt"]),
                    "status": gate["status"],
                    "startedAt": gate["startedAt"],
                    "completedAt": gate["completedAt"],
                }
            )
    gates = []
    for name, samples in sorted(measurements.items()):
        durations = [sample["seconds"] for sample in samples]
        successful = [sample["seconds"] for sample in samples if sample["status"] == "passed"]
        gates.append(
            {
                "name": name,
                "sampleCount": len(samples),
                "medianSeconds": round(statistics.median(durations), 3),
                "meanSeconds": round(statistics.mean(durations), 3),
                "maxSeconds": max(durations),
                "minSeconds": min(durations),
                "successfulMedianSeconds": round(statistics.median(successful), 3) if successful else None,
                "samples": samples,
            }
        )
    output = {
        "schemaVersion": 1,
        "repository": "AmitabhainArunachala/Bunki-app",
        "measurement": "Each gate's completedAt minus startedAt from uploaded battery.json; seconds, wall clock.",
        "limitations": [
            "Five completed batteries, including failed batteries whose later gates still ran; failed gates can finish early.",
            "Historical SHAs differ; maxSeconds is a conservative observed scheduling weight, not a future upper bound.",
            "Runner setup, artifact build/download/upload and queue time are excluded from per-gate durations.",
            "Local f938 log duplicates run 37407758020 attempt 2 and is not a sixth independent sample.",
        ],
        "sources": sources,
        "gates": gates,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    print(f"Measured {len(gates)} gates across {len(sources)} completed batteries")


if __name__ == "__main__":
    main()
