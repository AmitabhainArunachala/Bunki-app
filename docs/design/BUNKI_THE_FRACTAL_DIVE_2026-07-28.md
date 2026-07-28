---
title: 'Bunki — The fractal dive: scale as a navigable axis'
date: 2026-07-28
project: bunki
artifact_type: design_direction
status: active
provenance: 'Direction: operator, 2026-07-28, with five reference images (Mandelbulb / fractal-kaleidoscope animations, @mesmerizeapp): "to have the kanji and some of the anki reviews to be a 3-5 d fractal immersive journey of connections, in and out from particles to compounds to words and back again, in a living connected array that somehow linked to the graph, the SRS, progress ranked by colors, and evolving and shifting as one goes and allows one to click and get feedback at a hyper rapid pace." Analysis, constraints and plan: Conductor.'
companions:
  - docs/design/BUNKI_THE_MAP_AS_VOYAGE_THROUGH_TIME_2026-07-28.md
  - docs/design/BUNKI_VISUAL_LANGUAGE_NIHONGA_2026-07-28.md
  - docs/design/BUNKI_COMPETITIVE_RESEARCH_ROUND2_2026-07-28.md
---

# The fractal dive

## 0. Does it fit? Yes — and it is not a metaphor

The short answer, before the caveats: **Japanese writing is actually
self-similar.** Not "like a fractal." Self-similar in the literal sense that the
same unit appears as a whole at one scale and as a part at another, recursively,
with the same relationship repeating at every level.

- 木 is a kanji. It is also a component of 林. 林 is a kanji, and a component of
  森. 森 is a kanji, and a constituent of 森林.
- 日 is a kanji, a component of 明 and 時 and 曜, and a word on its own.
- 分 is a kanji, decomposes to 八 + 刀, and is a constituent of 分岐 — the
  product is named after a node in this structure.

An infinite-zoom visualisation would be decoration for English vocabulary,
because English words do not contain other English words as structural parts. For
Japanese orthography it is a **faithful rendering of how the writing system is
actually built.** That is the difference between this idea being a gimmick and
being the right surface.

**And there is a stronger argument.** The operator's own master definition of done
already contains this requirement, written before either of us was thinking about
fractals:

> **Recursively explorable** — "from any word: kanji → components → compounds →
> related/contrasting words → sentences → back; no dead-end screens" — tested by
> "the operator runs a 10-minute free exploration from one seed word and never
> hits a dead end or a context loss."

The fractal dive is the surface that requirement has been waiting for. Screens
with links satisfy it on paper. Continuous scale navigation satisfies it in the
hands — because there is no screen to leave, so a context loss is structurally
impossible rather than merely avoided.

So: it makes sense, it fits, and it closes a DoD clause that nothing else has
properly closed.

---

## 1. The scale ladder

Six levels. The interaction is identical at every one, which is what makes it
feel fractal rather than merely zoomable.

| Level  | Unit                     | Example                             |
| ------ | ------------------------ | ----------------------------------- |
| **L0** | 画 stroke                | the seven strokes of 車, in order   |
| **L1** | 部首・構成要素 component | 氵, 木, 亻, 灬                      |
| **L2** | 漢字 kanji               | 森, 駅, 分                          |
| **L3** | 熟語・語 word            | 森林, 分岐, 駅前                    |
| **L4** | collocation / phrase     | 道が分かれる, 分岐点に立つ          |
| **L5** | sentence / passage       | the sentence you actually met it in |

### The law that makes it recursive

At **every** level, a node has exactly two directions, and they are the same
relationship seen from opposite ends:

- **Inward — what it is made of.** Constituents. 森 → 木 木 木.
- **Outward — what it makes.** Participations. 森 → 森林, 森閑, 青森.

Zooming is nothing more than **changing which node is the centre**. One gesture,
six levels, no mode switch and no new vocabulary to learn at any depth. That
single rule is the whole design.

---

## 2. "3–5D" — what the extra axes actually are

You cannot render five spatial dimensions, and the reference videos are not doing
that either. But read as _axes of variation_, the number is honest, and all five
carry real data:

| Axis    | What it is                            | Where the data comes from                                                                       |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **1–2** | position in the layout                | the graph neighbourhood projection (lane A2)                                                    |
| **3**   | **scale** — depth in the ladder above | the constituent/participation edges                                                             |
| **4**   | **time**                              | the event log — your history one way, the language's eras the other (the dual-reading scrubber) |
| **5**   | **capability lens**                   | reading / meaning / listening / production / writing — REQ-UI-07                                |

