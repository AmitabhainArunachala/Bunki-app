# RUN_STATE — R1 canonical commit barrier

- Branch: `agent/reading-r1-domain-20260815-r4`
- Authority head at cut: `ac880aff052991b230dfdd9b7f39267ae764a05f`
- Authority tree: `8a2636c7a47c1e3ba43c333921b818bed38c405a`
- Replay source: remote reviewed donor `a0f3ab973c88e46a8827feab283605706df4eabf` / tree `530f79913e7eb949295891bd0c5b91613802b99c`
- Candidate coordinate: exactly one local commit whose sole parent is `ac880aff052991b230dfdd9b7f39267ae764a05f`; the sealed SHA and tree are reported out of band because a commit cannot embed its own identity
- Authority reconciliation: `42b54d66aac8e8eed55607e5a80108e65905b070..ac880aff052991b230dfdd9b7f39267ae764a05f` is one commit and changes only Corridor/Drift code plus prototype audit evidence and screenshots; owned-path overlap is zero
- Independent review: the source donor's PASS is historical assurance only; this r4 replay requires a fresh read-only review after publication before harvest
- Capability: failure-atomic provisional-web snapshot publication
- Migration: none

## Owned paths

- `packages/persistence/src/web/adapter.ts`
- `packages/persistence/test/adversarial/web-snapshot-write-atomicity.test.ts`
- `docs/build-evidence/reading-r1-domain-20260815/**`

## Contract

The web adapter builds log, indexes, purge effects, batch metadata, and
derived-state cache as one candidate. It persists that complete candidate
before publishing any field through the live handle. A failure-atomic
`SnapshotStore.setItem` exception leaves durable bytes, `readAll`, indexes,
snapshot, export, cache, and retry identity unchanged.

The synchronous `SnapshotStore` contract cannot distinguish a backend that
commits and then throws. Such a backend is nonconforming; the adapter does not
attempt a compensating write that could erase committed data.

## Deliberate omissions

- No app optimistic-state rewrite.
- No Corridor or Sites state cutover.
- No event-v2, ArticleVersion, legacy importer, or SRS change.
- No UI, article data, workflow, or integration-branch edit.

The live Corridor and app still have independent failed-write/state-integrity
defects. This commit is a prerequisite, not a claim that canonical one-state
closure is complete.

## Rollback

Revert the atomic donor commit as one unit. There is no schema, data, or export
migration and no generated product artifact.

## Next command after publication

```sh
git fetch origin agent/reading-r1-domain-20260815-r4
git log --oneline --decorate --no-merges \
  ac880aff052991b230dfdd9b7f39267ae764a05f..origin/agent/reading-r1-domain-20260815-r4
```
