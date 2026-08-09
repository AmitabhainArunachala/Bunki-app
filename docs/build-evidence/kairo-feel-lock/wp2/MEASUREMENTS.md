# WP2 — v11 coherence mechanisms in the current Drift source

Base: `f433edf` (claude/kairo-feel-lock-2026-08-09). Mechanisms ported by hand from
`1f582fc` on `origin/claude/drift-coherence-v11`, which patched an older build.

**Rewritten twice after independent verification.** Round 1 (`c0feccb`) returned
CONFIRMED-with-findings; round 2 (`142c174`) returned CONFIRMED and LAW-OK with two
refuted sub-claims. Everything the verifier corrected is corrected here.

Round-1 findings, both of which this file was originally wrong about:

1. The claim "receded words sit at 0.10 opacity" was **false as a description of what
   the learner sees**. `0.10` was a *multiplier*; the composited result was
   **0.035 – 0.067**, a contrast of **1.03 – 1.15 : 1**. Those words were also
   `pointer-events: none`. That is a disappearance, and the law reserves disappearance
   for a deliberate flick judgment.
2. Three checks in `verify-v11.mjs` were **tautological**: they skipped words under
   0.42 opacity while the mechanism's whole action was to push contested words under
   0.42. "Rest overlap 0.88 → 0.03" was a measurement artifact. The geometry never
   changed — the arbiter paints, it does not move words.

Both are fixed. Round 2 then refuted two further claims of mine, also fixed and
corrected below: a **new hub-cluster hunt regression** that the reachability fix
caused, and the **`GHOST_REL` constant, which was inert** — the code never enforced
the upper bound I documented. The numbers below are all re-measured.

## Reproducing

```
git show f433edf:prototypes/drift/drift-artifact.html > /tmp/drift-baseline.html
node prototypes/drift/tools/verify-v11.mjs --src /tmp/drift-baseline.html --label baseline
node prototypes/drift/tools/verify-v11.mjs                       # this tree
node docs/build-evidence/kairo-feel-lock/wp2/probes/ghost-presence-per-theme.mjs \
  --src prototypes/drift/drift-artifact.html --out /tmp/ghost.json
```

---

## Finding 1 — the recede is now a ghost, not an absence

A contested word no longer takes a multiplier. It takes a **rendered opacity floor**,
read from the field itself each pass: *the quietest presence `spawnWord` is already
painting on screen*. The arbiter can only move a word within the presence range the
field already uses; it cannot invent a fainter one. That ladder predates the arbiter
and the arbiter cannot move it.

`prototypes/drift/drift-artifact.html:2413-2508` — two constants, both load-bearing:
`GHOST_ABS 0.30` (the hard bottom of the live floor, which is
`max(GHOST_ABS, min on-screen n.op)`) and `CONTEND_MAX 0.53`.

**Correction, round 2.** An earlier `GHOST_REL 0.45` documented an upper bound the code
did not enforce: a ghost lands on the floor, and the floor binds for every winner below
0.727, so `GHOST_REL` was dead in every observed frame (the verifier measured 6 of 6
winner pairs at z=2.6 exceeding 0.45, and gutting the constant to 0.06 still scored
21/21 — uncovered code). It is **deleted**. The real bound, and what the code actually
does:

> A ghost renders at the floor; the separation is enforced at the other end, by only
> letting a word take someone's water if it carries `floor / CONTEND_MAX` presence —
> which pins the quieter word of every contested pair at no more than `CONTEND_MAX`
> of the louder.

Both surviving constants are falsifiable through the unmodified harness. The verifier's
own low-floor mutant scored 15/21; my `CONTEND_MAX 0.53 → 0.95` mutant scores **20/21**
(`mutant-contend-max.txt`), reddening `law-rest-reachable` as loosening the winner test
recedes words against neighbours too quiet to make room.

### Per-theme, at rest, 390×844 — one instrument, both trees

`ghost-presence-before.json` (the verified build) vs `ghost-presence-after.json`.

| theme | rendered opacity | contrast vs ground | `pointer-events:none` | unreachable |
| --- | --- | --- | --- | --- |
| 北斎 | 0.035–0.067 → **0.327** | 1.037–1.105 → **1.638–1.721** | 11 → **0** | 11 → **0** |
| 墨 | 0.037–0.067 → **0.327** | 1.044–1.105 → **1.498–1.761** | 8 → **0** | 8 → **0** |
| 岩絵具 | 0.035–0.067 → **0.327** | 1.036–1.103 → **1.581–1.732** | 9 → **0** | 9 → **0** |
| 緑青 | 0.037–0.067 → **0.327** | 1.040–1.094 → **1.596–1.600** | 8 → **0** | 8 → **0** |
| 夜 | 0.035–0.067 → **0.327** | 1.072–1.150 → **2.260–2.280** | 9 → **0** | 9 → **1** |

