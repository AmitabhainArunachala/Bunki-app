#!/bin/bash
# VERIFIER batch C: the trance-cost accounting — whole glass and centre half,
# BEFORE / FROZEN / TURNING on an identical path.
V=/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v
PRE=$V/drift-prefix.html
FIX=/home/user/Bunki-app/.claude/worktrees/agent-a3e020977353ad705/prototypes/drift/drift-artifact.html
cd $V
run() { echo "=== $* ==="; node session.mjs "$@" 2>&1 | grep -E '"file"|"level"|"pinned"|"distinctAtLevel"|"tier"|perTick|perSec|"onGlassFades"|"centreFades"|"evictions"|"pageErrors"'; }
for L in 1 5; do
  run --file=$PRE --level=$L --rounds=1500
  run --file=$FIX --level=$L --rounds=1500 --pin
  run --file=$FIX --level=$L --rounds=1500
done
echo ALL-C-DONE
