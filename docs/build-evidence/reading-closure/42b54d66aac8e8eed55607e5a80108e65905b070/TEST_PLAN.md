# R0 reproduction plan

Run from a clean checkout containing the candidate.

```sh
git rev-parse HEAD HEAD^{tree}
git status --porcelain
node --check prototypes/corridor/corridor.js
node --check prototypes/corridor/corridor-ink.js
node --check prototypes/corridor/dictionary-worker.js
node scripts/reading-r0-audit.mjs \
  --candidate 42b54d66aac8e8eed55607e5a80108e65905b070 \
  --out docs/build-evidence/reading-closure/42b54d66aac8e8eed55607e5a80108e65905b070
```

For the immutable workflow artifact lane:

1. Download artifact `9246617090` from run `31883465596`.
2. Verify the ZIP SHA-256 is `eaad198971c8400f7967f4840660c24819c04df3067b0d0dd32cc156a6a121ce`.
3. Unzip it without modifying bytes.
4. Rerun `reading-r0-audit.mjs` with `--artifact-dir` and `--artifact-zip`.
5. Require `downloadedArtifact.result` to be `BYTE_IDENTICAL`.

The next browser owner must run the screenshot itinerary at 320×568, 390×844,
430×932, tablet, and desktop; record console/page/network/accessibility and
offline logs; and execute every `NOT_RUN` click-ledger row. Primary Chromium,
primary WebKit, and the physical iPhone must each complete the golden walk.
