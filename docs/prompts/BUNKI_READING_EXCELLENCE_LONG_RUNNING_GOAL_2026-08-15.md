# /goal — Bunki Reading Crown Campaign

**Date:** 2026-08-15

**Mode:** Long-running, multi-agent, evidence-gated product campaign

**Scope:** Close the complete Bunki reading, listening, discovery, contextual-learning, capture/SRS, editorial, and adaptive-AI loop inside the one integrated prototype

**Operator ruling:** The reading section is presently 3/10. Article count, code presence, static screenshots, mocks, and passing unit tests do not constitute closure.

**Evidence baseline:** 17/100, with a hard ceiling of 30/100 until the exact current phone build demonstrates a complete discover → open → read/listen → inspect → capture → review → resume loop. The binding omissions ledger is in `docs/operator/BUNKI_READING_EXCELLENCE_RUBRIC_AND_CLOSURE_SPEC_2026-08-15.md`.

Work autonomously until you reach exactly one terminal state defined in §18. Do not stop because one wave is complete, an agent hits a rate limit, a browser is temporarily unavailable, a provider key is missing, or a test is inconvenient. Complete every safe independent task first, preserve a resumable remote-visible state, and stop only when the remaining blocker genuinely requires operator authority, human editorial judgment, licensed material, paid credentials, or a physical-device action.

## 1. Mission

Turn Bunki's reading section from a fixed article list into the strongest calm Japanese reading-and-listening instrument in its class.

The canonical learner journey is:

> rights-clear/private text → versioned Japanese analysis → living personalized shelf → full reader and excellent audio → contextual word/grammar/kanji understanding → explicit `覚える` / list choice → explicit Learn/Master promotion → canonical finite SRS → comprehension/listening/production evidence → explainable next recommendation → exact return to the same source and place

The result must combine:

- Todaii's freshness, feed breadth, selectors, and article-to-study loop;
- Satori Reader's editorial trust, contextual explanation, human-performed audio standard, serialized journeys, and context-preserving SRS;
- Migaku's low-friction capture of rich sentence/media context;
- Bunpro's multi-context grammar retrieval;
- Manabi/LingQ's import and offline strengths where lawful; and
- Bunki's own quiet, progressive-disclosure, living-ink and washi visual language.

Feature parity does not mean button parity. Japanese text remains primary. Capability appears on intent.

## 2. User and adaptation target

The operator is the first real learner:

- high daily-conversation and general comprehension;
- uneven N3/N4 grammar, kanji readings, and pronunciation;
- interested in AI/coding, Japanese culture/history, spirituality/philosophy, literature, science/nature, current affairs, work/business, and serious essays;
- wants objective JLPT truth without reducing learning to one score.

Optimize the initial profile for this learner, but encode no operator-specific fact as product logic. The same information architecture must adapt cleanly from N5 beginners through N1/advanced learners.

## 3. Known handoff — verify live before acting

At authoring time the remote refs were:

- `main`: `5e5075dc29eb292f86e6ce0b50decf8bd0bf3ece`
- `claude/app-vision-next-steps-wei73a`: `952dbc7acc3ce5fc5e0497e854c0df39e41c51ab`
- `agent/bunki-integrated-prototype-2026-08-15`: `c807051f71bfd09a1708a733ce4fc026a7bf0832`

These coordinates are observations, not permission to use a stale baseline. Before editing:

1. fetch and inspect live `origin/main`, the Claude integration branch, open PRs, deploys, and checks;
2. identify the current sole integration head and merge base;
3. inspect working-tree dirt and preserve unrelated user/agent changes;
4. compare current code/data/evidence with every binding requirement below;
5. record exact SHAs, trees, URLs, workflow runs, and timestamp in the campaign manifest; and
6. stop with `READING_BLOCKED_AUTHORITY_CONFLICT` if two live authorities cannot be reconciled from explicit operator rulings.

Do not silently reset to the SHAs above.

## 4. Authority order

When sources disagree:

1. the operator's latest direct words and feel verdicts;
2. this `/goal` for reading-campaign execution;
3. `docs/operator/BUNKI_READING_EXCELLENCE_RUBRIC_AND_CLOSURE_SPEC_2026-08-15.md`;
4. `docs/operator/BUNKI_PR72_WHOLE_PROTOTYPE_CLOSURE_2026-08-15.md`;
5. `docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md`;
6. Product Lock, Master Definition of Done, and converged v2 architecture;
7. later ratified KAIRO redirects for visual craft;
8. current repository evidence;
9. historical prototypes, branches, screenshots, and automated checks as donors/regression evidence only.

Read every selected authority in full before implementation. A stale automated check may not overrule a later operator ruling; update it.

## 5. Non-negotiable product laws

### 5.1 One product and one learner state

