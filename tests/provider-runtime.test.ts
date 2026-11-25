import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCost, estimateInputTokens, runClaudeRuntime } from '../lib/provider-runtime.ts';

test('runtime input token estimate is explicitly approximate', () => {
  assert.equal(estimateInputTokens('12345678'), 2);
  assert.equal(estimateInputTokens(''), 0);
});

test('runtime cost uses provider token counts and user-entered per-million rates', () => {
  assert.equal(estimateCost(1_000_000, 500_000, 3, 15), 10.5);
  assert.equal(estimateCost(1000, 1000, 3, 15), 0.018);
});


test('Claude adapter reads provider usage and returns response text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), 'https://api.anthropic.com/v1/messages');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('anthropic-dangerous-direct-browser-access'), 'true');
    assert.equal(headers.get('x-api-key'), 'test-key');
    return new Response(JSON.stringify({
      model: 'claude-test',
      content: [{ type: 'text', text: 'Test answer' }],
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 }
    }), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as typeof fetch;
  try {
    const result = await runClaudeRuntime({ apiKey: 'test-key', model: 'claude-test', task: 'test', packageContext: 'context', maxTokens: 100, inputPricePerMillion: 3, outputPricePerMillion: 15 });
    assert.equal(result.text, 'Test answer');
    assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 20, cacheCreationInputTokens: 10 });
    assert.equal(result.estimatedCost, 0.00114);
    assert.equal(result.requestId, 'req_test');
  } finally { globalThis.fetch = originalFetch; }
});
