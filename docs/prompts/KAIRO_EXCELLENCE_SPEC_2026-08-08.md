# The KAIRO Excellence Spec — from working prototype to superb product

> **STATUS: DRAFT — open for comment.** This document is meant to be
> argued with, tested against, and revised. Comments, corrections and
> counter-proposals belong on the tracking issue (see §8) or as PR review
> comments on this file. Nothing here is settled except the items marked
> **RATIFIED**, which carry an operator ruling and may only be changed by
> another one.

**This document is a standing prompt.** It governs product excellence for the
KAIRO reader–dictionary–practice vertical slice and establishes a craft floor
that every Bunki surface must eventually meet. It sits above the build brief
(`KAIRO_BUILD_BRIEF.md`, the phases), the zero-quirk spec
(`DRIFT_ZERO_QUIRK_SPEC_2026-08-08.md`, the correctness floor), and the design
canon (`BUNKI_DESIGN_LANGUAGE_SESSION2_2026-08-05.md`, the taste) **only within
that implementation/craft layer**. It answers one operator order: _this is
child's play for a Fable-class agent — build a super amazing product, not a
patched demo._ The agent reading this owns product excellence, not just green
checks.

### Authority and scope — hard guardrail before the full build

This spec **does not supersede, narrow, or redefine the whole Bunki product**.
Where product scope, learner-state truth, final acceptance, native requirements,
AI authority, evidence, licensing, privacy, portability, or cross-surface
metabolism are concerned, the authority order is:

1. explicit operator rulings and `BUNKI_OPERATOR_PRODUCT_LOCK_2026-07-29.md`;
2. `BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` and
   `BUNKI_MASTER_DEFINITION_OF_DONE_2026-07-27.md`;
3. the design canon and honesty/licence laws;
4. this Excellence Spec;
5. the KAIRO build brief and implementation details.

Therefore **"complete-thin" in this document always means the KAIRO
reader–dictionary–practice Walk is complete-thin, not that Bunki is a complete
product**. The Product Lock's AI teacher, source ingestion/listening,
recommendation and reweaving, migration, native durability, evidence/export,
voice, and shared learner-state requirements remain mandatory product work even
when they are not on the immediate KAIRO path.

---

## 0. The priors this spec inherits

Everything below assumes the reader has these in hand. They are the accumulated
law of the project and this spec never overrides them.

**Whole-product law**

- Bunki exists to eliminate learner-state fragmentation: one chosen encounter
  must remain one durable thread across dictionary, kanji, grammar, source
  reading/listening, AI conversation, explicit retrieval, later contexts,
  evidence inspection, and export.
- Capture creates no automatic review debt. Scheduling starts only after an
  explicit learner choice such as Learn/Master; AI and passive exposure cannot
  silently write FSRS memory state.
- Learner state is sparse, modality- and retrieval-contract-specific. No global
  Japanese level, no one-number mastery view, and no monthly surface may
  collapse recognition, production, listening, kanji, writing, grammar, and
  exposure into one scalar truth.
- The inseparable minimum still includes the recursive AI teacher, rights-aware
  source inbox, reading/listening progress and resume state, recommendations,
  personalized reintroduction across contexts/modalities, Anki warm-start,
  evidence inspector/export, native iPhone durability/offline core, and voice.
- Final whole-product acceptance remains the Master Definition of Done,
  including real native use, cross-surface traceability, zero data loss,
  replayable export, and voluntary continued use. KAIRO's daily-driver gate is
  an earlier product-value gate, not a replacement for that acceptance.

**Canon (taste and structure)**

- Nihonga ground, Akira×Ghibli energy; one washi ground + ink + two pigments +
  one accent per theme (canon §1–2).
- Every element is a door; no terminal surfaces; particles and radicals are
  first-class destinations (§4).
- The Drift is 墨流し: tap-depth not pinch-depth, hypnotic not gamified, trance
  boundary absolute — no scores, streaks, confetti (§8).
- The honesty contract: swipes are self-assessment, never retrieval proof; they
  nominate and schedule probes, they never write memory state directly (§8
  honesty contract, convergence A2/C3).
- Reference bars: Renzo (dictionary solidity, quiet front door) and Kodansha
  KKLC (kanji page as specimen case) — canon §7.

**Law (paid for in defects)**

