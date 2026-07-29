# `/goal` — Finish Bunki as One Living Japanese-Learning System

**Date:** 2026-07-29  
**Status:** Executable long-running controller  
**Operator:** John Shrader  
**Repository:** `AmitabhainArunachala/Bunki-app`  
**Merge authority:** Human operator only

**Recorded operator authorization:** On 2026-07-29 the operator explicitly
clarified that the capabilities in the product lock are the bare minimum,
directed that they be wired into one holistic goal, and asked for a team of
agents to finish it in `/goal` mode. This authorizes a controller spanning the
older campaign boundaries. It does not authorize agents to merge, accept new
source rights, spend money, or declare operator acceptance.

## Mission

Build the indivisible Bunki product defined in:

`docs/operator/BUNKI_OPERATOR_PRODUCT_LOCK_2026-07-29.md`

Do not optimize one feature while losing the whole. The goal is one loop:

> encounter → capture → understand → confirm → weave → retrieve → reintroduce
> → update → recommend

Dictionary, kanji, grammar, SRS, AI conversation, article reading, source
listening, transcript ingestion, and personalized generated practice must use
one learner state and one durable thread model.

Continue autonomously through safe, reversible work. Do not stop after every
small task to ask what to do next. Stop only for a condition listed under
**Mandatory stops**, for an operator decision that materially changes the
product, or when only the operator’s seven-day acceptance remains.

## 1. Authority and read order

Before changing code, every agent must read:

1. `docs/operator/BUNKI_OPERATOR_PRODUCT_LOCK_2026-07-29.md`
2. the frozen specification manifest and the frozen specifications it routes to;
3. the Master Definition of Done and current build-evidence ladder;
4. this controller;
5. the files and tests in the agent’s assigned area.

Use this authority order:

1. The operator product lock controls product identity and minimum scope.
2. Frozen specifications control architecture, evidence, privacy, provenance,
   licensing, deterministic state, scheduling, and AI authority unless they
   conflict with the operator’s clarified product scope.
3. The product lock’s ten plain acceptance tests control whole-product
   acceptance. The older Master Definition of Done and ladder add
   non-conflicting proof requirements; they cannot remove or defer a locked
   capability.
4. This controller controls sequencing and team behavior.
5. Existing implementation is evidence, not authority.

Never edit a frozen file merely to make the implementation look compliant.
Verify the frozen SHA-256 manifest before and after every integration wave.
Also verify the separate operator-lock integrity record for this product lock,
this controller, and the admission receipt. Governing files may change only in
an explicit operator-reviewed documentation PR that updates that record.

## 2. Non-negotiable outcome

Bunki is not a collection of neighboring apps. It is one system in which:

- a lookup can become a learning thread;
- a kanji remains attached to real words and source sentences;
- an article passage can become a source-anchored learning experience;
- a YouTube or podcast source can be saved while walking and processed later;
- an AI conversation can nominate useful turns for learning;
- the learner explicitly decides what enters scheduled review;
- AI can weave confirmed material into full sentences, multi-sentence cards,
  dense passages, dialogues, listening, clozes, production, and kanji fusion;
- the same language returns in genuinely different contexts;
- retrieval evidence updates only the relevant modality-specific memory;
- authentic, generated, inferred, and user-supplied material remain
  distinguishable;
- the learner can start at zero, N1, or anywhere between.

Implementation phases may be small. The product definition may not be reduced.

## 3. Current repository admission facts

Treat these as a snapshot to verify, not as permanent truth.

At 2026-07-29:

- `main` was at
  `cbb7f29eee1c056ba0898f6172eaeb67ae34dc37`, the merge commit for PR #13.
- No pull request or issue was open at the time of the admission check.
- Major post-merge branches were all ahead of that `main`.
- `agent/bunki-e-weave@f8e5f16b8cab32d36c42b8bea7fc37a1e9506bb1`
  was the best observed aggregation candidate and an ancestor of both
  `agent/bunki-pillars-dict-srs` and `agent/bunki-lived-in`.
- `agent/bunki-pillars-dict-srs` and `agent/bunki-lived-in` had diverged.
- `agent/bunki-e-integration` also contained at least one unique commit outside
  the `e-weave` line.
- The large branches included valuable work and known defects. Recency or
  commit count did not make any one of them a safe implementation base.
- The build-evidence ladder on `main` contained stale pre-merge status text.

