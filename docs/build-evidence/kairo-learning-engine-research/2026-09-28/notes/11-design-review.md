# Design audit appendix — actionable findings

**This is an engineering review appendix, not an additional research track.** Review date: 2026-09-28. Reviewed artifact: `BUNKI_BUILD_SPEC.md`, sections B–D and I–J as present during review; A/E/F/G/H placeholders were expected and excluded. Reviewed snapshot SHA-256: `e0ac2a98431a413f15629b849cd0bbb07b2ad6bbde023e4e86aade76179431e3`. Findings concern specified behavior, not an implemented repository. No code or learner record was modified. All changes and acceptance fixtures below are **recommended fixes**. The synthesis author will record disposition against a later revision; this appendix does not assert those fixes are implemented or verified.

## P0 — Proposal confirmation can invalidate itself and can be replayed

**Location:** B1/B2, C2; milestone 1.

**Failure:** C2 binds a proposal to `ledgerHead`, but logging `proposal.created`, its confirmation, or a clock checkpoint advances that head. A literal implementation can therefore reject every proposal as stale, or weaken the check arbitrarily. No explicit consumed-action/idempotency rule prevents a double click, retry or repeated imported result from creating duplicate cards or actions.

**Required change:** separate `sourceHead` from a deterministic dependency fingerprint covering only the evidence/configuration/assets read by the proposal. Specify the exact comparison point before append. Validate confirmation, expiration, scope, payload hash and dependency fingerprint, then atomically append confirmation plus effect with a unique `actionId`; consume that ID exactly once. Audit-only rows must not create an accidental freshness loop. Any recomputed result changing the authorized scope or payload requires a new confirmation.

**Acceptance fixture:** proposal → unrelated audit event → confirm applies once; changed target evidence → confirm returns a fresh preview; double click and crash/retry produce one effect; the proposal cannot authorize its own confirmation. These are proposed test cases, not observed bugs.

## P0 — A generated “validation bundle” has no explicit trusted issuer

**Location:** B2 `card.created`, C2 `propose_card`, C4.

**Failure:** the AI proposes a card including a validation bundle, and release classes allow `editorially_verified_generated`. The draft does not define who may issue that class, how the host authenticates it, or which exact bytes it covers. A model could self-label content “editorially verified,” or reuse an old receipt after changing a reading, translation, distractor or audio. A dictionary-linked original sentence does not validate a newly transformed exercise.

**Required change:** make release status a host-derived result from trusted validation receipts, not an accepted model-supplied field. Bind each receipt to hashes of the Japanese text, reading annotations, gloss/translation, relevant task/key/distractors, audio and source context; record verifier version and authorized editorial reviewer identity. Define which transformation invalidates which receipt. Imported receipts must be verified against a trust policy. Revocation must invalidate downstream teaching uses until revalidated.

**Acceptance fixture:** model sets its own release class → rejected; verified sentence with changed particle/reading/key → quarantined; revoked source → absent from subsequent teaching selection. A confirmation receipt cannot substitute for a linguistic verification receipt.

## P1 — Historical corrections and scheduler configuration lack replay semantics

**Location:** B1/B2/B4.

**Failure:** “resolve active view” does not specify whether a replacement review is replayed at its original logical slot/time or the later correction time. These yield different FSRS state. The draft also does not specify whether accepting new parameters or retention reschedules existing cards, or only affects future transitions. Accepted optimizer parameters may refer to a training set containing a subsequently invalidated rating.

**Required change:** define a correction overlay before state reduction. A valid replacement occupies the original attempt/review's logical slot; correction time remains audit metadata. Specify deterministic behavior for deletion, replacement, dispute and correction-of-correction, including subsequent reviews. Each scheduler configuration event must explicitly select its rescheduling semantics. Accepted parameter vectors remain historical data unless explicitly superseded; an invalidated training member marks their lineage as stale and offers re-optimization, never silently refits them during replay. Forbid correction routes from carrying AI-authored grades.

**Acceptance fixture:** change an early rating and replay later ratings/config changes on a clean installation; canonical card state and due queue match. Repeat with an invalidated training review and confirm that no hidden optimizer run changes accepted parameters.

