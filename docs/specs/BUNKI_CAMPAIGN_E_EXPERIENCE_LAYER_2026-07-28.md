---
title: "Bunki — Campaign E: the Experience Layer"
date: 2026-07-28
project: bunki
artifact_type: campaign_brief
status: active
provenance: "Direction: operator, verbatim, 2026-07-28. Decomposition: Conductor."
builds_on:
  main: cbb7f29
  foundation: "Phase-0 closed loop — evidence gate, pinned FSRS-6, event-sourced state, real persistence, field-level provenance, 3,000-lexeme licensed dictionary"
---

# Campaign E — the Experience Layer

## The operator's direction, verbatim

> "Rich and alive but with an intricate map and interconnected feeling. With
> rich graphics and design and UX, combining all of the elements of all the
> apps I shared upon creating that should be in the specs and vision docs"

And the decision that frames it, from the previous exchange: **rich and alive,
not game mechanics.** No XP, no streaks, no badges, no confetti. The frozen v1
and converged v2 both ban them, and that ban stands. What "gamified" means here
is what Kanji Garden's growth visual achieved emotionally — a living state you
want to look at — not a points economy.

## Why this campaign exists

Phase 0 proved the foundation: state that replays, evidence that cannot be
faked, a scheduler that cannot be bypassed, provenance on every field. It is
also, on screen, a search box and a review card. The operator opened it and
said, correctly, that it is a far cry from the vision.

Campaign E builds the app they actually described, on the foundation that
already exists. The foundation is not decoration — the map is only honest
because retrievability is real, and journeys only mean something because the
evidence tiers are real.

## What to metabolize — from the operator's own app reviews

These are in the frozen v1 (`docs/convergence/BUNKI_WORKING_SPEC_2026-07-27.md`
§10, "Competitive metabolism") and Codex's §13 matrix. Read them. The operator
reviewed each of these apps and said what to keep and what to reject; that is
the specification for this campaign's feel.

