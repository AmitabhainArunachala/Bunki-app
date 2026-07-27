/**
 * The bounded exchange, end to end (WP-07; controller §9, REQ-ARCH-06,
 * T-10, T-11).
 *
 * One function is the whole public behaviour of this package:
 *
 * ```
 * requestCandidate(input) →
 *   build + validate the request envelope
 *   → OD-08 consent check          (before any transport call)
 *   → provider call, 10 s budget, cancellable
 *   → validate + deterministically check the answer
 *   → on ANY failure: scripted fallback, labelled
 *   → always: one content-free telemetry record
 * ```
 *
 * ## The property that matters
 *
 * **It never rejects.** `requestCandidate` resolves with a candidate on every
 * path — key missing, offline, timed out, hostile answer, content refused.
 * That is not error-swallowing; it is T-10 and T-11 expressed as a type. A
 * caller that had to handle a rejection would be a caller that could get it
 * wrong, and getting it wrong here means a screen that hangs or a capture that
 * waits on the network. The failure is *recorded* — in the route record's
 * `fallbackReason`, and visibly on the envelope's `provider` — rather than
 * thrown.
 *
 * The one thing that does throw is a caller error: an input that cannot form a
 * valid request envelope at all. That is a bug in the calling code, not a
 * runtime condition, and hiding it behind a fixture would hide the bug.
 *
 * ## Timeout and cancellation
 *
 * Ten seconds by default (controller §9). The budget is enforced by aborting
 * the in-flight request, not by racing a promise and walking away: an
 * unabortable request keeps a socket and a token spend alive after the caller
 * has stopped caring, and "cancellable" would then be true only of the caller's
 * attention. The caller's own signal is linked to the same controller, so a
 * screen that unmounts cancels the call it started.
 *
 * ## What this file cannot do
 *
 * It cannot construct an `EvidenceEvent`, touch a `MemoryState`, or write a
 * canonical field — it imports nothing that could (REQ-ARCH-04, T-09). Its
 * output is a `Candidate*` type, which the domain's closed evidence union does
 * not admit, and which the gate's runtime guard rejects on sight.
 */

import { DEFAULT_CONTENT_POLICY, type AiContentPolicy } from './consent.ts';
import {
  AiCancelledError,
  AiKeyMissingError,
  AiTimeoutError,
  fallbackReasonOf,
  type FallbackReason,
} from './errors.ts';
import {
  candidatePayloadSchema,
  parseAiCandidateEnvelope,
  parseAiRequestEnvelope,
  targetFormPresent,
  TASK_CLASS,
  type AiCandidateEnvelope,
  type AiRequestEnvelope,
  type AiThreadContext,
} from './envelope.ts';
import { serveFallbackCandidate } from './fallback/index.ts';
import { inputHashOf } from './hash.ts';
import { OFFLINE_FALLBACK_PROVIDER } from './labels.ts';
import { ambientPlatform, linkAbort, type AiAbortSignal, type AiPlatform } from './platform.ts';
import { DEFAULT_MAX_TOKENS, hashableInputOf, PROMPT_FAMILY_ID, PROMPT_VERSION } from './prompt.ts';
import { API_KEY_ENV_VAR } from './provider/anthropic.ts';
import type { AiProviderPort, AiProviderResult } from './provider/port.ts';
import { NULL_TELEMETRY_SINK, type AiRouteRecord, type AiTelemetrySink } from './telemetry.ts';

/** Controller §9: requests time out at 10 s by default. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export interface AiRuntimeClock {
  /** Canonical ISO-8601 UTC instant, for the envelope's `createdAt`. */
  now(): string;
  /** Monotonic-ish milliseconds, for latency only. Never stored in an event. */
  elapsedMs(): number;
}

export interface AiRuntimeOptions {
  readonly provider: AiProviderPort;
  readonly clock: AiRuntimeClock;
  /** Mints `candidateId`s. The app passes the same generator the kernel uses. */
  readonly nextCandidateId: () => string;
  readonly platform?: AiPlatform | undefined;
  readonly timeoutMs?: number | undefined;
  readonly contentPolicy?: AiContentPolicy | undefined;
  readonly telemetry?: AiTelemetrySink | undefined;
  readonly maxTokens?: number | undefined;
}

export interface CandidateRequestInput {
  readonly context: AiThreadContext;
  /** Caller cancellation — a screen unmounting, a learner navigating away. */
  readonly signal?: AiAbortSignal | undefined;
  readonly maxTokens?: number | undefined;
}

export interface AiCandidateOutcome {
  readonly envelope: AiCandidateEnvelope;
  readonly request: AiRequestEnvelope;
  /** The content-free record also handed to the telemetry sink. */
  readonly route: AiRouteRecord;
}

export interface AiRuntime {
  /** Never rejects for a runtime condition — see this file's header. */
  requestCandidate(input: CandidateRequestInput): Promise<AiCandidateOutcome>;
  /** The request envelope alone, for callers that want to inspect before sending. */
  buildRequest(context: AiThreadContext, maxTokens?: number): AiRequestEnvelope;
  readonly timeoutMs: number;
  readonly providerName: string;
}

/**
 * Run one provider call under a deadline, with two independent cancellers.
 *
 * @throws AiTimeoutError when the budget expires; AiCancelledError when the
 *   caller aborts; whatever the provider threw otherwise.
 */