`agent/bunki-e-weave` remains an input candidate, not a canonical code base. No
agent may declare “latest branch wins,” merge whole branches by reflex, or begin
feature work on an unverified branch.

## 4. Team operating model

Run a small coordinated team, not a branch swarm.

### Roles

- **Conductor:** owns the goal, plan, gates, task boundaries, and final report.
- **Reconciler:** maps branch ancestry, unique commits, conflicts, defects, and
  licensing/data risks.
- **Integrator:** the only agent allowed to write to the active draft-PR head
  branch during a wave.
- **Domain and memory agent:** protects event semantics, learner threads,
  retrieval evidence, and FSRS behavior.
- **Dictionary and kanji agent:** owns data completeness, parser correctness,
  attribution, recursive reference, and kanji fusion.
- **Reader and source agent:** owns article reading, source inbox, transcript
  providers, timecodes, rights state, and capture.
- **Teacher and weave agent:** owns recursive AI conversation, candidate
  generation, confirmation, contextual variation, and safe boundaries.
- **Experience agent:** protects the calm learner-facing shell, navigation,
  Japanese typography, accessibility, and internal-language removal.
- **Native proof agent:** owns real iPhone behavior, offline/background/force
  quit recovery, performance, and device evidence.
- **Adversarial verifier:** uses a separate agent identity and fresh context,
  tries to falsify claims, and never approves its own implementation.

With limited concurrency, combine compatible read-only roles. Never combine
Integrator and Adversarial Verifier for the same slice.

### Verifier identities

- **V-CODEX:** a fresh-context, read-only `gpt-5.6-sol` agent inspecting the
  exact candidate SHA before reading the builder’s report.
- **V-FABLE:** an actual, separately dispatched Fable 5 instance inspecting the
  exact candidate SHA and running experience proof.

Wave 0 must confirm both dispatch paths. Fable 5 is not callable in every
environment. If it is unavailable, stop for an operator-named substitute; no
agent may self-label another model “Fable-class” or silently waive the review.
The same rule applies if `gpt-5.6-sol` is unavailable.

### One writer

Only the Integrator writes within a wave. All writes go to the one active draft
PR head branch and remain unintegrated until the human operator merges that PR.
No agent writes directly to `main` or to a human-accepted integration base. All
other agents inspect, test, or prepare bounded recommendations. This prevents
silent overwrites and contradictory implementations.

### Agent task contract

Each delegated task must state:

- exact base branch and base SHA;
- exact allowed paths;
- read-only or write permission;
- the product-lock clauses and acceptance test it advances;
- required tests and evidence;
- explicit non-goals;
- expected handoff format.

Each agent returns a receipt containing:

- base SHA observed;
- files inspected or changed;
- decisions and assumptions;
- test commands and exact outcomes;
- unresolved risks;
- candidate commit SHA, if any;
- a plain-language statement of what is now useful to the learner.

“Done,” “looks good,” screenshots alone, or passing unrelated tests are not
receipts.

## 5. Branch and pull-request discipline

1. Protect `main`.
2. Publish this controller and the product lock in a small draft documentation
   PR based on the exact current `main`.
3. Complete Wave 0 before proposing an implementation reconciliation base.
4. The Wave 0 receipt proposes an exact implementation base and branch
   disposition; the operator ratifies it.
5. Create the active draft-PR head from the exact current `main` target and
   reconcile the operator-ratified candidate inputs into it. Expose the full
   main-to-head diff; do not use an unmerged candidate as a hidden parent.
6. Integrate one small reviewed PRlet at a time through human merge, then refresh
   from the newly merged `main` before the next PRlet.
7. Keep every pull request draft until its evidence, review threads, and checks
   are complete.
8. Do not self-approve or merge. Only the human operator merges.
9. Do not force-push a shared branch.
10. Do not delete historical branches until the operator has ratified the
    reconciliation receipt and a recoverable archive exists.

If a branch head changes during inspection, discard stale conclusions and
recompute from the new exact SHA.

## 6. Wave 0 — Reconcile before building

This wave is mandatory and initially read-only.

### Tasks

1. Refresh repository metadata, default branch, open PRs/issues, checks, reviews,
   branch heads, and merge bases.
2. Verify the frozen-document integrity manifest.
3. Build a commit-level matrix for at least:
   - `agent/bunki-e-integration`
   - `agent/bunki-e-weave`
   - `agent/bunki-pillars-dict-srs`
   - `agent/bunki-lived-in`
   - `agent/bunki-real-dictionary@0b3400a10ee1bc851bba6a1fccd4ff8478f042eb`
   - `agent/bunki-real-dictionary-v3`
   - any newer branch touching the same surfaces.
