# Foundation after — 2026-10-08

F1–F6 are implemented on `claude/redesign-20261008`, based on `claude/final-integration-20261007` (`2ba2967f`). Draft PR: [#126](https://github.com/AmitabhainArunachala/Bunki-app/pull/126).

The final app was built from clean source `ca9904aa561f7bfef4a59dc5f9f99b76db076255`, artifact `b6f63f2b1b8d3b4297ddd0bef828e73b2a953a45fbb8a7f7175235804bb04c0a`, in `sol/final-v15-site` under the external redesign evidence root. Later verifier/document changes preserve app bytes.

## Baseline → after

| Verifier                            | Baseline | After |
| ----------------------------------- | -------- | ----- |
| `verify-corridor`                   | PASS     | PASS  |
| `verify-corridor-storage-integrity` | PASS     | PASS  |
| `verify-corridor-doors`             | FAIL     | FAIL  |
| `verify-dojo-door`                  | PASS     | PASS  |
| `test-navigation-returns`           | PASS     | PASS  |
| `verify-design-reader-shelf`        | PASS     | PASS  |
| `verify-relief`                     | FAIL     | PASS  |
| `verify-theme-consistency`          | FAIL     | PASS  |
| `verify-corridor-accessibility`     | PASS     | PASS  |
| `verify-experience`                 | PASS     | PASS  |
| `verify-kotoba-mine`                | PASS     | PASS  |
| `verify-n2n1-decks`                 | PASS     | PASS  |
| `verify-personal-collections`       | PASS     | PASS  |
| `sw-shell`                          | PASS     | PASS  |

**13/14 pass, versus 11/14 baseline.** The complete F1 rerun is retained in `sol/after-v12/results.json`. It passed 12/14, exposing a new report-button collision with a deck dictionary sheet's Close control. The code fix reserves the original report strip in all sheet/modal layers; focused final reruns passed Kotoba **152/152** and reader/shelf **74/74** in `sol/final-v14-kotoba` and `sol/final-v14-reader`. The last app change adds tablet grade-bar padding to expose the tip's existing 44px touch area; final V15 navigation and dock tests cover that change. This table is the consolidated result of the full rerun and subsequent focused checks, rather than a claim that every process was repeated on V15. Failed intermediate receipts remain available.

The sole remaining F1 failure is inherited `verify-corridor-doors` T13/T14. The fixture intercepts `/data/mock/n1-02.json` (and n1-03/n1-04), while the app requests `/data/mock/sets/<id>.json`; injection misses, then the walk tries the attempt-hidden dojo control. Baseline failed at the same point. Its fault URLs and behavioral assertions are unchanged under the brief's restriction to intentional label/selector updates. Translated T10 status/negative control and T11 exact question counters pass.

## Final acceptance and screenshots

- Final V15 language tour: **230 EN/JA states at 390×844**, **11,729 English chrome inspections**, zero language leaks, renderer errors, room-stamp errors or shell violations. Gallery: `sol/final-v15-gallery/ui-language/index.html`, with all PNGs, report and artifact identity alongside.
- Final V15 navigation: **12/12** Chromium/WebKit × 320/390/768px × EN/JA journeys, zero overflow diagnostics.
- Final V15 dock regressions: **24/24** cases, **216** control samples, **1,080/1,080** actual pointer points owned, zero report overlaps/page errors, and **52** screenshots. All 16 immediate import-preview samples retain a visible nonempty status and unobstructed buttons. Four tablet cases preserve the 32px tip glyph while verifying its effective 44px native touch extent, actual dismissal and the N2 player's exact two-choice grade census. The 20 prior case paths/assertions are unchanged. Receipt `sol/final-v15-docks-v2/redesign-docks.json` binds verifier SHA `0121e5350823b8ef1117b359841655a31f8188f62d4f97be8fc7a5061d24fde2`.
- Final V15 visual follow-ups: tablet native-hit/sheet-close **4/4**, and native shelf-to-reader attribution checks **8/8** across both browsers/languages at 320/390px. The inherited long license URL now wraps; text, href and article bytes are exact.
- Earlier supplemental coverage retains its provenance: V12 reader-list popovers **12/12** real Create/Add hits, card retention and Escape return; real DejaVu 320px EN/JA **2/2**, document width 320 and full Tools targets; written original-heading lookup **2/2**, one Tab stop. Full written and practice-history suites passed **20** cases each, including the exact CI server-disconnected offline mode.
- Whole corridor **259/259**, storage **26/26**, service-worker shell **7/7**, guided **422/422**. Deck/player units **215/215**. Probe labels: **48** across 12 theme states × EN/JA, minimum **11.118:1** contrast and real center hits.
- All nine dictionary/listening/tutor/writing follow-ups pass, including 16 sentence-draft cases and both standalone formats. Mock **25/25**, reference connections **20/20**, Kagami **32/32**, reference **53/53**, native readings **58/58**, journey **13** stations and private import **12** stages per engine pass.

Sol independently inspected all 32 core rooms in both languages plus six deck families, private study/answer, active probe and JLPT confirmation: **86** shots across eight final contact sheets, and raw repaired scenes. The separate visual lane reviews all **230** final images. Reviews concern this foundation; visual concept selection and physical-device acceptance remain separate work.

## Source and delivery boundaries

The token bridge preserves 96 baseline theme/view/width combinations, propagates role overrides and resolves 301 consumed variables. Separate relief, world-paper, navigation and docking repairs are intentional.

Read-only audits preserve the storage block and **117** storage/record declarations exactly, eight protected engine/FSRS/drift files, card/key prefixes and forbidden source decks. **1,565** language-helper calls have no missing/null English argument. Four regenerated Kotoba study HTML exports have exact embedded learning decks/glossaries and unchanged frozen card IDs. Receipts are external under `sol/final-v15-*` and `sol/ci-study-pages`.

Repository ESLint, the release battery's complete authored Corridor ESLint command, scoped formatting, syntax and diff checks pass. Full `npm run format:check` retains two unchanged baseline failures: `decks/n2n1/BATON_CODEX_2026-10-07.md` and protected `decks/n2n1/source/rewrite-queue.json`. Neither file nor formatting exclusions were changed.

The initial CI run exposed Linux shelf-font overflow, stale intentional chrome pins and stale standalone HTML exports. Those were fixed in code or by exact label assertions, with every verifier change itemized in [VERIFIER_CHANGES.md](VERIFIER_CHANGES.md). The first complete Linux language gallery already passed all 230 states; final CI will upload the candidate gallery and new dock evidence as **bunki-redesign-foundation-EN-JA-390x844** (14-day retention). The concrete latest artifact link, CI conclusions and terminal no-mistakes result are maintained in the external `briefs/SOL_REPORT.md` and draft PR.

[FOUNDATION.md](FOUNDATION.md) documents tokens, the language law, the single tab table, stable room identity and actual dock clearance. No storage/SRS/ledger/offline/zero-leak/hit-size/contrast assertion was removed or relaxed.
