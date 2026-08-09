# WP2 独立検証 · round 2 — re-ruling the law on the ghost revision

Verified at `4dd8a34` (detached). Real Chromium 1194, 390×844, touch, CDP.
Probes 6–8 written fresh for this round; probe 5's residual-signal method is the
same instrument that produced the round-1 refutation, re-pointed at the revision.

## VERDICT: **CONFIRMED** on the law fix and all mechanisms.
## LAW RULING: **LAW-OK** — the round-1 LAW-CONFLICT is answered on all three grounds.
## Two claims **REFUTED**: the hunt envelope (§5) and the stated upper bound (§4).

---

## 1. LAW-OK — my own numbers on my own instruments

Round 1 found three grounds. Each is now answered.

### (a) Presence — ANSWERED
Ghosts render at **0.327–0.333** in every theme; the field's own faintest
*unarbitrated* presence is **0.3266**. The arbiter no longer invents a faintness the
field does not already use.

| theme | ghosts | ghost op | ghost contrast | **quietest KEPT word** |
|---|---|---|---|---|
| 北斎 | 6 | 0.327–0.333 | 1.638 – 1.721 | op 0.327, **cr 1.467** |
| 墨 | 5 | 0.327 | 1.498 – 1.761 | op 0.327, **cr 1.380** |
| 岩絵具 | 5 | 0.327 | 1.581 – 1.732 | op 0.327, **cr 1.458** |
| 緑青 | 5 | 0.327 | 1.596 – 1.600 | op 0.327, **cr 1.339** |
| 夜 | 5 | 0.327 | 2.260 – 2.280 | op 0.327, **cr 2.260** |

In every theme **the faintest ghost is at least as present as the faintest word the
arbiter chose to keep.** Round 1 measured ghosts at 0.035–0.067 and 1.03–1.15:1 — a
class of faintness that existed nowhere else on screen. That class is gone.
Under a hard zoom (z=2.6, 39 words rendered): minRenderedOp **0.327** vs
minUnarbitrated **0.3266**.

### (b) Reachability — ANSWERED
`pointer-events:none` on **0** words, in all five themes, at rest and at z=2.6.
My own independent pick and my own CDP tap on ghost 単なる at op 0.327:

```
before: op 0.327, collide 0
after : collide 1, op 0.967, isFocus true, unfolded true
```

The ghost takes the touch and returns to full presence. Round 1's "a watermark you
cannot touch" no longer applies.

### (c) Return at rest — STILL DOES NOT LIFT, and that is now acceptable
45 s, 15 samples, zero input: five ghosts held **0.327** flat, every sample. The
implementer states this openly rather than claiming otherwise.

I ruled this a violation in round 1 and I do not rule it one now, for a reason I can
state precisely: **the level a ghost is held at is the level the field paints
unarbitrated words at.** In the same frame, a KEPT word (`出`) renders at exactly
0.327. A word held at the same presence as words nobody arbitrated is not gone — it
is quiet. The law reserves *disappearance* for a deliberate flick; nothing here
disappears.

### The decisive instrument — residual signal (round 1's own method)
Screenshot, `display:none` **one word**, screenshot, diff its own box:

| | round 1 (v1) | **round 2 (ghost)** |
|---|---|---|
| GHOST mean Δ | 2.2 – 14.1 | **8.86 / 10.30 / 11.32 / 30.58** |
| KEPT mean Δ | 17.4 – 36.2 | **9.87 / 9.89 / 10.62 / 29.41** |
| ghost min ÷ kept min | ~0.13 | **0.90** |

The two distributions now overlap. In round 1 a ghost carried one sixth to one eighth
of a present word's signal; it now carries 90% of the quietest kept word's. This is
the measurement that made the round-1 conflict, and it is the measurement that
retires it.

---

## 2. The checks can fail — falsification sweep

The coordinator's question. Six mutants of `drift-artifact.html`, each a single
surgical edit, run through the unmodified harness:

