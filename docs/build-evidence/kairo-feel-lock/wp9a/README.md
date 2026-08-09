# WP9a — can the Drift pool cycle the whole tier?

**No, it could not.** At the default zoom, between **23% and 35%** of the N1/N2/N3
tiers and about **78%** of N4/N5 was all a learner could ever read at their own
tide stop — not "rarely", not "eventually": *never*, at any camera position, for
any length of session, on a fresh install. The rest of the tier existed only as
3-pixel ink dots.

The cause is one line, and it is not a paging bug. It is that there was no
paging at all: the chooser's tie-break was a fixed per-word hash, so the same 64
words won the same contest forever. Not "the pool pages too slowly" — the pool
had no time coordinate at all.

The fix is a rotating tie-break turned by a pan odometer. It is constructed so
that at rest it is provably a no-op — the same 64 words, in the same order — and
departs from that only while the finger is already swimming.

Everything below is reproducible from the three scripts in this directory.

---

## 1 · The mechanism as found (`eeae6c5`)

There is no spawn pool and no recycler queue. `buildWorld()` gives **every** word
a permanent world coordinate and the camera pans over that fixed map.

Line references below are against the **post-fix** file; where the fix moved
something, the pre-fix line is given in brackets.

| what | `prototypes/drift/drift-artifact.html` | notes |
| --- | --- | --- |
| the tier — `WALL` | **801–808** | 52 seed words (`const W`) + `wbig.json` minus seed duplicates + 5 hand-added N1 words = **6,693 entries** |
| permanent world layout | `buildWorld()` **960–1002** [922–964] | hub centroid + hash jitter, or pure hash scatter; world is 3.2 × viewport on each axis |
| the priority | `rePri()` **1003–1027** [965–971] | recomputed only on `buildWorld` and on `tideChange` |
| the chooser | `refreshActive()` **1028–1062** [972–1006] | runs every 650 ms; the sort is **1037** [985] |
| everything else | the canvas word pass **2485–2552** | a word that is not chosen is drawn as a 3-px dot, with no text and no touch target |

```js
// refreshActive(), as found
vis  = every word whose world point projects inside viewport + 140px
vis.sort((a,b) => b.pri - a.pri)
target = vis.slice(0, 64)          // these become readable, tappable DOM
```

```js
// rePri(), as found
pri = (lm===0 ? 8 : lm===1 ? 2.4 : 0)      // lm = |wordLevel − tide|
    + (store.unknown[w] ? 1.6 : 0)
    + (seedFragile      ? 0.8 : 0)
    + ((strHash(w) >> 2) % 100) / 100      // ← fixed per word, forever
```

`pri` is read in exactly one place — that sort. `buildDeck()` (**814–822**) looks
like a pool but is not the field's: `deck` is consumed only by the constellation
dive's sibling search (**1560**) and refilled by words leaving a dive or a flick
(**1706**, **1817**).

### An aside on the tier size

The campaign brief says the bundle carries **7,910 graded words**. That number is
real but it is the *corridor's* — `prototypes/corridor/data/share_alike/words.json`
has 7,910 graded entries, and it is what `docs/prototype/verification-report.json`
counts. The **Drift field's own tier is `WALL` = 6,693**, and the drift layer in
the fusion is generated from that same source, so 6,693 is the number every table
below is against. Per level: N1 2,279 · N2 1,489 · N3 1,837 · N4 535 · N5 553.

---

## 2 · The reachable-set argument

Two facts make the pre-fix reachable set decidable from the mechanism, without
sampling.

**(a) The chooser is time-invariant.** Nothing in `pri` varies with the clock,
the frame count, the pan distance, or anything else. For a fixed tide and a
fixed `localStorage`, the top-64 at a given camera pose is a *constant*. Panning
away and back gives the identical answer; a session of any length gives the
identical answer. (The one time-varying term, `wr.gradedAt` at **1034**,
suppresses a word for 180 s *after you grade it* — it can only free a slot for a
word you already reached.)

**(b) Own-level words fill all 64 slots before any other level takes one.**
Minimum own-level `pri` is `8 − 0.99 = 7.01`; maximum near-level `pri` is
`2.4 + 1.6 + 0.8 + 0.99 = 5.79`. So the contest at tide *L* is purely among
level-*L* words whenever 64 or more of them share the window.

