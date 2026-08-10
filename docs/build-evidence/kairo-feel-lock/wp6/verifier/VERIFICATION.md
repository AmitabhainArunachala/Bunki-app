# WP6 独立検証 — tap-ladder variants (build both, rule on neither)

Verified at `24fb59c`, controlled against base `1bb7d3c`. Real Chromium 1194,
390×844, touch, CDP. Probes 20–23 written fresh for this work package.

**VERDICT: CONFIRMED.**
**Default parity: CONFIRMED** — on an exact static argument and my own seeded differential.
**Hunt envelope: no new failure kind. WP6 measured LOWER than pristine.**

---

## 1. Scope — clean, and the CARD lane is untouched

Diff hunks, complete:

| file | hunks |
|---|---|
| `drift-artifact.html` | `@@ -203` (tunables block) · `@@ -1957`, `@@ -1969` (tapNode) |
| `corridor.js` | `@@ -145` (VARIANTS) · `@@ -215` (`S.variants` defaults) · `@@ -3289` (render seam) |
| `verify-corridor.mjs` | one hunk (the strip assertion) |

No CSS file in the diff; `renderVariants` untouched. **The CARD / study-door region
(WP3's lane) carries no hunk and no identifier anywhere in the diff.** Generated files
(`drift-layer.*`, `corridor-standalone.html`) are **not** committed — correct per the
build rules, and stated in the commit. `build-drift-layer` reported **12/12 anchors,
all asserted unique, no adjustment** on every rebuild I did.

---

## 2. Persistence — zero schema change, confirmed twice

**Statically:** `corridor.js:295` writes exactly `{taken, lists}`.
`drift-artifact.html:828` writes `store`, declared at :816 as exactly
`{known, unknown, lk, lu}`. `grep V_LADDER|V_SATTAP` against every
`localStorage`/`store`/`save` reference returns **nothing** — the variants are never
persisted.

**Empirically** (probe 23, driving the real corridor strip):

| moment | `localStorage` keys |
|---|---|
| at defaults | `[]` |
| after standing OFF both defaults (stage4 + recenter) | `[]` |
| after reload | `[]` |

and after reload the strip reads `pressed: ["ladder:stage3","sattap:staged"]` — back on
the defaults. **Session-only, and standing off the defaults writes nothing at all.**

---

## 3. The rows inherit what the claim says — measured

```
ladder:stage3   h=44  aria-pressed=false  "三段3-stage"
ladder:stage4   h=44  aria-pressed=true   "四段4-stage"
sattap:staged   h=44  aria-pressed=false  "段階staged"
sattap:recenter h=44  aria-pressed=true   "即中心instant recenter"
```

44px targets, correct `aria-pressed` toggling, bilingual labels — inherited, not
re-implemented. The seam reaches the Drift layer in a regenerated fusion:
`__DRIFT_TAP__` present, `render()` had already pushed `{ladder:"stage3",
satTap:"staged"}`, and `.set()` moves it.

---

## 4. The 2×2 matrix — my own assertions, read from rendered style

Probe 20 reads `getComputedStyle(...).opacity` of `.yomi` (reading) and `.gloss`
(English) — never class names — plus `stack`, `FOCUS` and `focusN` identity.
**34/34 ladder assertions pass across all four combinations.**

| combo | rung 1 | rung 2 | rung 3 | rung 4 |
|---|---|---|---|---|
| stage3 | reading **1**, English **0**, FOCUS **14**, stack 0 | English **1**, stack 0 | **dive** (stack 1) | — |
| stage4 | reading **0**, English **0**, FOCUS **14**, stack 0 | reading **1**, English 0 | English **1**, stack 0 | **dive** (stack 1) |

- **No early rung dives**: stack 0 after every pre-dive rung in every combo.
- **Family 14 → 14 under the extra rung** (both stage4 combos).
- **staged**: satellite tap 1 reveals in place, `focusN` unchanged ("救う" → "救う",
  satelliteIsFocus=false, readingOp=1); tap 2 recentres.
- **recenter**: satellite tap 1 recentres at once ("救う" → "救い"), and lands on rung 1
  of the *active* ladder — reading=1 under stage3, reading=0 under stage4, which is the
  code's own stated rule.
- **Switching back restores exactly**: `stage4/recenter → stage3/staged → stage4/staged
  → stage3/staged`, states 2 and 4 identical. Unknown values ignored.

### A correction to my own first pass
My first run reported 4 FAILs on a nothing-disappears floor assertion (`minRenderedOp
0.08` vs `ghostFloor 0.327`) — **including under the defaults, which should have been my
clue.** The assertion was mis-specified: I measured while a bloom was up. Measured in
all three states (probe 21):

| state | pristine `1bb7d3c` | WP6 defaults | WP6 stage4 |
|---|---|---|---|
| at rest | **0.327** | **0.327** | **0.327** |
| bloom held | **0.098** | **0.098** | **0.098** |
| back at rest | **0.327** | **0.327** | **0.327** |

`0.098 = ghostFloor × 0.3` — the pre-existing WP2 bloom dim, identical on the base. The
floor holds at the new pacing. **My four FAILs are withdrawn.**

---

## 5. DEFAULT PARITY — CONFIRMED on two independent grounds

### (a) Exact, by inspection — the strongest evidence available
With `stage3` + `staged`:
- `if(isSat && V_SATTAP==="recenter")` — **unreachable**.
- `if(V_LADDER==="stage4" && …)` — **unreachable**.
- the one modified live statement, `if(canBloom&&(V_LADDER!=="stage4"||focusN!==n)) bloomFocus(n)`,
  reduces to `if(canBloom)`, and `canBloom` is declared as
  `n.kind==="word"&&stack.length===0&&!lockOn` — **character-for-character the predicate
  it replaced.** Nothing runs between its declaration and its use under defaults.

### (b) My own seeded differential (probe 22)
`Math.random` replaced by a seeded PRNG in `addInitScript` before the page script; the
recycler stopped; positions pinned; identical gesture script; semantic trace after every
gesture. **5 seeds, 95 traced states.**

Every ladder-relevant field — `stack`, `depth`, `ctr`, `FOCUS`, `members`, `unfolded`,
`glossed`, `lockOn`, `tray`, `cardOpen` — **identical in all 95 states**, with one
exception that **flips direction between runs** (one seed had base blooming and WP6 not;
an earlier run had the reverse) — a missed tap, not a behaviour difference. The only
systematic differences are **±1–4 percentage points of word opacity**, with
`readingOp`/`glossOp` matching exactly every time: animation phase, not semantics.

### Judgment on their methodology
**Sound, and better than comparing hunt runs** — precisely because the field is
spawn-randomised (`shuffle()` uses `Math.random()`, `drift-artifact.html:673`), which is
what produced the WP2 round-3 dispute I lost. Holding the field fixed is the right
control. Two limits worth recording, neither undermining the conclusion:
1. Seeding `Math.random` does **not** freeze animation *phase*. A strict field-by-field
   diff will therefore show small opacity deltas and the occasional missed tap — I saw
   both. Their "0 differing across 60 states" implies either a coarser trace than mine
   or luckier runs; it is not reproducible as an exact zero at my granularity.
2. 20 states/seed exercises one gesture path, so it proves parity along that path.

The static argument in (a) carries the claim regardless.

---

## 6. Suites

| | result |
|---|---|
| `verify-v11` at defaults | **21/21**, zero console, zero page errors |
| `verify-v11` under stage4 | **19/21** — reproduced exactly |
| `verify-corridor` | **91/91** |
| `build-drift-layer` | **12/12** anchors, unadjusted |

### The 19/21 is genuinely rung-counting — confirmed by reading *and* by the failure text
- **`1-pinch-surface-nobleed`** taps a word **exactly three times** (`tapAt` + a
  `for(i<2)` loop) then requires `sd.stack >= 1`. Under stage4 three taps do not reach
  the dive, so the `else` branch fires:
  `could not enter a dive (stack=0, word=すくう救う…)`.
- **`8-unfold-clear-on-lock`** taps A **exactly once** then requires `u1 >= 1`. Under
  stage4 rung 1 is forefront+family with nothing read, so:
  `tapped A=すくう救うt (unfolded=0)`.

Both are hard-coded tap budgets in the instrument, not behaviour. **Declining to
parameterise `verify-v11` is the right call** — a parameterised suite would encode a
ruling on a question WP6 is explicitly not answering.

Their `probe-stage4-v11-preconditions.mjs` does exercise the same mechanisms: it opens
the dive in **four** taps and asserts `sa.stack < sd.stack && sa.z > 0.7` — the identical
assertion `verify-v11` makes — and reaches the reading in **two** taps before locking B
and asserting the same unfold-clear outcome. A legitimate substitute.

---

## 7. Hunt envelope — no new failure kind; WP6 measured lower

Fusion regenerated on both sides before every run (base `1bb7d3c` was already in sync;
`24fb59c` ships no generated files, so a rebuild is mandatory).

| tree | totals | distinct failure kinds |
|---|---|---|
| pristine `1bb7d3c` | **6 · 5** | flick-judgment · release-on-hub-sun · held-finger "no open water" · corpus-backed-semantic · kana-only-semantic · hub-release-hijack |
| WP6 `24fb59c` defaults | **4 · 5** | *a subset of the same six* |

**Every failure kind seen on WP6 also appears on pristine. No new kind. WP6's totals are
if anything lower.** Their pristine 4·4·4·6 and WP6 4·5·5·4 sit in the same band as mine.

**Reconciliation with my own envelope model**, built across the earlier work packages:
the envelope is now 4–6 on this machine because three independent pre-existing effects
stack — spawn randomisation deciding the hub clause (WP2 round 3, which cost me my
0/3 hub baseline), the CDP-latency-vs-330ms flick threshold in the heavy fusion (WP7),
and the hub-vs-ratified-behaviour tension (WP2 round 3). None is WP6's. The historical
"{0-2}" no longer describes this machine, and reporting that rather than arguing it away
is correct.

---

## 8. verify-corridor's strengthened assertion — falsified, and it is a strengthening

Old: `stripRows === 5 && ticketRows === 4` — a bare count, blind to *which* rows.
New: `ticketRows === 4 && namedPresent.length === 3 && stripRows === ticketRows + 3`,
naming `E 奥行`, `F 触れの段`, `G 衛星の触れ`.

I falsified it rather than take it on reading: renaming **only** row G's label — leaving
the row count at 7 and the ticket count at 4, both invisible to a count-only assertion —
drove it red:

```
FAIL  the variant strip exposes all four open decisions, the v1.1 depth toggle and the drift tap ladder
      7 rows (cards, difficulty, contrast, entry, depth, ladder, sattap); 4 carry ticket numbers;
      named rows present: E 奥行 · F 触れの段
90/91 checks passed
```

**Strictly harder than the number it replaced.** No other suite assertion touched.

---

## 9. No ruling recorded

Every hit for recommendation language in the diff and the evidence is a **disclaimer**:
`no position here is preferred, endorsed, or scheduled to win`; `marked better,
recommended, current-and-therefore-right, or scheduled to win — [none]`. Option labels
are descriptive in both languages: 三段/3-stage, 四段/4-stage, 段階/staged,
即中心/instant recenter. Row labels: `F 触れの段` / tap ladder, `G 衛星の触れ` /
satellite tap. No "recommended", "new" or "default" badge anywhere.

**On the provenance note** — `V_SATTAP "staged" — what spec Q1 ratified and the field
shipped … Recorded here as provenance, not as a verdict on this row — WP6 rules on
neither position.` I judge this **neutral enough**: it states history and disclaims a
verdict in the same sentence. One observation for the record: only `staged` carries a
provenance line, and `recenter` carries none, which is a mild asymmetry — though the
line is factually true and the disclaimer is explicit. Not a finding.

---

## Reproduction

```
git checkout 24fb59c && ln -s /home/user/Bunki-app/node_modules node_modules
node prototypes/drift/tools/verify-v11.mjs                       # 21/21 at defaults
node prototypes/drift/tools/verify-v11.mjs --src <stage4 copy>   # 19/21, rung-counting
node prototypes/corridor/tools/verify-corridor.mjs               # 91/91
node prototypes/corridor/tools/build-drift-layer.mjs             # REQUIRED before any fusion suite
node prototypes/corridor/tools/verify-drift-hunt.mjs             # x2, and x2 on 1bb7d3c
node probes/probe20.mjs <src> 9601        # the 2x2 matrix, from rendered style
node probes/probe21.mjs <src> <tag> 9701  # floor at rest / bloomed / back at rest
node probes/probe22.mjs <base> <wp6> 1,2,3,4,5   # seeded default-parity differential
node probes/probe23.mjs                   # persistence + strip inheritance
git checkout -- prototypes/corridor/ docs/audits/ docs/prototype/
```
