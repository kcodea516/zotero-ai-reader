import type { Config, EndpointConfig, Host, ModelConfig } from './types.ts';
import { chatCompletion, normalizeEndpoint } from './transport.ts';
import { nativeButton, nativeEditable, nativeSelect, nativeTooltip, multilineKeys, setNativeOptions, type NativeButton, type NativeSelect, type NativeEditable, type NativeOption } from './controls.ts';
import { DEFAULT_USER_MESSAGE_COLOR, normalizeUserMessageColor, getUserMessageTextColor } from './appearance.ts';

const XHTML = 'http://www.w3.org/1999/xhtml';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const id = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

/** A local preferences editor: no request is made until the user clicks Test. */
export function mountSettings(container: HTMLElement, host: Host): () => void {
  const doc = container.ownerDocument;
  const win = doc.defaultView!;
  const initial = host.service.getConfig();
  let config = clone(initial);
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
  let testButton: NativeButton;
  let saveButton: NativeButton;
  let dirtyIndicator: HTMLElement;
  const editableControls: (HTMLInputElement | NativeSelect | NativeButton | NativeEditable)[] = [];

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
    dirtyIndicator.textContent = dirty ? '有未保存的更改' : '配置已保存';
    for (const control of editableControls) {
      if (control.localName === 'editable-text') (control as NativeEditable).readOnly = busy;
      else (control as HTMLInputElement | NativeSelect | NativeButton).disabled = busy;
    }
    saveButton.disabled = busy || !dirty;
    testButton.disabled = busy || dirty || !config.defaultModelId;
    nativeTooltip(testButton, dirty ? '请先保存配置，再测试所选的默认模型。' : '向已保存的默认模型发送一条独立测试消息，不写入对话历史。');
  }
  function refreshModels(): void {
    const selected = config.defaultModelId;
    const options: NativeOption[] = [{ value: '', label: config.models.length ? '请选择默认模型' : '请先添加模型' }];
    for (const model of config.models) {
      const endpoint = config.endpoints.find(value => value.id === model.endpointId);
      if (endpoint) options.push({ label: `${endpoint.name || '未命名接口'} / ${model.name || model.model || '未命名模型'}`, value: model.id });
    }
    if (!config.models.some(value => value.id === selected)) config.defaultModelId = config.models[0]?.id || '';
    setNativeOptions(defaultSelect, options, config.defaultModelId);
  }
  function renderModel(model: ModelConfig): HTMLElement {
    const section = el('div', 'zar-model-editor'); section.dataset.modelId = model.id;
    const fields = el('div', 'zar-inline-fields');
    const name = textInput('模型显示名称', model.name, value => { model.name = value; refreshModels(); }, '例如：阅读模型');
    const modelID = textInput('实际 model ID', model.model, value => { model.model = value; refreshModels(); }, '由 API 服务提供');
    name.input.className = 'zar-model-name-input'; modelID.input.className = 'zar-model-id-input';
    fields.append(name.field, modelID.field);
    section.append(fields, button('删除此模型', () => {
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
      let address = '未设置有效地址';
      try { address = new URL(endpoint.baseURL).host || address; } catch { /* Do not expose arbitrary URL text or credentials in the summary. */ }
      title.textContent = endpoint.name.trim() || `接口 ${index + 1}`;
      meta.textContent = `${address} · ${config.models.filter(value => value.endpointId === endpoint.id).length} 个模型`;
      indicator.textContent = details.open ? '收起' : '展开';
    };
    details.addEventListener('toggle', () => {
      if (!details.isConnected) return;
      if (details.open) openEndpoints.add(endpoint.id); else openEndpoints.delete(endpoint.id);
      updateSummary();
    });
    updateSummary();
    const body = el('div', 'zar-endpoint-body');
    const name = textInput('接口名称', endpoint.name, value => { endpoint.name = value; updateSummary(); refreshModels(); }, '例如：我的 API');
    name.input.className = 'zar-endpoint-name-input';
    const url = textInput('Base URL 或完整 Chat Completions 地址', endpoint.baseURL, value => { endpoint.baseURL = value; updateSummary(); }, 'https://api.example.com/v1'); url.input.type = 'url';
    url.input.className = 'zar-endpoint-url-input';
    const key = textInput('API Key', keyDrafts.get(endpoint.id) || '', value => {
      keyDrafts.set(endpoint.id, value); if (value) clearKeys.delete(endpoint.id); keyNote.textContent = '留空会保留已有密钥。密钥不会显示在历史记录中。';
    }, clearKeys.has(endpoint.id) ? '保存后清除已有密钥' : '留空则保留已有密钥', 'password');
    key.input.className = 'zar-endpoint-key-input';
    key.input.autocomplete = 'new-password';
    const keyNote = el('div', 'zar-muted', clearKeys.has(endpoint.id) ? '保存后将清除此接口的密钥。' : '留空会保留已有密钥。密钥不会显示在历史记录中。');
    const clear = button('清除此接口的密钥', () => {
      if (!win.confirm('保存后将清除此接口的 API Key，确定吗？')) return;
      clearKeys.add(endpoint.id); keyDrafts.delete(endpoint.id); key.input.value = ''; key.input.placeholder = '保存后清除已有密钥'; keyNote.textContent = '保存后将清除此接口的密钥。'; markDirty();
    }, 'zar-text-button');
    const streamLabel = el('label', 'zar-check'); const stream = el('input'); stream.type = 'checkbox'; stream.checked = endpoint.stream;
    stream.addEventListener('change', () => { endpoint.stream = stream.checked; markDirty(); }); editableControls.push(stream);
    streamLabel.append(stream, el('span', '', '流式显示回答'));
    const models = el('div');
    for (const model of config.models.filter(value => value.endpointId === endpoint.id)) models.append(renderModel(model));
    const actions = el('div', 'zar-settings-actions');
    actions.append(button('添加模型', () => {
      const next: ModelConfig = { id: id('model'), endpointId: endpoint.id, name: '', model: '' };
      config.models.push(next); if (!config.defaultModelId) config.defaultModelId = next.id;
      dirty = true; render(endpoint.id);
      const added = Array.from(content.querySelectorAll<HTMLElement>('.zar-model-editor')).find(value => value.dataset.modelId === next.id);
      added?.querySelector<HTMLInputElement>('.zar-model-name-input')?.focus();
    }), button('删除接口', () => {
      if (!win.confirm(`删除“${endpoint.name || '此接口'}”及其模型配置吗？已有对话仍会保留。`)) return;
      config.endpoints = config.endpoints.filter(value => value.id !== endpoint.id);
      config.models = config.models.filter(value => value.endpointId !== endpoint.id);
      keyDrafts.delete(endpoint.id); clearKeys.delete(endpoint.id); openEndpoints.delete(endpoint.id); dirty = true; render();
    }));
    body.append(name.field, url.field, key.field, keyNote, clear, streamLabel, models, actions);
    details.append(summary, body);
    return details;
  }
  function renderAppearance(): HTMLElement {
    const appearance = el('fieldset', 'zar-appearance-settings'); appearance.append(el('legend', '', '对话外观'));
    const colorLabel = el('label', 'zar-field'); const color = el('input', 'zar-user-message-color');
    color.type = 'color'; color.value = normalizeUserMessageColor(colorDraft);
    color.setAttribute('aria-label', '我的消息气泡颜色'); editableControls.push(color);
    colorLabel.append(el('span', '', '我的消息气泡颜色'), color);
    const preview = el('div', 'zar-color-preview-user', '请解释这篇论文的核心机制。');
    preview.setAttribute('aria-label', '我的消息气泡预览');
    const showPreview = (value: string) => {
      preview.style.backgroundColor = value;
      preview.style.color = getUserMessageTextColor(value);
    };
    showPreview(color.value);
    const hex = textInput('颜色值', colorDraft, value => {
      colorDraft = value;
      if (/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
        const normalized = normalizeUserMessageColor(value.trim());
        config.appearance = { userMessageColor: normalized }; color.value = normalized; showPreview(normalized);
      }
    }, '#eaf3ff');
    hex.input.className = 'zar-user-message-color-value'; hex.input.pattern = '#[0-9a-fA-F]{6}';
    const setColor = (value: string) => {
      const normalized = normalizeUserMessageColor(value);
      colorDraft = normalized; config.appearance = { userMessageColor: normalized };
      color.value = normalized; hex.input.value = normalized; showPreview(normalized); markDirty();
    };
    color.addEventListener('input', () => setColor(color.value));
    color.addEventListener('change', () => setColor(color.value));
    const controls = el('div', 'zar-color-controls zar-appearance-controls'); controls.append(colorLabel, hex.field);
    const reset = button('恢复默认颜色', () => setColor(DEFAULT_USER_MESSAGE_COLOR), 'zar-text-button zar-reset-user-message-color');
    appearance.append(controls, preview, reset, el('p', 'zar-muted', '默认使用浅蓝色。预览仅在此处显示，保存设置后应用到对话；恢复颜色不会改动接口或模型。'));
    return appearance;
  }
  function render(expandEndpointId?: string): void {
    for (const card of content.querySelectorAll<HTMLDetailsElement>('details.zar-endpoint')) {
      if (card.open) openEndpoints.add(card.dataset.endpointId!); else openEndpoints.delete(card.dataset.endpointId!);
    }
    for (const endpointId of openEndpoints) if (!config.endpoints.some(value => value.id === endpointId)) openEndpoints.delete(endpointId);
    if (expandEndpointId) openEndpoints.add(expandEndpointId);
    editableControls.length = 0; content.replaceChildren();
    content.append(el('h1', '', 'AI 阅读助手设置'), el('p', 'zar-settings-tip', '添加兼容 OpenAI Chat Completions 的接口，再配置可切换的模型。提问时会将已完成对话、本次引用和启用的原文发送到所选接口；允许按需联查后，仅在问题需要时检索其他论文。'));
    const endpoints = el('div'); config.endpoints.forEach((endpoint, index) => endpoints.append(renderEndpoint(endpoint, index)));
    const endpointHeading = el('div', 'zar-settings-heading'); endpointHeading.append(el('h2', '', '接口与模型'), button('添加接口', () => {
      const nextEndpoint = { id: id('endpoint'), name: '', baseURL: '', stream: true };
      config.endpoints.push(nextEndpoint);
      const nextModel = { id: id('model'), endpointId: nextEndpoint.id, name: '', model: '' };
      config.models.push(nextModel); if (!config.defaultModelId) config.defaultModelId = nextModel.id;
      dirty = true; render(nextEndpoint.id);
      const added = Array.from(content.querySelectorAll<HTMLDetailsElement>('details.zar-endpoint')).find(value => value.dataset.endpointId === nextEndpoint.id);
      added?.querySelector<HTMLInputElement>('.zar-endpoint-name-input')?.focus();
    }));
    content.append(endpointHeading, endpoints);
    if (!config.endpoints.length) endpoints.append(el('p', 'zar-muted', '还没有接口。点击“添加接口”开始配置。'));
    const defaults = el('fieldset'); defaults.append(el('legend', '', '对话默认设置'));
    const defaultLabel = el('label', 'zar-field'); defaultSelect = nativeSelect(doc, 'zar-default-model', '默认模型'); editableControls.push(defaultSelect);
    defaultLabel.append(el('span', '', '默认模型'), defaultSelect); refreshModels();
    defaultSelect.addEventListener('command', () => { config.defaultModelId = defaultSelect.value; markDirty(); });
    const promptLabel = el('label', 'zar-field'); const prompt = nativeEditable(doc, 'zar-settings-prompt', '系统提示词', 6, 16); prompt.value = config.systemPrompt;
    multilineKeys(prompt);
    prompt.addEventListener('input', () => { config.systemPrompt = prompt.value; markDirty(); }); editableControls.push(prompt);
    promptLabel.append(el('span', '', '系统提示词'), prompt);
    defaults.append(defaultLabel, el('div', 'zar-muted', '默认模型用于新建会话；已有会话可在侧栏单独切换。'), promptLabel);
    const actions = el('div', 'zar-settings-actions');
    saveButton = button('保存设置', () => { void save(); });
    testButton = button('测试默认模型', () => { void test(); });
    dirtyIndicator = el('span', 'zar-saved-state');
    const reset = button('放弃未保存更改', () => {
      if (dirty && !win.confirm('放弃所有未保存的配置更改吗？')) return;
      config = clone(host.service.getConfig()); colorDraft = normalizeUserMessageColor(config.appearance?.userMessageColor);
      keyDrafts.clear(); clearKeys.clear(); dirty = false; statusText = ''; render();
    });
    actions.append(saveButton, testButton, reset, dirtyIndicator);
    status = el('div', 'zar-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const stop = nativeButton(doc, '停止测试', () => testController?.abort()); stop.hidden = !testing;
    content.append(defaults, renderAppearance(), actions, status, stop, el('p', 'zar-settings-tip', '对话历史仅保存在本机。API Key 使用本机安全存储；若无法持久保存，插件会明确提示仅本次运行有效。测试只在点击按钮后发送，不会加入对话历史。'));
    updateState();
  }
  function validate(): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(colorDraft.trim())) throw new Error('请填写有效的颜色值，例如 #eaf3ff。');
    colorDraft = normalizeUserMessageColor(colorDraft.trim()); config.appearance = { userMessageColor: colorDraft };
    for (const endpoint of config.endpoints) {
      endpoint.name = endpoint.name.trim(); endpoint.baseURL = endpoint.baseURL.trim();
      if (!endpoint.name) throw new Error('请填写每个接口的名称。');
      normalizeEndpoint(endpoint.baseURL);
    }
    for (const model of config.models) {
      model.name = model.name.trim(); model.model = model.model.trim();
      if (!model.name || !model.model) throw new Error('请填写每个模型的显示名称和实际 model ID。');
      if (!config.endpoints.some(endpoint => endpoint.id === model.endpointId)) throw new Error('模型缺少所属接口，请重新添加。');
    }
    if (config.models.length && !config.models.some(model => model.id === config.defaultModelId)) throw new Error('请选择有效的默认模型。');
  }
  async function save(): Promise<void> {
    if (busy) return;
    try {
      validate(); busy = true; statusText = '正在保存…'; updateState();
      let memoryOnly = false;
      for (const endpoint of config.endpoints) {
        const key = keyDrafts.get(endpoint.id);
        if (key) {
          let persisted: boolean;
          try { persisted = await host.secretStore.set(endpoint.id, key.trim()); }
          catch { throw new Error('API 密钥保存失败，请重试。'); }
          memoryOnly = memoryOnly || !persisted;
        } else if (clearKeys.has(endpoint.id)) {
          try { await host.secretStore.delete(endpoint.id); }
          catch { throw new Error('API 密钥清除失败，请重试。'); }
        }
      }
      await host.service.saveConfig(clone(config));
      for (const endpointID of savedEndpointIds) if (!config.endpoints.some(value => value.id === endpointID)) {
        try { await host.secretStore.delete(endpointID); }
        catch { throw new Error('配置已保存，但旧接口的密钥清除失败，请重试保存。'); }
      }
      savedEndpointIds = config.endpoints.map(value => value.id);
      keyDrafts.clear(); clearKeys.clear(); dirty = false;
      statusText = memoryOnly ? '配置已保存。API Key 无法写入本机安全存储，仅本次 Zotero 运行有效。' : '设置已保存，可返回侧栏提问或测试默认模型。';
    } catch (error) { statusText = error instanceof Error ? error.message : '保存失败，请重试。'; }
    finally { busy = false; if (!destroyed) render(); }
  }
  async function test(): Promise<void> {
    if (busy || dirty) return;
    const saved = host.service.getConfig();
    const model = saved.models.find(value => value.id === config.defaultModelId);
    const endpoint = saved.endpoints.find(value => value.id === model?.endpointId);
    if (!model || !endpoint) { statusText = '请先添加并保存模型配置。'; updateState(); return; }
    busy = true; testing = true; testController = new AbortController(); statusText = `正在测试 ${endpoint.name} / ${model.name}…`; render();
    try {
      let key: string;
      try { key = await host.secretStore.get(endpoint.id); }
      catch { throw new Error('API 密钥读取失败，请在设置中重新保存。'); }
      let received = '';
      await chatCompletion({ endpoint, model, key, signal: testController.signal, messages: [{ role: 'user', content: 'Reply with OK.' }], onText(delta) { received += delta; } });
      statusText = received.trim() ? `连接成功：${endpoint.name} / ${model.name} 已正常返回内容。` : '接口连接成功，但未返回文本内容。';
    } catch (error) { statusText = error instanceof Error ? error.message : '连接测试失败，请检查接口配置。'; }
    finally { busy = false; testing = false; testController = undefined; if (!destroyed) render(); }
  }
  render();
  const unload = () => testController?.abort();
  win.addEventListener('unload', unload, { once: true });
  return () => {
    if (destroyed) return;
    destroyed = true;
    try { testController?.abort(); } catch {}
    testController = undefined;
    keyDrafts.clear();
    try { win.removeEventListener('unload', unload); } catch {}
    try { root.remove(); } catch {}
  };
}
