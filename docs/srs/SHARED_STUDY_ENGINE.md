# Shared study consumer

Bunki hosts the canonical Nihongo Study UI and v4 engine only through
`?deck=n2|n1|senmon|kotoba-master|shared-grammar&sharedStudy=preview` (choose one
deck ID) or a real bound host. `decks/player/mount.js` routes those IDs before it
reads a legacy ledger in shared mode. Ordinary legacy decks, saved-word/kanji/
question review routes and the outer Bunki Record remain unchanged and
disconnected from this distribution, retaining their existing player, counts
and history until an explicit migration/cutover occurs.

The same-origin frame imports the byte-identical `mountStudyApp` and grammar
renderer from `vendor/shared-study-engine`. This adopts subsequent canonical UI
changes through distribution refresh, including the accepted study-loop slices.
It does not reimplement the study screen. The local static host permits embedding
only `decks/player/shared-frame.html`, and only from the same origin.
The frame selects its deck with the canonical `initialModule` option, using the
adapter's clock and platform capabilities. Today counts still cover all decks
and one shared learner-day allowance; selection no longer clicks a module button.

## Host contract

`createBunkiStudyAdapter` takes explicit `content`, `storage`, `identity`, optional
`transport`, clock and UUID sources. The canonical API constructs and replays
events, owns the replica store, admits reviews, selects queues, applies FSRS,
checks parents/content, and spends one learner-wide new-card budget.

The shell may bind `globalThis.bunkiSharedStudyHost` before opening a deck:

```js
{
  storage: {read(scope), compareAndSwap(scope, revision, candidate)},
  identity: {
    learner, environment, installation, epoch: 0,
    timezone: 'Asia/Tokyo', mode: 'open' // 'fresh' is explicit creation only
  },
  transport: {reserveNewPermits({store})},
  canRequestNewCards: () => pairedAndEnabled,
  isOnline: () => navigator.onLine !== false,
  presentation: 'phone', // Optional 'phone' or 'desktop'; no pairing/authority claim
  isPaired: () => authenticatedPairingExists,
  getSyncState: () => actualSyncState, // e.g. syncing, up-to-date, error
  getSyncError: () => actualSyncError,
  subscribeSyncState: listener => subscribeToActualSync(listener), // returns unsubscribe
  labelForInstallation: id => trustedDeviceLabels.get(id) ?? null,
  // Optional startup facts if the host synchronized before mounting study:
  startedOffline: offlineAtHostStartup,
  activitySince: canonicalPrefixBeforeStartupSync,
  readPreviousRegistry: async () => exactPreviouslyInstalledRegistry
}
```

Transport pulls reconcile canonical envelopes into that same store. The canonical
package exports its IndexedDB/memory adapters, sync transport and permit-request
helper. Bunki's browser storage wrapper supplies only its database namespace;
it implements no separate compare-and-swap or durability logic. Storage,
credentials, pairing and transport remain host responsibilities. A missing
store is an error; `open` never recreates it or adopts another installation.
Existing Bunki record sync is not a v4 study transport.
New-card requests require both a bound `transport.reserveNewPermits` and an
explicit `canRequestNewCards: true` or callback returning `true`. A callback
must reflect the host's actual current pairing/authority state; it is not inferred
from a backend method. The adapter checks authority and connectivity again at
request time and passes the same store to the transport. Today awaits that
request and then refreshes the canonical queue. A transport alone defaults to
disabled, and the initial-grant-only preview has no request callback. No host
credentials or production pairing are supplied by this integration.

Presentation callbacks report the bound host's actual state; they do not perform
sync or grant permits. Pairing defaults to false even when a reserve transport is
present. Without a trusted installation label the shared UI says another device.
Offline startup is captured when the adapter opens unless the host supplies its
earlier launch fact. The activity prefix defaults to the opened projection, so old
history is not announced as newly received. A host that synchronized before mount
can supply its pre-sync prefix. These ports feed the bundled canonical S5
presentation; the manifest identifies the exact reviewed source and UI bytes.

`presentation` selects canonical phone or desktop controls independently of
storage, pairing and permit authority. Bound hosts choose it explicitly; viewport
width never overrides their value or supplies a missing value. Omission retains
the canonical default. The isolated preview selects once when mounted using
`matchMedia('(max-width: 600px)')`, matching the shell's phone navigation layout.
Changing width requires reloading the preview to change this choice. Its storage
kind stays `bunki-shared`, pairing stays false, and no transport or grant is added.

An explicitly retried Bunki attempt retains the same frozen rating command and
delegates it to canonical `resumeCommand`. The first call uses `submitCommand`;
simultaneous calls share one pending Promise. Bunki does not cache a saved-but-
blocked result as final or re-create a review after a lost reply. Recovery keeps
the original immutable save proof and adds the canonical current `resolution`;
consumers must interpret that resolution rather than treating the old `kind` as
a fresh outcome. The canonical study UI owns its corresponding recovery flow.

