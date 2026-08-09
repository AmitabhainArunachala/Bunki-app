#!/bin/bash
set -euo pipefail
W=/home/user/Bunki-app/.claude/worktrees/agent-ad7f93b302aff2b7c
S=/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad
P=$S/v3/pristine/prototypes/corridor
rm -rf "$S/v3/pristine"
mkdir -p "$P/tools" "$P/evidence"
cd "$W"
for f in corridor.js corridor.css index.html drift-layer.js drift-layer.css; do
  git show 1bb7d3c:prototypes/corridor/$f > "$P/$f"
done
for f in verify-drift-hunt.mjs verify-corridor.mjs verify-corridor-accessibility.mjs build-standalone.mjs build-drift-layer.mjs verify-drift-consistency.mjs; do
  git show 1bb7d3c:prototypes/corridor/tools/$f > "$P/tools/$f"
done
ln -s "$W/prototypes/corridor/data" "$P/data"
ln -s "$W/prototypes/corridor/vendor" "$P/vendor"
mkdir -p "$S/v3/pristine/prototypes/drift"
git show 1bb7d3c:prototypes/drift/drift-artifact.html > "$S/v3/pristine/prototypes/drift/drift-artifact.html"
ln -sfn /home/user/Bunki-app/node_modules "$S/v3/pristine/node_modules"
echo "PRISTINE TREE READY"
ls -la "$P"
