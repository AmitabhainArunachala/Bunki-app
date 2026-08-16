#!/bin/bash
# VERIFIER: drift fast x2 (fixed), hunt x2 fixed + x2 pre-fix.
V=/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v
ROOT=/home/user/Bunki-app/.claude/worktrees/agent-a3e020977353ad705
cd $ROOT
echo "##### DRIFT FAST 1 #####"
node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast 2>&1 | tail -12
echo "##### DRIFT FAST 2 #####"
node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast 2>&1 | tail -12
for i in 1 2; do
  echo "##### HUNT FIXED $i #####"
  node prototypes/corridor/tools/verify-drift-hunt.mjs 2>&1 | tail -30 > $V/hunt-V-fixed-$i.txt
  grep -E "FAIL|REGRESSION|no page errors" $V/hunt-V-fixed-$i.txt
done
echo SUITES-DONE
