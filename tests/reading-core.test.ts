import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from '../src/core.ts';
import type { ChatRequest, ChatTransport, Config, PaperContextProvider, PaperContextRequest, PaperSource, Repository, SecretStore, StoreState } from '../src/types.ts';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const config: Config = { version: 1, endpoints: [{ id: 'api', name: '接口', baseURL: 'https://example.test/v1', stream: true }], models: [{ id: 'model', endpointId: 'api', name: '模型', model: 'model' }], defaultModelId: 'model', systemPrompt: '自定义阅读要求' };
const scope = { libraryID: 1, itemKey: 'PAPER', title: '当前论文' };
const source: PaperSource = { id: 'S1', title: '当前论文', libraryID: 1, itemKey: 'PAPER', attachmentKey: 'PDF', pages: [4, 5], totalPages: 12, truncated: true };
const secrets: SecretStore = { async get() { return 'test-key'; }, async set() { return true; }, async delete() {} };

const plannerMarker = 'zotero-library-lookup-decision';
const isPlanner = (request: ChatRequest) => request.messages[0]?.content.includes(plannerMarker);

async function fixture(provider: PaperContextProvider, transport?: ChatTransport, planner?: ChatTransport) {
  let persisted: StoreState | null = null;
  const requests: ChatRequest[] = [];
  const plannerRequests: ChatRequest[] = [];
  const repo: Repository = { async load() { return persisted ? copy(persisted) : null; }, async save(state) { persisted = copy(state); } };
  const chat = new ChatService(repo, secrets, async request => {
    if (isPlanner(request)) {
      plannerRequests.push(request);
      if (planner) return planner(request);
      request.onText(JSON.stringify({ lookup: false, query: '' }));
      return {};
    }
    requests.push(request);
    if (transport) return transport(request);
    request.onText('有依据的回答 [S1 p.4]');
    return {};
  }, provider);
  await chat.init();
  await chat.saveConfig(config);
  const conversation = chat.forScope(scope);
  return { chat, conversation, requests, plannerRequests, repo, get persisted() { return persisted; } };
}

async function ask(chat: ChatService, id: string, question = '请解释 System Overview 的四点') {
  chat.setDraft(id, question);
  await chat.send(id);
}

test('retrieves originals before sending, grounds custom prompts, and stores provenance without PDF text', async () => {
  const observed: PaperContextRequest[] = [];
  const f = await fixture(async request => { observed.push(request); return { text: '[S1 p.4] PRIVATE-PDF-TEXT: The four mechanisms are...', sources: [{ ...source, text: 'ACCIDENTAL-FULL-PDF' } as PaperSource], warning: '仅提供相关页面。' }; });
  try {
    await ask(f.chat, f.conversation.id);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].scope.itemKey, 'PAPER');
    assert.deepEqual(observed[0].options, { currentPaper: true, relatedPapers: false });
    assert.equal(f.plannerRequests.length, 1);
    const request = f.requests[0];
    assert.match(request.messages[0].content, /自定义阅读要求/);
    assert.match(request.messages[0].content, /\[S1 p\.4\]/);
    assert.match(request.messages[0].content, /不可信/);
    assert.match(request.messages.at(-1)!.content, /<retrieved_paper_context>/);
    assert.match(request.messages.at(-1)!.content, /PRIVATE-PDF-TEXT/);
    assert.match(request.messages.at(-1)!.content, /PDF 页码：4, 5/);
    assert.match(f.conversation.messages[1].contextNotice!, /已读取 1 篇/);
    assert.match(f.conversation.messages[1].contextNotice!, /仅提供相关页面/);
    assert.deepEqual(f.conversation.messages[1].sources, [source]);
    await f.chat.flush();
    assert.equal(JSON.stringify(f.persisted).includes('PRIVATE-PDF-TEXT'), false);
    assert.equal(JSON.stringify(f.persisted).includes('ACCIDENTAL-FULL-PDF'), false);
    assert.equal(f.conversation.messages[0].content, '请解释 System Overview 的四点');
  } finally { await f.chat.shutdown(); }
});

