# WP6 — the tap-ladder variants: both built, neither ruled on

Two open settings on the Drift tap ladder, each with two positions, each
position fully working under every combination of the other. **No position is
marked better, recommended, current-and-therefore-right, or scheduled to win —
here, in the UI, or in the code.** The operator rules by feel. This directory
records only what each position does and that all four combinations work.

---

## 1 · Where the variants live

| what | file | line refs |
| --- | --- | --- |
| the mechanism (both settings) | `prototypes/drift/drift-artifact.html` | `V_LADDER` **216** · `V_SATTAP` **222** · `driftTapSet` **225–231** · `window.__DRIFT_TAP__` **232** · URL seeding **233–236**; the ladder itself in `tapNode` **1986–2050** |
| the two strip rows | `prototypes/corridor/corridor.js` | `VARIANTS.ladder` **153–161** · `VARIANTS.sattap` **162–171**; defaults in `S.variants` **249–250** |
| the strip → layer seam | `prototypes/corridor/corridor.js` | in `render()` at **3325–3329** (`window.__DRIFT_TAP__.set`) |
| the row UI itself | `prototypes/corridor/corridor.js` `renderVariants()` (**3244+**) and `corridor.css` `#variants .vrow/.vseg` (**918–1010**) | unchanged — the new rows are ordinary `VARIANTS` entries and inherit `min-height: var(--tap)` = 44px |

There was **no separate drift variants surface** to follow. The drift artifact
carries operator *tunables* (`DRIFT_SPEED`, `CURRENT_STRENGTH`, `CURRENT_DRIFT`,
WP7) but no switchable-variant UI; the only drift-related variant that existed
was `entry: 'drift'` in the corridor's `VARIANTS`. So the established pattern is
the corridor strip, and that is what these two rows join — same shape
(`{ ticket, label, en, options: [[id, 日本語, english], …] }`), same rendering
path, same URL-parameter seeding, same `aria-pressed` state.

The mechanism could not live in `corridor.js`: the ladder is `tapNode` inside the
drift source, and the corridor fusion is *generated* from that source. So the
drift source owns the two variables and exposes `window.__DRIFT_TAP__`; the strip
only names the setting and hands the reading across. The standalone drift
artifact is equally switchable through `?ladder=…&sattap=…`, which is how every
probe here drives it.

### The two settings, stated neutrally

**F · 触れの段 / tap ladder** — how many taps a word takes from untouched to its
full entry.

| position | rung 1 | rung 2 | rung 3 | rung 4 |
| --- | --- | --- | --- | --- |
| `stage3` (三段) | forefront + family + reading | English | entry | — |
| `stage4` (四段) | forefront + family | reading | English | entry |

**G · 衛星の触れ / satellite tap** — what the first tap on a constellation
satellite does.

| position | first tap | second tap |
| --- | --- | --- |
| `staged` (段階) | the satellite reveals itself where it stands (reading + English) | it becomes the planet with its own family |
| `recenter` (即中心) | it becomes the planet at once, with its own family, standing on rung 1 of whichever ladder F is on | — (it is now a centre word and climbs F) |

`stage3` and `staged` are the values the field already shipped with, so a field
nobody has switched behaves as it did. That is a statement about continuity, not
a verdict.

---

## 2 · Persistence — what was found, and what was decided

**Found:**

* `kairo-corridor-v1` (`corridor.js:293-299`) writes exactly
  `{ taken, lists }`. `loadStore` (`corridor.js:281-291`) reads exactly those two
  keys. **The schema carries no variant state at all.** Every existing variant
  row — cards, difficulty, contrast, entry, depth — is session-only, seeded from
  the URL at `boot()` (`corridor.js:397-401`) and never persisted.
* `bunki-drift-v1` (`drift-artifact.html:817-828`) writes exactly
  `{ known, unknown, lk, lu }` — the learner's judgments. Also no variant state.

**Decided: session-only, URL-seedable — no schema change of any kind.** The
brief said additive keys were permissible *only if the schema already carries
variant state*; neither schema does, so nothing was added to either store. The
two rows behave exactly like the five rows beside them: they survive a click,
they do not survive a reload, and `?ladder=stage4&sattap=recenter` puts them
where you want them. Measured, not asserted — see
`data/variant-strip.json`, checks `persistence · neither row writes itself into
kairo-corridor-v1` and `persistence · a plain reload … comes back on them`.

