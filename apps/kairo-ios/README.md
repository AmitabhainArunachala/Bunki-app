# KAIRO iPhone host

This is a UIKit iOS 17+ target for the canonical `prototypes/corridor` app. It
embeds an explicitly pinned production site, including offline articles and
audio. It does not use the parked Expo interface or a development server.

The target and its shared native core are implemented. **No iOS SDK compilation,
simulator run, signed archive, physical iPhone run, or live CloudKit exchange has
passed in the current environment.** This Mac has Command Line Tools and a macOS
SDK, but no Xcode/iPhone SDK or signing configuration. The macOS checks below are
evidence for shared code only.

## Build on the configured Xcode runner

Use Xcode 16+ with the iOS 17+ SDK and Node 22+. From the repository root, supply
an existing canonical site and its reviewed artifact hash. Outputs must be a new
directory under `~/.dharma`, or under `RUNNER_TEMP` when `CI` is set.

```sh
node scripts/build-ios-host.mjs \
  --site "$KAIRO_SITE_DIR" \
  --artifact-sha256 "$KAIRO_ARTIFACT_SHA256" \
  --out "$KAIRO_BUILD_OUTPUT" \
  --build-simulator \
  --bundle-id "$KAIRO_BUNDLE_IDENTIFIER"
```

Use `--prepare` instead of `--build-simulator` to verify inputs and write the
exact `xcodebuild` argument array without compiling. Preparation does not require
a bundle identifier; an actual build does. The shared scheme is `Kairo` in
`Kairo.xcodeproj`. This script builds only; it does not launch a simulator or
application, sign a device build, upload, or deploy anything.

The Xcode build phase verifies the original site, verifies the pinned manifest,
copies into an external derived `.app` bundle, then verifies every copied file.
A mismatch fails the build. Assets and build products must never be added to this
source directory. An app bundle missing its exact manifest or a requested file
whose bytes differ from it fails closed at runtime.

For device signing, configure the actual bundle identifier, Apple development
team, provisioning profile, and entitlements on the supplied runner. Retain the
script's `KAIRO_SITE_DIR`, `KAIRO_ARTIFACT_SHA256`, `KAIRO_MANIFEST_SHA256`, and
`KAIRO_NODE_BINARY` build settings, and keep DerivedData/archive products outside
the checkout. No team, container, or signing identity is supplied by this project.

Native iCloud notes also require `KAIRO_CLOUDKIT_CONTAINER` to name the real
container, and the running signed app must have matching CloudKit container and
service entitlements, its real team identifier, and the intended Development or
Production container environment. Configure these with Xcode's iCloud capability
or the runner's reviewed entitlement file. Setting the Info.plist value alone
does not authorize sync. `NativeCloudEntitlements` checks the signed process before
the bootstrap can contact an account or storage.

App Store delivery still needs the product's final app icon, privacy manifest and
privacy disclosures, a signed archive, and device acceptance. The native code
uses app-local UserDefaults and system uptime to expire user gestures; include
their approved required-reason declarations in that review. None of these release
steps is represented by the preparation receipt.

## Persistent installation identity

`http://localhost:43187` is part of the record's persistent identity. Preserve
that exact scheme, host, and port, the installed bundle identifier, and
`WKWebsiteDataStore.default()` across upgrades. Changing to `file:`, a custom URL
scheme, `127.0.0.1`, another port, or a different data store would create another
storage origin and requires an explicit data migration.

The listener binds only IPv4 loopback (`127.0.0.1:43187`). WebKit loads
`localhost:43187`. A collision fails; the app never selects another port or loads
another local server. The listener serves verified, read-only bundle assets. It
has no route to learner storage, files outside the catalog, or a generic network
proxy. Requests have bounded headers/connections/timeouts, exact Host/Origin
checks, GET/HEAD only, path and symlink checks, and byte-range audio responses.

LocalStorage and IndexedDB remain WebKit's persistent store. The app does not
erase it on launch, account changes, or upgrades. WebKit persistence remains
subject to OS storage policy; `navigator.storage.persist()` is advisory. The
canonical JSON backup remains the portable copy of the wider local record.