- Click grammar, one discipline everywhere: tap = furigana · tap again = English
  · third act carries in · long-press = mini-dictionary · keep holding = full
  entry · particles inert on tap, open on hold.
- **Pointer grammar is never the only grammar.** Every pointer-only action must
  have an equivalent keyboard/switch/screen-reader path; hold-only actions need
  a discoverable non-hold alternative without changing the pointer experience.
- Palette law: 弁柄 red = readings and warnings ONLY; 藍 indigo = "you can go
  here"; levels and chrome are never red.
- Clean print: reader surfaces carry no provenance, licence chatter, or
  self-narration. Attribution lives on its own page, once.
- Licence walls: `proprietary_safe` / `share_alike` / `original`, never mixed
  silently. DoJG is the capability bar, never a source. Mainstream Japanese
  news is contractually off-limits.
- Verification discipline: real CJK fonts at device scale, look at the
  screenshots with your own eyes, send them to the operator before they can
  find defects themselves, never accept a layout that depends on font metrics
  to be correct.
- Signals are true of the text displayed, or they are marked unmeasured. Three
  signals, never averaged; disagreement surfaced, never resolved.

**Ratified rulings (2026-08-08)**

- **RATIFIED · staged satellite taps.** In a constellation, a satellite tap
  reveals it in place; a second tap re-centres the constellation on it.
  Chainable to any depth.
- **RATIFIED · judgment scope.** While a constellation is open, only the
  held/centred planet may be flick-judged. On the free field, any word.
- **RATIFIED · nothing disappears.** No word ever vanishes except by the
  deliberate flick-judgment. Every other disappearance is a P0 defect.
- **RATIFIED · the tide is real.** The level slider expands, brightens, glows
  and elevates under the finger; and the words in the field belong to the
  chosen register — measured, not vibed (≥80% purity at a stop).
- **RATIFIED · scope of the zero-quirk campaign.** Drift + its doors into the
  corridor.

**State of the build (2026-08-08)**

- Phase 1 done: corpus pipeline revived, 26 full-length articles on the shelf
  via `build_articles.py`, lazy per-file loading.
- Phase 2 segment 1 done: Drift is the front door, fused as a gated layer
  extracted from the byte-untouched drift source.
- Instruments: `verify-corridor.mjs` (90), `verify-drift-consistency.mjs`
  (64 + tide), `verify-drift-hunt.mjs` (8 hunt regressions).
- Phases 3 (drill room) and 4 (monthly truth) NOT started — this is the single
  biggest KAIRO product gap (see §2.2).
- Independent interactive audit found important coverage gaps not represented
  by the current 90/90: pointer-only core content, missing dialog/focus
  semantics, reduced-motion gaps, sub-44px controls, unreproducible performance
  targets, a heavy boot payload, and no real graded retrieval loop yet. These
  are build inputs, not post-launch polish.

---

## 1. The bar, calibrated against the wild

Fable-class agents are shipping, from single prompts and short sessions:
playable 3D games with biomes and physics, hyper-polished liquid-glass product
sites, live dashboards, navigable terrain visualisations. That is the
competence class this project buys, and the standard the operator is holding it
to. Internally the bar is already written: Renzo's solidity and Kodansha's
specimen pages for the bones; the operator's named vibe for the soul —
_"ancient Japan meets anime meets outer space meets obsidian graph meets
additive AI study app."_ Anything that would look ordinary next to either bar
is below spec.

The wild also sets a second bar: **polish that excludes keyboard, assistive
technology, reduced-motion users, constrained mobile networks, or native
recovery is not excellence**. Accessibility, performance, durability, and
truthfulness are material qualities of the product, not compliance passes after
the visual work is finished.

---

## 2. What we are missing (agent's assessment, 2026-08-08 — argue with this)

### 2.1 The five-second wonder

Showcase builds deliver their magic before you understand anything. KAIRO's
deepest virtues — honest signals, licence law, verified interactions — are
_invisible_ virtues. Our five-second wonder is the Drift, and it is running at
perhaps 60% of its ceiling: the washi does not fully survive a screenshot, the
fluid is a CPU grid where the canon itself names WebGPU MLS-MPM as the real
tier, and words still occasionally read as glyphs on a gradient rather than ink
on water. The showcase works win by _committing_ to a physicality. The
atmosphere pass is not decoration; it is the product's first impression.