| mutant | edit | result | checks driven red |
|---|---|---|---|
| M1-lowfloor | `floorOp = 0.03` | **15/21** | law-rest-presence, law-rest-reachable, law-ghost-residual, 4-rest-contention, 4-zoom-contention, law-zoom-presence |
| M2-penone | reinstate `pointer-events:none` on ghosts | **19/21** | law-rest-reachable, law-zoom-presence |
| M3-faintghost | `GHOST_REL 0.45 → 0.06` | **21/21** | **none — see §4** |
| M4-norot | twist never registers | **20/21** | 3-rot-clamp ("twist registered: rot 0 → 0") |
| M5-noarb | arbiter disabled | **17/21** | law-rest-reachable, 4-rest-contention, 6-chrome-keepout, 4-zoom-contention |
| M6-hintfaint | hint back to `--faint`, no plaque | **16/21** | all five 5-hint |

Five of six mutants land on exactly the checks they should. The opacity gate is gone
from the harness, and the checks are no longer self-fulfilling. Baseline `f433edf` on
the new harness: **5/21**, as claimed.

Runs on the revision: **21/21 twice**, zero console and zero page errors.

---

## 3. Mechanisms re-confirmed (spot-check)

| | my numbers |
|---|---|
| pinch dive-latch | entered dive stack=1, pinch-IN → stack 1→0, **z 1.000 → 1.000** |
| double-tap return-to-rest | messy z 2.600 / rot 2.618 → **single tap: unchanged** → **double tap: z 1.000, rot 0.000** |
| lock B folds A | unfolded **1 → 0**, lockOn true, members 12 |
| lock at min zoom | z 0.340, lockOn true, focus 12, **visible 12** |
| page/console errors | 0 |

---

## 4. REFUTED — the upper bound is misstated, and unverified

Claimed: *"bounded above by ghost ≤ 45% of the quietest word it tangles with."*

The code computes `ghost = max(floorOp, GHOST_REL × quietestWinner)` and gates
winners at `quietestWinner ≥ floorOp / CONTEND_MAX`. With floor 0.327 and
CONTEND_MAX 0.53, `winMin = 0.616`, so for every winner below `floorOp/0.45 = 0.727`
**the floor is what binds and the 45% bound is breached by construction.**

Measured at z=2.6 over genuine winner pairs (quietestWinner ≥ winMin):

```
材料 0.46 · 読み 0.46 · 高価 0.46 · 飛び出す 0.46 · 憎らしい 0.46 · 軍 0.517
```

**6 of 6 exceed the claimed 0.45.** All sit at or under **0.53** — the real enforced
bound is `CONTEND_MAX`, not `GHOST_REL`.

And **M3 proves the constant is inert**: setting `GHOST_REL` from 0.45 to 0.06 —
removing the upper bound almost entirely — still scores **21/21**, with
`minGhostOp` unchanged at 0.327. No check in the harness covers this bound. That is a
coverage gap, not a law problem (0.53 still leaves a real figure and a real ground),
but the claim as written is not what the code enforces and nothing would catch it.

---

## 5. REFUTED — the hunt envelope

Claimed: *"hunt 1 fail per run (inside the {0-2} pre-existing envelope)."*

