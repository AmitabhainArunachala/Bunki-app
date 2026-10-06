# Agent handoff: Bunki / 回廊 KAIRO research draft

Date: **2026-09-28**. Status: **research and proposed build specification; no application implementation**.

This directory publishes the completed research package into the shared repository so another agent can review it without the originating chat. The package files are preserved byte-for-byte; `SHA256SUMS` records their hashes. The offline ZIP contains the original package, without this repository handoff or checksum manifest.

## Start here

1. [BUNKI_BUILD_SPEC.md](BUNKI_BUILD_SPEC.md): the synthesized A–J specification, schemas, algorithms, surface queries, acceptance criteria and open decisions.
2. [README.md](README.md): navigation to all ten research tracks.
3. [AUDIT_AND_LIMITATIONS.md](AUDIT_AND_LIMITATIONS.md): what was checked and what remains UNVERIFIED.
4. [SOURCE_INDEX.md](SOURCE_INDEX.md), [COST_MODEL.json](COST_MODEL.json) and [VALIDATION_RECEIPT.json](VALIDATION_RECEIPT.json): dated source links, cost assumptions and verification scope.
5. [BUNKI_RESEARCH_DOSSIER.html](BUNKI_RESEARCH_DOSSIER.html): the specification and supporting notes in one offline-readable document. Download to render it locally; GitHub's file view is source text.

The eleven files under `notes/` comprise ten research tracks and one engineering-review appendix. The appendix is not an additional research track. `PROPOSED`, `ESTIMATE`, `CALCULATED` and `UNVERIFIED` have the meanings defined in the specification. Acceptance tests are future implementation requirements, not passing product tests.

## Authority and relationship to other work

This is a proposed design for review. It does not silently ratify open decisions or replace the repository's governing documents. The package README's statement that the specification governs alternatives applies **within this research package**.

Read the [current product constitution](../../../operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md) and the operator's latest instructions before implementation. Preserve frozen files under `docs/specs/` and follow the repository's current authority order.

Related independent research is in [draft PR #100](https://github.com/AmitabhainArunachala/Bunki-app/pull/100). Compare overlapping findings and reconcile differences before consolidating; this package does not overwrite that agent's branch or claim to have reviewed its completed synthesis.

Publication base: `main` at `056b8b2719a0ced8fbb439710174257df032fbbd`. This is a publication baseline, not a full application audit. The supplied inventory counts and missing-feature list remain user-supplied and UNVERIFIED against the code. Read current main and active handoffs before scoping implementation.

## Laws to preserve during implementation

- One device-owned append-only evidence ledger. The export file is the only authorized data egress under the current brief.
- One deterministic learner model derived from that ledger; no second persisted authority.
- AI proposes, the learner confirms, and FSRS-6 alone schedules. AI does not grade or write review state or due dates.
- Measured evidence outranks observed evidence, which outranks exposure. Observed evidence alone cannot establish a level claim.
- Evidence bands remain vectors by skill and modality; no readiness number or assigned global learner level.
- Personal goals, history, preferences and accommodations are record data, never owner-specific code or build inputs.
- Generated Japanese must pass the defined verification gates before teaching; dictionary identity alone does not prove grammar or register.

Live personalized cloud tutor calls, cloud ASR, automatic mining and sync conflict with the literal export-only law. The specification therefore has a local baseline and conditional cloud alternatives. A BYOK or consent toggle does not amend that law. Do not enable the conditional routes without an explicit future operator decision.

## Suggested next implementation handoff

Begin with milestone 1 in section I: **stateful local tool-using tutor plus placement and a planner**. First audit the actual ledger, reducer, FSRS version, current tutor/mining path and asset permissions. Map the proposed schemas onto existing domain boundaries before changing them.

Turn each milestone acceptance criterion into an implementation task with an owner and evidence location. Keep proposals and confirmed commands separate, test deterministic replay and confirmation idempotency, and include the teaching-verification gate in the first shippable milestone. Reconcile section J's open decisions with the operator before treating recommendations as product policy.

This draft publishes documentation and an agent entry point. No application code, learner record, credential, corpus asset, or frozen specification is changed. Product tests and rendered-browser QA have not been run by this publication step; see the validation receipt for the earlier document checks.
