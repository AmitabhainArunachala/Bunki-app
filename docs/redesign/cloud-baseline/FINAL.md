# Final verification of the integrated redesign (cloud, 2026-10-08 ~09:40–10:40 UTC)

Head `d4cfac23`: Skin + six room lanes + polish + three fix lanes + the door fix. The build came from a clean committed tree; the run was Chromium only, because this container has no WebKit. The commands are in `RESULTS.md`.

| Verifier | Morning baseline (Mac → cloud) | Final, cloud | Final, GitHub CI on the same head |
|---|---|---|---|
| verify-corridor | PASS → PASS (flaky here) | **PASS 259/259** | **PASS** (whole-corridor walk) |
| verify-corridor-storage-integrity | PASS | **PASS** | in battery |
| verify-corridor-doors | FAIL (T13/T14 inherited) | FAIL, same T13 inherited failure | — |
| verify-dojo-door | PASS | **PASS** | — |
| test-navigation-returns | PASS | **PASS** | — |
| verify-design-reader-shelf | PASS | **PASS** | — |
| verify-relief | FAIL → PASS | **PASS** | — |
| verify-theme-consistency | FAIL → PASS | **PASS** | — |
| verify-corridor-accessibility | PASS | **PASS 53/53** | — |
| verify-experience | PASS | **PASS** | — |
| verify-kotoba-mine | PASS | 1 local miss ("the sheet then says where the word went": the DOM is read the instant the record lands; container timing) | **PASS** (言葉の鉱脈 decks job) |
| verify-n2n1-decks | PASS (flaky here: 503 prefetch race) | the same 503 prefetch race | **PASS** (decks job) |
| verify-personal-collections | PASS | **PASS** | **PASS** (Chromium + WebKit) |
| verify-srs-today | — | **PASS 32/32**, 2/2 mutants caught | — |
| sw-shell (vitest) | PASS 7/7 | **PASS 8/8** (adds the room-stylesheet test) | — |
| lint-ui-language --core-only | PASS | **PASS, 0 issues** (83 visits, about 10k inspections) | **PASS** (full 230-state tour, EN + JA) |
| verify-redesign-foundation | — | **PASS** | **PASS** |
| verify-redesign-docks | — | Chromium 12/12 (in the lanes) | **PASS** (Chromium + WebKit) |

The complete required battery on GitHub fails only `format-check`, on protected Astra content under `decks/n2n1/`. That is inherited, and those files must not be edited. `lint` now passes.

Every verifier edit is a selector, timing or label change, and each is logged in `../VERIFIER_CHANGES.md`. No behavioural assertion was weakened.
