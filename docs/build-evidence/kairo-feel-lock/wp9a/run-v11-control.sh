#!/usr/bin/env bash
# WP9a — verify-v11 with its control. Runs the fixed source and the pre-fix
# source (extracted from git, never written into the tree) the same number of
# times on the same machine, so a flaky check cannot be read as a regression.
#
#   ./run-v11-control.sh 3 /path/to/pre-fix-drift-artifact.html
set -u
N="${1:-3}"
PRE="${2:-}"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
OUT="$(dirname "$0")"

for i in $(seq 1 "$N"); do
  node "$ROOT/prototypes/drift/tools/verify-v11.mjs" \
    --label "fixed-$i" --out "$OUT/v11-fixed-$i.json" 2>&1 | tail -3
done

if [ -n "$PRE" ]; then
  for i in $(seq 1 "$N"); do
    node "$ROOT/prototypes/drift/tools/verify-v11.mjs" --src "$PRE" \
      --label "prefix-$i" --out "$OUT/v11-prefix-$i.json" 2>&1 | tail -3
  done
fi

node -e '
const fs = require("fs");
const dir = process.argv[1];
const rows = [];
for (const f of fs.readdirSync(dir).filter((f) => /^v11-(fixed|prefix)-\d+\.json$/.test(f)).sort()) {
  const d = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"));
  rows.push([d.label, `${d.passed}/${d.total}`, d.results.filter((r) => !r.pass).map((r) => r.fix).join(",") || "—"]);
}
console.log("\nlabel        result  failing");
for (const r of rows) console.log(r[0].padEnd(12), r[1].padEnd(7), r[2]);
' "$OUT"
