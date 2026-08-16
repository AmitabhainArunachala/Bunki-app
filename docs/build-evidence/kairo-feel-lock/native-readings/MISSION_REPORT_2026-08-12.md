# Mission 1 — re-land 30 native readings

Branch: `codex/native-readings-20260812`

Pinned base and merge-base:
`ca07a8e5b1dc6d45ff70ad0feec3c7333285eff9`.

## Remote publication transport exception

The complete local commit includes the current-builder standalone, but this
environment has no local Git credential. The authenticated GitHub connector's
Git-blob and Contents endpoints both reject the generated 43,281,738-byte file
with HTTP 422 and explicitly require a local-clone push. The remote branch is
therefore published as a harvestable data/build commit with the pinned base's
standalone still present. After harvesting, run the unchanged current
`build-standalone.mjs`; the expected generated file has Git blob
`564e80638026515a388afa3fb96c83bbfcc071af` and SHA-256
`cae8751b697dca6dd29705a45b2696c9da6c379b6a1d8813decd30171576a834`.
This is a push-transport limitation, not a successful completion of the
remote standalone gate, and must remain open until that regeneration is
committed by a credentialed clone.

## Contradictions and integration boundaries

The current trunk article builders do not have one path that regenerates all
70 records. At the pinned base, `build_articles.py` produces 26 records and
the WP9b wrapper produces 40. Per the work order, this mission registers the
new catalog in the current builder but does not port the old consolidation
patch. The static verifier records the measured `26/40/70` boundary and the
trunk keeper owns any later builder consolidation.

The unchanged current runtime keeps bilingual shelf titles in the hard-coded
`TITLES_EN` object in `corridor.js`; it does not read an English title from
article data. That file is forbidden in this mission. The 30 rows therefore
render their native Japanese title but fail the existing corridor verifier's
all-rows-have-English-title assertion. `README.md` gives the exact 30-pair
interface contract for the trunk keeper without introducing another runtime
title schema.

At verification time, `git ls-remote` resolved the remote integration ref to
`5a406350c4e5e8e138157fc72876c220e8d90254`, beyond the ordered base. This
branch intentionally remains rooted at the work-order SHA; the trunk keeper
must harvest it onto the then-current integration tip.

## Changed scope

Modified:

- `prototypes/corridor/data/articles/index.json`
- `prototypes/corridor/data/coverage.json`
- `prototypes/corridor/data/manifest.json`
- `prototypes/corridor/data/share_alike/words.json`
- `prototypes/corridor/tools/build_articles.py`

Added:

- 30 native body files under `prototypes/corridor/data/articles/`
- authored source JSONL and the untouched editorial sidecar under
  `docs/content/`
- `verify-native-readings.py` and `verify-native-readings.mjs`
- this mission's receipts, screenshots, README, and report under
  `docs/build-evidence/kairo-feel-lock/native-readings/`

Removed: none.

The complete local commit also modifies
`prototypes/corridor/corridor-standalone.html`; the remote branch does not,
for the transport exception above.

No diff exists in `corridor.js`, `corridor.css`, `verify-corridor.mjs`,
`prototypes/drift/`, or `pages-app.yml`. The optional example-bank donation
build was not run, so the existing bank remains byte-identical.

## Byte-level deltas from ca07a8e

- The first 40 index objects and all 40 corresponding body bytes are exact.
- The corrected five Wikinews rights rows and bodies, the three historical
  article rows and their `bunki-v11-historical` source registration, and the
  SNOW/Tanaka registrations remain exact.
- Archive: 694 bodies plus its light index are exact.
- Example bank: all 40 committed files and 45,276 sentences are untouched.
- Dictionary words: all 7,910 prior keyed records retain order and value;
  exactly 497 records append, for 8,407 total.
- The 30 source records, editorial sidecar, and bodies are byte-identical to
  the archival native-readings tree. The sidecar stays at 0/30 human approval.
- Locally generated standalone size: 43,281,738 bytes; it contains the
  70-entry shelf and excludes archive and example-bank payloads under the
  current builder's generic policy. The remote branch still carries ca07's
  generated standalone until the recorded regeneration is committed.

## Verification transcript

Authoritative configured runs:

- native static/rebuild verifier: 26/26 enforceable checks passed; measured
  current builders as 26 and 40, and rebuilt standalone byte-identically
- native browser verifier, Chromium 141 at 390×844 touch emulation: 34/34,
  all 30 article journeys, zero request/console/page errors
- Pages rights Python copied verbatim: 70 shelf rows and 694 archive rows pass
- unit battery: 94 files, 1,645/1,645 tests pass
- accessibility: 22/22 pass
- Drift fast final run: 45/45, zero violations and page errors
- storage integrity: 9/9 pass
- Prettier: all matched files pass

The protected 116-check corridor suite is not green and is not represented as
such. It reports the expected English-title interface failure for the 30 new
IDs, also reports its existing long-gloss interaction assertion, and later
times out at the protected particle-sheet wait at line 1290. The suite and
runtime were not changed. These are observed console transcripts, not a new
committed corridor receipt. Two configured Drift attempts showed gesture
timing violations before the final 45/45 run: one ended 43/45 when `触る`
satellite tap/recentre missed, and one ended 40/41 when the `～館` chain hop
misfired. These observed attempts are retained here rather than hidden.

## Open gates

- Human Japanese editorial review: 0/30; public publication remains blocked.
- Full source-transcript similarity review for V1–V4 remains pending; V5 was
  unavailable and was not watched.
- Physical iPhone/Safari cache-busted walk remains pending. Chromium touch
  emulation is not a substitute.
- Trunk keeper must wire the 30 English titles through the one existing
  `TITLES_EN` mechanism and rerun the protected corridor suite.
- Trunk keeper must regenerate and commit `corridor-standalone.html` from a
  credentialed clone; its expected blob and SHA-256 are recorded above.
- A post-harvest clean-checkout rebuild on the integration commit remains the
  trunk keeper's final proof; this mission's isolated rebuild starts from the
  pinned worktree with an empty output/cache location.