- Corridor is the sole operator-facing integration vessel during this prototype campaign.
- `@bunki/domain` plus `@bunki/persistence` is the sole canonical learner-state authority.
- Pinned `ts-fsrs` 5.4.1 / FSRS-6 semantics remain the only scheduler authority.
- Corridor `S.taken`, `S.srs`, `S.obsLog`, Drift state, Sites `Phase2State`, provider chat memory, and embeddings are not alternate truths.
- No temporary dual-write bridge is permitted.
- New learner-state, evidence, routing, rights, and scheduling semantics land in canonical packages first, then the vessel consumes them.
- Every mutation is append-only, atomic, replayable, exportable, and recoverable. A failed persistence write leaves no visible mutation.

### 5.2 Capture creates no debt

- Save/Keep/list membership schedules nothing.
- Explicit Learn or Master activates declared retrieval contracts.
- Exposure, lookup, scrolling, no-tap, comprehension assistance, AI inference, and recommendation acceptance do not become mastery.
- Retrieval evidence is modality-specific and preserves cue, response, accepted-answer snapshot, hint/reveal path, latency, submitted/effective grade, and contract version.
- Reveal before declared recall forces Again.
- Undo appends a supersession/correction event; it never rewrites history.

### 5.3 AI proposes; the learner confirms

- AI may explain, recommend, synthesize, draft, and propose.
- AI may not mutate canonical facts, grades, lists, promotion, or scheduler state without an explicit learner action through a versioned contract.
- Every generated artifact carries provider/model/version, prompt/template version, source grounding, confidence, creation time, approval/correction lineage, and deletion policy.
- Conversation memory is a derived, versioned graph over canonical events and content—not opaque provider memory or a second mutable learner database.
- Consent, retention, export, correction, and deletion are visible and testable.

### 5.4 Rights and editorial truth

- Never scrape, reproduce, translate, or synthesize around a rights boundary without a lawful basis.
- Authentic, public-domain, licensed, user-imported, AI-assisted, and inferred material remain visibly distinct.
- Private drafts cannot leak into public/default lanes.
- Agents may prepare drafts and automated checks; agents may not self-approve Japanese editorial quality.
- Human/TTS voice provenance is explicit.

### 5.5 Calm is functional

- The reader is literary and Japanese-first.
- Controls recede until requested.
- No dense dashboard, badge wall, gamified coercion, advertisements, shame, or subscription interruption enters the reading flow.
- Contrast, touch size, Dynamic Type, keyboard/VoiceOver behavior, responsive performance, and predictable navigation are part of the aesthetic.

## 6. Git and coordination protocol

### 6.1 Integration authority

- `claude/app-vision-next-steps-wei73a` is the sole integration line unless the operator later changes it.
- The campaign executor never pushes to, merges into, rebases, force-pushes, or opens a PR against that branch.
- Never push or merge `main`.
- Before any product-source edit, query the live remote, record `authorityHeadAtCut`, its tree, merge base, branch, URL, and timestamp, and create a clean worktree from that exact head. A dirty root checkout, an unpublished local commit, an old Sites checkpoint, and the dated observations in §3 are never valid execution bases.
- First publish this controller, the reading rubric, the initial manifest, and `RUN_STATE.md` on a dedicated remote-visible controller branch. Verify the exact pushed SHA with `git ls-remote`. Substantial implementation must not begin until Claude and every other remote agent can retrieve that controller from Git.
- Start each atomic workstream from the live Claude head in its own clean worktree and donor branch:
  - `agent/reading-campaign-controller-YYYYMMDD`
  - `agent/reading-r0-evidence-YYYYMMDD`
  - `agent/reading-r1-domain-YYYYMMDD`
  - `agent/reading-r2-reader-YYYYMMDD`
  - `agent/reading-r3-discovery-YYYYMMDD`
  - `agent/reading-r4-audio-YYYYMMDD`
  - `agent/reading-r5-learning-loop-YYYYMMDD`
  - `agent/reading-r6-ai-assessment-YYYYMMDD`
  - `agent/reading-r7-content-editorial-YYYYMMDD`
  - `agent/reading-r8-closure-evidence-YYYYMMDD`
- Push donor branches only. Do not open a new PR unless the operator explicitly requests one.
- The trunk keeper selectively harvests reviewed commits.
- Finish bounded donors against their recorded `authorityHeadAtCut`; do not continuously rebase a moving child branch while implementation is in flight.
- Re-check the live integration head before every handoff. If it moved, audit the delta. When replay is safe, publish a new suffixed donor such as `-r2` from the new head and transplant only reviewed commits. Never force-update the earlier donor.
- Donors are selectively harvested, never wholesale-merged. Every handoff names source branch, source SHA/tree, authority base, owned paths, capability contracts, deliberate omissions, migrations, generated artifacts, checks, and any conflict-sensitive regions.

### 6.2 Multi-agent operation

Claude/Fable and Codex/GPT-5.6 act as coordinating reviewers. Use up to the available parallel-agent capacity—up to sixteen where the environment supports it—but every sub-agent receives:

- one bounded question or owned file set;
- exact baseline SHA;
- explicit read-only versus edit authority;
- expected output and evidence;
- no permission to push, merge, self-approve content, or change shared authorities.

