---
title: "Bunki — Fresh-Context Claude Handoff for Converged v2 and Long-Running Build Goal v1"
date: 2026-07-27
artifact_type: agent_handoff_prompt
project: bunki
working_name: "Bunki / 分岐"
status: ready_for_operator_handoff
next_agent: Claude
requested_mode: specification_only
operator: John Shrader
canonical_input:
  codex_v1:
    file: JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md
    sha256: 94842a1c8bc423a84cbe6131a8c540c88b676d5f8e2143a107b02ec5b28da95b
  claude_v1:
    file: BUNKI_WORKING_SPEC_2026-07-27.md
    sha256: 77e52f3a93fd9ebb3cdd8c456250cb66779d87bc1582e53e0bd7e39da82feb68
    git_revision: 8404395
    availability: declared_by_claude_not_present_in_codex_workspace
  claude_round1:
    file: BUNKI_CONVERGENCE_ROUND1_2026-07-27.md
    sha256: a6066f6972f58dff213bbdddcec5447bd7d01ea22745c26a15d7d455e6dd756d
  codex_round1_response:
    file: BUNKI_CONVERGENCE_ROUND1_CODEX_RESPONSE_2026-07-27.md
    sha256: 9542fbaa89456b2bb226a415f37a3360104539e290242545c542a2aee6f07a54
requested_outputs:
  - BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
  - BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md
  - BUNKI_V2_PHASE0_TRACEABILITY_MATRIX_2026-07-27.md
  - BUNKI_PHASE0_RISK_AND_FALSIFICATION_REGISTER_2026-07-27.md
  - BUNKI_OPERATOR_DECISIONS_2026-07-27.md
  - BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt
  - BUNKI_PHASE0_FRESH_AGENT_LAUNCHER_2026-07-27.md
---

# Paste everything below into a fresh Claude context

Claude — this is a fresh-context continuation of the Bunki / Japanese Learning
OS design convergence between you, Codex, and the operator, John Shrader.

You do **not** have permission in this pass to implement the application, install
dependencies, scaffold a production repository, start a long-running executor,
or silently change either frozen v1. Your task is to close the design
convergence and produce **version 1 of the self-contained, highly architected
long-running build `/goal`** that a separate implementation agent will execute
later.

The operator wants depth and executable precision, not a broad product brief.
This pass succeeds only if a fresh coding agent can read one controller and
build the bounded Phase-0 product slice without rediscovering the architecture,
guessing at evidence rules, or expanding into the whole dream.

## 1. What happened before this context

The operator wants one beautiful, AI-native Japanese learning environment that
replaces the broken loop among:

- a detailed but inert dictionary used heavily for capture;
- custom Anki/FSRS decks that produce gains when used but accumulate large,
  fragmented backlogs;
- a separate kanji system with strong visual appeal but an endless-feeling
  treadmill;
- immersion sources, lookups, sentence mining, grammar, kanji, and conversation
  that currently cannot update one shared understanding of the learner.

The core user impulse at lookup time is:

> "I do not know this perfectly and I do not want to lose it."

Capture must therefore be nearly instant, but capture must not automatically
create review debt. The product exists to turn a real encounter into one
persistent learning thread whose dictionary knowledge, kanji structure,
context, retrieval evidence, spaced review, AI conversation, and future
encounters remain connected.

You and Codex independently froze v1 designs before seeing each other's
decisions. Your Round-1 diff found substantial independent convergence. Codex
then answered every A1–A14, C1–C6, and E1–E8 item. The result is no longer two
competing theses; it is a shared architecture with a small number of experiments
and operator choices.

## 2. Mandatory read order and integrity

Read these files completely, in this order:

1. `JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md`
2. `BUNKI_WORKING_SPEC_2026-07-27.md`, frozen at Git revision `8404395`
3. `BUNKI_CONVERGENCE_ROUND1_2026-07-27.md`
4. `BUNKI_CONVERGENCE_ROUND1_CODEX_RESPONSE_2026-07-27.md`
5. this handoff

