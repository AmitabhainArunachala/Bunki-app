# Combined reference and SKIP verification

This is evidence from a disposable integration tree, not a merged branch. Merge authority remains with the operator.

- Reference implementation: `e35beb3e32f5ef63cc9e4bb93306b62f4c8d29dc`.
- SKIP implementation: `66e5a3785b15f0281bffb5c80aaa0b6b5a97dc29`.
- Conflict-free merge-tree result: `c22320ef4ed86f513ef81e28a78d71c337392da1`.
- Detached verification commit: `3040f8faccf503d6c2bca7d27114e4510cef0119`.
- The standalone HTML was rebuilt in that disposable tree before offline verification.

The same `verify-experience.mjs` used on the reference branch ran against this tree with `--require-skip`. It passed **40/40 checks**, with no skips, no uncaught page errors, and no changes to the nine tracked runtime/data asset hashes during execution. Its 63 screenshot paths are enumerated in [results.json](results.json) and [screenshot-manifest.md](screenshot-manifest.md); the separate [visual-review.json](visual-review.json) records actual visual observations and limits.

Complementary combined-tree checks passed: 19 SKIP core/archive checks, 3 packaging checks, 41 SKIP browser checks, blocked-network SKIP standalone checks, 49 reference-browser checks, and 19 recursive-connection checks. Logs are alongside this document; these suite counts overlap in coverage and should not be summed into unique product requirements.

The source archive is the pinned `kanjidic2-en-3.6.2+20260803141815.json.zip`, SHA-256 `5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6`. No data was reconstructed from guesses, no live tutor response was fabricated, and no learner history was seeded to make the primary walkthrough pass.

Reproduce the combined tree with `git merge-tree --write-tree <reference-ref> <skip-ref>`, materialize it in a disposable worktree, rebuild the standalone artifact, and point `EXPERIENCE_ROOT` at that tree's `prototypes/corridor`. The final PR includes the same reusable walkthrough; the hosted workflow automatically requires SKIP when its module is present.
