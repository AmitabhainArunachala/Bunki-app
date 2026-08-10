# DRIFT MOTION + COMPOSITION — fresh-eyes repair brief (2026-08-10)

You are a new agent with no history on this codebase. Your predecessor ran a
verified campaign and a personal repair round; the operator still judges the
Drift's motion **erratic, jarring, no ambience or ease** on a real iPhone.
You bring fresh eyes. Trust nothing you cannot re-measure — including this
document.

## The product and the pinned version

- Repo: `AmitabhainArunachala/Bunki-app`.
- Branch: `claude/kairo-feel-lock-2026-08-09`, pinned commit `69cd501ac29e354d87b15a76c27b81f67bc83892` (referred to below as the base). Work on a NEW branch cut from it (e.g. `<yourname>/drift-motion-<date>`). Never merge anything; the operator rules by feel.
- The product is ONE app: `prototypes/corridor/` — its front door is the Drift
  universe (a field of drifting Japanese words), behind it a shelf of 40 graded
  articles, a reader, a dictionary, a stroke-order room, a memorize loop.
- The Drift's SOURCE is `prototypes/drift/drift-artifact.html`. The corridor's
  copy is GENERATED from it: `node prototypes/corridor/tools/build-drift-layer.mjs`
  (12 exact-string patch anchors — regenerate after every drift edit, never
  hand-edit `drift-layer.*` or `corridor-standalone.html`). Then
  `node prototypes/corridor/tools/build-standalone.mjs` rebuilds the single file.
- Deploy: GitHub Pages workflow `pages-app.yml` serves the corridor at the site
  root (workflow_dispatch on your branch once the operator's environment rule
  allows it). The operator feels builds on an iPhone via that URL.
- Suites that must stay green: `node prototypes/drift/tools/verify-v11.mjs`
  (21/21), `node prototypes/corridor/tools/verify-drift-consistency.mjs --mode
  fast` (45/45), `node prototypes/corridor/tools/verify-corridor.mjs` (91/91).
  `verify-drift-hunt.mjs` is flaky by spawn randomization (3–6 fails machine
  envelope, documented in `docs/build-evidence/kairo-feel-lock/`).

## Immutable laws (violating any = rejected work)

Red marks readings/warnings only; indigo marks "you can go here". No scores,
streaks, confetti, or interruptions in the Drift (trance boundary). Nothing on
screen disappears except via a deliberate flick judgment — quieted words must
stay perceptible (rendered-opacity floor ~0.327, law-checked by verify-v11)
and touchable. Touch targets ≥44px. Zero console/page errors. localStorage
schemas `kairo-corridor-v1` and `bunki-drift-v1` untouched. Fully offline.

## PRIMARY TASK: make the Drift feel like water, on a real phone

What the operator feels: motion is erratic and jarring; zooming disjoints; no
sense of ambience, ease, or fluidity. What the previous agent measured and
fixed (verify, then go deeper — the operator says it is NOT enough):

- Removed per-word CSS `blur()` (was re-rasterizing moving text every frame);
  depth is now opacity paling (`blurDim`).
- dt-normalized every easing and advance (`DT`/`EK` in the drift source) so
  slow frames don't take double strides.
- Halved text-shadow halo radii; style writes skip when unchanged; fx canvas
  capped at 1x pixels.
- Headless result: 60fps at deviceScaleFactor 3, motion jerk p50 0.0099px.
  **The operator's hands say the real device still feels wrong.**

Hypotheses the previous agent did NOT eliminate — investigate in this order:

1. **The 650ms active-set churn.** `refreshActive` (setInterval 650ms) re-sorts
   the visible top-64 and words fade in/out of the DOM mid-field. On-glass
   exchange every 0.65s may BE the perceived erraticness — a metronome of
   pops that no frame-rate fix can smooth. Consider: hysteresis (a word keeps
   its seat unless clearly displaced), longer/gentler cross-fades, exchange
   only during pan (never at rest — verify the WP9a wheel already gates paging
   on pan; the ARBITER also runs at rest via `ARB_EVERY`).
2. **Collision-arbiter visible switching.** `resolveCollisions` retargets
   opacities as words drift through each other; eased at EK(0.12). Watch the
   field for 60s and count perceptible opacity flips; if the eye catches them,
   lengthen the ease or add a hold-down timer (a word that just changed state
   cannot change again for N seconds).
3. **Real-device rendering.** All measurement so far is headless Chromium on a
   server. Use CDP `Emulation.setCPUThrottlingRate` (4–6x) AND, if the
   platform allows, a real device. The DOM word layer (60+ text nodes with
   text-shadow, individually transformed every frame) plus 3 canvases may
   exceed an iPhone's compositor budget. Options: batch words into fewer
   layers; move ambient breathing to compositor-only CSS/WAAPI animations
   (zero main-thread per-frame work) with JS only steering the gyre; drop
   text-shadows entirely at motion time.