## Native boundaries and first start

The initial native choice starts a new local record or imports a profile
candidate from the other device. For a shared Mac/iPhone learner, export the
paired profile from the Mac's native menu and choose that file **before** starting
the new iPhone record. Sharing an iCloud login alone does not select the same
logical learner. The native confirmation shows the candidate's exact account and
learner IDs and the verified iCloud account fingerprint. Candidate bytes do not
grant authority. Occupied WebKit storage refuses initial profile replacement.

The imported scope seeds only the logical account and learner; the renderer
creates fresh device/incarnation/session/database identities. Its existing local
binding must match exactly and is never overwritten. Backgrounding revokes the
actual initial-pair bootstrap; a stale dismissed confirmation restores the start
choice without loading or provisioning a record.

`kairoSync` exposes only initial scope, registration, status, connect, sync,
disconnect, and unregister. Connect requires a recent trusted input and native
confirmation. The native coordinator captures the authenticated connection and
performs one bounded foreground push, exact outbox acknowledgement, pull, and
atomic receive through the canonical JS RecordController. Swift validates scope,
canonical envelope hashes, references, revisions, and receipts; it never merges
notes. There is no automatic uncertain-commit retry or background sync.

Navigation, backgrounding, account loss, and disconnect synchronously revoke the
captured native authority. Document/registration/action checks surround every WK
roundtrip. A submitted store mutation that loses ownership requires reopening;
that uncertainty survives reconnect and same-document registration replacement.
Only a committed replacement document can own a new mutation fence. A failed
provisional navigation cannot clear it.

The export bridge accepts bounded JSON/Markdown/text exports only. A native Files
save returns `true` only after the picker confirms a destination in the same
document; cancel returns `false`, and cannot update the canonical backup time.
The existing HTML import control uses WebKit's file picker and the renderer's
existing validation and merge path. Blob Markdown downloads use WKDownload.

`kairoIntake` separately exposes availability, choose, extract and open-original.
Its native source choice offers Files, Photos and, for a new source on an available
camera, Camera. Files accepts PDF, PNG, JPEG,
HEIC/HEIF and single-frame TIFF; without the optional shared-file consumer, a
saved PDF goes directly to Files. Photos uses
the system's single-image picker and requests the current representation, without
requesting access to the whole library or retaining photo-library identifiers.
Only explicitly offered PNG, JPEG, HEIC/HEIF or single-frame TIFF representations
are admitted, and their actual file bytes must agree with the offered type. There
is no UIImage conversion, generic URL bridge or automatic image upload.

A native
coordinated read holds security-scoped access only while copying at most 20 MiB
of a regular file. The shared Vision/PDFKit extractor runs off the UI thread;
the canonical renderer reviews/corrects each page before explicit capture.
Machine observations, corrected text and original file/page references remain
separate. The bridge carries no native paths or persistent bookmarks.

Photos' temporary file is read inside its provider callback, before the system
can remove it. The fingerprint identifies those selected representation bytes;
it does not assert that Photos supplied an unedited original asset. The request
expires after 60 seconds if an iCloud-only photo cannot load. Provider failures
return a fixed error without private provider details. Cancellation or owner loss
fences a late result; an already running bounded read finishes before the intake
job is released. A new selection can explicitly retry. Returning to an image
offers Files or Photos again and requires the exact saved bytes. If the library
asset was edited or provides a different representation, the mismatch is shown
instead of silently replacing the source.

Camera capture requests camera permission only after the explicit native choice,
checks permission/foreground/document ownership again before presenting the system
camera, and limits it to still images. Denied/restricted access is explained in
the source chooser; it does not open Settings or request microphone access.
Permission replies, camera dismissal, encoding and Files export all retain the
original intake lease. Any resignation of active ownership revokes that lease,
including an OS permission prompt if it causes this lifecycle transition. In that
case the now-permitted camera requires a fresh deliberate intake action; an old
permission reply never resumes capture automatically.

