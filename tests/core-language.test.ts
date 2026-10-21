import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService, DEFAULT_SYSTEM_PROMPT } from '../src/core.ts';
import { bilingualError } from '../src/i18n-errors.ts';
import { localizeError } from '../src/i18n.ts';
import { normalizeEndpoint, chatCompletion } from '../src/transport.ts';
import { buildPaperContext } from '../src/reading.ts';
import { createZoteroPaperContextProvider } from '../src/zotero-reading.ts';
import type { ChatRequest, ChatTransport, Config, PaperContextProvider, PaperContextRequest, Repository, SecretStore } from '../src/types.ts';

const secrets: SecretStore = { async get() { return ''; }, async set() { return true; }, async delete() {} };
const scope = { libraryID: 1, itemKey: 'PAPER', title: 'Original title' };
const source = { id: 'S1', title: scope.title, libraryID: 1, itemKey: scope.itemKey, attachmentKey: 'PDF', pages: [2], totalPages: 4, truncated: true };
const evidence = { text: '[S1 p.2] Original paper text', sources: [source] };
const configuration = (): Config => ({ version: 1, language: 'en-US', endpoints: [{ id: 'api', name: 'Original endpoint', baseURL: 'https://example.test/v1', stream: true }], models: [{ id: 'model', endpointId: 'api', name: 'Original model', model: 'model' }], defaultModelId: 'model', systemPrompt: '用户原有中文提示词，请保留。' });

async function fixture(provider: PaperContextProvider, transport?: ChatTransport, secretStore = secrets, repository?: Repository) {
  const requests: ChatRequest[] = [];
  const chat = new ChatService(repository || { async load() { return null; }, async save() {} }, secretStore, async request => {
    requests.push(request);
    if (transport) return transport(request);
    request.onText('模型回答不因界面设置被改写。');
    return {};
  }, provider);
  await chat.init(); await chat.saveConfig(configuration());
  return { chat, requests, conversation: chat.forScope(scope) };
}

async function ask(chat: ChatService, id: string, text = 'Explain the mechanism') {
  chat.setDraft(id, text); await chat.send(id);
}

test('English request notices and default titles do not rewrite model prompts or content', async () => {
  const observed: PaperContextRequest[] = [];
  const f = await fixture(async request => { observed.push(request); return evidence; });
  try {
    assert.equal(f.conversation.title, 'New conversation');
    f.chat.setReadingOptions(f.conversation.id, { currentPaper: true, relatedPapers: false });
    await ask(f.chat, f.conversation.id);
    assert.equal(observed[0].language, 'en-US');
    assert.equal(f.conversation.title, 'Explain the mechanism');
    assert.equal(f.conversation.messages[1].content, '模型回答不因界面设置被改写。');
    assert.match(f.conversation.messages[1].contextNotice!, /Read excerpts from 1 paper\./);
    assert.match(f.conversation.messages[1].contextNotice!, /Library lookup is disabled/);
    assert.doesNotMatch(f.conversation.messages[1].contextNotice!, /[\p{Script=Han}]/u);
    assert.equal(f.chat.getConfig().systemPrompt, configuration().systemPrompt);
    assert.ok(f.requests[0].messages[0].content.startsWith(configuration().systemPrompt));
    const second = f.chat.createConversation(scope);
    f.chat.renameConversation(second.id, '用户自己起的名字');
    await ask(f.chat, second.id, 'A question');
    assert.equal(second.title, '用户自己起的名字');
    assert.match(DEFAULT_SYSTEM_PROMPT, /中文文献/);
  } finally { await f.chat.shutdown(); }
});

test('request language is snapshotted while old conversation content remains unchanged', async () => {
  let entered!: () => void;
  let release!: () => void;
  const observed: PaperContextRequest[] = [];
  const started = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture(async request => {
    observed.push(request);
    if (observed.length === 1) { entered(); await new Promise<void>(resolve => { release = resolve; }); }
    return evidence;
  });
  try {
    f.chat.setReadingOptions(f.conversation.id, { currentPaper: true, relatedPapers: false });
    const pending = ask(f.chat, f.conversation.id, 'First question');
    await started;
    await f.chat.saveConfig({ ...f.chat.getConfig(), language: 'zh-CN' });
    release(); await pending;
    assert.match(f.conversation.messages[1].contextNotice!, /Read excerpts/);
    const oldTitle = f.conversation.title;
    const oldAnswer = f.conversation.messages[1].content;
    await ask(f.chat, f.conversation.id, 'Second question');
    assert.deepEqual(observed.map(request => request.language), ['en-US', 'zh-CN']);
    assert.match(f.conversation.messages[3].contextNotice!, /已读取/);
    assert.equal(f.conversation.title, oldTitle);
    assert.equal(f.conversation.messages[1].content, oldAnswer);
  } finally { await f.chat.shutdown(); }
});

