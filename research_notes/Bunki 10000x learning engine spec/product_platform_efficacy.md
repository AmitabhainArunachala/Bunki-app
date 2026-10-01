# Product and platform side of a personal-first, product-ready AI Japanese tutor (as of 2026-09-28)

Research method note: WebSearch budget was exhausted mid-task and the network egress proxy blocked most non-GitHub/non-Apple/non-Anthropic domains, so several findings rest on search-result summaries of the cited pages rather than full fetches. Each such case is flagged "(snippet only)". Full-text sources: Anthropic pricing page, Apple App Review Guidelines, Apple privacy-label docs, Apple developer forum thread on BYOK, Apple Nov-2025 guideline update, Duolingo research report DRR-21-02 (PDF extracted locally), GitHub READMEs/licenses for PowerSync, Electric, Zero, Triplit, Automerge, Yjs, Turso, PocketBase, LiteLLM, Portkey, Helicone, the reverse-engineered Linear sync engine, Anki manual (syncing, sync-server), and the Cloudflare AI Gateway docs source (rate limiting, pricing).

---

## KQ1. Local-first architecture in 2026: sync options, maturity, licensing, fit for an append-only event ledger

### Takeaway
The field consolidated in 2026 around two shapes: (a) server-authoritative "sync log" engines (Linear-style custom, PowerSync, Zero, Electric read-path + your own write API) and (b) CRDT libraries (Automerge 3, Yjs, Triplit) for peer-mergeable documents. An append-only event ledger with a derived model needs no CRDT text merging; it needs an offline write queue, a total order (or per-device sequence numbers), and stable hosting. The biggest 2026 change is vendor risk: ElectricSQL joined Databricks on 2026-08-11 and Electric Cloud is winding down, while its OSS stays Apache-2.0.

### Cited Findings

