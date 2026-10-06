# Track 05 — Claude platform

Research cutoff: **2026-09-28**. All sources below were accessed **2026-09-28**; documentation is **undated** unless stated. Prices are USD, before tax. `MTok` means one million tokens. Facts are provider documentation, not independent capability tests. **DESIGN** means a recommendation; **ESTIMATE** means arithmetic under stated assumptions; **UNVERIFIED** identifies an unresolved claim. No post-cutoff material is intentionally used.

## Takeaway

**DESIGN:** Use an application-owned, narrowly scoped tool loop, replayed from the local ledger, rather than provider-hosted learner memory. Keep every mutation behind a locally rendered confirmation and do not expose any review-state or due-date writer as a model tool. Schema-constrained output helps parse proposals; it cannot establish Japanese correctness or learner knowledge.

**LAW CONFLICT:** Under the owner's literal law that the export file is the only way learner data leaves the device, live personalized Claude calls—including the existing browser BYOK door—are not compliant. Neither ZDR nor a gateway cures egress. The executable baseline must use local inference/retrieval or a clearly labeled deterministic tutor; remote Claude can process a learner-created export file outside the app, with locally validated proposal-file import. A live gateway is a conditional future design requiring an explicit change to the law, not an implicit interpretation. This is derived from the supplied laws, dated 2026-09-28, not a vendor claim.

## Cited findings

### Current model inventory

The official overview describes text/image input, text output and tool use for the current lineup. The following limits and IDs are documented, not a guarantee of access in a particular account. [C01]

| Model | Exact Claude API ID | Context tokens | Maximum output tokens | Base input / output $ per MTok |
|---|---|---:|---:|---:|
| Fable 5.1 | `claude-fable-5-1` | 1,000,000 | 128,000 | 10 / 50 |
| Opus 5.5 | `claude-opus-5-5` | 1,000,000 | 128,000 | 4 / 20 |
| Sonnet 5 | `claude-sonnet-5` | 1,000,000 | 128,000 | 2 / 10 |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | 200,000 | 64,000 | 1 / 5 |

IDs/limits: [C01]. Prices: [C02]. A stale search-index excerpt described Sonnet 5's $2/$10 as introductory through 2026-08-31 and $3/$15 thereafter. The **fetched** pricing, overview, and dedicated Sonnet page all instead state $2/$10. Use $2/$10 as the retrieved current quote; historical explanation of the discrepancy is **UNVERIFIED**. The Sonnet page warns its tokenizer produces approximately 30% more tokens than Sonnet 4.6 for the same text, so use the token-count endpoint on actual Japanese prompts. [C03]

### Cache and batch price card

| Model | 5-minute write $/MTok | 1-hour write $/MTok | Cache read $/MTok | Batch input / output $/MTok |
|---|---:|---:|---:|---:|
| Fable 5.1 | 12.50 | 20.00 | 0.25 | 5 / 25 |
| Opus 5.5 | 5.00 | 8.00 | 0.20 | 2 / 10 |
| Sonnet 5 | 2.50 | 4.00 | 0.20 | 1 / 5 |
| Haiku 4.5 | 1.25 | 2.00 | 0.10 | 0.50 / 2.50 |

Source: [C02]. These are token prices, not subscription prices.

Caching needs an identical prefix; rewriting the learner snapshot on every turn invalidates the changed prefix. The default TTL is 5 minutes, refreshed on hits; the alternative is 1 hour. Minimum cacheable prefixes are 512 tokens for Fable 5.1/Opus 5.5, 1,024 for Sonnet 5, and 4,096 for Haiku 4.5. Cache hits are organization/workspace isolated; cached representations stay in memory and cannot be manually purged through this API. [C04]

**ESTIMATE: requested 6,000-token context, 40 turns/day.** This is context input only, excluding user input, assistant output, tools, thinking, retries and infrastructure. One initial write and 39 hits require requests to stay within the selected TTL; 40 turns spread over a day do not imply 39 hits.

| Model | No cache $/day | One 5m write + 39 hits $/day | One 1h write + 39 hits $/day |
|---|---:|---:|---:|
| Haiku 4.5 | 0.2400 | 0.0309 | 0.0354 |
| Sonnet 5 | 0.4800 | 0.0618 | 0.0708 |
| Opus 5.5 | 0.9600 | 0.0768 | 0.0948 |
| Fable 5.1 | 2.4000 | 0.1335 | 0.1785 |

Arithmetic: `uncached=6000*40*I/1e6`; `cached=6000*(W+39*H)/1e6`, with rates from [C02]. With `s` daily sessions, use `6000*(s*W+(40-s)*H)/1e6`, provided each session's later requests hit. Updating context can increase `s` beyond the human session count.

**ESTIMATE: fuller monthly envelope.** Assumptions: 30 days/month; 6,000 cached-context tokens plus 1,000 uncached input tokens and 600 billed output tokens per turn; one cache write/day; remaining turns all hit a 5-minute cache. These are planning inputs, not observed Bunki usage. Tool loops create additional calls; billed thinking must fit inside the 600-token assumption or be added separately.