async function callWithDeadline(
  provider: AiProviderPort,
  request: AiRequestEnvelope,
  platform: AiPlatform,
  timeoutMs: number,
  callerSignal: AiAbortSignal | undefined,
): Promise<AiProviderResult> {
  const controller = platform.newAbortController();
  const detach = linkAbort(callerSignal, controller);

  let timedOut = false;
  const timer = platform.timers.start(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await provider.generate(request, { signal: controller.signal });
  } catch (error) {
    // Order matters: a caller cancellation and a timeout both surface at the
    // provider as an aborted transport, and reporting a learner's own
    // navigation as a ten-second timeout would put a latency regression in the
    // observability ring that never happened.
    if (timedOut) throw new AiTimeoutError(timeoutMs);
    if (callerSignal?.aborted === true) throw new AiCancelledError();
    throw error;
  } finally {
    platform.timers.stop(timer);
    detach();
  }
}

export function createAiRuntime(options: AiRuntimeOptions): AiRuntime {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const contentPolicy = options.contentPolicy ?? DEFAULT_CONTENT_POLICY;
  const telemetry = options.telemetry ?? NULL_TELEMETRY_SINK;
  const defaultMaxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const { provider, clock, nextCandidateId } = options;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('the AI request timeout must be a positive number of milliseconds');
  }

  const buildRequest = (context: AiThreadContext, maxTokens?: number): AiRequestEnvelope =>
    parseAiRequestEnvelope({
      taskClass: TASK_CLASS,
      inputHash: inputHashOf(hashableInputOf(context)),
      promptFamilyId: PROMPT_FAMILY_ID,
      promptVersion: PROMPT_VERSION,
      threadContext: context,
      maxTokens: maxTokens ?? defaultMaxTokens,
    });

  /**
   * Turn raw provider text into a validated, checked envelope.
   *
   * Every ceiling and every check runs here, on the way *out* of the provider
   * and before anything can hold the value. A hostile answer — oversized,
   * mislabelled, schema-violating, or carrying injected instructions — fails
   * this step and takes the fallback route (controller §17.2's lane).
   */
  const envelopeOf = (
    request: AiRequestEnvelope,
    result: AiProviderResult,
  ): AiCandidateEnvelope => {
    const payload = candidatePayloadSchema.parse({
      targetForm: request.threadContext.targetForm,
      explanation: result.text,
    });

    return parseAiCandidateEnvelope({
      candidateId: nextCandidateId(),
      payload,
      model: result.model,
      provider: result.provider,
      promptVersion: request.promptVersion,
      createdAt: clock.now(),
      checks: { targetFormPresent: targetFormPresent(payload), isLabeled: true },
    });
  };

  const record = (
    request: AiRequestEnvelope,
    envelope: AiCandidateEnvelope,
    fallbackReason: FallbackReason | null,
    latencyMs: number,
    tokens: { input: number | null; output: number | null },
  ): AiRouteRecord => ({
    taskClass: TASK_CLASS,
    outcome: fallbackReason === null ? 'live' : 'fallback',
    fallbackReason,
    provider: envelope.provider,
    model: envelope.model,
    promptFamilyId: request.promptFamilyId,
    promptVersion: envelope.promptVersion,
    inputHash: request.inputHash,
    latencyMs,
    maxTokens: request.maxTokens,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    targetFormPresent: envelope.checks.targetFormPresent,
    createdAt: envelope.createdAt,
  });

  return {
    timeoutMs,
    providerName: provider.name,
    buildRequest,

    async requestCandidate(input) {
      // Throws for a malformed input — a caller bug, not a runtime condition.
      const request = buildRequest(input.context, input.maxTokens);
      const startedAt = clock.elapsedMs();

      const fallback = (reason: FallbackReason): AiCandidateOutcome => {
        const envelope = serveFallbackCandidate(request, {
          now: () => clock.now(),
          nextCandidateId,
        });
        const route = record(request, envelope, reason, clock.elapsedMs() - startedAt, {
          input: null,
          output: null,
        });
        telemetry.record(route);
        return { envelope, request, route };
      };

      // OD-08, before any transport call: un-consented content never leaves.
      try {
        contentPolicy.assertPermitted(input.context);
      } catch (error) {
        return fallback(fallbackReasonOf(error));
      }

      let result: AiProviderResult;
      try {
        result = await callWithDeadline(
          provider,
          request,
          options.platform ?? ambientPlatform(),
          timeoutMs,
          input.signal,
        );
      } catch (error) {
        return fallback(fallbackReasonOf(error));
      }

      let envelope: AiCandidateEnvelope;
      try {
        envelope = envelopeOf(request, result);
      } catch {
        // Schema or ceiling violation. `invalid_response` rather than the
        // thrown error's own reason, because a zod failure here is always the
        // same fact: the provider answered with something that is not a
        // candidate.
        return fallback('invalid_response');
      }

      // Belt and braces: a provider that named itself `offline-fallback` would
      // make a live answer indistinguishable from a fixture in the event log.
      if (envelope.provider === OFFLINE_FALLBACK_PROVIDER) return fallback('invalid_response');

      const route = record(request, envelope, null, clock.elapsedMs() - startedAt, {
        input: result.inputTokens,
        output: result.outputTokens,
      });
      telemetry.record(route);
      return { envelope, request, route };
    },
  };
}

/**
 * A runtime with no provider at all.
 *
 * Every request takes the fallback route with `no_api_key`. This is what the
 * Phase-0 web target uses when the environment holds no key — an explicit,
 * named configuration rather than a live runtime that happens to fail every
 * time, so the capsule and the observability ring can say which one is running.
 */
export function createFallbackOnlyProvider(variableName: string = API_KEY_ENV_VAR): AiProviderPort {
  return {
    name: OFFLINE_FALLBACK_PROVIDER,
    model: 'none',
    generate() {
      return Promise.reject(new AiKeyMissingError(variableName));
    },
  };
}
