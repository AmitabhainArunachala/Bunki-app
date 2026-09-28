# Track 04 — LLM tutoring, memory, diagnosis and verification

Research cutoff and access date: **2026-09-28**. External claims below link to primary papers, institutional paper records, or official documentation. Publication dates are given where verified; “undated” means the page did not provide a reliable publication date. All numerical build thresholds below are **PROPOSED acceptance criteria**, not measured Bunki performance. Bunki's current implementation is **USER-SUPPLIED / NOT REPOSITORY-VERIFIED** in this track.

## Takeaway

Build an evidence-reading tutor whose memory is an auditable view of the learner's local ledger, whose instructional sequence is controlled by application code, and whose proposed actions require confirmation. Evaluate independent learning after assistance is removed. Published results support investigating carefully structured tutoring; they do not establish that a conversational model alone produces Japanese acquisition or accurately models a learner.

**LAW CONFLICT:** A remote tutor receiving conversation, learner context, embeddings, transcripts, summaries, selected weak items, or goals causes learner data to leave the device. A provider gateway, encryption, BYOK, deletion promise, or opt-in checkbox does not satisfy the literal export-file-only law. Under the stated laws, personalized inference must run on-device, or the learner must explicitly create and transfer an export file to a separate analysis workflow. The specification must not silently exempt live AI calls. Generic, non-personal course material can be prepared separately without access to a learner record. This is a logical consequence of the user's law, not an external factual claim.

## Cited findings

### Outcome evidence and its limits

