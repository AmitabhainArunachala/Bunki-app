# Drift Fusion — the Drift design language through the whole app

- **Status:** ACTIVE — operator directive 2026-08-06, captured before build
  (anti-loss policy, same as the design doc).
- **Directive (operator, verbatim in spirit):** "Can we get the whole design
  and coloring etc of the Drift part fused throughout the entire app on
  every level?" — asked as parallel work while the red-team audit of the
  Drift prototype runs on the operator's machine.
- **Non-interference contract:** the red-team run owns
  `prototypes/drift/drift-artifact.html` and design-doc §8.13. This work
  touches neither. It lives entirely in `apps/app` + this spec.
- **Authority:** `docs/convergence/BUNKI_DESIGN_LANGUAGE_SESSION2_2026-08-05.md`
  supersedes working-spec §8 where they conflict. In particular the old
  "one vermilion accent, no rainbow" rule (REQ-UI-08) is superseded by the
  nihonga theme system: a fixed set of mineral pigments per theme is not a
  rainbow — it is the 岩絵具 palette the design doc mandates (§1, §2).
  The *discipline* survives in a stronger form: every token is enumerated,
  every rendered pair is contrast-asserted, and no screen may invent a
  colour outside the token set.

## 1. What fuses

The five Drift themes become the app's palette system, one-to-one with the
prototype's `THEMES` array (`prototypes/drift/drift-artifact.html:146`):

| Theme | Ground | Ink | pig1 | pig2 | accent | scheme |
|---|---|---|---|---|---|---|
| 北斎 | #FBFAF5 | #1B2A3A | 藍 #1E50A2 | 紺青 #165E83 | 朱 #EB6101 | light |
| 墨 | #F7F6F1 | #2B2A28 | #595857 | #7D7D7D | 朱 #EB6101 | light |
| 岩絵具 | #F3EAD8 | #40291C | 黄土 #C39143 | 弁柄 #8F2E14 | 緑青 #47885E | light |
| 緑青 | #EDF2E6 | #1F4433 | 緑青 #47885E | 群青 #4C6CB3 | 山吹 #F8B500 | light |
| 夜 | #281A14 | #FFFFFC | 群青 #4C6CB3 | 淡群青 #8FA3DC | 赤 #E2041B | dark |

Prototype values are display pigments on a canvas; the app renders text and
controls, so each token is **derived** from the prototype value by moving it
along its own hue until it clears the WCAG floor for its role (AA 4.5:1 for
text tokens, 3:1 for display/graphic tokens), never swapped for a different
hue. The derivation script and the final values live in
`apps/app/src/ui/theme.ts`; the contrast walk in
`apps/app/test/theme-contrast.test.ts` asserts every pair in **all five
themes**, not two schemes.

## 2. Token map (extends, never renames)

Existing `Palette` keys keep their names so every screen keeps compiling;
their values become theme-derived. New tokens:

- `pig1`, `pig2` — the theme's mineral pigments, display grade (≥3:1 on
  paper and raised). Used for: kanji hero glyphs, stroke-order numbering,
  radical/component chips, graphics.
- `gold` — 金泥. Light themes carry a darkened kindei that clears 3:1;
  夜 carries #E6C86E straight from the prototype. Reserved for
  collocation/ghost marks when those surfaces arrive (design doc §8.11).
- `vermilion` stays the *text-grade* accent (AA 4.5) derived from the
  theme's accent pigment; `frontierMark` and `focusRing` continue to reuse
  it exactly (that discipline test survives).

## 3. Theme selection

- Default follows the platform: OS light → 北斎, OS dark → 夜.
- The masthead gains the **theme seal** (印): a small round control showing
  the current theme's first character (北/墨/岩/緑/夜), tap cycles through
  the five. Registered in `INTERACTIVE_STYLES` so the ≥44 pt walk covers it.
- Choice persists on web (`localStorage["bunki-theme"]`); native holds it
  for the session (no storage dep in Phase 0 — an honest gap, noted here).
- The capture harness's `scheme` override keeps working: forcing `light`/
  `dark` forces that scheme's default theme.

## 4. Ground texture (washi)

Web only, `app/+html.tsx`: the page body carries the theme ground colour
plus a static laid-line washi texture (簀の目 horizontal lines + chain
lines, neutral ink at ≤3% alpha — visible as paper grain, never as
pattern). Native renders the solid ground; texture there waits for a
proper asset decision.

## 5. Typography and ma

Unchanged and reaffirmed: mincho on reading surfaces, sans for chrome,
4-based spacing scale, no fixed text-container heights. Drift's serif
stack and the app's `FONT_STACKS.mincho` already agree.

## 6. What this deliberately does not do (yet)

- No fluid sim, no canvas universe in the app shell — that is Drift's
  surface; fusion here is palette, texture, type, and marks.
- No per-JLPT rainbow: level marks stay within the theme's pigment set.
- No new root files, no changes under `prototypes/drift/`.

## 7. Verification

- `npm run test` in `apps/app` — contrast walk × 5 themes, touch targets,
  screen contracts.
- `npx expo export --platform web` + Playwright screenshots of index /
  word / kanji / session screens in all five themes (evidence in the PR).
