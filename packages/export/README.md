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

## Boundary rules

- **`npm run verify:export` is the proof, not the intent.** It replays an export
  through the domain reducer and asserts derived-state equality with the live
  store (T-14). A passing export that does not replay is a failure.
- **Provenance and license metadata survive the round trip** (T-15). Dropping a
  provenance field during export is a license-integrity defect, not a cosmetic one.
- **No transformation on the way out.** Export serialises the event log; it does
  not summarise, filter, or "clean" it. Derived state is re-derived on replay,
  never exported as authority.
- **Version every payload.** Unknown export versions fail closed, consistent with
  REQ-DM-04's treatment of unknown event versions.

## Status

WP-01 skeleton only.
