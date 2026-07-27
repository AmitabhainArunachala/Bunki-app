# Performance measurements — **web, not native** (controller §13)

> **Read this line before any number below.** Every measurement here was taken
> on **Chromium, against the Expo Web static export, on a Linux CI-class
> machine**. Controller §13 ends with: _"Web measurements are demonstration data
> only."_ Definition-of-done §2 item 2 makes "web passed off as native" an
> explicit failure of done. **Nothing on this page is an iPhone number, and
> nothing on this page may be cited as one.**

## How to reproduce

```bash
npm ci
npm run test:e2e:build              # expo export --platform web → apps/app/dist
node scripts/measure-web-latency.mjs
```

The script drives the **real exported bundle** through the **real gestures** — it
fills the search field, presses Keep, and waits for the acknowledgment the
learner actually reads. It does not time a function call. Timing
`store.execute` would measure a substring of the promise the app makes to a
person, and would keep looking good while React, layout and the storage adapter
got slower.

## What was measured, 2026-07-27

| Runtime | Engine                       | Build                                                       |
| ------- | ---------------------------- | ----------------------------------------------------------- |
| **web** | Chromium 141.0.7390.37       | `expo export --platform web` static output (`apps/app/dist`) |
|         | Node v22.22.2, linux x64     | adapter `web-provisional` (`localStorage` snapshot)          |

Three warm-up interactions discarded; **15 measured samples** each. "Warm" means
the bundle, the seed index and the store are already loaded — a cold first paint
is a different question with a different budget, and it is not this one.
Percentiles are **nearest-rank** on the sorted samples, so every figure below is
an observation that actually happened rather than an interpolation.

| Measurement                                            | n   | min       | median    | **p95**   | max       | §13 budget (for the runtime §13 means) |
| ------------------------------------------------------ | --- | --------- | --------- | --------- | --------- | -------------------------------------- |
| **Local save ack** — press Keep → acknowledgment shown | 15  | 52.2 ms   | 64.2 ms   | **82.5 ms** | 82.5 ms   | ≤150 ms                                |
| **Warm lookup** — query entered → top answer shown     | 15  | 27.1 ms   | 41.7 ms   | **56.7 ms** | 56.7 ms   | ≤200 ms                                |

### Caveats that belong next to the numbers, not in a footnote

- **p95 equals max here, and that is arithmetic rather than luck.** With n=15,
  nearest rank puts the 95th percentile at sample ⌈0.95 × 15⌉ = 15 — the largest
  one. These are therefore *worst observed* values, not a stable p95. A real p95
  needs a larger n; this is a recorded demonstration, not a benchmark.
- **One machine, one run, no thermal or load control.** No repetition across
  sessions, no other browser, no other hardware.
- **The budgets in the right-hand column are not "met" by this table.** §13's
  budgets are written for the runtime the operator will use. That these web
  numbers sit under them is encouraging and is not evidence about the device.

## What has never been measured

The remaining §13 budgets are **native, WP-11, on a physical device**, and no
approximation of them exists anywhere in this repository:

- capture-to-durable median ≤2 s / p95 ≤4 s — **never measured**
- zero lost captures in a 100-trial background/kill test — **never run**
- "five ordinary captures feel no slower than the operator's current dictionary
  flow" — operator-judged, belongs to the WP-12 trial script — **unrun**

The adversarial restart storms (`apps/app/e2e/adv-restart-storm.spec.ts`) are
**not** the 100-trial kill test. They are twelve reloads and five force-quit
cycles in a browser; they establish T-16 at the *web* runtime and nothing about
a device (P0-CAP-15).

Ladder position is recorded in `DONE_LADDER.md`: rung 2, DEVICE-DONE (native),
is **UNVERIFIED**.
