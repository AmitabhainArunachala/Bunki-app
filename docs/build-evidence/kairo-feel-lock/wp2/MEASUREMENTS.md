# WP2 — v11 coherence mechanisms ported into the current Drift source

Base: `f433edf` (claude/kairo-feel-lock-2026-08-09). Donor of the mechanisms:
`1f582fc` on `origin/claude/drift-coherence-v11` — an older Drift build, so the
mechanisms were ported by hand, not the diff.

Instrument: `prototypes/drift/tools/verify-v11.mjs`, recovered from the donor and
re-aimed at the current DOM. Real CDP touch, 390×844 mobile/touch profile,
17 composed-surface checks, zero console/page errors a hard gate on top.

## Reproducing the baseline

```
git show f433edf:prototypes/drift/drift-artifact.html > /tmp/drift-baseline.html
node prototypes/drift/tools/verify-v11.mjs --src /tmp/drift-baseline.html \
  --label baseline-prefix --port 8941 --out /tmp/v11-baseline.json
```

## Headline numbers — before → after

| check                     | baseline (`f433edf`)                     | after (this branch)                    |
| ------------------------- | ---------------------------------------- | -------------------------------------- |
| `4-rest-overlap` worst    | **0.88** · badPairs **10** · 39 legible   | **0.00–0.03** · badPairs **0** · 29 legible |
| `4-zoom-overlap` worst    | **1.00** · badPairs **29** · 39 legible   | **0.05–0.13** · badPairs **0** · ~20 legible |
| `6-chrome-keepout`        | **3–4** legible words under chrome        | **0**                                  |
| `1-pinch-surface-nobleed` | stack 1→0, z **1 → 0.34** (floor)         | stack 1→0, z **1 → 1**                 |
| `3-rot-clamp`             | cam.rot **8.378** after 3×160°            | cam.rot **3.142** (= π)                |
| `2-return-to-rest`        | messy(z 2.6, rot 2.62) → **unchanged**    | → **z 1.000, rot 0.000**               |
| `8-unfold-clear-on-lock`  | unfolded **1 → 1**                        | unfolded **1 → 0**                     |
| `8-lock-persists-minzoom` | z 0.34, focus 12, **visible 1**           | z 0.34, focus 12, **visible 12**       |
| `8-lock-release-clean`    | pass                                      | pass                                   |

### Hint pill contrast (text over its own plate, per pigment world)

Composited honestly: text colour × its own alpha over (plate colour × its alpha
over `--ground`). WCAG AA body text needs 4.5:1.

| theme  | baseline (`--faint`, transparent) | after (`--ink` on `--plaque`) |
| ------ | --------------------------------- | ----------------------------- |
| 北斎   | 2.45                              | **13.97**                     |
| 墨     | 2.29                              | **13.25**                     |
| 岩絵具 | 2.32                              | **11.32**                     |
| 緑青   | 2.18                              | **9.54**                      |
| 夜     | 3.53                              | **17.81**                     |

Note on provenance: the WP2 brief quoted 1.55:1 for 夜. This instrument measures
3.53:1 there — same defect (well under 4.5), different compositing model. The
number above is the one this harness actually produces; it is not the brief's.

### Foreground word contrast — median of the loud, large words (op ≥ .5, ≥ 18px)

| theme  | baseline | after     | light-theme baseline (min of 北斎/墨) |
| ------ | -------- | --------- | ------------------------------------- |
| 岩絵具 | **2.12** | 2.59–2.69 | 2.63–2.82                             |
| 緑青   | **2.17** | 2.67–2.87 | 2.63–2.82                             |
| 夜     | 4.08     | 4.02–4.43 | —                                     |

Gate: ≥ 2.4 absolute AND ≥ 90 % of the untouched light-theme baseline. Both
worlds were outliers at baseline (≈ 76 % of baseline); both now sit at parity.

## Acceptance

- `verify-v11.mjs` — **17/17, twice**, zero console errors, zero page errors:
  `verify-v11-run1.txt` / `verify-v11-run2.txt` (JSON alongside).
- `verify-drift-consistency.mjs --mode fast` — **45 cases · 45 ok · 0 violations ·
  0 page errors**, three consecutive runs against the locally regenerated
  corridor fusion (`drift-consistency-fast-after.txt`, `-run2.txt`).
- `build-drift-layer.mjs` — **12/12 exact-string patch anchors matched, all
  asserted unique**. No anchor adjustment was needed.
- Regenerated `prototypes/corridor/drift-layer.*` were discarded before commit,
  per the orchestrator's merge protocol.

## Known-flaky neighbour suite (not owned by WP2)

`verify-drift-hunt.mjs` carries pre-existing flake in the staged-semantic-reveal
cluster. Measured on this machine:

| tree              | runs | reds observed                                               |
| ----------------- | ---- | ----------------------------------------------------------- |
| baseline `f433edf`| 4    | 1, 2, 1, 0 — all staged-semantic-reveal                      |
| this branch       | 3    | 1, 2, 1 — all staged-semantic-reveal                         |

Same envelope, same cluster. See `drift-hunt-after-run1.txt` / `-run2.txt`.

### One transient the WP2 work did cause, and closed

An intermediate build (before the `focusN`/`hlDom` snap in the frame loop) went
red once on `fuzz-sat-reveal` in the consistency sweep and twice on the hub
cluster in the hunt. Root cause: a word receded by the arbiter eased back to full
presence over ~330 ms, so a satellite promoted into a fresh constellation could
still be faint and `pointer-events:none` when the learner's next tap landed.
Fixed by snapping `collide` to 1 for any node that is `focusN` or `hlDom` — a
word taken into a constellation is at full presence at once. Three consecutive
45/45 sweeps and three hunt runs with no hub reds followed.

## Screenshots

`shots-baseline/` and `shots-run1/` — same probe points, 390×844.
`01-rest` is the overlap/chrome evidence; `05-zoomed` the post-zoom overlap;
`08-theme-*` the hint pill and pigment palettes per world; run1 also carries
`04-home` (return-to-rest), `06-lock` and `07-lock-minzoom` (constellation whole
at cam.z = 0.34).
