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

Since 2026-07-28 it also measures a **cold load** — a fresh browser context with
an empty cache, timed to the capture screen being usable. Every other number
here is explicitly *warm*, so none of them would move if the bundle doubled, and
reporting only warm numbers after tripling the bundle would be a way of not
answering the question.

## What was measured, 2026-07-27

| Runtime | Engine                       | Build                                                       |
| ------- | ---------------------------- | ----------------------------------------------------------- |
| **web** | Chromium 141.0.7390.37       | `expo export --platform web` static output (`apps/app/dist`) |
|         | Node v22.22.2, linux x64     | adapter `web-provisional` (`localStorage` snapshot)          |

Three warm-up interactions discarded; **15 measured samples** each. "Warm" means
the bundle, the seed index and the store are already loaded.
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

## Re-measured 2026-07-28, after the imported dictionary was wired in — **still web**

The app reached sixteen lexemes when the table above was recorded. It now
reaches **3,016**: the §8 fixture tier plus 3,000 imported JMdict entries, 1,241
KANJIDIC2 characters with their KanjiVG strokes, and 2,000 Tatoeba sentence
pairs. That is a 3.4× larger bundle, so the honest question is not "is it fast"
but "did adding this make it slower", and answering it needs a *before* to
compare against.

Both columns below were measured in the same session, on the same machine, by
the same script. The "before" build is commit `8775c2c` — the tree immediately
prior to the wiring — rebuilt and measured for this comparison rather than
quoted from the older table above.

| Measurement | before (16 lexemes) | after (3,016) | change |
| --- | --- | --- | --- |
| Bundle, single JS chunk | 1,712,482 B | 5,851,369 B | **+4,138,887 B (3.4×)** |
| **Cold load** — empty cache → capture screen usable (n=8) | 253.6 ms med · 283.0 ms p95 | **436.4 ms med · 445.3 ms p95** | **+183 ms median** |
| **Warm lookup, fixture tier** (n=15) | 41.7 ms med · 56.7 ms p95 | **23.3 ms med · 56.5 ms p95** | −18 ms median |
| **Warm lookup, imported tier** (n=15) | — (unreachable) | **27.6 ms med · 41.2 ms p95** | new |
| **Local save ack** (n=15) | 64.2 ms med · 82.5 ms p95 | **55.4 ms med · 65.1 ms p95** | −9 ms median |

### Reading this table honestly

- **Search did not get slower; it got faster, and that took a fix.** The first
  wiring made warm lookup *worse* — 76.1 ms median against the 41.7 ms baseline —
  because the query normaliser (NFKC + lower-case) was being applied to the
  **dataset** on every keystroke: roughly 21,000 `normalize()` calls per
  character typed, all recomputing the same answer about strings that never
  change. Precomputing the invariant side (`apps/app/src/data/imported-tier.ts`,
  `NORMALIZED_LEXEMES`) is what produced the number in the table. The regression
  is recorded because it happened, not because it survived.
- **The imported-tier query is the expensive one, deliberately.** Its samples
  rotate through `図書館`, `経済`, `せんせい` and **`library`** — an English gloss,
  which cannot use an exact-match index and must touch every sense of all 3,000
  records. It is *not* slower than searching the sixteen.
- **Cold load did get slower: +183 ms median, +72%.** That is the real cost of
  putting the dictionary in the bundle, and it is not hidden in a warm number.
  Two things bound how much this says:
  - it is **localhost with no compression**, so it measures parse and execute
    rather than transfer. Over a real network the 4.1 MB would dominate and this
    figure would be optimistic — by how much is **not measured here**;
  - §13 sets no cold-load budget, so nothing is being met or missed. The figure
    is recorded so the next person can see what the dictionary cost.
- **Everything above is still web.** The re-measurement changes none of the
  native claims: they remain unmade.

### Reproducing this comparison

```bash
npm ci
npm run test:e2e:build
node scripts/measure-web-latency.mjs        # the "after" column, as JSON
```

The "before" column needs the prior tree:
`git checkout 8775c2c -- apps/app/src apps/app/app packages/seed/src`, delete
`apps/app/src/data/imported-tier.ts`, `packages/seed/src/imported.ts` and
`packages/seed/data/dictionary/stroke-paths.json`, rebuild, measure cold load
only (the imported-tier queries find nothing on that build, by construction),
then `git checkout HEAD -- apps/app packages/seed`.

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
