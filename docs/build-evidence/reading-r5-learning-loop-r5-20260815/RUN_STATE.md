# R5-r5 bounded storage-integrity donor

- Authority at cut: `ac880aff052991b230dfdd9b7f39267ae764a05f`
- Authority tree: `8a2636c7a47c1e3ba43c333921b818bed38c405a`
- Branch: `agent/reading-r5-learning-loop-r5-20260815`
- Scope: Corridor learner-store safety guardrail only
- Publication/deployment: local independent-review candidate; not pushed or deployed

## Closed in this donor

- The reviewed r4 capability was replayed onto a fresh branch at the exact
  current authority. Its host-chrome guard and sticky grade-row CSS are
  preserved before this donor's narrow reserved-name repair.
- Reserved JSON member names (`__proto__`, `constructor`, and `prototype`)
  round-trip as own list-name and unknown-extra data without invoking the
  legacy prototype setter or changing `Object.prototype`.
- Every candidate is serialized and validated in its exact persisted form
  before `setItem`; a writer can no longer create bytes the next load rejects.
- A `localStorage.getItem` exception, empty-string record, malformed JSON,
  future major version, invalid version type/value, invalid known root, or
  invalid nested value quarantines the learner store read-only. Validation of
  every present known learner root completes before any learner root hydrates;
  rejected bytes are never overwritten.
- `commitStorePatch` hands one complete candidate envelope to `setItem` while
  live learner roots are still old. The storage `try` block covers only
  `setItem`; after it returns, live candidate publication cannot be suppressed
  by an alert or layout exception.
- Reader finish, entry-sheet capture including deep-word provenance, standard
  review grading, and focus-drill grading each cross exactly one candidate
  write before learner or review-session state advances.
- One stable body-level `role="alert"` reports storage failure on Drift, tray,
  reader/review, and open-sheet states. It survives `#app` rebuilds, sits above
  every numeric app layer, is never made inert, and does not intercept pointer
  input.
- Whenever the error state changes, safe alert synchronization dynamically
  adds or removes `store-alert` in an open sheet's `aria-describedby` without a
  render and without discarding other description tokens. Alert/layout failure
  is isolated from store durability and live publication.
- A successful retry clears the same alert node without reconstructing it.
- A rejected network request or non-OK article response clears `_loading`, so
  the article can retry in the same session.
- The live authority's sticky zen grade-row rule is byte-preserved. The alert is
  top-positioned below visible fixed chrome rather than bottom-anchored over the
  four grading seals.

## Executed evidence

The focused verifier reports 22 named checks. It executes read exceptions,
empty/malformed/future records, a complete valid envelope, and a rejection
matrix spanning every known learner root plus nested and version-shape canaries.
Each rejected record stays read-only, preserves prior bytes, performs no write,
and publishes no learner root.

Reserved-name round trips and invalid-candidate rejection execute alongside
that matrix. The matrix includes typed capture provenance and context, every
persisted FSRS card field including `learning_steps` and bounded scheduler
state, exact grade-versus-undo review rows, and the four exact observation-row
families.

It also executes write failure and retry, candidate write-before-publication,
an alert/layout exception immediately after a successful `setItem`, all four
bounded transaction actions on failure and success, article rejection/non-OK
retry, stable fake-DOM alert behavior, dynamic sheet description lifecycle,
exact numeric CSS layering, byte preservation of the authority grade-row, and
the schema-v2 residual/direct-bypass inventory.

Repository validation passed: 94 Vitest files / 1,645 tests, six workspace
typechecks, workspace ESLint, workspace Prettier, JavaScript syntax, and an
explicit-base diff check. Exact commands and source blob IDs are in
`checks.json`.

## Explicit boundary

This is not the canonical-state cutover required by the reading controller.
Corridor still owns a separate local learner envelope and scheduler rather than
`@bunki/domain` plus `@bunki/persistence`.

Nineteen pre-existing `saveStore()` callers still mutate learner and/or session
state around an unconsumed save result. The schema-v2 ledger records exact line
numbers, learner roots, session roots, conditional branches, and two direct
`STORE_KEY` export/import bypasses. In particular, review undo includes the
conditional `obslog` mutation, while yomi probe correctly claims no `stats`
mutation.

The storage backend is assumed failure-atomic: `setItem` either returns after
replacement or throws without changing the previous bytes. A backend that
commits and then throws cannot be disambiguated through this synchronous API.

`corridor-standalone.html` was not regenerated. It was already stale at the
authority cut, and generated-artifact churn is outside this bounded donor.

## Human/device gates

Rendered Chromium, WebKit, physical iPhone, VoiceOver, storage eviction,
offline transitions, high contrast, and 200% text remain `NOT_RUN`. The fake
DOM and CSS checks do not count as rendered-browser evidence. Independent
source review is required before publication or harvest.
