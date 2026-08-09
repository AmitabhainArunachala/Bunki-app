#!/bin/bash
# VERIFIER: is the AFTER coverage readable dwell or a flicker? Uses snapshots in
# scratchpad so the pre-fix control's tree swap cannot race it.
V=/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v
cd $V
for L in 1 5; do
  node dwell.mjs --file=$V/drift-prefix.html --level=$L --rounds=1200
  node dwell.mjs --file=$V/drift-fixed.html  --level=$L --rounds=1200 --pin
  node dwell.mjs --file=$V/drift-fixed.html  --level=$L --rounds=1200
done
echo DWELL-DONE
