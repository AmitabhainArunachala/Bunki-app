# WP2 独立検証 — verifier report

Verified at `3745390` (detached; implementer branch `worktree-agent-a44c6ed5a4ffb4670`
was locked by its own worktree). Base `f433edf`, two commits on top.
Real Chromium 1194, 390×844, `hasTouch`/`isMobile`, CDP `Input.dispatchTouchEvent`.
All probe scripts written from scratch by the verifier; none import `verify-v11.mjs`.

**VERDICT: CONFIRMED with one LAW-CONFLICT.**

Every mechanism the implementer claims is really in the source and really fires under
real touch. Three of the seventeen harness checks, however, are **tautological** — they
cannot fail once the mechanism is present, because the mechanism's action is to push
words below the threshold the check measures at. And the mechanism that satisfies them
takes ~30% of the resting surface below perceptibility with no user action, which
conflicts with the immutable law.

---

## 1. Harness runs (reproduced)

| run | result | errors |
|---|---|---|
| `verify-v11.mjs` run 1 | **17/17** | none |
| `verify-v11.mjs` run 2 | **17/17** | none |
| `verify-v11.mjs --src f433edf` (baseline) | **2/17** | none |

Baseline reproduced exactly as claimed, including the same 15 failures.

## 2. Corridor suite (reproduced)

| tool | result |
|---|---|
| `build-drift-layer.mjs` | css 14 KB · markup 2.0 KB · js 598 KB · **12 patches, all asserted unique**, no anchor adjustment |
| `verify-drift-consistency --mode fast` run 1 | **45 / 45 ok · 0 violations · 0 page errors** |
| `verify-drift-consistency --mode fast` run 2 | **45 / 45 ok · 0 violations · 0 page errors** |
| `verify-drift-hunt` run 1 | 2 FAIL |
| `verify-drift-hunt` run 2 | 2 FAIL |

Both hunt failures on both runs are the two staged-semantic-reveal cases
(`a corpus-backed semantic member is staged…`, `a kana-only semantic word grows a
meaningful same-level fallback constellation`). Inside the declared {0–2} envelope,
inside the declared cluster. **No refutation.** Generated files were regenerated,
compared, then discarded (`git checkout -- prototypes/corridor/ docs/audits/`).

## 3. Diff scope

`e147575` touches `prototypes/drift/drift-artifact.html` (+171/−14) and
`prototypes/drift/tools/verify-v11.mjs` (new, 535 lines). `3745390` is evidence only.
No generated file (`prototypes/corridor/drift-layer.{css,js}`,
`docs/audits/drift-consistency-report.json`) is committed. **In scope.**

---

## 4. Per-claim, verifier's own numbers

| claim | verifier probe | result |
|---|---|---|
| pinch dive-latch | entered dive (stack=1), one pinch-IN → stack 1→0, **z 1.000 → 1.000** | **PASS** |
| rotation clamp ±π | 3×160° → **3.142**; 5×160° → **3.142**; 4×−160° → **−3.142** | **PASS** |
| double-tap return-to-rest | messy z=2.600 rot=2.618 → **single tap: z 2.600, rot 2.618 (no change)** → **double tap: z 1.000, rot 0.000** | **PASS** (and the single-tap control proves the double-tap is what does it) |
| lock B folds A's unfold | unfolded 1 → **0**, lockOn=true, members=12 | **PASS** |
| lock survives min zoom | z=0.340, lockOn=true, focus=12, **visible=12** | **PASS** |
| lock release clean | lockOn=false, unfolded=0 | **PASS** |
| hint pill contrast ≥9.5:1 all five | steady state (after the 1.2 s fade completes, element opacity=1): 北斎 **13.97**, 墨 **13.25**, 岩絵具 **11.32**, 緑青 **9.54**, 夜 **17.81** | **PASS** — min 9.54, exactly at the claimed bound |
| darkened 岩絵具 / 緑青 | only `wcol` changed, hue preserved, darkened (`#C39143`→`#8C5F1E`, `#47885E`→`#356B49` / `#47885E`→`#2E6B49`, `#4C6CB3`→`#38539A`, `#5C8A46`→`#3F6A2E`). `accent`/`pool`/`halo` untouched | **PASS** |
| overlap fraction at rest | **see §5 — measurement artifact** | **PASS as measured, FAIL as claimed** |
| chrome overlap count 3 → 0 | **see §5 — measurement artifact** | **PASS as measured, FAIL as claimed** |
| tap ladder | tap1 → `word unfolded bctr`; tap2 → `+ glossed`; tap3 → stack=1 (dive) | **PASS** |
| flick judgment | right flick → tray `済み 1`; left flick → tray `拾った 1 · 済み 1` | **PASS** |
| trance boundary | no score/streak/confetti/XP/combo/leaderboard/alert. The 5 `score` + 1 `badge` hits are corpus vocabulary glosses in `WBIG` | **PASS** |
| red for readings/warnings only | only red elements: `#seal` `#B13A2F` (the 分 hanko, brand) and `#tray b` `#EB6101` (朱 accent, a count). No new palette recolours a "go here" affordance | **PASS** |
| zero console / page errors | 0 across every probe | **PASS** |

