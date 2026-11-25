import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runClaudeRuntime } from '../lib/provider-runtime.ts';

test('production security headers restrict external connections to Anthropic API', async () => {
  // Cloudflare Pages serves static-export security headers from public/_headers.
  const headers = await readFile('public/_headers', 'utf8');
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/);
  assert.match(headers, /X-Frame-Options:\s*DENY/);
  assert.match(headers, /Referrer-Policy:/);
  assert.match(headers, /Permissions-Policy:/);
  assert.match(headers, /connect-src[^\n]*https:\/\/api\.anthropic\.com/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.doesNotMatch(headers, /unsafe-eval/);
});

test('production app disables indexing and does not expose server upload routes', async () => {
  const layout = await readFile('app/layout.tsx', 'utf8');
  const robots = await readFile('app/robots.ts', 'utf8');
  assert.match(layout, /index: false/);
  assert.match(robots, /disallow: '\/'/);
});

test('runtime validates model id and context bounds before network request', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
  try {
    await assert.rejects(() => runClaudeRuntime({ apiKey: 'test-key', model: 'bad model', task: 'task', packageContext: 'ctx', maxTokens: 100, inputPricePerMillion: 1, outputPricePerMillion: 1 }), /Model ID/);
    await assert.rejects(() => runClaudeRuntime({ apiKey: 'test-key', model: 'claude-test', task: 'task', packageContext: 'x'.repeat(120001), maxTokens: 100, inputPricePerMillion: 1, outputPricePerMillion: 1 }), /120,000/);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});