## P1 — Assistance conflates answer revelation with assisted retrieval

**Location:** event schema, B2/B4/B6; card and dojo query contracts.

**Failure:** one attempt-level `assistance` enum includes `revealed`, while normal flashcard review requires revealing the answer before selecting Again/Hard/Good/Easy. A literal implementation can either exclude every ordinary review from eligible evidence or count an answer shown before retrieval as unassisted. The schema has shown/revealed times but no explicit response-commitment boundary.

**Required change:** record phase-specific assistance events and a `responseCommittedAt` boundary. For self-rated flashcards, the reveal action can close the retrieval phase and record the learner's commitment; its later self-rating remains self-report. Distinguish hints/lookups/answers before commitment from feedback after commitment. Store scoring-source provenance separately from response assistance. An AI rubric suggestion shown before a learner adopts its score must remain an AI-assisted interpretation, not silently become independent measured assessment.

**Acceptance fixture:** self-rating after ordinary reveal remains eligible with self-rating provenance; hint before commitment is practice-only; answer-key exposure through a tool preview contaminates the instrument; fixed-key grading after response commitment is permitted without granting the AI grading access.

## P1 — Placement/diagnostics need an explicit firewall from FSRS state

**Location:** B2/B4/B6, C2 `propose_probe`/`propose_card`, D.

**Failure:** the intended separation is stated but “sole input route to an ordinary FSRS review transition” leaves initialization, imported knowledge and diagnostic success insufficiently specified. Builders could seed stability, difficulty, last-review time or due date from placement or a tutor diagnosis, or count `attempt.scored` plus `review.rated` as separate measured outcomes.

**Required change:** define a scheduler input whitelist: confirmed card lifecycle, explicit learner-accepted scheduler configuration, trusted clock checkpoints and learner-origin `review.rated`. Placement/production/observation/exposure rows cannot seed or advance memory state. A newly confirmed card starts from the pinned adapter's empty-card initialization at the accepted checkpoint. A review-associated score and rating must share one `attemptId` and produce one measured outcome plus one scheduler transition, not two mastery counts. Delayed research probes are assessment administration events; they never write card due dates.

**Acceptance fixture:** identical card/config/rating histories plus different placement, observations and exposure produce identical FSRS state hashes; placement changes the plan but not card due dates; one scored/rated attempt increments a measured denominator once.

## P1 — Redaction and source correction can leave stale memory or fail replay

**Location:** B1 missing-blob failure, B2 redaction, C1 summary retrieval; G implementation follow-up.

**Failure:** B1 treats a missing blob as invalid, while B2 permits redaction and withdrawing evidence. Without an explicit authorized-tombstone path, legal deletion can make export unreplayable. A summary or accepted observation may also retain the substance of a redacted/corrected utterance, causing the tutor to reintroduce a withdrawn claim.

**Required change:** distinguish unexplained corruption from intentional redaction recorded by an authorized event. Precompute withdrawal/revocation indexes before blob validation and context assembly. Define dependency invalidation for derived summaries, observations, retrieval indexes and cached contexts. A independently confirmed personal preference may survive only under an explicit separately supported row; do not preserve it accidentally through a summary. Hash surviving envelopes/ciphertexts while marking destroyed plaintext unavailable.

**Acceptance fixture:** redact a transcript and restart/export/import; replay succeeds with withdrawn evidence visibly unavailable, and searches/summaries cannot recover or reassert it. Missing unredacted blob still fails closed.

## P1 — Generated teaching verification is scheduled after the first tutor release

**Location:** C3/C4, milestones 1 and 3.

**Failure:** milestone 1 ships a local tutor that can select and explain Japanese, while the explicit quarantine/verification pipeline is primarily milestone 3. C4 also allows only attested/reviewed or editorially verified generated teaching, but no operational editorial turnaround for live generated replies is specified. A builder may ship unchecked Japanese as ordinary dialogue while reserving verification for cards.

