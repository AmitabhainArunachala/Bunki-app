#!/usr/bin/env bash
# Every required gate runs; a failed, missing, timed-out or incomplete gate fails
# the battery. Evidence belongs under ~/.dharma or CI RUNNER_TEMP.
# Usage: bash docs/build-evidence/renkan/battery.sh <fresh-output-directory>
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
exec node scripts/verify-release-gates.mjs --run-battery "${1:?usage: battery.sh <fresh-output-directory>}"