4. Label each unique commit or coherent patch:
   - **KEEP** — correct, licensed, tested, and advances the lock;
   - **REWORK** — useful intent with a defect, false claim, or integration risk;
   - **DROP** — obsolete, duplicated, unsafe, or contrary to the lock.
5. Reproduce or disprove known findings, including:
   - clock-skew review failure around midnight;
   - recovered-save messaging that still reports rejection;
   - test-server path traversal;
   - blank prehydration title;
   - abandoned AI request attaching a fallback candidate;
   - dictionary parser loss of attributed glosses;
   - incorrect or missing EDRDG disclosure/license version;
   - replay performance that may grow quadratically;
   - tombstoned-thread projection behavior;
   - demo learner history being mistaken for real history;
   - missing native iPhone proof.
6. Measure the actual useful delta of each branch. Do not accept test count,
   line count, or visual polish as product proof.
7. Produce:
   - a branch ancestry diagram;
   - a unique-commit and conflict matrix;
   - a defect and license/data-risk register;
   - an exact proposed implementation reconciliation base and input SHAs;
   - an ordered cherry-pick/reimplementation plan;
   - explicit reasons for every excluded branch head.
8. Verify implementation readiness before scheduling dependent work:
   - physical supported-iPhone access plus signing/distribution path;
   - exact dictionary, kanji, grammar, and Kanken data licenses and acquisition
     routes;
   - AI provider, privacy boundary, budget, and secret-storage approval;
   - at least one lawful transcript route;
   - working V-CODEX and V-FABLE dispatch identities.
9. Put unresolved readiness items in an operator-decision register with the
   exact smallest decision and the first PRlet they block.

### Wave 0 gate

No code wave starts until:

- the exact proposed implementation reconciliation base and every candidate
  input SHA are named;
- all frozen hashes match;
- no branch is assumed to be a superset without commit-level proof;
- parser/license and learner-state risks are visible;
- one Integrator and one independent Verifier accept the plan;
- the plan is placed in a reviewable draft PR;
- the operator ratifies the exact implementation base and branch dispositions;
- every external readiness dependency is either proved or placed behind a
  scheduled operator checkpoint before its dependent PRlet.

The current audit may seed this receipt, but every SHA and conclusion is
reverified immediately before ratification.

## 7. Delivery strategy: vertical learning slices

Do not build isolated pillars and hope they connect later. Land thin but real
end-to-end slices in the order below. A slice may share foundation work with the
next slice, but it must prove one learner loop.

A slice is an outcome track, not permission for one giant PR. Break it into the
smallest sequential PRlets with one learner-visible outcome, one active writer
lease, and one draft PR. Each PRlet starts from newly human-merged `main`.
Transfer the Integrator lease only after merge or explicit abandonment.

### Slice 1 — Repair the trusted foundation

Fix confirmed correctness, security, recovery, replay, performance, and stale
status defects before expanding them. Preserve:

- deterministic replay and export;
- the pure TypeScript domain/event core;
- native SQLite and local-first behavior;
- versioned retrieval contracts;
- pinned FSRS behavior;
- separation of passive exposure from retrieval evidence;
- explicit promotion into review;
- AI’s inability to mutate canonical facts or memory directly.

Update current, non-frozen status evidence so it describes the exact branch and
SHA being tested.

**Gate:** baseline lint, format check, typecheck, unit, replay, export, security,
and end-to-end suites pass; confirmed P0/P1 defects in this scope are closed or
explicitly block progress.

### Slice 2 — First holistic learning spine

Before deepening any pillar, use one real phrase to connect a minimal honest
version of every major surface:

Home/Guide capture → source inbox/manual transcript → dictionary sense →
kanji/components → grammar → contextual teacher → learner thread →
Keep/Learn/Ignore → generated full-sentence candidate → explicit promotion →
finite retrieval → exact source return → export.

There must be one identity and provenance chain, not copied demo objects.
Seed/reference fixtures and deterministic teacher fallback are acceptable only
when visibly labeled as the thin spine; later slices replace or deepen them
without creating a second state path.

