# @bunki/export

**Owner WP:** WP-03 (export + round-trip), with **WP-09** owning the UI hooks.

**LICENSE: pending operator decision** (controller §4, OD-09).

## What this package is

The user's exit door. Export is a first-class correctness property here, not a
feature: if the data cannot leave losslessly, the evidence claims the rest of the
system makes are not checkable.

## Contract (controller §11, REQ-ARCH-08)

`exportJson()` emits:

```
{ exportVersion: 1, generatedAt, events: [...], seedRefs,
  appVersions: { domain, fsrs, schema } }
```

Complete, versioned, lossless.

- **`generatedAt`** comes from an injected clock. Two exports of one store taken
  at one instant are byte-identical, which is what lets T-14 compare bytes
  instead of structures.
- **`appVersions.schema`** is read from `@bunki/domain`, never accepted from a
  caller — nobody can mislabel the schema their own events are in.
- **`appVersions.fsrs` is `null` at WP-03, and that is the honest value.** No
  scheduler is pinned in this build; the pin is WP-06's (controller §6.3). A
  plausible-looking version string would be a claim about a component that does
  not exist. When WP-06 lands, the app passes the real pin through.

### What `seedRefs` means here (a narrow reading, recorded)

Controller §11 names the field and does not define its shape. The reading taken
is the one that claims least and is checkable: a `seedRef` is a **derived index
of the source and licence references the exported events actually cite** —
collected from each `EncounterCaptured`'s `sourceRef` and `provenance`
(REQ-SRC-01), deduplicated and sorted.

It asserts nothing the events do not already contain, so it cannot drift away
from them, and it makes T-15 answerable by inspection: a licence obligation
present in the log is listed at the top level of the export where a human can
read it. The alternative reading — an injected manifest of `@bunki/seed` records
— would let an export _claim_ provenance its events do not carry.

Two encounters citing one `sourceId` under different licences produce two refs,
never one merged ref: merging would have to pick a licence. `locator` is excluded
— it is a pointer at content, not a licence fact, and it is removed by the purge.

## Boundary rules

- **`npm run verify:export` is the proof, not the intent.** The root script runs
  `test/verify-export.test.ts`, which seeds **real stores** (SQLite
  ci-substitute _and_ provisional web), exports them, replays the export through
  `@bunki/domain`, and asserts derived-state equality with the live store
  (T-14). A passing export that does not replay is a failure. The suite includes
  a negative control — verifying one store's export against another store's
  state must report inequality — because a verifier that always returned `true`
  would pass every export ever written.
- **The reduction is not reimplemented.** `replay` is imported from
  `@bunki/domain`. A second reduction here would agree with the first right up
  until it did not, and the disagreement would surface as an export that
  "verifies" while describing a different history.
- **Provenance and license metadata survive the round trip** (T-15). Dropping a
  provenance field during export is a license-integrity defect, not a cosmetic
  one.
- **No transformation on the way out.** Export serialises the event log; it does
  not summarise, filter, or "clean" it. Derived state is re-derived on replay,
  never exported as authority.
- **Version every payload.** `parseExportEnvelope` rejects an unknown
  `exportVersion` _before_ reading anything else, consistent with REQ-DM-04's
  treatment of unknown event versions, and runs the events through the domain's
  own parser rather than a duplicate schema.

## Status

WP-03 delivered: the envelope, `seedRefs` derivation, fail-closed parsing, and
the real `verify:export` (T-14 skeleton) running against both adapters. WP-09
owns the full T-14: the export button in the evidence inspector and the round
trip driven from the UI.