### 2.2 The reason to come back tomorrow — THE BIGGEST KAIRO GAP

Every compelling build has a loop. We refuse the cheap version by law (no
streaks, no confetti), but the _honest_ loop is the drill room and the monthly
truth — Phases 3–4, unbuilt. Renzo keeps the operator because their lists live
there. Until a word taken yesterday **comes due** somewhere visible, KAIRO is a
beautiful place to visit, not a place to live. The daily-driver gate (§4) fails
on this alone. This should outrank almost everything.

The drill room must prove a real learning-state transition, not merely render
cards: source-anchored encounter → explicit promotion → versioned retrieval
contract → due item → learner response → valid grade → FSRS update → later
reintroduction in a meaningfully different context. At least one end-to-end
item must be inspectable at every step.

### 2.3 Continuity of motion between rooms

Expensive-feeling products never cut; every state flows. Drift→shelf is a hard
cut today. One app should _feel_ like one space: the universe recedes into the
shelf, an article opens out of its shelf card, the dictionary sheet rises from
the tapped word. Shared-element motion is cheap to build and disproportionately
sells "one app, no seams."

### 2.4 The leverage nobody is using: corpus depth wearing a beautiful skin

The showcase works are impressive as _artifacts of generation_. KAIRO's
architecture is already built to receive exactly that kind of generation, and
we are not feeding it:

- semantic tier: still tiny relative to the full lexicon;
- grammar dictionary: 60 entries toward a ~600-point horizon;
- shelf: a pipeline that can grade any rights-clean text, still far below a
  daily-driver library.

Mass authoring **under the licence law** — typed relations across the whole
lexicon, hundreds of graded original readers per level, example sentences,
elaborative notes — is precisely what a Fable-class model does at showcase
quality. It is the difference between a demo shelf and a Todai-scale library.
Spend the model on corpus depth, not on spectacle.

### 2.5 The whole-product metabolism is not yet scheduled enough

A beautiful KAIRO spine can still fail Bunki if the original system disappears
from the roadmap. The build must preserve named ownership for:

- recursive AI conversation/teacher over the same learner threads;
- listening/voice and lawful source playback;
- source inbox: share sheet/manual paste, articles/RSS, permitted video and
  podcast transcripts, screenshots/OCR, PDFs, conversation, recent lookups;
- source progress, resume anchors, rights status, and provenance;
- explained recommendations from the multidimensional learner frontier;
- personalized weaving/reintroduction across at least three meaningfully
  different contexts and at least two modalities where appropriate;
- Anki warm-start with quarantine/mapping rather than imported-history truth;
- evidence inspector, learner corrections, and lossless/replayable export;
- native iPhone one-handed capture/review, backgrounding, force-quit recovery,
  offline core, and persistent theme/learner state;
- voice conversation/listening probes under separate retrieval contracts.

These are not optional extensions to a declaration that Bunki is complete.
They may sequence after the KAIRO thin Walk, but they must remain visible in the
roadmap and acceptance ledger.

---

## 3. The pillars (measurable)

**P1 · The Drift is hypnotic, not merely functional.** ~60 fps during drift,
bloom, chain walks and tide changes; gesture-to-response <50 ms; trance
boundary absolute; atmosphere at the canon §8.3 texture bar; the tide law
honoured; the constellation walk chainable forever with nothing lost — it must
feel like thought.

**P2 · The corridor reads like print.** Full-length texts, paragraphs intact,
real furigana, no chrome noise; boot-to-readable-shelf under the declared
mobile-network budget; article opens feel instant; signals honest and one 詳細
tap from the instrument.

**P3 · The dictionary meets the Renzo bar.** Lookup answer <100 ms; every sense,
most common first; real examples from the shelf; kanji pages with strokes, 音訓,
漢検 and compounds-by-sense; the **canonical four search doors remain typed,
handwriting, radical/component picker, and SKIP** (the typed door itself may
accept kanji/kana/romaji/English); every element a door at every depth.

**P4 · The KAIRO Walk is whole.** Drift → article → word → kanji → radical →
覚える → scheduled drill → valid retrieval evidence → monthly truth. A
complete thin Walk outranks a gold-plated room. One navigation fabric, one
click grammar, one palette.

