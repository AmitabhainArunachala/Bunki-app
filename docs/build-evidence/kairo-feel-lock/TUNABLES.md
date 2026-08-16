# KAIRO feel-lock — the tunables sheet

Every named constant this campaign added to
`prototypes/drift/drift-artifact.html`, its shipped value, and one line on
what turning it does. After any change: regenerate
(`node prototypes/corridor/tools/build-drift-layer.mjs`, then
`node prototypes/corridor/tools/build-standalone.mjs`) and re-run the suites.

## Motion (WP7) — top of the drift script

| constant | value | turning it does |
| --- | --- | --- |
| `DRIFT_SPEED` (L209) | `1.15` | How hard each word fidgets on its own private heading. `1` was the old near-stillness. Raising it is the expensive knob: private headings disagree, so words shear across each other and hand the collision arbiter fresh tangles. |
| `CURRENT_STRENGTH` (L211) | `0.038` | How much the shared gyre owns. Carries a word up to ~8.7 world units off its anchor (on top of the ±16/±12 fidget box) and stirs the flow motes. This buys coherent, hypnotic speed nearly free. |
| `CURRENT_DRIFT` (L213) | `0.0017` | How fast the gyre's eye wanders. This is what turns a standing pull into visible motion — a parked eye means nothing moves. Halving it roughly halves the felt speed. |

Derived (not for direct tuning): `CURREACH = CURRENT_STRENGTH*230` (max
gyre excursion), `ARB_EVERY = round(5/DRIFT_SPEED)` (collision-arbiter
cadence — speeds up automatically if the field speeds up).
`prefers-reduced-motion` silences all three: the field is fully still.

## Presence / collision arbitration (WP2)

| constant | value | turning it does |
| --- | --- | --- |
| `GHOST_ABS` (L2735) | `0.30` | The absolute floor under a receded ("ghosted") word's rendered opacity. The effective floor is the field's own quietest painted presence (~0.327); this constant is the never-below backstop. Lowering it risks the "nothing disappears" law — the law checks in verify-v11 will go red. |
| `CONTEND_MAX` (L2735) | `0.53` | The loudness a word must carry to take a tangled neighbour's water. Raising it toward 1 makes the arbiter shy (more overlap left standing); lowering it makes it eager (more ghosting). Falsified by mutant: 0.95 scores 19/21. |

## Pool paging (WP9a)

| constant | value | turning it does |
| --- | --- | --- |
| `PAGE_SPAN` (L934) | `2.0` | How far the paging wheel can lift a word's rank. Exactly 2.0 preserves the untouched-field ranking bit-for-bit at phase 0 (2·h01 = old tie-break + 1); it also deliberately sits under the 2.4 judgment bonus so a marked-unknown word always outranks paging. Change it and both properties break. |
| `PAGE_CYCLE` (L934) | `40000` | World-pixels of camera travel per full wheel turn (~47 screen-heights). Turning it down surfaces the deep tier faster but raises mid-pan word exchange proportionally (shipped cost: ~+0.2–0.4 fades/sec while dragging, zero at rest). |

## What is deliberately NOT a constant

The ghost floor reads the field's own quietest presence each pass (WP2) —
it follows the presence ladder rather than pinning a number. The calm gate
(WP7) stills the whole field under an active touch in ~7 frames; it is a
law, not a dial.