Verify the SHA-256 values in the YAML header when the bytes are present. Treat a
hash mismatch as a stop-and-report integrity problem unless it is clearly
copy/paste transport noise and the operator explicitly accepts the replacement.
Do not edit, "clean up," or retroactively harmonize either frozen v1.

Codex did not receive the bytes of your frozen
`BUNKI_WORKING_SPEC_2026-07-27.md`; it received your complete Round-1 document,
which restates every position being resolved. Recover the original frozen file
from revision `8404395` or obtain the exact bytes from the operator. If it is
unavailable, **stop before synthesis** and report the exact searches performed,
the missing artifact, the observed repository/revision state, and the smallest
recovery action. Do not reconstruct a frozen artifact from summaries or memory,
and do not claim hash continuity for a reconstruction.

## 3. Converged product spine — do not reopen without new evidence

The following are accepted:

1. **Failure being solved:** learner-state fragmentation across lookup, capture,
   kanji, SRS, immersion, and conversation.
2. **Structural model:** canonical entities and typed relations plus an
   append-only encounter/evidence timeline; relational SQLite/Postgres
   implementation with graph behavior, not a graph database in v1.
3. **Stable memory unit:** a versioned `RetrievalContract` defining the target,
   direction/skill, cue and response modality, accepted answer/rubric,
   hint/reveal policy, and prompt-family version.
4. **Learner model:** sparse, contract- and modality-specific capability state;
   never one global Japanese level.
5. **Evidence hierarchy:** direct constrained retrieval may update FSRS;
   conversation/model inference is provisional; lookup is a friction event;
   passive appearance is exposure only.
6. **Scheduler:** version-pinned FSRS-6 for valid explicit retrieval contracts.
   AI proposes experiences and candidate evidence but never writes stability,
   difficulty, retrievability, or the next interval directly.
7. **Capture:** a saved encounter creates a provenance-rich thread. Scheduling
   begins only through explicit Keep/Learn/Master-style promotion.
8. **Sessions:** finite, time-budgeted orchestration rather than an infinite
   due-count treadmill.
9. **Truth layers:** canonical/structural fact, sourced scholarly or
   etymological interpretation, and clearly labeled mnemonic fiction are
   visually and semantically distinct.
10. **Information design:** progressive disclosure; immediate answer first,
    personal context next, connected understanding after that, full reference
    last.
11. **Architecture:** local-first Expo/React Native/TypeScript, native SQLite,
    authoritative pure TypeScript domain/event core, optional Python/FastAPI
    analysis sidecar later, Postgres only when sync is justified.
12. **Content:** field-level provenance and licensing; no unsourced etymology;
    no assumption that public web/video text is freely ingestible.
13. **Migration:** Anki is a warm start through a quarantine/mapping report, not
    trusted learner truth.
14. **Science posture:** the complete product is a hypothesis. Retrieval,
    spacing, context, contrast, AI judgment, and accessibility forecasts retain
    their actual evidence boundaries and explicit falsification tests.

## 4. Resolved Round-1 syntheses that v2 must encode

Do not flatten these back into either original position:

### 4.1 Platform

- Build the overnight interaction demonstration in Expo Web for speed.
- Before calling anything a daily-use alpha, prove native SQLite and iPhone
  capture/review behavior on a development build.
- Web is the long-text/import/admin surface; native is expected to become the
  primary capture/review surface.
- Production iOS share extension is not required in the Phase-0 slice, but the
  architecture must not make it impossible.

### 4.2 AJATT Firehose

The omnivorous immersion Firehose remains a user-stated product pillar, but it
is implemented as a rights-aware Source Router:

- full processing only for owned, public-domain, open-licensed, or explicitly
  authorized material;
- publisher-supplied feed/API fields under their contract;
- minimal, provenance-carrying user-selected excerpts;
- pointer/player/timecode-only treatment where full text is not authorized;
- blocked adapters where no valid contract exists.

