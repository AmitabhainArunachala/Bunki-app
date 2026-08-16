# Bunki current product constitution

**Date:** 2026-08-15  
**Status:** Current operational authority for the integrated prototype  
**Baseline:** PR #71 at `b5124438849a2a26ad801396e0c32bfc02142349`

## 1. Purpose

This document gathers the operator's latest rulings into one current reading of
Bunki. It exists so an implementer can build and judge one coherent prototype
without reconstructing the product from competing historical branches,
screenshots, or design documents.

It does not rewrite the frozen specifications, erase their history, or declare
the product complete. It records how their durable product laws and the latest
operator feel verdicts are to be applied now. The current implementation vessel
is `prototypes/corridor/`: one integrated browser prototype, at one testable URL.
Native packaging remains a final-product requirement, not something a web
prototype can prove.

## 2. Authority order

When sources disagree, use this order:

1. The operator's latest direct words and feel verdicts.
2. `BUNKI_OPERATOR_PRODUCT_LOCK_2026-07-29.md` together with
   `BUNKI_MASTER_DEFINITION_OF_DONE_2026-07-27.md`.
3. `BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` and its frozen
   integrity record.
4. Ratified KAIRO craft standards and dated redirects, with later redirects
   controlling the part they amend.
5. The latest truthful handoff and current repository evidence.
6. Older briefs, mockups, branches, and automated suites as useful history and
   regression tools only.

An automated check may protect an old assumption; it is not allowed to overrule
a newer operator decision. Update the check when that happens. Never edit a
frozen source merely to make the hierarchy look tidy.

## 3. The master vision

Bunki is one living Japanese-learning system. A learner's real encounters with
Japanese become durable, interconnected threads through reading, listening,
dictionary and grammar understanding, kanji, memory, production, and
conversation. It must feel like one calm, exact instrument rather than a set of
adjacent mini-apps.

The experience should create intense focus without clutter: recursive,
mesmerizing, intuitive, and precise. Its visual language is living ink,
Nihonga material, real washi depth, and quiet Japanese-grade engineering. Zen
does not mean weak contrast or soft truth. Legibility, responsiveness, and
correct behavior are part of the aesthetic.

The present Corridor is the place where that vision is made tangible and felt.
It is the product prototype, not the completed product.

## 4. Stable product laws

These laws remain intact across every surface and every palette:

- **Capture creates no review debt.** Saving an encounter does not schedule it.
  Only an explicit learner choice promotes it into retrieval.
- **AI proposes; the learner confirms; FSRS schedules.** AI may explain,
  recommend, compose, and propose practice. It may not silently change
  canonical facts, mastery, or scheduler state.
- **Exposure is not mastery.** A view, tap, lookup, or passive re-encounter is
  evidence of exposure, not proof of retrieval.
- **Memory is modality-specific.** Reading, listening, recognition,
  production, and writing evidence do not collapse into one false level.
- **Doors are recursive and context-preserving.** Word, sense, grammar, kanji,
  component, compound, sentence, source, review, and conversation remain paths
  back to the same learning thread and original place.
- **Provenance travels with the material.** Authentic, user-supplied,
  generated, and inferred content remain distinguishable; lawful source links,
  positions, and lineage are retained where applicable.
- **One learner state serves the whole app.** Presentation layers do not invent
  independent notions of what the learner knows.
- **Calm Nihonga is functional, not decorative.** Real DOM text remains
  readable and accessible; living ink and paper depth support attention rather
  than obscure it.

## 5. Current public colour constitution

The public product exposes exactly ten palettes, in exactly this order:

| Seal | Public key | Role                            |
| ---- | ---------- | ------------------------------- |
| 墨   | `sumi`     | sumi on warm kōzo               |
| 朱   | `shu`      | vermilion on shell-white paper  |
| 柿   | `iwa`      | persimmon-tannin / mingei       |
| 漆   | `rokusho`  | shell white on black lacquer    |
| 金   | `yoru`     | gold on deep indigo             |
| 藍   | `hokusai`  | Prussian-blue print world       |
| 赤   | `akafuji`  | Red Fuji rust on dawn paper     |
| 浪   | `nami`     | foam on the deep Prussian sea   |
| 板   | `keyblock` | key-block black on print paper  |
| 雷   | `hakuu`    | lightning gold in the night sky |

Every public picker uses this complete ordered set; no surface maintains a
private, shortened, or differently ordered public roster. Palette changes are
world changes, so paper, ink, semantic red, contrast, and the writing pigment
change together.

`kaku` / 殻 remains loadable only for internal and legacy compatibility. It is
not an eleventh public choice and must not appear in a public picker.

## 6. Canonical quiet writing room

The operator's phrase **kanji only** is literal. On entering the writing room,
the rest of the page fades away. It is not a normal page whose buttons were
merely moved or dimmed. The living kanji is the sole subject on its washi or
night ground.

### Dormant state

- Show the living kanji and one faint `⋯` wake trigger.
- Show no title, back control, panel frame, metadata, readings, progress pips,
  instruction copy, replay control, speed control, palette chips, or stroke
  number button.
- The trigger remains discoverable and accessible but visually subordinate to
  the kanji.
- Browser/device Back, including the iPhone edge-back gesture, exits the room
  and restores the originating sheet, scroll position, and focus. It uses a
  same-URL history sentinel and adds no visible navigation control.

### Awake state

Activating the faint trigger wakes one minimal field containing only:

1. the ten palette choices in the exact public order above;
2. the complete labeled **音読み** and **訓読み** values, never arbitrarily
   truncated; and
3. one **筆順の番号** toggle.