The selected camera bitmap is encoded off the UI thread as one JPEG with its
correct EXIF orientation. Pixel dimensions are checked first, and the encoded-byte
consumer stops at 20 MiB. This bounds retained output; UIKit and ImageIO's internal
image allocation is outside this claim. Only the bitmap, explicit orientation and
quality enter the new representation; camera metadata, GPS and asset identifiers
are not copied. It is an app-encoded capture, not a claimed raw camera original.

Before this new source can enter OCR/review, the learner saves that exact image
through the native Files picker. The saved file is reread and must match its
fingerprint. Cancelling capture or export returns cancelled without an intake
selection. Temporary export copies are removed; the app never deletes the user's
saved destination. A late export may have saved a file even if ownership was lost;
its old reply cannot mint a selection, and the learner can explicitly choose the
saved file again. A saved source's re-selection/return offers Files/Photos and,
when its native consumer is supplied, Shared Files,
never a newly taken photo as a substitute for its original bytes. The wider
canonical learner record is still written only by the existing renderer path.

Selected bytes expire after ten minutes and belong to one document. Navigation
or loss of foreground ownership revokes selection and stale results. One job
remains exclusive until its in-process work finishes; cancellation does not
claim to interrupt a synchronous Vision call. Opening an original requires a
fresh matching-byte selection and previews an app-local, read-only copy with
Quick Look editing and embedded-link opening disabled. Dismissal or revocation
removes that copy. Relevant page numbers remain manual navigation hints.

This iOS adapter is implemented in source but has **not been UIKit-typechecked
or exercised on an iPhone** in the current environment. Compiled macOS checks
cover shared request/selection/read/preview-copy and synthetic NSItemProvider
image loading and bounded camera encoding contracts only. The Photos/camera
choosers themselves still require iOS SDK compilation and physical-device
verification, including permission grant/denial, first-use retry, capture/export
cancellation, iCloud-only and offline images, original re-selection, dismissal
and backgrounding. Shared synthetic bitmap/JPEG checks do not establish camera
hardware or native export behavior. An iPhone share extension is still outstanding.

Microphone access requires a current main-frame request, a trusted user gesture,
the native microphone permission, and unchanged foreground/document ownership
when permission returns. WebKit camera requests remain refused. Bundled audio uses ordinary
WebKit playback and local byte ranges. Public publisher links open in the user's
browser without the KAIRO bridge. External pages cannot navigate this app-bound
WebKit view.

## Capability limits

The shared native package includes a container-injected `NativeSharedFileIntake`
consumer, compiled and checked through the macOS CLI. `CorridorViewController`
and `WKIntakeOwner` accept the same optional, already-constructed native consumer.
Their explicit Shared Files chooser is implemented in UIKit source, but **has not
been UIKit-typechecked or exercised on an iPhone**. Ordinary AppDelegate launch
still supplies no consumer; no App Group resolver or share-extension target is
wired into the app. Nil injection retains the existing Files/Photos/Camera
controls and the direct saved-PDF Files route.

When native composition supplies the consumer, a deliberate intake action can
choose Shared Files. A saved PDF offers Files or Shared Files; a saved image
offers Files, Photos or Shared Files. Camera remains limited to a new source.
The native chooser displays at most 20 entries with bounded name, offered type
and size, and requires one explicit choice or Cancel. It lists only after the
Shared Files action, with no startup scan, automatic refresh or preselection.
An empty or unavailable holding area does not trigger recovery or cleanup.

Listing and selected-byte inspection run in the existing exclusive background
job. The same consumer lists and reads the opaque choice. Document/foreground
ownership is checked after listing, native dismissal and byte inspection, then
again before the existing selection or original-preview boundary. The owned
chooser clears its continuation before resuming; cancellation, backgrounding,
navigation and late callbacks cannot complete a replacement controller. The
session stays busy until any running bounded read/inspection settles.

Native application code must supply the existing container and construct the
consumer before injecting it; neither controller accepts a renderer-provided
container URL, discovers an App Group, or creates a fallback folder. The consumer lists
bounded display choices and reads one explicitly chosen publication; it does not
discover an App Group, use a fallback folder, infer a learner, or offer a record
Save, Keep retry, removal, or consumption operation. Opening the underlying core
can create its private namespace and permanent lock file. Payloads and unfinished
writes are never automatically deleted by the consumer.

