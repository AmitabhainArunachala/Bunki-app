# Personal paragraph collections in Bunki

The Corridor now has **集中道場 → 私の文脈**. The direct route is
`?deck=personal`. Import a supported collection JSON through the device file
picker, then study, read, search, or follow its connections inside Bunki.
The public build contains the player and synthetic test fixtures. It contains
no learner collection, personal passages, or conversation history.

## Japanese-first answer guides

The October 4 depth update adds a locked front and a layered Japanese answer.
Before reveal there are no furigana, token actions or answer explanations.
After reveal, an imported answer guide supplies contextual furigana throughout
the paragraph, Japanese definitions and grammar explanations, usage, contrasts
and related expressions. English is available through an explicit reveal.
Phones show the answer immediately; wide screens pair it with the paragraph.

Tap a revealed word, kanji or grammar expression to open Bunki's actual shared
dictionary. **保存 / Save** saves it in one tap, and the confirmation offers
**元に戻す / Undo**. The optional **リストに追加… / Add to list…** opens a small
list popover, including named-list creation. Close the sheet to return to the
same card. Capturing an item creates no scheduled review and changes no personal
assessment history.

Import the enriched collection JSON again to add these guides to an existing
collection. The original paragraph hashes, card IDs, settings and review
history remain unchanged. Complete backups now include the answer guide.
Older collections still open; the player does not invent Japanese definitions
or furigana when the guide is absent.

See [implementation and remaining work](../srs/PERSONAL_DEPTH_IMPLEMENTATION_2026-10-04.md)
and the [research synthesis](../srs/research/PERSONAL_CARD_DEPTH_2026-10-04.md).

## iPhone and Mac

Install the app first, then import inside that installed app:

- iPhone: open Bunki in Safari, choose Share → Add to Home Screen, and enable
  Open as Web App when offered. Open the new icon, enter the focus dojo, and
  choose 私の文脈 → Choose a JSON file.
- Mac with macOS Sonoma 14 or later: open Bunki in Safari and use File → Add to
  Dock. Open that app and import the JSON from Downloads or iCloud Drive.
- Existing Bunki installs: reopen online to receive the updated app shell. A
  normal reload may be needed after the service worker installs.

Safari tabs and installed web apps can have separate storage. Import where
you intend to study. This is the existing installable Corridor web app;
signed native iPhone or macOS packaging is not claimed.

Apple's installation guidance:

- <https://support.apple.com/guide/iphone/iphea86e5236/ios>
- <https://support.apple.com/en-us/104996>

## Cards and evidence

Every lesson retains its complete Japanese paragraph, translation, definition,
whole-word readings, grammar explanation, original-composition label, source
links, conversation provenance when supplied, and cross-theme connections.
Meaning, reading, grammar, and application are four separate assessment
identities. The default is six new cards per Japan study day, with meaning and
grammar enabled; reading and application are optional. Reading a passage,
searching, and revealing an answer add no review evidence.

The scheduler is the existing vendored ts-fsrs 5.4.1 / FSRS-6 implementation:
retention 0.90, pinned 21 weights, fuzz off, learning 1m/10m, relearning 10m.
The personal edition's original card IDs, scheduler pin, and progress format
remain compatible with its standalone player. Related tasks rest until the
next Japan study day, while the same card can return at its learning-step due
time. Six Again grades pause a card until explicit resume.

Private assessment evidence is not silently converted into the existing word
queue's mastery or the other decks' histories. Those are different contracts.

## Storage and moving devices

IndexedDB `bunki-personal-collections-v1` stores the imported collection and
its append-only evidence ledger together. Learner memory states are derived by
replay, not persisted as a second authority. A read/write transaction commits
before the UI advances. A revision comparison in that same transaction rejects
stale concurrent windows. Failed writes leave the answer and stored history
unchanged. Undo appends a correction; history is never truncated.

Settings → **Export collection & progress** produces one
`bunki-personal-backup` version 1 JSON file. **Share backup** offers the device
share sheet when supported, with download as the fallback. Transfer the file
using Files, iCloud Drive, or AirDrop, then import it on the other device.
Fresh-device restores bring the saved study settings; existing-device imports
retain local settings and only extend compatible history. An older file cannot
remove newer reviews. Divergent histories are rejected, preserving both files.

Use one active study device until transferring its latest backup. Automatic
cloud synchronization and Anki schedule synchronization are not implemented.
Browser storage can be cleared by the user or operating system; keep backups.
The Collections screen can export the untouched stored record for recovery
even when that record cannot be opened for study.

## Import boundary

The initial supported content format is `john-personal-japanese` version 1;
this is a compatibility identifier, not embedded learner data. Each paragraph
and the assessment collection have SHA-256 integrity checks. These detect
altered bytes, not factual correctness or authorship. IDs, references,
assessment versions, required paragraph fields, accepted readings, and source
URLs are validated before storage. Input is limited to 30 MB. Only HTTPS
source links are accepted; all imported text is escaped before rendering.
No imported HTML, JavaScript, remote assets, or code is executed.

A content-only import preserves existing progress. Answer guides are separate,
revisioned `bunki-personal-enrichment` records bound to the original hashes.
Their reading segments must reconstruct the original text exactly and cover
all kanji. Identical guides reimport safely; conflicting or older revisions
cannot overwrite newer guides. A changed content digest
cannot silently replace the edition attached to existing evidence. Explicit
content migration and conflict resolution remain future work.

The full private route boots without the shared corpus. The service worker
precaches its entire module graph and FSRS vendor dependency. A cold offline
navigation can reopen already imported material and save reviews.

## Verification

```bash
node prototypes/corridor/tools/test-personal-collections.mjs
node prototypes/corridor/tools/verify-personal-collections.mjs
node prototypes/corridor/tools/verify-corridor-storage-integrity.mjs
```

The new browser suite uses synthetic public content and real IndexedDB. It
covers 320/390/1440 px layouts, failed saves, reload, sibling burial, append-only
undo, invalid restore, independent windows racing, a full backup transfer,
the ten existing palettes, and cold offline navigation followed by grading.
It runs Chromium and WebKit in the dedicated **Personal collections** workflow.
Screenshots contain only synthetic test material. This does not substitute
for a physical iPhone acceptance run or prove native installation behavior.

Chromium uses Playwright's offline flag. WebKit passed the UI and persistence
scenarios but failed navigation with that flag, matching the upstream
[service-worker offline-emulation issue](https://github.com/microsoft/playwright/issues/42775).
The WebKit cache-fallback gate therefore stops the origin server, verifies
that a fresh context without a worker cannot load, and requires an uncached
navigation to be served by the worker before grading offline. Server
unavailability and an emulated network outage are distinct conditions; a
passing server-stop check does not certify physical iPhone airplane mode.