Axis 3 is the fractal axis and it is the new one. Axes 4 and 5 already exist in
the domain. Nothing here is invented to make the number reach five.

The reference videos read as high-dimensional precisely because they animate
**scale and time together** while holding structure constant. That is exactly
axes 3 and 4, and it is available to us for free.

---

## 3. Colour, and what it is allowed to mean

Progress ranked by colour, using the system already built and without weakening
it:

- **Luminance is retrievability.** Real FSRS, per contract. A dim node is dim
  because the number is low.
- **Form is fragility and uncertainty.** Dashed, dotted, open ring — never hue,
  so it survives on any ground and for any learner.
- **Hue is your attention only.** One accent. The nihonga ground carries era and
  atmosphere and says nothing about you.

### The thing that makes this genuinely diagnostic

**Different scales show different aggregations of the same real numbers**, and
the mismatch between them is information no flashcard app can give you.

You know 森林 as a word — bright at L3. Dive in and 林 alone is faint at L2. That
is a specific, actionable fact about your memory: you have a whole-word memory
without a component memory, so you will fail on 林道 and 山林 and not know why.
**Seeing the inside of a bright node be dark is the diagnosis.**

That is also the answer to the operator's plateau complaint from the previous
research round. A plateau is invisible when your only signal is a queue. Here it
is a picture: the surface is lit and the interior is not.

---

## 4. The hard boundary — and this one is not negotiable

> **Rapid clicking through the structure is EXPOSURE. Exposure is never
> retrieval.**

If tapping around the fractal wrote to FSRS, we would have built the Duolingo
failure with better graphics — low-effort recall producing the illusion of
mastery, which the round-2 research documents at scale. The whole build has been
defending against exactly this.

So there are two distinct things, and they must be distinct in the code, not just
in intention:

|                   | **Flight** (navigation)         | **Probe** (retrieval)                                   |
| ----------------- | ------------------------------- | ------------------------------------------------------- |
| What you do       | zoom, pan, tap through, explore | a node declares a question; you answer before revealing |
| Pace              | as fast as you like             | one attempt, declared in advance                        |
| What it writes    | an exposure record at most      | evidence, through the evidence gate, tier-labelled      |
| Can it move FSRS? | **never**                       | yes — the same path as every other probe                |

The "hyper rapid pace" the operator wants is real and it lives in **flight**.
The grading lives in **probe**. Both can happen inside the same surface without
the boundary blurring, and a test must prove the boundary rather than a comment
asserting it.

---

## 5. Two review modes this makes possible

Both are finite. The session planner already guarantees a plan that never grows
(the e2e case is named "the sitting ends explicitly and the plan never grows"), so
neither of these can become a bottomless queue.

### 5.1 Constellation review

Instead of a card on a blank screen, you are **placed at the node** under test, at
its own scale. The probe is declared, you answer, and on reveal **the
neighbourhood lights up** — you see what that answer just connected to, and what
next to it is still dark.

The reward is not points. It is _the structure got brighter and you can see
exactly where_. That is the honest version of what Kanji Garden's wallpaper
achieved emotionally, made interactive and made true.

### 5.2 The flight

The guide takes you on a continuous pass **through** N nodes at a chosen scale,
each with one fast probe — a dive from 森林 down through 森, 林, 木 and back out.
Finite by construction, and it is the closest thing to what the reference videos
feel like: continuous motion through structure, at speed, with something happening
at every level.

This is also the natural home for "some of the anki reviews": a warm-started deck
becomes a route through the structure rather than a stack of unrelated cards.

---

## 6. What I would take from the references — and what I would not

The images are Mandelbulb and kaleidoscope work: saturated, hot, bilaterally
symmetric, continuously churning.

**Take — the structure:**

- **Continuous flight, not page transitions.** You move through, you never load.
- **Self-similarity as the promise of depth.** There is always another level, and
  you can feel it before you reach it.
- **One gesture at every scale.**
- **Something legible at every moment of the motion**, not just at the endpoints.

**Do not take — the surface:**

- **Kaleidoscopic mirror symmetry.** It is beautiful and it destroys meaning: a
  mirrored 森 is not a kanji, and the symmetry would imply relationships that do
  not exist. The structure must be true, so the layout follows the real graph.