---

## 3 · The 2×2 probe matrix

`probes/probe-ladder-matrix.mjs` → `data/ladder-matrix.json`.
Real Chromium 390×844, touch, CDP touch events, standalone drift source, every
combination entered through the URL seam. **Rung state is read from rendered
style, not from class names**: the reading and the English are the computed
opacity of the word's own `.yomi` / `.gloss` spans, the forefront is
`focusN === node` *and* the painted `.bctr`, the family is `FOCUS.length`, the
entry is `stack.length`. A rung that flipped a class without painting anything
fails here.

**51/51 checks passed · zero console/page errors.**

| combination | centre-word ladder, rung by rung | satellite tap |
| --- | --- | --- |
| **stage3 + staged** | 1: forefront ✓ family 14 reading 1 english 0 stack 0 · 2: english 1 stack 0 · 3: stack 1 | tap1 reveals in place (reading 1, english 1), planet keeps its seat, family set unchanged · tap2 → the satellite is the centre with a new family of 14 |
| **stage3 + recenter** | 1: forefront ✓ family 14 reading 1 english 0 stack 0 · 2: english 1 stack 0 · 3: stack 1 | tap1 → centre "救う"→"風呂敷", forefront ✓, family 14, new set; lands on rung 1 of stage3, so reading 1 |
| **stage4 + staged** | 1: forefront ✓ family 14 **reading 0** english 0 stack 0 · 2: reading 1 english 0 stack 0 · 3: english 1 stack 0 · 4: stack 1 | tap1 reveals in place, planet keeps its seat · tap2 → the satellite is the centre with a new family of 14 |
| **stage4 + recenter** | 1: forefront ✓ family 14 **reading 0** english 0 stack 0 · 2: reading 1 english 0 stack 0 · 3: english 1 stack 0 · 4: stack 1 | tap1 → centre "救う"→"風呂敷", forefront ✓, family 14, new set; lands on rung 1 of stage4, so **reading 0** |

Also asserted for every combination:

* no rung before the last one dives (`stack` is 0 at every earlier rung);
* the four-rung ladder's extra rung does **not** rebuild the constellation under
  the finger (family 14→14, centre unchanged between rung 1 and rung 2);
* the walked word and the tapped satellite are present at every rung, never
  `pointer-events: none`, never below the field's ghost floor (measured
  opacities 0.94–1.00 throughout) — the trance law that nothing disappears, and
  the WP2 arbitration floor, both hold at the new pacing;
* switching a live field to stage4 + recenter and back leaves a three-rung ladder
  with the reading on the first rung (`leak · after stage4+recenter and back`);
* an untouched field is stage3 + staged and behaves as the landed build does.

Corridor-side, on the fused surface: `probes/probe-variant-strip.mjs` →
`data/variant-strip.json`, **20/20, zero errors**. Both rows render; every
position measures **126 × 44 px** in the bilingual chrome *and* in 日本語のみ;
labels carry 日本語 + english (三段|3-stage, 四段|4-stage, 段階|staged,
即中心|instant recenter); the shipped position is the one pressed on arrival;
pressing a position moves `window.__DRIFT_TAP__` **and the layer's live
behaviour follows** (with 四段 pressed a first tap on a word raises 14 satellites
and reads nothing; back on 三段 the same tap reads at once).

---

## 4 · The defaults are indistinguishable — measured differentially

Three independent lines, in increasing strength:

**(a) The code path.** With `V_LADDER === "stage3"` the `stage4` rung-1 block is
skipped entirely and the bloom call reduces to
`if (canBloom && (true || …)) bloomFocus(n)` — literally the original
`if (n.kind === "word" && stack.length === 0 && !lockOn) bloomFocus(n)`. With
`V_SATTAP === "staged"` the recenter branch is skipped entirely. On the defaults
there is no reachable new statement.

**(b) A seeded A/B differential.** `probes/probe-default-parity.mjs` →
`data/default-parity.json`. `Math.random` is replaced by a seeded xorshift in an
init script (the same trick `verify-drift-consistency` uses for its fuzz), so the
landed source (`HEAD`) and this one build the same field from the same deck. A
identifies the words to walk; **B is then forced onto exactly those words**, so
the comparison is of behaviour and never of which word the field happened to
offer. After every gesture a semantic trace is taken — planet, satellite set,
unfolded set, glossed set, dive depth, lock state, `FOCUS` membership, depth
crumb, tray, card — and compared exactly. (`words`, the live node count, is
excluded: the 650 ms recycler moves it on wall-clock time and two browser
contexts never agree on it.)

