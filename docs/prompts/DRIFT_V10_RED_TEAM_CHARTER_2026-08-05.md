# RED TEAM CHARTER — Drift v10 (墨流し) Full-Spectrum Adversarial Audit

- **Status:** READY TO EXECUTE — operator-commissioned 2026-08-05. This is a
  standalone prompt for an orchestrating agent; it assumes no prior session
  context beyond this repository.
- **Target:** `prototypes/drift/drift-artifact.html` on Bunki-app main — the
  Drift v10 prototype, a single self-contained file. Wrap in a doctype and
  serve locally per `prototypes/drift/README.md`. Drive it with
  playwright-core and the system Chromium (in Claude remote sessions:
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), gestures via CDP
  `Input.dispatchTouchEvent` — mouse events are not evidence, this is a
  touch-first surface.
- **Design contract:** `docs/convergence/BUNKI_DESIGN_LANGUAGE_SESSION2_2026-08-05.md`
  (§8 logs every build round v3 → v10). Where this charter and that doc
  conflict, the doc wins.
- **Published artifact URL (republish target, never a new URL):**
  https://claude.ai/code/artifact/c1aa874c-126b-44b2-98bd-9f3d0e769ea3

## Mission

You are not a reviewer. You are a hostile power user, a philologist with a
grudge, and a fuzzer with taste. Assume the prototype is lying to you
somewhere — in its code, its kanji, its dictionary, or its feel — and find
where. Then fix it in place and prove the fix. A finding without a repro
script + screenshot is noise. A fix without a re-run of the probe that
caught it is a claim, not a fix.

## Standing invariants — violating any is automatically a P0

1. Zoom/pinch NEVER opens, centers, or steals a word. Pure travel.
2. No node ever orbits or blooms its own name — zero duplicates anywhere.
3. Long-press lock: ≥12 members for EVERY word, persists after release,
   chains from any member.
4. Swipe grades persist across reload (localStorage key `bunki-drift-v1`).
5. The universe is never still — idle motion at rest, always.
6. Level slider visibly re-tides the field.
7. Every word → its kanji → its radicals is clickable everywhere it appears.
8. Zero uncaught exceptions, zero console errors, under any gesture
   sequence.

## Fan out 8 lanes in parallel

- **L1 — Gesture assassin.** Chaos matrix: every gesture at every zoom
  (0.34–2.6), at screen edges, interrupted mid-flight, raced against each
  other (pinch during lock, swipe during dive, long-press during bloom
  decay, second finger landing mid-pan). 500+ sequences seeded-random plus
  a hand-built worst-case deck. Any misfire, stolen word, stuck state, or
  dropped lock = finding.
- **L2 — Kanji philologist.** Audit embedded KINFO/RADK/RNUM/STROKES
  against authority: on/kun readings, Kangxi radical numbers,
  radical-family membership, stroke counts and order. Sample ≥150 kanji
  stratified across levels + every kanji appearing in a lock pin. A wrong
  reading shown to a learner is a P0 — this app teaches; a lie here
  compounds.
- **L3 — Dictionary integrity.** All 6,687 WBIG entries: duplicate words,
  non-kana readings, empty/garbage glosses, wrong JLPT levels (sample-audit
  40/level), kanji in words with no KINFO coverage (must still dive
  gracefully), EXTRA-merge collisions, WORDIX overwrite bugs.
- **L4 — State saboteur.** Corrupt `bunki-drift-v1` with garbage/huge/
  wrong-schema payloads → must load clean, never crash. Reload mid-gesture.
  Grade the same word both directions rapidly. Fill localStorage to quota.
  Verify grade → presence math (unknown returns fragile+halo, 2×known →
  55% presence).
- **L5 — Performance executioner.** FPS floors at min zoom, max zoom,
  lock+bloom stacked, 10-minute soak with continuous drift: DOM node census
  every 30 s (spawn/despawn must balance), heap growth curve, canvas/sprite
  leak check. SwiftShader floor ~23 fps is the documented
  software-rendering caveat — regressions below it are findings; also
  verify no rAF death spiral after tab blur/focus.
- **L6 — Lock adversary.** Lock 60 adversarial words: kana-only,
  single-kanji, rare N1, EXTRA words, words whose kanji have tiny families.
  Assert ≥12 members, no duplicates, no self-orbit, viewport containment at
  all zooms, chain 10 deep and back, SEM tier consumed first where it
  exists (verify all 27 pilot words + ghost collocations render and are
  labeled), water-tap release always works. Helper API:
  `window.__lockWord(word)`.
- **L7 — Injection & robustness.** The file embeds JSON in script context:
  audit every injection seam (quotes/backslashes/angle brackets in glosses
  and SEM notes reaching innerHTML — attempt actual XSS payloads through
  the data path), confirm zero external requests (the artifact's strict
  CSP would kill them silently), confirm behavior when any embedded
  dataset is truncated/corrupted.
- **L8 — UX honesty.** Play a first-time user with no manual: is each
  gesture discoverable? Hit-target sizes ≥40 px effective? Pigment-on-washi
  contrast readable in ALL 5 themes (measure, don't eyeball — sample
  actual pixel contrast ratios)? Dead zones where taps do nothing? Does the
  自 adaptive mode communicate what it's doing? Script the honest
  complaint list a stranger would produce.

## Then converge

Dedupe findings across lanes → fix every confirmed finding directly in
`drift-artifact.html` → re-run the exact probe that caught each one → send
every "fixed" claim through a skeptic pass whose job is to refute it (a
skeptic who can re-break it reopens it). Loop until two consecutive rounds
surface nothing new. No silent caps: if a lane sampled instead of
exhausted, say what it skipped.

## Deliverables

1. Patched `drift-artifact.html` republished to the SAME artifact URL
   (same file path → same URL; favicon 🌊 unchanged).
2. Findings ledger (severity, repro, fix, re-verify evidence) appended to
   the design doc as §8.13.
3. Updated prototype + ledger committed to a Bunki-app branch → PR. Never
   push to main directly.
4. Every claim carries a `file:line` citation or a runnable command.

## Execution notes

- The eight lanes are genuinely independent — run them in parallel, gate
  the skeptic panel behind their convergence.
- Fixes land in the single source file; regenerate the local test wrapper
  after every edit and re-serve before re-probing.
- Gesture probes must count rendered labels via a `fillText` wrapper or
  DOM census, not screenshots alone; screenshots are evidence, counters
  are assertions.