**ElectricSQL**
- Electric is Apache 2.0, at "Status 1.0" (GA), and is explicitly a "read-path sync engine for Postgres" that replicates partial data sets ("Shapes") over HTTP with CDN integration; writes go through your own application API — [electric-sql/electric README](https://github.com/electric-sql/electric)
- Electric announced on 2026-08-11 that it is joining Databricks; Electric Cloud is winding down and Cloud users must self-host or move; "everything Electric has previously open sourced stays open source: Postgres Sync, PGlite, TanStack DB, Durable Streams"; the team joins Neon inside Databricks (snippet only) — [Electric blog, 2026-08-11](https://electric.ax/blog/2026/08/11/electric-joining-databricks); [Databricks blog](https://www.databricks.com/blog/electric-joins-databricks-bring-wasm-postgres-ai-agent-sandboxes); [The New Stack](https://thenewstack.io/databricks-electric-wasm-agentic-postgres/)
- Electric's model is described as "shape-based, read-path-only"; conflict handling "last-write-wins by default" (snippet only) — [Kanopy Labs comparison](https://kanopylabs.com/blog/tanstack-db-vs-electricsql-vs-zero-sync)

**PowerSync**
- The PowerSync Service is licensed FSL-1.1-ALv2 (Functional Source License 1.1 with Apache 2.0 future license): it prohibits "competing use" (commercial products that substitute for the software), permits internal use, non-commercial education/research, and professional services, and each release converts to Apache 2.0 on its second anniversary — [powersync-service LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE)
- Service supports Postgres, MongoDB, Azure DocumentDB, MySQL, and SQL Server as source databases — [powersync-service README](https://github.com/powersync-ja/powersync-service)
- Client SDKs are open source (Apache 2.0 and MIT); an "Open Edition" is a free, source-available self-hosted version with all core features; PowerSync Cloud is the managed option (snippet only) — [PowerSync self-hosting docs](https://docs.powersync.com/intro/self-hosting); [PowerSync licensing](https://powersync.com/legal/licensing-terms)
- Architecture: full bidirectional sync, server DB to client SQLite via Sync Rules/buckets, client writes flow back via a persistent upload queue; described as "most mature and battle-tested" for mobile because native SQLite avoids WASM overhead (snippet only, vendor-adjacent comparison sites) — [Kanopy Labs](https://kanopylabs.com/blog/electric-sql-vs-powersync-vs-livestore-local-first); [PowerSync blog vs Electric legacy](https://powersync.com/blog/electricsql-vs-powersync)

**Zero / Replicache (Rocicorp)**
- The `rocicorp/mono` monorepo (Zero and Replicache) is Apache-2.0; `packages/zero-cache` is the server side; tagline "99% of Queries in Zero Milliseconds"; 10k+ commits — [rocicorp/mono](https://github.com/rocicorp/mono)
- Zero: "full bidirectional sync with a server-authoritative model"; offline reads from an IndexedDB cache, writes queue and sync on reconnect (snippet only) — [Kanopy Labs](https://kanopylabs.com/blog/tanstack-db-vs-electricsql-vs-zero-sync)

**Triplit**
- AGPL-3.0; "Collaboration/Multiplayer powered by CRDTs"; "conflict resolution at the property level"; offline mode with reconnection, rollback/retry on failed updates; client storage IndexedDB/LevelDB/memory, server SQLite or Cloudflare Durable Objects; ~3.1k stars, ~3,063 commits — [aspen-cloud/triplit](https://github.com/aspen-cloud/triplit)

**Automerge**
- MIT; Automerge 3 recently released with ~10x memory reduction; Rust core with JS/WASM and C bindings; JS package described as "a stable release"; positions itself as "PostgreSQL for your local-first app" — [automerge/automerge](https://github.com/automerge/automerge)

**Yjs**
- MIT ("commercial applications are expected to provide financial sponsorship"); used by AFFiNE, Gitbook, Evernote, Linear, Synthesia, AWS SageMaker, JupyterLab, Proton Docs; providers include y-websocket, y-webrtc, Hocuspocus (SQLite persistence), y-sweet, PartyKit, Liveblocks; persistence y-indexeddb, y-postgresql, y-mongodb — [yjs/yjs](https://github.com/yjs/yjs)

**Turso**
- `tursodatabase/turso` is MIT, "powers production applications today" but "we have not yet reached 1.0" (keep independent backups); bindings Rust/JS/Python/Go/.NET/Java plus WASM; README shows experimental CDC and multi-process WAL, but no documented offline/bidirectional sync in the README (docs site was unreachable) — [tursodatabase/turso](https://github.com/tursodatabase/turso)

**PocketBase**
- MIT; embedded SQLite with realtime subscriptions; "full backward compatibility is not guaranteed before reaching v1.0.0"; no client offline sync feature — [pocketbase/pocketbase](https://github.com/pocketbase/pocketbase)

**What real apps use**
- Linear: server-centric custom engine; IndexedDB is a cache of server state; client "transactions" (create/update/delete/archive/unarchive) are queued, cached for offline, sent via GraphQL; server assigns a global monotonically increasing `lastSyncId` giving a total order; clients detect missed packets by comparing `lastSyncId` and fetch deltas; bootstrapping is full/partial/local; no CRDT or OT for the object graph, effectively last-write-wins with server rejection causing rollback; "CRDTs often introduce metadata overhead and become challenging in scenarios involving partial syncing or permission controls" — [wzhudev/reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)
- Linear is listed among Yjs users (presumably for collaborative document text) — [yjs/yjs](https://github.com/yjs/yjs)
- Anki: normal sync merges bidirectionally; when the same card is reviewed on two devices, "both reviews will be marked in the revision history, and the card will be kept in the state it was when it was most recently answered"; schema changes ("adding a new field, or removing a card template") force a one-way full sync (upload or download); media syncs separately and cannot detect in-place edits — [Anki manual: Syncing](https://raw.githubusercontent.com/ankitects/anki-manual/main/src/syncing.md)
- Anki's sync protocol is transactional and USN-based (hostKey → meta → start → applyChanges/getChanges → chunks → sanityCheck2 → finish); rows carry `usn = -1` when pending; `col.mod` equality with server short-circuits to "no changes" (snippet only, third-party reimplementation notes) — [anki-cli issue #18](https://github.com/ubermenchh/anki-cli/issues/18)
- Anki ships a self-hosted sync server built into desktop 2.1.57+ (Rust version 2.1.66+), storing a copy of collection + media; plain HTTP (put behind HTTPS proxy); client and server versions must be kept in step — [Anki manual: Sync Server](https://raw.githubusercontent.com/ankitects/anki-manual/main/src/sync-server.md)

### Inferences
- An append-only ledger (events with `(device_id, seq)` and a server-assigned global sequence, insert-only, never edited) is conflict-free by construction; the only merge rule is "union of events, deterministic replay". That is exactly the Linear `lastSyncId` / Anki revlog pattern, and it removes any need for Automerge/Yjs unless you later add shared free-text documents.
- The derived model (mastery estimates, schedules) should be recomputed from the ledger on each device rather than synced, mirroring Anki's "keep the most recently answered state, keep both revlog rows" rule; this also makes a later "accounts + sync" step a pure transport addition.
- Practical 2026 choice for "start personal, add accounts later": SQLite on device now; when adding sync, either (a) PowerSync Open Edition against Postgres (offline upload queue for free, FSL is fine for a tutor app since it is not a sync-engine competitor), or (b) a ~300-line custom "append events / pull events since cursor" endpoint (Linear-style) which for an insert-only ledger is simpler than any engine. Electric's cloud wind-down is a reminder to prefer self-hostable, Apache/MIT components for the transport.
- Zero is attractive for web DX but its IndexedDB-cache model and unconfirmed release status make it a weaker fit for a mobile-first study app than SQLite-based options.

### Gaps
- Could not fetch Zero's docs to confirm its current status (alpha/beta/GA), offline-write semantics, or hosted pricing.
- Obsidian Sync design (file-level E2E encryption, version history, merge behaviour) could not be fetched (help.obsidian.md blocked); do not rely on recollection.
- Apple CloudKit + SwiftData sync limitations and Supabase's offline story (Supabase has no first-party offline sync; PowerSync markets a Supabase integration) were not verified.
- Turso's hosted "offline sync"/embedded-replica feature status could not be verified (docs.turso.tech blocked).
- Exact release dates/versions for Automerge 3 and latest Yjs were not visible on the fetched pages.

---

## KQ2. Provider gateway: calling Claude from web/mobile without shipping a key, metering, abuse limits, cost caps, latency overhead

### Takeaway
Never put the Anthropic key in the client; route through your own authenticated edge/serverless endpoint (optionally fronted by a gateway such as Cloudflare AI Gateway, LiteLLM, Portkey, or Helicone) that validates the user's session, enforces per-user daily turn/token caps from the `usage` fields on each response, and streams back. Gateway overhead is single-digit to low-tens of milliseconds against 500 ms–5 s inference, and Cloudflare's built-in rate limiting is gateway-wide, not per-user, so per-user budgets must live in your own code or in LiteLLM-style virtual keys.

### Cited Findings
- Anthropic's own worked example shows the metering fields to use: `usage.input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens` per response; costs are computed from those at per-model rates — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Cloudflare AI Gateway rate limiting supports fixed or sliding windows, configured per gateway via dashboard or API (`rate_limiting_interval`, `rate_limiting_limit`, `rate_limiting_technique`); "This rate limiting behavior will be uniformly applied to all requests for that gateway"; excess requests get 429; budgets/spend caps are not a feature — [Cloudflare docs source: rate-limiting.mdx](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/ai-gateway/features/rate-limiting.mdx)
- Cloudflare AI Gateway pricing: dashboard analytics, caching, and rate limiting are free; Unified Billing charges a 5% fee on credit purchases with provider inference passed through at cost; persistent-log storage limits apply only to gateways created before 2026-09-24 (free 100k logs, paid 10M per gateway), newer gateways follow Workers Logs pricing; Logpush on Workers Paid (10M requests/month, $0.05 per extra million); Guardrails billed via Workers AI — [Cloudflare docs source: pricing.mdx](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/ai-gateway/reference/pricing.mdx)
- Third-party summary: Cloudflare AI Gateway "doesn't hard-cap spend or page you when a threshold is crossed mid-month, that logic has to live on your side"; overhead is "a TLS handshake and a network leg", negligible against multi-second completions but visible on time-to-first-token for streaming (snippet only) — [TrueFoundry on Cloudflare AI Gateway pricing](https://www.truefoundry.com/blog/cloudflare-ai-gateway-pricing)
- LiteLLM proxy: virtual keys, "multi-tenant cost tracking and spend management per project/user", rate limits per key/user/team, max-budget enforcement; Anthropic supported on `/messages`; claims "8ms P95 latency at 1k RPS"; open source with a separate commercial license for enterprise features — [BerriAI/litellm](https://github.com/BerriAI/litellm)
- Portkey gateway: MIT, claims "<1ms latency", 122 kB footprint, retries up to 5 with exponential backoff, fallbacks, caching (hosted), deployable to Cloudflare Workers/Node/Docker/Kubernetes; Anthropic supported — [Portkey-AI/gateway](https://github.com/Portkey-AI/gateway)
- Helicone: Apache 2.0, AI Gateway with routing/fallbacks, free tier 10k requests/month, Anthropic supported — [Helicone/helicone](https://github.com/Helicone/helicone)
- Independent latency summary (snippet only): Helicone ~8 ms p50; Portkey reports 8 ms p95 but "adds 10 to 20ms in independent testing" and "closer to 20 to 40 ms" with features enabled; LiteLLM ~7.5 ms for the Python proxy, ~9 ms p50 measured self-hosted; "a well-built gateway adds single-digit to low-tens of milliseconds of forwarding overhead ... small against an LLM inference baseline of 500 ms to 5 seconds" — [DeepInspect gateway latency benchmarks](https://www.deepinspect.ai/blog/ai-gateway-latency-benchmarks); [enterpilot benchmark, June 2026](https://enterpilot.io/blog/benchmarking-ai-gateways-gomodel-litellm-portkey-bifrost-june-2026/); [LiteLLM benchmarks](https://docs.litellm.ai/docs/benchmarks)
- Apple rejected a one-time-purchase app whose users entered their own OpenAI/Claude keys, citing 3.1.1: "The app uses API keys to unlock or enable functionality"; no accepted workaround was posted (Sept 2024 thread) — [Apple Developer Forums thread 763884](https://developer.apple.com/forums/thread/763884)

### Inferences
- Minimal viable plumbing: client → your edge function (Cloudflare Worker / Supabase Edge / Vercel) with the user's JWT → Anthropic. Store the key server-side; return SSE; write a `usage` row per call keyed by user; enforce a daily cap (turns and output tokens) before calling the provider; add a global kill-switch budget. A hosted gateway (Cloudflare AI Gateway) in front gives free analytics/caching/global rate-limit and a 5% fee only if you use its billing.
- If BYOK is wanted for the "personal" phase, keep it web/desktop-only or as a developer setting; on iOS it must not be the mechanism that unlocks paid functionality (3.1.1 precedent above).
- Prompt-caching hygiene matters more than gateway choice for cost (see KQ3): keep the system prompt/tools frozen and put per-user volatile content after the cache breakpoint; a gateway that rewrites headers or bodies must not perturb the prefix.

### Gaps
- Vercel AI Gateway pricing/BYOK fee and Supabase Edge Function specifics could not be fetched (vercel.com blocked; no search budget left).
- Per-user rate limiting via Cloudflare AI Gateway metadata/keys could not be confirmed beyond the documented gateway-wide limit.
- Latency numbers above are vendor claims or third-party blog benchmarks, not reproduced; treat as order-of-magnitude.

---

## KQ3. Unit economics per active learner (with public Claude pricing), with and without prompt caching, vs competitor subscription prices

### Takeaway
At Claude Sonnet 5 list prices ($2 in / $10 out / $0.20 cache read per MTok), a heavy daily learner (45 tutor turns/day, nightly mining, 3 readings/day, 30 days) costs roughly $12–15/month with caching + Batch API and $40+/month without, so caching is the difference between a viable $15–20/month subscription and a loss. Haiku 4.5 halves that; Opus 5 multiplies it by 2.5. Competitors charge $6–14/month effective (annual) and $10–40/month (monthly), so the tutor must meter turns per tier or run cheaper models for routine turns.

### Cited Findings (prices, all USD per million tokens, Anthropic first-party API, fetched 2026-09-28)
- Claude Sonnet 5: $2 input, $2.50 5-min cache write, $4 1-hour cache write, $0.20 cache read, $10 output; the introductory $2/$10 price "is now the standard price" (the scheduled Sept 1 2026 increase to $3/$15 "will not occur") — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Claude Haiku 4.5: $1 / $1.25 / $2 / $0.10 / $5 — same source
- Claude Opus 5: $5 / $6.25 / $10 / $0.50 / $25; Claude Opus 5.5: $4 / $5 / $8 / $0.20 (0.05x) / $20; Claude Fable 5.1: $10 / $12.50 / $20 / $0.25 (0.025x) / $50 — same source
- Cache multipliers: 5-min write 1.25x, 1-hour write 2x, read 0.1x (0.05x on Opus 5.5, 0.025x on Fable 5.1); "caching pays off after one cache read for the 5-minute duration" — same source
- Batch API: 50% off input and output (Sonnet 5 batch $1 / $5; Haiku 4.5 batch $0.50 / $2.50; Opus 5 batch $2.50 / $12.50); batch and caching discounts stack — same source
- Tokenizer: "Claude 4.7 and later models ... produce approximately 30% more tokens for the same text" than Sonnet 4.6 and earlier — same source
- Data residency: `inference_geo: "us"` adds a 1.1x multiplier on 4.6+ models — same source

### Cited Findings (competitor prices, 2026)
- Duolingo: Max $167.99/year; on some accounts Max no longer appears as a new subscription; Super Individual $16.99/month or $119.99/year; Super Family $143.99/year; Lite $35.99/year (snippet only) — [Language App Guide: Duolingo cost](https://languageappguide.com/pricing/duolingo-cost/); [checkthat.ai Duolingo pricing](https://checkthat.ai/brands/duolingo/pricing)
- Speak: Premium $17.99/month or $83.99/year; Premium Plus $39.99/month or $164.99/year, adding unlimited custom lessons, a personalized study plan, and frequent-mistake targeting; prices vary by region (snippet only) — [SpeakShark: Speak pricing 2026](https://speakshark.com/blog/speak-app-pricing-per-month-2026); [Speak blog on tiers](https://www.speak.com/blog-tw/speak-subscription-pricing-comparison)
- Migaku: $10/month or $96/year Standard, $15/month Early Access, $499 lifetime, 10-day free trial, verified 2026-08-24 (snippet only) — [Lexirise: Migaku pricing](https://lexirise.app/blog/article/migaku-pricing-free-trial); [Migaku pricing FAQ](https://migaku.com/faq/pricing)
- Busuu Premium: $70/year (snippet only) — [Test Prep Insight: Busuu vs Duolingo](https://testprepinsight.com/comparisons/busuu-vs-duolingo/)
- Jumpspeak: $69/3 months, $99/year, $249 lifetime; another source lists $79.99/year; "Premium AI" tier removes daily AI-chat limits for an extra ~$50/quarter or $99/year on top of Premium; reviewers call the tiering confusing (snippet only) — [Languatalk Jumpspeak review](https://languatalk.com/blog/jumpspeak-review/); [Mezzoguild Jumpspeak review](https://www.mezzoguild.com/jumpspeak-review/)
- Market framing: "most language apps in 2026 have monthly plans ranging from $13-25, while AI tiers like Duolingo Max reach $29.99/month" (snippet only) — [Hello Nabu: app costs 2026](https://www.hellonabu.com/blog/en/how-much-do-language-learning-apps-cost/)

### Estimate: monthly LLM cost per active learner (my arithmetic; assumptions are estimates)
Workload assumptions (estimates):
- Tutor chat: 30 / 45 / 60 turns per day. Per turn: 800 new (uncached) input tokens (learner message + retrieved context), 250 output tokens, and a cached prefix (system prompt + learner profile + conversation so far). Two context scenarios: "lean" average prefix 5,000 tokens (thread reset per session), "long" average prefix 12,000 tokens (one running thread across the day). 5-minute cache assumed warm between turns; each turn writes its 800 new tokens to cache.
- Nightly mining: one Batch API job over the day's transcript, ~30,000 input tokens, ~3,000 output tokens (structured extraction of errors, vocabulary, and review items).
- Generated readings: 3 per day, each ~1,000 uncached + 3,000 cached input tokens (profile + known-vocab list), ~1,500 output tokens.
- 30 active days per month (heavy learner); a 20-day learner scales by 2/3.
- Japanese text likely tokenizes at more tokens per character than English; the 30%-heavier 4.7+ tokenizer is folded into the token counts above, but no Japanese-specific ratio was verifiable (see Gaps).

Per-turn chat cost, Sonnet 5:
- Cached, lean: 800×$2/M = $0.0016 + write 800×$2.50/M = $0.0020 + read 5,000×$0.20/M = $0.0010 + out 250×$10/M = $0.0025 → **$0.0071/turn**
- Cached, long: read 12,000×$0.20/M = $0.0024 → **$0.0085/turn**
- Uncached, lean: 5,800×$2/M = $0.0116 + $0.0025 → **$0.0141/turn**
- Uncached, long: 12,800×$2/M = $0.0256 + $0.0025 → **$0.0281/turn**

Monthly chat at 45 turns × 30 days = 1,350 turns, Sonnet 5: cached-lean $9.59; cached-long $11.48; uncached-lean $19.04; uncached-long $37.94. (At 30 turns/day multiply by 0.667; at 60 by 1.333.)

Nightly mining, Sonnet 5: batch 30,000×$1/M + 3,000×$5/M = $0.030 + $0.015 = $0.045/day → $1.35/month; non-batch $0.09/day → $2.70/month.

Readings, Sonnet 5: cached 1,000×$2/M + 3,000×$0.20/M + 1,500×$10/M = $0.002 + $0.0006 + $0.015 = $0.0176 each → $0.053/day → $1.59/month; uncached 4,000×$2/M + $0.015 = $0.023 each → $2.07/month; batch-generated overnight would halve these.

Monthly totals per heavy learner (45 turns/day, 30 days):

| Model | Optimized (cache + batch), lean / long thread | Unoptimized (no cache, no batch), long thread |
|---|---|---|
| Haiku 4.5 | $6.3 / $7.2 | $21.4 |
| Sonnet 5 | $12.5 / $14.4 | $42.7 |
| Opus 5.5 | ≈ $25.5 (long) | ≈ $85 |
| Opus 5 | $31 / $36 | $107 |

(Opus 5.5 detail: per turn cached-long 800×$4/M + 800×$5/M + 12,000×$0.20/M + 250×$20/M = $0.0032+$0.004+$0.0024+$0.005 = $0.0146 → $19.7/month; mining batch $0.09/day → $2.7; readings ≈ $0.035 each → $3.1.)

At 30 turns/day and 20 active days (a realistic "active" subscriber), Sonnet 5 optimized ≈ $5.6–6.4/month; Haiku 4.5 optimized ≈ $2.8–3.2/month.

Margin arithmetic against a $14.99/month price: after a 15% store commission (small-business rate) net ≈ $12.74; Sonnet 5 heavy-daily user ($12.5–14.4) is break-even or negative, a 30-turn/20-day user ($6) leaves ~50% gross margin; Haiku for routine turns with Sonnet/Opus reserved for corrections and readings roughly doubles margin. Annual-plan competitors net far less per month (Busuu ≈ $5.8, Speak Premium ≈ $7, Migaku ≈ $8, Duolingo Max ≈ $14), which is consistent with those products capping or throttling unlimited AI chat (Speak "Premium Plus" and Jumpspeak "Premium AI" both sell the removal of limits).

### Inferences
- The two decisive levers are (1) prompt caching with a frozen prefix (a 3–4x swing on chat) and (2) moving all non-interactive work (mining, reading generation) to the Batch API (2x). Gateway fees are noise by comparison.
- Turn caps per tier (e.g., 30 turns/day standard, unlimited on a higher tier) are the industry pattern and are required for the heavy-user tail at Sonnet-class pricing.
- Fable 5.1 is not a tutor-loop model at $10/$50 despite its cheap cache reads; reserve frontier models for nightly analysis if at all.

### Gaps
- No verifiable source on Japanese tokens-per-character for Claude's current tokenizer; all token counts above are estimates and should be measured with `count_tokens` on real transcripts.
- Competitor prices are from third-party pricing trackers (snippet only), not fetched from the vendors' own pages; verify before quoting publicly.
- Speech (STT/TTS) costs for a speaking tutor were out of scope and not estimated.

---

## KQ4. App Store / Google Play rules touching AI tutors; EU AI Act; Japan APPI

### Takeaway
Apple's Nov 13 2025 update made third-party AI a regulated category: 5.1.2(i) requires clear disclosure and explicit permission before sending personal data to "third-party AI"; 3.1.1 bars BYO-API-key as an unlock mechanism and requires purchased credits never expire; privacy labels count text sent to a model as "collected" unless discarded immediately after the request. The EU AI Act's Article 50 chatbot-disclosure duty applied from 2026-08-02 and was not deferred; Annex III high-risk education obligations were pushed to 2027-12-02 by the Digital Omnibus, and a self-directed hobby tutor is unlikely to be Annex III unless it evaluates learning outcomes in an institutional sense. Japan's APPI amendment (cabinet-approved 2026) adds minors' protections and administrative fines; cross-border transfer consent/equivalence rules still apply to sending learner text to a foreign model provider.

### Cited Findings — Apple
- Guideline 5.1.2(i) (as updated 2025-11-13): "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." — [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/); [Apple News: Updated App Review Guidelines, 2025-11-13](https://developer.apple.com/news/?id=ey6d8onl)
- The same update added 1.2.1(a) and 4.7.5: apps must provide "a way for users to identify content that exceeds the app's age rating, and use an age restriction mechanism based on verified or declared age" (creator apps; mini apps/chatbots not embedded in the binary) — same sources
- 3.1.1: features and functionality must be unlocked via in-app purchase; "Apps may not use their own mechanisms to unlock content or functionality, such as license keys ..."; "Any credits or in-game currencies purchased via in-app purchase may not expire, and you should make sure you have a restore mechanism" — [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 3.1.3(d): real-time person-to-person services (e.g., "tutoring students") may use non-IAP payment, but "one-to-few and one-to-many real-time services must use in-app purchase" (an AI tutor is not person-to-person) — same
- 5.1.1(i)-(iii): privacy policy must identify data collected and all uses, confirm third parties provide equal protection, explain retention/deletion; consent required for collecting usage data "even if ... anonymous"; data minimization; account deletion must be offered in-app if accounts exist — same
- Guidelines contain no dedicated "generative AI" section; the only AI mention is in 5.1.2(i) — same
- Privacy labels: "Collect" means transmitting data off device in a way that allows access "for a period longer than what is necessary to service the transmitted request in real time"; data processed only on device is not collected; developers must declare third-party partners' practices; optional-disclosure only if all four criteria (not tracking, not advertising, infrequent, user-provided each time) are met; labels can be updated without an app update — [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- BYOK rejection precedent under 3.1.1 (Sept 2024): "The app uses API keys to unlock or enable functionality" — [Apple forum thread](https://developer.apple.com/forums/thread/763884)
- Commentary: on-device inference (Core ML / Apple Foundation Models) does not trigger 5.1.2(i) because data never leaves the device; in-app disclosure (not just a policy link) is expected (snippet only) — [TechCrunch, 2025-11-13](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai); [DEV Community explainer](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p)

### Cited Findings — Google Play (snippet only; policy pages blocked)
- Google Play's AI-Generated Content policy requires developers to ensure generative AI apps do not generate prohibited content (Inappropriate Content, child exploitation, deception) and to "incorporate user feedback" (in-app reporting) — [Play Console Help: AI-Generated Content](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en); [Understanding the policy](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en)
- Google's Aug 2026 post reiterates prohibitions on non-consensual intimate content for GenAI apps — [Android Developers Blog, Aug 2026](https://android-developers.googleblog.com/2026/08/ensuring-safety-genai-preventing-non-consensual-intimate-content.html)
- A July 15 2026 policy announcement exists but its contents could not be fetched — [Play Console policy announcement 2026-07-15](https://support.google.com/googleplay/android-developer/answer/17134731)
- BYO-API-key apps are listed on Google Play (e.g., "AI Agent – Own API Key, No Sub"), indicating Play does not block the model per se — [Google Play listing](https://play.google.com/store/apps/details?id=com.yaaa.byoaagentai&hl=en)

### Cited Findings — EU AI Act (snippet only; law-firm and tracker pages blocked)
- The "Digital Omnibus on AI" entered into force 2026-07-27 and deferred most Annex III high-risk obligations (including education uses: admissions, learning-outcome evaluation, level placement, exam/behaviour monitoring) from 2026-08-02 to 2027-12-02; Annex I embedded systems to 2028-08-02 — [WinsSolutions: EU AI Act education deadline](https://www.winssolutions.org/eu-ai-act-education-deadline-deferred/); [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/); [Cooley](https://cdp.cooley.com/digital-ai-omnibus-delays-key-deadlines-introduces-new-rules/)
- Article 50 transparency duties (disclose that a person is interacting with an AI system) "continued to apply from August 2, 2026 as originally scheduled"; the grace period for AI-generated content marking was narrowed to 2026-12-02; the Article 4 AI-literacy duty was relaxed but not eliminated — [WinsSolutions](https://www.winssolutions.org/eu-ai-act-education-deadline-deferred/); [Praxikon](https://www.praxikon.com/en/posts/digital-omnibus-high-risk-postponement-december-2027)

### Cited Findings — Japan APPI (snippet only)
- Japan's Cabinet approved an APPI amendment bill introducing new consent exemptions (statistical/AI-development processing of data, including publicly available sensitive data, under transparency and contractual safeguards), enhanced protections for minors, facial-recognition data obligations (public disclosure of handling; opt-out third-party provision prohibited), an administrative monetary penalty (surcharge) system, injunction/qualified-consumer-organization remedies, and a relaxed breach-reporting timeline (30/60 days) for certified organizations — [Fisher Phillips](https://www.fisherphillips.com/en/insights/insights/japanese-cabinet-approves-appi-amendments); [Mori Hamada 2026 newsletter](https://www.morihamada.com/en/insights/newsletters/138006); [Biometric Update, Apr 2026](https://www.biometricupdate.com/202604/japan-introduces-new-rules-on-biometric-data-in-appi-amendment-bill); [Nishimura & Asahi policy direction, Jan 2026](https://www.nishimura.com/en/knowledge/newsletters/data_protection_260120)

### Inferences
- Concrete compliance checklist for the tutor: (1) first-run consent sheet naming the model provider and what is sent (learner text, audio if any), separate from the privacy policy; (2) privacy label declaring "User Content" (and audio) as collected and linked if tied to an account, unless your gateway discards it after the request and you can prove no retention (Anthropic's retention terms apply; note Fable-class models require 30-day retention); (3) IAP for any credits/turn packs, never expiring, with restore; (4) no BYOK unlock on iOS; (5) age gating if the chat can exceed the app's rating; (6) an in-app "report this AI output" control for Play; (7) an always-visible "you are talking to an AI" disclosure for EU users (Article 50); (8) for Japanese residents, a transfer notice/consent for sending data to a foreign AI provider and a minors flow.
- A self-directed consumer tutor that estimates mastery to schedule its own reviews is probably not an Annex III "education" high-risk system (those target institutional admission/assessment/placement/proctoring), but if the product ever issues certificates or is sold to schools for grading, the 2027-12-02 obligations attach. Legal review needed; this is a research inference, not advice.

### Gaps
- Could not fetch the EU AI Act text (Annex III point 3, Article 50) or the Omnibus in the Official Journal; dates are from law-firm summaries via search snippets.
- Could not fetch Google Play policy text (in-app reporting wording, Data Safety form requirements for AI providers, Families policy).
- Could not verify APPI Article 28 cross-border transfer conditions (consent vs adequacy vs "equivalent measures"), the minors' age threshold in the bill, or the bill's Diet passage/effective date.
- Anthropic's data-retention and training-use terms for API traffic were not fetched; needed for the privacy label and 5.1.2(i) disclosure.

---

## KQ5. Efficacy measurement: how Duolingo/Babbel/Busuu ran studies; what an N-of-1 / small-cohort design needs; reporting standards (WWC, EEF)

### Takeaway
Published app efficacy studies are small (54–258 learners), single-arm, self-selected, pre/post or post-only, using ACTFL OPI/OPIc or Pearson Versant mapped to CEFR, with heavy funnel attrition (Duolingo: ~40% of eligible learners attempted the test; 28% of French test-takers got no score). A credible small-cohort claim for a Japanese tutor needs an external instrument (not the tutor's own items), pre-registered retention probes at 1/7/30 days on held-out items, calibration (Brier) scored against those probes, a within-person control (alternating or multiple-baseline single-case design that WWC rates), and reporting against WWC v5.0 / EEF padlock criteria with attrition and power stated.

### Cited Findings
- Duolingo DRR-21-02 (Jiang, Rollinson, Chen, Reuveni, Gustafson, Plonsky, Pajak; 2021-06-01): 156 Spanish and 102 French learners who finished Unit 5 (CEFR A2 aligned), self-reported Duolingo-only, prior proficiency 0–2/10, outside target-language countries, 18+; instrument Pearson Versant Spanish/French (15–17 min, subscores Sentence Mastery 30%, Vocabulary 20%, Fluency 30%, Pronunciation 20%; Versant 36–46 = A2, 47–57 = B1); means 40.97 (SD 11.95) Spanish, 36.72 (SD 8.48) French; 66.03% Spanish and 52.94% French at A2 or above; no control group; $20 incentive; "only about 40% of the learners who were eligible for the test attempted to take the test" (equipment/remote proctoring requirements), 18 French and 20 Spanish started but did not finish, "43 participants (about 28%) in French did not receive a score", 10 French + 19 Spanish excluded for proctoring flags; authors call the French unscored rate "an important limitation" — [Duolingo speaking whitepaper PDF](https://duolingo-papers.s3.amazonaws.com/reports/duolingo-speaking-whitepaper.pdf)
- Babbel (Loewen, Isbell & Sporn 2020, Foreign Language Annals): 54 learners, ~12 hours over 3 months, Spanish; all gained in vocabulary and grammar but "only 59% of them improved in speaking" on ACTFL OPIc; mean ACTFL sublevel 1.81 → 2.52 (Novice Mid); authors called speaking gains "modest" — as summarized in the Duolingo report above and [OUCI record](https://ouci.dntb.gov.ua/en/works/98qqj817/)
- Busuu (Vesselinov & Grego 2016): 61 learners, ~24 hours over 2 months, Spanish; 75% improved on ACTFL OPI; converted sublevels 1.49 → 2.66 — as summarized in the Duolingo report above
- Duolingo reading/listening study (Jiang et al. 2021, Foreign Language Annals 10.1111/flan.12600) reported scaled ACTFL reading around Intermediate High and listening Intermediate Low–High for learners finishing sections; a 2023 comparison judged Busuu's study the most methodologically complete, Duolingo's higher but with "lack of control over influencing factors like study time and prior proficiency", Babbel's weakest (snippet only) — [ACM FET 2023 "Efficacy Analysis of Mobile Language Learning Apps"](https://dl.acm.org/doi/10.1145/3606150.3606152); [Wiley FLA 2021](https://onlinelibrary.wiley.com/doi/10.1111/flan.12600)
- An RCT-style comparison of Duolingo vs classroom vs classroom+Duolingo for beginner French exists in Studies in Second Language Acquisition (details not fetched) — [Cambridge Core](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/comparing-the-effectiveness-of-duolingo-classroom-instruction-and-classroom-duolingo-instruction-conditions-on-beginnerlevel-french-language-development/68C0E7E296669798089C84CDC7F3BB9E)
- WWC Procedures and Standards Handbook v5.0 (Aug 2022, revised Dec 2022) covers group designs and, in Chapter VI, single-case designs (reversal/withdrawal, multiple baseline, alternating treatments, changing criterion); v5.0 updated how SCDs with extra phases/cases are rated so extra data is not penalized (snippet only) — [ERIC ED621928](https://eric.ed.gov/default.aspx?id=ED621928); [WWC SCD training v5.0](https://ies.ed.gov/ncee/wwc/SingleCaseTraining5); [WWC handbooks](https://ies.ed.gov/ncee/wwc/handbooks)
- EEF padlock rating: 0–5 scale created 2011, updated 2019; EEF treats an effect size of 0.2 as educationally meaningful and powers trials for it; average EEF trial rates 3 padlocks; "the most common limiting factor ... has been attrition, followed by power"; ratings cover internal validity only (snippet only) — [EEF: classifying the security of findings (2019)](https://d2tic4wvo1iusb.cloudfront.net/documents/evaluation/peer-review-process/Classifying_the_security_of_EEF_findings_2019.pdf); [EEF blog on gold standard](https://educationendowmentfoundation.org.uk/news/do-eef-trials-meet-the-new-gold-standard); [Chalmers 2026, Review of Education, padlock reliability](https://bera-journals.onlinelibrary.wiley.com/doi/10.1002/rev3.70211)

### Inferences (what a credible claim would require)
- Instrument independence: outcomes on items the tutor never trained on, plus at least one external anchor (a JLPT-style practice test, a Versant/OPIc-like speaking rating by a blind rater, or CEFR-J can-do checklists). Self-report and in-app accuracy alone repeat the Babbel/Duolingo weaknesses.
- Retention probes at 1/7/30 days as pre-registered, scheduled tests on held-out items (not items the scheduler chose), scored blind; report per-item recall probability and the tutor's predicted probability; Brier score = mean (predicted − outcome)^2, with a calibration plot and a comparison against a naive baseline (e.g., constant base rate). Calibration lets you claim "the tutor knows what you know," which is a different and more defensible claim than "learners improved."
- N-of-1 design that WWC can rate: alternating-treatments (tutor-scheduled vs fixed-interval review on matched item sets, randomized per session) or multiple-baseline across item sets, with at least three demonstrations of effect and enough data points per phase (WWC minimums not verified here; see Gaps); pre-register phases, stopping rules, and analysis (Tau-U or standardized mean difference).
- Small cohort (20–60 self-selected learners): report the funnel (eligible → consented → started → completed → scored) with reasons, as the Duolingo report does; keep overall and differential attrition inside WWC's boundaries; compute the minimum detectable effect and say if it is above 0.2 SD; pre/post with a waitlist or delayed-start arm beats single-arm.
- Publication hygiene: pre-registration (OSF), open data for de-identified event ledger, CONSORT-style flow diagram, effect sizes with CIs, and a named external instrument; do not use "efficacy" wording on the store page without this.

### Gaps
- WWC v5.0 numeric thresholds (attrition boundary table, baseline-equivalence 0.05/0.25 SD rule, SCD minimum phases/data points) could not be fetched from ies.ed.gov; verify before writing the protocol.
- EEF padlock criteria table (MDES thresholds, attrition bands) not fetched.
- No JLPT-proxy or CEFR-J instrument validation sources were reachable; nothing found on Brier/calibration scoring in published language-app efficacy work.
- Babbel's and Busuu's first-party efficacy pages were blocked; study details come via the Duolingo report's summary.

---

## KQ6. Accessibility and localization requirements for a global Japanese-learning app

### Takeaway
Fonts are the easy part: BIZ UDPGothic/UDPMincho and Noto Sans JP are SIL OFL 1.1 and can be embedded in apps and web. The hard parts, screen-reader handling of mixed-language text and ruby (furigana), Japanese legal/JIS accessibility expectations, could not be verified from primary sources in this session and remain gaps.

### Cited Findings
- BIZ UDPGothic is under SIL Open Font License 1.1; source and metadata on Google Fonts / googlefonts GitHub; BIZ UDGothic shipped with Windows 10 Japanese Supplemental Fonts (snippet only) — [Google Fonts BIZ UDPGothic](https://fonts.google.com/specimen/BIZ+UDPGothic); [googlefonts/morisawa-biz-ud-gothic](https://github.com/googlefonts/morisawa-biz-ud-gothic); [Microsoft typography](https://learn.microsoft.com/ja-jp/typography/font-list/biz-udgothic)
- Noto Sans JP is SIL OFL: free commercial use, modification, redistribution, web embedding, provided the font is not sold alone (snippet only) — [Noto Sans JP OFL summary](https://www.fonthubs.com/en/fonts/noto-sans-jp)
- Screen readers (JAWS, NVDA, VoiceOver) have pronunciation engines for many languages, but multilingual documents remain "troubled" in practice; correct `lang` tagging is the key lever (snippet only) — [UX Collective on multilingual screen readers](https://uxdesign.cc/the-troubled-state-of-screen-readers-in-multilingual-situations-f6a9da4ecdf3); [Penn State accessibility: foreign languages](https://accessibility.psu.edu/foreignlanguages/)
- Furigana is ruby text; "some people with intellectual disabilities need furigana when reading text" (snippet only) — [TokyoDev: Web accessibility in Japan](https://www.tokyodev.com/articles/web-accessibility-in-japan)
- Apple's 4.7.5 / 1.2.1(a) age-restriction language and 5.1.1 account-deletion rules apply regardless of locale — [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

### Inferences
- Ship a per-element `lang="ja"` / `lang="en"` (and `xml:lang`) strategy in the UI and in TTS requests; a furigana toggle should render `<ruby>` with `<rp>` fallbacks and expose a screen-reader mode that reads either kanji-with-reading or kana only, since ruby is read inconsistently.
- Bilingual UI: keep UI strings in ICU MessageFormat with separate ja/en bundles; avoid concatenated sentences; support system font scaling (Dynamic Type) because kanji legibility collapses at small sizes.
- Font plan: bundle BIZ UDPGothic (universal-design, high legibility) as the learning-text face and Noto Sans JP as fallback; both OFL, no fee, include the OFL text in the app's licenses screen.

### Gaps
- Could not fetch TokyoDev's article on Japan's 2024 amendment to the Act on the Elimination of Discrimination against Persons with Disabilities (reasonable accommodation duty for private businesses) or JIS X 8341-3 details.
- No primary source found on how VoiceOver/TalkBack/PC-Talker read `<ruby>` in 2026; test empirically.
- WCAG 2.2 specifics for vertical text/ruby and Japanese line-breaking (JLReq) not researched.

---

## KQ7. Differentiators reviewers and communities say they would pay for (2025–2026)

### Takeaway
Only fragmentary, secondary evidence was reachable. The recurring paid-tier features and complaints across AI tutors point to: memory of the learner's frequent mistakes and targeted drills (Speak sells this as Premium Plus), unlimited/uncapped conversation (Jumpspeak's "Premium AI"), natural voices (robotic TTS is a top complaint), feedback that goes beyond surface correction, and real retention (users report not retaining what they practise). Reddit/App Store threads themselves could not be fetched.

### Cited Findings
- Speak Premium Plus ($39.99/month or $164.99/year) is sold on "unlimited custom lessons, a personalized study plan, and frequent-mistake targeting" over Premium ($17.99 / $83.99) (snippet only) — [SpeakShark pricing 2026](https://speakshark.com/blog/speak-app-pricing-per-month-2026)
- Jumpspeak reviews: 2/5 rating; "robotic voices, shallow feedback, and the app doesn't give you the tools to really retain what you learn"; hidden second tier "Premium AI" needed to remove daily AI-chat limits; "the pricing model is confusing" (snippet only) — [Mezzoguild Jumpspeak review](https://www.mezzoguild.com/jumpspeak-review/); [Languatalk Jumpspeak review](https://languatalk.com/blog/jumpspeak-review/); [Product Hunt Jumpspeak reviews](https://www.producthunt.com/products/jumpspeak/reviews)
- Duolingo Max's AI features ("Video Call", "Explain My Answer", "Roleplay") are being folded/renamed on some accounts, with Max no longer offered as a new subscription there (snippet only) — [Language App Guide](https://languageappguide.com/pricing/duolingo-cost/)
- Migaku's proposition for Japanese is immersion tooling (browser extension, sentence mining from native media) at $10/month; reviews frame it as a "power tool" (snippet only) — [Migaku learn-Japanese page](https://migaku.com/learn-japanese); [Wordy Migaku review](https://wordy.info/blog/migaku-review); [Immit Migaku review 2026](https://immit.co/blog/migaku-review-2026-is-it-worth-it-for-japanese-learners)
- A learner-author replaced her Japanese textbook with a self-built AI tutor (Substack post; content not fetched) — [Polyglot Claudia](https://polyglotclaudia.substack.com/p/how-i-replaced-my-japanese-textbook)

### Inferences
- The "I wish it would…" list implied by paid tiers and complaints: remember my errors across sessions and drill them; never cap the conversation mid-flow; sound human (voice quality); explain why, not just what; prove I retained it (visible retention/forgetting data); let me learn from my own media (Migaku's wedge); and transparent single-tier pricing.
- For a Japanese tutor specifically, immersion-tool users (Migaku/Anki communities) are price-anchored at ~$10/month and value exportable data (Anki decks) and furigana/pitch tooling; a locked-in AI chat without export will be resisted there.

### Gaps
- No Reddit (r/LearnJapanese), App Store review text, or Product Hunt review text could be fetched; the list above is inferred from tier feature descriptions and reviewer summaries in search snippets and should be validated with a direct read of those threads.
- No source reached for Duolingo Max / Video Call user reviews in 2026.
