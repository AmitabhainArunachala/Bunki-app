# Bunki / KAIRO development and releases

The phone product is `prototypes/corridor/`, deployed at
https://amitabhainarunachala.github.io/Bunki-app/. Older prototypes and provider
branches are implementation history, not separate production authorities.

- Start from current `main` on a task branch. Preserve unrelated worktrees and edits.
- Read `docs/operator/VERSIONING_AND_RELEASES.md` before changing release behavior.
  `release.json` owns the product version; `Me → Settings` must identify the
  installed code, not a newer version fetched from the network.
- Every merge to `main` is a production release. Prepare an increasing version
  with `npm run release:prepare -- X.Y.Z`, complete its notes, and use a PR.
  Batch related work on one branch when a single release is appropriate.
- Run `npm run release:verify` and the relevant local checks. Full CI admission
  remains required before merging product changes. Never skip a gate, loosen an
  assertion to get green, reuse stale evidence, or claim a deployment from a build alone.
- Preserve learner ownership, card IDs, saved records and pinned FSRS behavior.
  A data-compatibility change needs a migration/recovery plan and meaningful
  upgrade tests. A major version number never authorizes deleting learner data.
- The existing Pages workflow is the sole phone publisher. Its successful release
  job records the exact tested package, original producer, release commit and live identity.
  Never move a published version tag, overwrite release assets, or create a second
  production deployment path. Apply corrective changes as a new version.
- Check source ancestry and actual file changes when integrating another AI
  provider's work. Branch names, dates and model names do not establish that work
  is integrated, tested or deployed.
- Report what was tested and distinguish automated browser evidence from a test
  on the user's physical phone. Do not claim owner-only repository protections
  are enabled unless the GitHub settings confirm them.
