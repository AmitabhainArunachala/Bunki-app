#!/bin/bash
# VERIFIER: verify-v11 x3 on both arms, my own run, results to scratchpad only.
set -u
V=/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v
ROOT=/home/user/Bunki-app/.claude/worktrees/agent-a3e020977353ad705
for i in 1 2 3; do
  node "$ROOT/prototypes/drift/tools/verify-v11.mjs" --label "V-fixed-$i" --port 8951 \
    --out "$V/v11-V-fixed-$i.json" 2>&1 | tail -2
done
for i in 1 2 3; do
  node "$ROOT/prototypes/drift/tools/verify-v11.mjs" --src "$V/drift-prefix.html" \
    --label "V-prefix-$i" --port 8952 --out "$V/v11-V-prefix-$i.json" 2>&1 | tail -2
done
node -e '
const fs=require("fs");const d=process.argv[1];
for(const f of fs.readdirSync(d).filter(f=>/^v11-V-/.test(f)).sort()){
  const j=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));
  console.log(j.label.padEnd(14), (j.passed+"/"+j.total).padEnd(8),
    "errors:"+(j.errors?j.errors.length:0),
    j.results.filter(r=>!r.pass).map(r=>r.name||r.fix).join(",")||"-");
}' "$V"
echo V11-DONE
