# The Drift Zero-Quirk Spec — v2 of the consistency charter (2026-08-08)

**This document is the prompt.** It instantiates the agent (this session or
any successor, with subagents at its discretion) that takes the Drift surface
of the fused KAIRO app to _zero bugs, zero quirks, zero inconsistency_ — and
proves it, empirically, before claiming it. It supersedes and extends
`DRIFT_CONSISTENCY_CHARTER_2026-08-08.md` (round 1: executed; its sweep and
fixes stand). Written spec-first per current agentic practice: precise
invariants, failing-case-first fixes, agent-run acceptance criteria,
versioned in-repo.

## 0. Mission and definition of done

Play the app **as the user** — deep curiosity, hundreds of interactions, in
and out of every state — until the acceptance criteria in §5 pass in full.
Not "the code looks right": the instrument says dry, across the whole
matrix, repeatedly. The operator's bar, verbatim in spirit: _"do not stop
for any reason until you are convinced there are no bugs, no quirks, no
inconsistency in the entire drift portion."_

**Scope:** the Drift layer inside the fused corridor app, plus its doors
(the shelf door, and every handoff a Drift surface makes into corridor
surfaces). **Non-goals this campaign:** corridor reading/dictionary
internals, data-tier growth, new features not required by an invariant.

## 1. The operator's rulings (2026-08-08, round 2 — law)

1. **The win to protect:** the held planet + satellites + threads —
   colours, tethering, persistence. No fix may regress it.