Therefore the reachable set at tide *L* is a pure geometry problem:

> **R(L) = { w : level(w) = L, and there exists a camera pose C such that w is
> visible at C and fewer than 64 level-L words with higher `pri` are also
> visible at C }**

`reachable-set.mjs` computes exactly this by reproducing `strHash` (`Math.imul`,
`>>>`), `buildWorld`, `rePri` and the `camClamp` bounds bit-for-bit and sweeping
the camera over its **entire** clamped range on a 240×240 lattice. Results are
stable from a 60×60 lattice upward (±0.5%), so this is a converged answer and
not a sample.

### What "reachable" means here, precisely

R(L) is the reach of the **ambient field** — the words the drift puts up on its
own as you swim. It is not the only door: `relationsFor()` (**1271**) and the
bloom / constellation-lock / dive paths scan the whole of `WORDS` and can
materialise a word that `refreshActive` would never pick. Those paths are real
and they are not counted above, deliberately, for two reasons:

1. they are **consequences of a word you could already reach** — you have to tap
   or long-press something that surfaced first, so they extend the ambient
   reach rather than replace it; and
2. they deliver ~12–16 *related* words at a time, which is a different thing
   from cycling a 2,279-word tier.

So the honest statement of the pre-fix defect is: *the drift's own field could
never show you most of your level; you could only reach the rest by already
knowing a neighbour of it and asking.*

### Why words are stranded: the window cannot separate a pile

`buildWorld` places words that share a kanji hub within ±115 (or ±172) world px
of the same centroid. The visible window at `z = 1` is 670 × 1124 world px —
larger than a whole pile in both axes. A pile therefore travels into and out of
the window *as a unit*; no amount of panning ever isolates a member from its
neighbours. If a pile holds more than 64 same-level words, the ones with low
hash lose every contest that will ever be held.

---

## 3 · Per-level table — BEFORE

`node reachable-set.mjs --grid 240` · viewport 390 × 844 · fresh `localStorage`.

| tide | tier at this level | reachable at z=1.00 (default) | at z=2.60 (max pinch-in) | at z=0.34 (max pinch-out) |
| --- | --- | --- | --- | --- |
| N1 | 2,279 | **540 (23.7%)** | 1,681 (73.8%) | 68 (3.0%) |
| N2 | 1,489 | **527 (35.4%)** | 1,246 (83.7%) | 67 (4.5%) |
| N3 | 1,837 | **518 (28.2%)** | 1,390 (75.7%) | 67 (3.6%) |
| N4 | 535 | **424 (79.3%)** | 535 (100%) | 67 (12.5%) |
| N5 | 553 | **426 (77.0%)** | 553 (100%) | 70 (12.7%) |

Stranded at the default zoom: **1,739 of N1**, 962 of N2, 1,319 of N3, 111 of N4,
127 of N5 — including ordinary words like 世界, 海, 青, 言う, 理解, 情報, 感情.

Pinching all the way in recovers a lot (the window shrinks, so the piles
separate) but never all of it for N1–N3, and it is not something the gesture
grammar asks a learner to do in order to see their own level.

### Empirical confirmation, real Chromium

`node instrument-pool.mjs --probe sweep --zooms 1 --grid 40 --agree 64` drives
the real prototype at 390 × 844.

The sweep uses a *mirror* of the chooser (same `WORDS`, same source-computed
`wr.pri`, same `w2s`, same pad, same 64 — only the DOM mount is skipped, which is
what makes a dense sweep affordable). The mirror is **not taken on trust**: the
run first re-walks 64 poses per tide calling the source's own `refreshActive` and
compares its `ACTIVE` set to the mirror's pick.

```
agreement N1 z=1: 64/64 poses identical      N1 z=1 — own-level surfaced 529/2279 (23.2%)
agreement N2 z=1: 64/64 poses identical      N2 z=1 — own-level surfaced 524/1489 (35.2%)
agreement N3 z=1: 64/64 poses identical      N3 z=1 — own-level surfaced 515/1837 (28.0%)
agreement N4 z=1: 64/64 poses identical      N4 z=1 — own-level surfaced 422/535  (78.9%)
agreement N5 z=1: 64/64 poses identical      N5 z=1 — own-level surfaced 426/553  (77.0%)
page errors: 0
```

