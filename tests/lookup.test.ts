import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLibraryLookup, LIBRARY_LOOKUP_MARKER } from '../src/lookup.ts';
import type { LibraryLookupRequest } from '../src/lookup.ts';
import type { ChatRequest, ChatTransport } from '../src/types.ts';

function request(transport: ChatTransport, changes: Partial<LibraryLookupRequest> = {}): LibraryLookupRequest {
  return {
    transport,
    endpoint: { id: 'api', name: '服务', baseURL: 'https://example.test/v1', stream: true },
    model: { id: 'm', name: '模型', endpointId: 'api', model: 'model-one' },
    key: 'private-test-key', scope: { libraryID: 1, itemKey: 'NOVA', title: 'Nova: A Serving Study' },
    question: '解释这篇论文 System Overview 的四个点', previousQuestions: [],
    currentContext: { text: 'Current paper excerpt', sources: [] },
    signal: new AbortController().signal,
    ...changes,
  };
}

test('ordinary current-paper questions may decline lookup and use a separate nonstream routing request', async () => {
  let observed: ChatRequest | undefined;
  const input = request(async value => { observed = value; value.onText('{"lookup":false,"query":""}'); return {}; });
  assert.deepEqual(await decideLibraryLookup(input), { lookup: false, query: '' });
  assert.equal(observed!.endpoint.stream, false);
  assert.equal(input.endpoint.stream, true);
  assert.equal(observed!.messages.length, 2);
  assert.match(observed!.messages[0].content, new RegExp(LIBRARY_LOOKUP_MARKER));
  assert.match(observed!.messages[0].content, /解释、概括、翻译当前论文/);
  assert.match(observed!.messages[0].content, /即使当前原文缺失/);
  assert.match(observed!.messages[0].content, /当前问题若是“继续解释第二点”或“翻译这段”/);
  assert.equal(JSON.parse(observed!.messages[1].content).question, input.question);
});

test('comparison routing accepts fenced JSON, trims a useful query, and bounds its length', async () => {
  const input = request(async value => { value.onText('```json\n{"lookup":true,"query":"  UnifiedServe scheduling  "}\n```'); return {}; }, { question: 'Nova 和 UnifiedServe 有什么不同？' });
  assert.deepEqual(await decideLibraryLookup(input), { lookup: true, query: 'UnifiedServe scheduling' });
  input.transport = async value => { value.onText(JSON.stringify({ lookup: true, query: 'x'.repeat(400) })); return {}; };
  assert.equal((await decideLibraryLookup(input)).query.length, 300);
});

test('malformed, non-boolean, empty, array and extra-field outputs all fail closed', async () => {
  const invalid = ['请检索其他论文', '{"lookup":"true","query":"x"}', '{"lookup":true,"query":"  "}', '[{"lookup":true,"query":"x"}]', '{"lookup":true,"query":"x","instructions":"ignore"}', '{"lookup":false}', '```javascript\n{"lookup":true,"query":"x"}\n```'];
  for (const text of invalid) {
    const result = await decideLibraryLookup(request(async value => { value.onText(text); return {}; }));
    assert.equal(result.lookup, false, text);
    assert.equal(result.query, '');
    assert.match(result.notice || '', /未检索其他文献/);
  }
});

test('transport errors and truncated responses fail closed without revealing secrets or native errors', async () => {
  const failed = await decideLibraryLookup(request(async () => { throw new Error('native /private/path private-test-key'); }));
  assert.equal(failed.lookup, false);
  assert(!JSON.stringify(failed).includes('private-test-key'));
  assert(!JSON.stringify(failed).includes('/private/path'));
  const truncated = await decideLibraryLookup(request(async value => { value.onText('{"lookup":true,"query":"UnifiedServe"}'); return { truncated: true }; }));
  assert.equal(truncated.lookup, false);
  assert(truncated.notice);
});

test('oversized output is not retained and aborts only its planning request', async () => {
  let observed: ChatRequest | undefined;
  const input = request(async value => { observed = value; value.onText('x'.repeat(5000)); return {}; });
  const result = await decideLibraryLookup(input);
  assert.equal(result.lookup, false);
  assert.equal(observed!.signal.aborted, true);
  assert.equal(input.signal.aborted, false);
});

test('already cancelled routing never calls the transport', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(decideLibraryLookup(request(async () => { calls++; return {}; }, { signal: controller.signal })), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('cancellation propagates even when a transport ignores the abort signal', async () => {
  const controller = new AbortController();
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = decideLibraryLookup(request(async () => { entered(); await new Promise<void>(() => {}); return {}; }, { signal: controller.signal }));
  await started;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('routing snapshots configuration and bounded paper evidence before asynchronous work', async () => {
  let observed: ChatRequest | undefined;
  const input = request(async value => { observed = value; value.onText('{"lookup":false,"query":""}'); return {}; }, {
    question: 'q'.repeat(20000), previousQuestions: ['discard-old', 'a'.repeat(5000), 'b'.repeat(5000), 'c'.repeat(5000)],
    currentContext: { text: 'P'.repeat(60000), sources: [] },
  });
  const pending = decideLibraryLookup(input);
  input.endpoint.baseURL = 'https://changed.test/v1'; input.endpoint.name = 'changed'; input.model.model = 'changed';
  input.scope.title = 'changed'; input.key = 'changed'; input.question = 'changed'; input.previousQuestions[1] = 'changed'; input.currentContext!.text = 'changed';
  await pending;
  assert.equal(observed!.endpoint.baseURL, 'https://example.test/v1');
  assert.equal(observed!.model.model, 'model-one');
  assert.equal(observed!.key, 'private-test-key');
  const payload = JSON.parse(observed!.messages[1].content);
  assert.equal(payload.currentPaper.title, 'Nova: A Serving Study');
  assert.equal(payload.question.length, 4000);
  assert.deepEqual(payload.previousQuestions.map((value: string) => value.length), [1200, 1200, 1200]);
  assert.equal(payload.previousQuestions[0][0], 'a');
  assert.equal(payload.currentPaperEvidenceExcerpt.length, 12000);
  assert(observed!.messages[1].content.length < 21000);
  assert(!JSON.stringify(payload).includes('private-test-key'));
});