- **Saturated churn.** Frozen §8 asks for calm and generous _ma_. The round-2
  research is explicit that stimulation is not the goal. Rendered in the era
  registers with 胡粉 cards floating in it, this becomes something better than
  the reference: the same sense of endless depth, but readable.
- **Constant motion.** Motion serves comprehension. It settles.

**One honest exception.** The 鉄道 register at night is the one place the visual
language permits emissive colour. The deepest, most modern layer of the dive can
legitimately come closest to the reference's feel — a dark ground with a rationed
few luminous points. That is where this aesthetic is allowed to be itself.

---

## 7. Where it lives — one centrepiece, two gestures

A real risk: building a second competing centrepiece and ending up with two
half-good ones. So the dive is **not** a separate feature.

> **The map is extent. The dive is depth. Same surface, two gestures.**

- The **map** is the country across three eras — where things are, when they
  arrived, what road they came in on. You travel it.
- The **dive** is what happens when you push _into_ a station. Scale becomes the
  axis, and you go down through word → kanji → component → stroke, and back out.

The 案内人 walks the map with you; when you dive, it is the presence that knows
how deep you are and where the way back is. Depth without disorientation is
exactly the job a 案内人 exists for.

---

## 8. The risks, named honestly

These are real and I would rather write them down now than discover them in a
verification round.

1. **Performance, on a phone, which is the primary target.** We are not
   raymarching a Mandelbulb — a self-similar node graph with continuous zoom is
   far cheaper — but it still needs strict **level-of-detail culling**: only
   materialise the nodes near the current scale, never the whole graph. Note that
   lane A2 already hit and fixed exactly this class of defect ("the time scrubber
   rebuilt the whole index on every frame"), so the discipline exists and the
   verifier knows to look.

2. **Vertigo and motion sensitivity.** Continuous zoom is a known trigger and a
   WCAG obligation. `prefers-reduced-motion` must yield a **stepped** dive —
   discrete level transitions, no flight. Lane A1 already built `useReducedMotion`
   and a `resolveDuration` that returns 0 under reduction, so this is wiring, not
   invention. Non-negotiable, not a nice-to-have.

3. **Getting lost.** Six levels of continuous zoom with no chrome is a maze. There
   must always be a visible answer to _where am I_ and a single gesture for _take
   me back out_.

4. **Beauty outrunning truth.** The most seductive failure available to this
   feature is a layout that looks like a fractal but does not follow the actual
   graph — an invented edge for visual balance. That is the same defect class as
   a guessed era, and it gets the same rule: **every edge drawn must be an edge
   the domain holds, or it does not get drawn.**

5. **Sparse data at the extremes.** L0 needs stroke data (we have KanjiVG for the
   imported kanji), L4 needs collocations (thin), L5 needs real sentences (we have
   2,000 from Tatoeba). Where a level is sparse the dive must say so rather than
   invent filler — `unknown` as a first-class value, same as the era attribute.

---

## 9. Plan

Not Wave B. This lands as **Wave C**, after the surfaces exist, for two reasons
that are about sequencing rather than enthusiasm: the dive consumes the graph
projection and the ground layer that Wave A′ is producing right now, and it needs
the kanji and word pages to exist so that "tap through to the page" has somewhere
to arrive.

| Stage   | Content                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C-1** | Scale-ladder projection in the domain: constituents and participations at all six levels, pure and tested, `unknown` where data is thin. No UI.                                                                                            |
| **C-2** | The dive surface: continuous zoom, LOD culling, the reduced-motion stepped variant, always-visible position and one-gesture exit. Flight only — **no probes yet**, so the exposure/retrieval boundary is proven before anything can grade. |
| **C-3** | Constellation review and the flight review, both through the evidence gate, with the boundary test from §4 written first.                                                                                                                  |
| **C-4** | The 案内人 in the dive: depth awareness, the way back, and naming the surface-bright/interior-dark diagnosis from §3 when it sees one.                                                                                                     |

**Open question for the operator**, and the only one I would not decide alone:
the dive is a strong candidate to _replace_ the flat kanji page rather than sit
beside it — a kanji page is arguably just the dive stopped at L2. Keeping both is
safer; merging them is cleaner and avoids two ways to see one thing. I would
merge, but not without asking.
