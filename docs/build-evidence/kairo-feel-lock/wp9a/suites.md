# WP9a — acceptance gates

All runs on this machine, real Chromium (`/opt/pw-browsers/chromium-1194`),
`playwright-core` from the repo root, 390×844 touch profile, fully offline.

The change under test is `prototypes/drift/drift-artifact.html` (the paging
wheel) plus the regenerated `drift-layer.js` and `corridor-standalone.html`.
`drift-layer.css` is byte-unchanged — the fix touches no style.

---

## Generator parity

| gate | result |
| --- | --- |
| `build-drift-layer.mjs` | **12 patches, all asserted unique** — no anchor moved |
| `build-drift-layer.mjs` + `build-standalone.mjs`, run twice | **byte-identical both times** (md5 unchanged on all three outputs) |
| `drift-layer.js` diff vs HEAD | +55 / −3, and the three removed lines are exactly the three the source replaced (`}`, the old `pri` hash term, the old `vis.sort`) — honest coupling, no drift |
| `drift-layer.css` diff vs HEAD | none |

---

## verify-v11 — with its control

`run-v11-control.sh 3 <pre-fix source>` runs the fixed source and the pre-fix
source (extracted with `git show HEAD:…`, never written into the tree) three
times each, alternating machine state as little as possible.

| label | result | failing |
| --- | --- | --- |
| fixed-1 | **21/21** | — |
| fixed-2 | **21/21** | — |
| fixed-3 | **21/21** | — |
| prefix-1 | 21/21 | — |
| prefix-2 | 21/21 | — |
| prefix-3 | 21/21 | — |

Per-run JSON committed as `v11-fixed-{1,2,3}.json` / `v11-prefix-{1,2,3}.json`.

### One 20/21 seen before this matrix, and what it was

