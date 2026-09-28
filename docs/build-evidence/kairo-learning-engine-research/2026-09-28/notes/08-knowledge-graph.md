# Track 08 — Per-learner knowledge graph

Research cutoff and access date: **2026-09-28**. `PROPOSED` means an engineering design, not a validated psychological result. The design follows the owner's seven laws; empirical/product findings and their limits are separated below. A live undated product page documents a claim at retrieval, not a independently audited internal implementation.

## Takeaway

**PROPOSED:** Build a typed evidence graph whose first responsibility is honest attribution. Use a shared, versioned Japanese content graph plus one learner's append-only ledger. The derived model contains evidence histories, modality, uncertainty reasons, support references, and a frontier of useful next questions. It does not need a neural mastery model to start adapting every screen.

The central distinction is between **what the learner demonstrated**, **what the tutor suspects**, and **what the learner encountered**. Confirming a tutor proposal authorizes storing it; confirmation does not upgrade an observation to measured evidence. Knowing one dictionary headword does not establish every reading, sense, inflection or pragmatic use. No scalar level or readiness estimate is produced.

## Cited findings

| System / research | Verified representation or finding | Limit relevant to Bunki |
|---|---|---|
| JPDB | FAQ separates New, Learning, Known, Due, Failed, Locked, Never forget, Suspended, Blacklisted and Redundant states. Dependency locks and spelling variants exist; the state of a redundant kana variant can derive from its corresponding written word. [Official FAQ](https://jpdb.io/faq), **undated**, accessed **2026-09-28**. Homepage says known-word tracking selects sentences with only the target unknown. [Official homepage](https://jpdb.io/), **undated**, accessed **2026-09-28**. | This is evidence of lexical/card state and i+1 functionality, not a disclosed, validated joint model of production, grammar, senses, readings and provenance. Internal state details not published are **UNVERIFIED**. |
| Migaku | Official description lists Unknown, Learning, Known, Ignored and Tracking; Known is associated with needing review only every **21 days or less often**. Status is used for content difficulty and sentence selection. [Official explanation](https://migaku.com/blog/youtube/supercharge-your-language-learning-tracking-learned-words), blog index date **2026-01-20**, accessed **2026-09-28**. | An interval-derived status is not direct evidence of every sense or productive use. Full learner-state internals and validation are **UNVERIFIED**. |
| LingQ | Terms progress through status **1 New, 2 Recognized, 3 Familiar, 4 Learned**; status changes through review or reading. [Official help](https://lingq-support.groovehq.com/help/can-you-explain-a-lingqs-status), updated **2020-10-06**, accessed **2026-09-28**. | Self-status and exposure-derived familiarity cannot satisfy Bunki's measured-only level support. Production transfer is **UNVERIFIED**. |
| Satori Reader | Reader presentation can show kanji/kana/furigana according to individual known-kanji settings, including furigana over words containing unknown characters. [Official mechanics](https://www.satorireader.com/how-it-works), **undated**, accessed **2026-09-28**. | This demonstrates a surface querying known state; it does not prove context-specific reading knowledge from knowing component characters. |
| FSRS | Its documented memory variables are difficulty, stability and retrievability, with FSRS-6 individualized forgetting-curve shape. [Official algorithm documentation](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), edited **2026-07-28**, accessed **2026-09-28**. | A card's retrievability is a prediction for that review task. It must not silently become a posterior over language competence. |
| Sparse KT | SparseKT's authors identify small-dataset overfitting risk and evaluate attention sparsification against **11 models on 3 educational datasets**. [Original paper](https://arxiv.org/abs/2407.17097v1), **2024-07-24**, accessed **2026-09-28**. | No demonstrated Japanese single-learner effect; adding a GNN is not a substitute for calibration. |
| Multi-concept response attribution | KTbench documents label leakage from expanded multi-concept response sequences and inconsistent evaluated sequence lengths. [Original preprint](https://arxiv.org/abs/2403.15304v1), **2024-03-22**, accessed **2026-09-28**. | One correct sentence cannot be copied into independent positive labels for every grammar, word and reading in the sentence. |
| Open learner models | A systematic review analyzes **64 eligible articles** on OLMs and self-regulated learning in higher education. [Original review](https://doi.org/10.1016/j.compedu.2020.103878), **2020-09**, accessed **2026-09-28**. | Narrative evidence, not a verified pooled motivation effect, and not Japanese. **UNVERIFIED:** numerical effect of Bunki's proposed uncertainty/evidence interface on motivation or learning. |

### Placement evidence

Matsushita's **VSTRJ-15K (2024)** samples **150 items**, one per **100 words**, from the **15,000** most frequent vocabulary range. **75-item** forms trade time for more error; the author recommends randomized order because frequency-order administration can induce abandonment toward the end. [Author's test page, VSTRJ-15K section](https://www.tatsumatsushita.com/webtest.html), specified citation year **2024**, accessed **2026-09-28**. This is a reading-vocabulary measure, not a four-skill placement model. **Temporal exclusion:** the same live page includes a **2026-11-06** JCAWT subsection; that future subsection is excluded. **UNVERIFIED:** commercial embedding license and a frozen pre-cutoff revision of every linked download.

A yes/no vocabulary study reports correlations **greater than .80** between false alarms to carefully matched pseudowords and real-word guessing. [Zhang, Liu & Ai](https://journals.sagepub.com/doi/10.1177/0265532219862265), **2020** issue, accessed **2026-09-28**. The finding supports explicit response-bias checks in that setting; it does not validate Japanese pseudowords or justify treating a learner's “yes” as demonstrated semantic knowledge.

J-CAT is explicitly a computerized adaptive test of Japanese. [Official project description](https://www.j-cat2.org/html/ja/j-cat-project/index.html), **undated**, accessed **2026-09-28**. **UNVERIFIED:** rights to embed its items/calibration parameters. Bunki should borrow adaptive-design principles, not copy protected instruments or imply equivalence.

## Inferences — proposed engineering specification

Every schema, threshold, choice and pseudocode operation below is **PROPOSED**. None is an external fact or claimed validated effect size.

### A. Deterministic authority and replay

The full ledger must include the active policy/configuration and content-asset fingerprints. A change in configuration or dictionary mapping is an explicit appended event. A pure `reduce(ledger)` uses the most recent valid clock checkpoint in the ledger. The runtime appends a checkpoint when refreshing time; this is an app action, never a tutor's mutation. A hypothetical future-time query is visibly a simulation and cannot overwrite the canonical model.

Each row has:

```typescript
type Envelope<T> = {
  eventId: string; learnerId: string; deviceId: string;
  sequence: bigint; occurredAt: string; recordedAt: string;
  previousHash: string; payloadHash: string; schemaVersion: string;
  kind: string; payload: T;
  causationIds: string[]; correlationId?: string;
};
```

Rows never change in place. `correction`, `retraction`, `supersession`, `identity_mapping`, and `clock_correction` rows state their target and reason. Imports deduplicate by stable IDs/content hashes; the reducer validates a canonical order before applying records. A correction changes the effective replay view while preserving original history. Cross-device sync is out of this initial design: no second independently authoritative record is introduced.

Pin `reducerVersion`, tokenizer/dictionary/grammar inventory hashes, FSRS-6 version/weights, clock policy, tie-break policy, and assessment rubric versions in ledger configuration events. Freeze floating-point or fixed-point behavior and serialized key order for byte-comparable canonical output. Use stable sorts. If sampling is needed, persist the seed and sampler version plus selected IDs; replay does not draw fresh random values. LLM outputs are stored as proposed artifacts and confirmed rows, not regenerated during model reduction.

### B. Node identity and evidence shape

```typescript
type Node =
  | { kind: "lexeme"; id: string; dictionaryEntry: string }
  | { kind: "kanji"; id: string; codepoint: string }
  | { kind: "reading"; id: string; lexemeId: string; kana: string;
      writtenVariantId: string; readingRestrictionId?: string }
  | { kind: "sense"; id: string; lexemeId: string; sourceSenseId: string }
  | { kind: "grammar"; id: string; inventoryVersion: string }
  | { kind: "form"; id: string; lexemeId?: string; grammarId?: string;
      features: Record<string, string> };

type Channel = "visual_recognition" | "reading_recall" | "meaning_recall"
  | "aural_recognition" | "written_production" | "spoken_production"
  | "handwriting" | "interaction";

type Evidence = {
  evidenceId: string; attemptId: string; sourceEventIds: string[];
  tier: "measured" | "observed" | "exposure";
  targets: { nodeId: string; channel: Channel;
    attribution: "direct" | "joint" | "hypothesized" }[];
  taskVersion?: string; rubricVersion?: string; itemFamilyId?: string;
  assistance: string[]; responseRef?: string; answerKeyRef?: string;
  assessor: "learner_grade" | "deterministic_key" | "human_rater" | "tutor";
  result?: "success" | "failure" | "partial" | "unscorable";
  observationCode?: string; diagnosticAlternatives?: string[];
  contentVerificationRef?: string; occurredAt: string;
};
```

Opaque IDs survive display-text edits. Dictionary revisions may change sense numbering; preserve the original version and append mapping events rather than silently retargeting earlier evidence. A kanji-level reading pattern may be a shared linguistic relation, but only a tested lexeme-reading-context node receives direct reading evidence. Homographs, alternative readings, and acceptable register variants remain distinguishable.

Grammar/form relations include `realizes`, `inflects`, `has_reading`, `has_sense`, `contrasts_with`, `component_of`, and `suggested_prerequisite`. Prerequisites are navigational hypotheses with source and version; they are not hidden mastery propagation rules.

### C. Evidence tiers and derived model

```typescript
type NodeChannelState = {
  directMeasured: EvidenceRef[]; jointMeasured: EvidenceRef[];
  observed: EvidenceRef[]; exposures: EvidenceRef[];
  successfulUnaidedFamilies: string[]; failedUnaidedFamilies: string[];
  lastMeasuredAt?: string; lastObservedAt?: string;
  support: "unmeasured" | "sampled" | "mixed" | "repeatedly_demonstrated";
  uncertaintyReasons: string[]; // sparse, old, assisted, narrow contexts,
                                // conflicting, item uncalibrated, ambiguous parse
  prediction?: { probability: number; taskClass: string;
    modelArtifactRef: string; validationRef: string; asOf: string };
};
```

Start with the arrays/counts and uncertainty reasons. A nullable probability is preferable to a false calibrated posterior. No arbitrary multiplier such as measured=1.0, observed=0.4, exposure=0.1 is allowed to simulate statistical confidence. A later fitted model may use tier as a feature only after its calibration and held-out validation are documented; the provenance separation remains visible.

`repeatedly_demonstrated` is a transparent evidence-summary rule, not a claim of permanent mastery or of a JLPT level. Its required independent families/delay are a versioned owner-approved policy. The initial UI may simply show the outcomes and dates until an evidence policy is validated. A learner can dispute, annotate or request a probe; they cannot change objective answer-key outcomes by editing a mastery value.

```text
reduce(ledger):
    verify_hashes_schema_and_canonical_order(ledger)
    cfg = effective_configuration_events(ledger)
    clock = latest_valid_clock_checkpoint(ledger, cfg.clock_policy)
    effective = resolve_retractions_corrections_and_mappings(ledger)
    model = empty_graph(cfg.asset_hashes)
    for e in effective in canonical_order:
        if e.kind == goal_confirmed: apply_goal_as_data(model, e)
        if e.kind == review_confirmed:
            require e.actor == learner and grade_is_explicit(e)
            replay_FSRS6_only(model.card_state, e, cfg.fsrs)
        if e.kind == evidence_confirmed:
            validate_assessor_tier_and_provenance(e)
            deduplicate_attempt_and_source_lineage(e)
            if e.tier == measured:
                store_direct_or_joint_outcome_without_prerequisite_fanout(e)
            if e.tier == observed: store_hypothesis(e)
            if e.tier == exposure: store_encounter(e)
    derive_counts_uncertainty_and_confusion_edges(model, clock, cfg)
    derive_level_evidence_vectors_without_averaging(model, cfg)
    return canonical_serialize(model)
```

Automatic key matching can count as measured only for preverified tasks with explicit allowed answers and recorded assistance. Free production judged by an LLM remains observed even if a person confirms that the text was recorded correctly. A qualified human rubric score is measured with rater identity and version. FSRS review grades are learner supplied; any AI-suggested grade is prohibited.

### D. Frontier and sentence selection

A frontier is a query result of targets that matter to the learner's confirmed goal, have limited/conflicting evidence, and have feasible diagnostic or practice activities. It is not a line separating a global known and unknown language. Goals contain target situations, chosen source material, target date, time budget, accessibility preferences, and permitted modalities; all are ledger data.

```text
frontier(model, goal, verified_bank):
    candidates = goal_relevant_nodes(goal)
    for node in candidates:
        report direct_support, uncertainty_reasons, available_tasks
        separate measured_gap from observed_hypothesis and untested
    rank lexicographically by:
        confirmed_learner_priority,
        diagnostic_need,
        recent_measured_difficulty,
        useful_occurrence_in_goal_material,
        availability_of_verified_low_burden_context,
        stable_node_id
    return explainable_candidates
```

Lexicographic rank is a first transparent policy; numeric weights are not psychological parameters. Validation can later choose a policy using retained-outcomes-per-minute, without exposing a readiness number.

Sentence index records lexical occurrences, resolved/ambiguous senses, context-specific readings, forms, grammar targets, content source/licence, attestations, audio alignment and parser version. Use an inverted target-to-sentence index. Unresolved analysis increases burden/uncertainty; it never creates evidence that a learner knows the item.

```text
select_sentence(target, channel, model, bank, policy):
    rows = bank.by_target(target)
    rows = filter(rows, verified_and_licensed_for_this_use)
    for s in rows:
        units = distinct_teachable_targets(s, channel, pinned_parser)
        unseen = units with no direct support
        pain = units with recent direct measured failure
        ambiguous = unresolved units or senses
        extras = (unseen union pain union ambiguous) minus target
        annotate s with:
            token_coverage_interval,
            unique_extra_targets,
            local_pain_density,
            grammar_burden,
            parse_uncertainty,
            repeated_context_flag
    strict = rows where extras is empty and target occurs
    rank strict by context_diversity, goal_relevance, stable_sentence_id
    if strict nonempty: return proposal(strict.first)
    return proposal(best_explicitly_labelled_scaffolded_candidate_or_abstain)
```

The strict rule is a **PROPOSED operational definition** of i+1, not an experimentally proven optimum. Distinguish target count from token density; avoid using one percentage to hide grammar/sense burdens. Sentence comprehension requires a separate unaided question. Coverage labels disclose that an unmeasured word may actually be known; permit a probe or learner note rather than forcing it into a false deficit.

### E. Confusion edges and remediation

```typescript
type ConfusionEdge = {
  expectedId: string; producedId: string; channel: Channel;
  measuredAttempts: string[]; observedHypotheses: string[];
  contexts: string[]; direction: "expected_to_produced";
  alternatives: string[]; resolvedBy?: string[];
};
```

An error selecting 待 instead of 持 can nominate an orthographic contrast, but an input slip, audio problem or misunderstood prompt remains an alternative. Preserve directional edges rather than assuming symmetry. For particles and aspect, require context and intended meaning; a stylistic alternative is not automatically an error.

Remediation proposals progress from verified contrast/context to discrimination, then unaided recall, then use in a new context. The learner confirms the activity. Failure of one word sense does not erase successful evidence for another. A later success does not delete the earlier error; the UI shows changed evidence. Repeated tutor assertions derived from the same utterance count as one hypothesis lineage, not independent corroboration.

### F. Placement and calibration

Initial placement is a **PROPOSED diagnostic sampling session**, not a level assignment. Ask the learner to confirm a goal and available time; allow skipping any modality. Sample reading, sense discrimination, sentence form, listening when available, and brief production independently. Start from learner self-report only as a routing hint, then use unaided, verified probes. Record self-report as declared data, not measured attainment.

Use a provisional staircase over content strata if item difficulties are uncalibrated. After success offer a different item in a harder stratum; after failure offer a different item in an easier stratum, preserving channel and item family. Include anchor items and uncertainty-driven samples. Stop on the learner's time budget, opt-out, or a predeclared information criterion. Until calibrated, call it an adaptive diagnostic—not CAT-equivalent placement. Learner-confirmed content choices do not create a scheduler distinct from FSRS.

Yes/no checklists may guide sampling; follow claimed knowledge with meaning/reading/context probes. Japanese pseudowords require validation against names, rare forms and productive morphology before use. Do not scale a tiny convenience sample into a claimed vocabulary size. Do not reuse imported official tests as practice if that destroys their outcome independence.

Calibration uses prediction-before-response rows and delayed held-out tasks. Save the item family, assistance, evidence time, prediction artifact and eventual result. Report count, loss and reliability by channel and stratum. Compare against simple baselines; stratify failures by sparse evidence, unfamiliar senses, unseen contexts and tool errors. Do not fit and assess on the same attempts. An N-of-1 result characterizes that learner under those conditions, not a product population.

### G. Open learner model UX and law enforcement

Every band shows direct samples, dates, assistance, modality, unresolved contradictions and untested areas. “Ask me again” proposes a diagnostic; “That interpretation is wrong” appends a dispute; “Why this?” lists the actual evidence and goal relationship. The learner can inspect and export their ledger and recreate the same model from it. The AI can propose; only confirmed events enter appropriate learner data, and only FSRS-6 schedules reviews after learner grades.

The graph never stores `learner_jlpt_level`, `readiness`, or a cross-band average. Per-level bands count evidence on content associated with that level, with mapping provenance, never assert the learner is that level. A result on an official test can be retained as a dated document; it does not confer speaking/writing competence or a present-day readiness score.

## Gaps

- **UNVERIFIED:** competitors' undisclosed internal graph schemas, prerequisite transfer parameters, and per-learner posterior calibration. Do not describe missing documentation as proof a competitor lacks a feature.
- **UNVERIFIED:** commercial rights to embed VSTRJ/J-CAT items or JF test instruments. Build owner-reviewed original probes or obtain an explicit licence before embedding.
- **UNVERIFIED:** a universal number of observations sufficient to label a node demonstrated, a universal minimum for fitting BKT/IRT/DKT, or a universal optimum i+1 density. Set proposed policy values and validate them; never disguise them as literature constants.
- The content identity migration policy, tokenizer ambiguity policy, form inventory, and exception handling for alternative Japanese answers require Japanese-linguist review.
- On-device inference quality and performance are a separate gate. The strict export-only egress law prevents silently using a cloud learner model, cloud embeddings, or remote tutor memory. A future authorized cloud mode must not become ledger authority.
