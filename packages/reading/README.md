# Reading candidates and generation briefs

`@bunki/reading` is the shared, platform-neutral intake boundary for Japanese
reading. It creates immutable candidates and minimal provider request data. It
does not fetch sources, call a provider, store a library, grade a learner or
create a review item. A passing package test does not mean Corridor, Mac, iPhone
or synchronization has integrated this boundary.

The runtime uses existing `@bunki/ai/hash` SHA-256 and
`@bunki/domain/events/shared` timestamp validation, plus the repository's Zod
version. There are no Node imports, framework imports, clocks, network calls or
storage calls. Web URLs use the host's standard WHATWG `URL` implementation;
hosts without that primitive must install their standard URL polyfill. Missing
URL support refuses intake.

## Public consumer path

| Function                                                                                        | Result and obligation                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalizeArticleIntake(metadata, context, previous?)`                                          | An `ArticleCandidate` containing an immutable `article`. Supply already-parsed plain text and trusted source policy/provenance separately.                                                                            |
| `parseArticleVersion(raw)` / `parseArticleCandidate(raw)`                                       | Strict restore validation; recomputes body and full version digests, checks anchors and exact approval references. Integrity validation does not establish that a caller's permission basis or approval is authentic. |
| `canPerformArticleOperation(article, operation)` / `assertArticleOperation(article, operation)` | Checks the operation on a validated version. Unknown operations and missing/denied decisions fail closed. Hosts also enforce current entitlements and policy revocations before each operation.                       |
| `articleReference(article)`                                                                     | Stable article ID, exact version ID and text SHA for library positions, media and future exam lineage.                                                                                                                |
| `createArticleAnchor(article, {start,end,quote})` / `resolveArticleAnchor(article, anchor)`     | Exact UTF-16 source continuity. Extracted quote anchors require `quote-extract`; an anchor from one version never moves to another implicitly.                                                                        |
| `buildGenerationBrief(input)`                                                                   | Frozen local owner/job/brief metadata and a separately bounded `providerPayload`. Send only `providerPayload`, through the approved provider adapter.                                                                 |
| `acceptArticleDraft(raw, brief, context, boundary)`                                             | Validated pending article and dictionary-confirmed vocabulary suggestions; rejects stale owner/session/job output.                                                                                                    |
| `recordEditorialDecision(candidate, decision)`                                                  | Records an explicit, exact-version operator decision. Call only from the authenticated review action; automatic checks and provider output cannot call this through the draft contract.                               |

All wire objects are strict. An unknown field is rejected, including credentials,
raw learner records, provider-created permissions, approvals and learning
commands. Errors report boundary/path codes without including input values.

### Source intake

```ts
const candidate = normalizeArticleIntake(
  {
    itemId: parsedItem.guid, // null uses the canonical URL instead
    canonicalUrl: parsedItem.url,
    title: parsedItem.title,
    summary: parsedItem.summary ?? null,
    body: parsedItem.text ? { text: parsedItem.text, annotations: [] } : null,
  },
  {
    source: { id: connector.id, name: connector.name, attribution: connector.attribution },
    capabilities: connector.validatedOperationDecisions,
    lineage: { kind: 'publisher-original' },
    provenance: [connector.provenanceObservation],
  },
  previousVersionCandidate,
);
```

The trusted context's provenance observation requires `sourceId`,
`sourceVersion`, `sourceUrl`, `attribution`, `license`, `modification`,
`evidenceRef` and `retrievedAt`. Nullable fields are explicit. Timestamps use
`YYYY-MM-DDTHH:mm:ss.sssZ`; the transport adapter normalizes publisher date
formats before intake. A permission decision is one of:

```ts
{ status: 'unknown', reason: 'not-established' }
{ status: 'denied', reason: 'documented-operation-unavailable' }
{ status: 'allowed', basis: { kind: 'license', reference: actualEvidenceReference, checkedAt } }
```

Every operation is independent: `discover-metadata`, `display-body`,
`retain-offline`, `sync-body`, `quote-extract`, `ai-transform`,
`synthesize-audio`, `redistribute-audio`. Availability of an RSS item, a
subscription or a body is not a permission grant. A missing/unpermitted body
produces a `publisher-site-link` with no retained body, vocabulary suggestions
or effective body-dependent grants. A full reader candidate may still lack
offline/sync/AI/audio rights. Hosts must check these before retaining or sending
the body; this pure function does not persist it.

URLs accept HTTP(S) only, reject credentials, control characters and backslash
ambiguities, normalize host/default port/encoding, and remove fragments.
Semantic query parameters are preserved. This is link validation, not an SSRF
policy for a future network fetcher.

Article IDs hash source ID plus upstream item ID; equal titles do not merge
different items. Version IDs hash the complete substantive payload, including
body, annotations, suggested vocabulary, attribution, lineage and operation
decisions. Body hashes describe only the exact UTF-8 text. Text is never
silently normalized; lone surrogates and invalid quote boundaries are rejected.
Render text as text, never interpret it as HTML.

Duplicate intake returns the same version and retains its exact editorial
decision. Distinct provenance snapshots are preserved; repeated retrievals of
the same snapshot merge their earliest/latest reported timestamps. Those
windows are metadata, not a complete fetch event log or causal ordering. At
most 128 distinct provenance snapshots fit this bounded value; overflow fails
explicitly and is never silently sliced. The repository retains old article
versions; this package does not overwrite them or implement retention policy.

### Personalized original generation

```ts
const brief = buildGenerationBrief({
  owner: { learnerId, sessionEpoch },
  job: { id: jobId, revision: 0 },
  createdAt,
  modelId: configuredModel,
  promptVersion: 'kairo-article-v1',
  settings: {
    mode: 'original-fiction',
    genre: 'fiction',
    length: 'medium',
    register: 'neutral',
    challenge: 'comfortable',
    interests: selectedInterests,
    startingLevel: explicitStartingLevel, // null is valid; it is not measured ability
  },
  learner: { modelVersion, bands: selectedBands, targets: selectedTargets },
  recentArticleIds,
  recentTopics,
});