test('English lookup failure keeps current evidence and excludes native errors from saved messages', async () => {
  const f = await fixture(async () => evidence, async request => {
    if (request.messages[0].content.includes('zotero-library-lookup-decision')) throw new Error('/private/api-key-secret');
    request.onText('Original response'); return {};
  });
  try {
    await ask(f.chat, f.conversation.id, 'Compare another paper');
    assert.equal(f.conversation.messages[1].status, 'complete');
    assert.match(f.conversation.messages[1].contextNotice!, /Could not determine whether library lookup was needed/);
    assert.match(f.conversation.messages[1].contextNotice!, /Read excerpts/);
    assert.doesNotMatch(f.conversation.messages[1].contextNotice!, /[\p{Script=Han}]/u);
    assert.equal(JSON.stringify(f.chat.state).includes('api-key-secret'), false);
    assert.match(f.requests.at(-1)!.messages.at(-1)!.content, /Original paper text/);
  } finally { await f.chat.shutdown(); }
});

test('English cancellation stops context loading before a completion request', async () => {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture(async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return evidence; });
  try {
    const pending = ask(f.chat, f.conversation.id);
    await started;
    assert.equal(f.conversation.messages[1].contextNotice, 'Reading the current paper text…');
    f.chat.stop(f.conversation.id); await pending; release();
    assert.equal(f.requests.length, 0);
    assert.equal(f.conversation.messages[1].contextNotice, 'Paper-text reading stopped.');
    assert.equal(f.conversation.messages[1].error, 'Generation stopped. You can retry this round.');
  } finally { await f.chat.shutdown(); }
});

test('English errors are persisted safely while standalone errors retain Chinese compatibility', async () => {
  const f = await fixture(async () => evidence, async () => { throw bilingualError('API 返回了无效的 JSON。', 'The API returned invalid JSON.'); });
  try {
    f.chat.setReadingOptions(f.conversation.id, { currentPaper: false, relatedPapers: false });
    await ask(f.chat, f.conversation.id);
    assert.equal(f.conversation.messages[1].error, 'The API returned invalid JSON.');
  } finally { await f.chat.shutdown(); }
  const keyFailure = await fixture(async () => evidence, undefined, { ...secrets, async get() { throw new Error('sk-private-key'); } });
  try {
    await ask(keyFailure.chat, keyFailure.conversation.id);
    assert.match(keyFailure.conversation.messages[1].error!, /API key could not be read/);
    assert.equal(JSON.stringify(keyFailure.chat.state).includes('sk-private-key'), false);
  } finally { await keyFailure.chat.shutdown(); }
  try { normalizeEndpoint('not a URL'); assert.fail('invalid URL accepted'); }
  catch (error) {
    assert.match((error as Error).message, /API 地址无效/);
    assert.equal(localizeError(error, 'en-US'), 'The API address is invalid. Enter a complete HTTP(S) URL.');
  }
});

test('HTTP failures carry safe English metadata without exposing response bodies', async t => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response('private provider body sk-secret', { status: 401 });
  t.after(() => { globalThis.fetch = previous; });
  const request: ChatRequest = { endpoint: configuration().endpoints[0], model: configuration().models[0], key: 'secret', messages: [], signal: new AbortController().signal, onText() {} };
  await assert.rejects(chatCompletion(request), error => {
    assert.match((error as Error).message, /鉴权失败/);
    assert.equal(localizeError(error, 'en-US'), 'API authentication failed (401). Check your API key and permissions.');
    assert.equal(JSON.stringify(error).includes('private provider body'), false);
    return true;
  });
});

test('paper warnings use English without translating original document text', () => {
  const empty = buildPaperContext(undefined, [], '', 'en-US');
  assert.equal(empty.warning, 'The current paper text was not retrieved.');
  const paper = { paper: { ...scope }, attachmentKey: 'PDF', totalPages: 1, pages: [{ page: 1, text: '用户论文的原始正文。' }] };
  const context = buildPaperContext(paper, [], '', 'en-US');
  assert.match(context.text, /用户论文的原始正文/);
  assert.match(context.text, /以下是本地文献参考资料/);
  assert.equal(buildPaperContext(undefined).warning, '未读取到当前文献正文。');
});

test('Zotero adapter reports missing originals in the requested language', async () => {
  const item = { id: 1, libraryID: 1, key: 'PAPER', deleted: false, getField() { return ''; }, getCollections() { return []; }, isAttachment() { return false; }, getAttachments() { return []; } };
  const provider = createZoteroPaperContextProvider({ zotero: { Items: { async getByLibraryAndKeyAsync() { return item; }, async loadDataTypes() {} }, Reader: { _readers: [] } }, files: {} });
  const context = await provider({ scope, question: 'Question', previousQuestions: [], options: { currentPaper: true, relatedPapers: false }, language: 'en-US', signal: new AbortController().signal });
  assert.match(context.warning!, /complete local PDF text could not be read/);
  assert.doesNotMatch(context.warning!, /[\p{Script=Han}]/u);
  assert.deepEqual(context.sources, []);
});
