# FSRS optimizer contract — 2026-08-12

## Baseline contradiction

The work order calls the 書き出す file an “exported envelope.” At trunk
`ca07a8e`, `renderPortRow()` downloads the raw versioned corridor local-store
object, not the domain-event envelope from `packages/export`:

```json
{ "v": 1, "taken": [], "srs": {}, "revlog": [], "obslog": [] }
```

`tools/fsrs-optimize.mjs` therefore accepts exactly that real `v: 1` shape and
fails closed on other versions or malformed review rows.

There is also a scheduler-policy mismatch inside this same baseline. The domain
pin and `packages/domain/src/reducers/memory-state.ts` define and apply
`append-order-monotonic-clamp-v1`, retaining the raw event time while supplying
FSRS with a nondecreasing per-card scheduler instant. The canonical
`prototypes/corridor/corridor.js` instead passes raw `now` directly to
`scheduler.repeat(card, now)` and computes the revlog interval against that raw
instant. A backward device clock can therefore make the canonical prototype
fail before `srsLogReview()` appends a grade. That file is explicitly forbidden
in Mission 3, so this branch does not wire the missing wrapper. The optimizer
faithfully reconstructs the pinned policy when a valid row exists; making the
canonical prototype honor its claimed pin remains an open trunk-keeper gate.

## Review reconstruction

A grade row is:

```text
[t, key, g, stBefore, elapsedDays, r, sBefore, dBefore, sAfter, dAfter, ivlDays, dueAfter]
```

A revocation row is `[t, key, 0, revokedIndex]`. The target must be a prior,
still-active grade for the same card and the latest active grade for that card.
The optimizer removes the target, retains the revocation as audit evidence, and
then groups remaining grades by `key` in append order. A re-grade after undo is
therefore evaluated from the restored history, not from the revoked state.
Revocation timestamps remain raw audit evidence and do not advance the FSRS
scheduler anchor; in particular, a backward wall-clock reading on an undo is
valid and does not make its target invalid.

`S.srs` existed before `S.revlog`, so the first retained row for a pre-existing
card can legitimately have non-null `elapsedDays`, `sBefore`, and `dBefore`.
That row is **left-censored**, not corrupt. FSRS is Markov in its memory state,
so the optimizer conditions on the logged `(S, D)` boundary, includes that
first observed long-term rating in loss and calibration, applies the candidate
recurrence to the boundary, and continues with later rows. It does not invent
an unobserved first rating or history. The missing prior timestamp is inferred
from the row's three-decimal wall-clock interval solely to recover the vendored
scheduler's integer UTC-calendar `elapsedDays`; this has the same roughly
43-second precision as the source row and is disclosed as left-censored in the
report counts.

The revlog's fractional `elapsedDays` remains in every reconstructed item as
`elapsedRecordedDays`, and its original timestamp remains as both `time` and
`rawTime`. The optimizer separately records `effectiveTime`, following the
trunk reducer's `append-order-monotonic-clamp-v1` policy per card: the first
active grade establishes the scheduler anchor, and every later active grade
uses `max(rawTime, previousEffectiveTime)`. Revoked grades are removed before
that history is reconstructed, so a re-grade continues from the restored
active anchor. The raw evidence is never sorted or rewritten.

For the FSRS transition, the optimizer derives integer `elapsedDays` from the
two effective scheduler timestamps' UTC calendar dates, exactly as vendored
`ts-fsrs@5.4.1` does. A backward-clock grade clamps to the prior anchor and is
therefore a `t=0` short-term step, just like an active review on the same UTC
date. It updates stability through weights 17–19 but is excluded from the
long-term recall loss and calibration. This mirrors the FSRS benchmark policy:
same-day reviews inform later memory state but are not long-term evaluation
targets. The report discloses the number of active grades affected as
`input.clockClampedReviews`.

## Fit and metrics

The implementation is a standalone Node program with no runtime dependencies.
It uses the FSRS-6 equations and parameter bounds in Bunki’s vendored
`ts-fsrs@5.4.1`, including the optimizable decay weight `w[20]`, the `0.1`
initial-stability floor, its rounded decay factor, and its eight-decimal
rounding at every retrievability, difficulty, and stability recurrence.

All 21 weights are fitted with deterministic full-batch Adam. The gradient is a
central finite difference of the complete recurrent FSRS loss, so each update
includes the downstream effect of every parameter through every review in each
card history. The objective is binary cross-entropy (`Again = forgotten`,
`Hard/Good/Easy = recalled`) plus the parameter-scale L2 regularizer used by the
reference `fsrs-rs` trainer. There is no random shuffle, wall clock, or ambient
state, so identical bytes and options produce identical output.

The L2 term is `gamma × Σ((w - w_default) / parameter_stddev)²`. The reference
trainer multiplies each mini-batch penalty by `batch_size / total_size`; for
this program's one full batch that multiplier is exactly one. The penalty is
therefore not divided by the number of reviews.

The dry-run report contains log loss and ten-bin calibration before and after,
including weighted RMSE across populated bins. These are training-set metrics,
not an independent prospective validation claim.

Primary implementation references:

- FSRS-6 model and forgetting-curve formulas:
  <https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/model.rs>
- Reference binary cross-entropy, Adam training, parameter-scale regularizer:
  <https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/training.rs>
- FSRS review item semantics:
  <https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/dataset.rs>
- Same-day benchmark policy:
  <https://github.com/open-spaced-repetition/srs-benchmark>

## Minimum data guard

The CLI requires **400 usable long-term recall outcomes**. The FSRS tutorial
documents 400 as Anki 24.04’s whole-optimizer threshold; current Anki can use
less data by choosing which parameters to optimize. This standalone tool always
fits the full 21-weight vector, so it deliberately keeps the conservative 400
gate instead of pretending to implement adaptive partial fitting.

References:

- <https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md>
- <https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md#fsrs>

Below the gate, the command exits `2`, reports `INSUFFICIENT_REVIEWS`, and emits
no candidate weights.

## Invocation and output safety

```sh
node tools/fsrs-optimize.mjs kairo-export.json
node tools/fsrs-optimize.mjs kairo-export.json \
  --candidate-out candidate-fsrs-pin.json \
  --report-out fsrs-dry-run.json
```

Standard output is the complete dry-run JSON, including a candidate pin with:

```json
{ "parameterSetId": "bunki-fsrs6-r090-personal-v1" }
```

The tool never updates the source export or Bunki’s current pin. Explicit output
paths use create-new and no-follow semantics. Before opening, the tool walks to
the nearest existing ancestor, resolves symlinks, and rejects both the lexical
and canonical path anywhere under a directory named `data`. After opening but
before writing bytes, it resolves the opened file descriptor (with a portable
path fallback), verifies that the path still names the same device/inode, and
rechecks the canonical `data` boundary. Applying a candidate is a separate
trunk-keeper decision requiring scheduler replay tests.