**Required change:** make a minimal C4 content gate and trusted released-content registry a milestone-1 dependency. Initial instructional Japanese must be a reference to exact reviewed text/template output, or wait for an authorized editorial release. Specify how non-authoritative drafts are shown without being presented as instruction. Explanations in another language that assert Japanese rules should cite approved explanations, rather than bypassing the gate because their characters are not Japanese. Milestone 3 expands source coverage/mining; it does not introduce the first safety boundary.

**Acceptance fixture:** every Japanese instructional span in milestone 1 resolves to a released content hash; unchecked streaming output cannot enter the teaching region; a changed template substitution is revalidated; the unsupported case offers an attested example or abstains.

## P1 — Selection and placement contain unresolved policy predicates

**Location:** B3/B4/B5/B6 and D.

**Failure:** `limited/repeated/mixed`, “enough independent observations,” supported-token coverage, weak units, burden bounds, the staircase transition, and the prespecified precision stopping rule are not defined executable policies. Separate builders can produce different model/frontier/placement behavior while believing they implement the same draft.

**Required change:** add a versioned policy manifest defining each predicate, sampling stratum and stop condition. Label initial constants as proposed engineering defaults, not research results. Define how unknown, skipped, assisted, contradictory and repeated-context items affect the staircase and evidence strength. Specify conservative/possible coverage membership and zero-denominator behavior. Include deterministic fixtures with expected selected items and reason codes. Omit a precision stop until a justified uncertainty estimator exists rather than leaving it as a vague placeholder.

**Acceptance fixture:** two reference implementations given the same event/assets/policy inputs produce identical evidence labels, coverage bounds, next placement item and frontier order; clock-only/audit changes have only their explicitly intended effects.

## P1 — Capture exact public teaching dependencies and reject active imports

**Location:** B1 asset manifests, B2 attempts/cards/imports, C4; F/G implementation follow-up.

**Failure:** a source URL or catalog identifier does not preserve the exact text, annotations, answer key or audio segment used for a past attempt. Separately distributed asset packages are permitted by B1, but no export completeness check or active-content import rule is specified. A locally opened HTML/SVG/card asset could also load remote pixels, fonts or audio despite the tutor having no network tool.

**Required change:** materialize immutable task versions and all pedagogically relevant dependencies in content-addressed local assets at use time. Export includes redistributable dependencies or a manifest marking exactly which pinned packs must already be installed and what is non-portable; never silently fetch a current URL as the old material. Do not copy third-party content contrary to its license merely to achieve portability. Imported media/markup must be inert, sanitized and blocked from remote subresource requests by the application network policy. User-provided source URLs are provenance data until an explicitly permitted import path resolves them.

**Acceptance fixture:** remote source changes/disappears and offline replay still uses the original captured task; an unavailable licensed dependency produces a precise portability error; a card containing a remote image/CSS/font cannot cause learner egress. Redacting learner payloads does not delete public packs still referenced by other valid events.

## Final specification rereview — 2026-09-28

The fully assembled draft was reread at B3/B4/B5/B7, C2/C4, G1 and milestone 1. Reviewed snapshot SHA-256: `dfe0f557040120cfbaec51aed4dd908d5547d015b3d3ab7f12c6865ef174da16`. **All dispositions below concern the specification only: no implementation, tests or runtime behavior were inspected.** The original findings above remain as an audit trail; they are not an assertion that the revised document still omits these controls.

