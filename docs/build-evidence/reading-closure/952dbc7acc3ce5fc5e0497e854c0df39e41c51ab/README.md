# Reading R0 evidence baseline

This packet binds the live Bunki Pages payload to authority commit
`952dbc7acc3ce5fc5e0497e854c0df39e41c51ab` and records what is actually
proved before any reading product work is harvested.

The complete downloadable `bunki-app-static` artifact was compared with the
deterministic Pages source projection: all 859 files and 120,759,022 bytes were
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

Reproduce the deterministic census and Pages projection:

```sh
node scripts/reading-r0-audit.mjs \
  --candidate 952dbc7acc3ce5fc5e0497e854c0df39e41c51ab \
  --out docs/build-evidence/reading-closure/952dbc7acc3ce5fc5e0497e854c0df39e41c51ab
```

To repeat the stronger artifact comparison, download and unzip workflow
artifact `9245211388`, then add `--artifact-dir <unzipped-directory>` and
`--artifact-zip <downloaded-zip>`.