test('reading options opt out without calling the provider and survive reload', async () => {
  let reads = 0;
  const f = await fixture(async () => { reads++; return { text: '', sources: [] }; });
  try {
    const defaults = f.chat.getReadingOptions(f.conversation.id);
    defaults.currentPaper = false;
    assert.equal(f.chat.getReadingOptions(f.conversation.id).currentPaper, true);
    f.chat.setReadingOptions(f.conversation.id, { currentPaper: false, relatedPapers: false });
    await ask(f.chat, f.conversation.id);
    assert.equal(reads, 0);
    assert.equal(f.plannerRequests.length, 0);
    assert.match(f.requests[0].messages.at(-1)!.content, /已关闭文献原文读取/);
    assert.equal(f.conversation.messages[1].sources, undefined);
    await f.chat.flush();
    const restored = new ChatService(f.repo, secrets);
    try {
      await restored.init();
      assert.deepEqual(restored.getReadingOptions(f.conversation.id), { currentPaper: false, relatedPapers: false });
    } finally { await restored.shutdown(); }
  } finally { await f.chat.shutdown(); }
});

test('cancel while originals are loading prevents any API request even if provider ignores abort', async () => {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture(async () => {
    entered();
    await new Promise<void>(resolve => { release = resolve; });
    return { text: '[S1 p.4] Late PDF text', sources: [source] };
  });
  try {
    f.chat.setDraft(f.conversation.id, '问题');
    const pending = f.chat.send(f.conversation.id);
    await started;
    assert.equal(f.chat.isBusy(f.conversation.id), true);
    assert.equal(f.conversation.messages[1].contextNotice, '正在读取当前文献原文…');
    f.chat.stop(f.conversation.id);
    await pending;
    assert.equal(f.requests.length, 0);
    assert.equal(f.conversation.messages[1].status, 'stopped');
    assert.equal(f.conversation.messages[1].contextNotice, '文献原文读取已停止。');
    assert.equal(f.chat.isBusy(f.conversation.id), false);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(f.conversation.messages[1].sources, undefined);
  } finally { await f.chat.shutdown(); }
});

test('retry retrieves fresh sources and replaces old provenance without persisting stale originals', async () => {
  let reads = 0;
  let calls = 0;
  const f = await fixture(async () => {
    reads++;
    return { text: `[S1 p.${reads}] PDF-ROUND-${reads}`, sources: [{ ...source, pages: [reads] }] };
  }, async request => {
    calls++;
    if (calls === 1) throw new Error('API 暂时不可用');
    assert.match(request.messages.at(-1)!.content, /PDF-ROUND-2/);
    assert.doesNotMatch(request.messages.at(-1)!.content, /PDF-ROUND-1/);
    request.onText('重试回答');
    return {};
  });
  try {
    await ask(f.chat, f.conversation.id);
    assert.equal(f.conversation.messages[1].status, 'error');
    await f.chat.retry(f.conversation.id);
    assert.equal(reads, 2);
    assert.equal(f.conversation.messages.length, 2);
    assert.equal(f.conversation.messages[1].status, 'complete');
    assert.deepEqual(f.conversation.messages[1].sources?.[0].pages, [2]);
  } finally { await f.chat.shutdown(); }
});

test('follow-up retrieval receives the last three questions and history retains source legends', async () => {
  const seen: PaperContextRequest[] = [];
  const f = await fixture(async request => { seen.push(request); return { text: '[S1 p.4] Relevant original', sources: [source] }; });
  try {
    for (const question of ['第一问', '第二问', '第三问', '第四问', '为什么？']) await ask(f.chat, f.conversation.id, question);
    assert.deepEqual(seen[4].previousQuestions, ['第二问', '第三问', '第四问']);
    assert.equal(seen[4].question, '为什么？');
    assert.match(f.requests[4].messages[2].content, /\[S1\] 当前论文/);
    assert.match(f.requests[4].messages[2].content, /不代表本轮已取得其原文/);
    assert.equal(f.requests[4].messages.filter(message => message.content.includes('Relevant original')).length, 1);
  } finally { await f.chat.shutdown(); }
});