User initiation and transient processing do not themselves legalize
acquisition. The Firehose is not part of the Phase-0 build goal.

### 4.3 Immersion as review

Immersion may replace a standalone review only when it contains a declared,
contract-conforming retrieval of the same memory. Spontaneous conversational
use is Tier C unless explicitly elicited and rubric-scored. Passive exposure
may reprioritize a later probe but never writes FSRS. Any promise that embedded
probes reduce standalone burden remains an experiment.

### 4.4 Visual graph

Local neighborhoods are the default working surface. A global Observatory is a
later optional reflective mode because the operator strongly likes Kanji
Garden's whole-state visual. It cannot use one brightness value as false global
mastery; capability lenses or distinct marks must preserve reading, meaning,
listening, production, writing, stability, retrievability, uncertainty, and
coverage distinctions.

### 4.5 Sources

Wiktionary, CHISE, and Kanjium are candidates, not automatically selected
canonical datasets. License and asset boundaries are verified field by field.
Wiktionary entry text and embedded media/examples can have different terms.

### 4.6 Services

The pure TypeScript domain package owns events, `RetrievalContract`s, evidence
gates, FSRS reducer, promotion/session policy, and provenance invariants.
Python can return versioned NLP/AI candidates; it cannot write canonical learner
events or FSRS. There is one domain core and one scheduler implementation.

### 4.7 Content readiness

Adopt a future personal `ContentReadinessEstimate`, not a comprehension oracle:
lexical/sense coverage, grammar, modality, speech rate, topic/source familiarity,
names, ASR uncertainty, and missing-data confidence. "96% lexical
accessibility" must never become "you will comprehend 96%." The feature ships
only if it beats cheap baselines on held-out real content. It is not Phase 0.

### 4.8 Priority, branching, contrast, and AI routing

- Personal recurrence is a major, explainable utility signal blended with
  source diversity, general frequency, explicit goals, retrievability, and
  workload—not the sole spine.
- Journey compilation follows stumble → hypotheses → cheap diagnostic probes →
  bounded branch → evidence-defined rejoin. Form/meaning/usage are useful route
  families, not a complete ontology.
- Contrast normally follows a minimal foothold; active confusion can trigger a
  small immediate corrective contrast. Semantic relatedness alone does not
  create a `ConfusionSet`.
- AI routes by task risk, latency, privacy, and cost. Model tier never grants
  evidentiary authority.

### 4.9 User level

The current defensible update is narrow:

> One cold component decomposition succeeded, and three sampled formal
> constructions showed specific fragility. The user's media diet centers on
> talk/video and NHK-register material. This raises a hypothesis about the
> sampled dimensions; listening level, global reading band, production breadth,
> and JLPT level remain unmeasured.

Do not resurrect "listening ≈N2+" or "formal written ≈N3+" as facts.

## 5. Operator intent and product character

Preserve these non-negotiable experiential requirements:

- lookup and capture feel immediate;
- the app is AI-native and conversational without making fluent AI prose equal
  truth;
- the app learns the user's real Japanese profile over time;
- journeys may bifurcate or trifurcate, but they are bounded and rejoin;
- dictionary, kanji, stroke order, components, compounds, grammar, source
  context, sentence mining, and SRS feel woven rather than bolted together;
- review/new/integration balance adapts quickly without scheduler instability;
- text is primary initially; voice comes later;
- the design is beautiful, immersive, recursive, fun, and calm—not a gray
  reference dump or a gamified shame machine;
- the user can capture aggressively without accidentally promising to memorize
  everything;
- the user can inspect and correct what the system thinks it knows.

The working name is **Bunki / 分岐**, not a final brand decision.

## 6. Your two required outputs

Produce both files in one pass. The second must derive from the first.

### Output A — canonical converged v2

Write:

`BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md`

This is the complete product/learning/architecture source of truth. It must:

1. integrate the convergent spine and every resolved A/C/E item;
2. include a decision ledger with provenance (`operator`, `Claude`, `Codex`,
   `synthesis`, `convergent`);