No legacy pigment dots, extra navigation, replay, pips, hints, metadata, or
slow-writing control joins that field. Closing the field returns to the true
kanji-only state.

On a keyboard, the first `Escape` sleeps an awake field and the second exits;
platform Back exits directly from either dormant or awake state.

If the character has no usable vector stroke path, the room remains honest:
show the glyph and wake trigger, allow palettes and readings, and omit a stroke
number control that cannot work.

### Writing and number timing

- Normal writing is a smidgen faster than the prior gallery pace
  (`speed: 1.1`). The preserved internal slow rate is `0.7`; it is not added to
  the quiet public control field.
- A stroke number appears on the same animation frame as that stroke's first
  actual ink splat. It must not announce the stroke when a timer starts, during
  the inter-stroke pause, or after the visible stroke has already begun.
- Rewriting resets the number state and repeats the same synchronization.
- In reduced motion, present one coherent finished still; when numbering is on,
  the corresponding complete number set is visible rather than simulating a
  misleading partial animation.

## 7. Living-ink and paper law

The writing hand keeps the approved **gallery law**:

- advance the hand from wall-clock time;
- take one WebGPU lattice step per displayed frame;
- take two WebGL2 fallback steps per displayed frame; and
- preserve the canonical `260ms` / `460ms` stroke settle and `4200ms` living
  window after the last stroke, then freeze when `finished` fires, with no
  additional accelerated or batched post-finish drying tail.

Do not replace this with the later Sites substrate experiment, a hidden
fast-forward, iteration-based clocking, or an extra post-finish settling batch.
The slower mode dilates the clock; it does not reduce ink quality.

The ground should read as physical washi rather than a flat color or generic
noise layer: biased long and short fibres, restrained cross-fibres, softly
uneven absorption, local tooth, edge falloff, and world-specific material
character. Texture remains subordinate to the glyph and text. Day and night
worlds each need measured contrast; universal darkness is not sophistication.

## 8. Golden prototype walk

The integrated feel path is:

**Drift → shelf → reader → entry → kanji → quiet writing room → wake → choose
palette / inspect readings / enable stroke numbers → return with context.**

The return is part of the path: the learner must come back to the same entry,
source, and place rather than fall out into a generic home screen. This walk is
the current prototype's minimum coherent demonstration. It does not replace the
Product Lock's wider end-to-end acceptance tests.

## 9. Truth boundary: real now, simulated now, later

### Real now

- Corridor is the integrated browser prototype and current visual/interaction
  vessel.
- Its recursive route, public palettes, quiet writing-room interaction,
  KanjiVG-derived stroke paths, living-ink renderer, local learner envelope,
  and existing deterministic scheduling core are executable software and must
  be tested as such.
- Repository evidence and a deployed build can prove browser behavior and
  prototype feel on a real phone.

### Simulated or provisional now

- Seed articles, demonstration learner history, small or fixed content sets,
  staged recommendation results, and any fixture-backed conversation or media
  flow are prototype material, not production coverage.
- A key-gated AI demonstration proves an interaction shape only. It does not by
  itself prove provider resilience, privacy, cost control, factual quality, or
  a durable conversation teacher.
- Browser-size and PWA demonstrations do not prove native share-sheet,
  background, offline, interruption, or force-quit behavior.

### Required later for the full product

- A signed, native iPhone daily experience and its seven-day physical-device
  acceptance, including share capture and recovery.
- Production-complete, versioned dictionary/kanji/grammar data and a lawful,
  sustainable source portfolio.
- The full immersion inbox and reader/listener continuity, including lawful
  audio/transcript handling.
- A recursive AI conversation teacher with agreed privacy, provider, budget,
  provenance, and failure behavior.
- Voice/listening, production, full-context weaving, and modality-specific
  retrieval at the Product Lock's acceptance depth.

No branch, prototype, test count, or visual polish earns the phrase **Bunki
complete** before those product-wide tests pass and the operator declares it.

## 10. Supersession register

| Earlier reading                                                            | Current ruling                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Five public GOSAI worlds                                                   | Historical design source; superseded first by 八彩 and now by the ten-world public roster in §5.                                |
| Eight public HASSAI worlds including 殻                                    | Material and token craft remains useful; the public roster is now the ten ordered choices, with 殻 internal-only.               |
| Universal lacquer dictionary sheet                                         | Repealed by the 2026-08-14 feel redirect. Surfaces wear their world's raised paper; darkness is used by the worlds that own it. |
| Earlier pace/iteration interpretations of the ink engine                   | Superseded by the gallery law in §7.                                                                                            |
| Stroke number signaled at stroke scheduling time                           | Superseded by exact first-visible-splat synchronization.                                                                        |
| Framed writing page with always-visible chrome                             | Superseded by the canonical quiet room in §6.                                                                                   |
| Stale handoff, screenshot, or suite contradicting a later operator verdict | The latest operator verdict controls; preserve the artifact as history and update current code/tests.                           |

## 11. Decisions that are genuinely open

The following require explicit operator decisions or acceptance evidence; this
constitution does not invent them:

- **Native packaging:** final Swift/native architecture, packaging sequence,
  and the route from Corridor to the signed iPhone product.
- **AI operating contract:** provider strategy, privacy boundary, on-device key
  handling, spend/budget controls, conversation memory, failure modes, and the
  exact recursive teacher experience.
- **Source portfolio:** the production mix, licensing and rights review,
  transcript providers, update cadence, and editorial quality bar.
- **Voice and listening:** speech provider/model choices, latency and offline
  expectations, pronunciation judgment, audio provenance, and accessibility.

Until the operator closes one of these, label it open. A convincing mockup may
help decide it, but may not silently settle it.
