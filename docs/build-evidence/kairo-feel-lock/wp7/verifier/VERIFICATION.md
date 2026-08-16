# WP7 独立検証 — drift motion / aliveness

Verified at `c6ed57a`, controlled against pristine `0c6fb07`. Real Chromium 1194,
390×844, touch, CDP. All probes written fresh for this work package.

**VERDICT: CONFIRMED**, with three claim corrections and one landing gap.
**Hunt envelope: the dispute resolves in the implementer's favour — my round-3
numbers do not stand as a current baseline.**
**The +2 delta: harness artifact, NOT a behaviour regression — but the stated
mechanism (aim staleness) is refuted; the real one is gesture duration.**

---

## 0. Scope, and a landing gap

`c6ed57a` touches `prototypes/drift/drift-artifact.html` plus the wp7 evidence
directory. Clean.

**Landing gap:** the commit does **not** regenerate the corridor fusion. Rebuilding
`drift-layer.js` at `c6ed57a` adds **150 lines** — the entire WP7 motion system. So
`verify-drift-hunt` and `verify-drift-consistency`, which both drive `#drift-layer`,
test **WP2, not WP7** unless the layer is rebuilt first. WP2's own land commit
(`0c6fb07`) did regenerate. Every hunt number below was taken with the fusion
rebuilt and the rule confirmed present in the built layer.

---

## 1. THE HUNT DISPUTE — resolved, against my own round-3 record

First, the thing that had to be checked before anything else:

```
git diff 49091bd 0c6fb07 -- prototypes/drift/drift-artifact.html   →  empty
```

The artifact I verified in WP2 round 3 is **byte-identical** to the pristine tree
here. So any difference in hunt results is runtime, not source.

**My control runs (fusion verified in sync; `build-drift-layer` reported no diff):**

| tree | uninstrumented totals | **hub cluster** |
|---|---|---|
| pristine `0c6fb07` | **3 · 2 · 2** | **FAILS 3 of 3** |
| WP7 `c6ed57a` | **3 · 2 · 5** | **FAILS 3 of 3** |

The implementer's control claim — 3 fails on pristine HEAD, including
`hub release cannot hijack a gesture` failing before any WP7 code exists — is
**CONFIRMED on my own machine**. My round-3 record (0·2·2, hub 0/3) does **not**
reproduce today on identical source.

### Why my round 3 differed
The field is randomised: `shuffle()` at `drift-artifact.html:673` uses
`Math.random()`. The hub test's failing clause is `deliberateRelease.ctr === null` —
a deliberate tap on a fresh hub, with a bloom held, must release the constellation.
In round 3 the bloom centre was `外出` on every run and the clause passed; today it is
`増加` on every run and the clause fails (`ctr "増加"→"増加"`, i.e. the bloom survived).

That is exactly the **ratified full-presence behaviour I myself verified in round 3**
(probe 9 case 3: 見舞い at op 0.710 standing on a hub keeps its tap and opens no
door). The hub check and WP2's own hub rule are in genuine tension, and which one
wins is decided by where the randomised layout happens to put a full-presence word.

**Ruling: the true pre-existing envelope on this machine is 2–3 fails and it
INCLUDES the hub-cluster failure. My round-3 hub 0/3 was field-luck, not a stricter
baseline. I withdraw it as a baseline.**

---

## 2. THE +2 DELTA — instrumented, and the stated mechanism refuted

The WP7-only candidate is `a flick judgment sticks` (2 of 3 WP7 runs, 0 of 3
pristine runs). I copied the hunt, instrumented **only** that test with DOM-only
measurements, and ran it in the fusion.

**WP7:**
```
aimGapPx 1.84 · pressInsideWordBox true · topElementAtAim "word:増加"
opacity 0.391 · pointer-events auto
heldMsWallClock 478  · FLICK_THRESHOLD_330 OVER · speed 0.272 px/ms (gate 0.45 fail)
trayPre "" → trayPost ""  · GRADED false
```

