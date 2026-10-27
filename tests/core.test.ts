import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from '../src/core.ts';
import type { ChatRequest, ChatTransport, Config, Repository, SecretStore, StoreState } from '../src/types.ts';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const config: Config = {
  version: 1,
  endpoints: [{ id: 'e1', name: '接口一', baseURL: 'https://first.example/v1', stream: true }, { id: 'e2', name: '接口二', baseURL: 'https://second.example/v1', stream: false }],
  models: [{ id: 'm1', endpointId: 'e1', name: '模型一', model: 'actual-one' }, { id: 'm2', endpointId: 'e2', name: '模型二', model: 'actual-two' }],
  defaultModelId: 'm1', systemPrompt: 'test system',
};
const scope = { libraryID: 1, itemKey: 'PAPER1', title: '测试文献' };
const secrets: SecretStore = { async get(id) { return `secret-${id}`; }, async set() { return true; }, async delete() {} };

function repository(state: StoreState | null = null) {
  const writes: StoreState[] = [];
  const repo: Repository = { async load() { return state ? copy(state) : null; }, async save(value) { state = copy(value); writes.push(copy(value)); } };
  return { repo, writes, get state() { return state; } };
}

async function service(transport: ChatTransport = async request => { request.onText('回答'); return {}; }) {
  const storage = repository();
  const chat = new ChatService(storage.repo, secrets, transport);
  await chat.init();
  await chat.saveConfig(config);
  return { chat, storage };
}

