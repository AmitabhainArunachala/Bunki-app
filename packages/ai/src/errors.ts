/**
 * Failure vocabulary for the bounded AI path (WP-07).
 *
 * Every error here is a *named* outcome rather than a bare `Error`, for the
 * same reason the evidence gate names its rejection reasons: the candidate path
 * has exactly one honest response to each failure — serve the scripted fallback
 * and say so — and a caller that cannot tell a missing key from a malformed
 * response cannot label what the learner is looking at.
 *
 * None of these carry message content. A provider error that quoted the prompt
 * or the model's text back into a log message would defeat controller §15 at
 * the one place it is easiest to defeat it, so the fields are route metadata
 * only (status codes, durations, field paths).
 */

/** Why the live route did not produce a candidate. Closed set; drives the label. */
export const FALLBACK_REASONS = [
  /** No API key in the environment (OD-08 gate not yet opened, or a client bundle). */
  'no_api_key',
  /** The 10 s budget expired (controller §9). */
  'timeout',
  /** The caller cancelled — a screen unmounted, a learner navigated away. */
  'cancelled',
  /** Transport failed: offline, DNS, TLS, connection reset. */
  'offline',
  /** The provider answered with a non-2xx status. */
  'provider_error',
  /** The provider answered, but not in a shape the envelope accepts. */
  'invalid_response',
  /** OD-08: the request carried content that is not seeded fixture content. */
  'content_not_permitted',
] as const;

export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export class AiError extends Error {
  readonly reason: FallbackReason;

  constructor(reason: FallbackReason, message: string) {
    super(message);
    this.name = 'AiError';
    this.reason = reason;
  }
}

/**
 * The API key is absent.
 *
 * Not a configuration bug to fix at the call site: on the Phase-0 web target
 * the key is *expected* to be absent, because a secret that reached the client
 * bundle would violate REQ-AI-03. This error is the normal path into the
 * fallback there.
 */
export class AiKeyMissingError extends AiError {
  readonly variableName: string;

  constructor(variableName: string) {
    super(
      'no_api_key',
      `no API key in the environment variable ${variableName}; the bounded AI path serves its scripted fallback instead`,
    );
    this.name = 'AiKeyMissingError';
    this.variableName = variableName;
  }
}

export class AiTimeoutError extends AiError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super('timeout', `the AI request exceeded its ${String(timeoutMs)} ms budget and was aborted`);
    this.name = 'AiTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class AiCancelledError extends AiError {
  constructor() {
    super('cancelled', 'the AI request was cancelled by its caller');
    this.name = 'AiCancelledError';
  }
}

export class AiTransportError extends AiError {
  constructor(detail: string) {
    super('offline', `the AI provider could not be reached: ${detail}`);
    this.name = 'AiTransportError';
  }
}

/** A non-2xx answer. Carries the status only — never the body. */
export class AiProviderStatusError extends AiError {
  readonly status: number;

  constructor(status: number) {
    super('provider_error', `the AI provider answered with HTTP ${String(status)}`);
    this.name = 'AiProviderStatusError';
    this.status = status;
  }
}

/**
 * The answer did not satisfy the response envelope.
 *
 * `issues` are zod paths and messages, which name *fields*, not values. A
 * hostile or oversized payload therefore fails loudly without any of it
 * reaching a log (controller §17.2's hostile-response lane).
 */
export class AiResponseValidationError extends AiError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('invalid_response', `the AI response did not satisfy its envelope: ${issues.join('; ')}`);
    this.name = 'AiResponseValidationError';
    this.issues = issues;
  }
}

/**
 * The request carried content the Phase-0 privacy boundary does not allow.
 *
 * OD-08's Phase-0 default is *seeded fixture content only*. This is thrown
 * before any transport call, so un-consented content cannot leave the device
 * even once.
 */
export class AiContentNotPermittedError extends AiError {
  constructor(detail: string) {
    super(
      'content_not_permitted',
      `Phase-0 sends only seeded fixture content to the AI provider (OD-08): ${detail}`,
    );
    this.name = 'AiContentNotPermittedError';
  }
}

/** A request envelope that would not survive its own schema. */
export class AiRequestValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`the AI request envelope is invalid: ${issues.join('; ')}`);
    this.name = 'AiRequestValidationError';
    this.issues = issues;
  }
}

/** Narrow an unknown throw to its fallback reason. */
export function fallbackReasonOf(error: unknown): FallbackReason {
  if (error instanceof AiError) return error.reason;
  return 'offline';
}
