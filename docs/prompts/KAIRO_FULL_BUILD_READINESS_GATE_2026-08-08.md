# KAIRO / Bunki — Full Build Readiness Gate

**Date:** 2026-08-08  
**Status:** ACTIVE execution guardrail for the next full build  
**Companion authority:** `KAIRO_EXCELLENCE_SPEC_2026-08-08.md`

This file does not add product scope. It prevents a large build from losing the
scope, evidence contracts, and hard-won interaction behavior already defined by
the Product Lock, frozen v2, Master Definition of Done, design canon, and KAIRO
Excellence Spec.

A “full build” may begin only by satisfying the launch rules below. The goal is
not bureaucracy; it is to stop three failure modes that have already appeared in
the repository: stacked work landing on the wrong base, independently correct
surfaces carrying incompatible state, and prototype seams becoming permanent
architecture because the build moved faster than the contracts.

---

## 1. One build, one authority map

Before implementation starts, the lead agent records these authorities in its
state/handoff and does not improvise a new hierarchy:

1. explicit operator rulings + Product Lock;
2. frozen v2 + Master Definition of Done;
3. design/evidence/licensing canon and accepted ADRs;
4. KAIRO Excellence Spec;
5. this readiness gate;
6. build brief / phase controller / local implementation plans.

“KAIRO thin Walk closed” is a checkpoint. It is never shorthand for “Bunki is
done.”

---

## 2. Freeze the shared contracts before parallelizing

Parallel agents may build surfaces only after the contracts below have one
named implementation owner and one authoritative package/module boundary.

### 2.1 Learning thread contract

One durable thread identity follows an encounter across source, dictionary,
kanji/grammar, AI conversation, promotion, retrieval, reintroduction, evidence,
and export. No surface invents a second learner-state representation because it
is convenient locally.

### 2.2 Retrieval/evidence contract

A scheduled item is a versioned retrieval contract, not “a card.” The contract
names target, cue/response modality, accepted-answer/rubric version, hint policy,
source/thread lineage, and grading method. Only valid graded retrieval writes
FSRS state. Exposure, self-report, lookup, AI inference, and imported Anki
history remain typed evidence with narrower authority.

### 2.3 Event/persistence contract

Learner-affecting actions emit durable events through one persistence boundary.
The renderer, Drift physics, page DOM, or AI transcript is never the canonical
state store. Force-quit recovery and lossless export/replay depend on this from
the beginning.

### 2.4 Navigation contract

Every deep route can carry enough thread/source/position context to return
without recreation or context loss. Shared-element motion may improve the seam,
but navigation correctness must not depend on animation.

### 2.5 Accessibility action contract

Every semantic action has an abstract action/state representation independent of
pointer gesture and renderer. Tap/hold/flick may be the poetic surface; keyboard,
switch, screen reader, and reduced-motion paths invoke the same action contract.
This contract must survive the future renderer swap.

**Gate:** if two workstreams need incompatible versions of any contract above,
stop parallel implementation at that seam and resolve the contract first.

---

## 3. Repository and PR topology — no more invisible stacked drift

A full build must not rely on human memory to know which stacked branch contains
which capability.

- The build controller names one integration branch/base for the campaign.
- Every workstream declares its base SHA and intended merge dependency.
- A machine-readable or generated stack manifest records `PR/branch → base →
head → dependencies → capability owner → verification status`.
- CI fails or reports loudly when a supposedly landed dependency is reachable
  only through a side branch and absent from the integration base.
- Before closing/deleting a stacked base branch, verify all child commits are
  reachable from the intended integration branch.
- “Green PR” never means “present in the product.” Product presence is checked
  from the integration head.
- Avoid long-lived mega-branches with silent cherry-pick divergence. If a branch
  must be rebased/force-updated, report old SHA → new SHA and re-run the affected
  integration checks.

**Merge criterion:** integration proof is performed on the exact post-merge tree
(or a merge-result SHA equivalent), not merely on each PR in isolation.

---

## 4. Workstream ownership — parallelize by contracts, not by screens

Recommended lanes once A1 freezes the shared learning contracts:

- **Domain/state lane:** threads, retrieval contracts, evidence types, FSRS,
  event log, persistence, export/replay.
- **KAIRO experience lane:** Drift, reader, dictionary, kanji/grammar, practice,
  monthly truth, transitions.
- **Source/listening lane:** inbox, lawful adapters, source progress/timecodes,
  audio/listening contracts.
- **AI lane:** teacher, journeys, belief ledger, recommendations/weaving; depends
  on domain contracts and may not invent its own memory state.
- **Native lane:** iPhone share/capture, offline persistence, background/force-
  quit recovery, haptics, native performance.
- **Corpus/data lane:** semantic relations, original readers, grammar/examples,
  provenance/licensing pipelines.
- **Engine lane:** interaction-core extraction, MSDF/fluid/compute graph,
  capability/fallback path; explicitly downstream of substrate-neutral actions.
- **Verification lane:** independent behavioral/a11y/performance/persistence
  instruments and adversarial discovery.

No lane owns “the whole app.” Integration owns the whole app.

---

## 5. The golden thread is the integration spine

Select one real, rights-clean source encounter as the permanent golden thread.
After each capability lands, extend the same thread rather than creating a new
demo fixture.

Required eventual trace:

