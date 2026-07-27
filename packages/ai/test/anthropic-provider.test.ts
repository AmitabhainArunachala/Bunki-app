/**
 * The one remote provider, against a local fake (WP-07 closure predicate
 * item 2; controller §9, REQ-AI-03).
 *
 * **No test here makes a network call.** Every case drives
 * `createAnthropicProvider` with an injected `fetch` that has no transport in
 * it, which is why the request shape can be asserted byte for byte and why the
 * suite runs identically with the machine offline. Live-call evidence is an
 * open operator gate (OD-08) and is recorded as such in the capsule — a test
 * that quietly reached the network would turn that honest gap into a false
 * claim.
 */

import { describe, expect, it } from 'vitest';

import {
  AiKeyMissingError,
  AiProviderStatusError,
  AiResponseValidationError,
  AiTransportError,
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MESSAGES_URL,
  API_KEY_ENV_VAR,
  buildUserPrompt,
  createAnthropicProvider,
  DEFAULT_MODEL,
  MODEL_ENV_VAR,
  parseAiRequestEnvelope,
  TASK_CLASS,
  type AiRequestEnvelope,
} from '../src/index.ts';
import { createFakeAbortController, createFakeFetch, messagesResponse } from './support/harness.ts';

const KEY = 'sk-ant-not-a-real-key';

const REQUEST: AiRequestEnvelope = parseAiRequestEnvelope({
  taskClass: TASK_CLASS,
  inputHash: 'hash-1',
  promptFamilyId: 'family-1',
  promptVersion: 'v1',
  threadContext: {
    contentClass: 'seeded-fixture',
    targetForm: '分岐',
    excerpt: '子どものころ、私はこの分岐点が好きだった。',
    seedRef: 'pas-bunki-01',
  },
  maxTokens: 400,
});

const call = { signal: createFakeAbortController().signal };

describe('the API key comes from the environment and nowhere else', () => {
  it('throws a named error when the variable is absent', async () => {
    const fake = createFakeFetch({ kind: 'json', body: messagesResponse('x') });
    const provider = createAnthropicProvider({ fetch: fake.fetch, env: {} });

    await expect(provider.generate(REQUEST, call)).rejects.toBeInstanceOf(AiKeyMissingError);
    // The point of the check: no request was attempted without a key.
    expect(fake.calls).toHaveLength(0);
  });

  it('treats an empty or whitespace value as absent', async () => {
    const fake = createFakeFetch({ kind: 'json', body: messagesResponse('x') });
    const provider = createAnthropicProvider({
      fetch: fake.fetch,
      env: { [API_KEY_ENV_VAR]: '  ' },
    });

    await expect(provider.generate(REQUEST, call)).rejects.toBeInstanceOf(AiKeyMissingError);
  });

  it('constructs successfully with no key, so the runtime can be built once', () => {
    expect(() =>
      createAnthropicProvider({ fetch: createFakeFetch({ kind: 'hang' }).fetch, env: {} }),
    ).not.toThrow();
  });

  it('never names the key value in the error', async () => {
    const provider = createAnthropicProvider({
      fetch: createFakeFetch({ kind: 'hang' }).fetch,
      env: {},
    });
    await provider.generate(REQUEST, call).catch((error: unknown) => {
      expect((error as Error).message).toContain(API_KEY_ENV_VAR);
      expect((error as Error).message).not.toContain(KEY);
    });
  });
});

