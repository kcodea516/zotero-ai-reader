import type { Config, EndpointConfig, Host, ModelConfig } from './types.ts';
import { chatCompletion, normalizeEndpoint } from './transport.ts';
import { nativeButton, nativeEditable, nativeSelect, nativeTooltip, multilineKeys, setNativeOptions, type NativeButton, type NativeSelect, type NativeEditable, type NativeOption } from './controls.ts';
import { DEFAULT_USER_MESSAGE_COLOR, normalizeUserMessageColor, getUserMessageTextColor } from './appearance.ts';
import { getLanguage, tr, localizeError, type UILanguage } from './i18n.ts';

const XHTML = 'http://www.w3.org/1999/xhtml';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const id = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

/** A local preferences editor: no request is made until the user clicks Test. */
export function mountSettings(container: HTMLElement, host: Host): () => void {
  const doc = container.ownerDocument;
  const win = doc.defaultView!;
  const initial = host.service.getConfig();
  let config = clone(initial);
  let language: UILanguage = getLanguage(config);
  let savedLanguage = language;
  let languageDirty = false;
  let savedEndpointIds = initial.endpoints.map(endpoint => endpoint.id);
  let dirty = false;
  let destroyed = false;
  let busy = false;
  let testing = false;
  let testController: AbortController | undefined;
  let statusText = '';
  let colorDraft = normalizeUserMessageColor(config.appearance?.userMessageColor);
  const keyDrafts = new Map<string, string>();
  const clearKeys = new Set<string>();
  const openEndpoints = new Set<string>();
  const root = el('div', 'zar-root zar-settings-root');
  const content = el('div', 'zar-settings'); root.append(content); container.append(root);
  let status: HTMLElement;
  let defaultSelect: NativeSelect;
  let languageSelect: NativeSelect;
  let testButton: NativeButton;
  let saveButton: NativeButton;
  let dirtyIndicator: HTMLElement;
  const editableControls: (HTMLInputElement | NativeSelect | NativeButton | NativeEditable)[] = [];
  const t = (zh: string, en: string): string => tr(language, zh, en);

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
    const node = doc.createElementNS(XHTML, tag) as HTMLElementTagNameMap[K];
    if (cls) node.className = cls; if (text) node.textContent = text; return node;
  }
  function button(label: string, action: () => void, cls = ''): NativeButton {
    const node = nativeButton(doc, label, action, cls); editableControls.push(node); return node;
  }
  function textInput(label: string, value: string, onInput: (value: string) => void, placeholder = '', type = 'text'): { field: HTMLLabelElement; input: HTMLInputElement } {
    const field = el('label', 'zar-field'); const input = el('input'); input.type = type; input.value = value; input.placeholder = placeholder;
    input.autocomplete = 'off'; input.spellcheck = false;
    input.addEventListener('input', () => { onInput(input.value); markDirty(); });
    field.append(el('span', '', label), input); editableControls.push(input); return { field, input };
  }
  function markDirty(): void {
    dirty = true; statusText = ''; updateState();
  }
  function updateState(): void {
    if (destroyed) return;
    status.textContent = statusText;
    dirtyIndicator.textContent = dirty ? t('有未保存的更改', 'Unsaved changes') : t('配置已保存', 'Settings saved');
    for (const control of editableControls) {
      if (control.localName === 'editable-text') (control as NativeEditable).readOnly = busy;
      else (control as HTMLInputElement | NativeSelect | NativeButton).disabled = busy;
    }
    saveButton.disabled = busy || !dirty;
    testButton.disabled = busy || dirty || !config.defaultModelId;
    nativeTooltip(testButton, dirty ? t('请先保存配置，再测试所选的默认模型。', 'Save your changes before testing the default model.') : t('向已保存的默认模型发送一条独立测试消息，不写入对话历史。', 'Send a separate test to the saved default model without adding it to chat history.'));
  }
  function refreshModels(): void {
    const selected = config.defaultModelId;
    const options: NativeOption[] = [{ value: '', label: config.models.length ? t('请选择默认模型', 'Select a default model') : t('请先添加模型', 'Add a model first') }];
    for (const model of config.models) {
      const endpoint = config.endpoints.find(value => value.id === model.endpointId);
      if (endpoint) options.push({ label: `${endpoint.name || t('未命名接口', 'Unnamed endpoint')} / ${model.name || model.model || t('未命名模型', 'Unnamed model')}`, value: model.id });
    }
    if (!config.models.some(value => value.id === selected)) config.defaultModelId = config.models[0]?.id || '';
    setNativeOptions(defaultSelect, options, config.defaultModelId);
  }
  function renderModel(model: ModelConfig): HTMLElement {
    const section = el('div', 'zar-model-editor'); section.dataset.modelId = model.id;
    const fields = el('div', 'zar-inline-fields');
    const name = textInput(t('模型显示名称', 'Model display name'), model.name, value => { model.name = value; refreshModels(); }, t('例如：阅读模型', 'Example: Reading model'));
    const modelID = textInput(t('实际 model ID', 'Model ID'), model.model, value => { model.model = value; refreshModels(); }, t('由 API 服务提供', 'Provided by your API service'));
    name.input.className = 'zar-model-name-input'; modelID.input.className = 'zar-model-id-input';
    fields.append(name.field, modelID.field);
    section.append(fields, button(t('删除此模型', 'Delete model'), () => {
      config.models = config.models.filter(value => value.id !== model.id); dirty = true; render();
    }, 'zar-text-button'));
    return section;
  }
  function renderEndpoint(endpoint: EndpointConfig, index: number): HTMLElement {
    const details = el('details', 'zar-endpoint'); details.dataset.endpointId = endpoint.id;
    details.open = openEndpoints.has(endpoint.id);
    const summary = el('summary', 'zar-endpoint-summary');
    const title = el('span', 'zar-endpoint-name');
    const meta = el('span', 'zar-endpoint-meta');
    const indicator = el('span', 'zar-endpoint-indicator'); indicator.setAttribute('aria-hidden', 'true');
    const labels = el('span', 'zar-endpoint-summary-text'); labels.append(title, meta);
    summary.append(labels, indicator);
    const updateSummary = () => {
      let address = t('未设置有效地址', 'No valid URL set');
      try { address = new URL(endpoint.baseURL).host || address; } catch { /* Do not expose arbitrary URL text or credentials in the summary. */ }
      title.textContent = endpoint.name.trim() || t(`接口 ${index + 1}`, `Endpoint ${index + 1}`);
      const count = config.models.filter(value => value.endpointId === endpoint.id).length;
      meta.textContent = `${address} · ${t(`${count} 个模型`, `${count} ${count === 1 ? 'model' : 'models'}`)}`;
      indicator.textContent = details.open ? t('收起', 'Collapse') : t('展开', 'Expand');
    };
    details.addEventListener('toggle', () => {
      if (!details.isConnected) return;
      if (details.open) openEndpoints.add(endpoint.id); else openEndpoints.delete(endpoint.id);
      updateSummary();
    });
    updateSummary();
    const body = el('div', 'zar-endpoint-body');
    const name = textInput(t('接口名称', 'Endpoint name'), endpoint.name, value => { endpoint.name = value; updateSummary(); refreshModels(); }, t('例如：我的 API', 'Example: My API'));
    name.input.className = 'zar-endpoint-name-input';
    const url = textInput(t('Base URL 或完整 Chat Completions 地址', 'Base URL or full Chat Completions URL'), endpoint.baseURL, value => { endpoint.baseURL = value; updateSummary(); }, 'https://api.example.com/v1'); url.input.type = 'url';
    url.input.className = 'zar-endpoint-url-input';
    const key = textInput('API Key', keyDrafts.get(endpoint.id) || '', value => {
      keyDrafts.set(endpoint.id, value); if (value) clearKeys.delete(endpoint.id); keyNote.textContent = t('留空会保留已有密钥。密钥不会显示在历史记录中。', 'Leave blank to keep the saved key. Keys do not appear in chat history.');
    }, clearKeys.has(endpoint.id) ? t('保存后清除已有密钥', 'The saved key will be cleared on save') : t('留空则保留已有密钥', 'Leave blank to keep the saved key'), 'password');
    key.input.className = 'zar-endpoint-key-input';
    key.input.autocomplete = 'new-password';
    const keyNote = el('div', 'zar-muted', clearKeys.has(endpoint.id) ? t('保存后将清除此接口的密钥。', 'This endpoint’s key will be cleared when you save.') : t('留空会保留已有密钥。密钥不会显示在历史记录中。', 'Leave blank to keep the saved key. Keys do not appear in chat history.'));
    const clear = button(t('清除此接口的密钥', 'Clear endpoint key'), () => {
      if (!win.confirm(t('保存后将清除此接口的 API Key，确定吗？', 'Clear this endpoint’s API key when you save?'))) return;
      clearKeys.add(endpoint.id); keyDrafts.delete(endpoint.id); key.input.value = ''; key.input.placeholder = t('保存后清除已有密钥', 'The saved key will be cleared on save'); keyNote.textContent = t('保存后将清除此接口的密钥。', 'This endpoint’s key will be cleared when you save.'); markDirty();
    }, 'zar-text-button');
    const streamLabel = el('label', 'zar-check'); const stream = el('input'); stream.type = 'checkbox'; stream.checked = endpoint.stream;
    stream.addEventListener('change', () => { endpoint.stream = stream.checked; markDirty(); }); editableControls.push(stream);
    streamLabel.append(stream, el('span', '', t('流式显示回答', 'Stream responses')));
    const models = el('div');
    for (const model of config.models.filter(value => value.endpointId === endpoint.id)) models.append(renderModel(model));
    const actions = el('div', 'zar-settings-actions');
    actions.append(button(t('添加模型', 'Add model'), () => {
      const next: ModelConfig = { id: id('model'), endpointId: endpoint.id, name: '', model: '' };
      config.models.push(next); if (!config.defaultModelId) config.defaultModelId = next.id;
      dirty = true; render(endpoint.id);
      const added = Array.from(content.querySelectorAll<HTMLElement>('.zar-model-editor')).find(value => value.dataset.modelId === next.id);
      added?.querySelector<HTMLInputElement>('.zar-model-name-input')?.focus();
    }), button(t('删除接口', 'Delete endpoint'), () => {
      if (!win.confirm(t(`删除“${endpoint.name || '此接口'}”及其模型配置吗？已有对话仍会保留。`, `Delete “${endpoint.name || 'this endpoint'}” and its model settings? Existing chats will be kept.`))) return;
      config.endpoints = config.endpoints.filter(value => value.id !== endpoint.id);
      config.models = config.models.filter(value => value.endpointId !== endpoint.id);
      keyDrafts.delete(endpoint.id); clearKeys.delete(endpoint.id); openEndpoints.delete(endpoint.id); dirty = true; render();
    }));
    body.append(name.field, url.field, key.field, keyNote, clear, streamLabel, models, actions);
    details.append(summary, body);
    return details;
  }
  function renderAppearance(): HTMLElement {
    const appearance = el('fieldset', 'zar-appearance-settings'); appearance.append(el('legend', '', t('对话外观', 'Chat appearance')));
    const colorLabel = el('label', 'zar-field'); const color = el('input', 'zar-user-message-color');
    color.type = 'color'; color.value = /^#[0-9a-fA-F]{6}$/.test(colorDraft.trim())
      ? normalizeUserMessageColor(colorDraft.trim()) : normalizeUserMessageColor(config.appearance?.userMessageColor);
    color.setAttribute('aria-label', t('我的消息气泡颜色', 'My message bubble color')); editableControls.push(color);
    colorLabel.append(el('span', '', t('我的消息气泡颜色', 'My message bubble color')), color);
    const preview = el('div', 'zar-color-preview-user', t('请解释这篇论文的核心机制。', 'Please explain this paper’s main mechanism.'));
    preview.setAttribute('aria-label', t('我的消息气泡预览', 'My message bubble preview'));
    const showPreview = (value: string) => {
      preview.style.backgroundColor = value;
      preview.style.color = getUserMessageTextColor(value);
    };
    showPreview(color.value);
    const hex = textInput(t('颜色值', 'Hex color'), colorDraft, value => {
      colorDraft = value;
      if (/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
        const normalized = normalizeUserMessageColor(value.trim());
        config.appearance = { userMessageColor: normalized }; color.value = normalized; showPreview(normalized);
      }
    }, '#eaf3ff');
    hex.input.className = 'zar-user-message-color-value'; hex.input.size = 9; hex.input.maxLength = 7; hex.input.pattern = '#[0-9a-fA-F]{6}';
    const setColor = (value: string) => {
      const normalized = normalizeUserMessageColor(value);
      colorDraft = normalized; config.appearance = { userMessageColor: normalized };
      color.value = normalized; hex.input.value = normalized; showPreview(normalized); markDirty();
    };
    color.addEventListener('input', () => setColor(color.value));
    color.addEventListener('change', () => setColor(color.value));
    const controls = el('div', 'zar-color-controls zar-appearance-controls'); controls.append(colorLabel, hex.field);
    const reset = button(t('恢复默认颜色', 'Reset color'), () => setColor(DEFAULT_USER_MESSAGE_COLOR), 'zar-text-button zar-reset-user-message-color');
    appearance.append(controls, preview, reset);
    return appearance;
  }
  function captureDrafts(): void {
    const prompt = content.querySelector<NativeEditable>('.zar-settings-prompt');
    if (prompt) config.systemPrompt = prompt.value;
    const hex = content.querySelector<HTMLInputElement>('.zar-user-message-color-value');
    if (hex) colorDraft = hex.value;
    if (defaultSelect?.isConnected && config.models.some(value => value.id === defaultSelect.value)) config.defaultModelId = defaultSelect.value;
    for (const card of content.querySelectorAll<HTMLDetailsElement>('details.zar-endpoint')) {
      const endpoint = config.endpoints.find(value => value.id === card.dataset.endpointId);
      if (!endpoint) continue;
      const name = card.querySelector<HTMLInputElement>('.zar-endpoint-name-input');
      const url = card.querySelector<HTMLInputElement>('.zar-endpoint-url-input');
      const key = card.querySelector<HTMLInputElement>('.zar-endpoint-key-input');
      const stream = card.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (name) endpoint.name = name.value;
      if (url) endpoint.baseURL = url.value;
      if (key) { keyDrafts.set(endpoint.id, key.value); if (key.value) clearKeys.delete(endpoint.id); }
      if (stream) endpoint.stream = stream.checked;
      for (const editor of card.querySelectorAll<HTMLElement>('.zar-model-editor')) {
        const model = config.models.find(value => value.id === editor.dataset.modelId);
        if (!model) continue;
        const display = editor.querySelector<HTMLInputElement>('.zar-model-name-input');
        const actual = editor.querySelector<HTMLInputElement>('.zar-model-id-input');
        if (display) model.name = display.value;
        if (actual) model.model = actual.value;
      }
    }
  }
  function syncSavedLanguage(): boolean {
    if (destroyed || busy) return false;
    const saved = host.service.getConfig();
    const next = getLanguage(saved);
    if (next === savedLanguage) return false;
    savedLanguage = next;
    // A local, unsaved language preview is a draft too.
    if (languageDirty && language !== next) return false;
    captureDrafts();
    if (!dirty) {
      config = clone(saved); colorDraft = normalizeUserMessageColor(config.appearance?.userMessageColor);
      savedEndpointIds = saved.endpoints.map(value => value.id);
    } else config.language = next;
    language = next; languageDirty = false; statusText = '';
    return true;
  }
  function render(expandEndpointId?: string, preserveDrafts = true): void {
    if (preserveDrafts) captureDrafts();
    for (const card of content.querySelectorAll<HTMLDetailsElement>('details.zar-endpoint')) {
      if (card.open) openEndpoints.add(card.dataset.endpointId!); else openEndpoints.delete(card.dataset.endpointId!);
    }
    for (const endpointId of openEndpoints) if (!config.endpoints.some(value => value.id === endpointId)) openEndpoints.delete(endpointId);
    if (expandEndpointId) openEndpoints.add(expandEndpointId);
    editableControls.length = 0; content.replaceChildren();
    root.lang = language;
    content.append(el('h1', '', t('AI 阅读助手设置', 'AI Reader Settings')));
    const languageField = el('label', 'zar-field zar-language-field');
    languageSelect = nativeSelect(doc, 'zar-interface-language', t('界面语言', 'Interface language')); editableControls.push(languageSelect);
    setNativeOptions(languageSelect, [{ value: 'zh-CN', label: '中文' }, { value: 'en-US', label: 'English' }], language);
    languageSelect.addEventListener('command', () => {
      captureDrafts();
      config.language = languageSelect.value === 'en-US' ? 'en-US' : 'zh-CN';
      language = config.language; languageDirty = true; dirty = true; statusText = ''; render();
    });
    languageField.append(el('span', '', t('界面语言', 'Interface language')), languageSelect);
    content.append(languageField);
    const endpoints = el('div'); config.endpoints.forEach((endpoint, index) => endpoints.append(renderEndpoint(endpoint, index)));
    const endpointHeading = el('div', 'zar-settings-heading'); endpointHeading.append(el('h2', '', t('接口与模型', 'Endpoints and models')), button(t('添加接口', 'Add endpoint'), () => {
      const nextEndpoint = { id: id('endpoint'), name: '', baseURL: '', stream: true };
      config.endpoints.push(nextEndpoint);
      const nextModel = { id: id('model'), endpointId: nextEndpoint.id, name: '', model: '' };
      config.models.push(nextModel); if (!config.defaultModelId) config.defaultModelId = nextModel.id;
      dirty = true; render(nextEndpoint.id);
      const added = Array.from(content.querySelectorAll<HTMLDetailsElement>('details.zar-endpoint')).find(value => value.dataset.endpointId === nextEndpoint.id);
      added?.querySelector<HTMLInputElement>('.zar-endpoint-name-input')?.focus();
    }));
    content.append(endpointHeading, endpoints);
    if (!config.endpoints.length) endpoints.append(el('p', 'zar-muted', t('还没有接口。点击“添加接口”开始配置。', 'No endpoints yet. Click “Add endpoint” to get started.')));
    const defaults = el('fieldset'); defaults.append(el('legend', '', t('对话默认设置', 'Chat defaults')));
    const defaultLabel = el('label', 'zar-field'); defaultSelect = nativeSelect(doc, 'zar-default-model', t('默认模型', 'Default model')); editableControls.push(defaultSelect);
    defaultLabel.append(el('span', '', t('默认模型', 'Default model')), defaultSelect); refreshModels();
    defaultSelect.addEventListener('command', () => { config.defaultModelId = defaultSelect.value; markDirty(); });
    const promptLabel = el('label', 'zar-field'); const prompt = nativeEditable(doc, 'zar-settings-prompt', t('系统提示词', 'System prompt'), 6, 16); prompt.value = config.systemPrompt;
    multilineKeys(prompt);
    prompt.addEventListener('input', () => { config.systemPrompt = prompt.value; markDirty(); }); editableControls.push(prompt);
    const promptFrame = el('div', 'zar-settings-prompt-frame'); promptFrame.append(prompt);
    promptLabel.append(el('span', '', t('系统提示词', 'System prompt')), promptFrame);
    defaults.append(defaultLabel, promptLabel);
    const actions = el('div', 'zar-settings-actions');
    saveButton = button(t('保存设置', 'Save settings'), () => { void save(); });
    testButton = button(t('测试默认模型', 'Test default model'), () => { void test(); });
    dirtyIndicator = el('span', 'zar-saved-state');
    const reset = button(t('放弃未保存更改', 'Discard unsaved changes'), () => {
      if (dirty && !win.confirm(t('放弃所有未保存的配置更改吗？', 'Discard all unsaved settings changes?'))) return;
      config = clone(host.service.getConfig()); language = getLanguage(config); savedLanguage = language; languageDirty = false;
      savedEndpointIds = config.endpoints.map(value => value.id);
      colorDraft = normalizeUserMessageColor(config.appearance?.userMessageColor);
      keyDrafts.clear(); clearKeys.clear(); dirty = false; statusText = ''; render(undefined, false);
    });
    actions.append(saveButton, testButton, reset, dirtyIndicator);
    status = el('div', 'zar-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const stop = nativeButton(doc, t('停止测试', 'Stop test'), () => testController?.abort()); stop.hidden = !testing;
    content.append(defaults, renderAppearance(), actions, status, stop);
    updateState();
  }
  function validate(): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(colorDraft.trim())) throw new Error(t('请填写有效的颜色值，例如 #eaf3ff。', 'Enter a valid hex color, such as #eaf3ff.'));
    colorDraft = normalizeUserMessageColor(colorDraft.trim()); config.appearance = { userMessageColor: colorDraft };
    for (const endpoint of config.endpoints) {
      endpoint.name = endpoint.name.trim(); endpoint.baseURL = endpoint.baseURL.trim();
      if (!endpoint.name) throw new Error(t('请填写每个接口的名称。', 'Enter a name for every endpoint.'));
      normalizeEndpoint(endpoint.baseURL);
    }
    for (const model of config.models) {
      model.name = model.name.trim(); model.model = model.model.trim();
      if (!model.name || !model.model) throw new Error(t('请填写每个模型的显示名称和实际 model ID。', 'Enter a display name and model ID for every model.'));
      if (!config.endpoints.some(endpoint => endpoint.id === model.endpointId)) throw new Error(t('模型缺少所属接口，请重新添加。', 'A model has no endpoint. Remove it and add it again.'));
    }
    if (config.models.length && !config.models.some(model => model.id === config.defaultModelId)) throw new Error(t('请选择有效的默认模型。', 'Select a valid default model.'));
  }
  async function save(): Promise<void> {
    if (busy) return;
    try {
      captureDrafts(); validate(); busy = true; statusText = t('正在保存…', 'Saving…'); updateState();
      let memoryOnly = false;
      for (const endpoint of config.endpoints) {
        const key = keyDrafts.get(endpoint.id);
        if (key) {
          let persisted: boolean;
          try { persisted = await host.secretStore.set(endpoint.id, key.trim()); }
          catch { throw new Error(t('API 密钥保存失败，请重试。', 'Could not save the API key. Please try again.')); }
          memoryOnly = memoryOnly || !persisted;
        } else if (clearKeys.has(endpoint.id)) {
          try { await host.secretStore.delete(endpoint.id); }
          catch { throw new Error(t('API 密钥清除失败，请重试。', 'Could not clear the API key. Please try again.')); }
        }
      }
      await host.service.saveConfig(clone(config));
      for (const endpointID of savedEndpointIds) if (!config.endpoints.some(value => value.id === endpointID)) {
        try { await host.secretStore.delete(endpointID); }
        catch { throw new Error(t('配置已保存，但旧接口的密钥清除失败，请重试保存。', 'Settings were saved, but an old endpoint’s key could not be cleared. Save again to retry.')); }
      }
      savedEndpointIds = config.endpoints.map(value => value.id);
      keyDrafts.clear(); clearKeys.clear(); dirty = false; languageDirty = false; savedLanguage = getLanguage(host.service.getConfig());
      statusText = memoryOnly ? t('配置已保存。API Key 无法写入本机安全存储，仅本次 Zotero 运行有效。', 'Settings saved. The API key could not be stored securely and will last only for this Zotero session.') : t('设置已保存，可返回侧栏提问或测试默认模型。', 'Settings saved. Return to the sidebar or test the default model.');
    } catch (error) { statusText = localizeError(error, language) || t('保存失败，请重试。', 'Could not save settings. Please try again.'); }
    finally { busy = false; if (!destroyed) { syncSavedLanguage(); render(undefined, false); } }
  }
  async function test(): Promise<void> {
    if (busy || dirty) return;
    const saved = host.service.getConfig();
    const model = saved.models.find(value => value.id === config.defaultModelId);
    const endpoint = saved.endpoints.find(value => value.id === model?.endpointId);
    if (!model || !endpoint) { statusText = t('请先添加并保存模型配置。', 'Add and save a model before testing.'); updateState(); return; }
    busy = true; testing = true; testController = new AbortController(); statusText = t(`正在测试 ${endpoint.name} / ${model.name}…`, `Testing ${endpoint.name} / ${model.name}…`); render();
    try {
      let key: string;
      try { key = await host.secretStore.get(endpoint.id); }
      catch { throw new Error(t('API 密钥读取失败，请在设置中重新保存。', 'Could not read the API key. Save it again in settings.')); }
      let received = '';
      await chatCompletion({ endpoint, model, key, signal: testController.signal, messages: [{ role: 'user', content: 'Reply with OK.' }], onText(delta) { received += delta; } });
      statusText = received.trim() ? t(`连接成功：${endpoint.name} / ${model.name} 已正常返回内容。`, `Connected: ${endpoint.name} / ${model.name} returned a response.`) : t('接口连接成功，但未返回文本内容。', 'The endpoint connected but returned no text.');
    } catch (error) { statusText = localizeError(error, language) || t('连接测试失败，请检查接口配置。', 'The connection test failed. Check your endpoint settings.'); }
    finally { busy = false; testing = false; testController = undefined; if (!destroyed) { const synced = syncSavedLanguage(); render(undefined, !synced); } }
  }
  render();
  const unsubscribe = host.service.subscribe(() => { if (syncSavedLanguage()) render(undefined, false); });
  const unload = () => testController?.abort();
  win.addEventListener('unload', unload, { once: true });
  return () => {
    if (destroyed) return;
    destroyed = true;
    unsubscribe();
    try { testController?.abort(); } catch {}
    testController = undefined;
    keyDrafts.clear();
    try { win.removeEventListener('unload', unload); } catch {}
    try { root.remove(); } catch {}
  };
}