| Source | Keep (build this) | Reject (do not build this) |
|---|---|---|
| **Kanji Garden** | The wallpaper generator — full inventory coloured by knowledge state, ~14 months on a time scrubber. The operator called it "the most visually cool thing in all these environments." Organic growth register. The "Forgot?" honesty affordance. The trouble queue as a journey-seed feed. | Static, non-interactive, arbitrary layout, crude colour, leaves the app as a file. Multiple-choice as the primary retrieval act. Unsustainable intake. |
| **renzo Japanese** | Five-tab IA (Search/Text/Reference/Lists/Study) — validates the shape; Kanken as first-class taxonomy; offline speed; conjugation tables as unfoldable reference. | A database rendered as table views. No hierarchy between headword and index number. Dictionary indices at full weight. Dead list inboxes. |
| **Anki (operator's own)** | Thematic Japanese-rich passages, cloze with ambient context, audio. FSRS already running. Personal-domain decks as first-class spines. | Semantic monoculture in generated text. Wall-of-text reviews costing minutes. Methodology reboots orphaning history. |
| **Todaii** | Fresh dated content with synced audio and speed control; read-while-listen; furigana toggle; AI chat *inside* the reading surface. | Global-JLPT rainbow underlining — when everything is highlighted nothing is. AI as a bolt-on that remembers nothing. |
| **類義漢字 / 訓** | Semantic-field kanji grouping with per-kanji nuance and compounds — this is the `contrasts-with` edge set rendered. Usage-boundary drills. | A pure reference silo with no learner state, no drills, no personal examples. |

## Direction added 2026-07-28 (after Wave A launched)

The operator gave a second, larger direction while Wave A was in flight. It is
binding and it supersedes parts of this brief. Two companion documents carry it
in full and **both are required reading for every lane from Wave B onward**:

- `docs/design/BUNKI_VISUAL_LANGUAGE_NIHONGA_2026-07-28.md` — the real 日本画
  palette with sourced hex values, the era registers, the Ghibli↔Akira lineage,
  and the two-layer reconciliation with frozen §8.
- `docs/design/BUNKI_THE_MAP_AS_VOYAGE_THROUGH_TIME_2026-07-28.md` — the three
  route layers (古道 / 街道 / 鉄道), the cultural-weaving model, and the 案内人.

The short version:

1. **The map is a voyage through time.** Not one metro diagram — pilgrimage
   routes and old walking trails *and* train lines, as three era layers you can
   scrub between. The rail layer is the newest, not the only.
2. **Nihonga palette, not one-hue ink-and-paper.** Ground carries era and
   atmosphere in the full mineral-pigment range; figure keeps the disciplined
   one-accent semantic system. Neither does the other's job.
3. **Ghibli meets Akira, late-80s/early-90s.** Oga's method — wet atmospheric
   ground, simple tonal design, details last — carrying Ohno's subject: density,
   rail, night, signage. This is one lineage, not a mash-up: Hiroshi Ohno painted
   *Akira* backgrounds and left mid-production to art-direct *Kiki's Delivery
   Service*.
4. **The AI is a constant-presence guide (案内人)** with a position on the map,
   whose assessment is conversation rather than a placement test, and which
   writes a long-term route and a short-term plan — while the **SRS alone
   dictates where the learning bifurcates**. The guide narrates and routes; it
   never mints evidence and never overrides the scheduler.

## The centrepiece: the map

Not a diagram. A living navigation surface, and the emotional centre of the app.

**Three era layers** (古道 / 街道 / 鉄道), each with its own colour register, and
one scrubber that reads two ways: pulled one way it replays **your** memory
history from the event log; pulled the other it walks **the language's** history
through the eras. 駅 is the worked example — 駅家 post-station on the ancient
road, 宿場 on the Edo highway, railway station in Meiji, and 駅伝 still carrying
the original sense.

- **Brightness is retrievability.** Real FSRS retrievability, computed from the
  real memory state — due items literally dim. Nothing decorative stands in for
  a number that exists.
- **Capability lenses.** Never one brightness value for a whole kanji
  (REQ-UI-07 forbids it). The operator picks a lens — reading, meaning,
  listening, production, writing — or the marks encode stability,
  retrievability, uncertainty and coverage distinctly.
- **Interconnection is the point.** Kanji to components to compounds to related
  words to confusable neighbours to the sentences they appeared in. The graph
  the domain already stores, made visible and walkable.
- **Time scrubber.** Replay growth from the event log — the history is already
  there, event-sourced, so this is projection, not new bookkeeping.
- **Tappable everywhere.** Every node opens its thread, its page, or seeds a
  journey. No dead ends.
- **Local neighbourhood by default; the whole-state view is a mode.** Per the
  converged v2 (REQ-UI-07), the global Observatory is a deliberate destination,
  not the home screen.

## Design bar

From the frozen v1 §8 and converged REQ-UI-08 — these are the operator's own
words and they are the bar:

- Typography-first. Real Japanese type — mincho for reading surfaces, clean
  sans for UI. First-class furigana. Optional vertical text.
- ~~Ink-and-paper palette, one vermilion accent~~ **→ superseded 2026-07-28.**
  Two layers: a nihonga **ground** carrying era and atmosphere in the full
  mineral range, and a **figure** layer that keeps the one-accent semantic
  discipline unchanged. The one-accent rule was never about prettiness — it was
  the ban on encoding learner state in hue, and that ban stands absolutely.
  See the companion document §5. Generous *ma* stands.
- Reading surfaces render clean; only Trace-unknown or fragile words carry a
  quiet mark — the personal frontier, never a global-level rainbow.
- "A kanji page should feel like a museum card, not a spreadsheet row."
- No confetti, no XP. Honest metrics only: retention, coverage, what is fragile.
- Beautiful, immersive, recursive, fun, and **calm**.

Motion serves comprehension: strokes that draw, a map that settles, a branch
that lights. Not ambient decoration.

## Non-negotiables inherited from the foundation

Campaign E adds surfaces. It does not get to weaken what is underneath:

- The evidence gate remains the sole factory for accepted evidence. A map, a
  journey, or a reading surface may *display* state and *submit commands*; none
  may mint evidence or write FSRS directly.
- Exposure is never retrieval. Tapping a node, scrubbing history, or reading a
  passage logs exposure at most.
- No global mastery score, no comprehension percentage, no JLPT level claim.
- Every rendered field keeps its provenance and required attribution.
- All prior tests stay green. New surfaces bring their own.

## Waves

**Wave A — foundations for the experience** (2 lanes, no surface collision)
- A1: design system and visual language — palette, type scale, Japanese
  typography, motion primitives, and the component vocabulary the rest builds on
- A2: domain-side projections — graph neighbourhood queries, retrievability
  projection for the map, journey compilation from stumbles (pure, tested,
  no UI)

**Wave A′ — the redirect** (2 lanes, opened 2026-07-28 after the new direction)
- A1′: extend the design system with the **ground layer** — era registers from
  the sourced nihonga palette, ground/figure type separation, per-ground
  contrast resolution, the emissive cap. A1's semantic architecture
  (`RECALL_BANDS`, `EDGE_PATTERNS`, `RECALL_BAND_MARKS`, `CONTRAST_PAIRS`, the
  no-hex-literal test) is **kept whole** — this is an extension, not a rewrite.
- A2′: add the **era/route attribute** to the node projection, sourced honestly
  from dictionary metadata where it exists and marked `unknown` where it does
  not. Never guessed.

**Wave B — the surfaces** (6 lanes, partitioned by screen directory)
- B1: the map — **three era layers**, capability lenses, the dual-reading
  scrubber (your history / the language's history), tap-through
- B2: kanji depth — layered page, stroke animation, components with roles,
  reading families, contrast sets, and the **one-line cultural note that is the
  character explaining itself** (never an encyclopedia paragraph)
- B3: word depth — senses, collocations, conjugation, related words, the
  sentences it appeared in
- B4: reading surface — passage with furigana toggle, tap-to-lookup, quiet
  frontier marks, AI inside the surface
- B5: journeys — branch from a stumble, dimmed untaken rails, evidence-defined
  rejoin
- B6: **the 案内人** — position on the map, conversation-driven assessment, the
  long-term route and short-term plan as provenance-carrying records, and the
  §4.3 boundary **enforced by a test**: the guide can propose and narrate, and
  cannot mint evidence, write a memory state, or override the scheduler

**Wave C — integration and polish**: one coherent app, navigation that makes the
whole thing feel woven, performance, accessibility, and an operator walkthrough.

Every lane is shadow-verified as in Campaign C1, and every verifier drives a
real browser. The rigour stays; the target is finally the thing the operator
asked for.
