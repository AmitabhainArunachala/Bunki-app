/**
 * `@bunki/ai` — the bounded AI candidate path (WP-07).
 *
 * One exchange, one route class (T2), one provider behind one port, one
 * scripted fallback. Everything this package produces is a `Candidate*` value.
 *
 * ## The boundary, in one paragraph
 *
 * Nothing here can construct an `EvidenceEvent` or touch canonical or memory
 * state (REQ-ARCH-04, T-09). That is enforced three ways, not one: the domain's
 * evidence union is closed and no type exported here is a member of it
 * (compile time); the evidence gate's `assertNotCandidate` rejects anything
 * carrying a candidate marker, including a value that crossed a JSON boundary
 * and lost its class (runtime); and the only domain imports in this package are
 * a schema, a type, and a serialiser — no factory, no reducer, no gate. A
 * bypass is a controller §21.3 stop condition, not a defect to triage.
 *
 * ## Reading order
 *
 * | Module          | What it settles                                          |
 * | --------------- | -------------------------------------------------------- |
 * | `envelope.ts`   | the request/response schemas and the deterministic checks |
 * | `consent.ts`    | OD-08: only seeded fixture content leaves the device      |
 * | `provider/`     | the port, and one fetch-based Anthropic client            |
 * | `fallback/`     | the scripted candidates and how they are served           |
 * | `runtime.ts`    | timeout, cancellation, and the never-rejects contract     |
 * | `telemetry.ts`  | route metadata only — never message content               |
 *
 * The WP-01 scaffold's four constants are still exported, from the modules that
 * now own them: `DEFAULT_TIMEOUT_MS` from `runtime.ts`, `CANDIDATE_LABEL` and
 * `OFFLINE_FALLBACK_LABEL` from `labels.ts`.
 */

/** Stable package identifier, for logs and the capsule. */
export const PACKAGE_NAME = '@bunki/ai';

export * from './errors.ts';
export * from './labels.ts';
export * from './platform.ts';
export * from './hash.ts';
export * from './envelope.ts';
export * from './prompt.ts';
export * from './consent.ts';
export * from './telemetry.ts';
export * from './provider/port.ts';
export * from './provider/anthropic.ts';
export * from './fallback/index.ts';
export * from './runtime.ts';
