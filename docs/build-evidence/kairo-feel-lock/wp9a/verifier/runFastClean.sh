#!/bin/bash
# VERIFIER: drift-fast on the FIXED build with NOTHING else on the machine —
# runs 1-6 were contaminated by concurrent browser jobs of my own, which is the
# documented trigger for the aim-staleness class. This is the fair arm.
ROOT=/home/user/Bunki-app/.claude/worktrees/agent-a3e020977353ad705
cd $ROOT
md5sum prototypes/drift/drift-artifact.html
for i in A B C D; do
  echo "##### FIXED CLEAN $i #####"
  node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast 2>&1 | grep -E "^!!|× |==== sweep"
done
echo CLEAN-DONE