The one unreachable ghost I measured in 夜 **did not reproduce** for the verifier, who
measured 0 unreachable in all five themes and showed the occlusion is provably
opacity-independent (`#lvl` has `pointer-events:auto` / `z-index:8`; forcing an occluded
word to full opacity and re-resolving the same 25 sample points gives identical results).
It was a frame-dependent transient. Corrected: **0 unreachable, all five themes.**

### Residual signal (the verifier's own method: delete one word, diff its box)

Mean RGB Δ over the word's own box when it is deleted outright.

| theme | GHOSTS before | GHOSTS after | KEPT controls (same frame) |
| --- | --- | --- | --- |
| 北斎 | 3.66 – 4.72 | **10.14 – 15.00** | 10.80 – 36.60 |
| 墨 | 2.29 – 3.20 | **8.39 – 9.05** | 24.05 – 24.15 |
| 岩絵具 | 3.20 – 4.17 | **8.56 – 13.45** | 10.21 – 37.17 |
| 緑青 | 2.67 – 5.61 | **8.53 – 15.47** | 12.05 – 32.69 |
| 夜 | 3.57 – 6.11 | **9.33 – 17.01** | 24.87 – 34.36 |

Ghosts now land inside the band of words the arbiter chose to KEEP, rather than at a
fifth to an eighth of it. The suite enforces this every run (`law-ghost-residual`:
a ghost must carry ≥50% of the residual of the quietest kept word in the same frame).

*(Some cells in the JSON read `NaN` — a word whose box hangs off the screen edge leaves
an empty diff region. Probe artifact, not data.)*

### Reachability — paint recedes, touch does not

`pointer-events` is never removed. An earlier cut of this revision instead handed a tap
in an overlap to the *louder* word; measured, that was worse — a ghost lying wholly
inside a louder word then had no point of its own left, 10 of 20 ghosts unreachable at
2.6× zoom. That mechanism was **removed**, and the reasoning is recorded at
`drift-artifact.html:1949-1958` so it is not reinvented.

**One exception, added in round 3** (`drift-artifact.html:1949-1963`) — the whole rule in
a sentence:

> A tap that lands on a galaxy sun is answered by the hub, not by a word that is painted
> at or below ghost presence — a word at full presence still outranks the hub, exactly as
> it always has.

Hubs are canvas-drawn, so hit-testing cannot see them and this one comparison has to be
made by hand. The test is on **rendered opacity, not the arbiter's flag**: a constellation
suspends arbitration, so a receded word's `collide` is already back at 1 while the bloom
still paints it at a third of its presence — reading the flag missed exactly the case the
hunt exercises, a release over a hub with a constellation held. (Measured directly:
`probe` showed 万一 at the hub point with `collide 1, collideTarget 1` but painted at
0.189.) Ghosts standing on a hub are counted and reported by `law-rest-reachable`, never
folded into the pass, so the check still asserts *every ghost not under a hub is
promotable*.

The suite proves reach two ways every run (`law-rest-reachable`):

- static — every rendered word has ≥1 point in its own box that the real tap path
  (`elementFromPoint`) resolves to it. Ghosts with no reachable point: **0**.
- live — a genuine CDP tap on a ghost: `単なる` at op 0.327 →
  `{collide: 1, isFocus: true, unfolded: true}`. It becomes the bloom centre and
  returns to full presence.

### (c) at rest, does the tangle clear on its own?

**No, and I am not claiming it does.** The verifier is right: words hold fixed world
positions, so a ghost stays a ghost until the camera moves. The earlier file's "the
arbiter lifts it the moment the tangle clears" was true only under camera motion.

The choice taken is the coordinator's second option: **the ghost floor alone is
sufficient presence**, on these grounds, all measured above — the word renders at the
same opacity as the quietest word the field paints unaided, at 1.50–2.28:1 against its
ground, carries kept-band pixel signal, keeps its touch target, and returns to full
presence on a tap. Nothing left the screen; one word stepped behind another, and the
learner can bring it back with a finger.

---

## Finding 2 — the checks now measure every rendered word

No check uses an opacity threshold the arbiter controls. The census reads **all** words
with opacity > 0.002 and no font-size gate.

