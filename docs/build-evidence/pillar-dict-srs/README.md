# Pillar evidence — the dictionary alone, and the SRS alone

Every image here was produced by `apps/app/e2e/pillars-dict-srs.spec.ts` driving
the **shipped web export** in Chromium. Nothing was staged, and no state was
seeded: each walk is presses and typing, starting from an empty browser profile.

Reproduce with:

```
npm run test:e2e:build
npx playwright test --config apps/app/e2e/playwright.config.ts pillars-dict-srs
```

## Scope, stated first

One engine (Chromium), one Linux container, desktop and 390 px widths. **No
phone, no Safari, no Firefox, no screen reader, no device.** Every millisecond
and every layout here is this container's.

## The dictionary walk — zero learner state

| Image | What it shows | What it proves |
|---|---|---|
| `dict-01-romaji-bunki.png` | `bunki` typed, 分岐 answered | The romaji door, which did not exist before this lane. |
| `dict-02-component-search.png` | `氵` typed, characters built from it | Component search: the query is not any of the answers, so every row is reached by decomposition. |
| `dict-03-browse-by-grade.png` | The grade axis open, grade 1 open, 60 of 77 characters | Browsing — reaching a word without knowing what to ask for. Each axis prints the licensor field it was read off. |
| `dict-04-kanji-page-reached-by-browsing.png` | A kanji page arrived at from a shelf | The browse is a door, not a display. |

The spec also asserts, after the whole walk, that `localStorage` contains no
`EncounterCaptured`: **using the dictionary writes nothing.**

## The SRS walk — no AI, no passage, no map

Three words are used throughout — 時間, 学校, 友達 — chosen because the seed's
one hand-written passage contains none of them. That was the ceiling: before this
lane, 稽古 answered a learner holding exactly this state with *"Nothing is taken
up for study yet."*

| Image | What it shows | What it proves |
|---|---|---|
| `srs-01-three-words-taken-up.png` | Three words taken up, each in one press from its own word page | "Add anything to study, in one action." |
| `srs-02-session-intro-and-standing.png` | 稽古 with a study list and a standing | The ceiling is gone: three off-passage words plan a sitting. |
| `srs-03-standing-per-lens.png` | Six contracts, three per lens, four named states | Per-capability lenses, never one score. `listening` and `production` say "nothing taken up yet"; `writing` says "not measured", which is a different sentence. |
| `srs-04-the-finite-plan.png` | The whole plan before the first step | A sitting you can see the end of. |
| `srs-05-explicit-completion.png` | The named completion state | The sitting ends explicitly. |
| `srs-06-standing-after-an-answer.png` | reading now `2 never asked · 1 holding`; today's bar reads 1 | One graded answer moved one contract, through the real gate and the pinned FSRS. |
| `srs-07-phone-390.png` | The same screen at 390 × 844 | No sideways scroll; asserted in the spec, not eyeballed. |

## Two rendering defects found by looking at these images, and fixed

Both were in this lane's own new work, and both were invisible to every test:

1. **The browse axis printed its derivation twice** — once as the disclosure's
   note and once again inside the body. Visible in the first run of
   `dict-03`; removed.
2. **An all-zero load window drew fourteen full-width grey tracks reading `0`.**
   A full-width grey rectangle is the shape of a *full* bar, so the honest
   picture read as the alarming one — in exactly the state that follows taking
   words up, when everything is overdue and nothing is in the window. The window
   is now drawn only when something falls in it, and says so in a sentence when
   nothing does.

## What these images do not show

- **The map, the guide, the journey surface, the reading passage, the dive.**
  Out of this lane, untouched, and not claimed either way here.
- **The integration canvas.** The SRS walk deliberately uses words the passage
  does not contain, so no canvas step is composed. The canvas path is covered by
  `finite-session.spec.ts` and `closed-loop.spec.ts`, which use 分岐.
- **A sitting with a fragile item in it.** Reaching `fragile` needs a contract
  graduated to review and then missed — two learning steps and a lapse, across
  simulated days. It is covered in the kernel
  (`packages/domain/test/session/standing.test.ts`) and is **not** in any
  screenshot here.
- **A load window with a spike in it.** Everything in these walks is new, so the
  window shows a backlog rather than a hump. The forecast's real subject — the
  review-debt spike the round-2 research names — is drawable by the code and is
  not photographed.
