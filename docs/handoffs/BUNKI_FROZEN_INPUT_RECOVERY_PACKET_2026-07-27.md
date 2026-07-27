---
title: "Bunki — Frozen-Input Recovery Packet (Synthesis Stopped at Integrity Gate)"
date: 2026-07-27
artifact_type: integrity_recovery_packet
project: bunki
status: blocked_awaiting_operator_recovery
author_agent: Claude (fresh context, specification-only pass)
controller:
  file: docs/handoffs/BUNKI_CLAUDE_FRESH_CONTEXT_BUILD_SPEC_HANDOFF_2026-07-27.md
  sha256: c002f6c4d8c007d0acdac1a66b7295d287f98d206f610c3131d73218dc19909c
  sha256_status: verified
repository: AmitabhainArunachala/Bunki-app
input_branch: agent/bunki-convergence-handoff-2026-07-27
input_branch_head: 14fe5f48e18453dbbab0ada91b09bc2e914c2377
input_branch_head_status: verified_matches_operator_declared_head
synthesis_performed: none
frozen_inputs_modified: none
---

# Bunki frozen-input recovery packet — 2026-07-27

This packet is issued under Section 2 of the fresh-context handoff controller,
which requires: *"If it is unavailable, stop before synthesis and report the
exact searches performed, the missing artifact, the observed
repository/revision state, and the smallest recovery action. Do not reconstruct
a frozen artifact from summaries or memory, and do not claim hash continuity
for a reconstruction."*

**Synthesis has not begun.** No portion of the converged v2 specification, the
Phase-0 `/goal` controller, or the auxiliary artifacts has been drafted. No
frozen input has been edited, normalized, or reconstructed.

## 1. Verdict

Two independent integrity failures block the mandatory read order. Either one
alone is a stop condition under the controller.

| # | Frozen input | Declared SHA-256 | Observed | Result |
|---|---|---|---|---|
| F1 | `BUNKI_WORKING_SPEC_2026-07-27.md` (Claude frozen v1) | `77e52f3a93fd9ebb3cdd8c456250cb66779d87bc1582e53e0bd7e39da82feb68` | absent everywhere searched | **UNRECOVERABLE IN THIS ENVIRONMENT** |
| F2 | `JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md` (Codex frozen v1) | `94842a1c8bc423a84cbe6131a8c540c88b676d5f8e2143a107b02ec5b28da95b` | present, but bytes hash to `ba5ab3725d754198631dbdeea3ae4a3a4e17f2867ed409e048e3d63577059932` | **HASH MISMATCH — not attributable to transport noise** |

The remaining three declared artifacts verify byte-for-byte:

| Frozen input | Declared SHA-256 | Observed | Result |
|---|---|---|---|
| `BUNKI_CONVERGENCE_ROUND1_2026-07-27.md` | `a6066f69…dd756d` | identical | verified |
| `BUNKI_CONVERGENCE_ROUND1_CODEX_RESPONSE_2026-07-27.md` | `9542fbaa…f07a54` | identical | verified |
| `BUNKI_CLAUDE_FRESH_CONTEXT_BUILD_SPEC_HANDOFF_2026-07-27.md` | `c002f6c4…19909c` | identical | verified |
| `BUNKI_GIT_ARTIFACT_MANIFEST_2026-07-27.md` (PR-declared) | `e9ce55aa…9ef099` | identical | verified |

## 2. Failure F1 — missing artifact

- **Missing artifact:** `BUNKI_WORKING_SPEC_2026-07-27.md`
- **Declared SHA-256:** `77e52f3a93fd9ebb3cdd8c456250cb66779d87bc1582e53e0bd7e39da82feb68`
- **Declared provenance:** frozen at Git revision `8404395`, declared by Claude
  in a prior context; the publication manifest already recorded it as
  "missing from this workspace" at publication time.

### Exact searches performed (all on 2026-07-27, container created 04:59 UTC)

