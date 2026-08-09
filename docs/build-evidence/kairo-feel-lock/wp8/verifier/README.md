# WP8 · verifier's own probes

Written from scratch against commit `87e3313`, not adapted from
`../wp8-evidence.mjs` (that harness was read for method only). Run from the
repo root with `playwright-core` resolvable and the browsers already installed:

```
node docs/build-evidence/kairo-feel-lock/wp8/verifier/p1.mjs   # happy path, prefix property, back/focus/scroll, rAF + localStorage instruments
node docs/build-evidence/kairo-feel-lock/wp8/verifier/p2.mjs   # scroll restore at the exact click instant; numbers toggle mechanism
node docs/build-evidence/kairo-feel-lock/wp8/verifier/p3.mjs   # 丑 (no data), Escape, back() ordering over a sheet stack, 10× cycles
node docs/build-evidence/kairo-feel-lock/wp8/verifier/p4.mjs   # ui=ja, reduced motion + clamping, 4 theme combinations, 320 / 1280
node docs/build-evidence/kairo-feel-lock/wp8/verifier/p5.mjs   # is the faint metadata a WP8 regression or the shipped soft-fade token?
node docs/build-evidence/kairo-feel-lock/wp8/verifier/p6.mjs   # 一 (1 stroke), 鑑 (23), triple-fire the door, replay spam, keyboard entry
SA_HTML=/abs/path/to/built.html node docs/.../verifier/p7.mjs  # scratch-built standalone parity
```

`p7.mjs` needs a standalone built to a scratch path first — the checked-in
`prototypes/corridor/corridor-standalone.html` is stale and must not be rebuilt
in place:

```
node prototypes/corridor/tools/build-standalone.mjs /tmp/sa.html
```

## What the numbers came out as

| probe | result | notes |
|---|---|---|
| p1 | 22 / 24 | the 2 reds were the probe's own instrumentation, see p2 |
| p2 | 4 / 5 | the 1 red is a tautological check of my own tap helper |
| p3 | 15 / 16 | the 1 red misread the app's one-language-per-mode `tx()` rule, see p4 |
| p4 | 19 / 21 | the 2 reds are the shipped `--faint` soft-fade token, see p5 |
| p5 | 5 / 5 | |
| p6 | 10 / 10 | |
| p7 | 2 / 2 | |

Zero defects attributable to WP8. `verify-corridor.mjs` 91/91 and
`verify-corridor-accessibility.mjs` 20/20 on the same commit.

Census recomputed independently from the two shipped layers: 2,582 kanji keys,
2,136 stroke keys, 2,134 reachable, **448** with no paths, orphan stroke keys
exactly `𠮟` and `剝`. Matches the implementer's claim to the character.

## Two things that are true but pre-existing

- `.stroke-meta` resolves to `--faint`, which is `rgba(20,24,28,0.42)` in the
  soft-fade contrast variant — **2.67 : 1** at 12px, below 4.5 : 1. Under the
  WCAG variant the same token is `0.68` and the line measures **6.05 : 1**.
  p5 shows eight pre-WP8 nodes (`pool-tag`, `shelf-snippet`, `details-toggle`, …)
  sitting at 2.64–2.68 : 1 in the same variant. The stroke page inherited the
  variant; it did not introduce the fade. There is no dark theme in this
  prototype — the two axes are depth (flat/layered) and contrast.
- `corridor-standalone.html` does not contain the stroke page. It was already
  three corridor.js commits behind before WP8 landed.