source/inbox → reader/listener position → lookup → word sense → kanji/component
and grammar → Keep/Learn/Master choice → versioned retrieval contract → due
session → response/grade → typed evidence → FSRS state → reintroduction in a
new context → AI teacher reference → recommendation impact → evidence inspector
→ export → replay → route back to the exact source location.

The golden thread must prove **identity continuity**: no recreation of the item
at each surface, no manually copied IDs, no fixture-only shortcuts unavailable
to real learner data.

---

## 6. Prototype seams that are explicitly temporary

The full build must carry a deletion/migration plan for prototype seams instead
of allowing them to fossilize.

### 6.1 Drift extraction patches

The exact-string patch seam that fuses the hardened Drift artifact is acceptable
for the current prototype but not the final architecture. Before/with the engine
migration, extract the interaction/state grammar behind stable module APIs.
There must be one canonical data/state path, not a growing patch list over a
second application.

### 6.2 Duplicate lexical/state data

Do not maintain independent “Drift learner state,” “corridor learner state,” and
“native learner state.” Generated display indexes may be duplicated for
performance, but canonical entities, thread IDs, learner evidence, and
scheduling state have one source of truth and deterministic derived indexes.

### 6.3 Standalone artifact constraints

The shareable single-file artifact is evidence/demo packaging, not the product
architecture. Do not force production code to embed every dictionary, stroke,
article, or graph asset because the artifact does.

### 6.4 Renderer authority

Physics/graph/render objects are views over canonical data. A disappeared GPU
node is not a deleted word; a collision decision is not learner evidence; visual
brightness is not mastery unless explicitly rendering one named capability lens.

---

## 7. Build order and parallelism

The Excellence roadmap remains authoritative. For execution:

1. **A0/A0.5 first:** close known verifier gaps, accessibility baseline, and
   measurement profiles.
2. **A1 immediately after:** build the real source-anchored retrieval loop and
   freeze the thread/retrieval/evidence boundaries through actual use.
3. Once A1 contracts hold, **A2/A3/A4 + selected Phase E lanes may run in
   parallel** where they share the same contracts and do not depend on the final
   renderer.
4. Corpus depth proceeds in parallel with product surfaces once provenance and
   schema contracts are stable.
5. Engine work starts with substrate-neutral interaction extraction; full
   fluid/compute graph follows sufficient semantic depth and real-device
   performance budgets.
6. Native durability begins before the web experience is “finished.” Offline,
   persistence, force-quit recovery, and share capture are architectural, not a
   port at the end.

Do not interpret phase lettering as a command to serialize independent work for
months. The dependency graph, not alphabetic order, controls safe parallelism.

---

## 8. Definition of “landed” for any capability

A capability is landed only when all applicable dimensions are true:

- implemented on the integration head;
- uses the shared contracts rather than a local shadow state;
- deterministic/unit tests pass;
- real interaction verification passes at target device scale;
- keyboard/focus/screen-reader/reduced-motion coverage exists for user-facing
  behavior;
- persistence/force-quit path is tested for learner-affecting state;
- provenance/licensing boundaries are proven for content features;
- performance is measured under a declared protocol where relevant;
- the golden thread is extended when the capability belongs in it;
- screenshots/artifact show the actual integration head;
- coverage ledger is updated `absent → planned → thin → real` with evidence.

A feature branch with screenshots is not landed. A green isolated PR is not
landed. A stub UI wired to synthetic state is not landed.

---

## 9. Full-build stop conditions

The build controller pauses a seam—not the entire project—when any of these are
true:

- two surfaces create incompatible learner/thread IDs or evidence semantics;
- AI output is about to become canonical learner state without a typed evidence
  boundary;
- capture starts creating review debt implicitly;
- a native/web/Drift implementation needs separate scheduling truth;
- a source adapter cannot prove its rights/process status;
- a renderer change would require deleting behavioral verification rather than
  retargeting it;
- a merge would make a dependency disappear from the integration tree;
- a performance optimization changes learner-visible truth or drops
  accessibility semantics;
- a “complete” milestone has mandatory Product-Lock rows still absent without an
  explicit operator supersession.

Resolve the contract and continue other independent lanes.

---

## 10. Required build report

Every major milestone report includes, compactly:

1. integration head SHA and exact artifact/build identity;
2. capabilities changed and owning pillar/metabolism stage;
3. golden-thread extension status;
4. coverage ledger: Encounter · Capture · Understand · Confirm · Retrieve ·
   Reintroduce · Update · Recommend · Protect (`real/thin/planned/absent`);
5. Product-Lock surface status: AI · source inbox · listening/voice ·
   recommendations/weaving · Anki · evidence/export · native durability ·
   Observatory;
6. behavioral, accessibility, persistence, licensing, and performance evidence;
7. unresolved defects/risks stated as present truth, not planned closure;
8. PR/branch stack manifest and exact next integration dependency.

This is the minimum memory required for a long-running or multi-agent build to
remain one product.

---

## 11. Launch verdict

A full build is authorized when the controller starts from this gate plus the
KAIRO Excellence Spec and treats A0/A0.5/A1 as the contract-setting front edge.
The build should be ambitious and highly parallel **after** those shared
contracts are made real, not before.

The objective is one system that can become visually extraordinary without ever
needing to reconstruct its learning truth, learner history, accessibility, or
product identity afterward.