2. **NOTHING DISAPPEARS.** No word on the drift screen ever vanishes,
   explodes, or dissolves — with exactly ONE exception: the deliberate
   SRS judgment (flick left = don't know / right = know), whose animations
   (朱 sink / pigment bloom-away) are the ratified v4 grammar and stay.
   Scope of where the flick may fire: operator question Q2 (default:
   only the held/centred word while a constellation is open; anywhere on
   the free field otherwise).
3. **A satellite tap continues the walk — it never destroys.** Tapping a
   satellite brings it forward: it unfolds, and the constellation
   re-centres on it (it becomes the planet; its own family assembles) —
   chainable to any depth. Exact staging per operator question Q1
   (default: first tap unfolds the satellite in place; second tap
   re-centres the constellation on it).

## 2. Confirmed root causes queued for the fix phase

- **Satellite-tap self-destruction (the round-2 headline).** Confirmed in
  code: `tapNode(satellite)` → `bloomFocus(satellite)` → its first act
  `clearBloom()` dissolves every `fromBloom`-materialized node —
  _including the node being tapped_ — then builds a constellation around
  a corpse. Fix shape: re-centring must HAND OFF, not raze — carry the
  tapped satellite (and ideally the shared members) into the next
  constellation; dissolve only what the new family doesn't keep.
- Ring satellites can overlap at similar angles (no collision spacing).
- Lock members without DOM nodes stay canvas-thin (materialization gap —
  bloom materializes, lock does not).
- Kana-only strata under-covered by the sweep's viewport sampling.
- Anything round 1 marked open: dive-depth gestures, 夜 theme, soak.

## 3. The invariants (v2 — the contract every sweep case tests)

- **I1 · Staged reveal everywhere.** tap = furigana · again = English ·
  third act carries in. Every word, every depth, kana included.
- **I2 · No dead nodes.** Every node answers every gesture meaningfully
  (cascaded bloom floor ≥6 stands).
- **I3 · Nothing disappears** except the deliberate flick-judgment (§1.2).
  This includes: satellite taps, slow drags, pans, pinches, twists,
  water taps, timers, recycling, camera glides, theme switches, state
  transitions, `pointercancel`. A vanished word anywhere else = P0.
- **I4 · The walk is chainable.** planet → satellite → new planet →
  satellite… to unbounded depth, tethers alive at every step, 戻る/water
  backing out cleanly.
- **I5 · Camera is inviolable** (never opens/closes/grades/dismisses).
- **I6 · Constellations are held things** (live tether; release only by
  deliberate water-tap or 10 s true inactivity).
- **I7 · Judgment is deliberate** (velocity+distance flick only; slow
  drag always moves; scope per Q2 ruling).
- **I8 · Continuity** (animate from where things are; pointercancel-safe;
  no ghosts, no teleports).
- **I9 · Legibility floor** (relief colours/weights on every thread and
  member, all depths, all five themes).
- **I10 · One feel** (same easings, clocks, palette roles at every depth).

## 4. Execution protocol

1. **Play first.** Free-play sessions as the user (CDP touch, device
   scale): wander, chain, zoom, grade, abuse. Log every surprise, however
   small — "quirk" includes feel, not just breakage.
2. **Instrument second.** Extend `verify-drift-consistency.mjs` to the
   full matrix: satellite-chain batteries (depth ≥3), dive-depth gestures,
   kana strata (seed via level tide + search-to-lock seam), 夜 theme,
   randomized fuzz batteries (seeded, replayable), a 5-minute soak. Every
   case classified; screenshot on divergence; hermetic boots.
3. **Fix third — failing case first.** No fix without a red sweep case
   reproducing it; the case stays in the matrix forever after. Root cause
   named in the log for every cluster (mechanism, not symptom).
4. **Subagents as needed** for parallel lanes (free-play, matrix runs,
   fix verification) — worker ≠ judge where feasible.
5. **Evidence cadence.** Screenshots to the operator every round —
   they never discover a defect first. Artifact republished at every dry
   sweep. Small commits; verifier green before every push. Batch findings
   into reports; no micro-back-and-forth.
6. **No-stop rule.** The campaign pauses only for: the operator's answers
   to §6 (defaults below let work continue meanwhile), a permission the
   session cannot grant itself, or acceptance (§5) reached.

## 5. Acceptance criteria (agent-run, all required)

- A1 · Full matrix (nodes × gestures × states × themes, §4.2) **100 % dry,
  two consecutive runs**, zero pageerrors.
- A2 · Chain walk: 25 consecutive planet→satellite re-centres across
  mixed strata without a single disappearance or detach.
- A3 · Seeded fuzz: 3 × 400-gesture randomized batteries, zero invariant
  violations, replayable by seed.
- A4 · Soak: 5 minutes idle+ambient, then the full battery still dry.
- A5 · `verify-corridor.mjs` ≥ its current count, all green (the fused
  app's other surfaces unregressed).
- A6 · The operator's own walk produces no new defect report on invariants
  I1–I10 (the human criterion — the only one the agent cannot self-grant).

## 6. Operator rulings on the open questions (RATIFIED 2026-08-08)

- **Q1 — satellite tap staging: RATIFIED.** Tap reveals the satellite in
  place (reading + gloss); tap again re-centres the constellation on it.
- **Q2 — flick scope: RATIFIED.** While a constellation is open, only the
  held/centred planet may be flick-judged — satellites can never be
  accidentally graded. On the free field the v1 grammar stands: any word.
- **Q3 — scope: RATIFIED.** Drift + its doors into the corridor.

---

## 7. The four spend-killed claims: re-hunted and closed (2026-08-08)

When the first adversarial workflow ran, four of its twelve verification
agents died on the account's monthly spend limit (kana strata ×2, camera ×2).
Those four claims were recorded as UNVERIFIED — not cleared. They were
re-hunted against `e8be255` under the same default-refute discipline.

### Verdicts on the claims as filed

| claim                                                           | verdict                                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| kana-only words are dead nodes                                  | **reproduced** (all three parts, reframed)                                                                        |
| a third finger during a pinch teleports the held word 127px     | **refuted** — closed by the `gestureId` fix at `drift-artifact.html:1817`; measured 0.7px against a 0.2px control |
| a locked constellation self-releases under a static held finger | **refuted** — the lock is exempt from the fade (`!lockOn`); held 25s, still locked 12s after release              |
| a release tap over a hub sun hijacks into a dive                | **reproduced**, narrower than reported                                                                            |

Two refutations are as valuable as the reproductions: they record that a
previous fix genuinely closed a hole, measured rather than assumed.

### What the probes found underneath

Three of the four investigations surfaced defects that were not the claim.
Seven fixes landed, six of them in or adjacent to `constellationLock` and the
pointerup water path — one cluster, not seven accidents.

1. **Headless lock (P1).** `constellationLock` opened with a bare
   `clearBloom()`, so the node it was promoting to centre was still in the old
   FOCUS with `fromBloom=true` and was removed 500ms later. `bloomFocus` had
   always passed `keep`. Violated I3.
2. **Fat-finger forgiveness was dead code under a lock (P1).**
   `if(lockOn){clearBloom();return;}` returned _before_ the 44px block, so
   while a lock was on every near-miss razed instead of forgiving.
3. **Lock members were canvas paint, bloom members were real words (P1).**
   `bloomFocus` materializes a dot into a touchable word; `constellationLock`
   had no such branch. Measured: 0 DOM `.bsat` under a lock, 16 after the fix.
   Same gesture family, different substance — the inconsistency of feel, at
   the mechanism.
4. **Ghost labels could not answer, and razed the constellation when
   touched (P1).** SEM relations with no corpus headword — every kana-only
   relative and every collocation — were `fctx.fillText` with no hit area.
   The fix required no invented data: **SEM entries are 3-tuples and the lock
   code was discarding `se[2]`, a hand-authored English gloss.** They now
   enter as real words carrying their surface and that gloss. No reading is
   fabricated: kana needs none and a collocation's is not ours to guess, so a
   word with no reading skips the furigana stage and answers with its gloss at
   once.
5. **The hub-sun door outranked the release (P1).** With a constellation held,
   a release landing within 34px of a hub became a dive. Submerged, the bloom
   was _unreachable_ — every water tap at depth surfaces before it releases —
   and returned at full presence on surfacing, silently undoing the release.
   The door now sits below the release, and `diveKanji` clears the bloom the
   way `diveWord` always has.
6. **`diveWord`/`diveKanji` destroyed the node being dived into.** Latent
   before, reachable once lock members became real nodes: both now pass the
   dive target as `keep`.
7. **A held finger counted as inactivity (P2).** `bloomLast` was written only
   in pointer handlers, so a perfectly static touch let the 10s fade expire
   under the learner's own finger; a 1px jiggle kept it alive forever.

### The ownership hole the pinch refutation exposed (P1)

`pointerup` has checked gesture ownership since the `gestureId` fix;
`pointermove` never did. `px,py` belong to the gesture owner while
`e.clientX,e.clientY` belong to whatever pointer sent the event. `#lvl` and
`#card` `stopPropagation` on pointerdown but not on pointermove, so their
finger was invisible to the touch set while its every move still reached the
drag branch. Measured tear: 163.7px against a 53px orbit baseline.

### Instrumentation

Six new permanent rows in `tools/verify-drift-hunt.mjs` (8 → 14 checks). Each
was proven failing-case-first: run against the pre-fix tree, all six fail;
against the fixed tree, all six pass. The hub check discovers a real hub by
probing — a water tap that dives with nothing held _is_ a hub centre — rather
than asserting against a hard-coded coordinate.

Corpus defect found by surfacing the data: SEM carried `海water` where 海水
was meant. Invisible while it was canvas paint; a real word the moment it
could be read. Corrected — it was the only such entry in 718 relations.

### Still open before this spec can close

A1 (two consecutive full-matrix dry runs), A2 (25-hop chain), A3 (seeded fuzz
×3), A4 (soak), A6 (the operator's own walk).