test('scope and reading settings are snapshotted before asynchronous work', async () => {
  let release!: () => void;
  let observed: PaperContextRequest | undefined;
  const blockedSecrets = { ...secrets, async get() { await new Promise<void>(resolve => { release = resolve; }); return 'key'; } };
  const chat = new ChatService({ async load() { return null; }, async save() {} }, blockedSecrets, async () => ({}), async request => { observed = request; return { text: '', sources: [] }; });
  try {
    await chat.init();
    await chat.saveConfig(config);
    const conversation = chat.forScope(scope);
    chat.setReadingOptions(conversation.id, { currentPaper: true, relatedPapers: false });
    chat.setDraft(conversation.id, '问题');
    const pending = chat.send(conversation.id);
    await new Promise(resolve => setTimeout(resolve, 0));
    chat.setReadingOptions(conversation.id, { currentPaper: false, relatedPapers: true });
    conversation.scope.title = '后来修改的标题';
    release();
    await pending;
    assert.deepEqual(observed?.options, { currentPaper: true, relatedPapers: false });
    assert.equal(observed?.scope.title, '当前论文');
  } finally { await chat.shutdown(); }
});

test('missing or failed originals are explicit and provider exceptions never expose local paths', async () => {
  const f = await fixture(async () => { throw new Error('/Users/private/Zotero/storage/SECRET/file.pdf permission denied'); });
  try {
    await ask(f.chat, f.conversation.id);
    assert.equal(f.conversation.messages[1].status, 'complete');
    assert.match(f.conversation.messages[1].contextNotice!, /原文读取失败/);
    assert.match(f.requests[0].messages.at(-1)!.content, /未取得.*原文/);
    assert.equal(JSON.stringify(f.chat.state).includes('/Users/private'), false);
    assert.equal(JSON.stringify(f.requests).includes('/Users/private'), false);
  } finally { await f.chat.shutdown(); }
  const empty = await fixture(async () => ({ text: '', sources: [], warning: '附件没有可提取的文字。' }));
  try {
    await ask(empty.chat, empty.conversation.id);
    assert.match(empty.conversation.messages[1].contextNotice!, /未读取到文献原文/);
    assert.match(empty.conversation.messages[1].contextNotice!, /没有可提取的文字/);
  } finally { await empty.chat.shutdown(); }
});

test('old history loads and malformed optional reading metadata does not discard valid conversations', async () => {
  const f = await fixture(async () => ({ text: '[S1 p.4] Original', sources: [source] }));
  await ask(f.chat, f.conversation.id);
  await f.chat.flush();
  const state = copy(f.persisted!);
  await f.chat.shutdown();
  (state.conversations[0] as any).readingOptions = { currentPaper: 'yes', relatedPapers: null };
  (state.conversations[0].messages[1] as any).sources = [null, { ...source, pages: [-1] }, { ...source, text: 'MUST-NOT-PERSIST' }];
  (state.conversations[0].messages[1] as any).contextNotice = { invalid: true };
  const restored = new ChatService({ async load() { return state; }, async save() {} }, secrets);
  try {
    await restored.init();
    assert.equal(restored.state.conversations.length, 1);
    assert.deepEqual(restored.getReadingOptions(state.conversations[0].id), { currentPaper: true, relatedPapers: true });
    assert.deepEqual(restored.state.conversations[0].messages[1].sources, [source]);
    assert.equal(restored.state.conversations[0].messages[1].contextNotice, undefined);
    assert.equal(JSON.stringify(restored.state).includes('MUST-NOT-PERSIST'), false);
  } finally { await restored.shutdown(); }
});

const relatedSource: PaperSource = { ...source, id: 'S2', title: 'UnifiedServe', itemKey: 'RELATED', attachmentKey: 'RELATEDPDF', pages: [2] };
const currentEvidence = { text: '[S1 p.4] CURRENT-ORIGINAL-BODY', sources: [source] };
const comparisonEvidence = { text: '[S1 p.4] CURRENT-ORIGINAL-BODY\n[S2 p.2] RELATED-PRIVATE-ORIGINAL-BODY', sources: [source, relatedSource] };
const lookupAnswer = (lookup: boolean, query = ''): ChatTransport => async request => { request.onText(JSON.stringify({ lookup, query })); return {}; };