| Model | 30 turns/day: no cache / cache | 40 turns/day: no cache / cache | 60 turns/day: no cache / cache |
|---|---:|---:|---:|
| Haiku 4.5 | $9.000 / $4.347 | $12.000 / $5.727 | $18.000 / $8.487 |
| Sonnet 5 | $18.000 / $8.694 | $24.000 / $11.454 | $36.000 / $16.974 |
| Opus 5.5 | $36.000 / $16.344 | $48.000 / $21.504 | $72.000 / $31.824 |
| Fable 5.1 | $90.000 / $39.555 | $120.000 / $52.005 | $180.000 / $76.905 |

`month_uncached=30*t*((6000+1000)*I+600*O)/1e6`; `month_cached=30*(6000*W+(t-1)*6000*H+t*(1000*I+600*O))/1e6`. Rate inputs [C02]. Taxes, FX, retries, storage, moderation, support, store fees and audio are excluded. Strict local mode has **$0 provider inference spend by design**, but nonzero hardware/energy/development costs that this campaign has not measured.

Batch processes independent requests asynchronously at a 50% token discount. Limits are 100,000 requests or 256 MB per batch; unfinished requests expire at 24 hours; results remain downloadable for 29 days. The documentation describes most batches as finishing within 1 hour, a vendor statement rather than SLA. [C05] **ESTIMATE:** a nightly job of 12,000 input + 1,200 output tokens on Haiku batch costs `(12000*.5+1200*2.5)/1e6=$0.009/day=$0.27/30days`, excluding retries. This is appropriate for public content preparation or manually exported jobs only under current law. It is not an authorized background learner-data upload.

### Tools, schemas, streaming and reasoning

| Capability | Documented behavior | Bunki implication — DESIGN |
|---|---|---|
| Client tools | Model emits `tool_use`; the application executes and returns `tool_result`; the loop continues. [C06] | Interpose local policy validation and learner confirmation before each proposed action; do not blindly use an automatic tool runner. |
| Strict schema | `output_config.format` provides JSON schema output; `strict:true` constrains tool input. Refusals/truncation still require handling; unsupported numeric constraints need application validation. [C07] | Validate node IDs, source spans, provenance tier and allowed action. No schema field for AI card grade, review-state edit or invented due date. |
| Streaming | Server-sent events carry text, thinking and tool deltas. [C08] | Stream a waiting/explanation UI, but buffer generated Japanese teaching text until verification; never execute a partial JSON delta. |
| Reasoning | Adaptive thinking chooses reasoning depth; `output_config.effort` controls effort. Effort is not a token budget; `max_tokens` caps thinking plus response. Top-level effort changes can invalidate cached prefixes. [C09] | Set explicit effort per job and hard output/spend/time limits. Evaluate accuracy at the least expensive acceptable setting. |

**DESIGN:** Proposed exported-file job policy: Haiku for bounded extraction and drafts; Sonnet for ordinary tutoring and diagnostic proposals; Opus for difficult pedagogical adjudication only after a failed local check; no Fable default because this scope has no demonstrated need. This is an engineering hypothesis to test against human Japanese teachers, not evidence that any tier achieves a required Japanese error rate. A second model's agreement is not a verified reading or grammar proof.

### Memory, Agent SDK, Managed Agents, MCP and voice

The memory tool is client-side: the app implements file-like memory operations and controls storage. [C10] The Agent SDK embeds Claude Code's loop and capabilities in Python/TypeScript, including tools, permissions, hooks and sessions; it is not an on-device Claude model. Third-party products cannot use claude.ai login/rate limits without approval. [C11] Managed Agents hosts a stateful harness, retaining transcripts until deletion; it is not ZDR-eligible. [C12] The Messages MCP connector talks to remote MCP servers and is not ZDR-eligible. [C13]

**DESIGN:** Do not use provider memory stores or mutable memory files as a learner model. Store a proposed session summary as a local ledger row with source event IDs, model/version, validation status and learner confirmation; corrections append superseding rows. Derive session context from ledger evidence and retrieve cited source exchanges locally. Session summaries remain observed evidence and cannot establish level claims. Tool-based retrieval is read-only unless the learner confirms a mutation proposal. The same schema stores any learner's interests/goals; none belongs in a prompt template's code.

The retrieved Claude model docs specify text/image input and text output. Anthropic's voice cookbook composes external ElevenLabs STT/TTS around Claude; the compatibility endpoint explicitly says audio input is unsupported. A native production Claude audio API was **not verified** in the official material reviewed. [C01, C14, C15]

### Rate limits, retention, regions and keys

Rate limits are per organization/model and measured in RPM, input TPM and output TPM, with account-specific limits available in Console/API. The fetched default table shows 1,000 RPM / 2,000,000 input TPM / 400,000 output TPM for Sonnet 5, Opus 5.5 and Haiku 4.5; new Evaluation accounts can have lower limits. Spend caps shown are Start $500, Build $1,000 and Scale $200,000/month. Cached reads generally do not count toward input TPM. [C16] **DESIGN:** Never promise these limits to users; queue jobs, respect `retry-after`, distinguish exhausted spend caps from transient throttling, and enforce per-user budgets before provider requests.

