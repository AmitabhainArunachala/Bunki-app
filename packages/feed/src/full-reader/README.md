# Selected Global Voices Japanese intake

This is one publisher adapter. It admits a body only after checking the selected article's current template, canonical URL, author and translator credits, publication/update metadata and article-level CC BY 3.0 badge. A failed check returns the publisher link and a bounded reason; it never supplies a partial body as a successful reader.

The publisher's [Japanese republication policy](https://jp.globalvoices.org/about/%E8%A8%98%E4%BA%8B%E3%81%AE%E8%BB%A2%E8%BC%89%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6/) permits reuse with the article link, Global Voices, author and translator credits. The [CC BY 3.0 terms](https://creativecommons.org/licenses/by/3.0/) require attribution and identification of modifications. The adapter records both the policy review date and the individual response observation. A site-wide policy alone does not bypass an absent, different or conflicting article licence.

## Core API

All functions are exported from `@bunki/feed` and therefore the canonical staged `modules/feed-core.mjs`.

```ts
parsePublisherReadSelection(raw)
// Strict {sourceId: 'global-voices', entryId, revisionId}; no URL field.

publisherArticleRequest(feedEntry, expectedSelection?)
// Validates FeedEntry identity; derives only the selected dated Japanese URL.

createGlobalVoicesArticle(feedEntry, {
  html, finalUrl, contentType, fetchedAt, responseSha256, responseBytes
}, enabled?)
// Pure intake factory. Does no network operation or HTML execution.

createPublisherLink(feedEntry, reason, fetchedAt)
parsePublisherReadResult(raw, expectedSelection?)
```

`PublisherReadResult` is `{format:'kairo-publisher-read', v:1, selection, status, candidate, sourceDocument, reason, receiptSha256}`. Status is `full-reader` or `publisher-link`; the latter has `sourceDocument:null`, no body and a non-null reason from `PUBLISHER_LINK_REASONS`. A missing or stale native selection fails before fetching because no trusted current link is available.

`candidate` is the existing immutable `ArticleCandidate` from `@bunki/reading`. Its text is `candidate.article.body.text`; title, canonical URL and complete human-readable attribution are on `candidate.article`. The factory grants only metadata discovery, body display, offline retention, body sync and quotation extraction. AI transformation and audio operations remain unknown. It creates no vocabulary, difficulty, furigana, factual review or editorial approval. Shared editorial state remains pending.

Persist the **whole validated result wrapper**. The shared article has an author field and publication date but no dedicated translator or update field; `sourceDocument` preserves those exact credits/dates, optional supplied proofreader credits (`otherCredits` with role `校正`), the received HTML byte count/hash, licence/policy URLs, omission count and extraction spans. The complete human-readable attribution includes that proofreader when present. Unknown contributor roles produce a link fallback. A result hash is an integrity check, not independent proof of a licence grant. Native selected-entry resolution supplies the authority boundary.

## Native integration

```js
const reader = createPublisherReader({
  core,                      // the same verified artifact's feed-core module
  resolveEntry(selection),  // trusted native feed-memory lookup; never renderer data
  enabled: () => true,      // scoped adapter policy; checked before and after I/O
  onEvent: metadata => {}   // optional counts/hashes/status receipt, without body
});
await reader.read({sourceId, entryId, revisionId});
await reader.close();
```

The renderer bridge should expose the `read` selection only, under the existing same-origin/main-frame IPC boundary. `parsePublisherReadResult(result, selection)` is the renderer/storage rehydration boundary. Source shelf refresh does not read article pages. User selection triggers one fetch; two distinct reads may be pending, duplicate clicks share a request, and there is no automatic retry or unbounded queue. `reader-busy`, `entry-unavailable` and `entry-revised` are safe errors the UI can explain.

`publisher-network.cjs` composes the existing personal feed transport: HTTPS only, certificate validation, public DNS pinned per redirect, no cookies or credentials, identity encoding, fatal UTF-8 decoding, a 12-second whole-operation deadline and a two-megabyte response limit. Only this selected article's trailing-slash variant is an allowed redirect. The API accepts a validated feed entry plus selection, not a renderer URL. Node-only injection seams support controlled tests and are not IPC options.

The current Mac package includes `lib/**/*.cjs`, so the two native helper files already fit its whitelist. Main/preload wiring, the trusted feed-memory resolver, library persistence and an actual UI journey remain integration work owned by the application host.

## Extraction limits

The existing pinned `@xmldom/xmldom` parser has inert HTML mode, not a complete browser HTML5 tree builder. The adapter therefore checks the observed document envelope and article template explicitly. The publisher currently uses the legacy `lang="jp"` marker; that exact marker is accepted alongside standard Japanese tags, but the Japanese body check remains required. Current-page `screen-title.post-title` is distinct from related-card titles. The adapter rejects DTD/entity declarations, parser repairs outside the documented harmless boolean attributes, excessive nesting/nodes, ambiguous metadata and unsupported body structures such as tables. Template changes can produce a link fallback until reviewed.

Scripts, forms, images/captions, hidden elements and third-party embeds are omitted. Whitespace is normalized and blocks are joined by two linefeeds. No Unicode normalization is applied. `sourceDocument.blocks` indexes the exact immutable extracted text in UTF-16 code units, with a SHA-256 per block; these are not positions in the original HTML. The original received byte hash is separate from the text hash. Existing article anchors bind version ID, body hash and exact span, including surrogate-pair boundaries.

Body rights do not establish rights in excluded media or other publishers. Extension requires a separate source policy, per-article licence/attribution rules, template and network allowlist, adversarial fixtures and a live template check. The feed catalog's metadata routes do not automatically become full readers.

## Verification

```sh
npm run test --workspace @bunki/feed
npm run typecheck --workspace @bunki/feed
KAIRO_SITE_DIR=/absolute/verified/site \
KAIRO_EVIDENCE_DIR=/absolute/path/under/.dharma \
node --test prototypes/bunki-desktop/test/publisher-network.test.cjs \
  prototypes/bunki-desktop/test/publisher-reader.test.cjs
```

Native tests use a fresh temporary TLS server and original synthetic HTML. They do not launch the installed app, contact publishers or change user profiles. The default test site is built through the existing canonical staging helper outside the repository. A live publisher check is separate, logs counts/hashes/credits only and must distinguish a synthetic selected-entry fixture from a fresh RSS-to-reader journey.