**Gate:** the one-thread identity, no-automatic-debt rule, recursive return
anchor, retrieval contract, restart durability, and export are proved across
the surfaces that exist at this slice. This is a foundation subset, not a claim
that full Product Lock Tests 1–3 have passed. Re-run those tests as each
dependent surface lands.

### Slice 3 — Production dictionary and deep kanji

Integrate production-scale licensed dictionary and kanji data through
deterministic, reproducible import pipelines.

Required work includes:

- parser tests for attributed and restricted senses/glosses;
- exact source/version/license receipts;
- deterministic IDs and migrations;
- local indexes for Japanese, reading, inflection, English, and pasted text;
- recursive word/sense/kanji/component/compound/grammar/source navigation;
- concise learner-facing attribution;
- kanji fusion through the learner’s real vocabulary and sentences;
- a rights-clear, first-class grammar inventory from beginner through advanced,
  with canonical constraints kept separate from labeled AI explanation;
- performance proof on an ordinary supported iPhone.

Do not ship a parser that silently discards valid entries. Do not hide an
attribution failure behind a disclosure screen.

**Gate:** coverage counts reconcile to the licensed upstream data, parser
fixtures cover known failures, search and recursive navigation meet measured
device budgets, and independent license/data review passes.

Add a transparent Anki warm-start path in this or a bounded follow-up slice:
import notes, cards, scheduling history, tags, and media references; preserve
the original import receipt; map into Bunki threads without inventing evidence;
and let the learner inspect or correct mappings. Old imports must replay after
later schema changes.

### Slice 4 — Article reader to living study

Build the Todai-like reader as a real vertical loop:

article/RSS intake → clean Japanese reading → optional furigana → tap lookup →
contextual teacher help → capture → learner confirmation → source-anchored
practice → return to exact source position.

Keep article text, source metadata, rights, audio sync, and generated variants
distinct. Preserve reading position offline and across force quit.

**Gate:** the article-to-confirmation-to-versioned-retrieval loop passes on
native iPhone and all material returns to the correct article and position.
Re-run the one-state and no-debt regression gates. Full Product Lock Test 5 is
claimed only after the personalized weave forms land.

### Slice 5 — Conversation and lookup to living study

Build the recursive teacher using bounded, versioned tools over the same learner
state.

The teacher may:

- retrieve relevant learner threads and source context;
- explain and contrast;
- ask adaptive questions;
- propose two- or three-way journeys;
- nominate conversation turns and recent lookups;
- draft generated learning material.

The teacher may not:

- directly edit FSRS or canonical dictionary facts;
- schedule review without explicit learner confirmation;
- invent a source or hide uncertainty;
- mark passive exposure as successful retrieval;
- attach late output from an abandoned request.

Generated candidates must be schema-validated, provenance-linked,
interruptible, recoverable, and visibly labeled.

Text conversation lands first, but the full product also requires spoken/voice
conversation using the same thread and learner state. A bounded journey records
its fork, permits at most two or three useful branches, and rejoins on an
evidence-defined condition rather than a hidden step counter.

**Gate:** conversation and recent lookups nominate confirmed versioned
retrieval without automatic debt; abandoned requests cannot attach output;
bounded journeys rejoin; and deterministic fallback behavior is tested. Re-run
the one-state gate. Full Product Lock Test 6 is claimed only after the
personalized weave forms land.

### Slice 6 — Immersion inbox and transcript providers

Build a source provider interface before adding provider-specific code.

The normalized source/transcript contract must include:

- stable source and provider IDs;
- canonical URL or local reference;
- publisher/channel/feed identity;
- language;
- transcript segments with normalized start/end timecodes;
- provenance and acquisition method;
- rights/policy status;
- confidence and completeness;
- fetched/processed timestamps and provider version;
- pointer-only and unavailable states;
- retry/rate-limit/error state;
- an immutable link to learner captures derived from each segment.

Support, in safe order:

1. manual paste and user-supplied transcript;
2. publisher/Podcasting 2.0 RSS transcript;
3. official or owner-authorized caption route;
4. licensed/open provider;
5. only then, technical evaluation of an experimental unofficial YouTube
   transcript adapter with synthetic or specifically authorized data.

Evaluate existing projects as adapters rather than product foundations. Initial
candidates include:

- `jkawamoto/mcp-youtube-transcript`
- `kimtaeyoon83/mcp-server-youtube-transcript`
- `jdepoix/youtube-transcript-api`
- `Red5d/podcast_mcp`

For any reused repository or MCP:

- record license, exact pinned revision, maintenance status, dependencies, and
  failure behavior;