Before connecting, Bunki calls canonical `refreshCorpus` with QA expansion
disabled. Additions require the host's exact previously installed registry
snapshot; the host must retain that source snapshot through a content update.
The canonical gate admits only its existing factory vocabulary delivery contract,
preserving the complete event ledger and existing task state. Missing snapshots,
changed frozen rows and other additions fail closed. The isolated preview has no
content-history adapter and remains fixed to its installed 8,508-task inventory;
it refuses future growth instead of deriving historical rows from learner state.

`shared-study-presentation.mjs` only resolves selected task keys to prepared
grammar objects. Grammar's canonical renderer validates object identity. This
adapter preserves selection order and delegates all commands and policy decisions
unchanged. Canonical learner-created cards retain their own content.

## Isolated local preview

Use `?deck=n2&sharedStudy=preview`.
This explicit preview route mounts the canonical UI, backend and store.
The preview uses `test-bunki-shared-preview`, its own IndexedDB database and
appearance keys, and a Web Lock around installation creation. It preserves one
installation across reloads and deck changes. Its explicit synthetic initial
grant is limited to twenty introductions on the creation learner day. It has
no real sync transport, live server or production permit authority;
further/day-rollover grants need an explicit test transport. The shell does not
claim this preview is paired.

In shared mode, mapped legacy pack writes are disabled. Old kotoba-mine/MCD,
context-dense, personal collections, saved-word/kanji/sentence/question reviews
and world/course hooks are fenced from grading. Their identities and histories
have not been converted. Leaving preview mode returns to the existing legacy
routes and history, including the mapped packs.

No learner migration is performed. No legacy grade is reinterpreted as a v4
event, and no missing permit, parent, mode or hesitation evidence is invented.
Older already-open application versions are not fenced by these new source
files. Real rollout therefore still requires an explicit migration/cutover and
old-client fencing plan.

The [release manifest](../../release.json) owns the candidate version and links
its delivery notes. A local preview does not establish deployment or a
physical-device pass.

## Bound development host and ordinary routes

`scripts/build-shared-study-qa.mjs` derives an explicitly isolated development
site from an already verified built Corridor artifact. It authenticates the
source artifact and actual route inputs, retains the original build identity,
and writes a separate `qa-host-receipt.json` describing the entry/module overlay.
It does not claim the derived site is an independently admitted production build.
Outputs must be fresh directories under `~/.dharma`, outside the checkout.

```sh
node scripts/build-shared-study-qa.mjs \
  --site /absolute/path/to/verified-built-site \
  --out /absolute/path/under/.dharma/fresh-shared-study-site \
  --run shared-study-dev
```

Its bootstrap binds `createSharedStudyTestHost` before the ordinary Corridor
entry initializes. The five ordinary routes `?deck=n2`, `n1`, `senmon`,
`kotoba-master` and `shared-grammar` then consume the canonical UI without the
`sharedStudy=preview` switch. The host uses a separate run-scoped IndexedDB
store and synthetic learner `test-shared-audio`. A Web Lock serializes profile
creation; an installation marker is persisted before store creation. A missing
or malformed reopened store blocks rather than silently recreating a learner.
The default local fixture grants only twenty initial introductions and supplies
no authenticated network authority. Production boot does not import this host.

The optional sync binding delegates request format, replay, retry and
reconciliation to the canonical transport. Bunki supplies connectivity,
visibility, holds, credential access and explicit pairing/permit callbacks.
It attaches to the same canonical store used by grading; it does not write a
second schedule. Synthetic protocol tests cover bidirectional reconciliation,
a lost acknowledgement retried with identical command bytes, concurrent offline
attempts, Undo, empty sync and reopen. These tests do not establish actual paired
Mac-to-Bunki synchronization or migration of existing learner history.

The optional `audio` capability passes unchanged to the canonical player.
Hosts supply admitted release resources; canonical code checks source identity,
content revision, bytes and face safety. Neither this host nor Bunki generates
speech or substitutes device speech for ElevenLabs/Kore recordings.

A bound host may instead provide `audioPackConfiguration` for the canonical
download manager: the admitted release, source authority, scope, selected pack
IDs, byte transport, authorization callback and optional current assignments
callback. `shared-study-audio-packs.mjs` keeps one canonical browser pack host
per parent replica store, verifies the BUILD and content-binding pins, and copies
frame arguments into the parent's realm before validation. The shared frame
receives its verified resource capability and optional Audio downloads controls;
it does not implement another admission policy or audio cache. Pack cleanup
finishes before the parent replica is closed. A configuration failure remains
visible in the optional disclosure while ordinary study stays available.

