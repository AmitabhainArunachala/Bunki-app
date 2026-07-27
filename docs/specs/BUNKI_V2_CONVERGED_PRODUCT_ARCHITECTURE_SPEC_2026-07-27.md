---
title: "Bunki (分岐) — Converged v2 Product / Learning / Architecture Specification"
date: 2026-07-27
project: bunki
working_name: "Bunki / 分岐 (working codename only; operator decision pending)"
artifact_type: canonical_converged_specification
version: v2.0
status: frozen_at_publication
author_agent: Claude (fresh context, specification-only pass)
derives_from:
  codex_v1:
    file: docs/convergence/JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md
    sha256: 94842a1c8bc423a84cbe6131a8c540c88b676d5f8e2143a107b02ec5b28da95b
  claude_v1:
    file: docs/convergence/BUNKI_WORKING_SPEC_2026-07-27.md
    sha256: 77e52f3a93fd9ebb3cdd8c456250cb66779d87bc1582e53e0bd7e39da82feb68
  claude_round1:
    file: docs/convergence/BUNKI_CONVERGENCE_ROUND1_2026-07-27.md
    sha256: a6066f6972f58dff213bbdddcec5447bd7d01ea22745c26a15d7d455e6dd756d
  codex_round1_response:
    file: docs/convergence/BUNKI_CONVERGENCE_ROUND1_CODEX_RESPONSE_2026-07-27.md
    sha256: 9542fbaa89456b2bb226a415f37a3360104539e290242545c542a2aee6f07a54
  handoff_controller:
    file: docs/handoffs/BUNKI_CLAUDE_FRESH_CONTEXT_BUILD_SPEC_HANDOFF_2026-07-27.md
    sha256: c002f6c4d8c007d0acdac1a66b7295d287f98d206f610c3131d73218dc19909c
supersedes: "both v1 documents as working specifications; the v1 files remain frozen historical artifacts and are never edited"
operator: John Shrader
---

# Bunki (分岐) — Converged v2 Specification

This document is the single product/learning/architecture source of truth for
Bunki. It integrates two independently frozen v1 designs (Codex, Claude), the
Round-1 convergence diff (A1–A14, C1–C6, E1–E8), and Codex's item-by-item
response (16 concede, 12 synthesis, 0 standalone hold). Neither frozen v1 is
edited by this document; corrections are recorded here as superseding
decisions.

**Requirement IDs.** Load-bearing requirements carry stable IDs in the form
`REQ-<AREA>-<NN>`. Downstream artifacts (the Phase-0 build controller, the
traceability matrix) cite these IDs and must not restate requirements without
them. Decision-ledger entries carry IDs `DL-<NN>`.

**Reading rule.** Statements tagged `hypothesis` or `experiment` are not
established facts, and no downstream artifact may promote them to facts.
Evidence citations use the merged ledger of §2 (U = user evidence, R =
research/official-source evidence, S = session/probe evidence).

---

## 1. Purpose, failure addressed, and operator intent

### 1.1 The failure being solved

**[REQ-CORE-01]** Bunki exists to fix **learner-state fragmentation** across
lookup, capture, kanji study, SRS, immersion, and conversation. At least five
systems currently hold unreconciled shards of the operator's learner state
(dictionary lists, ~12 Anki decks, a kanji app, a news reader, implicit
knowledge in the media diet). The product turns a real encounter into one
persistent learning thread whose dictionary knowledge, kanji structure,
context, retrieval evidence, spaced review, AI conversation, and future
encounters remain connected. (Provenance: convergent — Codex §3.1, Claude §1;
evidence U1–U8, S5.)

### 1.2 The core capture impulse

**[REQ-CORE-02]** The dominant capture state is *partial* knowledge:

> "I do not know this perfectly and I do not want to lose it." (U3)

Capture must be nearly instant, and capture must **not** automatically create
review debt. Saving is not a promise to memorize (Codex §2.1.7; adopted A3).

### 1.3 Product promise

> Nothing meaningful you encounter is lost; not everything becomes homework;
> what does become practice returns in the right form, context, and intensity.

**[REQ-CORE-03]** The product is the **closed loop**: encounter → durable
thread → understanding → explicit promotion → scheduled retrieval → contextual
reuse → evidence → adapted next experience. (Provenance: convergent.)

### 1.4 Operator experiential non-negotiables

**[REQ-INTENT-01]** The following experiential requirements are preserved
verbatim from the handoff and bind all phases:

1. lookup and capture feel immediate;
2. the app is AI-native and conversational without making fluent AI prose
   equal truth;
3. the app learns the user's real Japanese profile over time;
4. journeys may bifurcate or trifurcate, but they are bounded and rejoin;
5. dictionary, kanji, stroke order, components, compounds, grammar, source
   context, sentence mining, and SRS feel woven rather than bolted together;
6. review/new/integration balance adapts quickly without scheduler
   instability;
7. text is primary initially; voice comes later;
8. the design is beautiful, immersive, recursive, fun, and calm — not a gray
   reference dump or a gamified shame machine;
9. the user can capture aggressively without accidentally promising to
   memorize everything;
10. the user can inspect and correct what the system thinks it knows.

### 1.5 What Bunki is not

**[REQ-CORE-04]** Not a chat interface pasted onto JMdict; not three silo tabs;
not a universal "Japanese level" score; not an AI deciding polished output
equals mastery; not an infinite due-count treadmill; not a replacement for
authentic Japanese; not a claim that generated prose equals native-edited
material; not a decorative graph shipped as proof of learning value. (Codex
§3.3; Claude §10 critiques; convergent.)

---

## 2. Merged evidence ledger (typed, narrow-scope)

**[REQ-EVID-01]** v2 carries the merged evidence ledger with source types.
Inference scope is narrow: user statements decide goals, taste, constraints,
and desired workflows — they do not establish proficiency, efficacy,
feasibility, or legal permission. Behavioral evidence supports only the task
actually observed. (Codex response §0 "Evidence interpretation"; accepted.)

### 2.1 User evidence (U — from Codex v1 §1.1)

| ID | Type | Content (abbreviated; full text in frozen Codex v1) |
|---|---|---|
| U1 | stated vision | One integrated, multi-dimensional, recursive, fast, scientific, beautiful, AI-native learning journey |
| U2 | stated vision | AI conversation develops precise learner understanding; bifurcating/trifurcating journeys |
| U3 | verbatim statement | Capture threshold: "I don't know this perfectly and I don't want to lose it" |
| U4 | reported behavior | Dictionary is dominant capture tool; review there is boring; lists are dead inboxes; export friction |
| U5 | reported behavior + screenshots | Custom Anki loved when used, "big gains"; thematic Japanese-rich pages, clozes, audio |
| U6 | reported behavior + screenshots | Kanji app used often, endless-feeling treadmill; isolated prompts, progress rings, persistent due count |
| U7 | stated preference | Text and voice per context; text dominates initially |
| U8 | stated preference | Hyper-fast, hyper-flexible iteration; explicit review + resurfacing + integration + new learning |
| U9 | stated goals | JLPT N1 aspiration; deep kanji study toward Kanji Kentei (not proof of current proficiency) |
| U10 | screenshots | Abstract/domain-rich study material (meditation, yoga, nature, psychology, yojijukugo); shows chosen material, not tested comprehension |

### 2.2 Research and official-source evidence (R — from Codex v1 §1.2)

R1 retrieval practice (Roediger & Karpicke 2006); R2 distributed practice
(Cepeda 2006, 2008); R3 context is not retrieval (van den Broek 2018); R4
contextual diversity and transfer (Norman 2023); R5 contrast/interleaving is
task-dependent (Kornell & Bjork 2008; Birnbaum 2013); R6 FSRS model/FSRS-6
(official algorithm documentation; Ye, Su & Cao 2022); R7 FSRS configuration
and desired retention (Anki manual); R8 LLM-judgment fallibility (Shi 2024;
Wataoka 2024; Pack 2024); R9 EDRDG license for JMdict/KANJIDIC2; R10 KanjiVG
CC BY-SA 3.0; R11 Tatoeba CC BY 2.0 FR with CC0 subset, per-file audio
licenses; R12 Expo/Expo SQLite feasibility, web SQLite alpha; R13 Sudachi
Apache-2.0, pin versions; R14 Anki import/export formats; R15 feedback,
transfer, response time (Butler 2010; Kornell 2009; Mettler 2016); R16 L2
grammar interleaving (Nakata 2019); R17 licenses are operational requirements
(EDRDG; YouTube developer policies). Round-1-response additions: Kang &
Pashler (discriminative contrast); Schmitt/Jiang/Grabe 2011, Kremmel 2023,
Giordano (coverage ≠ comprehension); JLPT section structure; Wiktionary
copyright terms; CHISE datasets; YouTube caption-download authorization
limits; MDN Web Share Target; Apple Share Extensions. Full citations live in
the frozen inputs; v2 does not alter them.