Each choice belongs to one adapter and retains its private exact publication
receipt. Selection rereads the stored bytes and compares that receipt, including
its random publication incarnation. A removed ID expires; a new publication under
the same ID refuses the old choice even when bytes, metadata and wall time match.
The actual image/PDF inspector must then confirm SHA256, byte count, MIME and
kind against the selected representation. Names and offered types alone cannot
admit content. Legacy storage headers without publication identity fail closed
and remain on disk; no migration or replacement is performed during read.

Listing and inspection belong in the existing exclusive background intake job.
The caller must check the current document/foreground lease and expected original
again before issuing a token. A returned immutable file is a selected snapshot,
not permission to add a learner record. Cancellation fences a returned result;
it does not promise to interrupt a synchronous OS read or content inspection.
The learner still follows the normal extraction, review/correction and explicit
renderer capture action. There is no canonical capture-commit acknowledgement in
the native intake bridge, so selection, extraction, preview or an uncertain reply
must never consume a held shared file or be treated as a completed Save.

The host checks use public `NSItemProvider`/Keep APIs and real task-owned disk
files. They cover valid and malformed/mislabeled content, exact publication
reinspection, removed-ID replay, adapter ownership, retained pending/corrupt
files, cancellation, stale document leases, and expected-original matching. The
incarnation-only fixture normalizes the replacement's stored timestamp after
public Keep so every other old receipt field is equal; this is explicit fixture
construction, not a production clock hook. Actual core process/crash checks are
separate from these host checks. The 31 shared CLI groups are regressions for
the data path; they do not execute the UIKit chooser or prove dismissal timing.
The two UIKit files can be parsed here, which establishes syntax only. Full
sharing still requires the authorized iOS SDK/App Group/signing route, actual
consumer injection, native extension Keep UI, chooser execution and device
acceptance. No file selection or uncertain renderer reply authorizes a producer
Keep retry, removal, consumption or learner Save.

The iOS host currently has **no `kairoFeeds` native service**. Live feed refresh,
publisher extraction, and custom feed networking are unavailable; bundled
reading and audio remain available. No arbitrary-URL fetch bridge is exposed.

The current canonical record sync maps **notes only**. Study progress, recordings,
and the wider JSON record are not claimed to synchronize through CloudKit.
Profile transfer is explicit file import; there is no remote profile catalogue,
occupied-installation profile switcher, or iPhone profile-export menu yet.

## Focused checks and evidence

These CLI modes do not construct NSApplication, activate an app, or open WebKit:

```sh
swift build --package-path apps/kairo-ios \
  --scratch-path "$KAIRO_CHECK_OUTPUT/swift-build" --product kairo-host-probe
"$KAIRO_CHECK_OUTPUT/swift-build/debug/kairo-host-probe" \
  --checks "$KAIRO_CHECK_OUTPUT/host-checks.json"
"$KAIRO_CHECK_OUTPUT/swift-build/debug/kairo-host-probe" \
  --sync-checks "$KAIRO_CHECK_OUTPUT/sync-checks.json"
KAIRO_EVIDENCE_DIR="$KAIRO_CHECK_OUTPUT" \
  "$KAIRO_CHECK_OUTPUT/swift-build/debug/kairo-host-probe" \
  --intake-checks "$KAIRO_CHECK_OUTPUT/intake-checks.json"
node --test apps/kairo-ios/Tests/HostBridge.test.mjs
```

Set `KAIRO_CHECK_OUTPUT` under `~/.dharma` or the CI runtime root first. The current
macOS run passed 11 shared HTTP/storage-policy boundary groups and 19 coordinator
fixture groups. The latter use an internal fixture transport, never a fabricated
production authenticated connection. They cover ordering, revocation, uncertain
mutations, malformed/numeric/contradictory replies, exact receive references,
checkpoint conflicts, and the permanent document uncertainty fence.

