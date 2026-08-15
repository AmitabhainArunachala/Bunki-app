# RUN_STATE — reading R0 baseline

- Authority: `claude/app-vision-next-steps-wei73a`
- Authority head at cut: `34c0176d1ffe3c502873b0bbbf1cba399389a8aa`
- Authority tree: `9320a1c741812a7d38f7afd54263cb7d133c3fbf`
- Evidence donor: `agent/reading-r0-evidence-20260815-r2`
- Controller: `agent/reading-campaign-controller-2026-08-15@aa647bab72307288265027fb801cdb37e59b747b`
- Score: 17/100; reliable-reader cap 30 active
- Live URL: <https://amitabhainarunachala.github.io/Bunki-app/>
- Deployment: `5919707149`; workflow run `31880628237`
- Workflow artifact: `bunki-app-static` id `9245918458`, zip SHA-256 `44f57a8ad1c68450a142d3fb5db1986fbf6d4404af5cb211e34e9ba97b36266a`

## Established truth

- Complete artifact comparison: 859/859 files and 120,759,578/120,759,578 bytes match the clean candidate projection.
- Live corpus: 40 primary + 694 archive, not 70 primary.
- Primary data has zero approval/editorial fields; 19 records are default-visible Bunki originals.
- Public build receipt/SHA: absent.
- Article audio, living lanes, article search, deep links, share, offline cache, comprehension, and article-level AI loop: absent.
- Reader browser/device journeys: `NOT_RUN`; no claim is promoted from source inspection.
- Reading control families and dynamic instance formulas are source-enumerated; every rendered click remains `NOT_RUN`.
- Corridor keeps a separate learner store and scheduler; canonical one-state integration is not closed.

## Known risk

The historical `pages-preview.yml` can still deploy another prototype into the
same GitHub Pages environment. The current Corridor deployment was manually
dispatched because automatic `pages-app` pushes are limited to `main`.

## Resume

The next safe product donor should be cut from the exact authority head and
must not dual-write. Before harvesting any donor, the trunk keeper must re-read
the live authority head, audit its delta, then selectively cherry-pick reviewed
atomic commits. Rerun this packet against the harvested SHA; evidence does not
transfer across candidates.