> **3/3 seeds, 20 traced states each, 0 differing.** Words walked: 救う · 生物 ·
> 触れる (centre ladders) and 日光 · 症状 with satellites 七日 · 上下. Zero errors
> on both sides.

Honest caveat: the world layout comes from `strHash`, not from the deck, so the
seed shifts the population but not where a given word sits — the three seeds are
less independent than the count suggests. Breadth comes from the five distinct
words walked, not from the seeds.

**(c) The suites.** See §6.

---

## 5 · The four-rung ladder against the v11 coherence instrument

The extra rung changes reveal *pacing*: the arbiter now sees a word that is
forward and blooming but not yet read, a state the field never produced before.
So the whole v11 suite was run under all four combinations rather than argued
about — `probes/v11-under-every-combo.mjs` →
`data/v11-under-every-combo.json`. It writes four scratch copies of the drift
source with the two initial values rewritten and runs `verify-v11 --src` on each.

| combination | v11 | errors |
| --- | --- | --- |
| stage3 + staged | **21/21** | none |
| stage3 + recenter | **21/21** | none |
| stage4 + staged | **19/21** | none |
| stage4 + recenter | **19/21** | none |

**Reported as measured and not adjusted.** Every law check — `law-rest-presence`,
`law-rest-reachable`, `law-ghost-residual`, `law-zoom-presence`,
`4-rest-contention`, `4-zoom-contention`, `6-chrome-keepout` — passes in all four.
The two that drop under `stage4` are both the suite counting rungs:

* `1-pinch-surface-nobleed` taps a word **three** times to open a dive, then
  pinches in. Under stage4 three taps land on the English rung, so the dive never
  opens and the check reports *"could not enter a dive (stack=0)"*.
* `8-unfold-clear-on-lock` taps A **once** and requires `unfolded >= 1` before
  locking B. Under stage4 one tap raises the family and reads nothing, so the
  precondition is not met.

That is a claim, so it is made falsifiable: `probes/probe-stage4-v11-preconditions.mjs`
→ `data/stage4-v11-preconditions.json` drives the same two mechanisms with the
budget the four-rung ladder actually costs, asserting the same outcomes
verify-v11 asserts. **5/5, zero errors:**

```
stage4+staged   4 taps opened the dive (stack=1); pinch-in → stack 1->0, z 1->1
stage4+staged   A tapped twice (unfolded=1), locked B → unfolded=0, lockOn=true, members=12
stage4+recenter 4 taps opened the dive (stack=1); pinch-in → stack 1->0, z 1->1
stage4+recenter A tapped twice (unfolded=1), locked B → unfolded=0, lockOn=true, members=12
```

If the four-rung ladder had broken surfacing or the lock's fold, those fail. They
do not. **verify-v11 itself is untouched.**

---

## 6 · Suites

All at the operator profile, real Chromium. Defaults selected unless stated.

| suite | result |
| --- | --- |
| `verify-v11` (standalone drift, defaults) | **21/21**, ERRORS: none — `data/verify-v11-wp6.json` |
| `verify:drift:fast` (fusion) | **45 cases · 45 ok · 0 violations · 0 page errors** |
| `verify-corridor` | **91/91** |
| drift-layer anchors | **12/12 exact-string patches, all asserted unique** — no anchor adjustment was needed |
| `probe-ladder-matrix` (2×2) | **51/51** |
| `probe-variant-strip` (fusion) | **20/20** |
| `probe-default-parity` (HEAD vs WP6) | **3/3 seeds identical** |
| `v11-under-every-combo` | 21/21 · 21/21 · 19/21 · 19/21 (see §5) |
| `probe-stage4-v11-preconditions` | **5/5** |

### One verifier assertion was changed — and strengthened

`verify-corridor.mjs` asserted `stripRows === 5 && ticketRows === 4`. A bare row
total said nothing about *which* decisions were on the strip: it passed for any
five rows and failed for the right seven. It now keeps `ticketRows === 4` and
**names** every non-ticket row that must be present
(`E 奥行`, `F 触れの段`, `G 衛星の触れ`), requiring
`stripRows === ticketRows + namedRows`. That is strictly harder to satisfy than
the number it replaced. No other suite assertion was touched.

