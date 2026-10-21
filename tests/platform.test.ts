import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ZoteroRepository, ZoteroSecretStore } from '../src/platform.ts';
import type { StoreState } from '../src/types.ts';

const ORIGIN = 'chrome://ai-reader';
const REALM = 'AI Reader endpoint credentials';
type Login = { origin: string; httpRealm: string; username: string; password: string };

function platform() {
  const logins: Login[] = [];
  const loginWrites: Login[] = [];
  const searches: Record<string, string>[] = [];
  const files = new Map<string, string>();
  const operations: { name: string; args: any[] }[] = [];
  let encryptionFails = false;
  let decryptionFails = false;
  let readsFail = false;
  let writesFail = false;
  const globals: Record<string, any> = {
    Zotero: {
      Profile: { dir: '/mock-profile' },
      OSKeyStore: {
        isEncrypted(value: string) { return value.startsWith('oskv1:'); },
        async encrypt(value: string) {
          if (encryptionFails) throw new Error('native keychain error sk-private');
          return `oskv1:${Buffer.from(value).toString('base64')}`;
        },
        async decrypt(value: string) {
          if (decryptionFails) throw new Error('native unlock error sk-private');
          return Buffer.from(value.slice('oskv1:'.length), 'base64').toString();
        },
      },
    },
    Services: {
      logins: {
        async searchLoginsAsync(query: Record<string, string>) {
          searches.push({ ...query });
          return logins.filter(login => login.origin === query.origin && login.httpRealm === query.httpRealm);
        },
        async addLoginAsync(login: Login) { logins.push(login); loginWrites.push({ ...login }); },
        modifyLogin(oldLogin: Login, login: Login) {
          const index = logins.indexOf(oldLogin);
          assert.notEqual(index, -1);
          logins[index] = login;
          loginWrites.push({ ...login });
        },
        removeLogin(login: Login) {
          const index = logins.indexOf(login);
          assert.notEqual(index, -1);
          logins.splice(index, 1);
        },
      },
    },
    Components: {
      interfaces: { nsILoginInfo: {} },
      classes: { '@mozilla.org/login-manager/loginInfo;1': {
        createInstance() {
          return { init(origin: string, _submitURL: null, httpRealm: string, username: string, password: string) { Object.assign(this, { origin, httpRealm, username, password }); } };
        },
      } },
    },
    PathUtils: { join: path.posix.join },
    IOUtils: {
      async exists(file: string) { return files.has(file); },
      async readUTF8(file: string) { if (readsFail) throw new Error('native filesystem error'); return files.get(file); },
      async makeDirectory(...args: any[]) { operations.push({ name: 'makeDirectory', args }); },
      async writeUTF8(file: string, text: string, options: any) {
        operations.push({ name: 'writeUTF8', args: [file, text, options] });
        if (writesFail) throw new Error('simulated disk full');
        files.set(file, text);
      },
      async setPermissions(...args: any[]) { operations.push({ name: 'setPermissions', args }); },
    },
  };
  const original = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  return {
    logins, loginWrites, searches, files, operations,
    failEncryption() { encryptionFails = true; },
    failDecryption() { decryptionFails = true; },
    failReads() { readsFail = true; },
    failWrites() { writesFail = true; },
    restore() {
      for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as any)[name];
      }
    },
  };
}

test('secret store writes ciphertext only in its own realm and decrypts after restart', async () => {
  const mock = platform();
  try {
    const store = new ZoteroSecretStore();
    assert.equal(await store.set('endpoint-a', '  sk-private  '), true);
    assert.equal(mock.logins.length, 1);
    assert.equal(mock.logins[0].origin, ORIGIN);
    assert.equal(mock.logins[0].httpRealm, REALM);
    assert.equal(mock.logins[0].username, 'endpoint-a');
    assert.match(mock.logins[0].password, /^oskv1:/);
    assert.equal(JSON.stringify(mock.loginWrites).includes('sk-private'), false);
    assert.equal(await new ZoteroSecretStore().get('endpoint-a'), 'sk-private');
    assert.ok(mock.searches.every(query => query.origin === ORIGIN && query.httpRealm === REALM));
  } finally { mock.restore(); }
});

test('failed encryption returns session-only status and leaves previous stored credential intact', async () => {
  const mock = platform();
  try {
    const store = new ZoteroSecretStore();
    assert.equal(await store.set('endpoint-a', 'old-key'), true);
    const stored = { ...mock.logins[0] };
    const writes = mock.loginWrites.length;
    mock.failEncryption();
    assert.equal(await store.set('endpoint-a', 'new-session-key'), false);
    assert.equal(await store.get('endpoint-a'), 'new-session-key');
    assert.deepEqual(mock.logins[0], stored);
    assert.equal(mock.loginWrites.length, writes);
    assert.equal(await new ZoteroSecretStore().get('endpoint-a'), 'old-key');
    store.clearSession();
    assert.equal(await store.get('endpoint-a'), 'old-key');
    assert.equal(JSON.stringify(mock.logins).includes('new-session-key'), false);
  } finally { mock.restore(); }
});