Assign separate agents to competitor research, data/schema, domain events, reader/navigation, search/recommendation, audio, SRS, AI/privacy, editorial/rights, accessibility, performance/offline, adversarial testing, screenshot evidence, and final independent review.

Never allow two agents to edit the same file concurrently. The coordinator integrates with `apply_patch`, runs the gates, and owns conflict resolution.

Record a path-ownership table before each wave. One agent is the only writer for each file or generated family. Research, audit, and falsification agents remain read-only and may work in parallel.

### 6.3 Remote visibility and resumability

Push a reconstructible checkpoint at least every 90 minutes, before any context handoff, and after every wave. Each checkpoint includes:

- source and migrations;
- tests and fixtures;
- generated artifacts and generation commands;
- research/evidence receipts;
- screenshots and click ledgers;
- exact branch/head/base/tree coordinates;
- `authorityHeadAtCut`, owned paths, dependency heads, and the clean-worktree receipt;
- known blockers and next command;
- a resumable `RUN_STATE.md` capsule.

No local-only commit, Sites checkpoint, chat transcript, Library artifact, or unpushed corpus counts as delivered to collaborators. If Git authentication is unavailable before the controller is published, prepare only the controller/specification bundle, exact commit/tree, and safe publish command; do not begin substantial product implementation. Terminate as `READING_BLOCKED_REMOTE_VISIBILITY`. If authentication is lost later, finish only already-open safe atomic work, produce a byte-identical bundle, and use the same terminal.

Remote publication is necessary but not sufficient. A green donor is `awaiting harvest` until the trunk keeper has selectively integrated it and the resulting authoritative head has been independently reverified.

## 7. Evidence scale and score target

Use the 100-point rubric below. Score every criterion from 0–5:

- 0 — absent, broken, unreachable, or unverified;
- 1 — source/schema/static fixture/mock only;
- 2 — partial happy path or screenshot only;
- 3 — complete persisted core verified on physical phone;
- 4 — benchmark-level, cross-platform, offline/error/accessibility verified;
- 5 — category-leading, instrumented, and supported by longitudinal evidence.

| Dimension                                 | Weight |
| ----------------------------------------- | -----: |
| Catalog breadth and level coverage        |      5 |
| Freshness and publishing cadence          |      8 |
| Discovery, navigation, and search         |     10 |
| Personalization and rotation              |      7 |
| Card metadata and presentation            |      5 |
| Core reader UX                            |     10 |
| Audio and listening                       |     10 |
| Linguistic assistance                     |      9 |
| Capture and canonical SRS                 |      8 |
| Adaptive AI                               |      6 |
| Comprehension and transfer                |      5 |
| Sharing, continuity, and discussion       |      3 |
| Editorial quality, provenance, and rights |      5 |
| Offline, performance, and accessibility   |      5 |
| Durability and engagement                 |      4 |

The campaign may produce a candidate only when:

- score ≥85/100;
- no hard cap remains active;
- no criterion scores below 3;
- Reader, Discovery/Search, Audio, Capture/SRS, and Editorial/Provenance each score at least 4;
- every claim has exact-SHA rendered evidence; and
- all remaining human gates are isolated and explicitly handed to the operator.

Hard caps:

- no reliable complete reader → total cap 30;
- no working article audio → total cap 60;
- freshness and discovery both below 2 → total cap 59;
- unknown rights or unapproved public content → public release blocked;
- meaning-changing reading/name/number/spoken-text error → release blocked;
- canonical learner-state loss or promised restore loss → release blocked.

## 8. R0 — Reconcile reality and establish the evidence baseline

Complete before product edits:

1. reconcile Git/GitHub/deploy state and one-vessel authority;
2. inspect the exact candidate served at every live URL and bind page-visible build metadata to SHA;
3. enumerate every reading entry path and every interactive element;
4. capture matched baseline screenshots at 320×568, 390×844, a large iPhone viewport, tablet, and desktop;
5. capture console, page, network, accessibility, performance, and offline logs;
6. perform three cold opens and prove the repeated fixed-list defect;
7. click first, middle, last, draft, archive, missing, and malformed article cards;
8. verify reader attachment, full bodies, Back/Forward/Escape/edge-back, resume, reload, and failure states;
9. rerun the metadata census, corpus manifest, current rubric, and all existing tests;
10. store a screenshot comparison pack for Todaii, Satori, LingQ, Manabi, Migaku, Bunpro, and MaruMori, labeling live captures separately from official marketing/reference imagery; and
11. publish the R0 click graph, screenshot index, current score, gaps, and exact reproduction commands.

The campaign may not claim a regression if it never captured the current behavior.

## 9. R1 — Canonical reading domain and content contracts

Implement or verify, in canonical packages first:

### 9.1 Article contract

Every article/version carries:

