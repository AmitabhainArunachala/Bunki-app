# One integrated phone release — 2026-10-12

John requested the latest changes integrated into one working phone app on
2026-10-12. The canonical installation remains
https://amitabhainarunachala.github.io/Bunki-app/.

## Candidate ancestry

- Product: PR #128, `ab0cc9c4cf27fd0daf9e1b98aaad40aeac81472a`.
  Git ancestry confirms that the heads of #122 (player and tokenizer fixes),
  #124 (N2/N1 decks), and #126 (redesign) are included.
- CI: PR #123, `edf5b4dc2b7491ae739b03dbf65e1b672404164e`, reconciled
  against the current product and its additional checks.
- #127 is a comparison prototype. It is not an alternative production app.

The product includes 358 N2, 666 N1, and 1,597 specialist words/cards; the
Kotoba sentence and cloze decks retain their separate assessment identities.
This consolidation changes release tooling and verifiers. Runtime, card IDs,
FSRS parameters, storage keys, and learner records are unchanged from #128.

## Release repairs

The previous hosted battery completed 132 of 135 gates successfully. The three
remaining failures were later-encounter asset-response counting, a moving
Drift fixture, and the guided rematch's briefly visible guard phase.

- Asset verification requires every expected asset and validates every hash,
  including repeated responses; it does not require exactly one network event.
- Drift setup records the real native pointer target. Only an observed touch
  of the wrong moving body permits bounded restaging. Correctly delivered
  interactions remain subject to the original assertions.
- Guided rematch observation starts before the action, retains class-transition
  order, and requires guard before resolve even when remote polling is delayed.
- Shards leave evidence-directory creation to the owning verifier, preserving
  the canonical runner's fresh-evidence contract.
- Later-encounter checks wait for Back to finish its reading-position commit
  and restore the caller before comparing the whole record or closing the app.
  The exact comparison remains required; no learner root is excluded.

The consolidated pipeline retains all 135 canonical gates and 19 supplemental
gates. The newer tokenizer, language tour, redesign navigation/docking, and
N2/N1 browser checks are included. The packaged-asset smoke check also covers
the three new decks and their token sidecars. Publishing remains contingent
on complete admitted CI evidence for the same source tree and artifact.

## Installation and verification boundary

Do not clear website data or remove the existing installation to update it.
Use the existing origin. A service-worker generation change must retain the
learner record and card identities. Export a backup from the existing app
before any optional manual migration.

This document records the candidate and its release contract, not a claim of
deployment. The live `build-identity.json` and successful Pages run establish
the published identity. Physical-iPhone performance and native installation
are distinct from hosted Chromium/WebKit verification.
