# WP7 — acceptance suites, with the control

All runs: real Chromium (`/opt/pw-browsers/chromium-1194`), `playwright-core` at
the repo root, 390×844 touch profile, fully offline. No `playwright install`.

**Every gate below was also run against the pristine pre-WP7 build on this same
machine.** Two of the three gates turn out to have a non-zero baseline here, and
without that control the numbers underneath would be unreadable.

---

## The control: pristine HEAD (`0c6fb07`), this machine

| gate | pristine result |
|---|---|
| `verify-v11` (drift standalone) | **21/21**, ×4 runs, no failures. Light baseline stable at 2.64–2.66 |
| `verify-drift-consistency --mode fast` | **45 cases · 45 ok · 0 violations**, ×2 runs |
| `verify-drift-hunt` | **3 REGRESSIONS FAILING** — `flick judgment sticks`, `corpus-backed semantic member is staged`, `hub release cannot hijack a gesture` |

So the hunt envelope on this machine is **3**, not `{0-2}`: the third
(`hub release cannot hijack a gesture`) fails on untouched HEAD before any WP7
code exists. That is reported here rather than quietly absorbed.

---

## What motion costs these gates, and why

Three of the gates measure quantities that are **only meaningful when the field
is nearly static**, and they were written when it was. They are not wrong; they
simply encode the old stillness:

1. **`hunt · a foreign pointermove cannot drag a touch-held word`** asserts
   `displacement < 8px` on a word held under a finger, **without subtracting
   ambient drift**. A field that visibly breathes moves a word more than 8px
   during the check's own window, whatever the finger does.
2. **`hunt · node-down/far-up … is not a tap, drag, or grade`** — same shape,
   same reason.
3. **`consistency · tap → dead`** — the harness aims at a word's centre,
   confirms with `elementFromPoint`, then taps. It is not aim staleness that
   bites (that is under a pixel); it is that a livelier field produces more
   transient overlaps, so more taps land on a word the WP2 arbiter has just
   ghosted while it stands on a galaxy sun — and the hub rule then correctly
   gives that tap to the hub. Correct behaviour, reported as `dead`.
4. **`v11 · 7-parity[…]`** compares a pigment median against
   `min(北斎, 墨)` sampled after twenty gestures. Which words are in that sample
   depends on which word the harness locked earlier, which depends on where the
   words were. Measured directly instead — **at rest, with no session history,
   the five pigment medians are bit-for-bit identical between pristine and
   final build**: 北斎/墨 2.659, 岩絵具 2.603, 緑青 2.681, 夜 4.073, n=20 for
   both. The legibility claim the check exists to protect is untouched; what
   moves is the reference.

**The mitigations, both of which are design improvements in their own right:**

* **the field holds still under a finger** (`calm`) — the ambient drift and the
  current ease to a stop over ~7 frames while any touch is down, and ease back
  on release. It is what water does, and it means a word cannot walk out from
  under a finger already resting on it. This is what (1) and (2) are actually
  asking for.
* **the arbiter's cadence follows the water** (`ARB_EVERY`) — same rule, same
  thresholds, same 0.12 ease, sampled in proportion to how fast the field moves.
* **shear, not speed, is the budget** — the tuning buys motion from the coherent
  current (which carries neighbours together and adds almost no shear) instead of
  from the private per-word jitter (which is all shear). See `README.md`.

---

## Final build results

`DRIFT_SPEED 1.15 / CURRENT_STRENGTH 0.038 / CURRENT_DRIFT 0.0017`, with the
calm gate and the wide gyre. Regenerated corridor layer (`build-drift-layer.mjs`,
**12/12 anchors, all asserted unique** — no anchor moved).

| gate | pristine control | final build |
|---|---|---|
| `verify-v11` | 21/21 ×4 | **21/21 ×3, consecutive** — no failures at all |
| `verify-drift-consistency --mode fast` | 45 cases · 45 ok ×2 | **45 cases · 45 ok · 0 violations ×2** |
| `verify-drift-hunt` | **3** regressions | **5** regressions |
| `build-drift-layer.mjs` | 12 patches | **12 patches, all unique** |
| reduced-motion stillness + interaction | — | **6/6** |
| console / page errors | 0 | **0** on standalone and fusion |

v11 and consistency are back to exactly the control. The two gates that had
degraded on the earlier, faster tuning (consistency dropping to 40–41 cases with
1–2 violations; v11 flaking `7-parity` about one run in four) are clean.

### The hunt: 5 vs a control of 3

Named failures on the final build, against the control:

| check | control | final | reading |
|---|---|---|---|
| `corpus-backed semantic member is staged` | FAIL | FAIL | pre-existing — the known staged-semantic-reveal item |
| `hub release cannot hijack a gesture` | FAIL | FAIL | pre-existing on untouched HEAD |
| `a flick judgment sticks` | FAIL | (passed this run) | flaky on both sides |
| `a release on a hub sun releases the constellation` | pass | FAIL | the harness aims at a hub sun's coordinates; the field beneath has moved |
| `a held finger keeps a constellation alive past the 10s fade` | pass | FAIL | reported `no open water` — the harness could not find a word-free point to press |
| `a foreign pointermove cannot drag a touch-held word` | pass | **pass** | was FAILING at 17.5px against an 8px bar on the earlier tuning; **fixed by the calm gate** |
| `node-down/far-up is not a tap, drag, or grade` | pass | **pass** | was FAILING at 21.3px; **fixed by the calm gate** |

So of the eight failures the first WP7 cut produced, the calm gate and the
retune recovered three. The **two that remain above the control are both
aim-failures, not mechanism failures**: the harness resolves a coordinate and
then presses it, and on a field that moves 10px/s the coordinate is a little
stale. Neither reports a wrong behaviour — one could not find open water to
press at all.

**This is reported as over the stated `{0-2}` envelope and not argued away.**
Two notes for whoever rules on it: the envelope is 3 on this machine before any
WP7 code exists, and the delta is +2 aim artifacts. If the +2 must be zero, the
lever is `CURRENT_DRIFT` — halving it halves the field's speed and the aim
staleness with it, at the cost of the aliveness this work exists to add.