**P5 · Craft floor everywhere.** WCAG AA is necessary but not sufficient:
contrast + semantic roles/names + keyboard/switch access + focus entry/trap/
return + Escape/close semantics + equivalent alternatives for hold/gesture-only
actions + meaningful `prefers-reduced-motion` behavior + ≥44 px custom touch
targets. Bilingual chrome by default with 日本語のみ as opt-in immersion,
palette law, no telemetry-speak on reader surfaces. The zero-quirk floor is a
precondition, never the achievement.

**P6 · The whole Bunki metabolism survives the build.** Every product round
updates a coverage ledger for Encounter → Capture → Understand → Confirm →
Retrieve → Reintroduce → Update → Recommend → Protect. No phase may declare the
whole product complete while mandatory Product Lock surfaces are absent.

---

## 4. Acceptance: two gates, not one

### 4.1 KAIRO daily-driver gate

KAIRO is "super amazing" when the operator reaches for it instead of Renzo for
a real study session — and comes back the next day. Every round must move at
least one pillar measurably toward that, and the round report must name the
pillar and the measurement.

This is the acceptance gate for the KAIRO vertical slice. It is deliberately
subjective at the top while every supporting claim below it is instrumented.

### 4.2 Whole-product acceptance remains binding

Bunki itself is not DONE until the Master Definition of Done/Product Lock
acceptance passes: one-state trace across mandatory surfaces, no automatic debt,
real recursive exploration, source/listening/conversation loops, native iPhone
use and recovery, zero data loss, replayable export, and the real deep-engagement
acceptance period. The KAIRO Walk passing is a major checkpoint, not permission
to delete the remaining product.

---

## 5. How the agent works this spec

1. **Rounds ship product value, not just fixes.** Pick the weakest pillar, state
   the measurable target, build, verify with instruments _and_ eyes,
   screenshot, ship to the artifact, report.
2. **Behavioral coverage only grows.** Instruments may be replaced when their
   implementation substrate changes, but the behaviors they protect may not be
   silently dropped. Removing or weakening a check requires an explicit
   supersession note naming the obsolete assumption and the replacement proof.
3. **Failing case first.** No fix without a red case reproducing it; the case
   stays in the matrix forever after; the log names the mechanism, not the
   symptom.
4. **Verification economics (learned 2026-08-08).** Mechanical acceptance —
   fuzz, soak, endurance chains, matrix re-runs — is _scripted_, run in the main
   loop, and costs almost nothing. Agent fleets are for **discovery** of what the
   author did not think to test; they cost ~2M tokens a run and are reserved for
   after material change. The 2026-08-08 hunt hit the account's monthly limit
   mid-run and four verifications died — budget the fleet deliberately, and
   never let a fleet do a script's job.
5. **Adversarial by default after material change.** Six Drift lanes minimum
   (chain · dive · strata+themes · camera · judgment · doors+soak+fuzz) plus
   keyboard/focus/screen-reader/reduced-motion and constrained-network passes
   whenever the changed surface is user-facing.
6. **Canon is law.** Ambiguity resolves to a default plus one batched question —
   never a stall.
7. **Evidence cadence.** The operator sees screenshots before they can find
   defects, gets batched reports, and always has a fresh artifact.
8. **Every performance number has a measurement contract.** A budget is not a
   claim until the report names device/OS, runtime, production-vs-dev build,
   viewport/DPR, warm/cold cache, compression, network profile, sample duration,
   percentile, scene/word count, and pass/fail threshold. FPS reports p95 frame
   time/dropped-frame rate, not only an average. Boot reports transferred and
   decoded bytes and separates critical path from background prefetch.
9. **One source-anchored golden thread stays alive.** After A1, CI permanently
   carries at least one item from source encounter through promotion, retrieval,
   valid grade, memory-state update, reintroduction, evidence inspection, and
   export. New whole-product surfaces join this same thread as they land.
10. **Coverage ledger every round.** The round report records the current state
    of the nine metabolism stages: Encounter · Capture · Understand · Confirm ·
    Retrieve · Reintroduce · Update · Recommend · Protect, with `real`, `thin`,
    `planned`, or `absent` — never implied completion.

---

## 6. The long-term roadmap (RATIFIED direction, hardened for the full build)

