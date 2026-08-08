# The KAIRO Excellence Spec — from working prototype to superb product

> **STATUS: DRAFT — open for comment.** This document is meant to be
> argued with, tested against, and revised. Comments, corrections and
> counter-proposals belong on the tracking issue (see §8) or as PR review
> comments on this file. Nothing here is settled except the items marked
> **RATIFIED**, which carry an operator ruling and may only be changed by
> another one.

**This document is a standing prompt.** It sits above the build brief
(`KAIRO_BUILD_BRIEF.md`, the phases), the zero-quirk spec
(`DRIFT_ZERO_QUIRK_SPEC_2026-08-08.md`, the correctness floor), and the
design canon (`BUNKI_DESIGN_LANGUAGE_SESSION2_2026-08-05.md`, the taste).
It answers one operator order: _this is child's play for a Fable-class
agent — build a super amazing product, not a patched demo._ The agent
reading this owns product excellence, not just green checks.

---

## 0. The priors this spec inherits

Everything below assumes the reader has these in hand. They are the
accumulated law of the project and this spec never overrides them.

**Canon (taste and structure)**

- Nihonga ground, Akira×Ghibli energy; one washi ground + ink + two
  pigments + one accent per theme (canon §1–2).
- Every element is a door; no terminal surfaces; particles and radicals
  are first-class destinations (§4).
- The Drift is 墨流し: tap-depth not pinch-depth, hypnotic not gamified,
  trance boundary absolute — no scores, streaks, confetti (§8).
- The honesty contract: swipes are self-assessment, never retrieval
  proof; they nominate and schedule probes, they never write memory
  state directly (§8 honesty contract, convergence A2/C3).
- Reference bars: Renzo (dictionary solidity, quiet front door) and
  Kodansha KKLC (kanji page as specimen case) — canon §7.

**Law (paid for in defects)**

- Click grammar, one discipline everywhere: tap = furigana · tap again =
  English · third act carries in · long-press = mini-dictionary · keep
  holding = full entry · particles inert on tap, open on hold.
- Palette law: 弁柄 red = readings and warnings ONLY; 藍 indigo = "you can
  go here"; levels and chrome are never red.
- Clean print: reader surfaces carry no provenance, licence chatter, or
  self-narration. Attribution lives on its own page, once.
- Licence walls: `proprietary_safe` / `share_alike` / `original`, never
  mixed silently. DoJG is the capability bar, never a source. Mainstream
  Japanese news is contractually off-limits.
- Verification discipline: real CJK fonts at device scale, look at the
  screenshots with your own eyes, send them to the operator before they
  can find defects themselves, never accept a layout that depends on font
  metrics to be correct.
- Signals are true of the text displayed, or they are marked unmeasured.
  Three signals, never averaged; disagreement surfaced, never resolved.

**Ratified rulings (2026-08-08)**

- **RATIFIED · staged satellite taps.** In a constellation, a satellite
  tap reveals it in place; a second tap re-centres the constellation on
  it. Chainable to any depth.
- **RATIFIED · judgment scope.** While a constellation is open, only the
  held/centred planet may be flick-judged. On the free field, any word.
- **RATIFIED · nothing disappears.** No word ever vanishes except by the
  deliberate flick-judgment. Every other disappearance is a P0 defect.
- **RATIFIED · the tide is real.** The level slider expands, brightens,
  glows and elevates under the finger; and the words in the field belong
  to the chosen register — measured, not vibed (≥80% purity at a stop).
- **RATIFIED · scope of the zero-quirk campaign.** Drift + its doors into
  the corridor.

**State of the build (2026-08-08)**

- Phase 1 done: corpus pipeline revived, 26 full-length articles on the
  shelf via `build_articles.py`, lazy per-file loading.
- Phase 2 segment 1 done: Drift is the front door, fused as a gated layer
  extracted from the byte-untouched drift source.
- Instruments: `verify-corridor.mjs` (90), `verify-drift-consistency.mjs`
  (64 + tide), `verify-drift-hunt.mjs` (8 hunt regressions).
- Phases 3 (drill room) and 4 (monthly truth) NOT started — this is the
  single biggest product gap (see §2.2).

---

## 1. The bar, calibrated against the wild

