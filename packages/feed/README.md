# Personal-device feeds

`@bunki/feed` is the shared source catalog, RSS1/RDF, RSS2 and Atom metadata parser, request policy, and native response validator. The canonical app builder compiles these same sources into `modules/feed-core.mjs`; neither the Mac host nor the static app maintains a second parser implementation.

The registry has **41 channels from 37 distinct publishers/institutions**. Twenty-one channels from seventeen publishers have a reviewed direct personal-device metadata route. Twenty publisher-window rows preserve useful official links while their app interface, current endpoint or usage basis remains unresolved. These configuration counts are separate from successful live fetches, publication freshness and full-reader coverage, which is **zero** for these publisher feeds. The expansion toward thirty publishers is a provisional build milestone, not a production release criterion. See [the source review](SOURCES.md) for the new routes, topic coverage and remaining reuse questions.

Every source records its official interface, review evidence, publication cadence, and separate decisions for metadata display/retention/sync, article text, AI transformation, audio, images and shared-server ingestion. An available RSS endpoint does not promote any other operation to allowed. The adapter is for direct individual use; it is not a central feed republisher.

Public contracts:

- `SOURCE_REGISTRY`, `getFeedSource(id)`, `sourceCoverage()` expose the catalog. Coverage distinguishes `cataloguedChannels` (also the original `cataloguedSources` name), `independentPublishers`, `activePersonalFeeds`, `activePersonalPublishers`, `publisherWindowChannels` and `publisherWindowPublishers`. Here “active” means a configured personal route, not a successful live check. A source can remain configured while one request is forbidden, rate-limited, unavailable or stale.
- `parseFeedXml(xml, { sourceId, finalUrl, fetchedAt })` accepts only a registered feed URL and bounded XML. It rejects DTD/entities, excessive size/depth/nodes/items and ambiguous feed structures. Descriptions, HTML bodies, images and enclosures do not leave the parser. Titles remain inert text and must be rendered with `textContent`.
- `parseFeedEntry(raw)` verifies strict metadata shape, source/publisher membership, canonical URL and computed entry/revision identity.
- `parseFeedRefreshResult(raw, expectedSourceId?)` verifies native result shape, entry identities, source consistency, bounds, status and timestamp/freshness coherence. `FEED_REFRESH_STATUSES` and `FEED_FRESHNESS_VALUES` enumerate the public vocabulary.
- `planFeedRequest`, `applyFeedResult`, `parseFeedRequestState` implement minimum cadence, conditional requests, HTTP cache policy and isolated 403/404/429 failures. Freshness comes from publication time; a successful HTTP check alone cannot make old news current.
- `toFeedReference(entry)` and `parseFeedReference(raw)` provide a separate strict identity/link-only record for continuity. They do not copy titles, excerpts or bodies. Validate untrusted entries with `parseFeedEntry` before deriving references.

Article identity is the hash of publisher ID plus canonical URL; fragments are removed, while query parameters remain. A revision hashes identity, title, dates and sorted categories. Fetch time and changing RSS GUIDs do not create new article identities.

The Mac service exposes `window.kairoFeeds.listSources()` and `refresh(sourceId)`. Only the trusted top frame may invoke these fixed operations. The renderer cannot choose URLs, headers, credentials or file paths. Each request pins a checked public DNS address; every redirect must match an explicitly registered HTTPS endpoint. A timeout covers DNS through response completion, and response bytes are capped before XML parsing.

Only request timing, HTTP validators and last-success/publication timestamps are stored under the current app profile. Publisher metadata remains in process memory. Consequently a restart retains cadence but drops headlines until another permitted check; the publisher links remain available. Corrupt policy state is preserved and reported as `feed-state-unavailable`, never silently replaced. This is a current persistence limit, not offline full-reader support.

Run `npm test --workspace @bunki/feed`, `npm run typecheck --workspace @bunki/feed`, and `npm run lint --workspace @bunki/feed`. Native transport/service and isolated Electron checks are documented in [tools/feed](../../tools/feed/README.md).
