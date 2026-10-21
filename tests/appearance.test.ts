import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from '../src/core.ts';
import { DEFAULT_USER_MESSAGE_COLOR, getUserMessageTextColor, normalizeUserMessageColor } from '../src/appearance.ts';
import type { Config, Repository, SecretStore, StoreState } from '../src/types.ts';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const secrets: SecretStore = { async get() { return ''; }, async set() { return true; }, async delete() {} };
const config: Config = { version: 1, endpoints: [], models: [], defaultModelId: '', systemPrompt: '保留原有提示词' };

function legacyState(): StoreState {
  return {
    version: 1, config: copy(config), lastByScope: { '1:PAPER': 'conversation' }, conversations: [{
      id: 'conversation', scope: { libraryID: 1, itemKey: 'PAPER', title: 'Original paper' }, title: 'Existing conversation', modelId: '',
      createdAt: 1, updatedAt: 2, draft: '未发送草稿', messages: [
        { id: 'user', role: 'user', content: '原来的问题', createdAt: 1, status: 'complete', requestId: 'request' },
        { id: 'assistant', role: 'assistant', content: '原来的回答', createdAt: 2, status: 'complete', requestId: 'request' },
      ],
    }],
  };
}

function repository(initial: StoreState | null = null) {
  let saved = initial ? copy(initial) : null;
  const repo: Repository = { async load() { return saved ? copy(saved) : null; }, async save(value) { saved = copy(value); } };
  return { repo, get saved() { return saved; } };
}

test('accepts only six-digit opaque hex colors and normalizes case', () => {
  assert.equal(DEFAULT_USER_MESSAGE_COLOR, '#eaf3ff');
  assert.equal(normalizeUserMessageColor('#A1b2C3'), '#a1b2c3');
  assert.equal(normalizeUserMessageColor('#000000'), '#000000');
  assert.equal(normalizeUserMessageColor('#FFFFFF'), '#ffffff');
  for (const value of [undefined, null, false, 123, {}, [], '#abc', '#abcd', '#12345678', 'red', ' #123456', '#123456 ', '#gg0000', '#123456; background-image: url(https://private.example)', 'var(--color)', 'rgb(1, 2, 3)']) {
    assert.equal(normalizeUserMessageColor(value), DEFAULT_USER_MESSAGE_COLOR);
  }
});

test('chooses readable black or white text for light, dark, and saturated backgrounds', () => {
  assert.equal(getUserMessageTextColor(DEFAULT_USER_MESSAGE_COLOR), '#000000');
  assert.equal(getUserMessageTextColor('#ffffff'), '#000000');
  assert.equal(getUserMessageTextColor('#000000'), '#ffffff');
  assert.equal(getUserMessageTextColor('#0000ff'), '#ffffff');
  assert.equal(getUserMessageTextColor('#00ff00'), '#000000');
  assert.equal(getUserMessageTextColor('#ff0000'), '#000000');
  assert.equal(getUserMessageTextColor('#757575'), '#ffffff');
  assert.equal(getUserMessageTextColor('#777777'), '#000000');
  assert.equal(getUserMessageTextColor('invalid CSS'), '#000000');
});

test('old configurations load with the default color and retain all existing history', async () => {
  const before = legacyState();
  const storage = repository(before);
  const chat = new ChatService(storage.repo, secrets);
  try {
    await chat.init();
    assert.equal(chat.getConfig().appearance?.userMessageColor, DEFAULT_USER_MESSAGE_COLOR);
    assert.equal(chat.getConfig().systemPrompt, '保留原有提示词');
    assert.deepEqual(chat.state.conversations, before.conversations);
    assert.deepEqual(chat.state.lastByScope, before.lastByScope);
    assert.equal(chat.storageError, '');
  } finally { await chat.shutdown(); }
  const fresh = new ChatService(repository().repo, secrets);
  try {
    await fresh.init();
    assert.equal(fresh.getConfig().appearance?.userMessageColor, DEFAULT_USER_MESSAGE_COLOR);
  } finally { await fresh.shutdown(); }
});

test('a saved custom color is normalized and survives restart without changing conversations', async () => {
  const storage = repository(legacyState());
  const chat = new ChatService(storage.repo, secrets);
  try {
    await chat.init();
    await chat.saveConfig({ ...chat.getConfig(), appearance: { userMessageColor: '#123ABC' } });
    assert.equal(chat.getConfig().appearance?.userMessageColor, '#123abc');
  } finally { await chat.shutdown(); }
  const restored = new ChatService(storage.repo, secrets);
  try {
    await restored.init();
    assert.equal(restored.getConfig().appearance?.userMessageColor, '#123abc');
    assert.equal(restored.state.conversations[0].draft, '未发送草稿');
    assert.equal(restored.state.conversations[0].messages[1].content, '原来的回答');
  } finally { await restored.shutdown(); }
});

test('malformed saved appearance falls back without treating the whole history as corrupt', async () => {
  for (const appearance of [null, 'red', [], { userMessageColor: 'url(https://private.example)' }, { userMessageColor: 5 }, { unexpected: true }]) {
    const before = legacyState();
    (before.config as any).appearance = appearance;
    const chat = new ChatService(repository(before).repo, secrets);
    try {
      await chat.init();
      assert.equal(chat.getConfig().appearance?.userMessageColor, DEFAULT_USER_MESSAGE_COLOR);
      assert.deepEqual(chat.state.conversations, before.conversations);
      assert.equal(chat.storageError, '');
    } finally { await chat.shutdown(); }
  }
});

test('invalid appearance supplied on save is replaced with a safe default', async () => {
  const storage = repository(legacyState());
  const chat = new ChatService(storage.repo, secrets);
  try {
    await chat.init();
    const next = chat.getConfig();
    (next as any).appearance = { userMessageColor: '#123456; background-image: url(https://private.example)', injectedProperty: 'must-not-persist' };
    await chat.saveConfig(next);
    assert.deepEqual(chat.getConfig().appearance, { userMessageColor: DEFAULT_USER_MESSAGE_COLOR });
    assert.equal(JSON.stringify(storage.saved).includes('private.example'), false);
    assert.equal(JSON.stringify(storage.saved).includes('must-not-persist'), false);
    assert.equal(storage.saved?.conversations[0].messages.length, 2);
  } finally { await chat.shutdown(); }
});
