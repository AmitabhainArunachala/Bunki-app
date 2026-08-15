# Reading R0 evidence baseline

This packet binds the live Bunki Pages payload to authority commit
`34c0176d1ffe3c502873b0bbbf1cba399389a8aa` and records what is actually
proved before any reading product work is harvested.

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

`control-census.json` exhaustively enumerates source-visible reading control
families and dynamic instance formulas. Each family also has a row in
`click-ledger.jsonl`, but its rendered result remains `NOT_RUN`; source presence
is never represented as a successful click. Every capability claim names its
learner fixture, browser/device lanes, evidence class, independent reviewer,
and expected learner-event effect in `claim-ledger.jsonl`.

Reproduce the deterministic census and Pages projection:

```sh
node scripts/reading-r0-audit.mjs \
  --candidate 34c0176d1ffe3c502873b0bbbf1cba399389a8aa \
  --out docs/build-evidence/reading-closure/34c0176d1ffe3c502873b0bbbf1cba399389a8aa
```

To repeat the stronger artifact comparison, download and unzip workflow
artifact `9245918458`, then add `--artifact-dir <unzipped-directory>` and
`--artifact-zip <downloaded-zip>`.
