# Cloud baseline (Linux container): 2026-10-08

These runs used the F1 subset from [BASELINE.md](../BASELINE.md), plus the language tour from [FOUNDATION.md](../FOUNDATION.md).

- **Source:** worktree `/root/wt-base` pinned to merge `7576f52740523e1e10b4c4cc230f7b8740c21a48` (Astra's `claude/n2n1-decks-20261007` merged onto Sol's foundation). The tree was clean, and `sourceDirty: false`.
- **Artifact:** `89ded4ce2bf95ebc9bcbaa1fe832844432e3962c2a5dde80bab7ad1757448923`.
- **Pre-merge control:** worktree `/root/wt-premerge` at `cd30c2a5` builds artifact `d44ac09a0d1c…`. That artifact is byte-identical to Sol's final Mac/CI artifact listed in [AFTER.md](../AFTER.md).
- **Environment:** Linux, 4 vCPU, Node 22.22.0, playwright-core 1.63 with Chromium build 1243 from `/root/pw`. WebKit is not available here, so every verifier ran on Chromium only.
- **Merge scope:** the merge does not touch app code. `git diff cd30c2a5 7576f527` changes only `decks/n2n1/source/**`, `decks/n2n1/tools/process_batch.py`, the six `prototypes/corridor/decks/{n2,n1,senmon}/{deck,tokens}.json` files and `CLOUD_LOG.md`.

## Results

| Verifier | Cloud result | Duration | Mac baseline → after | Reason for failure (first assertion) |
| --- | --- | --- | --- | --- |
| `verify-corridor` | **FLAKY**: FAIL then PASS | 438.2s / 462.0s | PASS → PASS | Run 1 scored 257/259: `FAIL any node can be taken into study — chrome reads "Lists 0"`, and the follow-on "after saving, the sheet says…" failed too. Rerun scored **259/259**. On the pre-merge control it scored 255/259, with the same step plus a dial-persist check. Timing on this slow container, not the merge. |
| `verify-corridor-storage-integrity` | PASS | 1.1s | PASS → PASS | |
| `verify-corridor-doors` | FAIL | 156.0s | FAIL → FAIL | Inherited failure: `FAIL T13 a set that fails to load says so beside its door`, then `locator.click: Timeout 30000ms exceeded` on hidden `#chrome-dojo`. Matches the known T13/T14 failure in AFTER.md. |
| `verify-dojo-door` | PASS | 156.6s | PASS → PASS | |
| `test-navigation-returns` | PASS | 0.1s | PASS → PASS | |
| `verify-design-reader-shelf` | PASS (Chromium only) | 143.8s | PASS → PASS | `KAIRO_BROWSER=chromium`; webkit: not available here. |
| `verify-relief` | PASS | 8.8s | FAIL → PASS | |
| `verify-theme-consistency` | PASS | 110.8s | FAIL → PASS | |
| `verify-corridor-accessibility` | PASS | 77.5s | PASS → PASS | |
| `verify-experience` | PASS | 228.5s | PASS → PASS | |
| `verify-kotoba-mine` | PASS | 178.6s | PASS → PASS | |
| `verify-n2n1-decks` | **FLAKY**: 2 FAIL, 1 PASS on merge | 91.4s / 83.3s / 93.5s | PASS → PASS | `assert.deepEqual(errors, [])`: `'n1/ai: Failed to load resource: the server responded with a status of 503 ()'`. This is an environmental race; see below. The pre-merge control failed 3 of 3 runs the same way. |
| `verify-personal-collections` | PASS (Chromium only) | 20.5s | PASS → PASS | `PERSONAL_BROWSERS=chromium`; webkit: not available here. |
| `sw-shell` (`tools/sw-shell.test.mjs`) | PASS, 7/7 | 1.2s | PASS → PASS | This is a **vitest** file, so run it with `npx vitest run`. `node --test` crashes inside `@vitest/runner` (`Cannot read properties of undefined (reading 'config')`), which is a runner mismatch and not a test failure. |
| `lint-ui-language --core-only` | PASS | 112.8s | n/a | 83 visits, 10,011 chrome inspections, 0 issues. |
| `lint-ui-language --screenshots --both-languages` | PASS | 329.5s | final V16: 230 / 11,729 | **230 states, 11,729 chrome inspections, 0 issues, 0 room or shell errors**. The counts match Mac/CI exactly. |

**Summary:** on the first pass, 11 of the 14 F1 processes passed. Of the three failures:

- `verify-corridor-doors` is the inherited known failure.
- `verify-corridor` failed on run 1 and passed 259/259 on its rerun. It is timing-flaky on this container.
- `verify-n2n1-decks` fails on most runs because of an environmental race.

Once flakes are discounted, the cloud result matches AFTER.md: 13/14, with the only real failure being the inherited doors T13/T14. The full language tour passes.

