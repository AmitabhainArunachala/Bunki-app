# WP7 — motion / aliveness in the Drift field

The field used to sit almost still. A resting word travelled **3.8 px a second**,
each one rattling along its own private zig-zag with no relation to its
neighbours. It read as *paused*, not as *calm*.

This work gives the water a **slow coherent current**: one gyre whose eye wanders
well outside the glass, carrying every word, every pigment pool and every flow
mote the same way at the same moment.

|  | before | after |
|---|---|---|
| median word speed, at rest | 3.80 px/s | **10.40 px/s** (×2.7) |
| neighbour velocity agreement (<100px apart) | 0.34 | **0.74** |
| …at 100–250px | 0.30 | 0.62 |
| …at 250–450px | 0.32 | 0.45 |
| …at 450px+ | 0.32 | **0.19** |
| flow-mote circulation about the wandering eye | — (motes effectively static, 0.16px/step) | **0.68 tangential** (7.3px/step) |
| relative speed between neighbours ("shear") | 3.50 px/s | 4.71 px/s |
| word drift under `prefers-reduced-motion` | 3.74 px/s — **the preference was not honoured** | **0.00 px/s** |

The *shape* of that agreement column is the whole point. Before, the correlation
is flat — 0.34 at a thumb's width and 0.32 across the whole screen — which is
the signature of no spatial structure at all. After, it **decays with distance
and crosses toward zero at the far edge**: near neighbours travel together,
distant ones do not, which is what a rotation looks like and what jitter can
never look like.

---

## What the motion feels like

Sit still and watch. The whole surface leans — not all at once and not in
lockstep, but the way a slick of ink leans when the bowl is tilted a few degrees.
A word near you and a word a thumb's width away move together; you can see the
relation without being able to name it. Underneath the shared lean each word
keeps its own small breathing, so nothing marches. Every few seconds the lean has
become a different lean, because the eye of the gyre has wandered somewhere else,
and the field turns to follow it without ever announcing a turn.

The ink layer is where the current is actually visible: the flow motes — the dust
the field already used to make currents legible — now genuinely circulate, and
the pigment washes sway around their places instead of sitting.

**And it stops when you touch it.** Put a finger down and the drift and the
current ease to a stop under your hand in about seven frames; lift, and the field
starts breathing again. Water does that, and it means a word can never walk out
from under a finger that is already resting on it.

Nothing accelerates, nothing arrives, nothing finishes. There is no event in it.
That is the point: a field you can rest your eyes on that is not dead.

---

## The three tunables

Top of `prototypes/drift/drift-artifact.html`, immediately under `reduced`.
All three are silenced entirely by `prefers-reduced-motion`.

| constant | value | what turning it does |
|---|---|---|
| `DRIFT_SPEED` | `1.15` | How fast each word breathes inside its own wander box, on its **own private heading**. Up = the field fidgets harder. `1` was the whole of the old near-stillness; `0` freezes the breathing. |
| `CURRENT_STRENGTH` | `0.038` | How much of the field the gyre owns — how far it carries a word off its anchor (`CURREACH = CURRENT_STRENGTH × 230` ≈ **8.7 world units**, comfortably inside the ±16/±12 wander box) and how hard it stirs the water the ink and motes ride. Up = the field travels as one body; `0` takes the current off entirely. |
| `CURRENT_DRIFT` | `0.0017` | How fast the gyre's eye wanders, in radians/ms. **This is what turns a standing pull into motion** — a parked eye holds every word at a fixed offset and nothing moves at all. Up = the swirl roams restlessly; down = the field leans and holds. |

### The finding the operator should know before turning them

`DRIFT_SPEED` is the **expensive** way to buy motion; the current is the cheap
one. Private headings do not agree, so raising `DRIFT_SPEED` drives neighbours
*across* each other — measured as **shear** — and every crossing starts a ~0.33s
window in which the WP2 arbiter has decided but its 0.12 ease has not finished.
Shear is also what makes a tap land on a word the arbiter has just ghosted.
Current motion carries neighbours *together* and adds very little shear:

