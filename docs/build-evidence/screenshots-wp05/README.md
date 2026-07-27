# WP-05 screenshot evidence — screens 1–3 on Expo Web

Builder B6 · branch `agent/bunki-phase0-closed-loop-wp05` · captured 2026-07-27,
re-captured 2026-07-27 after the V5 repair round

Controller §19 WP-05 requires "screenshot evidence saved under
`docs/build-evidence/`", and REQ-UI-09 requires every screen to define loading,
error, empty and offline states. This directory is both: 27 captures covering
the three screens in every one of those states, plus the ready state in both
colour schemes — and, since the repair round, `accessibility-audit.json`, which
is what a screenshot cannot be.

## What these images are

Every image is the **real exported app**. The harness
(`apps/app/scripts/capture-evidence.mjs`) serves the output of
`expo export --platform web` over a local static server and drives headless
Chromium over the Chrome DevTools Protocol. There is no mock renderer and no
fixture harness:

- the pages are the production bundle, hydrated;
- the data is `@bunki/seed`, imported and validated the way the app imports it;
- clicks are real input events on real controls;
- the **offline** state is Chrome's own network emulation, so `navigator.onLine`
  and its events are what the app actually observes;
- the two colour schemes are the app's own `?scheme=` flag, not a filter applied
  to a picture.

Each shot runs in a fresh browser target, because the Phase-0 store is in memory
and one shot's kept thread must not leak into the next one's evidence.

## What is *not* claimed

- **These are web measurements of a web build.** Nothing here says anything
  about native behaviour; that is WP-11's, and only WP-11's, claim (P0-CAP-15).