test('multiple models retain complete context and snapshot historical names', async () => {
  const requests: ChatRequest[] = [];
  const { chat, storage } = await service(async request => { requests.push(request); request.onText(`回答${requests.length}`); return {}; });
  try {
    const conversation = chat.forScope(scope);
    chat.setDraft(conversation.id, '第一问');
    chat.setQuote(conversation.id, { text: '文献原文', pageLabel: '7', attachmentKey: 'PDF1' });
    await chat.send(conversation.id);
    chat.setModel(conversation.id, 'm2');
    chat.setDraft(conversation.id, '继续解释');
    await chat.send(conversation.id);
    assert.equal(requests[1].model.model, 'actual-two');
    assert.equal(requests[1].key, 'secret-e2');
    assert.deepEqual(requests[1].messages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
    assert.match(requests[1].messages[1].content, /文献原文/);
    assert.match(requests[1].messages[1].content, /第 7 页/);
    assert.equal(conversation.messages[0].content, '第一问');
    assert.equal(conversation.messages[0].quote?.text, '文献原文');
    assert.equal(conversation.messages[1].modelName, '模型一');
    assert.equal(conversation.messages[3].endpointName, '接口二');
    const next = chat.getConfig();
    next.models[0].name = '改名模型';
    await chat.saveConfig(next);
    assert.equal(conversation.messages[1].modelName, '模型一');
    await chat.flush();
    assert.equal(JSON.stringify(storage.state).includes('secret-e'), false);
  } finally { await chat.shutdown(); }
});

test('model selection changes the next request, not a request already generating', async () => {
  let release!: () => void;
  let running: ChatRequest | undefined;
  const { chat } = await service(async request => { running = request; await new Promise<void>(resolve => { release = resolve; }); request.onText('完成'); return {}; });
  try {
    const conversation = chat.forScope(scope);
    chat.setDraft(conversation.id, '问题');
    const pending = chat.send(conversation.id);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(chat.isBusy(conversation.id), true);
    chat.setModel(conversation.id, 'm2');
    assert.equal(running?.model.model, 'actual-one');
    assert.equal(running?.endpoint.id, 'e1');
    release();
    await pending;
    assert.equal(conversation.modelId, 'm2');
    assert.equal(conversation.messages[1].modelID, 'actual-one');
  } finally { await chat.shutdown(); }
});

test('failed and stopped rounds are excluded from subsequent context; retry reuses the user', async () => {
  const requests: ChatRequest[] = [];
  let fail = true;
  const { chat } = await service(async request => { requests.push(request); request.onText(fail ? '部分' : '成功'); if (fail) throw new Error('API 服务暂时不可用（503），请稍后手动重试。'); return {}; });
  try {
    const conversation = chat.forScope(scope);
    chat.setDraft(conversation.id, '失败的问题');
    await chat.send(conversation.id);
    assert.equal(conversation.messages[1].status, 'error');
    const originalUserID = conversation.messages[0].id;
    fail = false;
    await chat.retry(conversation.id);
    assert.equal(conversation.messages.length, 2);
    assert.equal(conversation.messages[0].id, originalUserID);
    assert.equal(conversation.messages[1].content, '成功');
    assert.equal(requests[1].messages.length, 2);
    fail = true;
    chat.setDraft(conversation.id, '第二个失败问题');
    await chat.send(conversation.id);
    fail = false;
    chat.setDraft(conversation.id, '第三问');
    await chat.send(conversation.id);
    assert.deepEqual(requests.at(-1)?.messages.map(message => message.content), ['test system', '失败的问题', '成功', '第三问']);
  } finally { await chat.shutdown(); }
});

test('stop preserves partial text and late chunks do not mutate another conversation', async () => {
  const { chat } = await service(async request => {
    request.onText('已收到');
    await new Promise<void>((_resolve, reject) => request.signal.addEventListener('abort', () => { request.onText('不应收到'); reject(new Error('abort')); }, { once: true }));
    return {};
  });
  try {
    const first = chat.forScope(scope);
    chat.setDraft(first.id, '问题');
    const pending = chat.send(first.id);
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = chat.createConversation({ ...scope, itemKey: 'OTHER' });
    chat.stop(first.id);
    await pending;
    assert.equal(first.messages[1].content, '已收到');
    assert.equal(first.messages[1].status, 'stopped');
    assert.equal(second.messages.length, 0);
    assert.equal(chat.isBusy(first.id), false);
  } finally { await chat.shutdown(); }
});

test('paper scopes, multiple sessions, drafts, quotes, and last active session survive restart', async () => {
  const { chat, storage } = await service();
  const first = chat.forScope(scope);
  const second = chat.createConversation(scope);
  const libraryTwo = chat.forScope({ ...scope, libraryID: 2 });
  assert.notEqual(libraryTwo.id, first.id);
  chat.activateConversation(first.id);
  chat.setDraft(first.id, '未发送草稿');
  chat.setQuote(first.id, { text: '引用' });
  chat.renameConversation(first.id, '我的对话');
  assert.equal(chat.forScope(scope).id, first.id);
  assert.equal(chat.listConversations(scope).length, 2);
  assert.equal(chat.listConversations(undefined, '我的对话')[0].id, first.id);
  await chat.shutdown();
  const restored = new ChatService(storage.repo, secrets);
  try {
    await restored.init();
    assert.equal(restored.forScope(scope).id, first.id);
    assert.equal(restored.forScope(scope).draft, '未发送草稿');
    assert.equal(restored.forScope(scope).quote?.text, '引用');
    restored.deleteConversation(first.id);
    assert.equal(restored.forScope(scope).id, second.id);
  } finally { await restored.shutdown(); }
});

test('saved streaming messages recover as interrupted and may be retried', async () => {
  const { chat, storage } = await service();
  const conversation = chat.forScope(scope);
  conversation.messages.push({ id: 'u', role: 'user', content: '问题', requestId: 'r', status: 'complete', createdAt: 1 }, { id: 'a', role: 'assistant', content: '一部分', requestId: 'r', status: 'streaming', createdAt: 1 });
  await chat.shutdown();
  const restored = new ChatService(storage.repo, secrets, async request => { request.onText('重试成功'); return {}; });
  try {
    await restored.init();
    const loaded = restored.getConversation(conversation.id)!;
    assert.equal(loaded.messages[1].status, 'interrupted');
    await restored.retry(loaded.id);
    assert.equal(loaded.messages.length, 2);
    assert.equal(loaded.messages[1].content, '重试成功');
  } finally { await restored.shutdown(); }
});

test('corrupt or unreadable data is never overwritten', async () => {
  let saves = 0;
  const chat = new ChatService({ async load() { return { version: 9 } as unknown as StoreState; }, async save() { saves++; } }, secrets);
  await assert.rejects(chat.init(), /停止写入/);
  assert.throws(() => chat.createConversation(scope), /停止写入/);
  await chat.flush();
  await chat.shutdown();
  assert.equal(saves, 0);
  assert.match(chat.storageError, /损坏/);
});

test('serial persistence keeps newer edits and reports then recovers from save failure', async () => {
  let stored: StoreState | undefined;
  let active = 0;
  let maximum = 0;
  let fail = true;
  const chat = new ChatService({ async load() { return null; }, async save(value) { active++; maximum = Math.max(maximum, active); try { await new Promise(resolve => setTimeout(resolve, 5)); if (fail) throw new Error('disk'); stored = copy(value); } finally { active--; } } }, secrets);
  await chat.init();
  const conversation = chat.createConversation(scope);
  await assert.rejects(chat.flush(), /could not be saved/);
  assert.match(chat.storageError, /could not be saved/);
  fail = false;
  const first = chat.flush();
  chat.setDraft(conversation.id, '最新草稿');
  const second = chat.flush();
  await Promise.all([first, second]);
  assert.equal(maximum, 1);
  assert.equal(stored?.conversations[0].draft, '最新草稿');
  assert.equal(chat.storageError, '');
  await chat.shutdown();
});

test('secret-store errors and API credentials are not copied into messages', async () => {
  const storage = repository();
  const chat = new ChatService(storage.repo, { ...secrets, async get() { throw new Error('API sk-secret-private'); } });
  try {
    await chat.init();
    await chat.saveConfig(config);
    const conversation = chat.forScope(scope);
    chat.setDraft(conversation.id, '问题');
    await chat.send(conversation.id);
    assert.equal(conversation.messages[1].status, 'error');
    assert.match(conversation.messages[1].error!, /密钥读取失败/);
    assert.equal(JSON.stringify(chat.state).includes('sk-secret-private'), false);
  } finally { await chat.shutdown(); }
});