### 2.3 Session evidence (S — from Claude v1 / Round 1, scoped per Codex E6)

| ID | Type | Supports | Does NOT establish |
|---|---|---|---|
| S1 | direct probe (n=1, 6 items) | One cold component decomposition success (摩擦); misses on sampled formal items (につき, どころか); one failed production (〜ざるを得ない); conversational metalinguistic comfort (provisional) | "listening ≈ N2+", "formal written ≈ N3+", globally strong component analysis, any JLPT band |
| S2 | verbatim statement | The user wants an omnivorous AJATT-style ingestion experience (product pillar) | Permission for any particular acquisition technique |
| S3 | reported behavior | ~2h/day immersion (formerly 6–8h); talk-YouTube + NHK-register diet; capture lists track that diet | Optimal priority formula |
| S4 | verbatim statement | Whole-state visual (Kanji Garden wallpaper) is emotionally compelling; its non-interactivity is the failure | That a global graph improves learning; that one brightness value is honest |
| S5 | screenshots | Visible counts/intervals; workflow fragmentation and backlog friction; methodology reboots orphaned scheduling history | That the long Anki pages are definitively MCD cards; that semantic monoculture alone caused abandonment; that FSRS is enabled merely because intervals resemble FSRS |
| S6 | app collection | Nuance-collector profile; Kanken aspiration; semantic-field reference interest | Active use or skill from app ownership alone |

### 2.4 Current defensible learner statement

**[REQ-EVID-02]** The only current defensible learner-model update (verbatim
from the resolved convergence; do not broaden):

> One cold component decomposition succeeded, and three sampled formal
> constructions showed specific fragility. The user's media diet centers on
> talk/video and NHK-register material. This raises a hypothesis about the
> sampled dimensions; listening level, global reading band, production
> breadth, and JLPT level remain unmeasured.

"listening ≈ N2+" and "formal written ≈ N3+" are **withdrawn** as facts and
must not be resurrected (handoff §4.9).

---

## 3. Converged spine (do not reopen without new evidence)

Each spine item is `provenance: convergent` (arrived at independently by both
v1 lanes) unless noted, and `status: accepted`.

- **[REQ-SPINE-01]** Failure addressed: learner-state fragmentation (§1.1).
- **[REQ-SPINE-02]** Structural model: canonical entities and typed relations
  plus an append-only encounter/evidence timeline; relational SQLite (later
  Postgres) with graph behavior; **no graph database in v1**.
- **[REQ-SPINE-03]** Stable memory unit: versioned `RetrievalContract`
  defining target, direction/skill, cue and response modality, accepted
  answer/rubric, hint/reveal policy, and prompt-family version.
- **[REQ-SPINE-04]** Learner model: sparse, contract- and modality-specific
  capability state; never one global Japanese level.
- **[REQ-SPINE-05]** Evidence hierarchy: direct constrained retrieval may
  update FSRS; conversation/model inference is provisional; lookup is a
  friction event; passive appearance is exposure only.
- **[REQ-SPINE-06]** Scheduler: version-pinned FSRS-6 for valid explicit
  retrieval contracts. AI proposes experiences and candidate evidence but
  never writes stability, difficulty, retrievability, or the next interval.
- **[REQ-SPINE-07]** Capture: a saved encounter creates a provenance-rich
  thread. Scheduling begins only through explicit Keep/Learn/Master-style
  promotion.
- **[REQ-SPINE-08]** Sessions: finite, time-budgeted orchestration rather than
  an infinite due-count treadmill.
- **[REQ-SPINE-09]** Truth layers: canonical/structural fact, sourced
  scholarly/etymological interpretation, and clearly labeled mnemonic fiction
  are visually and semantically distinct.
- **[REQ-SPINE-10]** Information design: progressive disclosure — immediate
  answer first, personal context next, connected understanding after that,
  full reference last.
- **[REQ-SPINE-11]** Architecture: local-first Expo/React Native/TypeScript,
  native SQLite, authoritative pure TypeScript domain/event core, optional
  Python/FastAPI analysis sidecar later, Postgres only when sync is justified.
- **[REQ-SPINE-12]** Content: field-level provenance and licensing; no
  unsourced etymology; no assumption that public web/video text is freely
  ingestible.
- **[REQ-SPINE-13]** Migration: Anki is a warm start through a
  quarantine/mapping report, not trusted learner truth.
- **[REQ-SPINE-14]** Science posture: the complete product is a hypothesis.
  Retrieval, spacing, context, contrast, AI judgment, and accessibility
  forecasts retain their actual evidence boundaries and explicit
  falsification tests.

---

## 4. Domain model

### 4.1 Canonical entities

**[REQ-DM-01]** The canonical entity set (Codex §4.2, accepted; Claude's
Atlas/Trace map onto it — Atlas ≈ canonical graph, Trace ≈ derived learner
state, Guide ≈ AI layer, Journey ≈ `JourneyPlan`):

| Entity | Purpose |
|---|---|
| `Lexeme` | Dictionary headword and accepted written/reading forms |
| `Sense` | A specific meaning/use, not a bag of translations |
| `Kanji` | Character identity and canonical metadata |
| `Component` | Visual/structural component; distinct from historical etymology |
| `Reading` | Reading linked to character, lexeme, and actual usage |
| `GrammarConstruction` | Form, constraints, meaning, register |
| `Expression` | Idiom, collocation, yojijukugo, fixed/semi-fixed phrase |
| `ConfusionSet` | Similar meanings/forms/readings/usage boundaries (creation rule: REQ-JRN-05) |
| `Source` | Origin, rights status, URL/timecode/file reference, attribution |
| `ProvenanceRecord` | Field/artifact source version, license, attribution, modification, confidence, review state |
| `Encounter` | Exact user event: text span, sentence, audio interval, image, conversation |
| `LearningThread` | User-owned continuity wrapper around a target and its encounters |
| `KnowledgeComponent` | Sparse target/sense capability; instantiated only on evidence or need (A12) |
| `RetrievalContract` | Stable scorable cue→response contract (REQ-SPINE-03) |
| `EvidenceEvent` | Immutable observation with method, result, latency, hints, provenance, confidence |
| `MemoryState` | Derived FSRS scheduling state for one retrieval contract |
| `LearnerState` | Derived broader competence estimate for a component/thread |
| `LearningExperience` | A rendered prompt, passage, explanation, conversation, or challenge |
| `JourneyPlan` | Temporary branching/rejoining plan with goals and budget |
| `Artifact` | Audio, image, stroke SVG, generated mnemonic, imported media |

### 4.2 Typed edges

**[REQ-DM-02]** Typed edges (union of both v1 sets): lexeme HAS_SENSE sense;
lexeme WRITTEN_WITH kanji; lexeme HAS_READING reading; sense CONTRASTS_WITH
sense; expression CONTAINS lexeme/grammar; kanji HAS_COMPONENT component
(**with role**: `semantic | phonetic | corrupted | unknown` — Claude §2.1;
role claims require a `ProvenanceRecord`, and component MAY_FUNCTION_AS_
PHONETIC_IN kanji only when sourced — Codex §4.3); canonical/generated field
SUPPORTED_BY provenance record; encounter INSTANTIATES_SENSE sense; thread
BEGAN_WITH / REENCOUNTERED_IN encounter; evidence MEASURES knowledge
component; retrieval contract TESTS knowledge component; memory state
SCHEDULES retrieval contract; experience TARGETS component and EXPOSES
others; journey REQUIRES / OFFERS / REJOINS threads; sense/kanji
COLLOCATES_WITH / DERIVES_FROM where sourced.

**[REQ-DM-03]** Relational implementation: entities and typed edges are
SQLite tables with foreign keys and indexes plus an append-only event table.
No graph database, no vector database in v1; embeddings only later for
bounded retrieval tasks (Codex §4.4/§11.7; convergent).

### 4.3 Event sourcing discipline

**[REQ-DM-04]** All learner-affecting state is **event-sourced**: derived
states (MemoryState, LearnerState) are recomputable from versioned events
plus versioned model parameters. Requirements (A6, accepted):