| # | Search | Scope | Command(s) | Result |
|---|---|---|---|---|
| S1 | Working tree | full checkout of `14fe5f4` | `git ls-tree -r 14fe5f4…` | 6 tracked files; target absent |
| S2 | Every Git object | complete object store (28 objects; repo verified non-shallow via `git rev-parse --is-shallow-repository` → `false`) | `git cat-file --batch-all-objects --batch-check`, then `git cat-file blob <oid> \| sha256sum` for every blob | 6 blobs total; SHA-256 values: `ba5ab372…`, `9542fbaa…`, `2c541e9c…` (README), `c002f6c4…`, `a6066f69…`, `e9ce55aa…`. No blob matches `77e52f3a…` |
| S3 | Dangling/unreachable objects | local repository | `git fsck --lost-found --unreachable` | no output; nothing dangling |
| S4 | Revision `8404395` locally | local repository | `git rev-parse --verify 8404395`; `git cat-file -t 8404395` | `Not a valid object name` |
| S5 | Revision `8404395` on remote | `origin` (GitHub) | `git fetch origin 8404395` | `fatal: couldn't find remote ref 8404395` |
| S6 | Revision `8404395` in GitHub's object store (would find orphaned pushed commits) | GitHub API, `AmitabhainArunachala/Bunki-app` | `GET /repos/…/commits/8404395` | HTTP 422 — `No commit found for SHA: 8404395` |
| S7 | All remote refs | `origin` | `git ls-remote origin` | only `main` (`e3c6344`), `agent/bunki-convergence-handoff-2026-07-27` (`14fe5f4`), `refs/pull/1/head`, `refs/pull/1/merge` |
| S8 | Filename sweep | entire container filesystem (`/`, one device) | `find / -xdev \( -iname "*BUNKI*" -o -iname "*JAPANESE_LEARNING*" \)` excluding this repo | only Claude-session cache/transcript directories named after the project path; no document files |
| S9 | Content sweep | `/root`, `/tmp`, `/home` | `grep -rl "BUNKI_WORKING_SPEC"` | only this session's own conversation transcript (`/root/.claude/projects/...jsonl`) and the CLI log — i.e., mentions of the *name* from the current task, not the file |
| S10 | Other Git repositories on disk | entire container | `find / -xdev -name .git` | only this repo plus toolchain caches (`uv` sdists, `rbenv`, `nvm`) — no project repositories |
| S11 | Candidate repositories in the connected account | GitHub account listing (names/metadata only) | claude-code-remote `list_repos` (49 repositories) | no repository identifiable as the prior Bunki/Japanese-learning workspace; consistent with the manifest's own finding at publication time |

### Why the file cannot exist here

This session runs in a fresh, ephemeral cloud container created at
2026-07-27 04:59 UTC with a fresh `--depth 50` clone (subsequently verified
complete/non-shallow — `main` genuinely has a single root commit). The prior
Claude context that froze revision `8404395` ran in a different workspace whose
filesystem was not carried into this container. Revision `8404395` was never
pushed to `AmitabhainArunachala/Bunki-app` (S6 proves GitHub has no such
object, reachable or orphaned). Therefore the exact bytes are not present in
any store this session is authorized to read.

## 3. Failure F2 — Codex v1 hash mismatch