Downloaded bytes are separate from the review journal and partitioned by learner,
installation, epoch and release binding. Local verification establishes byte and
source integrity, not pronunciation quality or listening acceptance. This code
does not configure a production grant, create provider recordings, or establish
complete recorded coverage. Both the standalone app and these mapped Bunki
routes consume the same canonical implementation when its distribution is
refreshed and independently admitted below.

`shared-study-audio-preparation.mjs` starts the exported canonical accepted-source
observer once per parent store, after checking the exact BUILD and grammar
bindings. The same observer survives changes between mapped study frames.
Cross-frame arguments are copied into the parent's realm before canonical
validation. Creation failure and page disposal release subscriptions; failed
startup can be retried. Grading does not await the background scan.

Pending demand descriptors live in a separate canonical private IndexedDB store,
partitioned by the explicit learner and installation namespace. They never enter
the review journal. Current catalog references and accepted manual-card owners
are checked against current source before a production batch can be prepared.
Profiles, permissions and reading review remain explicit; a saved demand does
not mean that speech was generated, downloaded or listening-approved. The same
canonical resolver and offline production tools serve Nihongo and this host.
Unmapped legacy cards are not silently converted or counted as complete audio.

The bound adapter exposes `exportCurrentAudioSource(options)` for an explicit
local production handoff after preparation has started. It delegates to the
existing canonical host's `exportCurrentSource`, preserving ordered demand IDs,
revision-bound cursors and finite selection limits. Arguments and results are
copied into the parent realm; final disposal rejects a late result. The method
does not start another observer, download a file, enqueue jobs or submit speech.
The caller must keep the resulting selected source export private and use the
canonical offline consumer; a stored observation still needs fresh source
validation before provider execution or recording attachment.

`node --test tools/shared-study-canonical-host.test.mjs
 tools/shared-study-host-recovery.test.mjs tools/shared-study-sync-lifecycle.test.mjs`
checks the host and transport composition. For actual ordinary-route browser
qualification, set `BUNKI_QA_SITE`, `BUNKI_QA_EVIDENCE` and the independently
selected `BUNKI_QA_ENGINE_CLOSURE`, then run
`node scripts/verify-shared-study-host-browser.mjs`. The verifier uses a fresh
test profile, grades once through each of the five real routes and reopens the
same journal after a browser-process restart. It distinguishes first-boot shell
record initialization from forbidden legacy grade writes.

Outer Record, saved-word/kanji/question review, personal collections, context/MCD,
assessment and other unsupported routes retain their existing contracts. The
ordinary QA binding neither maps their identities by displayed text nor
performs a production cutover.

## Content and provenance

`data/shared-study-content.json` binds all 8,508 frozen task identities, including
7,930 vocabulary cards and 578 grammar tasks. N2 (2,079), N1 (3,586), senmon
(1,964) and kotoba-master (301) map by frozen card IDs. Source Japanese, English,
target, headword, reading and passage ruby are checked for exact equality.
Canonical usage notes, word classes, provenance, collocations and kanji details
are retained as presentation metadata. No headword matching allocates identity.

The canonical grammar preparer receives the exact full frozen registry,
grammar module and reviewed translations, with QA bypass disabled. The compact
engine registry produces a byte-identical initial projection to the full frozen
registry. The source hashes bind every adopted pack and grammar asset.

The existing shared frame loads the pinned offline JMdict/KANJIDIC2 dictionary
through `loadOfflineDictionary` and `prepareOfflineDictionary`, including
off-catalog lookup for entries present in that artifact. Character lookup uses
exact `resolveKanji`; ordinary dictionary lookup priority is unchanged. Related
vocabulary comes only from the loaded catalog, not arbitrary dictionary entries.
Native dictionary, card factory, live sync and device rollout remain separate
host work.

## Optional kanji exploration and canonical Record

The committed distribution is identified by the
[independent consumer pin](../../scripts/shared-study-pin.json). After Reveal,
open **Kanji and related words** (漢字と、つながる言葉) and select a character to
inspect its available facts, attributed sound family, visual comparisons and
clearly labeled invented memory cues. The panel follows the canonical UI's
Japanese, English or bilingual language selection. Authored enrichment is limited
to the [selected families and contrasts](../../prototypes/corridor/vendor/shared-study-engine/client/kanji/families.mjs),
not comprehensive kanji coverage; unavailable character facts remain explicit.
Complete readings, definitions, sentences, collocations, furigana and dictionary
actions remain available. Exploration is optional and does not grade a character
or create another review task: prompt → Reveal → Again / Hard / Good / Easy
remains the study loop.

In the canonical **Record**, expand **What your record shows**
(学習記録から分かること) for the optional read-only report. It reads the existing
canonical projection. Exposure and vocabulary self-ratings are not separate proof
of kanji or handwriting
mastery. Delayed first outcomes, missing checks and coverage remain distinct;
later success does not replace a first outcome, and a missing check is neither
a demonstrated failure nor success. The 20 → 30 → 40 ladder is a proposed
experiment and never raises workload automatically. The report does not
establish total study time, backlog trend or an unfamiliar-word baseline needed
to recommend an increase.

