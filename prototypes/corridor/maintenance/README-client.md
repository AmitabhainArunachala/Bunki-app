# Portable report client

Load `report-client.css` and `report-client.js`, then mount once. The script also works concatenated into an existing browser bundle. Repeated mounts update callbacks and return the same instance; the root is appended outside the learning app's render tree.

```js
const reports = window.BunkiReports.mount({
  serviceUrl: 'http://127.0.0.1:57032', // explicit deployment configuration
  getContext: () => ({
    surface: 'guided-session/explanation',
    route: '/',
    build: { git_sha: null, artifact_sha256: null },
    content_ids: ['kairo-original-jlpt-n2-short-01:q03'],
    content_revision: 'optional known revision',
    locale: 'en',
    action_trace: [{ action: 'explanation_open', target: 'q03' }],
  }),
  onOpen: () => stopDecorativePlayback(),
  clockNotice: () => timedSittingActive() ? 'The test clock continues while this report is open.' : '',
  protectAnswers: () => timedSittingActive(),
});
```

The returned instance exposes `ready`, `openReport()`, `openReports()`, `close()`, `retry()`, and async `unmount()`. Opening dispatches `bunki:reports-open` as well as calling `onOpen`. The caller should stop decorative playback there without mutating answers, navigation, or clocks. `protectAnswers` hides server AI text and proposals while a protected sitting is active; technical reports and follow-ups remain usable. It does not pause the test clock.

Only caller-supplied fields listed above are selected. Viewport dimensions are captured directly. Eight semantic action entries at most are retained, with only `action`, optional `target`, and optional `at`. Viewport, content revision, and actions are serialized into an `action_trace` evidence record to remain compatible with the v1 context schema. No DOM, storage, keystrokes, clipboard, or conversation is inspected. Unknown builds remain null offline. When the page and configured service share an origin, reporting lazily reads `/api/config` and fills the current document’s unknown build with that exact identity before submission. Cross-origin service identities never replace page provenance, and recovered drafts from a prior document retain an unknown build rather than receiving a potentially newer one. Context is captured when opening a new draft and shown before submission.

The native modal dialog provides background inertness. Closing with Escape or either return control restores the originating focus, text selection, and window scroll when its source still exists. The application owns its route and pending answers; the report client never writes them. The global utility rail survives `#app` rerenders. A narrow host observer keeps the report entry inside an active native host dialog while it is open, making the control reachable despite native modal inertness. The report sheet then opens above that dialog, and the root returns to the body when the host dialog closes.

## Delivery and persistence

Fresh mounts make no network requests. Opening reports or finding a pending local outbox enables service access. HTTPS and loopback HTTP services are supported. There is no implicit endpoint fallback.

The isolated IndexedDB database `bunki-maintenance-reports-v1` stores reports, selected screenshot blobs, drafts, and guest session credentials. The report and all selected attachments are committed in a single transaction before any report delivery. Bounded text is truncated by Unicode codepoint, preserving emoji and supplementary characters at field limits. A first service session binds the actor; the canonical request and its SHA-256 are then frozen in storage. Retry bodies and idempotency keys remain identical. Receipt identity and payload digest must match before “Received” appears. Modern browsers use Web Locks to serialize guest-session creation and delivery across tabs. Automatic retry occurs on reconnect, on startup with pending records, and every 30 seconds while pending. Manual “Refresh & retry” is also available.

The backend issues the guest bearer token; the frontend never accepts or exposes an operator credential. Tokens and outboxes are scoped to the configured service URL. An expired token is retained and reported, rather than silently replacing the guest identity. Clearing browser data loses this guest access; cross-device identity recovery is not implemented. Changing the service URL requires a reload and does not migrate the prior service's records.

Screenshots are explicitly selected, previewable, and removable. Supported types are PNG/JPEG/WebP, bounded to four files, 2 MB each, 6 MB combined (or service limits). Decoding validates the preview and rejects dimensions above 16,000 pixels or 40 megapixels. There is no automatic capture. Storage or network failures retain the in-memory draft and show the error; unavailable durable storage is never presented as a saved report.

Follow-ups and reopen requests are saved with stable request keys before sending. After a timeout, retry the same text/action to recover its receipt; a different text is blocked while the earlier submission awaits confirmation. The UI only shows AI conversation/proposals returned by the service. There is no local simulated assistant. Each returned proposal can be exported as a standalone JSON file, preserving its `execution_authority: "none"`. A proposal never edits or deploys the application.

## Browser verification

```sh
node --check prototypes/corridor/maintenance/report-client.js
node prototypes/corridor/maintenance/verify-report-client.mjs
```

The browser test uses a disposable Chromium context and explicitly synthetic service responses. It covers network-idle/idempotent mount, context allowlisting, lazy same-origin build capture and offline/cross-origin provenance boundaries, attachment preview/removal, 320px width, keyboard/focus/scroll restoration, offline transactional save and reload, timeout after server persistence, identical retry bodies (including an emoji at the 4,000-codepoint boundary), model-output honesty, inert untrusted text, proposal export, follow-up/reopen, protected answers, and host rerenders. It does not claim live model or end-to-end backend verification. Evidence is written outside the repository under `~/.dharma/bunki_experience/2026-09-23/experience-evolution/report-client-proof/`, overridable with `BUNKI_REPORT_PROOF_DIR`.