test('permission to consult the library does not read related PDFs for an ordinary question', async () => {
  const reads: PaperContextRequest[] = [];
  const f = await fixture(async request => { reads.push(request); return currentEvidence; });
  try {
    await ask(f.chat, f.conversation.id, '解释当前论文的 System Overview');
    assert.deepEqual(f.chat.getReadingOptions(f.conversation.id), { currentPaper: true, relatedPapers: true });
    assert.equal(reads.length, 1);
    assert.deepEqual(reads[0].options, { currentPaper: true, relatedPapers: false });
    assert.equal(f.plannerRequests.length, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.conversation.messages[1].sources, [source]);
    assert.match(f.conversation.messages[1].contextNotice!, /仅使用当前论文/);
    assert.doesNotMatch(f.conversation.messages[1].content, /lookup/);
  } finally { await f.chat.shutdown(); }
});

test('an explicit comparison plans lookup before related originals are fetched and sent', async () => {
  const reads: PaperContextRequest[] = [];
  const f = await fixture(async request => { reads.push(request); return request.options.relatedPapers ? comparisonEvidence : currentEvidence; }, undefined, lookupAnswer(true, 'UnifiedServe scheduling'));
  try {
    await ask(f.chat, f.conversation.id, '当前论文与 UnifiedServe 的机制有什么不同？');
    assert.equal(reads.length, 2);
    assert.deepEqual(reads[0].options, { currentPaper: true, relatedPapers: false });
    assert.deepEqual(reads[1].options, { currentPaper: true, relatedPapers: true });
    assert.match(reads[1].question, /当前论文与 UnifiedServe/);
    assert.match(reads[1].question, /UnifiedServe scheduling/);
    assert.deepEqual(f.conversation.messages[1].sources, [source, relatedSource]);
    assert.match(f.requests[0].messages.at(-1)!.content, /RELATED-PRIVATE-ORIGINAL-BODY/);
    assert.match(f.conversation.messages[1].contextNotice!, /按需联查 1 篇/);
    await f.chat.flush();
    assert.equal(JSON.stringify(f.persisted).includes('RELATED-PRIVATE-ORIGINAL-BODY'), false);
    assert.equal(JSON.stringify(f.persisted).includes('"lookup"'), false);
  } finally { await f.chat.shutdown(); }
});

test('an ordinary turn after a comparison does not carry the previous related original forward', async () => {
  const reads: PaperContextRequest[] = [];
  let decisions = 0;
  const f = await fixture(async request => { reads.push(request); return request.options.relatedPapers ? comparisonEvidence : currentEvidence; }, undefined,
    async request => { decisions++; request.onText(JSON.stringify({ lookup: decisions === 1, query: decisions === 1 ? 'UnifiedServe' : '' })); return {}; });
  try {
    await ask(f.chat, f.conversation.id, '对比 UnifiedServe');
    await ask(f.chat, f.conversation.id, '回到当前论文，解释其中的 SM 划分');
    assert.equal(reads.length, 3);
    assert.equal(reads[2].options.relatedPapers, false);
    assert.deepEqual(f.conversation.messages[3].sources, [source]);
    assert.equal(f.plannerRequests.length, 2);
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].messages.some(message => message.content.includes('RELATED-PRIVATE-ORIGINAL-BODY')), false);
    assert.equal(f.plannerRequests[1].messages.some(message => message.content.includes('RELATED-PRIVATE-ORIGINAL-BODY')), false);
    assert.match(f.requests[1].messages.at(-1)!.content, /CURRENT-ORIGINAL-BODY/);
  } finally { await f.chat.shutdown(); }
});

test('disabling related-paper permission skips the planner while still reading the current PDF', async () => {
  const reads: PaperContextRequest[] = [];
  const f = await fixture(async request => { reads.push(request); return currentEvidence; }, undefined, async () => { throw new Error('planner must not run'); });
  try {
    f.chat.setReadingOptions(f.conversation.id, { currentPaper: true, relatedPapers: false });
    await ask(f.chat, f.conversation.id, '请比较 UnifiedServe');
    assert.equal(f.plannerRequests.length, 0);
    assert.equal(reads.length, 1);
    assert.equal(reads[0].options.relatedPapers, false);
    assert.match(f.conversation.messages[1].contextNotice!, /已关闭文库联查/);
  } finally { await f.chat.shutdown(); }
});