Eight of nine behavior-critical modules, the reducer and its replay dependencies
remain byte-identical to the previous distribution. The canonical replica backend
now uses the existing effective learner-day calculation for queues, custom
sessions and permit selection, including a pending timezone change that becomes
effective while the app is idle. Sibling filtering uses review timestamps within
that same interval, matching the unchanged reducer admission rules. Boundary,
permit, Undo and next-day regression checks cover this correction; no stored
history, task identity, event schema or scheduler formula changes. The canonical
report remains separate from the outer Bunki Record, with no history migration.

The canonical phone Extra-practice Finish action wraps its full bilingual label
within the study column while retaining a touch target of at least 44px. It does
not shrink fonts, clip text or write study state. The existing practice-answer
resume behavior is unchanged. At outer widths up to 360px, the ordinary main
element directly hosting shared study uses 8px horizontal gutters, giving the
frame 304px at a 320px viewport and preserving the canonical 300px minimum.
Ordinary legacy routes retain their 18px gutters.

## Regeneration and checks

From the canonical source repository, export a committed version with
`node tools/export_engine.mjs --include-ui --output <external-directory>`.
Copy that complete verified distribution into Bunki's
`prototypes/corridor/vendor/shared-study-engine`; never edit generated files.
The manifest pins source commit, reducer, closure, file sizes and SHA-256 hashes.
`scripts/shared-study-pin.json` independently pins the reviewed source commit,
closure, verifier bytes and content-binding hash. The trusted Bunki gate hashes
the verifier before importing it, so a substituted successful no-op cannot run.
The build invokes the distributed canonical
verifier using this source-owned expected closure and requires a committed bundle.
Update this pin only after reviewing a regenerated distribution/content binding;
never trust a replacement bundle's self-declared hash as its own authority.

Generate content with
`node scripts/sync-shared-study-content.mjs --source <reviewed-content-directory>`.
`--check` verifies reproducibility against the same reviewed inputs.

Run `node scripts/verify-shared-study.mjs`,
`./node_modules/.bin/vitest run tools/shared-study.test.mjs tools/shared-study-backlog.test.mjs tools/shared-study-dictionary.test.mjs tools/shared-study-fixtures.test.mjs`, and
`npm run release:verify`. The web builder runs the distribution/content hash gate
and refuses local builds below 8 GiB free space. `npm test` also runs the pinned
distribution/content verifier before Vitest. A compact reviewed source excerpt
exercises the same content generator in CI without depending on an external path.
This six-entry excerpt is an input fixture for the pure builder test, not a full
`--source` directory for the synchronization CLI. Run it with
`./node_modules/.bin/vitest run tools/shared-study.test.mjs -t 'rebuilds a compact reviewed source excerpt'`.
Full 8,508-task reproduction still requires the reviewed source directory above.
The stamped service worker verifies shared modules and content on first bound
use. Shared fonts load lazily through its verified cache/reuse path; ordinary
installation does not require the shared corpus or fonts. After an online bound
visit, the cached study route reopens offline.

`npm run verify:shared-study:browser` requires `KAIRO_SITE_DIR` and
`KAIRO_EVIDENCE_DIR`; it never builds or installs dependencies. `npm test` runs
the same browser guard once in the existing CI Vitest lane, which supplies the
immutable artifact and installed browser. Missing CI inputs fail.
The gate mapper supplies the per-gate evidence directory; `gateForShard` adds
the artifact path and hashes without replacing it. The Vitest shard requests
Chromium in the first-attempt and retry matrices. The Node CI regression in
[`scripts/ci/battery.test.mjs`](../../scripts/ci/battery.test.mjs) executes that
composed npm child and checks the actual browser preflight, including missing-input
and tampered-artifact failures, without launching a browser. The package-script
regression in [`tools/shared-study.test.mjs`](../../tools/shared-study.test.mjs)
also executes npm with command spies to require invocation order and failure
propagation for both package scripts; echo-only and comment-only browser
invocations must fail those checks.
Local `npm test` explicitly skips the browser guard only when no site is supplied.
The existing site resolver verifies all stamped bytes before browser launch;
`KAIRO_ARTIFACT_SHA256` can pin a previously built artifact while source is edited.
It uses a fresh headless browser profile, no screenshots or
native apps, and verifies the actual route, grammar renderer, durable history,
shared allowance, unsupported-contract fence and absence of legacy writes.
Normal-mode checks include the ignored shared-only grammar URL, subsequent deck
opening, durable legacy grading, list counts, words begun and missed terms.
Runtime evidence belongs under `~/.dharma/` (or CI `RUNNER_TEMP`), outside this checkout.
