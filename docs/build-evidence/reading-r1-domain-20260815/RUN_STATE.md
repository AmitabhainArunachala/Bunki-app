# RUN_STATE — R1 canonical commit barrier

- Branch: `agent/reading-r1-domain-20260815-r3`
- Authority head at cut: `42b54d66aac8e8eed55607e5a80108e65905b070`
- Authority tree: `6a901fe5bdf99cfd0ac81d94efd366cbd86c322c`
- Reviewed transplant source: remote commit `3d119f1f82a63bb88ef99de667bf8c04fdfb0e05` from the superseded `34c0176` cut
- Replay result: the `34c0176..42b54d6` authority delta changes only Corridor CSS and prototype evidence/screenshots; owned-path overlap is zero
- Independent review: the source r2 donor passed; a fresh read-only review of the published r3 replay is required before harvest
- Capability: failure-atomic provisional-web snapshot publication
- Migration: none

## Owned paths

- `packages/persistence/src/web/adapter.ts`
- `packages/persistence/test/adversarial/web-snapshot-write-atomicity.test.ts`
- `docs/build-evidence/reading-r1-domain-20260815/**`

## Contract

The web adapter now builds log, indexes, purge effects, batch metadata, and
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

## Next command

```sh
git fetch origin claude/app-vision-next-steps-wei73a
git log --oneline --decorate --no-merges \
  42b54d66aac8e8eed55607e5a80108e65905b070..origin/agent/reading-r1-domain-20260815-r3
```
