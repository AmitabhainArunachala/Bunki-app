# SOL foundation report — 2026-10-08

F1–F6 implementation, local verification and draft delivery are complete. All seven completed final-head CI checks passed; the separate full required battery remains in progress. Shipping validation has the explicit limits recorded below. [Draft PR #126](https://github.com/AmitabhainArunachala/Bunki-app/pull/126) uses the exact requested title and base `claude/final-integration-20261007`. Branch `claude/redesign-20261008` is pushed without force at **53a7b934734807189bd6e3295413a758038bf093**. No merge, deployment, rebase or history rewrite occurred.

## Work delivered

- **F1:** built the clean `2ba2967f36b9ee80030ebb088e2c75cc6503c138` baseline and ran all 14 requested processes; 11/14 passed. The brief's absent `verify-navigation-returns.mjs` is covered by the repository's existing `test-navigation-returns` four-case test. Exact logs and substitution are documented in committed `docs/redesign/BASELINE.md`.
- **F2:** made English arguments explicit, removed fallback/duplicate chrome labels, and translated visible/accessible chrome across corridor, guided/JLPT, reference, SKIP, public players and private collections. Original Japanese learning content stays original. `tools/lint-ui-language.mjs` performs a real Playwright room tour with precise learning-content and named-mark allowances.
- **F3:** added the fenced token system at the actual end of `editorial.css`: color roles, type, spacing, radii, elevation, durations and easings, with the existing-variable bridge. The bridge preserves 96 baseline computed-theme cases, propagates role overrides and resolves 301 consumed variables. Existing fonts and asset manifests are unchanged.
- **F4:** added the single Today/Read/Learn/Words/Me routing/label table, default-on `S.variants.nav = 'tabs'`, safe-area tabs and grouped Learn sections. Me/settings and private returns preserve locale. Existing IDs/classes/back paths remain available. Front/zen/sheets hide the bar. Actual fixed/sticky docks determine clearance; all sheet/modal layers reserve the original report strip.
- **F5:** stamped stable `html[data-room]` for every view while retaining stage material identity on `data-register`, stage/answered markers and the original entrance lifecycle.
- **F6:** committed each step, reran the entire F1 subset, fixed code regressions, performed focused follow-ups, inspected actual screenshots, ran the installed no-mistakes gate to a terminal result, pushed and opened/updated the draft PR. Every intentional verifier label/material/selector change is itemized in `docs/redesign/VERIFIER_CHANGES.md`. No behavioral assertion was deleted or weakened.

## Baseline → after

| Verifier | Baseline | After |
| --- | --- | --- |
| verify-corridor | PASS | PASS |
| verify-corridor-storage-integrity | PASS | PASS |
| verify-corridor-doors | FAIL | FAIL (inherited) |
| verify-dojo-door | PASS | PASS |
| test-navigation-returns | PASS | PASS |
| verify-design-reader-shelf | PASS | PASS |
| verify-relief | FAIL | PASS |
| verify-theme-consistency | FAIL | PASS |
| verify-corridor-accessibility | PASS | PASS |
| verify-experience | PASS | PASS |
| verify-kotoba-mine | PASS | PASS |
| verify-n2n1-decks | PASS | PASS |
| verify-personal-collections | PASS | PASS |
| sw-shell | PASS | PASS |

**13/14 consolidated after, versus 11/14 baseline.** The complete V12 rerun (`sol/after-v12/results.json`) passed 12/14 and exposed a report-button collision with a deck dictionary sheet's Close control. The code fix reserves the original report strip in sheet/modal layers. Final V14 Kotoba **152/152** and reader/shelf **74/74** reruns pass. V15 exposes the tablet tip's existing 44px native touch extent. V16 bounds the wider Linux stroke-number control and adds a scoped publisher minimum-height reserve; exact unchanged targeted checks and final navigation/dock tests cover those fixes. This is the consolidated full-rerun plus focused-follow-up result, not a claim that every process ran again on V16. Intermediate failures are retained.

The sole remaining F1 failure is inherited doors T13/T14: its interception uses `/data/mock/n1-02.json` (and n1-03/n1-04), while the app requests `/data/mock/sets/<id>.json`. Injection misses and the walk then tries an attempt-hidden dojo control. Baseline failed at the same point. The fault URLs and behavior assertions remain unchanged under the brief's verifier-change restriction. Translated T10 status/negative control and T11 exact question counters pass.

## Final artifact, screenshots and verification

The reviewed app was built from clean source **d3eab1822871eb42ef41345fde586ff288bfdd16**, digest **d44ac09a0d1c123c99073b2b16b2dbb54bdc46808b18f1ba9edd35e881d41626**, in `sol/final-v16-site`. Final HEAD 53a7b934 adds only the documented English SKIP verifier selector and workflow/documentation changes after the clean app source. A clean delivery rebuild at final HEAD in `sol/delivery-final-site` has the exact same app digest (`sol/delivery-final-identity-receipt.json`, `appBytesExact: true`).

- **230** real EN/JA states at **390×844**; **11,729** English chrome inspections; zero language, renderer, room-stamp or shell errors. [Final local gallery](../sol/final-v16-gallery/ui-language/index.html) includes every PNG, DOM report and artifact identity.
- **12/12** final navigation journeys across Chromium/WebKit × 320/390/768px × EN/JA, zero overflow diagnostics (`sol/final-v16-foundation`).
- **24/24** final dock cases; **216** samples and **1,080/1,080** actual pointer points owned; zero overlaps/page errors; **52** screenshots. All 16 immediate import-preview samples preserve visible nonempty status and unobstructed buttons. Four tablet cases preserve the 32px painted tip glyph while testing its effective 44px native touch extent and actual dismissal. Exact N2 grade census remains two; other families retain four. Twenty prior case paths/assertions are unchanged. Receipt `sol/final-v16-docks/redesign-docks.json` binds verifier SHA `0121e5350823b8ef1117b359841655a31f8188f62d4f97be8fc7a5061d24fde2`.
- Visual follow-ups: **4/4** tablet tip/sheet cases; **8/8** native shelf-to-reader attribution cases on both browsers/languages at 320/390px. The inherited long license URL wraps while text, href and article bytes remain exact.
- Earlier supplemental receipts retain their provenance: V12 reader list **12/12** native Create/Add hits with card retention and Escape return; Linux DejaVu 320px EN/JA **2/2** with document width 320 and full Tools targets; written original-heading lookups **2/2**, one Tab stop. Written and practice-history suites each pass **20** cases, including the exact CI server-disconnected offline mode.
- Final complete required-SKIP experience journey **42/42**, no skips/page errors, **62** actual screenshots on clean D44. The one remaining E13 text pin now selects `by its shape`; exact `1-3-8`, Back/input retention, unchanged learning debt and nine frozen-asset hashes all pass. Both repaired SKIP raw screenshots were personally viewed. Receipt `sol/final-experience-skip/results.json`.
- Whole corridor **259/259**, storage **26/26**, service-worker shell **7/7**, guided **422/422**, deck/player units **215/215**. Probe **48** labels over 12 theme states × EN/JA, minimum **11.118:1** contrast and actual center hits.
- All nine dictionary/listening/tutor/writing follow-ups pass, including both standalone formats and **16** sentence-draft cases. Mock **25/25**, reference connections **20/20**, Kagami **32/32**, reference **53/53**, native readings **58/58**, journey **13** stations and private import **12** stages per engine pass.

Sol's actual Linux sample review is additionally recorded in `sol/sol-final-linux-independent-visual-review.json` (two contacts plus four raw states, exact hashes and explicit publisher-fallback/stroke scope).

Sol personally inspected **86** shots covering all 32 core rooms in both languages, six deck families, private study/answer, active probe and JLPT confirmation, across eight final contact sheets plus repaired raw scenes. Receipt `sol/sol-final-v16-independent-visual-review.json`. The separate visual lane inspected **all 230 final V16 screenshots** across 20 contact sheets, plus repaired raw scenes, with no material visual findings. Final V16 DOM checks have zero issues; tablet/attribution follow-ups retain their V15 provenance. This review concerns the engineering foundation; concept selection and physical-device acceptance are separate work.

Read-only audits preserve the complete storage block, **117** storage/record declarations and **eight** protected engine/FSRS/drift files exactly. Card IDs, `bunki-cloze:*` keys and forbidden deck sources are unchanged. **1,565** helper calls have no missing/null English argument. Four regenerated standalone Kotoba HTML files preserve embedded learning decks/glossaries and frozen card IDs exactly. Final audits live in `sol/final-v16-hard-rule-audit.json`, `sol/final-v16-language-callsite-audit.json` and `sol/ci-study-pages/receipt.json`.

Repository ESLint, the release battery's exact authored Corridor ESLint command, scoped formatting, syntax and diff checks pass. Full `npm run format:check` fails on exactly two unchanged baseline files: `decks/n2n1/BATON_CODEX_2026-10-07.md` and protected `decks/n2n1/source/rewrite-queue.json`. Neither file nor formatting exclusions were changed. Exact log: `sol/final-v16-full-format.log`.

## Final Linux and fixture follow-ups

The previous immutable app reproduces the Linux stroke collision with actual embedded DejaVu font metrics. Bounded wrapping gives **8/8** browser/language/phone cases, **48** control samples and **240/240** owned native points, minimum **14px** wake/corner separation. Unchanged writing **51/51** and reference connections **20/20** pass. The first work receipt is pinned to `4ed3db3f…`. The final clean D44 repeat also passes 8/8 with 240/240 owned points (`sol/final-v16-stroke/stroke-corners.json`); Sol viewed its repaired raw scenes.

Publisher frames reproduce both earlier CI underflows from fractional entry translation. With the scoped one-pixel reserve, **560** samples and **1,960/1,960** native points pass, minimum height **44.999984px**, plus **2/2** unchanged focused cases and exact text/real selection/return/zero source egress. Work receipt `sol/ci-publisher-after/publisher-geometry.json` honestly declares `sourceDirty: true` with D44 app bytes, identical to the final clean build. No verifier wait/tolerance was added.

Four deliberately affected fixtures were corrected and logged: one English dictionary title (**87/87** node tests); extraction of the actual F2 grade-label helper (**45/45** learning-record checks); a synthetic assistance paragraph placed above the new tabs (**2/2** real pending/reject/commit/retarget cases); and the original Japanese offline style fixture followed by a real EN switch with exact pressed-state assertion (**96/96** complete offline checks). These narrow runs bind the prior B6 delivery and prove exact input/dependency bytes where relevant; the final app changes only the two scoped CSS repairs. The unchanged SRS Today suite also passes **32/32** and catches both original mutants on D44.

## Shipping gate

After narrow/repository checks and before the final push, the installed no-mistakes AXI gate reached terminal **FAILED**, run **01M4BXXDVQNAZ46FEMY89RDJCW**, on clean HEAD 53a7b934. Its Claude review backend returned: **“You've hit your weekly limit · resets 2am (Asia/Tokyo)”**. No findings or fixes were produced. Intent completed; test/document/lint did not start. **The gate did not pass.** The failure is an external reviewer quota, not a successful review.

Branch sync was `user_owned`, `changed: false`, with the exact submitted clean head; no sync was required. AXI was configured with `--skip rebase,push,pr,ci`: rebase was reported skipped, and the later phases were not reached after review failed. This preserves the no-history-rewrite rule and controlled draft delivery. No init, hooks, daemon lifecycle/config, backend authentication or unattended `--yes` changes occurred. The user's explicit F6 delivery instruction authorizes the ordinary push/draft update; the gate result was not used as authority. Final logs: `sol/no-mistakes-delivery-drive.log`, `sol/no-mistakes-delivery-review.log`, `sol/no-mistakes-delivery-terminal-status.log`; full original intent is in `sol/no-mistakes-delivery-intent.txt`.

## CI follow-through

Final head **53a7b934734807189bd6e3295413a758038bf093** has **seven completed CI checks, all SUCCESS**:

| Final-head check | Result |
| --- | --- |
| [Language law / navigation / docks](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988150/job/112979495254) | PASS |
| [Whole corridor](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988150/job/112979495624) | PASS |
| [Frozen deck rebuild / player / units](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988150/job/112979495684) | PASS |
| [Reference libraries / complete learner experience](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988147/job/112979494034) | PASS |
| [Personal collections / offline / storage](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988148/job/112979493957) | PASS |
| [SKIP lookup](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988157/job/112979494000) | PASS |
| [Native CloudKit / real Swift OS-pipe contracts](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988146/job/112980836033) | PASS |
| [Complete required battery](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988146/job/112982679251) | IN PROGRESS; no completed final result |

[Download the final-head Linux screenshots](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37675988150/artifacts/11506809287): **bunki-redesign-foundation-EN-JA-390x844**, artifact **11506809287**, retained 14 days. The actual clean synthetic CI build source is **74cfa3db288352145805edec8c6b01d63414e657** (final branch combined with the declared base). All three runtime receipts compare clean source inputs and exact app digest **d44ac09a0d1c123c99073b2b16b2dbb54bdc46808b18f1ba9edd35e881d41626**. Reports pass **230 language states / 11,729 chrome inspections / zero issues**, **12 navigation journeys / zero overflow**, and **24/24 docks / 216 owned, zero-overlap samples**. The actual downloaded ZIP is 26,314,690 bytes, SHA-256 `3befbc5f12d52043f36cf021db273fa36ce5d767b1015c88d1d5a7acc8bc6fc7`, verified against GitHub metadata. All **294** extracted files and **286** PNGs verify. Receipt: `sol/ci-artifacts/37675988150/foundation-final-receipt.md`.

The final app bytes exactly match the D44 candidate whose 230 local and 230 preceding Linux gallery images were actually reviewed. Sol additionally viewed fresh final-head Learn/dojo English and reader Japanese raws (`sol/sol-final-head-linux-visual-sample.json`). This validates fresh provenance without claiming another complete review of every new PNG. The preceding Linux review and exact artifact remain at `sol/ci-artifacts/37673098965/foundation-final-receipt.md`.

The final Reference workflow passes after the documented one-line E13 selector correction from old `SKIP` to active English `by its shape`; required real SKIP candidates, exact `1-3-8`, Back/input retention, unchanged debt and frozen assets remain asserted. Final Linux Reference census is reference **53/53**, mock **25/25**, Kagami **32/32**, connections **20/20**, store **26** checks and required-SKIP experience **42/42**, zero skips and **62** screenshots. Terminal receipt: `sol/ci-artifacts/37675988147/reference-terminal-receipt.md`. Its earlier failed log is retained. The bounded Ubuntu archive repair also succeeded on both WebKit-bearing workflows; the prior Azure timeout receipt remains available.

The preceding db7 full battery was interrupted by GitHub's same-PR concurrency when the final fix was pushed. Its exact census is **135 gates: 27 started, 25 passed, one format failure, one interrupted, 108 pending**; it is not a completed battery. The only completed failure names the same two unchanged baseline format files. Exact diagnostics: `sol/ci-artifacts/37673098806/interrupted-battery-receipt.md`. Earlier cancelled-run diagnostics were inspected, and all permitted redesign regressions/pins found there were repaired and narrowly verified.

**Remaining limits:** inherited F1 doors fixture failure; full repository formatting fails on two unchanged baseline files, including protected `decks/n2n1/source/rewrite-queue.json`; no-mistakes review is blocked by external weekly quota; the independent final full battery is still running. No all-CI-green, completed full-battery, or successful review-gate claim is made.

## Changed files and handoff

52 changed files comprise the corridor chrome/assessment/guided/reference/SKIP modules and styles; public/context/private deck host chrome and styles; four frozen standalone study HTML outputs; exact deliberate verifier pins; three new foundation browser checks; the Corridor and required-battery workflows; and four handoff documents. The complete list is `git diff --name-only 2ba2967f36b9ee80030ebb088e2c75cc6503c138..53a7b934734807189bd6e3295413a758038bf093`.

Committed handoff: `docs/redesign/BASELINE.md`, `AFTER.md`, `FOUNDATION.md`, `VERIFIER_CHANGES.md`. Runtime logs/reports/screenshots remain under `~/.dharma/` only. The requested existing shared worktree is clean and retained for the active redesign handoff. A read-only cwd inventory found other live Codex/MCP processes using it; removing the shared checkout would disrupt their ongoing work. Cleanup is deferred to the redesign lead when those consumers and the broader task end; no branch refs were deleted. Canonical `vision/VISION.md` was still absent at the latest check; the full verbatim direction and SURFACE map were read and the brief explicitly permits this lane to proceed until VISION exists.