1. events are immutable and versioned; **unknown event versions fail
   closed** (reject, never guess);
2. corrections append supersession events; history is never rewritten;
3. deletion = tombstone first (sync-safe), then a real purge path for user
   content — auditability is not an excuse for undeletable data;
4. events carry stable IDs and idempotency keys; replay is deterministic
   (clock, ID generation, and randomness are injected, never ambient);
5. replaying the same event log under the same versions produces identical
   derived state on every runtime (the cross-runtime golden-replay gate,
   Codex C6);
6. canonical source releases are immutable snapshots with reviewable
   remapping events between versions.

### 4.4 RetrievalContract

**[REQ-DM-05]** `RetrievalContract` fields (normative minimum):

- `contractId` (stable), `contractVersion`;
- `targetComponentId` (the KnowledgeComponent it TESTS);
- `skill` (retrieval direction — e.g., orthography→reading, form→meaning,
  meaning→production, audio→meaning, discrimination);
- `cueModality` and `responseModality` (text / audio / visual / choice /
  free);
- `acceptedAnswers` or `rubricId` + `rubricVersion`;
- `hintPolicy` and `revealPolicy`;
- `promptFamilyVersion`.

A dynamic experience (passage, conversation) may update FSRS **only** when it
contains a declared retrieval preserving the contract's cue direction,
modalities, rubric, and hint policy; otherwise it records broader learner
evidence or exposure (Codex §6.2; C3 synthesis).

### 4.5 Evidence tiers and gates

**[REQ-DM-06]** Evidence tiers (A2, accepted):

| Tier | Observation | Authority |
|---|---|---|
| A | Direct constrained retrieval with known answer (typed reading/meaning, cloze, forced discrimination, verified handwriting); result, latency, hints logged | May update FSRS for that exact contract |
| B | Constrained production with explicit target and versioned rubric; deliberately elicited under a declared production contract | Updates learner state conservatively; may schedule confirmation probes |
| C | Free conversation/writing judged by an LLM; spontaneous correct production; lookup behavior, dwell, reopening, self-reported uncertainty | Candidate/diagnostic only until calibrated or corroborated; never mastery by itself |
| D | Passive appearance in passage/conversation | Exposure only; never retrieval |

**[REQ-DM-07]** Grading semantics (A5, accepted): reveal-before-recall grades
`Again`; `Hard` = correct without hints/reveal but with serious effort;
`Good` = correct without help; `Easy` normally requires user confirmation,
never inferred from speed alone. A lookup is a **fluency-friction event** —
neither a successful review nor automatically `Again`; it may schedule a
later probe. Hints, reveals, and immediate retries stay in the raw evidence;
a successful post-reveal retry is practice, not an independent successful
review.

**[REQ-DM-08]** Separate evidence dimensions cannot erase each other: a
missed reading does not overwrite known meaning; the user can correct
attribution ("I knew the meaning; I missed only the reading").

### 4.6 Promotion states

**[REQ-DM-09]** Promotion states (A3, accepted): every capture creates a
provenance-rich thread in **Captured** state. Explicit promotion moves it to:

1. **Keep** — retain and resurface opportunistically; no mandatory SRS
   (default save action);
2. **Learn** — activate selected recognition/reading/sense contracts in
   FSRS;
3. **Master** — add production/discrimination (optionally handwriting)
   contracts with a higher workload budget.

Promotion is explicit and rate-limited; the intake queue (Claude §10.2)
is the nomination/rate machinery behind these states — priority = blended
personal-utility signal (REQ-JRN-06), rate-limited by FSRS-projected workload
× real time budget. Repeated encounters or lookup friction can trigger a
*nomination*, never an automatic irreversible promotion.

---

## 5. Scheduler and sessions

### 5.1 FSRS-6, version-pinned

**[REQ-SCH-01]** FSRS-6 is the v1 timing engine for stable explicit retrieval
contracts: version-pinned implementation, raw event log retained, replay
under later scheduler versions possible. FSRS is an engineering scheduler
choice, **not** proof of whole-product efficacy. There is exactly **one
scheduler implementation** (in the TypeScript domain core); no parallel
translation in any other language (C6).

**[REQ-SCH-02]** Desired retention starts near 0.90; the user sees priority
controls, not a raw retention slider; values near 1.0 are rejected
(workload); low-value material stays passive rather than forced into
low-retention SRS (A13). Exact tier values are unfrozen pending workload
simulation (`hypothesis`).

### 5.2 AI authority boundary

**[REQ-SCH-03]** AI may NOT: directly rewrite stability/difficulty/
retrievability or review history; invent a due date; count passive exposure
as recall; merge distinct abilities into one rating; silently change desired
retention. AI MAY: nominate priority; propose next cue type/context from an
eligible set; compose integration experiences around deterministically
selected items; flag suspected confusions; ask declared diagnostic probes;
recommend a priority change with a visible reason. Model tier never grants
evidentiary authority (E7). (Convergent — Codex §6.2, Claude §2.3/D4.)

### 5.3 Session orchestrator

**[REQ-SCH-04]** The session orchestrator is separate from the item
scheduler. Given time/energy/modality budgets it composes a finite session:
(1) reactivation of valuable fragile items; (2) precision retrieval; (3)
bounded expansion (new material); (4) integration passage/conversation; (5)
transfer (changed context or contrast); (6) closure with a clear ending and
optional next branch. Every session ends. The primary screen leads with what
fits the budget, never an unbounded due count; full memory-health/backlog
data remains available on demand — no dishonest hiding (Codex §15.6).

**[REQ-SCH-05]** Within-session adaptation (accuracy, response time, hint
use, skip/dwell, boredom, context) may change presentation and selection;
it never rewrites memory truth without an evidence event. Latency is
auxiliary and confounded (prompt length, input method, device,
interruption); never a standalone mastery signal. Within-session retry
logic (ARTS-style) stays separate from FSRS long-term state. (`hypothesis`
for the adaptive mixture claim.)

### 5.4 Immersion and review-by-use (C3 synthesis — resolved)

**[REQ-SCH-06]** Immersion may replace a standalone review **only** when the
immersion experience contains a declared, contract-conforming retrieval of
the same memory:

- spontaneous correct production in free conversation = Tier C by default;
  becomes Tier B only when deliberately elicited under a declared production
  contract with a versioned rubric;
- a declared micro-probe embedded in conversation may update FSRS for that
  exact contract if cue direction, modality, accepted answer, hints/reveals,
  latency, and grading are logged;
- smooth no-lookup reading/listening is exposure/diagnostic; it may change
  orchestration priority, never stability/difficulty;
- confirmation probes are deferred so a just-seen form is not "retrieved"
  under priming;
- user-facing promise: **"Your immersion contributes encounters and can
  contain real reviews; the system verifies which is which."** The claim
  that embedded probes reduce standalone burden is an `experiment` (matched-
  contract 1/7/30-day crossover; §15 H4) and may not appear in product copy
  until it passes.

Claude's v1 "review-by-use counts as implicit FSRS review at high grade" is
**withdrawn** (Round-1 §5.2) and must not be resurrected.

---

## 6. Learner model

**[REQ-LM-01]** Knowledge is modeled sparsely at two linked levels: target
entity/sense capability + stable retrieval contract. Contracts are
instantiated only when a target matters or evidence arrives (A12); do not
cross-product every dimension for every item (Codex §15.8).

**[REQ-LM-02]** Learner-facing capability labels (product labels, not
orthogonal axes): written recognition; reading retrieval; aural recognition;
sense comprehension; meaning recall; productive lexical retrieval; usage/
register; discrimination; kanji construction; handwriting (only when
activated). MVP surfaces labels 1–6; 7–10 may start as tagged evidence.
Scheduling remains per contract, never per broad label.

