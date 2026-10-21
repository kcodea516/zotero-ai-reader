import type { Conversation, Host, Message, PaperScope, Quote } from './types.ts';
import { renderMarkdown } from './render.ts';
import { nativeButton, nativeEditable, nativeSelect, nativeTooltip, multilineKeys, setNativeOptions, type NativeButton, type NativeOption } from './controls.ts';

const XHTML = 'http://www.w3.org/1999/xhtml';
const sameScope = (a: PaperScope, b: PaperScope) => a.libraryID === b.libraryID && a.itemKey === b.itemKey;
const failure = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

export function mountSidebar(body: HTMLElement, initialScope: PaperScope, host: Host): {
  updateScope(scope: PaperScope): void; destroy(): void; addQuote(quote: Quote): void; show(): void;
} {
  const doc = body.ownerDocument;
  const win = doc.defaultView!;
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
    const node = doc.createElementNS(XHTML, tag) as HTMLElementTagNameMap[K];
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function button(label: string, action: () => void, cls = ''): NativeButton {
    return nativeButton(doc, label, action, cls);
  }
  let scope = { ...initialScope };
  let conversationId = host.service.forScope(scope).id;
  let destroyed = false;
  let historyOpen = false;
  let allHistory = false;
  let query = '';
  let actionError = '';
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let modelsSignature = '';
  let historySignature = '';
  let quoteSignature = '';
  let renderedConversationId = '';
  const copyTimers = new Map<string, number>();
  const rendered = new Map<string, { root: HTMLElement; content: HTMLElement; signature: string; contentText: string | undefined; quoteRef: Quote | undefined; headerSignature: string; header: HTMLElement; quote: HTMLElement; error: HTMLElement; copy: HTMLButtonElement }>();
  const root = el('div', 'zar-root zar-sidebar');
  root.setAttribute('aria-label', 'AI 阅读助手');
  const toolbar = el('div', 'zar-toolbar');
  const modelSelect = nativeSelect(doc, 'zar-model', '选择接口和模型');
  nativeTooltip(modelSelect, '切换后，下一次提问将使用所选模型，并保留此前已完成的对话。');
  const toolbarActions = el('div', 'zar-toolbar-actions');
  const newButton = button('新建', () => {
    actionError = ''; conversationId = host.service.createConversation(scope).id; historyOpen = false; render(); draft.focus();
  });
  nativeTooltip(newButton, '为当前文献新建会话');
  const historyButton = button('历史', () => { historyOpen = !historyOpen; render(); if (historyOpen) historyQuery.focus(); });
  historyButton.setAttribute('aria-expanded', 'false');
  const settingsButton = button('设置', () => host.openSettings(win));
  toolbarActions.append(newButton, historyButton, settingsButton); toolbar.append(modelSelect, toolbarActions);
  const paper = el('div', 'zar-paper');
  const paperLabel = el('div', 'zar-muted'); const paperTitle = el('strong');
  const returnButton = button('返回当前文献', () => { conversationId = host.service.forScope(scope).id; render(); }, 'zar-text-button');
  paper.append(paperLabel, paperTitle, returnButton);
  const history = el('div', 'zar-history');
  const historyControls = el('div', 'zar-row');
  const historyScope = nativeSelect(doc, 'zar-history-scope', '历史记录范围');
  setNativeOptions(historyScope, [{ value: 'paper', label: '当前文献' }, { value: 'all', label: '全部历史' }], 'paper');
  const historyQuery = el('input'); historyQuery.type = 'search'; historyQuery.placeholder = '搜索对话'; historyQuery.setAttribute('aria-label', '搜索对话内容与标题');
  historyControls.append(historyScope, historyQuery);
  const historyList = el('div', 'zar-history-list');
  const exportButton = button('复制当前会话为 Markdown', () => {
    const value = current();
    if (!value) return;
    const content = [`# ${value.title}`, '', `文献：${value.scope.title}`, '', ...value.messages.flatMap(message => [
      `## ${message.role === 'user' ? '我' : 'AI'}${message.modelName ? ` · ${message.endpointName || ''} / ${message.modelName}` : ''}`,
      '', ...(message.quote ? [`> ${message.quote.text.split('\n').join('\n> ')}`, ''] : []), message.content,
      ...(message.status === 'complete' ? [] : [`\n[${statusLabel(message.status)}]`]), '',
    ])].join('\n');
    host.copy(content); actionError = '已复制当前会话。'; renderStatus();
  }, 'zar-text-button');
  history.append(historyControls, historyList, exportButton);
  const messages = el('div', 'zar-messages'); messages.setAttribute('role', 'log'); messages.setAttribute('aria-label', '对话记录');
  // Announcing every streamed token makes screen readers unusable; status is announced separately.
  messages.setAttribute('aria-live', 'off');
  const empty = el('div', 'zar-empty');
  empty.append(el('p', '', '阅读时遇到问题，可以直接在这里提问。'), el('p', '', '选中文字后点击“询问 AI”，可将原文作为本次问题的引用。'));
  const compose = el('div', 'zar-compose');
  const quoteBox = el('div', 'zar-quote');
  const quoteHeader = el('div', 'zar-row');
  const quoteLabel = el('span', 'zar-muted');
  const quoteRemove = button('移除', () => { const value = current(); if (value) host.service.setQuote(value.id, undefined); }, 'zar-text-button');
  const quoteInput = nativeEditable(doc, 'zar-quote-input', '本次提问引用，可编辑', 3, 8);
  multilineKeys(quoteInput);
  quoteHeader.append(quoteLabel, quoteRemove); quoteBox.append(quoteHeader, quoteInput);
  const draft = nativeEditable(doc, 'zar-input', '问题', 3, 10);
  draft.placeholder = '询问这篇文献…';
  multilineKeys(draft, submit);
  // editable-text is transparent when empty and unfocused. Keep its outline
  // independent of the native control's editing/preview state.
  const draftFrame = el('div', 'zar-input-frame');
  draftFrame.append(draft);
  const composeFooter = el('div', 'zar-compose-footer');
  const hint = el('span', 'zar-muted zar-compose-hint', 'Enter 发送 · Shift+Enter 换行');
  const composeControls = el('div', 'zar-compose-controls');
  const retryButton = button('重试', () => { const value = current(); if (value) run(() => host.service.retry(value.id)); });
  const sendButton = button('发送', () => submit());
  const stopButton = button('停止', () => { const value = current(); if (value) host.service.stop(value.id); });
  composeControls.append(retryButton, sendButton, stopButton); composeFooter.append(hint, composeControls);
  const status = el('div', 'zar-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  compose.append(quoteBox, draftFrame, composeFooter, status);
  root.append(toolbar, paper, history, messages, compose); body.append(root);

  function current(): Conversation | undefined { return host.service.getConversation(conversationId); }
  function run(action: () => unknown): void {
    actionError = '';
    try {
      Promise.resolve(action()).catch(error => { actionError = failure(error); renderStatus(); });
    } catch (error) { actionError = failure(error); renderStatus(); }
  }
  function submit(): void {
    const value = current();
    if (!value || host.service.isBusy(value.id) || !(draft.value.trim() || value.quote?.text.trim())) return;
    if (!modelSelect.value) { actionError = '请先在设置中添加 API 和模型。'; renderStatus(); return; }
    host.service.setDraft(value.id, draft.value);
    run(() => host.service.send(value.id));
    render(); draft.focus();
  }
  function statusLabel(value: string): string {
    return ({ streaming: '正在生成…', error: '回答未完成', stopped: '已停止', interrupted: '上次生成已中断', complete: '' } as Record<string, string>)[value] || '';
  }
  function renderStatus(): void {
    status.textContent = [host.service.storageError, actionError].filter(Boolean).join('\n');
  }
  function activate(value: Conversation): void {
    conversationId = value.id; host.service.activateConversation(value.id); actionError = ''; historyOpen = false; render();
  }
  function renderHistory(): void {
    if (!historyOpen) return;
    const entries = host.service.listConversations(allHistory ? undefined : scope, query);
    const signature = JSON.stringify([historyOpen, allHistory, query, conversationId, entries.map(value => [value.id, value.title, value.scope.title, new Date(value.updatedAt).toLocaleDateString()])]);
    if (signature === historySignature) return;
    historySignature = signature; historyList.replaceChildren();
    if (!entries.length) historyList.append(el('div', 'zar-empty', query ? '没有找到匹配的对话。' : '暂无对话记录。'));
    for (const entry of entries) {
      const item = el('div', 'zar-history-item'); item.setAttribute('aria-current', String(entry.id === conversationId));
      const open = button(entry.title || '新对话', () => activate(entry), 'zar-history-open');
      const meta = el('div', 'zar-muted zar-history-meta', `${entry.scope.title} · ${new Date(entry.updatedAt).toLocaleDateString()}`);
      const tools = el('div', 'zar-history-tools');
      tools.append(button('重命名', () => {
        const next = win.prompt('会话名称', entry.title);
        if (next?.trim()) run(() => host.service.renameConversation(entry.id, next.trim()));
      }, 'zar-text-button'), button('删除', () => {
        if (win.confirm(`确定删除“${entry.title}”的全部对话记录吗？此操作无法撤销。`)) {
          run(() => host.service.deleteConversation(entry.id));
          if (!current()) conversationId = host.service.forScope(scope).id;
          render();
        }
      }, 'zar-text-button'));
      item.append(open, meta, tools); historyList.append(item);
    }
  }
  function renderModels(value: Conversation): void {
    const config = host.service.getConfig();
    const signature = JSON.stringify([config.endpoints, config.models]);
    if (signature !== modelsSignature) {
      modelsSignature = signature;
      const options: NativeOption[] = [{ value: '', label: config.models.length ? '请选择模型' : '请先在设置中添加模型' }];
      for (const model of config.models) {
        const endpoint = config.endpoints.find(entry => entry.id === model.endpointId);
        if (endpoint) options.push({ label: `${endpoint.name} / ${model.name}`, value: model.id });
      }
      setNativeOptions(modelSelect, options, value.modelId);
    }
    modelSelect.value = value.modelId;
    if (modelSelect.selectedIndex === -1) modelSelect.value = '';
    modelSelect.disabled = !config.models.length;
  }
  function renderMessage(message: Message): HTMLElement {
    let entry = rendered.get(message.id);
    if (!entry) {
      const messageRoot = el('article', `zar-message zar-message-${message.role}`);
      const header = el('div', 'zar-message-header');
      const actions = el('div', 'zar-message-actions');
      const copy = el('button', 'zar-message-copy');
      copy.type = 'button';
      copy.title = '复制消息原文';
      copy.setAttribute('aria-label', '复制消息原文');
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const outline = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      outline.setAttribute('d', 'M9 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2');
      const square = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      square.setAttribute('x', '3'); square.setAttribute('y', '7');
      square.setAttribute('width', '14'); square.setAttribute('height', '14');
      square.setAttribute('rx', '2');
      svg.append(outline, square); copy.append(svg);
      const feedback = el('span', 'zar-copy-feedback');
      feedback.setAttribute('role', 'status');
      copy.addEventListener('click', () => {
        const text = current()?.messages.find(value => value.id === message.id)?.content;
        if (!text) return;
        try {
          host.copy(text);
          feedback.textContent = '已复制';
          copy.title = '已复制';
          if (copyTimers.has(message.id)) win.clearTimeout(copyTimers.get(message.id));
          copyTimers.set(message.id, win.setTimeout(() => {
            feedback.textContent = ''; copy.title = '复制消息原文'; copyTimers.delete(message.id);
          }, 1600));
        } catch { actionError = '复制失败，请重试。'; renderStatus(); }
      });
      actions.append(copy, feedback);
      const quote = el('blockquote', 'zar-message-quote');
      const content = el('div', 'zar-markdown');
      const error = el('div', 'zar-message-error');
      messageRoot.append(header, quote, content, error, actions);
      entry = { root: messageRoot, content, signature: '', contentText: undefined, quoteRef: undefined, headerSignature: '', header, quote, error, copy }; rendered.set(message.id, entry);
    }
    const signature = JSON.stringify([message.status, message.error, message.modelName, message.endpointName]);
    if (entry.contentText !== message.content || entry.quoteRef !== message.quote || entry.signature !== signature) {
      entry.signature = signature; entry.contentText = message.content; entry.quoteRef = message.quote;
      const headerSignature = JSON.stringify([message.role, message.createdAt, message.modelName, message.endpointName]);
      if (entry.headerSignature !== headerSignature) {
        entry.headerSignature = headerSignature;
        const role = el('span', 'zar-message-role', message.role === 'user' ? '我' : 'AI');
        const time = el('time', '', new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        time.dateTime = new Date(message.createdAt).toISOString(); time.title = new Date(message.createdAt).toLocaleString();
        entry.header.replaceChildren(role, time);
        if (message.modelName) entry.header.append(el('span', 'zar-message-model', `${message.endpointName || 'API'} / ${message.modelName}`));
      }
      entry.copy.disabled = !message.content;
      entry.quote.hidden = !message.quote;
      entry.quote.textContent = message.quote ? `${message.quote.pageLabel ? `第 ${message.quote.pageLabel} 页\n` : ''}${message.quote.text}` : '';
      renderMarkdown(entry.content, message.content || (message.status === 'streaming' ? '正在生成…' : ''), host.openURL);
      entry.error.textContent = [statusLabel(message.status), message.error].filter(Boolean).join(' · ');
      entry.error.hidden = !entry.error.textContent;
    }
    return entry.root;
  }
  function render(): void {
    if (destroyed) return;
    let value = current();
    if (!value) { value = host.service.forScope(scope); conversationId = value.id; }
    const pinned = renderedConversationId !== value.id || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
    renderedConversationId = value.id;
    const foreign = !sameScope(value.scope, scope);
    paperLabel.textContent = foreign ? '正在查看其他文献的会话' : '当前文献';
    paperTitle.textContent = value.scope.title; paperTitle.title = value.scope.title;
    returnButton.hidden = !foreign;
    history.hidden = !historyOpen;
    historyButton.setAttribute('aria-expanded', String(historyOpen));
    renderHistory(); renderModels(value);
    const wanted = value.messages.map(renderMessage);
    if (!wanted.length) wanted.push(empty);
    for (const child of Array.from(messages.children)) if (!wanted.includes(child as HTMLElement)) child.remove();
    // Existing nodes are not recreated while tokens arrive, keeping focus and selection stable.
    for (let index = 0; index < wanted.length; index++) if (messages.children[index] !== wanted[index]) messages.insertBefore(wanted[index], messages.children[index] || null);
    const keep = new Set(value.messages.map(message => message.id));
    for (const id of rendered.keys()) if (!keep.has(id)) {
      if (copyTimers.has(id)) win.clearTimeout(copyTimers.get(id));
      copyTimers.delete(id); rendered.delete(id);
    }
    if (draft.value !== value.draft) draft.value = value.draft;
    draft.placeholder = foreign ? '继续这段会话…' : '询问这篇文献…';
    const nextQuoteSignature = JSON.stringify([value.id, value.quote]);
    quoteBox.hidden = !value.quote;
    if (nextQuoteSignature !== quoteSignature) {
      quoteSignature = nextQuoteSignature;
      quoteLabel.textContent = value.quote?.pageLabel ? `本次引用 · 第 ${value.quote.pageLabel} 页` : '本次引用';
      if (quoteInput.value !== (value.quote?.text || '')) quoteInput.value = value.quote?.text || '';
    }
    const busy = host.service.isBusy(value.id);
    sendButton.hidden = busy; stopButton.hidden = !busy;
    sendButton.disabled = !(value.draft.trim() || value.quote?.text.trim()) || !modelSelect.value;
    nativeTooltip(sendButton, modelSelect.value ? '发送问题及本次引用' : '请先在设置中添加 API 和模型');
    retryButton.disabled = !modelSelect.value;
    const lastAssistant = [...value.messages].reverse().find(message => message.role === 'assistant');
    retryButton.hidden = busy || !lastAssistant || !['error', 'stopped', 'interrupted'].includes(lastAssistant.status);
    if (pinned) messages.scrollTop = messages.scrollHeight;
    renderStatus();
  }
  const schedule = () => {
    if (destroyed || scheduled) return;
    scheduled = setTimeout(() => { scheduled = undefined; render(); }, 90);
  };
  const unsubscribe = host.service.subscribe(schedule);
  modelSelect.addEventListener('command', () => { const value = current(); if (value) run(() => host.service.setModel(value.id, modelSelect.value)); });
  historyScope.addEventListener('command', () => { allHistory = historyScope.value === 'all'; render(); });
  historyQuery.addEventListener('input', () => { query = historyQuery.value; render(); });
  draft.addEventListener('input', () => {
    const value = current(); if (value) { host.service.setDraft(value.id, draft.value); sendButton.disabled = !(draft.value.trim() || value.quote?.text.trim()) || !modelSelect.value; }
  });
  quoteInput.addEventListener('input', () => {
    const value = current(); if (value?.quote) host.service.setQuote(value.id, { ...value.quote, text: quoteInput.value });
  });
  render();
  return {
    updateScope(nextScope) {
      const changed = !sameScope(scope, nextScope); scope = { ...nextScope };
      if (changed) { conversationId = host.service.forScope(scope).id; actionError = ''; historySignature = ''; }
      render();
    },
    addQuote(quote) {
      if (!sameScope(current()?.scope || scope, scope)) conversationId = host.service.forScope(scope).id;
      const value = current(); if (value) host.service.setQuote(value.id, quote);
      root.hidden = false; render(); draft.focus();
    },
    show() { root.hidden = false; render(); draft.focus(); },
    destroy() {
      destroyed = true; unsubscribe(); if (scheduled) clearTimeout(scheduled);
      for (const timer of copyTimers.values()) win.clearTimeout(timer);
      copyTimers.clear(); rendered.clear(); root.remove(); void host.service.flush().catch(() => {});
    },
  };
}
