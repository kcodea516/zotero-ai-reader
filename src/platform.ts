import { bilingualError } from './i18n-errors.ts';
import type { Repository, SecretStore, StoreState } from './types';

const SECRET_ORIGIN = 'chrome://ai-reader';
const SECRET_REALM = 'AI Reader endpoint credentials';

/** Storage belongs to this add-on, never to the Zotero library database. */
export class ZoteroRepository implements Repository {
  readonly directory: string;
  readonly statePath: string;

  constructor(profileDirectory = Zotero.Profile.dir) {
    this.directory = PathUtils.join(profileDirectory, 'ai-reader');
    this.statePath = PathUtils.join(this.directory, 'state.json');
  }

  async load(): Promise<StoreState | null> {
    if (!(await IOUtils.exists(this.statePath))) return null;
    try {
      return JSON.parse(await IOUtils.readUTF8(this.statePath)) as StoreState;
    } catch {
      throw bilingualError('无法读取 AI 对话记录。原文件已保留。', "AI conversation history could not be read. The original file has been preserved.");
    }
  }

  async save(state: StoreState): Promise<void> {
    await IOUtils.makeDirectory(this.directory, { ignoreExisting: true, permissions: 0o700 });
    await IOUtils.writeUTF8(this.statePath, JSON.stringify(state), {
      tmpPath: this.statePath + '.tmp',
      flush: true,
    });
    await IOUtils.setPermissions(this.statePath, 0o600);
  }
}

/** Keys are encrypted by OSKeyStore before entering our own login-manager realm. */
export class ZoteroSecretStore implements SecretStore {
  private session = new Map<string, string>();

  private async find(endpointId: string): Promise<any[]> {
    const entries = await Services.logins.searchLoginsAsync({ origin: SECRET_ORIGIN, httpRealm: SECRET_REALM });
    return entries.filter((entry: any) => entry.username === endpointId);
  }

  async get(endpointId: string): Promise<string> {
    if (this.session.has(endpointId)) return this.session.get(endpointId)!;
    try {
      const entry = (await this.find(endpointId))[0];
      if (!entry) return '';
      if (!Zotero.OSKeyStore.isEncrypted(entry.password)) throw new Error('Unexpected credential format');
      return await Zotero.OSKeyStore.decrypt(entry.password);
    } catch {
      throw bilingualError('无法解锁此接口的 API Key，请在设置中重新输入。', "The API key for this endpoint could not be unlocked. Enter it again in Settings.");
    }
  }

  async set(endpointId: string, key: string): Promise<boolean> {
    const value = key.trim();
    if (!value) { await this.delete(endpointId); return true; }
    this.session.set(endpointId, value);
    try {
      const encrypted = await Zotero.OSKeyStore.encrypt(value);
      const login = Components.classes['@mozilla.org/login-manager/loginInfo;1']
        .createInstance(Components.interfaces.nsILoginInfo);
      login.init(SECRET_ORIGIN, null, SECRET_REALM, endpointId, encrypted, '', '');
      const entries = await this.find(endpointId);
      if (entries.length) Services.logins.modifyLogin(entries[0], login);
      else await Services.logins.addLoginAsync(login);
      for (const duplicate of entries.slice(1)) Services.logins.removeLogin(duplicate);
      return true;
    } catch {
      // A failed platform keystore remains untouched. The caller displays the
      // session-only warning; there is no plaintext fallback or repair routine.
      return false;
    }
  }

  async delete(endpointId: string): Promise<void> {
    this.session.delete(endpointId);
    try {
      for (const entry of await this.find(endpointId)) Services.logins.removeLogin(entry);
    } catch {
      throw bilingualError('无法从安全存储删除此接口的 API Key。', "The API key for this endpoint could not be deleted from secure storage.");
    }
  }

  clearSession(): void { this.session.clear(); }
}