- review network destinations, secrets, rate limits, payload caps, and
  subprocess/file access;
- run it behind the normalized provider boundary;
- provide a kill switch and pointer-only fallback;
- never claim permission merely because a transcript is technically available.

No unofficial adapter may process live learner sources or participate in
acceptance without a specific operator approval after the rights and terms
review. An agent cannot approve that route by declaring the issue resolved.

The same inbox also accepts screenshots/photos through on-device or
rights-cleared OCR, user-supplied book/PDF excerpts, local audio, and manual
text. It records the original file/reference, selected span, extraction method,
confidence, rights state, and exact return anchor. Private source bytes remain
local by default.

The iPhone flow must permit one-tap source saving while walking. Expensive
processing, shortlist review, and card generation happen later.

Use an official player, lawful embed, user-owned local playback, or official
external deep link. Do not download protected media. Preserve a five-source
queue, the latest confirmed progress/resume anchor for each source, interruption
state, and exact transcript/time return even when playback itself stays in the
official external app.

**Gate:** five sources can be saved quickly, permitted transcript content is
normalized, pointer-only behavior is honest, shortlist decisions create no
automatic debt, and restart preserves source/time anchors. Re-run the one-state
gate. Full Product Lock Test 4 is claimed only after the personalized weave and
kanji-fusion forms land.

### Slice 7 — Personalized media weave

Create a deterministic, inspectable pipeline:

1. retrieve recent sources, confirmed threads, interests, goals, and
   modality-specific evidence;
2. identify known, fragile, and candidate-unknown vocabulary, senses, kanji,
   grammar, register, and listening features;
3. propose a small shortlist;
4. collect Keep/Learn/Master/Ignore decisions;
5. choose an experience form suited to the learning need;
6. generate or select source-anchored material;
7. validate language, provenance, difficulty, duplication, and target coverage;
8. let the learner edit or reject it;
9. schedule only explicitly promoted retrieval;
10. track later retrieval separately from passive re-exposure.

Required output forms include:

- full-sentence and multi-sentence cards;
- dense multi-paragraph reading;
- dialogue and conversational reintroduction;
- listening and audio recall where available;
- cloze, scrambling, contrast, and production;
- kanji/component fusion grounded in prior known sentences and current sources.

Themes may draw from the learner’s interests—including psychology, philosophy,
religion, and nature—without overwriting authentic source context.

Reintroduce an important target in at least three genuinely different contexts
or styles when useful. Track why each item returned and whether it was authentic
or generated.

**Gate:** Product Lock Tests 4–6, 8, and 9 now pass end to end; reviewers can
trace every woven target to learner confirmation, source/teacher context, and
memory effects. Re-run Tests 1–3 and the no-parallel-learner-state check.

### Slice 8 — Frontier recommendations and zero-to-N1+

Recommend primary sources and next actions using a multidimensional frontier:

- vocabulary by sense and register;
- kanji recognition, reading, writing, and component knowledge;
- grammar recognition and production;
- reading and listening density/speed;
- topic familiarity;
- retrieval stability by modality;
- learner goals, interests, and tolerance for support.

Support a zero-state beginner path and a direct advanced entry path. Do not use
one JLPT label as the model. Let the learner correct bad estimates.

Track source starts, progress, completion, captures, questions, processing
limits, and later cross-pollination without turning immersion into bookkeeping.

**Gate:** Product Lock Test 7 passes for clean beginner, intermediate, and N1+
profiles completing the same real loop. Seeded histories may supplement but
cannot replace clean-state onboarding and adaptation proof.

### Slice 9 — Whole-product native proof

Remove learner-facing implementation language and finish the calm shell:

- Home/Guide plus universal capture;
- recursive Dictionary/Kanji/Grammar;
- finite Practice;
- Reader/Listener and immersion inbox;
- Map/Garden as a secondary reflective surface;
- evidence and diagnostics under Settings/Why.

Test on real supported iPhone hardware:

- one-handed capture and review;
- Japanese typography, Dynamic Type, VoiceOver, contrast, reduced motion;
- share sheet, deep links, audio controls, backgrounding, interruptions;
- offline start, reconnect, force quit, migration, and low-storage behavior;
- production-size dictionary/search;
- long replay history without quadratic degradation;
- seven days of ordinary data growth.

