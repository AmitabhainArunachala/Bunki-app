# Reading R0 evidence baseline

This packet binds the Bunki Pages payload observed at its audit cut to authority
commit `34c0176d1ffe3c502873b0bbbf1cba399389a8aa` and records what was actually
proved before any reading product work was harvested. During the r3 census
repair, Claude advanced by one child to `42b54d66aac8e8eed55607e5a80108e65905b070`
and deployed it successfully. This packet is therefore a preserved historical
checkpoint; it makes no current-live claim and must not be harvested as current
R0 evidence.

The complete downloadable `bunki-app-static` artifact was compared with the
deterministic Pages source projection: all 859 files and 120,759,578 bytes were
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
enumerates 51 source-visible reading control families, including dynamic,
conditional, pointer-only, canvas-hit, legacy-field, entry-recursion, and
stroke-motion states. The audit script requires an exact one-to-one set of 51
matching control rows in `click-ledger.jsonl`; a broad catch-all cannot hide an
omission. Every rendered result remains `NOT_RUN`, so source presence is never
represented as a successful click. Every capability claim names its learner
fixture, browser/device lanes, evidence class, reviewer, and expected
learner-event effect in `claim-ledger.jsonl`.

The independent review of remote r2 correctly failed its broad source-control
census. `independent-review-r0-r2.json` preserves that result and the repaired
r3 packet remains subject to a fresh independent review.

Reproduce the deterministic census and Pages projection:

```sh
node scripts/reading-r0-audit.mjs \
  --candidate 34c0176d1ffe3c502873b0bbbf1cba399389a8aa \
  --out docs/build-evidence/reading-closure/34c0176d1ffe3c502873b0bbbf1cba399389a8aa
```

To repeat the stronger artifact comparison, download and unzip workflow
artifact `9245918458`, then add `--artifact-dir <unzipped-directory>` and
`--artifact-zip <downloaded-zip>`.
