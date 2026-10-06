# Hosted CI proof record

This record preserves the hosted controls completed on 2026-10-06 and their exact candidate identities. All runs below are attempt 1. The final candidate, its complete CI result, per-shard timing and subsequent exact-tree reuse result are linked in [draft PR #123](https://github.com/AmitabhainArunachala/Bunki-app/pull/123). Red and docs-only controls cannot authorize deployment.

## Timing definitions

- **Check completion elapsed** is GitHub job `completed_at` minus run `run_started_at`. It includes scheduling, checkout, dependency setup, transfers, execution and cleanup. This is the fast-signal target measurement.
- **Job elapsed** is job `completed_at` minus job `started_at`; it excludes time before the job starts.
- **Gate execution** is receipt `completedAt` minus `startedAt`; it excludes checkout, setup and artifact transfer.
- **Receipt wall time** ends at aggregate admission. It is narrower than the completed GitHub check and is not substituted for it.

## Observed outcomes

| Control                                                                                                        | Hosted result                                                                            |                   Actual fast check completion | Full-proof status                           |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------: | ------------------------------------------- |
| [Initial full run 37496611523](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523)     | Required red; workflow finished in 37m56s                                                |                                   562s / 9m22s | No successful full proof                    |
| [Cancellation 37501821599](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599)         | Eleven running siblings cancelled; required red                                          |                                  652s / 10m52s | No full proof artifact                      |
| [Docs only 37502982128](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37502982128)            | All 31 docs gates and required green                                                     |                                  655s / 10m55s | Docs receipt only                           |
| [Deliberate flake 37508662727](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37508662727)     | Probe FLAKY; two ordinary gates FAILED TWICE, required red                               |      662s / 11m02s, including deliberate retry | No full proof artifact                      |
| [Deliberate assertion 37504356024](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37504356024) | Real assertion failed twice on fresh runners; required red, packaging/deployment skipped | 1005s / 16m45s, including a natural fast retry | No full, transfer or Pages package artifact |

The initial fast check met 600 seconds. Cancellation and docs controls missed it by 52 and 55 seconds. The negative control's fast signal also exceeded the target after a natural Vitest retry. The later fetch and scheduling correction needs a new hosted completion measurement.

## Initial full run

[Run 37496611523](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523) tested feature head `edf5b4dc2b7491ae739b03dbf65e1b672404164e` through synthetic PR merge `b37b57cc94186284736738feb79ce6c4560c6de1`.

The plan/parity artifact independently evaluated 135 original and 135 candidate canonical gates: zero missing and zero added. The full plan contained those 135 plus 14 supplemental gates, assigned exactly once. One packaged site artifact was bound into shard receipts. Build and native jobs passed.

The run began at 16:33:16 UTC on 2026-10-06. Fast completed at 16:42:38 UTC, after 562 seconds. Required completed red at 17:11:11 UTC, after 2,275 seconds / 37m55s. The terminal workflow timestamp was 17:11:12 UTC, after 2,276 seconds / 37m56s. This red duration is not successful full-battery timing evidence.

Initial shard durations below use server timestamps and include setup and transfers. Initial job-level success does not establish passed gates: step continuation retains failed-gate receipts for retry, and aggregate admission determines the required result.

| Initial shard job                                                                                                      | Job elapsed seconds | Job conclusion |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------: | -------------- |
| [fast-1](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341567)                  |                 112 | success        |
| [fast-2](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341602)                  |                 111 | success        |
| [fast-3](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341780)                  |                 345 | success        |
| [fast-decks](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341575)              |                 169 | success        |
| [practice-history](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383342033)        |                 770 | success        |
| [practice-history-webkit](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383342076) |                1156 | success        |
| [balanced-01](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341995)             |                 664 | success        |
| [balanced-02](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341907)             |                1826 | success        |
| [balanced-03](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341838)             |                1056 | success        |
| [balanced-04](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383342022)             |                 941 | success        |
| [balanced-05](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341910)             |                1260 | success        |
| [balanced-06](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383342009)             |                 867 | success        |
| [balanced-07](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341984)             |                1046 | success        |
| [balanced-08](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341962)             |                 947 | success        |
| [balanced-09](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383342056)             |                1027 | success        |
| [balanced-10](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341944)             |                1105 | success        |

Supporting jobs took 52 seconds for plan, 88 for build and 201 for native. Balanced-02 was the longest initial job at 1,826 seconds. Its ten gates passed, while setup included an 893-second system-package download outlier.

Five gates failed again on fresh retries: `search-fallback-ui`, `teaching-context`, `search-fallback-core`, `ai-adaptation` and `standalone-journey`. Their freshness assertions exposed eagerly created child evidence directories. Required rejected the result. Plumbing changes must preserve those assertions and obtain a new passing full run.

A separate natural flake was observed: `publisher-reading-webkit` failed in 85.562 seconds on [initial job 112383341944](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112383341944), then passed in 76.115 seconds on [fresh retry 112397458232](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/job/112397458232). This does not make the red producer deployable and does not replace the deliberate fail-once control.

## Cancellation control

[Run 37501821599](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599) used scratch commit `aa4a515195e8f54b1b9052ab83404903826c46f0`. Only its slow matrix temporarily enabled fail-fast. The selected setup slept 90 seconds then exited 23; sibling setup steps waited 180 seconds.

[Practice-history job 112402100327](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100327) ran its failing setup from 17:17:23 to 17:18:53 UTC. All eleven siblings had assigned runners and entered the setup wait before GitHub cancelled them. This was actual cancellation of running work, not merely queued jobs.

| Cancelled running sibling | Actual job ID                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| balanced-01               | [112402100275](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100275) |
| balanced-02               | [112402100353](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100353) |
| balanced-03               | [112402100299](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100299) |
| balanced-04               | [112402100304](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100304) |
| balanced-05               | [112402100351](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100351) |
| balanced-06               | [112402100259](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100259) |
| balanced-07               | [112402100249](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100249) |
| balanced-08               | [112402100291](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100291) |
| balanced-09               | [112402100553](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100553) |
| balanced-10               | [112402100253](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100253) |
| practice-history-webkit   | [112402100399](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112402100399) |

All 12 slow shard receipt artifacts were absent. Slow retry planning failed; no retry ran. The always-running required aggregate executed despite failed prerequisites and the absent retry-plan artifact download. It failed admission and retained the CANCELLED/MISSING gate table plus `WORKFLOW_FAILURE.md`.

[Required job 112405274406](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/job/112405274406) failed and proof publication was skipped. The completed 17-artifact inventory contained no `bunki-proof-*` artifact. Build, native and the independent fast signal passed.

Fast completed in 652 seconds; receipt admission ended at 643.784 seconds. Plan checkout took 186 seconds, including an all-branches/all-tags Git fetch of approximately 183.03 seconds. npm took 18 seconds with a cache hit. This proves cancellation rejection, not the ten-minute target.

The temporary cancellation fault was reverted locally in `aa082077ab20cab141da409ace0ccf5bc174fd85`; its entire source tree matches the pre-control parent. The clean control worktree was removed and the local branch retained. The remote scratch branch remains at the original fault commit; no cleanup push or remote deletion was attempted.

## Docs-only control

[Draft PR #125](https://github.com/AmitabhainArunachala/Bunki-app/pull/125) targeted `codex/ci-revolution-20261007`, never main, and changed only `docs/operator/ci-docs-only-control.md`. It is now closed. The clean control worktree was removed and branch references were retained. The blocked remote deletion was not retried.

[Run 37502982128](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37502982128) tested merge `a99b3e8767bc5454840a4d7fbcfafd654f6c74a6` against base `edf5b4dc2b7491ae739b03dbf65e1b672404164e`. The comparison of the actual tested candidate contained only that prose file.

The downloaded plan selected docs scope: four fast shards and 31 required gates. All 31 passed first attempt, no retry ran and no flake was emitted. Native and concrete slow jobs were skipped. The final receipt was `bunki-docs-check`, phase `all`, scope `docs`, status `passed`; it was not a full-battery receipt.

[Fast job 112408561127](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37502982128/job/112408561127) completed after 655 seconds / 10m55s. [Required job 112409225506](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37502982128/job/112409225506) completed after 733 seconds / 12m13s. Narrower receipt times were 649.838 and 726.939 seconds. All fast shards completed at 8m24s, followed by 58 seconds of retry planning and 87 seconds of fast aggregation, plus scheduling.

The completed 15-artifact inventory contained no `bunki-proof-*` artifact. Plan, shard and summary ZIP digests were compared with API SHA-256 metadata before reading their JSON/Markdown members. This proves docs routing and successful docs admission without slow/native work, while documenting the 55-second fast-target miss.

## Performance correction and independent review

[Commit 021af28c434da5629eaaa6fe6f643eff29a2185a](https://github.com/AmitabhainArunachala/Bunki-app/commit/021af28c434da5629eaaa6fe6f643eff29a2185a) changes plan checkout to depth two without tags and fetches the validated pinned original parity commit directly. PR event base must equal the tested merge's first parent and computed merge-base before its complete diff is admitted. Unknown, missing or raced ancestry selects full coverage. Admission jobs explicitly use depth one without tags. Existing build and actual gate checkout policies remain unchanged.

The existing three fast lanes now use longest-processing-time balancing, plus the ordered deck lane. The separate optional `planningObservations` dataset records 31 passed rows from four initial run-37496611523 shard receipts. The historical five-battery timing object is unchanged. Scheduling takes the greater of each historical maximum and new observed maximum.

Measured scheduling loads are 125.866, 71.842, 71.843 and 50.630 seconds. Replaying baseline execution times into those assignments gives 125.866, 69.502, 52.407 and 50.630 seconds. These exclude setup and transfer and are scheduling evidence, not hosted end-to-end success.

Verification passed 154 combined unit tests, 92 parsed workflow controls and seven executable shallow-history cases. Real parity retained all 135 original gates; full/docs membership remained 149/31, with four fast resources and 12 slow shards. Actionlint passed for the changed CI workflow; ESLint, Prettier and diff checks passed. Across all workflows, actionlint1.7.12 cannot parse GitHub's supported `concurrency.queue: max` field in the ledger consumer. Parsed YAML tests validate that exact field, and a temporary copy with only that field removed passes the remaining actionlint checks. This is a tool limitation, not an unqualified raw-linter pass. The previous executable scheduler failed the new separation and measured-load regression.

Independent review found no substantive defect within ancestry, membership or timing provenance. It checked all 31 observations against the four actual receipt byte hashes, API artifact digests, statuses, producer identity and timestamps, and confirmed the historical object was unchanged. This supports those bounded claims; hosted performance and full-proof admission remain separate obligations.

A later narrow follow-up, commit `2a3a62c18c4d33c32f7a0cfa557b140059601706`, applies depth-two/no-tags checkouts to fast and fast-retry jobs as well. The 31 regular fast gates use current HEAD, tree, index, status and working-tree differences. Slow verifiers that read older named commits retain full history. The extended synthetic fixture executes these current-source contracts with older history absent and detects tracked and untracked changes. Local verification passed 96 workflow mutation controls, eight executable Git cases and 135-gate parity; combined CI tests passed 172 with one explicitly skipped local artifact integration. The final feature run must establish real shallow fast execution and timing; the controlled flake run uses the prior checkout policy.

## Public evidence anchors

These IDs identify immutable artifacts in the listed attempts. Planning sample SHA-256 provenance is recorded in `docs/ci/gate-timings.json`.

| Run         | Artifact name                                  | Artifact ID                                                                                                     |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 37496611523 | `bunki-plan-37496611523-1`                     | [11428016816](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/artifacts/11428016816) |
| 37496611523 | `bunki-summary-37496611523-1`                  | [11430750062](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/artifacts/11430750062) |
| 37496611523 | `bunki-shard-fast-1-1-37496611523-1`           | [11427259689](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/artifacts/11427259689) |
| 37496611523 | `bunki-shard-fast-2-1-37496611523-1`           | [11428425414](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/artifacts/11428425414) |
| 37496611523 | `bunki-shard-fast-3-1-37496611523-1`           | [11428630639](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/artifacts/11428630639) |
| 37496611523 | `bunki-shard-fast-decks-1-37496611523-1`       | [11427608885](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37496611523/artifacts/11427608885) |
| 37501821599 | `bunki-summary-37501821599-1`                  | [11430029628](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37501821599/artifacts/11430029628) |
| 37502982128 | `bunki-plan-37502982128-1`                     | [11430587009](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37502982128/artifacts/11430587009) |
| 37502982128 | `bunki-summary-37502982128-1`                  | [11430878372](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37502982128/artifacts/11430878372) |
| 37504356024 | `bunki-shard-practice-history-1-37504356024-1` | [11431396790](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37504356024/artifacts/11431396790) |

## Negative assertion control

[First history job 112410407218](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37504356024/job/112410407218) reached the real N5-01 assertion and failed `18 !== 19`. The assertion was intentionally changed only on the scratch control. Fresh retry [112425691366](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37504356024/job/112425691366) failed the same assertion, on runner 1000166576 rather than the initial runner 1000166550. Gate durations were 0.846 and 1.253 seconds. [Required job 112430579554](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37504356024/job/112430579554) completed red at 18:22:42 UTC and explicitly rejected `Failed twice: practice-history`. Its complete 149-row summary contains 144 PASSED, 4 FLAKY and 1 FAILED TWICE, with no missing or unverified rows. Packaging and deployment were skipped. Lookup missed and reusable verification failed, so publishing prerequisites were false independently of the non-main branch guard. Final inventory contained no full-proof, transfer-proof or Pages package artifact. The required check took 50m04s including network setup tails and retries; this negative run is not successful timing evidence.

[Fast-1 job 112410406762](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37504356024/job/112410406762) confirmed 170 CI contract tests passed, zero failures and zero skipped, including the actual runner integration using the same hosted build artifact. This does not establish a successful full run.

The independent fast check completed green at 17:49:23 UTC, 1,005 seconds after the 17:32:38 UTC run start, and was observed green at 17:49:36 UTC. It included a natural Vitest failure and fresh passing retry. [First job 112410406942](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37504356024/job/112410406942) and [retry job 112413727889](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37504356024/job/112413727889) ran on distinct runners 1000166549 and 1000166554. Gate durations were 108.361 and 103.851 seconds. The retained flake row is observed CI evidence; it is separate from the deliberate fail-once requirement.

The assertion was reverted locally in `1c17e3721b0641d701d6c8cd10c08aabaef873f6`, restoring the original verifier byte-for-byte. The clean worktree was removed and local branch retained. The feature branch never contained this assertion fault.

## Deliberate fail-once control

[Run 37508662727](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37508662727) tested scratch head `b1eabf9f80411a2830e96778964f8a3557f9099f`. Its temporary `ci-flake-probe` deliberately asserted failure on attempt 1 and passed only on attempt 2. All 149 regular gates remained required, making 150 rows for this control.

| Gate                | First job / runner        | First seconds | Sole retry job / runner   | Retry seconds | Aggregate label |
| ------------------- | ------------------------- | ------------: | ------------------------- | ------------: | --------------- |
| ci-flake-probe      | 112424313412 / 1000166560 |         0.033 | 112427647321 / 1000166580 |         0.024 | FLAKY           |
| drift-record-webkit | 112424313798 / 1000166561 |       105.890 | 112439620257 / 1000166584 |       106.161 | FAILED TWICE    |
| guided-session      | 112424313747 / 1000166565 |       245.528 | 112439620414 / 1000166585 |       242.053 | FAILED TWICE    |

The [fast check](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37508662727/job/112428195489) completed green at 18:16:56 UTC, 662 seconds after run start, including the deliberate retry. Its summary visibly marks the probe FLAKY. The [required check](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37508662727/job/112442257178) correctly failed at 18:48:46 UTC: 147 PASSED, 1 FLAKY and 2 FAILED TWICE. Workflow completion was 18:48:47 UTC, after 2,573 seconds / 42m53s. Neither timing met its target. There is no full receipt or proof artifact, so this run was not offered for artifact reuse.

All 19 immutable shard ZIP digests and receipt identities were independently verified. The production read-only ledger admission checked actual producer policy blobs, the exact generated plan, artifact identity, server jobs, execution intervals and distinct runners. Only the deliberate passing pair was admitted from this run; it is seeded as `controlled-experiment`. The two twice-failed gates are not fabricated flake rows. Their independently verified retry diagnostics are `held-ring-edge-satellites-remain-hit-owned: A visible, hit-tested .word must be reachable` and `webkit-390 · M3 impact and paper break-up phases occur`; both retained clean source and unchanged artifact checks.

The [full summary artifact 11437305603](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37508662727/artifacts/11437305603) has SHA-256 `db3557c88ebbbc7b11a8187c8743e88082740f7f62f378778f8eb0d0466bd740`. It contains SUMMARY.md and WORKFLOW_FAILURE.md, without receipt.json. [Fast summary 11434960938](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37508662727/artifacts/11434960938) has SHA-256 `6ba8610286ad8940416176512e6115fc6d4651976fc8266c9210ccbae3e4bbc4`.

The deliberate probe and its temporary test adaptation were normally reverted in local commits `c0e708c0` and `a327f9fb1e20e49e59f09f139160e530f1d7b3d1`. The behavioral battery suite and clean-tree check passed, the worktree was removed, and the local branch remains. No probe code or control override was transferred to the feature.

An offline timeout audit evaluated all 150 first gates and 153 total gate observations against unchanged producer caps. No gate or explicitly capped step reached half its cap. One whole job, balanced-03, took 1,996 / 3,900 seconds (51.18%); this is reported rather than hidden by raising a timeout. Successful final-run timing and headroom remain separate acceptance checks.

## Network setup correction

Three completed setup logs show the same 126 MB of Ubuntu packages taking 13m40s, 14m32s and 16m12s from Azure at 153, 144 and 129 kB/s. Python installation and browser CDN downloads were not those tails. Actual logs show the 144-byte `/etc/apt/apt-mirrors.txt` indirection. The [exact runner image provisioning script](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/configure-apt-sources.sh) supplies the mirror-file layout; its reconstructed fixture is corroborated by those logs, not a captured runner filesystem.

Commits `d9d66224` and `5ca15d5e047410200309b7e94192d173202032a2` replace only the exact Azure Ubuntu archive URI with the official archive, including the observed fixed mirror file. Scheme, path, priorities, other destinations, signature settings and normal dependency installation remain. Unknown layouts are unchanged; source and mirror substitution counts are separately logged. The initial literal-source-only change would have been a safe no-op on the observed layout; the follow-up covers that evidence. Independent review found no substantive preservation issue. Actual application and timing must be read from the final hosted run, not inferred from fixture success.

## Verifier readiness corrections

The two ordinary twice-failed gates exposed timing-sensitive harness patterns. Their exact hosted frame timelines were not captured, so the corrections do not claim to prove the cause of those historical failures.

Drift's held-ring setup used a fixed 1.5-second wait before releasing a camera that converges per rendered frame; release cancels that convergence. It now waits within bounded deadlines for the same locked label to reach its center, then for the same node to satisfy the original visibility, opacity, bounds and hit-ownership predicate after real release. All 105 original case assertions, target label, seed, browser coverage and viewport remain. Failure diagnostics report target geometry and hit ownership. The complete WebKit verifier passed 25 cases in a local diagnostic run. A controlled slow-startup fixture reproduces the old acquisition failure and passes the corrected first case. Forced unreachable targets still fail before and after release within the respective 30-second and 5-second bounds. Continuously slow frames still expose a later unchanged satellite-ownership failure; the correction does not turn that negative case green.

Guided-session's M3 check sampled transient impact/resolve classes after awaiting a screenshot. A passive observer now arms before the answer and records the same connected overlay having both required classes, ending when that overlay is removed. Existing appearance/detachment bounds, all other assertions, screenshots, engines and viewports remain. Fourteen standalone Chromium/WebKit controls execute the real moment module: delayed screenshots reproduce the old false negative, while missing impact, missing resolve, disconnected overlays, non-overlapping phases and no mounted overlay all reject. These browser regression controls are a separately invoked local check, not an undeclared fast-lane dependency. The complete guided verifier passed all 422 checks locally.

Both local full verifiers used one external diagnostic artifact with its actual source identity and digest verified through the existing explicit local mode. Source was dirty during parallel harness/document edits; these results are diagnostic evidence, not clean CI admission. The final hosted candidate must pass strict clean-source/artifact checks. No product runtime, animation timers, gate deadlines or required gate membership were changed.

## Seed, authority and cleanup

The committed seed contains five genuine pass-on-retry observations: publisher-reading-webkit from the initial run, plus vitest, drift-record-webkit, standalone-journey and guided-session from the negative run. Each was independently admitted against immutable archives and actual job/runner metadata despite an unrelated overall failure. The sixth row is the separately labeled deliberate experiment above. None makes a red producer deployable. The ongoing data-branch consumer activates only after the workflow reaches the default branch.

All four local control worktrees were cleanly retired; their local branch references remain. The docs-control PR is closed. A global command guard rejected remote scratch deletion and prohibited retry/workaround, so remote `codex/ci-docs-20261007`, `codex/ci-cancel-20261007`, `codex/ci-negative-20261007` and `codex/ci-flake-20261007` remain at their control heads. Their fault code is absent from the final feature; no automatic publication was dispatched on main.