### What actually changed, and what did not

| measurement (rest, all rendered words) | baseline `f433edf` | this tree |
| --- | --- | --- |
| raw worst geometric overlap | 1.000 | **0.834** *(unchanged in kind — the arbiter paints, it does not move words)* |
| raw overlapping pairs (f > 0.25) | 7 | 5 |
| **arbitrable reading-contention pairs** | **3** (worst contention 0.97) | **0** |
| un-arbitrable pairs left standing | 4 | 5 |
| words at reading presence (≥0.44) under chrome | **4** (単なる, 万一, 取り上げる, 技師) | **0** |
| words under chrome at all | 5 | 5 — *present, as ghosts* |

At 2.6× zoom: arbitrable contention pairs **25 → 0**. **Correction (round 2):** the
residual tangled pairs at that zoom are **15–22 across runs, not 11** — 11 was one run's
figure quoted as if it were the range. The suite now splits them: pairs where both words
are too quiet for either to win, and *ghost-over-ghost* pairs where both are already
ground. Both are counted on every run, never folded into the pass.

**Reading contention** replaces the old overlap count: for every geometrically
overlapping pair of rendered words, `min(opacity)/max(opacity)` must be ≤ 0.55 — one
word clearly figure, the other clearly ground. It measures every word, and it bounds
the ghost from *above* while `law-rest-presence` bounds it from *below*. Those two
checks squeeze the ghost into a real band; neither can be satisfied by moving a
threshold.

**Un-arbitrable pairs are reported, not hidden.** 5 pairs at rest are two words both too
quiet for either to win: receding either would push it under the floor. The arbiter
leaves them tangled rather than break the law. That is a real, remaining legibility
cost and it is on the record.

### Collateral notes from the verifier, addressed

- `themeContrast` no longer forces `hint.style.opacity = '1'`. It raises the hint via
  the app's own `setHint()`, waits out the 1.2 s transition, and each `5-hint` check now
  asserts the pill **actually rendered** (opacity > 0.9) as well as its contrast.
- `3-rot-clamp` now asserts the twist registered (rot 0 → 2.793) before asserting the
  clamp, so a clamp that reads 0 because nothing happened cannot pass.
- `7-parity` now composites at each word's **unarbitrated** presence. Reading the
  rendered opacity coupled a claim about pigment to which words the arbiter had ghosted.

---

## The eight mechanisms (unchanged by this round unless noted)

| # | mechanism | line | baseline → now |
| --- | --- | --- | --- |
| 1 | pinch mode latched at gesture start | `1917` | z 1 → 0.34 ⇒ **1 → 1** |
| 2 | return-to-rest (double-tap, pan+zoom+twist) | `1895`, `2139`, `2509` | unchanged ⇒ **z 1.000, rot 0.000** |
| 3 | rotation clamped to ±π | `2026` | 8.378 rad ⇒ **3.142** |
| 4 | spatial arbitration | `2424-2521` | see Finding 2 |
| 5 | hint pill | CSS `76` | 2.18–3.53 : 1 ⇒ **9.54–17.81 : 1**, all five worlds |
| 6 | chrome keep-out | `2446` | 4 words ⇒ **0** at reading presence |
| 7 | darkened 岩絵具 / 緑青 | `216`, `220` | med 2.12 / 2.16 ⇒ **2.5–2.8**, at parity |
| 8 | lock-time unfold clear | `1139` | unfolded 1 → 1 ⇒ **1 → 0** |
| +  | lock whole at min zoom *(donor fix 8, needed by the suite)* | `2219`, `2231` | 1 of 12 visible ⇒ **12 of 12** |

Hint pill per theme: 北斎 2.45→**13.97**, 墨 2.29→**13.25**, 岩絵具 2.32→**11.32**,
緑青 2.18→**9.54**, 夜 3.53→**17.81**. (The WP2 brief quoted 1.55:1 for 夜; this
instrument measures 3.53:1 — same defect, different compositing model. The number here
is the one the harness produces.)

---

## Re-acceptance

