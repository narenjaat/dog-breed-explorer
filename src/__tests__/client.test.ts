/**
 * HTTP client tests: retry policy, backoff, timeouts and error classification.
 *
 * This suite sets its own retry counts explicitly, so it is unaffected by the
 * global "retries off" default in jest.setup.ts.
 */

import { backoffDelayMs, requestJson } from '@/api/client';
import { ApiError, describeApiError, toApiError } from '@/api/errors';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('backoffDelayMs', () => {
  it('grows exponentially with the attempt number', () => {
    // random() = 1 gives the ceiling of each attempt's jitter window.
    const always1 = () => 1;
    expect(backoffDelayMs(0, 400, 8000, always1)).toBe(400);
    expect(backoffDelayMs(1, 400, 8000, always1)).toBe(800);
    expect(backoffDelayMs(2, 400, 8000, always1)).toBe(1600);
    expect(backoffDelayMs(3, 400, 8000, always1)).toBe(3200);
  });

  it('caps the delay at the configured maximum', () => {
    expect(backoffDelayMs(20, 400, 8000, () => 1)).toBe(8000);
  });

  it('applies full jitter, so retries do not fire in lockstep', () => {
    // With random() = 0 the delay collapses to zero; the point is that the
    // delay is spread across [0, ceiling] rather than fixed.
    expect(backoffDelayMs(3, 400, 8000, () => 0)).toBe(0);
    expect(backoffDelayMs(3, 400, 8000, () => 0.5)).toBe(1600);
  });
});

describe('ApiError.retryable', () => {
  it('retries transport-level failures', () => {
    expect(new ApiError('network', 'x').retryable).toBe(true);
    expect(new ApiError('timeout', 'x').retryable).toBe(true);
  });

  it('retries 5xx, 408 and 429', () => {
    expect(new ApiError('http', 'x', { status: 500 }).retryable).toBe(true);
    expect(new ApiError('http', 'x', { status: 503 }).retryable).toBe(true);
    expect(new ApiError('http', 'x', { status: 408 }).retryable).toBe(true);
    expect(new ApiError('http', 'x', { status: 429 }).retryable).toBe(true);
  });

  it('does not retry other 4xx, which retrying cannot fix', () => {
    expect(new ApiError('http', 'x', { status: 404 }).retryable).toBe(false);
    expect(new ApiError('http', 'x', { status: 400 }).retryable).toBe(false);
  });

  it('does not retry malformed payloads or cancellations', () => {
    expect(new ApiError('parse', 'x').retryable).toBe(false);
    expect(new ApiError('aborted', 'x').retryable).toBe(false);
  });
});

describe('requestJson', () => {
  it('returns the parsed body on success', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;

    await expect(requestJson('/breeds')).resolves.toEqual({ ok: true });
  });

  it('builds a query string from the provided params', async () => {
    const mock = jest.fn(async (_input: RequestInfo | URL) => jsonResponse({}));
    globalThis.fetch = mock as unknown as typeof fetch;

    await requestJson('/breeds', { query: { 'page[number]': 2, 'page[size]': 48 } });

    const url = String(mock.mock.calls[0]?.[0]);
    expect(url).toContain('page%5Bnumber%5D=2');
    expect(url).toContain('page%5Bsize%5D=48');
  });

  it('omits undefined query params', async () => {
    const mock = jest.fn(async (_input: RequestInfo | URL) => jsonResponse({}));
    globalThis.fetch = mock as unknown as typeof fetch;

    await requestJson('/breeds', { query: { a: 1, b: undefined } });

    const url = String(mock.mock.calls[0]?.[0]);
    expect(url).toContain('a=1');
    expect(url).not.toContain('b=');
  });

  it('retries a transient failure and then succeeds', async () => {
    let calls = 0;
    globalThis.fetch = jest.fn(async () => {
      calls += 1;
      if (calls < 3) throw new TypeError('Network request failed');
      return jsonResponse({ recovered: true });
    }) as unknown as typeof fetch;

    const result = await requestJson('/breeds', { maxRetries: 3, retryBaseDelayMs: 1 });

    expect(result).toEqual({ recovered: true });
    expect(calls).toBe(3);
  });

  it('gives up after the configured number of retries', async () => {
    let calls = 0;
    globalThis.fetch = jest.fn(async () => {
      calls += 1;
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    await expect(requestJson('/breeds', { maxRetries: 2, retryBaseDelayMs: 1 })).rejects.toThrow(
      ApiError,
    );
    // 1 initial attempt + 2 retries
    expect(calls).toBe(3);
  });

  it('does not retry a 404', async () => {
    let calls = 0;
    globalThis.fetch = jest.fn(async () => {
      calls += 1;
      return jsonResponse({ error: 'not found' }, 404);
    }) as unknown as typeof fetch;

    await expect(
      requestJson('/breeds/nope', { maxRetries: 3, retryBaseDelayMs: 1 }),
    ).rejects.toThrow(ApiError);
    expect(calls).toBe(1);
  });

  it('retries a 500', async () => {
    let calls = 0;
    globalThis.fetch = jest.fn(async () => {
      calls += 1;
      return jsonResponse({}, 500);
    }) as unknown as typeof fetch;

    await expect(requestJson('/breeds', { maxRetries: 2, retryBaseDelayMs: 1 })).rejects.toThrow();
    expect(calls).toBe(3);
  });

  it('classifies a malformed body as a parse error and does not retry it', async () => {
    let calls = 0;
    globalThis.fetch = jest.fn(async () => {
      calls += 1;
      return new Response('this is not json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await expect(
      requestJson('/breeds', { maxRetries: 3, retryBaseDelayMs: 1 }),
    ).rejects.toMatchObject({ kind: 'parse' });
    expect(calls).toBe(1);
  });

  it('times out a hanging request and classifies it as retryable', async () => {
    globalThis.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          // Never settles on its own; only the abort signal ends it.
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as unknown as typeof fetch;

    const error = await requestJson('/breeds', {
      timeoutMs: 20,
      maxRetries: 0,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('timeout');
    expect((error as ApiError).retryable).toBe(true);
  });

  it('reports caller cancellation as aborted, not as a network failure', async () => {
    const controller = new AbortController();
    globalThis.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as unknown as typeof fetch;

    const promise = requestJson('/breeds', { signal: controller.signal, maxRetries: 0 });
    controller.abort();

    const error = await promise.catch((caught: unknown) => caught);
    expect((error as ApiError).kind).toBe('aborted');
    expect((error as ApiError).retryable).toBe(false);
  });
});

describe('error helpers', () => {
  it('passes an existing ApiError through unchanged', () => {
    const original = new ApiError('http', 'boom', { status: 500 });
    expect(toApiError(original, null)).toBe(original);
  });

  it('wraps an unknown throw into a network error', () => {
    expect(toApiError('a string', null).kind).toBe('network');
    expect(toApiError(new Error('boom'), null).kind).toBe('network');
  });

  it('recognises an AbortError by name', () => {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    expect(toApiError(error, null).kind).toBe('aborted');
  });

  it('produces user-facing text without leaking internals', () => {
    expect(describeApiError(new ApiError('network', 'ECONNREFUSED 127.0.0.1'))).toBe(
      'No connection to the Dog API.',
    );
    expect(describeApiError(new ApiError('http', 'x', { status: 503 }))).toContain('503');
    expect(describeApiError(new ApiError('parse', 'x'))).toContain('unexpected format');
  });
});