Excerpts: [verify-corridor](verify-corridor.excerpt.txt), [verify-corridor-doors](verify-corridor-doors.excerpt.txt), [verify-n2n1-decks](verify-n2n1-decks.excerpt.txt).

## verify-n2n1-decks 503: environmental race, not the merge

| Source | Runs | Result | Article that 503'd / tour that recorded it |
| --- | --- | --- | --- |
| merge `7576f527` | 3 | FAIL, FAIL, PASS | `bunki-graded-n4-bicycle` (n1/ai), `bunki-essay-n2-translation` (senmon/ai), none |
| pre-merge `cd30c2a5` (artifact `d44ac09a…`, which is Sol's final app) | 3 | FAIL, FAIL, FAIL | `bunki-essay-n2-translation` (n1/ai), `bunki-essay-n2-rain` (n1/washi), `bunki-essay-n2-notebook` (n1/ai) |

The race works like this:

1. After boot, `corridor.js` `prefetchArticles()` warms all 126 shelf article bodies in the background. It waits 350 ms, then fetches one body at a time with 40 ms gaps, and each fetch goes through the stamped service worker, which verifies hashes.
2. The verifier calls `context.setOffline(true)` while the old page's queue is still running.
3. The in-flight `data/articles/<x>.json` request then fails, and `sw.js` answers with `updateNeeded()`, a 503.
4. Chromium logs that 503 as a console error, and the verifier's `errors == []` assertion fails.

Whether the run fails depends on whether the prefetch queue has drained before the online part of the tour ends. The Mac drains it in time; this 4-vCPU container usually does not. The failure happens on the pre-merge app bytes, which are identical to Sol's passing build, so the merge did not cause it.

It is a verifier/test-harness timing issue, which could also be argued as an app issue (prefetch is not paused when the page goes offline). The verifier was not changed.

## How to run here

```sh
# 0. One pinned, clean worktree. Copy node_modules with hardlinks: a symlink shows up
#    as untracked (.gitignore has `node_modules/`), which makes the build sourceDirty.
git -C /home/user/Bunki-app worktree add /root/wt-base <sha>
cp -al /home/user/Bunki-app/node_modules /root/wt-base/node_modules
for p in /home/user/Bunki-app/packages/*/node_modules; do cp -al "$p" "/root/wt-base/${p#/home/user/Bunki-app/}"; done
git -C /root/wt-base status --porcelain   # must print nothing

# 1. Build. The output MUST be under ~/.dharma (or $RUNNER_TEMP with CI set).
#    /root/bunki-run/site is rejected with "Build output must be under ~/.dharma or CI RUNNER_TEMP".
#    Evidence dirs have the same rule.
cd /root/wt-base
export PLAYWRIGHT_BROWSERS_PATH=/root/pw
node scripts/build-corridor-site.mjs --out /root/.dharma/bunki-run/site      # about 12s

# 2. Environment for every verifier
export PLAYWRIGHT_BROWSERS_PATH=/root/pw
export KAIRO_BROWSER=chromium PERSONAL_BROWSERS=chromium   # no WebKit here
export KAIRO_SITE_DIR=/root/.dharma/bunki-run/site
export KAIRO_ARTIFACT_SHA256=$(node -p 'require(process.env.KAIRO_SITE_DIR+"/build-identity.json").artifactSha256')
export KAIRO_EXPECT_GITSHA=$(git rev-parse HEAD)

# 3. Run each one sequentially, from the worktree root, with its own evidence dir
for n in verify-corridor verify-corridor-storage-integrity verify-corridor-doors verify-dojo-door \
         test-navigation-returns verify-design-reader-shelf verify-relief verify-theme-consistency \
         verify-corridor-accessibility verify-experience verify-kotoba-mine verify-n2n1-decks \
         verify-personal-collections; do
  export KAIRO_EVIDENCE_DIR=/root/.dharma/bunki-run/evidence/$n; mkdir -p "$KAIRO_EVIDENCE_DIR"
  timeout 1200 node prototypes/corridor/tools/$n.mjs > /root/bunki-run/logs/$n.log 2>&1; echo "$n $?"
done
npx vitest run tools/sw-shell.test.mjs                        # NOT node --test
KAIRO_EVIDENCE_DIR=/root/.dharma/bunki-run/evidence/lang node tools/lint-ui-language.mjs --screenshots --both-languages   # about 5.5 min
#   (--core-only takes about 2 min)
```

The scratch runner `/root/bunki-run/run.sh <worktree> <names…>` (env `SITE=`, `TAG=`) wraps the steps above and appends `name<TAB>exit<TAB>seconds` to `/root/bunki-run/results.tsv`. Logs are in `/root/bunki-run/logs/`; evidence (screenshots, reports, the 230-image gallery) is in `/root/.dharma/bunki-run/evidence/`. The whole F1 set plus the core tour takes about 28 min sequentially.

Rerun `verify-corridor` and `verify-n2n1-decks` before treating a single failure here as a regression.
