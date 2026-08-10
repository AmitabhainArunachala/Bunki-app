#!/bin/bash
# VERIFIER batch A: long pan sessions, pre-fix vs fixed vs fixed-pinned
V=/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v
PRE=$V/drift-prefix.html
FIX=/home/user/Bunki-app/.claude/worktrees/agent-a3e020977353ad705/prototypes/drift/drift-artifact.html
cd $V
run() { echo "=== $* ==="; node session.mjs "$@" 2>&1 | head -30; }
run --file=$PRE --level=5 --rounds=3000 --out=$V/A-pre-n5.json
run --file=$FIX --level=5 --rounds=3000 --out=$V/A-fix-n5.json
run --file=$FIX --level=5 --rounds=3000 --pin --out=$V/A-fixpin-n5.json
echo ALL-A-DONE
