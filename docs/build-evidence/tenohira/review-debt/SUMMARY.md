# Battery run — claude/bunki-kairo-pr76-review-qa1qnh @ ff0cf456c65c42b5f78e4ddb43f180d57a47a4de

| gate | exit | note |
| --- | --- | --- |
| format-check | 0 | All matched files use Prettier code style! |
| lint | 0 |  |
| typecheck | 0 |  |
| vitest | 0 |  |
| corridor | 0 | report → /home/user/Bunki-app/docs/prototype/verification-report.json |
| corridor-a11y | 0 | report → /home/user/Bunki-app/docs/build-evidence/kairo-a05-accessibility/verification-report.json |
| writing-room | 0 | 51/51 checks passed |
| storage-integ | 0 | } |
| drift-fast | 0 | shots  → /home/user/Bunki-app/docs/audits/drift-consistency-shots |
| corridor-ai | 0 | 30/30 checks passed |
| native-readings | 0 | report → /home/user/Bunki-app/docs/build-evidence/kairo-feel-lock/native-readings/browser-verifica |
| replay | 0 |  |
| export | 0 |  |
| e2e-build | 0 | Exported: dist |
| e2e | 0 |   44 passed (1.1m) |
| corpus-pytest | 0 | 185 passed, 2 skipped, 29 deselected in 7.73s |

Completed: 2026-08-25T17:36:03Z

---

## Addendum — battery on the merged head (main #85 merged in)

# Battery run — claude/bunki-kairo-pr76-review-qa1qnh @ c3b24eb2d75df51490a40c2f019cb87c0e013f70

| gate | exit | note |
| --- | --- | --- |
| format-check | 0 | All matched files use Prettier code style! |
| lint | 0 |  |
| typecheck | 0 |  |
| vitest | 0 |  |
| corridor | 2 | } |
| corridor-a11y | 0 | report → /home/user/Bunki-app/docs/build-evidence/kairo-a05-accessibility/verification-report.json |
| writing-room | 0 | 51/51 checks passed |
| storage-integ | 0 | } |
| drift-fast | 0 | shots  → /home/user/Bunki-app/docs/audits/drift-consistency-shots |
| corridor-ai | 0 | 30/30 checks passed |
| native-readings | 1 | report → /home/user/Bunki-app/docs/build-evidence/kairo-feel-lock/native-readings/browser-verifica |
| replay | 0 |  |
| export | 0 |  |
| e2e-build | 0 | Exported: dist |
| e2e | 0 |   44 passed (1.5m) |
| corpus-pytest | 0 | 185 passed, 2 skipped, 29 deselected in 9.77s |

Completed: 2026-08-28T19:45:41Z

**Two gates exited non-zero and both were crash-shaped races, re-proven
green standalone on the same head, per the PR 一 addendum pattern:**

- `corridor` (exit 2): the known `open()` double-navigation race — the
  run died at R3-D on "Navigation … is interrupted by another navigation
  to" the same URL. Standalone re-run: **exit 0**, full suite green.
- `native-readings` (exit 1): a Playwright DOM-detach race in `touchAt`
  ("Element is not attached to the DOM") after 15/16 browser checks had
  passed — plausibly timing shifted by #85's live-session re-renders,
  but not reproducible. Standalone re-run: **exit 0**, full suite green.

No probe convicted the merge; every conviction-capable check that ran
passed in both the battery and the re-proofs. The original ff0cf456
receipt above stands unedited.