3. separate non-negotiable, reversible preference, experiment, and open
   operator choice;
4. carry typed U/R/S evidence and confidence without broadening inferences;
5. define canonical entities, typed edges, events, `RetrievalContract`,
   promotion states, evidence tiers, and derived state precisely enough for
   implementation;
6. give progressive-disclosure screen contracts for capture, word, kanji,
   grammar, session, evidence inspection, and the later Observatory;
7. define local/cloud and TypeScript/Python authority boundaries;
8. give content/provenance/license policy and the Source Router modes;
9. define Phase 0, daily MVP, and later phases with explicit exclusions;
10. name the riskiest hypotheses and their falsification tests;
11. retain known weaknesses and skeptical attacks;
12. record unresolved operator decisions without allowing them to block Phase 0
    where a reversible default exists.

Every load-bearing decision in the ledger must record:

- provenance (`operator`, `Claude`, `Codex`, `synthesis`, or `convergent`);
- status (`accepted`, `experiment`, `open`, or `rejected`);
- evidence or reasoning;
- confidence;
- reversibility;
- cost of being wrong;
- falsification or acceptance gate.

Freeze it at the end of this pass and report its SHA-256. Do not revise it
silently after deriving Output B; if B reveals a contradiction, fix A before
the freeze and record the correction.

### Output B — long-running build `/goal` v1

Write:

`BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md`

This must be a self-contained runtime controller for a separate long-running
coding agent. It is **not** a summary, roadmap, aspirational PRD, or list of
suggestions. A fresh executor should be able to paste it into `/goal`, inspect
the designated repository, and run until the exact completion condition or one
irreducible operator/external gate.

The controller must cite the frozen v2 file and hash as its design authority.
Every requirement and work package must trace to a stable v2 requirement ID.

### Auxiliary control artifacts

Create these alongside Outputs A and B:

- `BUNKI_V2_PHASE0_TRACEABILITY_MATRIX_2026-07-27.md`
- `BUNKI_PHASE0_RISK_AND_FALSIFICATION_REGISTER_2026-07-27.md`
- `BUNKI_OPERATOR_DECISIONS_2026-07-27.md`
- `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`
- `BUNKI_PHASE0_FRESH_AGENT_LAUNCHER_2026-07-27.md`

The launcher must be short. It tells a future implementation agent exactly
which controller to read, how to verify its hash, how to inspect live repository
state, and how to begin the admission package. It must not duplicate, weaken,
or paraphrase away the controller.

## 7. Exact scope of the first long-running build

The first goal proves one closed learning loop:

> paste or select one provenance-labeled seeded encounter → immediate durable
> thread → bounded AI candidate explanation → explicit promotion → one stable
> retrieval contract → one contextual reuse → scored probe → finite session →
> inspect and export the evidence.

### Required Phase-0 capabilities

1. Responsive Expo Web demonstration in a native-ready Expo/React Native
   project.
2. Pure TypeScript domain core with versioned events and deterministic replay.
3. Single-device local persistence through a port/adapter boundary; native
   SQLite is the target authority, with a clearly provisional web adapter.
4. Small, explicitly licensed/labeled seed dictionary/kanji dataset or fixtures;
   no claim of complete dictionary coverage.
5. Immediate encounter capture with provenance and Keep/Learn/Master promotion.
6. One progressive-disclosure word page and one kanji page.
7. One stable `RetrievalContract`, one version-pinned FSRS-6 path, and explicit
   grading semantics.
8. Separate evidence for meaning versus reading so one miss cannot erase the
   other.
9. One contextual reuse/integration canvas.
10. One bounded AI exchange through a provider-independent adapter; canonical
    fields remain deterministic and AI output is labeled candidate/generated.
11. One finite session recipe with an explicit ending.
12. One evidence inspector showing why state changed, plus lossless JSON export.
13. Offline/non-AI fallback for capture, lookup, review, and export.
14. Automated unit, integration, replay, and end-to-end tests for the loop.
15. A documented iPhone/native development-build checkpoint. If the executor
    lacks macOS/Xcode/device access, web completion may proceed, but native
    verification remains an explicit external gate and cannot be claimed.

