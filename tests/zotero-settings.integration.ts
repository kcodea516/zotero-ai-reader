import { ChatService } from '../src/core.ts';
import { mountSettings } from '../src/settings.ts';
import { mountSidebar } from '../src/sidebar.ts';
import { DEFAULT_USER_MESSAGE_COLOR, getUserMessageTextColor } from '../src/appearance.ts';
import type { NativeButton } from '../src/controls.ts';
import type { Config, Host, PaperScope, SecretStore, StoreState } from '../src/types.ts';

/** Native settings and chat UI with isolated fake endpoints and memory storage.
 * This fixture never reads real keys, calls Test, writes profiles, or sends HTTP. */
export async function runSettingsChecks(win: Window): Promise<string[]> {
  const realm = win as Window & typeof globalThis;
  const doc = win.document;
  const checks: string[] = [];
  const check = (name: string, condition: unknown): void => {
    if (!condition) throw new Error(`Settings integration check failed: ${name}`);
    checks.push(name);
  };
  const pause = (ms = 140) => new Promise<void>(resolve => win.setTimeout(resolve, ms));
  const until = async (name: string, condition: () => boolean): Promise<void> => {
    const deadline = Date.now() + 5000;
    while (!condition() && Date.now() < deadline) await pause(20);
    if (!condition()) throw new Error(`Settings integration timed out: ${name}`);
    await pause();
  };
  const rgb = (hex: string): string => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  let saved: StoreState | null = null;
  let fakeAnswerCalls = 0;
  const keys = new Map<string, string>();
  const secretWrites: { endpointID: string; value: string }[] = [];
  const secrets: SecretStore = {
    async get(endpointID) { return keys.get(endpointID) || 'synthetic-integration-key'; },
    async set(endpointID, value) { keys.set(endpointID, value); secretWrites.push({ endpointID, value }); return true; },
    async delete(endpointID) { keys.delete(endpointID); },
  };
  const service = new ChatService({ async load() { return saved; }, async save(value) { saved = JSON.parse(JSON.stringify(value)) as StoreState; } }, secrets, async request => {
    fakeAnswerCalls++; request.onText('Synthetic assistant response, unchanged by user bubble appearance.'); return {};
  });
  const config: Config = {
    version: 1,
    endpoints: [
      { id: 'settings-endpoint-a', name: 'Synthetic API A', baseURL: 'https://a.invalid.example/v1', stream: true },
      { id: 'settings-endpoint-b', name: 'Synthetic API B', baseURL: 'https://b.invalid.example/v1', stream: false },
    ],
    models: [
      { id: 'settings-model-a', endpointId: 'settings-endpoint-a', name: 'Synthetic model A', model: 'fake-a' },
      { id: 'settings-model-b', endpointId: 'settings-endpoint-b', name: 'Synthetic model B', model: 'fake-b' },
    ],
    defaultModelId: 'settings-model-a', systemPrompt: 'Synthetic settings fixture only.',
  };
  const scope: PaperScope = { libraryID: 1, itemKey: 'SYNTHETIC_SETTINGS_ONLY', title: 'Synthetic appearance fixture' };
  const overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
  overlay.setAttribute('data-ai-reader-settings-integration', 'true');
  overlay.style.cssText = 'position:fixed;top:16px;right:16px;width:304px;height:min(82vh,760px);padding:0;margin:0;z-index:2147483647;background:Canvas;color:CanvasText;font-size:14px;overflow:hidden;';
  const settingsMount = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
  settingsMount.style.cssText = 'height:100%;width:100%;min-width:0;overflow:hidden;';
  const chatMount = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
  chatMount.style.cssText = 'height:100%;width:100%;min-width:0;overflow:hidden;';
  chatMount.hidden = true; overlay.append(settingsMount, chatMount);
  let unmountSettings: (() => void) | undefined;
  let panel: ReturnType<typeof mountSidebar> | undefined;
  const previousFocus = doc.activeElement as HTMLElement | null;
  const host: Host = { service, secretStore: secrets, rootURI: '', openSettings() {}, scopeForItem() { return null; }, openURL() {}, copy() {} };
  try {
    await service.init(); await service.saveConfig(config);
    const conversation = service.forScope(scope); service.setDraft(conversation.id, 'Synthetic user question with `code` and a [link](https://invalid.example).');
    await service.send(conversation.id);
    const originalMessages = JSON.stringify(conversation.messages);
    const selectedDetails = doc.querySelector<HTMLElement>('item-details.deck-selected');
    const activeDetails = selectedDetails && selectedDetails.getBoundingClientRect().width > 0 ? selectedDetails
      : Array.from(doc.querySelectorAll<HTMLElement>('item-details')).find(element => {
        const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && win.getComputedStyle(element).visibility !== 'hidden';
      });
    (activeDetails || doc.documentElement).append(overlay);
    unmountSettings = mountSettings(settingsMount, host); panel = mountSidebar(chatMount, scope, host); await pause();
    const find = <T extends Element>(selector: string): T => {
      const element = settingsMount.querySelector(selector);
      if (!element) throw new Error(`Settings integration missing element: ${selector}`);
      return element as T;
    };
    const endpoints = (): HTMLDetailsElement[] => Array.from(settingsMount.querySelectorAll<HTMLDetailsElement>('details.zar-endpoint'));
    const endpoint = (id: string): HTMLDetailsElement => find<HTMLDetailsElement>(`details.zar-endpoint[data-endpoint-id="${id}"]`);
    const button = (label: string, parent: Element = settingsMount): NativeButton => {
      const result = Array.from(parent.querySelectorAll<NativeButton>('button')).find(element => element.getAttribute('label') === label);
      if (!result) throw new Error('Settings integration action missing'); return result;
    };
    const input = (selector: string, value: string, parent: Element = settingsMount): HTMLInputElement => {
      const node = parent.querySelector<HTMLInputElement>(selector);
      if (!node) throw new Error(`Settings integration missing input: ${selector}`);
      node.value = value; node.dispatchEvent(new realm.Event('input', { bubbles: true })); return node;
    };
    const showChat = async (): Promise<void> => { settingsMount.hidden = true; chatMount.hidden = false; await pause(); };
    const showSettings = async (): Promise<void> => { chatMount.hidden = true; settingsMount.hidden = false; await pause(); };
    check('settings fixture inherits native item-details styles at 304px', !!activeDetails && overlay.closest('item-details') === activeDetails && Math.abs(overlay.getBoundingClientRect().width - 304) < 1);
    check('existing two endpoints start collapsed', endpoints().length === 2 && endpoints().every(element => !element.open));
    check('collapsed summaries identify host and model count', endpoints().every(element => !!element.querySelector('.zar-endpoint-summary')?.textContent?.includes('Synthetic API') && !!element.querySelector('.zar-endpoint-meta')?.textContent?.includes('invalid.example') && !!element.querySelector('.zar-endpoint-meta')?.textContent?.includes('1')));
    const colorInput = find<HTMLInputElement>('.zar-user-message-color');
    check('default user message color is light blue', colorInput.value.toLowerCase() === DEFAULT_USER_MESSAGE_COLOR);
    await showChat();
    const userBubble = chatMount.querySelector<HTMLElement>('.zar-message-user')!;
    const assistantBubble = chatMount.querySelector<HTMLElement>('.zar-message-assistant')!;
    const assistantBackground = win.getComputedStyle(assistantBubble).backgroundColor;
    check('existing user message displays default light blue', win.getComputedStyle(userBubble).backgroundColor === rgb(DEFAULT_USER_MESSAGE_COLOR));
    await showSettings();
    let first = endpoint('settings-endpoint-a');
    first.querySelector<HTMLElement>('summary')!.click(); await pause();
    check('summary expands endpoint editor', first.open && first.querySelector<HTMLElement>('.zar-endpoint-body')!.getBoundingClientRect().height > 0);
    const firstModelName = input('.zar-model-name-input', 'Edited synthetic model A', first);
    const keyDraft = input('.zar-endpoint-key-input', 'synthetic-new-key-never-real', first);
    first.querySelector<HTMLElement>('summary')!.click(); await pause();
    first.querySelector<HTMLElement>('summary')!.click(); await pause();
    check('collapse and expand preserve typed model and password without recreating inputs', firstModelName.isConnected && keyDraft.isConnected && first.querySelector<HTMLInputElement>('.zar-model-name-input') === firstModelName && firstModelName.value === 'Edited synthetic model A' && keyDraft.value === 'synthetic-new-key-never-real');
    button('添加模型', first).doCommand(); await pause(); first = endpoint('settings-endpoint-a');
    check('adding a model keeps endpoint open and preserves typed values', first.open && first.querySelectorAll('.zar-model-editor').length === 2 && first.querySelector<HTMLInputElement>('.zar-model-name-input')?.value === 'Edited synthetic model A' && first.querySelector<HTMLInputElement>('.zar-endpoint-key-input')?.value === 'synthetic-new-key-never-real');
    const addedModel = Array.from(first.querySelectorAll<HTMLElement>('.zar-model-editor')).at(-1)!;
    input('.zar-model-name-input', 'Added synthetic model', addedModel); input('.zar-model-id-input', 'fake-added', addedModel);
    first.querySelector<HTMLElement>('summary')!.click(); await pause();
    button('添加接口').doCommand(); await pause();
    const newEndpoint = endpoints().find(element => !['settings-endpoint-a', 'settings-endpoint-b'].includes(element.dataset.endpointId!))!;
    check('new endpoint opens automatically while existing collapsed cards stay collapsed', endpoints().length === 3 && !!newEndpoint?.open && !endpoint('settings-endpoint-a').open && !endpoint('settings-endpoint-b').open);
    check('new endpoint focuses its name field', doc.activeElement === newEndpoint.querySelector('.zar-endpoint-name-input'));
    input('.zar-endpoint-name-input', 'Added synthetic API', newEndpoint); input('.zar-endpoint-url-input', 'https://added.invalid.example/v1', newEndpoint);
    input('.zar-model-name-input', 'Added endpoint model', newEndpoint); input('.zar-model-id-input', 'fake-endpoint-added', newEndpoint);
    check('adding another endpoint preserves earlier key and model drafts', endpoint('settings-endpoint-a').querySelector<HTMLInputElement>('.zar-endpoint-key-input')?.value === 'synthetic-new-key-never-real' && endpoint('settings-endpoint-a').querySelector<HTMLInputElement>('.zar-model-name-input')?.value === 'Edited synthetic model A');
    const customColor = '#17365d'; input('.zar-user-message-color', customColor);
    const preview = find<HTMLElement>('.zar-color-preview-user');
    check('custom color previews before saving with readable foreground', win.getComputedStyle(preview).backgroundColor === rgb(customColor) && win.getComputedStyle(preview).color === rgb(getUserMessageTextColor(customColor)));
    check('unsaved preview does not change active saved conversation appearance', service.getConfig().appearance?.userMessageColor === DEFAULT_USER_MESSAGE_COLOR);
    button('保存设置').doCommand();
    await until('custom appearance saved', () => service.getConfig().appearance?.userMessageColor === customColor);
    const afterCustom = service.getConfig();
    check('saving preserves model drafts and adds configured endpoint', afterCustom.endpoints.length === 3 && afterCustom.models.length === 4 && afterCustom.models.some(model => model.id === 'settings-model-a' && model.name === 'Edited synthetic model A'));
    check('typed key is saved only to fake isolated secret store', secretWrites.some(entry => entry.endpointID === 'settings-endpoint-a' && entry.value === 'synthetic-new-key-never-real'));
    await showChat();
    check('saved color updates already-mounted user bubble without reload', win.getComputedStyle(userBubble).backgroundColor === rgb(customColor) && win.getComputedStyle(userBubble).color === rgb(getUserMessageTextColor(customColor)));
    const userHeader = userBubble.querySelector<HTMLElement>('.zar-message-header')!;
    check('dark custom bubble keeps header and copy icon readable', win.getComputedStyle(userHeader).color === rgb(getUserMessageTextColor(customColor)) && win.getComputedStyle(userBubble.querySelector<HTMLElement>('.zar-message-copy')!).color === rgb(getUserMessageTextColor(customColor)));
    check('assistant bubble appearance is unchanged', win.getComputedStyle(assistantBubble).backgroundColor === assistantBackground);
    check('appearance changes do not rewrite message contents', JSON.stringify(conversation.messages) === originalMessages);
    await showSettings();
    const apiBeforeReset = JSON.stringify({ endpoints: afterCustom.endpoints, models: afterCustom.models, defaultModelId: afterCustom.defaultModelId, systemPrompt: afterCustom.systemPrompt });
    button('恢复默认颜色').doCommand(); await pause();
    check('color reset restores preview and picker without saving other settings', find<HTMLInputElement>('.zar-user-message-color').value === DEFAULT_USER_MESSAGE_COLOR && service.getConfig().appearance?.userMessageColor === customColor);
    button('保存设置').doCommand(); await until('default color saved', () => service.getConfig().appearance?.userMessageColor === DEFAULT_USER_MESSAGE_COLOR);
    const afterReset = service.getConfig();
    check('resetting color preserves all endpoint model and prompt configuration', JSON.stringify({ endpoints: afterReset.endpoints, models: afterReset.models, defaultModelId: afterReset.defaultModelId, systemPrompt: afterReset.systemPrompt }) === apiBeforeReset);
    await showChat();
    check('saved default color restores current user bubble immediately', win.getComputedStyle(userBubble).backgroundColor === rgb(DEFAULT_USER_MESSAGE_COLOR));
    await showSettings();
    const settingsRoot = find<HTMLElement>('.zar-settings-root');
    check('304px settings layout has no horizontal overflow', settingsRoot.getBoundingClientRect().width <= overlay.getBoundingClientRect().width + 1 && settingsRoot.scrollWidth <= settingsRoot.clientWidth + 1 && endpoints().every(element => element.scrollWidth <= element.clientWidth + 1));
    check('fixture used one fake answer and never called connection Test', fakeAnswerCalls === 1);
    check('settings and appearance persist only in isolated memory', !!saved && (saved as StoreState).config.appearance?.userMessageColor === DEFAULT_USER_MESSAGE_COLOR);
    return checks;
  } finally {
    unmountSettings?.(); panel?.destroy(); overlay.remove(); await service.shutdown();
    keys.clear(); secretWrites.length = 0;
    if (previousFocus?.isConnected) previousFocus.focus();
  }
}
