## Why

Explain the user-visible problem and the resulting behavior.

## Release

- Product version and release-notes file:
- Integrated source branches/PRs, if any:
- Learner data, card IDs, FSRS parameters and backup compatibility impact:
- Migration/recovery plan, if required:

## Verification

- Relevant local evidence:
- Full `bunki / required` result and any observed retries:
- Known limitations, including physical-phone coverage:

Every merge to `main` is a numbered production release. Use
`npm run release:prepare -- X.Y.Z`, complete its notes, and run
`npm run release:verify`. Publication is complete only when the Pages release
job succeeds and the live identity matches. Preserve earlier release history.
