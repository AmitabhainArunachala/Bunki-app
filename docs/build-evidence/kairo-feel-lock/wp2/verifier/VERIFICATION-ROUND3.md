# WP2 独立検証 · round 3 — targeted final check at `49091bd`

Narrow scope, as instructed: diff scope, hunt ×3, verify-v11 ×1, one CDP tap probe,
and the run-5 outlier signature. Everything below is my own measurement.

## VERDICT: **CONFIRMED**. The round-2 hub regression is closed.

---

## (a) Diff scope — CLEAN

Two source files plus wp2 evidence. **No generated files** (`drift-layer.*`,
`docs/audits/*`) in the commit.

- `prototypes/drift/drift-artifact.html` — the pointerup hub rule (L1963-1965),
  `GHOST_REL` deleted, `resolveCollisions` simplified, comments rewritten.
- `prototypes/drift/tools/verify-v11.mjs` — hub-aware reachability accounting,
  contention split into too-quiet-to-win vs ghost-over-ghost, the live-tap probe now
  skips hub points, and the dead `loudestWordAt` call removed.
- `MEASUREMENTS.md`, five hunt run logs, `mutant-contend-max.{json,txt}`,
  `verify-v11-run{1,2}.{json,txt}`, `shots-run1/*`.

**One scope note.** The commit is billed as "pointerup arbitration + constant deletion
+ docs", but `resolveCollisions` also changed behaviour:
`ghost = Math.max(floorOp, GHOST_REL * quietestWinner)` → `ghost = floorOp`.
In every case I ever measured the floor was the binding term — that was my own M3
finding — so this is behaviourally identical in practice. It is not identical in
principle: for a winner above 0.727 the old code would have painted a ghost slightly
*more* present. The new value is still the floor, so it is law-neutral. Recorded
because it is marginally more than a constant deletion, not because it is wrong.

**One harness note.** `unreachedGhosts` now excludes any ghost with `hubPts > 0`. A
ghost unreachable for reasons *other* than a hub, that happens to have one sample
point on a hub, would fall out of the gate. Narrow, disclosed, and reported separately
rather than folded in — and in my run `hubShadowedGhosts = 0`, so the gate is not
being propped up by the carve-out. A note, not a finding.

---

## (b) `verify-drift-hunt` ×3 — hub cluster **0 fails in all 3**

Fusion regenerated from the new artifact before each set (`build-drift-layer`
12/12 anchors, unadjusted) — the committed `drift-layer.js` is stale relative to
`49091bd`, so testing it unrebuilt would have tested the old code. Confirmed the rule
is present in the built layer.

| run | total fails | hub cluster |
|---|---|---|
| 1 | **0 — ALL HUNT REGRESSIONS GREEN** | ok · `hub "見" at (104,296) · held "外出" → ctr null` |
| 2 | 2 | ok · `hub "日" at (284,416) · held "外出" → ctr null` |
| 3 | 2 | ok · `hub "日" at (284,416) · held "増加" → ctr null` |

Both hub tests green in all three runs. Every remaining failure is the two
staged-semantic-reveal cases. Totals 0 · 2 · 2 — **inside the {0-2} envelope.**

## (c) `verify-v11` — **21/21**, zero console, zero page errors

`hubShadowedGhosts = 0`. `law-rest-reachable` green on its own terms: 0 non-hub
ghosts unreachable, live tap on ghost 単なる (op 0.327) → `collide 1, isFocus true,
unfolded true`. Presence and residual bars unchanged from round 2.

---

## (d) My own CDP tap probes — all four PASS

| # | case | measured | verdict |
|---|---|---|---|
| 1 | ghost in **open water** | 万一, op **0.327**, collide 0 → `isFocus true, unfolded true, op 0.94, collide 1` | **promotes** ✓ |
| 2 | ghost standing **on a hub** | 刑事, collide **0**, on hub at (44,278) → `stack 0→1, depth "" → "事"`, ghost not focused, not unfolded | **the door answers** ✓ |
| 3 | **full-presence** word on a hub | 見舞い, op **0.71** → `ctr "見舞い"`, isFocus true, **stack unchanged** | **word outranks the hub** ✓ |
| 4 | **the round-2 regression scenario** | bloom held (focus 14, centre 流れる); 稼ぐ painted at **op 0.111 with collide 1**, standing on a hub → release gives `focus 14→0, ctr null` | **constellation freed, word did not eat it** ✓ |

Case 4 is the one that matters. I measured the exact state their correction is about —
**rendered opacity 0.111 while the arbiter's flag reads 1**, because a constellation
suspends arbitration. A `collide`-keyed rule would have missed it; the rendered-opacity
rule catches it. Their correction to my prescription is right, and I can now show the
number that makes it right.

---

## (e) The run-5 outlier — I **agree** it is ratified behaviour

Probe case 3 above verifies the mechanism directly: a word at full presence standing on
a hub keeps its tap and the door does not open. That is the stated rule, and it is
ratified elsewhere in the same suite ("a 44px near-miss under a lock forgives instead
of razing", "tapping a constellation label answers instead of razing it").

**The discriminator is the signature, and it is sound:**
- `ctr` **unchanged** → the held centre kept its own tap. The centre can never be a
  ghost (the arbiter exempts `focusN` and `hlDom`, and the bloom paints the centre at
  full presence), so this cannot be a ghost stealing the release.
- `ctr` becomes a **different word** → a ghost took it. That is the regression.

**Correction to my own round-2 numbers, for the record.** My "3 of 5" mixed the two
signatures:

| round-2 run | signature | classification |
|---|---|---|
| run 1 | `hub "一" (74,446) · held "外出" → ctr 外出` | *unchanged* — the now-ratified family |
| run 2 | `hub "見" (74,296) · held "外出" → **ctr 万一**` | ghost steal |
| run 5 | `centre="増加"` (expected 外出) | ghost steal |

So round 2 was **2 of 5 unambiguous ghost-steals plus 1 benign**, against 0 of 5 on
`3745390`. The regression was real and the fix is real; my count was one high.

---

## Collateral — their CONTEND_MAX mutant

I rebuilt it myself (`0.53 → 0.95`) and scored **19/21**, not the 20/21 they report:

```
FAIL law-rest-reachable   ghosts not under a hub with no reachable point: 2
                          (知合い op 0.327 · 煮える op 0.327, openPts 0)
FAIL law-ghost-residual   ghost mean Δ 12.16/7.29/23.94 vs kept 16.57/18.98/30.79
census: 36 words · 12 ghosted   (vs 5 on the shipped constant)
```

Raising CONTEND_MAX lowers `winMin` to 0.344, so far more words qualify to take
someone's water — 12 ghosts instead of 5 — and the surplus ghosts end up buried and
below the residual bar. The constant does visible work and **is** falsifiable, which is
their claim; my run simply catches it on two checks instead of one. `GHOST_REL` is
confirmed gone from the source (`typeof GHOST_REL === 'undefined'` at runtime).

---

## Reproduction

```
git checkout 49091bd
ln -s /home/user/Bunki-app/node_modules node_modules
node prototypes/corridor/tools/build-drift-layer.mjs      # REQUIRED: layer is stale in-commit
node prototypes/corridor/tools/verify-drift-hunt.mjs      # x3
node prototypes/drift/tools/verify-v11.mjs                # 21/21
node .../verifier/round3/probes/probe9.mjs                # open water + full-presence-on-hub
node .../verifier/round3/probes/probe10.mjs               # ghost-on-hub + the bloom regression case
git checkout -- prototypes/corridor/ docs/audits/
```