**Operator ruling:** build all of it — the loop, the corpus depth, and the full
WebGPU engine (compute fluid, compute graph, MSDF ink, real post-processing).
**Excluded by ruling: Gaussian splatting** — it is a technique for captured 3D
scenes; here it would be a costume, not a material.

### The sequencing laws that produce the order

1. **The engine must have something to render.** A compute-shader force graph
   over a tiny hand-authored semantic tier is a tech demo; over a full-lexicon
   typed relation web it is the obsidian vault made of ink. **Corpus depth
   precedes the engine**, or the engine renders emptiness.
2. **The interaction grammar must outlive its substrate.** Today's hardened
   laws are bound to DOM nodes and `getBoundingClientRect`. Extract the gesture
   and state model into a substrate-agnostic core _before_ the renderer changes,
   and retarget the instruments to that core — otherwise the engine swap
   re-opens every defect class already closed.
3. **Cheap-and-on-the-current-substrate work comes first.** Anything that would
   have to be built twice — once on canvas, once on the engine — waits for the
   engine. Corridor-side and domain-state work is engine-independent and should
   land now.
4. **Truth and access travel with the feature.** Accessibility, persistence,
   evidence boundaries, and performance budgets are implemented with each new
   surface, never deferred into a final cleanup campaign.
5. **KAIRO completion cannot erase Bunki completion.** A2 closes the thin KAIRO
   Walk only. The mandatory whole-product surfaces in Phase E remain required
   before any claim that Bunki itself is complete.

### Phase A · Close the KAIRO Walk on the current substrate

- **A0 · Scripted closure of the zero-quirk acceptance list.** Chain endurance,
  seeded fuzz ×3, soak, the four verifications the spend limit orphaned. This is
  the safety net every later phase is measured against.
- **A0.5 · Accessibility + measurement baseline.** Before multiplying today’s
  interaction patterns: make Drift words/tide and reader tokens operable without
  a pointer; give sheets/dialogs correct semantics, focus entry/trap/return and
  Escape; remove hidden controls from tab order; implement meaningful reduced
  motion; bring custom controls to ≥44 px or provide equivalent enlarged hit
  regions without wrecking typography. Add permanent keyboard/focus/reduced-
  motion checks. Freeze reproducible production profiles for boot, lookup,
  gesture latency and frame pacing; record current critical bytes and lazy-load
  boundaries.
- **A1 · Phase 3 thin — the drill room. RATIFIED as next product feature.**
  Taken words come due, visibly, on real FSRS. Both surfaces per ruling: a
  finishable room AND due words surfacing in the Drift as a weather. The first
  acceptance is the golden thread: source encounter → explicit Learn → stable
  retrieval contract → due → response/grade → FSRS update → inspectable
  evidence → later reintroduction. MCD cloze is one contract family, not the
  definition of review; preserve room for recognition, cued recall, production,
  listening, contrast, sentence rebuilding and full-context contracts.
- **A2 · Phase 4 thin — the monthly truth.** The **KAIRO Walk** closes here.
  Monthly truth remains multidimensional: separate capability/evidence lenses,
  no averaged mastery score, no exposure/self-report masquerading as retrieval.
  This is a major daily-driver checkpoint, **not whole-product completion**.
- **A3 · Corridor-side motion continuity + haptics.** shelf↔reader↔sheet
  shared-element transitions (engine-independent), paper-grain haptics on touch,
  sound available but silent by default. RATIFIED. All motion respects reduced
  motion and focus continuity.
- **A4 · Boot and data-path hardening.** Drift/shelf can become usable without
  waiting for full dictionary/stroke payloads; dictionary, stroke and article
  data are sharded/lazy; background prefetch yields to constrained networks,
  data-saver/battery state and active learner actions. Hit the declared
  production profiles before calling the 1.5 s/100 ms budgets achieved.

### Phase B · Feed it (data; engine-independent; makes Phase C worth doing)

- **B1 · Semantic tier at scale.** Typed relations (synonym · family ·
  collocation · theme · register-twin · contrast) with shell ranks and use-notes
  across the lexicon, under licence law. This is the single highest-leverage
  unit of work in the project.
- **B2 · The reader library.** Hundreds of original graded texts per level
  through `build_articles.py`; grammar toward the ~600-point horizon; example
  sentences. Keep the shelf calm: no repeated instrument prose or placeholder
  values on learner cards.