The browser reproduces the static ceiling to within the lattice resolution
(1,600 poses vs 57,600). The ceiling is real.

---

## 4 · The fix

`prototypes/drift/drift-artifact.html`, three sites, **+38 lines net**:

| site | lines | what |
| --- | --- | --- |
| `camClamp()` + the paging block | **907–945** | one added call (`pageOdometer()` at **910**) then `PAGE_SPAN`/`PAGE_CYCLE` **934**, `pagePhase` **935**, `pageOdometer()` **936–944**, `pageOf()` **945**. `camClamp` is the single choke point every camera move already goes through (pinch **2299**, drag **2316**, the `camT` ease **2885**, inertia **2889**) |
| `rePri()` | **1003–1027** | `pri` keeps the level band and the two judgment bonuses; the hash moves out to `wr.h01` (**1024**), the word's seat on the wheel |
| `refreshActive()` | **1037** | the sort adds `PAGE_SPAN * pageOf(wr)` |

```js
const PAGE_SPAN=2.0, PAGE_CYCLE=40000;
function pageOdometer(){                       // called from camClamp — the one
  if(panOdoX!==null){                          // choke point every camera move
    const d=Math.hypot(cam.x-panOdoX,cam.y-panOdoY);
    if(d<200) pagePhase=(pagePhase+d/PAGE_CYCLE)%1;   // a teleport is not swimming
  }
  panOdoX=cam.x; panOdoY=cam.y;
}
const pageOf=wr=>wr.h01<pagePhase?wr.h01-pagePhase+1:wr.h01-pagePhase;
...
wr.h01=((strHash(e[0])>>2)%100)/200+0.5;       // the OLD tie-break, rescaled
...
vis.sort((a,b)=>(b.pri+PAGE_SPAN*pageOf(b))-(a.pri+PAGE_SPAN*pageOf(a)));
```

The wheel slides a 64-wide window over the tier's hash-rank space: at phase *p*
the winners are the words seated cyclically just below *p*, so as *p* completes a
turn the window sweeps every word in the pile.

### Why `PAGE_SPAN` is exactly 2 — the rest state does not move

`h01` is the shipped tie-break rescaled from its true range into `[0, 1)`, so

```
PAGE_SPAN * h01  =  2 * (((strHash>>2) % 100)/200 + 0.5)  =  oldTieBreak + 1
```

— a **constant +1 on every word in the field**, which is no reordering at all.
A tide that has not been panned yet therefore chooses the same 64 words this file
has always chosen, down to the tie order. `paging-sim.mjs` asserts this rather
than claiming it:

```
phase-0 identity check: max |PAGE_SPAN*h01 - (oldTieBreak + 1)| = 0 over 6693 words
```

and the simulation's `frozen` column (the new wheel with the phase pinned at 0,
walking the identical random path) comes out **bit-identical to the pre-fix
chooser** on every row — coverage and eviction count both. That equality is
enforced by a `throw` in the script, so it cannot silently rot.

The same identity, checked in the browser on the **fixed** source with the wheel
held still (`--pin-phase 0`), against the pre-fix numbers from §3:

| tide | pre-fix source, sweep | fixed source, `--pin-phase 0` |
| --- | --- | --- |
| N1 | 529 / 2279 (23.2%) | **529 / 2279 (23.2%)** |
| N2 | 524 / 1489 (35.2%) | **524 / 1489 (35.2%)** |
| N3 | 515 / 1837 (28.0%) | **515 / 1837 (28.0%)** |
| N4 | 422 / 535 (78.9%) | **422 / 535 (78.9%)** |
| N5 | 426 / 553 (77.0%) | **426 / 553 (77.0%)** |

Identical on every tide, and `agreement … 64/64 poses identical` on all five
(the mirror now carries the page term, so this is a real check on the post-fix
chooser too). Logs: `sweep-fixed-pinphase0.txt`.

For contrast, the *same* sweep on the fixed source **without** `--pin-phase`
reaches 598 / 588 / 583 / 453 / 435 (`sweep-fixed-unpinned.txt`) — the grid's
own 25–54 px steps are under the odometer's teleport guard, so the walk turns
the wheel as it goes. That number is a union over (pose, phase) pairs, not a
ceiling; it is reported here only because the difference between the two runs is
itself the clearest single demonstration that the wheel is doing the work.