- stable article and version IDs;
- Japanese title, English title, kana title/reading;
- complete body and paragraph/sentence/token anchors;
- series, episode, order, category, topics, register, genre, and learner bands;
- lexical/grammar/kanji difficulty evidence and model/version;
- original publication date, Bunki added date, reviewed date, and freshness class;
- source, author, publisher, canonical URL, license/permission, transformation rights, and attribution;
- authoring method, AI model/prompt lineage where applicable, Japanese editor, annotation reviewer, and approval state;
- character/word/sentence counts and reading/listening duration;
- image rights/alt text;
- `surface_text`, editor-approved `spoken_text`, pronunciation overrides, sentence timecodes, voice provenance, and audio approval;
- translation, notes, questions, answers, evidence spans, and approval receipts; and
- supersession/correction history.

Reject invalid, future, ambiguous, rights-incomplete, or publicly unapproved records at the correct boundary.

### 9.2 Learner-event contract

Add versioned commands/events/projections for:

- article exposure/start/progress/finish/reread;
- sentence focus and assistance type;
- bookmark/list membership/download;
- lookup with actual encountered span/sense;
- audio start, sentence replay, speed, and listening completion;
- comprehension response with evidence and assistance;
- explicit capture/Keep/Learn/Master;
- recommendation impression, reason, accept/dismiss, and correction;
- conversation thread tied to article version and sentence span; and
- export, correction, deletion, and migration receipts.

Exposure events remain low-authority. No event above fabricates recall.

### 9.3 Migration law

Legacy Corridor/Sites/Drift state may enter only through a versioned dry-run importer that deeply validates, shows itemized proposed effects, creates no hidden debt, appends transactionally, produces replay receipts, and preserves/quarantines original bytes. Never import mutable projection objects directly.

## 10. R2 — Attach and complete the reader

Make every eligible article card and deep link open the correct complete body in a real route/state.

Required reader behavior:

- full body, JP/EN titles, source/editorial truth, category/series/level/duration;
- exact Back, Forward, visible Back, Escape, browser/device edge-back, and source return;
- exact scroll/sentence/audio-position resume across internal navigation and reload;
- font size, line height, measure, day/night and all ten Bunki worlds;
- kanji as written / knowledge-aware / kana;
- furigana all / unknown / tap / off;
- spacing none / words / phrases;
- translation hidden / sentence / full;
- sentence focus and sentence repeat;
- next, previous, related, series continuation, bookmark, share, download, and finish;
- immersive mode where apparatus recedes without hiding enabled learning marks;
- honest loading, empty, missing, offline, rights-blocked, draft, superseded, audio-missing, and error states;
- no nested controls, dead buttons, focus escape, gesture-only action, or false affordance.

Reader first meaningful text must be ≤1.5 s p75 on ordinary mobile network and ≤500 ms warm cache. Tap lookup must be ≤150 ms local p75.

## 11. R3 — Replace the fixed list with a living reading home

The default home contains:

1. **Continue** — exact article/position and recent starts;
2. **Fresh today / this week** — genuinely dated additions only;
3. **For your edge** — explainable learner-edge ranking;
4. **New to you** — approved back catalog not recently exposed;
5. **By theme** — current affairs, culture/history, daily life, technology/AI, science/nature, spirituality/philosophy, literature/stories, essays/opinion, work/business, and JLPT practice;
6. **By level** — N5–N1 plus empirical comfort bands;
7. **Series and journeys** — premise, order, progress, next episode;
8. **Saved and history** — bookmark, complete, download, and recent lookup;
9. **Surprise me** — learner-appropriate, exposure-aware, reasoned selection.

### 11.1 Rotation law

- stable within a session;
- Continue state-driven and stable;
- Fresh chronological and truthful;
- For Your Edge rotates at least 30% between daily sessions when eligible supply exists;
- first twelve recommendations contain at least four categories and no more than two from one source;
- completed/recent items suppress for a reasoned interval;
- Surprise does not repeat within fourteen uses;
- no out-of-envelope difficulty without consent;
- Back restores exact order and scroll.

### 11.2 Search

One reading search—not dictionary masquerading as reading search—indexes JP/EN/kana titles, body/lemmas, category, series, topics, register, JLPT/comfort, grammar, kanji, source, dates, duration, audio, and learner state.

It supports Japanese IME, kana/kanji equivalence, full/half width, Unicode normalization, okurigana, reasonable romaji, exact and semantic modes, filters, clear/reset, helpful zero-result recovery, keyboard, and screen reader.

Gate it with a versioned ≥100-query judged set:

- exact known-item Recall@10 ≥0.98;
- mixed discovery nDCG@10 ≥0.85;
- p95 ≤300 ms local and ≤800 ms when a remote semantic stage is required;
- zero silent dictionary-route fallthrough.

### 11.3 Recommendations

Use fixed learner fixtures from N5 through advanced with explicit eligible, excluded, and expected-top sets. Require:

