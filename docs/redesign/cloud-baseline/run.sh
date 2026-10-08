#!/bin/bash
# usage: run.sh <worktree> <name...>
WT=$1; shift
cd "$WT"
export PLAYWRIGHT_BROWSERS_PATH=/root/pw KAIRO_BROWSER=chromium PERSONAL_BROWSERS=chromium
export KAIRO_SITE_DIR=${SITE:-/root/.dharma/bunki-run/site}
export KAIRO_ARTIFACT_SHA256=$(node -p 'require(process.env.KAIRO_SITE_DIR+"/build-identity.json").artifactSha256')
export KAIRO_EXPECT_GITSHA=$(git rev-parse HEAD)
for n in "$@"; do
  export KAIRO_EVIDENCE_DIR=/root/.dharma/bunki-run/evidence/$n${TAG}
  mkdir -p "$KAIRO_EVIDENCE_DIR"
  case $n in
    sw-shell) cmd=(npx vitest run tools/sw-shell.test.mjs);;
    lint-ui-language-core) cmd=(node tools/lint-ui-language.mjs --core-only);;
    lint-ui-language) cmd=(node tools/lint-ui-language.mjs --screenshots --both-languages);;
    *) cmd=(node prototypes/corridor/tools/$n.mjs);;
  esac
  s=$(date +%s.%N)
  timeout 1200 "${cmd[@]}" > /root/bunki-run/logs/$n${TAG}.log 2>&1
  rc=$?
  e=$(date +%s.%N)
  printf "%s\t%s\t%.1f\n" "$n${TAG}" "$rc" "$(echo "$e - $s" | bc)" | tee -a /root/bunki-run/results.tsv
done