Fable-class agents are shipping, from single prompts and short sessions:
playable 3D games with biomes and physics, hyper-polished liquid-glass
product sites, live dashboards, navigable terrain visualisations. That is
the competence class this project buys, and the standard the operator is
holding it to. Internally the bar is already written: Renzo's solidity and
Kodansha's specimen pages for the bones; the operator's named vibe for the
soul — _"ancient Japan meets anime meets outer space meets obsidian graph
meets additive AI study app."_ Anything that would look ordinary next to
either bar is below spec.

---

## 2. What we are missing (agent's assessment, 2026-08-08 — argue with this)

### 2.1 The five-second wonder

Showcase builds deliver their magic before you understand anything.
KAIRO's deepest virtues — honest signals, licence law, verified
interactions — are _invisible_ virtues. Our five-second wonder is the
Drift, and it is running at perhaps 60% of its ceiling: the washi does not
fully survive a screenshot, the fluid is a CPU grid where the canon itself
names WebGPU MLS-MPM as the real tier, and words still occasionally read
as glyphs on a gradient rather than ink on water. The showcase works win
by _committing_ to a physicality. The atmosphere pass is not decoration;
it is the product's first impression.

### 2.2 The reason to come back tomorrow — THE BIGGEST GAP

Every compelling build has a loop. We refuse the cheap version by law (no
streaks, no confetti), but the _honest_ loop is the drill room and the
monthly truth — Phases 3–4, unbuilt. Renzo keeps the operator because
their lists live there. Until a word taken yesterday **comes due**
somewhere visible, KAIRO is a beautiful place to visit, not a place to
live. The daily-driver test (§4) fails on this alone. This should
outrank almost everything.

### 2.3 Continuity of motion between rooms

Expensive-feeling products never cut; every state flows. Drift→shelf is a
hard cut today. One app should _feel_ like one space: the universe recedes
into the shelf, an article opens out of its shelf card, the dictionary
sheet rises from the tapped word. Shared-element motion is cheap to build
and disproportionately sells "one app, no seams."

### 2.4 The leverage nobody is using: corpus depth wearing a beautiful skin

The showcase works are impressive as _artifacts of generation_. KAIRO's
architecture is already built to receive exactly that kind of generation,
and we are not feeding it:

- semantic tier: 27 hand-authored words against a 6,687-word lexicon;
- grammar dictionary: 60 entries toward a ~600-point horizon;
- shelf: a pipeline that can grade any rights-clean text, fed 8 original
  texts.

Mass authoring **under the licence law** — typed relations across the whole
lexicon, hundreds of graded original readers per level, example sentences,
elaborative notes — is precisely what a Fable-class model does at showcase
quality. It is the difference between a demo shelf and a Todai-scale
library. Spend the model on corpus depth, not on spectacle.

---

## 3. The five pillars (measurable)

**P1 · The Drift is hypnotic, not merely functional.** ~60 fps during
drift, bloom, chain walks and tide changes; gesture-to-response <50 ms;
trance boundary absolute; atmosphere at the canon §8.3 texture bar; the
tide law honoured; the constellation walk chainable forever with nothing
lost — it must feel like thought.

**P2 · The corridor reads like print.** Full-length texts, paragraphs
intact, real furigana, no chrome noise; boot-to-readable-shelf under
~1.5 s on LTE-class throughput; article opens feel instant; signals
honest and one 詳細 tap from the instrument.

**P3 · The dictionary meets the Renzo bar.** Lookup answer <100 ms; every
sense, most common first; real examples from the shelf; kanji pages with
strokes, 音訓, 漢検 and compounds-by-sense; four doors of search; every
element a door at every depth.

**P4 · The Walk is whole.** Drift → article → word → kanji → radical →
覚える → scheduled drill → monthly truth. A complete thin Walk outranks a
gold-plated room. One navigation fabric, one click grammar, one palette.

**P5 · Craft floor everywhere.** WCAG AA, ≥44 px targets, bilingual chrome
by default with 日本語のみ as opt-in immersion, palette law, no
telemetry-speak on reader surfaces. The zero-quirk floor is a
precondition, never the achievement.

---

## 4. The daily-driver test (the only acceptance that matters)

The product is "super amazing" when the operator reaches for KAIRO instead
of Renzo for a real study session — and comes back the next day. Every
round must move at least one pillar measurably toward that, and the round
report must name the pillar and the measurement.