ZDR eligibility is conditional on a commercial arrangement, model and feature. Batch is excluded with 29-day retention; Managed Agents transcripts persist until deletion; Fable 5.1 and Mythos 5.1 require 30-day retention absent express authorization. ZDR organizations cannot use browser CORS; a backend proxy is required. Flagged content/legal holds can create exceptions. [C17] **UNVERIFIED:** Bunki's ability to obtain a ZDR contract; do not advertise it merely because an endpoint is eligible.

First-party inference geography accepts `global` or `us`; US-only on supported Claude 4.6+ models costs 1.1× all token categories. Haiku 4.5 does not support the parameter. Workspace geo is currently US only. Bedrock/Google/Foundry have their own routing mechanisms. [C18] **UNVERIFIED:** Japan-only first-party inference; no such option appears in the retrieved contract.

The official TypeScript SDK disables browser use by default because exposed secret API credentials are unsafe; `dangerouslyAllowBrowser:true` explicitly overrides it. [C19] **DESIGN:** Ship no vendor secret in a website, mobile binary, source map or remote config. Strict mode has no live provider path. A file-processing service can keep its own provider key server-side, accept only the export that the learner deliberately uploads, meter that job and return a proposal file. Under a separately authorized future live-transport law, use an authenticated gateway with short-lived app credentials, per-user budgets, narrow model/tool allowlists, redacted operational logs and no server learner-model authority. Native BYOK vaulting protects a key at rest but cannot make an untrusted web runtime secret or make egress compliant.

## Inferences

1. **Memory should be replayable evidence, not prose authority.** Model memory is useful for continuity, but any summary can be wrong; retained source references and append-only corrections allow reconstruction and audit.
2. **Cache stability should follow pedagogy.** Freeze a session-start derived context, append recent dialogue after it, and update a compact snapshot only when needed. Do not deliberately delay a correction to preserve cache savings.
3. **Verification is a release gate.** Japanese text, card proposals and exercises should have token/reading/source checks and pedagogical status before teaching. Partial streaming output cannot bypass this gate.
4. **Tool proposals are capability boundaries.** Give the model query/proposal interfaces, not database access; the local application and learner perform confirmation. FSRS-6 alone computes schedule consequences from confirmed reviews.
5. **Costs are usage-dependent.** Billing needs observed token distributions, cache-hit rates and tool-call fanout from an opt-in benchmark/export trial before price promises.

## Gaps

- **UNVERIFIED:** model Japanese teaching accuracy, error-diagnosis precision, latency and extraction calibration on Bunki's users; no direct API experiment was run.
- **UNVERIFIED:** historical reason for Sonnet introductory-price search snippet disagreement; fetched pages converge on $2/$10.
- **UNVERIFIED:** provider account access, contracted retention, regional availability and actual rate tier.
- **UNVERIFIED:** mobile low-memory local LLM meeting the desired tutor quality. Local retrieval/dialogue templates can ship first, but must be labeled as such.
- Owner must resolve whether a live personalized tutor or literal export-only egress has priority. Until a law change, the latter governs.

## Source register

All accessed 2026-09-28; each is official. Publication date **undated** except where specified. Limit synthesis to roughly 200 words/source across the deliverable; figures are data, descriptions here are concise paraphrases.

- C01 — Models overview: https://platform.claude.com/docs/en/models/overview (undated).
- C02 — Pricing: https://platform.claude.com/docs/en/about-claude/pricing (undated).
- C03 — Sonnet 5 changes: https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5 (undated).
- C04 — Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching (undated).
- C05 — Batch processing: https://platform.claude.com/docs/en/build-with-claude/batch-processing (undated).
- C06 — Tool loop: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works (undated).
- C07 — Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (undated).
- C08 — Streaming: https://platform.claude.com/docs/en/build-with-claude/streaming (undated).
- C09 — Effort: https://platform.claude.com/docs/en/build-with-claude/effort (undated).
- C10 — Memory tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool (undated).
- C11 — Agent SDK: https://code.claude.com/docs/en/agent-sdk/overview (undated).
- C12 — Managed Agents: https://platform.claude.com/docs/en/managed-agents/overview (undated).
- C13 — MCP connector: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector (undated).
- C14 — Voice cookbook: https://platform.claude.com/cookbook/third-party-elevenlabs-low-latency-stt-claude-tts (date not displayed; indexed about 10 months before access, exact date UNVERIFIED).
- C15 — OpenAI-compatible endpoint: https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk (undated).
- C16 — Rate limits: https://platform.claude.com/docs/en/api/rate-limits (undated).
- C17 — API retention: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention (undated).
- C18 — Residency: https://platform.claude.com/docs/en/manage-claude/data-residency (undated).
- C19 — Official TypeScript SDK: https://github.com/anthropics/anthropic-sdk-typescript (living repository, undated snapshot).
