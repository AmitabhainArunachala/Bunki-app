"""Named assertion receipts for the three custom Python checks (not process-exit wrappers)."""
from __future__ import annotations
import atexit
import datetime
import hashlib
import inspect
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

sys.dont_write_bytecode = True


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CheckReceipt:
    def __init__(self, gate: str, source: str, root: Path):
        self.root, self.source, self.gate = root.resolve(), Path(source).resolve(), gate
        self.started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.run_id = os.environ.get("KAIRO_GATE_RUN_ID") or str(uuid.uuid4())
        self.rows, self.errors, self.completed = [], [], False
        self.dependencies = {}
        for name in ("fugashi", "unidic-lite"):
            try:
                self.dependencies[name] = importlib.metadata.version(name)
            except importlib.metadata.PackageNotFoundError:
                self.dependencies[name] = None
        self.invocation = [sys.executable, str(self.source), *sys.argv[1:]]
        if len(sys.argv) != 1:
            self.errors.append("No selectors or extra arguments are admitted by this complete suite")
        self.registry_path = self.root / "scripts/ci/vh-python-report-rosters.json"
        self.spec = json.loads(self.registry_path.read_text("utf-8"))[gate]
        self.source_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.root, text=True).strip()
        self.tool_sha = sha(self.source)
        self.helper_sha, self.contract_sha = sha(Path(__file__)), sha(self.registry_path)
        self.inputs = {}
        for pattern in self.spec["inputs"]:
            for path in sorted(self.root.glob(pattern)):
                if path.is_file():
                    self.inputs[str(path.relative_to(self.root))] = sha(path)
        self.out = Path(os.environ.get("KAIRO_EVIDENCE_DIR") or (Path.home() / ".dharma/bunki/verifier-receipts" / gate / self.run_id)).resolve()
        if self.out == self.root or self.root in self.out.parents:
            raise ValueError("Runtime receipts must be outside the checkout")
        self.out.mkdir(parents=True, exist_ok=True)
        self.previous_hook = sys.excepthook
        def failed(kind, value, trace):
            self.errors.append(f"{kind.__name__}: {value}")
            self.previous_hook(kind, value, trace)
        sys.excepthook = failed
        atexit.register(self.write)

    def record(self, name: str, passed: bool, detail: str = "") -> None:
        frame = inspect.currentframe().f_back.f_back
        callsite = f"{Path(frame.f_code.co_filename).resolve().relative_to(self.root)}:{frame.f_lineno}"
        known = next((row for row in self.spec["checks"] if row["name"] == name), None)
        self.rows.append({"id": known["id"] if known else "unknown", "name": name, "pass": bool(passed), "detail": str(detail), "callsite": callsite})

    def valid(self) -> bool:
        expected = self.spec["checks"]
        return (self.completed and not self.errors and len(self.rows) == len(expected)
                and len({row["id"] for row in self.rows}) == len(expected)
                and all(any(actual["id"] == want["id"] and actual["name"] == want["name"]
                            and actual["callsite"] in want["callsites"] and actual["pass"] is True
                            for actual in self.rows) for want in expected))

    def complete(self) -> bool:
        self.completed = True
        return self.valid()

    def write(self) -> None:
        try:
            current_names = {str(path.relative_to(self.root)) for pattern in self.spec["inputs"] for path in self.root.glob(pattern) if path.is_file()}
            unchanged = (self.helper_sha == sha(Path(__file__)) and self.contract_sha == sha(self.registry_path)
                         and current_names == set(self.inputs) and self.tool_sha == sha(self.source)) and all((self.root / name).is_file() and sha(self.root / name) == digest for name, digest in self.inputs.items())
        except OSError as error:
            unchanged = False
            self.errors.append(f"Input verification failed: {type(error).__name__}: {error}")
        report = {"schema": "vh-python-checks/1", "gateId": self.gate, "runId": self.run_id,
                  "gitSha": self.source_sha, "sourceOnly": True, "artifactSha256": None,
                  "verifierPath": str(self.source.relative_to(self.root)), "verifierSha256": self.tool_sha,
                  "helperSha256": self.helper_sha, "contractSha256": self.contract_sha,
                  "startedAt": self.started, "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  "scope": "full", "invocation": self.invocation, "pythonVersion": sys.version.split()[0], "dependencyVersions": self.dependencies, "inputs": self.inputs,
                  "completed": self.completed, "errors": self.errors, "checks": self.rows,
                  "inputsUnchanged": unchanged, "fullAcceptance": self.valid() and unchanged}
        (self.out / "verification-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