---

## 5. How the agent works this spec

1. **Rounds ship product value, not just fixes.** Pick the weakest pillar,
   state the measurable target, build, verify with instruments _and_ eyes,
   screenshot, ship to the artifact, report.
2. **Instruments only grow.** Every pillar target becomes a permanent
   check (fps probe, latency probe, register purity, boot budget). No
   change may make an instrument smaller.
3. **Failing case first.** No fix without a red case reproducing it; the
   case stays in the matrix forever after; the log names the mechanism,
   not the symptom.
4. **Verification economics (learned 2026-08-08).** Mechanical acceptance
   — fuzz, soak, endurance chains, matrix re-runs — is _scripted_, run in
   the main loop, and costs almost nothing. Agent fleets are for
   **discovery** of what the author did not think to test; they cost
   ~2M tokens a run and are reserved for after material change. The
   2026-08-08 hunt hit the account's monthly limit mid-run and four
   verifications died — budget the fleet deliberately, and never let a
   fleet do a script's job.
5. **Adversarial by default after material change.** Six lanes minimum
   (chain · dive · strata+themes · camera · judgment · doors+soak+fuzz),
   default-refute verification, findings fixed failing-case-first.
6. **Canon is law.** Ambiguity resolves to a default plus one batched
   question — never a stall.
7. **Evidence cadence.** The operator sees screenshots before they can
   find defects, gets batched reports, and always has a fresh artifact.

---

## 6. Backlog (ordered — order itself is open for comment)

1. **Phase 3 thin: the drill room.** Taken words come due, visibly.
   Closes the loop; unblocks the daily-driver test. (P4, §2.2)
2. **Atmosphere pass.** Washi/laid-lines/aerial perspective to the canon
   §8.3/8.5 bar in all five themes; texture must survive a screenshot.
   (P1, §2.1)
3. **fps + latency instrumentation**, then hit the budgets. (P1)
4. **Word → dictionary handoff.** A committed Drift card opens the
   corridor's full Renzo-grade entry without breaking flow. (P3/P4, §2.3)
5. **Motion continuity between rooms.** Shared-element transitions
   drift↔shelf↔reader↔sheet. (§2.3)
6. **Semantic tier at scale.** Typed relations across the lexicon, under
   licence law. (§2.4)
7. **Boot/latency budget** for the fused app on LTE-class. (P2)
8. **自 mode v1** — the tide follows SRS state (i+1 dosing, honesty
   contract intact). (P1/P4)
9. **Phase 4 thin: the monthly truth.** The Walk closes. (P4)

---

## 7. Open questions for the grill session (defaults proceed meanwhile)

- **Q-A · Drill room shape.** Default: a room reachable from the corridor
  showing due counts and running MCD-cloze cards from taken words.
  Alternative: drilling happens _inside_ the Drift as a weather.
- **Q-B · Atmosphere tier.** Default: push the CPU/canvas ground to its
  ceiling. Alternative: commit to WebGPU MLS-MPM for the real-app tier,
  with a canvas fallback.
- **Q-C · Semantic tier scale.** Default: expand to the ~1,500 most
  productive words. Alternative: full-lexicon pass.
- **Q-D · Motion continuity budget.** Default: shared-element transitions
  on the three main seams only.
- **Q-E · Sound and haptics.** Default: none (silence is canon). Open
  question: a near-silent water note and a paper-touch haptic could
  deepen the trance — or violate it. Operator's ruling.
- **Q-F · Backlog order.** §6 as written, or drill-room-last.

---

## 8. Comment, test, evolve

This draft is a claim, not a conclusion. It should be attacked the way the
Drift was attacked. Specifically invited:

- disagreement with the §2 gap analysis (especially §2.2's priority claim);
- better measurements for the §3 pillars (the numbers are proposals);
- reordering §6 with reasons;
- rulings on §7;
- anything the canon already settles that this document contradicts —
  that is a bug in this document.

Tracking issue for comments: see the issue linked from PR #65. Revisions
land as commits to this file with the reason in the message.

---

## 9. Anti-goals

Feature sprawl before the Walk closes; spectacle that breaks trance;
mixing licence pools or faking data to look complete; polishing one room
while another regresses; any change that makes the instruments smaller;
declaring done with open doubts.
