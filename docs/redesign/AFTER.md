# Foundation after — 2026-10-08

F1→F6 changes are on `claude/redesign-20261008`, based on `claude/final-integration-20261007` (`2ba2967f`). The PR remains draft; merging and deployment are outside this task.

Final app artifact was built from clean source `f9ba18a301952cfc401c63a01917fd97f352a319`:
`047b1eca17c4107bb8fc10b48c7eceb3695d8bc38b4de0ab66368454b1673307`.

Site: `~/.dharma/bunki_review/2026-10-08/redesign/sol/final-v9-site`. The subsequent capture-timing and connected-header test changes alter verification tools only. Logs/receipts for the complete F1 rerun are in `sol/after-v9`; the standalone dojo retry is in `sol/final-v9-dojo-retry`.

| Verifier | Baseline | After |
| --- | --- | --- |
| `verify-corridor` | PASS | PASS |
| `verify-corridor-storage-integrity` | PASS | PASS |
| `verify-corridor-doors` | FAIL | FAIL |
| `verify-dojo-door` | PASS | PASS (retry) |
| `test-navigation-returns` | PASS | PASS |
| `verify-design-reader-shelf` | PASS | PASS |
| `verify-relief` | FAIL | PASS |
| `verify-theme-consistency` | FAIL | PASS |
| `verify-corridor-accessibility` | PASS | PASS |
| `verify-experience` | PASS | PASS |
| `verify-kotoba-mine` | PASS | PASS |
| `verify-n2n1-decks` | PASS | PASS |
| `verify-personal-collections` | PASS | PASS |
| `sw-shell` | PASS | PASS |

**13 of 14 pass**, compared with 11 of 14 before implementation. The first parallel dojo attempt aborted a navigation (`page.goto: net::ERR_ABORTED`); rerunning the identical suite against the same artifact passed all 30 room/width journeys. Its original failed log is preserved.

`verify-corridor-doors` retains its inherited T13/T14 fixture failure. The fixture intercepts `/data/mock/n1-02.json` (and n1-03/n1-04) while the app requests `/data/mock/sets/<id>.json`; the failure injection misses the request, and the walk later attempts the hidden dojo control during an attempt. Baseline failed at the same point. F6 permits deliberate language/selector updates, so those fault-injection URLs and behavior assertions are unchanged. The translated T10 status/negative-control and T11 exact question counters now pass. This draft does not claim that verifier is green.

## Additional acceptance and visual evidence

- Corridor: **259/259** checks.
- Reader/shelf: **74/74** checks across Chromium/WebKit, including the complete first sentence on the initial 390px screen, actual popup taps, list creation, membership removal retaining the card, and version switching.
- Storage: **26/26** schema/policy checks. Service-worker shell: **7/7** tests.
- Guided session: **422/422** checks, including preserved exact ready-card counts, answer/card records, return focus and axe checks.
- New public navigation acceptance: **12/12** journeys (Chromium/WebKit × 320/390/768px × EN/JA). It exercises every primary tab, settings Back, retained shelf links, real dictionary sheets, private locale/Me returns, 44px targets, no horizontal scroll and reader dock separation. Selecting a word must preserve the connected header height; the test reads the current node atomically after rendering, rather than a detached 0px locator handle.
- Full rendered language tour: **230 EN/JA states**, **11,726 EN chrome inspections**, zero language leaks, renderer errors, room-stamp errors or shell violations against V9. Exact learned-content values and named marks/providers are narrowly exempted; remaining labels and aria remain checked.
- Probe grades: **48** actual button labels across 12 theme states × EN/JA, minimum **11.118:1** contrast against the dock, all centers receive the intended button hit.
- Token bridge: 96 baseline palette/view/width comparisons unchanged; role overrides propagate and 301 consumed variables resolve. Later relief and world-paper repairs are intentionally separate from that compatibility mapping.
- Read-only hard-rule audit: protected storage block and **117** storage/record declarations exact; eight protected engine/FSRS/drift files exact; card/storage prefixes unchanged; forbidden source decks untouched. **1,565** translation calls have no missing/null English argument. Receipt: `sol/final-v9-readonly-audit-receipt.json`.
- `npm run lint`, JavaScript syntax checks and `git diff --check` pass.

The 390×844 room gallery and all deep states are retained under `sol/final-v9-language-settled/ui-language/index.html`, with adjacent PNGs, `report.json` and `artifact-identity.json`. Capture waits for bundled fonts and the finite grade entrance to finish. Sol's independent review is recorded externally before draft delivery. CI uploads the same complete EN/JA tour and shell evidence as **bunki-redesign-foundation-EN-JA-390x844**, with 14-day retention; the draft PR links the downloadable artifact.

## Handoff

[FOUNDATION.md](FOUNDATION.md) documents token roles/aliases, language helpers, the single tab table, stable rooms versus stage materials, docking and exact check commands. [VERIFIER_CHANGES.md](VERIFIER_CHANGES.md) itemizes every deliberate assertion update. No behavioral storage/SRS/ledger/offline/zero-leak/hit-size/contrast assertion was removed or relaxed. The shipping gate result and PR/CI links are recorded in the external `briefs/SOL_REPORT.md`.
