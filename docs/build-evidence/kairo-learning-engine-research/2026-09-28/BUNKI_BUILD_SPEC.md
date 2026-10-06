# Bunki / 回廊 KAIRO — evidence-led learning system

**Research cutoff and specification date: 2026-09-28 (Asia/Tokyo). Status: proposed engineering specification, not an implementation or an efficacy claim.**

## Reading this specification

Build a single local evidence-to-action loop: an attempt produces attributable evidence; the learner can inspect it; a deterministic reducer updates a multidimensional model; every learning surface queries that model; the next unassisted attempt tests whether the adaptation helped. Keep FSRS-6 as the sole review scheduler.

This campaign has ten separately documented research tracks. The implementation specification is the synthesis; the notes preserve supporting findings, uncertainties, and alternatives. External findings carry dated source links. **PROPOSED** denotes our design, including every schema, algorithm, numeric threshold, budget, test target, and effort estimate unless explicitly attributed. **CALCULATED** denotes arithmetic from stated inputs. **UNVERIFIED** means the research could not establish the claim; it does not mean the claim is false. A vendor statement is evidence of what the vendor documents, not proof of learning benefit. Undated live pages were accessed on 2026-09-28; that is an observation date, not a publication date or an archived historical guarantee.

The owner's supplied repository inventory is **USER-SUPPLIED / UNVERIFIED BY REPOSITORY AUDIT**, dated 2026-09-28: a browser app; 22,934-word core, approximately 70,000-entry JMdict index, 45,276 attested sentences, 77 graded articles, 25 in-house mock papers, lessons N5–N2, dojo, drift, four mirror bands, direct Claude BYOK tutor, and chat mining. No public source URL was supplied for these counts. They are planning inputs, not independently verified measurements. This campaign does not claim to have inspected the current branch or reconciled the owner's local builds. Milestone 1 begins by inventorying and testing the actual repository.

### Non-negotiable interpretation of the seven laws

| Law | Executable interpretation |
|---|---|
| One device-owned append-only record; export-only egress | Learner text, audio, summaries, embeddings, model state, identifiers and behavior stay on the device. No analytics, crash payload, cloud ASR, remote tutor prompt, remote retrieval, or automatic nightly mining may leak them. A user-created export file is the only permitted outbound carrier. |
| One derived model | All projections are reproducible from the ledger and the immutable policies/assets named inside it. No hidden server profile; no model database that can override replay. |
| AI proposes; learner confirms; FSRS-6 schedules | AI can propose content/actions/diagnostic hypotheses. It cannot grade, append a review, change a scheduler parameter, or supply a due date. Confirmation does not convert an AI guess into measured evidence. |
| Measured > observed > exposure | Maintain separate channels. Observations can select a diagnostic task; exposures can affect discovery. Neither can establish mastery or a level claim. |
| No readiness number | Show task- and modality-specific evidence by curriculum band, with denominators and uncertainty. Never collapse it into a level score, pass probability, or a label assigning the learner a JLPT level. |
| Personal information is data | Goals, interests, availability, accommodations, language preferences, and prior study enter through record events. No owner name, study plan, preferred topics, or target level in application code or build artifacts. |
| Verify generated Japanese before teaching | Dictionary/reading validation is mandatory but not proof of grammaticality, register or pragmatics. Release only content meeting a specified validation class; quarantine unverified teaching material. |

**Architecture conflict resolved without changing a law:** live personalized Claude, cloud speech, a hosted memory service and automatic cloud sync do not fit export-only egress. The executable baseline uses local inference, attested material and explicit local tools. A manually exported, reviewed bundle can be processed outside Bunki and its candidate results imported. Continuous cloud variants are researched and costed, but remain conditional on an explicit future change to law 1. A consent toggle or BYOK does not by itself satisfy the current law.

## A. Where the field stands

### A1. The comparison that changes the build

Knowledge-aware selection, adaptive furigana and persistent conversation context already have documented precedents. This specification therefore treats them as product requirements, not inventions. The detailed teardowns in Tracks 01 and 02 preserve price/currency/billing/platform differences, sampled praise/complaints, proprietary-algorithm gaps and study limitations. They are documentation-based teardowns; no paid accounts or purchases were used. “Top complaints” means sampled recurring themes where identifiable reports existed, not a statistically representative ranking.

### A2. Twenty-seven comparators, twelve capabilities

**D = documented; P = partial, integration-dependent or vendor claim with limits; U = UNVERIFIED; N = explicitly excluded in the cited feature list; N/A = not applicable to the documented tool role.** No U cell means “absent.” The two tables are halves of one twelve-capability matrix. The source key in each row resolves to dated primary URLs below and fuller source/feature boundaries in the matching track. All observations were accessed **2026-09-28**. Unless a date is stated in the source key, its page is undated; study/report dates do not imply a feature was launched then.

“Item model” includes cards/word status and does not imply Bunki's richer graph. “State changes content” includes annotation/unlock/selection, not necessarily generation. “Local/export” can mean partial portability; only the cell's stated scope is verified. “Verified JP” means a documented generated-Japanese validation process, not human-authored content or natural-sounding speech. “Japanese efficacy” distinguishes external analysis from an independent causal Japanese-learning trial.

| Comparator / source | Japanese support | Cross-session tutor memory | Explicit item model | State changes content | Immersion mining | FSRS-6 |
|---|---|---|---|---|---|---|
| Migaku [A01] | D | U | D words | D coverage | D | U |
| Jumpspeak [A02] | D AI only | U | U | P | U | U |
| Todaii [A03] | D | U | P saved vocab | U | P import/lookup | U |
| Speak [A04] | D | P durable learning activity; personal-fact recall U | D vocab scores; JP parity U | D documented; JP parity U | U | U |
| Langua [A05] | D | D | P saved vocab/error topics | D | D; YouTube-import availability U | U |
| Praktika [A06] | D | D vendor progress memory | U | P | P uploads, not card pipeline | U |
| TalkPal [A07] | D | U | U | P | U | U |
| Duolingo Max [A08] | D | D facts | P course state; exact item schema U | D course constraints | U | U |
| Busuu [A09] | D course | U | P vocabulary review | P | U | U |
| Speekl [A10] | D | D vendor | U | P | P saved speech vocab | U |
| Kitzuna [A11] | P historical | U | U | U | U | U |
| iimu [A12] | U | P model, not facts | P word/grammar claim | P | U | U |
| Umi [A13] | D | U | P vocabulary | P | P clip-based | U |
| YuSpeak [A14] | D | U | P progress/weakness | P AI review | U | U |
| Anki [A15] | D: Japanese cards | U | D: cards | P: review selection | P: integrations | D: compatible releases |
| JPDB [A16] | D | U | D: vocab/kanji | D: i+1/prerequisites | D: pasted text | U: proprietary SRS |
| WaniKani [A17] | D | U | D: item SRS | D: prerequisite unlock | U | N/A: documented stage SRS |
| Bunpro [A18] | D | U | D: grammar/vocab | D: contexts/furigana | P: existing study content | U |
| Satori Reader [A19] | D | U | D: words/kanji | D: display | D: story cards | U |
| LingQ [A20] | D | U | D: word statuses | D: reader | D: imports | U |
| Renshuu [A21] | D | U | D; vector details provisional | D: display | U | U |
| Yomitan [A22] | D | N/A: dictionary | P: Anki | U | D | P: through Anki |
| asbplayer [A23] | D: annotations | N/A: media tool | D: word statuses | D: annotations | D | P: through Anki |
| Language Reactor [A24] | D | U | U | U | P: imported media/text | U |
| mokuro [A25] | D | N/A: OCR | U | U | P: OCR+dictionary | P: external chain only |
| Jimaku [A26] | D: assets | N/A: index | N/A | N/A | P: subtitle source | N/A |
| subs2srs [A27] | D: supported input | N/A: converter | N/A | N/A | D | P: export to Anki |

| Comparator / source | Speech conversation | Listening material | Production feedback | Local/export ownership | Verified generated Japanese | Japanese efficacy |
|---|---|---|---|---|---|---|
| Migaku [A01] | U | D native media | U | U | U | U |
| Jumpspeak [A02] | D | U JP library | D | U | U | U |
| Todaii [A03] | D | D | D | U | U | U |
| Speak [A04] | D | P course audio | D; English-only dedicated pronunciation coach | U | U | U |
| Langua [A05] | D | D | D | P CSV | U | U |
| Praktika [A06] | D | P course audio | D | U | U | U |
| TalkPal [A07] | D | U separate library | D | U | U | U |
| Duolingo Max [A08] | D | D lessons | P Japanese feature detail U | U | U | U |
| Busuu [A09] | N AI list excludes JP | D course | D community; AI JP U | U | U | P externally analyzed; vendor-funded pre/post |
| Speekl [A10] | D | U separate library | D vendor | U | U | U |
| Kitzuna [A11] | U | U | P historical | U | U | U |
| iimu [A12] | P repetition, conversation U | P generated | P | U | U | U |
| Umi [A13] | U open conversation | D | P speech practice | U | U | U |
| YuSpeak [A14] | U open conversation | D native videos | P | U | U | U |
| Anki [A15] | U | P: supplied audio | P: self-rating | D: local + full export | U | U |
| JPDB [A16] | U | P: examples/audio | U | U | U | U |
| WaniKani [A17] | U | U: word audio ≠ listening course | P: bounded review answers | P: API | U | U |
| Bunpro [A18] | U | D: example audio | D: bounded alternate answers | U | U | U |
| Satori Reader [A19] | U | D: human story audio | P: human discussion help | P: offline; full export U | N/A: human-authored QA | U |
| LingQ [A20] | P: tutoring offer; AI voice loop U | D | P: dictation/writing service | P: vocabulary export/offline | U | U |
| Renshuu [A21] | U | D: drills | D: bounded exercises | U | U | U |
| Yomitan [A22] | N/A | P: lexical audio | N/A | D: local dictionaries/export | N/A | U |
| asbplayer [A23] | N/A | D: user media | N/A | D: local media/mining | N/A | U |
| Language Reactor [A24] | U | D: media | U | U | U | U |
| mokuro [A25] | N/A | N/A | N/A | D: offline OCR/files | N/A | U |
| Jimaku [A26] | N/A | P: text asset only | N/A | P: downloadable asset; rights U | N/A | U |
| subs2srs [A27] | N/A | D: supplied media | N/A | D: TSV/media files | N/A | U |

**Matrix source key.** Full publication/update dates and precise claims are recorded in Tracks 01–02. “Undated” below refers to the public source, not the access date. A source documents only the positive/partial cells it supports; uncertainty cells report this research's limits.

