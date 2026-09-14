# SKIP lookup verification

## Scope

The canonical Corridor app, not the historical Expo or Sites donor surfaces.
No frozen specifications, learning ledger, scheduler, or quiet writing-room
controls are changed.

## Verification inventory

- Typed SKIP lookup: exact code, normalized full-width input, partial code,
  wildcard, invalid pattern, invalid solid subtype, and ordinary word search.
- Wheel: four columns, touch/mouse scrolling, click selection, keyboard arrows
  and endpoints, selected row alignment, pattern-dependent labels and ranges.
- Results: canonical-first matching, explicit alternate classification labels,
  optional radical filtering, empty state, pagination, and full data coverage.
- Navigation: result to existing kanji detail, code back to lookup, dismissal
  returns to query and focused result, no review debt from lookup.
- Guidance: all four patterns, all solid subtypes and their precedence,
  division/stroke-count guidance, attribution and linked licensing.
- Failure paths: unavailable sidecar and retry, malformed input, rapid edits
  while data loads, switching from partitioned to solid with an invalid count.
- Packaging: served app, service worker cache, standalone builder, Pages asset
  list, deterministic source build, and unchanged legacy stripped corpus.
- Visual checks: mobile 390px, narrow 320px, desktop 1280px, light/dark worlds,
  long result sets, opened rules, keyboard focus, and reduced motion.

## Results

Verified on 2026-09-14 against local base `124f08b3` with the SKIP feature
changes. These are local execution results, not a claim of remote CI completion.

| Gate | Result |
| --- | --- |
| Engine tests with pinned source archive | 19 passed, zero failures/skips |
| Exhaustive matching | 10,383 canonical and 939 alternate memberships, 982 query/mode combinations |
| Raw data reproducibility | Byte-identical rebuild and all raw SKIP field/category parity |
| Browser regression | 41 checks passed in real Chromium |
| Packaging | 3 tests passed: script order, service-worker install assets, standalone/Pages inclusion |
| Standalone browser | Real grid and four wheels with all subresource network requests blocked; zero runtime exceptions |
| Writing-room clock regression | Two first-splat callbacks verified |
| JavaScript syntax and whitespace | `node --check` and `git diff --check` passed |
| Frozen specs, legacy corpus and base kanji catalog | No diff |

The browser run exercised exact/partial/wildcard/fullwidth input, invalid
pattern/subtype syntax, ordinary English search, all wheel selections,
keyboard endpoints, clicking and mouse-wheel scrolling, radical 64 including
the visible 扌 variant, pagination, labeled alternates, query/focus restoration,
nested entry lookup, and a saved out-of-catalog entry reopened after cold reload.
An intercepted initial HTTP 503 was recovered with the visible retry control.
Normal-flow console and runtime error lists were empty.

Visual evidence covers the actual `1-3-8` plus hand-radical combination at
320px, 390px, and 1280px widths, a dark world, and reduced motion. No horizontal
overflow or selected-row misalignment was found in those checks. The page is
intentionally scrollable on short phone viewports; the kanji grid has its own
scroll region and an explicit show-more control.

Included receipts:

- `browser-results.json`: all 41 checks and honest exclusions.
- `core-tests.tap`: full 19-test raw-archive run.
- `mobile-skip.png`: final tall-mobile screenshot of the reference combination.
- `dark-skip.png`: dark-world lookup with alternates enabled.

Repeat the checks from the repository root:

```sh
node prototypes/corridor/tools/test-skip-core.mjs --archive /path/to/pinned.zip
node prototypes/corridor/tools/test-skip-packaging.mjs
node prototypes/corridor/tools/verify-skip-ui.mjs --shots /tmp/bunki-skip-qa
node prototypes/corridor/tools/verify-skip-standalone.mjs
node prototypes/corridor/tools/verify-writing-room-clock.mjs
```

The browser tools require the existing `playwright-core` dependency and its
Chromium installation, or `CHROMIUM_PATH`. The new PR workflow runs the
dependency-free engine/packaging checks and builds the standalone. It does not
claim to run the browser battery.

## Limits and delivery state

- Physical iOS Safari inertia and VoiceOver were not tested. Chromium touch
  emulation does not prove behavior on a physical iPhone.
- The full ten-theme matrix, full repository test suite, and native Expo app
  were not run; the canonical Corridor is the implementation scope.
- Service-worker asset installation is tested in isolation. A real installed
  PWA update/offline cycle has not been exercised on a device. The standalone
  offline lookup was tested in a browser with network blocked.
- One invalid canonical source code and three invalid alternate codes remain
  preserved but excluded from matching; they are not silently repaired.
- The private preview deployment tool twice reported `index.html` missing even
  though it exists and was served successfully to Chromium. No hosted preview
  was created.
- GitHub push/PR requires operator approval. Local implementation and tests do
  not imply a merge, remote CI pass, or live Pages release.
