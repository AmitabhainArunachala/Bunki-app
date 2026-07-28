# What the fractal dive costs (Campaign E, lane B2)

Every number here was produced by a run in this repository, and every one names
the command that produced it. Nothing below is an estimate.

The design document names performance as risk 1 and says why: the primary target
is a phone, and lane A2 already had to repair exactly this defect class once —
"the time scrubber rebuilt the whole index on every frame". So the level-of-detail
claim is **reported by the code**, not asserted: every `ScaleView` carries a
`ScaleCost` saying how many adjacency lists it read, how many entries it
examined, and how many nodes it materialised, beside how many the ladder holds
in total.

---

## 1. Indexing the Atlas — paid once, lazily

    npx vitest run apps/app/test/dive-scale-source.test.ts

    [B2] ladder build: 230.7 ms, 9025 nodes, 17246 edges, 107 diagnostics

The graph is assembled from the two shipped tiers — 1,251 characters, 3,016
lexemes, ~660 components, ~2,100 readings and the Tatoeba pairs that join to a
shipped entry — and indexed by `buildKnowledgeGraph`. The ladder over it is
free: it holds the graph rather than re-indexing it.

**When it is paid.** On the first dive, not at module load: `appScaleLadder()`
memoises at module scope, so a learner who never opens a character page never
pays for it, and a second character page pays nothing. The memoisation is
asserted (`is memoised, so a second dive pays nothing for the index`).

**The 107 diagnostics** are the builder reporting duplicate ids and dangling
edges rather than dropping them silently — the two tiers overlap on a handful of
records. They are reported, not hidden, and the test holds them under one in
twenty edges.

---

## 2. One dive — bounded, and bounded in the size of the graph

    [B2] one dive over 9025 nodes:
      分 → 40 nodes / 7 lists / 195 steps
      人 → 62 nodes / 5 lists / 65 steps
      日 → 52 nodes / 5 lists / 53 steps
      木 → 13 nodes / 4 lists / 12 steps
      森 → 20 nodes / 5 lists / 134 steps

Read: materialising the whole view around 人 — the widest fan-out in the shipped
3,000 lexemes, at fifty words — cost **62 nodes out of 9,025** and **five
adjacency lists**. The rest of the graph was not touched.

    [B2] 100 dives in 23.3 ms (0.23 ms each)

A per-dive walk over a 9,000-node graph would be visible in that number and a
local read is not.

### The claim tested rather than measured

`packages/domain/test/scale/dive.test.ts` builds two synthetic tiers, one ten
times the size of the other, dives the same node in both, and asserts the
adjacency reads and the nodes materialised **do not move**. That is the property
the design document asks for, and it is stated as an experiment rather than as a
comment:

- `has genuinely different graph sizes, so the comparison means something`
- `reads a bounded number of adjacency lists at either size`
- `materialises a bounded number of nodes at either size`
- `touches a hub node without walking its whole fan-out into the result`

---

## 3. In the shipped bundle, in a browser

    npm run test:e2e:build
    npx playwright test --config apps/app/e2e/playwright.config.ts \
      apps/app/e2e/dive-exposure.spec.ts

The page renders its own cost line, and the e2e reads it back out of the DOM:

> This view materialised 44 nodes of the 9025 this build indexes, from 9
> adjacency lists. The rest of the graph was not touched.

`says on screen what it materialised, and it is a small part of the graph`
asserts that ratio stays under a fiftieth. The same number is in
`docs/build-evidence/screenshots-b2-dive/README.md`, read out of the photographed
page.

---

## 4. Where the budgets come from

Two, and both were chosen against the real tier rather than picked:

| budget | value | why |
| --- | --- | --- |
| `DEFAULT_DIVE_OPTIONS.perLevel` | 12 | The domain's default. Bites on a hub, which is where a budget should bite, and the cut is reported as `available` and `truncated`. |
| `DETAIL_DIVE_OPTIONS.perLevel` | 60 | The character page's own. The busiest character in the shipped 3,000 lexemes is 人 with 50 words and the busiest has 12 components, so a character's rings are **complete** — which is what makes "ranked by JMdict's own commonness tags" an honest sentence rather than a ranking of an arbitrary subset. Asserted by `is complete at the page budget for the busiest character in the tier`. |
| `RING_DISPLAY_LIMIT` | 8 | How many of a ring are drawn on the canvas. A ring of sixty is a list. The cut is stated under the ring with both numbers. |
| `previewMembers` × `previewLimit` | 4 × 6 | The interior glimpse that makes the diagnosis visible. Four extra adjacency reads and twenty-four extra nodes per ring — both constant in the size of the graph, which is the property that matters. |

---

## 5. What is **not** measured here, and it matters

- **A phone.** Every number above is Node 22 or Chromium on Linux, on a
  development machine. The primary target is a phone and this repository has no
  device in it. The 230 ms index would be slower there — plausibly two to four
  times — and that is a guess, which is why it is written as one. What is
  *portable* is the shape: the index is paid once and a dive is a local read, so
  a slower machine pays the fixed cost once rather than per gesture.
- **The flight's frame rate.** The zoom is one `Animated.timing` over opacity and
  a scale transform on a container, with `useNativeDriver: false` because the
  web target has no native driver. Nothing measured it. Under reduced motion the
  duration is 0 and the question does not arise.
- **Cold bundle parse.** The web bundle is 8.1 MB, most of it the dictionary, and
  that cost is B3/B6's (`docs/build-evidence/PERF_WEB.md`) rather than this
  lane's. The dive adds the graph *index*, not the data.