---

## 5. The three tautological checks

`resolveCollisions()` sets `n.collideTarget = 0.10`; final opacity is `n.op * collide`
and free words sit at `n.op ∈ [0.34, 0.70]`, so a receded word renders at
**0.035 – 0.067** DOM opacity. (The claim "recedes to 0.10 opacity" overstates what the
learner sees by roughly 2×.)

`overlapStats()` and `chromeOverlap()` in the harness skip any word with
`opacity < 0.42`. Since `0.10 × 0.70 = 0.07 < 0.42`, **a receded word is excluded from
the measurement by construction**. Checks `4-rest-overlap`, `4-zoom-overlap` and
`6-chrome-keepout` cannot fail once the arbiter runs, regardless of what the screen
looks like.

Verifier's own overlap measurement at the resting surface, same frame, two thresholds:

| threshold | words counted | worst overlap fraction | pairs > 0.25 |
|---|---|---|---|
| 0.42 (the harness's) | 29 | **0.000** | **0** |
| 0.02 (everything rendered) | 48 | **0.897** | **13** |

The baseline at `f433edf` measured `worst = 0.88`. **The geometry did not change.**
Nothing moved apart. 14–15 words were dimmed out of the metric.

Chrome keep-out is the same story. The three words the baseline flagged under chrome
were `たんなる単な` (lvl), `とりあげる取` (lvl), `ぎし技師` (brand). The verifier's receded-word
list at rest is `単なる, 万一, 武器, 納める, 取り上げる, 印刷, 技師, 件, 知合い, 新鮮, 煮える, 発行, 作品, 生やす`
— containing all three. They are still geometrically over the chrome; they are 5%-opaque.

The arbiter's trigger is also aggressive: `ox*oy > min(4·a.hw·a.hh, 4·k.hw·k.hh) * 0.16`
suppresses the **entire** word when 16% of its box tangles, so a word 83% of which was
perfectly readable is removed whole.

---

## 6. LAW JUDGMENT — "Nothing on screen disappears except via a deliberate flick judgment"

### **LAW-CONFLICT.**

Three independent measurements, all at the resting surface with **zero user input**:

**(a) It is not perceptibly present.** Composited against each theme's ground, a receded
word's contrast ratio is **1.028 – 1.150 : 1** (max channel delta 6.9 – 13.9 of 255):

| theme | receded | min ratio | max ratio | max channel Δ |
|---|---|---|---|---|
| 北斎 | 12 | 1.052 | 1.102 | 13.92 |
| 墨 | 12 | 1.044 | 1.127 | 13.36 |
| 岩絵具 | 13 | 1.051 | 1.103 | 12.73 |
| 緑青 | 14 | 1.028 | 1.094 | 12.33 |
| 夜 | 13 | 1.072 | 1.150 | 11.97 |

Residual-signal test — screenshot, then `display:none` **that one word**, screenshot,
diff its own box. If deleting it changes nothing, it was not there:

| | mean RGB Δ from deleting it | % of its pixels changing > 8 levels |
|---|---|---|
| **RECEDED** words | **2.2 – 14.1** (typically 3–5) | **0.3 – 28 %** |
| **KEPT** control words | **17.4 – 36.2** | **50 – 95 %** |

A receded word carries roughly **one sixth to one eighth** of the signal of a present
word. The faintest (`武器`, op 0.035) changes 0.3–0.7% of its own pixels by more than 8
levels when deleted outright — it is indistinguishable from ground, and the ground is
not flat: canvas ink blobs, stars and motes carry noise of comparable amplitude.

**(b) It is untouchable.** `n.collide < 0.4` sets `pointer-events: none`. Every receded
word in every probe read `pe: "none"`. The learner cannot reach it even if they see it.

**(c) It does not come back.** The implementer's defense is "an eased opacity floor the
arbiter lifts again the moment the tangle clears". At rest this is empirically false —
words hold fixed world positions, so the tangle never clears on its own. Five receded
words sampled every 3 s for **45 s with no input**:

```
知合い 生やす 単なる 万一  取り上げる
0.045 0.049 0.052 0.063 0.063   ×15 samples
```

Fifteen identical samples; one single blip (`取り上げる` → 0.367 at t=30 s) out of 75
readings. A separate 24 s watch: 12 of 14 receded words still receded, same set.
Only a **camera pan** lifts them — and it recedes a fresh set in exchange
(13 receded before a pan → all 13 restored → 16 newly receded).

So: at the resting surface, **14–15 of ~48 rendered words (~30%)** drop below
perceptibility and below touch, with no user action, and stay there until the learner
moves the camera. The law reserves disappearance for a deliberate flick judgment.
This is disappearance by arbitration.

Two honest counterweights, recorded so the judgment can be re-argued:
- The affected words *were* overprinted or under chrome. Something had to give.
- Some receded words keep a genuine ghost (`新鮮` in 岩絵具/緑青 reaches max channel Δ 86–90
  when deleted). The recede is not uniform erasure — it is erasure at the low end and a
  faint watermark at the high end.

Neither changes (b) or (c). A watermark you cannot touch, that does not return, is gone.

**Not fixed here — reported only, per the verifier's remit.**

---

## 7. Collateral findings

1. **`themeContrast()` forces the measured state.** It sets `hint.style.opacity = '1'`
   before reading. At the moment the harness measures, the pill's live computed opacity
   was **0 in all five themes**. The number is still fair — an independent measurement
   1.6 s after `setHint()` reproduced 13.97 / 13.25 / 11.32 / 9.54 / 17.81 at element
   opacity 1 — but the check as written would pass even if the hint never rendered.
   Caveat: during the 1.2 s CSS fade the pill sits below 4.5:1 (measured 2.75 – 5.66 : 1
   at opacity 0.524). Transient, not a defect.
2. **`3-rot-clamp` is satisfiable by `rot = 0`.** `Math.abs(sr.rot) <= π + 0.01` passes if
   the twist never registered at all. The observed 3.142 is real (verifier reproduced it
   independently, and reproduced −3.142 in the negative direction), but the assertion
   does not require the gesture to have worked.
3. **`nearestWord()` filters `opacity < 0.35` and `pointerEvents === 'none'`** — the
   harness routes around receded words by design, so no check ever probes one.
4. **The claim "recede to 0.10 opacity"** is the multiplier, not the rendered value.
   Rendered is 0.035 – 0.067. Worth correcting in MEASUREMENTS.md.

---

## Reproduction

```
git checkout 3745390
ln -s /home/user/Bunki-app/node_modules node_modules
node prototypes/drift/tools/verify-v11.mjs                       # 17/17
git show f433edf:prototypes/drift/drift-artifact.html > /tmp/baseline.html
node prototypes/drift/tools/verify-v11.mjs --src /tmp/baseline.html --port 8941   # 2/17
node prototypes/corridor/tools/build-drift-layer.mjs             # 12/12 anchors
node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast   # 45/45
node prototypes/corridor/tools/verify-drift-hunt.mjs             # 2 fails, semantic-reveal cluster
git checkout -- prototypes/corridor/ docs/audits/
```

Verifier probe scripts sit in `probes/` (run them with node from the repo root with a
`node_modules` symlink in place); their measurements are in `data/`:

- `probes/probe.mjs`  → overlap at two thresholds, receded-word census, 24 s rest watch,
  per-theme perceptibility, rotation clamp, single-vs-double-tap, pinch dive-latch
- `probes/probe2.mjs` → arbiter ON/OFF shots, recede-lifts-on-pan, 45 s rest watch,
  hint live-state and fade decay
- `probes/probe3.mjs` → hint steady-state contrast, lock/unfold, tap ladder, flick,
  trance-token and red-affordance audits
- `probes/probe4.mjs` → whole-frame pixel diff, arbiter ON vs OFF, all five themes
- `probes/probe5.mjs` → residual-signal test (`display:none` one word, diff its own box),
  receded vs kept control
- `data/probe1-and-2-console.txt` → raw console for the two probes that crashed in a
  late non-load-bearing section after printing every measurement
- `shots/rest-arbiter-{ON,OFF}.png`, `shots/yoru-arbiter-{ON,OFF}.png` → what the arbiter
  takes off the resting surface in 北斎 and in 夜