- **B3 · 自 mode v1.** The tide follows actual multidimensional learner/SRS
  state — i+1 dosing, honesty contract intact. Needs A1's data to exist; it may
  not collapse the learner to a single JLPT estimate.
- **B4 · Search doors at the canonical bar.** Preserve the one-field typed
  search (kanji/kana/romaji/English) and add/restore handwriting, radical/
  component picker, and SKIP as actual entry modes rather than relabelling the
  typed modes as four doors.

### Phase C · The engine (staged; each stage independently shippable)

- **C0 · Interaction-core extraction + instrument retargeting.** Law 2's
  insurance policy. Gesture arbitration, constellation state, judgments, tide,
  persistence events and accessibility actions move behind a substrate-neutral
  contract before rendering changes. Existing behavioral checks are ported, not
  discarded.
- **C1 · MSDF glyph rendering.** Kanji as signed-distance fields: crisp at any
  zoom, GPU-transformable, ink-bleed and brush edges as shader work. Highest
  perceptual win per unit of risk; can land early if desired without violating
  the sequencing laws.
- **C2 · MLS-MPM compute fluid.** Real material simulation, 100k+ particles:
  vorticity, surface tension, pigment that stains. Capability check + canvas
  fallback; performance contract measured on target iPhone hardware, not only a
  desktop/headless browser.
- **C3 · Compute-driven graph.** Force layout on the GPU: the whole useful
  semantic graph alive at once instead of a small recycler window. Keep
  deterministic/state-testable semantics beneath the renderer so the visual
  engine cannot become the source of learner truth.
- **C4 · Post-processing + drift↔shelf continuity.** Depth of field on parallax
  bands, bloom on gold, restrained dive-velocity effects, temporal accumulation
  for marbling — plus the universe→shelf transition built on the final
  substrate. Effects that hurt text legibility, vestibular comfort, battery,
  thermals or input latency lose to the craft floor.

Every C stage ships behind a capability check with the canvas path as fallback,
and re-runs the full instrument set (sweep · hunt regressions · corridor ·
accessibility · fps/latency · boot) before it counts as landed.

### Phase D · Continuous verification and content truth

Adversarial hunt after every material change; behavioral coverage only grows;
the canvas atmosphere pass is **deliberately skipped** — the engine does that
work properly, and doing it twice is the waste this order exists to avoid.
Corpus/licence/provenance checks, visual review, accessibility, data-loss and
performance budgets remain continuous rather than separate final phases.

### Phase E · Finish the whole Bunki metabolism (mandatory Product Lock scope)

These workstreams may begin in parallel once A1/A2 has stabilized the shared
thread/state contracts; they do **not** wait for visual-engine completion when
the engine is irrelevant to them.

- **E1 · Recursive AI teacher + journeys.** Text conversation over the actual
  learner threads/evidence/interests/sources; bounded branches that rejoin;
  explicit distinction between AI proposal/inference and canonical fact or
  retrieval evidence; conversation turns can be nominated and, after learner
  confirmation, enter the same practice system.
- **E2 · Source inbox + listening.** Share sheet/manual paste, lawful
  article/RSS/video/podcast/OCR/PDF source intake; source identity, rights and
  transcript status, text position/timecode, progress/resume anchors; permitted
  audio playback/replay/capture; pointer-only external media remains pointer-only
  rather than prompting illicit transcript ripping.
- **E3 · Recommendations + personalized weaving/reintroduction.** Explain why a
  source/action fits the learner's multidimensional frontier; let the learner
  accept/dismiss/correct it; use confirmed real encounters to create clearly
  labelled source-anchored/generated learning material; prove at least three
  meaningfully different contexts/styles and at least two modalities where
  appropriate.
- **E4 · Anki warm-start + migration truth.** Import through quarantine and a
  mapping report; preserve history and provenance without presenting imported
  scheduling state as verified learner truth.
- **E5 · Evidence inspector + corrections + lossless export.** The learner can
  inspect what Bunki thinks it knows and why, correct provisional beliefs, trace
  any scheduled state back to valid evidence, and export/replay canonical
  entities, encounters, contracts, evidence and history without data loss.