- **File:** `docs/convergence/JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md`
- **Declared SHA-256** (in the handoff YAML header, the publication manifest,
  and the PR #1 body): `94842a1c8bc423a84cbe6131a8c540c88b676d5f8e2143a107b02ec5b28da95b`
- **Observed SHA-256 of the published bytes:** `ba5ab3725d754198631dbdeea3ae4a3a4e17f2867ed409e048e3d63577059932`
  (Git blob `237368e8e31d023f5cacdc8aca13c224933b031b`, 80,107 bytes, UTF-8, LF)

### Provenance evidence

The identical blob `237368e8…` is the file's content at **every** commit that
has ever contained it — `e457ce8` ("Add frozen Codex v1"), `6ed361b`,
`a3abf4c`, `3f3df55`, and head `14fe5f4`. No object matching `94842a1c…` has
ever existed in this repository. This contradicts PR #1's validation claim
that a fetch-back comparison of the published Codex v1 against a local source
hashing to `94842a1c…` passed. The divergence therefore occurred **before or
during publication**, not after.

### Transport-noise hypotheses tested and excluded

| Transformation of published bytes | Resulting SHA-256 | Matches declared? |
|---|---|---|
| As published | `ba5ab372…059932` | no |
| Final newline stripped | `547c7cee…51e971` | no |
| Extra trailing newline | `fae57395…7a52ef` | no |
| LF → CRLF | `778d1f27…b869fae` | no |
| UTF-8 BOM prepended | `d86ecb11…d59916` | no |

The controller permits proceeding past a mismatch only when it is "clearly
copy/paste transport noise **and** the operator explicitly accepts the
replacement." Neither condition holds: the difference is not attributable to
trivial transport transforms, and no operator acceptance exists. The published
Codex v1 text is complete and internally coherent on inspection, so the likely
explanations are (a) the declared hash was computed over a slightly different
pre-publication revision of the file, or (b) the file was altered in
transport in a non-trivial way. Distinguishing these requires the original
bytes, which only Codex's workspace or the operator holds.

## 4. Observed repository/revision state (at time of stop)

- Repository: `AmitabhainArunachala/Bunki-app` (private)
- `main`: `e3c6344b9ee0f21339e42b32c3b118ec6f4c2a11` — single root commit
  ("first commit", README only)
- `agent/bunki-convergence-handoff-2026-07-27`:
  `14fe5f48e18453dbbab0ada91b09bc2e914c2377` — matches the operator-declared
  verified head; 5 commits over `main` adding the five convergence/handoff
  documents; PR #1 (draft, open, unmerged) targets `main` from this branch
- Task branch `claude/bunki-japanese-learning-convergence-byagk4`:
  fast-forwarded to `14fe5f4`, then this packet committed on top
- Object census: 28 objects (6 commits, 16 trees, 6 blobs); non-shallow;
  no dangling objects; working tree clean before this packet was added

## 5. Smallest recovery actions (ranked)

**For F1 — Claude frozen v1 (blocks everything):** locate the environment
where the prior Claude context ran — the workspace containing Git revision
`8404395` (a prior Claude Code session's repository/container, or an
operator-side checkout). Then do exactly one of:

1. **(preferred)** Push or attach the exact original file. Verify
   `sha256 == 77e52f3a93fd9ebb3cdd8c456250cb66779d87bc1582e53e0bd7e39da82feb68`,
   commit it byte-for-byte to `docs/convergence/BUNKI_WORKING_SPEC_2026-07-27.md`
   on the input branch (or a successor branch), and re-invoke the controller.
2. If that session/container is unrecoverable and the file exists nowhere
   else, the operator may **explicitly decide** to designate
   `BUNKI_CONVERGENCE_ROUND1_2026-07-27.md` (verified, and stated by the
   handoff to restate every position under resolution) as the authoritative
   record of Claude's v1 positions, recording Claude v1 as
   `lost_unrecoverable`. This is an operator decision that must be recorded in
   the decision ledger; it is not hash continuity, and no agent may make it
   unilaterally. Synthesis could then proceed with the loss explicitly carried
   in every downstream provenance claim.

**For F2 — Codex v1 mismatch:** the operator (or the Codex context that
declared the hash) must do exactly one of:

1. Supply the original bytes hashing to `94842a1c…` so they can be published
   byte-for-byte (superseding, not editing, the current file), or
2. Explicitly accept the published `ba5ab372…` bytes as the canonical frozen
   Codex v1 and record the corrected hash in a superseding manifest entry.
   The frozen handoff and manifest files themselves must not be edited; the
   correction belongs in a new, dated correction record plus the decision
   ledger of the eventual v2.

**Single smallest combined action:** the operator identifies the prior
sessions' workspaces (Claude's revision-`8404395` workspace; Codex's
publication workspace) and either recovers both original byte streams or
issues the two explicit acceptance decisions above, in a reply or commit this
session can verify.

### Candidate prior workspaces (metadata-only lead, discovered post-publication)

The account's repository listing (S11, names and push timestamps only — no
repository contents were read) shows two repositories pushed on the same day
as, and shortly before, the convergence publication to this repository
(input branch pushed 2026-07-27T04:55:44Z; PR #1 opened 04:56:33Z):

| Candidate repository | Last push (UTC) | Lead strength |
|---|---|---|
| `AmitabhainArunachala/dharma_swarm` | 2026-07-27T04:15:26Z | strongest — ~40 minutes before publication |
| `AmitabhainArunachala/SAB-Syntropic-Attractor-Basin` | 2026-07-27T00:59:45Z | strong — ~4 hours before publication |
| `AmitabhainArunachala/vibe-halt` | 2026-07-25T12:51:38Z | weaker — two days prior |

The prior Claude context that froze revision `8404395` may have been working
in one of these. The operator (or an agent the operator explicitly authorizes
to access them) can test each candidate with:

    git cat-file -t 8404395          # inside a full clone of the candidate
    git log --all --oneline | grep -i bunki
    git rev-list --all | xargs -I{} git ls-tree -r {} 2>/dev/null | grep BUNKI_WORKING_SPEC

If revision `8404395` resolves to a commit, recover the file and verify
`sha256 == 77e52f3a…feb68` before publication. This session has not read any
of these repositories; they are outside its authorized scope pending explicit
operator authorization.

## 6. Resumption protocol

When the operator supplies bytes or decisions:

1. Verify any supplied file's SHA-256 against its declared value before use.
2. Record any operator acceptance decision verbatim in
   `BUNKI_OPERATOR_DECISIONS_2026-07-27.md` (to be created in the synthesis
   pass) with status `accepted_by_operator` and the date.
3. Re-run the controller's Section 2 read order from the top with all inputs
   verified or explicitly waived, then proceed to Outputs A/B and the
   auxiliary artifacts in a single pass.

## 7. Explicit non-actions

In accordance with the controller and the operator's instructions, this pass
did **not**: reconstruct any frozen artifact from summaries or memory; claim
hash continuity for anything; edit or normalize either frozen v1; begin v2 or
Phase-0 controller synthesis; implement application code, install
dependencies, or scaffold runtime infrastructure; merge, approve, or modify
PR #1 or its branch.
