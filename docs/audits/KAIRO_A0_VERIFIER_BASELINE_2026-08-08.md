# KAIRO A0 verifier baseline — 2026-08-08

This is the failing-case receipt for the Drift consistency verifier repair.
It was captured in the isolated worktree
`bunki-kairo-a0-verifier-20260808` at immutable integration base
`e8be255e1ea13a350759198f3e85caf0e239560d`.

## Environment

- macOS, 390 × 844 mobile context, DPR 2
- Node `v22.14.0`
- pinned root dependencies installed with `npm ci`
- real local Chrome at
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

## Command

```sh
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node prototypes/corridor/tools/verify-drift-consistency.mjs
```

## Observed result

Exit status: `1`.

```text
 FAIL tide · the slider answers the finger and the field obeys the stop — hot=true width=36px, N1 share 100% of 64
ReferenceError: Cannot access 'cases' before initialization
    at prototypes/corridor/tools/verify-drift-consistency.mjs:137:5
```

The 36 px tide result is a product violation. The subsequent
temporal-dead-zone crash is an instrument violation: `cases` was declared
after the tide probe, so a red tide result prevented the remaining matrix,
JSON receipt, cleanup path, and explicit pass/fail decision from running.

The first run in this fresh worktree failed earlier because dependencies were
not installed (`ERR_MODULE_NOT_FOUND: playwright-core`). That setup failure is
kept distinct from the product/instrument result above and was resolved only by
the pinned `npm ci`; it is not counted as Drift evidence.
