#!/bin/bash
# VERIFIER: four more drift-fast runs on the FIXED build, to put a rate on the
# single 謎 tap-again violation seen in fixed run 2.
ROOT=/home/user/Bunki-app/.claude/worktrees/agent-a3e020977353ad705
cd $ROOT
md5sum prototypes/drift/drift-artifact.html prototypes/corridor/drift-layer.js
for i in 3 4 5 6; do
  echo "##### FIXED DRIFT FAST $i #####"
  node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast 2>&1 | grep -E "^!!|× |==== sweep"
done
echo FAST4-DONE