test('planner failure fails closed and preserves current evidence without leaking errors or partial JSON', async () => {
  let reads = 0;
  const f = await fixture(async () => { reads++; return currentEvidence; }, undefined, async request => {
    request.onText('{"lookup":');
    throw new Error('/Users/private/SECRET/endpoint.json token-private');
  });
  try {
    await ask(f.chat, f.conversation.id, '比较其他论文');
    assert.equal(reads, 1);
    assert.equal(f.conversation.messages[1].status, 'complete');
    assert.deepEqual(f.conversation.messages[1].sources, [source]);
    assert.match(f.requests[0].messages.at(-1)!.content, /CURRENT-ORIGINAL-BODY/);
    assert.match(f.conversation.messages[1].contextNotice!, /联查|判断/);
    assert.equal(JSON.stringify(f.chat.state).includes('token-private'), false);
    assert.equal(JSON.stringify(f.chat.state).includes('"lookup"'), false);
    assert.equal(f.conversation.messages[1].content, '有依据的回答 [S1 p.4]');
  } finally { await f.chat.shutdown(); }
});

test('failed expanded lookup keeps the already-read current original', async () => {
  const f = await fixture(async request => {
    if (request.options.relatedPapers) throw new Error('/private/failed-library.pdf');
    return currentEvidence;
  }, undefined, lookupAnswer(true, 'UnifiedServe'));
  try {
    await ask(f.chat, f.conversation.id, '比较 UnifiedServe');
    assert.deepEqual(f.conversation.messages[1].sources, [source]);
    assert.match(f.requests[0].messages.at(-1)!.content, /CURRENT-ORIGINAL-BODY/);
    assert.match(f.conversation.messages[1].contextNotice!, /已保留当前文献材料/);
    assert.equal(JSON.stringify(f.chat.state).includes('/private/failed-library.pdf'), false);
  } finally { await f.chat.shutdown(); }
});

test('missing current PDF can still perform an approved related lookup with an explicit missing-current notice', async () => {
  const f = await fixture(async request => {
    if (!request.options.relatedPapers) throw new Error('current PDF missing');
    return { text: '[S2 p.2] RELATED-PRIVATE-ORIGINAL-BODY', sources: [relatedSource] };
  }, undefined, lookupAnswer(true, 'UnifiedServe'));
  try {
    await ask(f.chat, f.conversation.id, '查找 UnifiedServe 原文');
    assert.deepEqual(f.conversation.messages[1].sources, [relatedSource]);
    assert.match(f.conversation.messages[1].contextNotice!, /当前文献原文读取失败/);
    assert.match(f.requests[0].messages.at(-1)!.content, /RELATED-PRIVATE-ORIGINAL-BODY/);
    assert.equal(f.conversation.messages[1].status, 'complete');
  } finally { await f.chat.shutdown(); }
});

test('cancel during a planner that ignores abort prevents both library retrieval and final completion', async () => {
  let entered!: () => void;
  let release!: () => void;
  let reads = 0;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture(async () => { reads++; return currentEvidence; }, undefined, async request => {
    entered();
    await new Promise<void>(resolve => { release = resolve; });
    request.onText(JSON.stringify({ lookup: true, query: 'UnifiedServe' }));
    return {};
  });
  try {
    f.chat.setDraft(f.conversation.id, '比较其他文献');
    const pending = f.chat.send(f.conversation.id);
    await started;
    assert.match(f.conversation.messages[1].contextNotice!, /正在判断/);
    f.chat.stop(f.conversation.id);
    await pending;
    assert.equal(reads, 1);
    assert.equal(f.requests.length, 0);
    assert.equal(f.conversation.messages[1].status, 'stopped');
    assert.equal(f.conversation.messages[1].content, '');
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(reads, 1);
    assert.equal(f.requests.length, 0);
  } finally { await f.chat.shutdown(); }
});

test('related-only permission does not fetch anything when the planner decides current conversation is sufficient', async () => {
  let reads = 0;
  const f = await fixture(async () => { reads++; return comparisonEvidence; });
  try {
    f.chat.setReadingOptions(f.conversation.id, { currentPaper: false, relatedPapers: true });
    await ask(f.chat, f.conversation.id, '谢谢，继续解释刚才的术语');
    assert.equal(f.plannerRequests.length, 1);
    assert.equal(reads, 0);
    assert.equal(f.conversation.messages[1].sources, undefined);
    assert.match(f.conversation.messages[1].contextNotice!, /未读取到文献原文/);
  } finally { await f.chat.shutdown(); }
});