- 100% safety/rights/editorial eligibility correctness;
- calibrated difficulty, novelty, diversity, and exposure suppression reports;
- factually correct visible reasons;
- learner controls to dismiss, tune, reset, and inspect why;
- comparison with a dated level-filtered unpersonalized baseline; and
- no global opaque mastery scalar.

## 12. R4 — Article audio and three voice styles

Implement a server-safe provider abstraction. Never expose provider secrets or direct browser API keys.

User-facing styles:

1. **澄 / Clear reader** — news and essays;
2. **語 / Warm storyteller** — fiction and narrative;
3. **話 / Conversational** — dialogue and daily-life pieces.

Candidate bake-off includes:

- native-Japanese human narration as the gold anchor;
- Google Japanese Chirp 3 HD candidates;
- Azure Japanese Dragon HD/neural candidates;
- a consented native-Japanese ElevenLabs professional voice candidate; and
- OpenAI TTS only as an experimental dynamic-conversation candidate unless blind testing clears it for Japanese narration.

Required playback:

- article and sentence play/pause/replay;
- scrubber and ±10 seconds;
- 0.70×, 0.85×, 1.00×, 1.15×, and 1.30×;
- current-sentence highlight and auto-scroll;
- background/lock-screen playback;
- queue and continuous series play;
- voice switching without losing sentence/audio position;
- download/offline playback;
- visible human/neural provenance and degraded state.

Run a randomized, blinded panel with at least 24 native Japanese listeners, concealed provider identity, human anchor, and confidence intervals. Score correctness, naturalness, listening effort, prosody, long-form consistency, and preference separately.

Hard audio gates:

- zero meaning-changing, name, number, counter, or place-name error in the gold set;
- ≤1 minor pronunciation defect per 1,000 mora after editor overrides;
- mean naturalness ≥4.2/5;
- sentence highlight within 150 ms;
- cached start ≤500 ms and ordinary network start ≤1.5 s p75.

Agents may prepare the bake-off and implement the leading candidates. They may not impersonate the native-listener panel or self-approve its winner.

## 13. R5 — Contextual understanding, `覚える`, lists, and SRS

### 13.1 Context layer

A word/phrase tap shows the exact in-context sense first, then the full entry:

- surface, reading, lemma, POS, morphology/conjugation;
- context meaning and confidence;
- grammar role/register and reliable pitch data;
- word/sentence audio;
- 2–4 sourced examples;
- sentence-anchored grammar/culture notes with progressive depth;
- recursive word → sense → kanji → component → examples → source doors;
- exact return to the reader location.

### 13.2 Universal capture

The top-right `覚える` transaction is consistent for article, sentence, word, kanji, grammar, audio span, conversation turn, and test error.

A capture preserves article/version/title/source, exact sentence/span/token/sense, reading/grammar, audio voice/version/timestamps, learner note/list, rights/editorial status, timestamps, and correction lineage.

Tap saves to the current/default list; the disclosed list plane supports choosing, creating, renaming, and continuing lists without prompting through blocking browser dialogs.

### 13.3 Canonical finite review

- Keep creates no debt.
- Explicit Learn/Master activates exact contracts.
- Plans are finite and frozen at start.
- Fresh-card ceiling, due overflow, postpone, undo, suspend, and leech state are visible.
- Typed/choice/free/voice response grading uses immutable accepted-answer/rubric snapshots.
- Give-up/reveal produces Again.
- Review returns to exact source sentence/article.
- All effects survive reload, offline transition, export/replay, and promised authenticated restoration.

Delete or retire Corridor-local review authority only after canonical projection parity and migration evidence; never dual-write.

## 14. R6 — Comprehension, adaptive AI, memory graph, and testing

### 14.1 Per-article comprehension

Every approved article has at least three editorially verified questions with:

- one literal, one inference, and one language/structure target when appropriate;
- answer, explanation, and exact evidence span;
- listening variant where audio exists;
- optional short production prompt;
- typed assistance/reveal evidence;
- no schedule mutation from unverified AI judgment.

### 14.2 AI learning partner

AI may:

- explain the selected sentence at requested depth;
- generate cited examples grounded in approved facts;
- propose context-rich cards;
- generate follow-up passages/dialogues at the learner's measured edge;
- propose study plans and diagnostic question sets;
- recommend readings with explicit reasons;
- conduct adaptive conversation focused on observed gaps.

The memory graph contains versioned nodes/edges for content, encounter, sentence, sense, grammar, kanji, reading/listening/production evidence, question, conversation turn, correction, recommendation, and plan. It is rebuilt from canonical events/content, portable across provider/model changes, and supports inspect/export/correct/delete. Provider chat history is never canonical memory.

### 14.3 Objective assessment

Implement both:

- adaptive AI conversation diagnostics for practical edge discovery; and
- timed JLPT-style section/full mocks for objective N5–N1 comparison.

Mock content must be lawful, versioned, independently scored, and separated from SRS unless a declared learner action promotes an error. AI conversation never substitutes for standardized assessment.

## 15. R7 — Corpus, editorial, freshness, and sharing

### 15.1 Content lanes

