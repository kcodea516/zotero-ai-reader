import test from 'node:test';
import assert from 'node:assert/strict';
import { chatCompletion, normalizeEndpoint } from '../src/transport.ts';
import type { ChatRequest } from '../src/types.ts';

function request(overrides: Partial<ChatRequest> = {}) {
  const text: string[] = [];
  const value: ChatRequest = { endpoint: { id: 'e', name: 'API', baseURL: 'https://api.example/v1', stream: true }, model: { id: 'm', endpointId: 'e', name: '模型', model: 'model-id' }, key: 'sk-private', messages: [{ role: 'user', content: '问题' }], signal: new AbortController().signal, onText: delta => text.push(delta), ...overrides };
  return { value, text };
}

async function withFetch(mock: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
}

function byteStream(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
}

test('normalizes origin, API prefix, and full URL without duplicating path', () => {
  assert.equal(normalizeEndpoint(' https://api.example/ '), 'https://api.example/v1/chat/completions');
  assert.equal(normalizeEndpoint('https://api.example/custom/v1/'), 'https://api.example/custom/v1/chat/completions');
  assert.equal(normalizeEndpoint('http://localhost:11434/v1/chat/completions/'), 'http://localhost:11434/v1/chat/completions');
  for (const value of ['file:///tmp/key', 'https://user:secret@api.example/v1', 'https://api.example/v1?key=secret', 'https://api.example/#secret']) assert.throws(() => normalizeEndpoint(value));
});

test('SSE handles every UTF-8 byte split, CRLF, comments, multiline data, and DONE', async () => {
  const payload = ': comment\r\nevent: message\r\ndata: {"choices":\r\ndata: [{"index":0,"delta":{"content":"你好 🌍"},"finish_reason":null}]}\r\n\r\ndata: {"choices":[{"index":0,"delta":{"content":"世界"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n';
  const { value, text } = request();
  let calls = 0;
  await withFetch(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.example/v1/chat/completions');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.redirect, 'error');
    assert.equal((options?.headers as any).Authorization, 'Bearer sk-private');
    assert.deepEqual(JSON.parse(String(options?.body)), { model: 'model-id', messages: value.messages, stream: true });
    return new Response(byteStream(payload), { headers: { 'Content-Type': 'text/event-stream' } });
  }, async () => { assert.deepEqual(await chatCompletion(value), {}); });
  assert.equal(text.join(''), '你好 🌍世界');
  assert.equal(calls, 1);
});

test('finish_reason closes a stream without DONE and reports truncation', async () => {
  const { value, text } = request();
  await withFetch(async () => new Response(byteStream('data: {"choices":[{"delta":{"content":"一段"},"finish_reason":"length"}]}'), { headers: { 'Content-Type': 'text/event-stream' } }), async () => {
    assert.deepEqual(await chatCompletion(value), { truncated: true });
  });
  assert.equal(text.join(''), '一段');
});

test('finish_reason does not wait for an otherwise unclosed stream', async () => {
  const { value, text } = request();
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"完成"},"finish_reason":"stop"}]}\n\n')); },
    cancel() { canceled = true; },
  });
  await withFetch(async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), async () => { await chatCompletion(value); });
  assert.equal(text.join(''), '完成');
  assert.equal(canceled, true);
});

test('unexpected stream termination preserves deltas but reports failure', async () => {
  const { value, text } = request();
  await withFetch(async () => new Response(byteStream('data: {"choices":[{"delta":{"content":"未完"}}]}\n\n'), { headers: { 'Content-Type': 'text/event-stream' } }), async () => {
    await assert.rejects(chatCompletion(value), /意外中断/);
  });
  assert.equal(text.join(''), '未完');
});

test('accepts ordinary JSON even when streaming was requested', async () => {
  const { value, text } = request();
  await withFetch(async () => Response.json({ choices: [{ message: { content: '普通回复 $x$' }, finish_reason: 'stop' }] }), async () => { await chatCompletion(value); });
  assert.equal(text.join(''), '普通回复 $x$');
});

test('HTTP failures never retry and never reveal the response body or credentials', async () => {
  for (const status of [400, 401, 403, 404, 413, 429, 503]) {
    let calls = 0;
    const { value } = request();
    await withFetch(async () => { calls++; return new Response('sk-private service echoed credentials', { status }); }, async () => {
      await assert.rejects(chatCompletion(value), error => error instanceof Error && error.message.includes(String(status)) && !error.message.includes('sk-private'));
    });
    assert.equal(calls, 1);
  }
});

test('SSE server errors and malformed payloads are safe user-facing messages', async () => {
  for (const payload of ['data: {"error":{"message":"sk-private"}}\n\n', 'data: sk-private not json\n\n']) {
    const { value } = request();
    await withFetch(async () => new Response(byteStream(payload), { headers: { 'Content-Type': 'text/event-stream' } }), async () => {
      await assert.rejects(chatCompletion(value), error => error instanceof Error && !error.message.includes('sk-private'));
    });
  }
});

test('external abort cancels the active fetch without retry', async () => {
  const controller = new AbortController();
  const { value } = request({ signal: controller.signal });
  await withFetch(async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('raw sk-private error')), { once: true })), async () => {
    const pending = chatCompletion(value);
    controller.abort();
    await assert.rejects(pending, /已停止/);
  });
});

test('connection timeout aborts without exposing native errors or retrying', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { value } = request();
  let calls = 0;
  await withFetch(async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('sk-private timeout')), { once: true }));
  }, async () => {
    const pending = chatCompletion(value);
    context.mock.timers.tick(60_000);
    await assert.rejects(pending, /超时/);
  });
  assert.equal(calls, 1);
});

test('empty API key omits the Authorization header', async () => {
  const { value } = request({ key: '' });
  await withFetch(async (_url, options) => {
    assert.equal('Authorization' in (options?.headers as Record<string, string>), false);
    return Response.json({ choices: [{ message: { content: '本地回答' }, finish_reason: 'stop' }] });
  }, async () => { await chatCompletion(value); });
});

test('read errors redact native exception messages', async () => {
  const { value } = request();
  await withFetch(async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('sk-private socket error')); } }), { headers: { 'Content-Type': 'text/event-stream' } }), async () => {
    await assert.rejects(chatCompletion(value), error => error instanceof Error && !error.message.includes('sk-private') && error.message.includes('连接中断'));
  });
});