- **A01 Migaku** — [source 1](https://migaku.com/learn-japanese). Undated live source; accessed **2026-09-28**.
- **A02 Jumpspeak** — [source 1](https://www.jumpspeak.com/pricing); [source 2](https://help.jumpspeak.com/en/articles/14668752-5-5-feedback-quality). help 2026-07-31; pricing undated; accessed **2026-09-28**.
- **A03 Todaii** — [source 1](https://apps.apple.com/us/app/todaii-learn-japanese-n5-n1/id1107177166). Undated live source; accessed **2026-09-28**.
- **A04 Speak** — [source 1](https://help.speak.com/en/articles/11565779-what-are-made-for-you-custom-lessons); [source 2](https://help.speak.com/en/articles/5358417-what-s-the-difference-between-premium-and-premium-plus). help 2025-12-18 / 2025-11-07; accessed **2026-09-28**.
- **A05 Langua** — [source 1](https://languatalk.com/ai-japanese-tutor); [source 2](https://support.languatalk.com/article/152-see-the-latest-updates-on-langua). landing undated; changelog entries 2024–2026; accessed **2026-09-28**.
- **A06 Praktika** — [source 1](https://apps.apple.com/us/app/praktika-ai-language-tutor/id1624701477). Undated live source; accessed **2026-09-28**.
- **A07 TalkPal** — [source 1](https://talkpal.ai/frequently-asked-questions/). Undated live source; accessed **2026-09-28**.
- **A08 Duolingo Max** — [source 1](https://blog.duolingo.com/ai-and-video-call/); [source 2](https://blog.duolingo.com/video-call/). Undated live source; accessed **2026-09-28**.
- **A09 Busuu** — [source 1](https://help.busuu.com/hc/en-gb/articles/21862192336402-What-are-Busuu-Conversations-and-how-can-they-help-me-learn-a-language); [source 2](https://www.comparelanguageapps.com/reports/Busuu_2025_study.pdf). AI help 2026-02-17; study 2025-01; accessed **2026-09-28**.
- **A10 Speekl** — [source 1](https://speekl.ai/); [source 2](https://speekl.ai/blog/speekl-ai-is-live). release 2026-09-01; product page undated; accessed **2026-09-28**.
- **A11 Kitzuna** — [source 1](https://www.reddit.com/r/duolingojapanese/comments/1jxlliv/); [source 2](https://kitzuna.site/). developer post 2025-04-12; site undated; accessed **2026-09-28**.
- **A12 iimu** — [source 1](https://iimu.app/). Undated live source; accessed **2026-09-28**.
- **A13 Umi** — [source 1](https://umiapp.co/); [source 2](https://apps.apple.com/jp/app/umi-%E8%A8%80%E8%AA%9E%E5%AD%A6%E7%BF%92/id1628381103). site undated; store history 2025; accessed **2026-09-28**.
- **A14 YuSpeak** — [source 1](https://play.google.com/store/apps/details?hl=en&id=com.yuspeak). store update 2026-08-27; accessed **2026-09-28**.
- **A15 Anki** — [source 1](https://docs.ankiweb.net/deck-options.html); [source 2](https://docs.ankiweb.net/exporting.html); [source 3](https://apps.apple.com/us/app/ankimobile-flashcards/id373493387). manual undated; relevant store release 2025-07-21; accessed **2026-09-28**.
- **A16 JPDB** — [source 1](https://jpdb.io/); [source 2](https://jpdb.io/faq). Undated live source; accessed **2026-09-28**.
- **A17 WaniKani** — [source 1](https://knowledge.wanikani.com/wanikani/srs-stages/); [source 2](https://docs.api.wanikani.com/20170710/). Undated live source; accessed **2026-09-28**.
- **A18 Bunpro** — [source 1](https://bunpro.jp/pricing); [source 2](https://bunpro.jp/support/account/Review-Settings). pricing undated; settings 2025-03-11; accessed **2026-09-28**.
- **A19 Satori Reader** — [source 1](https://www.satorireader.com/features); [source 2](https://www.satorireader.com/ai). Undated live source; accessed **2026-09-28**.
- **A20 LingQ** — [source 1](https://www.lingq.com/en/signup/); [source 2](https://www.lingq.com/en/ios-app-support/). Undated live source; accessed **2026-09-28**.
- **A21 Renshuu** — [source 1](https://www.renshuu.org/index.php?page=main/landing). Undated live source; accessed **2026-09-28**.
- **A22 Yomitan** — [source 1](https://yomitan.wiki/); [source 2](https://yomitan.wiki/anki/). site undated; mining docs 2026-02-25; accessed **2026-09-28**.
- **A23 asbplayer** — [source 1](https://github.com/asbplayer/asbplayer); [source 2](https://docs.asbplayer.dev/docs/guides/one-click-mining/). Undated live source; accessed **2026-09-28**.
- **A24 Language Reactor** — [source 1](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm?hl=en). store update 2026-07-01; accessed **2026-09-28**.
- **A25 mokuro** — [source 1](https://github.com/kha-white/mokuro). Undated live source; accessed **2026-09-28**.
- **A26 Jimaku** — [source 1](https://jimaku.cc/). Undated live source; accessed **2026-09-28**.
- **A27 subs2srs** — [source 1](https://subs2srs.sourceforge.net/); [source 2](https://sourceforge.net/projects/subs2srs/). manual undated; project update 2017-10-01; accessed **2026-09-28**.

### A3. Three commitments to test, not unverified exclusivity claims

The requested assertion that *no product does these three things* is **UNVERIFIED**. This review did not establish a competing complete implementation of the following contracts, but public documentation cannot prove a universal negative. Bunki should commit to them and publish reproducible demonstrations:

1. **Reconstructable learning evidence.** One learner-owned export reproduces every active knowledge claim, uncertainty and scheduling decision; correcting a source propagates through every surface. Measured, observed and exposure channels remain separate.
2. **A learner-confirmed whole-app response to evidence.** A tutor, reader, dojo, cards, shelf and planner query the same model, with reading/sense/form/grammar and receptive/productive distinctions. AI never grades or schedules; FSRS-6 alone schedules reviews.
3. **Verified teaching plus measured delayed transfer.** Each teaching item has inspectable linguistic/rights provenance; each efficacy claim names a population, comparison, instrument, effect size, uncertainty and delayed unassisted outcome.

These are **PROPOSED product commitments**, not existing Bunki capabilities or proof of superiority. The commercial thesis is that learners value inspectable, correct adaptation enough to adopt it; willingness to pay and comparative efficacy are **UNVERIFIED**.


## B. The learner engine

Everything in this section is **PROPOSED** unless a research source is explicitly attached. The initial engine is an inspectable evidence reducer and graph-backed task selector. It is not a deep knowledge-tracing model trained on one person's history.

### B1. Authority, replay and clocks

The device keeps an append-only event log and a content-addressed local blob store. An export contains both, their hashes, the applicable schema and reducer specifications, scheduler/configuration history, and asset-manifest identifiers. Licensed public asset packages may be distributed separately, but replay must fail explicitly if a required version cannot be recovered. Exporting only events and silently using the newest dictionary is not reproducible.

Use one designated writer device in the initial product. The local append transaction allocates a monotonically increasing sequence, validates the schema and capability receipt, and binds the preceding row hash. Wall-clock timestamps are evidence, not sorting keys. Multiple browser tabs serialize appends through the storage transaction. A broken chain, duplicate sequence, missing blob, unsupported schema, or invalid import never silently enters the authoritative record.

Time must not secretly change the model. `reduce(ledger)` uses the last accepted `clock.checkpoint` and active policy recorded in that same ledger. On opening a session or refreshing due reviews, the runtime appends a checkpoint; it is a system event, not an AI action. A backward clock change produces a `clock.anomaly` and pauses time-sensitive scheduling until the learner resolves it. A what-if query at a different time is clearly a simulation, never persisted authority. Pin FSRS package version, parameters, rounding behavior, time units and deterministic fuzz seed. Record upgrades as events and retain the earlier engine for historical replay.

```ts
type Event = {
  schema: string;
  recordId: string;                 // random local identifier, never an account key
  eventId: string;
  seq: number;
  previousHash: string | null;
  occurredAt: string | null;         // source-reported UTC time
  recordedAt: string;               // writer-observed UTC time
  clockCheckpointId: string | null;
  actor: "learner" | "runtime" | "human_assessor";
  kind: EventKind;
  payload: unknown;                 // discriminated, validated per row kind
  source: {
    surface: string;
    attemptId?: string;
    turnId?: string;
    assetId?: string;
    assetHash?: string;
    span?: {start: number; end: number; unit: "unicode_codepoint"};
    audioSpanMs?: {start: number; end: number};
    generator?: {provider: string; model: string; promptHash: string};
  };
  evidence: {
    tier: "measured" | "observed" | "exposure" | "administrative";
    rubricId?: string;
    scorer?: "fixed_key" | "learner_self_rating" | "human_assessor";
    assistanceBeforeCommit: "none" | "hint" | "lookup" | "revealed" | "unknown";
    responseCommittedAt?: string;
    feedbackAfterCommit?: Array<{kind: string; at: string}>;
    validity: "eligible" | "practice_only" | "disputed" | "invalid";
    diagnosticTargets: string[];
  };
  confirmationReceiptId?: string;
  policyHash: string;
  rowHash: string;
};
```

Hash canonical serialized bytes, excluding `rowHash`; specify encoding, object-key order and number normalization in a shared test vector. A hash chain detects accidental or post-export alteration against a trusted prior checkpoint; it does not prove that the device owner answered honestly or that a compromised application did not rewrite an entire chain. Do not market it as tamper-proof certification.

### B2. Row kinds and admission rules

| Row kind | Essential payload | Tier / effect |
|---|---|---|
| `record.created`, `policy.activated`, `asset.manifest` | schema/reducer/FSRS versions; hashes; license metadata | Administrative; establishes deterministic dependencies. |
| `goal.set`, `goal.revised`, `preference.set` | can-do goals, optional exam/date, modalities, interest tags, daily budget, accessibility/language preferences | Administrative; personal-as-data. An exam target describes intent, not attained ability. |
| `clock.checkpoint`, `clock.anomaly`, `clock.resolved` | previous/new clock, timezone, resolution | Administrative; makes time explicit. |
| `session.started`, `session.ended`, `utterance.recorded` | transcript/blob, speaker, capture scope | Observed/exposure; no mastery credit simply for conversing. |
| `proposal.created`, `proposal.confirmed`, `proposal.rejected`, `proposal.expired` | typed action, dependencies, exact payload hash, learner receipt | Audit only until a permitted command is confirmed; AI is recorded as generator, never ledger writer. |
| `observation.accepted` | diagnostic code, target(s), original span, interpretation, alternatives, extractor version | Observed; selected by learner from a proposal. Never a graded review. |
| `exposure.recorded` | source span, completion/lookup status, nodes encountered | Exposure only; no automatic knowledge promotion. |
| `attempt.started`, `attempt.answered` | immutable task, response, declared targets, randomization, assistance | Attempt evidence; answering alone does not assert correctness. |
| `attempt.scored` | fixed answer-key result or assessor/learner rubric, scorer, criterion vector | Measured when valid and unassisted. AI rubric suggestions are excluded. |
| `review.rated` | card-version, shown/revealed timestamps, learner's Again/Hard/Good/Easy, attempt link | Measured with self-rating provenance; sole input route to an ordinary FSRS review transition. |
| `card.created`, `card.revised`, `card.suspended` | typed card content, objective, direction, source, validation bundle | Content/configuration; changes require confirmation. Material target changes create a new card identity. |
| `scheduler.configured`, `scheduler.parameters_accepted` | FSRS-6 engine ID, retention choice, parameters, training-set hash | Administrative; optimizer can calculate a candidate locally; learner accepts; AI cannot author these rows. |
| `session.summary_accepted` | structured memory, supporting row IDs, uncertain items, pending tasks | Observed memory only; no new evidence and no re-counting of summarized events. |
| `plan.accepted`, `plan.revised`, `plan.completed` | selected activities and budget, evidence reasons, model hash | Administrative/exposure; completion is not measured mastery. |
| `assessment.recorded` | instrument/version, domain subscores, administration conditions, external report hash | Measured by domain; a test paper is not proof of productive skill. |
| `evidence.disputed`, `evidence.invalidated`, `correction.appended` | target row and reason/replacement link | Append-only corrections; old rows remain inspectable and excluded as specified. |
| `export.created`, `import.accepted`, `ownership.transferred` | manifest/hash, selected scope, fork/handoff status | Administrative; import preview and explicit confirmation required. |
| `privacy.payload_redacted` | target payload envelope, reason, key-destruction receipt | Retains audit metadata; reducer treats unavailable evidence as withdrawn. See G for erasure limitations. |

A learner can dispute an observation without rewriting history. A correction does not create a second success/failure; it changes which scored result is active for the original attempt. Reject cyclic supersession, orphan references, score rows without attempts, and “measured” rows whose sole source is an AI statement. Legacy imports without provenance retain `unknown` assistance and limited validity until resolved; never fabricate missing timestamps or convert old chat summaries into measured history.

### B3. Stable nodes and relationships

| Node kind | Identity and distinctions |
|---|---|
| Word / lexeme | Namespace + dictionary release + stable entry identifier, with aliases across releases. Written form is not the identity. Homographs remain distinct. |
| Sense | Lexeme + source sense key + version; preserve restrictions, register and POS. Sense reordering in a dictionary update requires an explicit migration map. |
| Kanji | Unicode code point with explicit variant relationship, not an unqualified glyph string. |
| Reading | Lexeme/sense + reading string + orthographic context; optionally kanji-in-word reading. Knowing one reading of 生 gives no automatic credit to another. |
| Grammar point | Versioned, editorially maintained concept ID with source/license, accepted constructions and counterexamples. |
| Form | Morphological feature bundle and scoped realization, linked to lexeme/grammar where relevant: tense/aspect, polarity, politeness, voice, conditional, etc. |

Edges include `has_sense`, `has_reading`, `contains_kanji`, `realizes_form`, `illustrates_grammar`, `often_confused_with`, `supports_task`, and editorial `prerequisite_hypothesis`. Every edge has origin/version and confidence class. A prerequisite edge is a sequencing hypothesis, not a claim that knowledge transfers with certainty. Tokenization ambiguity is represented as alternatives; do not update all possible senses/readings for one token.

**Identity migration — PROPOSED:** keep original dictionary-release IDs on every attempt/card. A separately reviewed and learner-accepted versioned identity map may establish one-to-one equivalence for a successor entry/sense/reading; replay carries evidence through that explicit equivalence only. Renumbering without such a map is not evidence continuity. Splits, merges or changed sense boundaries remain ambiguous: retain the old evidence node, create separate unmeasured successors and propose discriminating probes. Never copy one old success to every successor. Existing FSRS card histories remain attached to their original card/content identity; a materially changed target becomes a new confirmed card with empty initialization.

**PROPOSED derived representation:**

```ts
type NodeState = {
  id: string;
  kind: "word" | "kanji" | "reading" | "sense" | "grammar" | "form";
  dimensions: Record<"read_recognize" | "listen_recognize" |
    "speak_recall" | "write_recall", EvidenceChannel>;
  observations: {rowIds: string[]; unresolvedCodes: string[]};
  exposure: {sourceIds: string[]; encounterCount: number};
  uncertainty: {coverageGaps: string[]; contradictions: string[]};
  lastEligibleAttemptAt?: string;
  relatedCardIds: string[];          // FSRS is card/direction-specific
};
type EvidenceChannel = {
  eligibleAttemptIds: string[];
  independentItemCount: number;
  successes: number;
  failures: number;
  rubricEvidence: Record<string, string[]>;
  assistedAttemptIds: string[];
  strength: "unmeasured" | "limited" | "repeated" | "mixed";
  taskFamilyEstimates?: Array<{
    taskFamily: string; estimate: number; interval: [number, number];
    method: string; calibrationStatus: "uncalibrated" | "validated";
  }>;
};
type LearnerModel = {
  ledgerHead: string;
  policyHash: string;
  effectiveClock: string;
  nodes: Map<string, NodeState>;
  cards: Map<string, DerivedFSRS6State>;
  confusions: ConfusionEdge[];
  goals: Goal[];
  frontier: FrontierCandidate[];
  bands: EvidenceBandVector[];      // never a scalar aggregate
};
```

Speech/writing modalities are not aliases for the existing “production” band. Preserve the four-band mirror as a compact view, with a modality breakdown and visible listening gaps; add listening as a separate inspectable dimension when instruments exist. No model threshold assigns an overall learner level.

### B4. Evidence update rules

Measured evidence retains the actual observation and its limits. An unassisted reading-recognition answer can update that item/task family; it cannot prove spoken production, unseen senses or every kanji prerequisite. A human-rated production attempt records criterion-level outcomes, not an AI-written grade. A multiple-choice success and a free recall success remain different task families. Chance levels matter only when the task design defines them.

Observed evidence creates a revisable hypothesis and a priority for a diagnostic probe. Repeating an LLM interpretation across summaries does not create independent evidence. Track recurring sources by `attemptId`/`turnId` and stable observation key. Exposure increments encounter/source statistics and can suppress repetitive recommendations; it contributes zero successes to measured state.

For initial transparent uncertainty, keep raw denominators and last unassisted outcomes. Where a homogeneous binary task family has enough independent observations, an optional Beta-binomial estimate can be shown internally with a documented prior; use **PROPOSED Beta(1,1)** only as a descriptive smoothing convention, not a calibrated probability of language knowledge. Repeated rehearsals are correlated. Group by item variant/context and do not pretend the posterior interval captures all uncertainty. Do not combine task families, AI confidence, exposure counts or FSRS retrievability into one posterior.

FSRS retrievability is a card recall prediction under its schedule model. It is not the probability of knowing a word in arbitrary speech and is never a level-band score. Use it only for the associated card/direction and show its provenance separately from transfer probes.

```text
REDUCE(ledger):
  verify chain, schema, references, policy/assets and correction graph
  state := empty state using policy activated in ledger
  for row in append order:
    if administrative: apply explicit configuration/clock/goal transition
    if audit-only proposal or summary: retain references; add no evidence counts
    if row is invalidated/superseded: resolve active view for original attempt
    if eligible measured scoring:
      assert scorer is fixed_key or learner_self_rating or human_assessor
      assert task existed before answer; source and assistance are recorded
      targets := task.declaredDiagnosticTargets
      update only targeted modality/criterion with one active result per attempt
    if accepted observation: add hypothesis keyed by source span and target
    if exposure: update exposure channel only
    if learner review rating:
      assert permitted card, rating and timestamps
      replay pinned FSRS6 transition with deterministic seed
  compute confusions, frontier and per-band vectors from retained evidence
  return canonical state + hash
```

Implementation may build invalidation/correction indexes first and replay active evidence chronologically. Tests must prove that the optimization equals a reference reducer; do not let an append-after-correction leave stale increments behind. Rebuild cached projections when a historic event is invalidated. Caches may persist as disposable performance aids only if labeled by exact ledger head and policy hash and ignored on any mismatch.

**Normative correction semantics — PROPOSED:** build the correction/withdrawal overlay before reducing evidence. A valid replacement review occupies the original review's sequence slot and effective timestamp; its later correction timestamp remains audit metadata. Removal omits that transition; subsequent original reviews still replay in their original order. Corrections can change a learner-origin rating only through an explicit learner correction, never an AI-generated grade. A dispute excludes the affected result from knowledge claims pending resolution, but leaves the historic FSRS rating intact unless the learner separately corrects/invalidates that rating.

Accepted scheduler configuration records `applyMode: future_reviews_only | recompute_due_with_fsrs6`. The default is `future_reviews_only`: existing due values remain the result of their last historical FSRS transition until the next review. The other mode explicitly reruns the pinned FSRS-6 adapter's due computation at the accepted checkpoint; a learner confirms this configuration action and no model supplies dates. An accepted optimizer vector remains explicit historical configuration if a training review is later withdrawn, but its lineage is marked stale. Offer a local deterministic refit and new confirmation; never optimize silently during replay.

**Scheduler input whitelist — PROPOSED:** confirmed card lifecycle, explicit accepted scheduler configuration, trusted clock checkpoints and learner-origin `review.rated`. Placement, probes, production rubric outcomes, observed errors and exposure cannot seed stability/difficulty, backdate a first review or alter due state. A new card uses the pinned adapter's empty-card initialization. `attempt.scored` and `review.rated` for the same retrieval share one `attemptId`: one measured opportunity, one scheduler transition, not two successes. Research probes do not write FSRS grades or due dates.

**Assistance phase — PROPOSED:** record a response-commitment boundary. For ordinary self-rated cards, reveal closes the retrieval phase and preserves that the commitment was self-reported; the later rating has learner-self-rating provenance. Hints/lookups/answer exposure before commitment make the attempt assisted; normal feedback after commitment does not. A fixed answer key may score a committed response, but an AI-suggested rubric score shown before the learner rates is not independent human assessment and cannot enter the measured channel.

### B5. Frontier, confusions and sentence selection

The frontier is a set of useful next diagnostic or practice tasks with reasons, not a numeric level. A confusion edge is directional and modality-specific: `(source node, competing node, error code, context)`, supported by original attempts or observed hypotheses. Store both numerator and opportunity denominator when available. A confusion rate without opportunities is not a rate.

**PROPOSED selection policy:** first satisfy due FSRS work within the learner's chosen budget; then cover active goals and measured weaknesses; then investigate observation-only hypotheses; then explore under-measured areas. A learner may choose a different activity, but the planner cannot rewrite review due dates. Use deterministic tie-breaking on `hash(semanticStateHash, candidateId, policyHash)`.

```text
SELECT_SENTENCE(model, goal, constraints):
  candidates := licensed + pedagogically_released + locale_appropriate bank
  for sentence in candidates:
    annotations := pinned token/sense/reading/grammar analysis
    ambiguity := unresolved annotation spans
    target := goal-relevant measured gap OR hypothesis needing a probe
    burden := all other unmeasured/weak annotated units, grouped by span
    painDensity := distinct implicated spans / eligible annotated spans
    coverage := [conservatively supported tokens / counted tokens,
                 upper-bound potentially supported tokens / counted tokens]
    reject if unlicensed, validation incomplete, or target not present
    classify mode: diagnostic / deliberate practice / supported reading
  choose lexicographically by:
    chosen mode's burden bound; target match; source diversity;
    lack of recent repetition; learner interests; stable tie-breaker
  return sentence + exact target + burden/coverage definitions + evidence reasons
```

An “i+1” practice candidate has **PROPOSED one target uncertainty group**, not one unknown surface token; repeated occurrences count as one group, while an unknown reading and grammar construction can create separate burdens. If no sentence meets the burden bound, explain that and offer a supported reading or an easier attested example. Never fabricate an example just to satisfy the selector. Content coverage is a property of this annotated text under this model; it is not readiness. Show tokenizer version, whether proper names/numbers are counted, and uncertainty from ambiguous segmentation.

**PROPOSED confusion remediation:** elicit an unassisted contrast on a new context; offer a referenced explanation after the answer; use learner-confirmed separate-direction cards if requested; later test transfer on another context. If a particle omission could reflect typing shorthand, comprehension strategy, or a grammatical mistake, keep the alternatives until a diagnostic prompt distinguishes them.

### B6. Placement and calibration

Placement selects useful starting tasks. It does not certify a JLPT band. Start with goals, preferred modalities, script familiarity and accessibility as self-report data. Sample lexical recognition, contextual sense, reading retrieval, sentence-form interpretation and elicited production separately. Offer optional listening only when the device and audio instrument are verified. Do not infer writing/speaking from a reading test.

**PROPOSED first-session budget:** offer a short placement of 12–20 minutes with a stop-anytime option; begin with 4 anchors per requested modality and adapt within a maximum of 40 scored items. These are product budgets requiring pilot calibration, not validated test lengths. Without a calibrated item bank, use a transparent staircase across editorial difficulty strata; do not call it IRT. A response affects only its declared construct. Reuse is logged and contaminated items excluded from independent placement estimates.

```text
PLACE(record, modality):
  request learner goal and measurement consent
  select untaught anchor with fixed key/human rubric and licensed content
  record answer, confidence self-report, latency, aids and any skip
  score with fixed key or human rubric (AI cannot score)
  if assisted: retain practice record; offer an unassisted parallel item
  choose next difficulty stratum from recent eligible responses
  interleave neighboring-stratum checks and response-quality checks
  stop on budget, fatigue, learner request or the policy task cap
  report: items/tasks demonstrated; contradictory evidence; untested areas
  propose next-week activities linked to goals; learner confirms
```

Yes/no word tests can be a low-burden inventory only if false-alarm behavior is measured using a defensible item design; never equate checked words with measured knowledge. Fake-word generation needs Japanese orthographic/morphological controls and human review. Keep early placement primarily on real-word and contextual tasks until that instrument exists.

Calibration comes from held-out future outcomes, not confidence asserted by the tutor. Freeze each prediction before revealing its answer. Score probability forecasts per task family using Brier loss and log loss; inspect reliability plots by modality and evidence count. A no-probability baseline must be included. Move from descriptive intervals to calibrated predictions only after held-out results justify it. The mirror always retains the underlying examples and uncertainty.

### B7. Versioned initial policy manifest — PROPOSED defaults, not validated learning thresholds

These definitions remove implementation ambiguity. They are deliberately simple and must be versioned in the ledger; changing them changes the policy version, not past evidence. They never create a level label or scalar readiness.

| Predicate / policy | Initial executable definition |
|---|---|
| Independent opportunity | Unique `attemptId` with a committed unassisted response and eligible fixed-key/human/self-rating scorer. Report self-ratings separately. For confidence summaries, repeated identical task/content hash contributes at most one recent context unit; retain all attempts for audit and FSRS. |
| Evidence window | Last **3** eligible distinct-context outcomes within a node/modality/task family, ordered by original attempt slot; raw lifetime counts remain visible. No outcomes → `unmeasured`; both success and failure in the window → `mixed`; **3** successes across at least **2** session dates → `repeated`; otherwise → `limited`. Open production rubric outcomes are not forced into binary success without a previously specified criterion key. |
| Optional probability | Default **null**. A descriptive Beta(1,1) estimate may be enabled only for binary homogeneous task families with at least **5** distinct-context opportunities; label `uncalibrated`, never combine modalities and never display as mastery. This minimum is an engineering choice, not proof of statistical adequacy. |
| Conservative text support | Selected word/sense and contextual reading each have `repeated` evidence in the relevant modality, latest support no older than **30 days** at the ledger clock, and no unresolved measured contradiction. “Possible support” includes a measured success or explicit learner self-report of knowing the target, with no later measured failure. Tutor observation and exposure alone are excluded from both counted support sets. |
| Coverage denominator | Content-word/pedagogical-span count from the pinned annotation contract; punctuation excluded; names/numbers explicitly labeled and reported separately. Repeated occurrences count toward token coverage, unique target groups toward burden. Ambiguous segmentation produces bounds; zero denominator returns `null`, never 100%. |
| Burden groups | Union overlapping unresolved lexical/sense/reading/form/grammar spans by shared target/context; do not double-count the same unresolved phenomenon. A target with a known spelling but unknown reading remains a burden in a reading-retrieval task. |
| Diagnostic/i+1 practice filter | Exactly **1** target uncertainty group and **0** other unresolved groups. If none fits, return `no_fit` and propose a supported alternative. |
| Supported-reading filter | At most **3** unresolved groups per **50** counted spans, rounded up by text block; a learner may explicitly relax it. This is an adjustable burden budget, not an empirically validated comprehension threshold. |
| Placement staircase | Editorial strata ordered from basic to advanced; begin at learner-requested stratum, or basic if no preference. Two consecutive eligible correct answers in a modality move one stratum up; one eligible incorrect answer moves one down; bounds clamp. A skip/assisted/ambiguous item changes no stratum and selects a different reviewed item. After every **4** eligible items, insert one neighboring-stratum check. No precision stop until a validated estimator exists. |
| Placement stopping | Stop at learner request, declared session budget, or **40** total presented tasks; allow a modality to remain unmeasured. The **4** initial anchors per selected modality count toward this same cap. Do not force a full battery when time is short. |
| Selection ties | Lexicographic criterion order in B5, then a stable hash of semantic evidence/configuration digest + candidate ID. Audit-only row changes do not reshuffle candidates. Due-card selection includes the explicit clock and FSRS queue. |

The full runtime manifest also fixes tokenizer normalization/segmentation, asset hashes, binary-scoring key versions, allowed task forms, curriculum-map versions and numerical serialization. Acceptance fixtures must compare not just final counts but exact evidence labels, next placement task, coverage denominators and reason codes across implementations. This initial policy must be benchmarked against simpler fixed-selection baselines before any claim that it improves learning.

## C. The sensei

### C1. Stateful memory with no second learner profile

**PROPOSED architecture:** local transcript archive → accepted summary rows with supporting IDs → deterministic structured context assembled for the current task → restricted inference → typed proposals → local validation → learner confirmation → allowed host command. Every arrow that changes the record is mediated by the host. The model never receives storage, filesystem, network or scheduler write access.

A session summary records the topics discussed, learner-stated preferences, unresolved questions, accepted observations and promised follow-up. It distinguishes a direct quote from a tutor inference. Summaries are navigation aids; they do not duplicate evidence counts or overwrite an earlier goal. Retrieve the original span before presenting a specific remembered error as fact. A summary correction invalidates the summary's affected fields without deleting the underlying conversation.

Local retrieval begins with exact IDs, task tags and a local text index; add local embeddings only after testing whether they improve retrieval of specific learner facts. Store embedding-model identity in cache metadata, rebuild from the ledger, and never treat nearest-neighbor similarity as evidence strength. Deduplicate summary and original transcript hits. Defend against prompt injection in imported content and past messages: retrieved text is quoted data, not instructions.

**PROPOSED 6,000-token context budget**, an engineering cap rather than an empirical optimum:

| Block | Tokens | Contents and authority |
|---|---:|---|
| Policy and tool contracts | 1,800 | Laws, abstention, tool schemas; static versioned prefix. |
| Referenced teaching constraints | 1,200 | Verified source excerpts, permitted task templates, content restrictions. |
| Learner evidence snapshot | 1,200 | Goals from record; measured examples and uncertainty; separate observations. |
| Relevant archive | 1,000 | Quoted spans + accepted summary pointers; no new conclusions. |
| Current task / recent dialogue allowance | 800 | Prompt-specific material; trim by relevance and retain safety rules. |

Token counts are provider/model tokenizer dependent; the local assembler measures them. The cloud cost scenario in G separately assumes a reusable 6,000-token prefix plus fresh-turn tokens; it is an explicit stress scenario, not a claim that the entire live context remains cacheable after every update.

### C2. A tutor tool call is a proposal

The tutor has no general shell, network, arbitrary SQL or write capability. Each tool invocation appears as a concrete proposed action. The learner can confirm an individually listed action or a displayed finite batch. Read-tool confirmation can be one click for a displayed batch; it is not an unlimited session grant. Application surfaces use pure queries directly, without pretending every render is an AI tool call.

| Tool proposal | Input / result | Confirmation and permitted effect |
|---|---|---|
| `inspect_evidence` | node IDs, modality → supporting attempts and uncertainty | Learner confirms local read scope. No mutation. |
| `retrieve_archive` | question + scope → original spans and summary links | Learner confirms selected local archive scope. No remote retrieval. |
| `lookup_japanese` | text span + alternatives → dictionary/reading/license references | Local read; ambiguity returned, never hidden. |
| `find_attested_example` | target + burden + rights filters → ranked verified examples | Read proposal. Returns source IDs and why selected. |
| `propose_probe` | target, modality, existing template/item IDs → task preview | Learner confirms task; host logs answer; independent scorer handles scoring. |
| `propose_observation` | exact source span + code + alternatives → hypothesis | Confirmation stores observed evidence only. |
| `propose_card` | source, target, direction, fields, validation bundle → card diff | Learner confirms exact content. Host creates card; FSRS initializes it. |
| `propose_practice` | task IDs, target, explanation → activity | Confirmation opens activity. No due-date mutation. |
| `propose_plan` | activities, time budget, reasons → finite plan | Learner confirms; host validates budget and current model hash. |
| `propose_goal_change` | old/new data and stated source → goal diff | Explicit learner confirmation, never inferred from one casual remark. |
| `propose_summary` | structured claims + original row IDs → session summary | Learner confirms; summary is observed memory, not mastery. |
| `propose_export` | named fields/rows and destination purpose → preview | Separate explicit export action creates a file; no automatic transmission. |

A proposal records its audit `sourceHead`, but freshness is checked against a **semantic dependency digest** of the exact evidence/configuration/assets it read. Audit-only proposal/confirmation rows do not invalidate that digest. Clock changes invalidate only actions whose dependencies include time. Before applying an action, check the payload hash, dependency digest, scope, expiry and learner receipt; then atomically append confirmation plus permitted effect with a unique consumed `actionId`. Double clicks, retries and imported duplicates return the original result. Stale dependencies cause a new preview; a changed payload or read scope needs a new confirmation. A model cannot issue its own confirmation. Imported/cloud-generated proposals follow the same path. Tool results and imported model output are untrusted data.

The host, not the model, defines dependencies. Digest **query predicates and current membership/absence**, not just hashes of previously returned rows. Re-evaluate affected goal, node/modality, correction/withdrawal, content-revocation and clock predicates atomically at confirmation. A proposal chosen because a node had no measured evidence becomes stale when a new success arrives, even though every old row is unchanged. New relevant rows invalidate it; unrelated audit events do not. Include predicate implementation version and normalized query inputs in the dependency contract.

Explicitly absent: `grade_card`, `set_due_date`, `set_level`, `write_review`, `increment_mastery`, `overwrite_model`, `upload_history`, or any escape-hatch equivalent. The learner's review control calls the host's fixed review command directly, never a model tool.

### C3. Prompt, local execution and conditional Claude routing

**PROPOSED local implementation:** use a browser worker inference adapter with schema-constrained proposal JSON; validate schemas again in the host. Benchmark a locally packaged Japanese-capable model before enabling free-form teaching. WebLLM documents browser-local inference, workers, streaming and JSON output; its README describes function calling as work in progress, so the Bunki host must implement the proposal executor rather than assume provider-native tools are complete. [WebLLM documentation](https://webllm.mlc.ai/docs/) and [repository](https://github.com/mlc-ai/web-llm) (undated; accessed 2026-09-28).

**Candidate, not validated choice:** evaluate Qwen3-4B with a pinned quantized conversion, verifying its model and runtime licenses separately. Its model card is a source for capabilities and terms, not Japanese pedagogy or phone performance. [Qwen3-4B model card](https://huggingface.co/Qwen/Qwen3-4B) (undated; accessed 2026-09-28). Bunki-specific Japanese correctness, latency, device memory, battery and structured-proposal reliability are **UNVERIFIED** until measured. The first supported release may require a capable desktop. An unsupported phone gets the offline reader, ledger, placement and template-based practice; it must not silently switch to cloud inference or be described as supporting the full local sensei.

The initial local sensei can select and explain attested examples and ask verified task templates. Free-form generated Japanese remains gated by C4. This allows stateful, tool-using learning without claiming the local model matches Claude.

For a manually exported research bundle or a future law-amended cloud path, route extraction/format validation to a low-cost model only after Japanese-specific evaluation; route dialogue to the least expensive model meeting the rubric; escalate disputed content to a stronger model or human review. Stronger-model agreement is not independent linguistic validation. Use job-specific output caps, a finite tool-round budget, and cost receipts. Current official model/rate details and the resolved live-page pricing check are in Track 05; G provides conditional costs.

Cache immutable policy/tool prefixes first. Freeze a learner-context snapshot within a session only when its ledger head is still accurately represented; append recent corrections after the cached prefix. Rewriting the prefix each turn destroys reuse. Show the actual cache-hit/write token counts in metering. Never send an entire lifetime archive merely because a provider supports a large context window.

### C4. Japanese verification pipeline

Verification produces a structured report, not one green “AI verified” badge.

```text
VERIFY(candidate, intended_use):
  check Unicode, text bounds, schema and no hidden tool/instruction payload
  tokenize with pinned analyzer; retain ambiguity alternatives
  link content words, inflections and senses to dictionary entries
  validate selected readings against entry restrictions and token context
  identify proper nouns, coined terms, code-switching and out-of-dictionary spans
  align grammar/forms to a licensed editorial inventory
  check objective, burden, answer key, distractors and register constraints
  record independent editorial or attested-source evidence for naturalness
  return per-span statuses + sources + unresolved issues + release class
```

Release classes: `attested_and_reviewed`, `editorially_verified_generated`, `lexically_checked_only`, `unverified`, `rejected`. Only the first two can enter instructional banks, graded items or card backs as authoritative Japanese. Lexically checked drafts may appear in a clearly separated preview with unresolved spans, never as a correct answer or diagnostic key. A dictionary lookup cannot certify particle choice, keigo, discourse appropriateness, translation fidelity or pitch realization. User approval of a card does not magically repair an unresolved linguistic issue; the card may store the learner's own draft with an explicit non-authoritative label, excluded from teaching and measurement until reviewed.

The host derives release status from trusted verification receipts; the model cannot set it. Bind receipts to exact hashes of text, readings, translation/gloss, source context, task/key/distractors and audio, with verifier version and authorized editorial identity. An edited particle, substituted name, changed reading or answer key invalidates affected receipts. Verify imported receipts against a local trust policy. A learner's ordinary confirmation is not an editorial credential; authorized educator review is a separate role. Revocation removes dependent materials from teaching selection until revalidated.

Stream neutral status while Japanese is being checked; do not stream unverified Japanese into the instructional area and validate it afterward. Explanations in English about Japanese grammar must also cite approved source explanations; using English is not a bypass. Preserve valid existing dictionary compounds and inflections; reject simplistic “every surface token must be a headword” rules. New imported/generated materials carry provenance and licensing checks through every downstream surface. This minimal release gate is required in milestone 1; milestone 3 expands its coverage.

### C5. Tutor evaluation rubric and release gates

**PROPOSED evaluation corpus:** at least 300 adjudicated cases stratified across proficiency bands, modalities, ambiguous errors, names, colloquial language, keigo, grammar, adversarial instructions and insufficient evidence. Obtain independent Japanese educator annotation for a held-out subset; settle disagreements explicitly. Expand coverage when field errors show a missing class. This number is an engineering starting target, not a power analysis.

Evaluate: evidence citation fidelity; diagnosis precision/recall per error code; ambiguity/abstention quality; Japanese correctness and register; appropriate task burden; learner agency; assistance before/after retrieval; schema compliance; provenance correctness; tool authorization; private-data egress; consistency after replay. Report denominators, confusion matrices and annotator agreement. Separate suggestion quality from actual learning gains.

**PROPOSED hard gates:** zero forbidden review/scheduler/level writes, zero unauthorized learner egress, zero unverified instructional releases in adversarial fixtures; every remembered claim resolves to source rows; every accepted action has a matching receipt. For ordinary observation extraction, aim for at least 0.95 precision with a reported confidence interval before enabling bulk-confirmation UX; this is a chosen safety target, not an achieved result. Low recall is preferable to assertive misdiagnosis. Never label a guessed misunderstanding “measured” to improve recall.

## D. Every surface as a query

All contracts below are **PROPOSED** pure local queries over the same derived model. Inputs include `ledgerHead`, `policyHash` and asset-manifest IDs. Query results expose reasons and supporting rows; no surface maintains a competing private knowledge state. Queries do not write evidence merely because a screen was rendered.

| Surface | Exact query contract | What changes | Evidence returned to record |
|---|---|---|---|
| Reading | `selectReading({goalIds, modality:"read", maxBurden, licensedOnly:true, releaseClasses, excludeRecentSources})`; `annotateText({assetId, modelHead, furiganaPolicy})` | Ranked texts, lookup depth, target highlighting, supported reading range; uncertain readings retain furigana. Learner can override display per span. | Exposure/lookup events; optional unassisted probe after hiding source. Looking up is not failure without an attempted task. |
| Drift | `sampleFrontier({mode:"explore", interestsFromRecord, noveltyBudget, excludeDueCardDuplicates})` | Selects varied attested snippets near goal-relevant uncertainties. Avoids endlessly repeating the same weak item. | Exposure; voluntary diagnostic attempts. No review created by dwell time. |
| Cards | `dueCards({clockCheckpointId, scheduler:"FSRS-6", budget})`; `previewCard({target,direction,source})` | Only FSRS controls due status. Evidence can explain related contexts or propose a separate-direction card. | Learner rating → review row; source and aid use preserved. No auto-rating from chat/audio. |
| Shelf | `rankShelf({goalIds, supportedCoverageRange, unknownReadingLoad, grammarLoad, rights, offlineAvailability})` | Explains why an item fits current goals and what help is likely needed; preserves chosen interests. | Save/open/exposure events; completion alone gives no mastery credit. |
| Mock composer | `composeAssessment({blueprintId, domains, parallelFormId, itemExposureExclusions, seedFromLedger})` | Chooses blueprint-balanced licensed items, separates practice mocks from held-out instruments; freezes generated paper before use. | Domain/task results with keys/rubrics and administration conditions. No overall readiness or predicted pass percentage. |
| Dojo | `selectDiagnosticOrPractice({targetIds, confusionEdgeIds, modality, mode, assistancePolicy})` | Contrastive contexts, novel exemplars, production prompts and reveal order. Distinguishes diagnosis from assisted practice. | Declared-target attempts; criterion-level human or fixed-key scoring. |
| Planner | `planSession({goalIds, timeBudgetFromRecord, dueQueue, frontier, fatiguePreference, modalityGaps})` | A visible sequence of activities plus an explanation and alternatives. Respects FSRS due dates and learner choice. | Accepted plan; task completion; no score from compliance. |
| Mirror | `evidenceBands({curriculumMapVersion, modalities, includeUntested:true})` | Shows supporting examples, contradictions and untested regions in each band. | Read-only unless learner disputes evidence or chooses a probe. |

**PROPOSED planner algorithm:** reserve a learner-configured review budget, estimate activity durations from that learner's prior local completion events or clearly labeled defaults, allocate the remaining budget to goals and gaps, and return a finite plan with reasons. If overdue work exceeds budget, show the trade-off and let the learner adjust workload; do not move due dates to make the plan look achievable. No streak penalty, hidden urgency optimization or compulsory topic inferred from personal history.

Mine all surfaces through a shared observation protocol: reader lookup after an attempted reading, dojo contrast error, mock item distractor pattern, transcript correction, dictation omission and production self-revision. Every event has a source span and assistance condition. The observation codes retain `misread`, `sense-miss`, `particle-drop`, `prod-gap`, `collocation`, `form-miss`; extensible versions can add codes only with schema and evaluator updates. Do not infer a problem solely from a pause, an accent variant, or a lookup.

## E. Speech and listening

### E1. Selected baseline — PROPOSED, capability-gated

| Layer | Selection | Cost and rights | Fallback / release condition |
|---|---|---|---|
| Capture | Push-to-talk, local audio buffer/blob, explicit retention choice. | No provider inference charge by design; device costs unmeasured. | Text input and prerecorded listening are always available. No hidden microphone capture. |
| ASR | Multilingual Whisper base/small through pinned whisper.cpp, beginning on supported desktop/native targets. | Whisper code/weights and whisper.cpp runtime: **MIT**. [Whisper](https://github.com/openai/whisper), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), undated; accessed **2026-09-28**. | Ship only after learner-speech and hardware tests. Browser Wasm/WebGPU integration is a feasibility task, not a proven mobile capability. Never select an English-only `.en` model. |
| Apple native ASR | Optional SpeechAnalyzer/SpeechTranscriber adapter with runtime locale/device checks. | Apple SDK terms; local provider charge **USD 0/min** by design. [Apple WWDC25](https://developer.apple.com/videos/play/wwdc2025/277/), **2025**, exact day not stated; accessed **2026-09-28**. | Japanese capability on each supported device remains **UNVERIFIED** until tested. Fail to manual transcript/local Whisper, never a remote fallback. |
| Tutor | Same local evidence reader and proposal executor as C. | No cloud provider charge; local resource cost **UNVERIFIED**. | Curated question/explanation templates and attested examples if model unavailable; label limited mode accurately. |
| Lesson audio | Commissioned Japanese narration, reviewed against script and readings. | Negotiated commercial distribution/derivative-use and speaker-release agreements; price **UNVERIFIED / quote required**. | Individually cleared recordings only; no assumed corpus-wide audio grant. |
| On-device TTS | Installed Japanese system voice for convenience playback, with capability/network test. | Platform terms; no provider minute bill by design. Do not redistribute captured system-voice output as a commercial pack without rights. [Apple synthesizer](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer), undated; accessed **2026-09-28**. | A prerecorded approved clip, or text-only with an unavailable-audio label. TTS is not a gold accent reference. |
| Pitch support | Licensed lexical accent entries plus reviewed reference audio; optional local F0 visualization. | Audited Kanjium rows under **CC BY-SA 4.0**, with upstream distinctions. [Kanjium](https://github.com/mifunetoshiro/kanjium), undated; accessed **2026-09-28**. | No automatic pitch grade. Reference dialect and context shown; uncertain/unvoiced segments unscored. |
| Prepared-content alignment | Local Montreal Forced Aligner with manual QA. | Code **MIT**; cited Japanese acoustic model/dictionary **CC BY 4.0**. [MFA](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner), [Japanese model](https://mfa-models.readthedocs.io/en/latest/acoustic/Japanese/Japanese%20MFA%20acoustic%20model%20v2_0_1a.html), [Japanese dictionary](https://mfa-models.readthedocs.io/en/latest/dictionary/Japanese/Japanese%20MFA%20dictionary%20v2_0_1a.html), undated; accessed **2026-09-28**. | Hand-set segment boundaries. Alignment is timing correspondence, not pronunciation correctness. |

This selection is a development decision, not a claim that Whisper is the most accurate recognizer for Japanese learners. Track 06 compares ReazonSpeech, kotoba-whisper, faster-whisper, Google, Deepgram, Azure, Apple, Web Speech and OpenAI; it also documents Google/Azure/ElevenLabs/OpenAI/VOICEVOX/Style-Bert-VITS2 TTS options and their gaps. No benchmark on Bunki learner recordings was conducted.

### E2. Learning flow and evidence rules — PROPOSED

For dictation: play an approved recording, hide the transcript, record the learner's committed answer and replay/slowdown assistance, score against a reviewed answer/variant key, then reveal and explain. For shadowing: allow segment looping, transcript/furigana controls, local recording, and A/B replay; repeating audio is exposure unless a separate controlled task measures a construct. For free speech: preserve original audio, present ASR text as a hypothesis, let the learner correct it, then propose source-linked diagnostic observations. A corrected transcript is not evidence that the original pronunciation was correct.

For production, use a rubric with distinct criteria: communicative task completion, comprehensibility, targeted lexical/form use, mora timing/segmental contrasts and context-appropriate register. **PROPOSED score scale: 0/1/2 per criterion**, with anchored human-reviewed examples; zero = not demonstrated, one = partly demonstrated, two = demonstrated under this task. Scoring is by the learner or a qualified human assessor and retains that provenance. The AI may identify spans for review but supplies no score. No average across criteria, no total speaking readiness, and no FSRS rating inferred from rubric results. Human rubric scores become measured evidence of the elicited task; AI commentary remains observed.

Pronunciation and lexical pitch are different targets. Azure's official assessment documentation limits prosody assessment to **en-US**, despite Japanese pronunciation-assessment locale support. Do not relabel a generic Azure score as Japanese pitch correctness. [Azure pronunciation assessment](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment), indexed update **2026-04-29**, live page accessed **2026-09-28**. Pitch visualization is therefore an optional practice aid in this design; its benefit on Bunki outcomes is **UNVERIFIED**.

### E3. Conditional cloud comparison and minute economics

The only currently permitted remote speech workflow is a learner-created export file, deliberately handed to a separate service and returned as candidate analysis. Real-time cloud voice remains **blocked by law 1**. The following is a planning comparison for a future explicitly authorized edition.

**CALCULATED scenario, not observed usage:** one conversation minute contains **0.5 minutes** learner speech, **150 Japanese output characters** and **one** tutor call with **6,000** cached-prefix input tokens, **1,000** fresh input tokens and **600** billed output tokens. These are **PROPOSED assumptions**, not constants relating Japanese characters, speech and tokens.

With Deepgram Nova-3 monolingual streaming at the displayed promotional **USD 0.0048/min**, Google Chirp 3 HD TTS at **USD 30/1,000,000 characters**, and Sonnet 5 warm-cache rates from G, the total is **USD 0.01610 per wall-clock minute**. Using the displayed regular ASR rate **USD 0.0077/min** gives **USD 0.01755/min**. A first cold cache-write minute is **USD 0.02990** at the promotional ASR rate. Inputs: [Deepgram pricing](https://deepgram.com/pricing), [Google TTS pricing](https://cloud.google.com/text-to-speech/pricing), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), all undated, accessed **2026-09-28**. Formula and exclusions are preserved in Track 06 and the calculation artifact.

These figures exclude tool fanout, extra reasoning, retries, transport, storage, tax and support; they do not establish acceptable latency or Japanese quality. At **PROPOSED 20 minutes/day × 30 days**, the warm promotional scenario is **CALCULATED USD 9.66/month**, but it already contains the tutor calls and must not be added again to the same text-turn budget. Usage, cold starts and output length can change it materially.

### E4. Release tests — PROPOSED

Evaluate raw and corrected transcript accuracy separately. Use human-transcribed learner recordings containing particle omission, mora length, gemination, names, accent variation, repairs, noise and silence. Report CER plus diagnosis-relevant false corrections; a low overall CER can still erase the particular error a tutor needs to observe. Show ASR uncertainty rather than silently normalizing all learner speech to grammatical Japanese.

Test microphone permission rejection, interruption, lost focus, device heat/memory pressure, partial download and absent language pack. Verify a complete voice session with network access blocked after installation. Record actual latency and device energy; no universal performance numbers are asserted. Do not force-align a learner recording to the correct sentence and then count successful alignment as successful pronunciation.


## F. Data and licensing

### F1. Proposed shipping manifest

Every shipped asset is selected by an allowlisted manifest containing upstream URL, publication/release date, retrieval date, exact revision, hash, license text, attribution, modification history, redistribution terms, locale/register and verification status. “Downloaded from GitHub” is not a license. The following choices apply only to the exact asset portions audited at implementation. Sources are **undated unless specified; all accessed 2026-09-28**. Commercial consequences below are engineering release decisions based on the named terms, not an opinion that every possible integration is legally cleared.

| Asset / component | Exact license or grant established | Proposed use and commercial gate | Source |
|---|---|---|---|
| JMdict and KANJIDIC | **CC BY-SA 4.0** | Dictionary/reading identities; retain attribution and share-alike terms for adapted data. | [EDRDG license](https://www.edrdg.org/edrdg/licence.html) |
| KanjiVG | **CC BY-SA 3.0** | Retain stroke data as a separately attributable asset package. | [KanjiVG](https://github.com/KanjiVG/kanjivg) |
| Kanjium selected accent rows | **CC BY-SA 4.0** for additions/modifications; upstream components differ | Audit selected rows and upstream provenance; do not bundle unrelated fonts/images under one license. | [Kanjium](https://github.com/mifunetoshiro/kanjium) |
| Tatoeba reviewed text | Default **CC BY 2.0 France**; some **CC0** | Preserve sentence/author IDs and exact per-sentence license; review before teaching. | [Corpus use](https://en.wiki.tatoeba.org/articles/show/using-the-tatoeba-corpus) |
| Tatoeba audio, if selected | Per-recording terms; no universal text-derived audio license | Include only explicit compatible commercial grants and verified text/audio correspondence. | [Audio terms](https://en.wiki.tatoeba.org/articles/show/choose-audio-license) |
| Aozora selections, optional | Work-specific copyright/public-domain status and file-use rules | Check title, translator, territory and edition; no blanket clearance. | [Aozora file rules](https://www.aozora.gr.jp/guide/kijyunn.html) |
| Bunki original articles, grammar inventory, mock items, rubrics and audio | Owned/commissioned rights; existing rights **UNVERIFIED** | Require author/reviewer and signed grant where applicable; original examples and explanations. | Owner brief **2026-09-28**, no public URL supplied; repository/grant audit required. |
| kuromoji.js + bundled IPADIC, initial browser tokenizer candidate | Code **Apache-2.0**; dictionary separate **NAIST/ICOT notice** | Pin both. Do not label all bundled data Apache. Benchmark against existing implementation before migration. | [Code](https://github.com/takuyaa/kuromoji.js), [notice](https://github.com/takuyaa/kuromoji.js/blob/master/NOTICE.md) |
| Vibrato alternative | **MIT OR Apache-2.0** code; dictionary separate | Verified Wasm route; optional after parity/footprint tests. | [Vibrato](https://github.com/daac-tools/vibrato) |
| WebLLM local runtime | **Apache-2.0** | Local inference only; separately audit selected model/conversion. | [WebLLM](https://github.com/mlc-ai/web-llm) |
| Qwen3-4B candidate weights | **Apache-2.0** model card | Candidate subject to Japanese-quality/device tests; retain notices and provenance for conversion. | [Original model card](https://huggingface.co/Qwen/Qwen3-4B) |
| Whisper / whisper.cpp | **MIT** model/code/runtime | Local ASR; record exact weight/conversion hashes. | [Whisper](https://github.com/openai/whisper), [runtime](https://github.com/ggml-org/whisper.cpp) |
| MFA prepared-audio alignment | Code **MIT**; selected Japanese acoustic/dictionary assets **CC BY 4.0** | Development/preparation tool; keep model attribution and human alignment review. | [MFA](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner), [model](https://mfa-models.readthedocs.io/en/latest/acoustic/Japanese/Japanese%20MFA%20acoustic%20model%20v2_0_1a.html), [Japanese dictionary](https://mfa-models.readthedocs.io/en/latest/dictionary/Japanese/Japanese%20MFA%20dictionary%20v2_0_1a.html) |
| Optional Ruri-v3-70m retrieval embeddings | **Apache-2.0** model card | Local cache only, after retrieval-quality and target-device tests. | [Ruri](https://huggingface.co/cl-nagoya/ruri-v3-70m) |
| FSRS-6 implementation | Exact existing package/license **UNVERIFIED until repository audit** | Pin a legally usable FSRS-6 implementation; freeze optimizer and numerical replay fixtures. No unreviewed newer scheduler. | [FSRS project](https://github.com/open-spaced-repetition/awesome-fsrs); algorithm page revision **2026-07-28**: [algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) |

Track 07 additionally covers MeCab/UniDic, Sudachi, Lindera, multilingual-e5, handwriting and third-party level/frequency lists. They are alternatives, not hidden dependencies of the initial build. Browser feasibility is not a measured latency/memory result. The chosen tokenizer and model packs are **PROPOSED** until tests establish a suitable minimum device profile.

### F2. Do not ship these under assumed open terms

| Asset | Verified restriction or unresolved permission | Decision and dated source |
|---|---|---|
| AnimCJK | Arphic Public License for kanji/hanja/hanzi graphics; **LGPL-3.0-or-later** for other files. | Mixed-license review required; defer while using KanjiVG. [COPYING](https://github.com/parsimonhi/animCJK/blob/master/licenses/COPYING.txt), undated revision, accessed **2026-09-28**. |
| BCCWJ frequency list v1.1 | **CC BY-NC-ND 3.0** in official file metadata. | Exclude from commercial bundle absent permission. [NINJAL](https://repository.ninjal.ac.jp/records/3235/file_details/BCCWJ_frequencylist_suw_ver1_1.zip?file_order=0&filename=BCCWJ_frequencylist_suw_ver1_1.zip), **2021**, exact day unverified; accessed **2026-09-28**. |
| JParaCrawl / associated models | Research-restricted terms; commercial use requires contacting NTT. | Do not silently use for shipping examples or model training. [NTT](https://www.kecl.ntt.co.jp/icl/lirg/jparacrawl/), undated terms; accessed **2026-09-28**. |
| I-JAS | Research-use conditions and redistribution restrictions. | Permissioned research only; commission a consented evaluation corpus for production use. [Terms](https://chunagon.ninjal.ac.jp/static/I-JAS_TermsOfService.pdf), effective **2016-05-09**; accessed **2026-09-28**. |
| OJAD / Suzuki-kun | No established commercial dictionary extraction grant; generated-audio embedding/indirect service restrictions. | Link out; do not proxy or bundle its audio. [Notes](https://gavo.t.u-tokyo.ac.jp/ojad/pages/notes), [service terms](https://gavo.t.u-tokyo.ac.jp/ojad/phrasing), undated; accessed **2026-09-28**. |
| jReadability service / embedded dictionary | Research/education terms, restricted copying of dictionary definitions/examples. | Research comparator only; commercial integration permission **UNVERIFIED**. [Terms](https://jreadability.net/sys/terms_of_use?lang=en), latest shown changelog **2024-04-24**; accessed **2026-09-28**. |
| NHK Easy | Commercial republication/audio rights **UNVERIFIED**. | Link or lawful private import; no scrape-and-bundle assumption. [NHK terms endpoint](https://www.nhk.or.jp/rules/), access attempt **2026-09-28** blocked; exact applicable grant not established. |
| Tadoku free books | **CC BY-NC-ND 4.0** guidance and restrictions on alteration/additional explanations/tests. | Do not incorporate into annotated commercial lessons without permission. [Tadoku guidance](https://tadoku.org/japanese/en/free-books-en/note-en/), undated; accessed **2026-09-28**. |
| Jimaku subtitles, streaming video and manga | No blanket rights grant established in this campaign. | Local learner imports do not authorize redistribution. [Jimaku](https://jimaku.cc/), undated, accessed **2026-09-28**; work-specific rights **UNVERIFIED**. |

Third-party “JLPT vocabulary lists” are editorial approximations: the official FAQ says exhaustive new-test item lists are not published. [JLPT FAQ](https://www.jlpt.jp/sp/e/faq/), undated; accessed **2026-09-28**. Keep list/source/version metadata and do not label Bunki's word bands official. Any third-party grammar explanations, textbook examples or frequency lists require their own terms; a scraper's code license does not grant content rights.

### F3. Quality, portability and personal data — PROPOSED

The ingestion gate rejects unknown/NC/research-only rights for a commercial distribution. It also rejects missing text/audio source hashes, unreviewed lexical alignment, and a license incompatible with the intended transformation. Generate a complete attribution file and in-app source inspector from the manifest. Modified share-alike datasets remain clearly identifiable; do not assume that they automatically dictate the license of all unrelated application code.

Separate public curriculum assets from learner-owned material. An exported learner record can contain private original responses/media according to the learner's selection and rights, but it must not silently export a third party's entire restricted corpus. When redistribution is prohibited, export stable source references and personal evidence with a recovery notice; include a legal replay pack only when permitted. If missing external assets prevent exact replay, state that limitation before export rather than claiming the file is self-contained.

The learner's goals, annotations, personally mined cards, audio, preferences and accommodations are record data. They must not enter the public asset build or an application release. No production CI job is allowed to package a real learner's record as an example fixture; use explicitly synthetic fixtures.


## G. Platform, provider boundaries and economics

### G1. Local architecture — PROPOSED

Keep the existing browser app and add a transactional IndexedDB repository for append-only rows, an immutable content/blob store, and a pure reducer in a worker. Use the same canonical codecs and fixtures in any later native SQLite wrapper. Do not migrate storage merely to adopt a sync vendor. Store indexes, embeddings and model projections as invalidatable caches keyed to the ledger's semantic dependency hashes. Assets and inference packs install separately from learner records.

The ledger writer exposes only typed host commands. The tutor runs in an isolated inference worker with no direct store or network handles. Treat model outputs, imported cards, transcripts, HTML, SVG, subtitles and source URLs as untrusted data. Sanitize active markup and block remote subresources, remote fonts, tracking pixels and automatic link previews. Bundle application dependencies rather than loading executable code from a third-party CDN during a learner session. Public generic pack downloads must not contain learner-derived queries, weakness lists or personal identifiers.

Exports contain a manifest, canonical event rows, necessary permissioned immutable task/content versions, selected personal blobs, policy/FSRS history and hashes. Offer an encrypted export with a learner-held recovery secret, explain recovery limitations, and validate the export before reporting success. Import into a quarantine preview: check schema, hashes, file bounds, rights metadata and reference graph; deduplicate identical event IDs/hashes; reject collisions. Do not run imported scripts or load external URLs.

Initially, a transfer promotes the destination device to writer and records retirement on the source before export; an imported backup is otherwise read-only until the learner chooses a restore/fork action. Offline software cannot prevent a user from reopening an older copied record, so this is an explicit handoff protocol rather than a claim of globally enforced single-writer exclusion. If both devices have appended divergent histories, do not “last write wins” them into one apparently valid record. Show the fork and retain both originals. A later explicit merge/import policy can resolve it, but must preserve original reviews and record the resolution. No server copy can replace device history.

Before an attempt starts, capture the exact immutable task text, annotations, keys, distractors and relevant audio versions locally where rights permit. A mutable source URL alone cannot replay a past attempt. If those assets cannot legally be carried in an export, its completeness manifest identifies the required pinned pack and the precise limitation; never silently fetch a new version as a substitute.

Authorized withdrawal is distinct from corruption: build the withdrawal index before checking required blobs. A recorded valid redaction permits the corresponding missing plaintext and removes dependent summaries/observations/retrieval entries from active use. A missing unredacted blob still fails validation. Independently supported preferences survive only by their separate evidence rows. Redaction must not erase unrelated public assets referenced by other valid events.

Browser durability, private-browsing limitations, quota/eviction behavior and OS backups must be tested on the actual supported platforms; **UNVERIFIED for Bunki in this campaign**. Show export health and storage failures without uploading telemetry. Use device-owned backup locations and configure native backup exclusions where supported; do not claim the app controls a user's independent OS backup or subsequent sharing of an export.

### G2. Optional transport alternatives

These are researched options, **not enabled baseline dependencies**. All automatic learner sync is conditional on an owner-approved extension of the egress law. Even then, the device ledger remains authoritative and the server stores transport envelopes, not a learner-model authority.

| Technology | Verified documented role | Proposed fit / restriction |
|---|---|---|
| CRDT / Automerge | Offline/concurrent merge support. [Automerge](https://automerge.org/docs/hello/), undated; accessed **2026-09-28**. | An immutable event-set union can preserve events, but needs semantic review ordering, deduplication, conflicts and deletion rules. CRDT convergence does not certify evidence truth. |
| PowerSync | SQLite local storage, backend integration and upload/conflict handling. [Architecture](https://docs.powersync.com/intro/powersync-philosophy), undated; accessed **2026-09-28**. | Defer; its server database assumptions need adaptation so server acceptance cannot redefine learner history. |
| Electric | Current engine replicates Postgres read paths; writes remain app-managed. [Sync](https://electric.ax/docs/sync/), [writes](https://electric.ax/docs/sync/guides/writes), undated; accessed **2026-09-28**. | Possible public-content distribution; do not describe it as turnkey bidirectional learner CRDT sync. |
| CloudKit | App-controlled data with CKSyncEngine orchestration. [Apple](https://developer.apple.com/documentation/cloudkit/deciding-whether-cloudkit-is-right-for-your-app), undated; accessed **2026-09-28**. | Optional Apple transport after explicit law change; cannot be the cross-platform model authority. |
| libSQL / Turso | Current docs distinguish libSQL from the newer Turso database/SDK path. [libSQL](https://docs.turso.tech/libsql), [SDKs](https://docs.turso.tech/sdk/introduction), undated; accessed **2026-09-28**. | Pin exact implementation before any sync proof; Bunki semantics and browser support remain **UNVERIFIED**. |

Anki documents sync with explicit full-transfer recovery; Obsidian documents optional encrypted sync around local files; Linear documents a custom sync engine. These are precedents for product decisions, not proof that their conflict semantics satisfy Bunki's laws. [Anki](https://docs.ankiweb.net/syncing.html), [Obsidian](https://obsidian.md/help/sync/security), both undated; [Linear](https://linear.app/now/scaling-the-linear-sync-engine), **2023**; all accessed **2026-09-28**. Track 10 records the limits of what their internals could be verified to use.

### G3. Claude capabilities and key boundary

The current official inventory lists **Fable 5.1**, **Opus 5.5**, **Sonnet 5** with **1,000,000-token** context and **128,000-token** maximum output, and **Haiku 4.5** with **200,000 / 64,000**. These are platform limits, not a reason to send that much learner data. Track 05 contains exact model IDs, tool/schema/streaming/effort details and account limits. [Official overview](https://platform.claude.com/docs/en/models/overview), undated; accessed **2026-09-28**.

**PROPOSED job policy for manually exported analysis:** Haiku for bounded observation candidates; Sonnet for dialogue/planning proposals; Opus only for difficult content-review candidates, with human/attested verification still required. Fable is not the default for this workload. This tiering is untested Japanese-task engineering judgment, not a demonstrated capability ranking.

Provider-hosted memory must not become a second learner profile. Managed Agents retains transcripts and is not ZDR-eligible; Batch has retention rather than ZDR. The export boundary is required even when an endpoint offers a negotiated retention arrangement. [Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview), [retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), undated; accessed **2026-09-28**. Track 05 covers client memory tools, Agent SDK, MCP, regional processing and their specific limits. Native Claude audio API support was **UNVERIFIED** in the official material reviewed; use a separate explicitly assessed speech stack rather than assuming it exists.

No provider secret is shipped in JavaScript, mobile binaries, source maps or remote configuration. The official SDK disables browser use by default because it exposes secret credentials. [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), undated; accessed **2026-09-28**. For file processing, a separate service accepts only the learner-selected export, holds its own key and returns candidate results. A future live gateway would require short-lived app credentials, per-user spending reservations, model/tool allowlists, request idempotency, bounded retries/output/tool rounds, redacted operational logs and usage reconciliation. Neither backend key custody nor native BYOK vaulting authorizes live egress under the current law.

### G4. Unit economics, with cache sensitivity

**PROPOSED assumptions:** a **30-day** billing scenario; **30, 40 or 60** tutor turns/day; each request has **6,000** reusable-prefix tokens, **1,000** fresh input tokens and **600** billed output tokens; one nightly exported-file mining job has **12,000 input / 1,200 output** tokens. Token counts must be measured against the selected model. This is not measured Bunki use; tool/retrieval loops can add requests and thinking can add billed output.

Rate inputs: Sonnet input/output **USD 2/10 per million tokens**, five-minute write/hit **USD 2.50/0.20**; Haiku Batch input/output **USD 0.50/2.50**. [Official pricing](https://platform.claude.com/docs/en/about-claude/pricing), undated; accessed **2026-09-28**. A stale indexed Sonnet-price excerpt conflicted with this; the fetched pricing, overview and dedicated [Sonnet page](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5) all agree on **2/10** (undated; accessed **2026-09-28**). The historical cause is **UNVERIFIED**. Requote before launch.

| Turns/day | No cache + nightly | One prefix fill/day, later hits + nightly | Four fills/day, other hits + nightly | Every turn a cache write, no hits + nightly |
|---:|---:|---:|---:|---:|
| 30 | **USD 18.270** | **USD 8.964** | **USD 10.206** | **USD 20.970** |
| 40 | **USD 24.270** | **USD 11.724** | **USD 12.966** | **USD 27.870** |
| 60 | **USD 36.270** | **USD 17.244** | **USD 18.486** | **USD 41.670** |

All cells **CALCULATED**, per learner per scenario month. Nightly cost is **USD 0.009/day = 0.27/month**. Formula, with `t` turns/day and `f` prefix fills:

```text
cached_month = 30 × [6000×(f×2.50 + (t−f)×0.20)
                       + t×(1000×2 + 600×10)] / 1,000,000 + 0.27
uncached_month = 30 × t × (7000×2 + 600×10) / 1,000,000 + 0.27
```

One-fill savings require unchanged prefixes and subsequent calls within the refreshed cache lifetime. Daily frequency alone does not imply hits. For the requested **6,000-token context × 40 turns/day alone**, excluding other input/output, Sonnet costs **CALCULATED USD 0.4800/day** uncached, **0.0618/day** with one five-minute write and subsequent hits, or **0.0708/day** with one one-hour write and hits. Track 05 contains the corresponding Haiku/Opus/Fable scenarios and exact assumptions. Batch's documented **50%** token discount does not override the export law or its **29-day** retention. [Batch docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing), undated; accessed **2026-09-28**.

These totals exclude speech, additional verification/extraction calls, thinking beyond the assumed output cap, retries, infrastructure, payment/store fees, tax, support, content production and hardware. Strict local mode has **USD 0 provider inference charge by design**, not zero total cost. Voice calculations in E already include their corresponding tutor call; avoid double-counting.

For price comparison, current US storefront listings include Speak Plus **USD 39.99/month or 164.99/year**, and TalkPal Premium **USD 19.99/month or 119.99/year**; annual paid-up-front equivalents are **CALCULATED USD 13.749/month** and **9.999/month**. [Speak listing](https://apps.apple.com/us/app/speak-language-learning/id1286609883), [TalkPal listing](https://apps.apple.com/us/app/talkpal-ai-language-learning/id6468219825), undated, accessed **2026-09-28**. SKU eligibility/feature inclusion require checkout verification. Under this high-activity scenario, cloud cost could consume most of that revenue before other expenses; competitors' actual usage distributions and margins are **UNVERIFIED**. Do not promise unlimited cloud tutoring based on ideal caching.

### G5. Store, privacy and accessibility gates

Apple's guidelines require disclosure and explicit permission for third-party AI data sharing and govern digital-feature payment mechanisms; there is no verified universal BYOK exemption. Google's generated-content policy requires in-app reporting/flagging to developers. [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google AI policy](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en), undated; accessed **2026-09-28**. **PROPOSED:** browser-first launch; design an explicit report-file export/handoff from inside the app. Whether that satisfies Play's exact reporting requirement is **UNVERIFIED** and a native-release gate. Do not solve it by quietly uploading learner content or claiming a local-only flag reaches the developer.

Accounts and purchase entitlements must not identify or host the learner record. The initial product can accept an externally acquired, locally verifiable entitlement without creating a learning-data account, subject to the actual store's billing rules; this is **PROPOSED**, not App Review approval. Any sign-in, support upload or billing data flow must be documented separately and cannot automatically carry record content.

Japan's APPI guidance covers processing purposes, security, correction/deletion and cross-border transfer requirements; applicable obligations depend on the actual operator/data flows. [PPC general guidance](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/), revised **2026-06**; [foreign transfers](https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/), exact revision date unverified; accessed **2026-09-28**. GDPR retention/erasure rights also matter for a covered service. [EC retention guidance](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/principles-gdpr/how-long-can-data-be-kept-and-it-necessary-update-it_en), undated; accessed **2026-09-28**. Local-first is an architecture choice, not automatic legal exemption.

**PROPOSED erasure design:** ordinary corrections append. Intentional deletion destroys selected personal payload keys/data and records withdrawal, then removes dependent summaries, observations, embeddings and caches from active use. Full record destruction removes database, keys, caches and application-managed backups. Minimal remaining metadata must itself be assessed for identifiability. Cryptographic erasure is **UNVERIFIED as legally sufficient** for this implementation; old exports, backup keys and recipients matter. Distinguish a valid withdrawal from unexplained corruption during replay.

The EU's official AI Act page describes chatbot transparency applying in **August 2026** and updated high-risk sensitive-area rules starting **2027-12-02**; institutional educational assessment can raise a different classification from self-directed practice. [European Commission](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai), undated live page referencing the **2026-07-27** amendment; accessed **2026-09-28**. **UNVERIFIED:** Bunki's final legal classification. Keep this release out of admissions, employment, certification and institutional high-stakes scoring; disclose AI interaction and avoid emotion inference.

**PROPOSED accessibility target: WCAG 2.2 AA.** Use language-tagged Japanese/English spans, semantic ruby with tested screen-reader pronunciation, scalable text, keyboard-only navigation, reduced motion, non-color knowledge/pitch cues, captions/transcripts and a non-speech alternative for every task. Accommodations remain record data and are visible in assessment conditions. Sources: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), **2024-12-12**; [Japanese layout requirements](https://www.w3.org/TR/jlreq/), **2020-08-11**; accessed **2026-09-28**. Test real VoiceOver/TalkBack workflows; declaring a target is not proof of conformance.


## H. Efficacy and measurement

### H1. What existing results justify

| Evidence | Numerical result | Boundary on interpretation |
|---|---|---|
| Retrieval meta-analysis | Hedges **g = 0.499** across **222 studies / 48,478 students**. | Academic achievement across subjects; not an estimate of Bunki or Japanese gains. [Yang et al.](https://doi.org/10.1037/bul0000309), **2021**; accessed **2026-09-28**. |
| Spaced retrieval meta-analysis | Spaced versus massed retrieval **g = 0.74**; expanding versus uniform **g = 0.034**, nonsignificant. | Supports spacing; does not establish one optimal Japanese algorithm. [Latimier et al.](https://link.springer.com/article/10.1007/s10648-020-09572-8), online **2020-10-07**, volume **2021**; accessed **2026-09-28**. |
| FSRS-6 prediction benchmark | Log loss **0.3460 ± 0.0042**, RMSE(bins) **0.0653 ± 0.0011**, AUC **0.7034 ± 0.0023**, **99% CIs**. | Recall prediction on Anki histories; not a causal learning effect. [Developer benchmark](https://github.com/open-spaced-repetition/srs-benchmark), **undated live snapshot**, accessed **2026-09-28**; immutable historical snapshot **UNVERIFIED**. |
| Guarded versus ordinary AI assistance | Ordinary GPT practice **+48%**, guarded tutor **+127%**; ordinary-interface unassisted exam **−17%** relative to control; guarded exam effect not significant. | Single mathematics RCT; assisted success and independent learning diverged. [Bastani et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/), **2025-06-25**; accessed **2026-09-28**. |
| Expert-designed AI physics tutor | Regression estimate **+0.63 SD**, **N=194**. | Single crossover trial; immediate subject-specific outcomes, not Japanese transfer. [Kestin et al.](https://www.nature.com/articles/s41598-025-97652-6), **2025-06-03**; accessed **2026-09-28**. |
| Japanese generation control | Comprehensible utterances **40.4% → 84.3%**, **N=6**. | Small comprehensibility experiment, not acquisition. [Jin et al.](https://arxiv.org/html/2506.04072v1), **2025-06-04**; accessed **2026-09-28**. |

Track 10 documents the Duolingo, Babbel and Busuu study designs. Their populations, outcomes, sponsorship, attrition and comparator choices differ; do not borrow a vendor's claimed “hours to a semester” conversion for Bunki. **Busuu's Japanese cohort:** **199** participants, with oral improvement reported for **59.3%** of free users and **69.4%** of premium users; this is an uncontrolled pre/post comparison, not a causal premium effect. [Busuu study](https://www.comparelanguageapps.com/reports/Busuu_2025_study.pdf), **2025**; accessed **2026-09-28**. Bunki's learning effect remains **UNVERIFIED**.

### H2. Instruments and outcome hierarchy — PROPOSED

The primary construct is delayed unassisted transfer on the specific skills practiced. Retention of the original card is a separate secondary construct. Do not combine outcome domains into readiness, a level estimate or one marketing score.

| Domain | Instrument | Safeguards |
|---|---|---|
| Written lexical/sense knowledge | New-context meaning selection plus a separate free recall task. | Held-out contexts; balanced distractors; fixed reviewed key; record chance structure. |
| Readings | Kanji-in-word contextual kana response and separate spoken reading where available. | Accepted variants and sense restrictions; no visible furigana or answer audio. |
| Grammar/forms | Meaning contrasts, constrained production and explanation/interpretation tasks. | Editorial blueprint, alternate forms, no model-authored unreviewed answer key. |
| Listening | Unseen human-recorded passages with comprehension and dictation tasks. | Natural speech with verified transcript and usage rights; distinct talkers where licensed; log replays/speed. |
| Spoken production | Recorded role/task prompts with blind human ratings of task completion, comprehensibility, target-form use and repair. | Rubric dimensions remain separate; the AI never supplies the measurement grade. |
| Written production | Novel prompts with human-rated target accuracy, meaning and appropriateness. | Record IME/dictionary/AI aid; preserve draft and revision sequence. |
| Usability and burden | Task completion, opted-out probes, confirmation burden, fatigue self-report and chosen study time. | Secondary outcomes; time/streak/chat length cannot substitute for learning. |

Freeze a dated instrument/version and map each task to its intended node/modality before administration. Use licensed external instruments only under their permitted use; internal papers need item analysis and scorer checks before being called validated. Editorial JLPT tags classify material and are not an official exhaustive JLPT word list. An imported official result is historical measured evidence with its own scope. Official CEFR references for passed JLPT results begin **December 2025** and exclude speaking/writing/interaction; do not infer these from reading results. [JLPT](https://www.jlpt.jp/e/about/cefr_reference.html), undated official explanation of **2025-12** introduction; accessed **2026-09-28**.

### H3. Cadence and contamination control — PROPOSED

At baseline, record goals, prior exposure and an untaught parallel form. After a learning opportunity, collect delayed probes at **1, 7 and 30 days**; preregister tolerances and retain actual elapsed time. These dates are research measurement appointments, not a second adaptive review scheduler. FSRS-6 alone schedules learning reviews. The research calendar does not inject invented FSRS due dates or grades.

The probe itself teaches through retrieval. To separate this from natural retention, randomize matched item/context families to different measurement schedules, including a held-out day-30-only subset. Keep training and transfer sets distinct. Log each intervening card review, lookup, conversation exposure and external study self-report; do not claim “30-day retention without practice” when the target was reviewed repeatedly. Withhold corrective feedback until the probe response is recorded, then offer the usual verified learning feedback without pretending later tests are exposure-free.

Pause a measurement at the learner's request. Missing/assisted answers remain explicit; never score nonparticipation as a knowledge failure. Report adherence and missingness by study arm and endpoint. Protect the learner's ability to continue ordinary study during a trial.

### H4. N-of-1, then a small cohort — PROPOSED

**N-of-1:** use one learner to validate utility, evidence quality and workflow. Randomize matched target families between model-informed selection and an active baseline with the same bank, available study time and FSRS-6 policy. Keep target allocation concealed from any human assessor where possible. Counterbalance difficulty and task order. Avoid a simple “before app / after app” claim; learning, growing familiarity and changes in motivation would all be confounded with the intervention.

Do not use an ordinary reversible-treatment crossover interpretation: acquired language knowledge does not wash out. Item-family randomization can reduce some confounding but has interference because grammar and strategies transfer between conditions. Report that limitation; compare truly novel transfer items separately and do not count thousands of review events as thousands of independent participants. The credible claim is bounded personal benefit under this protocol, not efficacy for all learners.

**Pilot cohort:** recruit across the intended launch population and stratify by baseline measured skills, L1/script background and study goals. A **PROPOSED 24–40-person pilot** is for feasibility, variance, missingness and scorer reliability, not an automatically powered efficacy trial. Randomize participants to evidence-adaptive versus an active matched-time baseline; both retain FSRS-6 and core learning content. Predefine how external apps and extra study are recorded. Use parallel forms and blind scorers for production. Keep treatment assignment separate from scorer exports.

For a confirmatory study, choose the smallest educationally meaningful improvement before seeing results; derive sample size from pilot variance, cluster structure, expected attrition and the chosen primary endpoint. **UNVERIFIED:** the required sample size; no variance data exist in this campaign to justify one. A **PROPOSED candidate target of 5 percentage points** on a defined delayed-transfer instrument may guide discussion, but is not an established minimum educational effect or a powered claim.

### H5. Statistics and calibration — PROPOSED

1. Preregister the primary modality/endpoint, assignment method, exclusion rules, missing-data handling, covariates and analysis before opening the outcome data. Choose one primary endpoint per claim or control multiplicity; publish all preregistered domains without cherry-picking.
2. For binary item outcomes, estimate condition effects with a model accounting for learner and item-family clustering where sample size supports it; report absolute risk differences and **95% confidence intervals**, plus raw numerators/denominators. For a small pilot, show participant-level distributions and conservative cluster-resampling intervals rather than pretending a complex model is well identified.
3. For human rubric outcomes, report each dimension, the change distribution and agreement between raters. Use weighted kappa or an ICC only when the scoring scale/model warrants it; show disagreements as well as a coefficient. Do not average speaking, reading and vocabulary into one score.
4. Use intention-to-treat for the randomized claim, with prespecified sensitivity analysis for missing outcomes; label adherence-only estimates exploratory. Report attrition and differences between completers and noncompleters. Do not impute missing outcomes as successes.
5. Freeze model predictions before the answer. **Brier:** mean `(p-y)^2`. **Log loss:** mean `-[y log(p)+(1-y)log(1-p)]`, using a declared numerical clipping convention. Compare with simple task-frequency and prior-outcome baselines, not only an elaborate neural challenger. Calibration plots need per-bin counts and intervals; sparse data should produce “insufficient evidence.”
6. Split training/calibration/test histories chronologically and by item/template family. No answer-derived feature, future summary or test item's paraphrase may enter the context before a held-out answer. If a policy changes mid-study, log it and treat the affected analysis as a separate version.
7. Publish protocol, instruments where rights permit, analysis code, anonymous aggregate tables, limitations and null results. Individual exports require each participant's deliberate export action; the study cannot add a hidden telemetry exception to law 1. Identifiability from free text/audio must be reviewed before any sharing.

Claim template after a successful study: “In [dated registered design], [defined population] using [version/intervention] improved [specified unassisted task outcome] by [absolute effect and interval] versus [active comparator] at [delay], with [attrition].” Until then the appropriate product statement describes the mechanism and evidence transparency, not proven efficacy.


## I. Delivery plan

All effort figures are **ESTIMATES**, dated 2026-09-28; a builder-week is **PROPOSED 5 focused engineering days**, excluding external review wait time. They assume one experienced full-stack builder, access to a Japanese educator/test specialist, reuse of the existing UI/assets after audit, and no rewrite of Bunki. They are not a promise of delivery dates. Each milestone ships a coherent capability and retains the same record format or an explicit replayable migration.

| Milestone, in order | Shippable result | Acceptance tests | Effort estimate |
|---|---|---|---:|
| **1. Stateful tool-using sensei + placement + planner** | Establish actual repo baseline; deterministic ledger/model seam; local session memory; confirmed read/probe/card/summary tools; goals-as-data; task-based placement; daily plan. Ship on declared supported hardware. | Two fresh sessions remember an accepted goal and source-backed earlier difficulty; learner corrects it and future context changes. Every tool proposal requires a matching receipt. Placement updates only tested dimensions. Planner changes with the ledger. Export/reimport reproduces model and FSRS queue hashes. Network inspection shows no learner egress. Unsupported device has explicit limited mode. | **6–9 builder-weeks** |
| **2. Rich graph and shared queries** | Sense/reading/grammar/form nodes, confusion edges, frontier, provenance inspector; all existing surfaces read one model. | Minimal-pair fixtures distinguish same spelling/different sense and same kanji/different reading. Exposure-only histories cannot establish a level claim. Observed-only history changes diagnostic selection without promoting mastery. Every surface returns evidence reasons. | **4–6 builder-weeks** |
| **3. Verified immersion and mining** | Sentence selector, adaptive furigana, mining from reader/dojo/mocks, typed source-preserving cards, content quarantine and license manifests. | Unresolved readings/grammar cannot enter instructional banks. Mined cards preserve source, target, direction and rights. Changing target creates a new identity without carrying false recall history. Selector reports no-fit honestly. | **4–6 builder-weeks** |
| **4. Listening and production** | Local ASR feasibility-gated release, attested human audio, dictation/shadowing, human/learner production rubric, local recording and transcript correction. | Silence/noise and novice-accent cases do not produce measured pronunciation grades. Speaking and listening remain distinct. Audio stays local in packet capture. Keyboard and text alternatives cover every voice action. | **5–8 builder-weeks** |
| **5. Calibration and efficacy pilot** | Frozen held-out item bank, scheduled research probes, local prediction ledger, exportable study packet, preregistered pilot and analysis. | Prospective predictions cannot use later outcomes; probe repetitions and assistance tracked; outcome assessor blinded where possible; report attrition, adherence, uncertainty and harms. No efficacy copy released before results. | **3–5 builder-weeks**, plus **6–12 calendar weeks** for observation, both estimates |
| **6. Product hardening and packaging** | Offline packs, storage recovery, accessible bilingual UX, explicit exports/imports, accountless paid entitlement where permitted, mobile packaging after capability tests. | Full offline session; interrupted append/export recovery; fixture replay across supported runtimes; data erasure workflow; screen-reader and keyboard review; no provider key in bundle/logs. License/store review completed for actual distribution. | **4–6 builder-weeks** |
| **7. Optional cloud/sync edition, only after law decision** | Separate conditional capability: encrypted export-envelope replication and scoped provider relay with metering; no server learner-model authority. | Owner has explicitly approved a revised egress law. Concurrent/offline review conflicts retain both original events; no duplicated scheduling transition. Per-user authorization, rate/spend limits and deletion tested. | **4–7 builder-weeks**, conditional and excluded from baseline |

**CALCULATED baseline effort:** milestones 1–6 sum to **26–40 builder-weeks**; optional milestone 7 makes **30–47**. These are additive effort ranges, not elapsed schedules. Content licensing negotiations, paid evaluator recruitment, device purchases, and external legal review are additional costs not estimated here. Parallel work can shorten elapsed time only when interfaces and ownership boundaries are stable.

### Milestone 1 implementation order and definition of done

1. Audit the checked-out repository, its instructions, active branch, storage paths, existing FSRS version, tests and data manifests. Preserve uncommitted learner records; never run a migration against the owner's only copy. Capture the current inventory rather than trusting the supplied counts.
2. Add one typed command boundary and reference reducer around existing storage. Write real migration fixtures for legacy events with missing provenance; no invented evidence. Record scheduler/version/config/clock dependencies.
3. Add record-driven goals, language preferences, time budgets and placement attempts. Build a small reviewed item/template set covering the supported modalities; explicitly mark untested regions.
4. Build a local context assembler and accepted session-summary flow. Add exact local archive retrieval before embeddings. Introduce the proposal/confirmation executor and immutable receipts.
5. Install the trusted content-release registry and minimal C4 gate before connecting the tutor to a local runtime on supported hardware. Every instructional Japanese span and grammatical explanation resolves to an approved content/receipt hash or the tutor abstains. Its first end-to-end loop must inspect evidence, propose a diagnostic probe, receive a real response, propose a source-backed next action, and resume correctly after restart. Milestone 3 expands the gate and mining coverage; it does not introduce the first gate.
6. Make the planner consume the actual derived model and FSRS queue. Expose why each activity was selected and let the learner confirm or change it.
7. Exercise the exported record on a clean installation and compare canonical model/queue hashes. Demonstrate both a learner with no Japanese and a different advanced learner using the same build and different records. Ship only the hardware/modality support that passed.

The milestone fails if it is merely a persistent chat transcript, if placement is a guessed level, if the plan is a fixed syllabus, if the model is read only by the mirror, or if the cloud path is quietly retained as the only tutor.

## J. Risks and owner decisions

| Decision / risk | Recommendation | What remains uncertain or must be authorized |
|---|---|---|
| Export-only versus seamless cloud intelligence | Keep the strict law for the baseline. Deliver local tutoring on tested hardware and a manual export/import research workflow. | Seamless personalized Claude/voice/sync requires an explicit change to law 1; no authorization assumed here. Local Japanese tutoring quality remains UNVERIFIED until evaluated. |
| “Better than all competitors combined” | Replace this with a narrow, falsifiable product hypothesis: evidence-grounded adaptation improves delayed, unassisted transfer for defined learners/tasks. | Market-wide superiority and universal feature uniqueness are UNVERIFIED. |
| First launch audience and hardware | Launch with self-directed adult learners and an explicit supported desktop/browser matrix; make novice and advanced records part of acceptance. | Owner chooses initial target devices and distribution. Universal mobile local-LLM performance is UNVERIFIED. |
| Confirmation burden | Confirm displayed finite batches of concrete proposals and preserve direct learner controls. Measure rejection and abandonment. | Do not weaken “AI proposes, learner confirms” through hidden auto-accept or remembered blanket write authority. |
| Generated-content correctness | Prefer attested/editorially reviewed content first; add generation only with explicit release classes and a correction path. | Dictionary checks and model self-critique cannot establish naturalness or correct pedagogy. |
| Commercial asset rights | Ship an asset manifest and attribution UI; quarantine anything lacking exact provenance/license. Retain existing assets only after audit. | Existing sentence/article/mock rights are USER-SUPPLIED / UNVERIFIED until inspected; permissions may require replacements or agreements. |
| Append-only versus erasure | Separate encrypted payloads from minimal audit metadata and support full record destruction/export replacement. Treat legal erasure as a real exception to retention. | Crypto-erasure is not automatically a legal conclusion; backups, metadata and already exported copies matter. |
| Probability displays | Begin with examples, denominators and uncertainty labels. Enable calibrated per-task predictions only after held-out validation. | No observed-only level claim, aggregated readiness, or pass probability. |
| FSRS-6 pin | Keep it because it is a product law; isolate it behind a versioned deterministic adapter. | Any scheduler replacement requires an explicit future decision; benchmarks do not override the law. |
| Efficacy resources | Fund independent Japanese assessment and delayed transfer testing before marketing gains. | A single learner can establish personal utility, not general efficacy. Cohort size needs pilot variance and a prospective power analysis. |
| Account/payment scope | Keep learner records accountless. Treat commercial entitlement and learner state as distinct systems. | Store approval, jurisdictional obligations and commercial pricing must be checked for actual launch implementation. |
| Cloud pricing and cache behavior | Use the fetched official Sonnet rate and a cache-miss stress test; re-quote and measure billed tokens before pricing the product. | The reason for an older indexed price discrepancy is UNVERIFIED; account-specific bills, tool fanout and cache behavior still need measurement. |

### Build contract

The first deliverable is a stateful local sensei, placement and planner that actually alter subsequent behavior from inspected evidence. Completion means a learner can see why the app chose an activity, perform it, correct the record, restart, and reproduce the resulting plan and review queue from the export. A later efficacy claim must refer to measured outcomes, an identified population and a dated study—not the existence of this architecture.
