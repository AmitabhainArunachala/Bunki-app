# Personal Japanese Learning OS — Codex v1 Design Freeze

**Date:** 2026-07-27  
**Status:** Frozen for independent comparison with Claude v1  
**Author lane:** Codex, before seeing Claude's substantive decisions  
**Working title:** Personal Japanese Learning OS (descriptive, not a brand decision)  
**Primary user:** the current advanced-aspiring Japanese learner; me-first,
product-later  

---

## 0. Freeze boundary and interpretation

This document freezes my design based only on:

1. the user's stated product vision;
2. the user's answers about current behavior;
3. screenshots of the user's dictionary, Anki, and kanji workflows;
4. prior user-stated goals available in the shared context;
5. external research and official product/data documentation collected independently.

I have **not** seen Claude's design decisions. The only Claude-authored material I
have seen is the convergence request and its neutral topic skeleton.

### Decision tags

- **USER-STATED** — directly required or reported by the user.
- **JOINT** — proposed in our dialogue and subsequently accepted, reinforced, or
  made necessary by the user's answers.
- **MY-PROPOSAL** — my current design judgment; explicitly revisable.

### Status tags

- **NON-NEGOTIABLE** — must survive convergence unless the user explicitly changes
  it, or it proves technically or legally impossible.
- **GUARDRAIL** — truth, safety, licensing, or data-integrity boundary.
- **PREFERENCE** — current best choice, deliberately reversible.
- **HYPOTHESIS** — must be tested; not treated as established fact.

### Confidence

- **High** — direct user evidence, strong replicated research, or authoritative
  technical/license documentation.
- **Medium** — grounded inference or defensible engineering judgment, but not yet
  validated in this product.
- **Low** — plausible hypothesis with meaningful uncertainty.

External research supports mechanisms such as retrieval and spacing. It does not
prove that this particular orchestration, interface, learner model, or business
will work. Those remain product hypotheses.

---

## 1. Evidence ledger

### 1.1 User evidence

**U1 — Original product vision.** The user wants one Japanese dictionary, kanji
dictionary, and Anki/SRS sentence-mining app, structured as a
"multi-dimensional, structured, recursive learning journey" that is fast,
efficient, scientifically grounded, fun, beautiful, and AI-native.

**U2 — Conversational adaptation.** The user wants AI conversation to develop a
precise understanding of the learner's Japanese and to create bifurcating and
trifurcating learning journeys for deep memorization and immersion.

**U3 — Actual capture threshold.** The user said:

> "It is always, I don't know this perfectly and I don't want to lose it. Maybe I
> know the word or have heard it and the definition is close but if it's not
> instant and clear then I open the app and save it."

This is evidence that the dominant state is often partial knowledge or
non-automatic knowledge, not a binary unknown.

**U4 — Dictionary behavior.** The dictionary is the user's dominant capture tool.
The user values definitions, translations, kanji, stroke order, compounds, and
interconnectivity. The user almost never reviews there; its study experience is
boring. Monthly lists are merely convenient inboxes. The user reports an
inability to export the desired vocabulary-only data into a contextual
sentence-mining workflow.

**U5 — SRS behavior.** The user has a separate Anki workflow with custom cards,
has not used it lately, but reports loving it when used and noticing "big
gains." Screenshots show long, Japanese-rich thematic pages, highlighted target
language, clozes, and some audio rather than only atomic word/translation cards.

**U6 — Kanji behavior.** The user uses a separate kanji app frequently, values
kanji study, but experiences it as never finishing. Screenshots show isolated
meaning/on'yomi/kun'yomi prompts, compound-reading discrimination, progress
rings, and a persistent review count.

**U7 — Modality.** The user wants text and voice according to context, time, and
place; text should dominate initially, with richer voice interaction later.

**U8 — Rate and balance.** The user wants explicit review, natural resurfacing,
generated/contextual integration, and new learning together, at a
"hyper fast and hyper flexible iterative rate" that matches the learner in real
time with very little lag.

**U9 — Long-range goals.** Prior user-stated goals include JLPT N1 and unusually
deep kanji study extending toward Kanji Kentei. These are not proof of current
proficiency.

**U10 — Current material.** The screenshots include abstract and domain-rich
Japanese involving meditation, yoga, nature, psychology, education, and
yojijukugo. They demonstrate the materials the user chooses to study, not
controlled proof that every sentence is fully understood or producible.

### 1.2 Research and official-source evidence