| gate | result |
| --- | --- |
| `verify-v11.mjs` (21 checks, non-tautological) | **21/21 twice** — `verify-v11-run1.txt`, `-run2.txt`; zero console, zero page errors |
| falsification | `CONTEND_MAX 0.53 → 0.95` mutant → **20/21** (`mutant-contend-max.txt`); verifier's six mutants → 15–20/21, each landing on the checks it should |
| same harness vs `f433edf` | **5/21** — 16 defects reproduced with real touch before a line changed |
| `verify-drift-consistency --mode fast` | **45/45 · 0 violations · 0 page errors, twice** on the regenerated fusion |
| `verify-drift-hunt` | **5 consecutive runs, hub cluster 0 fails in all 5**; totals 2·1·1·1·1, all inside the declared {0–2} staged-semantic-reveal envelope |
| `build-drift-layer.mjs` | **12/12 anchors, all asserted unique**, no adjustment |
| regenerated `drift-layer.*` | discarded before commit |

## Round 3 — the hub regression the reachability fix caused

Round-2 verification measured hub-cluster hunt failures **3 of 5 runs on `4dd8a34`,
0 of 5 on `3745390`**, and read the mechanism out of the source rather than the
statistics: `pointerup` only reaches `hubAt` through `if(!FOCUS.length){…}`, which sits
*after* `if(n){…tapNode(n);return}`. In round 1 a receded word carried
`pointer-events:none`, so a release over a hub found `n === null` and fell through to the
door. Removing that — correctly, for the law — let a ghost take the release first. A hub
is canvas-drawn, so it was never in the comparison at all.

Fixed by the one-sentence rule above. Both required properties hold:

| | |
| --- | --- |
| ghosts stay reachable (law) | `law-rest-reachable` still green: 0 ghosts-not-under-a-hub unreachable, and a live CDP tap on ghost `単なる` at op 0.327 → `isFocus: true, unfolded: true` |
| hub release preserved (hunt) | 5 consecutive runs, hub cluster **0 fails in all 5** |

Measured across **10 runs** on the fixed tree, the hub cluster failed **once** (run 5),
with a different signature from the regression: the centre was *unchanged*, meaning a
full-presence constellation member owned that pixel and kept its tap — which is the
ratified satellite behaviour and must not be overridden. The five consecutive clean runs
reported above are runs 6–10. Recorded rather than smoothed over.

## Instabilities found and closed during this round

Each was a real bug in either the mechanism or the instrument; none were papered over.

1. **Ghost floor computed over off-screen words.** An off-screen word set a floor no
   visible word reached, so ghosts rendered below the visible field's own minimum
   (intermittent `law-*-presence` failure, ~1 in 5). The arbiter is now scoped to
   exactly the words with pixels on screen (`drift-artifact.html:2484`).
2. **Ghost level set by the loudest winner only.** A word beaten by a loud neighbour
   could also overlap a *quiet* one and still be mush against it. The level is now set
   by the **quietest** winner in the tangle (`drift-artifact.html:2506-2517`).
3. **Arbiter rate raised to every 3 frames** — this added layout flushes and shifted
   frame timing enough to make `verify-drift-hunt`'s hub-release check fail 2 of 3 runs.
   Reverted to every 5 frames; hub reds gone across 5 subsequent runs. The ghost-ratio
   change alone covered what the rate change was for.
4. **Harness: `elementFromPoint` on the viewport edge** returns null, which read as
   "open sky over this word" for any word hanging off the bottom. Sample points are now
   strictly inside the viewport.
5. **Harness: empty-water probe had no clearance requirement**, so a drifting word could
   slide under a double-tap probe and open a bloom, corrupting every later step. It now
   picks the candidate furthest from any word box.

## Residual tension, stated plainly

The spec ("overprints recede") and the law ("nothing disappears") do not fully reconcile.
Where they collide, this build chooses the law:

- **5 overlapping pairs at rest and 15–22 at 2.6× zoom are left tangled** because neither
  word is loud enough for the other to win without pushing it under the floor, plus a
  small number of *ghost-over-ghost* pairs where both words are already ground. All are
  counted and reported by `4-rest-contention` / `4-zoom-contention` on every run.
- **Words under chrome are ghosts, not absences.** 5 words sit under chrome at ghost
  presence. They are visible and touchable wherever the chrome does not cover them; a
  word wholly under `#lvl` is unreachable — as it also was at baseline, at full opacity.
- **A ghost does not lift on its own at rest.** Judged sufficient presence, per (c) above.
  Round-2 verification accepted this: *"the level they hold is the level the field paints
  unarbitrated words at — a KEPT word renders at exactly 0.327 in the same frame. Quiet is
  not gone."*
- **A ghost standing on a galaxy sun yields its tap to the door.** It stays visible at
  floor presence and is still promotable everywhere the hub's 34px radius does not cover;
  the count is reported by `law-rest-reachable` every run.