4. **iOS pinch double-zoom.** `prototypes/corridor/index.html`'s viewport meta
   has no `user-scalable=no`; `touch-action:none` lives only inside the drift
   layer. On iOS Safari a pinch may zoom the PAGE while the app zooms its
   camera — "zooming disjoints everything". Reproduce (WebKit or device),
   then fix (viewport meta + preventDefault audit on the layer's gesture
   path).
5. **The gyre itself.** WP7's wandering current (constants `DRIFT_SPEED`,
   `CURRENT_STRENGTH`, `CURRENT_DRIFT`, top of drift source) may read as
   aimless wobble rather than a slow lean. Consider longer wavelength, slower
   eye, and velocity smoothing (words following a low-pass-filtered current).

Acceptance for the primary task: (a) a 60-second screen recording of the field
at rest and under pan/pinch, captured at CPU-throttled mobile emulation,
attached as evidence — the motion must read as one slow body of water, no
pops, no flips, no stutters visible to the eye; (b) suites green; (c) the
operator's hands on the Pages deploy are the FINAL gate — ship, then wait for
their verdict. Do not claim victory from numbers.

## THE LEDGER — 20 points, verified state as of the base commit

Fixed by the previous agent — RE-VERIFY each, don't trust:
1. Frame cadence and easing (dt-normalized, blur removed) — reopened by feel;
   see primary task.
2. Constellation families are meaning-first (authored SEM > rarity-weighted
   gloss-token kinship > shared-glyph bonus; three pickers unified:
   `relationsFor`, first-tap bloom, lock). 外出 → お出掛け/出入り/出勤/行き.
3. Satellite size band (`satBand`): satellites 18–23px by shell, centre
   loudest (~28px+).
4. ONE dictionary: the final tap on any drift word/kanji opens the corridor's
   canonical entry sheet (`window.__BUNKI_OPEN_ENTRY` hook in `openCard`);
   the drift's own card renders only in the standalone file.
5. Stroke room: ink-on-washi (sumi bleed underlay `.stroke-bleed`, paper
   stage, four pigments 墨/弁柄/藍/緑青 as `.ink-dot` swatches, pigment-tinted
   controls).
6. Dev variants bar hidden unless `?variants=1`.
7. Reader hint copy humanized (no "activate = English" dev-speak).
8. `ruby-align: center` stops wide readings prying words apart (拡張).
9. Empty hint pill no longer renders as a blank plaque (`setHint("")` hides).
10. Ghost-floor law preserved under paling (`gh` reads unpaled base;
    verify-v11 21/21).

Open — the previous agent saw these with its own eyes and did not fix:
11. **Rest overprints**: two words stacked at the same spot render as an
    unreadable smear (e.g. 単なる/取り上げる). The arbiter only PAINTS; it
    never separates. Add a gentle position-separation force at rest (a few px
    over seconds, trance-compatible), or accept-and-document.
12. **Edge clipping**: words sit half-off the screen at rest (日光, 徐行).
    Keep-in-bounds margin or fade-at-edge.
13. **Family false friends**: gloss-token collisions admit strangers (安易
    "easy-going" enters 外出's family via the token "going"; hyphen splitting
    is the mechanism). Improve tokenization (keep hyphenated compounds whole)
    or add a small stop-pair list.
14. **Untraced 404** in the corridor's console on load (one resource; find it,
    fix it or remove the reference).
15. **Fog blobs**: the 墨流し marbling reads as blue-grey murk over the field
    rather than ink-in-water. Aesthetic tuning of the ink/stain canvases
    (amplitude, hue, edge softness) — this is half of "no ambience".
16. **Possible duplicate satellites** in the dive state (two 出 nodes were
    observed once — kanji pin + word node?). Reproduce and dedupe.
17. **Connector aesthetics**: first-tap bloom uses thin straight yellow
    spokes; the dive state draws curved indigo brush strokes. One language —
    the curved brush stroke — everywhere, and never wire a satellite that is
    rendered too faint to read.
18. **iOS pinch double-zoom** (see primary task hypothesis 4).
19. **Constellation typography**: the centre's English gloss renders in
    italic Latin serif under 外出 — check it against the app's type system
    (sans for glosses elsewhere); satellites' composed reveal
    (reading+word+gloss concatenated) needs typographic rhythm.
20. **One-app deploy**: the Pages site now serves the corridor at root
    (`pages-app.yml`), retiring the old standalone-Drift root and /app/ path.
    Keep it that way — one URL, one app. If you touch the workflow, keep the
    smoke-test step.

## Working rules

- Small commits, honest messages, evidence (screenshots/recordings + numbers)
  under `docs/build-evidence/drift-motion-fresh-eyes/`.
- After every drift edit: regenerate the layer, rebuild the standalone, run
  the three suites, and LOOK at your own screenshots before believing any
  number.
- The operator is on a phone. Deliver via the Pages deploy and plain-language
  notes: what will FEEL different, one paragraph, no jargon.
- An honest partial with a ledger beats a polished claim. The operator's
  hands are the final gate.
