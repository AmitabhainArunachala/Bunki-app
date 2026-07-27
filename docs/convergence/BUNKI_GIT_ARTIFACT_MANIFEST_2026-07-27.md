---
title: "Bunki — Git Publication and Integrity Manifest"
date: 2026-07-27
project: bunki
artifact_type: publication_manifest
status: published_in_draft_pr_missing_one_frozen_input
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

## Publication receipt

- Repository: `AmitabhainArunachala/Bunki-app`
- Visibility: private
- Base branch: `main`
- Publication branch:
  `agent/bunki-convergence-handoff-2026-07-27`
- Draft PR: `#1`
- License: deliberately undecided
- All five available artifact blobs were fetched from GitHub as base64, decoded
  to raw bytes, and SHA-256 verified against this manifest.

The first Codex-v1 upload was incomplete because its terminal transfer clipped
the final 150 Unicode characters. That noncanonical blob hashed to
`ba5ab3725d754198631dbdeea3ae4a3a4e17f2867ed409e048e3d63577059932`.
Correction commit `8dfa24b2814dfce85c599c122c59f2a868f220bb`
replaced it with the complete 80,253-byte frozen artifact. The corrected Git
blob is `59e97dd4664a087887498d42c5770ebbca1e1740`, and its raw SHA-256 is the
declared
`94842a1c8bc423a84cbe6131a8c540c88b676d5f8e2143a107b02ec5b28da95b`.

## Publication protocol

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

## Remaining integrity gate

Claude's exact frozen v1 is not present in this repository or the Codex
workspace. The next Claude context must recover
`BUNKI_WORKING_SPEC_2026-07-27.md` from the prior environment or Git object
history at revision `8404395`, verify SHA-256
`77e52f3a93fd9ebb3cdd8c456250cb66779d87bc1582e53e0bd7e39da82feb68`,
and publish those exact bytes. It must not reconstruct the file from Round-1
summaries.