The iOS UIKit files have been parsed, and the project/plist syntax and JS
lint/format checks pass. Parsing is not UIKit type checking. `swift test` is
unavailable here because this CLT installation has no XCTest module; run the
package tests on the configured Xcode runner.

Earlier, separately launched macOS WebKit probes checked the production local
origin, secure context, real IndexedDB/localStorage persistence across processes,
canonical profile preservation, manifest loading, and a real bundled audio range.
The final reopen receipt retained those results but recorded `canonicalApp:false`
because its UI check ran before rendering; the wait was corrected afterward but
has not been rerun. Further UI launches were paused at the user's request.
The actual WK record-sync bridge, native iOS picker/capture interaction, install
upgrade, and live two-device CloudKit path remain unrun.

Current local receipts (outside the repository):

- `~/.dharma/bunki/ios-host/prepared-r13/ios-host-build.json`: 23,334 files,
  artifact `3e6651cf85b11d197d64291edcb07337821930bf2218d3e1a6d6cb7b6e16ddff`,
  manifest `480b242b254a42223610dbe7d0b9e113079eff0fe652e685651ec1f8ae8b9c5b`;
  source dirty, preparation only.
- `~/.dharma/bunki/ios-host/shared-host-checks-r2.json`: 11/11 CLI checks.
- `~/.dharma/bunki/ios-host/native-sync-checks-r2.json`: 19/19 CLI checks.
- `~/.dharma/bunki/ios-host/wk-seed-r12.json` and `wk-reopen-r12.json`:
  macOS WebKit evidence for the earlier R12 artifact, with the limitation above.
- `~/.dharma/bunki_audit/2026-09-10/resume-next/ios-sync-independent-r2/result.json`:
  independent fixture reproducer verifies strict reply and receive-reference fixes.

## Apple/WebKit basis

- [NWParameters.requiredLocalEndpoint](https://developer.apple.com/documentation/network/nwparameters/requiredlocalendpoint): exact local endpoint binding.
- [Default WebKit data store](<https://developer.apple.com/documentation/webkit/wkwebsitedatastore/default()>): persistent disk data across sessions.
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/): quotas, eviction, and persistence requests.
- [App-bound domains](https://webkit.org/blog/10882/app-bound-domains/): restricted navigation and native WebKit APIs.
- [Local networking ATS exception](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking): local traffic without a global arbitrary-load exception.
- [MediaRecorder in WebKit](https://webkit.org/blog/11353/mediarecorder-api/): capture and recording in a native embedding app.
- [Native export picker](<https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller/init(forexporting:ascopy:)>): user-selected file export.
- [Native document reads](https://developer.apple.com/documentation/uikit/providing-access-to-directories): security-scoped access and file coordination.
- [Photos selection and privacy](https://developer.apple.com/documentation/PhotoKit/delivering-an-enhanced-privacy-experience-in-your-photos-app): selected assets without library-wide authorization.
- [Current Photos representation](https://developer.apple.com/documentation/photosui/phpickerconfiguration-swift.struct/assetrepresentationmode/current): avoid transcoding where possible; exact selected bytes still define the source version.
- [Item-provider file lifetime](https://developer.apple.com/documentation/foundation/nsitemprovider/loadfilerepresentation%28fortypeidentifier%3Acompletionhandler%3A%29): read before the callback returns and the temporary file is removed.
- [Camera authorization](https://developer.apple.com/documentation/avfoundation/avcapturedevice/requestaccess%28for%3Acompletionhandler%3A%29): explicit camera permission and main-actor UI handling.
- [System camera picker](https://developer.apple.com/documentation/uikit/uiimagepickercontroller): supported source/media types and still-image capture.
- [Image I/O encoding](https://developer.apple.com/documentation/imageio/kcgimagedestinationlossycompressionquality): explicit encoding quality and orientation for the new captured representation.
- [Quick Look editing mode](<https://developer.apple.com/documentation/quicklook/qlpreviewcontrollerdelegate/previewcontroller(_:editingmodefor:)>): explicitly disabled editing of the temporary preview copy.
- [Required reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api): distribution privacy declarations still required.