describe('the request it builds', () => {
  it('is a Messages API POST with the pinned version header', async () => {
    const fake = createFakeFetch({ kind: 'json', body: messagesResponse('分岐 is a fork.') });
    const provider = createAnthropicProvider({
      fetch: fake.fetch,
      env: { [API_KEY_ENV_VAR]: KEY },
    });

    await provider.generate(REQUEST, call);

    const [only] = fake.calls;
    expect(only?.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(only?.init.method).toBe('POST');
    expect(only?.init.headers['anthropic-version']).toBe(ANTHROPIC_API_VERSION);
    expect(only?.init.headers['x-api-key']).toBe(KEY);
    expect(only?.init.headers['content-type']).toBe('application/json');
  });

  it('sends the envelope token ceiling and the seeded excerpt, and nothing else', () => {
    const fake = createFakeFetch({ kind: 'json', body: messagesResponse('分岐 is a fork.') });
    const provider = createAnthropicProvider({
      fetch: fake.fetch,
      env: { [API_KEY_ENV_VAR]: KEY },
    });

    return provider.generate(REQUEST, call).then(() => {
      const body = fake.bodyOf();
      expect(body['max_tokens']).toBe(REQUEST.maxTokens);
      expect(body['model']).toBe(DEFAULT_MODEL);
      // The user turn is exactly the prompt builder's output: the target form
      // and one seeded excerpt, and nothing the caller could smuggle past it.
      expect(body['messages']).toEqual([
        { role: 'user', content: buildUserPrompt(REQUEST.threadContext) },
      ]);

      const serialised = JSON.stringify(body);
      expect(serialised).toContain(REQUEST.threadContext.excerpt);
      expect(serialised).not.toContain(REQUEST.inputHash);
      // No learner identity or state reaches the provider (REQ-ARCH-07).
      expect(serialised).not.toMatch(
        /threadId|encounterId|promotion|uncertaintyMark|contractId|sessionId/i,
      );
    });
  });

  it('honours a model override from the environment', async () => {
    const fake = createFakeFetch({ kind: 'json', body: messagesResponse('分岐 is a fork.') });
    const provider = createAnthropicProvider({
      fetch: fake.fetch,
      env: { [API_KEY_ENV_VAR]: KEY, [MODEL_ENV_VAR]: 'claude-sonnet-5' },
    });

    expect(provider.model).toBe('claude-sonnet-5');
    await provider.generate(REQUEST, call);
    expect(fake.bodyOf()['model']).toBe('claude-sonnet-5');
  });

  it('passes the abort signal through to the transport', async () => {
    const fake = createFakeFetch({ kind: 'json', body: messagesResponse('分岐 is a fork.') });
    const provider = createAnthropicProvider({
      fetch: fake.fetch,
      env: { [API_KEY_ENV_VAR]: KEY },
    });
    const controller = createFakeAbortController();

    await provider.generate(REQUEST, { signal: controller.signal });
    expect(fake.calls[0]?.init.signal).toBe(controller.signal);
  });
});

describe('the answer it accepts', () => {
  const provider = (behaviour: Parameters<typeof createFakeFetch>[0]) =>
    createAnthropicProvider({
      fetch: createFakeFetch(behaviour).fetch,
      env: { [API_KEY_ENV_VAR]: KEY },
    });

  it('returns the text, the reported model, and token counts', async () => {
    const result = await provider({
      kind: 'json',
      body: messagesResponse('分岐 is a fork.', { model: 'claude-opus-5-actual' }),
    }).generate(REQUEST, call);

    expect(result.text).toBe('分岐 is a fork.');
    expect(result.model).toBe('claude-opus-5-actual');
    expect(result.provider).toBe('anthropic');
    expect(result.inputTokens).toBe(210);
    expect(result.outputTokens).toBe(96);
  });

  it('skips empty thinking blocks rather than failing on them', async () => {
    const result = await provider({
      kind: 'json',
      body: messagesResponse('unused', {
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: '分岐 is a fork.' },
        ],
      }),
    }).generate(REQUEST, call);

    expect(result.text).toBe('分岐 is a fork.');
  });

  it('reports missing token counts as null rather than zero', async () => {
    const result = await provider({
      kind: 'json',
      body: messagesResponse('分岐 is a fork.', { usage: {} }),
    }).generate(REQUEST, call);

    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
  });
});

describe('the answers it refuses', () => {
  const provider = (behaviour: Parameters<typeof createFakeFetch>[0]) =>
    createAnthropicProvider({
      fetch: createFakeFetch(behaviour).fetch,
      env: { [API_KEY_ENV_VAR]: KEY },
    });

  it('rejects a non-2xx status, carrying the status and not the body', async () => {
    await expect(
      provider({ kind: 'json', status: 429, body: { error: { message: KEY } } }).generate(
        REQUEST,
        call,
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AiProviderStatusError &&
        error.status === 429 &&
        !error.message.includes(KEY),
    );
  });

  it('rejects a body that is not JSON', async () => {
    await expect(provider({ kind: 'not-json' }).generate(REQUEST, call)).rejects.toBeInstanceOf(
      AiResponseValidationError,
    );
  });

  it('rejects a safety refusal rather than rendering an empty candidate', async () => {
    await expect(
      provider({
        kind: 'json',
        body: messagesResponse('', { content: [], stop_reason: 'refusal' }),
      }).generate(REQUEST, call),
    ).rejects.toBeInstanceOf(AiResponseValidationError);
  });

  it('rejects a truncated answer rather than presenting half an explanation', async () => {
    await expect(
      provider({
        kind: 'json',
        body: messagesResponse('分岐 means a bran', { stop_reason: 'max_tokens' }),
      }).generate(REQUEST, call),
    ).rejects.toBeInstanceOf(AiResponseValidationError);
  });

  it('rejects a response with no text block', async () => {
    await expect(
      provider({ kind: 'json', body: messagesResponse('x', { content: [] }) }).generate(
        REQUEST,
        call,
      ),
    ).rejects.toBeInstanceOf(AiResponseValidationError);
  });

  it('turns a transport failure into a named error without the thrown message', async () => {
    const leaky = new Error(`connect ECONNREFUSED with ${KEY}`);
    await expect(
      provider({ kind: 'throw', error: leaky }).generate(REQUEST, call),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AiTransportError && !error.message.includes(KEY),
    );
  });
});