### The hunt — and an honest disagreement with the stated envelope

`verify-drift-hunt`, fusion rebuilt, run repeatedly on this machine:

| tree | runs | fails |
| --- | --- | --- |
| **pristine HEAD `1bb7d3c`** (committed fusion; rebuild produces no diff, so it is in sync) | 4 | **4 · 4 · 4 · 6** |
| **WP6, defaults selected** | 4 | **4 · 5 · 5 · 4** |

Raw log with every failing signature: `data/hunt-log.txt`.

Same failing set, same signatures, overlapping ranges, no new *kind* of failure.
The stable core across every run of both trees is three checks —
`a corpus-backed semantic member is staged`, `hub release cannot hijack a
gesture`, `a held finger keeps a constellation alive past the 10s fade ("no open
water")` — with `a flick judgment sticks`, `a kana-only semantic word grows a
fallback constellation` and `a release on a hub sun` coming and going with the
randomised layout (`shuffle()` uses `Math.random()`).

**The revised envelope of 2–3 does not hold on this machine at HEAD, before this
change.** It is reported, not argued away. WP7's own record already contains a
five-fail run on the pristine tree, and its ruling turned on which word the
randomised field happens to place on a hub; the count here is higher again. What
WP6 can say is the comparative claim, which is the one that concerns this work
package: **the hunt is where the tree already was, and the failing set is the
tree's, not the ladder's.** The differential in §4(b) is the stronger statement,
because it holds the field fixed instead of re-rolling it.

---

## 7 · Risks and what is not covered

* **The hunt envelope is over the stated 2–3 before this change.** Above. Not
  this work package's regression, and not this work package's to rule on.
* **`verify-v11` is 19/21 under `stage4`.** Diagnosed as the suite's rung budget
  and proved so with an equivalent-mechanism probe (§5), but the suite itself
  still reports 19/21 under that position. If `stage4` is ever ratified, those
  two checks need their tap budget parameterised — a suite change, deliberately
  not made here, because making it now would encode a ruling.
* **Generated files are not committed.** `drift-layer.js`, `drift-layer.css` and
  `corridor-standalone.html` were regenerated locally to run the fusion suites
  (45/45, 91/91, hunt, strip probe) and then discarded, per the build rules. The
  committed fusion is therefore one commit behind the drift source, exactly the
  landing gap WP7 documented. **A land commit must run `build-drift-layer` and
  `build-standalone` before the fusion suites mean anything about WP6.**
* **The `recenter` position of G is not exercised by any existing suite** —
  `verify-drift-consistency`'s `sat-tap` / `sat-recentre` cases assume the staged
  behaviour. They pass because the default is staged. `recenter` is covered only
  by `probe-ladder-matrix` and `probe-variant-strip` here.
* **Seed independence is weaker than the seed count implies** (§4(b) caveat).
* **Nothing here rules.** If any future reader wants to know which position is
  better, this directory is the wrong place to look, on purpose.

---

## 8 · Re-running everything

```
node prototypes/corridor/tools/build-drift-layer.mjs           # 12/12 anchors
node docs/build-evidence/kairo-feel-lock/wp6/probes/probe-ladder-matrix.mjs
node docs/build-evidence/kairo-feel-lock/wp6/probes/probe-variant-strip.mjs
node docs/build-evidence/kairo-feel-lock/wp6/probes/probe-stage4-v11-preconditions.mjs
node docs/build-evidence/kairo-feel-lock/wp6/probes/v11-under-every-combo.mjs
git show HEAD:prototypes/drift/drift-artifact.html > /tmp/drift-HEAD.html
node docs/build-evidence/kairo-feel-lock/wp6/probes/probe-default-parity.mjs \
     --a /tmp/drift-HEAD.html --b prototypes/drift/drift-artifact.html
node prototypes/drift/tools/verify-v11.mjs
npm run verify:drift:fast
node prototypes/corridor/tools/verify-corridor.mjs
node prototypes/corridor/tools/verify-drift-hunt.mjs
git checkout -- prototypes/corridor/drift-layer.js prototypes/corridor/drift-layer.css \
                prototypes/corridor/corridor-standalone.html
```
