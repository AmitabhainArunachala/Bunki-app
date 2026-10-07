# Foundation baseline — 2026-10-08

F1 ran before implementation against clean commit `2ba2967f36b9ee80030ebb088e2c75cc6503c138` on `claude/redesign-20261008`.

Built artifact: `52153e67e0469cf1ec401b0352da34f8f7922c3b4ba348ee0ab3a330d3e8c2fd`.

Site: `/Users/dhyana/.dharma/bunki_review/2026-10-08/redesign/sol/baseline-site`. Full logs, receipts and screenshots: `/Users/dhyana/.dharma/bunki_review/2026-10-08/redesign/sol/baseline`.

The brief names `verify-navigation-returns.mjs`; this checkout provides `test-navigation-returns.mjs`, which executes the actual navigation functions (four cases). That existing suite was used.

| Verifier                            | Baseline | Duration |
| ----------------------------------- | -------- | -------- |
| `verify-corridor`                   | PASS     | 210.8s   |
| `verify-corridor-storage-integrity` | PASS     | 0.5s     |
| `verify-corridor-doors`             | FAIL     | 65.6s    |
| `verify-dojo-door`                  | PASS     | 79.5s    |
| `test-navigation-returns`           | PASS     | 0.1s     |
| `verify-design-reader-shelf`        | PASS     | 184.8s   |
| `verify-relief`                     | FAIL     | 3.3s     |
| `verify-theme-consistency`          | FAIL     | 51.4s    |
| `verify-corridor-accessibility`     | PASS     | 28.5s    |
| `verify-experience`                 | PASS     | 118.8s   |
| `verify-kotoba-mine`                | PASS     | 66.1s    |
| `verify-n2n1-decks`                 | PASS     | 19.8s    |
| `verify-personal-collections`       | PASS     | 11.8s    |
| `sw-shell`                          | PASS     | 0.8s     |

11 of 14 verifier processes passed. Three failed before any foundation edits:

- **corridor doors:** T13 failed-set status assertions for earlier JLPT sets failed; the walk then timed out trying to use the hidden `#chrome-dojo` while an attempt material was active. Existing retry behavior assertions still passed.
- **relief:** 13 computed-style deficits: zero borders/shadows on shelf room doors, search and SKIP panels, study doors, listen row and reader body; missing shelf eyebrow accent rule.
- **theme consistency:** six day worlds painted `.sheet` pure white outside their own ground palette. Night worlds passed this assertion.

The storage suite passed all 26 schema/policy checks, the navigation-return suite passed all four cases, and `tools/sw-shell.test.mjs` passed all seven tests. Browser coverage includes the existing Chromium/WebKit runs where supported by each verifier.

F6 reran this exact subset; [AFTER.md](AFTER.md) records the final results. Label/selector changes to verifiers must be itemized in `VERIFIER_CHANGES.md`; behavioral assertions remain intact.
