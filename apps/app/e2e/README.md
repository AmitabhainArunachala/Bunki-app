# `apps/app/e2e` — the web end-to-end suites

Everything here runs against **`apps/app/dist`**: the real output of
`expo export --platform web`. Nothing in this directory builds, bundles,
transpiles or stubs the app. That is the whole point — the definition of done's
first comes-up-short item is "tests pass but the app doesn't", and a harness
that reconstructed the app would put it straight back.

## Running it

```bash
npm ci                  # in your own worktree, before trusting any result
npm run test:e2e:build  # expo export --platform web → apps/app/dist
npm run test:e2e        # playwright, one config, every lane's specs
```

`test:e2e` fails with the build command in the message if `dist` is missing. It
never builds for you: "the E2E passed" has to be unambiguous about _which_
bundle passed.

## What is here

| File                           | Lane  | Covers                                                                                                                                             |
| ------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adv-offline-storm.spec.ts`    | T3    | T-10 — the whole loop with every off-origin request severed, and the assertion that the bundle attempts no network at all                          |
| `adv-ai-timeout-storm.spec.ts` | T3    | T-11 — a genuine 10 s runtime timeout, driven through the shipped code, that neither blocks nor loses a capture                                    |
| `adv-restart-storm.spec.ts`    | T3    | T-16 at the web runtime — twelve reload cycles, five force-quit cycles, a kill on the acknowledgment                                               |
| `adv-a11y-audit.spec.ts`       | T4    | axe WCAG A/AA on every route in light and dark, focus order and visibility, touch targets, accessible names, ruby read once                        |
| `adv-claim-audit.spec.ts`      | T4    | REQ-GATE-03 forbidden-claim grep over the shipped bundle; seed disclosure and AI-candidate labels wherever generated or unreviewed content renders |
| `adv-known-defects.spec.ts`    | T3/T4 | the defects these lanes found, asserted as the behaviour that _ought_ to hold, annotated `test.fail()`                                             |
| `support/adv-harness.ts`       | —     | static host over `dist`, app drivers, storage readers, the two hostile-network fixtures                                                            |

## Two conventions worth knowing before you edit

**`visibleTestId`, not `getByTestId`.** Navigating leaves the previous screen
mounted (finding T3-2), so a plain test id can resolve to a stack of same-id
nodes with exactly one on screen. The helper filters to the visible one. `.first()`
is wrong here — it sometimes picks a hidden ancestor screen and asserts against a
stale render.

**`test.fail()` for known defects, never a weakened assertion.** A defect this
lane finds is written down as the _correct_ expectation and annotated. Playwright
fails a test that was expected to fail and then passed, so fixing the defect turns
CI red and forces the annotation to be deleted in the same change. Rewriting the
assertion to match the broken behaviour would be controller §18a predicate
erosion; this is the opposite of it.

## Scope, stated rather than implied

Chromium, one engine, on Expo Web. The accessibility results are automated rules
only — no screen reader ran, no human tested it, no mobile browser was involved.
The restart storms are **not** the controller §13 native kill test; that is
WP-11's, on a device, and nothing here is evidence for it.
