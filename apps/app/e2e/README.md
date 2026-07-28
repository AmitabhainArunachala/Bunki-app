# `apps/app/e2e` — the web end-to-end suite (WP-10)

LICENSE: pending operator decision (controller §4).

Everything here runs against **`apps/app/dist`**: the real output of
`expo export --platform web`. Nothing in this directory builds, bundles,
transpiles or stubs the app. That is the whole point — the definition of done's
first comes-up-short item is "tests pass but the app doesn't", and a harness
that reconstructed the app would put it straight back.

## Running it

```bash
npm ci                   # in your own worktree, before trusting any result
npm run test:e2e:build   # expo export --platform web  →  apps/app/dist
npm run test:e2e         # playwright, one config, every lane's specs
```

The build step is separate on purpose. Nothing in the test run rebuilds the
bundle, so "the E2E passed" is never ambiguous about which bundle passed; if
`apps/app/dist` is missing, the harness fails with that exact command in the
message rather than skipping.

## One harness, three lanes

The T-17 closed-loop lane and the two adversarial lanes were built on separate
branches and each grew its own Playwright harness. The WP-10 closeout reconciled
them: **one `playwright.config.ts`, one `npm run test:e2e`, one CI job.** Every
spec below is discovered by `testMatch: '**/*.spec.ts'`, so all three lanes fail
the same pull request. There is deliberately no per-lane config and no matrix
over lanes — a lane that can go red on its own is a lane that can be ignored on
its own.

Two support modules survive the reconciliation, because they are genuinely two
different drivers rather than two spellings of one:

- `support/export-server.ts` + `support/app.ts` — the closed-loop lane's static
  host and click-level driver.
- `support/adv-harness.ts` — the adversarial lanes' host, storage readers, the
  two hostile-network fixtures, and `preinstalledChromium()` (which the shared
  config calls).

Both bind an ephemeral loopback port, so any number of Playwright workers can
hold one at once and neither lane can collide with the other.

## What is in here

| File                           | Lane  | Test                | Asserts                                                                                                                                                                                                                                                                        |
| ------------------------------ | ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `closed-loop.spec.ts`          | E2E   | **T-17**            | the whole REQ-PH-01 loop, walked by clicking: capture → durable thread (reload) → bounded AI candidate → explicit promotion → retrieval contract → scored review → contextual reuse in the canvas → finite session end → reload → inspect the chain → export → replay equality |
| `candidate-label.spec.ts`      | E2E   | **T-12** (E2E half) | generated text never reaches the DOM without its label, visually and structurally, before and after acceptance                                                                                                                                                                 |
| `finite-session.spec.ts`       | E2E   | **T-13** (E2E half) | the plan is the same size after every interaction as it was when composed, and the sitting reaches an explicit `SessionClosed` state (one of the three; _which_ of the three is pinned by `adv-known-defects.spec.ts` T3-1)                                                    |
| `adv-offline-storm.spec.ts`    | T3    | **T-10**            | the whole loop with every off-origin request severed, and the assertion that the bundle attempts no network at all                                                                                                                                                             |
| `adv-ai-timeout-storm.spec.ts` | T3    | **T-11**            | a genuine 10 s runtime timeout, driven through the shipped code, that neither blocks nor loses a capture                                                                                                                                                                       |
| `adv-restart-storm.spec.ts`    | T3    | **T-16-web**        | twelve reload cycles, five force-quit cycles, a kill on the acknowledgment                                                                                                                                                                                                     |
| `adv-a11y-audit.spec.ts`       | T4    | —                   | axe WCAG A/AA on every route in light and dark, focus order and visibility, touch targets, accessible names, ruby read once, and a distinct non-empty document title per route (WCAG 2.4.2)                                                                                    |
| `adv-claim-audit.spec.ts`      | T4    | —                   | REQ-GATE-03 forbidden-claim grep over the shipped bundle; seed disclosure and AI-candidate labels wherever generated or unreviewed content renders                                                                                                                             |
| `adv-known-defects.spec.ts`    | T3/T4 | —                   | the defects these lanes found, asserted as the behaviour that _ought_ to hold: annotated `test.fail()` while open, kept as regression pins once fixed — including the bounded mounted-screen count (T3-2) and `completed` reaching the end screen (T3-1)                       |
| `support/*`                    | —     | —                   | the two drivers described above                                                                                                                                                                                                                                                |

T-12's and T-13's other halves are unit tests owned by WP-07 and WP-08
(`apps/app/test/candidate-labeling.test.ts`,
`packages/domain/test/session-*.test.ts`). Those prove the rules; these prove the
page.

## Rules this suite holds itself to

**Everything is a click.** No spec seeds a store, patches a global, sets a debug
flag that changes behaviour, or navigates to a URL a learner could not reach from
the screen they are on. The `?lag=` / `?fail=1` evidence flags exist and are
deliberately unused here: they are for photographing states, and a loop that
needed them would not be the loop.

**One read goes past the surface.** `AppDriver.persistedEventTypes()` reads the
web adapter's `localStorage` snapshot. Durability and losslessness are claims
about bytes, and a suite that only ever asked the screen would be proving that
the screen is willing to say so. It is a read; nothing here writes storage.

**No retries.** `retries: 0` in the config. A retry turns a flake into a pass,
and for the test the whole phase is judged by, the flake _is_ the finding.

**`visibleTestId`, not `getByTestId`.** Navigating can leave a previous screen
mounted, collapsed and `aria-hidden`, so a plain test id can resolve to a stack
of same-id nodes with exactly one on screen. Both drivers filter to the visible
one (`live()` in `support/app.ts`, `visibleTestId` in `support/adv-harness.ts`).
`.first()` is wrong here — it sometimes picks a hidden ancestor screen and
asserts against a stale render.

As of the WP-10 closeout the nav shell uses `router.replace`, so switching
between its four destinations unmounts the screen you left instead of stacking
it (`adv-known-defects.spec.ts` T3-2 pins the bound). The helpers stay, and are
still the right default: every other link in the app pushes, because those are
genuine stack moves — a word page opened from a search comes back to that
search, and the search screen is still mounted underneath it.

**`test.fail()` for known defects, never a weakened assertion.** A defect these
lanes find is written down as the _correct_ expectation and annotated. Playwright
fails a test that was expected to fail and then passed, so fixing the defect
turns CI red and forces the annotation to be deleted in the same change.
Rewriting the assertion to match the broken behaviour would be controller §18a
predicate erosion; this is the opposite of it.

## What this suite does not establish

- **Native anything.** This is the provisional web adapter (`web-provisional`).
  T-16-native, the capture-loss trial and the §13 device latencies are WP-11's,
  and no result here may be reported as a native one (P0-CAP-15). The restart
  storms are **not** the controller §13 native kill test.
- **A live AI call.** The web bundle holds no API key by construction, so every
  candidate here takes the labelled `offline-fallback` route. T-12 asserts the
  labelling; nobody should read a green run as live-call evidence (OD-08 is
  still open).
- **Accessibility beyond automated rules.** Chromium, one engine, on Expo Web.
  No screen reader ran, no human tested it, no mobile browser was involved.
- **The session plan.** The sitting's _observations_ are exportable since the
  WP-10 export lane closed COORD-B8-2, and `closed-loop.spec.ts` steps 9–11
  assert it out of the browser's own storage. The plan is not: which steps were
  composed and how far the cursor got stay on the device, because a plan is a
  proposal rather than a record of what the learner did. No run here may be read
  as evidence about the plan surviving anything.
