#!/bin/bash
# VERIFIER: the pre-fix control arm. Reverts the three code files to eeae6c5,
# regenerates the fusion from them, runs drift-fast x3 and hunt x2, then
# restores f058461 and rebuilds — asserting the md5s come back.
set -u
V=/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v
ROOT=/home/user/Bunki-app/.claude/worktrees/agent-a3e020977353ad705
cd $ROOT
FILES="prototypes/drift/drift-artifact.html prototypes/corridor/drift-layer.js prototypes/corridor/corridor-standalone.html prototypes/corridor/drift-layer.css"

echo "--- md5 BEFORE control ---"
md5sum $FILES

git checkout eeae6c5 -- prototypes/drift/drift-artifact.html
node prototypes/corridor/tools/build-drift-layer.mjs 2>&1 | tail -1
node prototypes/corridor/tools/build-standalone.mjs  2>&1 | tail -1
echo "--- md5 with PRE-FIX in tree (must differ) ---"
md5sum $FILES

for i in 1 2 3; do
  echo "##### CONTROL DRIFT FAST $i #####"
  node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast 2>&1 | grep -E "^!!|==== sweep"
done
for i in 1 2; do
  echo "##### CONTROL HUNT $i #####"
  node prototypes/corridor/tools/verify-drift-hunt.mjs 2>&1 | tail -30 > $V/hunt-V-prefix-$i.txt
  grep -E "FAIL|REGRESSION" $V/hunt-V-prefix-$i.txt
done

echo "--- restoring f058461 ---"
git checkout f058461 -- prototypes/drift/drift-artifact.html
node prototypes/corridor/tools/build-drift-layer.mjs 2>&1 | tail -1
node prototypes/corridor/tools/build-standalone.mjs  2>&1 | tail -1
echo "--- md5 AFTER restore (must match BEFORE) ---"
md5sum $FILES
git status --short
echo CONTROL-DONE
