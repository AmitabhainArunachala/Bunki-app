# The fractal dive — screenshot evidence (Campaign E, lane B2)

Captured by `apps/app/scripts/capture-dive.mjs` from the real
`expo export --platform web` output, in Chromium, at
1100 px wide with the viewport grown to the page's own scroll
height. Every shot after the first was taken **after a real click on a real
node**: the script drives the dive rather than loading three URLs, because
the claim is that zooming works and is the same gesture at every level.

Subject: 分, the character the closed loop is built around.

## What each shot is

| file | scheme | motion | level the page reports | path the page shows |
| --- | --- | --- | --- | --- |
| `light-l2-kanji.png` | light | full | character (L2) | 分 |
| `light-l1-component.png` | light | full | component (L1) | 分 › 八 |
| `light-l0-stroke.png` | light | full | stroke (L0) | 分 › 1/4 |
| `dark-l2-kanji.png` | dark | full | character (L2) | 分 |
| `dark-l1-component.png` | dark | full | component (L1) | 分 › 八 |
| `dark-l0-stroke.png` | dark | full | stroke (L0) | 分 › 1/4 |
| `stepped-light-l2-kanji.png` | light | reduced | character (L2) | 分 |
| `stepped-light-l1-component.png` | light | reduced | component (L1) | 分 › 八 |
| `stepped-light-l0-stroke.png` | light | reduced | stroke (L0) | 分 › 1/4 |

The level column is read out of the photographed page rather than derived
from the filename, and the script fails if the two disagree. A screenshot
whose caption is a guess is not evidence.

## Level of detail, measured in the shipped bundle

The dive renders what it materialised, and this is that line read out of the
page at the character level:

> This view materialised 44 nodes of the 9025 this build indexes, from 9 adjacency lists. The rest of the graph was not touched.

That is the whole level-of-detail contract in one sentence, and it came from
the browser rather than from a unit test.

## The stepped variant

Under `prefers-reduced-motion: reduce` the dive is stepped: `resolveDuration`
returns 0, the flight never runs, and each level arrives in place. Continuous
zoom is a known vertigo trigger and a WCAG obligation, not a preference — so
the surface also *says* which mode it is running, and that sentence is in the
shot. Read out of the page:

- full motion: > Each level flies in from the one before it. Turn on reduced motion in your system settings for a stepped dive instead.
- reduced: > Your system asks for reduced motion, so the dive is stepped: each level arrives in place, with no flight between them. Nothing else changes.

## What these shots do not show

- **A phone.** Chromium on Linux at a desktop width. Nothing here is a claim
  about a device, and the primary target is a phone.
- **The flight itself.** A still cannot photograph motion. What is shown is
  that each level arrives and that the surface states its own mode; the
  animation is asserted by `resolveDuration` returning 0 under reduction,
  which `test/theme-motion.test.ts` holds.
- **A learner with any recorded state.** These are captured in a fresh
  context, so every mark is at the no-evidence end of the ramp. That is the
  honest default view, and it is why the diagnosis panel says there is not
  enough recorded for the comparison to say anything.
- **L3 to L5.** The outward rings are in every frame, but the dive was driven
  inward, which is the direction this dictionary tier is densest in and the
  one the surface-bright/interior-dark diagnosis is about.