**[REQ-LM-03]** **No global scalar.** The UI may summarize learning health
("reading evidence strong for N2-like material in selected domains; aural
evidence sparse; 46 threads have fragile reading recall") but never a
universal level or mastery percentage. JLPT itself reports sections
separately (Codex E6 evidence).

**[REQ-LM-04]** Model update pipeline: record event → resolve measured
component(s) → FSRS update only for explicit correctly-classified retrieval →
tiered learner-state update → store model version + confidence → compare
predictions with later direct probes → permit user correction. Start with
interpretable evidence-weighted rules, not BKT/neural models (`hypothesis`;
cold-start false precision risk).

**[REQ-LM-05]** Calibration loop (Codex §8.4, accepted): store AI prediction
+ confidence; later administer constrained reference probe; compare; track
calibration by component type and rubric version; down-weight or disable
miscalibrated judges; let the user inspect and correct consequential
inferences.

**[REQ-LM-06]** Belief-ledger UX (E4, conceded): default surface answers
*why this appeared*, with evidence strength, uncertainty, and a correction
affordance; expansion shows evidence events, source/probe, rubric/model
version, supersession history; global calibration views come later; never
one mastery score. User correction creates superseding evidence — it is not
automatic mastery. `BeliefLedger` is an internal name; user-facing language
("Evidence", "Why this recommendation?") is a UX test.

---

## 7. Journeys, contrast, and priority

### 7.1 Journey compiler (E3 synthesis)

**[REQ-JRN-01]** Journey compilation rule:

> stumble → candidate-cause hypotheses → one or two cheap diagnostic probes →
> branch selection → contract-defined rejoin.

Do not infer a cause confidently from one stumble. Branch families (useful
route families, **not** a complete ontology): form/reading/aural parsing;
sense/meaning/contrast; usage/production/register; grammar/construction;
kanji structure/writing; task-misunderstanding/unscored slip.

**[REQ-JRN-02]** Show at most two or three relevant paths. "3–7 encounters"
per branch is a reversible UX budget, not a learning law. Untaken branches
persist as decaying, quiet opportunities unless pinned; they must not become
a new backlog. Rejoin is declared by an **evidence criterion**, never an
arbitrary step count. Generalized routing is Phase 2+ (`experiment`); Phase 0
contains the compiler interface and one hard-coded repair branch only.

**[REQ-JRN-03]** Branch interaction default (guided autopilot vs two-path
choice) is an open operator decision (OD-05); reversible default: offer a
choice between at most two paths with a recommended default.

### 7.2 Contrast gating (E5 synthesis)

**[REQ-JRN-04]** Contrast policy: (1) never mass-introduce brand-new
confusable sets; (2) establish a minimal foothold per relevant contract —
provisionally one unaided delayed success; (3) then juxtapose in a
discrimination contract with corrective feedback; (4) **active-confusion
exception**: if the learner is already confusing two items, allow a small
immediate corrective contrast even while both are fragile, then return to
separate retrieval; (5) operationalize by contract and modality, not a
global "stable" label. The "≥2 members individually stable" universal rule
from Claude v1 is rejected as universal; staged foothold-then-contrast is the
default (`experiment`; within-user contrast-policy comparison).

**[REQ-JRN-05]** Semantic relatedness alone does not create a
`ConfusionSet`; require user-specific confusion evidence or a validated
linguistic rationale.

### 7.3 Personal utility (E2 synthesis)

**[REQ-JRN-06]** Personal recurrence is a major, explainable priority signal
named **personal utility / personal relevance** — blended with source
diversity, recency (burst-capped), intended sense (not lemma alone),
lookup/capture friction and explicit salience, predicted re-encounter,
general frequency, pinned goals (JLPT/Kanken), prerequisite/connectivity
value, current retrievability, and workload cost. Never the sole spine; raw
counts overweight single creators, duplicate transcripts, names, topic
binges. Every rank is explainable ("seen in three of your NHK items this
week"). Optimal weighting is an `experiment` (value-per-review-minute
comparison vs general-frequency/goal baselines).

---

## 8. AI system

### 8.1 Conversation roles

**[REQ-AI-01]** Conversation is a control surface with five roles (Codex
§8.1, convergent with Claude's Guide): initial mapper; contextual explainer;
practice partner; journey navigator; evidence proposer (structured candidate
observations, never unreviewable mastery claims). Conversation-first and
capture-first are two doors into the same threads; no forced permanent
home-screen mode.

### 8.2 Routing (E7 synthesis)

**[REQ-AI-02]** Route by **task risk × latency × privacy × cost**, not a
fixed small-vs-frontier map. Operational route classes:

- **T0** deterministic offline: save, search, canonical data, FSRS,
  exact-answer grading;
- **T1** deterministic/template/local analysis: cloze integrity, known-form
  checks, cached explanations;
- **T2** low-latency structured inference: sense candidates, bounded
  explanations, provisional critique; timeout → deterministic/self-grade
  fallback;
- **T3** streamed conversation scoped to the current thread neighborhood;
  proposes provisional evidence and micro-probes;
- **T4** asynchronous high-capability planning: journey drafts, weekly
  review, content generation; never blocks capture, never writes learner
  state.

MVP prefers one remote model + deterministic local paths; multi-provider
routing only after a shadow evaluation shows material cost/latency wins
without calibration loss. Log task class, privacy class/consent,
provider/model/version, prompt/rubric version, tokens, cost, queue time,
TTFT, total latency, cache/fallback, accepted/corrected result.

### 8.3 Adapter and candidate envelope

**[REQ-AI-03]** The AI adapter is provider-independent with structured
schemas. Candidate envelopes carry: input content hash; tokenizer/dictionary/
model versions; candidates; confidence; provenance; connector policy class.
AI output is always labeled candidate/generated; it cannot mutate canonical
dictionary fields or memory state (enforced at the domain boundary, not by
convention). Secrets stay server/env-side, never in the client bundle, git,
logs, fixtures, or screenshots.

### 8.4 Generated content

**[REQ-AI-04]** Generation = grounded payload (target sense, required forms,
forbidden confusions, learner constraints, source facts, register,
difficulty) + rendered experience. Every generated item stores model/
provider/version, prompt/template version, targets, timestamp, automated
checks, user corrections, and status (`generated | reviewed | canonical`).
Generated Japanese is always distinguishable from authentic/human-edited
Japanese. Deterministic checks (target-form presence, cloze integrity,
dictionary/sense consistency) precede any product claims; native-speaker QA
before efficacy claims. Never generate factual etymology (REQ-SRC-05).

### 8.5 Correction style

**[REQ-AI-05]** Correction style (immediate explicit / recast / delayed
digest / flow mode) is an open operator-controlled UX question (A14; OD-07);
may vary by mode.

---

## 9. Content, licensing, and the Source Router

### 9.1 Source priority and provenance

**[REQ-SRC-01]** Source priority: (1) user's authentic encounters; (2)
licensed canonical lexical/kanji data; (3) licensed, provenance-tracked
example corpora; (4) user-owned/supplied material for private analysis; (5)
AI-generated bridging material, visibly labeled. Every value entering the
system carries, where applicable: `source`, `source_version`, `license`,
`attribution`, `modification_status`, `confidence`, `review_status` — at
field level when one entry mixes sources (A7).

### 9.2 Candidate datasets

**[REQ-SRC-02]** Candidate canonical datasets and their boundaries:

| Data | Candidate | License boundary |
|---|---|---|
| Words/senses/readings/POS | JMdict | EDRDG, CC BY-SA 4.0; attribution + regular update procedure |
| Kanji metadata | KANJIDIC2 | Same |
| Stroke order/components | KanjiVG | CC BY-SA 3.0; share-alike analysis for derivatives |
| Tokenization | Version-pinned Sudachi | Apache-2.0; output is not sense truth |
| Example sentences | Filtered Tatoeba subset | CC BY 2.0 FR text; per-file audio licenses |
| Anki | TSV first; package/history later | Preserve original fields + import report |

**[REQ-SRC-03]** Wiktionary, CHISE, and Kanjium are a **Phase-3 vetting
queue**, not selected canonical sources (C5). Wiktionary entry text is dual
CC BY-SA 4.0/GFDL but embedded media/examples can carry different terms —
ingestion operates at field/asset level with revision attribution and
share-alike analysis. CHISE dataset-specific licenses and Kanjium's exact
license must be verified from authoritative artifacts before commitment.

### 9.3 Source Router (C2 synthesis — the Firehose contract)

**[REQ-SRC-04]** The AJATT-style Firehose **is a product pillar**
(USER-STATED, S2), implemented exclusively through a rights-aware **Source
Router**. User initiation and transient processing do not legalize
acquisition; "transient" is a storage property, not a rights theory. Every
connector has a versioned, machine-readable policy manifest (access method,
terms/license version + date checked, acquirable fields, processing class,
permitted derivatives, TTL/refetch/delete/attribution obligations, consent
requirement, whether learner-relative scores may be retained). Modes:

1. **FULL** — user-owned, public-domain, openly licensed, or explicitly
   authorized content;
2. **FEED-SUPPLIED** — publisher RSS/API metadata and excerpt under their
   terms (a feed is not permission to republish full works);
3. **USER-SELECTED EXCERPT** — explicit share/paste; minimal private
   storage with source pointer and provenance;
4. **POINTER-ONLY** — ID/URL/timecode + official player; no caption
   scraping; no full-text scoring without a rights-cleared or user-owned
   transcript (YouTube: official caption download requires edit-permission
   authorization, so third-party default is pointer/player/metadata);
5. **BLOCKED** — no connector when the contract cannot be satisfied.

The fetch boundary defends against SSRF, unsafe redirects, decompression
bombs, active content, hostile prompt-injection text, and credential
leakage; fetched content is untrusted data, never instructions to an AI
agent. **The Firehose is not part of Phase 0.** Sequence: pasted/licensed
seed → (Phase 2) one open/licensed source + one compliant RSS source +
manual share → broader adapters after source-specific review → formal legal
review before any public product.

### 9.4 Truth layers and etymology

**[REQ-SRC-05]** Three visual/semantic truth layers (convergent — Codex
§9.1, Claude §2.5): (1) form and stroke order — factual/canonical,
deterministic KanjiVG vectors, never AI; (2) structure and sourced history —
factual with citations and uncertainty; disputed analyses show attribution;
(3) memory scene / mnemonic art — imaginative, always labeled, never
presented as history. AI may summarize a cited historical claim or turn it
into a labeled mnemonic; it may **not** invent etymology, pitch, nuance, or
canonical examples. Dictionary radical ≠ visible component ≠ mnemonic label
≠ phonetic function ≠ historical form. Component-role tagging
(semantic/phonetic) is high-leverage content (Claude §2.1) and requires
sourcing (REQ-DM-02).

**[REQ-SRC-06]** If mnemonic art is admitted (Phase 3 `hypothesis`): art
bible; persistent per-component visual identity ("component cast" — invented
independently by both lanes); asset registry; generation metadata and
variants; human approval before an image becomes shared canonical; personal
variants never replace the approved base.

---

## 10. Information design and screen contracts

### 10.1 Capture

**[REQ-UI-01]** Capture flow contract: search or receive text → correct
answer immediately → one tap to Keep → optional one-gesture uncertainty mark
(`meaning · reading · use · kanji · not sure`) → return to the original
activity; enrichment finishes asynchronously. Uncertainty inference (from
query type, opened sections, replays, prior evidence) remains editable. AI
latency never blocks save (REQ-ARCH-06). (Codex §10.2; convergent with
Claude "capture IS thread creation" as corrected by A3.)

### 10.2 Word page (progressive disclosure)

**[REQ-UI-02]** Layer 0: written form, reading, audio when local, best
candidate sense for this encounter, concise gloss, promotion state. Layer 1:
original encounter + source; "what appears uncertain" with confidence; one
high-value explanation or contrast; recent related encounters; next useful
actions. Layer 2: other senses; collocations/register; confusables;
authentic examples; word family; constituent kanji + relevant compounds;
pitch accent only when a licensed source is selected. Layer 3: full JMdict
fields, conjugation, classifications, frequency/JLPT labels with source
caveats, attribution and provenance.

### 10.3 Kanji page

**[REQ-UI-03]** Layer 0: character; high-value meaning center; the actual
reading in the encountered word; stroke animation; personal state. Layer 1:
encountered compounds ranked by personal relevance; common readings via
those compounds; visible components **with roles where sourced**; current
weak dimension; one useful contrast. Layer 2: reading families; sourced
phonetic/semantic patterns; writing/tracing; local graph neighborhood;
labeled mnemonic image if enabled. Layer 3: full KANJIDIC2 data; all
readings/codes; school grade, frequency, JLPT/Kanken mappings with
provenance; sourced history. Dictionary indices (SKIP, Henshall, NJECD,
Gakken, New Nelson, KALD, Daikanwa/Morohashi) are **join keys in the
database, never rendered on the page** (Claude §5; accepted). A kanji page
should feel like a museum card, not a spreadsheet row (Claude §8).

### 10.4 Grammar page

**[REQ-UI-04]** Layer 0: form, concise function/meaning, the exact span in
the encounter. Layer 1 (MVP): user notes + explicitly labeled AI-candidate
parse/explanation, never canonical fact. Layer 2 (after a licensed source is
selected): sourced constraints, register, transformations, related
constructions, contrastive examples. Layer 3: complete sourced reference.
Constructions own recognition/interpretation/production/discrimination
contracts exactly as lexical senses do (grammar is first-class; convergent).

### 10.5 Session, integration, evidence inspector

**[REQ-UI-05]** Session screen: leads with the finite plan for the chosen
budget; visible recipe; explicit completion state; backlog/memory health one
level deeper, on demand. Integration canvas: thematic passage with inline
interactions (reveal, cloze, audio, "meaning known / reading missed", open
thread, branch, return to exact position); one visible experience may
produce several observations, but only declared, genuinely attempted
contracts update long-term memory (Codex §10.6/§15.14).

**[REQ-UI-06]** Evidence inspector: for any thread/state change, show why —
the event chain, tier, source/probe, rubric/model version, supersession
history — plus correction affordances and lossless versioned JSON export
(REQ-ARCH-08).

### 10.6 Observatory (later phase)

**[REQ-UI-07]** Local neighborhoods are the default working surface. The
global **Observatory** is a later optional reflective mode (S4 demand):
zoom, filter, search, tap into threads, replay historical growth from the
event log. It must never collapse reading/meaning/listening/production/
writing contracts into one mastery light: capability lenses or distinct
marks preserve stability, retrievability, uncertainty, and coverage.
Observatory-compatible events are preserved from day one; wallpaper/
lock-screen export is later, opt-in (private-data leak). Acceptance:
task success (find fragile area, inspect growth, navigate to a useful
thread) + voluntary week-4+ return, not first-session delight.

### 10.7 Design language

**[REQ-UI-08]** Typography-first: real Japanese type (mincho-class for
reading surfaces, clean sans for UI); first-class furigana (ruby); optional
vertical text; ink-and-paper palette with one vermilion accent; generous ma.
Reading surfaces render clean; only Trace-unknown/fragile words carry a
quiet mark (**personal frontier**, never global-JLPT rainbow highlighting).
No confetti, no XP; honest metrics only. Beauty communicates structure and
never obscures precision, speed, or provenance. (Claude §8 + Codex §2.1.10;
convergent.)

**[REQ-UI-09]** Every screen defines loading, error, empty, and offline
states; Japanese text rendering (ruby, line breaking, vertical rhythm) and
accessibility (dynamic type, contrast, screen-reader labels, touch targets)
are requirements, not polish.

---

## 11. Architecture

### 11.1 Platform sequencing (C1 synthesis)

**[REQ-ARCH-01]** One Expo/React Native monorepo; one pure TypeScript domain
core. The overnight/Phase-0 interaction demonstration targets **Expo Web**
(manual paste/search; provisional web event-store adapter). Before anything
is called a **daily-use alpha**: an iOS development build must prove native
SQLite persistence and incoming-capture behavior on the operator's actual
iPhone (share-sheet spike; production share extension not required, but the
architecture must not preclude a later Swift Share Extension/App Group
bridge; clipboard/deep-link/manual-paste fallbacks retained). Web remains
the long-text/import/admin surface; native is expected to become the primary
capture/review surface unless device evidence overturns it.

### 11.2 Authority boundaries (C6 synthesis)

**[REQ-ARCH-02]** The **authoritative pure TypeScript domain package** owns:
entities; versioned event schemas; `RetrievalContract` validation;
evidence-tier gates; the pinned FSRS-6 reducer; promotion/session policy;
provenance invariants. It imports no React, database, clock, network, or
platform APIs; clock, ID, and randomness are injected for deterministic
replay.

**[REQ-ARCH-03]** **Python/FastAPI is an analysis sidecar** (later phases):
pinned Japanese NLP, ingestion, AI jobs. It returns versioned candidate
artifacts; it cannot create accepted `EvidenceEvent`s, mutate FSRS, or write
canonical learner state. When sync is justified, a thin TypeScript
write/sync gateway imports the same domain package, validates
version/idempotency, owns Postgres writes, and calls Python; Python never
gets an event-store write role. JSON Schema/OpenAPI at the language
boundary; Pydantic + golden fixtures; unknown event versions fail closed.
Phase 0 deploys no Postgres and no service fleet.

**[REQ-ARCH-04]** Only the domain core's evidence gate can append an
accepted `EvidenceEvent`. UI code submits typed commands; adapters (AI,
import, analysis) submit candidates; candidates become evidence only through
an explicit user action or a declared contract-conforming probe validated by
the gate. This is enforced by module boundaries and types, not convention.

### 11.3 Persistence

**[REQ-ARCH-05]** Persistence is behind a **port/adapter boundary**: append
event, read stream, snapshot/derive, export. Native SQLite (expo-sqlite) is
the target authority; the web adapter (IndexedDB or in-memory) is **clearly
provisional** and labeled as such — web persistence claims are never
extrapolated to native (R12: Expo web SQLite is alpha). Local schema
evolution has migrations with verified rollback; destructive migration
without verified rollback is a stop condition. Restart/background
durability is tested on every runtime actually claimed.

### 11.4 Offline and latency

**[REQ-ARCH-06]** Dictionary search, save, browse, stroke viewing, due
review, and export work offline (T0). AI enrichment is asynchronous and
cancellable; a timed-out AI call neither loses nor blocks capture.
Provisional latency budgets (engineering hypotheses to benchmark on the
operator's iPhone, never product truths): local save acknowledgment p95
≤150 ms; warm local lookup p95 ≤200 ms; share-to-durable-acknowledgment
median ≤2 s / p95 ≤4 s or no worse than the current dictionary by >20%;
zero lost captures across a 100-trial background/force-quit/share test;
and five ordinary captures must feel no slower than the operator's current
dictionary flow (operator-judged, C1 acceptance test).

### 11.5 Privacy, secrets, observability

**[REQ-ARCH-07]** Cloud AI receives the minimum context for the requested
operation, subject to user settings; raw private sources are not used for
model training by this app; provider retention terms get implementation-time
review. Secrets never enter git, client bundles, logs, fixtures, or
screenshots. Observability: local structured logs with latency marks and
task/route classes, without storing sensitive content; enough to diagnose
latency regressions.

### 11.6 Export

**[REQ-ARCH-08]** Lossless, versioned JSON export of all user-generated
state: encounters, threads, promotion states, contracts, evidence events,
derived-state versions, provenance/license metadata. The export can
reproduce the inspected event history under replay (REQ-DM-04.5). Import of
the app's own export is the compatibility bar for schema evolution.

---

## 12. Phasing

### 12.1 Phase 0 — the closed-loop slice (build target of the Phase-0 controller)

**[REQ-PH-01]** Phase 0 proves exactly one closed learning loop:

> paste or select one provenance-labeled seeded encounter → immediate durable
> thread → bounded AI candidate explanation → explicit promotion → one stable
> retrieval contract → one contextual reuse → scored probe → finite session →
> inspect and export the evidence.

Required capabilities (binding; the controller derives work packages from
these — IDs `P0-CAP-01..15`):

1. **[P0-CAP-01]** Responsive Expo Web demonstration in a native-ready
   Expo/React Native project.
2. **[P0-CAP-02]** Pure TypeScript domain core with versioned events and
   deterministic replay.
3. **[P0-CAP-03]** Single-device local persistence through a port/adapter
   boundary; native SQLite target authority; clearly provisional web
   adapter.
4. **[P0-CAP-04]** Small, explicitly licensed/labeled seed dictionary/kanji
   dataset or fixtures; no claim of complete coverage.
5. **[P0-CAP-05]** Immediate encounter capture with provenance and
   Keep/Learn/Master promotion.
6. **[P0-CAP-06]** One progressive-disclosure word page and one kanji page.
7. **[P0-CAP-07]** One stable `RetrievalContract`, one version-pinned FSRS-6
   path, explicit grading semantics.
8. **[P0-CAP-08]** Separate evidence for meaning vs reading (one miss cannot
   erase the other).
9. **[P0-CAP-09]** One contextual reuse/integration canvas.
10. **[P0-CAP-10]** One bounded AI exchange through a provider-independent
    adapter; canonical fields deterministic; AI output labeled
    candidate/generated.
11. **[P0-CAP-11]** One finite session recipe with an explicit ending.
12. **[P0-CAP-12]** One evidence inspector showing why state changed;
    lossless JSON export.
13. **[P0-CAP-13]** Offline/non-AI fallback for capture, lookup, review,
    export.
14. **[P0-CAP-14]** Automated unit, integration, replay, and end-to-end
    tests for the loop.
15. **[P0-CAP-15]** A documented iPhone/native development-build checkpoint;
    if the executor lacks macOS/Xcode/device access, web completion may
    proceed but native verification remains an explicit external gate and
    cannot be claimed.

**[REQ-PH-02]** Explicitly excluded from Phase 0 (seams preserved,
implementation forbidden): full JMdict/KANJIDIC2 production import;
production iOS Share Extension; OCR/camera/audio capture/voice/pronunciation
scoring; generalized web/YouTube scraping or the Firehose; Postgres,
cross-device sync, accounts, production backend fleet; deployed Python NLP
service unless the bounded slice proves it indispensable; generalized
conversation diagnosis or calibrated learner-model inference; generalized
journey compiler; `ContentReadinessEstimate` feed ranking; full Anki
`.apkg`/history migration; global Observatory implementation or wallpaper
export; AI-generated kanji art; sourced-etymology productization;
handwriting recognition; comprehensive grammar/JLPT/Kanken curriculum;
social features, marketplace, subscriptions, efficacy marketing claims.

### 12.2 Daily MVP (post-Phase-0)

**[REQ-PH-03]** Smallest genuinely daily-use MVP (Codex §12.2 merged with
Claude Phase 0 "Lens"): complete licensed JMdict/KANJIDIC2 local search;
KanjiVG stroke order; instant Keep/Learn/Master capture with source
sentence; layered word/kanji pages; first-class grammar threads (user notes
+ labeled AI candidates); FSRS-6 explicit review; finite time-budgeted
session; one thematic integration passage; basic grounded text conversation;
TSV import from Anki and export back; provenance and correction;
single-device local operation. Native daily-alpha gate: REQ-ARCH-01.

### 12.3 Phase 2 — ingestion and calibrated conversation

**[REQ-PH-04]** Native share capture; OCR and audio/timecode encounters;
richer conversation with structured probes; calibration dashboard; contrast
system (REQ-JRN-04 scheduled); Source Router first connectors (one
open/licensed + one compliant RSS + manual share); `ContentReadinessEstimate`
experiment (§15 H3); personal-utility weighting experiment; generalized
journey routing experiment; optional cloud sync.

### 12.4 Phase 3 — kanji depth, voice, visual memory

**[REQ-PH-05]** Handwriting/stroke assessment; living-literacy and
systematic-mastery kanji tracks; voice/listening evidence; sourced phonetic
families and etymology (after C5 vetting); consistent mnemonic-art pilot
(REQ-SRC-06); KanKen-oriented deep mode; Observatory prototype → REQ-UI-07
acceptance.

### 12.5 Phase 4 — product validation

**[REQ-PH-06]** Native-speaker content QA; license and privacy review;
controlled retention/transfer experiments; multi-user calibration;
accessibility, cost, abuse, safety; positioning beyond the me-first user.

---

## 13. Content-readiness (deferred feature, bounded claims)

**[REQ-CRE-01]** `ContentReadinessEstimate` (E1 synthesis) is a future
personal estimate, **not a comprehension oracle**: versioned source
requirement signature (sidecar) + learner-relative overlay (TS core).
Dimensions: sense/modality-specific lexical coverage; high-value gaps and
source diversity; grammar/construction evidence; names, segmentation,
ASR uncertainty; reading vs unaided listening vs captioned viewing; speech
rate/audio quality; source/genre/topic familiarity; confidence, missing
data, model staleness. UI: **Ready / Reachable Challenge / Deep Dive** +
plain reasons; may say "estimated lexical accessibility 92–96%; ~40 unstable
candidates"; must never say "you will understand 96%" (coverage ≠
comprehension — Schmitt 2011, Kremmel 2023). `i+1` is learner-facing
shorthand; the honest term is calibrated reachable challenge. Ships only if
it beats static-difficulty and coverage-only baselines on 40–100 held-out
real feed items (ranking, calibration/Brier, false-"Ready" rate); otherwise
lexical accessibility remains descriptive metadata and the model is deleted.
Not Phase 0; schema + manual prototype allowed in Phase 0/1.

---

## 14. Migration

**[REQ-MIG-01]** Anki warm start: lossless raw import (TSV first;
package/history later), mapping report, quarantine/preview before anything
affects live learner state; historical evidence carries confidence labels;
never silently reinterpret. Methodology changes must never orphan memory
history again ("one Trace, many views" — Claude §10.2; accepted). Imported
review history is Tier-labeled evidence, not trusted truth (REQ-SPINE-13).

---

## 15. Riskiest hypotheses and falsification tests

**[REQ-HYP-01]** The product carries these named hypotheses with their
falsification tests. Failing a test mandates simplification or deletion —
no elegant architecture is protected (kill criteria in the risk register).

- **H1 — Core differentiation.** The system can infer/maintain the learner's
  missing dimension with enough calibration and low enough friction that its
  composed next experience beats the user's mature existing tools. Test:
  delayed held-out probes by modality at 1/7/30 days; calibration curves +
  Brier/log loss; N-of-1 randomized policy comparisons measuring
  retention/transfer, not just prediction; time saved vs current workflow;
  voluntary return. (Both v1s independently named this the riskiest
  assumption.)
- **H2 — Closed-loop daily value.** The Phase-0 loop makes the operator
  voluntarily put a second real encounter through it. Test: §17 gates.
- **H3 — Content readiness.** REQ-CRE-01 beats cheap baselines on held-out
  real content. Test: §13 gate.
- **H4 — Embedded probes reduce burden.** Matched-contract crossover
  (standalone vs embedded vs exposure+deferred probe) shows non-inferior
  1/7/30-day recall/transfer within a predeclared margin with lower burden.
  Until then, no burden-reduction claims (REQ-SCH-06).
- **H5 — Diagnosed routing beats generic repair.** Test: diagnosis-vs-user-
  agreement; diagnosed vs generic vs user-selected repair on 1/7-day
  performance, transfer, time-to-repair, abandonment (REQ-JRN-01).
- **H6 — Contrast gate.** Staged foothold-then-contrast beats immediate
  contrast and ordinary scheduling on cross-substitution errors, independent
  recall, transfer at 1/7/30 days (REQ-JRN-04).
- **H7 — Observatory value.** Week-4+ voluntary use and task success
  (REQ-UI-07).
- **H8 — Personal-utility weighting.** Beats general-frequency/goal-only
  ranking on organic re-encounters, delayed recall, lookups avoided,
  voluntary promotion, value per review minute (REQ-JRN-06).
- **H9 — Adaptive session mixture.** The orchestrator can adapt
  review/new/integration balance without destabilizing FSRS (REQ-SCH-05).
- **H10 — Latency budgets.** REQ-ARCH-06 numbers hold on the operator's
  actual iPhone; measured, never manufactured.

---

## 16. Known weaknesses and skeptical attacks (retained)

**[REQ-WEAK-01]** All fifteen Codex §15 attacks are retained in force with
their mitigations: scope collapse; false-precision learner model;
AI-generated Japanese teaching subtle errors; intellectually beautiful but
operationally useless graph; dynamic sessions reducing trust; "no backlog
shame" becoming dishonest hiding; context creating familiarity without
retrieval; dimension explosion → sparse data and review multiplication;
content/license complexity; migration importing garbage; local-first
engineering cost; me-first overfitting; research not validating the complete
product; rich prompts corrupting the scheduler's unit of memory; variation
arriving before a foothold. Claude-lane additions: AI latency/cost breaking
the daily habit (sharpest sub-risk of H1; mitigated by REQ-AI-02 routing +
REQ-ARCH-06 non-blocking capture); methodology reboots orphaning history
(REQ-MIG-01); unsustainable intake binges — the scheduler **enforces**
sustainable intake rather than merely permitting restraint (REQ-DM-09
rate-limiting; S5 evidence: three tools showed the same over-collection
signature); multiple-choice recognition never sits at the top of a drill
ladder (grade inflation feeds the scheduler garbage — Claude §10.3).

---

## 17. Success gates and claim boundaries

### 17.1 Phase-0 product-experiment success gates

**[REQ-GATE-01]** The Phase-0 experiment succeeds only if: (1) non-AI
lookup/save feels immediate; (2) one real thread survives capture,
promotion, retrieval, contextual reuse, bounded AI exchange, evidence
inspection, restart, and export; (3) learner-state dimensions remain
separate under success and failure; (4) no passive exposure is counted as
recall; (5) the user can end the session cleanly; (6) all user-generated
state is inspectable and exportable; (7) the operator voluntarily wants to
put a second real encounter through the loop.

### 17.2 Completion strata

**[REQ-GATE-02]** Distinguish: **engineering completion** (closable by an
autonomous agent); **on-device verification** (requires macOS/Xcode/device);
**operator acceptance** (requires the operator); **scientific validation**
(requires experiments over time); **market validation** (requires other
users). Only the first can be fully closed by the Phase-0 executor.

### 17.3 Claim boundaries

**[REQ-GATE-03]** Forbidden claims anywhere in product, code comments,
copy, or reports: FSRS as proof of product efficacy; context/exposure/
retrieval conflated; AI grades as final without objective contract or user
confirmation; any global Japanese level or mastery percentage;
"scientifically optimized" without a defined experiment; exact comprehension
percentage from lexical coverage; AI-invented etymology/pitch/nuance/
canonical examples; decorative graph as proof of learning value; "reduced
review burden" before H4 passes.

---

## 18. Decision ledger

Format per handoff: provenance (`operator | Claude | Codex | synthesis |
convergent`), status (`accepted | experiment | open | rejected`), evidence,
confidence, reversibility, cost of wrong, falsification/acceptance gate.
The handoff's four-way classification maps onto these columns:
**non-negotiable** = `accepted` with reversibility `low` (plus everything in
REQ-INTENT-01 and the guardrails marked as such in the frozen v1s);
**reversible preference** = `accepted` with reversibility `medium/high`;
**experiment** = status `experiment`; **open operator choice** = status
`open` (mirrored in §19).

| ID | Decision | Prov. | Status | Evidence | Conf. | Rev. | Cost of wrong | Gate |
|---|---|---|---|---|---|---|---|---|
| DL-01 | State fragmentation is the failure; closed loop is the product (REQ-CORE-01/03) | convergent | accepted | U1–U8, S5; both v1 theses | High | low | product aimed at wrong problem | H2 operator gates |
| DL-02 | Typed graph + append-only evidence timeline; relational impl; no graph DB v1 (REQ-SPINE-02, REQ-DM-03) | convergent | accepted | both v1s §4.1/§2.1-2.2 | High | low | schema rework | replay + query adequacy in Phase 0 |
| DL-03 | `RetrievalContract` as stable memory unit (REQ-DM-05) | Codex (adopted A1) | accepted | Codex §15.14 argument; R1/R3 | High | low | scheduler garbage-in | contract-level calibration |
| DL-04 | Evidence tiers A–D; lookup = friction event; exposure ≠ retrieval (REQ-DM-06) | Codex (adopted A2) | accepted | R1, R3, R8 | High | med | false mastery | negative assertions in tests |
| DL-05 | Capture creates thread; promotion activates scheduling; Keep/Learn/Master (REQ-DM-09) | synthesis (A3; corrected Claude "capture IS card creation") | accepted | U3/U4; S5 backlog evidence | High | med | review-debt treadmill or lost captures | capture rate vs promotion rate vs backlog vs daily return |
| DL-06 | FSRS-6 version-pinned, single implementation, replayable (REQ-SCH-01) | convergent | accepted | R2, R6, R7; U5 | High | med | scheduling drift/lock-in | pinned replay + held-out retention |
| DL-07 | AI never writes memory state; may/may-not lists (REQ-SCH-03) | convergent | accepted | R8 | High | low | epistemic corruption of SRS | boundary tests (AI-write attempt fails) |
| DL-08 | Grading semantics incl. reveal→Again; Easy user-confirmed (REQ-DM-07) | Codex (adopted A5) | accepted | R7/R8 | High | high | grade inflation | unit tests |
| DL-09 | Full event sourcing; supersession; tombstone-then-purge; fail-closed versions (REQ-DM-04) | Codex (adopted A6) | accepted | engineering reasoning | High | low | unauditable state, sync impossibility | golden replay fixtures |
| DL-10 | Field-level ProvenanceRecord incl. license (REQ-SRC-01) | Codex (adopted A7) | accepted | R9–R11, R17 | High | low | legal exposure; truth erosion | provenance-survival tests |
| DL-11 | Anki quarantine + mapping report (REQ-MIG-01) | Codex (adopted A8) | accepted | Codex §15.10; S5 | High | high | garbage learner state | import report review |
| DL-12 | Six-part finite session orchestrator (REQ-SCH-04) | Codex (adopted A4) | accepted | U6, U8 | High | high | treadmill regression | session-completion tests |
| DL-13 | Desired retention ≈0.90; priority not slider; reject ≈1.0 (REQ-SCH-02) | Codex (adopted A13) | accepted (values `hypothesis`) | R7 | Med | high | workload explosion | workload simulation |
| DL-14 | Variation after foothold (REQ-JRN-04.2) | Codex (adopted A11) | accepted | R3/R4; Codex §15.15 | Med-High | high | suppressed early retrieval | H6 |
| DL-15 | Sparse component instantiation (REQ-LM-01) | Codex (adopted A12) | accepted | Codex §15.8 | High | high | review multiplication | contract-count monitoring |
| DL-16 | Honest competitive framing: differentiation is a market hypothesis (REQ-CORE-04) | Codex (adopted A10; corrected Claude "nobody has closed the loop") | accepted | Codex §13 matrix | High | high | self-deception | hands-on competitor testing (open task) |
| DL-17 | Expo Web demo first; native SQLite + capture proof before daily alpha (REQ-ARCH-01) | synthesis (C1) | accepted | R12; operator D2; capture-device reality | High | high | wrong first surface; wasted iteration | device acceptance tests (REQ-ARCH-06 numbers) |
| DL-18 | Firehose is a pillar via rights-aware Source Router; not Phase 0 (REQ-SRC-04) | synthesis (C2; USER-STATED pillar S2 + Codex legal correction) | accepted | S2, R17; YouTube caption-auth limits | High | med | legal exposure vs losing identity feature | connector policy tests + per-source review |
| DL-19 | Immersion replaces review only via contract-conforming declared retrieval (REQ-SCH-06) | synthesis (C3; Claude mechanism withdrawn) | accepted | R1, R3 | High | med | relabeled exposure → false mastery | H4 crossover |
| DL-20 | Local neighborhood default + later optional Observatory with capability lenses (REQ-UI-07) | synthesis (C4; S4) | accepted | S4; Codex §15.4 | High | high | decorative complexity | H7 |
| DL-21 | Wiktionary/CHISE/Kanjium = vetting queue, not selected (REQ-SRC-03) | synthesis (C5) | accepted | Wiktionary terms; CHISE dataset pages | High | high | license contamination | field-level license verification |
| DL-22 | Pure TS authoritative domain; Python candidate sidecar; one scheduler (REQ-ARCH-02/03) | synthesis (C6) | accepted | engineering reasoning | High | med | forked rules; boundary erosion | cross-runtime golden replay + schema CI |
| DL-23 | ContentReadinessEstimate, not comprehension oracle (REQ-CRE-01) | synthesis (E1) | experiment | Schmitt 2011; Kremmel 2023 | Med | high | false promises; wasted complexity | §13 baseline gate |
| DL-24 | Personal utility as blended, explainable priority signal (REQ-JRN-06) | synthesis (E2) | experiment | S3 | Med | high | overfit to binges | H8 |
| DL-25 | Hypothesis→probe→branch journey compiler; bounded branches; evidence rejoin (REQ-JRN-01/02) | synthesis (E3) | experiment (interface accepted) | S1 demonstrations | Med | high | wrong diagnosis annoys | H5 |
| DL-26 | Belief ledger UX = Claude surface + Codex calibration backend (REQ-LM-06) | synthesis (E4 conceded) | accepted | U2; R8 | High | high | opaque model → distrust | usability test |
| DL-27 | Foothold-gated contrast with active-confusion exception; ConfusionSet needs evidence (REQ-JRN-04/05) | synthesis (E5; Claude universal rule rejected) | experiment | R5; Kang & Pashler | Med | high | interference vs sterile isolation | H6 |
| DL-28 | Merged U/R/S evidence ledger with narrow scope; learner statement REQ-EVID-02 | synthesis (E6) | accepted | all S caveats | High | low | broadened inference poisons model | probe follow-ups |
| DL-29 | AI routing by risk×latency×privacy×cost; T0–T4; one remote model first (REQ-AI-02) | synthesis (E7) | accepted | R8; cost/latency reality | High | high | cost blowup or habit-breaking latency | shadow eval + budget circuit breakers |
| DL-30 | "Bunki / 分岐" is working codename only (title) | operator + both lanes (E8) | open | — | — | high | brand rework | operator choice + name screening |
| DL-31 | Three truth layers; no AI etymology; component roles sourced (REQ-SRC-05) | convergent | accepted | R8; Codex §9; Claude §2.5 | High | low | truth erosion | label audits |
| DL-32 | Component cast / persistent visual identity for mnemonic art (REQ-SRC-06) | convergent (invented twice) | experiment (Phase 3) | dual-coding rationale | Low-Med | high | visual noise; cost | prototype test |
| DL-33 | Seed data explicitly licensed (EDRDG/KanjiVG/Tatoeba subsets) with attribution (REQ-SRC-02, P0-CAP-04) | synthesis | accepted | R9–R11 | High | med | license breach in fixtures | license file + provenance tests |
| DL-34 | No vector DB in v1; embeddings only for bounded tasks later (REQ-DM-03) | convergent | accepted | Codex §11.7; Claude §7 | High | high | premature complexity | retrieval adequacy check |
| DL-35 | Text first; voice later (REQ-INTENT-01.7) | operator | accepted | U7 | High | high | — | revisit at Phase 3 |
| DL-36 | Sustainable-intake enforcement by scheduler (REQ-DM-09) | Claude (accepted) | accepted | S5 over-collection signature | High | med | binge → collapse cycle | workload monitoring |
| DL-37 | MC recognition never tops a drill ladder (REQ-WEAK-01) | Claude (accepted) | accepted | S5 Kanji Garden critique; R1 | Med-High | high | grade inflation | drill-ladder audit |
| DL-38 | Claude v1 corrections 1–5 (Round-1 §5) recorded as superseding entries | Claude self-correction | accepted | Round-1 §5 | High | — | — | — |
| DL-39 | Integrity events: Codex v1 transport clipping (`ba5ab372…` superseded by repair commit `8dfa24b`, canonical `94842a1c…`); Claude v1 recovered byte-exact from dharma_swarm revision `8404395e9ab…` (blob `02758392…`) | operator/process | accepted | recovery packet; manifest | High | — | — | hash verification (§20) |
| DL-40 | Phase-0 scope = REQ-PH-01 capabilities with REQ-PH-02 exclusions | synthesis (handoff §7) | accepted | A9; both v1 slice definitions | High | med | scope collapse (Codex §15.1) | controller closure predicates |

---

## 19. Open operator decisions

Recorded visibly; none blocks Phase 0 where a reversible default exists.
IDs `OD-xx`; full detail in `BUNKI_OPERATOR_DECISIONS_2026-07-27.md`.

| ID | Question | Reversible Phase-0 default |
|---|---|---|
| OD-01 | Does Bunki / 分岐 feel right even as a working name? | keep codename; no user-facing branding |
| OD-02 | Which real Japanese encounter is the canonical Phase-0 fixture? | seeded fixture 分岐 (railway sense) with labeled provenance; swap on operator answer |
| OD-03 | What does "interactive" most mean for the later Observatory? | none needed in Phase 0 (events preserved regardless) |
| OD-04 | Readiness menu: discover content, prepare chosen content, or both? | none needed in Phase 0 |
| OD-05 | Branches: guided autopilot or two-path choice? | two-path choice with recommended default |
| OD-06 | What should "I know this" change? | evidence event + priority only; never direct FSRS write |
| OD-07 | Text-conversation correction style? | delayed digest default in study mode; immediate on request |
| OD-08 | Cloud-content privacy boundary, monthly AI budget, conversational latency? | Phase-0 defaults: seeded fixture content only to AI; hard budget cap via env config; T2 timeout fallback |
| OD-09 | Which repository, visibility, license, and deployment account are authorized? | **admission gate** — repo exists (AmitabhainArunachala/Bunki-app, private) but build-target confirmation + license choice are operator actions; controller WP-00 blocks production dependencies on license-incompatible choices, not on the choice itself |

---

## 20. Freeze statement

This v2 is frozen at publication. Its SHA-256 is recorded in
`BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` and cited by the Phase-0
controller as design authority. It is not revised silently: contradictions
discovered while deriving downstream artifacts were fixed before freeze and
recorded (adversarial review record: see
`BUNKI_PHASE0_RISK_AND_FALSIFICATION_REGISTER_2026-07-27.md` §QC). Neither
frozen v1 was modified. Corrections to v2 after freeze require a new dated,
superseding revision — never an in-place edit.
