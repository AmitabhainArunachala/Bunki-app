# CI map and measured baseline

This is the baseline at `c56cfc8eaa80e1ccd103a5bad0f1a39613697ea7`, before the CI redesign. The authoritative repository is [AmitabhainArunachala/Bunki-app](https://github.com/AmitabhainArunachala/Bunki-app). Workflow definitions were recovered with `git show HEAD:.github/workflows/<file>` and saved outside the checkout. Measurements were collected read-only on 2026-10-06; no live run was cancelled, rerun or dispatched.

## Completed battery samples

Each of the five latest completed CI batteries available in the initial 100-run API page ran exactly the same 135 unique gate names. Failed batteries still reached every gate. Per-gate durations below come from each uploaded `battery.json` gate's `completedAt - startedAt`, rather than assigning setup time to the first gate. [gate-timings.json](gate-timings.json) carries all 675 observations, source SHAs, run attempts, diagnostics artifact IDs and SHA-256 hashes of the raw receipts.

| Run / attempt                                                                                 | Battery result | Battery min | Battery job min | CI run min | Failed gates                    |
| --------------------------------------------------------------------------------------------- | -------------- | ----------: | --------------: | ---------: | ------------------------------- |
| [37326384597](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37326384597) / 2 | failed         |      163.18 |          177.33 |     177.43 | navigation-returns              |
| [37327953066](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37327953066) / 1 | passed         |      162.38 |          176.32 |     181.55 | none                            |
| [37400558515](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37400558515) / 1 | failed         |      122.97 |          132.77 |     136.82 | format-check, publisher-reading |
| [37407758020](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37407758020) / 2 | failed         |      166.72 |          182.40 |     182.48 | later-encounters-integration    |
| [37452295779](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37452295779) / 1 | passed         |      146.36 |          164.40 |     168.02 | none                            |

“CI run min” starts at the latest attempt's `run_started_at`; it can include waits, and a failed-jobs-only rerun reuses the earlier successful native job. It must not be read as total original-run-to-final-attempt latency. The full battery ranges from 123.0 to 166.72 min in these receipts; the lower observations include gates that failed early. The brief's 169.5-minute estimate assigned job setup to the first gate. The local `battery-f938.log` is the same run 37407758020, attempt 2; it is corroboration, not a sixth sample.

The PR's `head_sha` differs from `battery.json.source.sha`: checkout verified GitHub's synthetic merge candidate. Proof reuse must compare the **tested source tree** and the tested artifact, rather than assume an API PR-head SHA names the verified bytes.

## Critical-path overhead and scheduling

Native compile / pipe checks took 2.98–4.28 min in these five runs and block the battery job. Battery preparation takes roughly 2–3 min. Bulk evidence upload alone took **449, 661, 682, 762 and 873 seconds** (7.48–14.55 min); diagnostic upload and finalization are additional. This is material to the 40-minute target. Gate scheduling predictions exclude runner queues, setup, artifact transfer and evidence upload. A pass-on-retry can add the whole failed gate's time on a fresh runner.

Practice history is the indivisible longest work: WebKit median 14.35 min, observed maximum 15.98 min; Chromium median 12.10 min, maximum 12.36 min. Scheduling by each gate's observed maximum across these five receipts is conservative relative to the observations, but is not a future bound. Twelve LPT bins on the single f938 log predict a 15.98-minute longest bin and 13.71-minute other bins; the design uses the multi-run measurements and extra preserved assertions.

## Every workflow and job

Durations below are job execution, not enqueue-to-completion latency. They use the latest completed representative run available at collection. “No current sample” is deliberately not replaced with a historical workflow's different job.

| Workflow                   | Job                 | Runner                              | Trigger                                              |           Timeout min |                          Measured job min | Gate coverage and overlap                                                                                                                                                                                               |
| -------------------------- | ------------------- | ----------------------------------- | ---------------------------------------------------- | --------------------: | ----------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml` / CI              | `apple-sync`        | macos-26                            | all PRs; reusable call                               |                    25 |                        3.43 (37452295779) | apple-sync verify; native RPC compile and real Swift pipes. Unique native lane.                                                                                                                                         |
| `ci.yml` / CI              | `checks`            | ubuntu-latest                       | all PRs; reusable call, after native                 | 210; battery step 180 |                      164.40 (37452295779) | Canonical artifact build/smoke, all 135 battery gates below, artifact identity after verification, evidence/site upload.                                                                                                |
| `pages-app.yml`            | `verify` (reusable) | macos-26 + ubuntu-latest through CI | main push; manual                                    |             inherited | 3.03 native + 182.18 checks (37400581841) | Repeats the entire CI on main; identical tested trees receive no reuse.                                                                                                                                                 |
| `pages-app.yml`            | `deploy`            | ubuntu-latest                       | successful verify on main                            |                    15 |                         skipped in sample | configure-pages and deploy-pages consume the same run's Pages artifact.                                                                                                                                                 |
| `corridor-gate.yml`        | `verify-corridor`   | ubuntu-latest                       | filtered PR/main push; manual                        |                    30 |                        6.20 (37476267987) | Whole corridor walk duplicates battery `corridor`.                                                                                                                                                                      |
| `corridor-gate.yml`        | `kotoba-decks`      | ubuntu-latest                       | same as corridor walk                                |                    20 |                        4.67 (37476267987) | Frozen private/public rebuild, no-diff/untracked checks, Japanese gloss and MCD Python tests, verify-kotoba-mine, six tool unit suites. Unique assertions described below.                                              |
| `personal-collections.yml` | `private-deck`      | ubuntu-latest                       | filtered PR/main push; manual                        |                    20 |                        2.73 (37476267981) | Personal collections contracts, host bridge, collections browser suite, host Chromium/WebKit. Unique suite; battery personal-reading is a different verifier.                                                           |
| `reference-libraries.yml`  | `verify`            | ubuntu-latest                       | filtered PR/main push; manual                        |                    30 |                        8.85 (37472375602) | reference/skip contracts, reference-data packaging, reference browser, mock, kagami, corridor storage, reference connections duplicate battery. Combined experience and explicit syntax checks require preservation.    |
| `skip-lookup.yml`          | `verify`            | ubuntu-latest                       | filtered PR; manual                                  |           default 360 |                        1.25 (37452295780) | SKIP contracts/packaging and standalone build overlap battery skip gates; explicit syntax checks require preservation.                                                                                                  |
| `corpus-tests.yml`         | `pytest`            | ubuntu-latest                       | corpus-filtered PR                                   |           default 360 |                        0.83 (37327952972) | `pytest tests -q -m "not realdata"` duplicates battery corpus-pytest.                                                                                                                                                   |
| `nightly-verify.yml`       | `full-battery`      | ubuntu-latest                       | 17:30 UTC daily; old integration branch push; manual |                    45 |             no run in API (total_count 0) | corridor, accessibility, npm test, drift-fast, format duplicate battery. `prototypes/drift/tools/verify-storage-integrity.mjs` is unique. This is six suites, not the canonical 135-gate battery.                       |
| `bunki-v11.yml`            | `verify`            | ubuntu-latest                       | legacy-path-filtered PR; manual                      |                    30 |                        3.53 (37327962133) | Legacy prototype lint/unit/e2e; distinct scope from current Corridor.                                                                                                                                                   |
| `pages-preview.yml`        | `artifact`          | ubuntu-latest                       | manual only                                          |                    20 |                         no current sample | Historical Sites v11 dependency install, binary repair, Vite build, artifact upload; no publisher. Last API run 30556281249 used an older `deploy` job, so its 0.62-minute job is not a measurement of this definition. |

Concurrency: CI cancels older `kairo-checks-${github.ref}` runs; corridor, nightly, v11 and preview similarly cancel older runs in their own groups. Pages uses the single `kairo-pages` group with cancellation disabled, so runs queue and newer pushes replace pending runs. Corpus, personal, reference and SKIP have no explicit concurrency group.

## Assertions that consolidation must preserve

- **Decks:** private `build.py --frozen`, public `--frozen --profile public`, tracked-output no-diff excluding timestamped `.apkg`, no untracked output; `test_gloss_ja.py`, `test_export_mcd.py`, and `verify-kotoba-mine.mjs`. The six explicitly listed Vitest files (`kotoba-deck-ids`, `leaks`, `rights`, `ruby`, `player-engine`, `sw-shell`) already match root `tools/**/*.test.mjs`, but IDs build assertions use `describe.skipIf` when fugashi/unidic-lite are absent. Installing the pinned Python dependencies is part of preserving those assertions.
- **Personal collections:** `test-personal-collections.mjs`; `node --test prototypes/corridor/decks/personal/tests/host-bridge.test.mjs`; `verify-personal-collections.mjs`; `verify-personal-host.mjs` twice, with default Chromium and `PERSONAL_HOST_BROWSER=webkit`. None is an existing battery gate.
- **Reference:** `verify-experience.mjs --require-skip` makes combined SKIP coverage mandatory; dropping that flag can silently weaken E13. Preserve `node --check` for reference-core.js, reference-ui.js and corridor.js.
- **SKIP:** preserve syntax checks for skip-core.js and skip-ui.js (corridor.js overlaps reference). `verify-skip-standalone.mjs` already invokes `build-standalone.mjs`; equivalence is supported by that call, while standalone-journey additionally checks built artifact identity. Retaining the explicit build is the conservative choice until consolidation tests establish coverage.
- **Nightly:** drift's storage-integrity verifier is different from battery `storage-integ`, which runs Corridor's verifier. Preserve both.
- **Legacy Sites v11:** keep separate scope; its assertions are not subsumed by a Corridor battery.

## Exact trigger path filters

The following are the baseline workflow YAML filters. PRs for CI have no filter, including docs-only PRs. Pages main pushes have no filter. “Manual” means workflow_dispatch; it is present only where listed above.

### `bunki-v11.yml`

- `pull_request` paths: `prototypes/bunki-sites-v11/**`, `.github/workflows/bunki-v11.yml`.
- `workflow_dispatch`: unfiltered.

### `ci.yml`

- `pull_request`: unfiltered.
- `workflow_call`: unfiltered.

### `corpus-tests.yml`

- `pull_request` paths: `corpus/**`, `.github/workflows/corpus-tests.yml`.

### `corridor-gate.yml`

- `pull_request` paths: `prototypes/corridor/**`, `prototypes/corridor/decks/**`, `decks/**`, `tools/kotoba-*`, `tools/sw-shell.test.mjs`, `.github/workflows/corridor-gate.yml`.
- `push` branches: `main`.
- `push` paths: `prototypes/corridor/**`, `prototypes/corridor/decks/**`, `decks/**`, `tools/kotoba-*`, `tools/sw-shell.test.mjs`, `.github/workflows/corridor-gate.yml`.
- `workflow_dispatch`: unfiltered.

### `nightly-verify.yml`

- `workflow_dispatch`: unfiltered.
- `schedule`: {'cron': '30 17 * * *'}.
- `push` branches: `claude/app-vision-next-steps-wei73a`.

### `pages-app.yml`

- `workflow_dispatch`: unfiltered.
- `push` branches: `main`.

### `pages-preview.yml`

- `workflow_dispatch`: unfiltered.

### `personal-collections.yml`

- `pull_request` paths: `prototypes/corridor/**`, `prototypes/bunki-desktop/lib/artifact.cjs`, `packages/ai/**`, `packages/assessment/**`, `packages/domain/**`, `packages/feed/**`, `packages/persistence/**`, `packages/reading/**`, `packages/sync/**`, `scripts/**`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `.github/workflows/personal-collections.yml`.
- `push` branches: `main`.
- `push` paths: `prototypes/corridor/**`, `prototypes/bunki-desktop/lib/artifact.cjs`, `packages/ai/**`, `packages/assessment/**`, `packages/domain/**`, `packages/feed/**`, `packages/persistence/**`, `packages/reading/**`, `packages/sync/**`, `scripts/**`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `.github/workflows/personal-collections.yml`.
- `workflow_dispatch`: unfiltered.

### `reference-libraries.yml`

- `pull_request` paths: `prototypes/corridor/**`, `tools/*reference*.mjs`, `corpus/datasets/kanji/kanken.jsonl`, `prototypes/bunki-sites-v11/public/kotobako-static.json`, `prototypes/drift/data/wbig.json`, `apps/app/src/data/generated/drift-words.json`, `apps/app/src/data/generated/drift-kanji.json`, `corpus/samples/jmdict/kanjidic_sample.jsonl`, `tools/fixtures/reference/**`, `scripts/**`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `.github/workflows/pages-app.yml`, `.github/workflows/reference-libraries.yml`.
- `push` branches: `main`.
- `push` paths: `prototypes/corridor/**`, `tools/*reference*.mjs`, `corpus/datasets/kanji/kanken.jsonl`, `prototypes/bunki-sites-v11/public/kotobako-static.json`, `prototypes/drift/data/wbig.json`, `apps/app/src/data/generated/drift-words.json`, `apps/app/src/data/generated/drift-kanji.json`, `corpus/samples/jmdict/kanjidic_sample.jsonl`, `tools/fixtures/reference/**`, `scripts/**`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `.github/workflows/pages-app.yml`, `.github/workflows/reference-libraries.yml`.
- `workflow_dispatch`: unfiltered.

### `skip-lookup.yml`

- `pull_request` paths: `prototypes/corridor/skip-*`, `prototypes/corridor/corridor.js`, `prototypes/corridor/index.html`, `prototypes/corridor/sw.js`, `prototypes/corridor/data/share_alike/skip.json`, `prototypes/corridor/tools/*skip*`, `prototypes/corridor/tools/build-standalone.mjs`, `.github/workflows/skip-lookup.yml`, `.github/workflows/pages-app.yml`, `.github/workflows/ci.yml`, `scripts/**`, `package.json`, `package-lock.json`, `prototypes/corridor/tools/reference-packaging-support.mjs`, `prototypes/corridor/tools/test-kanji-capture.mjs`.
- `workflow_dispatch`: unfiltered.

## Rerun automation evidence

The read-only run history covers 300 entries from 2026-10-01 15:17 UTC through 2026-10-06 14:06 UTC (pagination is a moving snapshot and shares a boundary entry). Latest attempt metadata alone cannot identify an automation; individual attempt endpoints reveal the cadence.

| Run                                                                                       | Observed attempts | Cadence after the initial burst                                                          | Final observed triggering actor |
| ----------------------------------------------------------------------------------------- | ----------------: | ---------------------------------------------------------------------------------------- | ------------------------------- |
| [37159739450](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37159739450) |                 6 | Oct 04 10:16:43Z → 18:20:01Z → Oct 05 02:23:01Z → 10:26:04Z → 18:29:08Z                  | AmitabhainArunachala            |
| [37149943471](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37149943471) |                 7 | Same bursts, plus an additional 10:33:35Z attempt Oct 04; attempts 2 and 4–7 cancelled   | AmitabhainArunachala            |
| [37137260501](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37137260501) |                 6 | Same bursts; attempts 2 and 3 separated by 483.32 min, subsequent gaps 483.00–483.07 min | AmitabhainArunachala            |

This is strong evidence of periodic account-level automation consistent with the brief's **8h03m** report. The most recent confirmed cadence burst is **2026-10-05 18:29 UTC**. A later rerun, 37407758020 attempt 2, began **2026-10-06 07:20:10Z**, after attempt 1 began 03:10:51Z; its account actor is also AmitabhainArunachala. It is not on the demonstrated cadence.

The API establishes the actor account, timestamps and conclusions. It does **not** identify a bot installation, process, scheduler host or whether it remains active at collection. Cancelled overlapping attempts are consistent with CI's concurrency policy, but the API does not prove each cancellation's causal initiator. No account automation was modified.

Interaction with the redesigned CI: every job now admits only its own attempt's plan, build and shard artifacts. A failed-jobs-only rerun, like the one noted above that reused the earlier native job, therefore always fails closed with missing-artifact errors. Gate failures already get one automatic fresh-runner retry inside each attempt; a manual rerun must use **Re-run all jobs**. If the automation keeps rerunning failed jobs only, each of its attempts will be red until John decides whether to change it.

Raw evidence stays under `~/.dharma/bunki_review/2026-10-06/ci/`: run pages, job records, per-attempt JSON, five battery logs, diagnostics ZIPs and extracted receipts. The earlier full log stays at `~/.dharma/bunki_review/2026-10-06/battery-f938.log`. Acquisition used only `gh api`, `gh run view --log --job`, and artifact-download GETs against the authoritative repository.

## All 135 measured gates

These are the original required names. Every row has five complete observations. Median includes failed observations; maximum is the baseline scheduling weight ([DESIGN](DESIGN.md) covers later observations that can raise it). Setup/upload time is excluded. The runner is **ubuntu-latest** for every gate, within `ci.yml:checks` (also called by `pages-app.yml:verify`). Commands and assertions remain defined in `batteryGates()` in `scripts/verify-release-gates.mjs`; browser names and flags are retained there.

| Gate                                | Median sec | Maximum sec | Observed failures / 5 |
| ----------------------------------- | ---------: | ----------: | --------------------: |
| `ai-adaptation`                     |     64.426 |      65.875 |                     0 |
| `alma-reading`                      |     32.064 |      32.955 |                     0 |
| `annotation-lookup`                 |     72.840 |      73.828 |                     0 |
| `assessment-app`                    |    233.921 |     237.015 |                     0 |
| `assessment-bank`                   |      8.165 |       8.612 |                     0 |
| `assessment-controller`             |     51.648 |      56.856 |                     0 |
| `assessment-learning`               |      2.376 |       2.417 |                     0 |
| `assessment-private-import`         |     39.151 |      39.756 |                     0 |
| `assessment-question-practice`      |      1.229 |       1.254 |                     0 |
| `assessment-question-source`        |      0.976 |       1.001 |                     0 |
| `assessment-question-view`          |     62.288 |      62.452 |                     0 |
| `assessment-room`                   |     52.815 |      53.309 |                     0 |
| `assessment-standalone`             |     34.061 |      34.510 |                     0 |
| `assessment-v2-controller`          |      7.831 |       7.948 |                     0 |
| `assessment-v2-finalize`            |    109.541 |     111.758 |                     0 |
| `assessment-written-section`        |    226.967 |     236.401 |                     0 |
| `browser-audio-silence-contract`    |      0.055 |       0.063 |                     0 |
| `bundled-listening-catalog`         |      0.210 |       0.217 |                     0 |
| `bundled-listening-failures`        |      5.585 |       5.755 |                     0 |
| `bundled-listening-integration`     |     89.172 |      93.282 |                     0 |
| `bundled-practice-integration`      |     78.104 |      81.061 |                     0 |
| `corpus-pytest`                     |      1.672 |       2.248 |                     0 |
| `corridor`                          |    339.190 |     355.602 |                     0 |
| `corridor-a11y`                     |     56.363 |      59.362 |                     0 |
| `corridor-ai`                       |    106.858 |     109.343 |                     0 |
| `corridor-build`                    |     32.281 |      33.635 |                     0 |
| `corridor-lint`                     |      6.420 |       6.651 |                     0 |
| `desktop-host`                      |      8.958 |       9.492 |                     0 |
| `drift-fast`                        |    150.321 |     151.652 |                     0 |
| `drift-hunt`                        |    190.261 |     190.438 |                     0 |
| `drift-layer-generated`             |      0.081 |       0.088 |                     0 |
| `drift-practice-priorities`         |      0.953 |       0.994 |                     0 |
| `drift-record-chromium`             |     97.910 |      98.893 |                     0 |
| `drift-record-webkit`               |    105.523 |     105.652 |                     0 |
| `e2e`                               |     77.128 |      81.479 |                     0 |
| `e2e-build`                         |     33.075 |      38.104 |                     0 |
| `export`                            |      1.139 |       1.248 |                     0 |
| `format-check`                      |     15.239 |      19.040 |                     1 |
| `guided-offline`                    |     11.754 |      12.048 |                     0 |
| `guided-session`                    |    220.965 |     229.085 |                     0 |
| `guided-session-contract`           |      0.175 |       0.182 |                     0 |
| `import-provider`                   |     68.667 |      69.102 |                     0 |
| `kagami`                            |     56.155 |      59.343 |                     0 |
| `kanji-capture`                     |      0.524 |       0.543 |                     0 |
| `later-encounters-contracts`        |      0.863 |       0.897 |                     0 |
| `later-encounters-integration`      |    226.043 |     232.807 |                     1 |
| `learning-record-chromium`          |     49.029 |      49.389 |                     0 |
| `learning-record-webkit`            |     78.647 |      79.818 |                     0 |
| `lint`                              |      8.163 |       8.648 |                     0 |
| `listening-intake-integration`      |     87.906 |      90.125 |                     0 |
| `mock`                              |     78.627 |      81.013 |                     0 |
| `native-readings`                   |    167.621 |     176.278 |                     0 |
| `navigation-returns`                |      0.078 |       0.085 |                     1 |
| `official-content-guard`            |      8.044 |      24.263 |                     0 |
| `offline`                           |     35.750 |      37.672 |                     0 |
| `personal-reading`                  |     14.413 |      14.608 |                     0 |
| `personal-reading-webkit`           |     20.203 |      20.822 |                     0 |
| `playback`                          |     54.837 |      55.066 |                     0 |
| `practice-history`                  |    726.129 |     741.711 |                     0 |
| `practice-history-webkit`           |    860.743 |     958.706 |                     0 |
| `prefetch-lifecycle`                |    110.030 |     113.795 |                     0 |
| `publisher-contracts`               |      1.251 |       1.289 |                     0 |
| `publisher-reading`                 |     48.628 |      48.938 |                     1 |
| `publisher-reading-webkit`          |     73.775 |      75.362 |                     0 |
| `reading-candidates`                |     27.589 |      29.004 |                     0 |
| `reading-candidates-webkit`         |     34.838 |      35.140 |                     0 |
| `reading-facets`                    |      0.529 |       0.559 |                     0 |
| `reading-position-contract`         |      0.992 |       1.446 |                     0 |
| `reading-position-integration`      |     13.960 |      14.394 |                     0 |
| `record-app-chromium`               |     24.357 |      25.833 |                     0 |
| `record-app-webkit`                 |     29.500 |      30.854 |                     0 |
| `record-binding`                    |      0.089 |       0.111 |                     0 |
| `record-binding-browser`            |      1.393 |       1.548 |                     0 |
| `record-binding-webkit`             |      2.207 |       2.407 |                     0 |
| `record-controller`                 |     78.381 |      81.307 |                     0 |
| `record-controller-webkit`          |     67.561 |      72.551 |                     0 |
| `record-host`                       |     21.535 |      22.534 |                     0 |
| `record-host-webkit`                |     24.303 |      26.288 |                     0 |
| `record-integrity`                  |    100.371 |     101.966 |                     0 |
| `record-live-chromium`              |     62.357 |      63.766 |                     0 |
| `record-live-webkit`                |    131.252 |     134.428 |                     0 |
| `record-note-create`                |    113.367 |     121.795 |                     0 |
| `record-note-lifecycle`             |    300.582 |     303.371 |                     0 |
| `record-note-restore`               |    271.074 |     273.772 |                     0 |
| `record-note-views`                 |     67.686 |      76.512 |                     0 |
| `record-practice-finalize`          |    289.904 |     291.113 |                     0 |
| `record-sync`                       |      2.179 |       2.420 |                     0 |
| `record-sync-backup-chromium`       |     28.372 |      30.067 |                     0 |
| `record-sync-backup-webkit`         |     52.985 |      54.752 |                     0 |
| `reference-browser`                 |     45.644 |      46.255 |                     0 |
| `reference-connections`             |     42.432 |      44.921 |                     0 |
| `reference-core`                    |      9.923 |      10.550 |                     0 |
| `reference-data`                    |      1.082 |       1.136 |                     0 |
| `reference-packaging`               |      7.183 |       7.436 |                     0 |
| `reference-ui-contracts`            |      0.054 |       0.059 |                     0 |
| `release-gates`                     |     73.343 |      88.680 |                     0 |
| `replay`                            |      1.071 |       1.172 |                     0 |
| `search-fallback-core`              |      2.234 |       2.272 |                     0 |
| `search-fallback-ui`                |     20.060 |      20.609 |                     0 |
| `sentence-drafts-contract`          |      1.701 |       1.761 |                     0 |
| `sentence-drafts-integration`       |    376.179 |     383.001 |                     0 |
| `sentence-feedback-integration`     |     71.113 |      74.426 |                     0 |
| `sentence-practice-integration`     |     59.637 |      62.666 |                     0 |
| `shelf-search`                      |     66.469 |      69.309 |                     0 |
| `skip-browser`                      |     20.986 |      21.237 |                     0 |
| `skip-core`                         |      6.218 |       6.601 |                     0 |
| `skip-packaging`                    |      1.300 |       1.377 |                     0 |
| `skip-standalone`                   |     10.728 |      11.097 |                     0 |
| `skip-ui-contracts`                 |      0.071 |       0.078 |                     0 |
| `source-inbox-contract`             |      1.397 |       1.473 |                     0 |
| `source-inbox-integration`          |     62.565 |      67.627 |                     0 |
| `source-kanji-practice-contract`    |      0.870 |       0.915 |                     0 |
| `source-kanji-practice-integration` |    227.325 |     234.205 |                     0 |
| `source-learning-integration`       |     80.017 |      83.236 |                     0 |
| `source-processing-contract`        |      0.129 |       0.140 |                     0 |
| `source-processing-integration`     |     86.210 |      89.974 |                     0 |
| `source-shelf`                      |     14.903 |      15.152 |                     0 |
| `source-shelf-webkit`               |     21.096 |      22.071 |                     0 |
| `srs-today`                         |    358.845 |     390.978 |                     0 |
| `standalone-journey`                |     62.892 |      66.232 |                     0 |
| `storage-integ`                     |      1.030 |       1.054 |                     0 |
| `teacher-context-contract`          |      0.308 |       0.331 |                     0 |
| `teacher-context-integration`       |    154.963 |     161.173 |                     0 |
| `teacher-drafts-contract`           |      0.181 |       0.194 |                     0 |
| `teacher-drafts-integration`        |    173.743 |     177.425 |                     0 |
| `teaching-context`                  |      0.130 |       0.142 |                     0 |
| `timed-transcript-integration`      |     73.670 |      74.652 |                     0 |
| `tutor-quiz-storage`                |     16.283 |      16.322 |                     0 |
| `tutor-quiz-storage-webkit`         |     23.455 |      25.036 |                     0 |
| `tutor-request-binding-integration` |     39.421 |      40.534 |                     0 |
| `typecheck`                         |     50.129 |      52.213 |                     0 |
| `vitest`                            |     65.180 |     125.470 |                     0 |
| `word-saved-answer`                 |     14.377 |      15.184 |                     0 |
| `word-saved-answer-controls`        |      0.105 |       0.114 |                     0 |
| `writing-room`                      |    133.557 |     142.200 |                     0 |