- **E6 · Native iPhone daily experience.** Share extension/manual capture,
  one-handed lookup/reading/listening/conversation/review, backgrounding,
  force-quit recovery, offline core, persisted theme/state, and real-device
  performance. Web remains powerful for long text/import/admin but does not
  substitute for native proof.
- **E7 · Voice + listening probes.** Spoken conversation and listening retrieval
  under separate modality contracts; voice AI may propose evidence but cannot
  silently write memory state. Text remains available everywhere.
- **E8 · Observatory/whole-state views.** Global graph/history views use
  capability lenses or distinct marks, never one mastery brightness. Trails and
  passive exposure may influence nomination/recommendation but not masquerade as
  recall.

### Phase F · Whole-product acceptance

Run the Product Lock/Master DoD acceptance against real data and real devices:
one encounter traced without recreation across source → dictionary/kanji/
grammar → teacher → practice → later context → evidence inspector → export;
no automatic debt; ten-minute recursive walk without dead ends/context loss;
native source/listening recovery after force-quit; beginner/intermediate/N1+
frontier behavior; context variation; zero data loss; replayable export; then
the deep-engagement acceptance period and voluntary continuation. A passing
KAIRO daily-driver gate is necessary evidence here, not sufficient evidence.

---

## 7. Grill-session rulings (RATIFIED 2026-08-08)

- **Next product feature: the drill room.** Close the loop before anything else.
- **Drill shape: both surfaces.** A finishable room AND due words surfacing in
  the Drift as a weather.
- **Sound and haptics: haptics yes, sound opt-in, both silent by default.**
  Canon's silence remains the default state.
- **Atmosphere: take it to the moon, minus Gaussian splatting.** The full WebGPU
  engine per §6 Phase C.

### Still open

- **Engine timing.** §6 sequences the engine after the loop and corpus. If the
  operator wants a visual jolt sooner, C1 (MSDF ink) is the one stage that can
  be pulled forward without breaking the sequencing laws.
- **Semantic tier scale** — the ~1,500 most productive words, or the full lexicon
  in one pass. Whichever is chosen must leave a repeatable pipeline for the rest.
- **Motion-continuity budget** — three seams, or every transition. Accessibility
  and focus continuity are required at either scope.

## 7b. Superseded questions (kept for the record)

- **Q-A · Drill room shape.** Default: a room reachable from the corridor
  showing due counts and running MCD-cloze cards from taken words. Alternative:
  drilling happens _inside_ the Drift as a weather.
- **Q-B · Atmosphere tier.** Default: push the CPU/canvas ground to its ceiling.
  Alternative: commit to WebGPU MLS-MPM for the real-app tier, with a canvas
  fallback.
- **Q-C · Semantic tier scale.** Default: expand to the ~1,500 most productive
  words. Alternative: full-lexicon pass.
- **Q-D · Motion continuity budget.** Default: shared-element transitions on the
  three main seams only.
- **Q-E · Sound and haptics.** Default: none (silence is canon). Open question:
  a near-silent water note and a paper-touch haptic could deepen the trance — or
  violate it. Operator's ruling.
- **Q-F · Backlog order.** Superseded by the phased roadmap in §6.

---

## 8. Comment, test, evolve

This draft is a claim, not a conclusion. It should be attacked the way the Drift
was attacked. Specifically invited:

- disagreement with the §2 gap analysis;
- better measurement contracts for the pillars;
- better sequencing that preserves the five laws in §6;
- anything the Product Lock, frozen v2, Master DoD, canon, or ratified rulings
  already settle that this document contradicts — that is a bug in this
  document, not a new proposal;
- any mandatory whole-product surface that has no named owner/phase;
- any product-value claim that is green only because the verifier does not yet
  exercise the real user path.

Tracking issue for comments: **#66** (RFC: the KAIRO Excellence Spec).
Revisions land as commits to this file with the reason in the message.

---

## 9. Anti-goals

Feature sprawl before the KAIRO Walk closes; spectacle that breaks trance;
mixing licence pools or faking data to look complete; polishing one room while
another regresses; declaring the whole Bunki product complete because the KAIRO
vertical slice is complete; inaccessible pointer-only interaction; performance
claims without a reproducible measurement contract; background prefetch that
competes with the learner; one-number learner truth; AI or self-report writing
mastery; renderer architecture becoming the authority for learner state; any
change that silently weakens behavioral coverage; declaring done with open
doubts.
