# Bunki Reading Crown Campaign — RUN STATE

**State:** `CONTROLLER_PUBLICATION_CHECKPOINT_PREPARED`

**Observed:** 2026-08-15 19:35:22 JST / 2026-08-15 10:35:22 UTC

## Binding coordinates

- Repository: `AmitabhainArunachala/Bunki-app`
- Sole integration branch: `claude/app-vision-next-steps-wei73a`
- `authorityHeadAtCut`: `952dbc7acc3ce5fc5e0497e854c0df39e41c51ab`
- Authority tree: `ba95db981b91b928fb3580cb2adc073d103ef1b8`
- `main`: `5e5075dc29eb292f86e6ce0b50decf8bd0bf3ece`
- Merge base: `5e5075dc29eb292f86e6ce0b50decf8bd0bf3ece`
- Controller branch before this checkpoint: `8a747bc588e4192d1a79958331017f5a230b9539`
- Controller tree before this checkpoint: `a516f480dc502d7801da247a592781a74bba49bc`
- Integration PR: [#71](https://github.com/AmitabhainArunachala/Bunki-app/pull/71)
- Exact deployed integration URL: <https://amitabhainarunachala.github.io/Bunki-app/>
- Deployment `5919247296`: success, bound to the authority SHA above

The detached authority checkout was clean (`git status --porcelain` empty). The controller branch is based directly on the authority head and contains the rubric and controller as two additive commits. No product source has been edited by this campaign.

## Current truth

- The binding reading score remains **17/100**, with the **30/100 no-complete-reader cap** active.
- Current authority checks are green: corpus-tests `31877807748`, verified build `31877807760`, CI `31877807749`, and Pages `31877807584`.
- A successful Pages deployment exists for the exact authority SHA, but R0 has not yet established page-visible build metadata, payload identity, current screenshot evidence, or the complete click graph.
- PR #71 is the only current integration authority. Other open PRs are historical donors, not parallel products.
- No authority conflict has been found.

## Initial ownership wave

| Owner | Mode | Paths / question |
| --- | --- | --- |
| Root coordinator | write | This manifest and this run-state checkpoint only |
| Subagent: live-state auditor | read-only | Reproduce refs, PR/check/deploy state and flag discrepancies |
| Subagent: architecture auditor | read-only | Map current reading/domain/persistence implementation to R1–R6 requirements |
| Subagent: product/evidence auditor | read-only | Map current Corridor behavior, data, tests, and evidence to R0/R2/R3/R7/R8 |

No subagent may push, merge, self-approve content, edit shared authorities, or mutate a provider/deployment.

## Next command

After this checkpoint is pushed and independently retrieved from Git:

```bash
git fetch origin agent/reading-campaign-controller-2026-08-15 claude/app-vision-next-steps-wei73a
git ls-remote origin refs/heads/agent/reading-campaign-controller-2026-08-15
git worktree add --detach ../reading-r0 952dbc7acc3ce5fc5e0497e854c0df39e41c51ab
```

Then execute R0 without making product edits: enumerate entry paths and controls, inspect the exact deployment, reproduce the fixed-list defect, run the existing gates and metadata census, and publish a source/rendered evidence baseline before assigning writer-owned donor branches.

## Prohibitions retained

- Do not push, merge, rebase, or open a PR against the Claude integration branch.
- Do not push or merge `main`.
- Do not open a new PR unless the operator explicitly requests it.
- Do not begin substantial product implementation until this controller checkpoint is remotely retrievable.
- Do not count private drafts as approved or infer operator/device acceptance.

## Terminal status

No terminal state is true yet. Continue after remote verification.
