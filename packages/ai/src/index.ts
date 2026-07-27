/**
 * `@bunki/ai` — the bounded AI candidate path (WP-07).
 *
 * One exchange, one route class (T2), one provider behind one port, one
 * scripted fallback. Everything this package produces is a `Candidate*` value.
 *
 * ## The boundary, in one paragraph
 *
 * Controller §9 makes two claims about this package, and they have different
 * strengths. Saying so is the point of this paragraph — V6's verification pass
 * found them stated as one, and the weaker one was not enforced at all.
 *
 * **Nothing here can construct an `EvidenceEvent` or reach memory state.** That
 * one is structural and is enforced three ways: the domain's evidence union is
 * closed and no type exported here is a member of it (compile time); the
 * evidence gate's `assertNotCandidate` rejects anything carrying a candidate
 * marker, including a value that crossed a JSON boundary and lost its class
 * (runtime); and the only domain imports in this package are a schema, a type,
 * and a serialiser — no factory, no reducer, no gate.
 *
 * **Nothing here reads or writes canonical field data.** That one is a property
 * of the shipped source, enforced by a source scan
 * (`test/t09-adapter-boundary.test.ts`) that fails the build if any file under
 * `src/` imports `@bunki/seed` by specifier or by relative path. It is *not* a
 * capability bound: `@bunki/seed`'s exports are live shared objects and are not
 * frozen, so a package that did import them could mutate a headword for every
 * reader in the process. The two controls that would make it a capability bound
 * — an eslint boundary rule and deep-frozen seed exports — are filed as
 * coordination requests in the capsule, because both live on surfaces this work
 * package does not own.
 *
 * A bypass of either is a controller §21.3 stop condition, not a defect to
 * triage.
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
 * | `telemetry.ts`  | route metadata — closed field set, bounded values         |
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
