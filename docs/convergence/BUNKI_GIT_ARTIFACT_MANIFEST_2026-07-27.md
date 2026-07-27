---
title: "Bunki — Git Publication and Integrity Manifest"
date: 2026-07-27
project: bunki
artifact_type: publication_manifest
status: awaiting_repository_target_and_one_frozen_input
---

# Bunki Git artifact manifest

This manifest defines the immutable convergence inputs and the fresh-context
handoff intended for the next Git publication. A publication is complete only
when every required frozen input is present byte-for-byte, its SHA-256 verifies,
and the resulting branch/commit is reported.

## Required convergence inputs

| Intended repository path | SHA-256 | Local status | Notes |
|---|---|---|---|
| `docs/convergence/JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md` | `94842a1c8bc423a84cbe6131a8c540c88b676d5f8e2143a107b02ec5b28da95b` | present and verified | Codex frozen v1 |
| `docs/convergence/BUNKI_WORKING_SPEC_2026-07-27.md` | `77e52f3a93fd9ebb3cdd8c456250cb66779d87bc1582e53e0bd7e39da82feb68` | missing from this workspace | Claude frozen v1; declared frozen at Git revision `8404395`; recover exact bytes, never reconstruct |
| `docs/convergence/BUNKI_CONVERGENCE_ROUND1_2026-07-27.md` | `a6066f6972f58dff213bbdddcec5447bd7d01ea22745c26a15d7d455e6dd756d` | present and verified | Claude's Round-1 ADOPT / ARGUE / EVALUATE diff |
| `docs/convergence/BUNKI_CONVERGENCE_ROUND1_CODEX_RESPONSE_2026-07-27.md` | `9542fbaa89456b2bb226a415f37a3360104539e290242545c542a2aee6f07a54` | present and verified | Codex's item-by-item resolution |

## Handoff artifact

| Intended repository path | SHA-256 | Status |
|---|---|---|
| `docs/handoffs/BUNKI_CLAUDE_FRESH_CONTEXT_BUILD_SPEC_HANDOFF_2026-07-27.md` | `c002f6c4d8c007d0acdac1a66b7295d287f98d206f610c3131d73218dc19909c` | present and verified |

## Intended publication protocol

1. Resolve the repository containing revision `8404395`, or receive an explicit
   operator choice of a different repository.
2. Recover and verify Claude's frozen v1 from that revision or exact supplied
   bytes.
3. Create a task branch; never write directly to the default branch.
4. Add only the paths in this manifest, preserving exact bytes.
5. Recompute all hashes from the staged tree.
6. Commit with an explicit convergence-handoff message.
7. Push the task branch and open a draft PR.
8. Report repository, branch, commit SHA, tree state, and draft-PR URL.
9. Do not merge or approve the PR.

## Current publication gates

- This workspace is not a usable Git checkout.
- No accessible GitHub repository named for Bunki or this Japanese-learning
  project was found in the connected account.
- The repository containing revision `8404395` has not been identified.
- Claude's exact frozen v1 is not present locally.

The smallest safe operator action is to identify the repository that contains
revision `8404395`. If it is not on the connected GitHub account, provide the
repository URL or attach the exact frozen file. If a new repository is desired,
choose its owner, name, visibility, and license explicitly.