### A signedness quirk that had to be understood first

`strHash` returns a full uint32 but the tie-break shifts it with `>>`, the
**signed** shift, so `% 100` is *negative* for the ~half of words whose hash has
bit 31 set. The shipped term has always spanned `(-0.99, 0.99)`, not `[0, 0.99)`.

Harmless as a static rider on an 8.0 band — but fatal to a naive wheel, and it
cost a full iteration to find. The first cut of this fix kept the signed shift
and rotated `((strHash>>2)%1000)/1000` directly. Because a negative seat makes
`(h01 − phase) mod 1` negative too, roughly half the words rode *below* the
wheel at every phase and never took a turn at the top: coverage stopped at
**55% of N1** and **23% of N4**, and the level-band bound was silently broken as
well (a −3.0 page term drops an own-level word to 5.0, under a near-level
word's ceiling).

The `/200 + 0.5` form turns the quirk into the mechanism: it maps the full
signed range monotonically onto `[0, 1)`, so every word gets a seat. That it is
also exactly the affine map making `PAGE_SPAN = 2` identity-preserving is the
reason the fix ends up this shape rather than a tuned one.

### Why the seat is coarse (199 seats, not one per word)

Words sharing a seat share a score, and `Array.prototype.sort` is stable, so the
64-slot boundary cuts a seat the same way from one tick to the next. Measured on
N1 at `--drags 2000`, a 1,000-seat wheel raised on-glass fades from **2.16 to
3.52** per tick with the wheel merely *frozen*; a 200-seat wheel raised them to
**2.60** for the same coverage — and once the seat became the identity-preserving
form the frozen figure returned to the pre-fix number exactly. Seat granularity,
not the rotation, was the whole of that cost.

### The bounds, checked

* **Level bands still absolute.** Own-level floor `8` > near-level ceiling
  `2.4 + 1.6 + 0.8 + PAGE_SPAN = 6.8`. A tide never shows a neighbour's word in
  preference to its own.
* **`PAGE_SPAN` (2.0) is below the maximum judgment bonus (2.4).** So a word the
  learner has marked *unknown* **and** which is a fragile seed word outranks a
  plain word at every phase. That is deliberate — "unknown" means *show me this*
  — and it only strands anything if more than 64 such words share one window.
  There are 52 fragile seed words in the entire file (≤ 30 at any one level), so
  in practice this needs 64+ deliberate swipe-lefts inside a single screen of
  world. Stated, not hidden.

---

## 5 · Per-level table — AFTER

`node paging-sim.mjs --drags 3000` · viewport 390 × 844 · a random walk of finger
drags (40–360 world px each, in 6 sub-steps so `camClamp` and the odometer see
honest increments), the chooser run every drag. All three columns walk the
identical path.

| tide | tier | reachable BEFORE (ceiling) | covered AFTER, 13.4 cycles | Δ |
| --- | --- | --- | --- | --- |
| N1 | 2,279 | 533 (23.4%) | **2,249 (98.7%)** | +1,716 |
| N2 | 1,489 | 527 (35.4%) | **1,487 (99.9%)** | +960 |
| N3 | 1,837 | 517 (28.1%) | **1,819 (99.0%)** | +1,302 |
| N4 | 535 | 422 (78.9%) | **535 (100%)** | +113 |
| N5 | 553 | 426 (77.0%) | **553 (100%)** | +127 |

The BEFORE column is a *ceiling* — no amount of further drifting raises it. The
AFTER column is a *curve* still climbing when the run ended.

### Time to full cycle

One turn of the wheel is `PAGE_CYCLE = 40,000` world px of pan ≈ **47
screen-heights** ≈ 133 drags of 300 px. Coverage against pan distance:

| tide | 1 cycle | 2 cycles | 4 cycles | 8 cycles | 13 cycles |
| --- | --- | --- | --- | --- | --- |
| N1 | 1,300 (57%) | 1,525 (66%) | 1,779 (78%) | 2,088 (91%) | 2,203 (96%) |
| N2 | 1,056 (70%) | 1,132 (76%) | 1,281 (86%) | 1,408 (94%) | 1,470 (98%) |
| N3 | 1,129 (61%) | 1,287 (70%) | 1,470 (80%) | 1,697 (92%) | 1,776 (96%) |
| N4 | 500 (93%) | 500 (93%) | 520 (97%) | 535 (100%) | 535 (100%) |
| N5 | 510 (92%) | 511 (92%) | 535 (96%) | 552 (99%) | 553 (100%) |

### The previously-unreachable words, in the real page

`node instrument-pool.mjs --probe prove --sample 20` takes an **evenly-strided
sample** (not a prefix) of the exact words `reachable-set.json` recorded as
unreachable at default zoom, parks the camera on each one, and swims — small
24 px increments pushed through the source's **own** `camClamp`, so the source's
own `pageOdometer` turns the wheel — with the source's own `refreshActive`
running each round. A hit requires the word to be in `ACTIVE`, to have a live
`wr.node`, for that node's element to be `isConnected`, and for its `.base` text
to equal the word. The leash is 240 world px, so the word stays inside the
visible window throughout: this measures the wheel, not the camera hunting.

| tide | pre-fix unreachable | sampled | now surface as real DOM | median pan | worst pan |
| --- | --- | --- | --- | --- | --- |
| N1 | 1,739 | 20 | **20 / 20** | 14,400 px | 25,803 px |
| N2 | 962 | 20 | **20 / 20** | 18,882 px | 36,457 px |
| N3 | 1,319 | 20 | **20 / 20** | 17,760 px | 30,217 px |
| N4 | 111 | 20 | **20 / 20** | 470 px | 29,737 px |
| N5 | 127 | 20 | **20 / 20** | 470 px | 27,272 px |

**100 / 100, no misses, 0 page errors.** Every worst case is inside one turn of
the wheel (40,000 px), which is what the budget was set to test. N4/N5's median
of 470 px is the first round — those words sat just below the pre-fix cut and the
smallest turn of the wheel lifts them over it.

**One cycle already more than doubles every tier's reach**; saturation takes
~8–13 cycles because coverage is a coupon-collector over (region × phase) — the
walk has to be in each corner of the sky at each part of the turn. In wall-clock
terms, one cycle is a couple of minutes of continuous drifting and full
saturation is a long session or several short ones. `PAGE_CYCLE` is the single
lever if the operator wants that faster, at a proportional cost in on-glass
exchange.

---

## 6 · The trance boundary

The law is that nothing leaves the glass except a deliberate flick. Two
measurements, both in `paging-sim.mjs`.

**Hold still and nothing moves.** The wheel is turned by the pan odometer and by
nothing else, so a camera at rest cannot re-sort the field however long
`refreshActive` keeps ticking. 600 ticks with the finger off the glass, phase
pinned mid-rotation so this is not a special case of phase 0:

```
N1 evictions=0 · N2 evictions=0 · N3 evictions=0 · N4 evictions=0 · N5 evictions=0
```

**Swim and the exchange hides inside the pan.** The recycler already fades words
out on-glass as the pan brings louder ones into view — that is pre-existing
behaviour, and the honest question is how much the wheel adds to it. Words faded
while their world point is still inside the viewport, per 650 ms tick:

| tide | BEFORE (whole glass / centre half) | wheel FROZEN | wheel TURNING |
| --- | --- | --- | --- |
| N1 | 2.24 / 0.70 | 2.24 / 0.70 | 3.04 / 0.93 |
| N2 | 2.19 / 0.64 | 2.19 / 0.64 | 2.72 / 0.85 |
| N3 | 2.22 / 0.63 | 2.22 / 0.63 | 2.71 / 0.78 |
| N4 | 1.95 / 0.53 | 1.95 / 0.53 | 2.33 / 0.66 |
| N5 | 2.50 / 0.69 | 2.50 / 0.69 | 2.79 / 0.79 |

`FROZEN` equalling `BEFORE` exactly is the phase-0 identity showing up in the
dynamics. The cost of the turning wheel is about **+0.2 additional soft fades per
second in the centre half of the glass, and only while the finger is actively
dragging** — roughly one extra 600 ms dissolve every five seconds of swimming, in
a field that is already dissolving three a second there because of the pan
itself.

Nothing else about the fix touches presence: the WP2 arbiter, the ghost floor,
the pinned-word guards (`hl` / `lk` / `walked` / `focusN` / `hlDom` / unfolded),
WP7's gyre and calm gate, and the WP6 variants are all untouched. `localStorage`
schemas are untouched.

---

## 7 · Risks, and what this does not claim

* **Saturation takes a long session.** One turn of the wheel is ~47
  screen-heights of pan, and N1/N3 need 8–13 turns to pass 95%. The first turn
  more than doubles the reach, which is the difference that matters, but "the
  whole tier eventually" is measured in tens of minutes of drifting, not
  minutes. `PAGE_CYCLE` is the lever, and turning it down costs on-glass
  exchange proportionally. **Not tuned further here** — that is a feel call.
* **The wheel does not turn on zoom.** `pageOdometer` measures `cam.x`/`cam.y`
  only, so pinching does not page. Pinching in already surfaces a different set
  by shrinking the window (README §3), so the two mechanisms are complementary,
  but a learner who only ever pinches never pages.
* **A learner who marks 64+ own-level words *unknown* inside one screen of world
  can still starve a plain word there.** `PAGE_SPAN` (2.0) is below the maximum
  judgment bonus (2.4) by construction — that is what makes the phase-0 identity
  exact. Raising `PAGE_SPAN` above 2.4 would remove this at the cost of the
  identity (and of the rest state the v11 laws were verified against). The
  trade was made deliberately in favour of the identity.
* **The coverage numbers come from a simulation, not from a 40-minute browser
  session.** The chain that makes it trustworthy is: the sim's chooser is
  validated against the real `refreshActive` 64/64 poses per tide by
  `instrument-pool.mjs --probe sweep --agree`; the sim's `frozen` column exactly
  reproduces the pre-fix chooser, which the browser sweep independently
  confirms; and `--probe prove` shows previously-unreachable words surfacing as
  real DOM in the real page under the real `camClamp`/`pageOdometer`. What is
  *not* directly measured is a multi-hour human session.
* **`refreshActive` still culls on-glass.** That is pre-existing (the pan has
  always faded words out while they were visible) and the fix adds ~+0.2 such
  fades per second in the centre half, only while dragging (§6). It was not
  removed, because forbidding on-glass culls entirely lets `ACTIVE` grow past
  its 64-node DOM budget — a perf regression traded for a legibility one. Stated
  rather than silently accepted.
* **`wr.gradedAt`, `store.unknown`, and the `localStorage` schema are
  untouched.** So are the WP2 arbiter, WP7's gyre/calm, and the WP6 variants.

---

## 8 · Files

| file | what |
| --- | --- |
| `reachable-set.mjs` | the static pre-fix ceiling; keeps the old formula inline so the BEFORE column stays reproducible after the fix landed |
| `reachable-set.json` | its output at `--grid 240`, including the full unreachable word list per level |
| `instrument-pool.mjs` | real Chromium. `--probe sweep` (ceiling + mirror-vs-`refreshActive` agreement), `--probe drift` (real CDP touch session), `--probe prove` (previously-unreachable words, in the page) |
| `prove.json` | the `--probe prove` result — 100/100, no misses |
| `sweep-fixed-pinphase0.txt`, `sweep-fixed-phase0.json` | the phase-0 identity in the browser: the fixed source with the wheel held still reproduces the pre-fix ceiling exactly |
| `sweep-fixed-unpinned.txt` | the same sweep with the wheel free, for contrast |
| `paging-sim.mjs` | pan-session simulation, BEFORE / FROZEN / AFTER on an identical path, plus the phase-0 identity assertion, the coverage curve and the trance accounting |
| `paging-sim.json` | its output at `--drags 3000` |
| `run-v11-control.sh` | `verify-v11` on the fixed source and on the pre-fix source extracted from git, same machine, same count |
| `v11-fixed-{1,2,3}.json`, `v11-prefix-{1,2,3}.json` | its six runs |
| `drift-fast.txt`, `drift-fast-report.json` | `verify-drift-consistency --mode fast`, ×2 |
| `hunt-fixed.txt`, `hunt-prefix.txt` | `verify-drift-hunt` on the fixed build and its same-session control |
| `suites.md` | every acceptance gate, with its control |

No instrumentation was added to `drift-artifact.html`. The probes reach the
source's own top-level `const` bindings (`cam`, `WORDS`, `refreshActive`,
`camClamp`, `WORDIX`, `ACTIVE`) by name — a classic top-level `<script>` puts
them in the realm's global lexical environment, so `page.evaluate` can see them
without a debug hook.
