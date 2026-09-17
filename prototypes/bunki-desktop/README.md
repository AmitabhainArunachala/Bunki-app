# Bunki desktop (Mac)

This Electron host packages the canonical Corridor site as a portable Mac app.
The local QA build includes articles, dictionaries, fonts, and available recorded
audio. It opens at desktop size and can be resized to 390 pixels wide for the
existing phone layout. Sync, live provider services, Developer ID signing,
notarization, updates, and iPhone delivery require separate release work.

## Development

Run `npm ci` in the repository root and in this directory, then `npm start`
here. The launcher compiles the canonical Corridor site and stages its desktop
runtime outside the checkout before opening it. Development
uses port 5199 and `~/.dharma/bunki-desktop/development-profile`; ordinary
packaged upgrades retain their original profile and port 5198.
`KAIRO_SITE_DIR` can select an existing verified canonical artifact. Restart
the command after source edits: the prepared snapshot is immutable, so
`BUNKI_LIVE=1` is rejected by the launcher. Use the launcher so both the site
and generated native client are present. Direct source execution bypasses host
staging; the raw-site refusal remains an intentional verification case. The
host never injects code into HTML.

Electron 44 downloads its platform binary lazily. To prepare an offline build
machine after `npm ci`, run its normal local installer:

```sh
node node_modules/electron/install.js
```

## Build a portable QA candidate

From the repository root, choose fresh absolute paths outside the checkout:

```sh
node scripts/build-corridor-site.mjs --out "$HOME/.dharma/bunki-desktop/candidate-001/site"
node prototypes/bunki-desktop/tools/build.cjs \
  --site "$HOME/.dharma/bunki-desktop/candidate-001/site" \
  --out "$HOME/.dharma/bunki-desktop/candidate-001/build"
```

The command verifies the canonical site against the checkout, packages it at
`Contents/Resources/site/corridor`, verifies it again, installs the launcher
shim, and applies an ad-hoc signature for local QA. It never publishes or
replaces existing output. Output must be under `~/.dharma/`, or `RUNNER_TEMP`
in CI. `build-receipt.json` reports the exact app path, site identity, revision,
dirty state, and result; `build.log` holds packaging/signature output.
Failed builds remain available for diagnosis.
Development and packaging use `tools/host-stage.cjs` to prepare the same closed
host. It bundles the shared TypeScript native RPC client into one CommonJS file
using captured source, explicit compiler configuration, workspace exports and
locked dependency paths. Native compiler source aliases are refused. Source and
output identity checks detect changed bytes and directory rebinding. The
packager receives only this declared desktop runtime and minimal package metadata. Unrelated monorepo npm dependencies cannot enter the
app archive; the completed archive is still checked against the exact file list.

For an offline machine with this package's pinned Electron archive already cached,
append `--cached-electron` to the build command. This selects only the version,
Mac platform and architecture named by the pinned local `electron` dependency,
and verifies the archive against that dependency's `checksums.json`. The build
receipt records the selected archive and checksum-file digests; packaging checks
that those bytes remain unchanged and verifies the resulting Mac architecture.
It accepts no arbitrary executable and never trusts an unpacked directory merely
because it reports the expected version. Without the flag, normal Electron
builder download verification is unchanged.
The offline option also converts the canonical PNG icon with macOS `sips` and
`iconutil`, keeping the generated ICNS and its source/output hashes in the build
output instead of downloading an icon conversion tool.

The launcher strips `ELECTRON_RUN_AS_NODE`: some Electron-hosted terminals
inherit it, which otherwise makes the application boot as plain Node and exit.
The shim and ad-hoc signature are local QA mechanics, not Developer ID signing
or notarization.

## Verify without touching the installed app

```sh
KAIRO_EVIDENCE_DIR="$HOME/.dharma/bunki-desktop/candidate-001/unit" \
  node --test prototypes/bunki-desktop/test/*.test.cjs
node prototypes/bunki-desktop/tools/verify-desktop.cjs \
  --app "$HOME/.dharma/bunki-desktop/candidate-001/build/package/mac-arm64/Bunki.app" \
  --evidence "$HOME/.dharma/bunki-desktop/candidate-001/journey"
```

Use the build receipt's app path on Intel Macs. The journey needs macOS and the
repository's installed `playwright-core`; it launches the candidate's own
Electron binary. It refuses app/evidence paths outside the QA roots, uses an
isolated profile and port other than 5198, blocks remote requests before first
load, simulates publisher opening, and uses generated fake microphone audio.
Checks cover offline reading, mouse capture, AAC playback/seeking/stopping,
recording playback, restart and relocation retention, navigation, window size,
native reload, and occupied-port failure. This verifier opens, reloads, resizes,
and closes visible test windows; do not run it during an operator's visual review.
Node unit checks run without opening the app. Receipts and screenshots stay in
the evidence directory. Inspect saved screenshots separately for appearance;
quick journey captures do not establish transition quality or careful visual
acceptance. Real microphone hardware and macOS consent remain a manual release
check.