Five runs on the revision, five runs on `3745390` (round 1's tree), same machine,
same tool:

| | run fails | **hub-cluster failures** |
|---|---|---|
| `4dd8a34` (revision) | 3 · 2 · 1 · 1 · 3 | **3 of 5 runs** |
| `3745390` (round 1) | 2 · 2 · 0 · 1 · 1 | **0 of 5 runs** |

The failures outside the declared staged-semantic-reveal cluster:

```
FAIL hunt · a release on a hub sun releases the constellation instead of diving
     hub "一" at (74,446) · held "外出" → ctr 外出, depth ""
FAIL hunt · a release on a hub sun releases the constellation instead of diving
     hub "見" at (74,296) · held "外出" → ctr 万一, depth ""
FAIL hunt · hub release cannot hijack a gesture or leave themed ghost satellites
     terminal 372px: depth="", centre="増加", sats=14→14
```

**Mechanism, in the source, not inferred from statistics.** `pointerup` reaches the
hub branch only through `if(!FOCUS.length){ const hb = hubAt(...) }`, which sits
*after* `if(n){ … tapNode(n); return; }`, where `n` is the node captured at
pointerdown. In v1, ghosts carried `pointer-events:none`, so a release over a hub
found `n === null` and fell through to `hubAt`. **The revision deliberately removed
that** — and a ghost now takes the release before `hubAt` is ever consulted. A hub is
canvas-drawn, so `loudestWordAt` never compares against it: a ghost at 0.327 beats a
hub that is not in the comparison at all.

Both failing runs name an unexpected word as the new centre (`万一`, `増加`) — `万一`
is one of the three persistent ghosts in the left band next to `#lvl`, and the hub in
that run was at x=74, immediately right of `#lvl` (0–44 px). This is the predicted
failure, at the predicted place.

**This is the price of the reachability fix, and it is real, reproducible, and
outside the declared envelope.** Reported, not fixed.

---

## 6. Corridor suite

| tool | result |
|---|---|
| `build-drift-layer` | css 14 KB · markup 2.0 KB · js 603 KB · **12 patches, all unique**, unadjusted |
| `verify-drift-consistency --mode fast` ×4 | 45/45 · 45/45 · 45/45, and **one run with 1 × `fuzz-sat-reveal` misfire** |

The misfire is **pre-existing**: rebuilding the fusion from `f433edf`'s
`drift-artifact.html` reproduced the identical signature on the second run —
`fuzz-sat-reveal misfired — satellite=謎謎; exists=false`. Not attributable to WP2.

---

## 7. Other claims checked

- **#lvl equivalence (claim 1) — CONFIRMED, and conservative.** `#lvl` has
  `pointer-events: auto`, `z-index: 8`; words are `z-index: auto`. Forcing an
  occluded word's opacity to 1 and re-resolving the same 25 sample points gives
  **identical** results (`allIdentical: true`) — occlusion by `#lvl` is provably
  opacity-independent, so a word under it is exactly as unreachable at full presence.
  In my runs I measured **0 unreachable words in all five themes**, 夜 included; their
  "1 unreachable in 夜" did not reproduce and is a frame-dependent transient. They
  understated their result, not overstated it.
- **Honest correction (claim 4) — CONFIRMED.** Raw geometry is unchanged:
  `rawWorstOverlap` 0.833–0.909 on the revision, 0.892 on the baseline. The arbiter
  paints; it does not move words. Now stated in the harness output itself.
- **Round-1 collateral, all closed.** The hint check now asserts the pill actually
  renders (`opacity > 0.9`, unforced) — M6 drives all five red. `3-rot-clamp` now
  asserts the twist registered — M4 drives it red. `nearestWord`'s opacity filter no
  longer hides anything from the census, which has no opacity gate at all.
- **Disclosed residual tension (claim 6) — CONFIRMED and larger than relayed.**
  Un-arbitrable tangled pairs: 5 at rest (matches), **15–22 at zoom** across my runs
  vs the 11 relayed. Both words in these pairs are present and touchable, so this is a
  reading cost, not a law breach — and the harness reports it in plain sight rather
  than filtering it out.

---

## Reproduction

```
git checkout 4dd8a34
ln -s /home/user/Bunki-app/node_modules node_modules
node prototypes/drift/tools/verify-v11.mjs                      # 21/21
node .../verifier/probes/mkmut.mjs                              # build the six mutants
node prototypes/drift/tools/verify-v11.mjs --src <mutant> --port 89xx
node .../verifier/probes/probe6.mjs <src> rev 8991              # census, tap-on-ghost, mechanisms
node .../verifier/probes/probe7.mjs <src> rev 8995              # 45s rest, #lvl, residual signal
node .../verifier/probes/probe8.mjs                             # occlusion equivalence, ratio at zoom
node prototypes/corridor/tools/build-drift-layer.mjs
node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast
node prototypes/corridor/tools/verify-drift-hunt.mjs
git checkout -- prototypes/corridor/ docs/audits/ prototypes/drift/
```