// The host owns provider auth, budget, cancellation, retries and job persistence.
const raw = await provider.generate(brief.providerPayload);
const candidate = acceptArticleDraft(
  raw,
  brief,
  { completedAt, provider: providerName, actualModel, capabilities: originalArticlePolicy },
  {
    isCurrent: ({ owner, job }) => ownsExactActiveJob(owner, job),
    lookupWord: (form) => dictionaryEntryOrNull(form),
  },
);
// Commit while still owning this job, or compare ownership atomically inside
// the repository transaction. Persist the accepted text; do not regenerate it.
```

`raw` must be `{title, text, suggestedWords?, references?}`. References contain
only `{url,title}`. The current plain-response provider needs a thin adapter
that extracts these fields before calling acceptance; this module does not
guess arbitrary response syntax. Dictionary results are
`{lexemeId,form,reading:string|null}`. Unknown, duplicate, nonmatching or absent
words are omitted. This first exact-form matcher does not infer conjugation or
tokenize Japanese; a contextual morphological matcher is later adapter work.
Suggestions stay `ArticleCandidate` data. They do not create `taken`, `started`,
scheduler state, evidence or a promotion command.

A selected band contains `dimension` (`lexis`, `readings`, `syntax`,
`production`), `edge` (`N5`–`N1` or null), `measured`, `observed`, `sampled`,
`disagreement` and optional bounded `evidenceRefs`. Targets contain `kind`
(`word`/`grammar`), `form`, `reason` (`explicit`/`interest`/`recent-struggle`) and
optional evidence references. Use the existing model's selected projection;
this module does not calibrate a second learner model. Unsampled/zero-measured
bands stay sparse and have no claimed working level. Observations alone do not
become measurements. Conflicting sampled evidence remains labelled conflicting.

Only the provider payload leaves the device. It includes explicit interests,
style, requested starting setting, selected working bands and target forms,
recent topic descriptions, and an optional permitted source excerpt. Owner,
session epoch, job ID/revision, model projection version, raw evidence counts,
evidence IDs and recent article IDs remain local. Local brief and minimal payload
have separate hashes. Limits include 12 interests, 12 targets, 40 local recent
article IDs, ten recent topic descriptions, a 4,000-character source excerpt and
a 16,000-character serialized payload. Oversized selections fail explicitly.

The host's `isCurrent` must bind **both owner/session epoch and exact immutable
job revision**. Never reuse a revision for a changed brief. A result must be
checked after awaiting the provider and again inside any later asynchronous
persistence transaction. The package checks before and after synchronous
dictionary callbacks; it cannot make a future host write atomic. Equal or
backwards wall-clock receipt times do not discard a valid current-job result;
the raw receipt time remains in provenance. Job identity determines causality.

Original fiction is explicit. Original factual references supplied by a model
remain unverified, with no invented verification date. A source adaptation
requires the exact parent version, its real `ai-transform` basis and a permitted
anchored excerpt. The brief carries only that excerpt with
`contentRole:'untrusted-source-text'`; the provider transport must keep it in a
data role. Adaptation acceptance rechecks the actual parent and cannot substitute
a later edition. Fetched text cannot supply tool, credential or policy authority.

## Checks and approval

Automatic checks currently prove body/hash/anchor integrity and record whether
a factual draft names supporting references. They deliberately report factual
accuracy and Japanese editorial quality as `not-checked`. Model self-review,
valid JSON, tokenization and a content hash are not editorial approval.

`recordEditorialDecision` requires the exact article/version/body reference,
`status:'approved'|'rejected'`, reviewer ID, decision time, rubric version,
`userAction:true` and a note. This is an observation of a host-authorized review
action, not a cryptographic identity proof or a claim that a test fixture is
qualified editorial review. Changed content, annotations, suggested vocabulary
or source policy creates a new pending version; old approval cannot transfer.

## Verification and remaining integration

Run from the repository root:

```sh
npm run test --workspace @bunki/reading
npm run typecheck --workspace @bunki/reading
npm run lint --workspace @bunki/reading
```

Behavioral fixtures exercise changed-body anchors, idempotent intake,
provenance, capabilities, hostile URLs/unknown fields, exact-version approval,
bounded sparse/measured briefs, factual/fiction/adaptation lineage, owner/job
changes and twenty accepted candidates rejected by the real domain evidence
boundary. No network, provider spend, real learner data, native install or
editorial quality assessment is used.

Root integration owns the browser bundle and real reader consumer, source
parsers/pollers, persistence/backup/sync, current policy enforcement (including
restricted copied spans), provider transport, job/cost reconciliation, automated
linguistic/factual checks, human publication workflow, morphology, rich reader
annotations and aligned audio. The package supplies tested contracts for that
work; it does not claim those product requirements are already complete.