| tuning | speed px/s | shear px/s | agreement <100px | gate result |
|---|---|---|---|---|
| pristine baseline | 3.8 | 3.50 | 0.34 | v11 21/21, consistency 45/45 |
| `DS 2.2 / CS 0.065 / CD 0.0020`, narrow gyre | 12.5 | 10.8 | 0.50 | v11 **19/21** |
| `DS 1.3 / CS 0.05 / CD 0.0022`, wide gyre | 17.2 | 5.9 | 0.85 | consistency **40–41 cases**, hunt **8** |
| **shipped: `DS 1.15 / CS 0.038 / CD 0.0017`** | **10.4** | **4.71** | **0.74** | see `suites.md` |

Two shape choices bought most of that and both are commented in the source: the
eye ranges **outside** the glass (Lissajous amplitude 0.62 of the viewport, not
0.26) and the calm core is **wide** (`mind()×0.75`, not `×0.18`). A gyre held at
arm's length reads as one broad lean; a gyre in the middle of the field turns
hard and tangles words into each other.

Three derived values sit beside the current so the operator still has only three
knobs:

* `CURREACH` — above.
* `ARB_EVERY = round(5 / DRIFT_SPEED)` — the WP2 ghost arbiter samples in
  proportion to how fast the field moves. Same rule, same thresholds, same 0.12
  ease; only the cadence follows the water. At `DRIFT_SPEED 1` it is exactly the
  historical every-5th-frame.
* `calm` — the touch gate described above. Not a tunable; a law.

---

## Frames

60fps held on both surfaces at the 390×844 touch profile, 10s of rAF deltas:

| surface | p50 | p95 | p99 | max | frames >20ms | long tasks >50ms |
|---|---|---|---|---|---|---|
| drift standalone | 16.7 | **16.7** | 16.8 | 33.4 | 1 / 599 | 0 |
| corridor fusion (regenerated layer) | 16.7 | **16.8** | 16.8 | 16.8 | **0 / 599** | 0 |

Zero console errors and zero page errors on both.

Getting there needed one round of optimisation, recorded in the source: the
gyre's heading is evaluated for every word and every water cell every frame, and
writing it with `Math.hypot` and `Math.exp` cost the fusion its frame budget
outright (p95 33ms). It is now sqrt, one divide, a Lorentzian falloff instead of
an exponential, and a screen-band test that skips the thousands of dictionary
words nowhere near the glass.

---

## Files here

| file | what it is |
|---|---|
| `measure-motion.mjs` | the motion + frame instrument. `--src FILE` for the drift standalone, `--dir/--page` for the corridor fusion, `--reduced` for the reduced-motion profile, `--set K=V,…` to sweep the tunables without editing the source |
| `verify-reduced-still.mjs` | `prefers-reduced-motion` is a hard stop on **motion**, never on **interaction**: proves the field is bit-for-bit still over 10s and that the tap ladder and the flick judgment still answer |
| `motion-before-after.json` | every number above, as recorded |
| `suites.md` | every acceptance suite, run against the final build **and against pristine HEAD as a control** |

### How the coherence numbers are defined

* **speed** — median over resting words of *path length ÷ time*, sampled every
  rAF for 10s. Not net displacement: a word that returns where it started still
  moved.
* **neighbour agreement** — mean `cos∠(v_a, v_b)` over word pairs, bucketed by
  separation. `0` = independent jitter, `1` = one body.
* **tangential coherence** — `mean(v · t̂) / mean(|v|)` about the wandering eye,
  reported for the **flow motes**. Motes are free tracers, so they can show net
  circulation. Anchored words **cannot**, at any current strength: a bounded
  orbit integrates to zero however coherent it is. That is why the word layer is
  judged on neighbour agreement instead. It is reported for words too, honestly,
  and it is near zero by construction rather than by weakness.
* **shear** — mean `|v_a − v_b|` for pairs within 100px. What actually makes two
  words newly overlap, and therefore what the ghost arbiter has to chase.
