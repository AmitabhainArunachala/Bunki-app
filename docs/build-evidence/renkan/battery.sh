#!/usr/bin/env bash
# 連環 RENKAN §4 battery runner. Usage: bash docs/build-evidence/renkan/battery.sh <outdir>
# Runs every gate, never stops on failure, writes one log per gate + SUMMARY.md.
set -u
cd "$(git rev-parse --show-toplevel)"
OUT="${1:?usage: battery.sh <outdir>}"
mkdir -p "$OUT"
SHA=$(git rev-parse HEAD)
SUMMARY="$OUT/SUMMARY.md"
echo "# Battery run — $(git rev-parse --abbrev-ref HEAD) @ $SHA" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "| gate | exit | note |" >> "$SUMMARY"
echo "| --- | --- | --- |" >> "$SUMMARY"

run() {
  local name="$1"; shift
  local log="$OUT/$name.log"
  echo "=== $name: $* ===" > "$log"
  "$@" >> "$log" 2>&1
  local code=$?
  local note=""
  note=$(tail -1 "$log" | tr '|' '/' | cut -c1-100)
  echo "| $name | $code | $note |" >> "$SUMMARY"
  echo "[battery] $name -> $code"
  return 0
}

run format-check    npm run format:check
run lint            npm run lint
run typecheck       npm run typecheck
run vitest          npm run test
run corridor        node prototypes/corridor/tools/verify-corridor.mjs
run corridor-a11y   node prototypes/corridor/tools/verify-corridor-accessibility.mjs
run writing-room    npm run verify:writing-room
run storage-integ   node prototypes/corridor/tools/verify-corridor-storage-integrity.mjs
run drift-fast      npm run verify:drift:fast
if [ -f prototypes/corridor/tools/verify-corridor-ai.mjs ]; then
  run corridor-ai   node prototypes/corridor/tools/verify-corridor-ai.mjs
fi
if [ -f prototypes/corridor/tools/verify-mock.mjs ]; then
  run mock          node prototypes/corridor/tools/verify-mock.mjs
fi
if [ -f prototypes/corridor/tools/verify-kagami.mjs ]; then
  run kagami        node prototypes/corridor/tools/verify-kagami.mjs
fi
run native-readings node prototypes/corridor/tools/verify-native-readings.mjs
run replay          npm run test:replay
run export          npm run verify:export
run e2e-build       npm run test:e2e:build
run e2e             npm run test:e2e
if [ -d corpus/tests ]; then
  PYBIN=$( [ -x "$HOME/.venv-bunki-corpus/bin/python" ] && echo "$HOME/.venv-bunki-corpus/bin/python" || { [ -x /home/user/.venv-bunki-corpus/bin/python ] && echo /home/user/.venv-bunki-corpus/bin/python || echo python3; } )
  run corpus-pytest bash -c "cd corpus && $PYBIN -m pytest tests -q -m 'not realdata'"
fi
echo "" >> "$SUMMARY"
echo "Completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$SUMMARY"
