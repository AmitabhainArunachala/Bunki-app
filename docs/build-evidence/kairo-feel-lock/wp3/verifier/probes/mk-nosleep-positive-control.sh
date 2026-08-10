#!/bin/bash
set -euo pipefail
W=/home/user/Bunki-app/.claude/worktrees/agent-ad7f93b302aff2b7c
S=/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad
N=$S/v3/nosleep/prototypes/corridor
rm -rf "$S/v3/nosleep"
mkdir -p "$N/tools"
cp "$W/prototypes/corridor/corridor.js" "$N/corridor.js"
cp "$W/prototypes/corridor/corridor.css" "$N/corridor.css"
cp "$W/prototypes/corridor/index.html" "$N/index.html"
cp "$W/prototypes/corridor/drift-layer.js" "$N/drift-layer.js"
cp "$W/prototypes/corridor/drift-layer.css" "$N/drift-layer.css"
cp "$W/prototypes/corridor/tools/build-standalone.mjs" "$N/tools/build-standalone.mjs"
ln -s "$W/prototypes/corridor/data" "$N/data"
ln -s "$W/prototypes/corridor/vendor" "$N/vendor"
# revert ONLY the sleep gate — everything else is WP3 as committed
python3 - "$N/corridor.js" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = "if (S.view === 'drift' && !S.stack.length) window.__DRIFT__.show();"
new = "if (S.view === 'drift') window.__DRIFT__.show();"
assert s.count(old) == 1, s.count(old)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
print('sleep gate reverted (positive control)')
PY
ln -sfn /home/user/Bunki-app/node_modules "$S/v3/nosleep/node_modules"
node "$N/tools/build-standalone.mjs" "$S/v3/nosleep-standalone.html"