Exercise spoken/voice conversation, screenshot/photo/OCR and book/PDF intake,
Anki warm-start migration, synced article audio where available, and
Kanken-depth exploration on the same learner state. Placeholder routes do not
pass.

Web screenshots and device-sized Chromium are useful diagnostics but do not
count as native proof.

**Gate:** native evidence is tied to app build, commit SHA, device/OS, data
fixture, steps, and result. No P0/P1 failure remains.

### Recurring invariant gate

At every slice from Slice 2 onward, re-run:

- Product Lock Test 1 over every surface currently present;
- Product Lock Test 2 with twenty new captures and exactly three promotions;
- a check that no new parallel learner store, copied thread identity, or second
  scheduler was introduced;
- replay/export of the same thread before and after the slice;
- authentic/generated/user-supplied lineage;
- exact source/return anchors;
- the frozen and operator-lock integrity manifests.

A local feature gate cannot override a failure here.

## 8. Verification ladder

Run the repository’s exact current commands, resolving them from
`package.json`, lockfiles, and CI rather than copying stale prose. At minimum the
equivalent of these suites must pass where applicable:

- formatting check;
- lint;
- TypeScript typecheck;
- unit and domain tests;
- deterministic replay;
- export verification;
- migrations and recovery;
- security and path-boundary tests;
- parser/data reconciliation;
- AI interruption and provenance tests;
- end-to-end learner loops;
- native iPhone evidence;
- accessibility;
- performance with production-scale fixtures.

For each pull request:

1. record exact base and head SHAs;
2. inspect the complete diff;
3. run focused tests, then the full relevant gate;
4. resolve review threads or document a real blocker;
5. compare claims to executable behavior;
6. have V-CODEX try to falsify it from a fresh context;
7. have V-FABLE check whole-product experience and drift from a separate
   context;
8. leave the PR draft for the human operator to merge.

No agent may waive a failing test by rewriting the claim.

## 9. Evidence and status rules

- Every screenshot, video, log, export, benchmark, or test report names the
  commit SHA and environment.
- Screenshot evidence includes the full relevant state, not only a cropped
  success view.
- Operator-provided screenshots and photos are requirement evidence. Inventory
  them by date and visible behavior; do not infer invisible interactions.
- Demo fixtures and simulated histories are visibly labeled.
- Build-evidence documents distinguish implemented, wired, simulated,
  expected-fail, blocked, and operator-accepted.
- A passing seam is not a passing product surface.
- A feature branch remains candidate input even when Wave 0 names its exact SHA;
  only the human-merged `main` tip is canonical.

## 10. Mandatory stops

Stop and ask the operator before:

- merging any PR;
- rewriting or invalidating a frozen specification;
- changing the locked product definition;
- accepting a new license or source-rights interpretation with product impact;
- sending private learner data to a new external provider;
- introducing a recurring external cost or paid service;
- deleting branches, user data, or recoverable evidence;
- weakening encryption, privacy, provenance, export, or AI-authority rules;
- adopting an unofficial transcript method whose legal/policy status is
  unresolved;
- choosing between two irreconcilable product behaviors not settled by the
  product lock.

Also stop on suspected data corruption, credential exposure, supply-chain
compromise, or an exact-base mismatch. Preserve evidence and report plainly.

Do not stop merely because:

- one safe implementation option is slightly less elegant;
- a test reveals ordinary work still to do;
- a planned agent finishes and another bounded task is available;
- the current phase is complete while the locked product is not.

## 11. Final completion

Agents may report **implementation complete pending operator acceptance** only
when:

- every inseparable capability in the product lock is live in one product;
- all ten plain acceptance tests have reproducible evidence;
- frozen hashes match;
- the full verification ladder passes;
- no unresolved P0/P1 defect, security finding, license ambiguity, or false
  product claim remains;
- an independent whole-product review finds no drift;
- every implementation PR is human-merged;
- a fresh clean `main` at one exact SHA passes the full ladder;
- the signed seven-day build is created from that exact clean `main` SHA.

Only the operator can declare **Bunki complete**, after the seven-day
deep-engagement test and voluntary use on day eight.

Any behavior, schema, provider, model, source-data, or shipped configuration
change during the seven-day trial invalidates the trial evidence and restarts
the seven-day clock from the new human-merged `main` SHA.

Until then, keep the status precise:

- `foundation`
- `vertical slice`
- `daily alpha candidate`
- `implementation complete pending operator acceptance`
- `operator accepted`

Never use “done” to mean merely “this wave ended.”
