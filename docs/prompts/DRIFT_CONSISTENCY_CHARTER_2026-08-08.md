# The Drift Interaction-Consistency Charter — 2026-08-08

Operator order, verbatim in spirit: _"There's a very deep, thorough
inconsistency in product feel and design throughout the entire drift
architecture. Persistently and consistently interact with it, engage with it
with all the tools possible, take multiple screenshots, check dozens and
hundreds of examples, and find the very root cause on every single level.
None of this inconsistency should remain — none, whatsoever, ever."_

This charter instantiates that order. It is the standing prompt for the agent
executing it (this session or any successor). The target is the Drift surface
inside the fused app (`prototypes/corridor/` entry layer, generated from
`prototypes/drift/drift-artifact.html`). The charter is complete only when
the empirical sweep below runs dry — zero contract violations across the
whole matrix — and the matrix itself has become a permanent harness.

## 1. The interaction contract (the law the sweep tests against)

One grammar, one meaning, every node, every state, every theme:

- **C1 · tap** unfolds (furigana), tap-again glosses (English), and the
  third tap carries you in — the dive; committing to a word is the third
  act (§8.14, ratified). On a free word the first tap also blooms the
  constellation. Identical for every word — kanji-rich, single-kanji, and
  kana-only alike.
- **C2 · no dead nodes.** A word with no kanji family still answers: it
  unfolds, and its bloom draws from semantic/level/reading neighbours
  instead of kanji kin. Nothing ever responds with _nothing_, and nothing
  ever silently vanishes on a tap.
- **C3 · no accidental destruction.** Grading fires on a deliberate FLICK
  (velocity + distance), never on a slow drag. A slow drag MOVES the word —
  with its constellation if one is open. The judgment animations stay
  unmistakable. There is no gesture whose accidental cost is losing a word.
- **C4 · the camera is inviolable.** Pan, pinch, and twist navigate — they
  never open, close, grade, or dismiss anything, in any state: surface,
  bloom, lock, and every dive depth. Pinching over a constellation zooms
  the constellation; it survives.
- **C5 · constellations are held things.** Tethered to the word's live
  position through drags and camera moves; released only by a deliberate
  water-tap or 10 s of inactivity. Never by a pan's release, never by a
  pinch, never by a timer racing the user.
- **C6 · continuity.** Every state change animates from where things are.
  Nothing teleports, nothing pops, nothing leaves ghosts. `pointercancel`
  (system gesture, notification pull) restores a clean state.
- **C7 · the legibility floor.** Connection threads at the relief weights
  and colours everywhere they are drawn — tap-bloom, constellation lock,
  dive tendrils, family whispers. Members at near-full presence. A
  connection the eye must hunt for is a defect.
- **C8 · one feel.** The same easings, the same patience (orbit speeds,
  fade clocks), the same palette roles at every depth. Any surface where a
  gesture behaves differently from its siblings is a defect even if
  "working as coded."

## 2. The empirical sweep (evidence before fixes — hundreds of cases)

An instrumented CDP-touch harness against the fused build at 390×844,
recording expected-vs-observed for every case and a screenshot for every
divergence. **Stratified sample, not cherry-picks:**

- **Nodes:** ≥200 words stratified by kanji count (0 / 1 / 2+), family size
  (0, 1–3, 4+), JLPT level, DOM-vs-canvas residency, fragile/settled state;
  plus kanji glyphs, radical chips, particles at each dive depth.
- **Gestures per node:** tap · second tap · third tap · long-press ·
  slow drag (4 directions, both speeds) · fast flick (both directions) ·
  pinch-in/out over the node · pinch over open water · two-finger twist ·
  pan-and-release · water-tap · pointercancel mid-gesture.
- **States:** surface, bloom-open, lock-open, dive depth 1 and 2; themes
  北斎 and 夜; fresh boot and after 5 minutes of soak.

Outcomes auto-classified: `ok · dead (no response) · vanished · misfired
(wrong action, e.g. drag graded) · detached (tether/anchor broke) ·
dismissed (state lost without deliberate release) · illegible (below the
relief floor) · error (console/pageerror)`. Every non-ok case files with
its repro coordinates.

## 3. Root cause, not symptom

Cluster the failures and name the mechanism for each cluster before writing
a fix. Known suspects to confirm or clear — none may be assumed:

- The tap/drag/flick ambiguity: one 52 px distance threshold with no
  velocity term (`grade` on slow drags = "words explode when I move them").
- Kana-only and rare-kanji words: `bloomFocus` returns empty → "only a few
  come with the satellite option."
- Pinch inside bloom/lock/dive stealing or dismissing state (red-team L1,
  deferred then; not deferrable now).
- `pointercancel` leaving `pn`/`pinch`/`lpTimer` dangling → the next
  gesture misreads.
- Visibility bands (LOD, settled-word fading, canvas-only residency)
  making words invisible or untouchable mid-interaction → "kanji just
  disappear."
- Fixed anchors captured at open time (`LOCK.bx/by`, bloom pre-fix) →
  detachment under drag or camera motion.
- Faint-thread rendering in lock (`0.26–0.34` alpha) and dive brush
  (final pass `0.3`) vs the ratified relief.

## 4. The fix phase — architectural, not cosmetic

- **A gesture state machine** as the single source of truth:
  `IDLE → PRESSING → (DRAG-NODE | FLICK | LONG-PRESS) / PANNING / PINCHING`,
  explicit transitions only, pointercancel-safe, velocity-aware. All six
  window listeners route through it. No boolean soup (`moved`, `lpFired`,
  `gestureActive`, `pinch.fired`) deciding meaning independently.
- **The outcome table** per node class × gesture — written down in the
  source as data, so C2 ("no dead nodes") is enforced by construction.
- **The relief applied globally** (bloom done; lock threads, lock anchor,
  dive tendrils, whispers to the same floor).
- Every fix lands only against a failing sweep case, and the sweep re-runs
  to dry after every landing.

## 5. The permanent floor

The sweep graduates into `prototypes/corridor/tools/verify-drift-consistency.mjs`:
the full matrix runnable on demand and in CI-documented form, plus a sampled
slice folded into `verify-corridor.mjs` so every future build walks it.
Pass bar: **100 % of the contract matrix.** Any operator-reported
inconsistency thereafter becomes a new matrix row before it becomes a fix.

## 6. Working law (unchanged, restated)

Real CJK fonts at device scale; look at every screenshot with your own eyes;
screenshots to the operator every round before they can find defects
themselves; small commits with honest messages; the verifier green and
growing before every push; state notes record only what has happened.