Every item belongs to one visible lane:

1. commissioned/licensed original;
2. public-domain work;
3. permitted feed/link-out/user import;
4. AI-assisted private practice draft.

No unlicensed article reproduction. No `Source: Bunki` placeholder where an original publisher exists. Preserve author, publisher, original URL, license, transformation history, translator/editor, AI involvement, and last verification.

### 15.2 Breadth and cadence

Prototype target:

- ≥150 approved full readings;
- ≥30 per JLPT band N5–N1;
- ≥10 substantive categories;
- Japanese and English title on every visible item;
- no level/category desert;
- private drafts hidden by default behind an explicit prototype filter.

Freshness target:

- ≥5 approved additions per week;
- ≥3 categories and ≥2 learner bands each week;
- visible publication/add/review dates;
- older resurfaced items labeled `New to you`, never `Fresh`.

Longer beta target: ≥300 approved readings.

Agents may generate, analyze, and package drafts, but the campaign cannot count them as approved until human editorial receipts exist. If human approval becomes the only remaining blocker, terminate as `READING_BLOCKED_HUMAN_EDITORIAL` with the complete review packet.

### 15.3 Sharing

Every approved article has a canonical deep link and native share action with JP/EN title, lawful preview, publisher/author, and no learner-state leakage.

Sentence sharing obeys license/excerpt limits. The receiver lands on the same article version/span when permitted; otherwise show lawful metadata/excerpt plus original-source/paywall route. Test logged-out, paywalled, offline, revised, deleted, and rights-blocked receiver paths.

## 16. R8 — Offline, accessibility, performance, navigation, and adversarial closure

### 16.1 Offline and interruption

- Saved articles download body, ruby, essential lookup data, notes, progress, and selected audio.
- Cache/download state and failure are visible.
- Reader, lookup, progress, capture queue, and audio resume survive network transitions, interruption, background/foreground, and force-close within the stated web/native boundary.
- Feed prefetch is bounded; never download the entire corpus after boot.

### 16.2 Accessibility

Verify WCAG 2.2 AA, correct language/landmarks, Dynamic Type, reduced motion, high contrast, VoiceOver/TalkBack, keyboard, switch-compatible alternatives, 44×44 targets, focus order/traps, modal inertness, and no color-only meaning.

### 16.3 Navigation graph

Every reachable nonterminal reading state has:

- a visible or platform-standard exit;
- browser Back/Forward behavior;
- Escape/keyboard parity where applicable;
- exact source and scroll/focus restoration;
- no history trap, dead sentinel, accidental external exit, or route that discards learner context.

### 16.4 Interaction census

Enumerate every interactive element and state transition. Test pointer, keyboard, accessibility alternative, rapid repeat, long press where supported, Back/Forward, offline, reload, failure, and cross-state interaction.

Use pairwise coverage across:

- ten worlds;
- Japanese/bilingual copy;
- motion/reduced motion;
- contrast variants;
- phone/tablet/desktop;
- online/slow/offline;
- anonymous/authenticated;
- approved/draft/rights-blocked;
- audio available/missing/error;
- beginner/intermediate/operator/advanced profiles.

Run full cross-product journeys for critical paths: discover → open → listen → inspect → capture → Learn → review → return; search → reader; recommendation → explanation; offline download → force-close → resume; share → receiver; AI explanation → correction/export/delete.

No visible button or link may be excluded from the click ledger.

## 17. Evidence and operator dogfood

### 17.1 Required evidence packet

For the exact deployed candidate SHA include:

- SHA/tree/branch/base and clean-checkout build receipt;
- SHA visible in page/deployment summary and exact URL binding;
- dependency/licence/provenance manifests;
- migration/replay/export hashes;
- unit/integration/e2e/accessibility/performance/offline results;
- click census and navigation graph coverage;
- console/page/network failure logs;
- search and recommendation metric reports;
- native-listener bake-off packet and human status;
- editorial approval ledger;
- screenshot index and screen recordings;
- current 100-point rubric with evidence links;
- independent reviewer reports and unresolved disagreements;
- `RUN_STATE.md`, `DONE_LADDER.md`, `TEST_PLAN.md`, and next command.

Every asserted capability has one row in `claim-ledger.jsonl` with:

- stable `claim_id` and plain-language claim;
- 40-character candidate SHA and tree;
- deployed URL, payload digest, content-manifest digest, and service-worker version;
- learner fixture and required browser/device lanes;
- required evidence types;
- paths or immutable workflow-artifact URLs;
- `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN`—missing evidence is always `NOT_RUN`;
- independent reviewer and review timestamp.

Evidence types are not interchangeable:

- source inspection proves implementation presence only;
- a screenshot proves only the visible state shown;
- a recording proves interaction shape, not canonical persistence;
- a state receipt proves mutation, not usability;
- a passing journey therefore needs rendered evidence, an interaction trace, before/after canonical-state receipts, and reload/replay verification;
- navigation, reading exposure, audio exposure, lookup, and display-setting changes also carry an explicit `no learner event expected` assertion.

