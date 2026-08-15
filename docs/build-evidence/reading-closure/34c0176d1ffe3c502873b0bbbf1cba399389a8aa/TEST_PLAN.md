# R0 reproduction plan

Run from a clean checkout containing the candidate.

```sh
git rev-parse HEAD HEAD^{tree}
git status --porcelain
node --check prototypes/corridor/corridor.js
node --check prototypes/corridor/corridor-ink.js
node --check prototypes/corridor/dictionary-worker.js
node scripts/reading-r0-audit.mjs \
  --candidate 34c0176d1ffe3c502873b0bbbf1cba399389a8aa \
  --out docs/build-evidence/reading-closure/34c0176d1ffe3c502873b0bbbf1cba399389a8aa
```

For the immutable workflow artifact lane:

1. Download artifact `9245918458` from run `31880628237`.
2. Verify the ZIP SHA-256 is `44f57a8ad1c68450a142d3fb5db1986fbf6d4404af5cb211e34e9ba97b36266a`.
3. Unzip it without modifying bytes.
4. Rerun `reading-r0-audit.mjs` with `--artifact-dir` and `--artifact-zip`.
5. Require `downloadedArtifact.result` to be `BYTE_IDENTICAL`.

The next browser owner must run the screenshot itinerary at 320×568, 390×844,
430×932, tablet, and desktop; record console/page/network/accessibility and
offline logs; and execute every `NOT_RUN` click-ledger row. Primary Chromium,
primary WebKit, and the physical iPhone must each complete the golden walk.
