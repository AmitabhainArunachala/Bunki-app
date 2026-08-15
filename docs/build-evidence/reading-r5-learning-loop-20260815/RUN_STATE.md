# R5 bounded storage-integrity donor

- Base authority: `claude/app-vision-next-steps-wei73a@34c0176d1ffe3c502873b0bbbf1cba399389a8aa`
- Base tree: `9320a1c741812a7d38f7afd54263cb7d133c3fbf`
- Donor branch: `agent/reading-r5-learning-loop-20260815`
- Scope: Corridor learner-store safety guardrail only
- Deployment status: not deployed; trunk harvest required

## Closed in this donor

- A `localStorage.getItem` exception, empty-string record, malformed JSON, or
  future major version now quarantines the learner store read-only instead of
  treating unknown bytes as an empty record.
- `commitStorePatch` serializes and writes copied learner roots before making
  them visible in `S`; a thrown failure-atomic `setItem` leaves both the live
  roots and prior durable bytes unchanged.
- Reader finish, entry-sheet capture (including deep dictionary provenance),
  standard review grading, and focus-drill grading cross one write boundary
  before their visible/session state advances.
- Storage failure is rendered as a `role="alert"` in the current learner
  surface, including an open entry sheet.
- A rejected article-body load clears its in-flight promise and can be retried
  in the same session.

## Explicit boundary

This is not the canonical-state cutover. Corridor still owns a separate local
learner envelope and scheduler rather than `@bunki/domain` plus
`@bunki/persistence`. Nineteen other pre-existing `saveStore()` callers remain
mutation-before-write risks and are enumerated in
`residual-storage-callers.json`. Direct export/import learner-record paths also
remain outside the candidate helper. No claim is made for those paths.

The snapshot backend is assumed failure-atomic: `setItem` either returns after
replacement or throws without modifying the prior value. A nonconforming
commit-then-throw backend cannot be disambiguated by this synchronous API.

`corridor-standalone.html` was not regenerated: it was already stale against
its builder at the base cut, and regeneration would mix unrelated generated
artifact changes into this safety donor. The served `corridor.js` and focused
verifier are the bounded harvest units.

## Human/device gates

Rendered Chromium, WebKit, physical-iPhone, VoiceOver, storage-eviction, and
offline journeys are `NOT_RUN`; no browser binary or physical device lane was
available. The donor requires independent source/test review before harvest.