An earlier run of the fixed build reported **20/21**, failing
`law-rest-reachable` with `gestureOk === false`: the harness resolved a point
inside a ghost, CDP-tapped it, and the word came back to full presence
(`collide: 1` — the paint law held) but did not register as the bloom centre.
That is exactly the aim-staleness class WP7 documented ("the harness resolves a
coordinate and then presses it, and on a field that moves 10px/s the coordinate
is a little stale"). Six consecutive runs since — three fixed, three pre-fix —
have not reproduced it on either arm. Reported rather than dropped.

An earlier *cut* of this fix did produce a genuine, reproducible 20/21: with
`PAGE_SPAN = 3.0` the wheel reordered the rest state, two words landed fully
covered by others, and `unreachableGhosts` went to 2. That is what drove the
design to `PAGE_SPAN = 2.0` and the phase-0 identity (README §4) — the rest
state the v11 laws were verified against is now provably unmoved, and the
`unreachableGhosts` count is back to 0.

---

## verify-drift-consistency `--mode fast`

| run | result |
| --- | --- |
| 1 | **45 cases · 45 ok · 0 violations · 0 page errors** |
| 2 | **45 cases · 45 ok · 0 violations · 0 page errors** |

Console log: `drift-fast.txt`. Note that this suite writes
`docs/audits/drift-consistency-report.json`, which the repo carries as a
`--mode full` (191-case) run; the fast run overwrites it, so it is restored with
`git checkout --` after the gate and the fast report is kept here instead as
`drift-fast-report.json`.

---

## verify-drift-hunt

The envelope on this machine is **4–6**, established by WP6 on pristine HEAD
(4 · 4 · 4 · 6). Not this work package's to rule on; the claim here is
comparative.

**Fixed build: 6 failing** — the top of the envelope, and every one of the six is
in the set WP6 and WP7 already recorded. Full log: `hunt-fixed.txt`.

| failing check | prior record |
| --- | --- |
| `a corpus-backed semantic member is staged` | WP6/WP7 **stable core**; also in the campaign BASELINE ledger |
| `hub release cannot hijack a gesture` | WP6/WP7 **stable core**; fails on untouched HEAD |
| `a held finger keeps a constellation alive past the 10s fade` ("no open water") | WP6 **stable core** |
| `a flick judgment sticks` | WP6/WP7 — comes and goes with the randomised layout |
| `a release on a hub sun releases the constellation` | WP6 — comes and goes; WP7 final build |
| `a kana-only semantic word grows a fallback constellation` | campaign BASELINE ledger (intermittent) |

`hunt · no page errors across the regression battery` — **ok**.

No new *kind* of failure, and nothing pool-shaped: none of the six concerns which
words are chosen. Three are the known staged-semantic / hub-release mechanism
items, three are the aim-staleness class WP7 characterised.

### Control on the same machine, same session

The drift source was reverted to HEAD, the fusion regenerated from it (which
reproduced HEAD's **committed** `drift-layer.js` and `corridor-standalone.html`
byte-for-byte — `git status` clean, itself a generator-determinism proof), and
the hunt re-run.

| build | failing | set |
| --- | --- | --- |
| **pre-fix control** | **6** | flick-sticks · hub-sun-release · 10s-fade-no-open-water · semantic-member-staged · kana-fallback · hub-release-hijack |
| **fixed** | **6** | **the same six, in the same order** |

Full control log: `hunt-prefix.txt`. The two runs differ only in the incidental
detail the randomised layout produces (the control's hub-sun case landed on 大
holding 材料, the fixed run's on 日 holding 増加). **Zero delta.** The fix was then
restored and the fusion rebuilt; all four md5s returned to their pre-control
values, so nothing about this control leaked into the committed tree.

---

## Console / page errors

| where | result |
| --- | --- |
| `verify-v11` ×6 | `ERRORS: none` every run |
| `verify-drift-consistency --mode fast` ×2 | **0 page errors** both runs |
| `verify-drift-hunt` | `no page errors across the regression battery` — ok |
| `instrument-pool.mjs` (gates on `pageerror` + `console.error`) | **0** |

---

## Re-running everything

```bash
node prototypes/corridor/tools/build-drift-layer.mjs      # 12/12 anchors
node prototypes/corridor/tools/build-standalone.mjs

cd docs/build-evidence/kairo-feel-lock/wp9a
node reachable-set.mjs --grid 240 --json reachable-set.json
node paging-sim.mjs --drags 3000 --out paging-sim.json

# the pre-fix ceiling, in the browser
git show HEAD:prototypes/drift/drift-artifact.html > /tmp/drift-prefix.html
node instrument-pool.mjs --src /tmp/drift-prefix.html \
     --probe sweep --zooms 1 --grid 40 --agree 64

# the phase-0 identity, in the browser: the same sweep on the FIXED source must
# reproduce the pre-fix ceiling (run with --pin-phase 0; the earlier claim here
# that the teleport guard refuses the sweep's jumps was stale — README §4 has
# the correct account of the guard, verified by the unpinned sweep numbers)
node instrument-pool.mjs --probe sweep --zooms 1 --grid 40 --agree 64

# previously-unreachable words, now surfacing
node instrument-pool.mjs --probe prove --sample 20 --out prove.json

./run-v11-control.sh 3 /tmp/drift-prefix.html
npm run verify:drift:fast          # x2, then restore docs/audits/…report.json
node prototypes/corridor/tools/verify-drift-hunt.mjs

# the hunt's own control: revert, rebuild, run, restore, rebuild
git checkout -- prototypes/drift/drift-artifact.html \
                prototypes/corridor/drift-layer.js \
                prototypes/corridor/corridor-standalone.html
node prototypes/corridor/tools/build-drift-layer.mjs
node prototypes/corridor/tools/build-standalone.mjs
node prototypes/corridor/tools/verify-drift-hunt.mjs
rm -f prototypes/corridor/evidence/a0-drift-hunts-20260808/*-current.png
```