test('deleting an endpoint removes its duplicate credentials but preserves other endpoints and realms', async () => {
  const mock = platform();
  try {
    const store = new ZoteroSecretStore();
    await store.set('endpoint-a', 'key-a');
    await store.set('endpoint-b', 'key-b');
    mock.logins.push({ ...mock.logins[0] });
    const foreignRealm = { origin: ORIGIN, httpRealm: 'Other plugin realm', username: 'endpoint-a', password: 'other-credential' };
    const foreignOrigin = { origin: 'chrome://zotero', httpRealm: REALM, username: 'endpoint-a', password: 'zotero-credential' };
    mock.logins.push(foreignRealm, foreignOrigin);
    await store.delete('endpoint-a');
    assert.equal(await store.get('endpoint-a'), '');
    assert.equal(await store.get('endpoint-b'), 'key-b');
    assert.equal(mock.logins.length, 3);
    assert.ok(mock.logins.includes(foreignRealm));
    assert.ok(mock.logins.includes(foreignOrigin));
  } finally { mock.restore(); }
});

test('unreadable or unencrypted saved credentials expose only a generic error', async () => {
  const mock = platform();
  try {
    const store = new ZoteroSecretStore();
    await store.set('endpoint-a', 'sk-private');
    mock.failDecryption();
    await assert.rejects(new ZoteroSecretStore().get('endpoint-a'), error => error instanceof Error && /无法解锁/.test(error.message) && !/native|sk-private/.test(error.message));
    mock.logins.push({ origin: ORIGIN, httpRealm: REALM, username: 'plaintext', password: 'sk-plaintext-private' });
    await assert.rejects(new ZoteroSecretStore().get('plaintext'), error => error instanceof Error && /无法解锁/.test(error.message) && !error.message.includes('sk-plaintext-private'));
    assert.equal(await store.set('endpoint-a', ''), true);
    assert.equal(await new ZoteroSecretStore().get('endpoint-a'), '');
  } finally { mock.restore(); }
});

test('repository distinguishes missing history from corrupt or unreadable JSON without overwriting it', async () => {
  const mock = platform();
  try {
    const repository = new ZoteroRepository();
    assert.equal(repository.statePath, '/mock-profile/ai-reader/state.json');
    assert.equal(await repository.load(), null);
    mock.files.set(repository.statePath, '{broken JSON');
    await assert.rejects(repository.load(), /原文件已保留/);
    assert.equal(mock.files.get(repository.statePath), '{broken JSON');
    mock.files.set(repository.statePath, '{}');
    mock.failReads();
    await assert.rejects(repository.load(), error => error instanceof Error && /原文件已保留/.test(error.message) && !error.message.includes('native'));
    assert.equal(mock.operations.length, 0);
  } finally { mock.restore(); }
});

test('repository requests atomic flushed writes with private directory and file permissions', async () => {
  const mock = platform();
  try {
    const repository = new ZoteroRepository('/different-profile');
    const state: StoreState = { version: 1, config: { version: 1, endpoints: [], models: [], defaultModelId: '', systemPrompt: '阅读助手' }, conversations: [], lastByScope: {} };
    await repository.save(state);
    assert.deepEqual(mock.operations.map(operation => operation.name), ['makeDirectory', 'writeUTF8', 'setPermissions']);
    assert.deepEqual(mock.operations[0].args, ['/different-profile/ai-reader', { ignoreExisting: true, permissions: 0o700 }]);
    assert.deepEqual(mock.operations[1].args, [repository.statePath, JSON.stringify(state), { tmpPath: repository.statePath + '.tmp', flush: true }]);
    assert.deepEqual(mock.operations[2].args, [repository.statePath, 0o600]);
    assert.deepEqual(await repository.load(), state);
  } finally { mock.restore(); }
});

test('repository propagates failed writes while retaining previous history', async () => {
  const mock = platform();
  try {
    const repository = new ZoteroRepository();
    mock.files.set(repository.statePath, '{"old":"history"}');
    mock.failWrites();
    const state: StoreState = { version: 1, config: { version: 1, endpoints: [], models: [], defaultModelId: '', systemPrompt: '' }, conversations: [], lastByScope: {} };
    await assert.rejects(repository.save(state));
    assert.equal(mock.files.get(repository.statePath), '{"old":"history"}');
    assert.equal(mock.operations.some(operation => operation.name === 'setPermissions'), false);
  } finally { mock.restore(); }
});