- **Nothing here demonstrates durability.** The store is
  `in-memory-session-only` and every screen says so. T-01 ("saving survives
  reload") belongs to WP-03.
- **No performance number is claimed.** No timing was measured; §13's budgets
  are not addressed by this work package.

## Reproducing

```bash
npm install
(cd apps/app && npx expo export --platform web)
node apps/app/scripts/capture-evidence.mjs
```

The harness exits non-zero if any shot **or any accessibility check** fails, so
"no evidence produced" cannot pass as success. `index.json` beside these files is
written by the same run and records the per-shot outcome and captured page
height; `accessibility-audit.json` records the audit below. Chromium is found at
`$CHROME_PATH` or a Playwright browser directory.

Two flags exist purely so two of the four required states can be photographed
(see `apps/app/src/state/debug-flags.ts`): `?lag=` holds the loading state open,
`?fail=1` makes a lookup fail. Both are inert unless present in the URL, and
both drive the screen's *real* state machine rather than a stand-in. The seed is
bundled and validated at import, so without them a lookup resolves within a
frame and can never fail on its own.

## Index

| File | Screen | State | Note |
| --- | --- | --- | --- |
| `01-capture-empty-start.png` | capture | empty (no query yet) | The start state names the seed's size and suggests the canonical fixture 分岐. |
| `02-capture-loading.png` | capture | loading | Held open by `?lag=`; the state machine is the app's own. |
| `03-capture-answer.png` | capture | ready | REQ-UI-01 "correct answer immediately": top answer, one-tap Keep, and the five-way uncertainty gesture. |
| `04-capture-kept-enriching.png` | capture | ready — acknowledged, enrichment running | **The REQ-UI-01 ordering, photographed.** "Kept — 分岐", the acknowledgment instant, the two events written, and "Enrichment running… (started after this acknowledgment)". |
| `05-capture-kept-enriched.png` | capture | ready — acknowledged, enrichment finished | Both instants on screen: the acknowledgment precedes the enrichment that followed it. |
| `06-capture-double-tap-idempotent.png` | capture | ready — Keep tapped twice | "Already kept", no new events, still one thread (controller §17.2). |
| `07-capture-empty-no-match.png` | capture | empty — query matched nothing | Says the *seed* has no entry, not that the word does not exist; carries `SEED_COVERAGE_DISCLOSURE`. |
| `08-capture-error.png` | capture | error | The real error path with a retry action. |
| `09-capture-offline.png` | capture | offline | Browser network emulation. The banner says what still works rather than only that the network is gone. |
| `10-capture-dark.png` | capture | ready — dark scheme | Both schemes are asserted against WCAG AA in `apps/app/test/theme-contrast.test.ts`. |
| `11-word-layers-0-1.png` | word | ready | REQ-UI-02 layers 0 and 1, the seed entry disclosure above them, provenance under every field. |
| `12-word-layers-2-3.png` | word | ready — deeper layers expanded | Layers 2 and 3 as far as the seed reaches; the unfilled sections name what is missing and why (pitch accent, collocations, full dictionary fields). |
| `13-word-with-thread.png` | word | ready — reached from a kept thread | Kept on the capture screen, then navigated in-app: the encounter, the uncertainty mark, and the promotion ladder. |
| `14-word-loading.png` | word | loading | |
| `15-word-error.png` | word | error | |
| `16-word-empty.png` | word | empty — unknown lexeme id | |
| `17-word-offline.png` | word | offline | |
| `18-word-dark.png` | word | ready — dark scheme, layers expanded | |
| `19-kanji-layers-0-1.png` | kanji | ready — stroke order complete | REQ-UI-03 layers 0 and 1. Stroke paths come from the seed's KanjiVG files with its CC BY-SA 3.0 attribution beneath. No dictionary index is rendered anywhere. |
| `20-kanji-stroke-midway.png` | kanji | ready — mid stroke order | The animation stepped by hand: written strokes in ink, the stroke being written in the one vermilion accent, the rest ghosted. |
| `21-kanji-bunki.png` | kanji | ready — 分 | The other half of the canonical fixture 分岐. |
| `22-kanji-loading.png` | kanji | loading | |
| `23-kanji-error.png` | kanji | error | |
| `24-kanji-empty.png` | kanji | empty — character not in the seed | |
| `25-kanji-offline.png` | kanji | offline | |
| `26-kanji-dark.png` | kanji | ready — dark scheme | |
| `27-capture-mark-after-keep.png` | capture | ready — mark applied *after* Keep | The path the screens used to describe wrongly. Kept with no mark, then marked: the acknowledgment lists `EncounterCaptured, ThreadPromotionChanged` and the note under the chips now says the mark is on this device only and is **not** in the event log. |

## Accessibility audit — `accessibility-audit.json`

A screenshot cannot photograph an accessibility tree, and that is precisely how
`ruby.tsx` came to claim the furigana pieces were hidden while every one of them
was exposed to a screen reader. The same harness therefore ends with an audit
pass: it asks Chrome for the accessibility subtree under a rendered `RubyText`
(`Accessibility.queryAXTree`) and asserts what an assistive technology would
actually find — one exposed named node, whose name is the whole word and its
reading, with no written form, reading or placeholder exposed on its own.

Roles and names in that file are **Chrome's own computation**, not the app's
props, which is the point: a prop the web target silently drops shows up here as
an exposed node rather than as a passing test.

Measured on the same bundle these screenshots come from:

| Subject | Exposed named nodes | The name |
| --- | --- | --- |
| `RubyText` on `/word/lex-wakareru` (分かれる, split わ + かれる) | 1 | `分かれる（わかれる）` |
| `RubyText` on `/word/lex-bunki` (分岐, one segment) | 1 | `分岐（ぶんき）` |

The audit was falsified before it was trusted: re-run against the pre-repair
build it fails 7 of its 8 checks and reports the exposed nodes
`分かれる（わかれる） | わ | 分 | 　 | かれる` — the interleaving as reported.

A failed check fails the run, so this cannot pass by producing nothing.

## Four-state coverage per screen (REQ-UI-09)

| Screen | loading | error | empty | offline |
| --- | --- | --- | --- | --- |
| 1 capture/search | 02 | 08 | 01, 07 | 09 |
| 2 word page | 14 | 15 | 16 | 17 |
| 3 kanji page | 22 | 23 | 24 | 25 |

The kanji page additionally handles the stroke asset's own empty and error
states separately from the page lookup, so a character that exists with an
unreadable stroke file still renders its meanings, readings and compounds
(`kanji-stroke-empty` / `kanji-stroke-error` in `src/screens/kanji-screen.tsx`).

## Where the requirements are visible

| Requirement | Shots |
| --- | --- |
| REQ-UI-01 result immediately | 03 |
| REQ-UI-01 one-tap Keep + acknowledgment before enrichment | 04, 05 |
| REQ-UI-01 one-gesture uncertainty mark (meaning · reading · use · kanji · not sure) | 03, 04 |
| REQ-UI-02 layers 0–1 in full | 11, 13 |
| REQ-UI-02 layers 2–3 as the seed supports, provenance shown | 12, 18 |
| REQ-UI-03 layers 0–1, stroke animation from seed KanjiVG | 19, 20, 21 |
| REQ-UI-03 dictionary indices never rendered | all kanji shots; also scanned in `test/screen-contract.test.ts` |
| Seed entry disclosure on word and kanji pages | 11–13, 18–21, 25, 26 |
| REQ-UI-08 ink-and-paper palette, one vermilion accent, ruby | every shot |
| REQ-UI-08/09 AA contrast in both schemes | 10, 18, 26 (+ the contrast test) |
| REQ-UI-09 four states per screen | table above |
| REQ-UI-09 one spoken label per ruby word, pieces not exposed | `accessibility-audit.json` (measured, not photographed) |
| P0-CAP-15 durability stated honestly | 03–06, 13, 27 |
