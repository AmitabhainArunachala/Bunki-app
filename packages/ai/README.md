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
- **Nothing here touches canonical fields or memory state.** Any path where AI
  output reaches canonical or memory state is a controller §21.3 stop condition
  (evidence-boundary bypass), not a bug to triage later.
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
  content** (controller §12, §15).
- In Phase 0 only seeded fixture content may be sent to the provider (OD-08
  default). Real user content requires explicit operator consent recorded
  verbatim in the capsule (controller WP-12 trial rule).

## Envelope shape (controller §9, zod-validated)

- request: `{ taskClass: "T2", inputHash, promptFamilyId, promptVersion, threadContext (minimal), maxTokens }`
- response: `{ candidateId, payload, model, provider, promptVersion, createdAt, checks: { targetFormPresent, isLabeled: true } }`

## Directory map

| Path              | Contents                                       |
| ----------------- | ---------------------------------------------- |
| `src/envelope.ts` | candidate envelope schema                      |
| `src/provider/`   | single remote provider behind `AiProviderPort` |
| `src/fallback/`   | scripted offline fallback fixtures             |

## Status

WP-01 skeleton only.
