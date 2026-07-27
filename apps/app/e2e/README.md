# `apps/app/e2e` — the web end-to-end suite (WP-10)

LICENSE: pending operator decision (controller §4).

## Running it

```bash
npm ci
npm run test:e2e:build   # expo export --platform web  →  apps/app/dist
npm run test:e2e         # Playwright, against those exported bytes
```

The build step is separate on purpose. Nothing in the test run rebuilds the
bundle, so "the E2E passed" is never ambiguous about which bundle passed; if
`apps/app/dist` is missing, the harness fails with that exact command in the
message rather than skipping.

## What is in here

| File                       | Test                | Asserts                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `closed-loop.spec.ts`      | **T-17**            | the whole REQ-PH-01 loop, walked by clicking: capture → durable thread (reload) → bounded AI candidate → explicit promotion → retrieval contract → scored review → contextual reuse in the canvas → finite session end → reload → inspect the chain → export → replay equality |
| `candidate-label.spec.ts`  | **T-12** (E2E half) | generated text never reaches the DOM without its label, visually and structurally, before and after acceptance                                                                                                                                                                 |
| `finite-session.spec.ts`   | **T-13** (E2E half) | the plan is the same size after every interaction as it was when composed, and the sitting reaches an explicit `SessionClosed` state                                                                                                                                           |
| `support/export-server.ts` | —                   | a static host over the export, with the route mapping a real static host would be configured with                                                                                                                                                                              |
| `support/app.ts`           | —                   | the fixtures and the click-level driver                                                                                                                                                                                                                                        |

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

**Stacked screens are handled once.** `expo-router` keeps the screen you came
from mounted, collapsed and `aria-hidden`. Every lookup goes through `live()`,
which takes the last element that actually occupies space — so a spec cannot
accidentally assert against the screen the learner already left.

## What this suite does not establish

- **Native anything.** This is the provisional web adapter (`web-provisional`).
  T-16-native, the capture-loss trial and the §13 device latencies are WP-11's,
  and no result here may be reported as a native one (P0-CAP-15).
- **A live AI call.** The web bundle holds no API key by construction, so every
  candidate here takes the labelled `offline-fallback` route. T-12 asserts the
  labelling; nobody should read a green run as live-call evidence (OD-08 is
  still open).
- **Accessibility.** The §17.5 axe scan and the §17.2 adversarial matrix are the
  T-lanes' work. They add specs to this directory and the CI job picks them up
  without further wiring.
- **That the sitting's own observations are exportable.** They are not: the
  session workspace holds them beside the durable log, the session screen says
  so, and `closed-loop.spec.ts` asserts that disclosure rather than working
  around it. Closing that seam is coordination request COORD-B8-2.
