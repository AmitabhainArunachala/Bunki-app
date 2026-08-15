# Reading R0 evidence baseline

This packet binds the Bunki Pages payload observed at its audit cut to the
current Claude authority commit `42b54d66aac8e8eed55607e5a80108e65905b070`
and records what was actually proved before any reading product donor is
harvested. It supersedes the r3 historical packet after reconciling Claude's
one-child sticky-grade-row advance.

The complete downloadable `bunki-app-static` artifact was compared with the
deterministic Pages source projection: all 859 files and 120,760,056 bytes were
byte-identical. Seven cache-busted public files were also fetched and matched.
That is deployment-identity evidence, not rendered browser, accessibility, or
physical-device evidence.

The exact payload contains 40 primary readings and 694 archive readings. It
does not contain the separate 30-reading private draft donor described by the
older 70-record audit. Nineteen default-visible Bunki originals have rights
labels but no human editorial approval receipt; rights-clear and
publication-approved are deliberately not conflated.

The defensible rubric remains 17/100 with the reliable-reader cap of 30 active.
Browser and device journeys are `NOT_RUN`, never inferred from source or old
screenshots. Public release is blocked by absent approval truth. This packet is
an R0 baseline and is not a release candidate.

`control-census.json` binds both deployed JavaScript files by SHA-256 and
enumerates 66 source-visible reading control families, including dynamic,
conditional, pointer-only, canvas-hit, AI-reading, focus-dojo, yomi-probe,
legacy-field, entry-recursion, review, and stroke-motion states. Navigation and
lookup families are separated from Drift judgment, probe/review grade, rest,
undo, capture, and import/export mutations. The audit script requires an exact
one-to-one set of 66 matching control rows in `click-ledger.jsonl`; a broad or
mixed catch-all cannot hide an omission or event assertion. Every rendered
result remains `NOT_RUN`, so source presence is never represented as a
successful click. Every capability claim names its learner fixture,
browser/device lanes, evidence class, reviewer, and expected learner-event
effect in `claim-ledger.jsonl`.

The independent reviews of remote r2 and remote r4 correctly failed incomplete
source-control censuses. Their records preserve those results. This follow-up
repairs the r4 omissions and remains subject to a fresh independent review.

Reproduce the deterministic census and Pages projection:

```sh
node scripts/reading-r0-audit.mjs \
  --candidate 42b54d66aac8e8eed55607e5a80108e65905b070 \
  --out docs/build-evidence/reading-closure/42b54d66aac8e8eed55607e5a80108e65905b070
```

To repeat the stronger artifact comparison, download and unzip workflow
artifact `9246617090`, then add `--artifact-dir <unzipped-directory>` and
`--artifact-zip <downloaded-zip>`.