**R1 — Retrieval practice.** Repeated retrieval improved delayed retention over
restudy in Roediger and Karpicke's experiments, although restudy could look
better on an immediate test:
[Roediger & Karpicke, 2006](https://doi.org/10.1111/j.1467-9280.2006.01693.x).

**R2 — Distributed practice.** A quantitative synthesis covering 839 assessments
in 317 experiments found robust spacing effects. Follow-up experimental work
showed that the best gap depends on the desired retention horizon:
[Cepeda et al., 2006](https://doi.org/10.1037/0033-2909.132.3.354);
[Cepeda et al., 2008](https://doi.org/10.1111/j.1467-9280.2008.02209.x).

**R3 — Context is not retrieval.** Informative contexts can help comprehension
during practice, but successful retrieval, especially with feedback, produced
better later word retention in the reported experiments:
[van den Broek et al., 2018](https://doi.org/10.1111/lang.12285).

**R4 — Contextual diversity and transfer.** Diverse contexts improved
generalization of learned meanings to unfamiliar contexts in an adult word
learning experiment, while repeated similar contexts could better support the
trained context:
[Norman et al., 2023](https://doi.org/10.1177/17470218221126976).

**R5 — Contrast/interleaving.** Interleaving has evidence for helping category
discrimination, but the result is task-dependent and the literature should not
be generalized into "interleave everything":
[Kornell & Bjork, 2008](https://doi.org/10.1111/j.1467-9280.2008.02127.x);
[Birnbaum et al., 2013](https://doi.org/10.3758/s13421-012-0272-7).

**R6 — FSRS model.** FSRS models unitary memories using difficulty, stability,
and retrievability; the current published algorithm documentation describes
FSRS-6:
[official algorithm documentation](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm).
The KDD work used large-scale review logs to model memory and optimize review
cost:
[Ye, Su & Cao, 2022](https://doi.org/10.1145/3534678.3539081).

**R7 — FSRS configuration.** Anki's official manual identifies desired retention
as the most important FSRS setting, uses 0.90 as the default balance, warns that
workload rises sharply at high retention, and says interval-changing add-ons
should not conflict with FSRS:
[Anki manual](https://docs.ankiweb.net/deck-options).

**R8 — AI judgment is fallible.** Research on LLM evaluators reports systematic
position and other biases; LLM judgments can be useful observations but should
not be treated as ground truth:
[Shi et al., 2024](https://arxiv.org/abs/2406.07791);
[Wataoka et al., 2024](https://arxiv.org/abs/2410.21819).
Research on automated scoring of language-learner writing likewise reports
model- and time-dependent reliability:
[Pack, Barrett & Escalante, 2024](https://doi.org/10.1016/j.caeai.2024.100234).

**R9 — Open dictionary data.** JMdict and KANJIDIC2 can be used commercially
under the EDRDG license when its conditions and attribution requirements are
met:
[EDRDG license](https://www.edrdg.org/edrdg/licence.html).

**R10 — Stroke-order data.** KanjiVG supplies SVG stroke shape, direction,
order, and component metadata under CC BY-SA 3.0:
[KanjiVG official site](https://kanjivg.tagaini.net/).

**R11 — Open sentence data.** Tatoeba textual data is generally CC BY 2.0 FR
with a CC0 subset; audio licenses vary by contributor and must be tracked
individually:
[Tatoeba downloads](https://tatoeba.org/en/downloads).

**R12 — Local-first feasibility.** Expo supports universal React Native routes;
Expo SQLite persists a queryable database across app restarts on supported
native platforms and supports FTS configuration:
[Expo Router](https://docs.expo.dev/router/introduction/);
[Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).
Expo's web SQLite support is explicitly alpha, so native and web persistence
cannot be assumed identical.

**R13 — Japanese analysis candidate.** Sudachi supports Japanese segmentation,
part-of-speech tagging, normalization, and multiple segmentation granularities,
under Apache 2.0; its current repository warns that releases can contain
breaking changes, so versions must be pinned:
[Sudachi official repository](https://github.com/WorksApplications/Sudachi).

**R14 — Anki portability.** Anki imports text and packaged deck files, and its
collection/deck formats can preserve different subsets of notes, media, and
scheduling data:
[Anki importing](https://docs.ankiweb.net/importing/intro.html);
[AnkiMobile collection transfer](https://docs.ankimobile.net/collection-transfer.html).

**R15 — Feedback, transfer, and response time.** Retrieval can improve transfer
to changed questions, failed retrieval can still support learning when followed
by corrective feedback, and accuracy-plus-response-time scheduling has improved
practice efficiency in studied settings:
[Butler, 2010](https://doi.org/10.1037/a0019902);
[Kornell et al., 2009](https://doi.org/10.1037/a0015729);
[Mettler et al., 2016](https://doi.org/10.1037/xge0000170).
These findings do not make raw latency a pure memory measure: prompt length,
typing method, device, hints, and interruption can confound it.

**R16 — Grammar interleaving.** Interleaving has direct evidence in second-
language grammar learning in one studied setting, with prior knowledge
moderating the result:
[Nakata, 2019](https://doi.org/10.1111/modl.12581).
This supports testing grammar and confusable constructions as first-class
practice objects. It does not establish that all Japanese content should be
interleaved or prescribe one universal blocked/interleaved sequence.

**R17 — Content licenses are operational requirements.** The current EDRDG
license is CC BY-SA 4.0 and requires attribution and a regular update procedure;
public accessibility does not make web/video text freely redistributable:
[EDRDG license](https://www.edrdg.org/edrdg/licence.html);
[YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies-guide).

---

## 2. Non-negotiables and preferences

### 2.1 Non-negotiables

1. **[USER-STATED | NON-NEGOTIABLE] One continuous system.** Dictionary,
   kanji, mining, SRS, immersion, and AI conversation must share learning state.
   They cannot remain adjacent mini-apps with separate notions of "known."
   **Evidence:** U1, U4–U6. **Confidence:** High.

2. **[USER-STATED | NON-NEGOTIABLE] Fast capture and low-lag use.** A lookup or
   save must never wait for a full AI response. Canonical search and saving
   should work locally; enrichment may arrive asynchronously.
   **Evidence:** U3, U8. **Confidence:** High.

3. **[JOINT | NON-NEGOTIABLE] Partial knowledge is first-class.** The system
   must not reduce words or kanji to known/unknown.
   **Evidence:** U3. **Confidence:** High.

4. **[USER-STATED | NON-NEGOTIABLE] Both review and immersion.** The product
   must include deliberate SRS, new material, contextual integration, and
   natural resurfacing. It may not ideologically replace Anki-like retrieval
   with passive reading or conversation.
   **Evidence:** U5, U8; R1–R4. **Confidence:** High.

5. **[USER-STATED | NON-NEGOTIABLE] AI-native conversation.** Conversation is
   a primary surface for diagnosis, explanation, practice, and journey
   navigation—not a decorative chatbot tab.
   **Evidence:** U2, U7. **Confidence:** High.

6. **[JOINT | NON-NEGOTIABLE] Context and field-level provenance survive
   capture and transformation.** A learning thread should retain the sentence,
   source, modality, timestamp, relevant sense, and why uncertainty arose when
   available. Every imported, edited, or generated factual field must be able
   to retain its source, source version, license, attribution,
   modification status, and confidence/review status. Provenance-free
   canonical data is prohibited.
   **Evidence:** U3–U5; R9–R11, R17. **Confidence:** High.

7. **[JOINT | NON-NEGOTIABLE] Saving is not a promise to memorize.** Everything
   saved remains recoverable; only a subset is promoted to active retrieval.
   Promotion combines user control and system recommendation.
   **Evidence:** U3, the scale of U4, and the user's answer that selection should
   be "a mixture." **Confidence:** High.

8. **[JOINT | GUARDRAIL] Evidence before mastery claims.** AI fluency cannot
   silently mark a concept mastered or modify memory state as though it were
   direct recall.
   **Evidence:** U2's demand for precision; R8. **Confidence:** High.

9. **[JOINT | GUARDRAIL] User-owned, portable data.** The app needs usable
   import and export, including canonical entities, encounters, generated
   content, evidence, and review history where the external format permits it.
   **Evidence:** U4–U6; R14. **Confidence:** High.

10. **[USER-STATED | NON-NEGOTIABLE] The experience should be beautiful, fun,
    and immersive.** **Evidence:** U1, U4. **Confidence:** High.
    **[MY-PROPOSAL | GUARDRAIL]** Beauty should communicate learning structure
    and may not obscure precision, speed, or factual provenance.
    **Confidence:** High.

11. **[MY-PROPOSAL | GUARDRAIL] Grammar is a first-class learning
    object.** Constructions, constraints, register, confusions, encounters, and
    retrievable grammar components receive their own threads and evidence.
    Grammar may not survive only as incidental metadata attached to vocabulary.
    **Evidence:** U5's sentence-rich study style; R16; competitive evidence from
    Bunpro and Renshuu. **Confidence:** High for the boundary, medium for MVP
    depth.

### 2.2 Reversible preferences

1. **[MY-PROPOSAL | PREFERENCE] Native-first Expo/React Native client.**
   **Confidence:** Medium.
2. **[MY-PROPOSAL | PREFERENCE] SQLite locally; Postgres remotely.**
   **Confidence:** Medium-high.
3. **[MY-PROPOSAL | PREFERENCE] FSRS-6 for explicit retrieval timing.**
   **Confidence:** High for v1, reversible if comparative data later supports
   another scheduler.
4. **[MY-PROPOSAL | PREFERENCE] A local constellation/garden as the visual
   metaphor, not a permanently exposed global graph.**
   **Confidence:** Medium-low pending visual testing.
5. **[MY-PROPOSAL | PREFERENCE] Text-first; voice and pronunciation assessment
   later.**
   **Confidence:** High because U7 explicitly prioritizes text now.
6. **[MY-PROPOSAL | PREFERENCE] Me-first advanced learner focus rather than
   beginner onboarding.**
   **Confidence:** High for initial scope; general product positioning remains
   open.

---

## 3. Thesis

### 3.1 Product thesis

**[JOINT | NON-NEGOTIABLE]**

This is a personal Japanese memory and immersion system that preserves the
continuity between encountering something, understanding it, connecting it,
retrieving it, and using it. It maintains an evidence-backed model of both
Japanese and this learner, then composes the next smallest useful experience:
a lookup, contrast, kanji exploration, recall prompt, thematic passage, or
conversation.

The single failure it exists to fix is **state fragmentation**. Existing tools
can be excellent at reference, mining, SRS, reading, or kanji, and several
already combine multiple features. But the user's actual state—what sense was
uncertain, where it was encountered, which ability is weak, what later evidence
changed that judgment—fractures across apps, lists, decks, and curricula.

**Evidence:** U1–U8 and the current competitor evidence in Section 13.  
**Confidence:** High that this describes the user's problem; medium that solving
it will produce sufficient daily value.

### 3.2 Product promise

> Nothing meaningful you encounter is lost; not everything becomes homework;
> what does become practice returns in the right form, context, and intensity.

### 3.3 What it is not

- Not a chat interface pasted onto JMdict.
- Not three tabs called Dictionary, Kanji, and Flashcards.
- Not a universal "Japanese level" score.
- Not an AI deciding that polished output equals mastery.
- Not an infinite due-count treadmill.
- Not a replacement for authentic Japanese.
- Not a claim that generated prose is equivalent to native-edited material.

---

## 4. Core data model

### 4.1 Structural metaphor

**[JOINT | NON-NEGOTIABLE] User-facing metaphor: a learning thread.**

Every capture creates or extends a **learning thread**, not a card. A thread
preserves one continuity of concern: the encountered word/sense, expression,
kanji, construction, confusion pair, or sentence and how the learner's relation
to it changes.

**[MY-PROPOSAL | PREFERENCE] Structural model: typed knowledge graph + immutable
evidence timeline + dynamically compiled journey graph.**

- A list cannot express many-to-many relations.
- A deck makes a presentation artifact the unit of memory.
- A tree cannot represent senses, shared kanji, confusables, or journeys that
  branch and later rejoin.
- A pure graph lacks temporal evidence.
- A pure timeline lacks semantic structure.

Therefore the conceptual model combines:

1. a typed graph of Japanese knowledge;
2. an append-only timeline of learner evidence;
3. derived learner states;
4. temporary journey plans compiled from the first three.

**Evidence:** U1–U6; product reasoning.  
**Confidence:** High for the conceptual model; medium for the exact schema.

### 4.2 Principal entities

| Entity | Purpose |
|---|---|
| `Lexeme` | Dictionary headword and accepted written/reading forms |
| `Sense` | A specific meaning/use, not a bag of translations |
| `Kanji` | Character identity and canonical metadata |
| `Component` | Visual/structural component; distinct from historical etymology |
| `Reading` | Reading linked to character, lexeme, and actual usage |
| `GrammarConstruction` | Form, constraints, meaning, and register |
| `Expression` | Idiom, collocation, yojijukugo, fixed or semi-fixed phrase |
| `ConfusionSet` | Similar meanings, forms, readings, or usage boundaries |
| `Source` | Origin, rights status, URL/timecode/file reference, attribution |
| `ProvenanceRecord` | Field/artifact source version, license, attribution, modification, confidence, and review state |
| `Encounter` | Exact user event: text span, sentence, audio interval, image, conversation |
| `LearningThread` | User-owned continuity wrapper around a target and its encounters |
| `KnowledgeComponent` | Sparse target/sense capability that the learner may know to some degree |
| `RetrievalContract` | Stable scorable cue→response contract: target component, retrieval direction/skill, cue and response modalities, accepted responses/rubric, hint/reveal policy, and prompt-family version |
| `EvidenceEvent` | Immutable observation with method, result, latency, hints, provenance, confidence |
| `MemoryState` | Derived scheduling state for one stable retrieval contract |
| `LearnerState` | Derived broader competence estimate for a component/thread |
| `LearningExperience` | A rendered prompt, passage, explanation, conversation, or challenge |
| `JourneyPlan` | Temporary branching/rejoining plan with goals and budget |
| `Artifact` | Audio, image, stroke SVG, generated mnemonic, or imported media |

### 4.3 Important typed edges

- lexeme **HAS_SENSE** sense;
- lexeme **WRITTEN_WITH** kanji;
- lexeme **HAS_READING** reading;
- sense **CONTRASTS_WITH** sense;
- expression **CONTAINS** lexeme/grammar;
- kanji **HAS_COMPONENT** component;
- component **MAY_FUNCTION_AS_PHONETIC_IN** kanji, only when sourced;
- canonical or generated field **SUPPORTED_BY** provenance record;
- encounter **INSTANTIATES_SENSE** sense;
- thread **BEGAN_WITH / REENCOUNTERED_IN** encounter;
- evidence **MEASURES** knowledge component;
- retrieval contract **TESTS** knowledge component;
- memory state **SCHEDULES** retrieval contract;
- experience **TARGETS** component and **EXPOSES** others;
- journey **REQUIRES / OFFERS / REJOINS** threads.

### 4.4 Relational implementation, graph behavior

**[MY-PROPOSAL | PREFERENCE] Do not introduce a graph database in v1.**

Implement canonical entities and typed edges in SQLite/Postgres tables, with
foreign keys, indexes, and an append-only evidence table. The UI and domain
logic can behave graphically without taking on Neo4j-style operational
complexity. Add embeddings only for bounded retrieval tasks after lexical and
typed relations are working.

**Reasoning:** the first user's graph is modest; most important queries are
bounded neighborhoods, due-item selection, source history, and exact lexical
search. Relational storage provides simpler offline replication and data
portability.  
**Confidence:** High for v1.

### 4.5 Derived state, not mutable truth

Learner and memory states should be recomputable from evidence events plus
versioned model parameters. AI explanations, ratings, and generated content are
artifacts with provenance, not silent mutations to canonical data.

Canonical values are not assumed to share one source merely because they appear
on one page. A headword, sense gloss, frequency, pitch claim, component
analysis, example, and historical claim may each have a different
`ProvenanceRecord`.

**[MY-PROPOSAL | GUARDRAIL]** This event-sourced boundary enables audit,
recalibration, import repair, and correction after a bad model judgment.
**Confidence:** High.

Corrections append supersession events rather than rewriting history. Privacy
deletion uses tombstones for sync followed by a real purge path for the user's
content. Sync events require stable IDs, idempotency keys, causal ordering, and
explicit conflict records. Canonical source releases are immutable snapshots;
stable internal IDs map old source identifiers/senses to new versions with
reviewable remapping events. Append-only auditability is not an excuse to make
user data undeletable.

---

## 5. Learner model

### 5.1 Unit and granularity

**[JOINT | NON-NEGOTIABLE]** The system models knowledge sparsely at two linked
levels:

> target entity/sense capability + stable retrieval contract

The retrieval contract keeps independent axes explicit: retrieval
skill/direction, cue modality, response modality, accepted-answer rubric, and
hint/reveal policy. This avoids counting an audio→meaning task as the same
memory as orthography→reading merely because both concern one word.

It does **not** instantiate every possible cross-product. It creates a
`KnowledgeComponent` only when a target matters or evidence arrives.

Examples:

- `演習 / sense=drill-or-practical-exercise / contextual comprehension`
- `演習 / orthography→reading`
- `演習 / productive retrieval in formal register`
- `城 / recognition`
- `城 / writing`
- `城内 / compound reading`
- `何気なく vs さりげなく / discrimination`

**Evidence:** U3–U6.  
**Confidence:** High for the need; medium for the optimal number of dimensions.

### 5.2 Initial learner-facing capability labels

These are useful product labels, not assumed to be mathematically orthogonal
axes:

1. **Written recognition:** form → identity/familiarity.
2. **Reading retrieval:** orthography → kana/pronunciation.
3. **Aural recognition:** audio → form/meaning.
4. **Sense comprehension:** contextual form → intended sense.
5. **Meaning recall:** form → meaning without enough context to infer it.
6. **Productive lexical retrieval:** intended meaning/context → expression.
7. **Usage and register:** collocation, appropriateness, nuance, formality.
8. **Discrimination:** separation from a named confusable.
9. **Kanji construction:** component awareness and form discrimination.
10. **Handwriting/stroke sequence:** only when the learner activates it.

For MVP, labels 1–6 are surfaced; 7–10 can initially be tagged evidence without
a fully optimized scheduler. Scheduling remains per `RetrievalContract`, not
per broad label.

### 5.3 Evidence hierarchy

**[MY-PROPOSAL | GUARDRAIL]**

| Tier | Observation | Weight and use |
|---|---|---|
| A | Direct constrained retrieval with a known answer; result, latency, hints | Strong evidence; may update FSRS |
| A | Typed reading/meaning, cloze, forced discrimination, verified handwriting | Strong evidence for that exact component |
| B | Constrained production with explicit target and versioned rubric | Moderate evidence; can update learner state, conservatively |
| C | Free conversation or writing judged by an LLM | Candidate evidence only until calibrated or corroborated |
| C | Lookup behavior, dwell, reopening, self-reported uncertainty | Diagnostic evidence; never mastery by itself |
| D | Passive appearance in a passage or conversation | Exposure only; does not count as successful retrieval |

This preserves the immersive experience while preventing a long passage from
becoming one scientifically incoherent card rating.

**Evidence:** U5; R1, R3, R8.  
**Confidence:** High for the hierarchy; low-to-medium for initial weights.

### 5.4 Updating the model

1. Record the evidence event.
2. Resolve which component(s) it actually measured.
3. Update FSRS only for explicit, correctly classified retrieval events.
4. Update broader learner-state estimates with tiered evidence weights.
5. Store model version and confidence.
6. Compare predictions with subsequent direct probes.
7. Permit user correction ("I knew the meaning; I missed only the reading").

**[MY-PROPOSAL | HYPOTHESIS]** Begin with interpretable evidence-weighted rules
and per-contract FSRS rather than Bayesian knowledge tracing or a neural learner
model. Accumulate real usage data before adding a more complex posterior model.

**Reasoning:** a sophisticated cold-start model can create false precision.
**Confidence:** High for MVP simplicity; medium long-term.

### 5.5 No global scalar

The UI may summarize learning health, but it must not claim a universal
"Japanese level 73." It can say:

- reading evidence is strong for N2-like material in selected domains;
- aural evidence is sparse;
- 46 active threads have fragile reading recall;
- usage discrimination is uncertain for a particular synonym family.

**[MY-PROPOSAL | GUARDRAIL]**  
**Evidence:** U3 and the uneven evidence described in Section 14.  
**Confidence:** High.

---

## 6. Memory and scheduling system

### 6.1 Core scheduler

**[MY-PROPOSAL | PREFERENCE] Use FSRS-6 as the v1 timing engine for stable,
explicit retrieval contracts.**

FSRS supplies a tested, open, local-capable model of difficulty, stability, and
retrievability. It is preferable to inventing an opaque "AI SRS" before the app
has data.

**Evidence:** R2, R6, R7.  
**Confidence:** High for v1.

This is an engineering choice, not a claim that FSRS is experimentally proven
to maximize Japanese ability. Its large-scale support is principally predictive
and observational. Use a version-pinned implementation, keep the raw event log,
and retain the ability to replay events under a later scheduler.

### 6.2 AI override boundary

**[MY-PROPOSAL | GUARDRAIL] AI may not:**

- directly rewrite stability, difficulty, retrievability, or review history;
- invent a due date because a conversation "felt good";
- count passive exposure as successful recall;
- merge multiple distinct abilities into one rating;
- silently change desired retention.

**AI may:**

- nominate a saved thread for passive, active, or mastery priority;
- propose the next cue type or context from an eligible set;
- compose an integration experience around items selected by deterministic
  rules;
- flag suspected confusions;
- ask a diagnostic probe;
- recommend a priority change with a visible reason.

The user may pin, park, or reprioritize a thread. The scheduler still computes
the interval for each explicit memory component.

A lookup is logged as a **fluency-friction event** and may schedule a later
probe. It is neither a successful review nor automatically an `Again`.
Only a genuine retrieval attempt updates the long-term memory trace:

- **Again:** unaided recall failed, or any part of the answer was revealed
  before recall;
- **Hard:** correct without hints/reveal but with serious effort;
- **Good:** correct without help;
- **Easy:** exceptionally effortless, preferably confirmed by the user rather
  than inferred from speed alone.

Hints, reveals, and immediate retries remain in the raw evidence. A successful
retry after revelation is useful practice but is not recorded as an independent
successful long-term review. A dynamic passage or conversation may update FSRS
only when it preserves the contract's cue direction, modalities, rubric, and
hint policy; otherwise it records broader learner evidence or exposure.

**Evidence:** R7, R8 and U5's demonstrated value from SRS.  
**Confidence:** High.

### 6.3 Three promotion states

**[MY-PROPOSAL | PREFERENCE]**

1. **Keep** — retain and resurface opportunistically; no mandatory SRS.
2. **Learn** — activate selected recognition/reading/sense components in FSRS.
3. **Master** — add stronger production, discrimination, and optionally
   handwriting dimensions with a higher workload budget.

The default save action is **Keep**. The app can nominate Learn/Master; the user
can change state in one gesture. Repeated natural encounters or persistent
lookup friction can trigger a nomination, not an automatic irreversible
promotion.

**Evidence:** U3, U4, user's requested mixture of automation and control.  
**Confidence:** Medium-high; labels require UX testing.

### 6.4 Desired retention

Start near the FSRS default and expose priority rather than a technical
retention slider. Tentative internal targets:

- normal active learning: around 0.90;
- pinned/high-value items: modestly higher;
- low-value material: remain passive rather than forcing very low-retention SRS.

Exact tier values are not frozen and must be simulated against workload.
Values near 1.0 are explicitly rejected because official Anki guidance warns
that workload rises sharply.

There is no scientifically established universal perfect review/new/integration
ratio. That balance is a transparent product policy to be tested against this
learner's workload and outcomes, not something the AI can discover from fluent
conversation alone.

**[MY-PROPOSAL | HYPOTHESIS]**  
**Evidence:** R7.  
**Confidence:** Medium.

### 6.5 Session orchestrator

The session orchestrator is separate from the item scheduler.

Given a time, energy, and modality budget, it composes a finite session from:

1. **reactivation** — the most valuable fragile items;
2. **precision** — short direct retrieval;
3. **expansion** — a bounded amount of new material;
4. **integration** — a passage or conversation containing several threads;
5. **transfer** — one changed context or confusable;
6. **closure** — a clear ending and optional next branch.

**[MY-PROPOSAL | PREFERENCE]** Every session ends even though Japanese does
not.

The primary screen should say what can be stabilized in the chosen budget, not
lead with an unbounded due count. Full backlog/memory-health data remains
available; it is not hidden.

**Evidence:** U6, U8.  
**Confidence:** High for finite sessions; medium for the exact composition.

### 6.6 Real-time adaptation

Within a session, observable signals may change **presentation and selection**:

- correctness and response time;
- hint use and confidence;
- repeated near-misses;
- skip/dwell patterns;
- recent authentic encounters;
- boredom signals such as very fast correct responses;
- available audio/quiet context;
- user-requested depth.

They do not rewrite memory truth without an evidence event. A future contextual
bandit may optimize presentation choice, but v1 uses transparent rules.

Within-session retries may use an ARTS-inspired combination of accuracy and
response time, kept separate from FSRS long-term state. Latency is auxiliary
and comparable only across constrained tasks after accounting for prompt
length, input method, hint use, device, and interruption. It is never a
standalone mastery signal.

**[MY-PROPOSAL | HYPOTHESIS]** The system can learn a better new/review/
integration mixture from this feedback without destabilizing FSRS.
**Evidence:** R15. **Confidence:** Medium-low until tested.

### 6.7 Correction to an earlier position

An earlier conversational proposal described explicit flashcards as a
"treatment of last resort." **That is not part of this frozen v1.** U5 provides
direct user evidence that custom Anki SRS is loved and produces noticeable
gains. The current decision is:

> Explicit retrieval is a protected core; passive/contextual integration
> surrounds it and prevents it from becoming sterile or disconnected.

---

## 7. Content pipeline: mining, ingestion, and generation

### 7.1 Source priority

**[MY-PROPOSAL | PREFERENCE]**

1. User's authentic encounters.
2. Licensed canonical lexical/kanji data.
3. Licensed, provenance-tracked example corpora.
4. User-owned or user-supplied text/audio/images for private analysis.
5. AI-generated bridging material, visibly labeled.

AI generation should fill pedagogical gaps; it should not replace authentic
Japanese or canonical reference data.

Every value entering the system carries, where applicable: `source`,
`source_version`, `license`, `attribution`, `modification_status`,
`confidence`, and `review_status`. This applies at field level when one entry
combines claims from different sources.

### 7.2 Capture pipeline

1. Accept word, phrase, sentence, pasted text, link, image, or conversation span.
2. Save the raw encounter immediately, offline where possible.
3. Normalize and tokenize asynchronously.
4. Link candidate lexeme(s), sense(s), kanji, grammar, and source.
5. Infer the likely uncertainty dimension from the lookup path and subsequent
   behavior.
6. Ask one small clarification only if the ambiguity materially changes the
   thread.
7. Keep by default; nominate Learn/Master if warranted.
8. Generate or retrieve the next useful experience only on demand or in a
   session budget.

**[JOINT | NON-NEGOTIABLE]** AI latency may not block steps 1–2.
**Evidence:** U3, U8. **Confidence:** High.

### 7.3 Candidate canonical sources

| Data | v1 candidate | Boundary |
|---|---|---|
| Words/senses/readings/POS | JMdict | CC BY-SA 4.0; preserve attribution and maintain a regular update procedure |
| Kanji/readings/metadata | KANJIDIC2 | Same |
| Stroke order/components | KanjiVG | CC BY-SA 3.0; attribution/share-alike analysis required for derivatives |
| Japanese tokenization | Version-pinned Sudachi | Pin version; test segmentation; tokenizer output is not sense truth |
| Example sentences | Filtered Tatoeba subset | Attribute text; track review/native metadata; audio per-file license |
| User Anki | TSV first, package/history later | Preserve original fields, source, media refs, and import report |

**Evidence:** R9–R14.  
**Confidence:** High that these can seed a personal alpha; medium on final
commercial composition pending a formal license review.

### 7.4 Web, YouTube, books, and paid media

**[MY-PROPOSAL | GUARDRAIL]**

- Me-first alpha accepts text or small excerpts the user supplies and stores
  them privately with a source pointer.
- Do not scrape, download, or republish full copyrighted works by default.
- Store URL/timecode and the minimum excerpt needed for the user's thread.
- Use official playback/APIs for YouTube-linked material; do not scrape
  subtitles, rip audio/video, or build a cached caption corpus without the
  relevant authorization.
- Rights-expired Aozora Bunko works may later seed literary experiences, but
  each work's rights status and credits must be verified and its literary/era
  bias must not be mistaken for a general usage baseline.
- Product launch requires source-by-source terms and copyright review.
- "Personal use" is not treated as a magical license exemption.

**Confidence:** High as a conservative boundary.

### 7.5 Generated content

Generation has two layers:

1. **Grounded payload:** target sense, required forms, forbidden confusions,
   learner constraints, source facts, register, and difficulty.
2. **Rendered experience:** sentence, passage, dialogue, explanation, cloze,
   or branching conversation.

Every generated item stores:

- model/provider/version where available;
- prompt/template version;
- target entities and senses;
- generated timestamp;
- automated checks;
- user corrections;
- status: generated, reviewed, or canonical.

**[MY-PROPOSAL | GUARDRAIL]** Generated Japanese is always distinguishable from
authentic or human-edited Japanese.

### 7.6 Validation

For a me-first alpha:

- deterministic checks for required target form and cloze integrity;
- dictionary/sense consistency checks;
- a separate structured naturalness/usage critique;
- easy user reporting and correction;
- never generate factual etymology.

For a product:

- sampled native-speaker review and measured error rate;
- a gold evaluation set for common failure classes;
- blocking rules for ambiguous or low-confidence generation;
- provenance visible in the UI.

A second LLM pass can reduce some errors but is not independent proof.

**Evidence:** U5's AI-like prose and R8.  
**Confidence:** High for the boundary; medium for achievable quality.

### 7.7 Thematic integration

The user's Anki evidence suggests value in rich thematic "worlds": meditation,
philosophy, nature, travel, AI, and other personally meaningful domains.

The system should:

1. encode a target in a familiar, compelling world;
2. retrieve it directly;
3. contrast it where needed;
4. later transfer it to a different context.

The same passage may expose many targets, but only explicit retrieval events
receive strong memory updates.

**[JOINT | PREFERENCE]**  
**Evidence:** U5, U10; R3, R4.  
**Confidence:** Medium-high.

---

## 8. Role of AI conversation

### 8.1 Conversation is a control surface

**[JOINT | NON-NEGOTIABLE]** AI conversation serves five roles:

1. **Initial mapper:** adaptively probes breadth without presenting a formal
   placement test.
2. **Contextual explainer:** answers the exact question behind a lookup.
3. **Practice partner:** creates meaningful use of active threads.
4. **Journey navigator:** offers two or three valuable branches and later
   rejoins them.
5. **Evidence proposer:** emits structured candidate observations about the
   learner, never unreviewable mastery claims.

### 8.2 Conversation-first and capture-first are two doors

The initial session may begin with text conversation to form a provisional
learner map. Daily use may more often begin with capture. Both update the same
threads and evidence log.

**[JOINT | PREFERENCE]** Do not force a single permanent home-screen mode. The
app can open to the last/relevant context and expose a fast universal capture
action.

**Evidence:** U2, U3, U7.  
**Confidence:** High.

### 8.3 How conversation becomes evidence

Free conversation alone is insufficient. The AI can insert lightweight probes:

- ask the learner to choose between two near-synonyms;
- request a paraphrase with a target expression;
- remove enough context to require retrieval;
- ask for a reading;
- return later with a changed context.

Each probe declares in advance what component it measures and how it will be
scored. Free-form judgments remain Tier C until corroborated.

### 8.4 Calibration loop

**[MY-PROPOSAL | GUARDRAIL]**

1. Store AI prediction and confidence.
2. Later administer a constrained reference probe.
3. Compare predicted probability with observed recall.
4. Track calibration by component type and rubric version.
5. Down-weight or disable judges that are miscalibrated.
6. Let the user inspect and correct consequential inferences.

The AI should be able to say:

> "I have strong evidence you recognize this in writing, but little evidence
> that you understand it in speech."

**Evidence:** R8.  
**Confidence:** High for the need; medium for a useful amount of calibration
data in a single-user alpha.

### 8.5 Correction style

The user wants context-sensitive text now and voice later, but has not chosen a
default correction style. The app should eventually support:

- immediate explicit correction;
- subtle recast;
- delayed error digest;
- "flow mode" with only meaning-blocking intervention.

This remains open and may be learned per context.

---

## 9. Visual dimension: kanji art, stroke order, and etymology

### 9.1 Truth layers must be visually separate

**[MY-PROPOSAL | GUARDRAIL]** A kanji visual has three explicitly labeled
layers:

1. **Form and stroke order — factual/canonical.**
2. **Structure and sourced history — factual with citations and uncertainty.**
3. **Memory scene — mnemonic, imaginative, not etymology.**

Generated art may inhabit layer 3 only. It may visually reuse verified
components, but the interface must not imply that the picture is the historical
origin of the character.

**Confidence:** High.

### 9.2 Stroke order

Use deterministic vector paths from a licensed source such as KanjiVG. Support:

- whole-character animation;
- step forward/back;
- component highlighting;
- tracing;
- later freehand comparison;
- print/handwritten/font variants where sourced.

**[MY-PROPOSAL | PREFERENCE]** Stroke consultation is in the daily MVP;
handwriting recognition is deferred until the user's desired role for writing
is answered.

**Evidence:** U4, U6, R10.  
**Confidence:** High.

### 9.3 Components, radicals, and phonetics

The UI must distinguish:

- dictionary radical;
- visible component;
- mnemonic label;
- phonetic function;
- historical form.

They are not interchangeable. "Looks like" relations may be useful but must not
be labeled etymology.

**[MY-PROPOSAL | GUARDRAIL]**  
**Confidence:** High.

### 9.4 Etymology

No sufficiently vetted and licensed etymology source has yet been selected.
Therefore:

- v1 may show sourced component structure and canonical metadata;
- historical claims are deferred or linked to an identified source;
- AI may summarize a cited source but may not originate the claim;
- disputed analyses show attribution and uncertainty.

**[MY-PROPOSAL | GUARDRAIL]**  
**Confidence:** High.

### 9.5 Consistent generated art

If mnemonic art is admitted later:

1. maintain an art bible: palette, lighting, framing, material, line weight,
   emotional tone, and forbidden motifs;
2. maintain stable reference assets for recurring components;
3. use an asset registry so the same approved component is reused;
4. store generation metadata and variants;
5. require human approval before an image becomes a shared canonical mnemonic;
6. allow personalized variants without replacing the approved base asset.

**[MY-PROPOSAL | HYPOTHESIS]** Consistent art can make the graph emotionally
memorable without becoming visual noise.
**Confidence:** Low-medium until prototype testing.

### 9.6 Visual metaphor

The working metaphor is a calm local constellation or garden:

- the current thread is central;
- nearby known relationships are visible;
- fragile edges are faint;
- active branches are illuminated;
- the global graph is never dumped onto a phone screen.

This is a preference, not architecture canon.

---

## 10. Information design

### 10.1 General rule

**[JOINT | NON-NEGOTIABLE]**

> Full reference depth remains available; personal relevance determines what is
> visible first.

Static dictionary pages give every field roughly equal status. This app uses
progressive disclosure without deleting reference data.

### 10.2 Capture interaction

Target behavior:

1. search or receive shared text;
2. see the correct answer immediately;
3. tap once to Keep;
4. optionally indicate uncertainty with one gesture:
   `meaning · reading · use · kanji · not sure`;
5. continue the original activity;
6. allow enrichment to finish asynchronously.

The app can infer uncertainty from:

- whether the query was handwriting, reading, or English;
- which sections were opened;
- whether audio/stroke order was replayed;
- the source sentence and prior evidence.

Inference must remain editable.

### 10.3 Word page

#### Layer 0 — immediate answer

- written form and reading;
- audio when locally available;
- best candidate sense in this encounter;
- concise translation/Japanese gloss;
- Keep/Learn/Master state.

#### Layer 1 — personal context

- original encounter and source;
- "what appears uncertain" with confidence;
- one high-value explanation or contrast;
- recent related encounters;
- next useful actions.

#### Layer 2 — connected understanding

- other senses;
- collocations and register;
- confusables and near-synonyms;
- authentic examples;
- word family;
- constituent kanji and relevant compounds;
- pitch accent when a properly licensed source is selected.

#### Layer 3 — complete reference

- all JMdict fields and forms;
- conjugation;
- classifications;
- codes, frequency/JLPT labels with source caveats;
- attribution and provenance.

**Evidence:** U4 and the screenshots of 演/演習.  
**Confidence:** High.

### 10.4 Kanji page

#### Layer 0

- character;
- high-value meaning center;
- the actual reading in the encountered word;
- stroke animation;
- current personal state.

#### Layer 1

- encountered compounds ranked by personal relevance;
- common readings learned through those compounds;
- visible components;
- current weak dimension;
- one useful contrast with a similar character.

#### Layer 2

- broader reading families and compounds;
- sourced phonetic/semantic patterns;
- writing/tracing;
- local graph neighborhood;
- mnemonic image if enabled and clearly labeled.

#### Layer 3

- full KANJIDIC2 data;
- all readings and codes;
- school grade, frequency, JLPT/KanKen mappings with source provenance;
- sourced historical information.

### 10.5 Grammar-construction page

The first release does not need a complete grammar encyclopedia, but an
encountered construction must not disappear inside a sentence note.

- **Layer 0:** form, concise function/meaning, and the exact span in the
  encounter;
- **Layer 1 in MVP:** user notes and explicitly labeled AI-candidate parse/
  explanation, never presented as canonical fact;
- **Layer 2 after a factual source is selected:** sourced constraints,
  register, transformations, related constructions, confusables, and
  contrastive examples;
- **Layer 3:** complete sourced reference once an appropriate licensed grammar
  source is selected.

The construction can own recognition, interpretation, constrained production,
and discrimination components just as a lexical sense can.

### 10.6 Review and integration views

The user's Anki-like thematic passages should be preserved as **integration
canvases**, not stored as one indivisible card.

Inline interactions can:

- reveal a word;
- answer a cloze;
- play audio;
- mark "meaning known, reading missed";
- open the local thread;
- branch into a contrast or kanji dive;
- return to the exact place in the passage.

One visible experience can update many components, but only according to the
evidence hierarchy.

---

## 11. Platform, stack, and local/cloud split

### 11.1 Platform

**[MY-PROPOSAL | PREFERENCE]**

- **Primary:** iPhone, because that is the observed capture device.
- **Secondary:** web/desktop for long text, Anki migration, editing, and later
  browser mining.
- **Initial modality:** text.
- **Later:** native voice conversation, listening probes, OCR, and share
  extensions.

### 11.2 Client

**Expo / React Native / TypeScript with Expo Router.**

Why:

- one codebase can target iOS, Android, and web;
- native-first navigation and deep links;
- rapid iteration for the overnight vertical slice;
- local SQLite support on native;
- platform-specific modules remain possible.

Risk:

- Expo SQLite web support is alpha;
- a robust iOS Share Extension may require native code and should not be
  promised in the overnight slice.

**Evidence:** R12.  
**Confidence:** Medium-high.

### 11.3 Local data

**SQLite on device**, containing:

- precompiled lexical/kanji search tables;
- learning threads and encounters;
- evidence/review log;
- derived memory state;
- generated-content cache;
- pending sync operations;
- source/license metadata.

Dictionary search, save, browse, stroke viewing, and due review should work
offline. AI conversation and new generation may require network initially.

**[MY-PROPOSAL | NON-NEGOTIABLE implementation consequence of speed]**  
**Evidence:** U8, R12.  
**Confidence:** High for native.

### 11.4 Backend

**[MY-PROPOSAL | PREFERENCE]**

- Postgres for synchronized canonical/user data and typed relations.
- A small Python/FastAPI service for Japanese NLP, ingestion, and AI
  orchestration.
- Version-pinned Sudachi for tokenization candidates.
- Object storage for user-authorized media and generated artifacts.
- Server-held AI credentials; never ship provider secrets in the client.

Why Python: mature Japanese NLP and evaluation tooling.  
Why not Python for the whole client: iPhone-first UX and offline behavior.

**Confidence:** Medium.

### 11.5 Sync model

Local writes append events immediately. Cloud sync transfers immutable events
and content-addressed artifacts; derived state can be recomputed. Conflicts in
user annotations are retained rather than silently overwritten.

For the overnight slice and first single-device alpha, sync/auth may be absent.
The schema should not make later sync impossible.

**[MY-PROPOSAL | PREFERENCE]**  
**Confidence:** Medium.

### 11.6 AI boundary

Cloud AI receives only the minimum context needed for the requested operation,
subject to user settings. Raw private sources are not automatically used for
model training by this app. Provider retention and privacy terms require a
separate implementation-time review.

Core scheduling, canonical data, and evidence logs are provider-independent.
The AI adapter uses structured schemas so providers/models can be replaced.

**[MY-PROPOSAL | GUARDRAIL]**  
**Confidence:** High for architecture; implementation privacy depends on the
chosen provider.

### 11.7 No vector database in MVP

Use exact lexical search, normalized readings, typed edges, and full-text search
first. Add embeddings only for bounded tasks such as thematic retrieval or
finding semantically similar encounters, and always retain deterministic source
links.

**[MY-PROPOSAL | PREFERENCE]**  
**Confidence:** High.

---

## 12. MVP and phasing

### 12.1 Overnight vertical slice — prove the loop, not the whole product

**[MY-PROPOSAL | PREFERENCE]**

Build one honest end-to-end path:

> paste/select one seeded encounter → immediate saved thread → bounded AI
> explanation → one stable retrieval contract → one contextual reuse →
> scored probe → inspect/export the event

Scope:

- responsive Expo/web prototype plus native-ready project;
- single-device local persistence;
- a carefully labeled seed subset and one real user thread;
- one layered word page and one kanji page;
- one deterministic `RetrievalContract` and one version-pinned FSRS path,
  without generalized scheduling or parameter optimization;
- one integration canvas and one bounded/scripted AI exchange;
- one evidence log inspection and JSON export;
- clear labels for canonical versus generated content.

Success criteria:

- non-AI lookup/save feels immediate;
- the same thread survives entry, retrieval, contextual reuse, and the bounded
  exchange;
- a missed reading does not erase known meaning;
- no passive exposure is counted as recall;
- the user can complete and close a finite session;
- all personal data can be exported;
- the user wants to put a second real encounter through the loop.

The overnight build is a product experiment, not a launch-ready dictionary or
a scientifically validated tutor. Generalized imports, production conversation,
calibration, and a multi-item scheduler belong after this slice works.

### 12.2 Smallest genuinely daily-use MVP

This is larger than the overnight slice:

- complete licensed JMdict/KANJIDIC2 local search;
- KanjiVG stroke order;
- instant Keep/Learn/Master capture;
- source sentence retention;
- layered word/kanji pages;
- first-class grammar-construction threads for encountered spans, user notes,
  and labeled AI-candidate explanations; authoritative grammar reference waits
  for a selected licensed source;
- FSRS-6 explicit review;
- finite time-budgeted session;
- one thematic integration passage;
- basic text conversation grounded in active threads;
- TSV import from Anki and export back to open formats;
- provenance and correction;
- local single-device operation.

**Explicitly deferred:**

- voice conversation and pronunciation scoring;
- OCR/camera and production-grade iOS Share Extension;
- automated YouTube/web scraping;
- full `.apkg`/`.colpkg` review-history fidelity;
- full cross-device sync;
- AI-generated kanji art;
- unsourced etymology;
- handwriting recognition;
- complete Kanji Kentei curriculum;
- comprehensive grammar dictionary/curriculum;
- social/community/gamification economy;
- public marketplace and subscriptions;
- claims of learning efficacy.

### 12.3 Phase 2 — ingestion and calibrated conversation

- native share capture;
- OCR and audio/timecode encounters;
- richer text conversation with structured probes;
- calibration dashboard for AI judgments;
- confusable/contrast system;
- contextual integration compiled from multiple threads;
- optional cloud sync.

### 12.4 Phase 3 — kanji depth, voice, and visual memory

- handwriting and stroke assessment;
- living-literacy and systematic-mastery kanji tracks;
- voice/listening evidence;
- sourced phonetic families and etymology;
- consistent mnemonic-art pilot;
- KanKen-oriented deep mode.

### 12.5 Phase 4 — product validation

- native-speaker content QA;
- license and privacy review;
- controlled retention/transfer experiments;
- multi-user learner-model calibration;
- accessibility, cost, abuse, and safety work;
- positioning beyond the me-first user.

---

## 13. Competitive analysis

### 13.1 Honest framing

**[MY-PROPOSAL | GUARDRAIL]** We must not claim that no integrated Japanese
learning product exists. Several current products already combine dictionary,
kanji, contextual reading, SRS, or AI conversation. The gap is narrower and
more demanding:

> Can one system maintain a transparent, evidence-tiered learner state across
> all surfaces and compile the next experience from the user's actual
> encounters without sacrificing speed, truth, portability, or SRS rigor?

Whether no competitor does this well is a **market hypothesis**, not an
established fact.

### 13.2 Capability matrix

| Product | Officially documented or observed capability | Gap/opportunity relative to this thesis |
|---|---|---|
| [Japanese by Renzo](https://www.japaneseapp.com/features/) — the user's current dictionary | Fast offline lookup; rich definitions, kanji, stroke order, text analysis, lists, sharing/import, and built-in flashcard study | User reports dead inboxes, boring review, and that its available sharing/export does not provide the clean vocabulary-to-context workflow desired; do not overclaim that it has no export |
| Anki | Extremely flexible notes/cards, import/export ecosystem, FSRS, proven user value | Creation burden; card/deck becomes the unit; does not natively own a Japanese sense/kanji learner graph |
| Unconfirmed; screenshots resemble [Kanji Garden](https://apps.apple.com/us/app/kanji-garden-japanese/id1338967114) | Component sequencing, confusable testing, compound readings, and calm progress rings are visible in the screenshots | User experiences endless curriculum/reviews; state is isolated from captures and sentence use; identity must be user-confirmed before attributing other product features |
| [imiwa?](https://imiwaapp.com/) | Dictionary, kanji depth, analyzer/OCR, SRS, offline data, JMdict/KANJIDIC/KanjiVG/Tatoeba integration | Further proof that reference + kanji + SRS integration is established; compare workflow and current maintenance hands-on |
| [Nihongo](https://nihongo-app.com/) | Dictionary, clippings, contextual flashcards, kanji-in-context, photo/Safari capture | Very close functional competitor; differentiation must be deeper calibration, conversation, dynamic journeys, and open evidence—not feature count |
| [Renshuu](https://www.renshuu.org/) | Central word/kanji/grammar/sentence dictionaries and level-adaptive display | Also very close conceptually; requires hands-on comparison of learner-state granularity, export, conversation, and user-generated immersion |
| [Yomitan](https://yomitan.wiki/) | Near-zero-friction browser lookup, audio, frequency data, one-key Anki mining | Capture bridge rather than unified conversational learner model; desktop/browser weighted |
| [Migaku](https://migaku.com/) | Immersion mining, reader/video workflow, known-word tracking, integrated SRS | Strongest immersion workflow competitor; current differentiation claims require direct product testing |
| [jpdb](https://jpdb.io/) | Dictionary/SRS, global known-word state, pasted-text decks, prerequisite kanji, i+1 examples, media coverage estimates | Known-word continuity and content difficulty are established; proposed wedge must be finer evidence dimensions, encounters, conversation calibration, and portability |
| [WaniKani](https://knowledge.wanikani.com/getting-started/how-wanikani-works/) | Structured radical→kanji→vocabulary curriculum, mnemonics, SRS | Fixed curricular path rather than the learner's personal encounter graph; limited free branching |
| [Satori Reader](https://www.satorireader.com/features) | Human-authored stories, native audio, contextual definitions/annotations, flashcards, adaptive display | Excellent curated closed corpus; not primarily a universal capture/conversation/memory operating system |
| [Todaii](https://super.todaiinews.com/en) | News reading, one-tap lookup, flashcards, audio, AI chat and analysis | Broad feature overlap; needs hands-on quality/calibration/export comparison |
| [Bunpro](https://bunpro.jp/support/using-bunpro) | Deep grammar reference and manual-input grammar/vocab SRS | Grammar-centered rather than whole personal encounter graph |
| [MaruMori](https://preview.marumori.io/) | Visual/adventure progression across vocabulary, kanji, grammar, reading, SRS | Designed curriculum and game world rather than continuously mined personal graph; do not assume every advertised curriculum level is complete |

### 13.3 Proposed differentiation

1. **Sense/capability state measured through stable retrieval contracts**, not
   one known flag.
2. **Immutable evidence and calibrated AI judgments**, not opaque adaptation.
3. **Learning threads across every surface**, not copies in different modules.
4. **Dynamic journey compilation** from personal encounters.
5. **Exact SRS protected from generative AI**, combined with contextual
   integration.
6. **Canonical/generated/mnemonic truth boundaries.**
7. **Open import/export and provider-independent core.**

**Confidence:** Medium that this combination is distinct; low that it is a
commercial moat without hands-on competitor testing and user validation.

This matrix is documentation-based orientation, not exhaustive hands-on
testing. Feature availability, pricing, maintenance, and data portability can
change. Marketing efficacy claims are not treated as independent evidence.

---

## 14. What I learned about the user's current Japanese level

### 14.1 Defensible conclusion

**[MY-PROPOSAL | HYPOTHESIS]**

The user engages with advanced-intermediate through advanced written material,
has substantial vocabulary/kanji exposure, and reports a major automaticity
gap: many items are familiar but not instant, precise, or stable. Selected
study material shows exposure and aspiration, not tested comprehension. The
current evidence is insufficient to assign a reading band, global JLPT level,
or CEFR level.

**Confidence:** Medium for the exposure/automaticity description; exact
proficiency is unmeasured.

### 14.2 Specific supporting evidence

- saves items such as 審議, 封鎖, 飢える, 秘訣 and advanced expressions rather
  than only beginner vocabulary;
- deliberately studies yojijukugo and abstract Japanese passages;
- uses kanji readings, compounds, components, and stroke order;
- reports partial familiarity as the common capture state;
- aims at JLPT N1 and deep KanKen study;
- prefers mostly Japanese-rich contextual materials.

### 14.3 What the evidence does not show

- controlled reading comprehension accuracy;
- listening level;
- spontaneous speaking;
- productive vocabulary;
- pitch/pronunciation;
- grammar accuracy under pressure;
- whether the long Anki pages are read fully or recognized through highlights;
- an actual JLPT score.

Therefore the product must begin with a provisional, multidimensional map and
earn confidence through use.

---

## 15. Known weaknesses and skeptical attacks

### 15.1 Scope collapse

This is at least five mature products—dictionary, reader/miner, SRS, kanji
tutor, AI conversation—plus a data platform. An "all-in-one" build can easily
be mediocre everywhere.

**Mitigation:** one vertical loop, aggressive deferral, reuse open data and
FSRS, prove daily return before broadening.

### 15.2 The adaptive learner model may be false precision

Sparse evidence may not support the detailed state the UI implies. Incorrect
adaptation will feel uncanny or annoying.

**Mitigation:** evidence tiers, visible uncertainty, direct probes, calibration,
user correction, and no global scalar.

### 15.3 AI-generated Japanese may teach subtle errors

Fluent generation can be unnatural, register-inappropriate, or semantically
wrong—the exact failures an advanced learner is trying to eliminate.

**Mitigation:** canonical grounding, source labels, deterministic checks,
native-speaker QA before product claims, authentic content priority.

### 15.4 The graph may be intellectually beautiful but operationally useless

Users may not want to navigate a knowledge graph. A global visualization can
become decorative complexity.

**Mitigation:** graph is the data model; the UI exposes only a small local
neighborhood when it helps a decision.

### 15.5 Dynamic sessions may reduce trust

Anki's predictability is part of its strength. If the app constantly changes
mode, the user may feel manipulated or unable to finish a known task.

**Mitigation:** FSRS timing remains deterministic; session recipe and time
budget are visible; user can choose precision, immersion, or mixed mode.

### 15.6 "No backlog shame" can become dishonest hiding

Due material still decays whether or not a number is shown.

**Mitigation:** lead with a finite plan, but expose memory health, deferrals,
and consequences on demand.

### 15.7 Context can create familiarity without retrieval

Long rich passages can feel productive while allowing targets to be inferred.

**Mitigation:** preserve integration canvases but include direct retrieval and
track exposure separately, following R3.

### 15.8 Too many dimensions create sparse data and review multiplication

Meaning, reading, sound, use, writing, and discrimination can turn one word
into many cards.

**Mitigation:** instantiate only observed/goal-relevant components; promote
dimensions progressively; do not schedule all dimensions for all items.

### 15.9 Content and license complexity

Dictionary, stroke, audio, corpus, web, book, and Anki media rights differ.

**Mitigation:** source registry and field/artifact-level license metadata from
day one; conservative private-ingestion boundary; formal launch review.

### 15.10 Migration may import garbage

Legacy cards can contain duplicates, bundled prompts, missing sources, and
unreliable generated language. Review histories may not map cleanly to new
components.

**Mitigation:** lossless raw import, mapping report, quarantine/preview,
historical evidence confidence, never silently reinterpret.

### 15.11 Local-first has real engineering cost

Search assets, migrations, sync, encryption, and model caches are harder than a
simple cloud CRUD app.

**Mitigation:** one device/no auth first; append-only event design; native
offline core because latency is a user non-negotiable.

### 15.12 Me-first may overfit

A system designed around one motivated, abstract-topic, N1/KanKen-aspiring user
may confuse beginners.

**Mitigation:** embrace me-first honestly; only generalize after observing other
learners.

### 15.13 Research does not validate the complete product

Retrieval and spacing evidence do not prove that AI branching, generated
passages, art, or a graph improve learning.

**Mitigation:** measure direct retention, transfer, time cost, calibration, and
voluntary use; delete features that fail.

### 15.14 Rich prompts can corrupt the scheduler's unit of memory

FSRS assumes relatively clean, meaningful review traces. If a conversation,
passage, or bundled Anki page is collapsed into one rating, the estimated state
does not correspond to a stable cue–response ability.

**Mitigation:** one visible experience may produce several observations, but
only declared, genuinely attempted components update long-term memory; keep raw
events and replayable scheduler versions.

### 15.15 Variation and difficulty can arrive too early

Changed contexts and interleaving can support transfer or discrimination, but
constant novelty can suppress successful retrieval before a foothold exists.
"Desirable difficulty" is not permission for continual struggle.

**Mitigation:** establish an initial successful retrieval, then vary context;
use attainable hints and corrective feedback; test transfer on held-out
authentic Japanese rather than only more generated material.

---

## 16. Riskiest assumption

**[MY-PROPOSAL | HYPOTHESIS]**

The riskiest assumption is that the system can infer and maintain the learner's
missing dimension—meaning, reading, sound, usage, production, or writing—with
enough calibration and little enough friction that its composed next experience
is more useful than simply opening one of the user's mature existing tools.

If that is wrong, the core differentiation disappears. The result becomes a
slower, less trustworthy bundle of dictionary + Anki + kanji app.

The first experiments must therefore test:

1. agreement between predicted gap and the user's own diagnosis;
2. calibration against later direct retrieval;
3. time saved versus current capture/card creation;
4. voluntary return and session completion;
5. transfer to a changed context.

The initial single-user validation should use delayed held-out probes by
modality around 1-, 7-, and 30-day horizons; score recall predictions with
calibration curves and Brier/log loss; and run small N-of-1 randomized
comparisons between session-planning policies. Predicting recall accurately is
not the same as causing better learning, so policy comparisons must measure
retention/transfer as well as prediction.

---

## 17. Open questions

### User workflow

1. Are the long Anki screenshots each one card? What is front, back, and rating
   unit?
2. How were those cards created, and what do the colors mean?
3. Which mechanism produces the perceived gains: retrieval, repeated reading,
   theme, cloze, audio, or the combined ritual?
4. What gains appear outside Anki?
5. Which exact failure makes the kanji app feel endless?
6. Should handwriting be core or consulted only when uncertain?
7. Should backlog health be visible by default or one level deeper?
8. What correction style should text conversation use in flow versus study?
9. When should Japanese-only definitions replace or supplement English?
10. What session lengths and contexts recur most often?

### Migration

11. What share/export payload does the current dictionary actually produce?
12. Can the user export Anki TSV/APKG and does preserving old schedule matter?
13. Should imported AI-generated passages remain whole, or be decomposed into
    threads while preserving the original page?

### Product and privacy

14. Is one-device local use acceptable for the first daily alpha?
15. Which content may be sent to a cloud model?
16. What monthly AI cost/latency is acceptable?
17. Must the product work fully offline beyond dictionary/review?

### Visual direction

18. Which visual worlds feel beautiful rather than childish?
19. Does the user want one consistent canonical mnemonic per kanji or personal
    generated scenes?
20. How much graph/constellation visualization is genuinely useful on a phone?

### Validation

21. What baseline do we compare against: current dictionary + Anki + kanji app,
    or no study?
22. What outcome matters most over 30 days: words stabilized, reading speed,
    conversation, time saved, or adherence?

---

# Step 2 — Traceable answers to Claude's numbered questions

## 1. One-paragraph thesis

This product is a personal Japanese memory and immersion operating system that
preserves the thread from encounter to precise understanding, retrieval,
integration, and use. Its reason to exist is not that dictionaries, kanji apps,
SRS, readers, or AI chat are individually missing; several competitors already
combine many of them. It exists because the learner's state fractures between
them: the original context, intended sense, exact uncertainty, kanji relation,
review evidence, and later real-world use are lost or represented by separate
known flags and queues. The system maintains one evidence-backed learner/
language model and compiles the next useful experience without making every
saved item homework.

## 2. Core structural metaphor/data model

User-facing: **learning threads**. Structurally: a **typed knowledge graph plus
an immutable evidence timeline**, from which temporary branching/rejoining
journeys are compiled. It is not a list, deck, or tree because Japanese
relations are many-to-many, senses and confusions cross-cut words, and journeys
must rejoin. It is not a graph database requirement: v1 implements relational
entities and typed-edge tables in SQLite/Postgres. Stable
`RetrievalContract`s sit beneath dynamic experiences so scheduling does not
confuse different cue/response tasks.

## 3. Learner knowledge state

Sparse target/sense capabilities measured through stable `RetrievalContract`s.
Each contract fixes retrieval direction/skill, cue modality, response modality,
accepted-answer rubric, and hint/reveal policy. Learner-facing labels include
written recognition, reading recall, aural recognition, contextual sense
comprehension, meaning recall, production, usage/register, discrimination,
kanji construction, and optional handwriting. Evidence events update state:
direct constrained retrieval is strong; constrained production is moderate;
LLM-judged free conversation is provisional; lookup behavior is diagnostic;
passive exposure is exposure only. Words, senses, kanji, expressions, and
grammar constructions are first-class targets. State is derived and versioned,
not silently mutated.

## 4. Memory and scheduling

Use **FSRS-6** per stable explicit retrieval contract. A separate session
orchestrator composes due review, new material, integration, and transfer inside
a finite time budget. AI may choose context, modality, probes, and nominate
priority; it may not directly change FSRS stability/difficulty/retrievability,
invent intervals, or count passive exposure as recall. The user can Keep,
Learn, Master, pin, or park; desired retention is bounded and transparent. A
lookup is diagnostic friction, not automatically `Again`; any answer revealed
before recall is `Again`, while `Hard` is correct unaided retrieval with serious
effort. Accuracy-plus-latency
may adapt within-session scaffolding but stays separate from long-term FSRS
state.

## 5. AI conversation and epistemic validity

Conversation maps the learner, explains context, practices active threads,
navigates branches, and proposes evidence. It earns validity through declared
probes, tiered evidence, later constrained checks, calibration of predicted
recall against observed recall, rubric versioning, and user correction. Free
conversation alone cannot mark mastery. The AI must express uncertainty by
dimension.

## 6. Content sources and licensing stance

Priority: authentic user encounters; licensed JMdict/KANJIDIC2; KanjiVG;
carefully filtered/license-tracked corpora such as Tatoeba; user-supplied
private excerpts; then visibly labeled generated bridging content. Me-first
permits conservative private analysis of user-supplied material, not wholesale
scraping or redistribution. Store source version, license, attribution,
modification, confidence, and review metadata per factual field/artifact.
Product launch requires formal review of dictionary attribution, share-alike
effects, audio licenses, web/YouTube terms, and copyrighted sources.

## 7. Visual dimension

Separate three visual truth layers: canonical form/strokes, sourced
structure/history, and imaginative mnemonic art. Use deterministic KanjiVG
paths for stroke order. Do not call visible components radicals or etymology
without evidence. AI art is labeled mnemonic, governed by an art bible and
stable component asset registry, and human-approved before becoming shared
canonical content. No AI-generated etymology; disputed history keeps sources
and uncertainty.

## 8. Platform, stack, and local/cloud split

iPhone-first Expo/React Native/TypeScript client; SQLite for fast offline
dictionary, capture, threads, evidence, FSRS, and cached content; Postgres plus
a small Python/FastAPI service for sync, version-pinned Japanese NLP, ingestion,
and AI adapters. Cloud AI is asynchronous and provider-replaceable; secrets stay
server-side. Core lookup, saving, reference, and review work locally. Web/
desktop supports editing and migration but Expo SQLite web alpha status means
native and web persistence need separate validation.

## 9. MVP

Smallest daily MVP: complete licensed local word/kanji search; one-tap
Keep/Learn/Master with source sentence; layered word/kanji pages; stroke order;
minimal first-class grammar threads/pages; FSRS explicit review; finite mixed
session; one thematic integration canvas; basic grounded text conversation; TSV
import/export; provenance and correction.
The overnight build is a narrower vertical slice proving one thread across
a seeded encounter → saved thread → bounded explanation → one deterministic
retrieval contract → contextual reuse → scored probe → event export. Deferred:
voice, OCR, production share extension, generalized import/scheduling,
production conversation/calibration, web/YouTube scraping, full APKG history
migration, sync, AI art, unsourced etymology, handwriting recognition, full
KanKen, social and commercial systems.

## 10. User's current Japanese level

The user engages with advanced-intermediate through advanced written material,
has substantial kanji/vocabulary exposure, and reports a clear automaticity
problem. Evidence: advanced saved vocabulary, yojijukugo, abstract
Japanese-rich Anki material, kanji reading/component/stroke study, N1/KanKen
goals, and the report that saved items are often familiar but not instant.
That establishes interests, exposure, and friction—not comprehension accuracy.
Listening, speaking, production, and exact reading/JLPT/CEFR level remain
unmeasured.

## 11. Likely disagreement with Claude

I suspect disagreement on at least four points:

1. **AI authority:** I will defend a hard boundary: AI can orchestrate and
   propose evidence but must not own scheduling or mastery truth. LLM evaluation
   bias and the cost of subtle language errors make an end-to-end generative
   learner model epistemically weak.
2. **SRS centrality:** I will defend explicit SRS as a protected core, not a
   fallback. The user reports meaningful gains from custom Anki, and retrieval/
   spacing evidence is stronger than evidence for chat-driven implicit review.
3. **Graph implementation:** I will defend graph semantics without a graph
   database or a global graph-first UI. Typed relational edges are simpler,
   portable, and sufficient for bounded neighborhoods.
4. **MVP scope:** I will defer voice, generated kanji art, etymology, and full
   ingestion in favor of proving continuity and calibration. If the first
   build cannot preserve one thread truthfully across surfaces, more spectacle
   compounds the wrong architecture.

## 12. Riskiest assumption

That we can infer the learner's precise missing dimension with low enough
friction and sufficient calibration that dynamic orchestration beats the
user's existing mature tools. If this fails, the differentiator collapses and
the app is merely a slower bundle.

## 13. What I need from Claude

1. His exact learner-state representation and evidence hierarchy.
2. His scheduler choice and the boundary of AI authority.
3. His strongest evidence for how conversation diagnoses proficiency.
4. His canonical/generated/etymological truth boundary.
5. His content sources and licensing assumptions.
6. His actual daily MVP versus aspirational phases.
7. His stack and offline/latency plan.
8. His hands-on competitive gap, especially against Japanese by Renzo, jpdb,
   Renshuu, Nihongo, Migaku, Todaii, and Satori Reader.
9. His user-level conclusion and uncertainty.
10. His single riskiest assumption and proposed falsification test.

---

# Step 3 — Convergence process

I agree with Claude's ADOPT / ARGUE / EVALUATE exchange and item-by-item
concede / hold / synthesize response, with four additions:

1. **Freeze integrity.** Both v1 files retain date/hash and are never edited
   retroactively after exchange. Corrections become an addendum or v2 decision.
2. **Classify conflicts.** Each conflict is labeled:
   `factual`, `learning-mechanism`, `user-value`, `architecture`, or
   `sequencing`. This prevents a taste disagreement from masquerading as
   scientific evidence.
3. **Add reversibility and test.** Every unresolved decision records:
   evidence quality, confidence, reversibility, cheapest falsification test,
   and cost of being wrong. Empirical disputes become experiments, not prose
   contests.
4. **Preserve hard constraints.** User non-negotiables and truth/data/license
   guardrails are constraints. Within those constraints, resolution order is:
   learning-science evidence first, user's stated preference second, simplicity
   third. The human arbitrates value ties.

The v2 output should include a decision ledger:

| Decision | v1 positions | Resolution | Provenance | Evidence | Confidence | Now/later/never | Test |
|---|---|---|---|---|---|---|---|

No unresolved conflict should be silently averaged. If evidence is inadequate,
v2 should state the hypothesis and the experiment that will resolve it.

---

## Final freeze statement

This is my complete v1 position before disclosure of Claude's substantive v1.
The highest-confidence center is:

1. preserve the user's learning thread across every surface;
2. model partial knowledge by dimension;
3. protect explicit retrieval scheduling from uncalibrated AI judgment;
4. use AI to compose and converse around evidence, not replace evidence;
5. keep canonical fact, sourced interpretation, and mnemonic invention visibly
   separate;
6. prove one daily loop before building the full dream.
