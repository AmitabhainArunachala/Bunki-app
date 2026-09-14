# Combined reference and SKIP verification

This is evidence from a disposable integration tree, not a merged branch. Merge authority remains with the operator.

After these walkthroughs, the operator merged PRs #92 and #91. The remaining review-surface repair and final evidence are carried on `feat/experience-final-signoff`, based on that merged main. The follow-up's Corridor sources match this tested tree, and its regenerated standalone matches the tested rebuilt artifact byte for byte; see [followup-runtime-parity.log](followup-runtime-parity.log).

- Reference implementation: `06406e3ea3cd47a8dff2709f7862207b8bcee41a`.
- SKIP implementation: `66e5a3785b15f0281bffb5c80aaa0b6b5a97dc29`.
- Conflict-free merge-tree result: `49987fb0acc4bc16fdb1dff21c826bd152c6aa7b`.
- Detached verification commit: `d8981b6b4c4237f7c58a15e189125f99d6b30864`.
- The standalone HTML was rebuilt in that disposable tree before offline verification.

The same `verify-experience.mjs` used on the reference branch ran against this tree with `--require-skip`. It passed **41/41 checks**, with no skips, no uncaught page errors, and no changes to the nine tracked runtime/data asset hashes during execution. This includes the added review-completion paper/contrast regression. Its 63 screenshot paths are enumerated in [results.json](results.json) and [screenshot-manifest.md](screenshot-manifest.md); the separate [visual-review.json](visual-review.json) records actual visual observations and limits.

Complementary combined-tree checks passed: 19 SKIP core/archive checks, 3 packaging checks, 41 SKIP browser checks, blocked-network SKIP standalone checks, 49 reference-browser checks, and 19 recursive-connection checks. Logs are alongside this document; these suite counts overlap in coverage and should not be summed into unique product requirements.

The source archive is the pinned `kanjidic2-en-3.6.2+20260803141815.json.zip`, SHA-256 `5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6`. No data was reconstructed from guesses, no live tutor response was fabricated, and no learner history was seeded to make the primary walkthrough pass.

Reproduce the combined tree with `git merge-tree --write-tree <reference-ref> <skip-ref>`, materialize it in a disposable worktree, rebuild the standalone artifact, and point `EXPERIENCE_ROOT` at that tree's `prototypes/corridor`. The final PR includes the same reusable walkthrough; the hosted workflow automatically requires SKIP when its module is present.