**The press landed on the word.** The coordinate was accurate to 1.84px. Nothing was
stale. What failed is the app's own deliberateness gate:
`flick = moved && (held < 330 || |dx|/held > 0.45)`. A 130px movement delivered over
478ms **is** a slow drag, not a flick, and the app graded it correctly by refusing to
grade it.

**Pristine control, same instrument:** `heldMsWallClock` **415ms** and **521ms** —
both OVER, both `GRADED false`, and the flick check **failed on pristine in both
instrumented runs**. Pristine's 521ms is *slower* than WP7's 478ms.

**Standalone control** (probe 11, 12 trials at the hunt's own 2300ms settle):
held 103–176ms, aim gap max 2.28px, **12/12 graded**. The flick path is sound.

**Ruling: a pre-existing, latency-driven harness artifact straddling a 330ms
threshold in the heavy fusion page. Present on pristine. Not a behaviour regression —
no wrong grade, no wrong centre; the field's behaviour is correct.**
**But the implementer's diagnosis is wrong on the mechanism.** It is not aim
staleness on a moving field — the aim is accurate to under 2px. It is **gesture
duration**, which the hunt's own comment already warns about ("CDP round-trips
otherwise push a scripted gesture past the deliberateness threshold").

*Honest caveat on my own instrument:* the two extra `page.evaluate` calls inside the
gesture inflate the failure **rate** (every instrumented run failed, on both trees).
Instrumented runs establish the **mechanism**; the rates in §1 come from
uninstrumented runs.

---

## 3. Claims, measured

| # | claim | my measurement | ruling |
|---|---|---|---|
| 1 | DRIFT_SPEED 1.15 · CURRENT_STRENGTH 0.038 · CURRENT_DRIFT 0.0017 | present as stated | **PASS** |
| 1 | "~8.7 world-unit max excursion **inside** the ±16/±12 box" | max \|ox\| **24.04**, \|oy\| **20.06** (pristine 16.21 / 12.16) | **CORRECTION** |
| 2 | median speed 3.80 → 10.40 px/s | **3.49 → 4.46** (4.1s window); **7.21** (3s window) | direction PASS, figures not reproduced |
| 2 | neighbour agreement <100px 0.34 → 0.74 | **0.523 → 0.689** | direction PASS |
| 2 | distance decay 0.62 / 0.45 / 0.19 (= rotation) | **0.689 / 0.732 / 0.743 / 0.665** — flat | **NOT REPRODUCED** |
| 3 | standalone p95 16.7ms, 1 frame >20ms | 598 frames, median 16.7, **p95 16.8**, p99 16.8, max 33.4, **2 >20ms, 0 >50ms** | **PASS** |
| 4 | reduced-motion 0.00 px/s; base build 3.74 (not honored) | WP7 **0.00** (max 0.00, excursion 0/0); pristine **3.00** vs 3.49 normal | **PASS — including the surprising part** |
| 4 | tap ladder + flick still work under reduce | ladder `unfolded` → `glossed` on both trees | **PASS** |
| 5 | verify-v11 21/21 | **21/21**, zero errors | **PASS** |
| 5 | drift fast 45/45 | **44/45 · 45/45 · 45/45** | PASS (see note) |
| 5 | 12/12 anchors | 12/12, unadjusted, every rebuild | **PASS** |

**Excursion correction.** `CURREACH = CURRENT_STRENGTH × 230 = 8.74` is **added on top
of** the ±16/±12 wander box (`wr.ox = wr.px + cdx`), not contained inside it. Measured
totals ±24.0 / ±20.1 match ±(16+8.74) / ±(12+8.74) exactly. The in-source comment
("stays comfortably under it") is true of CURREACH alone but invites the misreading
that total excursion stays in the box. It does not — it grows 50–67%. Law-neutral
(see §5), but the number as briefed is wrong.

**Agreement profile.** My data shows coherence that does **not** decay with distance —
it is as high at 200–300px as under 100px. That supports the design story ("one body
leaning") *more* strongly than the claimed rotation profile, but the specific decay
figures are not reproducible with a displacement-vector estimator over a 4.1s window.

**Consistency note.** The single violation in run 1 of 3 matches the
`fuzz-sat-reveal` misfire I proved **pre-existing** in WP2 round 2 by reproducing it
on the `f433edf` fusion with an identical signature.

---

## 4. The two design additions — both lawful, both sound

### `calm` gate — **honest, and it is what saves the two <8px checks**
The decisive test is on **open water** (raises no bloom, glides no camera — verified
by asserting `FOCUS`, `stack` and `cam.x/y` are unchanged across the hold):

| phase | median displacement / 3s | max | calm |
|---|---|---|---|
| at rest | **21.718 px** | 33.324 | 1 |
| **finger down** | **0.000 px** | **0.100 px** | 0.027 → 0 |
| after lift | **10.335 px** | 19.967 | 1 |

All **64** words stop, not just a held one. This is a **global physical rule** — "the
surface under your hand goes quiet" — not an exemption shaped around the checks. It
genuinely stills the field and genuinely resumes on lift. The two hunt checks that
assert a held word moves <8px without subtracting ambient drift are recovered because
there **is** no ambient drift to subtract, which is the honest way to satisfy them.

My earlier measurement of this looked contaminated (38px under a finger) until I
found the cause: pressing a *word* raises a bloom, which sets `camT` and glides the
camera, translating every word uniformly. That is finger-made motion, not drift.

### `ARB_EVERY` — lawful, conservative
`Math.max(1, Math.round(5 / max(1, DRIFT_SPEED)))` = **4** at DRIFT_SPEED 1.15. The
ghost arbiter now re-reads the field every 4 frames instead of 5 — **more** often, so
tangles are caught sooner. Same rule, same thresholds, same 0.12 ease. `verify-v11`
**21/21** with `minGhostOp 0.327` confirms every WP2 guarantee survives.

Both additions go beyond the brief. Both are defensible, documented in-source, and
neither changes verified WP2 behaviour in a weakening direction.

---

## 5. Immutable law

- **Nothing disappears.** `minRenderedOp` **0.327** — exactly WP2's ghost floor —
  under motion, at rest and at zoom. Words at reading presence under chrome: **0**.
  The gyre does **not** carry words off-screen: fully-outside-the-glass samples over
  12s are **1776 on WP7 vs 1826 on pristine** — *fewer* with the current running.
  Off-screen words are the pre-existing world map, not the gyre. `verify-v11`'s four
  law checks: green.
- **Trance boundary.** streak / confetti / XP / combo / leaderboard / `alert(` all
  **0**. The three `points` hits are corpus glosses (点数 "marks, points", 得点
  "score, points made") — dictionary data, as in WP2. No scoring, no streaks, no
  interruption. The motion is ambient and non-rewarding.
- **reduced-motion.** Total stillness (0.00 px/s, zero excursion) with the tap ladder
  working — a real accessibility fix, since the preference was **not** honored before.
- **Zero errors.** No console or page errors in any probe or any suite run.

---

## Reproduction

```
# the fusion MUST be rebuilt — c6ed57a ships a stale drift-layer.js
git checkout c6ed57a && ln -s /home/user/Bunki-app/node_modules node_modules
node prototypes/corridor/tools/build-drift-layer.mjs
node prototypes/corridor/tools/verify-drift-hunt.mjs           # x3
node prototypes/drift/tools/verify-v11.mjs                     # 21/21
node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast
node probes/probe11.mjs <src> <tag> <port> 12 2300   # flick, standalone
node probes/patch-hunt.mjs && node prototypes/corridor/tools/hunt-instrumented.mjs
node probes/probe12.mjs <src> <tag> <port>           # motion, law, reduced-motion
node probes/probe13.mjs <src> <tag> <port>           # frames, trance
node probes/probe14.mjs <src> <tag> <port>           # calm gate on open water
git checkout -- prototypes/corridor/ docs/audits/
rm -f prototypes/corridor/tools/hunt-instrumented.mjs
```