Before browser evidence begins:

1. build from a clean remote-reachable candidate commit;
2. record `git status --porcelain`, branch, SHA, tree, and remote branches containing the head;
3. embed a public build receipt containing repository, source SHA, tree SHA, build time, workflow run, payload digest, content-manifest digest, provider-configuration digest without secrets, and service-worker version;
4. generate an artifact manifest with byte length and SHA-256 for every deployed file;
5. bind workflow artifact, deployment id, URL, source/tree, and payload digest in `deployment-receipt.json`;
6. fetch the build receipt with cache-busting both from a command-line client and from the browser used for the golden walk;
7. abort on a SHA, payload, manifest, service-worker, or URL mismatch; and
8. hash every PNG, recording, trace, audio sample, and JSON receipt into one final evidence manifest.

Freeze the source candidate for acceptance. Any source, content approval, audio asset, provider/model mapping, prompt, configuration, schema, or service-worker change creates a new candidate and invalidates affected evidence. CI artifacts and check summaries remain keyed to the immutable candidate SHA. If evidence indexes must be checked into Git, publish them on a separate `agent/reading-evidence-<short-sha>` branch whose manifest points to the candidate; that evidence branch is not the deployed candidate and may never be represented as such.

Use this remote-visible layout:

```text
docs/build-evidence/reading-closure/<full-candidate-sha>/
  coordinate.json
  deployment-receipt.json
  artifact-manifest.json
  claim-ledger.jsonl
  click-ledger.jsonl
  screenshots/
  recordings/
  traces/
  state/
  metrics/
  editorial/
  rights/
  dogfood/
  independent-reviews/
  evidence-manifest.json
  FINAL_STATUS.json
```

### 17.2 Screenshot itinerary

Capture at minimum:

1. three consecutive cold-open homes;
2. each lane, category, level, and series;
3. exact and semantic search plus empty/filter states;
4. card metadata and explanations;
5. reader default/immersive/display modes;
6. loading/error/offline/rights/draft/superseded states;
7. lookup/grammar/examples/recursive doors;
8. all three voices, sentence/article playback, speed, scrub, queue, background, download;
9. `覚える`, list, Keep, Learn, review, evidence, and source return;
10. questions/explanations and listening/production variation;
11. recommendation reason and controls;
12. sharing sender/receiver;
13. exact Back/resume/reload;
14. Dynamic Type, VoiceOver/TalkBack, keyboard, contrast, reduced motion;
15. 320×568, 390×844, large iPhone, tablet, and desktop;
16. all ten worlds on the reader and at least critical flows in each.

Every frame records product, exact SHA/version, timestamp, viewport/device, profile, network state, preceding action, and expected assertion. Old or marketing screenshots are comparison references, never proof of current Bunki behavior.

Each screenshot has a machine-readable sidecar containing its PNG hash, claim ID, candidate/payload identity, URL, browser/device/viewport/DPR, profile, world, network/motion state, route, preceding action, expected learner-state effect, console errors, and failed requests. Capture the complete application state, not a cropped success region.

### 17.3 Independent review

At least two decorrelated agents independently:

- build from the remote donor/integration commit;
- run the complete critical journey;
- inspect screenshots and audio evidence;
- reproduce rubric calculations;
- challenge source, rights, state, timing, and accessibility claims; and
- report disagreements before handoff.

One reviewer owns mobile Chromium, search/recommendation metrics, canonical-state diffs, and injected failures. The other owns WebKit, screenshot comparison, keyboard/accessibility, audio UI, Back/history, and offline behavior. Neither may have implemented the surface it approves. A third coordinator verifies evidence hashes and candidate identity.

The release-blocking browser/device matrix includes 320×568, 390×844, and 430×932 touch Chromium; matching primary/large WebKit; tablet WebKit; desktop Chromium/WebKit/Firefox; the operator's physical iPhone/Safari; a small-iPhone target; and Android Chrome smoke. The complete golden walk runs on primary Chromium, primary WebKit, and the physical iPhone. Every state has at least one WebKit result. Simulator WebKit never substitutes for the physical-iPhone gate.

Run ordinary network, Slow 4G with CPU throttling, warm and cold offline, provider timeout, missing audio, rights-blocked content, storage eviction, reduced motion, 200% text, high contrast, keyboard-only, and physical VoiceOver lanes. Use clean N5, N4, N3, N2, N1+, operator-edge, populated-migrated, and offline-saved learner fixtures.

### 17.4 Seven-day operator trial

The agent may prepare and deploy the candidate but may not impersonate operator acceptance.

The trial records, with consent and personal-only defaults:

- cold and practiced reading time separately;
- comprehension and assistance path;
- lookup/translation/furigana use;
- audio voice/speed/replay use;
- save → Learn → review follow-through;
- recommendation accept/dismiss and reason quality;
- resume/offline/Back success;
- defects, fatigue, delight, trust, and “would use tomorrow?”;
- objective mock and conversation-edge results without a false global mastery score.

