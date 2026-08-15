# RUN_STATE — reading R0 baseline

- Authority: `claude/app-vision-next-steps-wei73a`
- Authority head at cut: `952dbc7acc3ce5fc5e0497e854c0df39e41c51ab`
- Authority tree: `ba95db981b91b928fb3580cb2adc073d103ef1b8`
- Evidence donor: `agent/reading-r0-evidence-20260815`
- Controller: `agent/reading-campaign-controller-2026-08-15@aa647bab72307288265027fb801cdb37e59b747b`
- Score: 17/100; reliable-reader cap 30 active
- Live URL: <https://amitabhainarunachala.github.io/Bunki-app/>
- Deployment: `5919247296`; workflow run `31877807584`
- Workflow artifact: `bunki-app-static` id `9245211388`, zip SHA-256 `9893fb55ac9163e6d6aa7997ec21fe9ca94f2d9531d9c664f08e917ff937914f`

## Established truth

- Complete artifact comparison: 859/859 files and 120,759,022/120,759,022 bytes match the clean candidate projection.
- Live corpus: 40 primary + 694 archive, not 70 primary.
- Primary data has zero approval/editorial fields; 19 records are default-visible Bunki originals.
- Public build receipt/SHA: absent.
- Article audio, living lanes, article search, deep links, share, offline cache, comprehension, and article-level AI loop: absent.
- Reader browser/device journeys: `NOT_RUN`; no claim is promoted from source inspection.
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
