# Drift Coherence Campaign → v11 (2026-08-06)

- **Status:** ACTIVE — operator: "interact deeply and meticulously… many
  places where it seems still very incoherent and inconsistent… go to town."
- **Root cause (named):** every feature was verified in isolation; nothing
  audited the COMPOSED surface under real compound gesture use. The
  incoherence lives *between* features. The prior red team fixed crashes but
  parked the coherence pile as "operator design calls."
- **Method:** parallel read-only diagnosis across axes (agents drive the live
  surface with real touch gestures), consolidated into one ranked fix plan;
  then serial implementation in the single artifact by the main loop, each fix
  re-verified against the whole surface, converging into v11.

## Confirmed at start (main-loop audit of v10.5)

- Word collisions / illegible overprints at rest (触れる+判断, 増加/救う…).
- Edge clipping (別/歯/らす/順 behind brand + screen edges); no safe inset.
- Compound-state chaos: zoom and lock both "stuck on" → lock + field render at
  two scales at once; no reliable gesture back to a clean rest.
- Idle motion nearly imperceptible (~0.2px/1.4s).
- Tap accuracy shaky on drifting targets.

## Axes (diagnosis fan-out)

1. **Spatial** — collisions, overlap, edge-safe insets, ink-blob-over-words,
   size hierarchy sanity.
2. **Camera/state** — zoom in/out symmetry, rotate, pan momentum, and a
   guaranteed return-to-rest; reproduce every stuck state.
3. **Gesture grammar** — tap→furigana→English→dive→lock→swipe compound
   sequences; always-a-way-home; pinch-in-dive stealing nav; double-tap vs
   staged-tap collision; pointercancel dangling.
4. **Legibility & flows** — contrast across all 5 themes; card / dictionary /
   radical / study-link flow coherence; first-run discoverability.

## Deliverable

A hardened `prototypes/drift/drift-artifact.html` (v11), findings ledger as
design-doc §8.15, republished to the same artifact URL, via PR.

## Resolution (2026-08-06) — SHIPPED

The diagnosis fan-out (5 agents, 4 axes, real CDP touch on the composed
surface) consolidated into **nine ranked defects**; all nine are fixed in v11.
The full findings + fix map is design-doc §8.15
(`BUNKI_DESIGN_LANGUAGE_SESSION2_2026-08-05.md`). Headline defects:

- No return-to-rest; unbounded rotation; a surfacing pinch bleeding into
  zoom-out (`drift-artifact.html:798` was the only place the camera was ever
  set to rest).
- Zero collision avoidance — legible words overprinted (0.84 at rest, 0.96
  after zoom) and drifted under fixed chrome.
- Hint at 1.55:1 in 夜; 緑青/岩絵具 foreground at ~1.7:1.
- A 16-word lock dissolving at min zoom; a word stuck `unfolded` after locking
  another.

**Verified**, not asserted: `prototypes/drift/tools/verify-v11.mjs` drives the
composed surface with real touch and asserts each fix — **17/17 checks, zero
console/page errors**. Rest overlap 0.84→≤0.01, post-zoom 0.96→≤0.05, chrome
overlaps→0; recenter restores z→1 & rot→0; the lock renders all 16 members at
`cam.z=0.34`; hint clears ≥9.5:1 and 緑青/岩絵具 reach parity with the other
light themes. Known-good behaviours (ink-blob layering, zoom clamp, upright
glyphs, swipe-grade persistence, the whole card/dictionary/radical layer) were
confirmed and left untouched.