| Original finding | Disposition | Revised specification evidence |
|---|---|---|
| Proposal self-invalidation/replay | **Addressed in specification, not implemented/tested.** See remaining predicate-dependency refinement below. | C2 separates audit head and semantic dependencies; requires atomic confirmation/effect and consumed action IDs. B5/B7 use semantic state for tie-breaking. |
| Trusted verification issuer | **Addressed in specification, not implemented/tested.** | C4 requires host-derived status, trusted exact-content receipts, editorial roles, transformation invalidation and revocation. |
| Historical correction/config replay | **Addressed in specification, not implemented/tested.** | B4 specifies correction overlays, original review slot/time, explicit configuration apply modes and stale optimizer lineage without silent refitting. |
| Assistance versus reveal | **Addressed in specification, not implemented/tested.** | B1 schema and B4 distinguish pre-commit assistance, response commitment and post-commit feedback; AI-suggested rubric grades are not independent human measurement. |
| Placement/FSRS firewall | **Addressed in specification, not implemented/tested.** | B4 whitelists scheduler inputs, forbids placement/probe seeding and deduplicates shared attempt score/rating evidence. |
| Redaction/correction memory residue | **Addressed in specification, not implemented/tested.** | G1 builds withdrawal indexes before blob checks and removes dependent memory/retrieval evidence while preserving separately supported preferences. |
| Minimum verification before tutor release | **Addressed in specification, not implemented/tested.** | C4 and milestone-1 step 5 explicitly install the release registry/gate before the tutor; every instructional span or grammar explanation needs an approved hash or abstention. |
| Executable initial policy | **Addressed in specification, not implemented/tested.** | B7 defines evidence windows, support predicates, denominator/burden rules, staircase/stopping and semantic ties as versioned proposed defaults. |
| Public teaching dependencies/active imports | **Addressed in specification, not implemented/tested.** | F3/G1 require exact content capture, rights-aware export completeness and inert imports with remote-subresource blocking. |

### Remaining high-severity refinement: semantic dependencies must include predicates and absence

**Location:** C2, B5/B7, G1 cache keys.

**Failure:** hashing only the exact immutable evidence rows read does not invalidate a proposal when a newly appended row changes its premise. For example, a probe is selected because a node has no measured evidence; a successful attempt arrives before confirmation; all previously read row hashes remain identical. New contradiction rows, changed active correction mappings, new goals and release revocations present the same class of issue. The model must not select its own minimal dependency list to avoid invalidation.

**Required change:** the host owns dependency extraction. A proposal and its cache record include versioned query/predicate identifiers, parameters and result-set/absence fingerprints, not only referenced rows. At confirmation, recompute those query results under the active correction/withdrawal/release/migration indexes, policy/assets and any relevant clock. Compare atomically with effect append. A clock dependency applies to conservative support/coverage freshness as well as FSRS due queues. Do not use the full audit head as a shortcut that reintroduces the original self-invalidation problem.

**Acceptance fixture:** propose a diagnostic based on missing evidence, append eligible evidence, and confirm; the action must return a fresh preview. Repeat with a new contradiction and source revocation. An unrelated audit-only row must not invalidate the action or reshuffle tied candidates.

### Remaining high-severity refinement: dictionary migrations must define evidence continuity

**Location:** B3 node identity, B1/B7 asset/policy activation.

**Failure:** release-scoped word IDs and versioned sense keys preserve source identity, but “aliases across releases” and “explicit migration map” do not specify whether a dictionary entry/sense split, merge, renumbering or changed reading transfers prior evidence. A builder can either erase apparent knowledge on every update or copy one old success to all successor senses/readings. Both undermine the intended learner model.

**Required change:** store evidence against immutable original node/version IDs. Activate a content-hashed, accepted migration map with explicit relation types and provenance. Only a reviewed unambiguous one-to-one identity equivalence may preserve identity in the current projection. A spelling alias is not a knowledge-equivalence relation. Ambiguous splits/merges retain distinct nodes and uncertainty; new meanings/readings receive no fabricated measured credit. Historical cards and review identities retain their original targets unless the learner explicitly creates replacement cards. Define migration order relative to correction overlays and include the active mapping in semantic dependency hashes.

**Acceptance fixture:** a pure renumbering preserves the same supported capability through a reviewed equivalence; a sense split gives no automatic success to both children; a newly introduced reading remains unmeasured; replay before and after map activation preserves original evidence and FSRS history.


## Final synthesis disposition — 2026-09-28

The synthesis author added both follow-up refinements to the final specification: C2 now requires host-owned predicate/membership/absence dependency checks at atomic confirmation; B3 now requires accepted versioned identity equivalence and keeps ambiguous dictionary splits/merges unmeasured. All eleven findings are **addressed in specification, not implemented or integration-tested**. Final reviewed-by-synthesis specification SHA-256: `45fb173b2a11f677514360666e99653c5ef7f3d2a32b87cebf9399cb6ced5cf2`.