### Explicitly excluded from Phase 0

- full JMdict/KANJIDIC2 production import;
- production iOS Share Extension;
- OCR/camera, audio capture, voice conversation, or pronunciation scoring;
- generalized web/YouTube scraping or the Firehose;
- Postgres, cross-device sync, accounts, or a production backend fleet;
- deployed Python NLP service unless the bounded slice proves it indispensable;
- generalized conversation diagnosis or calibrated learner-model inference;
- generalized journey compiler;
- `ContentReadinessEstimate` feed ranking;
- full Anki `.apkg`/history migration;
- global Observatory implementation or wallpaper export;
- AI-generated kanji art;
- sourced etymology productization;
- handwriting recognition;
- comprehensive grammar/JLPT/Kanken curriculum;
- social features, marketplace, subscriptions, or efficacy marketing claims.

Preserve seams for these later capabilities without implementing them.

## 8. Required architecture precision in Output B

Do not write "set up the app," "use best practices," or "add tests." The goal
must specify:

- the proposed repository/package layout and ownership of every major surface;
- exact domain types and event-schema responsibilities;
- which package owns FSRS and how version pinning/replay works;
- which code may and may not create an accepted evidence event;
- persistence ports and native/web adapters;
- dictionary seed format, provenance, and license record;
- AI adapter input/output envelope, timeout, cancellation, offline fallback,
  prompt/rubric/model versioning, and no-state-write rule;
- session orchestrator inputs, outputs, and finite budget;
- screen/state transitions and loading/error/empty/offline behavior;
- accessibility, Japanese typography, ruby/furigana, vertical-space, and
  responsive/mobile requirements;
- export schema and compatibility/version fields;
- privacy and secret handling;
- exact test fixtures and expected assertions;
- observability needed to diagnose latency without storing sensitive content;
- migration/rollback strategy for local schema evolution;
- performance budgets, with provisional numbers clearly labeled and measured;
- current, primary-source-verified dependency choices and licenses.

If there is no repository yet, the controller begins with an explicit
**admission and repository-bootstrap packet** rather than pretending commands or
CI already exist. Do not make repository creation, visibility, licensing, or
deployment choices on the operator's behalf.

## 9. Required work-package DAG

Design a dependency graph of bounded, reviewable work packages. At minimum it
must cover these responsibilities, though you should improve the decomposition:

- `WP-00` integrity, repository orientation, authority, and baseline receipt;
- `WP-01` v2 traceability, ADR/schema freeze, and acceptance-test plan;
- `WP-02` pure domain kernel, events, reducers, and deterministic golden replay;
- `WP-03` local persistence, migrations, idempotency, deletion, and export;
- `WP-04` licensed seed data, field provenance, and canonical/generated truth
  labels;
- `WP-05` capture/search/save fast path and layered word/kanji pages;
- `WP-06` RetrievalContract, evidence gates, Keep/Learn/Master, and pinned FSRS;
- `WP-07` bounded AI candidate path with offline/scripted fallback;
- `WP-08` contextual reuse, one diagnostic/repair branch, evidence-defined
  rejoin, and finite session;
- `WP-09` evidence ledger, correction/supersession, and observability;
- `WP-10` integrated web loop and adversarial test matrix;
- `WP-11` native iPhone SQLite and incoming-capture proof;
- `WP-12` operator field trial and explicit continue/pivot/stop result;
- `WP-13` independent audit, exact-merged-main verification, and closure
  receipt.

For every work package include:

- purpose and the exact closure predicate;
- dependencies;
- allowed files/surfaces or ownership boundary;
- proposed branch/commit/PR strategy;
- exact commands;
- tests and evidence artifacts;
- rollback/recovery;
- cost of wrong;
- safe parallelism and collision boundaries;
- stop conditions and operator gates;
- what is deliberately not done.