## Runtime boundaries

`lib/native-session-owner.cjs` creates a dormant owner for each actual Electron
window. Its `beginDocument()` ticket must precede asynchronous native bootstrap;
`attach(ticket, descriptor)` accepts only that current document and an already
authorized, exclusively owned native child/lease. `revoke()` and `close()` remove
local authority synchronously. Actual navigation, renderer loss, window close,
quit and native lease loss invalidate the strict RPC client and byte port.
Old callbacks can dispose only their captured child, including bounded process
termination; they cannot close a replacement session.

The build also compiles and packages `kairo-cloud-sync-host` from
`packages/apple-sync`. Its native bootstrap checks actual signing entitlements,
the iCloud account, explicit native confirmation, and a device-local Keychain
pairing before granting a channel. `lib/native-cloud-sync.cjs` admits its bounded
control-pipe response; `lib/record-sync-ipc.cjs` owns the document's coordinator
and exposes only fixed sync and local-store operations through preload.
Disconnect or document loss closes the captured helper. If a submitted local
write has an unknown result, reconnect remains blocked until a replacement
document reopens the record.

An authorized signed build needs its fixed `native/cloud-sync-config.json`
resource. `tools/build.cjs --cloud-sync-config /absolute/config.json` validates
and copies the exact version-1 `containerIdentifier`, `keychainService`, and
`profileLabel` configuration. This option does not provide signing, entitlements,
an iCloud account, or native confirmation. Default ad-hoc QA has no configured
grant and reports sync unavailable. The implemented journal carries personal
notes and terminal practice operations; cards and the complete learner record
are not synchronized, and received practice history is not displayed yet.
Signed account pairing and a live Mac/iPhone CloudKit round trip remain unverified.

Normal desktop backup exports use a native Save dialog. A successful atomic file
write is required before recording the export time; cancellation or document
replacement cannot report a saved backup. Trusted input expires on a replacement
navigation or renderer loss. The Sync menu can export a profile candidate only
from the current native connection; importing that candidate still requires
native account verification and confirmation on the other device.

`lib/native-rpc-byte-port.cjs` serializes at most two copied frames, bounds byte
chunks, and closes on EOF, process/pipe failure or owner loss. It retries no
uncertain write. Stream delivery alone does not establish remote acknowledgement
or committed local records. Twenty byte-port cases, 21 actual Electron owner
cases and separate real Swift fixture journeys exercise these boundaries with
synthetic authorization; SQLite integration evidence uses the ci-substitute.

After staging a host, run the complete owner verifier from the repository root:

```sh
node prototypes/bunki-desktop/tools/verify-native-session-owner.mjs \
  --repository /absolute/repository \
  --host /absolute/build/host-source \
  --evidence "$HOME/.dharma/bunki-desktop/fresh-owner-check"
```

The verifier loads the exact selected runtime, hashes its inputs and retains the
complete case receipt in fresh external output. Packaging, source admission,
production authorization, signing and physical-device synchronization remain
separate checks.

Ordinary packaged upgrades keep the original Bunki profile identity and
`http://localhost:5198` origin. Packaged mode always loads its verified resources
and ignores development source, port, and live-reload overrides. An occupied
port produces a clear startup failure; it never attaches to another server or
switches origins. QA requires `BUNKI_TEST_MODE=1`, `BUNKI_TEST_PROFILE`,
`BUNKI_TEST_EVIDENCE`, and `BUNKI_TEST_PORT`; the verifier supplies these safely.
Never run tests against an installed operator profile.

The loopback server accepts only GET/HEAD with the expected Host, rejects
traversal and symlinks, and gives missing resources real 404 responses. It sends
binary bytes and single byte ranges, including suffix/oversize cases. HEAD
ignores Range as required by HTTP. The sandboxed, isolated renderer has no Node
or webviews. Navigation stays on the exact app origin. All child windows are
denied; deliberate safe HTTP(S) publisher links go to the system browser.
Unsafe schemes, credentials, local publisher targets, and nonstandard ports
are rejected. Microphone permission is limited to recent, trusted, top-frame,
audio-only actions; other permissions are denied.

References: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security),
[session permissions](https://www.electronjs.org/docs/latest/api/session), and
[HTTP Range semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-range).
