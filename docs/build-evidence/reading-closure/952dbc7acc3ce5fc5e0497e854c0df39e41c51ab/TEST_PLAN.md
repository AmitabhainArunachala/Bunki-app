# R0 reproduction plan

Run from a clean checkout containing the candidate.

```sh
git rev-parse HEAD HEAD^{tree}
git status --porcelain
node --check prototypes/corridor/corridor.js
node --check prototypes/corridor/corridor-ink.js
node --check prototypes/corridor/dictionary-worker.js
node scripts/reading-r0-audit.mjs \
  --candidate 952dbc7acc3ce5fc5e0497e854c0df39e41c51ab \
  --out docs/build-evidence/reading-closure/952dbc7acc3ce5fc5e0497e854c0df39e41c51ab
```

For the immutable workflow artifact lane:

1. Download artifact `9245211388` from run `31877807584`.
2. Verify the ZIP SHA-256 is `9893fb55ac9163e6d6aa7997ec21fe9ca94f2d9531d9c664f08e917ff937914f`.
3. Unzip it without modifying bytes.
4. Rerun `reading-r0-audit.mjs` with `--artifact-dir` and `--artifact-zip`.
5. Require `downloadedArtifact.result` to be `BYTE_IDENTICAL`.

The next browser owner must run the screenshot itinerary at 320×568, 390×844,
430×932, tablet, and desktop; record console/page/network/accessibility and
offline logs; and execute every `NOT_RUN` click-ledger row. Primary Chromium,
primary WebKit, and the physical iPhone must each complete the golden walk.
