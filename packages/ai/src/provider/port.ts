/**
 * `AiProviderPort` — the one seam every model sits behind (WP-07;
 * REQ-AI-03 "the AI adapter is provider-independent", controller §9).
 *
 * The port is deliberately smaller than any provider's own API. It takes a
 * validated request envelope and an abort signal, and returns text plus token
 * counts. It cannot stream (T3 is out of Phase 0), cannot call tools, cannot
 * retry on its own, and has no opinion about fallback — the runtime owns all of
 * that, so swapping a provider cannot change *when* a fallback is served or
 * *how long* a caller waits.
 *
 * What the port returns is deliberately not a `AiCandidateEnvelope`: an adapter
 * hands back raw text and usage numbers, and the runtime is what mints a
 * candidate id, stamps the injected clock, and runs the deterministic checks. A
 * provider that could mint its own envelope could mint one whose `checks` it had
 * decided for itself, and the checks would then be the model's claim about
 * itself rather than a check (REQ-AI-04).
 *
 * Phase 0 has exactly one implementation (`./anthropic.ts`). Multi-provider
 * routing is excluded by controller §19 WP-07 until a shadow evaluation
 * justifies it (REQ-AI-02).
 */

import type { AiRequestEnvelope } from '../envelope.ts';
import type { AiAbortSignal } from '../platform.ts';

export interface AiProviderCall {
  /** Cancellation, from the timeout or from the caller, or both. */
  readonly signal: AiAbortSignal;
}

/**
 * What one exchange produced.
 *
 * `text` is unvalidated model output. It is a `string` and nothing has looked at
 * it yet; the runtime is what puts it through the payload schema, the length
 * ceilings and the target-form check before anything can render it.
 */
export interface AiProviderResult {
  readonly provider: string;
  /** The model that actually answered, as the provider reported it. */
  readonly model: string;
  readonly text: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface AiProviderPort {
  /** Stable identifier for logs and for the envelope's `provider` field. */
  readonly name: string;
  /** The model this adapter is configured for, before the provider confirms it. */
  readonly model: string;
  /**
   * @throws AiKeyMissingError, AiTransportError, AiProviderStatusError,
   *   AiResponseValidationError, AiCancelledError — never a bare `Error`, so the
   *   runtime can label the outcome without parsing a message.
   */
  generate(request: AiRequestEnvelope, call: AiProviderCall): Promise<AiProviderResult>;
}
