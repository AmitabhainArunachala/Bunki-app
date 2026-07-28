/**
 * The one remote provider (WP-07; controller §9, REQ-AI-02 "one remote model
 * first").
 *
 * A direct client for the Anthropic Messages API — `POST /v1/messages`, headers
 * `x-api-key` + `anthropic-version` + `content-type` — written against the
 * injected `AiFetch` rather than an SDK.
 *
 * ## Why no SDK
 *
 * Controller §14 requires every dependency to be name/version/licence-verified
 * at admission and pinned exactly, and §4 forbids adding anything that would
 * constrain the operator's still-open licence choice. `@anthropic-ai/sdk` is not
 * in the verified register, and the surface this package needs is one POST with
 * three headers. The cost of the SDK here is a registry entry, a lockfile
 * change, and a transitive tree to audit, for no capability this work package
 * uses — no streaming (T3 is out of Phase 0), no tools, no batching, no
 * retries. So: a fetch client, and the register stays as WP-00 verified it.
 *
 * That trade is worth restating in the other direction, because it is a real
 * cost: the SDK would give typed request/response shapes, automatic retries on
 * 429/5xx, and drift protection when the API changes. **P2 for a later phase:**
 * revisit once the licence decision lands and multi-provider routing is
 * justified (REQ-AI-02's shadow-evaluation gate).
 *
 * ## The API key
 *
 * Read from the environment, once, per request — never a constructor argument
 * that a caller could hard-code, never a module-level constant a bundler could
 * inline. On the Phase-0 web target `process` does not exist, so the key is
 * *expected* to be absent there and the runtime takes the scripted fallback:
 * REQ-AI-03 says secrets never enter a client bundle, and the honest way to
 * honour that is for the browser build to have no way to hold one.
 *
 * ## Model configuration
 *
 * `claude-opus-5` by default, overridable by `BUNKI_AI_MODEL`. Thinking is on by
 * default on that model and `max_tokens` bounds thinking *and* answer together,
 * which is why the envelope's token ceilings are sized the way they are —
 * see `MAX_TOKENS_CEILING` in `../envelope.ts`. Effort is set to `low`: this is
 * a T2 route with a ten-second budget and a hundred-word answer, and the
 * documented failure modes of disabling thinking outright (internal tags
 * leaking into user-visible text) are worse for this product than the latency
 * saved.
 */

import {
  AiKeyMissingError,
  AiProviderStatusError,
  AiResponseValidationError,
  AiTransportError,
} from '../errors.ts';
import type { AiRequestEnvelope } from '../envelope.ts';
import { buildUserPrompt, SYSTEM_PROMPT } from '../prompt.ts';
import type { AiFetch } from '../platform.ts';
import type { AiProviderCall, AiProviderPort, AiProviderResult } from './port.ts';

/** The only environment variable that may hold the key. Named in `.env.example`. */
export const API_KEY_ENV_VAR = 'ANTHROPIC_API_KEY';
export const MODEL_ENV_VAR = 'BUNKI_AI_MODEL';

export const ANTHROPIC_PROVIDER_NAME = 'anthropic';
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/** Pinned wire version. Changing it is an API-compatibility decision. */
export const ANTHROPIC_API_VERSION = '2023-06-01';

export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * Route effort for the bounded T2 exchange.
 *
 * `low` scopes the model to what was asked instead of exploring, which is what
 * a one-paragraph gloss under a ten-second budget needs.
 */
export const REQUEST_EFFORT = 'low';

export interface AnthropicProviderOptions {
  readonly fetch: AiFetch;
  /** Injected so nothing reads a global; defaults are supplied by the runtime. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly url?: string | undefined;
}

/** The subset of the Messages response this client reads. */
interface MessagesResponse {
  readonly model?: unknown;
  readonly content?: unknown;
  readonly stop_reason?: unknown;
  readonly usage?: { readonly input_tokens?: unknown; readonly output_tokens?: unknown };
}

const asFiniteInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;

/**
 * Concatenate the text blocks of a Messages response.
 *
 * Blocks of other kinds are skipped rather than rejected. On this model family
 * a response legitimately carries `thinking` blocks whose text is empty (the
 * default `display` is `omitted`), and treating a well-formed answer as
 * malformed because it also thought would send every live call to the fallback.
 */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) {
    throw new AiResponseValidationError(['content: expected an array of blocks']);
  }
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const record = block as { type?: unknown; text?: unknown };
    if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text);
  }
  if (parts.length === 0) {
    throw new AiResponseValidationError(['content: no text block in the response']);
  }
  return parts.join('').trim();
}

/**
 * Build the provider.
 *
 * The key is *not* read here — construction must succeed on a runtime that has
 * no key, so that the app can build the runtime once and let each request take
 * the fallback route with a named reason.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions): AiProviderPort {
  const url = options.url ?? ANTHROPIC_MESSAGES_URL;
  const model = options.env[MODEL_ENV_VAR] ?? DEFAULT_MODEL;

  return {
    name: ANTHROPIC_PROVIDER_NAME,
    model,

    async generate(request: AiRequestEnvelope, call: AiProviderCall): Promise<AiProviderResult> {
      const apiKey = options.env[API_KEY_ENV_VAR];
      if (apiKey === undefined || apiKey.trim() === '') {
        throw new AiKeyMissingError(API_KEY_ENV_VAR);
      }

      const body = JSON.stringify({
        model,
        max_tokens: request.maxTokens,
        system: SYSTEM_PROMPT,
        output_config: { effort: REQUEST_EFFORT },
        messages: [{ role: 'user', content: buildUserPrompt(request.threadContext) }],
      });

      let response;
      try {
        response = await options.fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'anthropic-version': ANTHROPIC_API_VERSION,
            'x-api-key': apiKey,
          },
          body,
          signal: call.signal,
        });
      } catch (error) {
        // Transport failure: offline, DNS, TLS, or an abort. The message is the
        // error's own class name, never its text — a fetch rejection can carry a
        // URL with a query string, and this one carries a key in a header.
        throw new AiTransportError(
          error instanceof Error ? error.name : 'unknown transport failure',
        );
      }

      if (!response.ok) throw new AiProviderStatusError(response.status);

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new AiResponseValidationError(['(root): the response body was not JSON']);
      }

      if (typeof parsed !== 'object' || parsed === null) {
        throw new AiResponseValidationError(['(root): expected an object']);
      }
      const message = parsed as MessagesResponse;

      // A safety refusal and a truncated answer are both HTTP 200. Neither is a
      // candidate: one has no content, the other has content that stops
      // mid-sentence, and rendering either as an explanation would be a claim
      // the answer does not support. Both take the labelled fallback route.
      if (message.stop_reason === 'refusal') {
        throw new AiResponseValidationError(['stop_reason: the provider declined this request']);
      }
      if (message.stop_reason === 'max_tokens') {
        throw new AiResponseValidationError([
          'stop_reason: the answer was truncated at max_tokens',
        ]);
      }

      return {
        provider: ANTHROPIC_PROVIDER_NAME,
        // The model that actually answered, as reported — not the one we asked
        // for. They can differ, and the envelope records what ran.
        model: typeof message.model === 'string' && message.model !== '' ? message.model : model,
        text: textOf(message.content),
        inputTokens: asFiniteInt(message.usage?.input_tokens),
        outputTokens: asFiniteInt(message.usage?.output_tokens),
      };
    },
  };
}