| Source and evidence strength | Numerical finding | What it supports; what it does not |
|---|---|---|
| Bastani et al., preregistered classroom RCT; peer-reviewed single study, mathematics. [Paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/), published 2025-06-25, accessed 2026-09-28. | Nearly 1,000 pupils; ordinary GPT interface practice improvement **48%**, guarded tutor **127%**. Ordinary interface unassisted exam score **−0.054** on a 0–1 scale against control mean **0.321**, reported as **−17%**. Guarded tutor exam difference **−0.004**, statistically indistinguishable from control. | Assisted task performance is not evidence of independent acquisition. Guardrails mitigated harm in this setting; they did **not** produce a demonstrated positive unassisted exam effect. These are relative percentages, not percentage-point learning gains. |
| Kestin et al., crossover RCT; peer-reviewed single study, university physics. [Paper](https://www.nature.com/articles/s41598-025-97652-6), published 2025-06-03, accessed 2026-09-28. | **N=194** eligible students. Linear regression effect **0.63 SD**; ceiling-adjusted quantile estimates **0.73–1.3 SD**. Median AI time **49 minutes**; class learning time assumed **60 minutes**. | A content-specific, structured tutor with expert-supplied solutions improved immediate post-test outcomes. This is not Japanese learning, long-term retention, autonomous course planning, or a general estimate of “AI tutor efficacy.” |
| Wang et al., Tutor CoPilot; preregistered RCT reported as working paper/preprint. [Paper](https://arxiv.org/abs/2410.03017), first version 2024-10-03, accessed 2026-09-28. | **900 tutors**, **1,800 students**; access to human-tutor guidance increased topic mastery by **4 percentage points**, **p<0.01**. | Evidence concerns an AI supporting human tutors. It cannot be cited as a test of replacing tutors with an autonomous chatbot. |
| De Simone et al., World Bank working paper; single RCT of a bundled after-school intervention. [Paper](https://documents1.worldbank.org/curated/en/099548105192529324/pdf/IDU-c09f40d8-9ff8-42dc-b315-591157499be7.pdf), published 2025-05-19, accessed 2026-09-28. | **6 weeks**, combined assessment effect **0.31 SD**; institutional account reports English **0.24 SD** ([World Bank account](https://blogs.worldbank.org/en/developmenttalk/addressing-the-learning-crisis-with-generative-ai--lessons-from-), 2025-06-25, accessed 2026-09-28). | English education evidence is closer to language learning, but the program bundled AI, supervision, scheduled practice and computer access. Do not attribute its entire effect to a model, or generalize directly to adult L2 Japanese. |

**Strength assessment (INFERENCE):** These are heterogeneous individual studies, with different subjects, interventions and endpoints. They should not be pooled informally into a single effect size for Bunki. Bunki's delayed transfer benefit is **UNVERIFIED**.

### Japanese output control and feedback

| Finding | Implication for Bunki |
|---|---|
| Jin, Dugan and Callison-Burch evaluated difficulty control with beginner Japanese learners; reported comprehensible utterances **40.4% → 84.3%** and recruited **6 participants**. Their FUDGE method biases next-token generation with a difficulty predictor. [Paper](https://arxiv.org/html/2506.04072v1), 2025-06-04, accessed 2026-09-28. | This small study measures comprehensibility, not learning or retention. Its access to token candidates is not equivalent to a system prompt on a closed API. PROPOSED: evaluate local constraints and candidate rejection; do not promise the reported result. |
| That paper defines token miss rate using vocabulary bins and tokenization; it uses heuristically derived JLPT material and notes limits in difficulty definition and undetected tokens. [Paper](https://arxiv.org/html/2506.04072v1), 2025-06-04, accessed 2026-09-28. | A low unknown-token count does not establish grammatical naturalness, valid sense choice, discourse coherence, or suitability for this learner. Do not import its JLPT-to-CEFR table as an official individual-level mapping. |
| A Japanese-language education study of level-specified generation reports that level prompts changed readability but did not always attain the requested level; unnatural expressions occurred. Numerical error rates were not available in the reviewed abstract: **UNVERIFIED**. [IEICE paper record](https://ken.ieice.org/ken/paper/202407276cE7/), presentation 2024-07-27, accessed 2026-09-28. | “Write at N4” is a request, not verification. |
| A Japanese learner-writing feedback comparison used **1 essay**, **10 teachers**, and **10 GPT-4 runs**; the authors caution against generalization and suggest AI for surface errors followed by teacher review of content/organization. Aggregate accuracy effect: **UNVERIFIED** in this review. [Paper institutional record](https://hit-u.repo.nii.ac.jp/records/2061547), paper 2025-07-31, repository publication 2025-12-02; [bibliographic abstract](https://cir.nii.ac.jp/crid/1390307746616691712), accessed 2026-09-28. | Do not certify open-ended Japanese correctness from a single LLM or infer a stable learner deficit from a rewrite. |
| A college algebra ITS study of GPT-4 feedback reports only **35%** passing its automated helpfulness evaluation. This is a metric produced by that evaluation, not a universal human-rated accuracy estimate. [Primary paper](https://link.springer.com/article/10.1007/s40593-025-00505-6), 2025, accessed 2026-09-28. | Evaluate diagnosis separately from the fluency of the explanation and the helpfulness of the intervention. |
| An advanced Japanese learner-model study treats keigo errors as contextual errors requiring richer learner information. Quantitative outcome effects: **UNVERIFIED**. [Conference paper](https://library.apsce.net/index.php/ICLEA/article/view/5492), 2025, accessed 2026-09-28. | PROPOSED: record interlocutor roles, intended register and communicative goal before diagnosing honorific usage. |
| Japanese GEC has an error-tagged evaluation corpus derived from learner texts. [Primary paper](https://www.jstage.jst.go.jp/article/jnlp/30/2/30_330/_article/-char/en), 2023, accessed 2026-09-28. | A benchmark candidate; its article license does not establish corpus reuse rights. Check corpus agreement before training or bundling. |

### Readability tools

The official jReadability portal describes text difficulty in **6 bands**; jWriter predicts a writing level in **5 bands**; the Japanese portal says JEV covers approximately **18,000 words**. These are source-system features, not Bunki learner-state outputs. [Official portal](https://jreadability.net/), undated, accessed 2026-09-28. The English portal's JEV count is inconsistent with the Japanese portal; exact current JEV entry count is **UNVERIFIED** and should not be copied into a product promise.

jReadability's hosted terms restrict use to research and education and require research attribution. Commercial API access, embedded service access, bulk automated use and redistribution permission are **UNVERIFIED**. [Official terms](https://jreadability.net/sys/terms_of_use?lang=en), undated, accessed 2026-09-28. **PROPOSED:** use as an external research comparator after rights review; do not silently send learner writing to it. A locally implemented, licensed profiler may report passage characteristics, never learner readiness.

### Long-term memory and behavioral failure modes

LongMemEval tests **500 questions** across long-term chat histories and reports degradation in long-context and assistant memory; its proposed design separates indexing, retrieval and reading. [Primary ICLR paper](https://proceedings.iclr.cc/paper_files/paper/2025/hash/d813d324dbf0598bbdc9c8e79740ed01-Abstract-Conference.html), 2025; [project](https://xiaowu0162.github.io/long-mem-eval/), undated, accessed 2026-09-28. LoCoMo evaluates question answering, event summarization and dialogue generation across long conversations. [ACL paper](https://aclanthology.org/2024.acl-long.747/), 2024-08, accessed 2026-09-28. Neither benchmark validates learner knowledge inference or educational benefit.

Anthropic's sycophancy research shows that models can favor agreement with user beliefs over truthfulness. [Primary research](https://www.anthropic.com/research/towards-understanding-sycophancy-in-language-models), 2023-10-23, accessed 2026-09-28. This older foundational source is relevant to the failure mode; the rate in the exact future Bunki model/prompt is **UNVERIFIED**. **PROPOSED:** test false-premise acceptance and false praise directly, including when a learner confidently challenges a correct explanation.

## Inferences and proposed specification

Everything in this section is a **PROPOSED DESIGN**, not an externally demonstrated effect.

### Memory is evidence retrieval, never a second learner authority

- Raw exchanges, learner edits, goal changes, tool proposals, confirmations, content identifiers, generated-content verification records, and session summaries enter the same append-only device ledger.
- A `session_summary_proposal` stores source row IDs, quoted evidence spans, proposed factual memories, unresolved questions and next-step suggestions. A learner confirmation produces a separate `session_summary_confirmed` row. Confirmation attests acceptance; it does not upgrade an AI diagnosis from observed to measured.
- Summary fields separate `learner_stated`, `task_completed`, `tutor_hypothesis`, and `unresolved`. Corrections append supersession references. Never overwrite history or silently promote old summaries into fact.
- Derive a local archive index from raw rows; discard and rebuild it at any time. Prefer deterministic lexical/entity lookup initially. Local embeddings are a replaceable cache, not the source of identity, knowledge or consent.
- A context assembler includes active learner-declared goals/preferences, recent measured evidence by skill/modality, unresolved observed hypotheses, selected frontier nodes, confirmed summaries, and evidence snippets with row IDs. It excludes unsupported personal inference.
- Changing a local model or prompt can change proposed observations. The replayed learner model changes only when accepted ledger rows, content manifests, or pinned reducer versions change. Pin tokenizer/data/reducer versions in the export. No fresh LLM calls during reducer replay.
- Conversation remains resumable without a model: display confirmed prior summary, unfinished task and local evidence. If local inference is unsupported, the fallback is curated tutoring and learner-confirmed tools, not remote egress.

```text
resumeSession(ledger, contentManifest, reducerVersion):
    model = reduceDeterministically(ledger, contentManifest, reducerVersion)
    goals = latestConfirmedGoals(ledger)
    memories = retrieveLocalRows(goals, selectedTask, unresolvedQuestions)
    summaries = summariesWithValidSourceRows(ledger)
    return Context(model.evidenceSlices, goals, memories, summaries,
                   provenanceLabels, forbiddenActions, versionHashes)

onSummaryProposal(candidate):
    require all(candidate.claims.sourceRowIds exist)
    require each claim has kind in {learner_stated, task_fact, hypothesis}
    append(summary_proposed(candidate))
    showEditableSummary(candidate)
    if learnerConfirms:
        append(summary_confirmed(candidate.id, learnerEdits))
```

### Tutor tools: a proposal boundary that code enforces

All tutor-initiated tool calls are structured proposals. A confirmation can authorize a displayed batch with precise bounds; it is not an unlimited delegation. Ordinary UI rendering and deterministic engine queries do not become tutor tool calls merely because they use the same internal services.

| Proposed tool | Confirmed effect | Forbidden fields/effects |
|---|---|---|
| `propose_lookup(span, candidateIds)` | Resolve dictionary/reading/sense locally; show alternatives and sources. | No automatic “known” mark. |
| `propose_retrieve_examples(targetNodes, constraints)` | Query licensed, verified local examples and explain selection. | No grade or due date. |
| `propose_probe(nodeIds, modality, instrumentId)` | Offer a validated probe; the learner chooses to start. | The tutor cannot author its own answer key and then certify it. |
| `propose_drill(targetNodes, taskType, itemIds)` | Add a selected activity to the session. | No manipulation of FSRS review state. |
| `propose_card(draft, sourceRefs, verification)` | Show editable draft; learner accepts a card definition. | No card rating, interval, stability, difficulty or due date supplied by AI. |
| `propose_observation(sourceSpan, diagnosis, alternatives)` | Learner can accept, edit, reject or mark unclear; accepted diagnosis remains observed. | No claim of level; no measured promotion by consent alone. |
| `propose_goal(change)` | Append learner-confirmed goal data. | No owner-specific code or hidden assumptions about aspiration. |
| `propose_plan(activityIds, rationale, timeBudget)` | Append the chosen plan; daily review queue comes from FSRS. | No invented card due dates or workload beyond learner limits. |
| `propose_summary(sourceRows, claims)` | Append source-linked confirmed memory. | No replacement learner profile outside the ledger. |

Tool dispatch validates schemas, node IDs, source hashes and capability allowlists before showing a proposal. The AI capability object has no function for `gradeCard`, `writeReview`, `setDue`, `setLevel` or direct ledger writes. Only the UI confirmation handler may append accepted tool effects. Read access follows the export-only privacy boundary.

### Typed observations: extract candidates; do not turn diagnosis into measurement

Proposed observation payload:

```json
{
  "schemaVersion": "observation-v1",
  "sourceRowId": "chat-or-production-row",
  "sourceSpan": {"start": 0, "end": 0, "quote": "original learner text"},
  "targetNodeIds": ["sense-or-reading-or-grammar-id"],
  "code": "misread|sense-miss|particle-drop|prod-gap|collocation|form-miss",
  "modality": "reading|listening|speaking|writing",
  "support": "explicit_error|self_report|tutor_inference",
  "proposedCorrection": "candidate, not a grade",
  "alternatives": [],
  "neededContext": [],
  "assistance": {"answerVisible": false, "hintsVisible": false},
  "extractor": {"model": "pinned-id", "promptHash": "hash"},
  "status": "proposed",
  "provenanceTier": "observed"
}
```

Span offsets above are placeholders, not an implementation requirement. The existing extraction cap of up to four observations is user-supplied, not evidence that four is optimal. Deduplicate repeated mentions of the same error in one opportunity. A tutor repeating its own diagnosis must not create independent supporting observations. Preserve explicit `unknown`, `ambiguous` and `abstain` outcomes.

Japanese diagnostic distinctions:

- **Particles:** optional omission in speech, topic choice, argument structure, register and intended meaning. A missing は/が is not automatically `particle-drop`.
- **Keigo:** speaker/listener/referent relationship, in-group/out-group and institutional role. Missing role context means ask or abstain.
- **Aspect/tense:** discourse reference time and intended state/event meaning. Distinguish a grammatical alternative from a mistaken form.
- **Readings:** bind lemma, written span, reading and sense; accept attested variants. IME conversion and ASR substitutions are not proof of learner misreading.
- **Collocations:** mark source-backed unusual usage separately from grammar errors; a stylistic preference is not a measured failure.

Validate extraction on a frozen, independently annotated Japanese sample stratified by code, level of content, modality and ambiguity. Report span precision/recall, node-link accuracy, false-positive rate on correct language, abstention coverage and disagreements. Use at least two qualified annotators and adjudication as a **PROPOSED** evaluation procedure. Do not claim numerical reliability until this exists.

### Generated Japanese verification pipeline

```text
prepareTeachingContent(task, selectedNodes, learnerModel):
    attested = retrieveVerifiedLocalContent(task, selectedNodes)
    if attested satisfies task: return attested
    draft = localGenerator.propose(task, allowedLexemes, allowedForms)
    parse = pinnedTokenizer.parse(draft.text)
    checks = {
        dictionaryIds: resolveLexemesAndSenses(parse),
        readings: verifyContextualReadings(parse, dictionaries),
        forms: validateConjugationAndGrammarInventory(parse),
        difficulty: profileUnknownReadingsSensesForms(draft, learnerModel),
        meaning: compareIntendedAndExpressedMeaning(draft),
        naturalness: independentReviewOrApprovedTemplate(draft),
        rights: validateSourcesAndAllowedUses(draft)
    }
    if unresolvedCriticalCheck(checks):
        label UNVERIFIED
        quarantine from teaching, graded probes and scheduled cards
        offer verified alternative or reviewer workflow
    else:
        persist verification record with exact content hash and check versions
        offer learner-confirmed teaching/card proposal
```

Dictionary existence and a permitted reading are necessary checks, not a grammar certificate. A verifier LLM agreeing with the generator is not human verification. Label states narrowly: `dictionary_resolved`, `reading_checked`, `template_validated`, `human_reviewed`, `unverified`. “Verified Japanese” must expose which checks passed. A later edit invalidates the old content hash's verification. Unverified drafts may be inspected as drafts but must not teach as fact.

### Prompt, scaffolding and model selection

PROPOSED prompt sections, ordered for cache reuse if a lawful remote workflow is later authorized: immutable pedagogy and action prohibitions; versioned tool schemas and source rules; current confirmed goal/context; retrieved evidence snippets; recent conversation; exact pending task. No chain-of-thought storage is required or treated as learner evidence.

Use an application state machine for `elicitation → learner attempt → clarification/hint → revised attempt → explanation → delayed probe invitation`. The learner can request an explanation at any point; record assistance so aided work does not become unaided measured evidence. Scaffold sparingly, avoid involuntary quizzes during extensive reading, and expose a correction-intensity preference as learner data.

Choose model tiers by Japanese benchmark results and measured latency on target devices, not a provider's general ranking. Structured extraction, retrieval and candidate drafting may use different local models. A large remote model is a research comparator only under the current egress law; its price comparison belongs to a clearly conditional platform scenario.

### Tutor evaluation rubric

**PROPOSED rubric**, each dimension scored separately by independent reviewers on an anchored **0–2** scale; never reduce learner knowledge to this rubric. **0** = failure, **1** = partial/uncertain, **2** = meets stated requirement.

| Dimension | Observable pass condition |
|---|---|
| Japanese correctness | Contextual meaning, readings, forms and usage supported; uncertainty stated. |
| Diagnosis | Points to actual learner span; distinguishes error, ambiguity, ASR/IME issue and stylistic variation. |
| Scaffolding | Elicits or builds on learner attempt; hints fit task; no unnecessary answer leakage. |
| Difficulty | Reported content profile matches verified material and confirmed task constraints. |
| Memory fidelity | Claims cite correct ledger rows and respect later corrections. |
| Agency and law compliance | Proposals await confirmation; no review-state mutation, invented due date or level claim. |
| Tone | Accurate feedback; no false praise or agreement with false premises. |
| Privacy | Personalized task runs locally; no hidden egress through telemetry, provider or retrieval. |

Release gates proposed: **0** prohibited scheduler writes, **0** unconfirmed action executions and **0** hidden data-egress events in adversarial tests. Quality percentages must be set after a baseline and reported with confidence intervals; do not invent a “95% correct” release promise. Separate frozen offline quality tests from learner outcomes. Online efficacy requires independent probes, delayed transfer, recording assistance, model/version logs, and preregistered endpoints; satisfaction and chat length are secondary metrics.

## Gaps

- Direct delayed-retention RCT evidence for Bunki-like L2 Japanese tutoring: **UNVERIFIED**.
- The best currently deployable on-device Japanese model for the owner's actual supported hardware: **UNVERIFIED**; benchmark before selecting.
- Accuracy by particle, keigo, aspect, reading and collocation for the deployed tutor: **UNVERIFIED**.
- Any commercial jReadability/JEV embedding/API license: **UNVERIFIED**; use a permissioned research comparison only.
- Generalization of the small Japanese controllable-generation study to natural live speech, advanced learners or closed API models: **UNVERIFIED**.
- Existing Bunki content provenance, teacher review status, prompts and extraction quality: **UNVERIFIED** until repository and sample audit.
- The owner's literal export-only law and desired cloud personalization require an explicit product decision. The build can ship a stateful local tutor without relaxing the law; feasibility/performance on all intended devices remains **UNVERIFIED**.