The controller should optimize for one coherent vertical slice, not maximum
parallel activity. Parallelize only packages whose write surfaces and semantic
authority do not collide.

## 10. Long-running agent operating contract

Output B must tell the eventual executor to:

1. independently refresh live repository state; never trust the controller's
   old SHA;
2. read repository-local `AGENTS.md`, onboarding, ownership, and CI rules before
   edits;
3. use a fresh branch such as
   `agent/bunki-phase0-closed-loop-<date-or-suffix>`; never push to main;
4. keep all PRs draft unless the operator explicitly changes readiness;
5. never merge, self-approve, weaken protection, or bypass required checks;
6. stage only task-owned files and preserve unrelated changes;
7. make small reviewable commits bound to completed work-package predicates;
8. run and record lint, format, typecheck, unit, integration, replay, E2E,
   accessibility, build, and applicable native checks;
9. keep AI/provider secrets out of git, logs, fixtures, and screenshots;
10. continue through recoverable failures; stop only at the exact completion
    condition or one precise irreducible gate after exhausting safe alternatives;
11. maintain a resumable status/evidence capsule after every material
    checkpoint so a fresh agent can continue without narrative guesswork;
12. report exact branch, commit, tree, commands, test results, remaining gates,
    and the smallest next operator action.

The eventual executor operates as this explicit state machine:

`ORIENT → ADMIT → EXECUTE → VERIFY → REVIEW → WAIT-FOR-HUMAN-MERGE →`
`REFRESH-LIVE-MAIN → REVERIFY → CLOSE`

Its resumable evidence capsule must always include:

- current exact SHA;
- completed and active work packages;
- open PRs and owners;
- test and evidence locations;
- unresolved risks;
- next safe command;
- precise blocker and required operator action.

No report counts as progress unless it closes a predicate, repairs a failing
gate, produces exact-SHA evidence, or isolates one irreducible external action.

## 11. Mandatory tests and negative assertions

The build controller must require, at minimum:

- saving an encounter is immediate and durable;
- capture does not activate FSRS until explicit promotion;
- replaying the same events produces the same derived state;
- unknown event versions fail closed;
- a missed reading does not erase known meaning;
- reveal-before-recall grades `Again`;
- lookup does not grade `Again` or success;
- passive/contextual exposure does not update FSRS;
- AI output cannot mutate canonical dictionary fields or memory state;
- capture/lookup/review/export work when AI is unavailable;
- a timed-out AI call does not lose or block capture;
- candidate/generated content is visually and structurally labeled;
- the session has a finite completion state and cannot silently become an
  infinite queue;
- exported JSON is complete, versioned, and can reproduce the inspected event
  history;
- source/license/provenance metadata survives capture and export;
- local persistence survives restart/background behavior on every supported
  runtime actually claimed;
- the exact closed loop passes one automated E2E flow;
- the operator can put a second real encounter through the loop without
  developer intervention.

For latency targets, distinguish local acknowledgment, warm lookup, AI
enrichment, and end-to-end capture. State numbers as provisional budgets to be
benchmarked on the operator's actual iPhone; never manufacture achieved
performance.

## 12. Scientific and product claim boundaries

Output B must prevent implementation from smuggling in unsupported claims:

- FSRS is an engineering scheduler choice, not proof of whole-product efficacy.
- Context, exposure, and retrieval remain distinct event types.
- AI grades are provisional unless a stable objectively scorable contract or
  explicit user confirmation authorizes the result.
- No global Japanese level or "mastery percentage."
- No "scientifically optimized" copy without a defined experiment.
- No exact comprehension percentage from lexical coverage.
- No AI-invented etymology, pitch, nuance, or canonical example.
- No decorative graph shipped as proof of learning value.
- No claim that the app reduced review burden until delayed held-out tests show
  non-inferior retention with lower standalone time.

## 13. Required falsification and product-success gates

The Phase-0 product experiment is successful only if:

1. non-AI lookup/save feels immediate;
2. one real thread survives capture, promotion, retrieval, contextual reuse,
   bounded AI exchange, evidence inspection, restart, and export;
3. learner-state dimensions remain separate under success and failure;
4. no passive exposure is counted as recall;
5. the user can end the session cleanly;
6. all user-generated state is inspectable and exportable;
7. the operator voluntarily wants to put a second real encounter through the
   loop.

The build goal must distinguish:

- engineering completion;
- on-device verification;
- operator acceptance;
- scientific validation;
- market validation.

Only the first can be fully closed by an autonomous coding agent in this phase.

Define explicit architectural and product kill criteria. Delete or simplify
architecture that does not beat a cheaper baseline. Do not protect an elegant
graph, model, or AI flow from falsification.

`DONE` means every exact completion predicate passes on refreshed merged main,
the operator trial is recorded, exported data replays successfully, all
receipts are bound to exact SHAs, and an independent review finds no unresolved
P0/P1 issue.

`BLOCKED` is allowed only after safe alternatives are exhausted and the
controller records one precise irreducible blocker, evidence, impact, owner,
and smallest operator action.

Immediately stop mutation on:

- frozen-input integrity failure;
- missing edit or merge authority;
- unresolved source licensing entering fixtures or product data;
- unexplained data loss or replay divergence;
- canonical AI writes bypassing the evidence boundary;
- secret or privacy exposure;
- destructive migration without verified rollback;
- an operator decision whose alternatives materially alter Phase 0.

Time expiry, context pressure, a long backlog, or a merely failing test is not
completion and is not by itself an irreducible blocker.

## 14. Open operator choices

Carry these as visible questions. Use reversible defaults where they do not
block Phase 0:

1. Does Bunki / 分岐 feel right even as a working name?
2. Which real Japanese encounter should be the canonical Phase-0 fixture?
3. What does "interactive" most mean for the later global visualization?
4. Should the future readiness menu discover content, prepare chosen content,
   or both?
5. Should branches normally be guided autopilot or two-path choice?
6. What should "I know this" change: evidence, priority, scheduling promotion,
   or only a label?
7. What correction style should text conversation use?
8. What cloud-content privacy boundary, monthly AI budget, and conversational
   latency are acceptable?
9. Which repository, visibility, license, and deployment account are authorized?

Do not hide these questions, but do not use them as excuses to leave the build
controller vague.

## 15. Quality-control pass before you finish

Before freezing either output, perform and record three adversarial reviews:

### Review A — convergence integrity

- Did you include every accepted Round-1 decision?
- Did you accidentally resurrect a withdrawn Claude or Codex position?
- Does every load-bearing claim have evidence, confidence, or an experiment?

### Review B — architectural executability

- Can one fresh agent identify every package, command, dependency, authority
  boundary, test, and closure predicate?
- Are web/native persistence differences honest?
- Can AI, UI, or Python bypass the TypeScript evidence/domain core?
- Can event replay and export actually reconstruct state?

### Review C — scope, rights, and product truth

- Did Phase 0 absorb deferred Firehose, sync, Observatory, voice, art, or broad
  curriculum work?
- Does any content path rely on unverified scraping or a vague "private use"
  theory?
- Does any UI label inference as fact, coverage as comprehension, exposure as
  retrieval, or one signal as global mastery?

Resolve contradictions before freezing. List any surviving irreducible
disagreement for operator arbitration rather than averaging it away.

## 16. Required final response to the operator

Return:

1. links/paths to every complete output;
2. SHA-256 for every output;
3. a concise explanation of the Phase-0 goal's essence;
4. exact decisions you made while integrating v2;
5. remaining operator gates, ranked by whether they block repository admission,
   execution, native verification, or later phases;
6. whether you recommend immediate execution of the goal or one more independent
   red-team pass;
7. if git write access exists, the branch, commit, and draft PR—never a direct
   main push and never a merge.

Do not execute Output B in this context. The requested deliverable is the
controller that makes the later long-running build disciplined, bounded,
recoverable, and genuinely useful.