Only the operator may declare the experience accepted after real use.

## 18. Terminal states

Continue until exactly one state is true.

For an identical transient failure, retry at most twice with bounded backoff. For a deterministic/environment failure, make at most three materially different, evidence-informed repairs, then obtain an independent minimal reproduction. Continue every other safe independent workstream until the named blocker is the only remaining reason the campaign cannot advance. Never loop blindly, lower a gate, delete a meaningful test, hide a broken record, or substitute a mock for production proof.

### `READING_CROWN_ACCEPTED_BY_OPERATOR`

The frozen remote authoritative candidate passed every machine, browser, WebKit, physical-device, editorial/rights, native-listener, independent-review, seven-day dogfood, and day-eight voluntary-return gate; the final evidence manifest matches the deployed SHA; and the operator explicitly signed the receipt. This authorizes the phrase “integrated reading prototype accepted for daily alpha.” It does not authorize an agent to merge main or claim general learning efficacy or native-production completion.

### `READING_AWAITING_TRUNK_HARVEST`

All bounded donor work for the current wave is remotely visible, clean, green, independently reviewed, and handed off with exact compare ranges, but the trunk keeper has not yet selectively harvested and reverified it on the authoritative Claude integration line. Provide each donor SHA/tree/base, capability and path inventory, omissions, migration/rollback receipts, checks, conflict notes, and the exact harvest order. A donor-only deployment cannot advance to `READING_CROWN_CANDIDATE_READY`.

### `READING_CROWN_CANDIDATE_READY`

All required donor work has been selectively harvested into the remote authoritative integration head and independently reverified there; the exact deployed candidate scores ≥85/100 with no hard cap, no criterion below 3, and critical dimensions ≥4; all automated, browser, accessibility, offline, rights, editorial, native-listener, and reproducibility gates pass; and the only remaining work is the operator's frozen-SHA seven-day physical-iPhone trial and acceptance.

This is not operator acceptance and does not authorize merge to main.

### `READING_BLOCKED_HUMAN_EDITORIAL`

All non-editorial implementation/evidence is complete, but the public breadth/cadence gate depends only on human Japanese approval. Provide every draft, source/provenance report, automated QA result, approval UI/sidecar, and exact count. Do not count drafts as approved.

### `READING_BLOCKED_NATIVE_VOICE_PANEL`

Audio implementation and blinded packet are complete, but final voice choice/correctness clearance depends only on the native-listener panel. Provide playable randomized samples, scoring instrument, analysis script, and interim provider-independent UI.

### `READING_BLOCKED_PHYSICAL_DEVICE`

All reproducible web/browser work is complete, but the only remaining gate is an action that genuinely requires the operator's physical iPhone or seven-day use. Provide one exact URL/SHA and a minimal test script.

### `READING_BLOCKED_PROVIDER_OR_RIGHTS_AUTHORITY`

All safe work is complete, but the remaining action requires spending authority, provider credentials, licensing, or a rights ruling. Name the exact provider/source, requested authority, cost/rights implication, and safe fallback. Never request secrets in chat or weaken the boundary.

### `READING_BLOCKED_REMOTE_VISIBILITY`

Authentication prevents the controller or a later atomic checkpoint from becoming remotely retrievable. Provide exact commit/tree, bundle hash/path, intended remote branch, byte-identical validation, `authorityHeadAtCut`, and one safe publish command. If the controller itself is unpublished, substantial implementation must not have begun. Never claim remote visibility.

### `READING_BLOCKED_AUTHORITY_CONFLICT`

Two current operator/branch/product authorities materially conflict and implementation would destroy or fork learner truth. Cite the exact conflict, preserve both states, recommend one default, and request only the minimum operator ruling.

### `READING_BLOCKED_SAFETY_OR_DATA_INTEGRITY`

Further work would risk learner-state loss, rights violation, secret exposure, destructive migration, or unbounded paid effects. Preserve a recoverable state, show the failing invariant, and do not bypass it.

No other terminal is allowed. Rate limit, missing browser binary, one red test, moving trunk, stale screenshot, unavailable sub-agent, or a partially complete wave is not a terminal.

## 19. Final handoff format

The terminal report must begin with the exact terminal name and then state:

1. operator-visible outcome;
2. exact repository branches, commits, trees, and compare ranges;
3. deployed URL and SHA binding;
4. current rubric by dimension and hard-cap status;
5. completed golden journeys;
6. tests/evidence with direct links;
7. content counts split into approved/private/draft/blocked, never one blended number;
8. audio voices/provider versions and native-panel status;
9. canonical event/SRS/migration status;
10. AI/provider/privacy/memory-graph truth;
11. remaining human actions;
12. exact next command;
13. explicit statement that main/Claude integration branches were not pushed or merged by the campaign executor.

Do not end with “implemented” or “CI green.” End with what the operator can now actually do, what remains unproven, and why the declared terminal is true.
