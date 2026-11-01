# Shared study consumer

Bunki's N2, N1, senmon and kotoba-master deck doors, plus `?deck=shared-grammar`,
host the canonical Nihongo Study UI and v4 engine only in explicit shared mode
(`?sharedStudy=preview` or a bound host). `decks/player/mount.js` routes those IDs
before it reads a legacy ledger in that mode. Ordinary routes retain their
existing player, counts and history until an explicit migration/cutover occurs.

The same-origin frame imports the byte-identical `mountStudyApp` and grammar
renderer from `vendor/shared-study-engine`. This adopts subsequent canonical UI
changes through distribution refresh, including the accepted study-loop slices.
It does not reimplement the study screen. The local static host permits embedding
only `decks/player/shared-frame.html`, and only from the same origin.

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
The ordinary Bunki deck route mounts the real canonical UI, backend and store.
The preview uses `test-bunki-shared-preview`, its own IndexedDB database and
appearance keys, and a Web Lock around installation creation. It preserves one
installation across reloads and deck changes. Its explicit synthetic initial
grant is limited to twenty introductions on the creation learner day. It has
no live server or production permit authority; further/day-rollover grants need
an explicit test transport. The shell does not claim this preview is paired.

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

The canonical UI's off-card dictionary port is not yet bound to Bunki's dictionary
host. Full packaged card details, target lookup and related catalog cards work;
arbitrary off-catalog token dictionary lookup is unavailable in this preview.
No duplicate large dictionary is packaged. Native dictionary, card factory,
live sync and device rollout are separate host work.

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
`./node_modules/.bin/vitest run tools/shared-study.test.mjs`, and
`npm run release:verify`. The web builder runs the distribution/content hash gate
and refuses local builds below 8 GiB free space. `npm test` also runs the pinned
distribution/content verifier before Vitest. A compact reviewed source excerpt
exercises the same content generator in CI without depending on an external path.
The stamped service worker verifies shared modules and content on first bound
use. Shared fonts load lazily through its verified cache/reuse path; ordinary
installation does not require the shared corpus or fonts. After an online bound
visit, the cached study route reopens offline.

`scripts/verify-shared-study-browser.mjs` takes `KAIRO_SITE_DIR` and
`KAIRO_EVIDENCE_DIR`. It uses a fresh headless browser profile, no screenshots or
native apps, and verifies the actual route, grammar renderer, durable history,
shared allowance, unsupported-contract fence and absence of legacy writes.
Runtime evidence belongs under `~/.dharma/`, outside this checkout.
