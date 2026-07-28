# @bunki/ai

**Owner WP:** WP-07 (envelope, provider port, fallback fixtures, candidate UI slice).

**LICENSE: pending operator decision** (controller §4, OD-09).

## What this package is

One bounded AI exchange, behind one interface, producing **candidates** — never
facts, never grades, never memory state.

## The boundary that matters most (controller §5, §9 — T-09)

- **`Candidate*` types are not assignable to evidence types.** Nothing in this
  package can construct an `EvidenceEvent`; only `@bunki/domain/src/evidence` can
  (REQ-ARCH-04). This is enforced at compile time _and_ by a runtime guard.
- **Nothing here reaches memory state**, structurally — this package imports no
  reducer, no gate and no event factory.
- **Nothing here reads or writes canonical field data**, as a property of the
  shipped source rather than a capability bound. `test/t09-adapter-boundary.test.ts`
  fails the build if any file under `src/` imports `@bunki/seed`, by specifier or
  by relative path. Stated precisely because the stronger claim would be false:
  `@bunki/seed`'s exports are not frozen, so a package that _did_ import them
  could mutate a headword for every reader in the process. Two coordination
  requests are open to close that properly — an eslint boundary rule and
  deep-frozen seed exports — both on surfaces WP-07 does not own.
- Any path where AI output reaches canonical or memory state is a controller
  §21.3 stop condition (evidence-boundary bypass), not a bug to triage later.
- **Accepting a candidate is an explicit user action** producing
  `CandidateAcceptedAsNote` with `userAction: true`. Never automatic.
- **Candidates render with a visible "AI candidate / generated" label** (T-12).
  An unlabeled candidate is a defect of the same severity as a wrong answer.

## Secrets and privacy (controller §9, §15)

- API key via **environment variable only**. `.env` is git-ignored; `.env.example`
  is committed and contains **no secret**.
- Requests time out at **10 s** by default and are cancellable. On timeout or
  offline, the scripted fallback in `src/fallback/` serves a fixture-based
  candidate labeled `offline-fallback` (T-10, T-11).
- Log **route class, latency, token counts, and fallback use — never message
  content** (controller §12, §15). Enforced as a **closed field set plus bounded
  values**: `AiRouteRecord` admits fourteen named scalars and nothing else, and
  `assertNoMessageContent` checks each one's type and, for strings, its ceiling.
  Both halves are needed — `model` is copied out of the provider's answer, so a
  closed field set alone let a provider put five kilobytes of its own text into
  the ring without adding a field.
- In Phase 0 only seeded fixture content may be sent to the provider (OD-08
  default). Real user content requires explicit operator consent recorded
  verbatim in the capsule (controller WP-12 trial rule).

## Envelope shape (controller §9, zod-validated)

- request: `{ taskClass: "T2", inputHash, promptFamilyId, promptVersion, threadContext (minimal), maxTokens }`
- response: `{ candidateId, payload, model, provider, promptVersion, createdAt, checks: { targetFormPresent, isLabeled: true } }`

## Directory map

| Path               | Contents                                                     |
| ------------------ | ------------------------------------------------------------ |
| `src/envelope.ts`  | request/response schemas, ceilings, deterministic checks     |
| `src/prompt.ts`    | the one prompt family, versioned                             |
| `src/consent.ts`   | the OD-08 allowlist — fails closed                           |
| `src/provider/`    | `AiProviderPort` + one fetch-based Anthropic Messages client |
| `src/fallback/`    | scripted offline fixtures and how they are served            |
| `src/runtime.ts`   | timeout, cancellation, and the never-rejects contract        |
| `src/telemetry.ts` | route metadata sink and ring — closed fields, bounded values |
| `src/hash.ts`      | SHA-256 for `inputHash`                                      |
| `src/platform.ts`  | the declared platform surface (`fetch`, abort, timers)       |

## What a caller does

```ts
const runtime = createAiRuntime({ provider, clock, nextCandidateId });
const { envelope, route } = await runtime.requestCandidate({ context, signal });
```

`requestCandidate` **never rejects for a runtime condition.** Missing key,
offline, timed out, hostile answer, un-consented content — each resolves with a
valid candidate whose `provider` is `offline-fallback` and whose `route.fallbackReason`
names what happened. That is T-10 and T-11 expressed as a type: a caller cannot
forget to handle a failure that cannot be thrown. It _does_ throw for a caller
bug — an input that cannot form a valid request envelope.

## Why there is no SDK dependency

Controller §14 requires every dependency to be licence-verified at admission and
pinned exactly, and §4 forbids adding anything that constrains the operator's
open licence choice. The surface this package needs is one `POST` with three
headers, and none of the SDK's capabilities (streaming, tools, batching,
retries) are in Phase-0 scope. The trade is real and recorded: no typed wire
shapes, no built-in retry, no drift protection. **P2 for a later phase** —
revisit alongside REQ-AI-02's multi-provider shadow evaluation.

## Status

WP-07 complete: envelope, consent boundary, provider port + Anthropic client,
timeout/cancellation, scripted fallback, telemetry.

**Open (operator gate, controller §22.3 / OD-08):** no live call has been made.
Every test drives an injected `fetch` with no transport behind it, and
`test/telemetry-and-no-live-calls.test.ts` asserts the package never reaches an
ambient network. Live-call evidence is recorded as OPEN in
`docs/build-evidence/CAPSULE.md` and stays open until the operator provides a key
and a budget cap.
