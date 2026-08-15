# RUN_STATE — R1 canonical commit barrier

- Branch: `agent/reading-r1-domain-20260815-r2`
- Authority head at cut: `34c0176d1ffe3c502873b0bbbf1cba399389a8aa`
- Authority tree: `9320a1c741812a7d38f7afd54263cb7d133c3fbf`
- Reviewed transplant source: local commit `753dfa461289a055f6c75e2019eaf60831bd98d3` from the superseded `952dbc7` cut
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
  34c0176d1ffe3c502873b0bbbf1cba399389a8aa..origin/agent/reading-r1-domain-20260815-r2
```
